/**
 * lib/marketing-studio/operators/operator-types.ts
 *
 * MS-19 — Channel Operator Layer: All types, enums, and DTOs
 *
 * Operators are the thin dispatch adapters between the Orchestrator
 * and execution destinations (Shopify, Social, WhatsApp, Catalog, etc.).
 *
 * Each operator:
 *  1. Validates the request
 *  2. Calls dispatchExecutionJob() via the execution bridge
 *  3. Writes an OperatorReceipt to DB
 *  4. Writes an OperatorAuditEvent to DB
 *  5. Returns an OperatorResult
 */

// ── Channel enum ──────────────────────────────────────────────────────────────

export const OPERATOR_CHANNEL = {
  SHOPIFY:  "shopify",
  SOCIAL:   "social",
  WHATSAPP: "whatsapp",
  CATALOG:  "catalog",
  ADS:      "ads",
  EMAIL:    "email",
  LANDING:  "landing",
} as const;

export type OperatorChannel = typeof OPERATOR_CHANNEL[keyof typeof OPERATOR_CHANNEL];

// ── Action enum ───────────────────────────────────────────────────────────────

export const OPERATOR_ACTION = {
  DISPATCH:       "dispatch",
  PUBLISH:        "publish",
  SYNC:           "sync",
  PREPARE:        "prepare",
  RETRY:          "retry",
  CANCEL:         "cancel",
  HEALTH_CHECK:   "health_check",
} as const;

export type OperatorAction = typeof OPERATOR_ACTION[keyof typeof OPERATOR_ACTION];

// ── Status enum ───────────────────────────────────────────────────────────────

export const OPERATOR_STATUS = {
  PENDING:    "pending",
  DISPATCHED: "dispatched",
  CONFIRMED:  "confirmed",
  FAILED:     "failed",
  PARTIAL:    "partial",
} as const;

export type OperatorStatus = typeof OPERATOR_STATUS[keyof typeof OPERATOR_STATUS];

// ── Health enum ───────────────────────────────────────────────────────────────

export const OPERATOR_HEALTH = {
  HEALTHY:     "healthy",
  DEGRADED:    "degraded",
  UNAVAILABLE: "unavailable",
  UNKNOWN:     "unknown",
} as const;

export type OperatorHealth = typeof OPERATOR_HEALTH[keyof typeof OPERATOR_HEALTH];

// ── Failure types ─────────────────────────────────────────────────────────────

export const OPERATOR_FAILURE_TYPE = {
  RATE_LIMITED:      "rate_limited",
  VALIDATION_FAILED: "validation_failed",
  NOT_IMPLEMENTED:   "not_implemented",
  EXTERNAL_ERROR:    "external_error",
  EXECUTION_ERROR:   "execution_error",
  DUPLICATE:         "duplicate",
  AUTH_FAILED:       "auth_failed",
  TIMEOUT:           "timeout",
} as const;

export type OperatorFailureType = typeof OPERATOR_FAILURE_TYPE[keyof typeof OPERATOR_FAILURE_TYPE];

// ── Request / Result DTOs ─────────────────────────────────────────────────────

export interface OperatorRequest {
  organizationId: string;
  channel:        OperatorChannel;
  action:         OperatorAction;
  actorId?:       string | null;
  planId?:        string | null;
  stageId?:       string | null;
  entityId?:      string | null;
  productId?:     string | null;
  catalogId?:     string | null;
  retryCount?:    number;
  priority?:      number;
  payload:        Record<string, unknown>;
}

export interface OperatorResult {
  success:       boolean;
  channel:       OperatorChannel;
  action:        OperatorAction;
  status:        OperatorStatus;
  receiptId?:    string | null;
  executionJobId?: string | null;
  externalRef?:  string | null;
  wasDeduped?:   boolean;
  durationMs?:   number;
  error?: {
    code:    OperatorFailureType;
    message: string;
  };
}

// ── Operator interface (all channel operators implement this) ─────────────────

export interface ChannelOperator {
  channel: OperatorChannel;
  dispatch(req: OperatorRequest): Promise<OperatorResult>;
  healthCheck(organizationId: string): Promise<OperatorHealth>;
}

// ── Health summary ────────────────────────────────────────────────────────────

export interface OperatorHealthSummary {
  channel:        OperatorChannel;
  health:         OperatorHealth;
  successRate:    number;
  avgDurationMs:  number;
  totalDispatched: number;
  totalFailed:    number;
  lastCheckedAt:  string;
}

export interface OperatorSystemHealth {
  overallHealth: OperatorHealth;
  channels:      OperatorHealthSummary[];
  computedAt:    string;
}
