/**
 * lib/copilot/intelligence/reasoning/reasoning-types.ts
 *
 * AGENTIK-COPILOT-INTELLIGENCE-02
 * Reasoning Engine — Core Domain Types
 *
 * No Prisma. No React. No Next. No server-only.
 * All types are JSON-serializable.
 * All conclusions must carry evidence IDs for full traceability.
 */

// ── Confidence ─────────────────────────────────────────────────────────────────

/**
 * Qualitative confidence level for a reasoning artifact.
 * HIGH   → 75–100 — strong evidence, low contradiction
 * MEDIUM → 40–74  — moderate evidence, some gaps
 * LOW    → 0–39   — weak evidence, contradictions present, or insufficient data
 */
export type ReasoningConfidence = "LOW" | "MEDIUM" | "HIGH";

export const REASONING_CONFIDENCE_THRESHOLDS = {
  HIGH:   75,
  MEDIUM: 40,
  LOW:    0,
} as const;

/** Convert a numeric score 0–100 to a qualitative confidence level. */
export function scoreToConfidence(score: number): ReasoningConfidence {
  if (score >= REASONING_CONFIDENCE_THRESHOLDS.HIGH)   return "HIGH";
  if (score >= REASONING_CONFIDENCE_THRESHOLDS.MEDIUM) return "MEDIUM";
  return "LOW";
}

// ── Categories ─────────────────────────────────────────────────────────────────

/**
 * Business domain category for a reasoning artifact.
 * MULTI_DOMAIN → spans 2+ distinct business domains simultaneously.
 */
export type ReasoningCategory =
  | "FINANCIAL"
  | "COMMERCIAL"
  | "MARKETING"
  | "COLLECTIONS"
  | "OPERATIONS"
  | "EXECUTIVE"
  | "MULTI_DOMAIN";

export const REASONING_CATEGORIES: ReasoningCategory[] = [
  "FINANCIAL",
  "COMMERCIAL",
  "MARKETING",
  "COLLECTIONS",
  "OPERATIONS",
  "EXECUTIVE",
  "MULTI_DOMAIN",
];

// ── Executive Impact ───────────────────────────────────────────────────────────

/**
 * Executive-level impact classification for an insight or conclusion.
 * CRITICAL → requires immediate C-level attention or blocks operations
 * HIGH     → should be addressed today
 * MEDIUM   → important but not urgent
 * LOW      → informational
 */
export type ExecutiveImpactLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export const EXECUTIVE_IMPACT_RANK: Record<ExecutiveImpactLevel, number> = {
  LOW:      1,
  MEDIUM:   2,
  HIGH:     3,
  CRITICAL: 4,
};

// ── Insight Type ───────────────────────────────────────────────────────────────

/**
 * Type of derived insight.
 * RISK        → something threatening current performance
 * OPPORTUNITY → potential improvement or untapped advantage
 * TREND       → directional movement in a metric over time
 * ANOMALY     → unexpected deviation from baseline
 * CORRELATION → two signals moving together (may or may not be causal)
 * CAUSAL      → evidence suggests A is causing B
 */
export type InsightType =
  | "RISK"
  | "OPPORTUNITY"
  | "TREND"
  | "ANOMALY"
  | "CORRELATION"
  | "CAUSAL";

// ── Hypothesis Status ──────────────────────────────────────────────────────────

/**
 * Lifecycle status of a hypothesis.
 * CANDIDATE  → generated, not yet evaluated
 * SUPPORTED  → evidence supports it
 * WEAKENED   → evidence partially supports but contradictions exist
 * REFUTED    → evidence contradicts it
 */
export type HypothesisStatus = "CANDIDATE" | "SUPPORTED" | "WEAKENED" | "REFUTED";

// ── Contradiction Severity ─────────────────────────────────────────────────────

export type ContradictionSeverity = "MINOR" | "MODERATE" | "SEVERE";

// ── Signal Direction ───────────────────────────────────────────────────────────

export type SignalDirection = "UP" | "DOWN" | "STABLE" | "UNKNOWN";

// ── Core Types ─────────────────────────────────────────────────────────────────

/**
 * ReasoningSignal — raw input to the reasoning engine.
 * Source data from a domain (finance, commercial, marketing, etc.)
 * that has been normalized to a signal format.
 */
export interface ReasoningSignal {
  id:         string;
  orgSlug:    string;
  source:     string;             // e.g. "finance:treasury", "commercial:sales"
  category:   ReasoningCategory;
  metric:     string;             // e.g. "sales_volume", "campaign_reach"
  value:      unknown;            // raw value — intentionally unknown to stay generic
  direction:  SignalDirection;
  confidence: ReasoningConfidence;
  timestamp:  string;             // ISO 8601
  tags:       string[];
}

/**
 * ReasoningEvidence — normalized evidence built from one or more signals.
 * Every piece of evidence must be traceable to its source signals.
 * Evidence is the atomic unit of traceability.
 */
export interface ReasoningEvidence {
  id:              string;
  orgSlug:         string;
  source:          string;
  category:        ReasoningCategory;
  confidence:      ReasoningConfidence;
  confidenceScore: number;        // 0–100
  summary:         string;
  timestamp:       string;        // ISO 8601
  data:            Record<string, unknown>;
  signalIds:       string[];      // REQUIRED: traceability back to signals
  isSupporting:    boolean;       // true = supports hypothesis, false = contradicts
}

/**
 * ReasoningHypothesis — a testable business hypothesis generated from evidence.
 * Every hypothesis is deterministic — no AI, no guessing.
 * Built from pattern matching on evidence combinations.
 */
export interface ReasoningHypothesis {
  id:                       string;
  orgSlug:                  string;
  title:                    string;
  description:              string;
  category:                 ReasoningCategory;
  status:                   HypothesisStatus;
  supportingEvidenceIds:    string[];
  contradictingEvidenceIds: string[];
  confidenceScore:          number;        // 0–100
  confidence:               ReasoningConfidence;
  generatedAt:              string;        // ISO 8601
  domains:                  ReasoningCategory[];
  patternKey:               string;        // which pattern rule triggered this
}

/**
 * ReasoningInsight — an actionable finding derived from one or more hypotheses.
 * Must carry evidence IDs and hypothesis IDs for full traceability.
 * If insight has no evidenceIds, it should not be emitted.
 */
export interface ReasoningInsight {
  id:              string;
  orgSlug:         string;
  type:            InsightType;
  category:        ReasoningCategory;
  title:           string;
  summary:         string;
  explanation:     string;         // why this insight was generated — REQUIRED
  hypothesisIds:   string[];       // REQUIRED: must trace to hypotheses
  evidenceIds:     string[];       // REQUIRED: must trace to evidence
  confidence:      ReasoningConfidence;
  confidenceScore: number;         // 0–100
  executiveImpact: ExecutiveImpactLevel;
  actionable:      boolean;
  generatedAt:     string;         // ISO 8601
  domains:         ReasoningCategory[];
}

/**
 * ContradictionRecord — documents a conflict between two pieces of evidence.
 */
export interface ContradictionRecord {
  id:          string;
  evidenceAId: string;
  evidenceBId: string;
  severity:    ContradictionSeverity;
  description: string;
  resolution:  "UNRESOLVED" | "EVIDENCE_A_WINS" | "EVIDENCE_B_WINS" | "BOTH_VALID";
  detectedAt:  string;
}

/**
 * ReasoningConclusion — the final output of a reasoning pipeline run.
 * Contains all insights, hypotheses, evidence, and contradictions.
 * The top-level artifact for downstream consumption.
 */
export interface ReasoningConclusion {
  id:                     string;
  orgSlug:                string;
  queryId:                string;
  title:                  string;
  summary:                string;
  insights:               ReasoningInsight[];
  hypotheses:             ReasoningHypothesis[];
  evidence:               ReasoningEvidence[];
  overallConfidence:      ReasoningConfidence;
  overallConfidenceScore: number;
  executiveImpact:        ExecutiveImpactLevel;
  domains:                ReasoningCategory[];
  contradictions:         ContradictionRecord[];
  generatedAt:            string;
  durationMs:             number;
}

/**
 * ReasoningError — fail-closed error record.
 * Never throws — always returns a structured error.
 */
export interface ReasoningError {
  code:      string;
  message:   string;
  phase:     string;         // which phase of the pipeline failed
  recoverable: boolean;
}

/**
 * ReasoningResult<T> — typed result container.
 * ok: true  → value available
 * ok: false → error recorded, pipeline continues (fail-closed)
 */
export type ReasoningResult<T> =
  | { ok: true;  value: T }
  | { ok: false; error: ReasoningError };

// ── Empty / default builders ───────────────────────────────────────────────────

export function emptyConclusion(orgSlug: string, queryId: string): ReasoningConclusion {
  return {
    id:                     `rc_empty_${Date.now()}`,
    orgSlug,
    queryId,
    title:                  "Sin conclusión disponible",
    summary:                "Datos insuficientes para generar una conclusión.",
    insights:               [],
    hypotheses:             [],
    evidence:               [],
    overallConfidence:      "LOW",
    overallConfidenceScore: 0,
    executiveImpact:        "LOW",
    domains:                [],
    contradictions:         [],
    generatedAt:            new Date().toISOString(),
    durationMs:             0,
  };
}

export function reasoningError(
  code: string,
  message: string,
  phase: string,
  recoverable = true,
): ReasoningError {
  return { code, message, phase, recoverable };
}
