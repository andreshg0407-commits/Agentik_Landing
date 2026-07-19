/**
 * lib/autonomous/autonomous-safety.ts
 *
 * Agentik — Autonomous Operations — Safety Limits (Loop Protection)
 * Sprint: AGENTIK-AUTONOMOUS-OPERATIONS-01
 *
 * Constants and pure helpers that protect against:
 *   - Runaway operation chains (too many operations per run)
 *   - Deep recursive chains (chain depth exceeded)
 *   - Excessive retries
 *
 * All helpers are pure functions — no side effects.
 *
 * Pure domain. No Prisma. No React. No server-only.
 */

// ── Safety limits ─────────────────────────────────────────────────────────────

/** Maximum number of autonomous operations allowed in a single orchestration run. */
export const MAX_OPERATIONS_PER_RUN = 10;

/**
 * Maximum depth of a chained autonomous execution.
 * Depth = how many times an operation triggered another operation recursively.
 */
export const MAX_CHAIN_DEPTH = 3;

/** Maximum number of retries for a failed autonomous operation before giving up. */
export const MAX_AUTONOMOUS_RETRIES = 2;

// ── Limit checkers ────────────────────────────────────────────────────────────

/**
 * Returns true if the number of operations in this run has reached the limit.
 */
export function hasExceededOperationLimit(count: number): boolean {
  return count >= MAX_OPERATIONS_PER_RUN;
}

/**
 * Returns true if the chain depth has reached or exceeded the maximum.
 */
export function hasExceededDepth(depth: number): boolean {
  return depth >= MAX_CHAIN_DEPTH;
}

/**
 * Returns true if the retry count has reached or exceeded the maximum.
 */
export function hasExceededRetryLimit(retries: number): boolean {
  return retries >= MAX_AUTONOMOUS_RETRIES;
}

// ── Safety check result ───────────────────────────────────────────────────────

export interface SafetyCheckResult {
  safe:   boolean;
  reason: string;
}

/**
 * Runs all safety checks for an operation.
 * Returns { safe: false, reason } if any limit is exceeded.
 * Returns { safe: true, reason: "" } if all checks pass.
 */
export function checkSafetyLimits(params: {
  operationCount: number;
  chainDepth:     number;
  retryCount:     number;
}): SafetyCheckResult {
  if (hasExceededOperationLimit(params.operationCount)) {
    return {
      safe:   false,
      reason: `Operation limit exceeded: ${params.operationCount} >= ${MAX_OPERATIONS_PER_RUN} max per run.`,
    };
  }

  if (hasExceededDepth(params.chainDepth)) {
    return {
      safe:   false,
      reason: `Chain depth exceeded: ${params.chainDepth} >= ${MAX_CHAIN_DEPTH} max depth.`,
    };
  }

  if (hasExceededRetryLimit(params.retryCount)) {
    return {
      safe:   false,
      reason: `Retry limit exceeded: ${params.retryCount} >= ${MAX_AUTONOMOUS_RETRIES} max retries.`,
    };
  }

  return { safe: true, reason: "" };
}
