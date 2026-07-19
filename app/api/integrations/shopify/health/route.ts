/**
 * app/api/integrations/shopify/health/route.ts
 *
 * MS-10 — Shopify Connection Health Check
 *
 * Returns the connection health for an org's Shopify integration.
 * Optionally performs a live API check if ?live=true.
 *
 * GET /api/integrations/shopify/health?orgSlug=<slug>
 * GET /api/integrations/shopify/health?orgSlug=<slug>&live=true
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   - Authenticated: requires valid org session
 *   - Response NEVER contains token values, encrypted secrets, or key material
 *   - Only safe metadata returned: status, health, scopes, shop name, error
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { canAccessMarketingStudio }  from "@/lib/auth/module-access";
import { getIntegrationConnection }  from "@/lib/integrations/integration-repository";
import { getIntegrationSecret }      from "@/lib/integrations/vault/vault-service";
import { SECRET_TYPE }               from "@/lib/integrations/vault/vault-types";
import { createShopifyClient }       from "@/lib/integrations/shopify/shopify-client";
import { recordHealthCheck }         from "@/lib/integrations/integration-runtime";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const orgSlug = searchParams.get("orgSlug");
  const live    = searchParams.get("live") === "true";

  if (!orgSlug) {
    return NextResponse.json({ error: "orgSlug is required" }, { status: 400 });
  }

  // ── Auth ──
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

  // ── Get connection (no secrets) ──
  const connection = await getIntegrationConnection(organization.id, "shopify");

  if (!connection) {
    return NextResponse.json({
      connected:       false,
      status:          "not_connected",
      health:          "disconnected",
      shopDomain:      null,
      shopName:        null,
      scopes:          [],
      connectedAt:     null,
      lastHealthCheckAt: null,
      errorMessage:    null,
      liveCheck:       null,
    });
  }

  // ── Optional live API check ──
  let liveCheck: {
    ok:          boolean;
    shopName:    string | null;
    planName:    string | null;
    checkedAt:   string;
    errorMessage: string | null;
  } | null = null;

  if (live && connection.status === "connected") {
    try {
      // Retrieve access token from vault (server-only — never in response)
      const secret = await getIntegrationSecret({
        organizationId: organization.id,
        connectionId:   connection.id,
        secretType:     SECRET_TYPE.ACCESS_TOKEN,
      });

      if (secret) {
        const shopDomain = connection.externalAccountId
          ? `${connection.externalAccountId}.myshopify.com`
          : connection.externalAccountName ?? "";

        // Get shop domain from connection (stored during callback)
        const client = createShopifyClient(
          // We'll look for shopDomain in the DB record directly
          await getShopDomainForConnection(connection.id, organization.id),
        );
        const result = await client.checkHealth(secret.plainValue);

        liveCheck = {
          ok:           result.ok,
          shopName:     result.shopName,
          planName:     result.planName,
          checkedAt:    result.checkedAt,
          errorMessage: result.errorMessage,
        };

        // Record health check result
        await recordHealthCheck({
          connectionId:   connection.id,
          organizationId: organization.id,
          provider:       "shopify",
          healthy:        result.ok,
          errorMessage:   result.errorMessage,
        });
      }
    } catch {
      liveCheck = {
        ok:           false,
        shopName:     null,
        planName:     null,
        checkedAt:    new Date().toISOString(),
        errorMessage: "Health check failed",
      };
    }
  }

  // ── Return safe status (NO tokens, NO secrets) ──
  return NextResponse.json({
    connected:         connection.status === "connected",
    status:            connection.status,
    health:            connection.health,
    externalAccountId: connection.externalAccountId,
    shopName:          connection.externalAccountName,
    scopes:            connection.scopes,
    connectedAt:       connection.connectedAt,
    lastHealthCheckAt: connection.lastHealthCheckAt,
    errorMessage:      connection.errorMessage,
    liveCheck,
  });
}

// ── Helper ────────────────────────────────────────────────────────────────────

async function getShopDomainForConnection(
  connectionId:   string,
  organizationId: string,
): Promise<string> {
  const { prisma } = await import("@/lib/prisma");
  const record = await prisma.integrationConnection.findFirst({
    where: { id: connectionId, organizationId },
    select: { shopDomain: true },
  });
  return record?.shopDomain ?? "";
}
