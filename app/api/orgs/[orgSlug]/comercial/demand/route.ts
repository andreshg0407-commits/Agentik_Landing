/**
 * POST /api/orgs/[orgSlug]/comercial/demand
 *
 * Actions: snapshot, variant_analytics, coverage, stockouts,
 *          production_signals, commercial_impact, replacements
 *
 * Sprint: PEDIDOS-DEMANDA-PRODUCCION-01
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { buildDemandSnapshot } from "@/lib/comercial/demand/demand-engine";
import { getVariantDemandMetrics } from "@/lib/comercial/demand/variant-demand-analytics";
import { buildCoverageSummary } from "@/lib/comercial/demand/inventory-coverage-engine";
import { detectStockouts } from "@/lib/comercial/demand/stockout-detector";
import { generateProductionSignals } from "@/lib/comercial/demand/production-signal-engine";
import { computeCommercialImpact } from "@/lib/comercial/demand/commercial-impact";
import { findReplacements } from "@/lib/comercial/demand/replacement-engine";

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
    case "snapshot": {
      const snapshot = await buildDemandSnapshot(orgId);
      return NextResponse.json({ snapshot });
    }

    case "variant_analytics": {
      const metrics = await getVariantDemandMetrics(orgId, {
        days: body.days ?? 30,
        limit: body.limit ?? 10,
      });
      return NextResponse.json({ metrics });
    }

    case "coverage": {
      const snapshot = await buildDemandSnapshot(orgId);
      const coverage = buildCoverageSummary(snapshot.entries);
      return NextResponse.json({ coverage });
    }

    case "stockouts": {
      const snapshot = await buildDemandSnapshot(orgId);
      const stockouts = detectStockouts(snapshot.entries);
      return NextResponse.json({ stockouts });
    }

    case "production_signals": {
      const snapshot = await buildDemandSnapshot(orgId);
      const signals = generateProductionSignals(snapshot.entries);
      return NextResponse.json({ signals });
    }

    case "commercial_impact": {
      const snapshot = await buildDemandSnapshot(orgId);
      const impact = computeCommercialImpact(snapshot.entries);
      return NextResponse.json({ impact });
    }

    case "replacements": {
      const snapshot = await buildDemandSnapshot(orgId);
      const replacements = findReplacements(snapshot.entries);
      return NextResponse.json({ replacements });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
