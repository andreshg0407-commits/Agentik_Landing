/**
 * lib/integrations/token-renewal.ts
 *
 * MARKETING-CONNECTIONS-HARDENING-01 — Phase 3: Token Renewal
 *
 * Ensures that a provider connection has a valid (non-expired) access token.
 * For providers with refresh tokens (TikTok): refreshes automatically.
 * For providers without refresh tokens (Meta page tokens): marks for reconnection.
 *
 * SERVER ONLY — never import in client components.
 *
 * SECURITY:
 * - Tokens are read from Vault and written back to Vault — never logged.
 * - organizationId always comes from server session.
 * - Fails closed: returns { valid: false } on any error, never throws to caller.
 */

import "server-only";

import { prisma }                  from "@/lib/prisma";
import {
  getIntegrationSecret,
  storeIntegrationSecret,
  rotateIntegrationSecret,
}                                  from "@/lib/integrations/vault/vault-service";
import { recordIntegrationAuditEvent } from "@/lib/integrations/integration-audit";

// ── Token status ───────────────────────────────────────────────────────────────

export type TokenRenewalStatus =
  | "valid"           // Token exists and is not near expiry
  | "refreshed"       // Token was refreshed successfully
  | "needs_reconnect" // No refresh token; user must reconnect
  | "no_connection"   // No connected IntegrationConnection found
  | "error";          // Unexpected error during renewal

export interface TokenRenewalResult {
  status:       TokenRenewalStatus;
  connectionId: string | null;
  provider:     string;
  expiresAt:    string | null;
  error?:       string;
}

// ── Expiry threshold ──────────────────────────────────────────────────────────

/** Renew if access token expires within this window */
const RENEWAL_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

function isNearExpiry(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() - Date.now() < RENEWAL_THRESHOLD_MS;
}

function isExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() < Date.now();
}

// ── TikTok refresh ─────────────────────────────────────────────────────────────

interface TikTokRefreshResponse {
  data?: {
    access_token?:          string;
    expires_in?:            number;
    refresh_token?:         string;
    refresh_expires_in?:    number;
  };
  code?:    number;
  message?: string;
}

async function refreshTikTokToken(
  organizationId: string,
  connectionId:   string,
  refreshToken:   string,
): Promise<{ accessToken: string; expiresAt: Date; refreshToken?: string; refreshExpiresAt?: Date } | null> {
  const clientKey    = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;

  if (!clientKey || !clientSecret) return null;

  try {
    const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams({
        client_key:    clientKey,
        client_secret: clientSecret,
        grant_type:    "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    const data = await res.json() as TikTokRefreshResponse;
    if (!data.data?.access_token) return null;

    const expiresIn        = data.data.expires_in ?? 7200;
    const refreshExpiresIn = data.data.refresh_expires_in;

    return {
      accessToken:      data.data.access_token,
      expiresAt:        new Date(Date.now() + expiresIn * 1000),
      refreshToken:     data.data.refresh_token,
      refreshExpiresAt: refreshExpiresIn
        ? new Date(Date.now() + refreshExpiresIn * 1000)
        : undefined,
    };
  } catch {
    return null;
  }
}

// ── Main renewal function ─────────────────────────────────────────────────────

/**
 * Ensures the primary connection for a provider has a valid access token.
 * If near expiry or expired, attempts to refresh (TikTok) or marks for reconnect (Meta).
 *
 * Returns a TokenRenewalResult — never throws.
 */
export async function ensureValidProviderSession(
  organizationId: string,
  provider:       string,
): Promise<TokenRenewalResult> {
  const base: Omit<TokenRenewalResult, "status"> = {
    connectionId: null,
    provider,
    expiresAt:    null,
  };

  try {
    // Find primary connection
    const connection = await prisma.integrationConnection.findFirst({
      where: {
        organizationId,
        provider: { in: [provider, ...relatedProviders(provider)] },
        status:   "connected",
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
    });

    if (!connection) {
      return { ...base, status: "no_connection" };
    }

    base.connectionId = connection.id;

    // Check access token expiry from IntegrationSecret
    const accessSecret = await prisma.integrationSecret.findFirst({
      where: {
        organizationId,
        connectionId: connection.id,
        secretType:   "access_token",
        revokedAt:    null,
      },
      orderBy: { createdAt: "desc" },
    });

    const tokenExpiry = accessSecret?.expiresAt ?? null;

    // If not expired / not near expiry — token is valid
    if (!isExpired(tokenExpiry) && !isNearExpiry(tokenExpiry)) {
      return {
        ...base,
        status:    "valid",
        expiresAt: tokenExpiry?.toISOString() ?? null,
      };
    }

    // Try to refresh via refresh_token
    const refreshSecret = await getIntegrationSecret({
      organizationId,
      connectionId: connection.id,
      secretType:   "refresh_token",
    }).catch(() => null);

    if (!refreshSecret?.plainValue) {
      // No refresh token — mark for reconnect
      await prisma.integrationConnection.update({
        where: { id: connection.id },
        data:  {
          health:           "warning",
          errorMessage:     "Token expirado — se requiere reconexión",
          lastHealthCheckAt: new Date(),
        },
      });

      await recordIntegrationAuditEvent({
        organizationId,
        connectionId: connection.id,
        provider,
        eventType:    "TOKEN_EXPIRED",
        payload:      { reason: "no_refresh_token", requiresReconnect: true },
      }).catch(() => {});

      return { ...base, status: "needs_reconnect" };
    }

    // Attempt TikTok refresh
    if (provider === "tiktok") {
      const refreshed = await refreshTikTokToken(
        organizationId,
        connection.id,
        refreshSecret.plainValue,
      );

      if (!refreshed) {
        await prisma.integrationConnection.update({
          where: { id: connection.id },
          data:  { health: "critical", errorMessage: "Fallo al renovar token de TikTok", lastHealthCheckAt: new Date() },
        });
        return { ...base, status: "needs_reconnect", error: "tiktok_refresh_failed" };
      }

      // Rotate access token in vault
      await rotateIntegrationSecret({
        organizationId,
        connectionId:   connection.id,
        secretType:     "access_token",
        newPlainValue:  refreshed.accessToken,
        expiresAt:      refreshed.expiresAt,
      });

      // Rotate refresh token if a new one was returned
      if (refreshed.refreshToken) {
        await rotateIntegrationSecret({
          organizationId,
          connectionId:   connection.id,
          secretType:     "refresh_token",
          newPlainValue:  refreshed.refreshToken,
          expiresAt:      refreshed.refreshExpiresAt ?? null,
        });
      }

      // Update connection health
      await prisma.integrationConnection.update({
        where: { id: connection.id },
        data:  {
          health:           "healthy",
          status:           "connected",
          errorMessage:     null,
          lastHealthCheckAt: new Date(),
        },
      });

      await recordIntegrationAuditEvent({
        organizationId,
        connectionId: connection.id,
        provider,
        eventType:    "TOKEN_REFRESHED",
        payload:      { action: "token_refreshed" },
      }).catch(() => {});

      return {
        ...base,
        status:    "refreshed",
        expiresAt: refreshed.expiresAt.toISOString(),
      };
    }

    // Other providers with refresh tokens would be handled here in future
    return { ...base, status: "needs_reconnect" };

  } catch (err) {
    return {
      ...base,
      status: "error",
      error:  err instanceof Error ? err.message : "unknown_error",
    };
  }
}

/** Returns related provider keys for multi-provider platforms */
function relatedProviders(provider: string): string[] {
  switch (provider) {
    case "meta":
      return ["meta_facebook", "meta_instagram", "meta_ads"];
    case "tiktok":
      return [];
    default:
      return [];
  }
}

// ── Batch renewal ─────────────────────────────────────────────────────────────

/**
 * Checks and renews tokens for all connected providers for an org.
 * Used by cron jobs or health-check routes.
 */
export async function renewAllProviderSessions(
  organizationId: string,
): Promise<TokenRenewalResult[]> {
  const connections = await prisma.integrationConnection.findMany({
    where:   { organizationId, status: "connected" },
    orderBy: { createdAt: "desc" },
    select:  { provider: true, id: true },
  });

  // Deduplicate by provider group
  const seenProviders = new Set<string>();
  const providers: string[] = [];
  for (const conn of connections) {
    const group = providerGroup(conn.provider);
    if (!seenProviders.has(group)) {
      seenProviders.add(group);
      providers.push(group);
    }
  }

  const results = await Promise.all(
    providers.map(p => ensureValidProviderSession(organizationId, p)),
  );

  return results;
}

function providerGroup(provider: string): string {
  if (provider.startsWith("meta_")) return "meta";
  return provider;
}
