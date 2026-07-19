/**
 * lib/sag/write/queue.ts
 *
 * SAG Write Queue — service layer for managing write operations.
 *
 * Lifecycle:
 *   enqueue()  → creates SagWriteOperation in PENDING state
 *   approve()  → transitions PENDING → APPROVED (triggers executor)
 *   reject()   → transitions PENDING → REJECTED (terminal)
 *   markSent() → called by executor: APPROVED → SENDING → SUCCEEDED|FAILED
 *   retry()    → manual: FAILED → APPROVED (max 3 attempts)
 *
 * All methods are org-scoped to prevent cross-org access.
 * The executor is intentionally called from the API route (not here)
 * so that approval and execution can happen in the same HTTP request.
 */

import { prisma }                   from "@/lib/prisma";
import { validateSagWriteInput }    from "./validators";
import { buildXml }                 from "./xml-builders";
import { WRITE_TYPE_RISK }          from "./types";
import type {
  SagWriteInput,
  SagWriteStatus,
  SagWriteType,
  SagWriteResponse,
  ValidationResult,
} from "./types";

const MAX_RETRIES = 3;

// ── DB accessor ───────────────────────────────────────────────────────────────

type SagWriteOp = Awaited<ReturnType<typeof prisma.sagWriteOperation.findFirstOrThrow>>;

function db() {
  return prisma.sagWriteOperation;
}

// ── enqueue ───────────────────────────────────────────────────────────────────

export interface EnqueueResult {
  ok:           boolean;
  operationId?: string;
  validation?:  ValidationResult;
  error?:       string;
}

/**
 * Validate input, build XML, and create a PENDING write operation.
 * Returns validation errors without DB write if input is invalid.
 */
export async function enqueue(
  organizationId: string,
  initiatedBy:    string,
  input:          SagWriteInput,
  opts: {
    description: string;
    sourceRef?:  string;
  },
): Promise<EnqueueResult> {
  // 1. Validate input
  const validation = validateSagWriteInput(input);
  if (!validation.valid) {
    return { ok: false, validation };
  }

  // 2. Generate XML deterministically — stored immediately for reviewer inspection
  let generatedXml: string;
  try {
    generatedXml = buildXml(input);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  // 3. Create PENDING operation
  const op = await db().create({
    data: {
      organizationId,
      writeType:    input.type,
      status:       "PENDING" satisfies SagWriteStatus,
      risk:         WRITE_TYPE_RISK[input.type as SagWriteType],
      description:  opts.description,
      sourceRef:    opts.sourceRef ?? null,
      inputJson:    input as unknown as object,
      generatedXml,
      submittedXml:  null,
      sagResponseRaw:null,
      sagResponseOk: null,
      initiatedBy,
      initiatedAt:   new Date(),
      retryCount:    0,
    },
  });

  return { ok: true, operationId: op.id };
}

// ── approve ───────────────────────────────────────────────────────────────────

export async function approve(
  operationId:    string,
  organizationId: string,
  approvedBy:     string,
): Promise<{ ok: boolean; error?: string }> {
  const op = await db().findFirst({
    where: { id: operationId, organizationId },
  });

  if (!op) return { ok: false, error: "Operación no encontrada." };
  if (op.status !== "PENDING") {
    return { ok: false, error: `Estado actual "${op.status}" — sólo se pueden aprobar operaciones PENDING.` };
  }

  await db().update({
    where: { id: operationId },
    data: {
      status:     "APPROVED" satisfies SagWriteStatus,
      approvedBy,
      approvedAt: new Date(),
    },
  });

  return { ok: true };
}

// ── reject ────────────────────────────────────────────────────────────────────

export async function reject(
  operationId:    string,
  organizationId: string,
  rejectedBy:     string,
  reason:         string,
): Promise<{ ok: boolean; error?: string }> {
  const op = await db().findFirst({
    where: { id: operationId, organizationId },
  });

  if (!op) return { ok: false, error: "Operación no encontrada." };
  if (op.status !== "PENDING") {
    return { ok: false, error: `Estado actual "${op.status}" — sólo se pueden rechazar operaciones PENDING.` };
  }

  await db().update({
    where: { id: operationId },
    data: {
      status:          "REJECTED" satisfies SagWriteStatus,
      rejectedBy,
      rejectedAt:      new Date(),
      rejectionReason: reason || "Sin motivo indicado.",
    },
  });

  return { ok: true };
}

// ── markSending / markResult / markFailed (called by executor) ────────────────

/**
 * Transition APPROVED → SENDING.
 *
 * Accepts the already-fetched generatedXml so the executor avoids a second
 * DB round-trip just to copy the field.
 */
export async function markSending(
  operationId:  string,
  generatedXml: string,
): Promise<void> {
  await db().update({
    where: { id: operationId },
    data: {
      status:       "SENDING" satisfies SagWriteStatus,
      sentAt:       new Date(),
      submittedXml: generatedXml,
    },
  });
}

/**
 * Transition SENDING → SUCCEEDED | FAILED (SAG-level response).
 * Sets executedAt to record when the execution round-trip completed.
 */
export async function markResult(
  operationId: string,
  response:    SagWriteResponse,
): Promise<void> {
  await db().update({
    where: { id: operationId },
    data: {
      status:         (response.ok ? "SUCCEEDED" : "FAILED") satisfies SagWriteStatus,
      sagResponseRaw: response.raw,
      sagResponseOk:  response.ok,
      lastError:      response.ok ? null : response.message,
      executedAt:     new Date(),
    },
  });
}

/**
 * Transition APPROVED|SENDING → FAILED (network error or SOAP fault).
 *
 * Uses Prisma's atomic increment to avoid a read-before-write for retryCount.
 * Sets executedAt so every attempt has a completed-at timestamp.
 */
export async function markFailed(operationId: string, error: string): Promise<void> {
  await db().update({
    where: { id: operationId },
    data: {
      status:     "FAILED" satisfies SagWriteStatus,
      lastError:  error,
      retryCount: { increment: 1 },
      executedAt: new Date(),
    },
  });
}

// ── retry ─────────────────────────────────────────────────────────────────────

export async function retry(
  operationId:    string,
  organizationId: string,
  approvedBy:     string,
): Promise<{ ok: boolean; error?: string }> {
  const op = await db().findFirst({ where: { id: operationId, organizationId } });

  if (!op) return { ok: false, error: "Operación no encontrada." };
  if (op.status !== "FAILED") {
    return { ok: false, error: `Estado "${op.status}" — sólo se pueden reintentar operaciones FAILED.` };
  }
  if (op.retryCount >= MAX_RETRIES) {
    return { ok: false, error: `Máximo de reintentos (${MAX_RETRIES}) alcanzado. Revisar manualmente.` };
  }

  await db().update({
    where: { id: operationId },
    data: {
      status:     "APPROVED" satisfies SagWriteStatus,
      approvedBy,
      approvedAt: new Date(),
    },
  });

  return { ok: true };
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function listOperations(
  organizationId: string,
  filters?: { status?: SagWriteStatus },
): Promise<SagWriteOp[]> {
  return db().findMany({
    where: {
      organizationId,
      ...(filters?.status ? { status: filters.status } : {}),
    },
    orderBy: { initiatedAt: "desc" },
    take: 100,
  });
}

export async function getOperation(
  operationId:    string,
  organizationId: string,
): Promise<SagWriteOp | null> {
  return db().findFirst({ where: { id: operationId, organizationId } });
}

export async function pendingCount(organizationId: string): Promise<number> {
  return db().count({ where: { organizationId, status: "PENDING" } });
}
