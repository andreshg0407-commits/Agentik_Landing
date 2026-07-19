/**
 * lib/agent-runtime/prisma-execution-store.ts
 *
 * Agentik Runtime — Prisma Execution Store Adapter
 *
 * Implements ExecutionSessionAdapter using Prisma as the backing store.
 * Enabled via AGENTIK_RUNTIME_STORE=prisma.
 *
 * RAM is still used as a read-through cache layer (future V2 optimization).
 * For now, every operation goes directly to Prisma.
 *
 * Mapping:
 *   ExecutionSession  ↔  RuntimeExecutionSession + RuntimeExecutionAttempt[] + RuntimeExecutionLease
 *   ExecutionAttempt  ↔  RuntimeExecutionAttempt
 *   ExecutionLease    ↔  RuntimeExecutionLease
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-DURABILITY-01
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type {
  ExecutionSession,
  ExecutionAttempt,
  ExecutionLease,
  ExecutionSessionFilter,
  ExecutionDiagnostics,
  ExecutionStatus,
  LeaseStatus,
} from "./execution-lifecycle-types";
import type { ExecutionSessionAdapter } from "./execution-session-store";

// ── Prisma result types ───────────────────────────────────────────────────────

type PrismaSession = Prisma.RuntimeExecutionSessionGetPayload<{
  include: {
    attempts: true;
    leases:   { orderBy: { createdAt: "desc" }; take: 1 };
  };
}>;

type PrismaAttempt = Prisma.RuntimeExecutionAttemptGetPayload<Record<string, never>>;
type PrismaLease   = Prisma.RuntimeExecutionLeaseGetPayload<Record<string, never>>;

// ── Domain ↔ Prisma mappers ───────────────────────────────────────────────────

function toAttempt(p: PrismaAttempt): ExecutionAttempt {
  const errJson = p.error as { message?: string } | null;
  return {
    id:              p.id,
    sessionId:       p.sessionId,
    attemptNumber:   p.attemptNumber,
    status:          p.status as ExecutionAttempt["status"],
    startedAt:       p.startedAt?.toISOString() ?? new Date().toISOString(),
    completedAt:     p.completedAt?.toISOString() ?? null,
    durationMs:      p.durationMs,
    error:           errJson?.message ?? null,
    retryable:       p.retryable,
    nextRetryAt:     p.nextRetryAt?.toISOString() ?? null,
    parentAttemptId: p.parentAttemptId,
    retryReason:     p.retryReason,
  };
}

function toLease(p: PrismaLease): ExecutionLease {
  return {
    sessionId:  p.sessionId,
    ownerId:    p.ownerId,
    acquiredAt: p.acquiredAt.toISOString(),
    expiresAt:  p.expiresAt.toISOString(),
    releasedAt: p.releasedAt?.toISOString() ?? null,
    status:     p.status as LeaseStatus,
  };
}

function toSession(p: PrismaSession): ExecutionSession {
  const errJson   = p.error as { message?: string; code?: string } | null;
  const latestLease = p.leases[0] ?? null;

  return {
    id:             p.id,
    orgId:          p.organizationId,
    actionId:       p.actionId,
    toolId:         p.toolId,
    agentId:        p.agentId,
    moduleKey:      p.moduleKey ?? "unknown",
    status:         p.status as ExecutionStatus,
    attempt:        p.attempt,
    maxAttempts:    p.maxAttempts,
    leaseOwner:     p.leaseOwner,
    leaseExpiresAt: p.leaseExpiresAt?.toISOString() ?? null,
    startedAt:      p.startedAt?.toISOString() ?? null,
    completedAt:    p.completedAt?.toISOString() ?? null,
    failedAt:       p.failedAt?.toISOString() ?? null,
    canceledAt:     p.canceledAt?.toISOString() ?? null,
    timedOutAt:     p.timedOutAt?.toISOString() ?? null,
    durationMs:     p.durationMs,
    idempotencyKey: p.idempotencyKey,
    correlationId:  p.correlationId,
    causationId:    p.causationId,
    payload:        (p.payload as Record<string, unknown>) ?? {},
    result:         (p.result  as Record<string, unknown>) ?? null,
    error:          errJson?.message ?? null,
    errorCode:      errJson?.code    ?? null,
    events:         [],   // event IDs tracked separately in event store
    attempts:       p.attempts.map(toAttempt),
    lease:          latestLease ? toLease(latestLease) : null,
    createdAt:      p.createdAt.toISOString(),
    updatedAt:      p.updatedAt.toISOString(),
  };
}

/** Fetches a session by ID with all includes needed for domain mapping. */
async function fetchFull(sessionId: string): Promise<PrismaSession | null> {
  return prisma.runtimeExecutionSession.findUnique({
    where:   { id: sessionId },
    include: {
      attempts: { orderBy: { attemptNumber: "asc" } },
      leases:   { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
}

/** Extracts scalar update fields from a session patch. */
function scalarPatch(patch: Partial<ExecutionSession>): Prisma.RuntimeExecutionSessionUpdateInput {
  const d: Prisma.RuntimeExecutionSessionUpdateInput = {};

  if ("status"         in patch) d.status         = patch.status;
  if ("attempt"        in patch) d.attempt        = patch.attempt;
  if ("maxAttempts"    in patch) d.maxAttempts    = patch.maxAttempts;
  if ("leaseOwner"     in patch) d.leaseOwner     = patch.leaseOwner;
  if ("leaseExpiresAt" in patch) d.leaseExpiresAt = patch.leaseExpiresAt ? new Date(patch.leaseExpiresAt) : null;
  if ("startedAt"      in patch) d.startedAt      = patch.startedAt  ? new Date(patch.startedAt)  : null;
  if ("completedAt"    in patch) d.completedAt    = patch.completedAt ? new Date(patch.completedAt) : null;
  if ("failedAt"       in patch) d.failedAt       = patch.failedAt   ? new Date(patch.failedAt)   : null;
  if ("canceledAt"     in patch) d.canceledAt     = patch.canceledAt ? new Date(patch.canceledAt) : null;
  if ("timedOutAt"     in patch) d.timedOutAt     = patch.timedOutAt ? new Date(patch.timedOutAt) : null;
  if ("durationMs"     in patch) d.durationMs     = patch.durationMs;
  if ("idempotencyKey" in patch) d.idempotencyKey = patch.idempotencyKey;
  if ("correlationId"  in patch) d.correlationId  = patch.correlationId;
  if ("causationId"    in patch) d.causationId    = patch.causationId;
  if ("payload"        in patch) d.payload        = (patch.payload ?? {}) as Prisma.InputJsonValue;
  if ("result"         in patch) d.result         = patch.result ? (patch.result as Prisma.InputJsonValue) : Prisma.DbNull;

  // Combine error + errorCode into a single JSON column
  if ("error" in patch || "errorCode" in patch) {
    const msg  = "error"     in patch ? patch.error     : undefined;
    const code = "errorCode" in patch ? patch.errorCode : undefined;
    if (msg == null && code == null) {
      d.error = Prisma.DbNull;
    } else {
      d.error = { message: msg ?? null, code: code ?? null } as Prisma.InputJsonValue;
    }
  }

  return d;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class PrismaExecutionStore implements ExecutionSessionAdapter {

  async create(session: ExecutionSession): Promise<ExecutionSession> {
    const errJson = (session.error || session.errorCode)
      ? { message: session.error, code: session.errorCode }
      : null;

    await prisma.$transaction(async tx => {
      await tx.runtimeExecutionSession.create({
        data: {
          id:             session.id,
          organizationId: session.orgId,
          actionId:       session.actionId,
          toolId:         session.toolId,
          agentId:        session.agentId,
          moduleKey:      session.moduleKey,
          status:         session.status,
          attempt:        session.attempt,
          maxAttempts:    session.maxAttempts,
          leaseOwner:     session.leaseOwner,
          leaseExpiresAt: session.leaseExpiresAt ? new Date(session.leaseExpiresAt) : null,
          startedAt:      session.startedAt  ? new Date(session.startedAt)  : null,
          completedAt:    session.completedAt ? new Date(session.completedAt) : null,
          failedAt:       session.failedAt   ? new Date(session.failedAt)   : null,
          canceledAt:     session.canceledAt ? new Date(session.canceledAt) : null,
          timedOutAt:     session.timedOutAt ? new Date(session.timedOutAt) : null,
          durationMs:     session.durationMs,
          idempotencyKey: session.idempotencyKey,
          correlationId:  session.correlationId,
          causationId:    session.causationId,
          payload:        session.payload as Prisma.InputJsonValue,
          result:         session.result ? (session.result as Prisma.InputJsonValue) : Prisma.DbNull,
          error:          errJson ? (errJson as Prisma.InputJsonValue) : Prisma.DbNull,
        },
      });

      // Create initial lease record if present
      if (session.lease) {
        await tx.runtimeExecutionLease.create({
          data: {
            sessionId:  session.id,
            ownerId:    session.lease.ownerId,
            status:     session.lease.status,
            acquiredAt: new Date(session.lease.acquiredAt),
            expiresAt:  new Date(session.lease.expiresAt),
            releasedAt: session.lease.releasedAt ? new Date(session.lease.releasedAt) : null,
          },
        });
      }
    });

    const full = await fetchFull(session.id);
    return full ? toSession(full) : session;
  }

  async getById(sessionId: string): Promise<ExecutionSession | null> {
    const p = await fetchFull(sessionId);
    return p ? toSession(p) : null;
  }

  async getByIdempotencyKey(key: string, orgId: string): Promise<ExecutionSession | null> {
    const p = await prisma.runtimeExecutionSession.findFirst({
      where:   { idempotencyKey: key, organizationId: orgId },
      include: {
        attempts: { orderBy: { attemptNumber: "asc" } },
        leases:   { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });
    return p ? toSession(p as PrismaSession) : null;
  }

  async query(filter: ExecutionSessionFilter): Promise<ExecutionSession[]> {
    const where: Prisma.RuntimeExecutionSessionWhereInput = {};
    if (filter.orgId)    where.organizationId = filter.orgId;
    if (filter.actionId) where.actionId       = filter.actionId;
    if (filter.toolId)   where.toolId         = filter.toolId;
    if (filter.agentId)  where.agentId        = filter.agentId;
    if (filter.since)    where.createdAt      = { gte: new Date(filter.since) };
    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      where.status = { in: statuses };
    }

    const rows = await prisma.runtimeExecutionSession.findMany({
      where,
      include: {
        attempts: { orderBy: { attemptNumber: "asc" } },
        leases:   { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      take:    filter.limit ?? 100,
    });

    return rows.map(r => toSession(r as PrismaSession));
  }

  async update(sessionId: string, patch: Partial<ExecutionSession>): Promise<ExecutionSession> {
    const scalars = scalarPatch(patch);

    await prisma.$transaction(async tx => {
      // Update scalar fields on the session
      if (Object.keys(scalars).length > 0) {
        await tx.runtimeExecutionSession.update({
          where: { id: sessionId },
          data:  scalars,
        });
      }

      // Sync attempts if provided
      if (patch.attempts !== undefined) {
        for (const att of patch.attempts) {
          const errJson = att.error ? { message: att.error } : null;
          await tx.runtimeExecutionAttempt.upsert({
            where:  { id: att.id },
            create: {
              id:              att.id,
              sessionId,
              attemptNumber:   att.attemptNumber,
              status:          att.status,
              parentAttemptId: att.parentAttemptId,
              retryReason:     att.retryReason,
              startedAt:       att.startedAt ? new Date(att.startedAt) : null,
              completedAt:     att.completedAt ? new Date(att.completedAt) : null,
              durationMs:      att.durationMs,
              error:           errJson ? (errJson as Prisma.InputJsonValue) : Prisma.DbNull,
              retryable:       att.retryable,
              nextRetryAt:     att.nextRetryAt ? new Date(att.nextRetryAt) : null,
            },
            update: {
              status:      att.status,
              completedAt: att.completedAt ? new Date(att.completedAt) : null,
              durationMs:  att.durationMs,
              error:       errJson ? (errJson as Prisma.InputJsonValue) : Prisma.DbNull,
              retryable:   att.retryable,
              nextRetryAt: att.nextRetryAt ? new Date(att.nextRetryAt) : null,
              retryReason: att.retryReason,
            },
          });
        }
      }

      // Sync lease if provided
      if (patch.lease !== undefined) {
        const lease = patch.lease;
        if (lease) {
          await tx.runtimeExecutionLease.upsert({
            where:  { id: `${sessionId}-lease` },
            create: {
              id:         `${sessionId}-lease`,
              sessionId,
              ownerId:    lease.ownerId,
              status:     lease.status,
              acquiredAt: new Date(lease.acquiredAt),
              expiresAt:  new Date(lease.expiresAt),
              releasedAt: lease.releasedAt ? new Date(lease.releasedAt) : null,
            },
            update: {
              status:     lease.status,
              expiresAt:  new Date(lease.expiresAt),
              releasedAt: lease.releasedAt ? new Date(lease.releasedAt) : null,
            },
          });
        }
      }
    });

    const full = await fetchFull(sessionId);
    if (!full) throw new Error(`Session ${sessionId} not found after update`);
    return toSession(full);
  }

  async refreshLease(sessionId: string, ownerId: string, ttlMs: number): Promise<ExecutionSession> {
    // Find the active lease for this session
    const lease = await prisma.runtimeExecutionLease.findFirst({
      where: { sessionId, status: "active" },
      orderBy: { createdAt: "desc" },
    });

    if (!lease) throw new Error(`No active lease for session ${sessionId}`);
    if (lease.ownerId !== ownerId) {
      throw new Error(`Lease for session ${sessionId} is owned by ${lease.ownerId}, not ${ownerId}`);
    }

    const now       = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    await prisma.$transaction([
      // Update lease with new expiry and heartbeat timestamp
      prisma.runtimeExecutionLease.update({
        where: { id: lease.id },
        data:  { expiresAt, heartbeatAt: now },
      }),
      // Mirror leaseExpiresAt on the session for fast queries
      prisma.runtimeExecutionSession.update({
        where: { id: sessionId },
        data:  { leaseExpiresAt: expiresAt },
      }),
    ]);

    const full = await fetchFull(sessionId);
    if (!full) throw new Error(`Session ${sessionId} not found after lease refresh`);
    return toSession(full);
  }

  async diagnostics(orgId: string): Promise<ExecutionDiagnostics> {
    const where: Prisma.RuntimeExecutionSessionWhereInput = orgId ? { organizationId: orgId } : {};

    const [grouped, totalSessions, totalAttempts, activeLeases, expiredLeases] = await Promise.all([
      prisma.runtimeExecutionSession.groupBy({
        by:    ["status"],
        where,
        _count: { id: true },
      }),
      prisma.runtimeExecutionSession.count({ where }),
      prisma.runtimeExecutionAttempt.count({
        where: orgId
          ? { session: { organizationId: orgId } }
          : {},
      }),
      prisma.runtimeExecutionLease.count({
        where: {
          status:    "active",
          expiresAt: { gt: new Date() },
          ...(orgId ? { session: { organizationId: orgId } } : {}),
        },
      }),
      prisma.runtimeExecutionLease.count({
        where: {
          status:    "active",
          expiresAt: { lte: new Date() },
          ...(orgId ? { session: { organizationId: orgId } } : {}),
        },
      }),
    ]);

    const counts: Record<string, number> = {};
    for (const row of grouped) {
      counts[row.status] = row._count.id;
    }

    const running = (counts["running"] ?? 0) + (counts["validating"] ?? 0) + (counts["leasing"] ?? 0);

    // Stuck: running sessions with expired lease
    const stuck = await prisma.runtimeExecutionSession.count({
      where: {
        ...where,
        status:        { in: ["running", "validating", "leasing"] },
        leaseExpiresAt: { lte: new Date() },
      },
    });

    const idempotencyKeys = await prisma.runtimeExecutionSession.findMany({
      where:  { ...where, idempotencyKey: { not: null } },
      select: { idempotencyKey: true },
      distinct: ["idempotencyKey"],
    });

    // Average duration from succeeded sessions
    const durationAgg = await prisma.runtimeExecutionSession.aggregate({
      where: { ...where, status: "succeeded", durationMs: { not: null } },
      _avg:  { durationMs: true },
    });

    return {
      totalSessions,
      running,
      succeeded:       counts["succeeded"]       ?? 0,
      failed:          counts["failed"]           ?? 0,
      timedOut:        counts["timed_out"]        ?? 0,
      retryScheduled:  counts["retry_scheduled"]  ?? 0,
      canceled:        counts["canceled"]         ?? 0,
      rejected:        counts["rejected"]         ?? 0,
      skipped:         counts["skipped"]          ?? 0,
      queued:          counts["queued"]           ?? 0,
      stuck,
      activeLeases,
      expiredLeases,
      idempotencyKeys: idempotencyKeys.length,
      totalAttempts,
      activeHeartbeats: 0,  // Heartbeat count is process-local, not queryable from DB
      avgDurationMs:   durationAgg._avg.durationMs
        ? Math.round(durationAgg._avg.durationMs)
        : null,
      storeType: "PrismaExecutionStore V1",
    };
  }
}
