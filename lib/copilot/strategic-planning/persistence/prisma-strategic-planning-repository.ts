// AGENTIK-STRATEGIC-PLANNING-01 — Phase 26: Prisma Repository Implementation
// Uses (prisma as any).modelName pattern until prisma generate is run.

import { prisma } from "@/lib/prisma";
import type { StrategicPlanningRepository } from "../strategic-planning-repository";
import type {
  StrategicPlan,
  StrategicObjective,
  StrategicInitiative,
  StrategicMilestone,
  StrategicRoadmap,
  PlanningStatus,
  PlanningPriority,
} from "../strategic-planning-types";

export class PrismaStrategicPlanningRepository implements StrategicPlanningRepository {

  // ── Plans ──────────────────────────────────────────────────────────────────

  async savePlan(plan: StrategicPlan): Promise<void> {
    const objectiveIds  = plan.objectives.map((o) => o.id);
    const initiativeIds = plan.initiatives.map((i) => i.id);
    const milestoneIds  = plan.milestones.map((m) => m.id);
    const roadmapId     = plan.roadmap?.id ?? null;
    const limitations   = (plan.metadata as any)?.limitations ?? [];

    await (prisma as any).strategicPlanRecord.upsert({
      where: { id: plan.id },
      create: {
        id:            plan.id,
        orgSlug:       plan.orgSlug,
        title:         plan.title,
        description:   plan.description,
        status:        plan.status,
        priority:      plan.priority,
        planScore:     plan.planScore ?? 0,
        suggestedOnly: plan.suggestedOnly,
        objectiveIds,
        initiativeIds,
        milestoneIds,
        roadmapId,
        evidenceIds:   plan.evidenceIds,
        limitations,
        metadata:      plan.metadata ?? {},
        createdAt:     plan.createdAt,
      },
      update: {
        title:         plan.title,
        description:   plan.description,
        status:        plan.status,
        priority:      plan.priority,
        planScore:     plan.planScore ?? 0,
        objectiveIds,
        initiativeIds,
        milestoneIds,
        roadmapId,
        evidenceIds:   plan.evidenceIds,
        limitations,
        metadata:      plan.metadata ?? {},
      },
    });
  }

  async getPlan(orgSlug: string, planId: string): Promise<StrategicPlan | null> {
    const record = await (prisma as any).strategicPlanRecord.findFirst({
      where: { id: planId, orgSlug },
    });
    return record ? (record as StrategicPlan) : null;
  }

  async queryPlans(orgSlug: string, filters?: { status?: PlanningStatus; priority?: PlanningPriority }): Promise<StrategicPlan[]> {
    const records = await (prisma as any).strategicPlanRecord.findMany({
      where: {
        orgSlug,
        ...(filters?.status   ? { status: filters.status }     : {}),
        ...(filters?.priority ? { priority: filters.priority } : {}),
      },
      orderBy: { planScore: "desc" },
    });
    return records as StrategicPlan[];
  }

  async archivePlan(orgSlug: string, planId: string): Promise<void> {
    await (prisma as any).strategicPlanRecord.updateMany({
      where: { id: planId, orgSlug },
      data:  { status: "ARCHIVED" },
    });
  }

  // ── Objectives ─────────────────────────────────────────────────────────────

  async saveObjective(objective: StrategicObjective): Promise<void> {
    await (prisma as any).strategicObjectiveRecord.upsert({
      where: { id: objective.id },
      create: {
        id:              objective.id,
        orgSlug:         objective.orgSlug,
        title:           objective.title,
        description:     objective.description,
        domain:          objective.domain,
        priority:        objective.priority,
        status:          objective.status,
        confidenceScore: objective.confidenceScore,
        impactScore:     objective.impactScore,
        alignmentScore:  objective.alignmentScore,
        evidenceIds:     objective.evidenceIds,
        metadata:        objective.metadata ?? {},
        createdAt:       objective.createdAt,
      },
      update: {
        title:           objective.title,
        description:     objective.description,
        status:          objective.status,
        priority:        objective.priority,
        confidenceScore: objective.confidenceScore,
        impactScore:     objective.impactScore,
        alignmentScore:  objective.alignmentScore,
        evidenceIds:     objective.evidenceIds,
        metadata:        objective.metadata ?? {},
      },
    });
  }

  async getObjective(orgSlug: string, objectiveId: string): Promise<StrategicObjective | null> {
    const record = await (prisma as any).strategicObjectiveRecord.findFirst({
      where: { id: objectiveId, orgSlug },
    });
    return record ? (record as StrategicObjective) : null;
  }

  async queryObjectives(orgSlug: string, filters?: { status?: PlanningStatus; priority?: PlanningPriority }): Promise<StrategicObjective[]> {
    const records = await (prisma as any).strategicObjectiveRecord.findMany({
      where: {
        orgSlug,
        ...(filters?.status   ? { status: filters.status }     : {}),
        ...(filters?.priority ? { priority: filters.priority } : {}),
      },
      orderBy: { impactScore: "desc" },
    });
    return records as StrategicObjective[];
  }

  // ── Initiatives ────────────────────────────────────────────────────────────

  async saveInitiative(initiative: StrategicInitiative): Promise<void> {
    await (prisma as any).strategicInitiativeRecord.upsert({
      where: { id: initiative.id },
      create: {
        id:              initiative.id,
        orgSlug:         initiative.orgSlug,
        objectiveId:     initiative.objectiveId,
        title:           initiative.title,
        description:     initiative.description,
        domain:          initiative.domain,
        type:            initiative.type,
        priority:        initiative.priority,
        status:          initiative.status,
        confidenceScore: initiative.confidenceScore,
        impactScore:     initiative.impactScore,
        effortScore:     initiative.effortScore,
        suggestedOnly:   initiative.suggestedOnly,
        evidenceIds:     initiative.evidenceIds,
        playbookIds:     initiative.playbookIds,
        metadata:        initiative.metadata ?? {},
        createdAt:       initiative.createdAt,
      },
      update: {
        title:           initiative.title,
        description:     initiative.description,
        status:          initiative.status,
        priority:        initiative.priority,
        confidenceScore: initiative.confidenceScore,
        impactScore:     initiative.impactScore,
        effortScore:     initiative.effortScore,
        evidenceIds:     initiative.evidenceIds,
        playbookIds:     initiative.playbookIds,
        metadata:        initiative.metadata ?? {},
      },
    });
  }

  async getInitiative(orgSlug: string, initiativeId: string): Promise<StrategicInitiative | null> {
    const record = await (prisma as any).strategicInitiativeRecord.findFirst({
      where: { id: initiativeId, orgSlug },
    });
    return record ? (record as StrategicInitiative) : null;
  }

  async queryInitiatives(orgSlug: string, filters?: { objectiveId?: string; priority?: PlanningPriority }): Promise<StrategicInitiative[]> {
    const records = await (prisma as any).strategicInitiativeRecord.findMany({
      where: {
        orgSlug,
        ...(filters?.objectiveId ? { objectiveId: filters.objectiveId } : {}),
        ...(filters?.priority    ? { priority: filters.priority }        : {}),
      },
      orderBy: { impactScore: "desc" },
    });
    return records as StrategicInitiative[];
  }

  // ── Milestones ─────────────────────────────────────────────────────────────

  async saveMilestone(milestone: StrategicMilestone): Promise<void> {
    await (prisma as any).strategicMilestoneRecord.upsert({
      where: { id: milestone.id },
      create: {
        id:             milestone.id,
        orgSlug:        milestone.orgSlug,
        initiativeId:   milestone.initiativeId,
        title:          milestone.title,
        description:    milestone.description,
        status:         milestone.status,
        priority:       milestone.priority,
        estimatedDate:  milestone.estimatedDate,
        successCriteria: milestone.successCriteria,
        dependencyIds:  milestone.dependencyIds,
        metadata:       milestone.metadata ?? {},
        createdAt:      milestone.createdAt,
      },
      update: {
        title:          milestone.title,
        description:    milestone.description,
        status:         milestone.status,
        priority:       milestone.priority,
        estimatedDate:  milestone.estimatedDate,
        successCriteria: milestone.successCriteria,
        dependencyIds:  milestone.dependencyIds,
        metadata:       milestone.metadata ?? {},
      },
    });
  }

  async getMilestone(orgSlug: string, milestoneId: string): Promise<StrategicMilestone | null> {
    const record = await (prisma as any).strategicMilestoneRecord.findFirst({
      where: { id: milestoneId, orgSlug },
    });
    return record ? (record as StrategicMilestone) : null;
  }

  async queryMilestones(orgSlug: string, filters?: { initiativeId?: string }): Promise<StrategicMilestone[]> {
    const records = await (prisma as any).strategicMilestoneRecord.findMany({
      where: {
        orgSlug,
        ...(filters?.initiativeId ? { initiativeId: filters.initiativeId } : {}),
      },
      orderBy: { createdAt: "asc" },
    });
    return records as StrategicMilestone[];
  }

  // ── Roadmaps ───────────────────────────────────────────────────────────────

  async saveRoadmap(roadmap: StrategicRoadmap): Promise<void> {
    const r      = roadmap as any; // StrategicRoadmap evolves; use (as any) for schema-only fields
    const objIds = roadmap.objectives.map((o) => o.id);
    const iniIds = roadmap.initiatives.map((i) => i.id);
    const msIds  = roadmap.milestones.map((m) => m.id);

    await (prisma as any).strategicRoadmapRecord.upsert({
      where: { id: roadmap.id },
      create: {
        id:            roadmap.id,
        orgSlug:       roadmap.orgSlug,
        title:         roadmap.title,
        description:   roadmap.description,
        priority:      r.priority ?? "MEDIUM",
        status:        r.status ?? "DRAFT",
        roadmapScore:  r.roadmapScore ?? roadmap.confidenceScore ?? 0,
        objectiveIds:  objIds,
        initiativeIds: iniIds,
        milestoneIds:  msIds,
        horizon:       roadmap.horizon,
        evidenceIds:   r.evidenceIds ?? [],
        metadata:      roadmap.metadata ?? {},
        createdAt:     roadmap.builtAt,
      },
      update: {
        title:         roadmap.title,
        description:   roadmap.description,
        status:        r.status ?? "DRAFT",
        priority:      r.priority ?? "MEDIUM",
        roadmapScore:  r.roadmapScore ?? roadmap.confidenceScore ?? 0,
        objectiveIds:  objIds,
        initiativeIds: iniIds,
        milestoneIds:  msIds,
        horizon:       roadmap.horizon,
        evidenceIds:   r.evidenceIds ?? [],
        metadata:      roadmap.metadata ?? {},
      },
    });
  }

  async getRoadmap(orgSlug: string, roadmapId: string): Promise<StrategicRoadmap | null> {
    const record = await (prisma as any).strategicRoadmapRecord.findFirst({
      where: { id: roadmapId, orgSlug },
    });
    return record ? (record as StrategicRoadmap) : null;
  }

  async queryRoadmaps(orgSlug: string): Promise<StrategicRoadmap[]> {
    const records = await (prisma as any).strategicRoadmapRecord.findMany({
      where:   { orgSlug },
      orderBy: { roadmapScore: "desc" },
    });
    return records as StrategicRoadmap[];
  }
}
