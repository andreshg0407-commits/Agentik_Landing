/**
 * lib/autonomous-operations/server/autonomous-operation-dispatcher.ts
 *
 * Agentik — Autonomous Operations Dispatcher
 * Sprint: AGENTIK-AUTONOMOUS-OPERATIONS-01
 *
 * Takes a validated AutonomousOperationPlan and executes it against
 * real services (task service, approval service).
 *
 * SERVER-ONLY. Never import from client components.
 * Never throws — always returns structured AutonomousOperationResult.
 */
import "server-only";

import type { AutonomousOperationPlan }   from "../autonomous-operation-types";
import type { AutonomousOperationResult } from "../autonomous-operation-result";
import type { TaskDraft as FullTaskDraft } from "../../tasks/task-types";
import type {
  ApprovalCreationInput,
  ApprovalCategory,
  ApprovalPriority,
} from "../../approvals/approval-types";
import { createAutonomousOperationAuditEvent } from "../autonomous-operation-audit";

// ── ID generator ──────────────────────────────────────────────────────────────

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── Priority maps ─────────────────────────────────────────────────────────────

const TASK_PRIORITY_MAP: Record<string, FullTaskDraft["priority"]> = {
  LOW:      "low",
  MEDIUM:   "medium",
  HIGH:     "high",
  CRITICAL: "critical",
};

const APPROVAL_PRIORITY_MAP: Record<string, ApprovalPriority> = {
  LOW:      "LOW",
  MEDIUM:   "MEDIUM",
  HIGH:     "HIGH",
  CRITICAL: "CRITICAL",
};

const TASK_CATEGORY_MAP: Record<string, FullTaskDraft["category"]> = {
  FINANCE:    "review",
  COMMERCIAL: "review",
  MARKETING:  "approval",
  OPERATIONS: "investigation",
  SYSTEM:     "general",
};

const APPROVAL_CATEGORY_MAP: Record<string, ApprovalCategory> = {
  FINANCE:    "FINANCIAL",
  COMMERCIAL: "COMMERCIAL",
  MARKETING:  "MARKETING",
  OPERATIONS: "OPERATIONS",
  SYSTEM:     "CUSTOM",
};

// ── Task builder ──────────────────────────────────────────────────────────────

function buildFullTaskDraft(plan: AutonomousOperationPlan): FullTaskDraft {
  const draft = plan.taskDraft!;
  const now   = new Date().toISOString();

  const agentOwner: FullTaskDraft["owner"] = {
    id:   plan.agentId,
    type: "agent",
    name: plan.agentId,
  };

  return {
    id:          genId("tdraft"),
    title:       draft.title,
    description: draft.description,
    priority:    TASK_PRIORITY_MAP[draft.priority] ?? "medium",
    status:      "open",
    source:      "system",
    category:    TASK_CATEGORY_MAP[plan.targetDomain] ?? "general",
    owner:       agentOwner,
    relationships: draft.entityId
      ? [{
          type:        "related_to_module",
          entityType:  draft.entityType ?? "module",
          entityId:    draft.entityId,
        }]
      : [],
    businessContext: {
      orgSlug:          plan.orgSlug,
      module:           draft.module,
      entityType:       draft.entityType,
      entityId:         draft.entityId,
      sourceAgentId:    plan.agentId,
      navigationTarget: plan.navigationTarget,
      metadata:         draft.metadata ?? {},
    },
    visibility:  "organization",
    dueDateMode: "none",
    dueAt:       draft.dueAt,
    createdAt:   now,
    createdBy:   agentOwner,
    metadata:    draft.metadata ?? {},
  };
}

// ── Approval builder ──────────────────────────────────────────────────────────

function buildApprovalCreationInput(plan: AutonomousOperationPlan): ApprovalCreationInput {
  const draft = plan.approvalDraft!;

  const agentActor = {
    id:   plan.agentId,
    type: "AGENT" as const,
    name: plan.agentId,
  };
  const systemApprover = {
    id:   "gerencia",
    type: "USER" as const,
    name: "Gerencia",
  };

  const priority: ApprovalPriority =
    APPROVAL_PRIORITY_MAP[draft.businessContext?.score as number >= 75 ? "HIGH" : "MEDIUM"]
    ?? "MEDIUM";

  return {
    title:       draft.title,
    description: draft.description,
    priority,
    source:      "AGENT",
    category:    APPROVAL_CATEGORY_MAP[plan.targetDomain] ?? "CUSTOM",
    requestor:   agentActor,
    approver:    systemApprover,
    context: {
      orgSlug:          plan.orgSlug,
      module:           draft.module,
      sourceAgentId:    plan.agentId,
      sourceAgentName:  plan.agentId,
      entityType:       draft.entityType,
      entityId:         draft.entityId,
      navigationTarget: plan.navigationTarget,
      metadata:         draft.metadata ?? {},
    },
    relationships: draft.entityId
      ? [{
          type:       "created_from_copilot",
          entityType: draft.entityType ?? "module",
          entityId:   draft.entityId,
        }]
      : [],
    metadata: draft.metadata ?? {},
  };
}

// ── Main dispatcher ────────────────────────────────────────────────────────────

export async function dispatchAutonomousOperationPlan(
  plan: AutonomousOperationPlan,
): Promise<AutonomousOperationResult> {
  const auditTrail = [...plan.auditTrail];
  const errors:   string[] = [...plan.errors];
  const warnings: string[] = [...plan.warnings];

  // ── Guard: only dispatch READY_TO_EXECUTE plans ───────────────────────────

  if (plan.status !== "READY_TO_EXECUTE") {
    const msg = `Plan ${plan.id} is not ready to execute (status=${plan.status}, decision=${plan.decision}). Skipping dispatch.`;
    return {
      success:    false,
      message:    msg,
      plan,
      status:     plan.status,
      errors:     [...errors, msg],
      warnings,
      auditTrail,
    };
  }

  // ── CREATE_TASK_ONLY ───────────────────────────────────────────────────────

  if (plan.decision === "CREATE_TASK_ONLY") {
    if (!plan.taskDraft) {
      const msg = "Plan decision is CREATE_TASK_ONLY but taskDraft is missing.";
      return {
        success:    false,
        message:    msg,
        plan,
        status:     "FAILED",
        errors:     [...errors, msg],
        warnings,
        auditTrail,
      };
    }

    try {
      const { taskService } = await import("../../tasks/task-service");
      const fullDraft        = buildFullTaskDraft(plan);

      let taskId: string | undefined;
      let alreadyProcessed = false;
      let taskMessage      = "";

      if (plan.idempotencyKey) {
        const result = await taskService.createTaskIdempotent(fullDraft, plan.orgSlug, plan.idempotencyKey);
        taskId           = result.task?.id;
        alreadyProcessed = result.alreadyProcessed;
        taskMessage      = result.message;

        auditTrail.push(createAutonomousOperationAuditEvent(
          plan.id, plan.agentId, plan.orgSlug,
          alreadyProcessed ? "idempotency_hit" : "operation_task_created",
          alreadyProcessed
            ? `Idempotency hit: existing task reused (id=${taskId})`
            : `Task created: ${taskId ?? "unknown"}`,
          { taskId, idempotencyKey: plan.idempotencyKey, alreadyProcessed },
        ));

        if (!result.success) {
          return {
            success: false, message: result.message, plan, status: "FAILED",
            errors: [...errors, result.message], warnings, auditTrail,
          };
        }
      } else {
        const result = await taskService.createTask(fullDraft, plan.orgSlug);
        taskId      = result.task?.id;
        taskMessage = result.message;

        auditTrail.push(createAutonomousOperationAuditEvent(
          plan.id, plan.agentId, plan.orgSlug, "operation_task_created",
          result.success ? `Task created: ${taskId ?? "unknown"}` : `Task creation failed: ${result.message}`,
          { success: result.success, taskId },
        ));

        if (!result.success) {
          return {
            success: false, message: result.message, plan, status: "FAILED",
            errors: [...errors, result.message], warnings: [...warnings, ...(result.warnings ?? [])],
            auditTrail,
            execution: { executorType: "task_service", startedAt: new Date().toISOString(), success: false, message: result.message },
          };
        }
      }

      return {
        success:          true,
        message:          alreadyProcessed
          ? `Tarea ya existente reutilizada: "${plan.title}"`
          : `Tarea creada correctamente: "${plan.title}"`,
        plan:             { ...plan, status: "COMPLETED" },
        status:           "COMPLETED",
        createdTaskId:    taskId,
        alreadyProcessed,
        existingEntityId: alreadyProcessed ? taskId : undefined,
        existingEntityType: alreadyProcessed ? "task" : undefined,
        idempotencyKey:   plan.idempotencyKey,
        errors,
        warnings,
        auditTrail,
        execution: {
          executorType: "task_service",
          startedAt:    new Date().toISOString(),
          success:      true,
          message:      taskMessage,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error inesperado al crear tarea.";
      return {
        success:  false,
        message:  msg,
        plan,
        status:   "FAILED",
        errors:   [...errors, msg],
        warnings,
        auditTrail,
      };
    }
  }

  // ── CREATE_APPROVAL_ONLY / REQUIRE_APPROVAL ───────────────────────────────

  if (plan.decision === "CREATE_APPROVAL_ONLY" || plan.decision === "REQUIRE_APPROVAL") {
    if (!plan.approvalDraft) {
      const msg = `Plan decision is ${plan.decision} but approvalDraft is missing.`;
      return {
        success:    false,
        message:    msg,
        plan,
        status:     "FAILED",
        errors:     [...errors, msg],
        warnings,
        auditTrail,
      };
    }

    try {
      const { createApprovalRequest } = await import("../../approvals/approval-factory");
      const { approvalService }       = await import("../../approvals/approval-service");

      const creationInput = {
        ...buildApprovalCreationInput(plan),
        idempotencyKey: plan.idempotencyKey,
      };
      const request = createApprovalRequest(creationInput);

      let approvalId: string | undefined;
      let alreadyProcessed = false;
      let approvalMessage  = "";

      if (plan.idempotencyKey) {
        const result = await approvalService.createApprovalIdempotent(request, plan.idempotencyKey);
        approvalId       = result.approval?.id;
        alreadyProcessed = result.alreadyProcessed;
        approvalMessage  = result.message;

        auditTrail.push(createAutonomousOperationAuditEvent(
          plan.id, plan.agentId, plan.orgSlug,
          alreadyProcessed ? "idempotency_hit" : "operation_approval_created",
          alreadyProcessed
            ? `Idempotency hit: existing approval reused (id=${approvalId})`
            : `Approval created: ${approvalId ?? "unknown"}`,
          { approvalId, idempotencyKey: plan.idempotencyKey, alreadyProcessed },
        ));

        if (!result.success) {
          return {
            success: false, message: result.message, plan, status: "FAILED",
            errors: [...errors, result.message], warnings, auditTrail,
          };
        }
      } else {
        const result = await approvalService.createApprovalFromRequest(request);
        approvalId      = result.approval?.id;
        approvalMessage = result.message;

        auditTrail.push(createAutonomousOperationAuditEvent(
          plan.id, plan.agentId, plan.orgSlug, "operation_approval_created",
          result.success ? `Approval created: ${approvalId ?? "unknown"}` : `Approval creation failed: ${result.message}`,
          { success: result.success, approvalId },
        ));

        if (!result.success) {
          return {
            success: false, message: result.message, plan, status: "FAILED",
            errors: [...errors, result.message], warnings: [...warnings, ...(result.warnings ?? [])],
            auditTrail,
            execution: { executorType: "approval_service", startedAt: new Date().toISOString(), success: false, message: result.message },
          };
        }
      }

      return {
        success:            true,
        message:            alreadyProcessed
          ? `Aprobación ya existente reutilizada: "${plan.title}"`
          : `Aprobación creada correctamente: "${plan.title}"`,
        plan:               { ...plan, status: "WAITING_APPROVAL" },
        status:             "WAITING_APPROVAL",
        createdApprovalId:  approvalId,
        alreadyProcessed,
        existingEntityId:   alreadyProcessed ? approvalId : undefined,
        existingEntityType: alreadyProcessed ? "approval" : undefined,
        idempotencyKey:     plan.idempotencyKey,
        errors,
        warnings,
        auditTrail,
        execution: {
          executorType: "approval_service",
          startedAt:    new Date().toISOString(),
          success:      true,
          message:      approvalMessage,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error inesperado al crear aprobación.";
      return {
        success:  false,
        message:  msg,
        plan,
        status:   "FAILED",
        errors:   [...errors, msg],
        warnings,
        auditTrail,
      };
    }
  }

  // ── ESCALATE_TO_USER ──────────────────────────────────────────────────────

  if (plan.decision === "ESCALATE_TO_USER") {
    auditTrail.push(createAutonomousOperationAuditEvent(
      plan.id, plan.agentId, plan.orgSlug, "operation_escalated",
      `Escalation surfaced to user: ${plan.escalationPayload?.urgency ?? "MEDIUM"} — ${plan.title}`,
      { escalationPayload: plan.escalationPayload },
    ));

    return {
      success:  true,
      message:  `Escalación generada: "${plan.title}"`,
      plan:     { ...plan, status: "PLANNED" },
      status:   "PLANNED",
      errors,
      warnings,
      auditTrail,
    };
  }

  // ── NO_ACTION ─────────────────────────────────────────────────────────────

  if (plan.decision === "NO_ACTION") {
    return {
      success:  true,
      message:  "No action required.",
      plan:     { ...plan, status: "COMPLETED" },
      status:   "COMPLETED",
      errors,
      warnings,
      auditTrail,
    };
  }

  // ── Unsupported decision for dispatcher ───────────────────────────────────

  const msg = `Decision "${plan.decision}" cannot be dispatched by this service (status=${plan.status}).`;
  return {
    success:  false,
    message:  msg,
    plan,
    status:   plan.status,
    errors:   [...errors, msg],
    warnings,
    auditTrail,
  };
}
