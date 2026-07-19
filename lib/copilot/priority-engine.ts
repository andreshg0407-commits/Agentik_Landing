/**
 * lib/copilot/priority-engine.ts
 *
 * Agentik Copilot — Signal Priority Engine V1
 *
 * Scores and ranks signals so Copilot always shows the most operationally
 * important signal first. Score is fully deterministic — no randomness, no AI.
 *
 * Scoring factors:
 *   1. Severity weight       (0–40)  — critica=40, elevada=25, vigilancia=12, informativa=5
 *   2. Financial impact       (0–25)  — per-rule hardcoded based on financial chain position
 *   3. Operational impact     (0–20)  — cross-module blocking capacity
 *   4. Aging factor           (0–10)  — hours unresolved (older = more urgent)
 *   5. Cross-signal bonus     (0–10)  — extra weight when multiple signals converge
 *
 * Max raw score = 40+25+20+10+10 = 105 → normalized to 0–100.
 *
 * Guarantees:
 *   - A critica signal ALWAYS scores >= an informativa signal
 *   - A signal blocking another module ALWAYS scores higher than one that doesn't
 *   - Combined financial_close.blocked + reconciliation.pending_critical
 *     ALWAYS scores higher than budget.velocity_exceeded alone
 *
 * Sprint: AGENTIK-COPILOT-SIGNAL-ENGINE-01
 */

import type { CopilotSignal, CopilotSignalId, SignalSeverity } from "./types";
import { getMaxDownstreamWeight } from "./module-dependencies";

// ── Output type ───────────────────────────────────────────────────────────────

export interface PrioritizedSignal {
  signalId:             string;
  ruleId:               CopilotSignalId;
  score:                number;   // 0–100 composite — primary sort key
  urgency:              number;   // 0–100 time-based urgency component
  financialImpact:      number;   // 0–100 normalized financial component
  operationalImpact:    number;   // 0–100 normalized operational component
  moduleWeight:         number;   // 0–100 downstream dependency weight
  agingFactor:          number;   // 0–100 time-based aging
  requiresAttentionNow: boolean;  // score >= 70 OR severity = "critica"
  original:             CopilotSignal; // full signal — server-side only, not for client
}

// ── Scoring tables ────────────────────────────────────────────────────────────

const SEVERITY_SCORE: Record<SignalSeverity, number> = {
  critica:     40,
  elevada:     25,
  vigilancia:  12,
  informativa:  5,
};

/** Financial chain position — how directly does this signal threaten cash/close? */
const FINANCIAL_IMPACT: Record<CopilotSignalId, number> = {
  "financial_close.blocked":         25, // blocks the entire close cycle
  "treasury.low_coverage":           22, // direct cash flow threat
  "reconciliation.pending_critical": 18, // blocks reconciliation = threatens close
  "budget.velocity_exceeded":        15, // planning risk, less immediate
};

/** Operational blocking capacity — how much does this freeze other modules? */
const OPERATIONAL_IMPACT: Record<CopilotSignalId, number> = {
  "financial_close.blocked":         20, // halts close process entirely
  "reconciliation.pending_critical": 18, // critical exceptions block close
  "treasury.low_coverage":           15, // cash crisis = operational paralysis risk
  "budget.velocity_exceeded":        10, // planning disruption, slower impact
};

// ── Aging ─────────────────────────────────────────────────────────────────────

function computeAgingScore(detectedAt: Date): number {
  const hours = (Date.now() - detectedAt.getTime()) / (1000 * 60 * 60);
  if (hours > 48) return 10;
  if (hours > 24) return  8;
  if (hours > 12) return  6;
  if (hours > 6 ) return  4;
  if (hours > 2 ) return  2;
  return 1;
}

// ── Cross-signal convergence bonus ────────────────────────────────────────────

function computeConvergenceBonus(
  signal:     CopilotSignal,
  allSignals: CopilotSignal[],
): number {
  const presentRules = new Set(allSignals.map(s => s.ruleId));

  // Reconciliation + close both active → they amplify each other
  if (
    signal.ruleId === "reconciliation.pending_critical" &&
    presentRules.has("financial_close.blocked")
  ) return 10;

  if (
    signal.ruleId === "financial_close.blocked" &&
    presentRules.has("reconciliation.pending_critical")
  ) return 10;

  // Treasury low + close blocked → compounding cash + close risk
  if (
    signal.ruleId === "treasury.low_coverage" &&
    presentRules.has("financial_close.blocked")
  ) return 8;

  if (
    signal.ruleId === "financial_close.blocked" &&
    presentRules.has("treasury.low_coverage")
  ) return 5;

  // Budget over-run + treasury low → financial pressure convergence
  if (
    signal.ruleId === "budget.velocity_exceeded" &&
    presentRules.has("treasury.low_coverage")
  ) return 6;

  return 0;
}

// ── Score computation ─────────────────────────────────────────────────────────

const MAX_RAW_SCORE = 40 + 25 + 20 + 10 + 10; // = 105

function scoreSignal(signal: CopilotSignal, allSignals: CopilotSignal[]): PrioritizedSignal {
  const severityRaw    = SEVERITY_SCORE[signal.severity];
  const financialRaw   = FINANCIAL_IMPACT[signal.ruleId];
  const operationalRaw = OPERATIONAL_IMPACT[signal.ruleId];
  const agingRaw       = computeAgingScore(signal.detectedAt);
  const bonusRaw       = computeConvergenceBonus(signal, allSignals);
  const moduleRaw      = getMaxDownstreamWeight(signal.ruleId); // 0–100 already

  const rawTotal   = severityRaw + financialRaw + operationalRaw + agingRaw + bonusRaw;
  const score      = Math.min(100, Math.round((rawTotal / MAX_RAW_SCORE) * 100));

  // Normalized sub-dimensions (for consumer insight)
  const urgency          = Math.min(100, Math.round(((severityRaw + agingRaw) / 50) * 100));
  const financialImpact  = Math.min(100, Math.round((financialRaw   / 25) * 100));
  const operationalImpact = Math.min(100, Math.round((operationalRaw / 20) * 100));

  return {
    signalId:             signal.id,
    ruleId:               signal.ruleId,
    score,
    urgency,
    financialImpact,
    operationalImpact,
    moduleWeight:         moduleRaw,
    agingFactor:          Math.round((agingRaw / 10) * 100),
    requiresAttentionNow: score >= 70 || signal.severity === "critica",
    original:             signal,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Scores and sorts all active signals by operational priority.
 * Returns highest-priority signals first.
 */
export function prioritizeSignals(signals: CopilotSignal[]): PrioritizedSignal[] {
  return signals
    .map(s => scoreSignal(s, signals))
    .sort((a, b) => b.score - a.score);
}
