/**
 * lib/comercial/tiendas/store-replenishment-workflow-service.ts
 *
 * AGENTIK-STORES-REPLENISHMENT-FULFILLMENT-01 — Workflow transitions.
 *
 * Leyes:
 *   - Transición ATÓMICA con concurrencia optimista: el UPDATE exige el
 *     estado esperado (updateMany WHERE status = fromStatus); 0 filas =
 *     carrera perdida → StaleDocumentStateError con el estado real. Cero
 *     eventos duplicados, cero estados pisados.
 *   - Evento de auditoría en la MISMA transacción: sin evento no hay
 *     transición y viceversa. Eventos APPEND-ONLY.
 *   - occurredAt lo genera EXCLUSIVAMENTE el servidor (@default(now())).
 *   - Actor estructurado: actorId (identidad) + actorDisplayName (snapshot).
 *   - IDEMPOTENCIA por transición: mismo idempotencyKey sobre el mismo
 *     documento → misma respuesta, cero eventos nuevos (retry HTTP seguro).
 *   - Multi-tenant: documento de otra organización ≡ inexistente (mismo
 *     error, sin filtración de existencia).
 *   - planSnapshot, planFingerprint, consecutivo y documentNumber son
 *     INTOCABLES por el workflow — solo status (+ updatedAt) cambia.
 *
 * SERVER ONLY.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import {
  resolveTransition,
  WORKFLOW_VERSION,
  type WorkflowTransition,
} from "./store-replenishment-workflow-engine";
import type { ReplenishmentDocumentStatus } from "./store-replenishment-document-types";

const db = prisma as any;

// ── Typed errors ─────────────────────────────────────────────────────────────

export class DocumentNotFoundError extends Error {
  readonly code = "DOCUMENT_NOT_FOUND";
  constructor(documentId: string) {
    // Mismo mensaje para "no existe" y "es de otra organización".
    super(`[WORKFLOW] Documento ${documentId} no encontrado.`);
    this.name = "DocumentNotFoundError";
  }
}

export class StaleDocumentStateError extends Error {
  readonly code = "STALE_DOCUMENT_STATE";
  readonly currentStatus: ReplenishmentDocumentStatus;
  constructor(documentId: string, expected: string, current: ReplenishmentDocumentStatus) {
    super(
      `[WORKFLOW] El documento ${documentId} ya no está en ${expected} ` +
      `(estado actual: ${current}). Otra transición ganó la carrera; recargar y reintentar.`,
    );
    this.name = "StaleDocumentStateError";
    this.currentStatus = current;
  }
}

// ── Contracts ────────────────────────────────────────────────────────────────

export interface WorkflowActor {
  actorId: string;
  actorDisplayName?: string;
}

export interface TransitionOptions {
  note?: string;
  metadata?: Record<string, string | number | boolean>;
  /** Retry-safe: mismo key sobre el mismo documento → misma respuesta. */
  idempotencyKey?: string;
}

export interface WorkflowEventRecord {
  id: string;
  documentId: string;
  batchId: string;
  fromStatus: ReplenishmentDocumentStatus;
  toStatus: ReplenishmentDocumentStatus;
  transition: WorkflowTransition;
  workflowVersion: number;
  actorId: string;
  actorDisplayName: string | null;
  note: string | null;
  metadata: Record<string, unknown> | null;
  occurredAt: string;
}

export interface TransitionResult {
  documentId: string;
  documentNumber: string;
  status: ReplenishmentDocumentStatus;
  event: WorkflowEventRecord;
  /** true si el comando ya se había ejecutado (idempotencia) — sin evento nuevo. */
  replayed: boolean;
}

function toEventRecord(e: any): WorkflowEventRecord {
  return {
    id: e.id,
    documentId: e.documentId,
    batchId: e.batchId,
    fromStatus: e.fromStatus,
    toStatus: e.toStatus,
    transition: e.transition,
    workflowVersion: e.workflowVersion,
    actorId: e.actorId,
    actorDisplayName: e.actorDisplayName ?? null,
    note: e.note ?? null,
    metadata: e.metadata ?? null,
    occurredAt: e.occurredAt?.toISOString?.() ?? "",
  };
}

// ── Transition ───────────────────────────────────────────────────────────────

export async function transitionReplenishmentDocument(
  orgId: string,
  documentId: string,
  transition: WorkflowTransition | string,
  actor: WorkflowActor,
  options: TransitionOptions = {},
): Promise<TransitionResult> {
  if (!actor?.actorId || actor.actorId.trim() === "") {
    throw new Error("[WORKFLOW] actorId es obligatorio (actor estructurado).");
  }

  const doc = await db.storeReplenishmentDocument.findFirst({
    where: { id: documentId, organizationId: orgId },
  });
  if (!doc) throw new DocumentNotFoundError(documentId);

  // IDEMPOTENCIA: mismo comando ya ejecutado → misma respuesta, cero eventos.
  if (options.idempotencyKey) {
    const existing = await db.storeReplenishmentDocumentEvent.findUnique({
      where: { documentId_idempotencyKey: { documentId, idempotencyKey: options.idempotencyKey } },
    });
    if (existing) {
      return {
        documentId,
        documentNumber: doc.documentNumber,
        status: doc.status,
        event: toEventRecord(existing),
        replayed: true,
      };
    }
  }

  // Resolver contra el estado leído; la atomicidad real la da el WHERE.
  const resolved = resolveTransition(doc.status, transition);

  const result = await db.$transaction(async (tx: any) => {
    // Concurrencia optimista: exige el estado esperado.
    const updated = await tx.storeReplenishmentDocument.updateMany({
      where: { id: documentId, organizationId: orgId, status: resolved.fromStatus },
      data: { status: resolved.toStatus },   // SOLO status (+updatedAt automático)
    });
    if (updated.count === 0) return null;    // carrera perdida

    const event = await tx.storeReplenishmentDocumentEvent.create({
      data: {
        organizationId: orgId,
        documentId,
        batchId: doc.batchId,
        fromStatus: resolved.fromStatus,
        toStatus: resolved.toStatus,
        transition: resolved.transition,
        workflowVersion: WORKFLOW_VERSION,
        actorId: actor.actorId,
        actorDisplayName: actor.actorDisplayName ?? null,
        note: options.note ?? null,
        metadata: options.metadata ?? undefined,
        idempotencyKey: options.idempotencyKey ?? null,
        // occurredAt: EXCLUSIVAMENTE @default(now()) del servidor.
      },
    });
    return event;
  });

  if (result === null) {
    const current = await db.storeReplenishmentDocument.findFirst({
      where: { id: documentId, organizationId: orgId },
      select: { status: true },
    });
    throw new StaleDocumentStateError(documentId, resolved.fromStatus, current?.status ?? "DESCONOCIDO");
  }

  return {
    documentId,
    documentNumber: doc.documentNumber,
    status: resolved.toStatus,
    event: toEventRecord(result),
    replayed: false,
  };
}

// ── Events (append-only, orden cronológico de servidor) ──────────────────────

export async function listDocumentEvents(
  orgId: string,
  documentId: string,
): Promise<WorkflowEventRecord[]> {
  const doc = await db.storeReplenishmentDocument.findFirst({
    where: { id: documentId, organizationId: orgId },
    select: { id: true },
  });
  if (!doc) throw new DocumentNotFoundError(documentId);

  const events = await db.storeReplenishmentDocumentEvent.findMany({
    where: { organizationId: orgId, documentId },
    orderBy: { occurredAt: "asc" },
  });
  return events.map(toEventRecord);
}
