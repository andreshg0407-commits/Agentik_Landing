/**
 * lib/agent-runtime/runtime-recovery.ts
 *
 * Agentik Runtime Recovery Engine
 *
 * Detects and heals interrupted execution sessions after process restart.
 * Sessions in active states with expired leases are marked as failed/timed_out
 * with reason "process_restart_or_dead_runtime".
 *
 * All mutations go through updateExecutionSession — the lifecycle state machine
 * is intentionally bypassed here because the session is orphaned (no live kernel
 * holds the current state, so normal assertTransition would throw on stale data).
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-DURABILITY-01
 */

import {
  queryExecutionSessions,
  updateExecutionSession,
  markLeaseExpired,
} from "./execution-session-store";
import { emitAgentRuntimeEvent } from "./runtime-events";
import type { RuntimeEvent }    from "./runtime-events";
import { getStoreMode }         from "./execution-store-provider";

// ── Report types ──────────────────────────────────────────────────────────────

export interface RecoveryReport {
  recovered:     number;   // leasing/validating sessions healed → failed
  zombiesMarked: number;   // running sessions with expired lease → timed_out
  leasesExpired: number;   // lease records expired during this pass
  timestamp:     string;
  storeMode:     string;
}

let _lastRecovery: RecoveryReport | null = null;

export function getLastRecoveryReport(): RecoveryReport | null {
  return _lastRecovery;
}

// ── Main recovery pass ────────────────────────────────────────────────────────

/**
 * Marks running/leasing/validating sessions with expired leases as failed.
 * Called at boot to heal sessions orphaned by process restart.
 */
export async function recoverInterruptedExecutions(orgId?: string): Promise<RecoveryReport> {
  const now  = Date.now();
  let recovered     = 0;
  let zombiesMarked = 0;
  let leasesExpired = 0;

  try {
    const activeSessions = await queryExecutionSessions({
      orgId,
      status: ["running", "leasing", "validating"],
    });

    for (const session of activeSessions) {
      // A session is interrupted if its lease has expired, or if it has been
      // "running" for more than 5 minutes without any lease on record.
      const leaseExpired = session.leaseExpiresAt
        ? new Date(session.leaseExpiresAt).getTime() < now
        : session.startedAt
          ? new Date(session.startedAt).getTime() < now - 5 * 60_000
          : false;

      if (!leaseExpired) continue;

      // Mark the lease as expired first
      try {
        await markLeaseExpired(session.id);
        leasesExpired++;
      } catch { /* best-effort */ }

      if (session.status === "running") {
        // Running + expired lease = zombie
        await updateExecutionSession(session.id, {
          status:    "timed_out",
          timedOutAt: new Date().toISOString(),
          error:     "process_restart_or_dead_runtime",
          updatedAt: new Date().toISOString(),
        });
        zombiesMarked++;

        emitRecoveryEvent("execution.zombie_detected", session.id, session.orgId, {
          reason:    "zombie_running",
          toolId:    session.toolId,
          actionId:  session.actionId,
        });
        emitRecoveryEvent("execution.recovered", session.id, session.orgId, {
          prevStatus: session.status,
          newStatus:  "timed_out",
          reason:     "process_restart",
        });
      } else {
        // leasing / validating with expired lease → mark failed
        await updateExecutionSession(session.id, {
          status:   "failed",
          failedAt: new Date().toISOString(),
          error:    "process_restart_or_dead_runtime",
          updatedAt: new Date().toISOString(),
        });
        recovered++;

        emitRecoveryEvent("execution.recovered", session.id, session.orgId, {
          prevStatus: session.status,
          newStatus:  "failed",
          reason:     "process_restart",
        });
      }
    }
  } catch (err) {
    console.error("[RuntimeRecovery] recoverInterruptedExecutions failed:", err);
  }

  const report: RecoveryReport = {
    recovered,
    zombiesMarked,
    leasesExpired,
    timestamp: new Date().toISOString(),
    storeMode: getStoreMode(),
  };
  _lastRecovery = report;
  return report;
}

// ── Targeted passes ───────────────────────────────────────────────────────────

/**
 * Expires all lease records past their expiresAt timestamp.
 * Idempotent per session. Returns count of leases expired.
 */
export async function expireDeadLeases(orgId?: string): Promise<number> {
  const now = Date.now();
  let count = 0;

  try {
    const activeSessions = await queryExecutionSessions({
      orgId,
      status: ["running", "leasing", "validating"],
    });

    for (const session of activeSessions) {
      if (!session.leaseExpiresAt) continue;
      if (new Date(session.leaseExpiresAt).getTime() >= now) continue;

      try {
        await markLeaseExpired(session.id);
        count++;
        emitRecoveryEvent("execution.lease_expired", session.id, session.orgId, {
          leaseExpiresAt: session.leaseExpiresAt,
        });
      } catch { /* best-effort */ }
    }
  } catch { /* best-effort */ }

  return count;
}

/**
 * Marks sessions still running with expired leases as timed_out (zombie pass).
 */
export async function markZombieExecutions(orgId?: string): Promise<number> {
  const now = Date.now();
  let count = 0;

  try {
    const runningSessions = await queryExecutionSessions({ orgId, status: ["running"] });

    for (const session of runningSessions) {
      const leaseExpired = session.leaseExpiresAt
        ? new Date(session.leaseExpiresAt).getTime() < now
        : false;

      if (!leaseExpired) continue;

      try {
        await updateExecutionSession(session.id, {
          status:     "timed_out",
          timedOutAt: new Date().toISOString(),
          error:      "zombie_detected",
          updatedAt:  new Date().toISOString(),
        });
        count++;
        emitRecoveryEvent("execution.zombie_detected", session.id, session.orgId, {
          toolId:         session.toolId,
          leaseExpiresAt: session.leaseExpiresAt,
        });
      } catch { /* best-effort */ }
    }
  } catch { /* best-effort */ }

  return count;
}

/**
 * Full reconciliation pass: expire leases → recover sessions.
 * Equivalent to running expireDeadLeases + recoverInterruptedExecutions.
 */
export async function reconcileExecutionSessions(orgId?: string): Promise<RecoveryReport> {
  await expireDeadLeases(orgId);
  return recoverInterruptedExecutions(orgId);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function emitRecoveryEvent(
  type:      string,
  sessionId: string,
  orgId:     string,
  extra:     Record<string, unknown> = {},
): void {
  try {
    emitAgentRuntimeEvent<RuntimeEvent>({
      type:           type as import("./runtime-events").RuntimeEventType,
      organizationId: orgId,
      agentId:        "system" as import("./agent-types").AgentRuntimeId,
      domain:         "commercial" as import("./agent-types").AgentDomain,
      moduleKey:      "runtime",
      metadata:       { sessionId, ...extra },
    });
  } catch { /* best-effort */ }
}
