/**
 * production-flow-types.ts
 *
 * PRODUCTION-FLOW-INTELLIGENCE-01 — Phase 1 & 2: Domain Model + Document Mapping.
 *
 * Types for the Production Flow Intelligence layer.
 * Connects production data with commercial availability, LiveVendor,
 * and decision support.
 *
 * Extends existing production-types.ts — does NOT replace it.
 *
 * No React. No Prisma. No server-only. Pure domain types.
 */

import type { SagProductionDocType, ProductionStageInference } from "./production-types";

// ── Phase 1: Production Flow Domain Model ──────────────────────────────────

/** Complete production flow snapshot for all references. */
export interface ProductionFlowSnapshot {
  /** Organization slug. */
  orgSlug: string;
  /** When this snapshot was assembled. */
  computedAt: string;
  /** All reference flows. */
  referenceFlows: ProductionReferenceFlow[];
  /** Summary metrics. */
  summary: ProductionFlowSummary;
  /** Data confidence assessment. */
  confidence: ProductionFlowConfidence;
}

/** Production flow for a single reference. */
export interface ProductionReferenceFlow {
  /** SAG reference code. */
  referenceCode: string;
  /** Product description. */
  description: string;
  /** Product SubGrupo. */
  subGrupo: string;
  /** Commercial line (LATIN KIDS, CASTILLITOS, etc.). */
  subLinea: string;
  /** Active production orders for this reference. */
  activeOrders: ProductionOrderFlow[];
  /** Closed production orders (recent). */
  closedOrders: ProductionOrderFlow[];
  /** Total quantity currently in production (all open OPs). */
  quantityInProduction: number;
  /** Total quantity recently completed (closed OPs). */
  quantityRecentlyCompleted: number;
  /** Quantity detected in Bodega 04 (in-process warehouse). */
  quantityInBodega04: number;
  /** Production stage state (inferred from documents). */
  stageState: ProductionStageState;
  /** Commercial availability impact. */
  availabilityImpact: ProductionAvailabilityImpact;
  /** Delay risk assessment. */
  delayRisk: ProductionDelayRisk;
  /** Recovery signal (can this production resolve an agotado?). */
  recoverySignal: ProductionRecoverySignal | null;
  /** Structured recommendation. */
  recommendation: ProductionFlowRecommendation;
  /** Document evidence trail. */
  documentEvidence: ProductionDocumentEvidence[];
  /** Data confidence. */
  confidence: ProductionFlowConfidence;
}

/** Production flow for a single OP. */
export interface ProductionOrderFlow {
  /** OP document number. */
  opNumber: string;
  /** OP status. */
  status: "open" | "closed" | "unknown";
  /** OP activation date (ISO). */
  activationDate: string;
  /** Days since activation. */
  daysInProduction: number;
  /** Quantity ordered in this OP. */
  quantityOrdered: number;
  /** Is this OP closed? */
  isClosed: boolean;
  /** Stage inference for this OP. */
  stageInference: ProductionStageInference;
  /** Document evidence for this OP. */
  documents: ProductionDocumentEvidence[];
}

/** Current production stage state for a reference. */
export interface ProductionStageState {
  /** Current inferred stage (from production-stage-inference). */
  currentStage: ProductionStageInference;
  /** Has active OP? */
  hasActiveOP: boolean;
  /** Has CN (consumo de insumos)? */
  hasCN: boolean;
  /** Has external processing (PC/EC)? */
  hasExternalProcessing: boolean;
  /** Has service documents (T1/T2/Y1)? */
  hasServiceDocuments: boolean;
  /** Has ET (entrada producto terminado)? */
  hasET: boolean;
  /** Has recent ET (within 30 days)? */
  hasRecentET: boolean;
  /** Production status derived from stage. */
  productionStatus: ProductionFlowStatus;
}

export type ProductionFlowStatus =
  | "active"           // OP open, production in progress
  | "completing"       // ET found recently, production finishing
  | "completed"        // ET confirmed, product in Bodega 01
  | "stalled"          // No movement for extended period
  | "indeterminate"    // Insufficient evidence
  | "no_production";   // No OP found

// ── Phase 2: Production Document Mapping ───────────────────────────────────

/** Evidence from a specific production document. */
export interface ProductionDocumentEvidence {
  /** Document type (OP, CN, ET, etc.). */
  documentType: SagProductionDocType;
  /** Business meaning of this document. */
  businessMeaning: string;
  /** Which stage this document provides evidence for. */
  stageEvidence: string;
  /** How confident this evidence makes us (0-100). */
  confidenceWeight: number;
  /** Movement direction. */
  movementDirection: ProductionMovementDirection;
  /** Impact on inventory. */
  inventoryImpact: ProductionInventoryImpact;
  /** Impact on production tracking. */
  productionImpact: string;
  /** Document date (ISO). */
  documentDate: string;
  /** Quantity in document. */
  quantity: number;
  /** Whether the document is closed. */
  isClosed: boolean;
  /** OP number if applicable. */
  opNumber: string | null;
}

export type ProductionMovementDirection =
  | "in"        // Material entering production
  | "out"       // Material leaving production (to Bodega 01)
  | "internal"  // Internal production movement
  | "external"  // To/from external processor
  | "neutral";  // No movement (OP creation, status change)

export type ProductionInventoryImpact =
  | "increases_wip"      // Increases work-in-progress (CN, PC)
  | "decreases_wip"      // Decreases WIP, increases finished (ET)
  | "transforms_wip"     // Transforms WIP state (T1, T2, Y1)
  | "creates_order"      // Creates production order (OP)
  | "external_send"      // Sends to external processor (PC)
  | "external_receive"   // Receives from external processor (EC)
  | "none";              // No direct inventory impact

/** Formal document type mapping (Phase 2). */
export interface ProductionDocumentTypeMapping {
  /** SAG document type code. */
  documentType: SagProductionDocType;
  /** SAG fuente number. */
  fuente: number;
  /** Display label. */
  label: string;
  /** Business meaning. */
  businessMeaning: string;
  /** Which stage this provides evidence for. */
  stageEvidence: string;
  /** Base confidence weight (0-100). */
  confidenceWeight: number;
  /** Movement direction. */
  movementDirection: ProductionMovementDirection;
  /** Inventory impact. */
  inventoryImpact: ProductionInventoryImpact;
  /** Production tracking impact. */
  productionImpact: string;
}

// ── Phase 5 & 6: Availability Impact ───────────────────────────────────────

/** How production status affects commercial availability. */
export interface ProductionAvailabilityImpact {
  /** Current Bodega 01 stock for this reference. */
  existenciaBodega01: number | null;
  /** Pending orders against this reference. */
  pedidosPendientes: number | null;
  /** Disponible real. */
  disponibleReal: number | null;
  /** Commercial availability status. */
  availabilityStatus: ProductionAvailabilityStatus;
  /** Is this reference out of stock? */
  isOutOfStock: boolean;
  /** Is this reference critical (below CEO threshold)? */
  isCritical: boolean;
  /** CEO threshold that applies. */
  ceoThreshold: number | null;
  /** SubLinea rule that applies. */
  ceoRuleSubLinea: string | null;
  /** Affected vendors (from LiveVendor, if known). */
  affectedVendorIds: string[];
}

export type ProductionAvailabilityStatus =
  | "out_of_stock"        // Zero stock in Bodega 01
  | "critical"            // Below CEO threshold
  | "low"                 // Below comfortable level but above threshold
  | "adequate"            // Sufficient stock
  | "unknown";            // No availability data

// ── Phase 7: Delay Risk ────────────────────────────────────────────────────

/** Delay risk assessment for a reference in production. */
export interface ProductionDelayRisk {
  /** Risk level. */
  level: ProductionDelayRiskLevel;
  /** Days in production. */
  daysInProduction: number;
  /** Threshold that was exceeded (if any). */
  thresholdExceeded: number | null;
  /** Whether there's a stalled indicator. */
  isStalled: boolean;
  /** Whether stage is indeterminate. */
  isStageIndeterminate: boolean;
  /** Whether Bodega 04 has high qty without recent ET. */
  hasHighWipWithoutET: boolean;
  /** Evidence supporting this risk assessment. */
  evidence: string[];
  /** Confidence in this assessment. */
  confidence: number;
}

export type ProductionDelayRiskLevel =
  | "none"       // No risk detected
  | "low"        // Slightly above average but within bounds
  | "medium"     // Approaching delay thresholds
  | "high"       // Exceeds delay thresholds
  | "critical";  // Significantly overdue

// ── Phase 8: Recovery Signal ───────────────────────────────────────────────

/** Signal that production may soon resolve an out-of-stock. */
export interface ProductionRecoverySignal {
  /** Reference being recovered. */
  referenceCode: string;
  /** Expected recovery type. */
  recoveryType: ProductionRecoveryType;
  /** Quantity expected from production. */
  expectedQuantity: number;
  /** Estimated readiness. */
  estimatedReadiness: ProductionReadiness;
  /** Evidence supporting this signal. */
  evidence: string[];
  /** Confidence (0-100). */
  confidence: number;
}

export type ProductionRecoveryType =
  | "production_completing"   // ET found, product entering Bodega 01
  | "production_in_progress"  // Active OP, will complete eventually
  | "production_stalled";     // OP exists but stalled

export type ProductionReadiness =
  | "ready_soon"       // ET found or final stage — days away
  | "in_progress"      // Active production — weeks likely
  | "uncertain"        // OP exists but insufficient evidence
  | "unlikely";        // Production stalled or indeterminate

// ── Phase 8: Recommendation ───────────────────────────────────────────────

/** Structured recommendation for decision support. */
export interface ProductionFlowRecommendation {
  /** Primary action recommendation. */
  action: ProductionRecommendationAction;
  /** Human-readable description. */
  description: string;
  /** Urgency level. */
  urgency: "critical" | "high" | "medium" | "low" | "none";
  /** Replacement candidates from same SubGrupo (if applicable). */
  replacementCandidates: ProductionReplacementCandidate[];
  /** Confidence in this recommendation. */
  confidence: number;
  /** This is a suggestion only — NOT an executable action. */
  suggestedOnly: true;
}

export type ProductionRecommendationAction =
  | "wait_for_production"       // Production active, will resolve
  | "review_production"         // Production exists but may be delayed
  | "suggest_production"        // No production for this agotado
  | "suggest_replacement"       // Replace in maletas with alternative
  | "monitor"                   // Stock adequate, just monitor
  | "no_action_needed";         // Everything is fine

/** A replacement candidate for an out-of-stock reference. */
export interface ProductionReplacementCandidate {
  referenceCode: string;
  description: string | null;
  subGrupo: string;
  subLinea: string;
  existenciaBodega01: number;
  reason: string;
}

// ── Phase 9: Business Signal Types ─────────────────────────────────────────

export type ProductionFlowSignalType =
  | "PRODUCTION_IN_PROGRESS"
  | "PRODUCTION_DELAY_RISK"
  | "PRODUCTION_RECOVERY_AVAILABLE"
  | "PRODUCTION_MISSING_FOR_OUT_OF_STOCK"
  | "PRODUCTION_STAGE_UNKNOWN"
  | "PRODUCTION_READY_SOON";

// ── Phase 10: Knowledge Graph Relations ────────────────────────────────────

export interface ProductionKnowledgeRelation {
  fromType: "Product" | "ProductionOrder" | "InventoryLocation" | "ProductionFlow";
  fromId: string;
  toType: "Product" | "ProductionOrder" | "InventoryLocation" | "ProductionDocument" | "CommercialAvailability" | "LiveVendor";
  toId: string;
  relationType: ProductionKnowledgeRelationType;
}

export type ProductionKnowledgeRelationType =
  | "has_production_order"         // Product → ProductionOrder
  | "produces_in"                  // ProductionOrder → InventoryLocation (04)
  | "delivers_to"                  // ProductionOrder → InventoryLocation (01)
  | "evidenced_by"                 // ProductionOrder → ProductionDocument
  | "impacts_availability"         // ProductionFlow → CommercialAvailability
  | "affects_vendor"               // ProductionFlow → LiveVendor
  | "produced_by";                 // Product → ProductionOrder (reverse)

// ── Summary ────────────────────────────────────────────────────────────────

/** High-level summary of production flow state. */
export interface ProductionFlowSummary {
  /** Total references with any production activity. */
  totalReferencesInProduction: number;
  /** References with active (open) OPs. */
  activeProductionCount: number;
  /** References recently completed (ET found). */
  recentlyCompletedCount: number;
  /** References with stalled production. */
  stalledCount: number;
  /** References with indeterminate stage. */
  indeterminateCount: number;
  /** Out-of-stock references WITH active production. */
  outOfStockWithProduction: number;
  /** Out-of-stock references WITHOUT any production. */
  outOfStockWithoutProduction: number;
  /** References at delay risk. */
  delayRiskCount: number;
  /** References with recovery signal (production completing soon). */
  recoverySoonCount: number;
  /** Average days in production (active OPs only). */
  avgDaysInProduction: number;
  /** Breakdown by SubLinea. */
  bySubLinea: ProductionFlowSubLineaSummary[];
}

export interface ProductionFlowSubLineaSummary {
  subLinea: string;
  totalReferences: number;
  activeCount: number;
  completedCount: number;
  stalledCount: number;
  outOfStockWithProduction: number;
  outOfStockWithoutProduction: number;
  delayRiskCount: number;
}

// ── Confidence ─────────────────────────────────────────────────────────────

/** Confidence assessment for production flow data. */
export interface ProductionFlowConfidence {
  /** Overall confidence score (0-100). */
  score: number;
  /** Human-readable reason. */
  reason: string;
  /** Number of data sources contributing. */
  sourceCount: number;
  /** Whether production data is available. */
  hasProductionData: boolean;
  /** Whether availability data is available. */
  hasAvailabilityData: boolean;
  /** Whether transfer data is available. */
  hasTransferData: boolean;
}

// ── Phase 11: Executive Report Output ──────────────────────────────────────

/** Executive-consumable production flow report. */
export interface ProductionFlowExecutiveReport {
  /** Organization. */
  orgSlug: string;
  /** When computed. */
  computedAt: string;
  /** Production in progress by line. */
  productionByLine: ProductionFlowSubLineaSummary[];
  /** Out-of-stock references with active production. */
  outOfStockWithProduction: ProductionReferenceFlow[];
  /** Out-of-stock references without production. */
  outOfStockWithoutProduction: ProductionReferenceFlow[];
  /** Production at delay risk. */
  delayRiskReferences: ProductionReferenceFlow[];
  /** Production nearing completion (recovery). */
  recoverySoonReferences: ProductionReferenceFlow[];
  /** Summary metrics. */
  summary: ProductionFlowSummary;
  /** Confidence. */
  confidence: ProductionFlowConfidence;
}

// ── Phase 12: David Readiness ──────────────────────────────────────────────

/** Structured answer for David (copilot) queries. */
export interface ProductionFlowDavidAnswer {
  /** Query type that was answered. */
  queryType: ProductionFlowDavidQueryType;
  /** Human-readable answer. */
  answer: string;
  /** Structured data supporting the answer. */
  references: ProductionFlowDavidReference[];
  /** Total matches. */
  totalMatches: number;
  /** Confidence in this answer. */
  confidence: number;
  /** Data limitations. */
  caveats: string[];
}

export type ProductionFlowDavidQueryType =
  | "out_of_stock_in_production"    // Agotados ya en produccion
  | "out_of_stock_need_production"  // Agotados que necesitan produccion
  | "nearing_completion"            // Proximas a terminar
  | "delayed_production"            // Produccion retrasada
  | "replacement_candidates";       // Reemplazos para agotados

export interface ProductionFlowDavidReference {
  referenceCode: string;
  description: string;
  subGrupo: string;
  subLinea: string;
  status: string;
  detail: string;
}

// ── Delay Risk Configuration ───────────────────────────────────────────────

/** Configurable delay risk thresholds. */
export interface ProductionDelayConfig {
  /** Days in production to trigger medium risk. */
  mediumRiskDays: number;
  /** Days in production to trigger high risk. */
  highRiskDays: number;
  /** Days in production to trigger critical risk. */
  criticalRiskDays: number;
  /** Days without movement to consider stalled. */
  stalledDays: number;
  /** WIP quantity threshold for "high WIP without ET" flag. */
  highWipThreshold: number;
}

/** Default delay risk configuration for Castillitos. */
export const DEFAULT_DELAY_CONFIG: ProductionDelayConfig = {
  mediumRiskDays: 30,
  highRiskDays: 45,
  criticalRiskDays: 90,
  stalledDays: 30,
  highWipThreshold: 50,
};
