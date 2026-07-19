/**
 * replenishment-types.ts
 *
 * REPLENISHMENT-INTELLIGENCE-01 — Phase 1 & 2: Domain Model + Targets.
 *
 * Types for the Replenishment Intelligence layer.
 * Connects Commercial Availability, Production Flow, LiveVendor,
 * Inventory Locations, and Transfer data to produce structured
 * replenishment recommendations.
 *
 * No React. No Prisma. No server-only. Pure domain types.
 */

import type { InventoryLocationType } from "@/lib/logistics/inventory-location-types";

// ── Phase 1: Core Domain Model ─────────────────────────────────────────────

/** Complete replenishment intelligence snapshot for an organization. */
export interface ReplenishmentSnapshot {
  /** Organization slug. */
  orgSlug: string;
  /** When this snapshot was assembled. */
  computedAt: string;
  /** All replenishment recommendations. */
  recommendations: ReplenishmentRecommendation[];
  /** Summary metrics. */
  summary: ReplenishmentSummary;
  /** Data confidence assessment. */
  confidence: ReplenishmentConfidence;
}

/** A single replenishment recommendation. */
export interface ReplenishmentRecommendation {
  /** Unique recommendation ID. */
  id: string;
  /** Reference code (product). */
  referenceCode: string;
  /** Product description. */
  description: string;
  /** SubGrupo (product type). */
  subGrupo: string;
  /** SubLinea (commercial line). */
  subLinea: string;
  /** Target that needs replenishment. */
  target: ReplenishmentTarget;
  /** Source from which replenishment could come. */
  source: ReplenishmentSource;
  /** Why this recommendation was generated. */
  reason: ReplenishmentReason;
  /** Urgency level. */
  urgency: ReplenishmentUrgency;
  /** Recommended action. */
  action: ReplenishmentAction;
  /** Detailed reasoning. */
  reasoning: ReplenishmentReasoning;
  /** Evidence supporting this recommendation. */
  evidence: ReplenishmentEvidence[];
  /** Impact assessment. */
  impact: ReplenishmentImpact;
  /** Confidence in this recommendation. */
  confidence: ReplenishmentConfidence;
  /** Replacement candidates (if action involves replacement). */
  replacementCandidates: ReplenishmentReplacement[];
  /** Production context (if production-aware). */
  productionContext: ReplenishmentProductionContext | null;
  /** Transfer context (if transfer-aware). */
  transferContext: ReplenishmentTransferContext | null;
  /** This is a suggestion only — NOT an executable action. */
  suggestedOnly: true;
}

// ── Phase 2: Replenishment Targets ─────────────────────────────────────────

/** Where replenishment is needed. */
export interface ReplenishmentTarget {
  /** Target type. */
  targetType: ReplenishmentTargetType;
  /** Location code. */
  locationCode: string;
  /** Location name. */
  locationName: string;
  /** Location type from InventoryLocation model. */
  locationType: InventoryLocationType;
  /** Entity ID (vendorId, storeId, etc.). */
  entityId: string | null;
  /** Entity name. */
  entityName: string | null;
  /** Current stock at target for this reference. */
  currentStock: number;
  /** Minimum stock threshold. */
  minimumStock: number | null;
  /** Ideal stock level. */
  idealStock: number | null;
  /** Deficit (how many units short). */
  deficit: number;
}

export type ReplenishmentTargetType =
  | "PORTFOLIO"         // Vendor maleta (bodegas 35-40)
  | "STORE"             // Owned store
  | "FRANCHISE"         // Franchise location
  | "MAIN_WAREHOUSE"    // Hub principal (Bodega 01) — needs production
  | "PRODUCTION";       // Production input (Bodega 04)

/** Where replenishment can come from. */
export interface ReplenishmentSource {
  /** Source type. */
  sourceType: ReplenishmentSourceType;
  /** Location code (if applicable). */
  locationCode: string | null;
  /** Location name (if applicable). */
  locationName: string | null;
  /** Available stock at source. */
  availableStock: number | null;
  /** Reserved/committed stock. */
  reservedStock: number | null;
  /** Net available for replenishment. */
  netAvailable: number | null;
}

export type ReplenishmentSourceType =
  | "MAIN_WAREHOUSE"     // Bodega 01 — primary source
  | "PRODUCTION"         // Active production (Bodega 04)
  | "SAME_SUBGRUPO"      // Alternative reference from same SubGrupo
  | "OTHER_LOCATION"     // Another warehouse/store with surplus
  | "NONE";              // No source identified

// ── Reason & Action ────────────────────────────────────────────────────────

/** Why replenishment is needed. */
export interface ReplenishmentReason {
  /** Reason category. */
  category: ReplenishmentReasonCategory;
  /** Human-readable explanation. */
  description: string;
  /** CEO rule that triggered this (if applicable). */
  ceoRule: string | null;
  /** Threshold that was breached. */
  threshold: number | null;
}

export type ReplenishmentReasonCategory =
  | "out_of_stock"               // Zero stock
  | "below_ceo_threshold"        // Below CEO-defined minimum
  | "below_minimum"              // Below operational minimum
  | "high_sales_velocity"        // Selling fast, will deplete soon
  | "portfolio_gap"              // Vendor missing a reference they should carry
  | "store_shortage"             // Store below minimum levels
  | "production_recovery"        // Production completing, ready to distribute
  | "transfer_opportunity";      // Transfer can resolve shortage

export type ReplenishmentUrgency =
  | "critical"      // Must act immediately
  | "high"          // Act within 24-48h
  | "medium"        // Act within a week
  | "low"           // Monitor, act when convenient
  | "none";         // No action needed

/** What action is recommended. */
export type ReplenishmentAction =
  | "replenish_from_warehouse"      // Send stock from Bodega 01 to target
  | "replace_reference"             // Swap for alternative reference in same SubGrupo
  | "remove_from_portfolio"         // Remove reference from vendor maleta
  | "wait_for_production"           // Production active, wait for completion
  | "suggest_production"            // No production, suggest creating OP
  | "transfer_between_locations"    // Move stock from surplus location to deficit
  | "review_production"             // Production exists but delayed, review
  | "monitor"                       // No immediate action, keep watching
  | "no_action_needed";             // Everything is fine

// ── Phase 8: Reasoning ─────────────────────────────────────────────────────

/** Explicit reasoning chain for a recommendation. */
export interface ReplenishmentReasoning {
  /** What happened (observation). */
  whatHappened: string;
  /** Why it happened (root cause or trigger). */
  whyItHappened: string;
  /** What evidence supports this. */
  whatEvidenceExists: string;
  /** What recommendation is generated. */
  whatRecommendation: string;
  /** What impact would the action have. */
  whatImpact: string;
  /** How confident is this reasoning. */
  confidenceExplanation: string;
}

/** Evidence supporting a recommendation. */
export interface ReplenishmentEvidence {
  /** Evidence type. */
  type: ReplenishmentEvidenceType;
  /** Description. */
  description: string;
  /** Data source. */
  source: string;
  /** When this evidence was observed. */
  observedAt: string;
}

export type ReplenishmentEvidenceType =
  | "AVAILABILITY_DATA"      // From CommercialAvailabilityReport
  | "PRODUCTION_DATA"        // From ProductionFlowSnapshot
  | "TRANSFER_DATA"          // From InventoryTransfer records
  | "VENDOR_PORTFOLIO"       // From LiveVendor portfolio
  | "LOCATION_CATALOG"       // From InventoryLocation catalog
  | "CEO_RULE"               // From CEO-defined thresholds
  | "STORE_INVENTORY";       // From store inventory data

/** Impact assessment for a recommendation. */
export interface ReplenishmentImpact {
  /** How many vendors are affected. */
  vendorsAffected: number;
  /** How many stores are affected. */
  storesAffected: number;
  /** Whether this reference is commercially critical. */
  isCommerciallyCritical: boolean;
  /** Quantity that would be moved/affected. */
  quantityAffected: number;
  /** Impact description. */
  description: string;
}

/** Confidence assessment. */
export interface ReplenishmentConfidence {
  /** Score (0-100). */
  score: number;
  /** Human-readable reason. */
  reason: string;
  /** Number of data sources contributing. */
  sourceCount: number;
}

// ── Phase 4: Replacement ───────────────────────────────────────────────────

/** A replacement candidate for an out-of-stock reference. */
export interface ReplenishmentReplacement {
  /** Alternative reference code. */
  referenceCode: string;
  /** Description. */
  description: string | null;
  /** SubGrupo (must match). */
  subGrupo: string;
  /** SubLinea (must match). */
  subLinea: string;
  /** Stock in Bodega 01. */
  existenciaBodega01: number;
  /** Why this is a good replacement. */
  reason: string;
}

// ── Phase 6: Production Context ────────────────────────────────────────────

/** Production context attached to a replenishment recommendation. */
export interface ReplenishmentProductionContext {
  /** Whether there's active production for this reference. */
  hasActiveProduction: boolean;
  /** Production status. */
  productionStatus: string;
  /** Stage label (if in production). */
  stageLabel: string | null;
  /** Estimated readiness. */
  estimatedReadiness: string | null;
  /** Quantity in production. */
  quantityInProduction: number;
  /** Days in production. */
  daysInProduction: number | null;
  /** Production recommendation (from ProductionFlowRecommendation). */
  productionRecommendation: string | null;
}

// ── Phase 7: Transfer Context ──────────────────────────────────────────────

/** Transfer context attached to a replenishment recommendation. */
export interface ReplenishmentTransferContext {
  /** Recent transfers to this location. */
  recentInboundCount: number;
  /** Recent transfers from this location. */
  recentOutboundCount: number;
  /** Last inbound transfer date. */
  lastInboundAt: string | null;
  /** Days since last inbound transfer. */
  daysSinceLastInbound: number | null;
  /** Whether this is a frequently supplied location. */
  isFrequentlySupplied: boolean;
  /** Transfer frequency assessment. */
  frequencyAssessment: string;
}

// ── Phase 9: Signal Types ──────────────────────────────────────────────────

export type ReplenishmentSignalType =
  | "REPLENISHMENT_REQUIRED"
  | "PORTFOLIO_REPLACEMENT_REQUIRED"
  | "STORE_REPLENISHMENT_REQUIRED"
  | "WAIT_FOR_PRODUCTION"
  | "PRODUCTION_REQUIRED"
  | "TRANSFER_RECOMMENDED"
  | "ALTERNATIVE_REFERENCE_AVAILABLE";

// ── Phase 10: Decision Engine Integration ──────────────────────────────────

/** Decision input derived from a replenishment recommendation. */
export interface ReplenishmentDecisionInput {
  /** Decision type. */
  decisionType: ReplenishmentDecisionType;
  /** Reference code. */
  referenceCode: string;
  /** Target details. */
  target: ReplenishmentTarget;
  /** Recommended action. */
  recommendedAction: ReplenishmentAction;
  /** Urgency. */
  urgency: ReplenishmentUrgency;
  /** Confidence. */
  confidence: number;
  /** Options for the decision maker. */
  options: ReplenishmentDecisionOption[];
  /** This is a suggestion only. */
  suggestedOnly: true;
}

export type ReplenishmentDecisionType =
  | "replenish_or_wait"          // Stock low: replenish now or wait for production?
  | "replace_or_produce"         // Agotado: replace in maleta or produce more?
  | "transfer_or_hold"           // Surplus/deficit: transfer or keep?
  | "produce_or_skip";           // No production: start OP or skip?

export interface ReplenishmentDecisionOption {
  /** Option label. */
  label: string;
  /** Action if chosen. */
  action: ReplenishmentAction;
  /** Pros. */
  pros: string[];
  /** Cons. */
  cons: string[];
}

// ── Phase 13: Knowledge Graph Relations ────────────────────────────────────

export interface ReplenishmentKnowledgeRelation {
  fromType: "InventoryLocation" | "Product" | "Vendor" | "Store" | "ProductionFlow" | "Transfer";
  fromId: string;
  toType: "ReplenishmentNeed" | "ReplenishmentRecommendation" | "ReplenishmentDecision";
  toId: string;
  relationType: ReplenishmentKnowledgeRelationType;
}

export type ReplenishmentKnowledgeRelationType =
  | "needs_replenishment"           // InventoryLocation → ReplenishmentNeed
  | "has_recommendation"            // Product → ReplenishmentRecommendation
  | "affects_vendor"                // Vendor → ReplenishmentRecommendation
  | "affects_store"                 // Store → ReplenishmentRecommendation
  | "informed_by_production"        // ProductionFlow → ReplenishmentDecision
  | "informed_by_transfer";         // Transfer → ReplenishmentDecision

// ── Phase 11: Executive Output ─────────────────────────────────────────────

/** Executive-consumable replenishment report. */
export interface ReplenishmentExecutiveReport {
  /** Organization. */
  orgSlug: string;
  /** When computed. */
  computedAt: string;
  /** References to replenish (send from warehouse). */
  toReplenish: ReplenishmentRecommendation[];
  /** References to remove from portfolios. */
  toRemoveFromPortfolios: ReplenishmentRecommendation[];
  /** References with available replacements. */
  withReplacements: ReplenishmentRecommendation[];
  /** References to wait for production. */
  toWaitForProduction: ReplenishmentRecommendation[];
  /** References to send to production. */
  toProduction: ReplenishmentRecommendation[];
  /** Stores needing replenishment. */
  storesNeedingReplenishment: ReplenishmentRecommendation[];
  /** Recommended transfers. */
  recommendedTransfers: ReplenishmentRecommendation[];
  /** Summary. */
  summary: ReplenishmentSummary;
  /** Confidence. */
  confidence: ReplenishmentConfidence;
}

// ── Phase 12: David Readiness ──────────────────────────────────────────────

/** Structured answer for David (copilot) queries. */
export interface ReplenishmentDavidAnswer {
  /** Query type. */
  queryType: ReplenishmentDavidQueryType;
  /** Human-readable answer. */
  answer: string;
  /** Structured references. */
  references: ReplenishmentDavidReference[];
  /** Total matches. */
  totalMatches: number;
  /** Confidence. */
  confidence: number;
  /** Caveats. */
  caveats: string[];
}

export type ReplenishmentDavidQueryType =
  | "what_to_replenish_today"           // Que debo reponer hoy
  | "vendor_most_critical"              // Que vendedor tiene mas refs criticas
  | "remove_from_portfolios"            // Que refs deberian salir de maletas
  | "add_to_portfolios"                 // Que refs deberian entrar a maletas
  | "out_of_stock_with_production"      // Agotados con produccion
  | "out_of_stock_need_production";     // Agotados que debo producir

export interface ReplenishmentDavidReference {
  referenceCode: string;
  description: string;
  subGrupo: string;
  subLinea: string;
  action: string;
  detail: string;
  urgency: ReplenishmentUrgency;
}

// ── Summary ────────────────────────────────────────────────────────────────

/** High-level summary of replenishment state. */
export interface ReplenishmentSummary {
  /** Total recommendations generated. */
  totalRecommendations: number;
  /** By urgency. */
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  /** By action. */
  replenishCount: number;
  replaceCount: number;
  removeCount: number;
  waitProductionCount: number;
  suggestProductionCount: number;
  transferCount: number;
  monitorCount: number;
  /** By target type. */
  portfolioTargets: number;
  storeTargets: number;
  warehouseTargets: number;
  /** Vendors affected. */
  totalVendorsAffected: number;
  /** Unique references affected. */
  totalReferencesAffected: number;
}
