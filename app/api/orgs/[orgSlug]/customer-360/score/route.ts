/**
 * POST /api/orgs/[orgSlug]/customer-360/score
 *
 * Runs customer risk scoring for every CustomerProfile in the org and writes
 * the results (riskScore, healthScore, churnRisk, nextBestAction, aiSummary,
 * scoredAt) back to the CustomerProfile table.
 *
 * Body (optional):
 *   { slug?: string }  — score a single customer by slug; omit for all
 *
 * Scoring is always available:
 *   - With ANTHROPIC_API_KEY: calls Claude claude-sonnet-4-6 with a Spanish prompt
 *   - Without: uses the deterministic fallback (instant, always works)
 *
 * Returns:
 *   { scored: number; source: "ai" | "deterministic"; ms: number }
 */

import { NextResponse }       from "next/server";
import { requireOrgAccess }   from "@/lib/auth/org-access";
import { runScoringForOrg }   from "@/lib/customer360/scoring-service";

export const runtime     = "nodejs";
export const maxDuration = 120;

export async function POST(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  const t0 = Date.now();

  try {
    const { organization } = await requireOrgAccess(params.orgSlug);

    let slug: string | undefined;
    try { slug = (await req.json() as { slug?: string }).slug; } catch { /* ok */ }

    const result = await runScoringForOrg(organization.id, { slug });
    return NextResponse.json(result);

  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Not found" }, { status: 404 });
    console.error("[customer-360/score/POST]", err);
    return NextResponse.json({ error: (err as Error).message, ms: Date.now() - t0 }, { status: 500 });
  }
}
