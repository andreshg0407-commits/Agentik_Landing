/**
 * app/api/orgs/[orgSlug]/marketing-studio/shopify/connection/route.ts
 *
 * SHOPIFY-COPILOT-INTEGRATION-01 — Shopify connection management.
 *
 * GET  /api/orgs/:orgSlug/marketing-studio/shopify/connection
 *   Returns connection status. NEVER returns accessToken.
 *   Response: ShopifyConnectionStatus
 *
 * POST /api/orgs/:orgSlug/marketing-studio/shopify/connection
 *   Saves shopDomain + accessToken to Vault and marks connection as CONNECTED.
 *   Body: { shopDomain: string; accessToken: string }
 *   Response: { ok: true; connectionId: string } | { ok: false; error: string }
 */
import "server-only";

import { NextRequest, NextResponse }           from "next/server";
import { requireOrgAccess }                    from "@/lib/auth/org-access";
import { getIntegrationConnection,
         createIntegrationConnection,
         updateIntegrationConnectionStatus }   from "@/lib/integrations/integration-repository";
import { storeIntegrationSecret,
         getIntegrationSecret }                from "@/lib/integrations/vault/vault-service";
import { SECRET_TYPE }                         from "@/lib/integrations/vault/vault-types";
import { CONNECTION_STATUS, CONNECTION_HEALTH } from "@/lib/integrations/integration-types";

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
    const connection = await getIntegrationConnection(orgId, "shopify");
    const lastCheckedAt = new Date().toISOString();

    // No connection row at all
    if (!connection) {
      // Fall back to env vars in dev
      const envToken  = process.env.SHOPIFY_ACCESS_TOKEN;
      const envDomain = process.env.SHOPIFY_SHOP_DOMAIN;

      if (envToken && envDomain && process.env.NODE_ENV !== "production") {
        const status: ShopifyConnectionStatus = {
          connected:     true,
          shopDomain:    envDomain,
          missing:       [],
          canExecute:    true,
          lastCheckedAt,
          source:        "env_dev",
        };
        return NextResponse.json(status);
      }

      const status: ShopifyConnectionStatus = {
        connected:     false,
        shopDomain:    null,
        missing:       ["shopify_connection"],
        canExecute:    false,
        lastCheckedAt,
        source:        "none",
      };
      return NextResponse.json(status);
    }

    const missing: string[] = [];

    if (connection.status !== CONNECTION_STATUS.CONNECTED) {
      missing.push("connection_not_active");
    }
    if (!connection.shopDomain) {
      missing.push("shop_domain");
    }

    // Check vault secret
    let hasToken = false;
    if (connection.status === CONNECTION_STATUS.CONNECTED) {
      try {
        const secret = await getIntegrationSecret({
          organizationId: orgId,
          connectionId:   connection.id,
          secretType:     SECRET_TYPE.ACCESS_TOKEN,
        });
        hasToken = secret !== null;
      } catch {
        hasToken = false;
      }
    }
    if (!hasToken) {
      missing.push("access_token");
    }

    const connected  = missing.length === 0;
    const canExecute = connected;

    const status: ShopifyConnectionStatus = {
      connected,
      shopDomain:    connection.shopDomain ?? null,
      missing,
      canExecute,
      lastCheckedAt,
      source:        "vault",
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

  // Vault is required — refuse in environments without encryption key
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

  const { shopDomain, accessToken } = body;

  if (!shopDomain || typeof shopDomain !== "string" || shopDomain.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "shopDomain is required" }, { status: 400 });
  }
  if (!accessToken || typeof accessToken !== "string" || accessToken.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "accessToken is required" }, { status: 400 });
  }

  try {
    // Upsert connection row
    let connection = await getIntegrationConnection(orgId, "shopify");

    if (!connection) {
      connection = await createIntegrationConnection({
        organizationId: orgId,
        provider:       "shopify",
        shopDomain:     shopDomain.trim(),
      });
    } else {
      // Update shopDomain + mark connected
      await updateIntegrationConnectionStatus(connection.id, orgId, {
        status:    CONNECTION_STATUS.CONNECTED,
        health:    CONNECTION_HEALTH.HEALTHY,
        connectedAt: new Date(),
      });
    }

    // Store accessToken in vault
    await storeIntegrationSecret({
      organizationId: orgId,
      connectionId:   connection.id,
      secretType:     SECRET_TYPE.ACCESS_TOKEN,
      plainValue:     accessToken.trim(),
    });

    return NextResponse.json({ ok: true, connectionId: connection.id });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Error saving Shopify credentials";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
