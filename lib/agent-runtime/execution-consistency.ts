/**
 * lib/agent-runtime/execution-consistency.ts
 *
 * Agentik Execution Consistency Checker
 *
 * Diagnostics-only integrity checks for the execution session store.
 * Detects anomalies and emits warnings — NEVER auto-repairs state.
 * All mutations must go through the lifecycle state machine.
 *
 * Checks:
 *   corruptedSessions  — sessions with impossible state combinations
 *   orphanAttempts     — attempts with attemptNumber > maxAttempts
 *   zombieLeases       — terminal sessions with an active lease still held
 *   staleSessions      — running sessions with no lease > 10 min stale
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-DURABILITY-01
 */

import { queryExecutionSessions } from "./execution-session-store";
import type { ExecutionSession } from "./execution-lifecycle-types";
import { emitAgentRuntimeEvent } from "./runtime-events";
import type { RuntimeEvent }    from "./runtime-events";

// ── Report types ──────────────────────────────────────────────────────────────

export interface ConsistencyReport {
  corruptedSessions: string[];  // session IDs
  orphanAttempts:    string[];  // "sessionId:attN" keys
  zombieLeases:      string[];  // session IDs with unreleased lease post-terminal
  staleSessions:     string[];  // session IDs
  totalIssues:       number;
  clean:             boolean;
  timestamp:         string;
  orgId?:            string;
}

// ── Main entry ────────────────────────────────────────────────────────────────

/**
 * Full consistency scan for an org's sessions.
 * Read-only — no side effects beyond emitting a consistency_warning event.
 */
export async function validateExecutionConsistency(
  orgId?: string,
): Promise<ConsistencyReport> {
  const sessions = await queryExecutionSessions({ orgId, limit: 500 });

  const corruptedSessions = detectCorruptedSessions(sessions);
  const orphanAttempts    = detectOrphanAttempts(sessions);
  const zombieLeases      = detectZombieLeases(sessions);
  const staleSessions     = detectStaleSessions(sessions);

  const totalIssues =
    corruptedSessions.length +
    orphanAttempts.length   +
    zombieLeases.length     +
    staleSessions.length;

  const report: ConsistencyReport = {
    corruptedSessions,
    orphanAttempts,
    zombieLeases,
    staleSessions,
    totalIssues,
    clean:     totalIssues === 0,
    timestamp: new Date().toISOString(),
    orgId,
  };

  if (totalIssues > 0) {
    emitConsistencyWarning(orgId ?? "system", report);
  }

  return report;
}

// ── Individual checks ─────────────────────────────────────────────────────────

/**
 * Sessions whose current status is impossible given the state machine.
 * Example: succeeded but attempt === 0 (never ran).
 */
export function detectCorruptedSessions(sessions: ExecutionSession[]): string[] {
  return sessions
    .filter(s => {
      if (s.status === "succeeded" && s.attempt === 0)           return true;
      if (s.status === "failed" && s.attempt === 0
          && s.attempts.length === 0 && s.error === null)       return true;
      return false;
    })
    .map(s => s.id);
}

/**
 * Attempt records whose attemptNumber exceeds the session's maxAttempts.
 * These should never exist under normal execution.
 */
export function detectOrphanAttempts(sessions: ExecutionSession[]): string[] {
  const orphans: string[] = [];
  for (const s of sessions) {
    for (const att of s.attempts) {
      if (att.attemptNumber > s.maxAttempts) {
        orphans.push(`${s.id}:att${att.attemptNumber}`);
      }
    }
  }
  return orphans;
}

/**
 * Sessions in a terminal state that still have an active lease.
 * Indicates the lease was never released (e.g. crash in finally block).
 */
export function detectZombieLeases(sessions: ExecutionSession[]): string[] {
  const TERMINAL: Set<string> = new Set([
    "succeeded", "failed", "canceled", "timed_out", "skipped", "rejected",
  ]);
  return sessions
    .filter(s => TERMINAL.has(s.status) && s.lease?.status === "active")
    .map(s => s.id);
}

/**
 * Running sessions with no active lease and startedAt older than 10 minutes.
 * These are likely stuck and missed by the recovery pass (e.g. no lease record).
 */
export function detectStaleSessions(sessions: ExecutionSession[]): string[] {
  const CUTOFF_MS = 10 * 60_000;
  const cutoff    = Date.now() - CUTOFF_MS;
  return sessions
    .filter(s => {
      if (s.status !== "running")                      return false;
      if (s.lease && s.lease.status === "active")      return false;
      if (!s.startedAt)                                return false;
      return new Date(s.startedAt).getTime() < cutoff;
    })
    .map(s => s.id);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function emitConsistencyWarning(orgId: string, report: ConsistencyReport): void {
  try {
    emitAgentRuntimeEvent<RuntimeEvent>({
      type:           "execution.consistency_warning",
      organizationId: orgId,
      agentId:        "system" as import("./agent-types").AgentRuntimeId,
      domain:         "commercial" as import("./agent-types").AgentDomain,
      moduleKey:      "runtime",
      metadata: {
        totalIssues:      report.totalIssues,
        corruptedCount:   report.corruptedSessions.length,
        orphanCount:      report.orphanAttempts.length,
        zombieLeaseCount: report.zombieLeases.length,
        staleCount:       report.staleSessions.length,
      },
    });
  } catch { /* best-effort */ }
}
