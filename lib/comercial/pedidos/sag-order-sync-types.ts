/**
 * lib/comercial/pedidos/sag-order-sync-types.ts
 *
 * Contract: Agentik → SAG for order sync.
 * No Prisma — runs on client and server.
 *
 * Sprint: COMERCIAL-PEDIDOS-CORE-ARCHITECTURE-04
 */

// ── Payload sent to SAG ──────────────────────────────────────────────────────

export interface SagOrderPayload {
  externalSyncKey:     string;
  customerCode:        string;
  customerName:        string;
  sellerCode:          string;
  sellerName:          string;
  warehouseCode:       string | null;
  channel:             string;
  notes:               string;
  deliveryScope:       "full" | "partial";
  orderDate:           string;
  lines:               SagOrderPayloadLine[];
}

export interface SagOrderPayloadLine {
  referenceCode:  string;
  productName:    string;
  size:           string;
  color:          string;
  quantity:       number;
  unitPrice:      number;
  lineTotal:      number;
}

// ── Response from SAG ────────────────────────────────────────────────────────

export type SagOrderSyncResult =
  | SagOrderSyncSuccess
  | SagOrderSyncError;

export interface SagOrderSyncSuccess {
  success:      true;
  sagOrderId:   string;
  sagMessage:   string | null;
  receivedAt:   string;
}

export interface SagOrderSyncError {
  success:      false;
  errorCode:    string;
  errorMessage: string;
  receivedAt:   string;
}

// ── SAG order status query result ────────────────────────────────────────────

export type SagOrderRemoteStatus =
  | "received"
  | "processing"
  | "invoiced"
  | "partially_invoiced"
  | "rejected"
  | "unknown";

export interface SagOrderStatusResult {
  sagOrderId:    string;
  remoteStatus:  SagOrderRemoteStatus;
  invoiceIds:    string[];
  lastCheckedAt: string;
}

// ── SAG write result (WIZARD-IMPROVEMENTS-01) ───────────────────────────────

/**
 * Normalized result from the SAG write pipeline.
 * Every path (DISABLED, SIMULATION, LIVE) produces this same shape.
 */
export type SagOrderWriteErrorCode =
  | "DISABLED"
  | "VALIDATION_FAILED"
  | "IDEMPOTENT_DUPLICATE"
  | "ENQUEUE_FAILED"
  | "SAG_TIMEOUT"
  | "SAG_REJECTED"
  | "EMPTY_RESPONSE"
  | "UNKNOWN";

/** Whether a failed write is safe to retry */
export function isRetryableError(code: SagOrderWriteErrorCode): boolean {
  return code === "SAG_TIMEOUT" || code === "ENQUEUE_FAILED";
}

export interface SagOrderWriteResult {
  ok:              boolean;
  mode:            "DISABLED" | "SIMULATION" | "LIVE";
  sagOperationId?: string;
  errorCode?:      SagOrderWriteErrorCode;
  errorMessage?:   string;
  /** Simulated payload (only in SIMULATION mode, for audit) */
  simulatedPayload?: unknown;
  /** Idempotency key used */
  idempotencyKey?: string;
  timestamp:       string;
}

// ── Idempotency key builder ─────────────────────────────────────────────────

/**
 * Build a deterministic idempotency key for SAG write operations.
 * Format: orgId:orderId:vN
 */
export function buildIdempotencyKey(
  orgId: string,
  orderId: string,
  version: number,
): string {
  return `${orgId}:${orderId}:v${version}`;
}
