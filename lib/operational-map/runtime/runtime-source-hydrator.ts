/**
 * lib/operational-map/runtime/runtime-source-hydrator.ts
 *
 * Runtime Source Hydrator — AGENTIK-SAG-RUNTIME-SOURCE-HYDRATION-01
 *
 * INTERNAL ONLY: SUPER_ADMIN / AGENTIK_ADMIN
 *
 * Takes RuntimeDetectionResult[] from the detector and upserts
 * OperationalKpiSource records with appropriate validationStatus.
 *
 * Critical rules:
 *   - NEVER overwrite confirmed_with_dba, production_certified, or replaced
 *   - NEVER overwrite sag_confirmed or crm_confirmed
 *   - Only upsert if model status = "has_data"
 *   - Dedupe by (organizationId, kpiKey, sourceName) — safe to re-run
 */

import { upsertKpiSource } from "@/lib/operational-map/certification/operational-kpi-source-service";
import type { RuntimeDetectionResult } from "./runtime-source-detector";
import type { KpiSourceValidationStatus } from "@/lib/operational-map/certification/operational-kpi-source-service";
import { resolveRuntimeKpiKey } from "./kpi-runtime-key-aliases";
import { detectSourceLineage } from "./runtime-source-lineage-detector";
import { prisma } from "@/lib/prisma";

// Statuses that must NOT be overwritten by runtime detection
const PROTECTED_STATUSES: KpiSourceValidationStatus[] = [
  "confirmed_with_dba",
  "production_certified",
  "replaced",
  "sag_confirmed",
  "crm_confirmed",
  "business_confirmed",
  "ready_for_integration",
];

export type HydrationReport = {
  created:  number;
  updated:  number;
  skipped:  number;
  errors:   number;
  details:  Array<{ kpiKey: string; sourceName: string; action: "created" | "updated" | "skipped" | "error"; reason?: string }>;
  // Diagnostic fields (AGENTIK-RUNTIME-KPI-KEY-ALIGNMENT-01)
  matchedRuntimeKeys:   string[];
  unmatchedRuntimeKeys: string[];
};

/**
 * Hydrates OperationalKpiSource from runtime detection results.
 * Safe to re-run — uses upsert with dedup on (orgId, kpiKey, sourceName).
 */
export async function hydrateRuntimeSources(
  organizationId: string,
  detections:     RuntimeDetectionResult[],
  actorId:        string,
  dryRun:         boolean = false,
): Promise<HydrationReport> {
  // Build set of all valid audit entity keys from existing DB sources + detections
  // We use the detection kpiKeys themselves as the canonical set for resolution
  const allDetectedKeys = new Set(detections.map(d => d.kpiKey));

  const report: HydrationReport = {
    created: 0, updated: 0, skipped: 0, errors: 0, details: [],
    matchedRuntimeKeys:   [],
    unmatchedRuntimeKeys: [],
  };

  for (const detection of detections) {
    // Resolve kpiKey through alias map
    const resolvedKey = resolveRuntimeKpiKey(detection.kpiKey, allDetectedKeys);
    if (!resolvedKey) {
      report.unmatchedRuntimeKeys.push(detection.kpiKey);
      continue;
    }
    if (!report.matchedRuntimeKeys.includes(resolvedKey)) {
      report.matchedRuntimeKeys.push(resolvedKey);
    }

    for (const src of detection.sources) {
      try {
        // Check if a source with this name already exists for this KPI
        const existing = await prisma.operationalKpiSource.findFirst({
          where: { organizationId, kpiKey: resolvedKey, sourceName: src.sourceName },
          select: { id: true, validationStatus: true },
        });

        if (existing) {
          // Don't overwrite protected statuses
          if (PROTECTED_STATUSES.includes(existing.validationStatus as KpiSourceValidationStatus)) {
            report.skipped++;
            report.details.push({ kpiKey: detection.kpiKey, sourceName: src.sourceName, action: "skipped", reason: `Status protegido: ${existing.validationStatus}` });
            continue;
          }
          if (!dryRun) {
            report.updated++;
          } else {
            report.details.push({ kpiKey: detection.kpiKey, sourceName: src.sourceName, action: "updated", reason: `DRY RUN — would update: ${existing.validationStatus} → ${src.validationStatus}` });
          }
        } else {
          if (dryRun) {
            report.created++;
            report.details.push({ kpiKey: detection.kpiKey, sourceName: src.sourceName, action: "created", reason: "DRY RUN — would create" });
            continue;
          }
          report.created++;
        }

        if (dryRun) continue;

        await upsertKpiSource({
          organizationId,
          kpiKey:           resolvedKey,
          sourceName:       src.sourceName,
          sourceType:       src.sourceType as import("@/lib/operational-map/certification/operational-kpi-source-service").KpiSourceType,
          sourceRole:       "primary",
          provider:         src.provider,
          validationStatus: src.validationStatus,
          moduleName:       src.internalModule,
          description:      `Detectado automáticamente: ${src.model}. ${src.limitationNote ?? ""}`.trim(),
          connectorActive:  src.rowCount > 0,
          sourceOrigin:     src.sourceOrigin,
          runtimeRowCount:  src.rowCount,
          runtimeLastSyncAt: src.lastSyncAt ?? undefined,
          runtimeConfidence: src.confidence,
          runtimeLineage:   (await detectSourceLineage(organizationId, src.model, src.provider, src.rowCount)) ?? undefined,
          notes:            `Runtime detectado: ${src.rowCount} filas. Modelo: ${src.model}. Fuente: Agentik runtime.${src.limitationNote ? " Limitación: " + src.limitationNote : ""}`,
          actorId,
        });
      } catch (err) {
        report.errors++;
        report.details.push({
          kpiKey:     detection.kpiKey,
          sourceName: src.sourceName,
          action:     "error",
          reason:     err instanceof Error ? err.message : "Error desconocido",
        });
      }
    }
  }

  return report;
}
