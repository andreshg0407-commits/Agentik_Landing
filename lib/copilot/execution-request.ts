/**
 * lib/copilot/execution-request.ts
 *
 * Agentik Copilot — Execution Request Builder V1
 *
 * Converts a suggested action into a structured, auditable execution request.
 * The request carries all context needed to execute AND audit the operation:
 *   - which action, which agent, which org, which module,
 *   - what the policy said,
 *   - who initiated it, from where (signal / decision / manual).
 *
 * Sprint: AGENTIK-COPILOT-EXECUTION-LAYER-01
 */

import type { ExecutionPolicyResult } from "./execution-policy";

// ── Request source ─────────────────────────────────────────────────────────────

export type ExecutionRequestSource =
  | "signal"      // Triggered from an active Copilot signal
  | "decision"    // Triggered from a cross-signal Copilot decision
  | "manual"      // Manually initiated by the user from the rail
  | "memory"      // Triggered from a memory / capability hint
  | "next_step";  // Triggered from a contextual next-step suggestion

// ── Execution request ──────────────────────────────────────────────────────────

export interface CopilotExecutionRequest {
  id:              string;                    // Unique request ID (UUID)
  actionId:        string;                    // References CopilotExecutableAction.id
  agentId:         string;                    // Agent executing the action
  orgSlug:         string;
  module:          string;                    // Active module at time of request
  entityType?:     string;                    // e.g. "BudgetPlan", "ReconciliationException"
  entityId?:       string;                    // ID of affected entity (if applicable)
  payload:         Record<string, unknown>;   // Handler-specific parameters
  policy:          ExecutionPolicyResult;     // Result of policy evaluation
  createdAt:       string;                    // ISO timestamp
  createdBy?:      string;                    // userId (if available in context)
  source:          ExecutionRequestSource;
  sourceSignalId?: string;                    // Signal that triggered this action
  confidence?:     number;                    // Signal confidence at time of request (0–100)
}

// ── Builder ────────────────────────────────────────────────────────────────────

export interface BuildExecutionRequestInput {
  actionId:        string;
  agentId:         string;
  orgSlug:         string;
  module:          string;
  policy:          ExecutionPolicyResult;
  source:          ExecutionRequestSource;
  entityType?:     string;
  entityId?:       string;
  payload?:        Record<string, unknown>;
  createdBy?:      string;
  sourceSignalId?: string;
  confidence?:     number;
}

/**
 * Builds a fully-formed, auditable execution request from an action + context.
 * Pure function — no I/O, no side effects.
 */
export function buildExecutionRequest(
  input: BuildExecutionRequestInput,
): CopilotExecutionRequest {
  return {
    id:              crypto.randomUUID(),
    actionId:        input.actionId,
    agentId:         input.agentId,
    orgSlug:         input.orgSlug,
    module:          input.module,
    entityType:      input.entityType,
    entityId:        input.entityId,
    payload:         input.payload ?? {},
    policy:          input.policy,
    createdAt:       new Date().toISOString(),
    createdBy:       input.createdBy,
    source:          input.source,
    sourceSignalId:  input.sourceSignalId,
    confidence:      input.confidence,
  };
}

// ── Predefined payload templates ───────────────────────────────────────────────
//
// Standard payload shapes for common handler operations.
// Used by the UI to prepare structured requests before execution.

export const PAYLOAD_TEMPLATES = {

  navigate_to_module: (targetPath: string) => ({
    targetPath,
  }),

  create_task_draft: (title: string, description: string, priority: string, targetPath: string) => ({
    title,
    description,
    priority,
    targetPath,
    status: "draft",
  }),

  create_budget_draft: (module: string, notes: string) => ({
    module,
    notes,
    type:   "recalibration",
    status: "draft",
  }),

  create_projection_draft: (module: string, basis: string) => ({
    module,
    basis,
    type:   "close_projection",
    status: "draft",
  }),

  open_reconciliation_context: (targetPath: string, focus?: string) => ({
    targetPath,
    focus:  focus ?? "exceptions",
    status: "context_open",
  }),

  prepare_follow_up: (entityType: string, entityId: string, notes: string) => ({
    entityType,
    entityId,
    notes,
    status: "pending",
  }),

  request_human_approval: (requestType: string, description: string, priority: string) => ({
    requestType,
    description,
    priority,
    status: "pending_approval",
  }),

} as const;
