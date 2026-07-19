/**
 * lib/agent-planning/planning-engine.ts
 *
 * Agentik Runtime Planning — Main Planning Engine
 *
 * Generates OperationalPlan[] from ActionEnvelopes, AgentDelegations,
 * RuntimeMemoryNodes, and the RuntimeIntelligenceReport.
 *
 * Rules V1:
 *   1. Production + financial delegation → financial review plan
 *   2. Production + campaign risk → campaign/inventory coordination plan
 *   3. Financial + commercial → cash/production alignment plan
 *   4. Collections + liquidity → collection → cash → executive decision plan
 *
 * Deduplication: one plan per rootActionId (non-terminal).
 *
 * Sprint: AGENTIK-AGENT-DEPENDENCY-PLANNING-01
 */

import type { ActionEnvelope }           from "@/lib/agent-runtime/action-envelope";
import type { AgentDelegation }          from "@/lib/agent-orchestration/delegation-types";
import type { RuntimeMemoryNode }        from "@/lib/agent-memory/runtime-memory-types";
import type { RuntimeIntelligenceReport } from "@/lib/agent-intelligence/runtime-intelligence-types";
import type {
  OperationalPlan,
  PlanStep,
  PlanBlocker,
  PlanStatus,
  PlanStepStatus,
  ReadinessStatus,
  PlansSummary,
  PlansReport,
  DependencyGraph,
} from "./planning-types";
import type { RuntimeMemoryEdge }        from "@/lib/agent-memory/runtime-memory-types";
import { planId, stepId, blkId, depId } from "./planning-types";
import { evaluateActionReadiness }       from "./readiness-engine";
import { detectAllConflicts }            from "./conflict-engine";
import { explainNextStep }               from "./plan-explainer";
import { buildDependencyGraph }          from "./dependency-graph";

// ── Helpers ───────────────────────────────────────────────────────────────────

const AGENT_MODULES: Record<string, string> = {
  david_commercial: "comercial.maletas",
  diego_finance:    "finanzas.conciliacion",
  luca_marketing:   "marketing.studio",
  mila_collections: "comercial.cobranza",
};
function agentModule(id: string): string { return AGENT_MODULES[id] ?? id; }

const AGENT_LABELS: Record<string, string> = {
  david_commercial: "David",
  diego_finance:    "Diego",
  luca_marketing:   "Luca",
  mila_collections: "Mila",
};
function agentLabel(id: string): string { return AGENT_LABELS[id] ?? id; }

function derivePlanStatus(steps: PlanStep[]): PlanStatus {
  if (steps.length === 0) return "draft";
  if (steps.every(s => s.status === "completed"))  return "completed";
  if (steps.some(s => s.status === "failed"))       return "failed";
  if (steps.every(s => s.readiness === "ready"))    return "ready";
  if (steps.every(s => s.status === "blocked" || s.readiness === "blocked")) return "blocked";
  if (steps.some(s => s.readiness === "ready"))     return "partially_ready";
  if (steps.some(s => s.readiness === "waiting_approval")) return "waiting_approval";
  return "draft";
}

function makeStep(
  planId_: string,
  overrides: Partial<PlanStep> & Pick<PlanStep, "agentId" | "moduleId" | "stepType" | "title" | "summary">,
): PlanStep {
  return {
    id:               stepId(),
    planId:           planId_,
    actionId:         null,
    delegationId:     null,
    status:           "pending" as PlanStepStatus,
    dependsOnStepIds: [],
    blocksStepIds:    [],
    readiness:        "waiting_approval" as ReadinessStatus,
    requiredApproval: true,
    estimatedImpact:  "medium",
    ...overrides,
  };
}

function addBlocker(
  stepId:              string | null,
  reason:              string,
  suggestedResolution: string,
  blockedByAgentId:    string | null = null,
  blockedByModuleId:   string | null = null,
): PlanBlocker {
  return {
    id:                  blkId(),
    stepId,
    blockerType:         "pending_dependency",
    reason,
    blockedByAgentId,
    blockedByModuleId,
    suggestedResolution,
  };
}

// ── Rule 1: Production + financial delegation ─────────────────────────────────

function buildProductionFinancialPlan(
  envelope:    ActionEnvelope,
  delegations: AgentDelegation[],
  graph:       DependencyGraph,
  orgId:       string,
): OperationalPlan {
  const pid    = planId(envelope.agentActionId ?? envelope.actionTaskId);
  const aid    = envelope.agentActionId ?? envelope.actionTaskId ?? envelope.id;

  const reviewStep = makeStep(pid, {
    agentId:         "diego_finance",
    moduleId:        agentModule("diego_finance"),
    stepType:        "review",
    title:           `Revisión financiera — ${envelope.title}`,
    summary:         `Diego evalúa el impacto en flujo de caja de la propuesta de producción.`,
    actionId:        null,
    estimatedImpact: "high",
    readiness:       "waiting_delegation",
  });

  const approvalStep = makeStep(pid, {
    agentId:          "david_commercial",
    moduleId:         agentModule("david_commercial"),
    stepType:         "approval",
    title:            `Aprobación de producción — ${envelope.title}`,
    summary:          "Aprobación final de la propuesta de producción después de validación financiera.",
    actionId:         aid,
    dependsOnStepIds: [reviewStep.id],
    estimatedImpact:  "high",
    requiredApproval: true,
    readiness:        "waiting_delegation",
  });

  const execStep = makeStep(pid, {
    agentId:          "david_commercial",
    moduleId:         agentModule("david_commercial"),
    stepType:         "action",
    title:            `Ejecución — ${envelope.title}`,
    summary:          "Envío de solicitud de producción una vez aprobada.",
    actionId:         aid,
    dependsOnStepIds: [approvalStep.id],
    estimatedImpact:  "medium",
    requiredApproval: false,
    readiness:        "waiting_delegation",
  });

  const steps = [reviewStep, approvalStep, execStep];

  // Evaluate readiness from actual state
  const readiness = evaluateActionReadiness(envelope, delegations, graph);
  const hasFinancialDel = delegations.some(d =>
    d.parentActionId === aid &&
    d.reason === "financial_impact_review" &&
    !["completed", "rejected", "canceled"].includes(d.status),
  );

  if (hasFinancialDel) {
    reviewStep.readiness = "waiting_delegation";
    approvalStep.readiness = "waiting_delegation";
  } else if (readiness.readiness === "ready") {
    reviewStep.readiness = "ready";
  }

  const blockers: PlanBlocker[] = [];
  if (readiness.blockedBy.length > 0) {
    blockers.push(addBlocker(
      reviewStep.id,
      readiness.reasons[0] ?? "Bloqueo de dependencia",
      "Resolver las delegaciones pendientes y luego proceder con la aprobación de producción.",
      "diego_finance",
      agentModule("diego_finance"),
    ));
  }

  const status = derivePlanStatus(steps);
  const plan: OperationalPlan = {
    id:      pid,
    orgId,
    rootActionId: aid,
    title:   `Plan de producción: ${envelope.title}`,
    summary: `Producción propuesta por ${agentLabel("david_commercial")} que requiere validación financiera de ${agentLabel("diego_finance")}.`,
    status,
    priority: envelope.severity === "critical" ? "critical" : envelope.severity === "high" ? "high" : "medium",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    steps,
    dependencies: [
      { id: depId(), fromStepId: reviewStep.id, toStepId: approvalStep.id, dependencyType: "requires_financial_review", reason: "Aprobación requiere revisión financiera previa", resolved: false },
      { id: depId(), fromStepId: approvalStep.id, toStepId: execStep.id,  dependencyType: "requires_approval", reason: "Ejecución requiere aprobación", resolved: false },
    ],
    blockers,
    conflicts: [],
    recommendedNextStep: `Resolver la revisión financiera de ${agentLabel("diego_finance")} primero.`,
    confidence: 0.85,
    agentsInvolved: ["david_commercial", "diego_finance"],
    modulesAffected: [envelope.moduleKey, agentModule("diego_finance")],
  };
  plan.recommendedNextStep = explainNextStep(plan);
  return plan;
}

// ── Rule 2: Production + campaign risk ───────────────────────────────────────

function buildProductionCampaignPlan(
  envelope: ActionEnvelope,
  orgId:    string,
): OperationalPlan {
  const pid = planId(envelope.agentActionId ?? envelope.actionTaskId);
  const aid = envelope.agentActionId ?? envelope.actionTaskId ?? envelope.id;

  const coverageStep = makeStep(pid, {
    agentId:         "david_commercial",
    moduleId:        agentModule("david_commercial"),
    stepType:        "review",
    title:           "Validar cobertura de inventario",
    summary:         "David verifica que la cobertura de inventario sea suficiente antes de continuar con la campaña.",
    estimatedImpact: "high",
    readiness:       "waiting_approval",
  });

  const campaignStep = makeStep(pid, {
    agentId:          "luca_marketing",
    moduleId:         agentModule("luca_marketing"),
    stepType:         "decision",
    title:            "Revisar campaña activa",
    summary:          "Luca evalúa si la campaña activa debe pausarse o ajustarse dado el nivel de inventario.",
    dependsOnStepIds: [coverageStep.id],
    estimatedImpact:  "medium",
    readiness:        "waiting_delegation",
  });

  const decisionStep = makeStep(pid, {
    agentId:          "luca_marketing",
    moduleId:         agentModule("luca_marketing"),
    stepType:         "decision",
    title:            "Decidir pausa o ajuste de campaña",
    summary:          "Decisión final sobre pausar la campaña o ajustar el presupuesto de pauta.",
    actionId:         aid,
    dependsOnStepIds: [campaignStep.id],
    estimatedImpact:  "medium",
    requiredApproval: true,
    readiness:        "waiting_delegation",
  });

  const steps = [coverageStep, campaignStep, decisionStep];

  const plan: OperationalPlan = {
    id:      pid,
    orgId,
    rootActionId: aid,
    title:   `Plan cobertura/campaña: ${envelope.title}`,
    summary: `Coordinación entre ${agentLabel("david_commercial")} y ${agentLabel("luca_marketing")} para asegurar cobertura de inventario antes de escalar campañas.`,
    status:  derivePlanStatus(steps),
    priority: "medium",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    steps,
    dependencies: [
      { id: depId(), fromStepId: coverageStep.id, toStepId: campaignStep.id, dependencyType: "requires_inventory_review", reason: "Campaña depende de cobertura confirmada", resolved: false },
      { id: depId(), fromStepId: campaignStep.id, toStepId: decisionStep.id, dependencyType: "requires_human_decision", reason: "Decisión de pausa requiere validación manual", resolved: false },
    ],
    blockers: [],
    conflicts: [],
    recommendedNextStep: "Validar cobertura de inventario con David primero.",
    confidence: 0.75,
    agentsInvolved: ["david_commercial", "luca_marketing"],
    modulesAffected: [envelope.moduleKey, agentModule("luca_marketing")],
  };
  plan.recommendedNextStep = explainNextStep(plan);
  return plan;
}

// ── Rule 3: Collections + liquidity ──────────────────────────────────────────

function buildCollectionLiquidityPlan(
  envelopes:   ActionEnvelope[],
  delegations: AgentDelegation[],
  orgId:       string,
): OperationalPlan | null {
  const milaFailed = envelopes.filter(e =>
    String(e.sourceAgentId) === "mila_collections" &&
    (e.agentStatus === "failed" || e.agentStatus === "pending_approval"),
  );
  if (milaFailed.length === 0) return null;

  const pid = planId("mila_liquidity");
  const sample = milaFailed[0]!;

  const milaStep = makeStep(pid, {
    agentId:         "mila_collections",
    moduleId:        agentModule("mila_collections"),
    stepType:        "action",
    title:           `Priorizar cobranza (${milaFailed.length} casos)`,
    summary:         `Mila debe priorizar la gestión de los ${milaFailed.length} caso${milaFailed.length !== 1 ? "s" : ""} de cobranza pendiente${milaFailed.length !== 1 ? "s" : ""}.`,
    actionId:        sample.agentActionId ?? sample.actionTaskId,
    estimatedImpact: "high",
    readiness:       "ready",
  });

  const diegoStep = makeStep(pid, {
    agentId:          "diego_finance",
    moduleId:         agentModule("diego_finance"),
    stepType:         "review",
    title:            "Evaluar impacto en flujo de caja",
    summary:          "Diego revisa cómo los resultados de cobranza afectan el modelo de liquidez.",
    dependsOnStepIds: [milaStep.id],
    estimatedImpact:  "high",
    readiness:        "waiting_delegation",
  });

  const execDecision = makeStep(pid, {
    agentId:          "agentik_copilot",
    moduleId:         "agentik.control",
    stepType:         "decision",
    title:            "Recomendación ejecutiva",
    summary:          "Agentik Copilot genera recomendación para el operador sobre acciones de liquidez.",
    dependsOnStepIds: [diegoStep.id],
    estimatedImpact:  "critical",
    requiredApproval: true,
    readiness:        "waiting_delegation",
  });

  const steps = [milaStep, diegoStep, execDecision];

  const hasDelegs = delegations.some(d =>
    d.sourceAgentId === "mila_collections" &&
    !["completed", "rejected", "canceled"].includes(d.status),
  );

  milaStep.readiness = hasDelegs ? "waiting_delegation" : "ready";

  return {
    id:      pid,
    orgId,
    rootActionId: sample.agentActionId ?? sample.actionTaskId,
    title:   "Plan de liquidez: Cobranza → Caja → Decisión ejecutiva",
    summary: "Plan coordinado entre Mila (cobranza), Diego (caja) y Agentik para gestionar presión de liquidez.",
    status:  derivePlanStatus(steps),
    priority: "high",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    steps,
    dependencies: [
      { id: depId(), fromStepId: milaStep.id, toStepId: diegoStep.id, dependencyType: "requires_delegation", reason: "Evaluación financiera depende de resultados de cobranza", resolved: false },
      { id: depId(), fromStepId: diegoStep.id, toStepId: execDecision.id, dependencyType: "requires_human_decision", reason: "Recomendación ejecutiva requiere evaluación financiera", resolved: false },
    ],
    blockers:    [],
    conflicts:   [],
    recommendedNextStep: "Mila debe gestionar la cobranza pendiente primero.",
    confidence:  0.80,
    agentsInvolved:  ["mila_collections", "diego_finance", "agentik_copilot"],
    modulesAffected: [agentModule("mila_collections"), agentModule("diego_finance")],
  };
}

// ── Rule 4: Financial + commercial alignment ──────────────────────────────────

function buildFinancialCommercialPlan(
  memoryNodes: RuntimeMemoryNode[],
  envelopes:   ActionEnvelope[],
  orgId:       string,
): OperationalPlan | null {
  const diegoCritical = memoryNodes.filter(n =>
    n.agentId === "diego_finance" && n.severity === "critical",
  );
  const davidPending = envelopes.filter(e =>
    String(e.sourceAgentId) === "david_commercial" &&
    e.agentStatus === "pending_approval",
  );
  if (diegoCritical.length === 0 || davidPending.length === 0) return null;

  const pid = planId("diego_david_financial");

  const diegoStep = makeStep(pid, {
    agentId:         "diego_finance",
    moduleId:        agentModule("diego_finance"),
    stepType:        "review",
    title:           "Validar restricciones de caja",
    summary:         `Diego confirma el techo de caja disponible y su impacto en las ${davidPending.length} propuesta${davidPending.length !== 1 ? "s" : ""} de producción pendiente${davidPending.length !== 1 ? "s" : ""}.`,
    estimatedImpact: "critical",
    readiness:       "ready",
  });

  const davidStep = makeStep(pid, {
    agentId:          "david_commercial",
    moduleId:         agentModule("david_commercial"),
    stepType:         "decision",
    title:            "Revisar producción bajo restricción",
    summary:          `David ajusta las propuestas de producción considerando las restricciones financieras de Diego.`,
    dependsOnStepIds: [diegoStep.id],
    estimatedImpact:  "high",
    readiness:        "waiting_delegation",
  });

  const steps = [diegoStep, davidStep];

  return {
    id:      pid,
    orgId,
    rootActionId: null,
    title:   "Plan de alineación financiero-comercial",
    summary: `Coordinación entre ${agentLabel("diego_finance")} y ${agentLabel("david_commercial")} para alinear producción con restricciones de caja.`,
    status:  derivePlanStatus(steps),
    priority: "critical",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    steps,
    dependencies: [
      { id: depId(), fromStepId: diegoStep.id, toStepId: davidStep.id, dependencyType: "requires_financial_review", reason: "David necesita datos de caja antes de ajustar producción", resolved: false },
    ],
    blockers:    [],
    conflicts:   [],
    recommendedNextStep: "Diego debe confirmar las restricciones de caja primero.",
    confidence:  0.90,
    agentsInvolved:  ["diego_finance", "david_commercial"],
    modulesAffected: [agentModule("diego_finance"), agentModule("david_commercial")],
  };
}

// ── Main entry points ─────────────────────────────────────────────────────────

export function buildPlanFromAction(
  envelope:    ActionEnvelope,
  delegations: AgentDelegation[],
  memoryNodes: RuntimeMemoryNode[],
  graph:       DependencyGraph,
  orgId:       string,
): OperationalPlan | null {
  // Production + financial delegation rule
  if (
    String(envelope.sourceAgentId) === "david_commercial" &&
    (envelope.agentStatus === "pending_approval" || envelope.agentStatus === "approved")
  ) {
    const qty = typeof envelope.payloadSummary?.qty === "number" ? envelope.payloadSummary.qty : 0;
    if (qty > 0) {
      return buildProductionFinancialPlan(envelope, delegations, graph, orgId);
    }
  }

  return null;
}

export function buildOperationalPlans(
  orgId:        string,
  envelopes:    ActionEnvelope[],
  delegations:  AgentDelegation[],
  memoryNodes:  RuntimeMemoryNode[],
  graph:        DependencyGraph,
  report?:      RuntimeIntelligenceReport,
): OperationalPlan[] {
  void report; // Reserved for V2 — intelligence-driven plan triggers
  const plans: OperationalPlan[] = [];
  const usedRootActions = new Set<string>();

  // Rule 1: David production actions
  for (const e of envelopes) {
    if (String(e.sourceAgentId) !== "david_commercial") continue;
    if (!["pending_approval", "approved"].includes(e.agentStatus)) continue;
    const aid = e.agentActionId ?? e.actionTaskId ?? e.id;
    if (usedRootActions.has(aid)) continue;

    const qty = typeof e.payloadSummary?.qty === "number" ? e.payloadSummary.qty : 0;
    if (qty > 0) {
      plans.push(buildProductionFinancialPlan(e, delegations, graph, orgId));
      usedRootActions.add(aid);
      continue;
    }

    // Without qty — check for campaign risk
    const lucaActive = envelopes.some(le =>
      String(le.sourceAgentId) === "luca_marketing" &&
      ["approved", "executing"].includes(le.agentStatus),
    );
    if (lucaActive) {
      plans.push(buildProductionCampaignPlan(e, orgId));
      usedRootActions.add(aid);
    }
  }

  // Rule 2: Collection + liquidity
  const colPlan = buildCollectionLiquidityPlan(envelopes, delegations, orgId);
  if (colPlan) plans.push(colPlan);

  // Rule 3: Financial + commercial alignment
  const finPlan = buildFinancialCommercialPlan(memoryNodes, envelopes, orgId);
  if (finPlan) plans.push(finPlan);

  // Attach conflicts to each plan
  const allConflicts = detectAllConflicts(envelopes, delegations, memoryNodes, graph, plans);
  for (const plan of plans) {
    plan.conflicts = allConflicts.filter(c =>
      c.affectedAgentIds.some(a => plan.agentsInvolved.includes(a)) ||
      c.affectedStepIds.some(s => plan.steps.some(ps => ps.id === s)),
    );
    if (plan.conflicts.some(c => c.severity === "critical" || c.severity === "high")) {
      plan.status = "blocked";
    }
  }

  return prioritizePlans(plans);
}

export function prioritizePlans(plans: OperationalPlan[]): OperationalPlan[] {
  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return [...plans].sort((a, b) => (order[a.priority] ?? 4) - (order[b.priority] ?? 4));
}

export function summarizePlanState(plans: OperationalPlan[]): PlansSummary {
  const readyPlans        = plans.filter(p => p.status === "ready").length;
  const blockedPlans      = plans.filter(p => p.status === "blocked").length;
  const partiallyReady    = plans.filter(p => p.status === "partially_ready").length;
  const conflictsTotal    = plans.reduce((n, p) => n + p.conflicts.length, 0);
  const totalSteps        = plans.reduce((n, p) => n + p.steps.length, 0);
  const criticalBlockers  = plans.reduce((n, p) =>
    n + p.blockers.filter(b => b.blockerType === "pending_dependency").length, 0);

  return {
    totalPlans:          plans.length,
    readyPlans,
    blockedPlans,
    partiallyReadyPlans: partiallyReady,
    conflictsDetected:   conflictsTotal,
    cyclesDetected:      0, // Populated by graph externally
    orphanDependencies:  0,
    avgStepsPerPlan:     plans.length > 0 ? Math.round(totalSteps / plans.length) : 0,
    criticalBlockers,
  };
}

// ── Full plans report ─────────────────────────────────────────────────────────

export function buildPlansReport(
  orgId:       string,
  envelopes:   ActionEnvelope[],
  delegations: AgentDelegation[],
  memoryNodes: RuntimeMemoryNode[],
  memoryEdges: RuntimeMemoryEdge[],
  report?:     RuntimeIntelligenceReport,
): PlansReport {
  const graph  = buildDependencyGraph(envelopes, delegations, memoryNodes, memoryEdges);
  const plans  = buildOperationalPlans(orgId, envelopes, delegations, memoryNodes, graph, report);
  const allConflicts = detectAllConflicts(envelopes, delegations, memoryNodes, graph, plans);
  const summary = {
    ...summarizePlanState(plans),
    cyclesDetected:     graph.cycles.length,
    orphanDependencies: graph.orphanIds.length,
  };

  return {
    plans,
    readyPlans:   plans.filter(p => p.status === "ready" || p.status === "partially_ready"),
    blockedPlans: plans.filter(p => p.status === "blocked"),
    conflicts:    allConflicts,
    summary,
    generatedAt:  new Date().toISOString(),
  };
}
