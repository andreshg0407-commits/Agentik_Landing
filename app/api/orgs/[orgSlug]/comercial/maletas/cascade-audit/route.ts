/**
 * GET /api/orgs/[orgSlug]/comercial/maletas/cascade-audit
 *
 * P0-08B2R6G-R2: Diagnostic endpoint for authenticated runtime reconciliation.
 * Returns cascade coverage counts per vendor (Néstor focus).
 *
 * TEMPORARY — remove after closeout verification.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { loadVendorSampleData } from "@/lib/comercial/maletas/vendor-sample-loader";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  try {
    const { orgSlug } = await params;
    const { organization } = await requireOrgAccess(orgSlug);
    const data = await loadVendorSampleData(organization.id);

    const vendorAudits = data.sampleCoverage.vendorCoverages.map((vc) => {
      const b01Slots = vc.positions.flatMap(p => p.candidates.filter(c => c.status === "B01_AVAILABLE")).length;
      const b04Slots = vc.positions.flatMap(p => p.candidates.filter(c => c.status === "OP_INCOMING")).length;
      const belowThresholdSlots = vc.positions.flatMap(p => p.candidates.filter(c => c.status === "STOCK_AVAILABLE_BELOW_THRESHOLD")).length;
      const prodSlots = vc.positions.flatMap(p => p.candidates.filter(c => c.status === "PRODUCTION_REQUIRED")).length;
      const unverifiedSlots = vc.positions.flatMap(p => p.candidates.filter(c => c.status === "DATA_UNVERIFIED")).length;
      const importSlots = vc.positions.flatMap(p => p.candidates.filter(c => c.status === "IMPORT_UNAVAILABLE")).length;

      return {
        vendorId: vc.vendorId,
        vendorName: vc.vendorName,
        totalPositions: vc.totalDerroteroEntries,
        coveredByMostrario: vc.completeEntries,
        missingPositions: vc.missingEntries,
        excessPositions: vc.excessEntries,
        completionPct: vc.completionPct,
        // Per-status position counts
        positionsByStatus: {
          b01Available: vc.b01Available,
          opIncoming: vc.opIncoming,
          stockBelowThreshold: vc.stockBelowThreshold,
          productionRequired: vc.productionRequired,
          dataUnverified: vc.dataUnverified,
          importUnavailable: vc.importUnavailable,
        },
        // Per-status slot (candidate) counts
        slotsBySource: {
          b01: b01Slots,
          b04: b04Slots,
          belowThreshold: belowThresholdSlots,
          productionRequired: prodSlots,
          dataUnverified: unverifiedSlots,
          importUnavailable: importSlots,
        },
        invariant: `${vc.b01Available} + ${vc.opIncoming} + ${vc.stockBelowThreshold} + ${vc.productionRequired} + ${vc.dataUnverified} + ${vc.importUnavailable} = ${vc.missingEntries} (missing)`,
      };
    });

    return NextResponse.json({
      source: data.source,
      loadedAt: data.loadedAt,
      b04Availability: data.b04Inventory.availability,
      b04TotalRefs: data.b04Inventory.totalRefs,
      b04TotalExistencia: data.b04Inventory.totalExistencia,
      b04RejectedNoSubgrupo: data.opTruthAudit.b04RejectedNoSubgrupo,
      globalSummary: data.sampleCoverage.coverageSummary,
      totalMissingPositions: data.sampleCoverage.totalMissingPositions,
      vendors: vendorAudits,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
