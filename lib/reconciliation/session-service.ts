/**
 * lib/reconciliation/session-service.ts
 *
 * AGENTIK-RECON-SESSIONS-01 — Task 5
 * Reconciliation Session Creation Service
 *
 * Creates and manages ReconciliationSession records.
 *
 * Key operations:
 *   createReconciliationSession() — validate, create draft session, emit event
 *   getRecentSessions()           — fetch sessions for UI table
 *   getSessionById()              — fetch one session (with tenant guard)
 *
 * Rules:
 *   - organizationId isolation: every query includes organizationId
 *   - Session codes are org-scoped: RC-YYYY-##### unique per org
 *   - No reconciliation matching happens here — sessions are created as DRAFT
 *   - No SAG writes, no DIAN calls, no financial side effects
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import { prisma }                       from "@/lib/prisma";
import { emitReconEvent }               from "./audit-trail";
import { RECONCILIATION_SOURCES }       from "./source-contract";
import type { ReconciliationSourceType } from "./source-contract";
import type { ReconciliationSession, ReconSessionRow, ReconciliationSummarySnapshot } from "./session-types";

// ── Session code generation ───────────────────────────────────────────────────

/**
 * Generate RC-YYYY-##### session code.
 *
 * Codes are org-scoped and sequential.
 * Format: RC-{YEAR}-{5-digit-padded-count}
 * Example: RC-2026-00041
 *
 * NOTE: This is not an atomic counter — in high-concurrency scenarios
 * the unique constraint on (organizationId, sessionCode) will catch conflicts.
 */
async function generateSessionCode(organizationId: string): Promise<string> {
  const count = await prisma.reconciliationSession.count({
    where: { organizationId },
  });
  const year = new Date().getFullYear();
  return `RC-${year}-${String(count + 1).padStart(5, "0")}`;
}

// ── Create session ────────────────────────────────────────────────────────────

export interface CreateSessionParams {
  organizationId: string;
  title:          string;
  sourceAType:    ReconciliationSourceType;
  sourceALabel:   string;
  sourceBType:    ReconciliationSourceType;
  sourceBLabel:   string;
  period?:        string;
  createdBy?:     string;
  metadata?:      Record<string, unknown>;
}

/**
 * Create a new reconciliation session in DRAFT status.
 *
 * Validates:
 *   - organizationId must be non-empty
 *   - sourceAType and sourceBType must be registered in RECONCILIATION_SOURCES
 *   - sourceA and sourceB must be different types (no self-reconciliation)
 *
 * Does NOT:
 *   - Run any reconciliation matching
 *   - Touch SAG, DIAN, or bank data
 *   - Apply any payments or accounting entries
 */
export async function createReconciliationSession(
  params: CreateSessionParams,
): Promise<ReconciliationSession> {
  if (!params.organizationId) {
    throw new Error("organizationId is required to create a reconciliation session.");
  }
  if (!RECONCILIATION_SOURCES[params.sourceAType]) {
    throw new Error(`Unknown source type: ${params.sourceAType}`);
  }
  if (!RECONCILIATION_SOURCES[params.sourceBType]) {
    throw new Error(`Unknown source type: ${params.sourceBType}`);
  }
  if (params.sourceAType === params.sourceBType) {
    throw new Error(
      `sourceA and sourceB must be different types. Got: ${params.sourceAType} for both.`,
    );
  }

  const sessionCode = await generateSessionCode(params.organizationId);

  const row = await prisma.reconciliationSession.create({
    data: {
      organizationId: params.organizationId,
      sessionCode,
      title:          params.title,
      sourceAType:    params.sourceAType,
      sourceALabel:   params.sourceALabel,
      sourceBType:    params.sourceBType,
      sourceBLabel:   params.sourceBLabel,
      period:         params.period    ?? null,
      status:         "DRAFT",
      createdBy:      params.createdBy ?? null,
      metadataJson:   (params.metadata ?? null) as never,
    },
  });

  await emitReconEvent({
    organizationId: params.organizationId,
    sessionId:      row.id,
    eventType:      "session_created",
    message:        `Sesión ${sessionCode} creada — ${params.title}`,
    actorType:      "system",
    metadata: {
      sessionCode,
      sourceAType:  params.sourceAType,
      sourceBType:  params.sourceBType,
      period:       params.period ?? null,
      createdBy:    params.createdBy ?? "system",
    },
  });

  return mapSession(row);
}

// ── Read sessions ─────────────────────────────────────────────────────────────

/**
 * Fetch recent sessions for an organization.
 * Returns slim ReconSessionRow projections for UI display.
 *
 * Tenant safety: organizationId enforced in WHERE clause.
 */
export async function getRecentSessions(
  organizationId: string,
  limit = 10,
): Promise<ReconSessionRow[]> {
  const rows = await prisma.reconciliationSession.findMany({
    where:   { organizationId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take:    limit,
    select: {
      id:          true,
      sessionCode: true,
      title:       true,
      period:      true,
      status:      true,
      summaryJson: true,
      updatedAt:   true,
    },
  });

  return rows.map(r => ({
    id:          r.id,
    sessionCode: r.sessionCode,
    title:       r.title,
    period:      r.period ?? null,
    status:      mapStatus(r.status),
    summary:     r.summaryJson as ReconciliationSummarySnapshot | null,
    updatedAt:   r.updatedAt.toISOString(),
  }));
}

/**
 * Fetch one session by ID with tenant guard.
 * Returns null when not found or org mismatch.
 */
export async function getSessionById(
  organizationId: string,
  sessionId:      string,
): Promise<ReconciliationSession | null> {
  const row = await prisma.reconciliationSession.findFirst({
    where: { id: sessionId, organizationId, deletedAt: null },
  });
  return row ? mapSession(row) : null;
}

// ── Private helpers ───────────────────────────────────────────────────────────

type PrismaSessionRow = Awaited<ReturnType<typeof prisma.reconciliationSession.findFirstOrThrow>>;

function mapSession(row: PrismaSessionRow): ReconciliationSession {
  return {
    id:             row.id,
    organizationId: row.organizationId,
    sessionCode:    row.sessionCode,
    title:          row.title,
    sourceAType:    row.sourceAType    as ReconciliationSourceType,
    sourceALabel:   row.sourceALabel,
    sourceBType:    row.sourceBType    as ReconciliationSourceType,
    sourceBLabel:   row.sourceBLabel,
    period:         row.period         ?? null,
    status:         mapStatus(row.status),
    createdBy:      row.createdBy      ?? null,
    assignedTo:     row.assignedTo     ?? null,
    startedAt:      row.startedAt?.toISOString()   ?? null,
    completedAt:    row.completedAt?.toISOString()  ?? null,
    closedAt:       row.closedAt?.toISOString()     ?? null,
    summaryJson:    row.summaryJson    as ReconciliationSummarySnapshot | null,
    metadataJson:   row.metadataJson   as Record<string, unknown> | null,
    createdAt:      row.createdAt.toISOString(),
    updatedAt:      row.updatedAt.toISOString(),
  };
}

function mapStatus(prismaStatus: string): ReconciliationSession["status"] {
  // Prisma enum → lowercase TypeScript union
  const map: Record<string, ReconciliationSession["status"]> = {
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
  return map[prismaStatus] ?? "draft";
}
