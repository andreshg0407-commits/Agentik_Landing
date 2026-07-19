/**
 * production-flow-loader.ts
 *
 * PRODUCTION-FLOW-INTELLIGENCE-01 — Server-side loader.
 * Queries Prisma for production orders, loads availability data,
 * and assembles the ProductionFlowSnapshot.
 *
 * Consumes:
 *   - loadProductionRecords() from report-loader.ts
 *   - buildProductionReport() from production-engine.ts
 *   - loadAvailabilityRecords() from commercial-intelligence/report-loader.ts
 *   - buildAvailabilityReport() from commercial-intelligence/availability-engine.ts
 *   - loadLiveVendors() from comercial/vendors/live-vendor-loader.ts (optional)
 *
 * server-only — uses Prisma directly.
 */

import "server-only";

import { loadProductionRecords } from "./report-loader";
import { buildProductionReport } from "./production-engine";
import { buildProductionFlowSnapshot, buildProductionFlowExecutiveReport, answerDavidQuery } from "./production-flow-engine";
import { buildProductionFlowSignals } from "./production-flow-signals";
import { buildProductionKnowledgeRelations } from "./production-flow-knowledge";
import { loadAvailabilityRecords } from "@/lib/commercial-intelligence/report-loader";
import { buildAvailabilityReport } from "@/lib/commercial-intelligence/availability-engine";
import type {
  ProductionFlowSnapshot,
  ProductionFlowExecutiveReport,
  ProductionFlowDavidAnswer,
  ProductionFlowDavidQueryType,
  ProductionKnowledgeRelation,
} from "./production-flow-types";
import type { BusinessSignal } from "@/lib/business-signals";
import { resolveInventoryThresholds } from "@/lib/tenant-rules/tenant-rule-resolver";

// ── Main Loader ────────────────────────────────────────────────────────────

/** Load the complete Production Flow Intelligence snapshot. */
export async function loadProductionFlowSnapshot(
  organizationId: string,
  orgSlug: string,
): Promise<ProductionFlowSnapshot> {
  // Load data sources in parallel
  const [prodResult, availResult] = await Promise.all([
    loadProductionRecords(organizationId),
    loadAvailabilityRecords(organizationId),
  ]);

  // Build production report (existing engine)
  const productionReport = buildProductionReport({
    orgSlug,
    records: prodResult.records,
    sourceBodega: "04",
  });

  // Build availability report (existing engine)
  const availabilityReport = buildAvailabilityReport({
    orgSlug,
    records: availResult.records,
    sourceBodega: "01",
  });

  // Try to load vendor data for affected vendors mapping
  let vendorsByReference: Map<string, string[]> | undefined;
  try {
    vendorsByReference = await loadVendorsByReference(organizationId);
  } catch {
    // LiveVendor data optional — graceful fallback
    vendorsByReference = undefined;
  }

  // Resolve tenant rules
  const tenantRules = resolveInventoryThresholds(orgSlug);

  // Build flow snapshot
  return buildProductionFlowSnapshot({
    orgSlug,
    productionReport,
    productionRecords: prodResult.records,
    availabilityRows: availabilityReport.rows,
    rules: tenantRules.length > 0 ? tenantRules : undefined,
    vendorsByReference,
  });
}

/** Load executive report from production flow. */
export async function loadProductionFlowExecutiveReport(
  organizationId: string,
  orgSlug: string,
): Promise<ProductionFlowExecutiveReport> {
  const snapshot = await loadProductionFlowSnapshot(organizationId, orgSlug);
  return buildProductionFlowExecutiveReport(snapshot);
}

/** Answer a David query about production flow. */
export async function loadProductionFlowDavidAnswer(
  organizationId: string,
  orgSlug: string,
  queryType: ProductionFlowDavidQueryType,
): Promise<ProductionFlowDavidAnswer> {
  const snapshot = await loadProductionFlowSnapshot(organizationId, orgSlug);
  return answerDavidQuery(snapshot, queryType);
}

/** Generate production flow business signals. */
export async function loadProductionFlowSignals(
  organizationId: string,
  orgSlug: string,
): Promise<BusinessSignal[]> {
  const snapshot = await loadProductionFlowSnapshot(organizationId, orgSlug);
  return buildProductionFlowSignals({ organizationId, snapshot });
}

/** Generate production flow knowledge graph relations. */
export async function loadProductionFlowKnowledgeRelations(
  organizationId: string,
  orgSlug: string,
): Promise<ProductionKnowledgeRelation[]> {
  const snapshot = await loadProductionFlowSnapshot(organizationId, orgSlug);
  return buildProductionKnowledgeRelations(snapshot);
}

// ── Internal: Vendor-Reference mapping ─────────────────────────────────────

/**
 * Build a map of reference → vendorIds affected.
 * Uses LiveVendor portfolio data if available.
 */
async function loadVendorsByReference(
  organizationId: string,
): Promise<Map<string, string[]>> {
  // Dynamic import to avoid hard dependency on live-vendor-loader
  const { loadLiveVendors } = await import("@/lib/comercial/vendors/live-vendor-loader");
  const vendors = await loadLiveVendors(organizationId);

  const map = new Map<string, string[]>();
  for (const vendor of vendors) {
    for (const item of vendor.portfolio.items) {
      if (!map.has(item.referenceCode)) map.set(item.referenceCode, []);
      map.get(item.referenceCode)!.push(vendor.vendorId);
    }
  }

  return map;
}
