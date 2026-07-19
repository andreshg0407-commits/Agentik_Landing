/**
 * lib/copilot/intent-priority.ts
 *
 * Agentik Copilot — Intent Priority Resolver V1
 *
 * Phase 4 of Sprint AGENTIK-COPILOT-EXECUTIVE-INTENT-01
 *
 * Determines urgency pressure and ordering of executive intents.
 * Pressure drives visual emphasis: how prominently the intent is shown.
 *
 * Pressure levels:
 *   urgent  — immediate action required, system at risk
 *   high    — active problem, today's focus
 *   medium  — watching, act soon
 *   low     — routine, stable
 */

import type { ExecutiveIntent, IntentSeverity } from "./executive-intent";

// ── Pressure type ─────────────────────────────────────────────────────────────

export type IntentPressure = "urgent" | "high" | "medium" | "low";

// ── Pressure resolution ───────────────────────────────────────────────────────

/**
 * Resolves the pressure level of a single intent based on:
 *   - its severity
 *   - its current status
 *   - the runtime state
 *   - how many critical signals back it
 */
export function resolveIntentPressure(
  intent:            ExecutiveIntent,
  runtimeState:      "HEALTHY" | "SYNCING" | "STALE" | "DEGRADED",
  criticalSignalCount: number,
): IntentPressure {
  const { severity, status } = intent;

  // Escalated or blocked critical intents → urgent
  if (status === "escalated" || (status === "blocked" && severity === "critical")) {
    return "urgent";
  }

  // Critical severity + multiple supporting signals → urgent
  if (severity === "critical" && criticalSignalCount >= 2) return "urgent";

  // Critical severity or blocked elevated → high
  if (severity === "critical") return "high";
  if (status === "blocked" && severity === "elevated") return "high";

  // Degraded runtime + any active signal → elevated pressure
  if (runtimeState === "DEGRADED" && severity === "elevated") return "high";

  // Elevated severity → medium
  if (severity === "elevated") return "medium";

  // Everything else → low
  return "low";
}

// ── Composite pressure score ──────────────────────────────────────────────────

const PRESSURE_SCORE: Record<IntentPressure, number> = {
  urgent: 100,
  high:   70,
  medium: 40,
  low:    10,
};

const SEVERITY_SCORE: Record<IntentSeverity, number> = {
  critical: 30,
  elevated: 15,
  normal:   5,
};

const STATUS_SCORE: Record<ExecutiveIntent["status"], number> = {
  escalated: 20,
  blocked:   15,
  active:    10,
  watching:  5,
  resolved:  0,
};

function compositeScore(
  intent:   ExecutiveIntent,
  pressure: IntentPressure,
): number {
  return (
    PRESSURE_SCORE[pressure] +
    SEVERITY_SCORE[intent.severity] +
    STATUS_SCORE[intent.status]
  );
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns the single highest-priority intent — the primary focus for the rail.
 * Prioritizes: urgent > high > medium, then status blocked > active > watching.
 */
export function getPrimaryExecutiveIntent(
  intents:             ExecutiveIntent[],
  runtimeState:        "HEALTHY" | "SYNCING" | "STALE" | "DEGRADED",
  criticalSignalCount: number,
): (ExecutiveIntent & { pressure: IntentPressure }) | null {
  if (intents.length === 0) return null;

  const sorted = sortExecutiveIntents(intents, runtimeState, criticalSignalCount);
  const primary = sorted[0];
  if (!primary) return null;

  return {
    ...primary,
    pressure: resolveIntentPressure(primary, runtimeState, criticalSignalCount),
  };
}

/**
 * Sorts intents by composite priority score (descending).
 */
export function sortExecutiveIntents(
  intents:             ExecutiveIntent[],
  runtimeState:        "HEALTHY" | "SYNCING" | "STALE" | "DEGRADED",
  criticalSignalCount: number,
): ExecutiveIntent[] {
  return [...intents].sort((a, b) => {
    const pressureA = resolveIntentPressure(a, runtimeState, criticalSignalCount);
    const pressureB = resolveIntentPressure(b, runtimeState, criticalSignalCount);
    return compositeScore(b, pressureB) - compositeScore(a, pressureA);
  });
}
