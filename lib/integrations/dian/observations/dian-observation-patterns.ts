/**
 * dian-observation-patterns.ts
 *
 * AGENTIK-DIAN-OBSERVATIONS-01
 * DIAN Integration Layer — Fiscal Pattern Detectors
 *
 * Pure functions for detecting temporal and operational patterns
 * in DIAN fiscal sync data. No Prisma. No side effects.
 *
 * All functions accept pre-fetched data from DianFiscalMemoryEntry
 * and return typed pattern results.
 *
 * Rules mirror the financial observation engine pattern:
 *   - Minimum data requirements enforced (honest degradation)
 *   - No fabrication when data is insufficient
 *   - Severity escalates with duration and repetition
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import type { DianSyncOutcomeEntry } from "../sync/dian-sync-types";

// ── Certificate expiry window ─────────────────────────────────────────────────

export type CertExpiryWindow =
  | "expired"          // past validUntil
  | "critical"         // ≤ 7 days
  | "elevated"         // 8–14 days
  | "watch"            // 15–30 days
  | "ok"               // > 30 days
  | "unknown";         // no certExpiresAt recorded

export interface CertExpiryResult {
  window:         CertExpiryWindow;
  daysRemaining:  number | null;
}

/**
 * Classify certificate expiry status.
 *
 * @param certExpiresAt  ISO date string from DianFiscalMemoryEntry.certExpiresAt
 * @param now            Current date (injectable for testing)
 */
export function certificateExpiryWindow(
  certExpiresAt: string | undefined | null,
  now: Date = new Date(),
): CertExpiryResult {
  if (!certExpiresAt) return { window: "unknown", daysRemaining: null };

  const expiresMs   = new Date(certExpiresAt).getTime();
  const nowMs       = now.getTime();
  const msRemaining = expiresMs - nowMs;
  const daysRemaining = Math.floor(msRemaining / (1000 * 60 * 60 * 24));

  if (daysRemaining < 0)  return { window: "expired",  daysRemaining };
  if (daysRemaining <= 7) return { window: "critical", daysRemaining };
  if (daysRemaining <= 14) return { window: "elevated", daysRemaining };
  if (daysRemaining <= 30) return { window: "watch",    daysRemaining };
  return { window: "ok", daysRemaining };
}

// ── Repeated failure pattern ──────────────────────────────────────────────────

export interface RepeatedFailureResult {
  detected: boolean;
  count:    number;      // how many times the code appeared in the window
  window:   number;      // how many outcomes were inspected
}

/**
 * Detect repeated occurrences of a specific error code in recent outcomes.
 *
 * @param outcomes    recentOutcomes ring buffer (newest last)
 * @param errorCode   Error code to look for (e.g. "SOAP_FAULT")
 * @param minCount    Minimum occurrences to trigger detection
 * @param maxWindow   How many recent outcomes to inspect (default 10)
 */
export function repeatedFailurePattern(
  outcomes:  DianSyncOutcomeEntry[],
  errorCode: string,
  minCount:  number,
  maxWindow  = 10,
): RepeatedFailureResult {
  const recent = outcomes.slice(-maxWindow);
  const count  = recent.filter(o => o.errorCode === errorCode).length;
  return { detected: count >= minCount, count, window: recent.length };
}

// ── Success rate ──────────────────────────────────────────────────────────────

export interface SuccessRateResult {
  rate:          number;   // 0–1
  successCount:  number;
  totalCount:    number;
  window:        number;
}

/**
 * Compute success rate over the last N outcomes.
 *
 * @param outcomes    recentOutcomes ring buffer
 * @param maxWindow   How many recent outcomes to inspect (default 10)
 */
export function computeSuccessRate(
  outcomes:  DianSyncOutcomeEntry[],
  maxWindow  = 10,
): SuccessRateResult {
  const recent       = outcomes.slice(-maxWindow);
  const successCount = recent.filter(o => o.status === "succeeded").length;
  const totalCount   = recent.length;
  const rate         = totalCount === 0 ? 1 : successCount / totalCount;
  return { rate, successCount, totalCount, window: recent.length };
}

// ── Retry escalation ──────────────────────────────────────────────────────────

export interface RetryEscalationResult {
  detected:         boolean;
  consecutiveStreak: number;   // consecutive syncs with retryCount > 0
}

/**
 * Detect retry escalation: N consecutive sync executions all required retries.
 *
 * Uses the pre-computed retryStreak from DianFiscalMemoryEntry.
 *
 * @param retryStreak  DianFiscalMemoryEntry.retryStreak
 * @param minStreak    Minimum consecutive retry syncs to trigger (default 3)
 */
export function retryEscalation(
  retryStreak: number,
  minStreak    = 3,
): RetryEscalationResult {
  return {
    detected:         retryStreak >= minStreak,
    consecutiveStreak: retryStreak,
  };
}

// ── Stale fiscal sync ─────────────────────────────────────────────────────────

export interface StaleSyncResult {
  isStale:  boolean;
  daysAgo:  number | null;    // null when lastRunAt is null (never synced)
}

/**
 * Detect stale fiscal sync: no completed sync in the last N days.
 *
 * @param lastRunAt    DianFiscalMemoryEntry.lastRunAt (ISO string)
 * @param maxDaysGap   Days threshold for staleness (default 3)
 * @param now          Current date (injectable for testing)
 */
export function staleFiscalSync(
  lastRunAt:  string | undefined | null,
  maxDaysGap  = 3,
  now: Date   = new Date(),
): StaleSyncResult {
  if (!lastRunAt) return { isStale: false, daysAgo: null }; // never synced — different rule

  const lastMs  = new Date(lastRunAt).getTime();
  const nowMs   = now.getTime();
  const daysAgo = Math.floor((nowMs - lastMs) / (1000 * 60 * 60 * 24));

  return { isStale: daysAgo > maxDaysGap, daysAgo };
}

// ── Latency degradation ───────────────────────────────────────────────────────

export interface LatencyDegradationResult {
  isDegrading:  boolean;
  pctChange:    number | null;   // positive = getting slower, negative = improving
  recentAvg:    number | null;   // avg of last 5 samples
  previousAvg:  number | null;   // avg of preceding 5 samples
}

/**
 * Detect latency degradation: recent latencies significantly higher than before.
 *
 * Compares the last 5 latency samples against the preceding 5.
 * Requires ≥10 samples for a meaningful result.
 *
 * @param recentLatencies  DianFiscalMemoryEntry.recentLatencies (ring buffer)
 * @param minPctChange     Minimum % increase to trigger detection (default 50%)
 */
export function latencyDegradation(
  recentLatencies: number[],
  minPctChange     = 50,
): LatencyDegradationResult {
  if (recentLatencies.length < 10) {
    return { isDegrading: false, pctChange: null, recentAvg: null, previousAvg: null };
  }

  const recent   = recentLatencies.slice(-5);
  const previous = recentLatencies.slice(-10, -5);

  const recentAvg   = avg(recent);
  const previousAvg = avg(previous);

  if (previousAvg === 0) {
    return { isDegrading: false, pctChange: null, recentAvg, previousAvg };
  }

  const pctChange = ((recentAvg - previousAvg) / previousAvg) * 100;
  return {
    isDegrading: pctChange >= minPctChange,
    pctChange,
    recentAvg,
    previousAvg,
  };
}

// ── Recovery pattern ──────────────────────────────────────────────────────────

export interface RecoveryPatternResult {
  detected:          boolean;
  operationalStreak: number;
}

/**
 * Detect sync recovery: was failing, now succeeding for N consecutive runs.
 *
 * Uses the pre-computed operationalStreak from DianFiscalMemoryEntry.
 * Only fires as "recovery" if there's a meaningful failure history
 * (failureCount > 0) — not on fresh integrations.
 *
 * @param operationalStreak  DianFiscalMemoryEntry.operationalStreak
 * @param failureCount       DianFiscalMemoryEntry.failureCount
 * @param minStreak          Minimum consecutive successes to call "recovery" (default 3)
 */
export function recoveryPattern(
  operationalStreak: number,
  failureCount:      number,
  minStreak          = 3,
): RecoveryPatternResult {
  return {
    detected:          operationalStreak >= minStreak && failureCount > 0,
    operationalStreak,
  };
}

// ── Stable operation pattern ──────────────────────────────────────────────────

export interface StableOperationResult {
  detected:     boolean;
  successRate:  number;
  streak:       number;
}

/**
 * Detect stable fiscal operations: high success rate + long operational streak.
 *
 * @param operationalStreak  DianFiscalMemoryEntry.operationalStreak
 * @param outcomes           DianFiscalMemoryEntry.recentOutcomes
 * @param minStreak          Minimum streak to qualify as stable (default 5)
 * @param minSuccessRate     Minimum success rate over last 10 outcomes (default 0.9)
 */
export function stableOperationPattern(
  operationalStreak: number,
  outcomes:          DianSyncOutcomeEntry[],
  minStreak          = 5,
  minSuccessRate     = 0.9,
): StableOperationResult {
  const { rate } = computeSuccessRate(outcomes, 10);
  return {
    detected:    operationalStreak >= minStreak && rate >= minSuccessRate,
    successRate: rate,
    streak:      operationalStreak,
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}
