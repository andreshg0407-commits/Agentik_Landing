/**
 * lib/integrations/webhook-dispatcher.ts
 *
 * Agentik — Webhook Dispatcher V1
 *
 * Block B of Sprint AGENTIK-RUNTIME-ORCHESTRATION-GATEWAY-OBSERVABILITY-01
 *
 * Prepares and validates webhook dispatch objects for external integrations.
 * V1: draft creation only — no real HTTP calls.
 * V4: will POST to n8n/external endpoints after human approval.
 */

import type { IntegrationDispatchDraft } from "./integration-contracts";

// ── Types ──────────────────────────────────────────────────────────────────────

export type WebhookStatus =
  | "draft"             // Created, not yet approved
  | "queued"            // Approved, waiting for dispatch
  | "dispatched"        // Successfully sent (V4)
  | "failed"            // Dispatch failed (V4)
  | "cancelled";        // Cancelled by operator

export interface WebhookPayload {
  event:      string;         // Event type (e.g. "execution.supervised.approved")
  agentId:    string;
  orgSlug:    string;
  timestamp:  string;         // ISO string
  data:       Record<string, unknown>;  // Event-specific safe payload
}

export interface WebhookDispatch {
  id:              string;
  integrationId:   string;
  webhookUrl:      string;    // V1: placeholder; V4: real URL from secrets
  payload:         WebhookPayload;
  status:          WebhookStatus;
  preparedAt:      string;    // ISO string
  approvedAt?:     string;    // ISO string (V4: when operator approves)
  dispatchedAt?:   string;    // ISO string (V4: when actually sent)
  requiresApproval: boolean;
  auditId:         string;    // For linking to audit trail
}

// ── Builder ────────────────────────────────────────────────────────────────────

/**
 * Builds a webhook dispatch from an approved integration draft.
 * V1: webhook URL is a placeholder — never actually called.
 */
export function buildWebhookDispatch(
  draft:      IntegrationDispatchDraft,
  event:      string,
  data:       Record<string, unknown>,
): WebhookDispatch {
  const payload: WebhookPayload = {
    event,
    agentId:   draft.agentId,
    orgSlug:   draft.orgSlug,
    timestamp: new Date().toISOString(),
    data,
  };

  return {
    id:               crypto.randomUUID(),
    integrationId:    draft.integrationId,
    webhookUrl:       `[V4: ${draft.integrationId}/webhook]`,   // Placeholder — never called in V1
    payload,
    status:           "draft",
    preparedAt:       new Date().toISOString(),
    requiresApproval: draft.status !== "dispatched",
    auditId:          `audit-${draft.draftId.slice(0, 8)}`,
  };
}

/**
 * Validates a webhook dispatch before queuing.
 * Returns { valid, reason }.
 */
export function validateWebhookDispatch(
  dispatch: WebhookDispatch,
): { valid: boolean; reason: string } {
  if (dispatch.status !== "queued") {
    return {
      valid:  false,
      reason: `Webhook no está en cola — estado actual: ${dispatch.status}`,
    };
  }
  if (!dispatch.payload.event) {
    return { valid: false, reason: "Webhook sin tipo de evento definido" };
  }
  if (!dispatch.integrationId) {
    return { valid: false, reason: "Webhook sin integración destino" };
  }
  return { valid: true, reason: "Webhook válido para despacho" };
}

/**
 * Returns a compact summary of a webhook dispatch for audit/rail display.
 */
export function summarizeWebhookDispatch(dispatch: WebhookDispatch | null): string {
  if (!dispatch) return "Sin webhook preparado";

  const STATUS_LABEL: Record<WebhookStatus, string> = {
    draft:       "Borrador — pendiente de aprobación",
    queued:      "En cola — listo para despacho",
    dispatched:  "Despachado correctamente",
    failed:      "Error en despacho",
    cancelled:   "Cancelado",
  };

  return `${dispatch.integrationId}: ${STATUS_LABEL[dispatch.status]}`;
}

/**
 * Simulates queuing a webhook after approval.
 * V1: lifecycle simulation — no real HTTP call.
 */
export function queueWebhookDispatch(dispatch: WebhookDispatch): WebhookDispatch {
  if (dispatch.requiresApproval && !dispatch.approvedAt) {
    return dispatch; // Cannot queue without approval
  }
  return { ...dispatch, status: "queued" };
}
