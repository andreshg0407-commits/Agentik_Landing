/**
 * lib/comercial/pedidos/order-sag-idempotency.ts
 *
 * Idempotency for the SAG write pipeline.
 * Generates deterministic payload hashes and checks for duplicates.
 *
 * Key format: orgId:orderId:vN:hash
 *
 * Behavior:
 *   - Same order + same payload → reuse existing operation
 *   - Same order + different payload before send → allow (new version)
 *   - Same order + different payload after SUCCEEDED → block
 *   - Timeout with uncertain result → do NOT auto-retry
 *
 * Pure functions (computePayloadHash, buildIdempotencyKeyV2) have NO
 * server dependencies and can be imported from tests without Prisma.
 * The DB-dependent checkIdempotency() requires server-only context.
 *
 * Sprint: AGENTIK-ORDERS-SAG-WRITE-ADAPTER-01
 */

import { createHash } from "node:crypto";
import type { SagDocumentInput } from "@/lib/sag/write/types";

// ── Payload hash ──────────────────────────────────────────────────────────────

/**
 * Build a deterministic SHA-256 hash of the SAG document payload.
 * Only includes fields that affect the SAG document content.
 * Field order is canonical (sorted keys) to ensure determinism.
 */
export function computePayloadHash(input: SagDocumentInput): string {
  const canonical = {
    TIPO_DOC:    input.TIPO_DOC,
    NIT:         input.NIT,
    FECHA:       input.FECHA,
    VENDEDOR:    input.VENDEDOR ?? null,
    BODEGA:      input.BODEGA ?? null,
    OBSERVACION: input.OBSERVACION ?? null,
    LINEAS:      input.LINEAS.map(l => ({
      CODIGO:    l.CODIGO,
      CANTIDAD:  l.CANTIDAD,
      PRECIO:    l.PRECIO,
      DESCUENTO: l.DESCUENTO ?? 0,
      IVA:       l.IVA ?? null,
      BODEGA:    l.BODEGA ?? null,
    })).sort((a, b) => a.CODIGO.localeCompare(b.CODIGO)),
  };

  return createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex")
    .slice(0, 16); // 16 hex chars = 64 bits — sufficient for collision avoidance
}

// ── Idempotency key ───────────────────────────────────────────────────────────

export function buildIdempotencyKeyV2(
  orgId: string,
  orderId: string,
  version: number,
  payloadHash: string,
): string {
  return `${orgId}:${orderId}:v${version}:${payloadHash}`;
}

// ── Duplicate check ───────────────────────────────────────────────────────────

export type IdempotencyCheckResult =
  | { action: "proceed" }
  | { action: "reuse"; operationId: string; status: string }
  | { action: "already_queued"; operationId: string; status: string }
  | { action: "already_succeeded"; operationId: string }
  | { action: "payload_changed_after_success"; operationId: string }
  | { action: "failed_allow_retry"; operationId: string; previousStatus: string };

/**
 * Check idempotency before enqueuing a new SAG write operation.
 *
 * Uses sourceRef (= externalSyncKey) to find existing operations for this order.
 * Compares payloadHash to detect payload changes.
 *
 * Requires Prisma — only call from server-only context.
 */
export async function checkIdempotency(
  organizationId: string,
  sourceRef: string,
  payloadHash: string,
): Promise<IdempotencyCheckResult> {
  const { prisma } = await import("@/lib/prisma");
  const existing = await prisma.sagWriteOperation.findMany({
    where: { organizationId, sourceRef },
    select: { id: true, status: true, inputJson: true },
    orderBy: { initiatedAt: "desc" },
    take: 5,
  });

  if (existing.length === 0) {
    return { action: "proceed" };
  }

  for (const op of existing) {
    if (op.status === "SUCCEEDED") {
      // Extract hash from stored input to compare
      const storedHash = extractStoredPayloadHash(op.inputJson);
      if (storedHash === payloadHash) {
        return { action: "already_succeeded", operationId: op.id };
      }
      // Payload changed after success — block
      return { action: "payload_changed_after_success", operationId: op.id };
    }

    if (op.status === "PENDING" || op.status === "APPROVED" || op.status === "SENDING") {
      return { action: "already_queued", operationId: op.id, status: op.status };
    }

    if (op.status === "FAILED") {
      return { action: "failed_allow_retry", operationId: op.id, previousStatus: op.status };
    }

    // REJECTED, CANCELLED, EXPIRED — allow new operation
  }

  return { action: "proceed" };
}

/**
 * Extract payloadHash from stored inputJson if present.
 * Returns null if the operation was created before hash tracking.
 */
function extractStoredPayloadHash(inputJson: unknown): string | null {
  if (!inputJson || typeof inputJson !== "object") return null;
  const json = inputJson as Record<string, unknown>;
  if (typeof json._payloadHash === "string") return json._payloadHash;
  return null;
}
