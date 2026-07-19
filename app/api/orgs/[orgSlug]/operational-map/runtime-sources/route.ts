/**
 * app/api/orgs/[orgSlug]/operational-map/runtime-sources/route.ts
 *
 * Runtime Source Detection & Hydration API.
 *
 * CRITICAL SECURITY: SUPER_ADMIN / AGENTIK_ADMIN ONLY.
 *
 * GET  — returns detection summary (which models have data, how many rows)
 * POST — runs detection + hydrates OperationalKpiSource records
 *        + always refreshes runtimeLineage on ALL rows (incl. protected)
 *
 * Body (POST):
 *   { dryRun?: boolean }
 *
 * Sprint: AGENTIK-SAG-RUNTIME-SOURCE-HYDRATION-01
 *         AGENTIK-SAG-LINEAGE-RESOLUTION-02
 */

import { NextResponse }            from "next/server";
import { requireOrgAccess }        from "@/lib/auth/org-access";
import { isInternalRole }          from "@/lib/auth/module-access";
import { detectRuntimeSources, getRuntimeDetectionSummary } from "@/lib/operational-map/runtime/runtime-source-detector";
import { hydrateRuntimeSources }   from "@/lib/operational-map/runtime/runtime-source-hydrator";
import { rehydrateAllRuntimeLineage } from "@/lib/operational-map/runtime/runtime-lineage-refresher";

export const runtime = "nodejs";

async function requireInternalAccess(orgSlug: string) {
  const result = await requireOrgAccess(orgSlug);
  if (!isInternalRole(result.membership.role)) throw new Error("FORBIDDEN");
  return result;
}

// ─── GET — detection summary ──────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireInternalAccess(params.orgSlug);
    const summary = await getRuntimeDetectionSummary(organization.id);
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    return handleError(err);
  }
}

// ─── POST — detect + hydrate + refresh lineage ────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization, user } = await requireInternalAccess(params.orgSlug);
    const body   = await req.json().catch(() => ({})) as { dryRun?: boolean };
    const dryRun = body.dryRun ?? false;

    // Step 1: Detect + hydrate (creates/updates non-protected rows with new lineage)
    const detections = await detectRuntimeSources(organization.id);
    const report     = await hydrateRuntimeSources(organization.id, detections, user.id, dryRun);

    // Step 2: Re-hydrate runtimeLineage on ALL runtime_detected rows with fresh primarySagSource.
    // Safe: only overwrites runtimeLineage + runtimeLastSyncAt, never touches validationStatus.
    let refreshReport = null;
    if (!dryRun) {
      refreshReport = await rehydrateAllRuntimeLineage(organization.id);
    }

    return NextResponse.json({
      ok:           true,
      dryRun,
      detectedKpis: detections.length,
      report,
      refreshReport,
      // Diagnostic — AGENTIK-RUNTIME-KPI-KEY-ALIGNMENT-01
      diagnostic: {
        detectedKpiKeys:      detections.map(d => d.kpiKey),
        matchedRuntimeKeys:   report.matchedRuntimeKeys,
        unmatchedRuntimeKeys: report.unmatchedRuntimeKeys,
        detectedModels:       [...new Set(detections.flatMap(d => d.sources.map(s => s.model)))],
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

// ─── Error handler ────────────────────────────────────────────────────────────

function handleError(err: unknown) {
  const msg    = err instanceof Error ? err.message : "Internal error";
  const status = msg === "UNAUTHENTICATED" ? 401
    : msg === "ORG_NOT_FOUND"             ? 404
    : msg === "ACCESS_DENIED" || msg === "FORBIDDEN" ? 403
    : 500;
  return NextResponse.json({ ok: false, error: msg }, { status });
}
