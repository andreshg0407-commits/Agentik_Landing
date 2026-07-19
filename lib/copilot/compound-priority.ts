/**
 * lib/copilot/compound-priority.ts
 *
 * Agentik Copilot — Compound Operation Priority Engine V1
 *
 * Phase 4 of Sprint AGENTIK-COPILOT-COMPOUND-OPERATIONS-01
 *
 * Resolves execution priority and pressure for compound operations.
 * Considers intent pressure, operational priority, runtime health,
 * escalation status, and cross-module severity.
 */

import type { CompoundOperation, CompoundOperationPriority } from "./compound-operations";
import type { OperationalPriority }                           from "./context-engine";
import type { IntentPressure }                                from "./intent-priority";

// ── Pressure score tables ─────────────────────────────────────────────────────

const PRIORITY_SCORE: Record<CompoundOperationPriority, number> = {
  urgent: 100, high: 70, medium: 40, low: 10,
};

const RUNTIME_MODIFIER: Record<string, number> = {
  HEALTHY:  0,
  SYNCING:  -5,
  STALE:    -10,
  DEGRADED: -20,
};

const READINESS_MODIFIER: Record<CompoundOperation["executionReadiness"], number> = {
  ready:   10,
  partial:  0,
  blocked: -25,
};

const OP_PRIORITY_MODIFIER: Record<OperationalPriority, number> = {
  critical: 15,
  elevated: 8,
  normal:   2,
  idle:     0,
};

const INTENT_PRESSURE_MODIFIER: Record<IntentPressure, number> = {
  urgent: 20,
  high:   12,
  medium:  6,
  low:     0,
};

// ── Composite pressure score ──────────────────────────────────────────────────

function compositeScore(
  operation:         CompoundOperation,
  runtimeState:      string,
  operationalPriority: OperationalPriority,
  intentPressure:    IntentPressure,
): number {
  return (
    PRIORITY_SCORE[operation.priority]                     +
    (RUNTIME_MODIFIER[runtimeState]         ?? 0)          +
    READINESS_MODIFIER[operation.executionReadiness]       +
    OP_PRIORITY_MODIFIER[operationalPriority]              +
    INTENT_PRESSURE_MODIFIER[intentPressure]
  );
}

// ── Effective pressure resolution ─────────────────────────────────────────────

/**
 * Resolves the effective display pressure for a compound operation.
 * Pressure drives visual emphasis in the rail UI.
 */
export function resolveCompoundPressure(
  operation:         CompoundOperation,
  runtimeState:      string,
  operationalPriority: OperationalPriority = "normal",
  intentPressure:    IntentPressure        = "medium",
): CompoundOperationPriority {
  const score = compositeScore(operation, runtimeState, operationalPriority, intentPressure);

  if (score >= 100) return "urgent";
  if (score >= 65)  return "high";
  if (score >= 35)  return "medium";
  return "low";
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Sorts compound operations by composite priority score (descending).
 * Considers runtime health, operational priority, and intent pressure.
 */
export function sortCompoundOperations(
  operations:          CompoundOperation[],
  runtimeState:        string,
  operationalPriority: OperationalPriority = "normal",
  intentPressure:      IntentPressure      = "medium",
): CompoundOperation[] {
  return [...operations].sort((a, b) => {
    const scoreA = compositeScore(a, runtimeState, operationalPriority, intentPressure);
    const scoreB = compositeScore(b, runtimeState, operationalPriority, intentPressure);
    return scoreB - scoreA;
  });
}

/**
 * Returns the single highest-priority operation — the one shown in the rail.
 */
export function getPrimaryCompoundOperation(
  operations:          CompoundOperation[],
  runtimeState:        string,
  operationalPriority: OperationalPriority = "normal",
  intentPressure:      IntentPressure      = "medium",
): CompoundOperation | null {
  if (operations.length === 0) return null;
  return sortCompoundOperations(operations, runtimeState, operationalPriority, intentPressure)[0] ?? null;
}
