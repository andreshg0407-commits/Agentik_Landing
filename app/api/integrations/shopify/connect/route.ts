/**
 * app/api/integrations/shopify/connect/route.ts
 *
 * MS-10 — Shopify OAuth Connect Endpoint
 *
 * Initiates the Shopify OAuth authorization flow for an organization.
 *
 * GET /api/integrations/shopify/connect?orgSlug=<slug>&shop=<shop-domain>
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   - Authenticated: requires valid org session
 *   - Shop domain validated before any redirect
 *   - State token is HMAC-signed (anti-CSRF)
 *   - State stored in HTTP-only, Secure, SameSite=Lax cookie (10 min TTL)
 *   - No tokens in this handler — only the auth URL is constructed
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { canAccessMarketingStudio }  from "@/lib/auth/module-access";
import { buildShopifyAuthUrl, validateShopDomain } from "@/lib/integrations/shopify/shopify-auth";
import { createIntegrationConnection }             from "@/lib/integrations/integration-repository";
import { recordIntegrationAuditEvent }             from "@/lib/integrations/integration-audit";
import { INTEGRATION_EVENT_TYPE }                  from "@/lib/integrations/integration-events";
import { ShopifyConfigError, ShopifyInvalidShopDomainError } from "@/lib/integrations/shopify/shopify-errors";
import { isIntegrationError } from "@/lib/integrations/integration-errors";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const orgSlug  = searchParams.get("orgSlug");
  const shopInput = searchParams.get("shop");

  // ── Auth ──
  if (!orgSlug) {
    return NextResponse.json({ error: "orgSlug is required" }, { status: 400 });
  }

  let membership: Awaited<ReturnType<typeof requireOrgAccess>>["membership"];
  let organization: Awaited<ReturnType<typeof requireOrgAccess>>["organization"];
  try {
    const result = await requireOrgAccess(orgSlug);
    membership   = result.membership;
    organization = result.organization;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessMarketingStudio(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Shop domain ──
  if (!shopInput) {
    return NextResponse.json({ error: "shop parameter is required (e.g. my-store.myshopify.com)" }, { status: 400 });
  }

  const shopDomain = validateShopDomain(shopInput);
  if (!shopDomain) {
    return NextResponse.json({ error: "Invalid shop domain format" }, { status: 400 });
  }

  // ── Build auth URL ──
  let authUrl: string;
  let state:   string;
  try {
    const result = buildShopifyAuthUrl(organization.id, shopDomain);
    authUrl = result.url;
    state   = result.state;
  } catch (err) {
    if (err instanceof ShopifyConfigError) {
      return NextResponse.json({ error: "Shopify integration not configured" }, { status: 503 });
    }
    if (err instanceof ShopifyInvalidShopDomainError) {
      return NextResponse.json({ error: "Invalid shop domain" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to initiate Shopify connection" }, { status: 500 });
  }

  // ── Create pending connection record ──
  try {
    const connection = await createIntegrationConnection({
      organizationId: organization.id,
      provider:       "shopify",
      shopDomain,
    });

    // Store connectionId in the state cookie alongside state for callback lookup
    // Audit: connection initiated
    await recordIntegrationAuditEvent({
      organizationId: organization.id,
      connectionId:   connection.id,
      provider:       "shopify",
      eventType:      INTEGRATION_EVENT_TYPE.INTEGRATION_CONNECTED,
      payload: {
        phase:      "initiated",
        shopDomain,
      },
      actorId: null,
    });

    // Store state in HTTP-only cookie for CSRF validation on callback
    const response = NextResponse.redirect(authUrl);
    response.cookies.set("shopify_oauth_state", state, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge:   600,  // 10 minutes
      path:     "/api/integrations/shopify/callback",
    });
    // Also store org + connection context for callback lookup
    response.cookies.set("shopify_oauth_org", `${organization.id}:${connection.id}`, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge:   600,
      path:     "/api/integrations/shopify/callback",
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Failed to initiate connection" }, { status: 500 });
  }
}
