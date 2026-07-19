// AGENTIK-STRATEGIC-PLANNING-01 — Phase 24: Query Layer

import type {
  StrategicPlan,
  StrategicObjective,
  StrategicInitiative,
  StrategicMilestone,
  StrategicRoadmap,
  PlanningPriority,
  PlanningStatus,
  StrategicDomain,
} from "./strategic-planning-types";

// ── Plans ─────────────────────────────────────────────────────────────────────

export function getPlans(orgSlug: string, plans: StrategicPlan[]): StrategicPlan[] {
  return plans.filter((p) => p.orgSlug === orgSlug);
}

export function findPlansByStatus(
  orgSlug: string,
  plans:   StrategicPlan[],
  status:  PlanningStatus
): StrategicPlan[] {
  return plans.filter((p) => p.orgSlug === orgSlug && p.status === status);
}

export function findPlansByPriority(
  orgSlug:  string,
  plans:    StrategicPlan[],
  priority: PlanningPriority
): StrategicPlan[] {
  return plans.filter((p) => p.orgSlug === orgSlug && p.priority === priority);
}

export function sortPlansByScore(plans: StrategicPlan[]): StrategicPlan[] {
  return [...plans].sort((a, b) => (b.planScore ?? 0) - (a.planScore ?? 0));
}

// ── Objectives ────────────────────────────────────────────────────────────────

export function getObjectives(
  orgSlug:    string,
  objectives: StrategicObjective[]
): StrategicObjective[] {
  return objectives.filter((o) => o.orgSlug === orgSlug);
}

export function findObjectivesByDomain(
  orgSlug:    string,
  objectives: StrategicObjective[],
  domain:     StrategicDomain
): StrategicObjective[] {
  return objectives.filter((o) => o.orgSlug === orgSlug && o.domain === domain);
}

export function findObjectivesByPriority(
  orgSlug:    string,
  objectives: StrategicObjective[],
  priority:   PlanningPriority
): StrategicObjective[] {
  return objectives.filter((o) => o.orgSlug === orgSlug && o.priority === priority);
}

// ── Initiatives ───────────────────────────────────────────────────────────────

export function getInitiatives(
  orgSlug:     string,
  initiatives: StrategicInitiative[]
): StrategicInitiative[] {
  return initiatives.filter((i) => i.orgSlug === orgSlug);
}

export function getInitiativesForObjective(
  orgSlug:     string,
  objectiveId: string,
  initiatives: StrategicInitiative[]
): StrategicInitiative[] {
  return initiatives.filter((i) => i.orgSlug === orgSlug && i.objectiveId === objectiveId);
}

export function findInitiativesByPriority(
  orgSlug:     string,
  initiatives: StrategicInitiative[],
  priority:    PlanningPriority
): StrategicInitiative[] {
  return initiatives.filter((i) => i.orgSlug === orgSlug && i.priority === priority);
}

export function sortInitiativesByScore(initiatives: StrategicInitiative[]): StrategicInitiative[] {
  return [...initiatives].sort((a, b) => b.impactScore - a.impactScore);
}

// ── Milestones ────────────────────────────────────────────────────────────────

export function getMilestones(
  orgSlug:    string,
  milestones: StrategicMilestone[]
): StrategicMilestone[] {
  return milestones.filter((m) => m.orgSlug === orgSlug);
}

export function getMilestonesForInitiative(
  orgSlug:      string,
  initiativeId: string,
  milestones:   StrategicMilestone[]
): StrategicMilestone[] {
  return milestones.filter((m) => m.orgSlug === orgSlug && m.initiativeId === initiativeId);
}

// ── Roadmaps ─────────────────────────────────────────────────────────────────

export function getRoadmaps(
  orgSlug:  string,
  roadmaps: StrategicRoadmap[]
): StrategicRoadmap[] {
  return roadmaps.filter((r) => r.orgSlug === orgSlug);
}

export function findRoadmapsByPriority(
  orgSlug:  string,
  roadmaps: StrategicRoadmap[],
  priority: PlanningPriority
): StrategicRoadmap[] {
  // StrategicRoadmap has no priority field — filter by confidence level as proxy
  return roadmaps.filter((r) => r.orgSlug === orgSlug);
}

export function sortRoadmapsByScore(roadmaps: StrategicRoadmap[]): StrategicRoadmap[] {
  return [...roadmaps].sort((a, b) => b.confidenceScore - a.confidenceScore);
}

// ── Summary stats ─────────────────────────────────────────────────────────────

export function getPlanningStats(
  orgSlug:     string,
  plans:       StrategicPlan[],
  objectives:  StrategicObjective[],
  initiatives: StrategicInitiative[],
  milestones:  StrategicMilestone[]
): {
  totalPlans:       number;
  activePlans:      number;
  totalObjectives:  number;
  totalInitiatives: number;
  totalMilestones:  number;
  criticalItems:    number;
} {
  const p = plans.filter((x) => x.orgSlug === orgSlug);
  const o = objectives.filter((x) => x.orgSlug === orgSlug);
  const i = initiatives.filter((x) => x.orgSlug === orgSlug);
  const m = milestones.filter((x) => x.orgSlug === orgSlug);

  return {
    totalPlans:       p.length,
    activePlans:      p.filter((x) => x.status === "ACTIVE").length,
    totalObjectives:  o.length,
    totalInitiatives: i.length,
    totalMilestones:  m.length,
    criticalItems:    [
      ...p.filter((x) => x.priority === "CRITICAL"),
      ...o.filter((x) => x.priority === "CRITICAL"),
      ...i.filter((x) => x.priority === "CRITICAL"),
    ].length,
  };
}
