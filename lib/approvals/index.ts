/**
 * lib/approvals/index.ts
 *
 * Agentik — Universal Approvals Domain — Public API
 * Sprint: AGENTIK-APPROVALS-FOUNDATION-01
 *
 * Safe for import from any layer: client, server, edge.
 * No Prisma. No React. No Next.js.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type {
  ApprovalId,
  ApprovalRequestId,
  ApprovalDecisionId,
  ApprovalStatus,
  ApprovalPriority,
  ApprovalSource,
  ApprovalCategory,
  ApprovalActorType,
  ApprovalAuditEventType,
  ApprovalActor,
  ApprovalContext,
  ApprovalRelationship,
  ApprovalAuditEvent,
  ApprovalDecision,
  ApprovalRequest,
  ApprovalSummary,
  ApprovalExecutionResult,
  ApprovalCreationInput,
} from "./approval-types";

// ── Factory ───────────────────────────────────────────────────────────────────

export {
  SYSTEM_APPROVER,
  DIEGO_APPROVER,
  LUCA_APPROVER,
  MILA_APPROVER,
  createApprovalActor,
  createApprovalRelationship,
  createApprovalAuditEvent,
  createApprovalRequest,
  createApprovalDecision,
} from "./approval-factory";

// ── Status ────────────────────────────────────────────────────────────────────

export {
  allowedApprovalTransitions,
  TERMINAL_APPROVAL_STATUSES,
  normalizeApprovalStatus,
  isPendingApproval,
  isApproved,
  isRejected,
  isTerminalApproval,
  canTransitionApprovalStatus,
} from "./approval-status";

// ── Priority ──────────────────────────────────────────────────────────────────

export {
  normalizeApprovalPriority,
  compareApprovalPriority,
  isCriticalApproval,
  getApprovalPriorityWeight,
  getApprovalPriorityLabel,
  getApprovalPriorityTone,
} from "./approval-priority";

// ── Registry ──────────────────────────────────────────────────────────────────

export {
  APPROVAL_REGISTRY,
  getApprovalsByCategory,
  findApprovalEntry,
} from "./approval-registry";

export type { ApprovalRegistryEntry, ApprovalRegistry } from "./approval-registry";

// ── Audit ─────────────────────────────────────────────────────────────────────

export {
  validateApprovalRequest,
} from "./approval-audit";

export type {
  ApprovalValidationIssue,
  ApprovalAuditReport,
} from "./approval-audit";
