/**
 * signal-severity.ts
 *
 * BUSINESS-SIGNALS-01
 * Severity levels for business signals.
 *
 * Severity indicates how impactful the condition is.
 * It does NOT imply urgency, priority, or required action.
 * Those are separate dimensions.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

/**
 * Signal severity levels.
 *
 * - info: Normal operational condition worth noting.
 * - low: Minor condition, no business risk.
 * - medium: Noteworthy condition that may require attention.
 * - high: Significant condition requiring attention.
 * - critical: Business-threatening condition requiring immediate attention.
 * - unknown: Severity cannot be determined (data missing).
 */
export type SignalSeverity =
  | "info"
  | "low"
  | "medium"
  | "high"
  | "critical"
  | "unknown";

/** All valid severities as an array (for validation and ordering). */
export const SIGNAL_SEVERITIES: readonly SignalSeverity[] = [
  "info",
  "low",
  "medium",
  "high",
  "critical",
  "unknown",
] as const;

/** Numeric rank for severity comparisons. Higher = more severe. */
const SEVERITY_RANK: Record<SignalSeverity, number> = {
  unknown: 0,
  info: 1,
  low: 2,
  medium: 3,
  high: 4,
  critical: 5,
};

/** Compare two severities. Returns positive if a > b. */
export function compareSeverity(a: SignalSeverity, b: SignalSeverity): number {
  return SEVERITY_RANK[a] - SEVERITY_RANK[b];
}

/** Check if severity meets or exceeds a threshold. */
export function meetsThreshold(severity: SignalSeverity, threshold: SignalSeverity): boolean {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[threshold];
}
