/**
 * lib/approval/index.ts
 *
 * AGENTIK-APPROVAL-WORKFLOW-01 — Barrel de Aprobación
 *
 * Importa tipos desde approval-types (client-safe).
 * Importa funciones desde approval-service (server-only).
 */

// ── Client-safe types ─────────────────────────────────────────────────────────
export type {
  ApprovalStatus,
  ApprovalDecision,
  ApprovalRequest,
  ApprovalSummary,
  ApprovalResult,
  ApprovalErrorCode,
} from "./approval-types";

export {
  APPROVAL_STATUS_LABEL,
  APPROVAL_STATUS_VARIANT,
  APPROVAL_ERROR_CODES,
  APPROVABLE_STATUSES,
  CANCELLABLE_STATUSES,
  canApprove,
  canCancel,
} from "./approval-types";

// ── Server-only functions ─────────────────────────────────────────────────────
export {
  markReadyForApproval,
  approveExecution,
  cancelExecution,
  getApprovalStatus,
} from "./approval-service";
