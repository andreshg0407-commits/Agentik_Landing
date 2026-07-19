/**
 * GET /api/integrations/meta/callback
 *
 * AGENTIK-OAUTH-CONNECTIONS-01 — Meta OAuth Callback
 *
 * Handles the redirect from Meta after user authorization.
 * organizationId is recovered from the OAuthSession (state param).
 *
 * Flow:
 *   1. Validate state → recover session + organizationId
 *   2. Exchange code for user access token
 *   3. Get user's Facebook Pages (with page access tokens)
 *   4. For each page: get associated Instagram Business Account
 *   5. Upsert meta_facebook connection per page
 *   6. Upsert meta_instagram connection per IG account
 *   7. Store tokens in vault per connection
 *   8. Consume OAuthSession + audit
 *   9. Redirect to returnTo (or account picker if multiple accounts)
 *
 * MULTI-ACCOUNT:
 * - Creates a separate IntegrationConnection per Facebook page and IG account.
 * - First of each provider is marked isPrimary=true.
 * - Reconnecting same externalAccountId updates the existing connection.
 *
 * SECURITY:
 * - State validated server-side — organizationId never from client.
 * - Page tokens stored encrypted in vault per connectionId.
 * - No tokens returned to browser.
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
import { getMetaCredentials, META_OAUTH_CONFIG } from "@/lib/integrations/oauth/providers/meta-oauth";
import { discoverMetaResources }          from "@/lib/integrations/resource-discovery";

// ── Meta Graph API helpers ────────────────────────────────────────────────────

interface MetaTokenResponse {
  access_token?: string;
  token_type?:   string;
  expires_in?:   number;
  error?:        { message: string; type: string; code: number };
}

interface MetaPage {
  id:           string;
  name:         string;
  access_token: string;
  category?:    string;
}

interface MetaIgAccount {
  id:       string;
  username: string;
  name?:    string;
  profile_picture_url?: string;
}

async function exchangeMetaCode(code: string, redirectUri: string): Promise<MetaTokenResponse> {
  const { appId, appSecret } = getMetaCredentials();
  const url = new URL(META_OAUTH_CONFIG.tokenUrl);
  url.searchParams.set("client_id",     appId);
  url.searchParams.set("redirect_uri",  redirectUri);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("code",          code);
  const res = await fetch(url.toString());
  return res.json() as Promise<MetaTokenResponse>;
}

async function getMetaPages(userAccessToken: string): Promise<MetaPage[]> {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/me/accounts?access_token=${userAccessToken}&fields=id,name,access_token,category`,
  );
  const data = await res.json() as { data?: MetaPage[]; error?: unknown };
  return data.data ?? [];
}

async function getIgAccountForPage(
  pageId: string,
  pageToken: string,
): Promise<MetaIgAccount | null> {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${pageId}?fields=instagram_business_account{id,username,name,profile_picture_url}&access_token=${pageToken}`,
  );
  const data = await res.json() as {
    instagram_business_account?: { id: string; username: string; name?: string; profile_picture_url?: string };
  };
  if (!data.instagram_business_account) return null;
  return data.instagram_business_account;
}

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

  const meta            = session.metadata as Record<string, string>;
  const orgSlug         = meta.orgSlug  ?? "";
  const returnTo        = meta.returnTo ?? `/${orgSlug}/agentik/marketing-studio/connections`;
  const { organizationId } = session;

  // ── 2. Handle user denial ─────────────────────────────────────────────────
  if (errParam || !code) {
    await failOAuthSessionByState(state);
    await recordIntegrationAuditEvent({
      organizationId,
      provider:  "meta_facebook",
      eventType: "INTEGRATION_DISCONNECTED",
      payload:   { reason: errParam ?? "no_code", step: "callback" },
    });
    return NextResponse.redirect(new URL(`${returnTo}?error=meta_denied`, appUrl));
  }

  try {
    const { redirectUri } = getMetaCredentials();

    // ── 3. Exchange code for user access token ────────────────────────────
    const tokenRes = await exchangeMetaCode(code, redirectUri);
    if (!tokenRes.access_token) {
      throw new Error(`Meta token exchange failed: ${JSON.stringify(tokenRes.error)}`);
    }
    const userToken     = tokenRes.access_token;
    const userExpiresAt = tokenRes.expires_in
      ? new Date(Date.now() + tokenRes.expires_in * 1000)
      : null;

    // ── 4. Get Facebook Pages ─────────────────────────────────────────────
    const pages = await getMetaPages(userToken);
    let connectedCount = 0;

    for (const page of pages) {
      // ── 5. Upsert meta_facebook connection ──────────────────────────
      const fbConn = await upsertConnectionByExternalId({
        organizationId,
        provider:            "meta_facebook",
        externalAccountId:   page.id,
        externalAccountName: page.name,
        accountType:         page.category ?? "page",
        providerGroup:       "meta",
        externalPageId:      page.id,
        scopes:              Array.isArray(session.requestedScopes) ? session.requestedScopes as string[] : [],
        connectedAt:         new Date(),
      });

      await storeIntegrationSecret({
        organizationId,
        connectionId: fbConn.id,
        secretType:   "access_token",
        plainValue:   page.access_token,
        expiresAt:    null,  // Page tokens are long-lived
      });

      await recordIntegrationAuditEvent({
        organizationId,
        connectionId: fbConn.id,
        provider:     "meta_facebook",
        eventType:    "INTEGRATION_CONNECTED",
        payload: { externalAccountId: page.id, externalAccountName: page.name },
      });

      connectedCount++;

      // ── 6. Get Instagram Business Account for this page ──────────────
      const igAccount = await getIgAccountForPage(page.id, page.access_token);
      if (igAccount) {
        const igConn = await upsertConnectionByExternalId({
          organizationId,
          provider:            "meta_instagram",
          externalAccountId:   igAccount.id,
          externalAccountName: igAccount.name ?? igAccount.username,
          accountHandle:       `@${igAccount.username}`,
          accountAvatarUrl:    igAccount.profile_picture_url ?? null,
          accountType:         "instagram_business",
          providerGroup:       "meta",
          externalPageId:      page.id,  // link to parent FB page
          scopes:              Array.isArray(session.requestedScopes) ? session.requestedScopes as string[] : [],
          connectedAt:         new Date(),
        });

        // Instagram uses the same page token for Graph API calls
        await storeIntegrationSecret({
          organizationId,
          connectionId: igConn.id,
          secretType:   "access_token",
          plainValue:   page.access_token,
          expiresAt:    null,
        });

        await recordIntegrationAuditEvent({
          organizationId,
          connectionId: igConn.id,
          provider:     "meta_instagram",
          eventType:    "INTEGRATION_CONNECTED",
          payload: { externalAccountId: igAccount.id, accountHandle: `@${igAccount.username}` },
        });

        connectedCount++;
      }
    }

    // ── 7. Trigger resource discovery (non-blocking) ──────────────────────
    discoverMetaResources(organizationId).catch(() => {});

    // ── 8. Consume session + final audit ──────────────────────────────────
    await consumeOAuthSessionByState(state);
    await recordIntegrationAuditEvent({
      organizationId,
      provider:  "meta_facebook",
      eventType: "INTEGRATION_CONNECTED",
      payload: {
        pagesConnected:     pages.length,
        connectionsCreated: connectedCount,
        connectMode:        meta.connectMode ?? "new_connection",
      },
    });

    const redirect = connectedCount === 0
      ? `${returnTo}?error=meta_no_pages`
      : `${returnTo}?connected=meta&accounts=${connectedCount}`;

    return NextResponse.redirect(new URL(redirect, appUrl));

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    await failOAuthSessionByState(state).catch(() => {});
    await recordIntegrationAuditEvent({
      organizationId,
      provider:  "meta_facebook",
      eventType: "API_REQUEST_FAILED",
      payload:   { reason: "callback_error", errorCode: message.slice(0, 80) },
    }).catch(() => {});
    return NextResponse.redirect(new URL(`${returnTo}?error=meta_callback_failed`, appUrl));
  }
}
