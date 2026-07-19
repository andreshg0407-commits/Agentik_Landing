/**
 * lib/security/anomaly/anomaly-detector.ts
 *
 * AGENTIK-SECURITY-ANOMALY-DETECTION-01
 * AnomalyDetector Contract — Interface All Detectors Implement
 *
 * No server-only. No Prisma. Pure interface contract.
 */

import type {
  AnomalyContext,
  AnomalySignal,
  AnomalyType,
  AnomalyDetectorMetadata,
  AnomalyResult,
} from "./anomaly-types";

// ── AnomalyDetector Interface ─────────────────────────────────────────────────

/**
 * AnomalyDetector — the contract every detector must implement.
 *
 * Design invariants:
 *   - evaluate() NEVER throws — always returns AnomalyResult
 *   - evaluate() returns [] when no anomaly is detected (not an error)
 *   - All signals MUST carry orgSlug from the input context
 *   - Detectors NEVER block, rotate, revoke, or delete anything
 *   - Detectors NEVER log raw secrets, OTP codes, or passwords
 *   - Detectors are stateless — all state is in context + recentSignals
 */
export interface AnomalyDetector {
  /** Stable detector ID, e.g. "login-failure-detector". */
  readonly id: string;

  /**
   * evaluate — run detection logic on the given context.
   *
   * @param context   — the triggering event context
   * @param history   — recent signals for this org (used for spike detection)
   * @returns         — array of signals (empty = no anomaly)
   */
  evaluate(
    context: AnomalyContext,
    history?: AnomalySignal[],
  ): Promise<AnomalyResult<AnomalySignal[]>>;

  /**
   * supports — whether this detector handles the given anomaly type.
   */
  supports(type: AnomalyType): boolean;

  /**
   * getMetadata — static descriptor for registry + readiness checks.
   */
  getMetadata(): AnomalyDetectorMetadata;
}
