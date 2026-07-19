/**
 * lib/integrations/execution-signing.ts
 *
 * Agentik — Execution Signing Layer
 *
 * Sprint: AGENTIK-TENANT-INTEGRATION-MANAGER-AND-CONTROL-CENTER-01 — Block B2
 *
 * Builds signed execution headers for supervised dispatch.
 * Provides trace propagation, replay references, execution lifecycle linking,
 * and tenant-safe signature metadata.
 *
 * V1: deterministic header construction — no real HMAC/crypto signing.
 *     Architecture-ready: header shape and validation contract are production-grade.
 * V4: real HMAC-SHA256 signing using vault-held signing key.
 *
 * IMPORTANT: No real crypto in V1. Signature field is architecture-ready placeholder.
 */

// ── Signed execution headers ──────────────────────────────────────────────────

export interface SignedExecutionHeaders {
  "x-agentik-org":         string;    // Tenant identifier
  "x-agentik-execution":   string;    // Execution bundle ID
  "x-agentik-correlation": string;    // Trace propagation correlation ID
  "x-agentik-replay":      string;    // Replay reference (replay session ID)
  "x-agentik-supervised":  "true";    // Always present — supervised mode marker
  "x-agentik-lifecycle":   string;    // Lifecycle stage (prepared|executing|completed)
  "x-agentik-signature":   string;    // V1: placeholder; V4: HMAC-SHA256
  "x-agentik-timestamp":   string;    // ISO timestamp — replay window validation
  "content-type":          "application/json";
}

// ── Signature validation result ───────────────────────────────────────────────

export interface ExecutionSignatureValidation {
  valid:      boolean;
  errors:     string[];
  warnings:   string[];
  tenantSafe: boolean;
  summary:    string;
}

// ── Lifecycle stage ───────────────────────────────────────────────────────────

export type ExecutionLifecycleStage =
  | "prepared"    // Bundle built — not yet executing
  | "approved"    // Human approved — ready for dispatch
  | "executing"   // In progress
  | "completed"   // Finished successfully
  | "failed"      // Error state
  | "rolled_back"; // Rollback completed

// ── Build signed execution headers ───────────────────────────────────────────

export interface BuildSignedHeadersParams {
  orgSlug:       string;
  executionId:   string;
  correlationId: string;
  replayRef:     string;
  lifecycle:     ExecutionLifecycleStage;
}

/**
 * Builds signed execution headers for supervised dispatch.
 * V1: signature is an architecture-ready placeholder (not real HMAC).
 * V4: replaced with real HMAC-SHA256 using vault signing key.
 */
export function buildSignedExecutionHeaders(
  params: BuildSignedHeadersParams,
): SignedExecutionHeaders {
  const { orgSlug, executionId, correlationId, replayRef, lifecycle } = params;
  const timestamp = new Date().toISOString();

  // V1: deterministic placeholder signature — no real crypto
  const signaturePlaceholder = buildV1SignaturePlaceholder(orgSlug, executionId, correlationId);

  return {
    "x-agentik-org":         orgSlug,
    "x-agentik-execution":   executionId,
    "x-agentik-correlation": correlationId,
    "x-agentik-replay":      replayRef,
    "x-agentik-supervised":  "true",
    "x-agentik-lifecycle":   lifecycle,
    "x-agentik-signature":   signaturePlaceholder,
    "x-agentik-timestamp":   timestamp,
    "content-type":          "application/json",
  };
}

// ── Validate execution signature ──────────────────────────────────────────────

/**
 * Validates the structural integrity of signed execution headers.
 * V1: validates presence and format — not real cryptographic verification.
 * V4: real HMAC-SHA256 verification against vault signing key.
 */
export function validateExecutionSignature(
  headers: SignedExecutionHeaders,
  orgSlug: string,
): ExecutionSignatureValidation {
  const errors:   string[] = [];
  const warnings: string[] = [];

  // Tenant isolation check
  const tenantSafe = headers["x-agentik-org"] === orgSlug;
  if (!tenantSafe) {
    errors.push("Violación de aislamiento de tenant — org en headers no coincide");
  }

  // Supervised mode must be present
  if (headers["x-agentik-supervised"] !== "true") {
    errors.push("Marcador de modo supervisado ausente");
  }

  // Required fields check
  if (!headers["x-agentik-execution"]) {
    errors.push("ID de ejecución ausente en headers");
  }
  if (!headers["x-agentik-correlation"]) {
    errors.push("ID de correlación ausente — trace propagation fallará");
  }
  if (!headers["x-agentik-replay"]) {
    warnings.push("Referencia de replay ausente — auditoría reducida");
  }
  if (!headers["x-agentik-signature"]) {
    warnings.push("Firma ausente — V4 requerirá HMAC real");
  }

  // Timestamp drift check (V1: structural only)
  const timestamp = new Date(headers["x-agentik-timestamp"]);
  if (isNaN(timestamp.getTime())) {
    errors.push("Timestamp inválido en headers");
  }

  const valid = errors.length === 0;
  const summary =
    !valid    ? `${errors.length} error${errors.length > 1 ? "es" : ""} de firma — dispatch bloqueado`
    : warnings.length > 0 ? "Headers válidos con advertencias de firma"
    : "Headers firmados válidos — dispatch autorizado";

  return { valid, errors, warnings, tenantSafe, summary };
}

// ── Build correlation ID ──────────────────────────────────────────────────────

/**
 * Builds a trace propagation correlation ID.
 * Stable across the full execution lifecycle: bundle → bridge → n8n → callback → replay.
 */
export function buildExecutionCorrelationId(orgSlug: string, executionId: string): string {
  const ts  = Date.now().toString(36);
  const org = orgSlug.slice(0, 4).replace(/[^a-z0-9]/gi, "x");
  const eid = executionId.slice(-6).replace(/[^a-z0-9]/gi, "0");
  return `cor-${org}-${eid}-${ts}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * V1: builds a deterministic placeholder signature string.
 * NOT cryptographically secure — architecture marker only.
 * V4: replaced by HMAC-SHA256(signingKey, orgSlug + executionId + correlationId + timestamp).
 */
function buildV1SignaturePlaceholder(
  orgSlug:       string,
  executionId:   string,
  correlationId: string,
): string {
  const base = `${orgSlug}:${executionId}:${correlationId}`;
  // Simple checksum-style placeholder — NOT secure
  let h = 0;
  for (let i = 0; i < base.length; i++) {
    h = ((h << 5) - h) + base.charCodeAt(i);
    h |= 0;
  }
  return `v1-placeholder-${(h >>> 0).toString(16).padStart(8, "0")}`;
}
