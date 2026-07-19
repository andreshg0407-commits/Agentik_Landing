/**
 * signal-priority.ts
 *
 * BUSINESS-SIGNALS-01
 * Priority levels for business signals.
 *
 * Priority is INDEPENDENT of severity.
 * A low-severity signal can have highest priority.
 * Example: A routine inventory recount (low severity)
 * might be highest priority because a VIP order depends on it.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

/**
 * Signal priority levels.
 *
 * Priority determines processing and attention order.
 * It is orthogonal to severity (which measures impact).
 */
export type SignalPriority =
  | "lowest"
  | "low"
  | "normal"
  | "high"
  | "highest";

/** All valid priorities as an array (for validation and ordering). */
export const SIGNAL_PRIORITIES: readonly SignalPriority[] = [
  "lowest",
  "low",
  "normal",
  "high",
  "highest",
] as const;

/** Numeric rank for priority comparisons. Higher = more priority. */
const PRIORITY_RANK: Record<SignalPriority, number> = {
  lowest: 1,
  low: 2,
  normal: 3,
  high: 4,
  highest: 5,
};

/** Compare two priorities. Returns positive if a > b. */
export function comparePriority(a: SignalPriority, b: SignalPriority): number {
  return PRIORITY_RANK[a] - PRIORITY_RANK[b];
}
