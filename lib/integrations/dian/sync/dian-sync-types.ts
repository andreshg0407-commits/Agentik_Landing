/**
 * dian-sync-types.ts
 *
 * AGENTIK-DIAN-SYNC-01
 * DIAN Integration Layer — Fiscal Sync Type Surface
 *
 * Defines all types used by the DIAN sync orchestrator:
 *   - DianSyncOperation registry
 *   - DianSyncJob / DianSyncResult / DianSyncFailure / DianSyncMetadata
 *   - DianSyncRetryPolicy
 *   - DianFiscalMemoryEntry (stored in Integration.metaJson)
 *   - DianXmlSafetyPolicy — what to persist / hash / never touch
 *
 * SECURITY: None of these types carry signed XML, private keys,
 * WS-Security tokens, or certificate passwords.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import type { DianEnvironment } from "../types/dian-types";

// ── Operation registry ────────────────────────────────────────────────────────

/**
 * All DIAN WCF service operations.
 * "live" = implemented in DianClient.
 * "future" = scaffolded — not yet wired.
 */
export type DianSyncOperation =
  | "GetAcquirer"     // live — verify buyer identity
  | "GetStatus"       // future — query document status by CUFE
  | "GetStatusZip"    // future — query batch zip status
  | "SendBillAsync"   // future — async fiscal document submission
  | "SendBillSync"    // future — sync fiscal document submission
  | "SendTestSetAsync"; // future — habilitación test batch

export const DIAN_LIVE_OPERATIONS: DianSyncOperation[] = ["GetAcquirer"];

// ── Sync status ───────────────────────────────────────────────────────────────

export type DianSyncStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped";   // skipped = concurrent lock held by another job

// ── Sync job model ────────────────────────────────────────────────────────────

/**
 * Tracks a single DIAN operation invocation.
 * Stored as SyncJob in the database (type = "dian.{operation}").
 *
 * Never stores: signed XML, private keys, WS-Security tokens, cert passwords.
 */
export interface DianSyncJob {
  syncJobId:      string;
  organizationId: string;
  integrationId:  string;
  operation:      DianSyncOperation;
  environment:    DianEnvironment;
  status:         DianSyncStatus;
  traceId?:       string;
  triggeredBy:    "cron" | "webhook" | "manual" | "api";
  requestHash:    string;          // SHA-256 of request params — idempotency token
  startedAt:      string;          // ISO
  endedAt?:       string;          // ISO
  durationMs?:    number;
  retryCount:     number;
  result?:        DianSyncResult;
  error?:         DianSyncFailure;
}

/**
 * Operation outcome — safe summary (no raw XML, no secrets).
 */
export interface DianSyncResult {
  responseStatus: DianResponseStatus;
  httpStatus?:    number;
  durationMs:     number;
  metadata:       DianSyncMetadata;
}

export type DianResponseStatus =
  | "SOAP_SUCCESS"    // 2xx + valid SOAP response body
  | "SOAP_FAULT"      // valid XML but SOAP Fault element present
  | "HTTP_ERROR"      // non-2xx HTTP response
  | "HTTP_TIMEOUT"    // AbortController timeout
  | "NON_XML"         // non-XML response body
  | "PARSE_ERROR";    // XML parsed but failed to extract typed data

/**
 * Structured failure — safe to persist.
 * Never includes: raw SOAP envelope, WS-Security tokens, private key material.
 */
export interface DianSyncFailure {
  code:       string;        // DianErrorCode value
  message:    string;        // human-readable, no secrets
  retryable:  boolean;       // true = transient (HTTP timeout / 5xx)
  attempt:    number;        // which attempt produced this failure (1-based)
}

/**
 * Operation-specific result summary.
 * Safe to persist — only derived/aggregated values.
 */
export interface DianSyncMetadata {
  soapAction?:      string;
  requestHash?:     string;   // SHA-256 first 16 chars of request params
  responseHash?:    string;   // SHA-256 first 16 chars of response body (if available)
  summary?:         Record<string, unknown>; // operation-specific non-sensitive summary
}

// ── Retry policy ──────────────────────────────────────────────────────────────

export interface DianSyncRetryPolicy {
  /** Total attempts (first call + retries). Max 3. */
  maxAttempts:    number;
  baseDelayMs:    number;
  maxDelayMs:     number;
  /** Error codes that trigger a retry. All others are terminal. */
  retryOnCodes:   readonly string[];
}

/**
 * Error codes that should NEVER be retried.
 *
 * - Signing failures: re-signing produces a new timestamp; signature is still invalid.
 * - Certificate errors: won't self-heal between retries.
 * - SOAP Fault: a DIAN business/auth error — server rejected the request intentionally.
 */
export const DIAN_NON_RETRYABLE_CODES = [
  "CERTIFICATE_INVALID",
  "CERTIFICATE_LOAD_FAILED",
  "WSSE_SIGNING_FAILED",
  "SOAP_BUILD_FAILED",
  "SOAP_FAULT",
  "NOT_FOUND",
  "RESPONSE_INVALID",
] as const;

/**
 * Error codes that are retryable — transient network/infrastructure issues.
 */
export const DIAN_RETRYABLE_CODES = [
  "HTTP_TIMEOUT",
  "HTTP_ERROR",
] as const;

/** Default retry policy for all live DIAN operations. */
export const DIAN_DEFAULT_RETRY_POLICY: DianSyncRetryPolicy = {
  maxAttempts:  2,           // 1 initial + 1 retry
  baseDelayMs:  2_000,       // 2s base
  maxDelayMs:   15_000,      // 15s max
  retryOnCodes: DIAN_RETRYABLE_CODES,
};

// ── Fiscal memory ─────────────────────────────────────────────────────────────

/**
 * A single sync execution outcome — stored in the recentOutcomes ring buffer.
 * No raw XML, no signed content, no PII beyond status/code/timing.
 */
export interface DianSyncOutcomeEntry {
  status:     "succeeded" | "failed";
  errorCode?: string;          // code only (e.g. "SOAP_FAULT", "HTTP_TIMEOUT")
  retryCount: number;          // number of high-level orchestrator retries
  durationMs: number;
  at:         string;          // ISO
}

/**
 * Per-operation sync health tracking.
 * Stored as Integration.metaJson → fiscalSync[operation][environment].
 *
 * Updated after every sync job completion. Never includes raw responses.
 *
 * OBSERVATIONS-01 extensions:
 *   lastHealthyAt      — ISO of last SUCCEEDED run (independent of lastRunAt)
 *   operationalStreak  — consecutive successes; resets to 0 on any failure
 *   retryStreak        — consecutive syncs with retryCount > 0; resets on no-retry execution
 *   recentOutcomes     — last 10 sync outcomes (ring buffer); drives all pattern detectors
 */
export interface DianFiscalMemoryEntry {
  lastRunAt:         string;              // ISO
  lastStatus:        DianSyncStatus;
  successCount:      number;
  failureCount:      number;
  avgLatencyMs:      number;
  p99LatencyMs:      number;
  recentLatencies:   number[];            // last 20 latency samples (ring buffer)
  lastErrorCode?:    string;              // code only, no messages
  certExpiresAt?:    string;             // ISO — populated from parsed cert
  // OBSERVATIONS-01 extensions
  lastHealthyAt?:    string;             // ISO of last SUCCEEDED run
  operationalStreak: number;             // consecutive successes (0 on first entry)
  retryStreak:       number;             // consecutive syncs with retryCount > 0
  recentOutcomes:    DianSyncOutcomeEntry[]; // last 10 outcomes (ring buffer)
}

/** Shape of Integration.metaJson managed by the DIAN sync layer. */
export interface DianFiscalMemory {
  version:     "1";
  fiscalSync:  Partial<Record<
    DianSyncOperation,
    Partial<Record<DianEnvironment, DianFiscalMemoryEntry>>
  >>;
}

// ── XML / secret safety policy ────────────────────────────────────────────────

/**
 * Declarative safety policy for what can be persisted/logged.
 *
 * Rule: if in doubt, hash it or skip it.
 */
export const DIAN_XML_SAFETY_POLICY = {
  /** Never persist, log, or include in any storage layer. */
  neverPersist: [
    "signedXml",         // contains WS-Security tokens (BST + Signature)
    "xmlBody",           // unsigned SOAP envelope (has placeholders — still unsafe)
    "privateKeyPem",     // RSA private key from PKCS#12
    "certBuffer",        // raw .p12 binary
    "certPassword",      // PKCS#12 password
    "bstXml",            // BinarySecurityToken element
    "signatureXml",      // ds:Signature element
    "certDer",           // DER-encoded certificate
  ] as const,

  /** Persist only first 16 chars of SHA-256 hash. */
  hashOnly: [
    "requestParams",     // GetAcquirer input (includes NIT — PII)
    "responseBody",      // raw SOAP response (may include fiscal data)
  ] as const,

  /** Safe to persist as-is. */
  safeToPersist: [
    "requestHash",       // SHA-256 idempotency token
    "responseStatus",    // "SOAP_SUCCESS" | "SOAP_FAULT" etc.
    "httpStatus",        // 200 | 500 etc.
    "durationMs",        // latency measurement
    "soapAction",        // operation name
    "retryCount",        // how many attempts were made
    "errorCode",         // DianErrorCode (no raw message)
    "avgLatencyMs",      // aggregated metric
  ] as const,
} as const;

// ── Sync request (orchestrator input) ─────────────────────────────────────────

/**
 * What the orchestrator accepts to trigger a DIAN sync operation.
 * Caller provides operation name + typed payload; orchestrator handles the rest.
 */
export interface DianSyncRequest {
  organizationId: string;
  environment:    DianEnvironment;
  operation:      DianSyncOperation;
  /** Operation-specific input (e.g. GetAcquirerRequest). Not stored raw. */
  payload:        unknown;
  traceId?:       string;
  triggeredBy:    "cron" | "webhook" | "manual" | "api";
}

/** Result returned from the orchestrator entry point. */
export interface DianSyncOutcome {
  success:     boolean;
  syncJobId?:  string;
  status:      DianSyncStatus;
  error?:      string;              // human-readable summary (no secrets)
  durationMs?: number;
}
