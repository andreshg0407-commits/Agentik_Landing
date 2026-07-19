/**
 * lib/comercial/rules/coverage/commercial-coverage-types.ts
 *
 * Canonical types for the Commercial Coverage Rules Engine.
 * Pure types — no runtime logic, no imports beyond type refs.
 *
 * Sprint: COMMERCIAL-COVERAGE-RULES-ENGINE-01
 */

import type { CoverageStrategy } from "@/lib/comercial/tiendas/store-policy-types";
import type { StorePolicyRule, StoreSizeClass, StoreProductClass } from "@/lib/comercial/tiendas/store-policy-types";

// ── Strategy enum (extensible) ──────────────────────────────────────────────

export type CommercialCoverageStrategy = CoverageStrategy;

// Future extensions (not yet implemented):
// | "CATEGORY" | "BRAND" | "SEASON" | "CUSTOM"

// ── Coverage state ──────────────────────────────────────────────────────────

export type CoverageState =
  | "BELOW_MIN"
  | "BELOW_IDEAL"
  | "AT_IDEAL"
  | "ABOVE_IDEAL"
  | "ABOVE_MAX"
  | "NO_RULE"
  | "INSUFFICIENT_DATA";

// ── Suggestion action ───────────────────────────────────────────────────────

export type CoverageSuggestionAction =
  | "CRITICAL_REPLENISH"
  | "REPLENISH_TO_IDEAL"
  | "HOLD"
  | "REDUCE_OR_TRANSFER"
  | "NO_ACTION";

// ── Confidence ──────────────────────────────────────────────────────────────

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export type DataQualityLevel = "CONFIRMED" | "ESTIMATED" | "UNAVAILABLE";

// ── Input ───────────────────────────────────────────────────────────────────

export interface CommercialCoverageInput {
  tenantId: string;
  organizationId: string;
  storeId: string;
  storeName: string;

  productId?: string;
  referenceCode: string;
  productName: string;
  productClass: StoreProductClass;
  businessLine: string;

  subgroup?: string;
  sizeClass?: StoreSizeClass;
  category?: string;
  color?: string;

  currentUnits: number;
  reservedUnits?: number;
  availableUnits?: number;
  incomingUnits?: number;

  /** Available units at source warehouse for transfer */
  sourceAvailableUnits?: number;

  activeRules: StorePolicyRule[];

  metadata?: Record<string, unknown>;
}

// ── Rule match result ───────────────────────────────────────────────────────

export interface DiscardedRule {
  rule: StorePolicyRule;
  rejectionReason: import("./commercial-evidence-types").RejectionReason;
  specificityRank: number;
}

export interface CommercialCoverageRuleMatch {
  /** The winning rule */
  selectedRule: StorePolicyRule | null;
  /** All candidate rules that matched the input */
  candidateRules: StorePolicyRule[];
  /** Rules that were considered but rejected */
  discardedRules: DiscardedRule[];
  /** Why the selected rule won */
  selectionReason: string;
  /** Whether there was a conflict between rules */
  hadConflict: boolean;
  /** Match confidence (0-1) */
  matchConfidence: number;
}

// ── Evaluation ──────────────────────────────────────────────────────────────

export interface CommercialCoverageEvaluation {
  strategy: CommercialCoverageStrategy;
  state: CoverageState;
  ruleMatch: CommercialCoverageRuleMatch;

  /** Current coverage (available + incoming) */
  currentCoverage: number;
  /** Gap to min (0 if above min) */
  gapToMin: number;
  /** Gap to ideal (0 if above ideal) */
  gapToIdeal: number;
  /** Excess over max (0 if below max) */
  excessOverMax: number;

  /** Rule thresholds (null if no rule matched) */
  minQty: number | null;
  idealQty: number | null;
  maxQty: number | null;
}

// ── Suggestion ──────────────────────────────────────────────────────────────

export interface CommercialCoverageSuggestion {
  action: CoverageSuggestionAction;
  /** Raw suggested quantity (before source constraint) */
  rawSuggestedQty: number;
  /** Final suggested quantity (capped by source availability) */
  finalSuggestedQty: number;
  /** Unmet need after source constraint */
  unmetQty: number;
  /** Whether source had insufficient stock */
  sourceConstrained: boolean;
}

// ── Explanation ─────────────────────────────────────────────────────────────

export interface CommercialCoverageExplanation {
  /** Human-readable summary (1-2 sentences) */
  summary: string;
  /** Structured explanation components */
  details: {
    strategy: string;
    ruleName: string;
    currentUnits: number;
    minQty: number | null;
    idealQty: number | null;
    maxQty: number | null;
    suggestedQty: number;
    sourceAvailable: number | null;
    limitations: string[];
  };
}

// ── Data quality ────────────────────────────────────────────────────────────

export interface CommercialCoverageDataQuality {
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  inventoryQuality: DataQualityLevel;
  ruleQuality: DataQualityLevel;
  sizeClassQuality: DataQualityLevel;
  subgroupQuality: DataQualityLevel;
  factors: string[];
  unresolvedReason?: string;
}

// ── Full result ─────────────────────────────────────────────────────────────

export interface CommercialCoverageResult {
  input: CommercialCoverageInput;
  evaluation: CommercialCoverageEvaluation;
  suggestion: CommercialCoverageSuggestion;
  explanation: CommercialCoverageExplanation;
  dataQuality: CommercialCoverageDataQuality;
  /** Structured evidence items supporting this decision */
  evidence: import("./commercial-evidence-types").CommercialEvidence;
  /** ISO timestamp of evaluation */
  evaluatedAt: string;
}
