/**
 * lib/integrations/webhook-execution.ts
 *
 * Agentik — Webhook Execution Layer
 *
 * Sprint: AGENTIK-SECURITY-VAULT-AND-REAL-CONNECTORS-01 — Block B3
 *
 * Builds validated webhook execution payloads for supervised dispatch.
 * These payloads are safe to log, audit, and pass to the copilot pipeline.
 *
 * V1: payload construction + validation — no live HTTP calls.
 *     buildWebhookPayload() produces a complete, validated payload record.
 * V4: payloads consumed by a real HTTP client (fetch/axios) with retry + timeout.
 *
 * IMPORTANT: Never includes raw secret values in any payload field.
 * Secret references are resolved at execution time by the vault layer.
 */

import type { RealConnectorId } from "./real-connectors";
import type { SupervisedDispatch } from "./supervised-dispatch";

// ── Webhook payload ──────────────────────────────────────────────────────────────

export interface WebhookPayload {
  payloadId:       string;
  orgSlug:         string;
  connectorId:     RealConnectorId;
  action:          string;
  dispatchId:      string;
  executionId?:    string;
  headers:         WebhookHeaders;
  body:            WebhookBody;
  valid:           boolean;
  validationErrors: string[];
  preparedAt:      string;  // ISO timestamp
}

// ── Headers ──────────────────────────────────────────────────────────────────────

export interface WebhookHeaders {
  "x-agentik-org":        string;   // orgSlug (tenant identifier)
  "x-agentik-connector":  string;   // connectorId
  "x-agentik-dispatch":   string;   // dispatchId
  "x-agentik-execution"?: string;   // executionId (optional)
  "x-agentik-action":     string;   // action name
  "x-agentik-supervised": "true";   // Always true — signals supervised mode
  "content-type":         "application/json";
}

// ── Body ─────────────────────────────────────────────────────────────────────────

export interface WebhookBody {
  orgSlug:          string;
  connectorId:      string;
  action:           string;
  dispatchId:       string;
  executionId?:     string;
  supervised:       true;    // Always true
  auditTag:         string;  // Opaque audit tag — no secrets
  metadata:         WebhookMetadata;
}

export interface WebhookMetadata {
  runtimeValidated:  boolean;
  vaultValidated:    boolean;
  governanceApproved: boolean;
  rollbackAvailable: boolean;
  rollbackWindowMins?: number;
  preparedAt:        string;
}

// ── Execution validation result ──────────────────────────────────────────────────

export interface WebhookExecutionValidation {
  valid:        boolean;
  errors:       string[];
  warnings:     string[];
  canProceed:   boolean;
  summary:      string;
}

// ── Build webhook payload ────────────────────────────────────────────────────────

/**
 * Builds a complete webhook execution payload from a supervised dispatch record.
 * Validates the payload against connector contract requirements.
 * Returns a ready-to-dispatch (V4) or audit-ready (V1) payload record.
 */
export function buildWebhookPayload(dispatch: SupervisedDispatch): WebhookPayload {
  const payloadId  = generatePayloadId(dispatch.orgSlug, dispatch.connectorId);
  const preparedAt = new Date().toISOString();

  const validation = validateWebhookExecution(dispatch);

  const headers: WebhookHeaders = {
    "x-agentik-org":       dispatch.orgSlug,
    "x-agentik-connector": dispatch.connectorId,
    "x-agentik-dispatch":  dispatch.id,
    "x-agentik-action":    dispatch.action,
    "x-agentik-supervised": "true",
    "content-type":         "application/json",
    ...(dispatch.executionId
      ? { "x-agentik-execution": dispatch.executionId }
      : {}),
  };

  const body: WebhookBody = {
    orgSlug:     dispatch.orgSlug,
    connectorId: dispatch.connectorId,
    action:      dispatch.action,
    dispatchId:  dispatch.id,
    supervised:  true,
    auditTag:    dispatch.auditTag,
    metadata: {
      runtimeValidated:   dispatch.runtimeValidated,
      vaultValidated:     dispatch.vaultValidated,
      governanceApproved: dispatch.governanceApproved,
      rollbackAvailable:  dispatch.rollbackAvailable,
      rollbackWindowMins: dispatch.rollbackWindowMins,
      preparedAt:         dispatch.preparedAt,
    },
    ...(dispatch.executionId ? { executionId: dispatch.executionId } : {}),
  };

  return {
    payloadId,
    orgSlug:          dispatch.orgSlug,
    connectorId:      dispatch.connectorId,
    action:           dispatch.action,
    dispatchId:       dispatch.id,
    executionId:      dispatch.executionId,
    headers,
    body,
    valid:            validation.valid,
    validationErrors: validation.errors,
    preparedAt,
  };
}

// ── Validate webhook execution ───────────────────────────────────────────────────

/**
 * Validates a supervised dispatch before building a webhook payload.
 * Returns validation errors and warnings — does not call any external service.
 */
export function validateWebhookExecution(
  dispatch: SupervisedDispatch,
): WebhookExecutionValidation {
  const errors:   string[] = [];
  const warnings: string[] = [];

  // Hard blocks
  if (dispatch.dispatchStatus === "blocked") {
    errors.push(dispatch.blockReason ?? "Despacho bloqueado sin razón especificada");
  }

  if (dispatch.dispatchStatus === "failed") {
    errors.push(dispatch.blockReason ?? "Despacho fallido sin detalle de error");
  }

  if (!dispatch.runtimeValidated) {
    errors.push("Runtime no validado — despacho no permitido");
  }

  if (!dispatch.vaultValidated) {
    errors.push("Vault no validado — secretos no verificados");
  }

  if (!dispatch.orgSlug || dispatch.orgSlug.trim() === "") {
    errors.push("orgSlug requerido para aislamiento de tenant");
  }

  if (!dispatch.action || dispatch.action.trim() === "") {
    errors.push("Acción requerida para despacho");
  }

  // Approval gate: only block if still awaiting (not yet approved)
  if (
    dispatch.dispatchStatus === "awaiting_approval" &&
    dispatch.approvalRequired &&
    !dispatch.governanceApproved
  ) {
    errors.push("Aprobación humana requerida — despacho no autorizado aún");
  }

  // Warnings
  if (dispatch.warningReasons.length > 0) {
    warnings.push(...dispatch.warningReasons);
  }

  if (!dispatch.rollbackAvailable) {
    warnings.push("Rollback no disponible para este conector — acción irreversible");
  }

  const valid      = errors.length === 0;
  const canProceed = valid && dispatch.dispatchStatus !== "blocked";

  const summary = !valid
    ? `${errors.length} error${errors.length > 1 ? "es" : ""} de validación — despacho bloqueado`
    : warnings.length > 0
    ? `Payload válido con ${warnings.length} advertencia${warnings.length > 1 ? "s" : ""}`
    : "Payload válido — listo para despacho supervisado";

  return { valid, errors, warnings, canProceed, summary };
}

// ── Build execution headers (standalone helper) ──────────────────────────────────

/**
 * Returns just the webhook headers for a dispatch context.
 * Used by the gateway layer when constructing outbound requests.
 */
export function buildExecutionHeaders(
  orgSlug:    string,
  connectorId: RealConnectorId,
  dispatchId: string,
  action:     string,
  executionId?: string,
): WebhookHeaders {
  return {
    "x-agentik-org":        orgSlug,
    "x-agentik-connector":  connectorId,
    "x-agentik-dispatch":   dispatchId,
    "x-agentik-action":     action,
    "x-agentik-supervised": "true",
    "content-type":         "application/json",
    ...(executionId ? { "x-agentik-execution": executionId } : {}),
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

function generatePayloadId(orgSlug: string, connectorId: string): string {
  const ts  = Date.now().toString(36);
  const org = orgSlug.slice(0, 4).replace(/[^a-z0-9]/gi, "x");
  return `wh-${org}-${connectorId.slice(0, 4)}-${ts}`;
}
