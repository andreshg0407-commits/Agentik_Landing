/**
 * signal-utils.ts
 *
 * BUSINESS-SIGNALS-01
 * Utility functions for working with Business Signals.
 *
 * Pure functions, no side effects, no persistence, no external deps.
 *
 * No Prisma. No React. No AI. No UI. Pure domain utilities.
 */

import type { BusinessSignal, MergedSignal } from "./signal";
import type { SignalCategory } from "./signal-category";
import type { SignalSeverity } from "./signal-severity";
import type { SignalPriority } from "./signal-priority";
import { isTerminalStatus } from "./signal";
import { compareSeverity, meetsThreshold } from "./signal-severity";
import { comparePriority } from "./signal-priority";

// -- Filtering --------------------------------------------------------------

/** Filter signals by minimum severity. */
export function filterBySeverity(signals: BusinessSignal[], minSeverity: SignalSeverity): BusinessSignal[] {
  return signals.filter(s => meetsThreshold(s.severity, minSeverity));
}

/** Filter signals by category. */
export function filterByCategory(signals: BusinessSignal[], category: SignalCategory): BusinessSignal[] {
  return signals.filter(s => s.category === category);
}

/** Filter signals by minimum confidence. */
export function filterByConfidence(signals: BusinessSignal[], minConfidence: number): BusinessSignal[] {
  return signals.filter(s => s.confidence >= minConfidence);
}

/** Get only active (non-terminal) signals. */
export function activeSignals(signals: BusinessSignal[]): BusinessSignal[] {
  return signals.filter(s => !isTerminalStatus(s.status));
}

/** Get only terminal signals. */
export function terminalSignals(signals: BusinessSignal[]): BusinessSignal[] {
  return signals.filter(s => isTerminalStatus(s.status));
}

/** Get signals for a specific entity. */
export function signalsForEntity(signals: BusinessSignal[], entityId: string): BusinessSignal[] {
  return signals.filter(s => s.entityId === entityId);
}

// -- Sorting ----------------------------------------------------------------

/** Sort signals by severity (highest first). */
export function sortBySeverity(signals: BusinessSignal[]): BusinessSignal[] {
  return [...signals].sort((a, b) => compareSeverity(b.severity, a.severity));
}

/** Sort signals by priority (highest first). */
export function sortByPriority(signals: BusinessSignal[]): BusinessSignal[] {
  return [...signals].sort((a, b) => comparePriority(b.priority, a.priority));
}

/** Sort signals by severity first, then priority. */
export function sortBySeverityThenPriority(signals: BusinessSignal[]): BusinessSignal[] {
  return [...signals].sort((a, b) => {
    const sevDiff = compareSeverity(b.severity, a.severity);
    if (sevDiff !== 0) return sevDiff;
    return comparePriority(b.priority, a.priority);
  });
}

/** Sort signals by creation time (newest first). */
export function sortByNewest(signals: BusinessSignal[]): BusinessSignal[] {
  return [...signals].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// -- Aggregation ------------------------------------------------------------

/** Count signals by category. */
export function countByCategory(signals: BusinessSignal[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of signals) {
    counts[s.category] = (counts[s.category] ?? 0) + 1;
  }
  return counts;
}

/** Count signals by severity. */
export function countBySeverity(signals: BusinessSignal[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of signals) {
    counts[s.severity] = (counts[s.severity] ?? 0) + 1;
  }
  return counts;
}

/** Count signals by status. */
export function countByStatus(signals: BusinessSignal[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of signals) {
    counts[s.status] = (counts[s.status] ?? 0) + 1;
  }
  return counts;
}

// -- Analysis ---------------------------------------------------------------

/** Check if any signal meets a severity threshold. */
export function hasSignalAtSeverity(signals: BusinessSignal[], threshold: SignalSeverity): boolean {
  return signals.some(s => meetsThreshold(s.severity, threshold));
}

/** Get the highest severity among signals. */
export function highestSeverity(signals: BusinessSignal[]): SignalSeverity | null {
  if (signals.length === 0) return null;
  return sortBySeverity(signals)[0].severity;
}

/** Get unique entity IDs referenced by signals. */
export function uniqueEntities(signals: BusinessSignal[]): string[] {
  return [...new Set(signals.map(s => s.entityId))];
}

/** Get unique categories present in signals. */
export function uniqueCategories(signals: BusinessSignal[]): SignalCategory[] {
  return [...new Set(signals.map(s => s.category))];
}

/** Check if a signal is a merged signal. */
export function isMergedSignal(signal: BusinessSignal): signal is MergedSignal {
  return "mergedFromIds" in signal && "mergedCount" in signal;
}

// -- Summary ----------------------------------------------------------------

/** Build a one-line summary of a signal set. */
export function signalSetSummary(signals: BusinessSignal[]): string {
  const active = activeSignals(signals);
  const counts = countBySeverity(active);
  const parts: string[] = [];

  if (counts["critical"]) parts.push(`${counts["critical"]} critical`);
  if (counts["high"]) parts.push(`${counts["high"]} high`);
  if (counts["medium"]) parts.push(`${counts["medium"]} medium`);
  if (counts["low"]) parts.push(`${counts["low"]} low`);
  if (counts["info"]) parts.push(`${counts["info"]} info`);

  if (parts.length === 0) return "No active signals";
  return `${active.length} active signals: ${parts.join(", ")}`;
}
