/**
 * lib/agent-planning/readiness-engine.ts
 *
 * Agentik Runtime Planning — Readiness Evaluation Engine
 *
 * Determines whether an action or plan step can proceed.
 * All evaluation is deterministic — no LLM, no Mastra.
 *
 * Sprint: AGENTIK-AGENT-DEPENDENCY-PLANNING-01
 */

import type { ActionEnvelope }    from "@/lib/agent-runtime/action-envelope";
import type { AgentDelegation }   from "@/lib/agent-orchestration/delegation-types";
import type { RuntimeMemoryNode } from "@/lib/agent-memory/runtime-memory-types";
import type {
  PlanStep,
  ReadinessStatus,
} from "./planning-types";
import type { DependencyGraph } from "./planning-types";

// ── Delegation terminal check ─────────────────────────────────────────────────

function isDelegationNonBlocking(d: AgentDelegation): boolean {
  return ["completed", "rejected", "canceled", "expired"].includes(d.status);
}

// ── Action readiness ──────────────────────────────────────────────────────────

export interface ActionReadinessResult {
  actionId:   string;
  readiness:  ReadinessStatus;
  reasons:    string[];
  blockedBy:  string[];
}

/**
 * Evaluates whether an ActionEnvelope can proceed based on its lifecycle
 * state, delegations, and dependency graph.
 */
export function evaluateActionReadiness(
  envelope:    ActionEnvelope,
  delegations: AgentDelegation[],
  graph:       DependencyGraph,
): ActionReadinessResult {
  const actionId = envelope.agentActionId ?? envelope.actionTaskId ?? envelope.id;
  const reasons:  string[] = [];
  const blockedBy: string[] = [];

  // ── Check 1: Terminal or failed ───────────────────────────────────────────
  if (envelope.agentStatus === "failed") {
    return { actionId, readiness: "failed_dependency", reasons: ["Acción fallida — requiere revisión."], blockedBy: [] };
  }
  if (["completed", "executed", "rejected", "dismissed", "expired", "canceled"].includes(envelope.agentStatus as string)) {
    return { actionId, readiness: "ready", reasons: ["Acción ya resuelta."], blockedBy: [] };
  }

  // ── Check 2: Needs approval ───────────────────────────────────────────────
  if (envelope.requiresApproval && envelope.agentStatus === "pending_approval") {
    reasons.push("Requiere aprobación humana.");
    return { actionId, readiness: "waiting_approval", reasons, blockedBy: [] };
  }

  // ── Check 3: Blocking delegations ────────────────────────────────────────
  const blockingDelegations = delegations.filter(d =>
    d.parentActionId === actionId &&
    !isDelegationNonBlocking(d),
  );
  if (blockingDelegations.length > 0) {
    for (const d of blockingDelegations) {
      const label = `Delegación ${d.reason} a ${d.targetAgentId} en estado ${d.status}`;
      reasons.push(label);
      blockedBy.push(d.id);
    }
    const hasFinancial = blockingDelegations.some(d => d.reason === "financial_impact_review");
    return {
      actionId,
      readiness: hasFinancial ? "waiting_delegation" : "waiting_delegation",
      reasons,
      blockedBy,
    };
  }

  // ── Check 4: Dependency graph blockers ────────────────────────────────────
  const node = graph.nodes.get(actionId);
  if (node) {
    const unresolvedDeps = node.outEdges.filter(depId => {
      const dep = graph.nodes.get(depId);
      if (!dep) return false;
      return !["completed", "rejected", "canceled", "expired", "failed"].includes(dep.status);
    });
    if (unresolvedDeps.length > 0) {
      for (const depId of unresolvedDeps) {
        const dep = graph.nodes.get(depId);
        reasons.push(`Dependencia sin resolver: ${dep?.label ?? depId}`);
        blockedBy.push(depId);
      }
      return { actionId, readiness: "blocked", reasons, blockedBy };
    }
  }

  // ── Check 5: Ready ────────────────────────────────────────────────────────
  if (envelope.agentStatus === "approved") {
    return { actionId, readiness: "ready", reasons: ["Aprobada — lista para ejecución."], blockedBy: [] };
  }

  // Suggested or other non-terminal — waiting for a decision
  return {
    actionId,
    readiness: "waiting_approval",
    reasons:   ["En estado sugerido o propuesto — pendiente de acción."],
    blockedBy: [],
  };
}

// ── Plan step readiness ───────────────────────────────────────────────────────

export interface StepReadinessResult {
  stepId:    string;
  readiness: ReadinessStatus;
  reasons:   string[];
}

/**
 * Evaluates whether a plan step can proceed based on its dependencies.
 */
export function evaluatePlanStepReadiness(
  step:       PlanStep,
  allSteps:   PlanStep[],
): StepReadinessResult {
  const reasons: string[] = [];

  // Check if all dependency steps are completed
  const pendingDeps = step.dependsOnStepIds.filter(depId => {
    const dep = allSteps.find(s => s.id === depId);
    return dep && dep.status !== "completed" && dep.status !== "skipped";
  });

  if (pendingDeps.length > 0) {
    const depLabels = pendingDeps.map(depId => {
      const dep = allSteps.find(s => s.id === depId);
      return dep?.title ?? depId;
    });
    reasons.push(`Esperando pasos previos: ${depLabels.join(", ")}`);
    return { stepId: step.id, readiness: "waiting_delegation", reasons };
  }

  if (step.status === "blocked") {
    return { stepId: step.id, readiness: "blocked", reasons: ["Paso bloqueado explícitamente."] };
  }

  if (step.status === "failed") {
    return { stepId: step.id, readiness: "failed_dependency", reasons: ["Paso fallido."] };
  }

  if (step.requiredApproval && step.status !== "completed") {
    return { stepId: step.id, readiness: "waiting_approval", reasons: ["Requiere aprobación."] };
  }

  return { stepId: step.id, readiness: "ready", reasons: ["Paso listo."] };
}

// ── Readiness summary ─────────────────────────────────────────────────────────

export interface ReadinessSummary {
  total:              number;
  ready:              number;
  waitingApproval:    number;
  waitingDelegation:  number;
  waitingData:        number;
  blocked:            number;
  failedDependency:   number;
  readinessByAction:  ActionReadinessResult[];
}

export function summarizeReadiness(
  envelopes:   ActionEnvelope[],
  delegations: AgentDelegation[],
  graph:       DependencyGraph,
): ReadinessSummary {
  const results = envelopes.map(e =>
    evaluateActionReadiness(e, delegations, graph),
  );

  const counts = {
    ready:             0,
    waitingApproval:   0,
    waitingDelegation: 0,
    waitingData:       0,
    blocked:           0,
    failedDependency:  0,
  };

  for (const r of results) {
    switch (r.readiness) {
      case "ready":               counts.ready++;              break;
      case "waiting_approval":    counts.waitingApproval++;    break;
      case "waiting_delegation":  counts.waitingDelegation++;  break;
      case "waiting_data":        counts.waitingData++;        break;
      case "blocked":             counts.blocked++;            break;
      case "failed_dependency":   counts.failedDependency++;   break;
    }
  }

  return {
    total: envelopes.length,
    ...counts,
    readinessByAction: results,
  };
}
