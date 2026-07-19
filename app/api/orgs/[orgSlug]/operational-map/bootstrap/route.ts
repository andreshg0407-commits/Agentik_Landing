/**
 * app/api/orgs/[orgSlug]/operational-map/bootstrap/route.ts
 *
 * KPI Source Bootstrap API.
 *
 * CRITICAL SECURITY: SUPER_ADMIN / AGENTIK_ADMIN ONLY.
 *
 * GET  — status: returns existing bootstrap batch summary for the org
 * POST — run: executes the bootstrap engine
 *         body: { dryRun?: boolean; skipExcluded?: boolean; skipProduction?: boolean }
 *
 * Sprint: AGENTIK-SOURCE-MAP-BOOTSTRAP-01
 */

import { NextResponse }     from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { isInternalRole }   from "@/lib/auth/module-access";
import { prisma }           from "@/lib/prisma";
import { runBootstrapEngine } from "@/lib/operational-map/bootstrap/source-map-bootstrap-engine";

export const runtime = "nodejs";

async function requireInternalAccess(orgSlug: string) {
  const result = await requireOrgAccess(orgSlug);
  if (!isInternalRole(result.membership.role)) throw new Error("FORBIDDEN");
  return result;
}

// ─── GET — bootstrap status ───────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireInternalAccess(params.orgSlug);

    // Count sources that came from bootstrap
    const bootstrapSources = await prisma.operationalKpiSource.findMany({
      where: {
        organizationId:  organization.id,
        bootstrapBatchId: { not: null },
      },
      select: {
        bootstrapBatchId: true,
        validationStatus: true,
        kpiKey:           true,
        createdAt:        true,
      },
    });

    const batches = new Map<string, { count: number; createdAt: Date }>();
    const byStatus: Record<string, number> = {};
    const byKpi:    Record<string, number> = {};

    for (const s of bootstrapSources) {
      const bid = s.bootstrapBatchId!;
      if (!batches.has(bid)) {
        batches.set(bid, { count: 0, createdAt: s.createdAt });
      }
      batches.get(bid)!.count++;
      byStatus[s.validationStatus] = (byStatus[s.validationStatus] ?? 0) + 1;
      byKpi[s.kpiKey]              = (byKpi[s.kpiKey] ?? 0) + 1;
    }

    const batchSummary = Array.from(batches.entries()).map(([id, v]) => ({
      batchId:   id,
      count:     v.count,
      createdAt: v.createdAt.toISOString(),
    })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return NextResponse.json({
      ok:            true,
      totalSources:  bootstrapSources.length,
      batches:       batchSummary,
      byStatus,
      byKpi,
    });
  } catch (err) {
    return handleError(err);
  }
}

// ─── POST — run bootstrap ─────────────────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization, user } = await requireInternalAccess(params.orgSlug);

    const body = await req.json().catch(() => ({})) as {
      dryRun?:        boolean;
      skipExcluded?:  boolean;
      skipProduction?: boolean;
    };

    const report = await runBootstrapEngine({
      organizationId: organization.id,
      actorId:        user.id,
      dryRun:         body.dryRun        ?? false,
      skipExcluded:   body.skipExcluded  ?? true,
      skipProduction: body.skipProduction ?? false,
    });

    return NextResponse.json({ ok: true, report });
  } catch (err) {
    return handleError(err);
  }
}

// ─── Error handler ────────────────────────────────────────────────────────────

function handleError(err: unknown) {
  const msg    = err instanceof Error ? err.message : "Internal error";
  const status = msg === "UNAUTHENTICATED" ? 401
    : msg === "ORG_NOT_FOUND" ? 404
    : msg === "ACCESS_DENIED" || msg === "FORBIDDEN" ? 403
    : 500;
  return NextResponse.json({ ok: false, error: msg }, { status });
}
