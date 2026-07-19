/**
 * lib/agent-runtime/execution-session-store.ts
 *
 * Agentik Execution Lifecycle — Session Store
 *
 * V1: InMemory — adapter-ready for Prisma V2 swap.
 *
 * Sprint: AGENTIK-AGENT-EXECUTION-LIFECYCLE-01
 */

import type {
  ExecutionSession,
  ExecutionSessionFilter,
  ExecutionDiagnostics,
  ExecutionLease,
  ExecutionStatus,
} from "./execution-lifecycle-types";
import { esessId } from "./execution-lifecycle-types";

// ── Adapter contract ──────────────────────────────────────────────────────────

export interface ExecutionSessionAdapter {
  create(session: ExecutionSession): Promise<ExecutionSession>;
  getById(sessionId: string): Promise<ExecutionSession | null>;
  getByIdempotencyKey(key: string, orgId: string): Promise<ExecutionSession | null>;
  query(filter: ExecutionSessionFilter): Promise<ExecutionSession[]>;
  update(sessionId: string, patch: Partial<ExecutionSession>): Promise<ExecutionSession>;
  refreshLease(sessionId: string, ownerId: string, ttlMs: number): Promise<ExecutionSession>;
  diagnostics(orgId: string): Promise<ExecutionDiagnostics>;
}

// ── InMemory V1 ───────────────────────────────────────────────────────────────

class InMemoryExecutionSessionStore implements ExecutionSessionAdapter {
  private sessions = new Map<string, ExecutionSession>();

  async create(session: ExecutionSession): Promise<ExecutionSession> {
    this.sessions.set(session.id, session);
    return session;
  }

  async getById(sessionId: string): Promise<ExecutionSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async getByIdempotencyKey(key: string, orgId: string): Promise<ExecutionSession | null> {
    for (const s of this.sessions.values()) {
      if (s.idempotencyKey === key && s.orgId === orgId) return s;
    }
    return null;
  }

  async query(filter: ExecutionSessionFilter): Promise<ExecutionSession[]> {
    let results = [...this.sessions.values()];

    if (filter.orgId)    results = results.filter(s => s.orgId    === filter.orgId);
    if (filter.actionId) results = results.filter(s => s.actionId === filter.actionId);
    if (filter.toolId)   results = results.filter(s => s.toolId   === filter.toolId);
    if (filter.agentId)  results = results.filter(s => s.agentId  === filter.agentId);
    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      results = results.filter(s => statuses.includes(s.status));
    }
    if (filter.since) results = results.filter(s => s.createdAt >= filter.since!);

    results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (filter.limit) results = results.slice(0, filter.limit);
    return results;
  }

  async update(sessionId: string, patch: Partial<ExecutionSession>): Promise<ExecutionSession> {
    const existing = this.sessions.get(sessionId);
    if (!existing) throw new Error(`Session ${sessionId} not found`);
    const updated: ExecutionSession = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.sessions.set(sessionId, updated);
    return updated;
  }

  async refreshLease(sessionId: string, ownerId: string, ttlMs: number): Promise<ExecutionSession> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    if (!session.lease) throw new Error(`Session ${sessionId} has no active lease`);
    if (session.lease.status !== "active") {
      throw new Error(`Lease for session ${sessionId} is not active (status: ${session.lease.status})`);
    }
    if (session.lease.ownerId !== ownerId) {
      throw new Error(`Lease for session ${sessionId} is owned by ${session.lease.ownerId}, not ${ownerId}`);
    }
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    const updatedLease = { ...session.lease, expiresAt };
    const updated: ExecutionSession = {
      ...session,
      leaseExpiresAt: expiresAt,
      lease:          updatedLease,
      updatedAt:      new Date().toISOString(),
    };
    this.sessions.set(sessionId, updated);
    return updated;
  }

  async diagnostics(orgId: string): Promise<ExecutionDiagnostics> {
    const all = orgId
      ? [...this.sessions.values()].filter(s => s.orgId === orgId)
      : [...this.sessions.values()];

    const now = Date.now();
    let stuck = 0;
    let activeLeases = 0;
    let expiredLeases = 0;
    let totalDuration = 0;
    let durationCount = 0;

    const counts: Record<ExecutionStatus, number> = {
      queued: 0, leasing: 0, validating: 0, running: 0,
      succeeded: 0, failed: 0, retry_scheduled: 0, canceled: 0,
      timed_out: 0, skipped: 0, rejected: 0,
    };

    for (const s of all) {
      counts[s.status]++;
      if (s.lease) {
        const expired = new Date(s.lease.expiresAt).getTime() < now;
        if (s.lease.status === "active") {
          if (expired) { expiredLeases++; if (s.status === "running") stuck++; }
          else activeLeases++;
        } else if (s.lease.status === "expired") expiredLeases++;
      }
      if (s.durationMs !== null) { totalDuration += s.durationMs; durationCount++; }
    }

    // Count idempotency keys across all sessions
    const idempotencyKeys = new Set(
      all.filter(s => s.idempotencyKey).map(s => s.idempotencyKey!),
    ).size;

    // Count total attempts across all sessions
    const totalAttempts = all.reduce((sum, s) => sum + s.attempts.length, 0);

    return {
      totalSessions:   all.length,
      running:         counts.running + counts.validating + counts.leasing,
      succeeded:       counts.succeeded,
      failed:          counts.failed,
      timedOut:        counts.timed_out,
      retryScheduled:  counts.retry_scheduled,
      canceled:        counts.canceled,
      rejected:        counts.rejected,
      skipped:         counts.skipped,
      queued:          counts.queued,
      stuck,
      activeLeases,
      expiredLeases,
      idempotencyKeys,
      totalAttempts,
      activeHeartbeats: 0, // Populated by getExecutionDiagnostics via heartbeat registry
      avgDurationMs:   durationCount > 0 ? Math.round(totalDuration / durationCount) : null,
      storeType:       "InMemoryExecutionSessionStore V1",
    };
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _store: ExecutionSessionAdapter = new InMemoryExecutionSessionStore();

export function setExecutionSessionAdapter(adapter: ExecutionSessionAdapter): void {
  _store = adapter;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function buildNewSession(opts: {
  orgId:          string;
  actionId:       string;
  toolId:         string;
  agentId:        string;
  moduleKey:      string;
  payload:        Record<string, unknown>;
  idempotencyKey: string | null;
  correlationId:  string | null;
  causationId:    string | null;
  maxAttempts:    number;
}): ExecutionSession {
  const now = new Date().toISOString();
  return {
    id:             esessId(),
    orgId:          opts.orgId,
    actionId:       opts.actionId,
    toolId:         opts.toolId,
    agentId:        opts.agentId,
    moduleKey:      opts.moduleKey,
    status:         "queued",
    attempt:        0,
    maxAttempts:    opts.maxAttempts,
    leaseOwner:     null,
    leaseExpiresAt: null,
    startedAt:      null,
    completedAt:    null,
    failedAt:       null,
    canceledAt:     null,
    timedOutAt:     null,
    durationMs:     null,
    idempotencyKey: opts.idempotencyKey,
    correlationId:  opts.correlationId,
    causationId:    opts.causationId,
    payload:        opts.payload,
    result:         null,
    error:          null,
    errorCode:      null,
    events:         [],
    attempts:       [],
    lease:          null,
    createdAt:      now,
    updatedAt:      now,
  };
}

export async function createExecutionSession(
  session: ExecutionSession,
): Promise<ExecutionSession> {
  return _store.create(session);
}

export async function getExecutionSession(
  sessionId: string,
): Promise<ExecutionSession | null> {
  return _store.getById(sessionId);
}

export async function findSessionByIdempotencyKey(
  key:   string,
  orgId: string,
): Promise<ExecutionSession | null> {
  return _store.getByIdempotencyKey(key, orgId);
}

export async function queryExecutionSessions(
  filter: ExecutionSessionFilter,
): Promise<ExecutionSession[]> {
  return _store.query(filter);
}

export async function updateExecutionSession(
  sessionId: string,
  patch:     Partial<ExecutionSession>,
): Promise<ExecutionSession> {
  return _store.update(sessionId, patch);
}

export async function getStuckExecutions(
  orgId:         string,
  thresholdMins: number = 5,
): Promise<ExecutionSession[]> {
  const cutoff = new Date(Date.now() - thresholdMins * 60_000).toISOString();
  const running = await _store.query({ orgId, status: ["running", "leasing", "validating"] });
  return running.filter(s => {
    if (!s.leaseExpiresAt) return s.startedAt !== null && s.startedAt < cutoff;
    return new Date(s.leaseExpiresAt).getTime() < Date.now();
  });
}

export async function getExecutionDiagnostics(
  orgId: string,
  activeHeartbeats: number = 0,
): Promise<ExecutionDiagnostics> {
  const diag = await _store.diagnostics(orgId);
  return { ...diag, activeHeartbeats };
}

export async function refreshExecutionLease(
  sessionId: string,
  ownerId:   string,
  ttlMs:     number = 36_000,
): Promise<ExecutionSession> {
  return _store.refreshLease(sessionId, ownerId, ttlMs);
}

// ── Lease helpers ─────────────────────────────────────────────────────────────

export async function acquireExecutionLease(
  sessionId: string,
  ownerId:   string,
  ttlMs:     number = 30_000,
): Promise<ExecutionLease> {
  const now       = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  const lease: ExecutionLease = {
    sessionId,
    ownerId,
    acquiredAt: now.toISOString(),
    expiresAt,
    releasedAt: null,
    status:     "active",
  };
  await _store.update(sessionId, {
    leaseOwner:     ownerId,
    leaseExpiresAt: expiresAt,
    lease,
  });
  return lease;
}

export async function releaseExecutionLease(
  sessionId: string,
): Promise<void> {
  const session = await _store.getById(sessionId);
  if (!session?.lease) return;
  const updatedLease: ExecutionLease = {
    ...session.lease,
    releasedAt: new Date().toISOString(),
    status:     "released",
  };
  await _store.update(sessionId, {
    leaseOwner:     null,
    leaseExpiresAt: null,
    lease:          updatedLease,
  });
}

export async function markLeaseExpired(
  sessionId: string,
): Promise<void> {
  const session = await _store.getById(sessionId);
  if (!session?.lease) return;
  const updatedLease: ExecutionLease = {
    ...session.lease,
    status: "expired",
  };
  await _store.update(sessionId, { lease: updatedLease });
}
