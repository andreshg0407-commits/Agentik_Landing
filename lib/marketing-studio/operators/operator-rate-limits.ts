/**
 * lib/marketing-studio/operators/operator-rate-limits.ts
 *
 * MS-19 — Channel Operator Layer: In-memory rate guard
 *
 * Prepared for Redis replacement — currently uses a module-level Map.
 * Protects channel operators from thundering-herd dispatch storms.
 */

import { OperatorRateLimitError } from "./operator-errors";
import type { OperatorChannel } from "./operator-types";

// ── Per-channel limits (requests per window) ──────────────────────────────────

const CHANNEL_LIMITS: Record<OperatorChannel, { maxPerMinute: number }> = {
  shopify:  { maxPerMinute: 40 },
  social:   { maxPerMinute: 20 },
  whatsapp: { maxPerMinute: 30 },
  catalog:  { maxPerMinute: 10 },
  ads:      { maxPerMinute: 10 },
  email:    { maxPerMinute: 10 },
  landing:  { maxPerMinute: 10 },
};

// ── In-memory counter store ───────────────────────────────────────────────────
// key = `${channel}:${orgId}`, value = { count, windowStart }

interface WindowState {
  count:       number;
  windowStart: number;
}

const _store = new Map<string, WindowState>();

const WINDOW_MS = 60_000; // 1 minute

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check + increment the rate counter for a (channel, orgId) pair.
 * Throws OperatorRateLimitError if limit exceeded.
 */
export function assertChannelNotRateLimited(
  channel: OperatorChannel,
  orgId:   string,
): void {
  const key   = `${channel}:${orgId}`;
  const now   = Date.now();
  const limit = CHANNEL_LIMITS[channel]?.maxPerMinute ?? 10;

  const state = _store.get(key);

  if (!state || now - state.windowStart > WINDOW_MS) {
    _store.set(key, { count: 1, windowStart: now });
    return;
  }

  if (state.count >= limit) {
    const retryAfterMs = WINDOW_MS - (now - state.windowStart);
    throw new OperatorRateLimitError(channel, retryAfterMs);
  }

  state.count += 1;
}

/**
 * Reset a channel's rate window (for testing or admin override).
 */
export function resetChannelRateWindow(channel: OperatorChannel, orgId: string): void {
  _store.delete(`${channel}:${orgId}`);
}

/**
 * Current window usage (for health monitoring).
 */
export function getChannelRateUsage(
  channel: OperatorChannel,
  orgId:   string,
): { count: number; limit: number; windowStartMs: number } | null {
  const state = _store.get(`${channel}:${orgId}`);
  if (!state) return null;
  return {
    count:        state.count,
    limit:        CHANNEL_LIMITS[channel]?.maxPerMinute ?? 10,
    windowStartMs: state.windowStart,
  };
}
