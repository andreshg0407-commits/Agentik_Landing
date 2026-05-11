/**
 * dian-sync-registry.ts
 *
 * AGENTIK-DIAN-SYNC-01
 * DIAN Integration Layer — Operation Registry
 *
 * Typed registry of all DIAN WCF service operations.
 * Each entry declares the SOAP action, retry policy, and implementation status.
 *
 * To add a new operation:
 *   1. Add the operation name to DianSyncOperation in dian-sync-types.ts
 *   2. Add a registry entry here
 *   3. Implement in DianClient
 *   4. Wire dispatch in dian-sync-orchestrator.ts
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import type { DianSyncOperation, DianSyncRetryPolicy } from "./dian-sync-types";
import { DIAN_DEFAULT_RETRY_POLICY, DIAN_NON_RETRYABLE_CODES } from "./dian-sync-types";

// ── Operation definition ──────────────────────────────────────────────────────

export interface DianOperationDef {
  operation:    DianSyncOperation;
  soapAction:   string;
  syncJobType:  string;             // SyncJob.type value (e.g. "dian.get_acquirer")
  retryPolicy:  DianSyncRetryPolicy;
  status:       "live" | "future";  // "future" = not yet implemented in DianClient
  description:  string;
}

// ── Registry ──────────────────────────────────────────────────────────────────

const REGISTRY: Record<DianSyncOperation, DianOperationDef> = {
  GetAcquirer: {
    operation:   "GetAcquirer",
    soapAction:  "http://wcf.dian.colombia/IWcfDianCustomerServices/GetAcquirer",
    syncJobType: "dian.get_acquirer",
    retryPolicy: DIAN_DEFAULT_RETRY_POLICY,
    status:      "live",
    description: "Verify buyer (adquiriente) identity against DIAN electronic invoicing registry",
  },

  GetStatus: {
    operation:   "GetStatus",
    soapAction:  "http://wcf.dian.colombia/IWcfDianCustomerServices/GetStatus",
    syncJobType: "dian.get_status",
    retryPolicy: DIAN_DEFAULT_RETRY_POLICY,
    status:      "future",
    description: "Query fiscal document status by CUFE",
  },

  GetStatusZip: {
    operation:   "GetStatusZip",
    soapAction:  "http://wcf.dian.colombia/IWcfDianCustomerServices/GetStatusZip",
    syncJobType: "dian.get_status_zip",
    retryPolicy: DIAN_DEFAULT_RETRY_POLICY,
    status:      "future",
    description: "Query batch zip processing status",
  },

  SendBillAsync: {
    operation:   "SendBillAsync",
    soapAction:  "http://wcf.dian.colombia/IWcfDianCustomerServices/SendBillAsync",
    syncJobType: "dian.send_bill_async",
    retryPolicy: {
      maxAttempts:  2,
      baseDelayMs:  5_000,   // longer base delay for document submission
      maxDelayMs:   30_000,
      retryOnCodes: ["HTTP_TIMEOUT", "HTTP_ERROR"],
    },
    status:      "future",
    description: "Submit fiscal document for async processing",
  },

  SendBillSync: {
    operation:   "SendBillSync",
    soapAction:  "http://wcf.dian.colombia/IWcfDianCustomerServices/SendBillSync",
    syncJobType: "dian.send_bill_sync",
    retryPolicy: {
      maxAttempts:  1,       // sync submission — never retry (risk of double-submit)
      baseDelayMs:  0,
      maxDelayMs:   0,
      retryOnCodes: [],
    },
    status:      "future",
    description: "Submit fiscal document for synchronous processing (no retry — double-submit risk)",
  },

  SendTestSetAsync: {
    operation:   "SendTestSetAsync",
    soapAction:  "http://wcf.dian.colombia/IWcfDianCustomerServices/SendTestSetAsync",
    syncJobType: "dian.send_test_set_async",
    retryPolicy: DIAN_DEFAULT_RETRY_POLICY,
    status:      "future",
    description: "Submit habilitacion test set batch (habilitacion environment only)",
  },
};

// ── Registry accessors ────────────────────────────────────────────────────────

export function getDianOperationDef(operation: DianSyncOperation): DianOperationDef {
  return REGISTRY[operation];
}

export function isDianOperationLive(operation: DianSyncOperation): boolean {
  return REGISTRY[operation]?.status === "live";
}

export function getSyncJobType(operation: DianSyncOperation): string {
  return REGISTRY[operation]?.syncJobType ?? `dian.${operation.toLowerCase()}`;
}

export function isRetryableErrorCode(code: string): boolean {
  return !(DIAN_NON_RETRYABLE_CODES as readonly string[]).includes(code);
}

export { REGISTRY as DIAN_OPERATION_REGISTRY };
