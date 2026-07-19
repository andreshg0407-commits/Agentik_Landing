/**
 * app/api/orgs/[orgSlug]/operational-map/source-catalog/route.ts
 *
 * Source Catalog API — combined real SAG sources + org DB sources.
 *
 * CRITICAL SECURITY: SUPER_ADMIN / AGENTIK_ADMIN ONLY.
 *
 * GET — returns:
 *   sagReal:    SagRealSource[] from the static CSV-based catalog
 *   dbSources:  DataSourceRecord[] from OperationalDataSource (org-specific)
 *   kpiSources: KpiSourceRecord[] from OperationalKpiSource with bootstrapBatchId
 *
 * The drawer uses this to show real SAG document-type codes first,
 * then DB-persisted sources, rather than mock presets.
 *
 * Sprint: AGENTIK-REAL-SAG-SOURCE-CATALOG-FIX-01
 */

import { NextResponse }       from "next/server";
import { requireOrgAccess }   from "@/lib/auth/org-access";
import { isInternalRole }     from "@/lib/auth/module-access";
import { ALL_SAG_REAL_SOURCES, SAG_REAL_GROUPS } from "@/lib/operational-map/source-catalog/sag-real-source-catalog";
import { getAllDataSources }   from "@/lib/operational-map/source-catalog/source-catalog-service";
import { prisma }             from "@/lib/prisma";

export const runtime = "nodejs";

async function requireInternalAccess(orgSlug: string) {
  const result = await requireOrgAccess(orgSlug);
  if (!isInternalRole(result.membership.role)) throw new Error("FORBIDDEN");
  return result;
}

export async function GET(
  _req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireInternalAccess(params.orgSlug);

    // Static SAG real catalog (from CSV)
    const sagReal = ALL_SAG_REAL_SOURCES;
    const sagGroups = SAG_REAL_GROUPS.map(g => ({
      label:   g.label,
      sources: g.sources,
    }));

    // Org-level catalog from DB (manually curated sources)
    const dbSources = await getAllDataSources(organization.id).catch(() => []);

    // Bootstrap-imported sources (already assigned to KPIs)
    const bootstrapSources = await prisma.operationalKpiSource.findMany({
      where:   { organizationId: organization.id, bootstrapBatchId: { not: null } },
      select:  { kpiKey: true, sourceName: true, provider: true, validationStatus: true, bootstrapBatchId: true, bootstrapMetadata: true },
      orderBy: { kpiKey: "asc" },
    }).catch(() => []);

    // Summary by code — which SAG codes already have bootstrap sources
    const importedCodes = new Set<string>();
    for (const s of bootstrapSources) {
      const meta = s.bootstrapMetadata as { sagCode?: string } | null;
      if (meta?.sagCode) importedCodes.add(meta.sagCode);
    }

    return NextResponse.json({
      ok: true,
      sagReal,
      sagGroups,
      dbSources,
      bootstrapSourceCount: bootstrapSources.length,
      importedSagCodes:     Array.from(importedCodes),
    });
  } catch (err) {
    const msg    = err instanceof Error ? err.message : "Internal error";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
