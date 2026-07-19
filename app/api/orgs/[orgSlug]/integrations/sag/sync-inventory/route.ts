/**
 * POST /api/orgs/[orgSlug]/integrations/sag/sync-inventory
 *
 * Manual SAG inventory snapshot sync endpoint.
 *
 * ─── V1: MANUAL UPLOAD ───────────────────────────────────────────────────────
 * Accepts a raw inventory rows array and persists them to CommercialCoverageSnapshot.
 * This is the V1 path: direct row upload.
 *
 * V2 will call SELECT * FROM INVENTARIO via the SAG SOAP adapter.
 * V3 will receive push events from SAG.
 *
 * ─── REQUEST ──────────────────────────────────────────────────────────────────
 * POST /api/orgs/castillitos/integrations/sag/sync-inventory
 * Content-Type: application/json
 *
 * Body:
 * {
 *   "rows": [
 *     { "refCode": "CS-001", "description": "PIJAMA NIÑA BEBE", "line": "CS",
 *       "disponible": 45, "pendingOrdersQty": 12 }
 *   ],
 *   "dryRun": false
 * }
 *
 * ─── RESPONSE ─────────────────────────────────────────────────────────────────
 * {
 *   "ok": true,
 *   "status": "success",
 *   "snapshotAt": "2026-05-26T...",
 *   "refsWritten": 47,
 *   "invalidRows": 0,
 *   "duplicateRows": 2,
 *   "warehouses": ["PRINCIPAL"],
 *   "durationMs": 312,
 *   "dryRun": false
 * }
 *
 * ─── SECURITY ─────────────────────────────────────────────────────────────────
 * Requires authenticated org access.
 * Read-only guarantee: only CommercialCoverageSnapshot is written.
 * No SAG mutations — Agentik never writes back to SAG.
 *
 * Sprint: AGENTIK-SAG-INVENTORY-SNAPSHOT-SYNC-01
 */

import { NextResponse }          from "next/server";
import { requireOrgAccess }      from "@/lib/auth/org-access";
import { runSagInventorySync }   from "@/lib/integrations/sag/sag-inventory-sync";
import type { SagInventoryInputRow } from "@/lib/integrations/sag/sag-inventory-contract";

export const runtime = "nodejs";

interface SyncInventoryBody {
  rows?:   SagInventoryInputRow[];
  dryRun?: boolean;
}

export async function POST(
  req:    Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const orgId = organization.id;

    let body: SyncInventoryBody = {};
    try {
      body = await req.json() as SyncInventoryBody;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Body JSON inválido" },
        { status: 400 },
      );
    }

    const rows   = Array.isArray(body.rows) ? body.rows : [];
    const dryRun = body.dryRun === true;

    const result = await runSagInventorySync({
      organizationId: orgId,
      rows,
      dryRun,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg    = err instanceof Error ? err.message : "Internal error";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ORG_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

// GET — returns current snapshot metadata (diagnostics)
export async function GET(
  _req:   Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);

    const { getSagInventorySnapshotMeta } = await import(
      "@/lib/integrations/sag/sag-inventory-storage"
    );

    const meta = await getSagInventorySnapshotMeta(organization.id);

    return NextResponse.json({ ok: true, ...meta });
  } catch (err) {
    const msg    = err instanceof Error ? err.message : "Internal error";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ORG_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
