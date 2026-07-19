/**
 * castillitos-executive-loader.ts
 *
 * CASTILLITOS-EXECUTIVE-REPORTS-INTEGRATION-02 — Phase 1: Orchestrator.
 *
 * Server-side loader that orchestrates data from:
 *   - Commercial Availability
 *   - Production Engine + Production Flow Intelligence
 *   - Replenishment Intelligence
 *   - LiveVendor
 *   - Maleta Replacement
 *
 * Does NOT implement business logic. Only loads and consolidates.
 *
 * server-only — uses Prisma indirectly via sub-loaders.
 */

import "server-only";

import { loadAvailabilityRecords, loadSellerMaletaRecords } from "@/lib/commercial-intelligence/report-loader";
import { buildAvailabilityReport } from "@/lib/commercial-intelligence/availability-engine";
import { buildMaletaReplacementReport } from "@/lib/commercial-intelligence/maleta-replacement-engine";
import { loadProductionRecords } from "@/lib/production-intelligence/report-loader";
import { buildProductionReport } from "@/lib/production-intelligence/production-engine";
import {
  buildProductionFlowSnapshot,
  buildProductionFlowExecutiveReport,
} from "@/lib/production-intelligence/production-flow-engine";
import {
  buildReplenishmentSnapshot,
  buildReplenishmentExecutiveReport,
} from "@/lib/replenishment-intelligence/replenishment-engine";
import { resolveInventoryThresholds } from "@/lib/tenant-rules/tenant-rule-resolver";
import { assembleCastillitosExecutiveIntelligence } from "./castillitos-executive-builder";
import type { CastillitosExecutiveIntelligence } from "./castillitos-executive-types";
import type { LiveVendorProfile } from "@/lib/comercial/vendors/live-vendor-types";
import type { CommercialAvailabilityReport, AvailabilityRow } from "@/lib/commercial-intelligence/availability-types";
import type { ProductionInProgressReport } from "@/lib/production-intelligence/production-types";
import type { ProductionFlowSnapshot, ProductionFlowExecutiveReport } from "@/lib/production-intelligence/production-flow-types";
import type { ReplenishmentSnapshot, ReplenishmentExecutiveReport } from "@/lib/replenishment-intelligence/replenishment-types";
import type { MaletaReplacementReport } from "@/lib/commercial-intelligence/availability-types";

// ── Main Loader ──────────────────────────────────────────────────────────────

/** Load the complete Castillitos executive intelligence package. */
export async function loadCastillitosExecutiveIntelligence(
  organizationId: string,
  orgSlug: string,
): Promise<CastillitosExecutiveIntelligence> {
  // Phase 0: Resolve tenant business rules
  const tenantRules = resolveInventoryThresholds(orgSlug);

  // Phase 1: Load all data sources in parallel
  const [availResult, sellerInventory, prodResult, vendors] = await Promise.all([
    loadAvailabilityRecords(organizationId),
    loadSellerMaletaRecords(organizationId),
    loadProductionRecords(organizationId),
    loadVendorsSafe(organizationId),
  ]);

  // Phase 2: Build availability report
  let availabilityReport: CommercialAvailabilityReport | null = null;
  if (availResult.records.length > 0) {
    availabilityReport = buildAvailabilityReport({
      orgSlug,
      records: availResult.records,
    });
  }

  // Phase 3: Build maleta report
  let maletaReport: MaletaReplacementReport | null = null;
  if (availabilityReport) {
    maletaReport = buildMaletaReplacementReport({
      orgSlug,
      availabilityRows: availabilityReport.rows,
      sellerInventory,
      rules: tenantRules.length > 0 ? tenantRules : undefined,
    });
  }

  // Phase 4: Build production report (existing engine)
  let productionReport: ProductionInProgressReport | null = null;
  if (prodResult.records.length > 0) {
    productionReport = buildProductionReport({
      orgSlug,
      records: prodResult.records,
    });
  }

  // Phase 5: Build production flow intelligence
  let productionFlow: ProductionFlowSnapshot | null = null;
  let productionFlowExecutive: ProductionFlowExecutiveReport | null = null;
  if (productionReport && availabilityReport) {
    try {
      const vendorsByRef = buildVendorsByReference(vendors);
      productionFlow = buildProductionFlowSnapshot({
        orgSlug,
        productionReport,
        productionRecords: prodResult.records,
        availabilityRows: availabilityReport.rows,
        rules: tenantRules.length > 0 ? tenantRules : undefined,
        vendorsByReference: vendorsByRef,
      });
      productionFlowExecutive = buildProductionFlowExecutiveReport(productionFlow);
    } catch {
      // Graceful degradation — production flow is optional
    }
  }

  // Phase 6: Build replenishment intelligence
  let replenishment: ReplenishmentSnapshot | null = null;
  let replenishmentExecutive: ReplenishmentExecutiveReport | null = null;
  if (availabilityReport) {
    try {
      replenishment = buildReplenishmentSnapshot({
        orgSlug,
        availabilityRows: availabilityReport.rows,
        productionFlow,
        vendors,
        rules: tenantRules.length > 0 ? tenantRules : undefined,
      });
      replenishmentExecutive = buildReplenishmentExecutiveReport(replenishment);
    } catch {
      // Graceful degradation — replenishment is optional
    }
  }

  // Phase 7: Assemble everything
  return assembleCastillitosExecutiveIntelligence({
    orgSlug,
    availabilityReport,
    maletaReport,
    productionReport,
    productionFlow,
    productionFlowExecutive,
    replenishment,
    replenishmentExecutive,
    vendors,
  });
}

// ── Safe Loaders ─────────────────────────────────────────────────────────────

async function loadVendorsSafe(organizationId: string): Promise<LiveVendorProfile[]> {
  try {
    const { loadLiveVendors } = await import("@/lib/comercial/vendors/live-vendor-loader");
    return await loadLiveVendors(organizationId);
  } catch {
    return [];
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a map of referenceCode → vendorId[] for production flow enrichment. */
function buildVendorsByReference(
  vendors: LiveVendorProfile[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const v of vendors) {
    for (const item of v.portfolio.items) {
      const existing = map.get(item.referenceCode);
      if (existing) {
        existing.push(v.vendorId);
      } else {
        map.set(item.referenceCode, [v.vendorId]);
      }
    }
  }
  return map;
}
