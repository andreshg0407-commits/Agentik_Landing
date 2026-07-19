/**
 * lib/execution/execution-types.ts
 *
 * AGENTIK-EXECUTION-REGISTRY-01 — Cross-Module Execution Types
 *
 * All types are JSON-serializable — safe for RSC → client boundary.
 * No secrets, no tokens, no encrypted values ever appear here.
 *
 * ── Consumer registry ────────────────────────────────────────────────────────
 * Future modules that must register AgentExecutions:
 *
 * MARKETING-ADS-VALIDATION-01   — registers each ad draft validation run
 * MARKETING-ADS-EXECUTION-01    — registers each real ad publication
 * SHOPIFY-EXECUTION-01          — registers product push / price updates
 * WHATSAPP-EXECUTION-01         — registers message sends
 * DIAN-EXECUTION-01             — registers invoice emission
 * RECONCILIATION-EXECUTION-01   — registers reconciliation runs
 * COPILOT-ACTION-EXECUTION-01   — registers Copilot-triggered actions
 *
 * Integration pattern (each consumer):
 *   1. import { createExecution, completeExecution, failExecution }
 *        from "@/lib/execution/execution-registry";
 *   2. createExecution({ tenantId, module, provider, operation, createdBy })
 *   3. ... run the actual operation ...
 *   4. completeExecution(id, tenantId, { summary, externalReferenceIds })
 *      OR failExecution(id, tenantId, { errorCode, errorMessage })
 */

// ── Module keys ────────────────────────────────────────────────────────────────

/**
 * Canonical module identifiers — used for routing and filtering.
 */
export type ExecutionModule =
  | "ads"               // Paid advertising (Meta, TikTok, Google)
  | "finance"           // Financial operations (reconciliation, invoices, payments)
  | "shopify"           // Shopify product/catalog operations
  | "whatsapp"          // WhatsApp Business messaging
  | "dian"              // Colombian tax authority (invoice emission)
  | "reconciliation"    // Bank reconciliation
  | "copilot"           // Copilot-triggered actions
  | "marketing_studio"  // Marketing Studio (video render, content export, publishing)
  | "other";            // Uncategorized — prefer specific modules

/**
 * Canonical provider identifiers — the external system being acted upon.
 */
export type ExecutionProvider =
  | "meta"      // Meta (Facebook Ads, Instagram Ads)
  | "tiktok"    // TikTok Business Ads
  | "google"    // Google Ads
  | "shopify"   // Shopify Admin API
  | "whatsapp"  // WhatsApp Business Cloud API
  | "dian"      // Colombian DIAN tax API
  | "internal"  // No external system (internal-only operation)
  | string;     // Open for future providers

// ── Status lifecycle ───────────────────────────────────────────────────────────

/**
 * Normalized execution status — covers the full lifecycle of any operation.
 *
 * pending           → created, not yet started
 * validating        → pre-flight checks running (credentials, limits, policy)
 * awaiting_approval → blocked on human approval
 * approved          → approval granted, ready to execute
 * executing         → operation in progress against external system
 * completed         → operation finished successfully
 * failed            → operation finished with an error
 * cancelled         → operation abandoned before completion
 */
export type ExecutionStatus =
  | "pending"
  | "validating"
  | "awaiting_approval"
  | "approved"
  | "executing"
  | "completed"
  | "failed"
  | "cancelled";

export const EXECUTION_TERMINAL_STATUSES: ReadonlyArray<ExecutionStatus> = [
  "completed",
  "failed",
  "cancelled",
];

export const EXECUTION_ACTIVE_STATUSES: ReadonlyArray<ExecutionStatus> = [
  "pending",
  "validating",
  "awaiting_approval",
  "approved",
  "executing",
];

export function isTerminalStatus(status: ExecutionStatus): boolean {
  return EXECUTION_TERMINAL_STATUSES.includes(status);
}

export function isActiveStatus(status: ExecutionStatus): boolean {
  return EXECUTION_ACTIVE_STATUSES.includes(status);
}

// ── Domain record ─────────────────────────────────────────────────────────────

/**
 * AgentExecutionRecord — serializable representation of one execution.
 * Safe to pass from RSC → client. No credentials or secrets.
 *
 * UI consumers can use this to show:
 *   - "En ejecución" (status = executing)
 *   - "Completado"   (status = completed)
 *   - "Falló"        (status = failed)
 *   - "Requiere aprobación" (status = awaiting_approval)
 */
export interface AgentExecutionRecord {
  /** Stable internal ID (cuid). */
  id:                   string;
  /** Tenant that owns this execution. */
  tenantId:             string;
  /** Module that owns this execution. */
  module:               ExecutionModule;
  /** External system / integration provider. Null for internal ops. */
  provider:             string | null;
  /** Human-readable description of the intended action. */
  intent:               string | null;
  /** Machine-readable operation key (e.g. CREATE_AD, EMIT_INVOICE). */
  operation:            string;
  /** Current lifecycle status. */
  status:               ExecutionStatus;
  /** Actor that created the execution. */
  createdBy:            string;
  /** Actor that approved the execution (null if not required or not yet approved). */
  approvedBy:           string | null;
  /** When the execution was approved. ISO string. Null until formally approved. */
  approvedAt:           string | null;
  /**
   * Safe external system references (IDs only — no secrets).
   * Example: { "meta_ad_id": "act_123", "campaign_id": "456" }
   */
  externalReferenceIds: Record<string, string> | null;
  /** Short human-readable outcome summary. */
  summary:              string | null;
  /** Machine-readable error code if failed. */
  errorCode:            string | null;
  /** Human-readable error description if failed. No tokens or stack traces. */
  errorMessage:         string | null;
  /** When execution transitioned to "executing". ISO string. */
  startedAt:            string | null;
  /** When execution reached terminal status. ISO string. */
  completedAt:          string | null;
  /** ISO creation timestamp. */
  createdAt:            string;
  /** ISO last-updated timestamp. */
  updatedAt:            string;
}

// ── Input shapes ──────────────────────────────────────────────────────────────

/** Input to createExecution(). */
export interface CreateExecutionInput {
  tenantId:              string;
  module:                ExecutionModule;
  /** External provider (e.g. "meta", "tiktok"). Omit for internal ops. */
  provider?:             string;
  /** Human-readable intent description. */
  intent?:               string;
  /** Machine-readable operation key. */
  operation:             string;
  /** Actor creating this execution (userId, agentId, or "system"). */
  createdBy:             string;
  /** Initial summary (can be updated later). */
  summary?:              string;
  /** Initial external references (can be updated via appendMetadata). */
  externalReferenceIds?: Record<string, string>;
  /** Safe metadata (no secrets). */
  metadata?:             Record<string, unknown>;
}

/** Options for completeExecution(). */
export interface CompleteExecutionOptions {
  summary?:              string;
  externalReferenceIds?: Record<string, string>;
  metadata?:             Record<string, unknown>;
}

/** Options for failExecution(). */
export interface FailExecutionOptions {
  errorCode?:    string;
  errorMessage?: string;
  summary?:      string;
  metadata?:     Record<string, unknown>;
}

/** Filter options for listExecutions(). */
export interface ListExecutionsFilter {
  module?:   ExecutionModule;
  provider?: string;
  status?:   ExecutionStatus;
  limit?:    number;
  offset?:   number;
}

// ── Error codes ───────────────────────────────────────────────────────────────

/**
 * Canonical error codes for failed executions.
 * Use these when calling failExecution() for machine-readable classification.
 */
export const EXECUTION_ERROR_CODES = {
  // Credential errors
  INVALID_CREDENTIALS:      "INVALID_CREDENTIALS",
  MISSING_CREDENTIALS:      "MISSING_CREDENTIALS",
  INSUFFICIENT_PERMISSIONS: "INSUFFICIENT_PERMISSIONS",
  CREDENTIALS_EXPIRED:      "CREDENTIALS_EXPIRED",
  // Validation errors
  VALIDATION_FAILED:        "VALIDATION_FAILED",
  POLICY_REJECTED:          "POLICY_REJECTED",
  APPROVAL_DENIED:          "APPROVAL_DENIED",
  // External API errors
  PROVIDER_API_ERROR:       "PROVIDER_API_ERROR",
  PROVIDER_QUOTA_EXCEEDED:  "PROVIDER_QUOTA_EXCEEDED",
  PROVIDER_TIMEOUT:         "PROVIDER_TIMEOUT",
  PROVIDER_UNAVAILABLE:     "PROVIDER_UNAVAILABLE",
  // Internal errors
  INTERNAL_ERROR:           "INTERNAL_ERROR",
  CONFIGURATION_MISSING:    "CONFIGURATION_MISSING",
} as const;

export type ExecutionErrorCode = typeof EXECUTION_ERROR_CODES[keyof typeof EXECUTION_ERROR_CODES];
