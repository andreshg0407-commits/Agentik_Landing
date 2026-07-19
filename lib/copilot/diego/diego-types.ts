/**
 * lib/copilot/diego/diego-types.ts
 *
 * Diego CFO Copilot — Core type contracts.
 *
 * Diego is a rule-based financial interpreter, not a chat assistant.
 * All output comes from real data: Financial Graph, Banking Runtime,
 * Source Confidence Engine, Reconciliation, Close Score.
 *
 * Sprint: AGENTIK-DIEGO-COPILOT-01
 */

// ── Signal types ───────────────────────────────────────────────────────────────

export type DiegoSignalType =
  | "liquidity_risk"
  | "reconciliation_attention"
  | "unresolved_financial_relations"
  | "bank_sync_problem"
  | "collection_pressure"
  | "close_blocker"
  | "confidence_warning"
  | "integrity_issue"
  | "operational_focus"
  | "treasury_alert";

export type DiegoSeverity = "critical" | "high" | "medium" | "low";

export type DiegoDataState = "REAL" | "PARTIAL" | "STALE" | "MISSING" | "BROKEN";

// ── Signal shape ───────────────────────────────────────────────────────────────

/**
 * A Diego signal represents a real, traceable financial condition.
 * NO invented signals. NO speculative language. NO GPT-style framing.
 */
export interface DiegoSignal {
  id:            string;
  type:          DiegoSignalType;
  severity:      DiegoSeverity;
  /** Enterprise-terse title. Max 80 chars. */
  title:         string;
  /** Operational body. Max 160 chars. Includes counts/amounts where available. */
  body:          string;
  /** Prisma model or runtime source that produced this signal. */
  source:        string;
  /** 0–1. Based on data completeness and freshness. */
  confidence:    number;
  dataState:     DiegoDataState;
  affectedAreas: string[];
  /** true when confidence > 0.6 and state is not MISSING. */
  traceable:     boolean;
  generatedAt:   Date;
}

// ── Priority item ─────────────────────────────────────────────────────────────

export interface DiegoPriorityItem {
  /** 1 = highest urgency. */
  priority:          number;
  category:          DiegoSignalType | "confidence_warning" | "bank_sync_problem";
  reason:            string;
  severity:          DiegoSeverity;
  recommendedAction: string;
  traceable:         boolean;
}

// ── Executive summary ─────────────────────────────────────────────────────────

/**
 * Full executive summary — server-side only.
 * Use serializeDiegoSummary() before passing to client components.
 */
export interface DiegoExecutiveSummary {
  orgId:               string;
  generatedAt:         Date;
  /** Single operational sentence. No greetings. No filler. */
  executiveHeadline:   string;
  /** Key operational facts as compact string. */
  operationalSummary:  string;
  /** Financial graph integrity state. */
  integritySummary:    string;
  /** Data confidence status. */
  confidenceSummary:   string;
  /** Top recommended action. */
  recommendedFocus:    string;
  /** Active blockers (max 3). */
  blockingIssues:      string[];
  signals:             DiegoSignal[];
  priorities:          DiegoPriorityItem[];
  graphIssueCount:     number;
  cashConfidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  unresolvedCount:     number;
  bankSyncStatus:      string;
  dataState:           DiegoDataState;
  /** Evidence trace from Financial Intelligence Layer — FASE 5. */
  evidenceTrace:       DiegoEvidenceTraceSerial[];
  /** Overall confidence 0–100 from adapter. */
  overallConfidencePct: number;
  /** Causal summary from relationship graph — FASE 6. */
  causalSummary?:       string;
  /** Temporal evolution state — FASE 6 temporal intelligence. */
  temporalState?:       string;
  /** Human-readable temporal summary — Diego deterministic language. */
  temporalSummary?:     string;
  /** Strongest financial trend in the 7d window. */
  strongestTrendMetric?: string;
  strongestTrendDelta?:  number;
  strongestTrendDir?:    string;
  /** Most repeated pattern type. */
  recurringPatternType?: string;
  recurringPatternFreq?: number;
}

/**
 * Minimal evidence trace for client-side rendering.
 * Format: REAL · 92% · actualizado hace 12m
 */
export interface DiegoEvidenceTraceSerial {
  source:     string;
  state:      DiegoDataState;
  confidence: number;   // 0–1
  syncAt:     string | null;
  count:      number;
}

/**
 * Serializable subset for client component props.
 * Dates stripped. Signal objects not included (too heavy).
 */
export interface DiegoSummarySerial {
  executiveHeadline:   string;
  operationalSummary:  string;
  integritySummary:    string;
  confidenceSummary:   string;
  recommendedFocus:    string;
  blockingIssues:      string[];
  topPriorities:       Array<{
    reason:            string;
    severity:          DiegoSeverity;
    recommendedAction: string;
  }>;
  graphIssueCount:     number;
  cashConfidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  unresolvedCount:     number;
  bankSyncStatus:      string;
  dataState:           DiegoDataState;
  signalCount:         number;
  /** Evidence traceability — FASE 5. May be empty if adapter unavailable. */
  evidenceTrace:       DiegoEvidenceTraceSerial[];
  /** Overall adapter confidence 0–100. */
  overallConfidencePct: number;
  /** Causal summary from relationship graph — FASE 6. */
  causalSummary?:       string;
  /** Temporal evolution state — FASE 6 temporal intelligence. */
  temporalState?:       string;
  /** Human-readable temporal summary — Diego deterministic language. */
  temporalSummary?:     string;
  /** Strongest financial trend metric name. */
  strongestTrendMetric?: string;
  strongestTrendDelta?:  number;
  strongestTrendDir?:    string;
  /** Most repeated pattern. */
  recurringPatternType?: string;
  recurringPatternFreq?: number;
}
