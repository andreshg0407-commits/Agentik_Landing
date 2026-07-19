/**
 * lib/agent-runtime/execution-timeout.ts
 *
 * Agentik Execution Lifecycle — Timeout Control
 *
 * V1: Promise.race-based timeout. No workers.
 * Default: 30 seconds. Configurable per tool handler.
 *
 * Sprint: AGENTIK-AGENT-EXECUTION-LIFECYCLE-01
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TimeoutResult<T> {
  timedOut:   boolean;
  result:     T | null;
  durationMs: number;
}

// ── Timeout wrapper ───────────────────────────────────────────────────────────

export class ExecutionTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`Execution timed out after ${timeoutMs}ms`);
    this.name = "ExecutionTimeoutError";
  }
}

export async function withExecutionTimeout<T>(
  fn:        () => Promise<T>,
  timeoutMs: number = 30_000,
): Promise<TimeoutResult<T>> {
  const startedAt = Date.now();

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new ExecutionTimeoutError(timeoutMs)), timeoutMs),
  );

  try {
    const result     = await Promise.race([fn(), timeoutPromise]);
    const durationMs = Date.now() - startedAt;
    return { timedOut: false, result, durationMs };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    if (err instanceof ExecutionTimeoutError) {
      return { timedOut: true, result: null, durationMs };
    }
    throw err;
  }
}

// ── Lease expiry ──────────────────────────────────────────────────────────────

/**
 * Calculate when the lease should expire, given a tool's timeout.
 * Adds a 20% buffer so the lease outlives the actual execution.
 */
export function calculateLeaseExpiry(
  timeoutMs: number = 30_000,
  bufferFactor: number = 1.2,
): { expiresAt: string; ttlMs: number } {
  const ttlMs     = Math.round(timeoutMs * bufferFactor);
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  return { expiresAt, ttlMs };
}

// ── Stuck detection ───────────────────────────────────────────────────────────

export function hasExecutionTimedOut(
  startedAt:    string | null,
  timeoutMs:    number = 30_000,
): boolean {
  if (!startedAt) return false;
  return Date.now() - new Date(startedAt).getTime() > timeoutMs;
}

export function detectExpiredLeases(
  sessions: Array<{ id: string; leaseExpiresAt: string | null; status: string }>,
): string[] {
  const now = Date.now();
  return sessions
    .filter(s =>
      s.leaseExpiresAt !== null &&
      new Date(s.leaseExpiresAt).getTime() < now &&
      ["leasing", "validating", "running"].includes(s.status),
    )
    .map(s => s.id);
}
