/**
 * lib/marketing-studio/execution/execution-repository.ts
 *
 * MS-13 — Execution Runtime: Repository layer
 *
 * All Prisma access for the execution runtime.
 * Bridges CommerceJob ↔ ExecutionJob.
 * organizationId-scoped on every query.
 * NO secrets, NO tokens returned.
 * SERVER ONLY.
 */

import { prisma } from "@/lib/prisma";
import type {
  ExecutionJob,
  DestinationHealthSnapshotDTO,
  ExecutionRetryAttemptDTO,
} from "./execution-types";
import { EXECUTION_JOB_STATUS } from "./execution-types";

// ── Mappers ────────────────────────────────────────────────────────────────────

function mapJob(r: {
  id:             string;
  organizationId: string;
  provider:       string;
  jobType:        string;
  status:         string;
  priority:       number;
  productId:      string | null;
  catalogId:      string | null;
  idempotencyKey: string | null;
  maxRetries:     number;
  payload:        unknown;
  result:         unknown;
  lastError:      string | null;
  retryCount:     number;
  scheduledAt:    Date;
  startedAt:      Date | null;
  completedAt:    Date | null;
  createdAt:      Date;
  updatedAt:      Date;
}): ExecutionJob {
  return {
    id:             r.id,
    organizationId: r.organizationId,
    jobType:        r.jobType,
    destination:    r.provider,
    productId:      r.productId,
    catalogId:      r.catalogId,
    idempotencyKey: r.idempotencyKey,
    status:         r.status,
    priority:       r.priority,
    retryCount:     r.retryCount,
    maxRetries:     r.maxRetries,
    payload:        (r.payload as Record<string, unknown>) ?? {},
    result:         (r.result as Record<string, unknown>) ?? null,
    lastError:      r.lastError,
    scheduledAt:    r.scheduledAt.toISOString(),
    startedAt:      r.startedAt?.toISOString() ?? null,
    completedAt:    r.completedAt?.toISOString() ?? null,
    createdAt:      r.createdAt.toISOString(),
    updatedAt:      r.updatedAt.toISOString(),
  };
}

const JOB_SELECT = {
  id:             true,
  organizationId: true,
  provider:       true,
  jobType:        true,
  status:         true,
  priority:       true,
  productId:      true,
  catalogId:      true,
  idempotencyKey: true,
  maxRetries:     true,
  payload:        true,
  result:         true,
  lastError:      true,
  retryCount:     true,
  scheduledAt:    true,
  startedAt:      true,
  completedAt:    true,
  createdAt:      true,
  updatedAt:      true,
} as const;

// ── Job queries ────────────────────────────────────────────────────────────────

export async function findExecutionJob(
  jobId:          string,
  organizationId: string,
): Promise<ExecutionJob | null> {
  const r = await prisma.commerceJob.findFirst({
    where:  { id: jobId, organizationId },
    select: JOB_SELECT,
  });
  return r ? mapJob(r) : null;
}

export async function findByIdempotencyKey(
  idempotencyKey: string,
  organizationId: string,
): Promise<ExecutionJob | null> {
  const r = await prisma.commerceJob.findFirst({
    where:  { idempotencyKey, organizationId },
    select: JOB_SELECT,
  });
  return r ? mapJob(r) : null;
}

export async function createExecutionJobRecord(opts: {
  organizationId: string;
  connectionId?:  string;
  jobType:        string;
  destination:    string;
  productId?:     string | null;
  catalogId?:     string | null;
  idempotencyKey?: string;
  priority:       number;
  maxRetries:     number;
  payload:        Record<string, unknown>;
  scheduledAt?:   Date;
}): Promise<ExecutionJob> {
  const r = await prisma.commerceJob.create({
    data: {
      organizationId: opts.organizationId,
      connectionId:   opts.connectionId ?? null,
      provider:       opts.destination,
      jobType:        opts.jobType,
      status:         EXECUTION_JOB_STATUS.PENDING,
      priority:       opts.priority,
      productId:      opts.productId ?? null,
      catalogId:      opts.catalogId ?? null,
      idempotencyKey: opts.idempotencyKey ?? null,
      maxRetries:     opts.maxRetries,
      payload:        opts.payload as object,
      scheduledAt:    opts.scheduledAt ?? new Date(),
    },
    select: JOB_SELECT,
  });
  return mapJob(r);
}

export async function updateExecutionJobStatus(
  jobId:          string,
  organizationId: string,
  status:         string,
  extra?: {
    startedAt?:   Date | null;
    completedAt?: Date | null;
    lastError?:   string | null;
    result?:      Record<string, unknown> | null;
    retryCount?:  number;
    scheduledAt?: Date;
  },
): Promise<void> {
  await prisma.commerceJob.updateMany({
    where: { id: jobId, organizationId },
    data:  {
      status,
      ...(extra?.startedAt   !== undefined ? { startedAt:   extra.startedAt }   : {}),
      ...(extra?.completedAt !== undefined ? { completedAt: extra.completedAt } : {}),
      ...(extra?.lastError   !== undefined ? { lastError:   extra.lastError }   : {}),
      ...(extra?.result      !== undefined ? { result:      extra.result as object } : {}),
      ...(extra?.retryCount  !== undefined ? { retryCount:  extra.retryCount }  : {}),
      ...(extra?.scheduledAt !== undefined ? { scheduledAt: extra.scheduledAt } : {}),
    },
  });
}

/** List pending/queued jobs ready to execute now, ordered by priority then scheduledAt */
export async function listPendingExecutionJobs(opts: {
  organizationId?: string;
  destination?:    string;
  limit:           number;
}): Promise<ExecutionJob[]> {
  const records = await prisma.commerceJob.findMany({
    where: {
      ...(opts.organizationId ? { organizationId: opts.organizationId } : {}),
      ...(opts.destination    ? { provider: opts.destination }          : {}),
      status:     { in: [EXECUTION_JOB_STATUS.PENDING, "queued", EXECUTION_JOB_STATUS.RETRY_SCHEDULED] },
      scheduledAt: { lte: new Date() },
    },
    orderBy: [{ priority: "asc" }, { scheduledAt: "asc" }],
    take:    opts.limit,
    select:  JOB_SELECT,
  });
  return records.map(mapJob);
}

/** Count jobs per status for a destination (used by health engine) */
export async function countJobsByStatus(
  organizationId: string,
  destination:    string,
): Promise<Record<string, number>> {
  const counts = await prisma.commerceJob.groupBy({
    by:    ["status"],
    where: { organizationId, provider: destination },
    _count: { id: true },
  });
  const result: Record<string, number> = {};
  for (const row of counts) {
    result[row.status] = row._count.id;
  }
  return result;
}

// ── Destination health snapshots ───────────────────────────────────────────────

function mapSnapshot(r: {
  id:              string;
  organizationId:  string;
  destination:     string;
  healthLevel:     string;
  failedJobCount:  number;
  pendingJobCount: number;
  staleCount:      number;
  webhookBacklog:  number;
  isAuthValid:     boolean;
  detail:          string | null;
  snapshotAt:      Date;
}): DestinationHealthSnapshotDTO {
  return {
    id:              r.id,
    organizationId:  r.organizationId,
    destination:     r.destination,
    healthLevel:     r.healthLevel,
    failedJobCount:  r.failedJobCount,
    pendingJobCount: r.pendingJobCount,
    staleCount:      r.staleCount,
    webhookBacklog:  r.webhookBacklog,
    isAuthValid:     r.isAuthValid,
    detail:          r.detail,
    snapshotAt:      r.snapshotAt.toISOString(),
  };
}

export async function persistDestinationHealthSnapshot(opts: {
  organizationId:  string;
  destination:     string;
  healthLevel:     string;
  failedJobCount:  number;
  pendingJobCount: number;
  staleCount:      number;
  webhookBacklog:  number;
  isAuthValid:     boolean;
  detail?:         string;
}): Promise<DestinationHealthSnapshotDTO> {
  const r = await prisma.destinationHealthSnapshot.create({
    data: {
      organizationId:  opts.organizationId,
      destination:     opts.destination,
      healthLevel:     opts.healthLevel,
      failedJobCount:  opts.failedJobCount,
      pendingJobCount: opts.pendingJobCount,
      staleCount:      opts.staleCount,
      webhookBacklog:  opts.webhookBacklog,
      isAuthValid:     opts.isAuthValid,
      detail:          opts.detail ?? null,
      snapshotAt:      new Date(),
    },
  });
  return mapSnapshot(r);
}

export async function getLatestHealthPerDestination(
  organizationId: string,
): Promise<DestinationHealthSnapshotDTO[]> {
  // Get the most recent snapshot per destination
  const destinations = ["shopify", "catalog", "whatsapp", "social", "ads", "crm"];
  const snapshots = await Promise.all(
    destinations.map(dest =>
      prisma.destinationHealthSnapshot.findFirst({
        where:   { organizationId, destination: dest },
        orderBy: { snapshotAt: "desc" },
      }),
    ),
  );
  return snapshots.filter((s): s is NonNullable<typeof s> => s !== null).map(mapSnapshot);
}

// ── Retry attempts ─────────────────────────────────────────────────────────────

export async function createRetryAttemptRecord(opts: {
  organizationId: string;
  jobId:          string;
  attemptNumber:  number;
  scheduledAt:    Date;
}): Promise<ExecutionRetryAttemptDTO> {
  const r = await prisma.executionRetryAttempt.create({
    data: {
      organizationId: opts.organizationId,
      jobId:          opts.jobId,
      attemptNumber:  opts.attemptNumber,
      scheduledAt:    opts.scheduledAt,
    },
  });
  return {
    id:            r.id,
    jobId:         r.jobId,
    attemptNumber: r.attemptNumber,
    scheduledAt:   r.scheduledAt.toISOString(),
    executedAt:    r.executedAt?.toISOString() ?? null,
    outcome:       r.outcome,
    errorMessage:  r.errorMessage,
    createdAt:     r.createdAt.toISOString(),
  };
}

export async function updateRetryAttemptOutcome(
  id:           string,
  outcome:      string,
  errorMessage: string | null,
): Promise<void> {
  await prisma.executionRetryAttempt.update({
    where: { id },
    data:  { executedAt: new Date(), outcome, errorMessage },
  });
}

export async function listRetryAttempts(
  jobId: string,
): Promise<ExecutionRetryAttemptDTO[]> {
  const records = await prisma.executionRetryAttempt.findMany({
    where:   { jobId },
    orderBy: { attemptNumber: "asc" },
  });
  return records.map(r => ({
    id:            r.id,
    jobId:         r.jobId,
    attemptNumber: r.attemptNumber,
    scheduledAt:   r.scheduledAt.toISOString(),
    executedAt:    r.executedAt?.toISOString() ?? null,
    outcome:       r.outcome,
    errorMessage:  r.errorMessage,
    createdAt:     r.createdAt.toISOString(),
  }));
}
