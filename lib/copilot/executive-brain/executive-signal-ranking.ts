/**
 * lib/copilot/executive-brain/executive-signal-ranking.ts
 *
 * Agentik — Executive Brain — Signal Ranking
 * Sprint: AGENTIK-EXECUTIVE-BRAIN-01
 *
 * Deterministic ranking of ExecutiveSignals.
 * CRITICAL always first. HIGH second. MEDIUM third. LOW last.
 * Within each tier: sorted by confidence DESC, then generatedAt DESC.
 *
 * Pure domain. No Prisma. No server-only. No React. No AI.
 */

import type { ExecutiveSignal, ExecutiveSignalSeverity } from "./executive-brain-types";
import { EXECUTIVE_SEVERITY_RANK } from "./executive-brain-types";

// ── Default limits ────────────────────────────────────────────────────────────

const DEFAULT_MAX_SIGNALS = 20;

// ── Ranking ───────────────────────────────────────────────────────────────────

/**
 * Deterministic comparator for executive signals.
 *
 * Priority order:
 *   1. Severity DESC (CRITICAL > HIGH > MEDIUM > LOW)
 *   2. Confidence DESC (0.9 before 0.5)
 *   3. generatedAt DESC (most recent first)
 */
export function compareSignals(a: ExecutiveSignal, b: ExecutiveSignal): number {
  // 1. Severity
  const sevDiff = EXECUTIVE_SEVERITY_RANK[b.severity] - EXECUTIVE_SEVERITY_RANK[a.severity];
  if (sevDiff !== 0) return sevDiff;

  // 2. Confidence
  const confDiff = b.confidence - a.confidence;
  if (Math.abs(confDiff) > 0.001) return confDiff;

  // 3. Recency
  return b.generatedAt.localeCompare(a.generatedAt);
}

/**
 * Rank and cap signals.
 *
 * Guarantees:
 *   - CRITICAL signals always appear before HIGH, HIGH before MEDIUM, MEDIUM before LOW
 *   - Within each severity tier: sorted by confidence DESC
 *   - Results capped at maxSignals (default 20)
 *   - Input is never mutated — returns a new array
 *
 * @param signals    Raw signals from the collector
 * @param maxSignals Maximum signals to return after ranking
 */
export function rankSignals(
  signals:    ExecutiveSignal[],
  maxSignals: number = DEFAULT_MAX_SIGNALS,
): ExecutiveSignal[] {
  if (signals.length === 0) return [];

  // Sort into a new array — never mutate input
  const sorted = [...signals].sort(compareSignals);

  return sorted.slice(0, maxSignals);
}

/**
 * Count signals by severity tier.
 * Useful for logging and summary generation.
 */
export function countBySeverity(signals: ExecutiveSignal[]): Record<ExecutiveSignalSeverity, number> {
  return {
    CRITICAL: signals.filter(s => s.severity === "CRITICAL").length,
    HIGH:     signals.filter(s => s.severity === "HIGH").length,
    MEDIUM:   signals.filter(s => s.severity === "MEDIUM").length,
    LOW:      signals.filter(s => s.severity === "LOW").length,
  };
}

/**
 * Returns the highest severity among a list of signals.
 * Returns "LOW" if the list is empty.
 */
export function highestSeverity(signals: ExecutiveSignal[]): ExecutiveSignalSeverity {
  if (signals.length === 0) return "LOW";
  return signals.reduce<ExecutiveSignalSeverity>((best, s) =>
    EXECUTIVE_SEVERITY_RANK[s.severity] > EXECUTIVE_SEVERITY_RANK[best] ? s.severity : best,
    "LOW",
  );
}

/**
 * Filter signals to only those at or above a minimum severity.
 */
export function filterBySeverity(
  signals:     ExecutiveSignal[],
  minSeverity: ExecutiveSignalSeverity,
): ExecutiveSignal[] {
  return signals.filter(s => EXECUTIVE_SEVERITY_RANK[s.severity] >= EXECUTIVE_SEVERITY_RANK[minSeverity]);
}
