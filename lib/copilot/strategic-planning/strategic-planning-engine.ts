// AGENTIK-STRATEGIC-PLANNING-01
// Phase 10 — Strategic Planning Engine
// Main pipeline: Context → Objectives → Initiatives → Dependencies → Milestones
//               → Risks → Opportunities → Roadmap → Plan → Narrative → Audit
// NEVER executes. NEVER assigns tasks. Fail-closed. Multi-tenant.

import type {
  StrategicPlanningResult, StrategicPlanningContext, StrategicPlan,
  StrategicObjective, StrategicInitiative, StrategicDomain, PlanningHorizon,
} from "./strategic-planning-types";
import { planningConfidenceFromScore, planningPriorityFromScore } from "./strategic-planning-types";
import { generatePlanId } from "./strategic-planning-identity";
import { buildObjective, rankObjectives, aggregateObjectiveScore } from "./objective-engine";
import { createInitiative, rankInitiatives } from "./initiative-engine";
import { createDependency, validateAllDependencies } from "./dependency-engine";
import { buildDefaultMilestonesForInitiative } from "./milestone-engine";
import { buildPlanningRisks, rankPlanningRisks, computeRiskCoverage } from "./risk-planning-engine";
import { buildPlanningOpportunities, rankOpportunities } from "./opportunity-planning-engine";
import { buildRoadmap } from "./roadmap-engine";
import { buildPlanningNarrative } from "./planning-narrative-engine";

// ── Engine input ──────────────────────────────────────────────────────────────

export interface StrategicPlanningEngineInput {
  readonly orgSlug:   string;
  readonly context:   StrategicPlanningContext;
  readonly title?:    string;
  readonly description?: string;
}

// ── Main engine ───────────────────────────────────────────────────────────────

export function runStrategicPlanning(input: StrategicPlanningEngineInput): StrategicPlanningResult {
  const runId = generatePlanId();
  const start = Date.now();
  const { orgSlug } = input;

  try {
    // Guard: tenant isolation
    if (!orgSlug || orgSlug.trim().length === 0) {
      return _fail(runId, orgSlug, "orgSlug is required", start);
    }
    if (input.context.orgSlug !== orgSlug) {
      return _fail(runId, orgSlug, `Tenant boundary: context.orgSlug "${input.context.orgSlug}" !== "${orgSlug}"`, start);
    }

    const domain   = input.context.domain;
    const horizon: PlanningHorizon = input.context.horizonOverride ?? "MEDIUM_TERM";
    const warnings: string[] = [];
    const limitations: string[] = [
      "Este plan es una propuesta estructurada — no constituye instrucción de ejecución",
      "Ninguna iniciativa o tarea será asignada automáticamente",
      "El plan requiere validación humana antes de cualquier acción",
    ];

    // 1. Build objectives
    const objectives = _buildObjectives(orgSlug, domain, horizon, input.context);
    if (objectives.length === 0) warnings.push("No objectives generated — plan quality is limited");

    // 2. Build initiatives from objectives
    const initiatives = _buildInitiatives(orgSlug, domain, objectives);

    // 3. Build dependencies
    const dependencies = _buildDependencies(orgSlug, initiatives);
    const depValidation = validateAllDependencies(dependencies);
    if (!depValidation.valid) warnings.push(...depValidation.warnings);

    // 4. Build milestones
    const milestones = initiatives.flatMap((i) => buildDefaultMilestonesForInitiative(i));

    // 5. Build risks
    const risks = rankPlanningRisks(buildPlanningRisks({ orgSlug, planId: runId, domain, initiatives }));

    // 6. Build opportunities
    const opportunities = rankOpportunities(buildPlanningOpportunities({ orgSlug, planId: runId, domain, objectives, initiatives }));

    // 7. Build roadmap
    const roadmap = buildRoadmap({
      orgSlug, planId: runId,
      title:       `Roadmap: ${input.title ?? domain}`,
      description: `Hoja de ruta estratégica para ${domain}.`,
      objectives, initiatives, milestones, dependencies, horizon,
    });

    // 8. Compute scores
    const objScore     = aggregateObjectiveScore(objectives);
    const riskCoverage = computeRiskCoverage(risks);
    const planScore    = Math.round((objScore * 0.40 + riskCoverage * 0.20 + (1 - Math.min(1, risks.filter((r) => r.level === "CRITICAL").length * 0.20)) * 0.40) * 100) / 100;

    // 9. Build narrative
    const narrative = buildPlanningNarrative({
      orgSlug, domain,
      objectives, initiatives, risks, opportunities, planScore,
      title: input.title ?? `Plan estratégico: ${domain}`,
    });

    const plan: StrategicPlan = {
      id:              runId,
      orgSlug,
      title:           input.title       ?? `Plan estratégico: ${domain}`,
      description:     input.description ?? `Plan estructurado para el dominio ${domain}.`,
      rationale:       narrative.rationale,
      domain,
      priority:        input.context.priorityOverride ?? planningPriorityFromScore(planScore),
      status:          "DRAFT",
      horizon,
      objectives,
      initiatives,
      milestones,
      dependencies,
      risks,
      opportunities,
      roadmap,
      narrative:       narrative.executive,
      planScore,
      confidence:      planningConfidenceFromScore(planScore),
      confidenceScore: planScore,
      alignmentScore:  objScore,
      riskCoverage,
      evidenceIds:     objectives.flatMap((o) => o.evidenceIds),
      sourceIds:       input.context.sourceRecommendationIds ?? [],
      suggestedOnly:   true,
      metadata:        { canonicalType: input.context.canonicalType, source: "PLANNING_ENGINE" },
      createdAt:       new Date().toISOString(),
    };

    return {
      status:     "OK",
      orgSlug,
      plan,
      runId,
      durationMs: Date.now() - start,
      warnings,
      limitations,
    };

  } catch (err) {
    return _fail(runId, orgSlug, err instanceof Error ? err.message : "Unknown error", start);
  }
}

// ── Tenant boundary ───────────────────────────────────────────────────────────

export function enforceStrategicPlanTenantBoundary(orgSlug: string, plan: StrategicPlan): void {
  if (plan.orgSlug !== orgSlug) {
    throw new Error(`Tenant boundary violation: plan belongs to "${plan.orgSlug}", not "${orgSlug}"`);
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _buildObjectives(
  orgSlug:  string,
  domain:   StrategicDomain,
  horizon:  PlanningHorizon,
  ctx:      StrategicPlanningContext
): StrategicObjective[] {
  const canonicalObjectives = _getCanonicalObjectives(orgSlug, domain, horizon, ctx.canonicalType);
  return rankObjectives(canonicalObjectives);
}

function _buildInitiatives(
  orgSlug:    string,
  domain:     StrategicDomain,
  objectives: StrategicObjective[]
): StrategicInitiative[] {
  const initiatives: StrategicInitiative[] = [];
  for (const obj of objectives.slice(0, 3)) {
    for (const def of _getCanonicalInitiatives(orgSlug, domain, obj)) {
      initiatives.push(def);
    }
  }
  return rankInitiatives(initiatives);
}

function _buildDependencies(orgSlug: string, initiatives: StrategicInitiative[]) {
  if (initiatives.length < 2) return [];
  return [
    createDependency({
      orgSlug,
      fromId:      initiatives[1]?.id ?? "",
      toId:        initiatives[0]?.id ?? "",
      type:        "REQUIRES",
      description: "La segunda iniciativa depende del avance de la primera.",
    }),
  ].filter((d) => d.fromId && d.toId);
}

function _getCanonicalObjectives(
  orgSlug: string, domain: StrategicDomain, horizon: PlanningHorizon,
  _type?: string
): StrategicObjective[] {
  return [
    buildObjective({ orgSlug, title: `Mejorar desempeño en ${domain}`, description: `Objetivo principal del plan en el dominio ${domain}.`, domain, priority: "HIGH", horizon, impactScore: 0.80, alignmentScore: 0.75, confidenceScore: 0.70 }),
    buildObjective({ orgSlug, title: `Reducir riesgos en ${domain}`, description: `Identificar y mitigar los principales riesgos del dominio.`, domain, priority: "HIGH", horizon, impactScore: 0.70, alignmentScore: 0.65, confidenceScore: 0.65 }),
    buildObjective({ orgSlug, title: `Capturar oportunidades en ${domain}`, description: `Identificar oportunidades de mejora no aprovechadas.`, domain, priority: "MEDIUM", horizon, impactScore: 0.65, alignmentScore: 0.60, confidenceScore: 0.60 }),
  ];
}

function _getCanonicalInitiatives(
  orgSlug: string, domain: StrategicDomain, obj: StrategicObjective
): StrategicInitiative[] {
  return [
    createInitiative({ orgSlug, objectiveId: obj.id, title: `Analizar situación actual — ${domain}`, description: "Diagnóstico profundo del estado actual.", type: "PROCESS_IMPROVEMENT", domain, priority: obj.priority, impactScore: 0.65, effortScore: 0.40, confidenceScore: 0.70 }),
    createInitiative({ orgSlug, objectiveId: obj.id, title: `Implementar mejoras prioritarias — ${domain}`, description: "Ejecución de las acciones de mayor impacto identificadas.", type: "PROCESS_IMPROVEMENT", domain, priority: obj.priority, impactScore: 0.80, effortScore: 0.60, confidenceScore: 0.65 }),
  ];
}

function _fail(runId: string, orgSlug: string, error: string, start: number): StrategicPlanningResult {
  return {
    status:     "FAILED",
    orgSlug,
    plan:       null,
    runId,
    durationMs: Date.now() - start,
    warnings:   [],
    limitations: [],
    error,
  };
}
