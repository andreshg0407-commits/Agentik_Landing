/**
 * app/api/internal/workflow-chains/recover/route.ts
 *
 * Agentik — Workflow Recovery Diagnostic Route
 * Sprint: AGENTIK-WORKFLOW-HARDENING-CLOSEOUT-01 — Phase 2
 *
 * READ-ONLY diagnostic endpoint for stuck workflow run detection.
 * Calls workflowChainService.recoverStuckRuns — never mutates data.
 *
 * Protected:
 *   - Blocked in NODE_ENV === "production"
 *   - Requires ENABLE_INTERNAL_WORKFLOW_RECOVERY=true
 *     OR ENABLE_INTERNAL_INTEGRATION_TESTS=true
 *   - Requires x-agentik-integration-token header
 *
 * GET /api/internal/workflow-chains/recover?orgSlug=castillitos
 */
import "server-only";

import { NextRequest, NextResponse }    from "next/server";
import { workflowChainService }         from "@/lib/work/chaining/workflow-chain-service";

// ── Auth guard ─────────────────────────────────────────────────────────────────

const INTEGRATION_TOKEN = process.env.AGENTIK_INTEGRATION_TEST_TOKEN ?? "agentik-dev-test-token";

function guardRequest(req: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const recoveryEnabled     = process.env.ENABLE_INTERNAL_WORKFLOW_RECOVERY === "true";
  const integrationEnabled  = process.env.ENABLE_INTERNAL_INTEGRATION_TESTS === "true";
  if (!recoveryEnabled && !integrationEnabled) {
    return NextResponse.json(
      { error: "Workflow recovery endpoint disabled. Set ENABLE_INTERNAL_WORKFLOW_RECOVERY=true." },
      { status: 403 },
    );
  }

  const token = req.headers.get("x-agentik-integration-token");
  if (token !== INTEGRATION_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = guardRequest(req);
  if (guard) return guard;

  const { searchParams } = new URL(req.url);
  const orgSlug = searchParams.get("orgSlug");

  if (!orgSlug) {
    return NextResponse.json({ error: "Missing required query param: orgSlug" }, { status: 400 });
  }

  try {
    const reports = await workflowChainService.recoverStuckRuns(orgSlug);

    return NextResponse.json({
      orgSlug,
      total:   reports.length,
      reports: reports.map(r => ({
        runId:                  r.runId,
        chainId:                r.chainId,
        chainName:              r.chainName,
        status:                 r.status,
        currentStepId:          r.currentStepId,
        recommendedAction:      r.recommendedAction,
        staleSinceMs:           r.staleSinceMs,
        staleSinceMin:          Math.round(r.staleSinceMs / 60_000),
        lastAuditEvent:         r.lastAuditEvent ?? null,
      })),
      note: "READ-ONLY diagnostic. No data was mutated.",
    });

  } catch (err: unknown) {
    return NextResponse.json({
      error:   "Recovery check failed",
      message: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
