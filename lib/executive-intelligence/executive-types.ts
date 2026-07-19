/**
 * executive-types.ts
 *
 * INFORMES-EJECUTIVOS-CASTILLITOS-03
 * Types for the Executive Intelligence Pipeline.
 *
 * The Executive Dashboard consumes these structures — never raw data.
 * All types are client-safe. No Prisma. No React. No AI.
 */

import type { EntityRef, ReasoningSeverity, ReasoningCategory } from "@/lib/business-reasoning";
import type { ReasoningConfidence } from "@/lib/business-reasoning";
import type { DataFreshnessLevel } from "@/lib/business-entities/core";

// -- Executive KPI ---------------------------------------------------------

/** A single KPI for executive display. */
export interface ExecutiveKpi {
  /** Machine-readable key. */
  key: string;
  /** Human-readable label. */
  label: string;
  /** Numeric value. */
  value: number;
  /** Formatted value for display (e.g. "$1.2M", "23%"). */
  formatted: string;
  /** Unit of measurement. */
  unit: "currency" | "count" | "percent" | "days" | "ratio";
  /** Change from previous period (null if not computable). */
  delta: number | null;
  /** Direction of change. */
  trend: "up" | "down" | "flat" | "unknown";
  /** Whether this KPI has a problem. */
  alert: boolean;
  /** Data source identifier. */
  source: string;
}

// -- Executive Alert -------------------------------------------------------

/** An alert surfaced to the executive. */
export interface ExecutiveAlert {
  id: string;
  title: string;
  description: string;
  severity: ReasoningSeverity;
  category: ReasoningCategory;
  entity: EntityRef | null;
  /** Evidence summary (why this alert exists). */
  evidenceSummary: string;
  /** ISO timestamp. */
  detectedAt: string;
}

// -- Executive Recommendation ----------------------------------------------

/** A recommendation from David's reasoning. */
export interface ExecutiveRecommendation {
  id: string;
  title: string;
  description: string;
  expectedBenefit: string;
  priority: number;
  severity: ReasoningSeverity;
  category: ReasoningCategory;
  entity: EntityRef | null;
  /** Evidence summary (why this recommendation). */
  evidenceSummary: string;
  /** Always true until Action Engine. */
  suggestedOnly: true;
  /** ISO timestamp. */
  producedAt: string;
}

// -- Executive Risk --------------------------------------------------------

/** A business risk for the executive risk report. */
export interface ExecutiveRisk {
  id: string;
  title: string;
  description: string;
  severity: ReasoningSeverity;
  category: ReasoningCategory;
  probability: number;
  impact: number;
  estimatedValueAtRisk: number | null;
  entity: EntityRef | null;
  affectedEntities: EntityRef[];
  evidenceSummary: string;
  producedAt: string;
}

// -- Executive Opportunity -------------------------------------------------

/** A business opportunity for the executive. */
export interface ExecutiveOpportunity {
  id: string;
  title: string;
  description: string;
  category: ReasoningCategory;
  estimatedValue: number | null;
  effort: string;
  priority: number;
  entity: EntityRef | null;
  evidenceSummary: string;
  producedAt: string;
}

// -- Report Sections -------------------------------------------------------

/** Commercial report section. */
export interface CommercialReport {
  /** Sales KPIs. */
  kpis: ExecutiveKpi[];
  /** Top selling references (by revenue). */
  topReferences: Array<{ reference: string; amount: number; count: number }>;
  /** References that stopped selling (had sales last month, none this). */
  stoppedReferences: Array<{ reference: string; lastSaleDate: string }>;
  /** Vendor performance cards. */
  vendorPerformance: Array<{
    vendorName: string;
    salesToday: number;
    salesMonth: number;
    ordersToday: number;
    fulfillmentRate: number;
    alertCount: number;
    health: string;
  }>;
  /** Data freshness. */
  freshness: DataFreshnessLevel;
  /** Last operational date from SAG. */
  lastOperationalDate: string | null;
}

/** Inventory report section (decision-oriented). */
export interface InventoryReport {
  kpis: ExecutiveKpi[];
  /** References requiring immediate attention. */
  criticalReferences: Array<{
    reference: string;
    productName: string | null;
    currentStock: number;
    affectedOrders: number;
    affectedVendors: number;
    hasProductionInProgress: boolean;
  }>;
  /** Data freshness. */
  freshness: DataFreshnessLevel;
}

/** Production report section. */
export interface ProductionReport {
  kpis: ExecutiveKpi[];
  /** References currently in production. */
  referencesInProduction: Array<{
    reference: string;
    opCount: number;
    totalQuantity: number;
    oldestOpDate: string | null;
  }>;
  /** Data freshness. */
  freshness: DataFreshnessLevel;
}

/** Cartera/receivables report section. */
export interface CarteraReport {
  kpis: ExecutiveKpi[];
  /** Top debtors. */
  topDebtors: Array<{
    customerName: string;
    balanceDue: number;
    daysOverdue: number;
  }>;
  /** Data freshness. */
  freshness: DataFreshnessLevel;
}

// -- Executive Intelligence Report -----------------------------------------

/**
 * The complete Executive Intelligence Report.
 *
 * This is what the Executive Dashboard consumes.
 * It is assembled by the Executive Pipeline from:
 *   Business Entities → Knowledge Graph → Reasoning
 *
 * The dashboard NEVER queries modules directly.
 */
export interface ExecutiveIntelligenceReport {
  /** Organization ID. */
  organizationId: string;
  /** Organization slug. */
  orgSlug: string;

  // -- Summary --
  /** Executive summary KPIs (the "pulse"). */
  summaryKpis: ExecutiveKpi[];
  /** Critical alerts requiring immediate attention. */
  criticalAlerts: ExecutiveAlert[];

  // -- Reports --
  /** Commercial intelligence report. */
  commercial: CommercialReport;
  /** Inventory decision report. */
  inventory: InventoryReport;
  /** Production status report. */
  production: ProductionReport;
  /** Cartera/receivables report. */
  cartera: CarteraReport;

  // -- Reasoning --
  /** Consolidated risks from Reasoning Engine. */
  risks: ExecutiveRisk[];
  /** Consolidated opportunities from Reasoning Engine. */
  opportunities: ExecutiveOpportunity[];

  // -- David Recommends --
  /** Prioritized recommendations. */
  recommendations: ExecutiveRecommendation[];

  // -- Meta --
  /** Overall confidence of the intelligence. */
  confidence: ReasoningConfidence;
  /** Data freshness. */
  freshness: DataFreshnessLevel;
  /** ISO timestamp when this report was assembled. */
  assembledAt: string;
  /** Processing time in milliseconds. */
  processingMs: number;
}
