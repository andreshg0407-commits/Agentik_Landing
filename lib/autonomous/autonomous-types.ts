/**
 * lib/autonomous/autonomous-types.ts
 *
 * Agentik — Autonomous Operations — Core Domain Types
 * Sprint: AGENTIK-AUTONOMOUS-OPERATIONS-01
 *
 * Pure domain. No Prisma. No React. No server-only.
 */

import type { AgentGoal } from "../agents/runtime/agent-types";

// ── Risk level ────────────────────────────────────────────────────────────────

export type AutonomousRiskLevel =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

// ── Policy ────────────────────────────────────────────────────────────────────

/**
 * MANUAL_ONLY       — operation is fully blocked; human must initiate
 * APPROVAL_REQUIRED — operation pauses and creates an approval request
 * AUTO_ALLOWED      — operation executes immediately via Agent Runtime
 */
export type AutonomousPolicy =
  | "MANUAL_ONLY"
  | "APPROVAL_REQUIRED"
  | "AUTO_ALLOWED";

// ── Execution status ──────────────────────────────────────────────────────────

export type AutonomousExecutionStatus =
  | "COMPLETED"
  | "BLOCKED"
  | "ESCALATED"
  | "FAILED"
  | "SKIPPED";

// ── Operation ─────────────────────────────────────────────────────────────────

/**
 * AutonomousOperation — an autonomous action request.
 *
 * Represents the intent to execute an agent goal under autonomous control.
 * riskLevel and policy are pre-computed before execution begins.
 */
export interface AutonomousOperation {
  /** Unique operation ID. */
  id:         string;
  /** Tenant this operation belongs to. */
  orgSlug:    string;
  /**
   * Source that triggered this operation.
   * e.g. "SIGNAL", "COPILOT", "SCHEDULER", "MANUAL"
   */
  source:     string;
  /** Agent to execute — semantic ID, never display name. */
  agentId:    string;
  /** Goal to execute. */
  goal:       AgentGoal;
  /** Pre-computed risk level for this operation. */
  riskLevel:  AutonomousRiskLevel;
  /** Effective policy for this operation. */
  policy:     AutonomousPolicy;
  /** ISO timestamp when this operation was created. */
  createdAt:  string;
  /** Optional loop protection fields. */
  chainDepth?: number;
  retryCount?: number;
  /** Optional idempotency key — ensures this operation runs at most once. */
  idempotencyKey?: string;
  /** Extra metadata. */
  metadata?:  Record<string, unknown>;
}

// ── Execution ─────────────────────────────────────────────────────────────────

/**
 * AutonomousExecution — runtime execution record for one operation.
 */
export interface AutonomousExecution {
  /** ID of the parent operation. */
  operationId:   string;
  /** Unique execution ID. */
  executionId:   string;
  /** Current execution status. */
  status:        AutonomousExecutionStatus;
  /** ISO timestamp when execution started. */
  startedAt:     string;
  /** ISO timestamp when execution completed (if finished). */
  completedAt?:  string;
}

// ── Decision ──────────────────────────────────────────────────────────────────

/**
 * AutonomousDecision — the resolved decision for one operation.
 *
 * Produced by combining the risk engine output with the policy engine.
 */
export interface AutonomousDecision {
  /** Whether the operation is allowed to proceed (auto or with approval). */
  allowed:          boolean;
  /** Whether the operation requires human approval before execution. */
  requiresApproval: boolean;
  /** Human-readable reason for this decision. */
  reason:           string;
  /** The risk level that drove this decision. */
  riskLevel:        AutonomousRiskLevel;
  /** The resolved policy. */
  policy:           AutonomousPolicy;
}
