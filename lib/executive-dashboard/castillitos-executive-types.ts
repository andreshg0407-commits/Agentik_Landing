/**
 * castillitos-executive-types.ts
 *
 * CASTILLITOS-EXECUTIVE-REPORTS-INTEGRATION-02 — Domain types.
 *
 * Consolidated executive intelligence types for Castillitos CEO view.
 * Consumes: CommercialAvailability, ProductionFlow, Replenishment, LiveVendor.
 *
 * No React. No Prisma. No server-only. Pure domain types.
 */

import type { CommercialAvailabilityReport } from "@/lib/commercial-intelligence/availability-types";
import type { MaletaReplacementReport } from "@/lib/commercial-intelligence/availability-types";
import type { ProductionInProgressReport } from "@/lib/production-intelligence/production-types";
import type { ProductionFlowSnapshot, ProductionFlowExecutiveReport } from "@/lib/production-intelligence/production-flow-types";
import type { ReplenishmentSnapshot, ReplenishmentExecutiveReport, ReplenishmentSummary } from "@/lib/replenishment-intelligence/replenishment-types";
import type { LiveVendorProfile } from "@/lib/comercial/vendors/live-vendor-types";

// ── Consolidated Executive Intelligence ─────────────────────────────────────

/** Full executive intelligence package for the CEO dashboard. */
export interface CastillitosExecutiveIntelligence {
  /** Organization slug. */
  orgSlug: string;
  /** When this intelligence was assembled. */
  assembledAt: string;

  // ── Existing reports (already wired) ────────────────────────────────────
  /** Commercial availability report. */
  availabilityReport: CommercialAvailabilityReport | null;
  /** Maleta replacement report. */
  maletaReport: MaletaReplacementReport | null;
  /** Production in-progress report (existing engine). */
  productionReport: ProductionInProgressReport | null;

  // ── New intelligence layers ─────────────────────────────────────────────
  /** Production flow intelligence snapshot. */
  productionFlow: ProductionFlowSnapshot | null;
  /** Production flow executive report (categorized). */
  productionFlowExecutive: ProductionFlowExecutiveReport | null;
  /** Replenishment intelligence snapshot. */
  replenishment: ReplenishmentSnapshot | null;
  /** Replenishment executive report (categorized). */
  replenishmentExecutive: ReplenishmentExecutiveReport | null;
  /** LiveVendor profiles. */
  vendors: LiveVendorProfile[];
  /** Vendor executive summary. */
  vendorSummary: VendorExecutiveSummary | null;

  // ── Data Quality ────────────────────────────────────────────────────────
  /** Data source availability. */
  dataQuality: ExecutiveDataQuality;
}

// ── Vendor Executive Summary ──────────────────────────────────────────────

/** High-level vendor portfolio health for CEO consumption. */
export interface VendorExecutiveSummary {
  /** Total active vendors. */
  totalVendors: number;
  /** Vendors with at least one critical reference. */
  vendorsWithCriticalRefs: number;
  /** Vendors with healthy portfolios. */
  vendorsHealthy: number;
  /** Total references across all vendors. */
  totalReferencesInPortfolios: number;
  /** Total units across all portfolios. */
  totalUnitsInPortfolios: number;
  /** Per-vendor summary rows. */
  vendors: VendorSummaryRow[];
}

/** Summary row for a single vendor in the executive view. */
export interface VendorSummaryRow {
  vendorId: string;
  vendorName: string;
  locationCode: string;
  totalReferences: number;
  totalUnits: number;
  criticalCount: number;
  outOfStockCount: number;
  lastTransferAt: string | null;
  coverageScore: number;
  operationalState: string;
}

// ── Data Quality ──────────────────────────────────────────────────────────

/** Tracks which data sources were available at assembly time. */
export interface ExecutiveDataQuality {
  /** Commercial availability data loaded. */
  hasAvailabilityData: boolean;
  /** Production data loaded. */
  hasProductionData: boolean;
  /** Production flow snapshot built. */
  hasProductionFlowData: boolean;
  /** Replenishment snapshot built. */
  hasReplenishmentData: boolean;
  /** LiveVendor profiles loaded. */
  hasVendorData: boolean;
  /** Maleta replacement report built. */
  hasMaletaData: boolean;
  /** Overall confidence score (0-100). */
  overallConfidence: number;
  /** Human-readable quality summary. */
  qualitySummary: string;
  /** Individual source status. */
  sources: DataSourceStatus[];
}

/** Status of a single data source. */
export interface DataSourceStatus {
  /** Source name. */
  name: string;
  /** Whether data was loaded. */
  available: boolean;
  /** Record count (if available). */
  recordCount: number | null;
  /** Confidence (0-100). */
  confidence: number;
  /** Human-readable note. */
  note: string;
}

// ── Executive Alerts ──────────────────────────────────────────────────────

/** A consolidated executive alert for CEO attention. */
export interface ExecutiveAlert {
  /** Alert ID. */
  id: string;
  /** Category. */
  category: "inventory" | "production" | "commercial" | "replenishment" | "vendor";
  /** Severity. */
  severity: "critical" | "high" | "medium" | "low" | "info";
  /** Title. */
  title: string;
  /** Detail. */
  detail: string;
  /** Source engine. */
  source: string;
  /** Metric value (for badge display). */
  metricValue: number | null;
  /** Recommended action (business language). */
  recommendedAction: string | null;
}

// ── CEO Executive Questions ──────────────────────────────────────────────

/** A CEO question answered from real intelligence data. */
export interface CeoExecutiveQuestion {
  /** Question in business language. */
  question: string;
  /** Answer derived from intelligence. */
  answer: string;
  /** Severity of the answer. */
  severity: "info" | "warning" | "critical";
  /** Which data sources contributed. */
  sources: string[];
  /** Confidence in the answer (0-100). */
  confidence: number;
}
