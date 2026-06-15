/**
 * app/api/orgs/[orgSlug]/marketing-studio/shopify/statistics/route.ts
 *
 * SHOPIFY-STATISTICS-01 — Statistics API
 *
 * GET ?view=overview|sales|catalog|promotions|operations|trends|insights
 *     &period=today|yesterday|week|last_week|month|last_month
 *
 * All views default to period=week.
 * overview is the primary payload — loads all domains in one optimised fetch.
 */

import { NextRequest, NextResponse }  from "next/server";
import { requireOrgAccess }            from "@/lib/auth/org-access";
import { getIntegrationConnection }    from "@/lib/integrations/integration-repository";
import { assertIntegrationActive }     from "@/lib/integrations/integration-runtime";
import { getIntegrationSecret }        from "@/lib/integrations/vault/vault-service";
import { SECRET_TYPE }                 from "@/lib/integrations/vault/vault-types";
import { CONNECTION_STATUS }           from "@/lib/integrations/integration-types";
import {
  getOverview,
  getSalesMetrics,
  getCatalogMetrics,
  getPromotionMetrics,
  getOperationsMetrics,
  getTrendAnalysis,
  getExecutiveInsights,
} from "@/lib/marketing-studio/commerce/shopify-statistics-service";
import type { StatisticsPeriod } from "@/lib/marketing-studio/commerce/shopify-statistics-types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ orgSlug: string }> };

const VALID_VIEWS    = ["overview", "sales", "catalog", "promotions", "operations", "trends", "insights"] as const;
const VALID_PERIODS  = ["today", "yesterday", "week", "last_week", "month", "last_month"] as const;

type StatisticsView = typeof VALID_VIEWS[number];

// ── Connection resolver ────────────────────────────────────────────────────────

async function resolveShopifyConnection(orgId: string) {
  const connection = await getIntegrationConnection(orgId, "shopify");
  if (!connection || connection.status !== CONNECTION_STATUS.CONNECTED) {
    return { shopDomain: null, vaultSecret: null };
  }
  assertIntegrationActive(connection, "shopify", orgId);
  if (!connection.shopDomain) return { shopDomain: null, vaultSecret: null };

  const vaultSecret = await getIntegrationSecret({
    organizationId: orgId,
    connectionId:   connection.id,
    secretType:     SECRET_TYPE.ACCESS_TOKEN,
  });

  if (!vaultSecret) return { shopDomain: connection.shopDomain, vaultSecret: null };
  return { shopDomain: connection.shopDomain, vaultSecret };
}

// ── GET ────────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: RouteContext,
) {
  const { orgSlug } = await params;
  const sp = req.nextUrl.searchParams;

  const rawView   = sp.get("view")   ?? "overview";
  const rawPeriod = sp.get("period") ?? "week";

  const view   = (VALID_VIEWS   as readonly string[]).includes(rawView)   ? rawView   as StatisticsView   : "overview"  as StatisticsView;
  const period = (VALID_PERIODS as readonly string[]).includes(rawPeriod) ? rawPeriod as StatisticsPeriod : "week"      as StatisticsPeriod;

  try {
    const { organization } = await requireOrgAccess(orgSlug);
    const { shopDomain, vaultSecret } = await resolveShopifyConnection(organization.id);

    if (!shopDomain || !vaultSecret) {
      return NextResponse.json({ ok: true, disconnected: true });
    }

    const orgId       = organization.id;
    const accessToken = vaultSecret.plainValue;   // ⚠ server-only

    switch (view) {
      case "overview": {
        const data = await getOverview(orgId, accessToken, shopDomain, period);
        return NextResponse.json({ ok: true, ...data });
      }

      case "sales": {
        const data = await getSalesMetrics(orgId, accessToken, shopDomain, period);
        return NextResponse.json({ ok: true, ...data });
      }

      case "catalog": {
        const data = await getCatalogMetrics(orgId, accessToken, shopDomain, period);
        return NextResponse.json({ ok: true, ...data });
      }

      case "promotions": {
        const data = await getPromotionMetrics(orgId, accessToken, shopDomain);
        return NextResponse.json({ ok: true, ...data });
      }

      case "operations": {
        const data = await getOperationsMetrics(orgId, accessToken, shopDomain);
        return NextResponse.json({ ok: true, ...data });
      }

      case "trends": {
        const data = await getTrendAnalysis(orgId, accessToken, shopDomain, period);
        return NextResponse.json({ ok: true, ...data });
      }

      case "insights": {
        const data = await getExecutiveInsights(orgId, accessToken, shopDomain, period);
        return NextResponse.json({ ok: true, insights: data });
      }

      default: {
        return NextResponse.json(
          { ok: false, error: `Vista no reconocida: ${view}` },
          { status: 400 },
        );
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al cargar estadísticas";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
