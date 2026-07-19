/**
 * GET /api/integrations/google/callback
 *
 * MARKETING-INTEGRATIONS-GOOGLE-01 — Google OAuth Callback
 *
 * Handles the redirect from Google after user authorization.
 * Supports both google_ads and youtube providers — differentiated by
 * the OAuthSession.provider field stored during session creation.
 *
 * Flow:
 *   1. Validate state → recover session + organizationId + provider
 *   2. Exchange code for access_token + refresh_token (PKCE)
 *   3. Fetch Google user info (sub, name, email)
 *   4. Upsert IntegrationConnection by externalAccountId (Google sub)
 *   5. Store access_token + refresh_token encrypted in vault
 *   6. Trigger resource discovery (non-blocking)
 *   7. Consume OAuthSession + audit
 *   8. Redirect to returnTo
 *
 * SECURITY:
 * - State validated server-side — organizationId never from client.
 * - Tokens stored encrypted immediately and never returned to browser.
 * - PKCE verifier lives only server-side.
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
import {
  exchangeGoogleCode,
  fetchGoogleUserInfo,
  fetchGoogleAdsCustomers,
  fetchYouTubeChannels,
}                                          from "@/lib/integrations/oauth/providers/google-oauth";
import { discoverGoogleResources }        from "@/lib/integrations/resource-discovery";

// ── Callback handler ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url      = new URL(req.url);
  const code     = url.searchParams.get("code");
  const state    = url.searchParams.get("state");
  const errParam = url.searchParams.get("error");
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? "";

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
  const { organizationId, provider, codeVerifier } = session;

  // provider is "google_ads" or "youtube"
  const providerKey = provider === "youtube" ? "youtube" : "google_ads";

  // ── 2. Handle user denial ─────────────────────────────────────────────────
  if (errParam || !code) {
    await failOAuthSessionByState(state);
    await recordIntegrationAuditEvent({
      organizationId,
      provider: providerKey,
      eventType: "INTEGRATION_DISCONNECTED",
      payload:  { reason: errParam ?? "no_code", step: "callback" },
    });
    return NextResponse.redirect(new URL(`${returnTo}?error=google_denied`, appUrl));
  }

  try {
    // ── 3. Exchange code ──────────────────────────────────────────────────
    const tokenRes = await exchangeGoogleCode(code, codeVerifier ?? "");
    if (!tokenRes.access_token) {
      throw new Error(`Google token exchange failed: ${tokenRes.error ?? "unknown"} — ${tokenRes.error_description ?? ""}`);
    }

    const {
      access_token,
      refresh_token,
      expires_in,
      scope,
    } = tokenRes;

    const scopes          = scope ? scope.split(" ").filter(Boolean) : [];
    const accessExpiresAt = expires_in ? new Date(Date.now() + expires_in * 1000) : null;

    // ── 4. Fetch user info ────────────────────────────────────────────────
    const userInfo = await fetchGoogleUserInfo(access_token);
    const sub      = userInfo?.sub ?? "unknown";
    const name     = userInfo?.name ?? userInfo?.email ?? null;

    // ── 5. Upsert connection ──────────────────────────────────────────────
    const connection = await upsertConnectionByExternalId({
      organizationId,
      provider:            providerKey,
      externalAccountId:   sub,
      externalAccountName: name,
      accountAvatarUrl:    userInfo?.picture ?? null,
      providerGroup:       providerKey === "youtube" ? "youtube" : "google",
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
        expiresAt:    null,  // refresh tokens don't expire (unless revoked)
      });
    }

    // ── 7. Trigger resource discovery (non-blocking) ──────────────────────
    discoverGoogleResources(organizationId, providerKey, access_token).catch(() => {});

    // ── 8. Consume session + audit ────────────────────────────────────────
    await consumeOAuthSessionByState(state);
    await recordIntegrationAuditEvent({
      organizationId,
      connectionId: connection.id,
      provider:     providerKey,
      eventType:    "INTEGRATION_CONNECTED",
      payload: {
        externalAccountId:   sub,
        externalAccountName: name,
        scopes,
        connectMode: meta.connectMode ?? "new_connection",
      },
    });

    return NextResponse.redirect(
      new URL(`${returnTo}?connected=${providerKey}`, appUrl),
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    await failOAuthSessionByState(state).catch(() => {});
    await recordIntegrationAuditEvent({
      organizationId,
      provider: providerKey,
      eventType: "API_REQUEST_FAILED",
      payload:   { reason: "callback_error", errorCode: message.slice(0, 80) },
    }).catch(() => {});
    return NextResponse.redirect(
      new URL(`${returnTo}?error=google_callback_failed`, appUrl),
    );
  }
}
