/**
 * POST /api/internal/financial-memory/capture
 *
 * Internal cron endpoint — captures daily financial stream snapshots.
 *
 * Protected by INTERNAL_CRON_SECRET env var (header: x-internal-cron-secret).
 * No public access. No sensitive data in response.
 *
 * Invocation cadence: daily at 06:00 UTC (= 01:00 COT) via Vercel Cron.
 * Also supports GET for Vercel Cron compatibility.
 *
 * Optional request body (JSON):
 *   { organizationId?: string }   — capture for a single org only
 *
 * Response:
 *   { ok: true, summary, results }   — partial success is still ok: true
 *   { ok: false, error }             — only on auth failure or uncaught error
 *
 * Design rules:
 *   - Never exposes raw financial data in response
 *   - Only exposes counts and status codes
 *   - Safe partial success: one org failure does not abort others
 *   - Idempotent: re-running produces at most one snapshot per stream per day
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma }                    from "@/lib/prisma";
import { captureFinancialSnapshots } from "@/lib/financial/snapshot-orchestrator";
import type { SnapshotCaptureResult } from "@/lib/financial/snapshot-orchestrator";

export const runtime  = "nodejs";
export const maxDuration = 60; // 60s Vercel function timeout

const CRON_SECRET = process.env.INTERNAL_CRON_SECRET ?? "";

// ── Auth guard ────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  if (!CRON_SECRET) {
    // No secret configured — reject all requests for safety
    return false;
  }
  const headerSecret = req.headers.get("x-internal-cron-secret") ?? "";
  const url          = new URL(req.url);
  const querySecret  = url.searchParams.get("secret") ?? "";
  return headerSecret === CRON_SECRET || querySecret === CRON_SECRET;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // ── Org scope ───────────────────────────────────────────────────────────────
  let orgIds: string[];
  try {
    const body = await req.json().catch(() => ({})) as { organizationId?: string };
    if (body.organizationId) {
      orgIds = [body.organizationId];
    } else {
      // All active orgs
      const orgs = await prisma.organization.findMany({
        where:  { deletedAt: null },
        select: { id: true },
      });
      orgIds = orgs.map(o => o.id);
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  // ── Capture per org ─────────────────────────────────────────────────────────
  const results: Record<string, SnapshotCaptureResult> = {};
  let totalCaptured = 0;
  let totalErrors   = 0;

  for (const orgId of orgIds) {
    try {
      const result       = await captureFinancialSnapshots(orgId);
      results[orgId]     = result;
      totalCaptured     += result.captured;
      totalErrors       += result.errors;
    } catch (err) {
      const msg = (err as Error).message ?? "unknown";
      console.error(`[financial-memory/capture] org=${orgId} uncaught:`, msg);
      // Record the failure without aborting other orgs
      results[orgId] = {
        orgId,
        capturedAt:     new Date().toISOString(),
        snapshotDate:   "",
        totalStreams:   0,
        captured:       0,
        skipped:        0,
        errors:         1,
        streams:        [],
        partialSuccess: false,
      };
      totalErrors++;
    }
  }

  // ── Safe summary response (no raw financial data) ──────────────────────────
  const summary = {
    orgs:          orgIds.length,
    totalCaptured,
    totalErrors,
    hasFailures:   totalErrors > 0,
  };

  console.info(
    `[financial-memory/capture] orgs=${summary.orgs}` +
    ` captured=${totalCaptured} errors=${totalErrors}`,
  );

  // Return safe per-org summary (counts only, no amounts, no account data)
  const safeResults = Object.fromEntries(
    Object.entries(results).map(([orgId, r]) => [
      orgId,
      {
        snapshotDate:   r.snapshotDate,
        totalStreams:   r.totalStreams,
        captured:       r.captured,
        skipped:        r.skipped,
        errors:         r.errors,
        partialSuccess: r.partialSuccess,
      },
    ]),
  );

  return NextResponse.json({ ok: true, summary, results: safeResults });
}

// Vercel Cron uses GET — alias to POST handler
export { POST as GET };
