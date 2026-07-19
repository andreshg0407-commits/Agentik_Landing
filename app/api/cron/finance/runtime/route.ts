/**
 * GET /api/cron/finance/runtime
 *
 * Vercel Cron endpoint — triggers financial runtime generation for all active orgs.
 * Protected by INTERNAL_CRON_SECRET (header: x-internal-cron-secret or ?secret=).
 *
 * Suggested schedule: every 30 minutes — vercel.json schedule: "every-30m"
 * Already registered in vercel.json as path /api/cron/finance/runtime.
 *
 * Response (safe — counts only):
 *   { ok: true, summary: { totalOrgs, generated, skipped, failed, durationMs } }
 *   { ok: false, error }
 *
 * Sprint: AGENTIK-FINANCIAL-RUNTIME-ACTIVATION-01
 */

import { NextRequest, NextResponse }                      from "next/server";
import { activateFinancialRuntimeForActiveOrgs }         from "@/lib/finance/runtime-batch";

export const runtime     = "nodejs";
export const maxDuration = 300; // 5 min — batch across all orgs

// ── Auth ───────────────────────────────────────────────────────────────────────

const CRON_SECRET = process.env.INTERNAL_CRON_SECRET ?? "";
const VERCEL_CRON_SECRET = process.env.CRON_SECRET ?? "";

function isAuthorized(req: NextRequest): boolean {
  const header = req.headers.get("x-internal-cron-secret") ?? "";
  if (CRON_SECRET && header === CRON_SECRET) return true;

  const query = new URL(req.url).searchParams.get("secret") ?? "";
  if (CRON_SECRET && query === CRON_SECRET) return true;

  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (CRON_SECRET && token === CRON_SECRET) return true;
    if (VERCEL_CRON_SECRET && token === VERCEL_CRON_SECRET) return true;
  }

  return false;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await activateFinancialRuntimeForActiveOrgs();

    return NextResponse.json({
      ok:      true,
      summary: {
        totalOrgs:  result.totalOrgs,
        generated:  result.generated,
        skipped:    result.skipped,
        failed:     result.failed,
        durationMs: result.durationMs,
      },
    });
  } catch (err) {
    const msg = (err instanceof Error) ? err.message : "internal_error";
    console.error("[cron/finance/runtime] uncaught:", msg);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

// Vercel Cron always uses GET — POST alias for manual triggers
export { GET as POST };
