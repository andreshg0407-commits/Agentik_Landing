/**
 * lib/copilot/types.ts
 *
 * Agentik Financial Copilot V1 — Core type contracts.
 *
 * Scope: Signal detection, confidence scoring, lifecycle, traceability.
 * NOT: chat, embeddings, LLM calls, autonomous actions.
 *
 * Sprint: AGENTIK-FINANCIAL-COPILOT-V1-FOUNDATION
 */

// ── Signal rule IDs ────────────────────────────────────────────────────────────

export type CopilotSignalId =
  | "budget.velocity_exceeded"
  | "treasury.low_coverage"
  | "financial_close.blocked"
  | "reconciliation.pending_critical";

// ── Signal severity ────────────────────────────────────────────────────────────

export type SignalSeverity =
  | "critica"     // Requires immediate attention — affects close, cash, operations
  | "elevada"     // Should be reviewed today
  | "vigilancia"  // Monitor — not urgent but growing
  | "informativa"; // Context only

// ── Signal lifecycle ───────────────────────────────────────────────────────────

export type SignalLifecycleState =
  | "detected"     // Engine found the condition
  | "visible"      // Shown to the user in CopilotSlot
  | "acknowledged" // User confirmed awareness
  | "dismissed"    // User explicitly dismissed
  | "resolved";    // Underlying condition no longer met

// ── Confidence ─────────────────────────────────────────────────────────────────

export type ConfidenceLevel = "ALTA" | "MEDIA" | "BAJA" | "BASADA_EN_REGLA";

export interface ConfidenceScore {
  level: ConfidenceLevel;
  score: number;               // 0–100 composite
  d1_source_coverage: number;  // 0–100 (weight 35%)
  d2_freshness: number;        // 0–100 (weight 25%)
  d5_completeness: number;     // 0–100 (weight 10%)
  stalestDataAgeMinutes: number;
  missingFields: string[];
}

// ── Target module ──────────────────────────────────────────────────────────────

export type SignalTargetModule =
  | "planeacion"
  | "tesoreria"
  | "cierre"
  | "conciliacion";

// ── Evidence per rule ──────────────────────────────────────────────────────────

export interface BudgetVelocityEvidence {
  type: "budget_velocity";
  budgetAmount: number;
  actualAmount: number;
  elapsedDays: number;
  totalDays: number;
  velocityRatio: number;  // actual_pace / budget_pace. >1 = over, <1 = under
  category: string;
  currency: string;
}

export interface TreasuryCoverageEvidence {
  type: "treasury_coverage";
  coverageDays: number;       // Estimated operational coverage days
  pendingInflow: number;      // Expected cobros (open receivables due ≤30 days)
  openObligations: number;    // AP balances or overdue receivables as proxy
  currency: string;
}

export interface FinancialCloseBlockedEvidence {
  type: "financial_close_blocked";
  criticalExceptionsCount: number;
  oldestExceptionDays: number;  // Days since oldest unresolved critical exception
  totalDeltaBlocked: number;    // Sum of |delta| across blocked exceptions
  currency: string;
}

export interface ReconciliationCriticalEvidence {
  type: "reconciliation_critical";
  openCriticalCount: number;
  totalDelta: number;
  oldestAgeHours: number;
  currency: string;
}

export type SignalEvidence =
  | BudgetVelocityEvidence
  | TreasuryCoverageEvidence
  | FinancialCloseBlockedEvidence
  | ReconciliationCriticalEvidence;

// ── Copilot signal ─────────────────────────────────────────────────────────────

export interface CopilotSignal {
  id: string;                      // Unique signal instance ID (cuid)
  ruleId: CopilotSignalId;
  orgId: string;
  severity: SignalSeverity;
  lifecycle: SignalLifecycleState;
  targetModule: SignalTargetModule;

  // Human-readable content (operational Spanish)
  titulo: string;
  descripcion: string;
  accion: string;       // CTA label
  targetPath: string;   // URL path to module workspace

  confidence: ConfidenceScore;
  evidence: SignalEvidence;

  // Explainability Level 1 — template-based, no LLM
  explicacion: string;  // "Agentik detectó esta señal porque..."

  detectedAt: Date;
  expiresAt?: Date;
}

// ── Runtime state ──────────────────────────────────────────────────────────────

export type CopilotRuntimeState =
  | "HEALTHY"    // All engines running, data fresh
  | "SYNCING"    // Data sync in progress
  | "STALE"      // Data older than acceptable threshold
  | "DEGRADED";  // One or more signal rules failed or returned no data

export interface CopilotRuntime {
  state: CopilotRuntimeState;
  lastEvaluatedAt: Date;
  activeSignals: number;
  staleRules: CopilotSignalId[];
  degradedRules: CopilotSignalId[];
}

// ── Signal engine result ───────────────────────────────────────────────────────

export interface SignalEngineResult {
  signals: CopilotSignal[];
  runtime: CopilotRuntime;
  evaluatedAt: Date;
}

// ── CopilotSlot props ──────────────────────────────────────────────────────────

export interface CopilotSlotProps {
  orgSlug: string;
  module: SignalTargetModule;
  signals: CopilotSignal[];   // Pre-filtered for this module by signal-engine
  runtime: CopilotRuntime;
  className?: string;
}
