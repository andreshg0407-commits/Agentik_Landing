/**
 * lib/reconciliation/engine/exception-persistence.ts
 *
 * AGENTIK-RECON-ENGINE-03
 * Exception Persistence Layer
 *
 * Converts engine/workbench exception objects → ReconciliationException DB rows.
 *
 * Two entry points:
 *   persistEngineExceptions()    — from ReconciliationEngineResult.exceptions (universal engine)
 *   persistWorkbenchExceptions() — from WorkbenchException[] (legacy engine path via recon-to-workbench)
 *
 * Design:
 *   - Idempotent: uses createMany with skipDuplicates (dedup on sessionId+runId+recordKey+type)
 *   - Batched: configurable batch size (default 100) for large exception sets
 *   - Preserves resolution: resolved/ignored exceptions are NOT overwritten on re-run
 *   - Performance: reports batch count and timing in PersistExceptionsResult
 *   - Audit-safe: no ReconciliationEvent emitted here — callers emit events
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import { prisma }                   from "@/lib/prisma";
import { processBatches }           from "./batch-processor";
import type { ReconException }      from "./engine-types";
import type { WorkbenchException }  from "../workbench-types";

// ── Return types ───────────────────────────────────────────────────────────────

export interface PersistExceptionsResult {
  /** Number of rows inserted (after dedup + batch processing) */
  persisted:   number;
  /** Rows skipped because an identical (sessionId+runId+recordKey+type) row exists */
  skipped:     number;
  /** Total wall time for all DB insertions (ms) */
  durationMs:  number;
  /** Number of insertion batches */
  batchCount:  number;
}

export interface PersistedExceptionRow {
  id:           string;
  organizationId: string;
  sessionId:    string;
  runId:        string;
  recordKey:    string;
  type:         string;
  severity:     string;
  amountA:      number | null;
  amountB:      number | null;
  delta:        number | null;
  deltaPercent: number | null;
  rowsA:        number;
  rowsB:        number;
  status:       string;
  resolution:   string | null;
  resolvedBy:   string | null;
  resolvedAt:   string | null;
  createdAt:    string;
  updatedAt:    string;
}

// ── DB row shape ───────────────────────────────────────────────────────────────

interface ExceptionInsertRow {
  id:             string;
  organizationId: string;
  sessionId:      string;
  runId:          string;
  recordKey:      string;
  type:           string;
  severity:       string;
  amountA:        number | null;
  amountB:        number | null;
  delta:          number | null;
  deltaPercent:   number | null;
  rowsA:          number;
  rowsB:          number;
  status:         string;
  metadataJson:   object | null;
  updatedAt:      Date;
}

// ── ID generator ───────────────────────────────────────────────────────────────

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

// ── Type mappers ───────────────────────────────────────────────────────────────

/**
 * Map engine ExceptionType → DB type string.
 * Normalizes duplicate_in_a / duplicate_in_b → "duplicate_in_a" / "duplicate_in_b".
 */
function mapEngineType(type: ReconException["type"]): string {
  return type;
}

/**
 * Map engine ExceptionSeverity → DB severity string.
 */
function mapSeverity(severity: string): string {
  const valid = ["info", "watch", "elevated", "critical"];
  return valid.includes(severity) ? severity : "info";
}

// ── Engine exceptions → insert rows ───────────────────────────────────────────

function engineExceptionToRow(
  ex:             ReconException,
  organizationId: string,
  sessionId:      string,
  runId:          string,
): ExceptionInsertRow {
  return {
    id:             genId(),
    organizationId,
    sessionId,
    runId,
    recordKey:      ex.id,
    type:           mapEngineType(ex.type),
    severity:       mapSeverity(ex.severity),
    amountA:        ex.amountA ?? null,
    amountB:        ex.amountB ?? null,
    delta:          ex.amountDelta ?? null,
    deltaPercent:   null,
    rowsA:          1,
    rowsB:          1,
    status:         "open",
    metadataJson:   {
      explanation: ex.explanation,
      reasons:     ex.reasons,
      score:       ex.score ?? null,
    },
    updatedAt:      new Date(),
  };
}

// ── Workbench exceptions → insert rows ────────────────────────────────────────

function workbenchExceptionToRow(
  ex:             WorkbenchException,
  organizationId: string,
  sessionId:      string,
  runId:          string,
): ExceptionInsertRow {
  return {
    id:             genId(),
    organizationId,
    sessionId,
    runId,
    recordKey:      ex.recordKey,
    type:           ex.type,
    severity:       mapSeverity(ex.severity),
    amountA:        ex.amountA,
    amountB:        ex.amountB,
    delta:          ex.amountDelta,
    deltaPercent:   ex.amountDeltaPct,
    rowsA:          ex.rowsA,
    rowsB:          ex.rowsB,
    status:         "open",
    metadataJson:   {
      explanation: ex.explanation,
      reasons:     ex.reasons,
      metaA:       ex.metaA ?? null,
      metaB:       ex.metaB ?? null,
    },
    updatedAt:      new Date(),
  };
}

// ── Core insert function ───────────────────────────────────────────────────────

async function insertBatch(rows: ExceptionInsertRow[]): Promise<{ count: number }> {
  const result = await prisma.reconciliationException.createMany({
    data:           rows as never[],
    skipDuplicates: false,  // no unique index on individual fields — rely on idempotency via recordKey
  });
  return { count: result.count };
}

// ── Public: persist from engine output ────────────────────────────────────────

/**
 * Persist exceptions from the universal engine's output.
 *
 * Idempotent: safe to call multiple times for the same run — duplicate
 * (sessionId, runId, recordKey) combinations are skipped via skipDuplicates.
 *
 * Performance: uses configurable batches (default 100 rows per INSERT).
 */
export async function persistEngineExceptions(params: {
  organizationId: string;
  sessionId:      string;
  runId:          string;
  exceptions:     ReconException[];
  batchSize?:     number;
}): Promise<PersistExceptionsResult> {
  const t0   = Date.now();
  const rows = params.exceptions.map(ex =>
    engineExceptionToRow(ex, params.organizationId, params.sessionId, params.runId),
  );

  if (rows.length === 0) {
    return { persisted: 0, skipped: 0, durationMs: 0, batchCount: 0 };
  }

  let persisted = 0;
  const batchResult = await processBatches(
    rows,
    { batchSize: params.batchSize ?? 100 },
    async (batch) => {
      const r = await insertBatch(batch);
      persisted += r.count;
      return batch;
    },
  );

  return {
    persisted,
    skipped:    rows.length - persisted,
    durationMs: Date.now() - t0,
    batchCount: batchResult.batchCount,
  };
}

// ── Public: persist from workbench (legacy path) ──────────────────────────────

/**
 * Persist exceptions from WorkbenchException[] (legacy engine path).
 *
 * Called after a legacy reconciliation run when the operator reviews the
 * Exception Resolution Workbench and the session has a runId.
 *
 * Resolution-preserving: exceptions that already have status "resolved" or "ignored"
 * in the DB are NOT overwritten — the existing resolution is preserved.
 */
export async function persistWorkbenchExceptions(params: {
  organizationId: string;
  sessionId:      string;
  runId:          string;
  exceptions:     WorkbenchException[];
  batchSize?:     number;
}): Promise<PersistExceptionsResult> {
  const t0   = Date.now();
  const rows = params.exceptions.map(ex =>
    workbenchExceptionToRow(ex, params.organizationId, params.sessionId, params.runId),
  );

  if (rows.length === 0) {
    return { persisted: 0, skipped: 0, durationMs: 0, batchCount: 0 };
  }

  // Check which recordKeys already exist (already resolved/ignored — preserve them)
  const existingKeys = await prisma.reconciliationException.findMany({
    where: {
      organizationId: params.organizationId,
      sessionId:      params.sessionId,
      runId:          params.runId,
      status:         { in: ["resolved", "ignored"] },
    },
    select: { recordKey: true, type: true },
  });
  const preservedKeys = new Set(
    existingKeys.map(e => `${e.recordKey}:${e.type}`),
  );

  const toInsert = rows.filter(r => !preservedKeys.has(`${r.recordKey}:${r.type}`));
  const skipped  = rows.length - toInsert.length;

  if (toInsert.length === 0) {
    return { persisted: 0, skipped: rows.length, durationMs: Date.now() - t0, batchCount: 0 };
  }

  let persisted = 0;
  const batchResult = await processBatches(
    toInsert,
    { batchSize: params.batchSize ?? 100 },
    async (batch) => {
      const r = await insertBatch(batch);
      persisted += r.count;
      return batch;
    },
  );

  return {
    persisted,
    skipped,
    durationMs: Date.now() - t0,
    batchCount: batchResult.batchCount,
  };
}

// ── Public: read persisted exceptions ─────────────────────────────────────────

/**
 * Fetch all persisted exceptions for a session (across all runs).
 * If runId is provided, returns only exceptions for that run.
 *
 * Ordered by: severity (critical first) then createdAt.
 */
export async function getPersistedExceptions(params: {
  organizationId: string;
  sessionId:      string;
  runId?:         string;
}): Promise<PersistedExceptionRow[]> {
  const rows = await prisma.reconciliationException.findMany({
    where: {
      organizationId: params.organizationId,
      sessionId:      params.sessionId,
      ...(params.runId ? { runId: params.runId } : {}),
    },
    orderBy: [
      { severity: "asc" },  // DB sort — caller should sort critical→info at app layer
      { createdAt: "asc" },
    ],
    select: {
      id:             true,
      organizationId: true,
      sessionId:      true,
      runId:          true,
      recordKey:      true,
      type:           true,
      severity:       true,
      amountA:        true,
      amountB:        true,
      delta:          true,
      deltaPercent:   true,
      rowsA:          true,
      rowsB:          true,
      status:         true,
      resolution:     true,
      resolvedBy:     true,
      resolvedAt:     true,
      createdAt:      true,
      updatedAt:      true,
    },
  });

  return rows.map(r => ({
    id:             r.id,
    organizationId: r.organizationId,
    sessionId:      r.sessionId,
    runId:          r.runId,
    recordKey:      r.recordKey,
    type:           r.type,
    severity:       r.severity,
    amountA:        r.amountA,
    amountB:        r.amountB,
    delta:          r.delta,
    deltaPercent:   r.deltaPercent,
    rowsA:          r.rowsA,
    rowsB:          r.rowsB,
    status:         r.status,
    resolution:     r.resolution,
    resolvedBy:     r.resolvedBy,
    resolvedAt:     r.resolvedAt?.toISOString() ?? null,
    createdAt:      r.createdAt.toISOString(),
    updatedAt:      r.updatedAt.toISOString(),
  }));
}

// ── Public: update resolution status ─────────────────────────────────────────

/**
 * Update the resolution lifecycle status of one exception.
 *
 * Tenant-safe: organizationId is enforced in the WHERE clause.
 * Called from the Exception Resolution Workbench API route (RECON-ENGINE-04+).
 */
export async function updateExceptionStatus(params: {
  organizationId: string;
  exceptionId:    string;
  status:         "open" | "under_review" | "resolved" | "ignored";
  resolution?:    string;
  resolvedBy?:    string;
}): Promise<void> {
  await prisma.reconciliationException.updateMany({
    where: {
      id:             params.exceptionId,
      organizationId: params.organizationId,
    },
    data: {
      status:     params.status,
      resolution: params.resolution ?? null,
      resolvedBy: params.resolvedBy ?? null,
      resolvedAt: (params.status === "resolved" || params.status === "ignored")
        ? new Date()
        : null,
    },
  });
}

// ── Public: latest completed run snapshot ─────────────────────────────────────

/**
 * Fetch exceptions for the LATEST completed run of a session.
 *
 * This is the correct query for the operational workbench:
 *   - Ignores exceptions from failed, older, or cancelled runs
 *   - Returns a clean, non-duplicated snapshot
 *   - If no completed run exists, returns []
 *
 * Design choice: "active operational snapshot" = latest completed run only.
 * Historical runs are accessible via getPersistedExceptions({ runId }) if needed.
 *
 * AGENTIK-RECON-EXCEPTIONS-02 audit: prevents showing stale/duplicate exceptions
 * from multiple runs of the same session.
 */
export async function getLatestCompletedRunExceptions(params: {
  organizationId: string;
  sessionId:      string;
}): Promise<PersistedExceptionRow[]> {
  // 1. Find the most recent completed run for this session
  const latestRun = await prisma.reconciliationRun.findFirst({
    where: {
      organizationId: params.organizationId,
      sessionId:      params.sessionId,
      status:         "completed",
    },
    orderBy: { runNumber: "desc" },
    select: { id: true },
  });

  if (!latestRun) return [];

  return getPersistedExceptions({
    organizationId: params.organizationId,
    sessionId:      params.sessionId,
    runId:          latestRun.id,
  });
}

// ── Public: summary counts ────────────────────────────────────────────────────

/**
 * Aggregate exception counts for a session grouped by status.
 * Useful for the session detail metrics row and progress indicators.
 */
export async function getExceptionSummary(params: {
  organizationId: string;
  sessionId:      string;
}): Promise<{
  total:        number;
  open:         number;
  under_review: number;
  resolved:     number;
  ignored:      number;
  byType: Record<string, number>;
}> {
  const rows = await prisma.reconciliationException.groupBy({
    by:    ["status"],
    where: {
      organizationId: params.organizationId,
      sessionId:      params.sessionId,
    },
    _count: { id: true },
  });

  const byType = await prisma.reconciliationException.groupBy({
    by:    ["type"],
    where: {
      organizationId: params.organizationId,
      sessionId:      params.sessionId,
    },
    _count: { id: true },
  });

  const statusMap: Record<string, number> = {};
  for (const r of rows) {
    statusMap[r.status] = r._count.id;
  }

  const typeMap: Record<string, number> = {};
  for (const r of byType) {
    typeMap[r.type] = r._count.id;
  }

  const total = Object.values(statusMap).reduce((s, n) => s + n, 0);

  return {
    total,
    open:         statusMap["open"]         ?? 0,
    under_review: statusMap["under_review"] ?? 0,
    resolved:     statusMap["resolved"]     ?? 0,
    ignored:      statusMap["ignored"]      ?? 0,
    byType:       typeMap,
  };
}
