/**
 * lib/agents/runtime/agent-runtime-engine.ts
 *
 * Agentik — Agent Runtime Engine
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * The main entry point for running an agent against a set of signals.
 * Coordinates: validation → permissions → decision engine → action mapping → result.
 *
 * IMPORTANT — this engine:
 *   ✓ Generates ProposedActions for user review
 *   ✗ Does NOT create real Tasks
 *   ✗ Does NOT create real Approvals
 *   ✗ Does NOT start real Workflows
 *   ✗ Does NOT persist anything
 *   ✗ Does NOT import Prisma, React, or Next
 *
 * Pure domain. Safe to import from any layer.
 */

import type { AgentRuntimeContext }    from "./agent-context";
import type { AgentRuntimeResult, ProposedAction } from "./agent-runtime-result";
import type { AgentRunId, AgentRuntimeAuditEvent, AgentRuntimeActionType } from "./agent-runtime-types";
import type { DecisionContext }         from "../../decisions/decision-context";
import type { DecisionRecommendation }  from "../../decisions/decision-recommendation";

import { validateAgentRuntimeContext, validateAgentProfile, validateProposedAction, auditAgentRuntimeRun, createAgentRuntimeAuditEvent } from "./agent-runtime-audit";
import { isActionPermitted }            from "./agent-permissions";
import { runDecisionEngine }            from "../../decisions/decision-engine";

// ── ID generation ─────────────────────────────────────────────────────────────

let _seq = 0;
function nextId(prefix: string): string {
  _seq++;
  return `${prefix}_${Date.now()}_${(_seq).toString(36)}`;
}

// ── Recommendation → action type mapping ─────────────────────────────────────

function mapDecisionActionToRuntimeAction(
  decisionAction: string,
): AgentRuntimeActionType {
  switch (decisionAction) {
    case "CREATE_TASK":       return "CREATE_TASK_DRAFT";
    case "REQUEST_APPROVAL":  return "CREATE_APPROVAL_DRAFT";
    case "START_WORKFLOW":    return "START_WORKFLOW_DRAFT";
    case "SHOW_ALERT":        return "ESCALATE_TO_USER";
    case "GENERATE_REPORT":   return "RECOMMEND_ACTION";
    case "CREATE_DOCUMENT":   return "RECOMMEND_ACTION";
    case "NO_ACTION":         return "NO_ACTION";
    default:                  return "RECOMMEND_ACTION";
  }
}

// ── Confidence mapper ─────────────────────────────────────────────────────────

function mapConfidence(score: number): ProposedAction["confidence"] {
  if (score >= 80) return "VERY_HIGH";
  if (score >= 60) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

// ── Recommendation → ProposedAction ──────────────────────────────────────────

export function mapRecommendationToProposedAction(
  rec:          DecisionRecommendation,
  agentId:      string,
  targetModule: string,
): ProposedAction {
  const runtimeActionType = mapDecisionActionToRuntimeAction(rec.actionType);

  return {
    id:                     nextId("pa"),
    type:                   runtimeActionType,
    label:                  rec.title,
    description:            rec.description,
    targetDomain:           rec.domain,
    targetModule,
    requiresApproval:       rec.requiresApproval,
    sourceRecommendationId: rec.id,
    payload: {
      agentId,
      signalId:       rec.signalId,
      ruleId:         rec.ruleId,
      domain:         rec.domain,
      actionType:     rec.actionType,
      severity:       rec.severity,
      reasoning:      rec.reasoning,
      businessImpact: rec.businessImpact,
      ...(rec.suggestedPayload ?? {}),
      ...(rec.relatedEntity ? { relatedEntity: rec.relatedEntity } : {}),
    },
    navigationTarget: rec.navigationTarget,
    confidence:       mapConfidence(rec.score),
    score:            rec.score,
    metadata:         rec.metadata,
  };
}

// ── Decision context builder ──────────────────────────────────────────────────

function buildDecisionContextFromAgentContext(ctx: AgentRuntimeContext): DecisionContext {
  return {
    orgSlug:          ctx.orgSlug,
    organizationId:   ctx.organizationId,
    module:           ctx.module,
    agentId:          ctx.agentProfile.agentId,
    agentName:        ctx.agentProfile.displayName,
    userId:           ctx.userId,
    role:             ctx.userRole,
    currentRoute:     ctx.currentRoute,
    businessDate:     ctx.businessDate,
    signals:          ctx.signals,
    activeTasks:      ctx.activeTasks.map(t => ({
      id:         t.id,
      title:      t.title,
      status:     t.status,
      domain:     t.domain,
      entityType: t.entityType,
      entityId:   t.entityId,
      createdAt:  t.createdAt,
    })),
    pendingApprovals: ctx.pendingApprovals.map(a => ({
      id:         a.id,
      title:      a.title,
      status:     a.status,
      entityType: a.entityType,
      entityId:   a.entityId,
      createdAt:  a.createdAt,
    })),
    recentExecutions: ctx.recentExecutions.map(e => ({
      id:         e.id,
      module:     e.module,
      actionType: e.actionType,
      status:     e.status,
      success:    e.success,
      createdAt:  e.createdAt,
    })),
    workflowRuns: ctx.workflowRuns.map(w => ({
      id:            w.id,
      chainId:       w.chainId,
      status:        w.status,
      currentStepId: w.currentStepId,
      createdAt:     w.createdAt,
    })),
    metadata: ctx.metadata,
  };
}

// ── Main engine ───────────────────────────────────────────────────────────────

export function runAgentRuntime(context: AgentRuntimeContext): AgentRuntimeResult {
  const runId       = nextId("arun") as AgentRunId;
  const agentId     = context.agentProfile?.agentId ?? "unknown";
  const agentDomain = context.agentProfile?.domain  ?? "SYSTEM";
  const agentMode   = context.runtimeMode            ?? "PREVIEW";
  const audit:    AgentRuntimeAuditEvent[] = [];
  const errors:   string[] = [];
  const warnings: string[] = [];

  // ── 1. Validate agent profile ──────────────────────────────────────────────

  audit.push(createAgentRuntimeAuditEvent(runId, agentId, "runtime_started",
    `Agent runtime started: agent=${agentId} module=${context.module ?? "?"} mode=${context.runtimeMode ?? "?"}`,
  ));

  const profileValidation = validateAgentProfile(context.agentProfile);
  if (!profileValidation.valid) {
    profileValidation.errors.forEach(e => errors.push(e));
    audit.push(createAgentRuntimeAuditEvent(runId, agentId, "validation_error",
      `Profile validation failed: ${profileValidation.errors.join("; ")}`,
    ));
    return {
      success:         false,
      message:         `Agent profile invalid: ${profileValidation.errors.join("; ")}`,
      runId,
      agentId,
      agentDomain,
      agentMode,
      status:          "FAILED",
      proposedActions: [],
      auditTrail:      audit,
      errors,
      warnings,
    };
  }
  profileValidation.warnings.forEach(w => warnings.push(w));

  // ── 2. Validate context ────────────────────────────────────────────────────

  const ctxValidation = validateAgentRuntimeContext(context);
  if (!ctxValidation.valid) {
    ctxValidation.errors.forEach(e => errors.push(e));
    audit.push(createAgentRuntimeAuditEvent(runId, agentId, "validation_error",
      `Context validation failed: ${ctxValidation.errors.join("; ")}`,
    ));
    return {
      success:         false,
      message:         `Runtime context invalid: ${ctxValidation.errors.join("; ")}`,
      runId,
      agentId,
      agentDomain,
      agentMode,
      status:          "FAILED",
      proposedActions: [],
      auditTrail:      audit,
      errors,
      warnings,
    };
  }
  ctxValidation.warnings.forEach(w => warnings.push(w));

  audit.push(createAgentRuntimeAuditEvent(runId, agentId, "context_validated",
    `Context valid: ${context.signals.length} signals, mode=${context.runtimeMode}`,
  ));

  // ── 3. Check agent is active ───────────────────────────────────────────────

  if (!context.agentProfile.isActive) {
    const msg = `Agent ${agentId} is inactive`;
    errors.push(msg);
    return {
      success:         false,
      message:         msg,
      runId,
      agentId,
      agentDomain,
      agentMode,
      status:          "BLOCKED",
      proposedActions: [],
      auditTrail:      audit,
      errors,
      warnings,
    };
  }

  audit.push(createAgentRuntimeAuditEvent(runId, agentId, "permissions_checked",
    `Agent ${agentId} active, allowedDomains=${context.agentProfile.allowedDomains.join(",")}`,
  ));

  // ── 4. Build / use DecisionContext ────────────────────────────────────────

  const decisionContext: DecisionContext =
    context.decisionContext ?? buildDecisionContextFromAgentContext(context);

  // ── 5. Run Decision Engine ─────────────────────────────────────────────────

  audit.push(createAgentRuntimeAuditEvent(runId, agentId, "decision_engine_started",
    `Running decision engine with ${context.signals.length} signals`,
  ));

  const decisionResult = runDecisionEngine(decisionContext);

  if (!decisionResult.success) {
    decisionResult.errors.forEach(e => errors.push(e));
    audit.push(createAgentRuntimeAuditEvent(runId, agentId, "runtime_failed",
      `Decision engine failed: ${decisionResult.errors.join("; ")}`,
    ));
    return {
      success:         false,
      message:         `Decision engine failed: ${decisionResult.errors.join("; ")}`,
      runId,
      agentId,
      agentDomain,
      agentMode,
      status:          "FAILED",
      decisionResult,
      proposedActions: [],
      auditTrail:      audit,
      errors,
      warnings,
    };
  }

  audit.push(createAgentRuntimeAuditEvent(runId, agentId, "decision_engine_completed",
    `Decision engine produced ${decisionResult.recommendations.length} recommendations`,
    { recommendationCount: decisionResult.recommendations.length },
  ));

  // ── 6. Map recommendations → ProposedActions ──────────────────────────────

  const proposedActions: ProposedAction[] = [];
  let filteredCount = 0;

  for (const rec of decisionResult.recommendations) {
    const runtimeActionType = mapDecisionActionToRuntimeAction(rec.actionType);

    // Check if this action is permitted given profile + mode + domain
    const permCheck = isActionPermitted(
      context.agentProfile,
      context.runtimeMode,
      runtimeActionType,
      rec.domain as import("./agent-runtime-types").AgentRuntimeDomain,
    );

    if (!permCheck.permitted) {
      filteredCount++;
      audit.push(createAgentRuntimeAuditEvent(runId, agentId, "action_filtered",
        `Filtered: ${runtimeActionType} for ${rec.domain} — ${permCheck.reason}`,
        { ruleId: rec.ruleId, reason: permCheck.reason },
      ));
      warnings.push(`Action filtered: ${permCheck.reason}`);
      continue;
    }

    const action = mapRecommendationToProposedAction(rec, agentId, context.module);

    // Validate the generated action
    const actionValidation = validateProposedAction(action);
    if (!actionValidation.valid) {
      warnings.push(`ProposedAction validation failed: ${actionValidation.errors.join("; ")}`);
      continue;
    }

    proposedActions.push(action);

    audit.push(createAgentRuntimeAuditEvent(runId, agentId, "action_proposed",
      `Proposed: ${runtimeActionType} (score=${action.score}) — ${action.label.slice(0, 60)}`,
      { actionId: action.id, type: runtimeActionType, score: action.score },
    ));
  }

  // ── 7. Sort by score descending ───────────────────────────────────────────

  proposedActions.sort((a, b) => b.score - a.score);

  // ── 8. Run audit ──────────────────────────────────────────────────────────

  const runAudit = auditAgentRuntimeRun(runId, {
    signalCount:   context.signals.length,
    actionCount:   proposedActions.length,
    filteredCount,
    errors,
    warnings,
  });
  runAudit.warnings.forEach(w => {
    if (!warnings.includes(w)) warnings.push(w);
  });

  // ── 9. Complete ───────────────────────────────────────────────────────────

  const status = proposedActions.length > 0 ? "COMPLETED" : "COMPLETED";
  audit.push(createAgentRuntimeAuditEvent(runId, agentId, "runtime_completed",
    `Agent runtime completed: ${proposedActions.length} proposed actions, ${filteredCount} filtered`,
    { actionCount: proposedActions.length, filteredCount },
  ));

  return {
    success:         true,
    message:         `Agent ${agentId} completed: ${proposedActions.length} proposed actions`,
    runId,
    agentId,
    agentDomain,
    agentMode,
    status,
    decisionResult,
    proposedActions,
    auditTrail:      audit,
    errors,
    warnings,
  };
}
