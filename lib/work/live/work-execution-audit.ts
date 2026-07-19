/**
 * lib/work/live/work-execution-audit.ts
 *
 * Agentik — Live Work Execution Audit / Validation
 * Sprint: AGENTIK-WORK-EXECUTION-LIVE-01
 *
 * Pre-execution validation rules.
 * No React. No Prisma. Never throws — always returns a report.
 */

import type { WorkExecutionJob, ApprovalApprovedEvent } from "./work-execution-types";
import type { PersistedWorkExecution }                  from "./persistence/work-execution-repository";
import { WORK_EXECUTOR_REGISTRY }                        from "./work-execution-registry";

// ── Audit report ──────────────────────────────────────────────────────────────

export interface WorkExecutionAuditIssue {
  field:   string;
  message: string;
}

export interface WorkExecutionAuditReport {
  valid:    boolean;
  errors:   WorkExecutionAuditIssue[];
  warnings: WorkExecutionAuditIssue[];
}

// ── Validate job ──────────────────────────────────────────────────────────────

/**
 * Validate a WorkExecutionJob before dispatching to an executor.
 * Returns errors (blocking) and warnings (non-blocking).
 */
export function validateExecutionJob(job: WorkExecutionJob): WorkExecutionAuditReport {
  const errors:   WorkExecutionAuditIssue[] = [];
  const warnings: WorkExecutionAuditIssue[] = [];

  // ID
  if (!job.id?.trim()) {
    errors.push({ field: "id", message: "Job ID es requerido." });
  }

  // Executor type
  if (!job.executorType) {
    errors.push({ field: "executorType", message: "Tipo de executor es requerido." });
  } else if (!WORK_EXECUTOR_REGISTRY[job.executorType]) {
    errors.push({ field: "executorType", message: `Executor desconocido: ${job.executorType}` });
  }

  // orgSlug
  if (!job.orgSlug?.trim()) {
    errors.push({ field: "orgSlug", message: "orgSlug es requerido para ejecutar trabajo." });
  }

  // approvalId — required for approval-backed triggers
  if (job.trigger === "APPROVAL_APPROVED" && !job.approvalId?.trim()) {
    errors.push({ field: "approvalId", message: "approvalId es requerido para trigger APPROVAL_APPROVED." });
  }

  // Payload trigger context
  if (job.trigger === "APPROVAL_APPROVED") {
    const ctx = job.payload?.trigger;
    if (!ctx) {
      errors.push({ field: "payload.trigger", message: "Contexto del trigger de aprobación es requerido." });
    } else {
      if (ctx.approvalStatus !== "APPROVED") {
        errors.push({
          field:   "payload.trigger.approvalStatus",
          message: `La aprobación debe estar en estado APPROVED. Estado actual: ${ctx.approvalStatus}`,
        });
      }
      if (!ctx.approvedBy?.trim()) {
        errors.push({ field: "payload.trigger.approvedBy", message: "approvedBy es requerido." });
      }
      if (!ctx.approvedAt?.trim()) {
        errors.push({ field: "payload.trigger.approvedAt", message: "approvedAt es requerido." });
      }
    }
  }

  // Executor requires approval but trigger is not APPROVAL_APPROVED
  const def = WORK_EXECUTOR_REGISTRY[job.executorType];
  if (def?.requiresApproval && job.trigger !== "APPROVAL_APPROVED" && job.trigger !== "MANUAL") {
    warnings.push({
      field:   "trigger",
      message: `El executor ${job.executorType} normalmente requiere aprobación previa.`,
    });
  }

  return {
    valid:    errors.length === 0,
    errors,
    warnings,
  };
}

// ── Validate approval event ───────────────────────────────────────────────────

/**
 * Validate an ApprovalApprovedEvent before creating a dispatch job.
 * Guards against misconfigured events or non-approved approvals.
 */
export function validateApprovalApprovedEvent(
  event: ApprovalApprovedEvent,
): WorkExecutionAuditReport {
  const errors:   WorkExecutionAuditIssue[] = [];
  const warnings: WorkExecutionAuditIssue[] = [];

  if (!event.approvalId?.trim()) {
    errors.push({ field: "approvalId", message: "approvalId es requerido." });
  }
  if (event.approvalStatus !== "APPROVED") {
    errors.push({
      field:   "approvalStatus",
      message: `Solo se puede ejecutar trabajo sobre aprobaciones APPROVED. Estado: ${event.approvalStatus}`,
    });
  }
  if (!event.orgSlug?.trim()) {
    errors.push({ field: "orgSlug", message: "orgSlug es requerido." });
  }
  if (!event.approvedBy?.trim()) {
    errors.push({ field: "approvedBy", message: "approvedBy es requerido." });
  }
  if (!event.approvedAt?.trim()) {
    errors.push({ field: "approvedAt", message: "approvedAt es requerido." });
  }
  if (!event.approvalCategory?.trim()) {
    warnings.push({ field: "approvalCategory", message: "approvalCategory no definido — se usará executor genérico." });
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Validate retry ────────────────────────────────────────────────────────────

/**
 * Validate that a PersistedWorkExecution is eligible for retry.
 *
 * Rules (Phase 18 acceptance criteria):
 *   - status must be FAILED
 *   - retryAttempt < maxRetryAttempts
 *   - executor must exist in registry
 *   - payloadJson must be present
 */
export function validateRetryExecution(
  execution:      PersistedWorkExecution,
  approvalStatus: string,
): WorkExecutionAuditReport {
  const errors:   WorkExecutionAuditIssue[] = [];
  const warnings: WorkExecutionAuditIssue[] = [];

  if (execution.status !== "FAILED") {
    errors.push({
      field:   "status",
      message: `Solo se puede reintentar una ejecución FAILED. Estado actual: ${execution.status}`,
    });
  }

  if (execution.retryAttempt >= execution.maxRetryAttempts) {
    errors.push({
      field:   "retryAttempt",
      message: `Se alcanzó el límite de reintentos (${execution.maxRetryAttempts}). No se puede reintentar.`,
    });
  }

  if (!(execution.executorType in WORK_EXECUTOR_REGISTRY)) {
    errors.push({
      field:   "executorType",
      message: `Executor desconocido: ${execution.executorType}`,
    });
  }

  if (!execution.payloadJson) {
    errors.push({
      field:   "payloadJson",
      message: "La ejecución original no tiene payload almacenado. No se puede reintentar.",
    });
  }

  if (approvalStatus !== "APPROVED") {
    errors.push({
      field:   "approvalStatus",
      message: `La aprobación asociada ya no está activa (${approvalStatus}). No se puede reintentar sin una aprobación válida.`,
    });
  }

  if (execution.retryAttempt > 0) {
    warnings.push({
      field:   "retryAttempt",
      message: `Esta es la ejecución #${execution.retryAttempt + 1} (intento anterior: ${execution.retryAttempt}).`,
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}
