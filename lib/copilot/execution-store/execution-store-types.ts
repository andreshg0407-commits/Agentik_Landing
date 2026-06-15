/**
 * lib/copilot/execution-store/execution-store-types.ts
 *
 * AGENTIK-EXECUTION-PERSISTENCE-01 — Canonical contracts for the execution store.
 * SERVER ONLY — no React, no domain-specific code.
 * @server-only
 *
 * These types are the persistence contract between the Action Runtime and any
 * backing store implementation (Prisma, in-memory, mock, etc.).
 *
 * Design principles:
 *   - Domain-agnostic: usable for Shopify, Finance, Commercial, DIAN, etc.
 *   - Multi-tenant: every record carries tenantId.
 *   - Reconstructible: every execution can be fully replayed from its records.
 *   - Interface-first: the Runtime depends on ExecutionStore, not on Prisma.
 */
import "server-only";

// ── Source + approval status enums ────────────────────────────────────────────

/**
 * Where the execution was initiated from.
 * Stored on every CopilotExecution record for audit purposes.
 */
export type ExecutionSource =
  | "copilot"
  | "api"
  | "cron"
  | "webhook"
  | "manual";

/**
 * Lifecycle states for a CopilotApprovalRequest.
 * Matches the Prisma CopilotApprovalStatus enum (lowercase for type layer).
 */
export type ApprovalRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled";

// ── Record types (output from store) ──────────────────────────────────────────

/**
 * Persisted record for a single execution (top-level).
 * Returned by createExecution() and getExecutionById().
 */
export interface ExecutionRecord {
  id:              string;
  executionId:     string;
  correlationId:   string;
  tenantId:        string;
  userId:          string;
  status:          string;
  source:          ExecutionSource;
  executionMode:   string;
  planId:          string;
  planTitle:       string;
  planSummary?:    string;
  idempotencyKey?: string;
  startedAt:       Date;
  finishedAt?:     Date;
  durationMs?:     number;
  totalSteps:      number;
  completedSteps:  number;
  failedSteps:     number;
  skippedSteps:    number;
  blockedSteps:    number;
  approvalRequired: boolean;
  deniedByPolicy:  number;
  inputSnapshot?:  unknown;
  planSnapshot?:   unknown;
  reportSnapshot?: unknown;
  metadata?:       unknown;
  createdAt:       Date;
  updatedAt:       Date;
}

/**
 * Persisted record for a single step within an execution.
 * One per step — created as each step completes.
 */
export interface ExecutionStepRecord {
  id:             string;
  executionId:    string;
  tenantId:       string;
  stepId:         string;
  actionId:       string;
  domain:         string;
  displayName:    string;
  status:         string;
  approvalStatus: string;
  policyDecision?: string;
  deniedByPolicy: boolean;
  startedAt:      Date;
  finishedAt?:    Date;
  durationMs?:    number;
  inputSnapshot?: unknown;
  outputSnapshot?: unknown;
  error?:         string;
  warnings:       string[];
  policyReasons?: unknown;
  evaluatedRules?: string[];
  auditNote?:     string;
  createdAt:      Date;
  updatedAt:      Date;
}

/**
 * Persisted structured event in the execution timeline.
 * Enables full audit replay and event sourcing.
 */
export interface ExecutionEventRecord {
  id:          string;
  executionId: string;
  tenantId:    string;
  eventType:   string;
  stepId?:     string;
  actionId?:   string;
  domain?:     string;
  status?:     string;
  message?:    string;
  payload?:    unknown;
  createdAt:   Date;
}

/**
 * Persisted approval request — created when PolicyEngine returns require_approval.
 * Future: drive the approve/reject/expire lifecycle from this record.
 */
export interface ApprovalRequestRecord {
  id:              string;
  executionId:     string;
  tenantId:        string;
  stepId:          string;
  actionId:        string;
  domain:          string;
  requestedBy:     string;
  approvalStatus:  ApprovalRequestStatus;
  policyDecision?: string;
  policyReasons?:  unknown;
  reason:          string;
  requestedAt:     Date;
  resolvedAt?:     Date;
  resolvedBy?:     string;
  resolutionNote?: string;
  metadata?:       unknown;
  createdAt:       Date;
  updatedAt:       Date;
}

// ── Input types (into store) ───────────────────────────────────────────────────

export interface ExecutionStoreCreateInput {
  executionId:     string;
  correlationId:   string;
  tenantId:        string;
  userId:          string;
  status:          string;
  source:          ExecutionSource;
  executionMode:   string;
  planId:          string;
  planTitle:       string;
  planSummary?:    string;
  idempotencyKey?: string;
  startedAt:       Date;
  totalSteps:      number;
  inputSnapshot?:  unknown;
  planSnapshot?:   unknown;
  metadata?:       unknown;
}

export interface ExecutionStoreUpdateInput {
  status?:          string;
  finishedAt?:      Date;
  durationMs?:      number;
  completedSteps?:  number;
  failedSteps?:     number;
  skippedSteps?:    number;
  blockedSteps?:    number;
  approvalRequired?: boolean;
  deniedByPolicy?:  number;
  reportSnapshot?:  unknown;
}

export interface ExecutionStoreStepInput {
  executionId:     string;
  tenantId:        string;
  stepId:          string;
  actionId:        string;
  domain:          string;
  displayName:     string;
  status:          string;
  approvalStatus:  string;
  policyDecision?: string;
  deniedByPolicy?: boolean;
  startedAt:       Date;
  finishedAt?:     Date;
  durationMs?:     number;
  inputSnapshot?:  unknown;
  outputSnapshot?: unknown;
  error?:          string;
  warnings?:       string[];
  policyReasons?:  unknown;
  evaluatedRules?: string[];
  auditNote?:      string;
}

export interface ExecutionStoreEventInput {
  executionId: string;
  tenantId:    string;
  eventType:   string;
  stepId?:     string;
  actionId?:   string;
  domain?:     string;
  status?:     string;
  message?:    string;
  payload?:    unknown;
}

export interface ApprovalRequestCreateInput {
  executionId:     string;
  tenantId:        string;
  stepId:          string;
  actionId:        string;
  domain:          string;
  requestedBy:     string;
  policyDecision?: string;
  policyReasons?:  unknown;
  reason:          string;
  requestedAt:     Date;
  metadata?:       unknown;
}

export interface ApprovalRequestUpdateInput {
  approvalStatus:  ApprovalRequestStatus;
  resolvedAt?:     Date;
  resolvedBy?:     string;
  resolutionNote?: string;
}

// ── Query types ────────────────────────────────────────────────────────────────

export interface ExecutionStoreQuery {
  tenantId:  string;
  status?:   string;
  limit?:    number;
  offset?:   number;
  since?:    Date;
}

// ── Idempotency check ─────────────────────────────────────────────────────────

/**
 * Result of `checkIdempotency()`.
 *
 *   proceed            — no prior record found; safe to create a new execution
 *   existing_completed — prior execution completed; return or reference it
 *   already_running    — prior execution is still in progress; reject duplicate
 *   awaiting_approval  — prior execution is waiting for human approval
 *   failed_retry_ok    — prior execution failed; retry is allowed
 */
export type IdempotencyCheckResult =
  | { outcome: "proceed" }
  | { outcome: "existing_completed"; record: ExecutionRecord }
  | { outcome: "already_running";    record: ExecutionRecord }
  | { outcome: "awaiting_approval";  record: ExecutionRecord }
  | { outcome: "failed_retry_ok";    record: ExecutionRecord };

// ── Snapshot ──────────────────────────────────────────────────────────────────

/**
 * Full reconstructed snapshot of one execution — all related records.
 * Returned by getExecutionDetail().
 */
export interface ExecutionPersistenceSnapshot {
  executionId: string;
  tenantId:    string;
  record:      ExecutionRecord;
  steps:       ExecutionStepRecord[];
  events:      ExecutionEventRecord[];
  approvals:   ApprovalRequestRecord[];
}

// ── Store interface ────────────────────────────────────────────────────────────

/**
 * Abstract persistence interface for the Action Runtime.
 *
 * Implementations:
 *   - PrismaExecutionStore — production, persists to PostgreSQL via Prisma
 *   - NoopExecutionStore   — no-op, returns minimal stubs; safe for tests/in-memory use
 *
 * The Runtime accepts an ExecutionStore instance via ExecuteOptions.
 * If none is provided, a NoopExecutionStore is used — no behaviour change.
 */
export interface ExecutionStore {
  /** Create the top-level execution record at execution start. */
  createExecution(input: ExecutionStoreCreateInput): Promise<ExecutionRecord>;

  /** Update the execution record after it finishes. */
  updateExecution(executionId: string, tenantId: string, input: ExecutionStoreUpdateInput): Promise<void>;

  /** Persist the result of a single step. */
  recordStep(input: ExecutionStoreStepInput): Promise<ExecutionStepRecord>;

  /** Append a structured event to the execution timeline. */
  recordEvent(input: ExecutionStoreEventInput): Promise<void>;

  /** Persist a new approval request when a step is gated. */
  createApprovalRequest(input: ApprovalRequestCreateInput): Promise<ApprovalRequestRecord>;

  /** Update an existing approval request (approve / reject / expire). */
  updateApprovalRequest(id: string, input: ApprovalRequestUpdateInput): Promise<void>;

  /** Load an execution by its executionId (tenant-scoped). */
  getExecutionById(executionId: string, tenantId: string): Promise<ExecutionRecord | null>;

  /** List recent executions for a tenant. */
  listExecutions(query: ExecutionStoreQuery): Promise<ExecutionRecord[]>;

  /** Load all PENDING approval requests for a tenant. */
  getPendingApprovals(tenantId: string): Promise<ApprovalRequestRecord[]>;

  /**
   * Check whether an idempotency key has already been used for a tenant.
   * Returns `{ outcome: "proceed" }` if no prior record is found.
   */
  checkIdempotency(tenantId: string, idempotencyKey: string): Promise<IdempotencyCheckResult>;
}
