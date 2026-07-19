/**
 * GET /api/integrations/tiktok/callback
 *
 * AGENTIK-OAUTH-CONNECTIONS-01 — TikTok OAuth Callback
 *
 * Handles the redirect from TikTok after user authorization.
 * This is a global callback (no orgSlug in URL) — the organizationId
 * is recovered from the OAuthSession using the state parameter.
 *
 * Flow:
 *   1. Validate state → recover session + organizationId
 *   2. Exchange code for access_token + refresh_token
 *   3. Fetch user info (open_id, display_name, avatar_url)
 *   4. Upsert IntegrationConnection (create or reconnect by externalAccountId)
 *   5. Store tokens encrypted in vault
 *   6. Consume OAuthSession
 *   7. Redirect to returnTo URL
 *
 * SECURITY:
 * - State is validated server-side — no client-supplied organizationId trusted.
 * - Tokens are encrypted immediately and never returned to browser.
 * - Audit events recorded for all outcomes.
 */

import { type NextRequest, NextResponse } from "next/server";
import {
  getOAuthSessionByState,
  consumeOAuthSessionByState,
  failOAuthSessionByState,
}                                          from "@/lib/integrations/oauth/oauth-session-service";
import { upsertConnectionByExternalId }   from "@/lib/integrations/integration-repository";
import { storeIntegrationSecret }         from "@/lib/integrations/vault/vault-service";
import { recordIntegrationAuditEvent }    from "@/lib/integrations/integration-audit";
import { getTikTokCredentials, TIKTOK_OAUTH_CONFIG } from "@/lib/integrations/oauth/providers/tiktok-oauth";

// ── TikTok API helpers ────────────────────────────────────────────────────────

interface TikTokTokenResponse {
  data?: {
    access_token:       string;
    refresh_token:      string;
    expires_in:         number;
    refresh_expires_in: number;
    open_id:            string;
    scope:              string;
  };
  error?: { code: string; message: string };
}

interface TikTokUserResponse {
  data?: {
    user: {
      open_id:      string;
      union_id:     string;
      display_name: string;
      avatar_url:   string;
    };
  };
  error?: { code: string; message: string };
}

async function exchangeTikTokCode(code: string, codeVerifier: string): Promise<TikTokTokenResponse> {
  const { clientKey, clientSecret, redirectUri } = getTikTokCredentials();
  const body = new URLSearchParams({
    client_key:    clientKey,
    client_secret: clientSecret,
    code,
    grant_type:    "authorization_code",
    redirect_uri:  redirectUri,
    code_verifier: codeVerifier,
  });
  const res = await fetch(TIKTOK_OAUTH_CONFIG.tokenUrl, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
  });
  return res.json() as Promise<TikTokTokenResponse>;
}

async function fetchTikTokUser(accessToken: string): Promise<TikTokUserResponse> {
  const res = await fetch(
    "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,display_name,avatar_url",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  return res.json() as Promise<TikTokUserResponse>;
}

// ── Callback handler ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url    = new URL(req.url);
  const code   = url.searchParams.get("code");
  const state  = url.searchParams.get("state");
  const errParam = url.searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  // ── 1. Validate state ─────────────────────────────────────────────────────
  if (!state) {
    return NextResponse.redirect(new URL("/agentik?error=oauth_invalid_state", appUrl));
  }

  const session = await getOAuthSessionByState(state);
  if (!session) {
    return NextResponse.redirect(new URL("/agentik?error=oauth_session_expired", appUrl));
  }

  const meta     = session.metadata as Record<string, string>;
  const orgSlug  = meta.orgSlug  ?? "";
  const returnTo = meta.returnTo ?? `/${orgSlug}/agentik/marketing-studio/connections`;
  const { organizationId } = session;

  // ── 2. Handle user denial ─────────────────────────────────────────────────
  if (errParam || !code) {
    await failOAuthSessionByState(state);
    await recordIntegrationAuditEvent({
      organizationId,
      provider:  "tiktok",
      eventType: "INTEGRATION_DISCONNECTED",
      payload:   { reason: errParam ?? "no_code", step: "callback" },
    });
    return NextResponse.redirect(new URL(`${returnTo}?error=tiktok_denied`, appUrl));
  }

  try {
    // ── 3. Exchange code ──────────────────────────────────────────────────
    const tokenRes = await exchangeTikTokCode(code, session.codeVerifier ?? "");
    if (!tokenRes.data?.access_token) {
      throw new Error(`TikTok token exchange failed: ${JSON.stringify(tokenRes.error)}`);
    }

    const { access_token, refresh_token, expires_in, open_id, scope } = tokenRes.data;
    const scopes      = scope ? scope.split(",").map(s => s.trim()) : [];
    const accessExpiresAt  = new Date(Date.now() + expires_in * 1000);
    const refreshExpiresAt = new Date(Date.now() + (tokenRes.data.refresh_expires_in ?? 31536000) * 1000);

    // ── 4. Fetch user info ────────────────────────────────────────────────
    const userRes = await fetchTikTokUser(access_token);
    const user    = userRes.data?.user;
    const displayName = user?.display_name ?? null;
    const avatarUrl   = user?.avatar_url   ?? null;

    // ── 5. Upsert connection ──────────────────────────────────────────────
    const connection = await upsertConnectionByExternalId({
      organizationId,
      provider:            "tiktok",
      externalAccountId:   open_id,
      externalAccountName: displayName,
      accountAvatarUrl:    avatarUrl,
      providerGroup:       "tiktok",
      scopes,
      connectedAt:         new Date(),
    });

    // ── 6. Store tokens in vault ──────────────────────────────────────────
    await storeIntegrationSecret({
      organizationId,
      connectionId: connection.id,
      secretType:   "access_token",
      plainValue:   access_token,
      expiresAt:    accessExpiresAt,
    });

    if (refresh_token) {
      await storeIntegrationSecret({
        organizationId,
        connectionId: connection.id,
        secretType:   "refresh_token",
        plainValue:   refresh_token,
        expiresAt:    refreshExpiresAt,
      });
    }

    // ── 7. Consume session + audit ────────────────────────────────────────
    await consumeOAuthSessionByState(state);
    await recordIntegrationAuditEvent({
      organizationId,
      connectionId: connection.id,
      provider:     "tiktok",
      eventType:    "INTEGRATION_CONNECTED",
      payload: {
        externalAccountId:   open_id,
        externalAccountName: displayName,
        scopes,
        connectMode: meta.connectMode ?? "new_connection",
      },
    });

    return NextResponse.redirect(new URL(`${returnTo}?connected=tiktok`, appUrl));

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    await failOAuthSessionByState(state).catch(() => {});
    await recordIntegrationAuditEvent({
      organizationId,
      provider:  "tiktok",
      eventType: "API_REQUEST_FAILED",
      payload:   { reason: "callback_error", errorCode: message.slice(0, 80) },
    }).catch(() => {});
    return NextResponse.redirect(new URL(`${returnTo}?error=tiktok_callback_failed`, appUrl));
  }
}
