// AGENTIK-STRATEGIC-PLANNING-01 — Phase 28: Dashboard Contract
// Pure domain types + builders. Not server-only. No Prisma. No AI.

import type {
  StrategicPlan,
  StrategicObjective,
  StrategicInitiative,
  StrategicMilestone,
  StrategicRoadmap,
  StrategicRisk,
  StrategicOpportunity,
  PlanningStatus,
  PlanningPriority,
} from "./strategic-planning-types";

// ── Card ──────────────────────────────────────────────────────────────────────

export interface StrategicPlanSummaryCard {
  readonly planId:            string;
  readonly title:             string;
  readonly status:            PlanningStatus;
  readonly priority:          PlanningPriority;
  readonly planScore:         number;
  readonly objectiveCount:    number;
  readonly initiativeCount:   number;
  readonly milestoneCount:    number;
  readonly riskCount:         number;
  readonly opportunityCount:  number;
  readonly criticalRiskCount: number;
  readonly confidenceScore:   number;
  readonly alignmentScore:    number;
  readonly riskCoverage:      number;
  readonly createdAt:         string;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export interface StrategicPlanningDashboard {
  readonly orgSlug:              string;
  readonly plans:                StrategicPlanSummaryCard[];
  readonly activePlanCount:      number;
  readonly criticalPlanCount:    number;
  readonly totalObjectives:      number;
  readonly totalInitiatives:     number;
  readonly totalMilestones:      number;
  readonly totalRisks:           number;
  readonly totalOpportunities:   number;
  readonly criticalRisks:        number;
  readonly planningScore:        number;             // 0–1 aggregate
  readonly executionReadiness:   number;             // 0–1
  readonly riskCoverage:         number;             // 0–1
  readonly strategicAlignment:   number;             // 0–1
  readonly topPriorityPlans:     StrategicPlanSummaryCard[];
  readonly recentObjectives:     StrategicObjective[];
  readonly recentInitiatives:    StrategicInitiative[];
  readonly criticalRiskItems:    StrategicRisk[];
  readonly topOpportunities:     StrategicOpportunity[];
  readonly generatedAt:          string;
}

// ── Builders ──────────────────────────────────────────────────────────────────

export function buildStrategicPlanSummaryCard(plan: StrategicPlan): StrategicPlanSummaryCard {
  return {
    planId:            plan.id,
    title:             plan.title,
    status:            plan.status,
    priority:          plan.priority,
    planScore:         plan.planScore,
    objectiveCount:    plan.objectives.length,
    initiativeCount:   plan.initiatives.length,
    milestoneCount:    plan.milestones.length,
    riskCount:         plan.risks.length,
    opportunityCount:  plan.opportunities.length,
    criticalRiskCount: plan.risks.filter((r) => r.level === "CRITICAL").length,
    confidenceScore:   plan.confidenceScore,
    alignmentScore:    plan.alignmentScore,
    riskCoverage:      plan.riskCoverage,
    createdAt:         plan.createdAt,
  };
}

export function buildStrategicPlanningDashboard(
  orgSlug:   string,
  plans:     StrategicPlan[],
  objectives?: StrategicObjective[],
  initiatives?: StrategicInitiative[],
  milestones?: StrategicMilestone[],
  roadmaps?: StrategicRoadmap[]
): StrategicPlanningDashboard {
  const cards        = plans.map(buildStrategicPlanSummaryCard);
  const active       = plans.filter((p) => p.status === "ACTIVE");
  const critical     = plans.filter((p) => p.priority === "CRITICAL");
  const allRisks     = plans.flatMap((p) => p.risks);
  const allOpps      = plans.flatMap((p) => p.opportunities);
  const criticalRisks = allRisks.filter((r) => r.level === "CRITICAL");

  const avgScore     = plans.length === 0 ? 0
    : Math.round(plans.reduce((s, p) => s + p.planScore, 0) / plans.length * 100) / 100;
  const avgAlignment = plans.length === 0 ? 0
    : Math.round(plans.reduce((s, p) => s + p.alignmentScore, 0) / plans.length * 100) / 100;
  const avgCoverage  = plans.length === 0 ? 0
    : Math.round(plans.reduce((s, p) => s + p.riskCoverage, 0) / plans.length * 100) / 100;
  const execReadiness = plans.length === 0 ? 0
    : Math.round(plans.reduce((s, p) => s + p.confidenceScore, 0) / plans.length * 100) / 100;

  const topPriority = [...cards]
    .sort((a, b) => b.planScore - a.planScore)
    .slice(0, 5);

  const recentObjs = (objectives ?? plans.flatMap((p) => p.objectives))
    .filter((o) => o.orgSlug === orgSlug)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  const recentInits = (initiatives ?? plans.flatMap((p) => p.initiatives))
    .filter((i) => i.orgSlug === orgSlug)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  const topOpps = [...allOpps]
    .sort((a, b) => b.captureScore - a.captureScore)
    .slice(0, 5);

  return {
    orgSlug,
    plans:              cards,
    activePlanCount:    active.length,
    criticalPlanCount:  critical.length,
    totalObjectives:    plans.reduce((s, p) => s + p.objectives.length, 0),
    totalInitiatives:   plans.reduce((s, p) => s + p.initiatives.length, 0),
    totalMilestones:    plans.reduce((s, p) => s + p.milestones.length, 0),
    totalRisks:         allRisks.length,
    totalOpportunities: allOpps.length,
    criticalRisks:      criticalRisks.length,
    planningScore:      avgScore,
    executionReadiness: execReadiness,
    riskCoverage:       avgCoverage,
    strategicAlignment: avgAlignment,
    topPriorityPlans:   topPriority,
    recentObjectives:   recentObjs,
    recentInitiatives:  recentInits,
    criticalRiskItems:  criticalRisks.slice(0, 5),
    topOpportunities:   topOpps,
    generatedAt:        new Date().toISOString(),
  };
}

export function buildEmptyStrategicPlanningDashboard(orgSlug: string): StrategicPlanningDashboard {
  return {
    orgSlug,
    plans:              [],
    activePlanCount:    0,
    criticalPlanCount:  0,
    totalObjectives:    0,
    totalInitiatives:   0,
    totalMilestones:    0,
    totalRisks:         0,
    totalOpportunities: 0,
    criticalRisks:      0,
    planningScore:      0,
    executionReadiness: 0,
    riskCoverage:       0,
    strategicAlignment: 0,
    topPriorityPlans:   [],
    recentObjectives:   [],
    recentInitiatives:  [],
    criticalRiskItems:  [],
    topOpportunities:   [],
    generatedAt:        new Date().toISOString(),
  };
}
