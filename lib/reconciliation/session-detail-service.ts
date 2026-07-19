/**
 * lib/reconciliation/session-detail-service.ts
 *
 * AGENTIK-RECON-SESSIONS-02
 * Session Detail Service — full session hydration for the detail view.
 *
 * Fetches ReconciliationSession + all ReconciliationRun rows +
 * ReconciliationEvent audit trail in a single Prisma call with includes.
 *
 * Tenant safety: every query guards organizationId.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import { prisma }                     from "@/lib/prisma";
import type {
  ReconciliationSession,
  ReconciliationSessionRun,
  ReconciliationSummarySnapshot,
  ReconciliationAuditEvent,
  ReconAuditEventType,
  ReconciliationSessionStatus,
  ReconciliationRunStatus,
} from "./session-types";
import type { ReconciliationSourceType } from "./source-contract";
import {
  getLatestCompletedRunExceptions,
  type PersistedExceptionRow,
}                                    from "./engine/exception-persistence";
import type {
  WorkbenchException,
  WorkbenchSeverity,
  WorkbenchExceptionType,
  ExceptionResolution,
  ResolutionMap,
  WorkbenchNote,
}                                    from "./workbench-types";

// ── Status mappers ─────────────────────────────────────────────────────────────

const SESSION_STATUS_MAP: Record<string, ReconciliationSessionStatus> = {
  DRAFT:                "draft",
  READY:                "ready",
  RUNNING:              "running",
  NEEDS_REVIEW:         "needs_review",
  PARTIALLY_RECONCILED: "partially_reconciled",
  RECONCILED:           "reconciled",
  CLOSED:               "closed",
  FAILED:               "failed",
  CANCELLED:            "cancelled",
};

function mapSessionStatus(raw: string): ReconciliationSessionStatus {
  return SESSION_STATUS_MAP[raw] ?? "draft";
}

function mapRunStatus(raw: string): ReconciliationRunStatus {
  const valid: ReconciliationRunStatus[] = ["pending", "running", "completed", "failed", "unsupported"];
  return (valid as string[]).includes(raw) ? (raw as ReconciliationRunStatus) : "pending";
}

// ── PersistedExceptionRow → WorkbenchException converter ──────────────────────

const SEVERITY_VALID = new Set<WorkbenchSeverity>(["info", "watch", "elevated", "critical"]);
const TYPE_VALID     = new Set<WorkbenchExceptionType>(
  ["mismatch_amount", "only_in_a", "only_in_b", "probable_match", "duplicate"],
);

function mapSeverity(s: string): WorkbenchSeverity {
  return SEVERITY_VALID.has(s as WorkbenchSeverity) ? (s as WorkbenchSeverity) : "info";
}

function mapExType(t: string): WorkbenchExceptionType | null {
  // engine uses "possible_duplicate" or "duplicate_in_a/b" — normalize to "duplicate"
  if (t === "possible_duplicate" || t.startsWith("duplicate")) return "duplicate";
  return TYPE_VALID.has(t as WorkbenchExceptionType) ? (t as WorkbenchExceptionType) : null;
}

function buildLabel(row: PersistedExceptionRow): string {
  const meta = row.type === "mismatch_amount"
    ? `${row.amountA != null ? fmtCOP(row.amountA) : "—"} vs ${row.amountB != null ? fmtCOP(row.amountB) : "—"}`
    : row.amountA != null ? fmtCOP(row.amountA)
    : row.amountB != null ? fmtCOP(row.amountB)
    : row.recordKey;
  return `${row.recordKey} · ${meta}`;
}

function fmtCOP(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style:                "currency",
    currency:             "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function persistedRowToWorkbench(row: PersistedExceptionRow): WorkbenchException | null {
  const type = mapExType(row.type);
  if (!type) return null;

  const meta     = (row as unknown as { metadataJson?: Record<string, unknown> }).metadataJson ?? {};
  const reasons: string[] = Array.isArray(meta["reasons"])
    ? (meta["reasons"] as unknown[]).filter(r => typeof r === "string") as string[]
    : [];
  const explanation = typeof meta["explanation"] === "string"
    ? meta["explanation"]
    : buildLabel(row);

  return {
    id:             row.id,           // DB CUID — used as workbench row key
    persistedId:    row.id,           // marks this as DB-backed
    type,
    severity:       mapSeverity(row.severity),
    label:          buildLabel(row),
    explanation,
    reasons,
    amountA:        row.amountA,
    amountB:        row.amountB,
    amountDelta:    row.delta,
    amountDeltaPct: row.deltaPercent,
    recordKey:      row.recordKey,
    rowsA:          row.rowsA,
    rowsB:          row.rowsB,
    metaA:          typeof meta["metaA"] === "object" && meta["metaA"] !== null
      ? (meta["metaA"] as Record<string, unknown>)
      : undefined,
    metaB:          typeof meta["metaB"] === "object" && meta["metaB"] !== null
      ? (meta["metaB"] as Record<string, unknown>)
      : undefined,
  };
}

function buildResolutionMap(rows: PersistedExceptionRow[]): ResolutionMap {
  const map: ResolutionMap = {};
  for (const row of rows) {
    const meta  = (row as unknown as { metadataJson?: Record<string, unknown> }).metadataJson ?? {};
    const notes: WorkbenchNote[] = Array.isArray(meta["notes"])
      ? (meta["notes"] as unknown[]).flatMap(n => {
          if (typeof n !== "object" || n === null) return [];
          const note = n as Record<string, unknown>;
          return [{
            id:        String(note["id"] ?? ""),
            text:      String(note["message"] ?? note["text"] ?? ""),
            author:    String(note["actorId"] ?? note["author"] ?? "system"),
            createdAt: String(note["createdAt"] ?? new Date().toISOString()),
          }];
        })
      : [];

    const resolution: ExceptionResolution = {
      status:     (row.status as ExceptionResolution["status"]) ?? "open",
      resolution: row.resolution,
      notes,
      resolvedBy: row.resolvedBy,
      resolvedAt: row.resolvedAt,
    };

    map[row.id] = resolution;
  }
  return map;
}

// ── Return type ────────────────────────────────────────────────────────────────

export interface SessionDetailData {
  session:       ReconciliationSession;
  runs:          ReconciliationSessionRun[];
  events:        ReconciliationAuditEvent[];
  /** DB-persisted exceptions for the most recent completed run, as WorkbenchException[]. */
  exceptions:    WorkbenchException[];
  /** Initial resolution state hydrated from DB (status, resolution text, notes). */
  resolutionMap: ResolutionMap;
}

// ── Main query ─────────────────────────────────────────────────────────────────

/**
 * Fetch full session detail: session + all runs + complete audit trail + latest-run exceptions.
 *
 * Returns null when session is not found or belongs to a different org.
 * Runs are returned most-recent-first (desc runNumber).
 * Events are returned oldest-first (asc createdAt) — audit trail reads top-down.
 *
 * PERFORMANCE NOTE (SESSIONS-03):
 *   This hydrates everything in one pass. For large sessions:
 *   - `events` can grow unbounded: add cursor-based pagination (take/skip + cursor).
 *   - `exceptions` are scoped to the latest completed run — already bounded.
 *   - `runs` are bounded by retries (typically < 10 per session).
 *   When events > ~500, consider lazy-loading the audit trail client-side via
 *   a dedicated /api/orgs/[orgSlug]/reconciliation/sessions/[id]/events endpoint.
 *   No change needed now — document here so SESSIONS-03 has the contract ready.
 */
export async function getSessionDetail(
  organizationId: string,
  sessionId:      string,
): Promise<SessionDetailData | null> {
  const row = await prisma.reconciliationSession.findFirst({
    where: { id: sessionId, organizationId, deletedAt: null },
    include: {
      runs:   { orderBy: { runNumber: "desc" } },
      events: { orderBy: { createdAt: "asc"  } },
    },
  });

  if (!row) return null;

  const session: ReconciliationSession = {
    id:             row.id,
    organizationId: row.organizationId,
    sessionCode:    row.sessionCode,
    title:          row.title,
    sourceAType:    row.sourceAType as ReconciliationSourceType,
    sourceALabel:   row.sourceALabel,
    sourceBType:    row.sourceBType as ReconciliationSourceType,
    sourceBLabel:   row.sourceBLabel,
    period:         row.period     ?? null,
    status:         mapSessionStatus(row.status),
    createdBy:      row.createdBy  ?? null,
    assignedTo:     row.assignedTo ?? null,
    startedAt:      row.startedAt?.toISOString()   ?? null,
    completedAt:    row.completedAt?.toISOString()  ?? null,
    closedAt:       row.closedAt?.toISOString()     ?? null,
    summaryJson:    row.summaryJson    as ReconciliationSummarySnapshot | null,
    metadataJson:   row.metadataJson   as Record<string, unknown> | null,
    createdAt:      row.createdAt.toISOString(),
    updatedAt:      row.updatedAt.toISOString(),
  };

  const runs: ReconciliationSessionRun[] = row.runs.map(r => ({
    id:             r.id,
    organizationId: r.organizationId,
    sessionId:      r.sessionId,
    runNumber:      r.runNumber,
    status:         mapRunStatus(r.status),
    sourceAKey:     r.sourceAKey ?? null,
    sourceBKey:     r.sourceBKey ?? null,
    period:         r.period     ?? null,
    summaryJson:    r.summaryJson  as ReconciliationSummarySnapshot | null,
    errorJson:      r.errorJson   as Record<string, unknown> | null,
    startedAt:      r.startedAt?.toISOString()  ?? null,
    completedAt:    r.completedAt?.toISOString() ?? null,
    createdAt:      r.createdAt.toISOString(),
  }));

  const events: ReconciliationAuditEvent[] = row.events.map(e => ({
    id:             e.id,
    organizationId: e.organizationId,
    sessionId:      e.sessionId,
    actorType:      e.actorType as ReconciliationAuditEvent["actorType"],
    actorId:        e.actorId   ?? null,
    eventType:      e.eventType as ReconAuditEventType,
    message:        e.message,
    metadataJson:   e.metadataJson as Record<string, unknown> | null,
    createdAt:      e.createdAt.toISOString(),
  }));

  // Fetch exceptions for the LATEST completed run only.
  // Using getLatestCompletedRunExceptions() avoids showing stale exceptions from
  // old or failed runs — the workbench must reflect a single clean operational snapshot.
  // SESSIONS-03: consider lazy-loading exceptions to keep this query fast for large sessions.
  const persistedRows = await getLatestCompletedRunExceptions({
    organizationId,
    sessionId,
  });

  const exceptions: WorkbenchException[] = persistedRows
    .map(persistedRowToWorkbench)
    .filter((e): e is WorkbenchException => e !== null);

  const resolutionMap = buildResolutionMap(persistedRows);

  return { session, runs, events, exceptions, resolutionMap };
}

/**
 * Fetch a lightweight list of sessions for the sessions index page.
 * Returns the 50 most recent sessions for the org.
 */
export async function getSessionsIndex(
  organizationId: string,
  limit = 50,
): Promise<Array<{
  id:          string;
  sessionCode: string;
  title:       string;
  period:      string | null;
  status:      ReconciliationSessionStatus;
  sourceALabel: string;
  sourceBLabel: string;
  assignedTo:  string | null;
  summaryJson: ReconciliationSummarySnapshot | null;
  runCount:    number;
  createdAt:   string;
  updatedAt:   string;
}>> {
  const rows = await prisma.reconciliationSession.findMany({
    where:   { organizationId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take:    limit,
    select: {
      id:           true,
      sessionCode:  true,
      title:        true,
      period:       true,
      status:       true,
      sourceALabel: true,
      sourceBLabel: true,
      assignedTo:   true,
      summaryJson:  true,
      createdAt:    true,
      updatedAt:    true,
      _count: { select: { runs: true } },
    },
  });

  return rows.map(r => ({
    id:           r.id,
    sessionCode:  r.sessionCode,
    title:        r.title,
    period:       r.period ?? null,
    status:       mapSessionStatus(r.status),
    sourceALabel: r.sourceALabel,
    sourceBLabel: r.sourceBLabel,
    assignedTo:   r.assignedTo ?? null,
    summaryJson:  r.summaryJson as ReconciliationSummarySnapshot | null,
    runCount:     r._count.runs,
    createdAt:    r.createdAt.toISOString(),
    updatedAt:    r.updatedAt.toISOString(),
  }));
}
