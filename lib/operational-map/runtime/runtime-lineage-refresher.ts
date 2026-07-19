/**
 * lib/operational-map/runtime/runtime-lineage-refresher.ts
 *
 * Runtime Lineage Refresher — AGENTIK-SAG-LINEAGE-RESOLUTION-02
 *
 * INTERNAL ONLY: SUPER_ADMIN / AGENTIK_ADMIN
 *
 * Dedicated refresher that updates ONLY the `runtimeLineage` JSON field
 * on ALL OperationalKpiSource rows for an org — including protected rows
 * (confirmed_with_dba, sag_confirmed, production_certified, etc.).
 *
 * SAFE INVARIANTS:
 *   - NEVER changes validationStatus
 *   - NEVER changes sourceName, sourceType, sourceRole, sourceOfTruth
 *   - NEVER changes any certified/approved fields
 *   - Only overwrites runtimeLineage with fresh detection results
 *
 * Why this is needed:
 *   The standard hydrator (runtime-source-hydrator.ts) skips protected rows
 *   entirely to preserve certification integrity.
 *   But runtimeLineage is observational data — it is ALWAYS safe to refresh
 *   because it only reports what the runtime currently contains, not what
 *   has been certified.
 *
 * Sprint: AGENTIK-SAG-LINEAGE-RESOLUTION-02
 */

import { prisma }             from "@/lib/prisma";
import { detectSourceLineage } from "./runtime-source-lineage-detector";
import type { RuntimeSourceLineage } from "./runtime-source-lineage-detector";

export interface LineageRefreshReport {
  organizationId:   string;
  modelsProcessed:  string[];
  rowsUpdated:      number;
  rowsSkipped:      number;      // lineage returned null (0-row model)
  errors:           number;
  details: Array<{
    model:    string;
    provider: string;
    rowCount: number;
    action:   "updated" | "skipped" | "error";
    reason?:  string;
  }>;
}

// ─── Model → provider mapping ─────────────────────────────────────────────────

const MODEL_PROVIDER: Record<string, "sag" | "crm" | "bank" | "agentik"> = {
  SaleRecord:                    "sag",
  SalesImportBatch:              "sag",
  CollectionRecord:              "sag",
  CRMQuote:                      "crm",
  CRMQuoteLine:                  "crm",
  CustomerProfile:               "crm",
  PaymentRecord:                 "bank",
  BankMovement:                  "bank",
  BankSyncSession:               "bank",
  CommercialCoverageSnapshot:    "agentik",
  FinancialRuntimeSnapshot:      "agentik",
  ReconciliationSession:         "agentik",
  OperationalReservation:        "agentik",
};

// ─── Fetch current row count for a model ─────────────────────────────────────

async function getCurrentRowCount(
  organizationId: string,
  model:          string,
): Promise<number> {
  try {
    switch (model) {
      case "SaleRecord":                 return await prisma.saleRecord.count({ where: { organizationId } });
      case "SalesImportBatch":           return await prisma.salesImportBatch.count({ where: { organizationId } });
      case "CollectionRecord":           return await prisma.collectionRecord.count({ where: { organizationId } });
      case "CRMQuote":                   return await prisma.cRMQuote.count({ where: { organizationId } });
      case "CRMQuoteLine":               return await prisma.cRMQuoteLine.count({
        where: { quote: { organizationId } }
      });
      case "CustomerProfile":            return await prisma.customerProfile.count({ where: { organizationId } });
      case "PaymentRecord":              return await prisma.paymentRecord.count({ where: { organizationId } });
      case "BankMovement":               return await prisma.bankMovement.count({ where: { organizationId } });
      case "BankSyncSession":            return await prisma.bankSyncSession.count({ where: { organizationId } });
      case "FinancialRuntimeSnapshot":   return await prisma.financialRuntimeSnapshot.count({ where: { organizationId } });
      case "ReconciliationSession":      return await prisma.reconciliationSession.count({ where: { organizationId } });
      case "OperationalReservation":     return await prisma.operationalReservation.count({ where: { organizationId } });
      default:                           return 0;
    }
  } catch {
    return 0;
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

// ─── Shared core ─────────────────────────────────────────────────────────────

async function runLineageRefresh(
  organizationId: string,
  // When true, only processes rows with sourceOrigin = "runtime_detected"
  runtimeOnly: boolean,
): Promise<LineageRefreshReport> {
  const report: LineageRefreshReport = {
    organizationId,
    modelsProcessed: [],
    rowsUpdated:     0,
    rowsSkipped:     0,
    errors:          0,
    details:         [],
  };

  // 1. Fetch all distinct (sourceName, provider) pairs
  //    Extract Prisma model from sourceName pattern "Human Name (PrismaModel)"
  const whereClause = runtimeOnly
    ? { organizationId, sourceOrigin: "runtime_detected" as const }
    : { organizationId };

  const sourceGroups = await prisma.operationalKpiSource.findMany({
    where:    whereClause,
    select:   { sourceName: true, provider: true },
    distinct: ["sourceName", "provider"],
  });

  // Dedupe by Prisma model name (multiple sourceName entries can map to same model)
  const modelMap = new Map<string, { model: string; provider: string }>();
  for (const sg of sourceGroups) {
    const match = /\(([^)]+)\)$/.exec(sg.sourceName);
    if (!match) continue;
    const model = match[1];
    if (!modelMap.has(model)) {
      modelMap.set(model, { model, provider: MODEL_PROVIDER[model] ?? sg.provider });
    }
  }

  const modelGroups = [...modelMap.values()];

  if (modelGroups.length === 0) {
    return report;
  }

  // 2. For each unique model: detect lineage and bulk-update runtimeLineage on matching rows
  for (const group of modelGroups) {
    const model    = group.model;
    const provider = group.provider as "sag" | "crm" | "bank" | "agentik";

    try {
      // Get FRESH row count from the actual model table
      const rowCount = await getCurrentRowCount(organizationId, model);

      // Run lineage detection (includes primarySagSource resolution)
      let lineage: RuntimeSourceLineage | null = null;
      if (rowCount > 0) {
        lineage = await detectSourceLineage(organizationId, model, provider, rowCount);
      }

      if (!lineage) {
        // Model has no rows or no supported lineage — skip update to preserve existing lineage
        report.rowsSkipped++;
        report.details.push({ model, provider, rowCount, action: "skipped", reason: rowCount === 0 ? "No rows in model" : "Lineage not supported" });
        continue;
      }

      // Bulk-update ONLY runtimeLineage — no other field touched
      // Match rows by sourceName suffix "(ModelName)" + optional runtimeOnly filter
      const updateWhere = runtimeOnly
        ? { organizationId, sourceName: { endsWith: `(${model})` }, sourceOrigin: "runtime_detected" as const }
        : { organizationId, sourceName: { endsWith: `(${model})` } };

      const result = await prisma.operationalKpiSource.updateMany({
        where: updateWhere,
        data:  {
          runtimeLineage:    lineage as object,
          runtimeLastSyncAt: new Date(),
        },
      });

      report.rowsUpdated += result.count;
      report.modelsProcessed.push(model);
      report.details.push({
        model, provider, rowCount,
        action: "updated",
        reason: `Updated ${result.count} rows. Primary: ${
          lineage.primarySagSource && !("unresolved" in lineage.primarySagSource)
            ? `${(lineage.primarySagSource as { code: string }).code} — ${(lineage.primarySagSource as { sourceName: string }).sourceName}`
            : "unresolved"
        }`,
      });
    } catch (err) {
      report.errors++;
      report.details.push({
        model, provider: group.provider, rowCount: 0,
        action: "error",
        reason: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return report;
}

// ─── Public exports ───────────────────────────────────────────────────────────

/**
 * Refreshes runtimeLineage on ALL OperationalKpiSource rows for the org
 * (including non-runtime rows with certified status).
 * Never changes any field except runtimeLineage + runtimeLastSyncAt.
 */
export async function refreshRuntimeLineage(
  organizationId: string,
): Promise<LineageRefreshReport> {
  return runLineageRefresh(organizationId, false);
}

/**
 * Re-hydrates runtimeLineage on ALL rows with sourceOrigin = "runtime_detected".
 * This is the canonical re-hydration function — called when stale lineage is detected.
 *
 * Query: sourceOrigin = "runtime_detected"
 * Action: complete overwrite of runtimeLineage with fresh primarySagSource + sourceCodeGroups
 * Safe: NEVER touches validationStatus, sourceName, or any certified fields.
 */
export async function rehydrateAllRuntimeLineage(
  organizationId: string,
): Promise<LineageRefreshReport> {
  return runLineageRefresh(organizationId, true);
}
