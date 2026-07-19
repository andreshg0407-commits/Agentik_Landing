/**
 * lib/comercial/rules/coverage/commercial-evidence-types.ts
 *
 * Canonical types for the Commercial Rules Evidence Engine.
 *
 * Every decision must be fully auditable. Evidence items are structured,
 * typed, and consumable by UI, Copilot, and future engines.
 *
 * Designed for reuse across all Agentik engines:
 *   - Commercial Coverage Rules Engine (now)
 *   - Production Rules Engine (future)
 *   - Repurchase Engine (future)
 *   - Transfer Engine (future)
 *   - Markdown Engine (future)
 *   - Commercial Copilot (future)
 *
 * Sprint: COMMERCIAL-RULES-EVIDENCE-01
 */

// ── Evidence type ───────────────────────────────────────────────────────────

export type EvidenceType =
  | "RULE"
  | "INVENTORY"
  | "STORE"
  | "PRODUCT"
  | "SOURCE"
  | "CALCULATION"
  | "STRATEGY"
  | "FALLBACK"
  | "WARNING"
  | "MISSING_DATA";

// ── Evidence source ─────────────────────────────────────────────────────────

export type EvidenceSource =
  | "SAG"
  | "COMMERCIAL_DATA_LAYER"
  | "STORE_POLICY"
  | "COVERAGE_STRATEGY"
  | "INVENTORY_SNAPSHOT"
  | "CALCULATED"
  | "MANUAL_OVERRIDE"
  | "SYSTEM_DEFAULT";

// ── Confidence factor ───────────────────────────────────────────────────────

export interface ConfidenceFactor {
  /** Factor description */
  label: string;
  /** Whether this factor is satisfied */
  satisfied: boolean;
  /** Impact on confidence (positive = increases, negative = decreases) */
  impact: number;
}

// ── Evidence item ───────────────────────────────────────────────────────────

export interface CommercialEvidenceItem {
  /** Type of evidence */
  type: EvidenceType;
  /** Source system that provided this evidence */
  source: EvidenceSource;
  /** Human-readable label */
  label: string;
  /** Structured data (type-safe per evidence type) */
  data: Record<string, unknown>;
  /** Whether this evidence was confirmed vs estimated */
  confirmed: boolean;
}

// ── Specialized evidence items ──────────────────────────────────────────────

// ── Rejection reasons ───────────────────────────────────────────────────────

export type RejectionReason =
  | "LOWER_PRIORITY"
  | "LESS_SPECIFIC"
  | "STORE_MISMATCH"
  | "STRATEGY_MISMATCH"
  | "LINE_MISMATCH"
  | "SUBGROUP_MISMATCH"
  | "SIZE_MISMATCH"
  | "INACTIVE"
  | "OUTSIDE_EFFECTIVE_DATE"
  | "DUPLICATE"
  | "INVALID_RULE";

export interface DiscardedRuleEvidence {
  ruleId: string;
  scope: string;
  priority: number;
  strategy: string;
  matched: boolean;
  rejectionReason: RejectionReason;
  specificityRank: number;
  storeSpecific: boolean;
  candidateValues: {
    min: number;
    ideal: number;
    max: number;
  };
}

// ── Rule evidence (extended) ────────────────────────────────────────────────

export interface RuleEvidence extends CommercialEvidenceItem {
  type: "RULE";
  source: "STORE_POLICY";
  data: {
    ruleId: string;
    scope: string;
    priority: number;
    strategy: string;
    storeId: string;
    minQty: number;
    idealQty: number;
    maxQty: number;
    candidateCount: number;
    hadConflict: boolean;
    selectionReason: string;
    discardedRules: DiscardedRuleEvidence[];
  };
}

export interface InventoryEvidence extends CommercialEvidenceItem {
  type: "INVENTORY";
  data: {
    currentUnits: number;
    reservedUnits: number;
    availableUnits: number;
    incomingUnits: number;
    sourceAvailableUnits: number | null;
  };
}

export interface StoreEvidence extends CommercialEvidenceItem {
  type: "STORE";
  data: {
    storeId: string;
    storeName: string;
  };
}

export interface ProductEvidence extends CommercialEvidenceItem {
  type: "PRODUCT";
  data: {
    referenceCode: string;
    productName: string;
    productClass: string;
    businessLine: string;
    subgroup: string | null;
    sizeClass: string | null;
    category: string | null;
    color: string | null;
  };
}

export interface StrategyEvidence extends CommercialEvidenceItem {
  type: "STRATEGY";
  source: "COVERAGE_STRATEGY";
  data: {
    businessLine: string;
    coverageStrategy: string;
    sizeClass: string | null;
    subgroup: string | null;
    resolvedFrom: string;
  };
}

export interface CalculationEvidence extends CommercialEvidenceItem {
  type: "CALCULATION";
  source: "CALCULATED";
  data: {
    currentCoverage: number;
    minQty: number | null;
    idealQty: number | null;
    maxQty: number | null;
    gapToMin: number;
    gapToIdeal: number;
    excessOverMax: number;
    rawSuggestedQty: number;
    finalSuggestedQty: number;
    sourceConstrained: boolean;
    unmetQty: number;
    state: string;
    action: string;
  };
}

export interface ConfidenceEvidence extends CommercialEvidenceItem {
  type: "SOURCE";
  source: "CALCULATED";
  data: {
    confidence: number;
    confidenceLevel: string;
    factors: ConfidenceFactor[];
  };
}

export interface MissingDataEvidence extends CommercialEvidenceItem {
  type: "MISSING_DATA";
  data: {
    missingFields: string[];
    impact: string;
  };
}

export interface FallbackEvidence extends CommercialEvidenceItem {
  type: "FALLBACK";
  data: {
    reason: string;
    fallbackApplied: string;
  };
}

export interface WarningEvidence extends CommercialEvidenceItem {
  type: "WARNING";
  data: {
    code: string;
    message: string;
  };
}

// ── Decision trace ──────────────────────────────────────────────────────────

export type DecisionStep =
  | "BUSINESS_LINE_RESOLVED"
  | "STRATEGY_RESOLVED"
  | "RULES_EVALUATED"
  | "RULE_SELECTED"
  | "INVENTORY_EVALUATED"
  | "SUGGESTION_CALCULATED"
  | "SOURCE_CONSTRAINT_APPLIED"
  | "RESULT_FINALIZED";

export type DecisionStepStatus = "OK" | "WARNING" | "DEGRADED" | "SKIPPED";

export interface DecisionTraceStep {
  step: DecisionStep;
  status: DecisionStepStatus;
  summary: string;
  data?: Record<string, unknown>;
  timestamp?: string;
}

// ── Full evidence bundle ────────────────────────────────────────────────────

export interface CommercialEvidence {
  /** All evidence items in order of evaluation */
  items: CommercialEvidenceItem[];
  /** Confidence factors extracted from evidence */
  confidenceFactors: ConfidenceFactor[];
  /** Missing data fields */
  missingData: string[];
  /** Decision trace (ordered steps) */
  decisionTrace: DecisionTraceStep[];
  /** ISO timestamp */
  collectedAt: string;
}
