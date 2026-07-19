/**
 * lib/integrations/integration-events.ts
 *
 * MS-10 — Integration Event System
 *
 * Typed event bus for the integration runtime.
 * All events are organizationId-scoped and payload-safe (no secrets).
 */

// ── Event types ───────────────────────────────────────────────────────────────

export const INTEGRATION_EVENT_TYPE = {
  INTEGRATION_CONNECTED:    "INTEGRATION_CONNECTED",
  INTEGRATION_DISCONNECTED: "INTEGRATION_DISCONNECTED",
  TOKEN_REFRESHED:          "TOKEN_REFRESHED",
  TOKEN_EXPIRED:            "TOKEN_EXPIRED",
  API_REQUEST_FAILED:       "API_REQUEST_FAILED",
  WEBHOOK_RECEIVED:         "WEBHOOK_RECEIVED",
  SYNC_JOB_CREATED:         "SYNC_JOB_CREATED",
  SYNC_JOB_FAILED:          "SYNC_JOB_FAILED",
  SYNC_JOB_COMPLETED:       "SYNC_JOB_COMPLETED",
} as const;
export type IntegrationEventType = typeof INTEGRATION_EVENT_TYPE[keyof typeof INTEGRATION_EVENT_TYPE];

// ── Event payload types ───────────────────────────────────────────────────────
// Payloads are safe: no tokens, no secrets, no PII beyond orgId/connectionId.

export interface ConnectedEventPayload {
  provider:            string;
  externalAccountId:   string | null;
  externalAccountName: string | null;
  scopes:              string[];
}

export interface DisconnectedEventPayload {
  provider: string;
  reason:   "user_initiated" | "token_expired" | "revoked" | "error";
}

export interface TokenExpiredEventPayload {
  provider:     string;
  connectionId: string;
  expiredAt:    string;
}

export interface ApiRequestFailedEventPayload {
  provider:     string;
  connectionId: string;
  endpoint:     string;
  statusCode:   number;
  errorCode?:   string;
}

export interface WebhookReceivedEventPayload {
  provider:       string;
  topic:          string;
  webhookEventId: string;
}

export interface SyncJobEventPayload {
  jobId:     string;
  jobType:   string;
  provider:  string;
  productId: string | null;
}

// ── Integration event record ──────────────────────────────────────────────────

export interface IntegrationEventRecord {
  id:             string;
  organizationId: string;
  connectionId:   string | null;
  provider:       string;
  eventType:      IntegrationEventType;
  /** Safe payload — never contains token values */
  payload:        Record<string, unknown>;
  actorId:        string | null;
  occurredAt:     string;  // ISO
}
