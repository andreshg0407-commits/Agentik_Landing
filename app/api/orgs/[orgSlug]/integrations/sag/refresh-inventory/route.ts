/**
 * POST /api/orgs/[orgSlug]/integrations/sag/refresh-inventory
 *
 * On-demand full inventory refresh endpoint.
 *
 * Runs the complete pipeline:
 *   1. PIL SYNC  — SAG SOAP → ProductVariant + ProductInventoryLevel
 *   2. PD RECON  — Transition fulfilled orders PENDIENTE → FACTURADO
 *   3. SNAPSHOT  — PIL + PD → CommercialCoverageSnapshot
 *
 * Returns structured result with timing for each step.
 *
 * GET returns the current snapshot staleness metadata.
 *
 * Sprint: INVENTORY-SYNC-FRESHNESS-01
 */

import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { refreshInventoryPipeline } from "@/lib/integrations/sag/inventory-refresh-pipeline";
import { getSagInventorySnapshotMeta } from "@/lib/integrations/sag/sag-inventory-storage";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — PIL sync + PD recon + snapshot

export async function POST(
  _req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);

    const result = await refreshInventoryPipeline(organization.id);

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status =
      msg === "UNAUTHENTICATED" ? 401 : msg === "ORG_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function GET(
  _req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);

    const meta = await getSagInventorySnapshotMeta(organization.id);

    return NextResponse.json({ ok: true, ...meta });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status =
      msg === "UNAUTHENTICATED" ? 401 : msg === "ORG_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
