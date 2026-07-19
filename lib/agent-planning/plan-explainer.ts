/**
 * lib/agent-planning/plan-explainer.ts
 *
 * Agentik Runtime Planning — Deterministic Plan Explainer
 *
 * Generates human-readable operational explanations for plans:
 * why the plan exists, what blocks it, what comes next,
 * which agent must act, which module is affected.
 *
 * NO LLM. NO templates with dynamic prompts.
 * Pure deterministic string composition.
 *
 * Sprint: AGENTIK-AGENT-DEPENDENCY-PLANNING-01
 */

import type { OperationalPlan, PlanStep } from "./planning-types";
import type { AgentDelegation }           from "@/lib/agent-orchestration/delegation-types";

// ── Agent labels ──────────────────────────────────────────────────────────────

const AGENT_LABELS: Record<string, string> = {
  david_commercial: "David",
  diego_finance:    "Diego",
  luca_marketing:   "Luca",
  mila_collections: "Mila",
  agentik_copilot:  "Agentik Copilot",
};
function agentLabel(id: string): string {
  return AGENT_LABELS[id] ?? id;
}

// ── Status labels ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  draft:            "Borrador",
  waiting_approval: "Esperando aprobación",
  partially_ready:  "Parcialmente listo",
  ready:            "Listo para ejecutar",
  blocked:          "Bloqueado",
  executing:        "En ejecución",
  completed:        "Completado",
  failed:           "Fallido",
  canceled:         "Cancelado",
};

// ── Explainer: why does this plan exist? ─────────────────────────────────────

export function explainPlanOrigin(plan: OperationalPlan): string {
  const agents = [...new Set(plan.agentsInvolved)].map(agentLabel).join(" y ");
  const modules = [...new Set(plan.modulesAffected)].join(", ");

  if (plan.rootActionId) {
    return `Este plan fue generado por una acción de ${agents} en ${modules}. Agrupa ${plan.steps.length} paso${plan.steps.length !== 1 ? "s" : ""} necesarios para resolverla.`;
  }
  return `Este plan operacional cubre la coordinación entre ${agents} en los módulos ${modules}.`;
}

// ── Explainer: what blocks this plan? ────────────────────────────────────────

export function explainPlanBlockers(plan: OperationalPlan): string {
  if (plan.blockers.length === 0) {
    return "Sin bloqueos activos.";
  }
  const top = plan.blockers[0]!;
  return `Este plan está bloqueado porque: ${top.reason} Para desbloquearlo: ${top.suggestedResolution}`;
}

// ── Explainer: what is the next step? ────────────────────────────────────────

export function explainNextStep(plan: OperationalPlan): string {
  const ready = plan.steps.find(s => s.readiness === "ready" && s.status !== "completed");
  if (ready) {
    return `El siguiente paso es "${ready.title}" (${agentLabel(ready.agentId)}) en ${ready.moduleId}.`;
  }

  const waiting = plan.steps.find(s => s.readiness === "waiting_approval");
  if (waiting) {
    return `El siguiente paso requiere aprobación: "${waiting.title}".`;
  }

  const blocked = plan.steps.find(s => s.readiness === "blocked" || s.readiness === "waiting_delegation");
  if (blocked) {
    return `El siguiente paso "${blocked.title}" está esperando resolución de dependencias.`;
  }

  if (plan.steps.every(s => s.status === "completed")) {
    return "Todos los pasos completados.";
  }

  return plan.recommendedNextStep || "Revisar el estado de los pasos en el Approval Center.";
}

// ── Explainer: which agent must act? ─────────────────────────────────────────

export function explainResponsibleAgent(plan: OperationalPlan): string {
  // Find the first ready or waiting-approval step
  const actionable = plan.steps.find(s =>
    (s.readiness === "ready" || s.readiness === "waiting_approval") &&
    s.status !== "completed",
  );
  if (actionable) {
    return `${agentLabel(actionable.agentId)} debe actuar primero.`;
  }

  // Otherwise the most referenced agent
  const agentCount = new Map<string, number>();
  for (const s of plan.steps) {
    agentCount.set(s.agentId, (agentCount.get(s.agentId) ?? 0) + 1);
  }
  const topAgent = [...agentCount.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topAgent) return `${agentLabel(topAgent[0])} es el agente principal en este plan.`;

  return "No hay agente responsable identificado.";
}

// ── Explainer: what's needed to unblock? ─────────────────────────────────────

export function explainUnblockPath(
  plan:        OperationalPlan,
  delegations: AgentDelegation[],
): string {
  if (plan.status !== "blocked" && plan.status !== "waiting_approval" && plan.status !== "partially_ready") {
    return STATUS_LABELS[plan.status] ?? plan.status;
  }

  // Find blocking delegations
  const blockingDels = delegations.filter(d =>
    plan.steps.some(s => s.delegationId === d.id) &&
    !["completed", "rejected", "canceled", "expired"].includes(d.status),
  );

  if (blockingDels.length > 0) {
    const reasons = blockingDels.map(d =>
      `delegación "${d.reason}" de ${agentLabel(d.sourceAgentId)} a ${agentLabel(d.targetAgentId)} (${d.status})`,
    );
    return `Para desbloquear este plan: resolver ${reasons.join("; ")}.`;
  }

  // Check conflicts
  if (plan.conflicts.length > 0) {
    return `Resolver el conflicto: ${plan.conflicts[0]!.description}`;
  }

  // Check blockers
  if (plan.blockers.length > 0) {
    return plan.blockers[0]!.suggestedResolution;
  }

  return "Revisar los pasos pendientes y aprobar los que correspondan.";
}

// ── Full plan explanation ─────────────────────────────────────────────────────

export interface PlanExplanation {
  origin:          string;
  status:          string;
  blockers:        string;
  nextStep:        string;
  responsibleAgent: string;
  unblockPath:     string;
  confidence:      string;
}

export function explainPlan(
  plan:        OperationalPlan,
  delegations: AgentDelegation[],
): PlanExplanation {
  return {
    origin:           explainPlanOrigin(plan),
    status:           `Estado actual: ${STATUS_LABELS[plan.status] ?? plan.status}`,
    blockers:         explainPlanBlockers(plan),
    nextStep:         explainNextStep(plan),
    responsibleAgent: explainResponsibleAgent(plan),
    unblockPath:      explainUnblockPath(plan, delegations),
    confidence:       `Confianza del plan: ${Math.round(plan.confidence * 100)}%`,
  };
}

// ── Step-level explainer ──────────────────────────────────────────────────────

export function explainStep(
  step:     PlanStep,
  allSteps: PlanStep[],
): string {
  if (step.status === "completed") {
    return `"${step.title}" — completado.`;
  }
  if (step.readiness === "ready") {
    return `"${step.title}" — listo para ejecutar por ${agentLabel(step.agentId)}.`;
  }
  if (step.readiness === "waiting_approval") {
    return `"${step.title}" — esperando aprobación humana.`;
  }
  if (step.readiness === "waiting_delegation") {
    const deps = step.dependsOnStepIds.map(depId => {
      const dep = allSteps.find(s => s.id === depId);
      return `"${dep?.title ?? depId}"`;
    });
    return `"${step.title}" — bloqueado por: ${deps.join(", ")}.`;
  }
  if (step.readiness === "blocked") {
    return `"${step.title}" — bloqueado. Intervención requerida.`;
  }
  return `"${step.title}" — ${step.summary}`;
}
