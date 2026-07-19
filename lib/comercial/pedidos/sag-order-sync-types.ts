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
