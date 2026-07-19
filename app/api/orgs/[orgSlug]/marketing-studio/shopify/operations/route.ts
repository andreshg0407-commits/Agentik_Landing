/**
 * app/api/orgs/[orgSlug]/marketing-studio/shopify/operations/route.ts
 *
 * SHOPIFY-OPERATIONS-01 — Operations API
 *
 * GET → full operational snapshot (orders grouped by lifecycle stage + alerts)
 *
 * Query params:
 *   ?view=alerts    — return only OperationAlertSummary
 *   ?view=shipments — return only delayed shipments
 *   ?view=returns   — return only return summaries
 *   ?view=refunds   — return only refund summaries
 *   ?minDays=N      — for view=shipments: stale threshold (default 5)
 */

import { NextRequest, NextResponse }  from "next/server";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import { getIntegrationConnection }   from "@/lib/integrations/integration-repository";
import { assertIntegrationActive }    from "@/lib/integrations/integration-runtime";
import { getIntegrationSecret }       from "@/lib/integrations/vault/vault-service";
import { SECRET_TYPE }                from "@/lib/integrations/vault/vault-types";
import { CONNECTION_STATUS }          from "@/lib/integrations/integration-types";
import {
  listOperations,
  listOperationalAlerts,
  listDelayedShipments,
  listReturns,
  listRefunds,
} from "@/lib/marketing-studio/commerce/shopify-operations-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ orgSlug: string }> };

// ── Connection resolver ────────────────────────────────────────────────────────

async function resolveShopifyConnection(orgId: string) {
  const connection = await getIntegrationConnection(orgId, "shopify");
  if (!connection || connection.status !== CONNECTION_STATUS.CONNECTED) {
    return { connection: null, shopDomain: null, vaultSecret: null };
  }
  assertIntegrationActive(connection, "shopify", orgId);
  if (!connection.shopDomain) return { connection: null, shopDomain: null, vaultSecret: null };

  const vaultSecret = await getIntegrationSecret({
    organizationId: orgId,
    connectionId:   connection.id,
    secretType:     SECRET_TYPE.ACCESS_TOKEN,
  });

  if (!vaultSecret) return { connection, shopDomain: connection.shopDomain, vaultSecret: null };
  return { connection, shopDomain: connection.shopDomain, vaultSecret };
}

// ── GET — operational snapshot ─────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: RouteContext,
) {
  const { orgSlug } = await params;
  try {
    const { organization } = await requireOrgAccess(orgSlug);
    const { shopDomain, vaultSecret } = await resolveShopifyConnection(organization.id);

    if (!shopDomain || !vaultSecret) {
      return NextResponse.json({
        ok: true, disconnected: true,
        orders: [], pendingPayment: [], preparing: [], inTransit: [],
        delivered: [], cancelled: [], alerts: { total: 0, critical: 0, warning: 0, paymentFailures: 0, stalledShipments: 0, pendingReturns: 0, ordersAtRisk: 0, alerts: [] },
        total: 0, source: "shopify", fetchedAt: new Date().toISOString(),
      });
    }

    const token = vaultSecret.plainValue;   // ⚠ server-only
    const view  = req.nextUrl.searchParams.get("view");

    if (view === "alerts") {
      const alerts = await listOperationalAlerts(organization.id, token, shopDomain);
      return NextResponse.json({ ok: true, ...alerts });
    }

    if (view === "shipments") {
      const minDays = parseInt(req.nextUrl.searchParams.get("minDays") ?? "5", 10);
      const shipments = await listDelayedShipments(organization.id, token, shopDomain, { minDays });
      return NextResponse.json({ ok: true, shipments, total: shipments.length });
    }

    if (view === "returns") {
      const returns = await listReturns(organization.id, token, shopDomain);
      return NextResponse.json({ ok: true, returns, total: returns.length });
    }

    if (view === "refunds") {
      const refunds = await listRefunds(organization.id, token, shopDomain);
      return NextResponse.json({ ok: true, refunds, total: refunds.length });
    }

    // Default: full snapshot
    const result = await listOperations(organization.id, token, shopDomain);
    return NextResponse.json({ ok: true, ...result });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al cargar operaciones";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
