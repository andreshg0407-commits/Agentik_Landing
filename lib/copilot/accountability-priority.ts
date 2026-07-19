/**
 * lib/copilot/accountability-priority.ts
 *
 * Agentik Copilot — Accountability Priority Engine V1
 *
 * Phase 5 of Sprint AGENTIK-COPILOT-ACCOUNTABILITY-01
 *
 * Resolves the display pressure of accountability signals and sorts them
 * for the rail UI. Pressure determines visual emphasis, ordering, and
 * whether the "Estado operativo" section is promoted to the top.
 */

import type { AccountabilitySignal, AccountabilitySeverity } from "./accountability-engine";
import type { FollowUpMemory }                               from "./followup-memory";

// ── Pressure type ─────────────────────────────────────────────────────────────

export type AccountabilityPressure = "low" | "medium" | "high" | "urgent";

// ── Score tables ──────────────────────────────────────────────────────────────

const SEVERITY_SCORE: Record<AccountabilitySeverity, number> = {
  critical: 40,
  elevated: 25,
  normal:   10,
};

const TYPE_SCORE: Record<string, number> = {
  blocked_step:       20,
  stalled_operation:  15,
  delayed_execution:  18,
  unresolved_intent:  12,
  degraded_runtime:   10,
  no_progress:         8,
};

const ESCALATION_SCORE = 15;  // Per escalation level
const SESSION_SCORE    = 5;   // Per additional session (followupCount > 1)

function signalScore(signal: AccountabilitySignal): number {
  return (
    SEVERITY_SCORE[signal.severity]       +
    (TYPE_SCORE[signal.type]    ?? 0)     +
    (signal.escalationRecommended ? 10 : 0)
  );
}

function compositeScore(
  signal:         AccountabilitySignal,
  followupMemory: FollowUpMemory | null,
): number {
  const base    = signalScore(signal);
  const escBonus = followupMemory ? followupMemory.escalationLevel * ESCALATION_SCORE : 0;
  const sesBonus = followupMemory ? Math.max(0, followupMemory.followupCount - 1) * SESSION_SCORE : 0;
  return base + escBonus + sesBonus;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Sorts accountability signals by composite priority (descending).
 */
export function sortAccountabilitySignals(
  signals:        AccountabilitySignal[],
  followupMemory: FollowUpMemory | null = null,
): AccountabilitySignal[] {
  return [...signals].sort(
    (a, b) => compositeScore(b, followupMemory) - compositeScore(a, followupMemory),
  );
}

/**
 * Returns the single highest-priority accountability signal.
 */
export function getPrimaryAccountabilitySignal(
  signals:        AccountabilitySignal[],
  followupMemory: FollowUpMemory | null = null,
): AccountabilitySignal | null {
  if (signals.length === 0) return null;
  return sortAccountabilitySignals(signals, followupMemory)[0] ?? null;
}

/**
 * Resolves the overall accountability pressure level.
 * Drives visual tension in the "Estado operativo" section.
 */
export function resolveAccountabilityPressure(
  signals:        AccountabilitySignal[],
  runtimeState:   string,
  followupMemory: FollowUpMemory | null,
): AccountabilityPressure {
  if (signals.length === 0) return "low";

  const primary = getPrimaryAccountabilitySignal(signals, followupMemory);
  if (!primary) return "low";

  const score = compositeScore(primary, followupMemory);

  // Runtime degraded amplifies pressure
  const runtimeMultiplier = runtimeState === "DEGRADED" ? 1.3 : runtimeState === "STALE" ? 1.1 : 1.0;
  const adjusted = score * runtimeMultiplier;

  if (adjusted >= 80)  return "urgent";
  if (adjusted >= 55)  return "high";
  if (adjusted >= 30)  return "medium";
  return "low";
}
