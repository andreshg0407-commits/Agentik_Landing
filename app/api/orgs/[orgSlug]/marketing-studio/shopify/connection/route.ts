/**
 * app/api/orgs/[orgSlug]/marketing-studio/shopify/connection/route.ts
 *
 * SHOPIFY-COPILOT-INTEGRATION-01 + SHOPIFY-COPILOT-INTEGRATION-POLISH-01
 * Shopify connection management.
 *
 * GET  /api/orgs/:orgSlug/marketing-studio/shopify/connection
 *   Returns connection status via resolveShopifyContextStatus().
 *   NEVER returns accessToken.
 *   Response: ShopifyConnectionStatus
 *
 * POST /api/orgs/:orgSlug/marketing-studio/shopify/connection
 *   Saves shopDomain + accessToken to Vault and marks connection as CONNECTED.
 *   Body: { shopDomain: string; accessToken: string }
 *   Response: { ok: true; connectionId: string } | { ok: false; error: string }
 *
 * POLISH-01 changes:
 *   - GET delegates to resolveShopifyContextStatus() instead of inline logic
 *   - POST marks new connections as CONNECTED after creating them (bug fix)
 *   - POST validates shopDomain format before persisting
 */
import "server-only";

import { NextRequest, NextResponse }             from "next/server";
import { requireOrgAccess }                      from "@/lib/auth/org-access";
import {
  getIntegrationConnection,
  createIntegrationConnection,
  updateIntegrationConnectionStatus,
}                                                from "@/lib/integrations/integration-repository";
import { storeIntegrationSecret }                from "@/lib/integrations/vault/vault-service";
import { SECRET_TYPE }                           from "@/lib/integrations/vault/vault-types";
import { CONNECTION_STATUS, CONNECTION_HEALTH }  from "@/lib/integrations/integration-types";
import { resolveShopifyContextStatus }           from "@/lib/marketing-studio/commerce/shopify-runtime/shopify-context-resolver";

type RouteContext = { params: Promise<{ orgSlug: string }> };

// ── Shared response type ───────────────────────────────────────────────────────

export interface ShopifyConnectionStatus {
  connected:     boolean;
  shopDomain:    string | null;
  missing:       string[];
  canExecute:    boolean;
  lastCheckedAt: string;
  source:        "vault" | "env_dev" | "none";
}

// Minimal shopDomain format check: must look like a hostname with at least one dot
const SHOP_DOMAIN_RE = /^[a-zA-Z0-9][a-zA-Z0-9\-\.]*\.[a-zA-Z]{2,}$/;

// ── GET — connection status ────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  let orgId: string;
  try {
    const access = await requireOrgAccess(orgSlug);
    orgId = access.organization.id;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const resolution = await resolveShopifyContextStatus({ tenantId: orgId });

    const status: ShopifyConnectionStatus = {
      connected:     resolution.connected,
      shopDomain:    resolution.shopDomain,
      missing:       resolution.missing,
      canExecute:    resolution.ok,
      lastCheckedAt: new Date().toISOString(),
      source:        resolution.source,
    };
    return NextResponse.json(status);

  } catch (err) {
    const message = err instanceof Error ? err.message : "Error checking Shopify connection";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// ── POST — save credentials ────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  let orgId: string;
  try {
    const access = await requireOrgAccess(orgSlug);
    orgId = access.organization.id;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Vault is required — refuse when encryption key is missing
  if (!process.env.VAULT_ENCRYPTION_KEY) {
    return NextResponse.json({
      ok:    false,
      error: "not_implemented_secure_vault_required",
      hint:  "Set VAULT_ENCRYPTION_KEY to enable secure credential storage.",
    }, { status: 503 });
  }

  let body: { shopDomain?: string; accessToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawDomain = body.shopDomain?.trim() ?? "";
  const rawToken  = body.accessToken?.trim() ?? "";

  if (!rawDomain) {
    return NextResponse.json({ ok: false, error: "shopDomain is required" }, { status: 400 });
  }
  if (!SHOP_DOMAIN_RE.test(rawDomain)) {
    return NextResponse.json(
      { ok: false, error: "shopDomain must be a valid hostname (e.g. my-store.myshopify.com)" },
      { status: 400 },
    );
  }
  if (!rawToken) {
    return NextResponse.json({ ok: false, error: "accessToken is required" }, { status: 400 });
  }

  try {
    let connection = await getIntegrationConnection(orgId, "shopify");

    if (!connection) {
      // Create and immediately mark CONNECTED
      connection = await createIntegrationConnection({
        organizationId: orgId,
        provider:       "shopify",
        shopDomain:     rawDomain,
      });
      await updateIntegrationConnectionStatus(connection.id, orgId, {
        status:      CONNECTION_STATUS.CONNECTED,
        health:      CONNECTION_HEALTH.HEALTHY,
        connectedAt: new Date(),
      });
    } else {
      // Update shopDomain + re-mark connected
      await updateIntegrationConnectionStatus(connection.id, orgId, {
        status:      CONNECTION_STATUS.CONNECTED,
        health:      CONNECTION_HEALTH.HEALTHY,
        connectedAt: new Date(),
      });
    }

    // Store accessToken in vault — never returned to caller
    await storeIntegrationSecret({
      organizationId: orgId,
      connectionId:   connection.id,
      secretType:     SECRET_TYPE.ACCESS_TOKEN,
      plainValue:     rawToken,
    });

    return NextResponse.json({ ok: true, connectionId: connection.id });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Error saving Shopify credentials";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
