/**
 * commercial-operational-types.ts
 *
 * COMERCIAL-OPERATIONAL-INTEGRATION-01
 * Types for the first real operational pipeline validation.
 *
 * These types represent the output of connecting Castillitos' real data
 * through Business Entities → Signals → Events → Knowledge Graph → Reasoning.
 *
 * No React. No UI. Server-side types for pipeline output.
 */

import type { BusinessSignal } from "@/lib/business-signals";
import type { BusinessEvent } from "@/lib/business-events";
import type { Observation, Finding, Insight, Risk, Opportunity, Recommendation, ReasoningConfidence } from "@/lib/business-reasoning";

// -- Reference Analysis Result -----------------------------------------------

/**
 * Complete operational analysis for a single product reference.
 * This is the output of running one reference through the full pipeline.
 */
export interface ReferenceOperationalAnalysis {
  /** SAG product reference code. */
  reference: string;
  /** Product name (null if unknown). */
  productName: string | null;
  /** Current total inventory across all warehouses. */
  inventoryAvailable: number;
  /** Is the reference out of stock? */
  isOutOfStock: boolean;
  /** Is the reference critically low? */
  isCritical: boolean;
  /** Threshold used for critical determination. */
  criticalThreshold: number;

  // -- Affected entities ----------------------------------------------------
  /** Orders containing this reference. */
  affectedOrders: AffectedOrder[];
  /** Customers with orders for this reference. */
  affectedCustomers: AffectedCustomer[];
  /** Vendors with this reference in their portfolio. */
  affectedVendors: AffectedVendor[];
  /** Portfolios (maletas) containing this reference. */
  affectedPortfolios: AffectedPortfolio[];
  /** Production orders for this reference. */
  relatedProduction: RelatedProduction[];
  /** Inventory in other warehouses (potential transfers). */
  alternativeInventory: AlternativeInventory[];

  // -- Pipeline output ------------------------------------------------------
  /** Signals generated for this reference. */
  signals: BusinessSignal[];
  /** Events generated for this reference. */
  events: BusinessEvent[];
  /** Observations (raw facts). */
  observations: Observation[];
  /** Findings (factual conclusions). */
  findings: Finding[];
  /** Insights (knowledge-graph-enriched understanding). */
  insights: Insight[];
  /** Risks identified. */
  risks: Risk[];
  /** Opportunities identified. */
  opportunities: Opportunity[];
  /** Recommendations (suggestedOnly: true). */
  recommendations: Recommendation[];

  // -- Confidence -----------------------------------------------------------
  confidence: ReasoningConfidence;

  // -- Missing data ---------------------------------------------------------
  missingInformation: string[];
}

// -- Affected entity snapshots -----------------------------------------------

export interface AffectedOrder {
  orderId: string;
  orderDate: string;
  customerName: string | null;
  amount: number;
  status: string;
}

export interface AffectedCustomer {
  customerId: string;
  customerName: string;
  orderCount: number;
  totalAmount: number;
}

export interface AffectedVendor {
  vendorId: string;
  vendorName: string;
  portfolioId: string | null;
  assignedQty: number;
  availableQty: number;
  status: string;
}

export interface AffectedPortfolio {
  portfolioId: string;
  vendorId: string;
  vendorName: string;
  season: string | null;
  status: string;
  assignedQty: number;
  availableToSellQty: number;
}

export interface RelatedProduction {
  opId: string;
  documentNumber: string | null;
  status: string;
  isClosed: boolean;
  quantityOrdered: number;
  documentDate: string | null;
}

export interface AlternativeInventory {
  warehouseCode: string;
  warehouseName: string;
  available: number;
}

// -- Pipeline Result ---------------------------------------------------------

/**
 * Complete operational integration result for Castillitos.
 * Contains analyses for all critical/out-of-stock references.
 */
export interface CommercialOperationalResult {
  organizationId: string;
  orgSlug: string;
  /** Total references analyzed. */
  totalReferencesAnalyzed: number;
  /** References that are out of stock. */
  outOfStockCount: number;
  /** References that are critically low. */
  criticalCount: number;
  /** Individual reference analyses. */
  analyses: ReferenceOperationalAnalysis[];
  /** Aggregate signals generated. */
  totalSignals: number;
  /** Aggregate events generated. */
  totalEvents: number;
  /** Aggregate recommendations generated. */
  totalRecommendations: number;
  /** Overall pipeline confidence. */
  confidence: ReasoningConfidence;
  /** Processing time in ms. */
  processingMs: number;
  /** ISO timestamp. */
  assembledAt: string;
}
