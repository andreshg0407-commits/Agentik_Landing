// AGENTIK-STRATEGIC-PLANNING-01 — Phase 25: Repository Contract

import type {
  StrategicPlan,
  StrategicObjective,
  StrategicInitiative,
  StrategicMilestone,
  StrategicRoadmap,
  PlanningStatus,
  PlanningPriority,
} from "./strategic-planning-types";

// ── Repository interface ───────────────────────────────────────────────────────

export interface StrategicPlanningRepository {
  // Plans
  savePlan(plan: StrategicPlan): Promise<void>;
  getPlan(orgSlug: string, planId: string): Promise<StrategicPlan | null>;
  queryPlans(orgSlug: string, filters?: { status?: PlanningStatus; priority?: PlanningPriority }): Promise<StrategicPlan[]>;
  archivePlan(orgSlug: string, planId: string): Promise<void>;

  // Objectives
  saveObjective(objective: StrategicObjective): Promise<void>;
  getObjective(orgSlug: string, objectiveId: string): Promise<StrategicObjective | null>;
  queryObjectives(orgSlug: string, filters?: { status?: PlanningStatus; priority?: PlanningPriority }): Promise<StrategicObjective[]>;

  // Initiatives
  saveInitiative(initiative: StrategicInitiative): Promise<void>;
  getInitiative(orgSlug: string, initiativeId: string): Promise<StrategicInitiative | null>;
  queryInitiatives(orgSlug: string, filters?: { objectiveId?: string; priority?: PlanningPriority }): Promise<StrategicInitiative[]>;

  // Milestones
  saveMilestone(milestone: StrategicMilestone): Promise<void>;
  getMilestone(orgSlug: string, milestoneId: string): Promise<StrategicMilestone | null>;
  queryMilestones(orgSlug: string, filters?: { initiativeId?: string }): Promise<StrategicMilestone[]>;

  // Roadmaps
  saveRoadmap(roadmap: StrategicRoadmap): Promise<void>;
  getRoadmap(orgSlug: string, roadmapId: string): Promise<StrategicRoadmap | null>;
  queryRoadmaps(orgSlug: string): Promise<StrategicRoadmap[]>;
}

// ── In-memory implementation ───────────────────────────────────────────────────

export class InMemoryStrategicPlanningRepository implements StrategicPlanningRepository {
  private readonly _plans       = new Map<string, StrategicPlan>();
  private readonly _objectives  = new Map<string, StrategicObjective>();
  private readonly _initiatives = new Map<string, StrategicInitiative>();
  private readonly _milestones  = new Map<string, StrategicMilestone>();
  private readonly _roadmaps    = new Map<string, StrategicRoadmap>();

  async savePlan(plan: StrategicPlan): Promise<void> {
    this._plans.set(`${plan.orgSlug}::${plan.id}`, plan);
  }

  async getPlan(orgSlug: string, planId: string): Promise<StrategicPlan | null> {
    return this._plans.get(`${orgSlug}::${planId}`) ?? null;
  }

  async queryPlans(orgSlug: string, filters?: { status?: PlanningStatus; priority?: PlanningPriority }): Promise<StrategicPlan[]> {
    return Array.from(this._plans.values())
      .filter((p) => p.orgSlug === orgSlug)
      .filter((p) => !filters?.status   || p.status   === filters.status)
      .filter((p) => !filters?.priority || p.priority === filters.priority);
  }

  async archivePlan(orgSlug: string, planId: string): Promise<void> {
    const key  = `${orgSlug}::${planId}`;
    const plan = this._plans.get(key);
    if (plan) this._plans.set(key, { ...plan, status: "ARCHIVED" });
  }

  async saveObjective(objective: StrategicObjective): Promise<void> {
    this._objectives.set(`${objective.orgSlug}::${objective.id}`, objective);
  }

  async getObjective(orgSlug: string, objectiveId: string): Promise<StrategicObjective | null> {
    return this._objectives.get(`${orgSlug}::${objectiveId}`) ?? null;
  }

  async queryObjectives(orgSlug: string, filters?: { status?: PlanningStatus; priority?: PlanningPriority }): Promise<StrategicObjective[]> {
    return Array.from(this._objectives.values())
      .filter((o) => o.orgSlug === orgSlug)
      .filter((o) => !filters?.status   || o.status   === filters.status)
      .filter((o) => !filters?.priority || o.priority === filters.priority);
  }

  async saveInitiative(initiative: StrategicInitiative): Promise<void> {
    this._initiatives.set(`${initiative.orgSlug}::${initiative.id}`, initiative);
  }

  async getInitiative(orgSlug: string, initiativeId: string): Promise<StrategicInitiative | null> {
    return this._initiatives.get(`${orgSlug}::${initiativeId}`) ?? null;
  }

  async queryInitiatives(orgSlug: string, filters?: { objectiveId?: string; priority?: PlanningPriority }): Promise<StrategicInitiative[]> {
    return Array.from(this._initiatives.values())
      .filter((i) => i.orgSlug === orgSlug)
      .filter((i) => !filters?.objectiveId || i.objectiveId === filters.objectiveId)
      .filter((i) => !filters?.priority    || i.priority    === filters.priority);
  }

  async saveMilestone(milestone: StrategicMilestone): Promise<void> {
    this._milestones.set(`${milestone.orgSlug}::${milestone.id}`, milestone);
  }

  async getMilestone(orgSlug: string, milestoneId: string): Promise<StrategicMilestone | null> {
    return this._milestones.get(`${orgSlug}::${milestoneId}`) ?? null;
  }

  async queryMilestones(orgSlug: string, filters?: { initiativeId?: string }): Promise<StrategicMilestone[]> {
    return Array.from(this._milestones.values())
      .filter((m) => m.orgSlug === orgSlug)
      .filter((m) => !filters?.initiativeId || m.initiativeId === filters.initiativeId);
  }

  async saveRoadmap(roadmap: StrategicRoadmap): Promise<void> {
    this._roadmaps.set(`${roadmap.orgSlug}::${roadmap.id}`, roadmap);
  }

  async getRoadmap(orgSlug: string, roadmapId: string): Promise<StrategicRoadmap | null> {
    return this._roadmaps.get(`${orgSlug}::${roadmapId}`) ?? null;
  }

  async queryRoadmaps(orgSlug: string): Promise<StrategicRoadmap[]> {
    return Array.from(this._roadmaps.values()).filter((r) => r.orgSlug === orgSlug);
  }
}
