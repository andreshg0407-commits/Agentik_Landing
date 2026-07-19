/**
 * lib/autonomous-operations/autonomous-operation-planner.ts
 *
 * Agentik — Autonomous Operations Planner
 * Sprint: AGENTIK-AUTONOMOUS-OPERATIONS-01
 *
 * Takes an AutonomousOperationInput and produces an AutonomousOperationPlan.
 * The plan is a complete, structured intent — it does NOT execute anything.
 *
 * Pure domain. No Prisma. No React. No Next.
 */

import type {
  AutonomousOperationInput,
  AutonomousOperationPlan,
  AutonomousOperationPlanId,
  AutonomousOperationStatus,
  TaskDraft,
  ApprovalDraft,
  WorkflowDraft,
  EscalationPayload,
} from "./autonomous-operation-types";
import type { ProposedAction } from "../agents/runtime/agent-runtime-result";

import { resolveOperationPolicy }   from "./autonomous-operation-registry";
import { evaluateAutonomousGuardrails, calculateRiskLevel } from "./autonomous-operation-guardrails";
import { validateAutonomousOperationInput, createAutonomousOperationAuditEvent, appendPlanAuditEvent } from "./autonomous-operation-audit";
import { buildAutonomousOperationIdempotencyKey } from "../idempotency/idempotency-key";

// ── ID generation ─────────────────────────────────────────────────────────────

let _seq = 0;
function nextId(prefix: string): string {
  _seq++;
  return `${prefix}_${Date.now()}_${(_seq).toString(36)}`;
}

// ── Draft builders ────────────────────────────────────────────────────────────

export function buildTaskDraftFromProposedAction(
  action:  ProposedAction,
  orgSlug: string,
  agentId: string,
): TaskDraft {
  const priority: TaskDraft["priority"] =
    action.score >= 75 ? "HIGH"   :
    action.score >= 50 ? "MEDIUM" : "LOW";

  return {
    title:           action.label,
    description:     action.description,
    domain:          action.targetDomain,
    module:          action.targetModule,
    priority,
    assignedAgentId: agentId,
    entityType:      (action.payload?.relatedEntity as Record<string,unknown> | undefined)?.type as string | undefined,
    entityId:        (action.payload?.relatedEntity as Record<string,unknown> | undefined)?.id   as string | undefined,
    sourceSignalId:  action.payload?.signalId as string | undefined,
    metadata: {
      orgSlug,
      agentId,
      sourceRecommendationId: action.sourceRecommendationId,
      navigationTarget:       action.navigationTarget,
    },
  };
}

export function buildApprovalDraftFromProposedAction(
  action:  ProposedAction,
  orgSlug: string,
  agentId: string,
): ApprovalDraft {
  return {
    title:       action.label,
    description: action.description,
    domain:      action.targetDomain,
    module:      action.targetModule,
    actionType:  action.type,
    requestedBy: agentId,
    entityType:  (action.payload?.relatedEntity as Record<string,unknown> | undefined)?.type as string | undefined,
    entityId:    (action.payload?.relatedEntity as Record<string,unknown> | undefined)?.id   as string | undefined,
    businessContext: {
      orgSlug,
      agentId,
      sourceRecommendationId: action.sourceRecommendationId,
      signalId:               action.payload?.signalId,
      domain:                 action.targetDomain,
      score:                  action.score,
      confidence:             action.confidence,
      reasoning:              action.payload?.reasoning,
    },
    metadata: {
      orgSlug,
      agentId,
      navigationTarget: action.navigationTarget,
    },
  };
}

export function buildWorkflowDraftFromProposedAction(
  action:  ProposedAction,
  orgSlug: string,
  agentId: string,
): WorkflowDraft {
  return {
    chainId:          (action.payload?.workflowId as string | undefined) ?? "UNKNOWN_CHAIN",
    requiresApproval: true,
    triggerPayload: {
      orgSlug,
      agentId,
      sourceRecommendationId: action.sourceRecommendationId,
      signalId:               action.payload?.signalId,
      domain:                 action.targetDomain,
      score:                  action.score,
      reasoning:              action.payload?.reasoning,
    },
    metadata: {
      navigationTarget: action.navigationTarget,
    },
  };
}

export function buildEscalationPayloadFromProposedAction(
  action:  ProposedAction,
  agentId: string,
): EscalationPayload {
  const urgency: EscalationPayload["urgency"] =
    action.score >= 75 ? "CRITICAL" :
    action.score >= 60 ? "HIGH"     :
    action.score >= 40 ? "MEDIUM"   : "LOW";

  return {
    title:           action.label,
    description:     action.description,
    urgency,
    agentId,
    targetModule:    action.targetModule,
    navigationTarget: action.navigationTarget,
    metadata: {
      sourceRecommendationId: action.sourceRecommendationId,
      signalId:               action.payload?.signalId,
      score:                  action.score,
    },
  };
}

// ── Status from decision ──────────────────────────────────────────────────────

function statusFromDecision(
  decision: AutonomousOperationPlan["decision"],
): AutonomousOperationStatus {
  switch (decision) {
    case "BLOCK":              return "BLOCKED";
    case "REQUIRE_APPROVAL":   return "WAITING_APPROVAL";
    case "CREATE_TASK_ONLY":   return "READY_TO_EXECUTE";
    case "CREATE_APPROVAL_ONLY": return "READY_TO_EXECUTE";
    case "START_WORKFLOW":     return "WAITING_APPROVAL";
    case "ESCALATE_TO_USER":   return "PLANNED";
    case "NO_ACTION":          return "COMPLETED";
    case "ALLOW_AUTO_EXECUTE": return "READY_TO_EXECUTE";
    default:                   return "BLOCKED";
  }
}

// ── Main planner ──────────────────────────────────────────────────────────────

export function planAutonomousOperation(
  input: AutonomousOperationInput,
): AutonomousOperationPlan {
  const planId   = nextId("aop") as AutonomousOperationPlanId;
  const inputId  = input?.proposedAction?.id ?? "unknown";
  const agentId  = input?.agentId ?? "unknown";
  const orgSlug  = input?.orgSlug ?? "unknown";
  const action   = input?.proposedAction;
  const now      = new Date().toISOString();
  const errors:   string[] = [];
  const warnings: string[] = [];
  const audit     = [];

  // ── 0. Resolve or generate idempotency key ────────────────────────────────

  const idempotencyKey = input.idempotencyKey ?? buildAutonomousOperationIdempotencyKey(input);

  audit.push(createAutonomousOperationAuditEvent(planId, agentId, orgSlug, "idempotency_key_created",
    `Idempotency key: ${idempotencyKey}`,
    { idempotencyKey, source: input.idempotencyKey ? "input" : "generated" },
  ));

  // ── 1. Validate input ──────────────────────────────────────────────────────

  const inputValidation = validateAutonomousOperationInput(input);
  if (!inputValidation.valid) {
    inputValidation.errors.forEach(e => errors.push(e));
    const plan: AutonomousOperationPlan = {
      id:                       planId,
      inputId,
      agentId,
      orgSlug,
      status:                   "BLOCKED",
      decision:                 "BLOCK",
      riskLevel:                "CRITICAL",
      requiresApproval:         false,
      requiresHumanConfirmation: false,
      canAutoExecute:           false,
      actionType:               action?.type ?? "UNKNOWN",
      targetDomain:             action?.targetDomain ?? "SYSTEM",
      targetModule:             action?.targetModule ?? "sistema",
      title:                    action?.label ?? "Unknown operation",
      description:              action?.description ?? "",
      reasoning:                `Input validation failed: ${errors.join("; ")}`,
      payload:                  {},
      auditTrail:               [
        createAutonomousOperationAuditEvent(planId, agentId, orgSlug, "validation_error",
          `Input invalid: ${errors.join("; ")}`),
      ],
      errors,
      warnings,
      createdAt:                now,
      metadata:                 input.metadata ?? {},
    };
    return plan;
  }
  inputValidation.warnings.forEach(w => warnings.push(w));

  // ── 2. Calculate risk level ────────────────────────────────────────────────

  const riskLevel = calculateRiskLevel(input);

  // ── 3. Resolve policy ─────────────────────────────────────────────────────

  const policy = resolveOperationPolicy(action.type, riskLevel, input.runtimeMode);

  audit.push(createAutonomousOperationAuditEvent(planId, agentId, orgSlug, "policy_applied",
    `Policy ${policy.id} applied: decision=${policy.decision}, risk=${riskLevel}`,
    { policyId: policy.id, decision: policy.decision, riskLevel },
  ));

  // ── 4. Evaluate guardrails ─────────────────────────────────────────────────

  const guardrailResult = evaluateAutonomousGuardrails(input, policy);

  if (!guardrailResult.allowed) {
    guardrailResult.errors.forEach(e => errors.push(e));
    guardrailResult.warnings.forEach(w => warnings.push(w));

    audit.push(createAutonomousOperationAuditEvent(planId, agentId, orgSlug, "guardrail_blocked",
      `Guardrail blocked: ${guardrailResult.triggeredGuardrail ?? "unknown"} — ${errors.join("; ")}`,
      { guardrail: guardrailResult.triggeredGuardrail, decision: guardrailResult.decision },
    ));

    return {
      id:                       planId,
      inputId,
      agentId,
      orgSlug,
      status:                   statusFromDecision(guardrailResult.decision),
      decision:                 guardrailResult.decision,
      riskLevel:                guardrailResult.riskLevel,
      requiresApproval:         guardrailResult.decision === "REQUIRE_APPROVAL",
      requiresHumanConfirmation: true,
      canAutoExecute:           false,
      actionType:               action.type,
      targetDomain:             action.targetDomain,
      targetModule:             action.targetModule,
      title:                    action.label,
      description:              action.description,
      reasoning:                `Blocked by guardrail: ${guardrailResult.triggeredGuardrail ?? "policy"}.`,
      payload:                  action.payload ?? {},
      navigationTarget:         action.navigationTarget,
      auditTrail:               audit,
      errors,
      warnings,
      createdAt:                now,
      metadata:                 input.metadata ?? {},
    };
  }

  guardrailResult.warnings.forEach(w => warnings.push(w));

  audit.push(createAutonomousOperationAuditEvent(planId, agentId, orgSlug, "guardrail_passed",
    `All guardrails passed. Decision: ${guardrailResult.decision}`,
    { decision: guardrailResult.decision, riskLevel: guardrailResult.riskLevel },
  ));

  // ── 5. Build decision ──────────────────────────────────────────────────────

  const finalDecision = guardrailResult.decision;
  const status        = statusFromDecision(finalDecision);

  let taskDraft:        TaskDraft        | undefined;
  let approvalDraft:    ApprovalDraft    | undefined;
  let workflowDraft:    WorkflowDraft    | undefined;
  let escalationPayload: EscalationPayload | undefined;

  switch (finalDecision) {
    case "CREATE_TASK_ONLY":
      taskDraft = buildTaskDraftFromProposedAction(action, orgSlug, agentId);
      break;

    case "CREATE_APPROVAL_ONLY":
    case "REQUIRE_APPROVAL":
      approvalDraft = buildApprovalDraftFromProposedAction(action, orgSlug, agentId);
      break;

    case "START_WORKFLOW":
      workflowDraft = buildWorkflowDraftFromProposedAction(action, orgSlug, agentId);
      approvalDraft = buildApprovalDraftFromProposedAction(action, orgSlug, agentId);
      break;

    case "ESCALATE_TO_USER":
      escalationPayload = buildEscalationPayloadFromProposedAction(action, agentId);
      break;

    case "NO_ACTION":
    case "BLOCK":
    case "ALLOW_AUTO_EXECUTE":
    default:
      break;
  }

  audit.push(createAutonomousOperationAuditEvent(planId, agentId, orgSlug, "operation_planned",
    `Plan created: decision=${finalDecision}, status=${status}, risk=${riskLevel}`,
    {
      decision:     finalDecision,
      status,
      riskLevel,
      hasTaskDraft:     !!taskDraft,
      hasApprovalDraft: !!approvalDraft,
      hasWorkflowDraft: !!workflowDraft,
    },
  ));

  return {
    id:                        planId,
    inputId,
    agentId,
    orgSlug,
    status,
    decision:                  finalDecision,
    riskLevel,
    requiresApproval:          policy.requiresApproval,
    requiresHumanConfirmation: finalDecision !== "NO_ACTION" && finalDecision !== "ESCALATE_TO_USER",
    canAutoExecute:            policy.canAutoExecute && guardrailResult.allowed,
    actionType:                action.type,
    targetDomain:              action.targetDomain,
    targetModule:              action.targetModule,
    title:                     action.label,
    description:               action.description,
    reasoning:                 action.payload?.reasoning as string ?? `${policy.name}: ${policy.description}`,
    payload:                   action.payload ?? {},
    navigationTarget:          action.navigationTarget,
    approvalDraft,
    taskDraft,
    workflowDraft,
    escalationPayload,
    idempotencyKey,
    auditTrail:                audit,
    errors,
    warnings,
    createdAt:                 now,
    metadata:                  input.metadata ?? {},
  };
}
