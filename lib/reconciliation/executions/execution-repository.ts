/**
 * lib/reconciliation/executions/execution-repository.ts
 *
 * AGENTIK-RECON-SESSION-PERSISTENCE-01 — Phase 2
 * ReconExecution Repository
 *
 * Persists and retrieves rule-engine execution records.
 * All methods enforce organizationId isolation.
 *
 * Methods:
 *   createExecution()    — persist after a rule-engine run
 *   getExecution()       — single record by id
 *   listExecutions()     — paginated history for an org
 *   getLatestExecution() — most recent run for a source pair + period
 *   compareExecutions()  — mathematical delta between two runs
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import { prisma }        from "@/lib/prisma";
import type { ExecutionReport } from "../observability/execution-report";

// ── Input / output types ───────────────────────────────────────────────────────

export interface CreateExecutionInput {
  organizationId:      string;
  sessionId?:          string | null;
  triggeredBy?:        string | null;
  startedAt:           Date;
  finishedAt:          Date;
  durationMs:          number;
  sourceAType:         string;
  sourceBType:         string;
  sourceALabel:        string;
  sourceBLabel:        string;
  period:              string;
  loaderA:             string;
  loaderB:             string;
  normalizationVersion?: string;
  recordsA:            number;
  recordsB:            number;
  pairsEvaluated:      number;
  pairsReconciled:     number;
  pairsPartial:        number;
  pairsMismatch:       number;
  pairsSuspicious:     number;
  pairsPending:        number;
  pairsNoCandidate:    number;
  avgScore:            number;
  maxScore:            number;
  minScore:            number;
  matchRate:           number;
  rulesTotal:          number;
  rulesEnabled:        number;
  status:              string;
  executionReport:     ExecutionReport;
}

/** Lightweight row for list/timeline display — no heavy JSON blob. */
export interface ReconExecutionRow {
  id:              string;
  organizationId:  string;
  sessionId:       string | null;
  triggeredBy:     string | null;
  startedAt:       string; // ISO
  finishedAt:      string | null;
  durationMs:      number | null;
  sourceAType:     string;
  sourceBType:     string;
  sourceALabel:    string;
  sourceBLabel:    string;
  period:          string;
  loaderA:         string;
  loaderB:         string;
  normalizationVersion: string | null;
  recordsA:        number;
  recordsB:        number;
  pairsEvaluated:  number;
  pairsReconciled: number;
  pairsPartial:    number;
  pairsMismatch:   number;
  pairsSuspicious: number;
  pairsPending:    number;
  pairsNoCandidate: number;
  avgScore:        number;
  maxScore:        number;
  minScore:        number;
  matchRate:       number;
  rulesTotal:      number;
  rulesEnabled:    number;
  status:          string;
  createdAt:       string; // ISO
}

/** Full record including executionReport JSON. */
export interface ReconExecutionDetail extends ReconExecutionRow {
  executionReport: ExecutionReport | null;
}

export interface ListExecutionsOptions {
  sourceAType?:  string;
  sourceBType?:  string;
  period?:       string;
  status?:       string;
  limit?:        number;
  offset?:       number;
}

/** Mathematical delta between two executions. */
export interface ExecutionComparison {
  executionA:          ReconExecutionRow;
  executionB:          ReconExecutionRow;
  deltaRecordsA:       number;
  deltaRecordsB:       number;
  deltaPairsEvaluated: number;
  deltaPairsReconciled: number;
  deltaMismatch:       number;
  deltaSuspicious:     number;
  deltaAvgScore:       number;
  deltaMatchRate:      number;
  /** positive = improved, negative = degraded */
  trend:               "improved" | "degraded" | "stable";
}

// ── Prisma select projection ───────────────────────────────────────────────────

const EXECUTION_SELECT = {
  id: true, organizationId: true, sessionId: true, triggeredBy: true,
  startedAt: true, finishedAt: true, durationMs: true,
  sourceAType: true, sourceBType: true, sourceALabel: true, sourceBLabel: true,
  period: true, loaderA: true, loaderB: true, normalizationVersion: true,
  recordsA: true, recordsB: true,
  pairsEvaluated: true, pairsReconciled: true, pairsPartial: true,
  pairsMismatch: true, pairsSuspicious: true, pairsPending: true, pairsNoCandidate: true,
  avgScore: true, maxScore: true, minScore: true, matchRate: true,
  rulesTotal: true, rulesEnabled: true,
  status: true, createdAt: true,
} as const;

type PrismaRow = {
  id: string; organizationId: string; sessionId: string | null; triggeredBy: string | null;
  startedAt: Date; finishedAt: Date | null; durationMs: number | null;
  sourceAType: string; sourceBType: string; sourceALabel: string; sourceBLabel: string;
  period: string; loaderA: string; loaderB: string; normalizationVersion: string | null;
  recordsA: number; recordsB: number;
  pairsEvaluated: number; pairsReconciled: number; pairsPartial: number;
  pairsMismatch: number; pairsSuspicious: number; pairsPending: number; pairsNoCandidate: number;
  avgScore: number; maxScore: number; minScore: number; matchRate: number;
  rulesTotal: number; rulesEnabled: number;
  status: string; createdAt: Date;
};

function mapRow(r: PrismaRow): ReconExecutionRow {
  return {
    id:                  r.id,
    organizationId:      r.organizationId,
    sessionId:           r.sessionId,
    triggeredBy:         r.triggeredBy,
    startedAt:           r.startedAt.toISOString(),
    finishedAt:          r.finishedAt?.toISOString() ?? null,
    durationMs:          r.durationMs,
    sourceAType:         r.sourceAType,
    sourceBType:         r.sourceBType,
    sourceALabel:        r.sourceALabel,
    sourceBLabel:        r.sourceBLabel,
    period:              r.period,
    loaderA:             r.loaderA,
    loaderB:             r.loaderB,
    normalizationVersion: r.normalizationVersion,
    recordsA:            r.recordsA,
    recordsB:            r.recordsB,
    pairsEvaluated:      r.pairsEvaluated,
    pairsReconciled:     r.pairsReconciled,
    pairsPartial:        r.pairsPartial,
    pairsMismatch:       r.pairsMismatch,
    pairsSuspicious:     r.pairsSuspicious,
    pairsPending:        r.pairsPending,
    pairsNoCandidate:    r.pairsNoCandidate,
    avgScore:            r.avgScore,
    maxScore:            r.maxScore,
    minScore:            r.minScore,
    matchRate:           r.matchRate,
    rulesTotal:          r.rulesTotal,
    rulesEnabled:        r.rulesEnabled,
    status:              r.status,
    createdAt:           r.createdAt.toISOString(),
  };
}

// ── Repository methods ────────────────────────────────────────────────────────

/**
 * Persist a completed rule-engine execution.
 * Called automatically by the run/route.ts after building the ExecutionReport.
 */
export async function createExecution(
  input: CreateExecutionInput,
): Promise<ReconExecutionRow> {
  const row = await prisma.reconExecution.create({
    data: {
      organizationId:      input.organizationId,
      sessionId:           input.sessionId ?? null,
      triggeredBy:         input.triggeredBy ?? null,
      startedAt:           input.startedAt,
      finishedAt:          input.finishedAt,
      durationMs:          input.durationMs,
      sourceAType:         input.sourceAType,
      sourceBType:         input.sourceBType,
      sourceALabel:        input.sourceALabel,
      sourceBLabel:        input.sourceBLabel,
      period:              input.period,
      loaderA:             input.loaderA,
      loaderB:             input.loaderB,
      normalizationVersion: input.normalizationVersion ?? null,
      recordsA:            input.recordsA,
      recordsB:            input.recordsB,
      pairsEvaluated:      input.pairsEvaluated,
      pairsReconciled:     input.pairsReconciled,
      pairsPartial:        input.pairsPartial,
      pairsMismatch:       input.pairsMismatch,
      pairsSuspicious:     input.pairsSuspicious,
      pairsPending:        input.pairsPending,
      pairsNoCandidate:    input.pairsNoCandidate,
      avgScore:            input.avgScore,
      maxScore:            input.maxScore,
      minScore:            input.minScore,
      matchRate:           input.matchRate,
      rulesTotal:          input.rulesTotal,
      rulesEnabled:        input.rulesEnabled,
      status:              input.status,
      executionReportJson: input.executionReport as object,
    },
    select: EXECUTION_SELECT,
  });
  return mapRow(row as unknown as PrismaRow);
}

/**
 * Get a single execution by id — tenant-isolated.
 */
export async function getExecution(
  organizationId: string,
  executionId:    string,
): Promise<ReconExecutionDetail | null> {
  const row = await prisma.reconExecution.findFirst({
    where: { id: executionId, organizationId },
    select: { ...EXECUTION_SELECT, executionReportJson: true },
  });
  if (!row) return null;
  return {
    ...mapRow(row as unknown as PrismaRow),
    executionReport: row.executionReportJson as ExecutionReport | null,
  };
}

/**
 * List executions for an organization, newest first.
 * Optional filters: sourceAType, sourceBType, period, status.
 */
export async function listExecutions(
  organizationId: string,
  opts:           ListExecutionsOptions = {},
): Promise<ReconExecutionRow[]> {
  const where: Record<string, unknown> = { organizationId };
  if (opts.sourceAType) where.sourceAType = opts.sourceAType;
  if (opts.sourceBType) where.sourceBType = opts.sourceBType;
  if (opts.period)      where.period      = opts.period;
  if (opts.status)      where.status      = opts.status;

  const rows = await prisma.reconExecution.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take:    opts.limit  ?? 50,
    skip:    opts.offset ?? 0,
    select:  EXECUTION_SELECT,
  });
  return rows.map(r => mapRow(r as unknown as PrismaRow));
}

/**
 * Get the most recent execution for a source pair + period combination.
 * Used for comparison baseline in the workspace.
 */
export async function getLatestExecution(
  organizationId: string,
  opts: {
    sourceAType?: string;
    sourceBType?: string;
    period?:      string;
    excludeId?:   string;
  } = {},
): Promise<ReconExecutionRow | null> {
  const where: Record<string, unknown> = { organizationId };
  if (opts.sourceAType) where.sourceAType = opts.sourceAType;
  if (opts.sourceBType) where.sourceBType = opts.sourceBType;
  if (opts.period)      where.period      = opts.period;
  if (opts.excludeId)   where.id          = { not: opts.excludeId };

  const row = await prisma.reconExecution.findFirst({
    where,
    orderBy: { createdAt: "desc" },
    select:  EXECUTION_SELECT,
  });
  return row ? mapRow(row as unknown as PrismaRow) : null;
}

/**
 * Compare two executions mathematically.
 * executionA = current (newer), executionB = baseline (older).
 */
export async function compareExecutions(
  organizationId: string,
  executionIdA:   string,
  executionIdB:   string,
): Promise<ExecutionComparison | null> {
  const [a, b] = await Promise.all([
    getExecution(organizationId, executionIdA),
    getExecution(organizationId, executionIdB),
  ]);
  if (!a || !b) return null;

  const deltaMatchRate      = a.matchRate      - b.matchRate;
  const deltaAvgScore       = a.avgScore       - b.avgScore;
  const deltaPairsReconciled = a.pairsReconciled - b.pairsReconciled;
  const deltaMismatch       = a.pairsMismatch  - b.pairsMismatch;

  let trend: ExecutionComparison["trend"] = "stable";
  if (deltaMatchRate > 2 || deltaAvgScore > 3)  trend = "improved";
  if (deltaMatchRate < -2 || deltaAvgScore < -3) trend = "degraded";

  return {
    executionA:           a,
    executionB:           b,
    deltaRecordsA:        a.recordsA        - b.recordsA,
    deltaRecordsB:        a.recordsB        - b.recordsB,
    deltaPairsEvaluated:  a.pairsEvaluated  - b.pairsEvaluated,
    deltaPairsReconciled,
    deltaMismatch,
    deltaSuspicious:      a.pairsSuspicious - b.pairsSuspicious,
    deltaAvgScore,
    deltaMatchRate,
    trend,
  };
}
