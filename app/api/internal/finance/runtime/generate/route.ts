/**
 * POST /api/internal/finance/runtime/generate
 *
 * Internal endpoint — triggers financial runtime generation for one org.
 * Protected by INTERNAL_CRON_SECRET (header: x-internal-cron-secret).
 *
 * Body: { "organizationId": "..." }
 *
 * Response (safe — counts only, no financial data):
 *   { ok: true, outcome, reason, eventCount, state }
 *   { ok: false, error }
 *
 * Sprint: AGENTIK-FINANCIAL-RUNTIME-ACTIVATION-01
 */

import { NextRequest, NextResponse }         from "next/server";
import { activateFinancialRuntimeForOrg }   from "@/lib/finance/runtime-activation";

export const runtime     = "nodejs";
export const maxDuration = 60;

// ── Auth ───────────────────────────────────────────────────────────────────────

const CRON_SECRET = process.env.INTERNAL_CRON_SECRET ?? "";

function isAuthorized(req: NextRequest): boolean {
  if (!CRON_SECRET) return false;
  const header = req.headers.get("x-internal-cron-secret") ?? "";
  const query  = new URL(req.url).searchParams.get("secret") ?? "";
  return header === CRON_SECRET || query === CRON_SECRET;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let organizationId: string;
  try {
    const body = await req.json() as { organizationId?: unknown };
    if (!body.organizationId || typeof body.organizationId !== "string") {
      return NextResponse.json(
        { ok: false, error: "organizationId is required" },
        { status: 400 },
      );
    }
    organizationId = body.organizationId;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const result = await activateFinancialRuntimeForOrg(organizationId);

    // Safe response — no financial amounts, no raw documents, no tokens
    return NextResponse.json({
      ok:         true,
      outcome:    result.outcome,
      reason:     result.reason,
      orgId:      result.orgId,
      eventCount: result.events?.length ?? 0,
      state:      result.snapshot?.overallState ?? null,
      generatedAt: result.generatedAt?.toISOString() ?? null,
    });
  } catch (err) {
    const msg = (err instanceof Error) ? err.message : "internal_error";
    console.error(`[finance/runtime/generate] uncaught org=${organizationId}:`, msg);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
