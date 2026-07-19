/**
 * POST /api/orgs/[orgSlug]/connectors/[connectorId]/dry-run
 *
 * Safe validation endpoint — fetches and normalises a single module page from
 * the source system WITHOUT writing any records to the database and WITHOUT
 * advancing the sync cursor.  Use this to verify connectivity, field mapping,
 * and record counts before committing a real sync.
 *
 * Body:
 *   { module: string }   — the module to preview (e.g. "customers", "opportunities")
 *
 * Returns:
 *   {
 *     runId:       string          — the ConnectorRun created for auditing
 *     module:      string
 *     status:      "SUCCESS" | "FAILED"
 *     rowsRead:    number          — raw rows returned by the source
 *     rowsSkipped: number          — intra-page duplicates
 *     error:       string | null
 *     ms:          number
 *   }
 *
 * The ConnectorRun record IS written so the attempt is auditable, but no
 * domain-model rows (CustomerProfile, CRMOpportunity, etc.) are touched.
 */

import { NextResponse }     from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { prisma }           from "@/lib/prisma";
import { syncEngine }       from "@/lib/connectors/core/sync-engine";

// Register all adapters before calling syncEngine
import "@/lib/connectors/adapters";

export const runtime     = "nodejs";
export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: { orgSlug: string; connectorId: string } },
) {
  const t0 = Date.now();

  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const { connectorId }  = params;

    // Verify connector belongs to this org
    const connector = await prisma.connector.findFirst({
      where: { id: connectorId, organizationId: organization.id },
    });
    if (!connector) {
      return NextResponse.json({ error: "Conector no encontrado" }, { status: 404 });
    }

    let body: { module?: string } = {};
    try { body = await req.json(); } catch { /* empty body is ok */ }

    const module = body.module;
    if (!module) {
      return NextResponse.json({ error: "Se requiere el campo 'module'" }, { status: 400 });
    }

    // dryRun: true  → pulls from source, normalises, deduplicates, but skips
    //                  storage.upsertMany() and cursor advance entirely.
    // maxPages: 1   → only fetch the first page (safe preview)
    const runId = await syncEngine.syncModule(connectorId, module as never, {
      dryRun:   true,
      maxPages: 1,
    });

    const run = await prisma.connectorRun.findUnique({
      where: { id: runId },
      select: {
        status:      true,
        rowsRead:    true,
        rowsSkipped: true,
        rowsErrored: true,
        error:       true,
      },
    });

    return NextResponse.json({
      runId,
      module,
      status:      run?.status      ?? "UNKNOWN",
      rowsRead:    run?.rowsRead    ?? 0,
      rowsSkipped: run?.rowsSkipped ?? 0,
      rowsErrored: run?.rowsErrored ?? 0,
      error:       run?.error       ?? null,
      note:        "Ejecución en modo previsualización — sin escrituras en base de datos.",
      ms: Date.now() - t0,
    });

  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });
    console.error("[dry-run/POST]", err);
    return NextResponse.json({ error: msg, ms: Date.now() - t0 }, { status: 500 });
  }
}
