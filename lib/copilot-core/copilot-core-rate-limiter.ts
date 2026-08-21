/**
 * lib/copilot-core/copilot-core-rate-limiter.ts
 *
 * Copilot Core — In-Memory Rate Limiter
 * Sprint: COPILOT-CONVERSATIONAL-RUNTIME-01C
 *
 * SERVER-ONLY. Best-effort rate limiting for Preview.
 * NOT a certified distributed rate limiter for production.
 *
 * Properties:
 * - Per-user-per-tenant (key: organizationId:userId)
 * - Evicts expired timestamps on each check
 * - Caps total keys at maxKeys (LRU eviction)
 * - Not exported as a mutable structure
 * - Stores only timestamps — no messages, no commercial data
 */

import "server-only";

// ── Config ───────────────────────────────────────────────────────────────────

const MAX_REQUESTS_PER_MINUTE = 10;
const MAX_REQUESTS_PER_HOUR = 100;
const MAX_KEYS = 10_000;

// ── State ────────────────────────────────────────────────────────────────────

/**
 * In-memory store. Maps key → sorted timestamps (ms).
 * NOT exported. No mutation API exposed.
 */
const store = new Map<string, number[]>();

// ── Public API ───────────────────────────────────────────────────────────────

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly retryAfterMs: number | null;
}

/**
 * Check and record a request. Returns whether the request is allowed.
 *
 * @param organizationId - Tenant identifier
 * @param userId - User identifier
 */
export function checkRateLimit(
  organizationId: string,
  userId: string,
): RateLimitResult {
  const key = `${organizationId}:${userId}`;
  const now = Date.now();

  // Evict expired entries for this key
  let timestamps = store.get(key);
  if (timestamps) {
    const oneHourAgo = now - 60 * 60 * 1000;
    timestamps = timestamps.filter((t) => t > oneHourAgo);
  } else {
    timestamps = [];
  }

  // Check per-minute limit
  const oneMinuteAgo = now - 60 * 1000;
  const recentCount = timestamps.filter((t) => t > oneMinuteAgo).length;
  if (recentCount >= MAX_REQUESTS_PER_MINUTE) {
    store.set(key, timestamps);
    const oldestRecent = timestamps.find((t) => t > oneMinuteAgo) ?? now;
    return {
      allowed: false,
      retryAfterMs: oldestRecent + 60 * 1000 - now,
    };
  }

  // Check per-hour limit
  if (timestamps.length >= MAX_REQUESTS_PER_HOUR) {
    store.set(key, timestamps);
    const oldestHour = timestamps[0] ?? now;
    return {
      allowed: false,
      retryAfterMs: oldestHour + 60 * 60 * 1000 - now,
    };
  }

  // Record this request
  timestamps.push(now);
  store.set(key, timestamps);

  // Enforce max keys (simple eviction: delete oldest key)
  if (store.size > MAX_KEYS) {
    const firstKey = store.keys().next().value;
    if (firstKey !== undefined) {
      store.delete(firstKey);
    }
  }

  return { allowed: true, retryAfterMs: null };
}

/**
 * Get current store size. For testing only.
 */
export function getRateLimiterKeyCount(): number {
  return store.size;
}
