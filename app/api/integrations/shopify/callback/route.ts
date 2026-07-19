/**
 * app/api/integrations/shopify/callback/route.ts
 *
 * MS-10 — Shopify OAuth Callback
 *
 * Receives the authorization code from Shopify, validates state,
 * exchanges the code for an access token, and persists the connection.
 *
 * GET /api/integrations/shopify/callback?code=...&shop=...&state=...&hmac=...
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   1. Shopify HMAC validated FIRST — before any state is read
 *   2. State validated against cookie (anti-CSRF)
 *   3. Access token stored in vault only — never logged, never in response
 *   4. All error responses are generic to prevent information disclosure
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyShopifyCallbackHmac, exchangeShopifyCode, validateOAuthState, validateShopDomain }
  from "@/lib/integrations/shopify/shopify-auth";
import { storeIntegrationSecret }        from "@/lib/integrations/vault/vault-service";
import { SECRET_TYPE }                   from "@/lib/integrations/vault/vault-types";
import { activateIntegrationConnection } from "@/lib/integrations/integration-runtime";
import { recordIntegrationAuditEvent }   from "@/lib/integrations/integration-audit";
import { INTEGRATION_EVENT_TYPE }        from "@/lib/integrations/integration-events";
import { createShopifyClient }           from "@/lib/integrations/shopify/shopify-client";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  // Extract all query params for HMAC verification
  const params: Record<string, string> = {};
  searchParams.forEach((value, key) => { params[key] = value; });

  const code      = searchParams.get("code");
  const shop      = searchParams.get("shop");
  const state     = searchParams.get("state");
  const hmac      = searchParams.get("hmac");

  // ── 1. Validate Shopify HMAC (FIRST — before any other processing) ──
  if (!hmac || !verifyShopifyCallbackHmac(params)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 401 });
  }

  // ── 2. Validate required params ──
  if (!code || !shop || !state) {
    return NextResponse.json({ error: "Invalid callback parameters" }, { status: 400 });
  }

  const shopDomain = validateShopDomain(shop);
  if (!shopDomain) {
    return NextResponse.json({ error: "Invalid shop domain" }, { status: 400 });
  }

  // ── 3. Validate state (anti-CSRF) ──
  const cookieState   = req.cookies.get("shopify_oauth_state")?.value;
  const cookieOrgData = req.cookies.get("shopify_oauth_org")?.value;

  if (!cookieState || cookieState !== state) {
    return NextResponse.json({ error: "Invalid state" }, { status: 401 });
  }

  if (!cookieOrgData) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  const [organizationId, connectionId] = cookieOrgData.split(":");
  if (!organizationId || !connectionId) {
    return NextResponse.json({ error: "Invalid session data" }, { status: 401 });
  }

  try {
    validateOAuthState(state, organizationId);
  } catch {
    return NextResponse.json({ error: "State validation failed" }, { status: 401 });
  }

  // ── 4. Exchange code for access token ──
  const clientId     = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Integration not configured" }, { status: 503 });
  }

  let accessToken: string;
  let grantedScopes: string[];
  try {
    const tokenResult = await exchangeShopifyCode({
      shopDomain,
      code,
      clientId,
      clientSecret,  // ⚠ server-only — never log
    });
    accessToken   = tokenResult.accessToken;   // ⚠ server-only — never log or return
    grantedScopes = tokenResult.scope.split(",").map(s => s.trim()).filter(Boolean);
  } catch {
    await recordIntegrationAuditEvent({
      organizationId,
      connectionId,
      provider:  "shopify",
      eventType: INTEGRATION_EVENT_TYPE.API_REQUEST_FAILED,
      payload:   { phase: "token_exchange", shopDomain },
    });
    return NextResponse.json({ error: "Token exchange failed" }, { status: 500 });
  }

  // ── 5. Fetch shop info (safe — no token in response) ──
  let externalAccountId:   string | null = null;
  let externalAccountName: string | null = null;
  try {
    const client   = createShopifyClient(shopDomain);
    const shopInfo = await client.getShop(accessToken);  // accessToken used here, not stored in client
    externalAccountId   = String(shopInfo.id);
    externalAccountName = shopInfo.name;
  } catch {
    // Non-fatal — connection still succeeds without shop info
  }

  // ── 6. Store access token in vault (never in DB plaintext) ──
  try {
    await storeIntegrationSecret({
      organizationId,
      connectionId,
      secretType: SECRET_TYPE.ACCESS_TOKEN,
      plainValue: accessToken,  // ⚠ vault encrypts this — never stored plain
      expiresAt:  null,         // Shopify offline tokens don't expire
    });
  } catch {
    await recordIntegrationAuditEvent({
      organizationId,
      connectionId,
      provider:  "shopify",
      eventType: INTEGRATION_EVENT_TYPE.API_REQUEST_FAILED,
      payload:   { phase: "vault_store" },
    });
    return NextResponse.json({ error: "Failed to secure connection" }, { status: 500 });
  }

  // ── 7. Activate connection ──
  await activateIntegrationConnection({
    connectionId,
    organizationId,
    provider:            "shopify",
    externalAccountId,
    externalAccountName,
    scopes:              grantedScopes,
  });

  // ── 8. Clear state cookies and redirect to Commerce OS ──
  const appUrl  = process.env.SHOPIFY_APP_URL ?? "";
  const orgSlug = req.cookies.get("shopify_oauth_org_slug")?.value;
  const redirect = orgSlug
    ? `${appUrl}/${orgSlug}/agentik/marketing-studio/shopify?connected=1`
    : `${appUrl}/`;

  const response = NextResponse.redirect(redirect);
  response.cookies.delete("shopify_oauth_state");
  response.cookies.delete("shopify_oauth_org");
  response.cookies.delete("shopify_oauth_org_slug");
  return response;
}
