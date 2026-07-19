/**
 * POST /api/orgs/[orgSlug]/comercial/pedidos/history
 *
 * Actions: customer, seller, commercial_intelligence, variant_metrics, seller_resolution
 *
 * Sprint: COMERCIAL-PEDIDOS-DOCUMENTO-HISTORIAL-03
 * Sprint: COMERCIAL-PEDIDOS-INTELIGENCIA-COMERCIAL-05
 * Sprint: PEDIDOS-VARIANT-ENRICHMENT-01
 * Sprint: PEDIDOS-VENDEDOR-RESOLUTION-01
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import {
  getCustomerHistory,
  getSellerHistory,
} from "@/lib/comercial/pedidos/order-history-service";
import {
  buildCustomerMemory,
} from "@/lib/comercial/pedidos/commercial-memory-builder";
import {
  buildCustomerInsights,
} from "@/lib/comercial/pedidos/david-commercial-signals";
import {
  getCommercialVariantMetrics,
} from "@/lib/comercial/pedidos/variant-enrichment-service";
import {
  generateSellerResolutionReport,
} from "@/lib/comercial/pedidos/seller-resolution-service";
import {
  getSellerPerformance,
} from "@/lib/comercial/pedidos/seller-performance-service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId = organization.id;

  const body = await req.json();
  const action = body.action as string;

  switch (action) {
    case "customer": {
      const history = await getCustomerHistory(orgId, body.customerCode);
      return NextResponse.json({ history });
    }

    case "seller": {
      const history = await getSellerHistory(orgId, body.sellerName);
      return NextResponse.json({ history });
    }

    case "commercial_intelligence": {
      const memory = await buildCustomerMemory(orgId, body.customerCode);
      const insights = buildCustomerInsights(memory);
      return NextResponse.json({ memory, insights });
    }

    case "variant_metrics": {
      const since = body.since ? new Date(body.since) : undefined;
      const metrics = await getCommercialVariantMetrics(orgId, { since, limit: body.limit ?? 10 });
      return NextResponse.json({ metrics });
    }

    case "seller_resolution": {
      const report = await generateSellerResolutionReport(orgId);
      return NextResponse.json({ report });
    }

    case "seller_performance": {
      const t0 = Date.now();
      console.log("[seller_performance] START", {
        sellerName: body.sellerName,
        sellerCode: body.sellerCode,
        source: body.source,
        orgId,
      });
      try {
        const perf = await getSellerPerformance(
          orgId,
          body.sellerName ?? "",
          body.sellerCode ?? null,
          body.source ?? "unknown",
        );
        console.log("[seller_performance] OK", {
          ms: Date.now() - t0,
          orders: perf.kpis.totalOrders,
          alerts: perf.alerts.length,
        });
        return NextResponse.json({ performance: perf });
      } catch (err: any) {
        console.error("[seller_performance] ERROR", {
          ms: Date.now() - t0,
          message: err?.message,
          stack: err?.stack,
        });
        return NextResponse.json(
          { error: err?.message ?? "seller_performance failed" },
          { status: 500 },
        );
      }
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
