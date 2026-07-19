/**
 * shared/freshness-evaluator.ts
 *
 * Evaluates data freshness against SLA requirements.
 * Accepts injectable `now` for deterministic testing.
 */

// ── Freshness Evaluation Input ──────────────────────────────────────────────

export interface FreshnessEvaluationInput {
  /** When the data was observed/synced */
  readonly observedAt: Date;
  /** When the source system last modified the record (may be null) */
  readonly sourceUpdatedAt: Date | null;
  /** Current time (injectable for testing) */
  readonly now: Date;
  /** Maximum acceptable age in seconds */
  readonly slaSeconds: number;
  /** Sync mode that produced this data */
  readonly syncMode: "FULL" | "INCREMENTAL" | "ON_DEMAND" | "WEBHOOK";
}

// ── Freshness Evaluation Result ─────────────────────────────────────────────

export interface FreshnessEvaluationResult {
  /** Age in seconds from observation to now */
  readonly ageSeconds: number;
  /** When the data will be considered stale */
  readonly validUntil: Date;
  /** Freshness status */
  readonly status: FreshnessStatus;
  /** Whether the data is stale */
  readonly isStale: boolean;
  /** Human-readable reason */
  readonly reason: string;
}

export type FreshnessStatus =
  | "FRESH"
  | "AGING"
  | "STALE"
  | "UNKNOWN";

// ── Evaluator ───────────────────────────────────────────────────────────────

export function evaluateCommercialFreshness(input: FreshnessEvaluationInput): FreshnessEvaluationResult {
  const referenceTime = input.sourceUpdatedAt ?? input.observedAt;
  const ageMs = input.now.getTime() - referenceTime.getTime();
  const ageSeconds = Math.max(0, Math.round(ageMs / 1000));
  const slaMs = input.slaSeconds * 1000;
  const validUntil = new Date(referenceTime.getTime() + slaMs);

  if (ageMs < 0) {
    return {
      ageSeconds: 0,
      validUntil,
      status: "UNKNOWN",
      isStale: false,
      reason: "Observation is in the future relative to now",
    };
  }

  const ratio = ageMs / slaMs;

  if (ratio <= 0.5) {
    return {
      ageSeconds,
      validUntil,
      status: "FRESH",
      isStale: false,
      reason: `Data is ${ageSeconds}s old, well within ${input.slaSeconds}s SLA`,
    };
  }

  if (ratio <= 1.0) {
    return {
      ageSeconds,
      validUntil,
      status: "AGING",
      isStale: false,
      reason: `Data is ${ageSeconds}s old, approaching ${input.slaSeconds}s SLA`,
    };
  }

  return {
    ageSeconds,
    validUntil,
    status: "STALE",
    isStale: true,
    reason: `Data is ${ageSeconds}s old, exceeds ${input.slaSeconds}s SLA`,
  };
}
