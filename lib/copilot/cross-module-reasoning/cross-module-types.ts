/**
 * lib/copilot/cross-module-reasoning/cross-module-types.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Cross-Module Reasoning — Core Domain Types
 *
 * All types serializable. No server-only. No DB. No AI.
 */

// ── ID generation ─────────────────────────────────────────────────────────────

let _cmrCounter = 0;

export function generateCmrId(prefix: string): string {
  _cmrCounter++;
  return `cmr_${prefix}_${Date.now().toString(36)}_${_cmrCounter}`;
}

// ── Source Domains ────────────────────────────────────────────────────────────

export type ReasoningSourceDomain =
  | "FINANCE"
  | "COMMERCIAL"
  | "COLLECTIONS"
  | "MARKETING"
  | "EXECUTIVE"
  | "PLAYBOOKS"
  | "MEMORY"
  | "GRAPH";

export const REASONING_SOURCE_DOMAINS: ReasoningSourceDomain[] = [
  "FINANCE", "COMMERCIAL", "COLLECTIONS", "MARKETING",
  "EXECUTIVE", "PLAYBOOKS", "MEMORY", "GRAPH",
];

// ── Confidence ────────────────────────────────────────────────────────────────

export type ReasoningConfidence = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

export const REASONING_CONFIDENCE_LEVELS: ReasoningConfidence[] = [
  "LOW", "MEDIUM", "HIGH", "VERY_HIGH",
];

export interface ReasoningConfidenceScore {
  level:            ReasoningConfidence;
  score:            number;    // 0–1
  evidenceCount:    number;
  qualityScore:     number;    // 0–1
  consistencyScore: number;    // 0–1
  correlationScore: number;    // 0–1
  explanation:      string;
}

export const REASONING_DEFAULT_CONFIDENCE: ReasoningConfidenceScore = {
  level:            "LOW",
  score:            0.1,
  evidenceCount:    0,
  qualityScore:     0.0,
  consistencyScore: 0.0,
  correlationScore: 0.0,
  explanation:      "Insufficient evidence to assess confidence.",
};

// ── Signal ────────────────────────────────────────────────────────────────────

export type ReasoningSignalType =
  | "METRIC_DROP"
  | "METRIC_RISE"
  | "ANOMALY"
  | "ALERT"
  | "TREND"
  | "PATTERN"
  | "EVENT"
  | "THRESHOLD_BREACH"
  | "BEHAVIORAL_SHIFT"
  | "CORRELATION";

export const REASONING_SIGNAL_TYPES: ReasoningSignalType[] = [
  "METRIC_DROP", "METRIC_RISE", "ANOMALY", "ALERT", "TREND",
  "PATTERN", "EVENT", "THRESHOLD_BREACH", "BEHAVIORAL_SHIFT", "CORRELATION",
];

export interface ReasoningSignal {
  id:          string;
  orgSlug:     string;
  type:        ReasoningSignalType;
  domain:      ReasoningSourceDomain;
  label:       string;
  description: string;
  value?:      number;
  unit?:       string;
  direction?:  "UP" | "DOWN" | "STABLE" | "VOLATILE";
  severity:    "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  confidence:  number;   // 0–1
  source:      string;
  metadata:    Record<string, unknown>;
  detectedAt:  string;   // ISO 8601
}

// ── Evidence ──────────────────────────────────────────────────────────────────

export type ReasoningEvidenceType =
  | "SIGNAL"
  | "METRIC"
  | "HISTORICAL_PATTERN"
  | "GRAPH_RELATIONSHIP"
  | "MEMORY_ENTRY"
  | "PLAYBOOK_TRIGGER"
  | "EXECUTIVE_INSIGHT"
  | "CORRELATION";

export const REASONING_EVIDENCE_TYPES: ReasoningEvidenceType[] = [
  "SIGNAL", "METRIC", "HISTORICAL_PATTERN", "GRAPH_RELATIONSHIP",
  "MEMORY_ENTRY", "PLAYBOOK_TRIGGER", "EXECUTIVE_INSIGHT", "CORRELATION",
];

export interface ReasoningEvidence {
  id:          string;
  orgSlug:     string;
  type:        ReasoningEvidenceType;
  domain:      ReasoningSourceDomain;
  label:       string;
  description: string;
  strength:    number;   // 0–1
  reliability: number;   // 0–1
  sourceRef:   string;   // reference to originating entity
  sourceType:  string;   // "signal" | "graph_node" | "memory" etc.
  metadata:    Record<string, unknown>;
  collectedAt: string;   // ISO 8601
}

// ── Hypothesis ────────────────────────────────────────────────────────────────

export type HypothesisCategory =
  | "CASH_FLOW"
  | "SALES"
  | "COLLECTIONS"
  | "OPERATIONS"
  | "MARKETING"
  | "STRATEGIC"
  | "RISK"
  | "OPPORTUNITY";

export const HYPOTHESIS_CATEGORIES: HypothesisCategory[] = [
  "CASH_FLOW", "SALES", "COLLECTIONS", "OPERATIONS",
  "MARKETING", "STRATEGIC", "RISK", "OPPORTUNITY",
];

export interface ReasoningHypothesis {
  id:           string;
  orgSlug:      string;
  category:     HypothesisCategory;
  title:        string;
  explanation:  string;
  evidenceIds:  string[];
  confidence:   ReasoningConfidenceScore;
  supported:    boolean;
  contradicted: boolean;
  metadata:     Record<string, unknown>;
  generatedAt:  string;  // ISO 8601
}

// ── Risk ──────────────────────────────────────────────────────────────────────

export type RiskDomain =
  | "FINANCIAL"
  | "COMMERCIAL"
  | "COLLECTIONS"
  | "OPERATIONAL"
  | "STRATEGIC";

export type RiskSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export const RISK_DOMAINS: RiskDomain[] = [
  "FINANCIAL", "COMMERCIAL", "COLLECTIONS", "OPERATIONAL", "STRATEGIC",
];

export interface ReasoningRisk {
  id:          string;
  orgSlug:     string;
  domain:      RiskDomain;
  title:       string;
  description: string;
  severity:    RiskSeverity;
  likelihood:  number;   // 0–1
  impact:      number;   // 0–1
  evidenceIds: string[];
  metadata:    Record<string, unknown>;
  detectedAt:  string;
}

// ── Opportunity ───────────────────────────────────────────────────────────────

export type OpportunityType =
  | "GROWTH"
  | "UPSELL"
  | "CROSS_SELL"
  | "RECOVERY"
  | "EFFICIENCY"
  | "AUTOMATION";

export const OPPORTUNITY_TYPES: OpportunityType[] = [
  "GROWTH", "UPSELL", "CROSS_SELL", "RECOVERY", "EFFICIENCY", "AUTOMATION",
];

export interface ReasoningOpportunity {
  id:          string;
  orgSlug:     string;
  type:        OpportunityType;
  title:       string;
  description: string;
  potential:   number;   // 0–1
  urgency:     "LOW" | "MEDIUM" | "HIGH";
  evidenceIds: string[];
  metadata:    Record<string, unknown>;
  detectedAt:  string;
}

// ── Recommendation ────────────────────────────────────────────────────────────

export type RecommendationType =
  | "ACTION"
  | "INVESTIGATION"
  | "MONITORING"
  | "PREVENTION"
  | "CORRECTION";

export type RecommendationPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface ReasoningRecommendation {
  id:            string;
  orgSlug:       string;
  type:          RecommendationType;
  priority:      RecommendationPriority;
  title:         string;
  description:   string;
  rationale:     string;
  hypothesisId?: string;
  evidenceIds:   string[];
  metadata:      Record<string, unknown>;
  generatedAt:   string;
}

// ── Conclusion ────────────────────────────────────────────────────────────────

export interface ReasoningConclusion {
  id:                string;
  orgSlug:           string;
  summary:           string;
  explanation:       string;
  confidence:        ReasoningConfidenceScore;
  hypothesisIds:     string[];
  evidenceIds:       string[];
  riskIds:           string[];
  opportunityIds:    string[];
  recommendationIds: string[];
  generatedAt:       string;
}

// ── Path ──────────────────────────────────────────────────────────────────────

export interface ReasoningPath {
  signalId:     string;
  evidenceIds:  string[];
  hypothesisId: string;
  conclusionId: string;
  confidence:   ReasoningConfidenceScore;
}

// ── Chain ─────────────────────────────────────────────────────────────────────

export interface ReasoningChain {
  id:              string;
  orgSlug:         string;
  paths:           ReasoningPath[];
  signals:         ReasoningSignal[];
  evidence:        ReasoningEvidence[];
  hypotheses:      ReasoningHypothesis[];
  conclusions:     ReasoningConclusion[];
  recommendations: ReasoningRecommendation[];
  risks:           ReasoningRisk[];
  opportunities:   ReasoningOpportunity[];
  builtAt:         string;
}

// ── Context ───────────────────────────────────────────────────────────────────

export interface ReasoningContext {
  orgSlug:       string;
  domains:       ReasoningSourceDomain[];
  signals:       ReasoningSignal[];
  triggerSignal?: ReasoningSignal;
  tenantProfile?: Record<string, unknown>;
  graphContext?:  Record<string, unknown>;
  memoryContext?: Record<string, unknown>;
  requestedAt:   string;
}

// ── Result ────────────────────────────────────────────────────────────────────

export type ReasoningStatus =
  | "SUCCESS"
  | "PARTIAL"
  | "INSUFFICIENT_EVIDENCE"
  | "ERROR";

export interface ReasoningResult {
  id:                  string;
  orgSlug:             string;
  status:              ReasoningStatus;
  chain:               ReasoningChain;
  narrative:           string;
  confidence:          ReasoningConfidenceScore;
  durationMs:          number;
  signalCount:         number;
  evidenceCount:       number;
  hypothesisCount:     number;
  riskCount:           number;
  opportunityCount:    number;
  recommendationCount: number;
  completedAt:         string;
}

// ── Correlation ───────────────────────────────────────────────────────────────

export interface CorrelationRecord {
  id:            string;
  orgSlug:       string;
  signalIdA:     string;
  signalIdB:     string;
  strength:      number;    // 0–1
  relationship:  "DIRECT" | "INVERSE" | "CONCURRENT" | "SEQUENTIAL";
  explanation:   string;
  confidence:    number;    // 0–1
  detectedAt:    string;
}

// ── Contradiction ─────────────────────────────────────────────────────────────

export type ContradictionSeverity = "MINOR" | "MODERATE" | "SEVERE";

export interface ContradictionRecord {
  id:          string;
  orgSlug:     string;
  entityA:     string;      // hypothesis or signal ID
  entityB:     string;
  entityType:  "HYPOTHESIS" | "SIGNAL" | "EVIDENCE";
  severity:    ContradictionSeverity;
  explanation: string;
  resolution:  "UNRESOLVED" | "RESOLVED_BY_WEIGHT" | "RESOLVED_BY_SOURCE";
  detectedAt:  string;
}

// ── Causal Preparation ────────────────────────────────────────────────────────

export interface CausalCandidate {
  causeSignalId:  string;
  effectSignalId: string;
  candidateScore: number;  // 0–1
  reasoning:      string;
  orgSlug:        string;
}

export interface CausalRelationship {
  id:           string;
  orgSlug:      string;
  causeId:      string;
  effectId:     string;
  strength:     number;   // 0–1
  mechanism:    string;
  confidence:   number;   // 0–1
  status:       "CANDIDATE" | "CONFIRMED" | "REJECTED";
}

export interface CausalReasoningResult {
  orgSlug:       string;
  candidates:    CausalCandidate[];
  relationships: CausalRelationship[];
  status:        "PREPARED";
  nextSprint:    string;
}

// ── Executive Scenario ────────────────────────────────────────────────────────

export type ExecutiveScenarioType =
  | "CASH_DROP"
  | "AR_INCREASE"
  | "CAMPAIGN_DROP"
  | "ORDER_DECREASE"
  | "CUSTOMER_LOSS"
  | "SALES_INCREASE"
  | "COMMERCIAL_RECOVERY"
  | "FINANCIAL_ANOMALY"
  | "OPERATIONAL_ALERT"
  | "STRATEGIC_RISK";

export interface ExecutiveScenario {
  id:          string;
  orgSlug:     string;
  type:        ExecutiveScenarioType;
  title:       string;
  description: string;
  signals:     ReasoningSignal[];
  result?:     ReasoningResult;
  createdAt:   string;
}
