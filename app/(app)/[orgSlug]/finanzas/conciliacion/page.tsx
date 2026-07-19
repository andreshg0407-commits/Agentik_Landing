/**
 * /[orgSlug]/finanzas/conciliacion
 *
 * Conciliación Inteligente — Server Component wrapper.
 * Handles auth + delegates rendering to ConciliacionClient.
 *
 * Sprint: AGENTIK-RECONCILIATION-WORKSPACE-01
 * Data: sessions from session-service (real DB), sources from RECONCILIATION_SOURCES registry.
 */

import { requireOrgAccess }            from "@/lib/auth/org-access";
import { ConciliacionClient }          from "./conciliacion-client";
import { getReconciliationSummary }    from "@/lib/finance/reconciliation";
import { getCashKpis }                 from "@/lib/castillitos/cash-kpis";
import { getGraphHealthSummary }       from "@/lib/finance/graph";
import { getRecentSessions }           from "@/lib/reconciliation/session-service";
import { RECONCILIATION_SOURCES }      from "@/lib/reconciliation/source-contract";
import { buildSourceReadinessReport }  from "@/lib/reconciliation/readiness/source-readiness";
import { deriveDetectedLimitations }   from "@/lib/reconciliation/readiness/detected-limitations";

export default async function ConciliacionPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);

  const [reconSummary, cashKpis, graphHealth, sessions] = await Promise.all([
    getReconciliationSummary(organization.id).catch(() => null),
    getCashKpis(organization.id).catch(() => null),
    getGraphHealthSummary(organization.id).catch(() => null),
    getRecentSessions(organization.id, 15).catch(() => []),
  ]);

  // Pure derivation — no I/O needed
  const readinessReport    = buildSourceReadinessReport();
  const limitationsReport  = deriveDetectedLimitations(readinessReport);

  // Serialize source contracts for client — no Prisma types cross the RSC boundary
  const allSources = Object.values(RECONCILIATION_SOURCES).map(s => ({
    sourceId:            s.sourceId as string,
    label:               s.label,
    shortLabel:          s.shortLabel,
    provider:            s.provider,
    readiness:           s.readiness as string,
    readinessNote:       s.readinessNote,
    availableFields:     s.availableFields as string[],
    requiresUpload:      s.requiresUpload,
    requiresCredential:  s.requiresCredential,
    requiresIntegration: s.requiresIntegration,
  }));

  return (
    <ConciliacionClient
      orgSlug={orgSlug}
      reconSummary={reconSummary ?? undefined}
      cashKpis={cashKpis ?? undefined}
      graphCriticalCount={graphHealth?.criticalIssues ?? 0}
      graphWarningCount={graphHealth?.warningIssues ?? 0}
      graphOrphanCount={graphHealth?.orphanCount ?? 0}
      graphUnresolvedCount={graphHealth?.unresolvedCount ?? 0}
      graphHasData={graphHealth !== null && graphHealth.totalNodes > 0}
      sessions={sessions}
      allSources={allSources}
      readinessReport={readinessReport}
      limitationsReport={limitationsReport}
    />
  );
}
