/**
 * lib/reconciliation/exception-service.ts
 *
 * AGENTIK-RECON-EXCEPTIONS-02
 * Exception Resolution Service — business logic layer
 *
 * Sits above exception-persistence.ts. Adds:
 *   - Status lifecycle validation (guards invalid transitions)
 *   - Notes management (read-modify-write on metadataJson.notes[])
 *   - Audit event emission per operator action
 *   - Tenant safety: every operation requires organizationId
 *
 * Status lifecycle:
 *   open → under_review
 *   open → resolved
 *   open → ignored
 *   under_review → resolved
 *   under_review → ignored
 *   resolved → open   (reopen)
 *   ignored  → open   (reopen)
 *
 * FORBIDDEN transitions (require reopen first):
 *   resolved → ignored  (NO)
 *   ignored  → resolved (NO)
 *
 * Notes strategy:
 *   Stored in ReconciliationException.metadataJson.notes[] — no separate table.
 *   Each note: { id, actorId, actorType, message, createdAt }
 *   Max 100 notes per exception (oldest are NOT dropped — caller responsibility).
 *
 * Safety rules:
 *   - No accounting writes
 *   - No SAG or DIAN mutations
 *   - No SecureVault access
 *   - No cross-tenant access (organizationId required on every call)
 *   - Exceptions are never deleted (only status-transitioned)
 *
 * TODO (SESSIONS-03): Actor role enforcement is NOT yet implemented.
 *   Currently any authenticated org member can perform any status transition.
 *   Future role model (do NOT implement until org member role table exists):
 *     operator   → may set_reviewing
 *     supervisor → may resolve / ignore
 *     auditor    → may reopen
 *   Wire via actorRole param in updateExceptionStatus once roles are available.
 *   actorId is recorded in the audit trail now, even without enforcement.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import { prisma }                   from "@/lib/prisma";
import { emitReconEvent }           from "./audit-trail";
import type { ReconAuditEventType } from "./session-types";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ExceptionStatusAction = "set_reviewing" | "resolve" | "ignore" | "reopen";

export type ExceptionStatus = "open" | "under_review" | "resolved" | "ignored";

export interface ExceptionNoteRow {
  id:        string;
  actorId:   string | null;
  actorType: "user" | "system" | "agent";
  message:   string;
  createdAt: string;
}

export interface UpdateStatusResult {
  id:         string;
  newStatus:  ExceptionStatus;
  prevStatus: ExceptionStatus;
}

export interface AddNoteResult {
  note: ExceptionNoteRow;
}

// ── Status lifecycle ───────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<ExceptionStatus, ExceptionStatus[]> = {
  open:         ["under_review", "resolved", "ignored"],
  under_review: ["resolved",     "ignored"            ],
  resolved:     ["open"                               ],
  ignored:      ["open"                               ],
};

function actionToStatus(action: ExceptionStatusAction): ExceptionStatus {
  switch (action) {
    case "set_reviewing": return "under_review";
    case "resolve":       return "resolved";
    case "ignore":        return "ignored";
    case "reopen":        return "open";
  }
}

function actionToEventType(action: ExceptionStatusAction): ReconAuditEventType {
  switch (action) {
    case "set_reviewing": return "exception_under_review";
    case "resolve":       return "exception_resolved";
    case "ignore":        return "exception_ignored";
    case "reopen":        return "exception_reopened";
  }
}

function validateTransition(from: ExceptionStatus, to: ExceptionStatus): void {
  const allowed = VALID_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(
      `Transición de estado inválida: ${from} → ${to}. ` +
      `Transiciones permitidas desde ${from}: [${allowed.join(", ")}]`,
    );
  }
}

// ── ID generation ──────────────────────────────────────────────────────────────

function genNoteId(): string {
  return "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ── Tenant-safe row fetch ──────────────────────────────────────────────────────

type ExceptionRow = {
  id:           string;
  organizationId: string;
  sessionId:    string;
  runId:        string;
  recordKey:    string;
  type:         string;
  severity:     string;
  status:       string;
  metadataJson: unknown;
};

async function fetchException(
  organizationId: string,
  exceptionId:    string,
): Promise<ExceptionRow> {
  const row = await prisma.reconciliationException.findFirst({
    where:  { id: exceptionId, organizationId },
    select: {
      id:             true,
      organizationId: true,
      sessionId:      true,
      runId:          true,
      recordKey:      true,
      type:           true,
      severity:       true,
      status:         true,
      metadataJson:   true,
    },
  });

  if (!row) {
    throw new Error(`Excepción no encontrada o acceso denegado: ${exceptionId}`);
  }

  return row as ExceptionRow;
}

// ── Public: update status ──────────────────────────────────────────────────────

/**
 * Transition an exception's status and emit a reconciliation audit event.
 *
 * Validates:
 *   - organizationId (tenant safety)
 *   - exception exists
 *   - status transition is permitted by the lifecycle rules
 *
 * Does NOT:
 *   - Apply payments
 *   - Modify SAG, DIAN, or cartera
 *   - Delete the exception
 */
export async function updateExceptionStatus(params: {
  organizationId: string;
  exceptionId:    string;
  action:         ExceptionStatusAction;
  resolution?:    string;
  actorId?:       string;
  actorType?:     "user" | "system" | "agent";
}): Promise<UpdateStatusResult> {
  const row = await fetchException(params.organizationId, params.exceptionId);

  const fromStatus = row.status as ExceptionStatus;
  const toStatus   = actionToStatus(params.action);

  validateTransition(fromStatus, toStatus);

  const isTerminal = toStatus === "resolved" || toStatus === "ignored";

  await prisma.reconciliationException.updateMany({
    where: { id: params.exceptionId, organizationId: params.organizationId },
    data: {
      status:     toStatus,
      resolution: params.resolution ?? null,
      resolvedBy: params.actorId    ?? null,
      resolvedAt: isTerminal ? new Date() : null,
    },
  });

  // Emit audit event (non-blocking on failure)
  void emitReconEvent({
    organizationId: params.organizationId,
    sessionId:      row.sessionId,
    actorType:      params.actorType ?? "user",
    actorId:        params.actorId   ?? undefined,
    eventType:      actionToEventType(params.action),
    message:        buildStatusMessage(params.action, row.recordKey, row.type, params.resolution),
    metadata: {
      exceptionId: params.exceptionId,
      recordKey:   row.recordKey,
      type:        row.type,
      prevStatus:  fromStatus,
      newStatus:   toStatus,
      runId:       row.runId,
      resolution:  params.resolution ?? null,
    },
  });

  return {
    id:         params.exceptionId,
    newStatus:  toStatus,
    prevStatus: fromStatus,
  };
}

// ── Public: add note ───────────────────────────────────────────────────────────

/**
 * Add an audit note to an exception's metadataJson.notes[] array.
 *
 * Notes are immutable once written.
 * Notes are bounded to 100 per exception — oldest are preserved (no truncation).
 * Note content is limited to 2000 characters.
 *
 * Does NOT:
 *   - Change exception status
 *   - Apply payments or any accounting entry
 */
export async function addExceptionNote(params: {
  organizationId: string;
  exceptionId:    string;
  message:        string;
  actorId?:       string;
  actorType?:     "user" | "system" | "agent";
}): Promise<AddNoteResult> {
  if (!params.message.trim()) {
    throw new Error("El mensaje de la nota no puede estar vacío.");
  }
  if (params.message.length > 2000) {
    throw new Error("Las notas están limitadas a 2000 caracteres.");
  }

  const row = await fetchException(params.organizationId, params.exceptionId);

  const meta  = (row.metadataJson as Record<string, unknown> | null) ?? {};
  const notes = Array.isArray(meta.notes) ? (meta.notes as ExceptionNoteRow[]) : [];

  // Hard cap: 100 notes per exception. Prevents unbounded metadataJson growth.
  // metadataJson must ONLY store: reasons, explanation, lightweight meta, notes.
  // NEVER store: full records, datasets, blobs, prompts, raw rows.
  if (notes.length >= 100) {
    throw new Error("Límite alcanzado: máximo 100 notas por excepción.");
  }

  const newNote: ExceptionNoteRow = {
    id:        genNoteId(),
    actorId:   params.actorId   ?? null,
    actorType: params.actorType ?? "user",
    message:   params.message.trim(),
    createdAt: new Date().toISOString(),
  };

  const updatedNotes = [...notes, newNote];

  await prisma.reconciliationException.updateMany({
    where: { id: params.exceptionId, organizationId: params.organizationId },
    data: {
      metadataJson: { ...meta, notes: updatedNotes } as never,
    },
  });

  // Emit audit event
  void emitReconEvent({
    organizationId: params.organizationId,
    sessionId:      row.sessionId,
    actorType:      params.actorType ?? "user",
    actorId:        params.actorId   ?? undefined,
    eventType:      "exception_note_added",
    message:        `Nota agregada a excepción ${row.recordKey} (${row.type}): "${params.message.trim().slice(0, 80)}${params.message.length > 80 ? "…" : ""}"`,
    metadata: {
      exceptionId: params.exceptionId,
      recordKey:   row.recordKey,
      type:        row.type,
      noteId:      newNote.id,
      runId:       row.runId,
      // NOTE: message NOT stored in metadata to avoid duplicating large text in event log
    },
  });

  return { note: newNote };
}

// ── Convenience wrappers ───────────────────────────────────────────────────────

export const markExceptionUnderReview = (params: {
  organizationId: string;
  exceptionId:    string;
  actorId?:       string;
}): Promise<UpdateStatusResult> =>
  updateExceptionStatus({ ...params, action: "set_reviewing" });

export const resolveException = (params: {
  organizationId: string;
  exceptionId:    string;
  resolution:     string;
  actorId?:       string;
}): Promise<UpdateStatusResult> =>
  updateExceptionStatus({ ...params, action: "resolve" });

export const ignoreException = (params: {
  organizationId: string;
  exceptionId:    string;
  resolution?:    string;
  actorId?:       string;
}): Promise<UpdateStatusResult> =>
  updateExceptionStatus({ ...params, action: "ignore" });

export const reopenException = (params: {
  organizationId: string;
  exceptionId:    string;
  actorId?:       string;
}): Promise<UpdateStatusResult> =>
  updateExceptionStatus({ ...params, action: "reopen" });

// ── Message builders ───────────────────────────────────────────────────────────

function buildStatusMessage(
  action:     ExceptionStatusAction,
  recordKey:  string,
  type:       string,
  resolution: string | undefined,
): string {
  switch (action) {
    case "set_reviewing":
      return `Excepción ${recordKey} (${type}) puesta en revisión`;
    case "resolve":
      return `Excepción ${recordKey} (${type}) marcada como resuelta${resolution ? `: ${resolution.slice(0, 100)}` : ""}`;
    case "ignore":
      return `Excepción ${recordKey} (${type}) ignorada${resolution ? `: ${resolution.slice(0, 100)}` : ""}`;
    case "reopen":
      return `Excepción ${recordKey} (${type}) reabierta para revisión adicional`;
  }
}

// ── Read helpers (re-exported from persistence layer) ─────────────────────────

export {
  getPersistedExceptions,
  getExceptionSummary,
} from "./engine/exception-persistence";
