/**
 * GET /api/orgs/[orgSlug]/reconciliation/review
 *
 * AGENTIK-RECON-REVIEW-CENTER-01 — Phase 4
 * List ReconReviewItem records for the Review Center.
 *
 * Query params:
 *   executionId?  — filter by execution
 *   sessionId?    — filter by session
 *   status?       — filter by lifecycle status (comma-separated for multiple)
 *   verdict?      — filter by verdict
 *   sourceAType?  — filter by source A
 *   sourceBType?  — filter by source B
 *   minScore?     — minimum score (0–100)
 *   maxScore?     — maximum score (0–100)
 *   limit?        — max results (default 50, max 200)
 *   offset?       — pagination offset
 *   summary?      — "true" to include ReviewCenterSummary in response
 *
 * Returns: { items: ReconReviewItemRow[], summary?: ReviewCenterSummary }
 *
 * IMPORTANT: Backend-only API route.
 */

import { NextRequest, NextResponse }     from "next/server";
import { requireOrgAccess }             from "@/lib/auth/org-access";
import { listReviewItems, getReviewCenterSummary } from "@/lib/reconciliation/review/review-repository";
import type { ReviewItemStatus }        from "@/lib/reconciliation/review/review-types";

export async function GET(
  req:     NextRequest,
  context: { params: Promise<{ orgSlug: string }> },
): Promise<NextResponse> {
  const { orgSlug } = await context.params;

  try {
    const { organization } = await requireOrgAccess(orgSlug);
    const organizationId   = organization.id;

    const { searchParams } = req.nextUrl;

    const executionId  = searchParams.get("executionId")  ?? undefined;
    const sessionId    = searchParams.get("sessionId")    ?? undefined;
    const verdict      = searchParams.get("verdict")      ?? undefined;
    const sourceAType  = searchParams.get("sourceAType")  ?? undefined;
    const sourceBType  = searchParams.get("sourceBType")  ?? undefined;
    const includeSummary = searchParams.get("summary") === "true";

    // status can be comma-separated
    const statusRaw = searchParams.get("status");
    const status = statusRaw
      ? (statusRaw.split(",").map(s => s.trim()) as ReviewItemStatus[])
      : undefined;

    const minScore = searchParams.get("minScore") ? parseInt(searchParams.get("minScore")!, 10) : undefined;
    const maxScore = searchParams.get("maxScore") ? parseInt(searchParams.get("maxScore")!, 10) : undefined;
    const rawLimit = parseInt(searchParams.get("limit") ?? "50", 10);
    const limit    = isNaN(rawLimit) ? 50 : Math.min(Math.max(rawLimit, 1), 200);
    const rawOffset = parseInt(searchParams.get("offset") ?? "0", 10);
    const offset   = isNaN(rawOffset) ? 0 : rawOffset;

    const [items, summary] = await Promise.all([
      listReviewItems(organizationId, {
        executionId, sessionId, status, verdict,
        sourceAType, sourceBType,
        minScore, maxScore, limit, offset,
      }),
      includeSummary
        ? getReviewCenterSummary(organizationId, { executionId, sourceAType, sourceBType })
        : Promise.resolve(undefined),
    ]);

    return NextResponse.json({ items, ...(summary ? { summary } : {}) });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    if (msg === "ACCESS_DENIED" || msg === "ORG_NOT_FOUND" || msg === "ORG_INACTIVE") {
      return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
    }
    console.error("[RECON_REVIEW_LIST]", msg);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
