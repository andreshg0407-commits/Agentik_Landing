/**
 * app/api/integrations/google-drive/callback/route.ts
 *
 * MARKETING-STUDIO-DRIVE-IMPORT-01 — Google Drive OAuth Callback
 *
 * GET ?code=...&state=...
 *   1. Verifies OAuthSession (CSRF + PKCE)
 *   2. Exchanges code for access_token + refresh_token
 *   3. Stores tokens encrypted in IntegrationSecret (AES-256-GCM via vault)
 *   4. Creates/updates IntegrationConnection (provider="google_drive")
 *   5. Redirects back to Biblioteca
 *
 * SECURITY:
 * - Tokens are NEVER logged.
 * - Session is consumed (one-time use, anti-replay).
 * - Tenant isolation: organizationId comes from OAuthSession, not query params.
 */

import { NextRequest, NextResponse }         from "next/server";
import {
  getOAuthSessionByState,
  consumeOAuthSessionByState,
  failOAuthSessionByState,
}                                            from "@/lib/integrations/oauth/oauth-session-service";
import {
  exchangeGoogleCode,
  getGoogleCredentials,
}                                            from "@/lib/integrations/oauth/providers/google-drive-oauth";
import {
  upsertConnectionByExternalId,
  updateIntegrationConnectionStatus,
}                                            from "@/lib/integrations/integration-repository";
import {
  storeIntegrationSecret,
}                                            from "@/lib/integrations/vault/vault-service";
import {
  CONNECTION_STATUS,
  CONNECTION_HEALTH,
}                                            from "@/lib/integrations/integration-types";

export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const fallbackAppUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const code   = req.nextUrl.searchParams.get("code");
  const state  = req.nextUrl.searchParams.get("state");
  const error  = req.nextUrl.searchParams.get("error");

  // User denied Google consent — try to redirect to initiating origin
  if (error) {
    let deniedUrl = fallbackAppUrl;
    if (state) {
      const errSession = await getOAuthSessionByState(state).catch(() => null);
      if (errSession) {
        const errMeta = errSession.metadata as Record<string, string> | null;
        const errOrigin = errMeta?.originUrl;
        if (isAllowedOrigin(errOrigin)) deniedUrl = errOrigin;
        await consumeOAuthSessionByState(state).catch(() => {});
      }
    }
    return NextResponse.redirect(`${deniedUrl}/agentik/marketing-studio/biblioteca?drive_error=denied`);
  }

  if (!code || !state) {
    return NextResponse.json({ error: "Missing code or state" }, { status: 400 });
  }

  // 1. Verify OAuthSession — CSRF protection
  const session = await getOAuthSessionByState(state);
  if (!session) {
    return NextResponse.json(
      { error: "Invalid or expired OAuth session. Please start again." },
      { status: 400 },
    );
  }

  const { organizationId, metadata } = session;
  const meta = metadata as Record<string, string> | null;
  const returnTo = meta?.returnTo ?? "/agentik/marketing-studio/biblioteca";

  // Use the origin that initiated the OAuth flow (stored by connect route).
  // This ensures Preview deployments redirect back to Preview, not production.
  // Validate: must be same domain (agentickers.com) or a Vercel preview URL.
  const storedOrigin = meta?.originUrl;
  const appUrl = isAllowedOrigin(storedOrigin) ? storedOrigin : fallbackAppUrl;

  try {
    const creds = getGoogleCredentials();

    // 2. Exchange code for tokens
    const tokens = await exchangeGoogleCode({
      code,
      codeVerifier:  session.codeVerifier ?? "",
      redirectUri:   creds.redirectUri,
      clientId:      creds.clientId,
      clientSecret:  creds.clientSecret,   // ⚠ server-only
    });

    // 3. Verify granted scopes include drive.readonly
    const grantedScopes = tokens.scope ? tokens.scope.split(" ").filter(Boolean) : [];
    const hasDriveReadonly = grantedScopes.some(
      (s: string) => s === "https://www.googleapis.com/auth/drive.readonly",
    );
    if (!hasDriveReadonly) {
      await consumeOAuthSessionByState(state);
      return NextResponse.redirect(
        `${appUrl}${returnTo}?drive_error=DRIVE_SCOPE_MISSING`,
      );
    }

    // 4. Consume session (prevent replay)
    await consumeOAuthSessionByState(state);

    // 5. Extract user email from id_token (optional — display only)
    let externalEmail: string | null = null;
    if (tokens.id_token) {
      try {
        const parts   = tokens.id_token.split(".");
        const payload = JSON.parse(
          Buffer.from(parts[1], "base64url").toString("utf8"),
        ) as { email?: string };
        externalEmail = payload.email ?? null;
      } catch { /* ignore JWT decode errors */ }
    }

    // 6. Upsert IntegrationConnection
    const connection = await upsertConnectionByExternalId({
      organizationId,
      provider:            "google_drive",
      externalAccountId:   externalEmail ?? "google_drive",
      externalAccountName: externalEmail,
      accountType:         "google_drive",
      providerGroup:       "google",
      scopes:              tokens.scope.split(" ").filter(Boolean),
      connectedAt:         new Date(),
    });

    // 7. Store access_token (encrypted at rest, expires in expires_in seconds)
    const accessExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    await storeIntegrationSecret({
      organizationId,
      connectionId: connection.id,
      secretType:   "access_token",
      plainValue:   tokens.access_token,   // ⚠ encrypted by vault
      expiresAt:    accessExpiresAt,
    });

    // 8. Store refresh_token (encrypted at rest, no expiry — long-lived)
    if (tokens.refresh_token) {
      await storeIntegrationSecret({
        organizationId,
        connectionId: connection.id,
        secretType:   "refresh_token",
        plainValue:   tokens.refresh_token,   // ⚠ encrypted by vault
      });
    }

    // 9. Mark connection as connected
    await updateIntegrationConnectionStatus(connection.id, organizationId, {
      status:      CONNECTION_STATUS.CONNECTED,
      health:      CONNECTION_HEALTH.HEALTHY,
      connectedAt: new Date(),
    });

    return NextResponse.redirect(`${appUrl}${returnTo}?drive_connected=1`);

  } catch (err) {
    await failOAuthSessionByState(state).catch(() => {});
    // Log error without exposing token values
    const safeMsg = err instanceof Error ? err.message : "unknown";
    console.error("[google-drive/callback] token exchange failed:", safeMsg);
    return NextResponse.redirect(`${appUrl}${returnTo}?drive_error=token_exchange_failed`);
  }
}

// ── Origin validation ───────────────────────────────────────────────────────

/**
 * Validates that a stored origin is safe for redirect.
 * Allowed: production domain, Vercel preview deployments for this project.
 * Prevents open-redirect attacks via crafted OAuthSession metadata.
 */
function isAllowedOrigin(origin: string | undefined): origin is string {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    // Production domain
    if (url.hostname === "agentickers.com") return true;
    if (url.hostname === "www.agentickers.com") return true;
    // Vercel Preview deployments (project-scoped)
    if (url.hostname.endsWith("-andreshg0407-commits-projects.vercel.app")) return true;
    // localhost for development
    if (url.hostname === "localhost") return true;
    return false;
  } catch {
    return false;
  }
}
