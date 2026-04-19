/**
 * lib/sag/write/executor.ts
 *
 * SAG Write Executor — sends an APPROVED operation to SAG.
 *
 * This is the only place in the codebase that calls insercionSag().
 * It is always called explicitly — never triggered automatically.
 *
 * Flow:
 *   1. Load the APPROVED operation from DB
 *   2. Load connector config (token + endpoint) from the org's sag_pya_soap Connector
 *   3. Transition operation → SENDING (sets sentAt, copies generatedXml → submittedXml)
 *   4. Call insercionSag() with the stored generatedXml
 *   5. Persist SAG response (raw + ok flag)
 *   6. Transition → SUCCEEDED or FAILED
 *
 * Step 3 happens before the network call so that if the process dies mid-flight
 * the operation is recoverable (status=SENDING, sentAt set, no response yet).
 *
 * On network errors or SOAP faults, the operation lands in FAILED with lastError set.
 * On SAG-level errors (ok=false), same: FAILED, but sagResponseRaw is populated.
 *
 * Callers must NOT call this on non-APPROVED operations — the executor
 * will throw rather than silently corrupt the audit trail.
 */

import { prisma }       from "@/lib/prisma";
import { getPyaConfig } from "@/lib/connectors/pya/auth";
import { insercionSag } from "./client";
import { markSending, markResult, markFailed } from "./queue";
import type { SagWriteType, SagWriteResponse } from "./types";

// ── Connector config loader ───────────────────────────────────────────────────

async function loadSagConfig(organizationId: string) {
  const connector = await prisma.connector.findFirst({
    where: { organizationId, source: "sag_pya_soap" },
    select: { config: true },
  });

  if (!connector) {
    throw new Error("SAG_EXECUTOR: Conector sag_pya_soap no encontrado para esta organización.");
  }

  // getPyaConfig reads { token, endpointUrl? } from the connector config
  return getPyaConfig(connector.config);
}

// ── Executor ──────────────────────────────────────────────────────────────────

export interface ExecuteResult {
  ok:           boolean;
  operationId:  string;
  sagResponse?: SagWriteResponse;
  error?:       string;
}

/**
 * Execute an APPROVED SAG write operation.
 *
 * @param operationId    — SagWriteOperation.id
 * @param organizationId — must match operation.organizationId (safety check)
 */
export async function executeOperation(
  operationId:    string,
  organizationId: string,
): Promise<ExecuteResult> {
  // ── 1. Load operation ──────────────────────────────────────────────────────

  const op = await prisma.sagWriteOperation.findFirst({
    where: { id: operationId, organizationId },
    select: { id: true, status: true, writeType: true, generatedXml: true, organizationId: true },
  });

  if (!op) {
    return { ok: false, operationId, error: "Operación no encontrada." };
  }
  if (op.status !== "APPROVED") {
    return {
      ok: false, operationId,
      error: `Estado "${op.status}" — sólo se pueden ejecutar operaciones APPROVED.`,
    };
  }

  // ── 2. Load SAG credentials ────────────────────────────────────────────────

  let sagConfig: Awaited<ReturnType<typeof loadSagConfig>>;
  try {
    sagConfig = await loadSagConfig(organizationId);
  } catch (e) {
    await markFailed(operationId, (e as Error).message);
    return { ok: false, operationId, error: (e as Error).message };
  }

  // ── 3. Transition to SENDING — establishes audit timestamp ────────────────
  //   Pass generatedXml directly to avoid a second DB read inside markSending.

  await markSending(operationId, op.generatedXml);

  // ── 4 & 5. Call SAG, persist result ──────────────────────────────────────

  let sagResponse: SagWriteResponse;
  try {
    sagResponse = await insercionSag(
      sagConfig,
      op.writeType as SagWriteType,
      op.generatedXml,
    );
  } catch (e) {
    const errMsg = (e as Error).message;
    await markFailed(operationId, errMsg);
    return { ok: false, operationId, error: errMsg };
  }

  await markResult(operationId, sagResponse);

  return {
    ok: sagResponse.ok,
    operationId,
    sagResponse,
    error: sagResponse.ok ? undefined : sagResponse.message,
  };
}
