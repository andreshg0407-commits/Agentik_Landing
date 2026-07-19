/**
 * /api/internal/comercial/maletas/sync
 *
 * Internal sync endpoint for the Maletas operational persistence pipeline.
 * Designed for future cron execution (Vercel Cron / n8n / external scheduler).
 *
 * Security:
 *   - INTERNAL_CRON_SECRET Bearer token required
 *   - orgId required in body
 *   - dryRun=true allowed for validation runs
 *
 * This endpoint:
 *   1. Runs buildMaletasRuntime (Excel → engine)
 *   2. Persists full snapshot to Prisma
 *   3. Detects and persists operational events
 *   4. Returns structured ingestion result
 *
 * Future cron configuration (vercel.json):
 *   { "path": "/api/internal/comercial/maletas/sync", "schedule": "0 8,14,20 * * *" }
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-PERSISTENCE-01
 */

import { NextRequest, NextResponse } from "next/server";
import { runMaletasIngestion, runMaletasBackfill } from "@/lib/comercial/maletas/maletas-ingestion";

export const runtime = "nodejs"; // Required: filesystem + Prisma

// ─── Auth ──────────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization") ?? "";
  const token      = authHeader.replace("Bearer ", "").trim();
  const secret     = process.env.INTERNAL_CRON_SECRET;

  if (!secret) {
    // If secret not configured, block all requests
    return false;
  }

  return token === secret;
}

// ─── POST /api/internal/comercial/maletas/sync ────────────────────────────────

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const orgId  = typeof body.orgId  === "string" ? body.orgId  : null;
  const dryRun = body.dryRun === true;
  const mode   = typeof body.mode   === "string" ? body.mode   : "sync";

  if (!orgId) {
    return NextResponse.json({ error: "orgId is required" }, { status: 400 });
  }

  const maletasPath    = typeof body.maletasPath    === "string" ? body.maletasPath    : undefined;
  const disponiblePath = typeof body.disponiblePath === "string" ? body.disponiblePath : undefined;

  try {
    // ── Backfill mode: seed historical snapshots ──────────────────────────
    if (mode === "backfill") {
      const passesDaysBack = Array.isArray(body.passesDaysBack)
        ? (body.passesDaysBack as number[])
        : undefined;

      const results = await runMaletasBackfill(orgId, {
        maletasPath,
        disponiblePath,
        dryRun,
        passesDaysBack,
      });

      const totalEvents   = results.reduce((acc, r) => acc + r.events.length, 0);
      const totalWarnings = results.flatMap((r) => r.warnings);
      const anyFailed     = results.some((r) => r.status === "failed");

      return NextResponse.json({
        ok:      !anyFailed,
        mode:    "backfill",
        orgId,
        passes:  results.length,
        totalEvents,
        warnings: totalWarnings,
        results:  results.map((r) => ({
          snapshotAt:  r.snapshotAt,
          status:      r.status,
          source:      r.source,
          durationMs:  r.durationMs,
          snapshot:    r.snapshot,
          eventCount:  r.events.length,
        })),
      });
    }

    // ── Standard sync mode ────────────────────────────────────────────────
    const result = await runMaletasIngestion(orgId, {
      maletasPath,
      disponiblePath,
      dryRun,
    });

    return NextResponse.json({
      ok:         result.status !== "failed",
      mode:       dryRun ? "dry_run" : "sync",
      orgId,
      status:     result.status,
      source:     result.source,
      snapshotAt: result.snapshotAt,
      durationMs: result.durationMs,
      snapshot:   result.snapshot,
      eventCount: result.events.length,
      events:     result.events.map((e) => ({
        type:     e.type,
        severity: e.severity,
        title:    e.title,
        refCode:  e.refCode,
        line:     e.line,
      })),
      phases:   result.phases,
      warnings: result.warnings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[maletas/sync] Unhandled error:", message);
    return NextResponse.json(
      { ok: false, error: "Internal server error", detail: message },
      { status: 500 },
    );
  }
}

// ─── GET /api/internal/comercial/maletas/sync (health check) ─────────────────

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok:     true,
    route:  "/api/internal/comercial/maletas/sync",
    modes:  ["sync", "backfill", "dry_run"],
    config: {
      hasExcelPath:       !!process.env.MALETAS_EXCEL_PATH,
      hasDisponiblePath:  !!process.env.DISPONIBLE_EXCEL_PATH,
      hasCronSecret:      !!process.env.INTERNAL_CRON_SECRET,
    },
    usage: {
      sync:     "POST { orgId, dryRun? }",
      backfill: "POST { orgId, mode: 'backfill', passesDaysBack?: number[] }",
    },
  });
}
