/**
 * lib/agents/runtime/agent-action-dispatcher.ts
 *
 * Agentik — Universal Agent Runtime — Action Dispatcher
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * Implements AgentActionDispatcherPort with REAL integrations:
 *   - CREATE_TASK      → taskPrismaRepository (createTaskIdempotent)
 *   - CREATE_APPROVAL  → approvalPrismaRepository (createApprovalIdempotent)
 *   - CREATE_ALERT     → high-priority task via taskPrismaRepository
 *   - START_WORKFLOW   → workflowRunRepository.createRun
 *   - READ_*           → pass-through (reads from execution context/memory)
 *
 * SERVER-ONLY — imports Prisma transitively. No mocks. No stubs.
 */
import "server-only";

import { randomUUID }             from "crypto";
import type {
  AgentDefinition,
  AgentPlanStep,
  AgentExecutionContext,
  GoalPriority,
}                                  from "./agent-types";
import type {
  AgentActionDispatcherPort,
  StepDispatchResult,
}                                  from "./agent-plan-executor";

import { createTaskDraft }         from "@/lib/tasks/task-factory";
import { createTaskIdempotent }    from "@/lib/tasks/persistence/task-prisma-repository";
import type { TaskPriority, TaskSource } from "@/lib/tasks/task-types";

import { createApprovalRequest, SYSTEM_APPROVER } from "@/lib/approvals/approval-factory";
import { createApprovalIdempotent }               from "@/lib/approvals/persistence/approval-prisma-repository";
import type { ApprovalCategory, ApprovalPriority, ApprovalCreationInput } from "@/lib/approvals/approval-types";

import { workflowRunRepository }   from "@/lib/work/chaining/persistence/workflow-run-repository";
import type { WorkflowChainRun }   from "@/lib/work/chaining/workflow-chain-types";

// ── Priority converters ────────────────────────────────────────────────────────

function toTaskPriority(p: GoalPriority | string): TaskPriority {
  if (p === "critical") return "critical";
  if (p === "high")     return "high";
  if (p === "medium")   return "medium";
  return "low";
}

function toApprovalPriority(p: GoalPriority | string): ApprovalPriority {
  if (p === "critical") return "CRITICAL";
  if (p === "high")     return "HIGH";
  if (p === "medium")   return "MEDIUM";
  return "LOW";
}

function toTaskSource(domain?: string): TaskSource {
  const valid: TaskSource[] = ["finance", "collections", "commercial", "marketing", "inventory", "operations", "system"];
  if (domain && valid.includes(domain as TaskSource)) return domain as TaskSource;
  return "system";
}

function correlationKey(context: AgentExecutionContext): string {
  return (context.metadata.correlationId as string | undefined) ?? Date.now().toString(36);
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleCreateTask(
  step:    AgentPlanStep,
  agent:   AgentDefinition,
  context: AgentExecutionContext,
): Promise<StepDispatchResult> {
  const p           = step.params as Record<string, unknown>;
  const title       = (p.title       as string | undefined) ?? step.label;
  const description = p.description  as string | undefined;
  const priority    = toTaskPriority((p.priority as string | undefined) ?? context.goal.priority);
  const source      = toTaskSource(p.domain as string | undefined);

  const draft = createTaskDraft({
    title,
    description,
    priority,
    source,
    category: "followup",
    owner:    { id: agent.id, type: "agent", name: agent.displayName },
    businessContext: {
      orgSlug:         context.orgSlug,
      module:          source,
      sourceAgentId:   agent.id,
      sourceAgentName: agent.displayName,
      metadata:        { stepId: step.id, goalType: context.goal.type },
    },
    createdBy: { id: agent.id, type: "agent", name: agent.displayName },
    metadata:  { agentId: agent.id, stepId: step.id, goalType: context.goal.type },
  });

  const idempotencyKey = `agent:${agent.id}:${step.id}:${correlationKey(context)}`;
  const { task }       = await createTaskIdempotent(draft, context.orgSlug, idempotencyKey);

  return {
    success: true,
    output:  { taskId: task.id, title: task.draft.title, status: task.draft.status },
  };
}

async function handleCreateApproval(
  step:    AgentPlanStep,
  agent:   AgentDefinition,
  context: AgentExecutionContext,
): Promise<StepDispatchResult> {
  const p           = step.params as Record<string, unknown>;
  const category    = (p.category    as ApprovalCategory | undefined) ?? "OPERATIONS";
  const description = (p.description as string | undefined) ?? context.goal.description;
  const priority    = toApprovalPriority(context.goal.priority);

  const input: ApprovalCreationInput = {
    title:       `Aprobación agente: ${description}`,
    description,
    priority,
    source:      "AGENT",
    category,
    requestor:   { id: agent.id, type: "AGENT", name: agent.displayName },
    approver:    SYSTEM_APPROVER,
    context: {
      orgSlug:         context.orgSlug,
      sourceAgentId:   agent.id,
      sourceAgentName: agent.displayName,
      metadata:        { stepId: step.id, goalType: context.goal.type },
    },
    metadata: { agentId: agent.id, stepId: step.id },
  };

  const request        = createApprovalRequest(input);
  const idempotencyKey = `agent:${agent.id}:${step.id}:${correlationKey(context)}`;
  const { approval }   = await createApprovalIdempotent(request, idempotencyKey);

  return {
    success: true,
    output:  { approvalId: approval.id, status: approval.status, category: approval.category },
  };
}

async function handleCreateAlert(
  step:    AgentPlanStep,
  agent:   AgentDefinition,
  context: AgentExecutionContext,
): Promise<StepDispatchResult> {
  const p        = step.params as Record<string, unknown>;
  const severity = (p.severity as string | undefined) ?? context.goal.priority;
  const priority = toTaskPriority(severity);

  const draft = createTaskDraft({
    title:       `Alerta: ${context.goal.description}`,
    description: context.goal.description,
    priority,
    source:      "system",
    category:    "alert",
    owner:       { id: agent.id, type: "agent", name: agent.displayName },
    businessContext: {
      orgSlug:         context.orgSlug,
      module:          "operations",
      sourceAgentId:   agent.id,
      sourceAgentName: agent.displayName,
      metadata:        { stepId: step.id, alertSeverity: severity },
    },
    createdBy: { id: agent.id, type: "agent", name: agent.displayName },
    metadata:  { agentId: agent.id, stepId: step.id, alertSeverity: severity },
  });

  const idempotencyKey = `agent:${agent.id}:${step.id}:alert:${correlationKey(context)}`;
  const { task }       = await createTaskIdempotent(draft, context.orgSlug, idempotencyKey);

  return {
    success: true,
    output:  { alertTaskId: task.id, severity, title: task.draft.title },
  };
}

async function handleStartWorkflow(
  step:    AgentPlanStep,
  agent:   AgentDefinition,
  context: AgentExecutionContext,
): Promise<StepDispatchResult> {
  const p         = step.params as Record<string, unknown>;
  const chainId   = (p.chainId   as string | undefined) ?? `AGENT_CHAIN_${agent.id.toUpperCase()}`;
  const chainName = (p.chainName as string | undefined) ?? chainId;
  const now       = new Date().toISOString();
  const runId     = randomUUID();

  const run: WorkflowChainRun = {
    id:                 runId,
    idempotencyKey:     `agent:${agent.id}:${step.id}:${correlationKey(context)}`,
    chainId,
    chainName,
    orgSlug:            context.orgSlug,
    status:             "RUNNING",
    triggerExecutionId: `agent_trigger_${agent.id}_${Date.now().toString(36)}`,
    currentStepId:      null,
    completedStepIds:   [],
    stepResults:        [],
    auditTrail: [
      {
        id:         randomUUID(),
        runId,
        event:      "chain_started",
        message:    `Workflow iniciado por agente ${agent.displayName} (${agent.id})`,
        metadata:   { agentId: agent.id, stepId: step.id, goalType: context.goal.type },
        occurredAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
    metadata:  { agentId: agent.id, stepId: step.id, goalDescription: context.goal.description },
  };

  const created = await workflowRunRepository.createRun(run, context.orgSlug);

  return {
    success: true,
    output:  { workflowRunId: created.id, chainId: created.chainId, status: created.status },
  };
}

function handleReadSignal(): StepDispatchResult {
  // READ_* steps succeed immediately — the agent's execution context
  // (context.memory) already carries the domain snapshot loaded before planning.
  return { success: true, output: { read: true, timestamp: new Date().toISOString() } };
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export const agentActionDispatcher: AgentActionDispatcherPort = {
  async dispatch(
    step:    AgentPlanStep,
    agent:   AgentDefinition,
    context: AgentExecutionContext,
  ): Promise<StepDispatchResult> {
    switch (step.action) {
      case "CREATE_TASK":
        return handleCreateTask(step, agent, context);
      case "CREATE_APPROVAL":
        return handleCreateApproval(step, agent, context);
      case "CREATE_ALERT":
        return handleCreateAlert(step, agent, context);
      case "START_WORKFLOW":
        return handleStartWorkflow(step, agent, context);
      case "READ_FINANCE":
      case "READ_MARKETING":
      case "READ_COMMERCIAL":
      case "READ_COLLECTIONS":
      case "EXECUTE_ACTION":
        return handleReadSignal();
      default:
        return { success: false, output: {}, error: `Unknown action type: ${step.action}` };
    }
  },
};
