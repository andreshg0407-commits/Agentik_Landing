/**
 * replenishment-loader.ts
 *
 * REPLENISHMENT-INTELLIGENCE-01 — Server-side loader.
 * Orchestrates data loading and assembles ReplenishmentSnapshot.
 *
 * Consumes:
 *   - loadAvailabilityRecords() — CommercialAvailabilityReport
 *   - loadProductionFlowSnapshot() — ProductionFlowSnapshot
 *   - loadLiveVendors() — LiveVendorProfile[]
 *
 * server-only — uses Prisma indirectly via sub-loaders.
 */

import "server-only";

import { loadAvailabilityRecords } from "@/lib/commercial-intelligence/report-loader";
import { buildAvailabilityReport } from "@/lib/commercial-intelligence/availability-engine";
import { resolveInventoryThresholds } from "@/lib/tenant-rules/tenant-rule-resolver";
import {
  buildReplenishmentSnapshot,
  buildReplenishmentExecutiveReport,
  answerReplenishmentDavidQuery,
  buildReplenishmentDecisionInputs,
  buildReplenishmentKnowledgeRelations,
} from "./replenishment-engine";
import { buildReplenishmentSignals } from "./replenishment-signals";
import type {
  ReplenishmentSnapshot,
  ReplenishmentExecutiveReport,
  ReplenishmentDavidAnswer,
  ReplenishmentDavidQueryType,
  ReplenishmentDecisionInput,
  ReplenishmentKnowledgeRelation,
} from "./replenishment-types";
import type { BusinessSignal } from "@/lib/business-signals";

// ── Main Loader ────────────────────────────────────────────────────────────

/** Load the complete Replenishment Intelligence snapshot. */
export async function loadReplenishmentSnapshot(
  organizationId: string,
  orgSlug: string,
): Promise<ReplenishmentSnapshot> {
  // Load all data sources in parallel
  const [availResult, productionFlow, vendors] = await Promise.all([
    loadAvailabilityRecords(organizationId),
    loadProductionFlowSafe(organizationId, orgSlug),
    loadVendorsSafe(organizationId),
  ]);

  // Build availability report
  const availabilityReport = buildAvailabilityReport({
    orgSlug,
    records: availResult.records,
    sourceBodega: "01",
  });

  const tenantRules = resolveInventoryThresholds(orgSlug);

  return buildReplenishmentSnapshot({
    orgSlug,
    availabilityRows: availabilityReport.rows,
    productionFlow,
    vendors,
    rules: tenantRules.length > 0 ? tenantRules : undefined,
  });
}

/** Load executive replenishment report. */
export async function loadReplenishmentExecutiveReport(
  organizationId: string,
  orgSlug: string,
): Promise<ReplenishmentExecutiveReport> {
  const snapshot = await loadReplenishmentSnapshot(organizationId, orgSlug);
  return buildReplenishmentExecutiveReport(snapshot);
}

/** Answer a David query about replenishment. */
export async function loadReplenishmentDavidAnswer(
  organizationId: string,
  orgSlug: string,
  queryType: ReplenishmentDavidQueryType,
): Promise<ReplenishmentDavidAnswer> {
  const snapshot = await loadReplenishmentSnapshot(organizationId, orgSlug);
  return answerReplenishmentDavidQuery(snapshot, queryType);
}

/** Generate replenishment signals. */
export async function loadReplenishmentSignals(
  organizationId: string,
  orgSlug: string,
): Promise<BusinessSignal[]> {
  const snapshot = await loadReplenishmentSnapshot(organizationId, orgSlug);
  return buildReplenishmentSignals({ organizationId, snapshot });
}

/** Generate decision inputs from replenishment. */
export async function loadReplenishmentDecisionInputs(
  organizationId: string,
  orgSlug: string,
): Promise<ReplenishmentDecisionInput[]> {
  const snapshot = await loadReplenishmentSnapshot(organizationId, orgSlug);
  return buildReplenishmentDecisionInputs(snapshot.recommendations);
}

/** Generate knowledge graph relations. */
export async function loadReplenishmentKnowledgeRelations(
  organizationId: string,
  orgSlug: string,
): Promise<ReplenishmentKnowledgeRelation[]> {
  const snapshot = await loadReplenishmentSnapshot(organizationId, orgSlug);
  return buildReplenishmentKnowledgeRelations(snapshot);
}

// ── Safe Loaders (graceful fallback) ───────────────────────────────────────

async function loadProductionFlowSafe(organizationId: string, orgSlug: string) {
  try {
    const { loadProductionFlowSnapshot } = await import("@/lib/production-intelligence/production-flow-loader");
    return await loadProductionFlowSnapshot(organizationId, orgSlug);
  } catch {
    return null;
  }
}

async function loadVendorsSafe(organizationId: string) {
  try {
    const { loadLiveVendors } = await import("@/lib/comercial/vendors/live-vendor-loader");
    return await loadLiveVendors(organizationId);
  } catch {
    return [];
  }
}
