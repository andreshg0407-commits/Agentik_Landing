/**
 * dashboard-types.ts
 *
 * EXECUTIVE-OPERATIONAL-DASHBOARD-04
 * Core types for the Executive Control Center.
 *
 * The dashboard NEVER calculates intelligence.
 * All intelligence comes from specialized engines.
 *
 * No Prisma. No server-only. Pure domain types.
 */

// -- Health Level -------------------------------------------------------------

/** Overall business health level. */
export type BusinessHealthLevel =
  | "excellent"
  | "good"
  | "caution"
  | "warning"
  | "critical"
  | "unknown";

// -- Signal Summary -----------------------------------------------------------

/** Aggregated signal summary for a category. */
export interface SignalCategorySummary {
  category: string;
  label: string;
  total: number;
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}

// -- Timeline Entry -----------------------------------------------------------

/** A single entry in the executive timeline. */
export interface ExecutiveTimelineEntry {
  /** ISO timestamp. */
  timestamp: string;
  /** Human-readable time (e.g. "08:10"). */
  timeLabel: string;
  /** Entry type for icon/color selection. */
  entryType: "signal" | "event" | "rule" | "plan" | "decision" | "action" | "info";
  /** Title. */
  title: string;
  /** Optional subtitle. */
  subtitle: string;
  /** Severity for color coding. */
  severity: "info" | "low" | "medium" | "high" | "critical";
  /** Source artifact ID for trace navigation. */
  sourceId: string;
  /** Source type for trace navigation. */
  sourceType: string;
}

// -- KPI Card -----------------------------------------------------------------

/** Executive KPI card data. */
export interface ExecutiveKpiCard {
  /** Card label. */
  label: string;
  /** Current value (formatted). */
  value: string;
  /** Previous value for comparison. */
  previousValue: string;
  /** Delta (formatted, e.g. "+12%", "-3%"). */
  delta: string;
  /** Delta direction. */
  direction: "up" | "down" | "flat";
  /** Whether up is good. */
  upIsGood: boolean;
  /** Confidence in this metric (0–100). */
  confidence: number;
}

// -- Rule Summary -------------------------------------------------------------

/** Summary of an applied rule for display. */
export interface RuleSummaryCard {
  ruleId: string;
  name: string;
  reason: string;
  severity: string;
  confidence: number;
  evidenceSummary: string;
}

// -- Plan Summary -------------------------------------------------------------

/** Summary of a recommended plan for display. */
export interface PlanSummaryCard {
  planId: string;
  title: string;
  alternativeCount: number;
  recommendedAlternative: string;
  benefit: string;
  cost: string;
  risk: string;
  estimatedDuration: string;
  dependencyCount: number;
  confidence: number;
  severity: string;
}

// -- Decision Summary ---------------------------------------------------------

/** Summary of a recommended decision for display. */
export interface DecisionSummaryCard {
  decisionId: string;
  title: string;
  recommendation: string;
  justification: string;
  optionCount: number;
  tradeoffCount: number;
  confidence: number;
  confidenceLevel: string;
  requiresApproval: boolean;
  severity: string;
}

// -- Action Summary -----------------------------------------------------------

/** Summary of a pending action for display. */
export interface ActionSummaryCard {
  actionId: string;
  title: string;
  actionType: string;
  status: string;
  approvalStatus: string;
  requiresApproval: boolean;
  executionMode: string;
}

// -- Business Trace -----------------------------------------------------------

/** Full trace chain for a business situation. */
export interface BusinessTraceChain {
  entityLabel: string;
  entityType: string;
  signalTitle: string;
  signalSeverity: string;
  eventType: string;
  eventSummary: string;
  ruleName: string;
  ruleConfidence: number;
  planTitle: string;
  planAlternatives: number;
  decisionTitle: string;
  decisionConfidence: number;
  actionTitle: string;
  actionStatus: string;
}

// -- Dashboard State ----------------------------------------------------------

/** Complete dashboard state assembled from all engines. */
export interface ExecutiveDashboardState {
  /** Organization ID. */
  orgSlug: string;
  /** When this state was assembled. */
  assembledAt: string;
  /** Business health. */
  health: {
    level: BusinessHealthLevel;
    score: number;
    riskLevel: string;
    confidence: number;
  };
  /** Executive KPI cards. */
  kpis: ExecutiveKpiCard[];
  /** Signal summaries by category. */
  signals: SignalCategorySummary[];
  /** Timeline entries (newest first). */
  timeline: ExecutiveTimelineEntry[];
  /** Applied rules. */
  rules: RuleSummaryCard[];
  /** Recommended plans. */
  plans: PlanSummaryCard[];
  /** Recommended decisions. */
  decisions: DecisionSummaryCard[];
  /** Pending actions. */
  actions: ActionSummaryCard[];
  /** Business trace chains. */
  traces: BusinessTraceChain[];
  /** Daily executive summary (one-liner). */
  dailySummary: string;
}
