/**
 * lib/sag/write/observability.ts
 *
 * Structured observability events for the SAG write pipeline.
 * Uses the shared sanitizer — no PII or credentials in events.
 *
 * Sprint: AGENTIK-ORDERS-SAG-WRITE-ADAPTER-01
 */

import { sagWriteLog, sanitizeEndpoint, safePayloadMetrics } from "./sanitizer";
import type { SagWriteStatus } from "./types";

const MODULE = "SAG_WRITE";

export type WriteEventType =
  | "write_started"
  | "write_validated"
  | "write_enqueued"
  | "write_approved"
  | "write_sending"
  | "write_succeeded"
  | "write_failed"
  | "write_retried"
  | "write_cancelled"
  | "write_expired"
  | "write_rejected";

export interface WriteEventFields {
  operationId?: string;
  orderId?: string;
  tenant: string;
  durationMs?: number;
  payloadBytes?: number;
  lineCount?: number;
  attempt?: number;
  errorCategory?: string;
  retryable?: boolean;
  previousStatus?: SagWriteStatus;
  newStatus?: SagWriteStatus;
  mode?: string;
  endpoint?: string;
}

export function emitWriteEvent(
  event: WriteEventType,
  fields: WriteEventFields,
): void {
  const data: Record<string, unknown> = { ...fields };

  if (fields.endpoint) {
    data.endpoint = sanitizeEndpoint(fields.endpoint);
  }

  sagWriteLog(MODULE, event, data);
}

export function emitWriteStarted(
  operationId: string,
  tenant: string,
  orderId: string,
  xml: string,
  mode: string,
): void {
  const metrics = safePayloadMetrics(xml);
  emitWriteEvent("write_started", {
    operationId,
    tenant,
    orderId,
    payloadBytes: metrics.bytes,
    lineCount: metrics.lineCount,
    mode,
  });
}

export function emitWriteSucceeded(
  operationId: string,
  tenant: string,
  durationMs: number,
  attempt: number,
): void {
  emitWriteEvent("write_succeeded", {
    operationId,
    tenant,
    durationMs,
    attempt,
  });
}

export function emitWriteFailed(
  operationId: string,
  tenant: string,
  durationMs: number,
  attempt: number,
  errorCategory: string,
  retryable: boolean,
): void {
  emitWriteEvent("write_failed", {
    operationId,
    tenant,
    durationMs,
    attempt,
    errorCategory,
    retryable,
  });
}
