/**
 * lib/agent-runtime/execution-heartbeat.ts
 *
 * Agentik Execution Lifecycle — Lease Heartbeat
 *
 * Keeps execution leases alive during long-running tool handlers by
 * refreshing the lease TTL on a regular interval.
 *
 * V1 contract:
 * - setInterval-based, in-process only
 * - Refresh every 10s, TTL 36s (lease always outlives the refresh window)
 * - Best-effort: a failed refresh is logged and ignored — never aborts execution
 * - Always cleaned up in the kernel's finally block
 *
 * Sprint: AGENTIK-AGENT-EXECUTION-LIFECYCLE-HARDENING-01
 */

import { refreshExecutionLease } from "./execution-session-store";
import { emitAgentRuntimeEvent }  from "./runtime-events";
import type { RuntimeEvent }      from "./runtime-events";
import type {
  AgentRuntimeId,
  AgentDomain,
}                                 from "./agent-types";

// ── Active heartbeat registry ─────────────────────────────────────────────────

const _activeHeartbeats = new Map<string, ReturnType<typeof setInterval>>();

export function getActiveHeartbeatCount(): number {
  return _activeHeartbeats.size;
}

// ── Heartbeat control ─────────────────────────────────────────────────────────

export interface HeartbeatOptions {
  intervalMs?: number;   // How often to refresh (default: 10_000ms)
  ttlMs?:      number;   // Lease TTL per refresh (default: 36_000ms)
  orgId?:      string;
  agentId?:    string;
  moduleKey?:  string;
}

/**
 * Starts a periodic lease refresh for a running execution session.
 * Returns a `stop` function — MUST be called in the finally block of execution.
 *
 * The heartbeat is best-effort: a refresh failure never throws or aborts execution.
 */
export function startExecutionHeartbeat(
  sessionId: string,
  ownerId:   string,
  opts:      HeartbeatOptions = {},
): () => void {
  const intervalMs = opts.intervalMs ?? 10_000;
  const ttlMs      = opts.ttlMs      ?? 36_000;

  const intervalId = setInterval(async () => {
    try {
      await refreshExecutionLease(sessionId, ownerId, ttlMs);

      // Emit heartbeat event (best-effort, no correlation needed)
      try {
        emitAgentRuntimeEvent<RuntimeEvent>({
          type:           "execution.heartbeat",
          organizationId: opts.orgId ?? "unknown",
          agentId:        (opts.agentId ?? "unknown") as AgentRuntimeId,
          domain:         "commercial" as AgentDomain,
          moduleKey:      opts.moduleKey ?? "unknown",
          metadata:       { sessionId, ttlMs, refreshedAt: new Date().toISOString() },
        });
      } catch { /* never block on event failure */ }

    } catch {
      // Refresh failed — log silently, never propagate
      // Execution continues; lease may expire naturally if this keeps failing
    }
  }, intervalMs);

  _activeHeartbeats.set(sessionId, intervalId);

  return function stopHeartbeat() {
    clearInterval(intervalId);
    _activeHeartbeats.delete(sessionId);
  };
}

/**
 * Stops a heartbeat for a session, if one is running.
 * Idempotent — safe to call even if no heartbeat exists.
 */
export function stopExecutionHeartbeat(sessionId: string): void {
  const intervalId = _activeHeartbeats.get(sessionId);
  if (intervalId !== undefined) {
    clearInterval(intervalId);
    _activeHeartbeats.delete(sessionId);
  }
}
