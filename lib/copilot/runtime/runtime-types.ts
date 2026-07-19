/**
 * lib/copilot/runtime/runtime-types.ts
 * (extended in AGENTIK-POLICY-ENGINE-01 — see policy fields below)
 *
 * AGENTIK-ACTION-RUNTIME-01 — Canonical type contracts for the execution runtime.
 * SERVER ONLY — no React imports, no domain-specific dependencies.
 * @server-only
 *
 * Design principles:
 *   - Domain-agnostic: no Shopify, Finance, Commercial references.
 *   - Multi-tenant: every boundary includes tenantId.
 *   - Auditable: every execution carries executionId + correlationId.
 *   - Extensible: optional fields are reserved for future capabilities
 *     (async queues, retries, streaming, human-in-the-loop, rollback).
 *
 * Dependency direction (must never be violated):
 *   runtime-types ← action-dispatcher ← approval-gate
 *                 ← runtime-logger
 *                 ← rollback-descriptor
 *                 ← action-runtime (top of stack)
 *                 ← domain adapters (Shopify, Finance, etc.) [OUTSIDE this module]
 */
import "server-only";

import type { PolicyDecision, PolicyReason, PolicyViolation } from "@/lib/copilot/policy/policy-types";

// Re-export for consumers that import from runtime-types
export type { PolicyDecision, PolicyReason, PolicyViolation };

// ── Identity ──────────────────────────────────────────────────────────────────

/**
 * Multi-tenant execution context.
 * Passed through the entire execution pipeline — never mutated after creation.
 *
 * Future fields (reserved, not yet implemented):
 *   - approvalToken?:   string     — pre-granted approval for gate bypass
 *   - sessionId?:       string     — Copilot session identifier
 *   - traceId?:         string     — distributed tracing correlation
 *   - permissions?:     string[]   — RBAC capabilities in scope
 */
export interface ExecutionContext {
  /** Unique identifier for this specific execution instance */
  executionId:    string;
  /** Links this execution back to the originating intent / Copilot request */
  correlationId:  string;
  /** Agentik organization slug (e.g. "castillitos") */
  tenantId:       string;
  /** User performing the action */
  userId:         string;
  /** When the execution was requested */
  requestedAt:    Date;
  /** Arbitrary metadata (intent text, plan title, confidence, etc.) */
  metadata?:      Record<string, unknown>;
  /**
   * Optional idempotency key — prevents double-execution of the same plan.
   * Phase 1: interface only. Phase 2: persisted and checked before execution.
   * Callers should set this to a stable hash of (tenantId + planId + requestedAt.date).
   */
  idempotencyKey?: string;
}

// ── Plan input ────────────────────────────────────────────────────────────────

/**
 * A single step specification within an execution plan.
 * Produced by the planning layer — never modified by the runtime.
 */
export interface RuntimeStepSpec {
  /** Unique identifier for this step within the plan */
  stepId:             string;
  /**
   * Fully-qualified action reference: "{namespace}.{functionName}"
   * e.g. "catalog.publishPendingProducts"
   * The dispatcher uses this to route to the correct ActionHandler.
   */
  actionId:           string;
  /** Agentik domain that owns this action, e.g. "shopify" */
  domain:             string;
  /** Human-readable label for logging and UI */
  displayName:        string;
  /** Extracted parameters to pass to the action handler */
  parameters:         Record<string, unknown>;
  /** Whether a human approval step is required before execution */
  requiresApproval:   boolean;
  /** Whether this step is safe for autonomous/scheduled pipelines */
  automationEligible: boolean;
  /** Execution order (ascending). Steps are sorted by this before execution. */
  order:              number;
  /**
   * Future: step dependency tracking.
   * Steps listed here must complete successfully before this step runs.
   */
  dependsOn?:         string[];
}

/**
 * A complete execution plan — the input to `executeExecutionPlan()`.
 * Produced by a planning layer (e.g. intent-resolver + planner).
 * The runtime never modifies it.
 */
export interface RuntimeExecutionPlan {
  /** Unique plan identifier */
  planId:   string;
  /** Human-readable plan title */
  title:    string;
  /** Optional description */
  summary?: string;
  /** Ordered list of steps to execute */
  steps:    RuntimeStepSpec[];
}

// ── Execution status ──────────────────────────────────────────────────────────

/**
 * Lifecycle status for a step or the overall execution.
 *
 * State transitions:
 *   pending → running → completed
 *                     → failed
 *                     → awaiting_approval
 *             skipped      (previous step failed with stopOnFirstFailure)
 *             blocked      (action not found, policy violation)
 *             cancelled    (execution was cancelled externally)
 */
export type ExecutionStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "blocked"
  | "awaiting_approval"
  | "cancelled";

// ── Approval ──────────────────────────────────────────────────────────────────

/**
 * Approval lifecycle for a single step.
 *
 *   not_required  — step does not require human approval
 *   pending       — awaiting approval decision (set when runtime blocks the step)
 *   granted       — approval was received (future: via token or API callback)
 *   denied        — approval was explicitly denied
 */
export type ApprovalStatus =
  | "not_required"
  | "pending"
  | "granted"
  | "denied";

// ── Step result ───────────────────────────────────────────────────────────────

/**
 * Immutable result record for a single executed (or attempted) step.
 */
export interface RuntimeStepResult {
  stepId:         string;
  actionId:       string;
  domain:         string;
  displayName:    string;
  status:         ExecutionStatus;
  approvalStatus: ApprovalStatus;
  startedAt:      Date;
  finishedAt:     Date;
  durationMs:     number;
  /** Raw data returned by the action handler (domain-specific, opaque to runtime) */
  data?:          unknown;
  /** Error message if status === "failed" */
  error?:         string;
  warnings:       string[];
  /** Human-readable note for audit trail */
  auditNote?:     string;

  // ── Policy layer (AGENTIK-POLICY-ENGINE-01) ───────────────────────────────
  /** Decision produced by the Policy Engine for this step */
  policyDecision?:  PolicyDecision;
  /** Reasons from non-abstain policy rules that fired */
  policyReasons?:   PolicyReason[];
  /** IDs of all evaluated policy rules */
  evaluatedRules?:  string[];
  /** True when the step was blocked because PolicyEngine returned "deny" */
  deniedByPolicy?:  boolean;
}

// ── In-flight execution ───────────────────────────────────────────────────────

/**
 * Mutable in-flight state while an execution is running.
 * Converted to ExecutionReport once complete.
 *
 * Future: this could be persisted to a database to support
 * async queues, resumable executions, and streaming progress.
 */
export interface RuntimeExecution {
  executionId:    string;
  correlationId:  string;
  tenantId:       string;
  status:         ExecutionStatus;
  plan:           RuntimeExecutionPlan;
  results:        RuntimeStepResult[];
  startedAt:      Date;
  finishedAt?:    Date;
}

// ── Final report ──────────────────────────────────────────────────────────────

/**
 * Immutable execution report — returned by `executeExecutionPlan()`.
 *
 * Contains everything needed to:
 *   - Display results to the user
 *   - Reconstruct the execution for audit purposes
 *   - Determine rollback eligibility
 *   - Feed downstream analytics or compliance systems
 */
export interface ExecutionReport {
  /** Links back to the ExecutionContext */
  executionId:      string;
  correlationId:    string;
  tenantId:         string;

  // ── Timing ────────────────────────────────────────────────────────────────
  startedAt:        Date;
  finishedAt:       Date;
  durationMs:       number;

  // ── Summary ───────────────────────────────────────────────────────────────
  overallStatus:    ExecutionStatus;
  totalSteps:       number;
  completedSteps:   number;
  failedSteps:      number;
  skippedSteps:     number;
  blockedSteps:     number;
  awaitingApproval: number;
  cancelledSteps:   number;

  // ── Detail ────────────────────────────────────────────────────────────────
  stepResults:      RuntimeStepResult[];
  errors:           string[];
  warnings:         string[];

  // ── Audit ─────────────────────────────────────────────────────────────────
  audit:            ExecutionAudit;

  // ── Policy layer (AGENTIK-POLICY-ENGINE-01) ───────────────────────────────
  /** Number of steps blocked by Policy Engine (deny decision) */
  deniedByPolicy:   number;
  /** All policy violations detected across all steps */
  policyViolations: PolicyViolation[];
}

/**
 * Structured audit record embedded in every ExecutionReport.
 *
 * Future: could be extracted and persisted independently for compliance.
 */
export interface ExecutionAudit {
  /** Who initiated the execution */
  initiatedBy:       string;
  /** When the request was received (from ExecutionContext.requestedAt) */
  requestedAt:       Date;
  /** When the execution completed */
  completedAt:       Date;
  /** Optional: the raw intent text that triggered this execution */
  intentSource?:     string;
  /** Domains that were called during this execution */
  domainsCalled:     string[];
  /** Whether any step required human approval */
  approvalRequired:  boolean;
  /** Whether any step was gated for approval */
  approvalGated:     boolean;
  /** Plan title for quick reference */
  planTitle:         string;
}

// ── Execution policy ──────────────────────────────────────────────────────────

/**
 * Runtime execution policy — controls error handling and flow behavior.
 *
 * Future extensions:
 *   - timeoutMs?:      number   — per-step timeout
 *   - maxRetries?:     number   — automatic retry on transient failure
 *   - retryDelayMs?:   number   — backoff delay between retries
 *   - parallelSteps?:  boolean  — run independent steps concurrently
 */
export interface ExecutionPolicy {
  /** If true (default): stop executing after the first failed step */
  stopOnFirstFailure: boolean;
  /**
   * If true: stop executing after the first approval-blocked step.
   * If false (default): log the block and continue with remaining steps.
   */
  stopOnFirstBlock:   boolean;
}

export const DEFAULT_EXECUTION_POLICY: ExecutionPolicy = {
  stopOnFirstFailure: true,
  stopOnFirstBlock:   false,
} as const;
