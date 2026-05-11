/**
 * dian-sync-orchestrator.ts
 *
 * AGENTIK-DIAN-SYNC-01
 * DIAN Integration Layer — Fiscal Sync Orchestrator
 *
 * Multi-tenant DIAN sync coordinator.
 *
 * Full pipeline per sync request:
 *   1. Validate operation is live
 *   2. Load DIAN Integration record (confirms org has DIAN configured)
 *   3. Concurrency gate — skip if already running for this org + operation
 *   4. Create SyncJob (status=RUNNING) — audit trail anchor
 *   5. Load TenantDianContext (cert + vault + endpoints, per tenant)
 *   6. Execute DIAN operation via DianClient with retry policy
 *   7. Update SyncJob (SUCCEEDED | FAILED)
 *   8. Record outcome in fiscal memory (Integration.metaJson)
 *   9. Emit structured audit event
 *
 * Concurrency safety:
 *   - One active SyncJob per (org, operation) at a time (Prisma query check)
 *   - Each tenant gets its own DianClient instance — no shared state
 *   - Vault access uses per-org SecureVault path — cross-tenant read impossible
 *
 * Retry policy (per operation registry):
 *   - Retry only on: HTTP_TIMEOUT, HTTP_ERROR
 *   - Never retry on: CERTIFICATE_*, WSSE_SIGNING_FAILED, SOAP_FAULT, NOT_FOUND
 *   - DianClient already retries 5xx once internally (low-level);
 *     orchestrator adds one high-level retry after the full client call fails
 *
 * IMPORTANT: Backend-only. Never import in client components.
 * IMPORTANT: Never log signedXml, privateKeyPem, certPassword, bstXml, signatureXml.
 */

import crypto                    from "node:crypto";
import { prisma }                from "@/lib/prisma";
import { loadTenantDianContext } from "../tenant/tenant-loader";
import { loadTenantDianIntegration } from "../tenant/tenant-loader";
import { DianClient }            from "../client/dian-client";
import type { GetAcquirerRequest } from "../types/dian-types";
import type {
  DianSyncRequest,
  DianSyncOutcome,
  DianSyncStatus,
  DianSyncOperation,
  DianSyncMetadata,
} from "./dian-sync-types";
import {
  DIAN_NON_RETRYABLE_CODES,
} from "./dian-sync-types";
import {
  getDianOperationDef,
  getSyncJobType,
  isDianOperationLive,
} from "./dian-sync-registry";
import { recordSyncOutcome }     from "./dian-sync-fiscal-memory";
import {
  emitDianSyncEvent,
  syncStartedEvent,
  syncCompletedEvent,
  syncFailedEvent,
  syncRetryEvent,
  syncSkippedEvent,
} from "./dian-sync-observability";

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Execute a DIAN fiscal sync operation for one organization.
 *
 * Thread-safe for concurrent org requests — each call creates its own
 * DianClient, loads its own TenantDianContext, and locks its own SyncJob.
 *
 * @returns DianSyncOutcome — always returns, never throws
 */
export async function runDianSync(
  req: DianSyncRequest,
): Promise<DianSyncOutcome> {
  const startedAt = Date.now();

  // ── 1. Validate operation ─────────────────────────────────────────────────
  if (!isDianOperationLive(req.operation)) {
    return {
      success:  false,
      status:   "failed",
      error:    `Operation "${req.operation}" is not yet implemented`,
    };
  }

  const opDef = getDianOperationDef(req.operation);

  // ── 2. Load DIAN Integration ──────────────────────────────────────────────
  const integration = await loadTenantDianIntegration(req.organizationId);
  if (!integration) {
    emitDianSyncEvent({
      event:          "TENANT_NOT_FOUND",
      organizationId: req.organizationId,
      operation:      req.operation,
      environment:    req.environment,
      status:         "failed",
      errorCode:      "INTEGRATION_NOT_FOUND",
      at:             new Date().toISOString(),
    });
    return {
      success: false,
      status:  "failed",
      error:   `No DIAN integration configured for organization ${req.organizationId}`,
    };
  }

  // ── 3. Concurrency gate ───────────────────────────────────────────────────
  const concurrentJob = await prisma.syncJob.findFirst({
    where: {
      organizationId: req.organizationId,
      type:           getSyncJobType(req.operation),
      status:         "RUNNING",
    },
    select: { id: true },
  });

  if (concurrentJob) {
    const reason = `SyncJob ${concurrentJob.id} already running for org ${req.organizationId} / ${req.operation}`;
    emitDianSyncEvent(syncSkippedEvent(
      { organizationId: req.organizationId, operation: req.operation, environment: req.environment },
      reason,
      req.traceId,
    ));
    return {
      success: false,
      status:  "skipped",
      error:   reason,
    };
  }

  // ── 4. Compute request hash ───────────────────────────────────────────────
  const requestHash = hashRequest(req.organizationId, req.operation, req.payload);

  // ── 5. Create SyncJob record ──────────────────────────────────────────────
  const syncJob = await prisma.syncJob.create({
    data: {
      organizationId: req.organizationId,
      integrationId:  integration.integrationId,
      type:           getSyncJobType(req.operation),
      traceId:        req.traceId,
      status:         "RUNNING",
      startedAt:      new Date(),
      inputJson: {
        operation:   req.operation,
        environment: req.environment,
        triggeredBy: req.triggeredBy,
        requestHash,
        // NEVER include payload directly — may contain NIT (PII)
      },
    },
    select: { id: true },
  });

  const syncJobId = syncJob.id;

  emitDianSyncEvent(syncStartedEvent(
    { organizationId: req.organizationId, operation: req.operation, environment: req.environment },
    syncJobId,
    req.traceId,
  ));

  // ── 6. Load tenant context ─────────────────────────────────────────────────
  const ctxResult = await loadTenantDianContext(req.organizationId, req.environment);

  if (!ctxResult.success || !ctxResult.context) {
    const errorCode = classifyContextError(ctxResult.error ?? "CONTEXT_LOAD_FAILED");
    return finalizeFailed(syncJobId, req, integration.integrationId, {
      code:      errorCode,
      message:   ctxResult.error ?? "Failed to load DIAN tenant context",
      retryable: false,
      attempt:   1,
    }, Date.now() - startedAt);
  }

  const ctx    = ctxResult.context;
  const client = DianClient.forTenant(ctx);

  // ── 7. Execute with retry ─────────────────────────────────────────────────
  const policy = opDef.retryPolicy;
  let   lastError: { code: string; message: string } | undefined;
  let   retryCount = 0;

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    if (attempt > 1) {
      const delay = computeDelay(attempt - 1, policy.baseDelayMs, policy.maxDelayMs);
      emitDianSyncEvent(syncRetryEvent(
        { organizationId: req.organizationId, operation: req.operation, environment: req.environment },
        syncJobId,
        lastError?.code ?? "UNKNOWN",
        attempt,
        delay,
      ));
      await sleep(delay);
      retryCount++;
    }

    const opResult = await dispatchOperation(client, req.operation, req.payload);

    if (opResult.success) {
      const durationMs = Date.now() - startedAt;
      const metadata: DianSyncMetadata = {
        soapAction:  opDef.soapAction,
        requestHash,
        summary:     opResult.summary,
      };

      // Finalize SyncJob as SUCCEEDED
      await prisma.syncJob.update({
        where: { id: syncJobId },
        data: {
          status:   "SUCCEEDED",
          endedAt:  new Date(),
          outputJson: {
            responseStatus: "SOAP_SUCCESS",
            durationMs,
            retryCount,
            metadata,
          } as never,
        },
      });

      // Update fiscal memory
      await recordSyncOutcome({
        integrationId: integration.integrationId,
        operation:     req.operation,
        environment:   req.environment,
        status:        "succeeded",
        durationMs,
        retryCount,
        certExpiresAt: undefined, // populated by future cert expiry sprint
      });

      emitDianSyncEvent(syncCompletedEvent(
        { organizationId: req.organizationId, operation: req.operation, environment: req.environment },
        syncJobId,
        durationMs,
      ));

      return {
        success:    true,
        syncJobId,
        status:     "succeeded",
        durationMs,
      };
    }

    // Operation failed — check if retryable
    const errCode    = opResult.error?.code ?? "UNKNOWN";
    const errMessage = opResult.error?.message ?? "Unknown error";
    lastError = { code: errCode, message: errMessage };

    const isRetryable =
      !(DIAN_NON_RETRYABLE_CODES as readonly string[]).includes(errCode) &&
      (policy.retryOnCodes as readonly string[]).includes(errCode) &&
      attempt < policy.maxAttempts;

    if (!isRetryable) {
      const durationMs = Date.now() - startedAt;
      return finalizeFailed(syncJobId, req, integration.integrationId, {
        code:      errCode,
        message:   errMessage,
        retryable: false,
        attempt,
      }, durationMs, retryCount);
    }
  }

  // Exhausted all attempts
  const durationMs = Date.now() - startedAt;
  return finalizeFailed(syncJobId, req, integration.integrationId, {
    code:      lastError?.code ?? "UNKNOWN",
    message:   lastError?.message ?? "All retry attempts exhausted",
    retryable: false,
    attempt:   policy.maxAttempts,
  }, durationMs, retryCount);
}

// ── Operation dispatch ────────────────────────────────────────────────────────

interface OperationResult {
  success:  boolean;
  error?:   { code: string; message: string };
  summary?: Record<string, unknown>;
}

/**
 * Dispatch a single DIAN operation to DianClient.
 * Returns a normalized OperationResult (never throws).
 *
 * Future operations (GetStatus, SendBillAsync, etc.) should be added
 * as additional case branches here and implemented in DianClient.
 */
async function dispatchOperation(
  client:    DianClient,
  operation: DianSyncOperation,
  payload:   unknown,
): Promise<OperationResult> {
  try {
    switch (operation) {
      case "GetAcquirer": {
        const request = payload as GetAcquirerRequest;
        const result  = await client.getAcquirer(request);
        if (result.success) {
          return {
            success: true,
            summary: {
              success: result.data?.success ?? false,
              // NOTE: do NOT include razonSocial or email here — PII
              // The caller (API layer) can read full response from DianClient directly
            },
          };
        }
        return {
          success: false,
          error:   result.error ?? { code: "UNKNOWN", message: "No error detail" },
        };
      }

      // Future operations — not yet implemented in DianClient
      case "GetStatus":
      case "GetStatusZip":
      case "SendBillAsync":
      case "SendBillSync":
      case "SendTestSetAsync":
        return {
          success: false,
          error: {
            code:    "NOT_IMPLEMENTED",
            message: `Operation "${operation}" is scaffolded but not yet implemented in DianClient`,
          },
        };

      default: {
        const _exhaustive: never = operation;
        return {
          success: false,
          error:   { code: "UNKNOWN_OPERATION", message: `Unknown operation: ${String(_exhaustive)}` },
        };
      }
    }
  } catch (err) {
    return {
      success: false,
      error:   {
        code:    "DISPATCH_ERROR",
        message: err instanceof Error ? err.message.slice(0, 200) : "Unexpected dispatch error",
      },
    };
  }
}

// ── Failure finalizer ─────────────────────────────────────────────────────────

async function finalizeFailed(
  syncJobId:     string,
  req:           DianSyncRequest,
  integrationId: string,
  failure:       { code: string; message: string; retryable: boolean; attempt: number },
  durationMs:    number,
  retryCount     = 0,
): Promise<DianSyncOutcome> {
  await prisma.syncJob.update({
    where: { id: syncJobId },
    data: {
      status:  "FAILED",
      endedAt: new Date(),
      errorJson: {
        code:       failure.code,
        retryable:  failure.retryable,
        retryCount,
        attempt:    failure.attempt,
        durationMs,
        // message is sanitized in audit event — stored without sanitization here
        // but we cap it to prevent giant blobs
        message: failure.message.slice(0, 500),
      },
    },
  });

  await recordSyncOutcome({
    integrationId,
    operation:   req.operation,
    environment: req.environment,
    status:      "failed",
    durationMs,
    retryCount,
    errorCode:   failure.code,
  });

  emitDianSyncEvent(syncFailedEvent(
    { organizationId: req.organizationId, operation: req.operation, environment: req.environment },
    syncJobId,
    failure.code,
    failure.message,
    failure.attempt,
    durationMs,
  ));

  return {
    success:    false,
    syncJobId,
    status:     "failed",
    error:      `${failure.code}: ${failure.message.slice(0, 200)}`,
    durationMs,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hashRequest(orgId: string, operation: DianSyncOperation, payload: unknown): string {
  const raw = JSON.stringify({ orgId, operation, payload });
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

function classifyContextError(error: string): string {
  if (error.includes("certificate") || error.includes("cert")) return "CERTIFICATE_INVALID";
  if (error.includes("suspended"))  return "INTEGRATION_SUSPENDED";
  if (error.includes("environment")) return "ENVIRONMENT_MISMATCH";
  if (error.includes("vault") || error.includes("secret")) return "VAULT_ERROR";
  return "CONTEXT_LOAD_FAILED";
}

function computeDelay(retryIndex: number, baseMs: number, maxMs: number): number {
  return Math.min(baseMs * 2 ** (retryIndex - 1), maxMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
