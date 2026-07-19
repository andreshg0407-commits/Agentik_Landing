/**
 * lib/marketing-studio/orchestrator/orchestrator-plans.ts
 *
 * MS-17 — Unified Publishing Orchestrator: Plan building and templates
 *
 * Pure computation — no Prisma, no fetch, no side effects.
 */

import { randomUUID } from "crypto";
import type {
  OrchestratorPlan,
  OrchestratorStage,
  OrchestratorJob,
  OrchestratorPlanType,
  OrchestratorChannel,
  OrchestratorSourceEntityType,
  OrchestratorJobType,
} from "./orchestrator-types";
import { ORCHESTRATOR_JOB_TYPE_LABEL } from "./orchestrator-display";
import { PLAN_STAGE_ORDER, STAGE_DEPENDENCIES } from "./orchestrator-dependencies";

// ── Build context ─────────────────────────────────────────────────────────────

export interface OrchestratorPlanBuildContext {
  organizationId:   string;
  type:             OrchestratorPlanType;
  priority:         "critical" | "high" | "medium" | "low";
  sourceEntityType: OrchestratorSourceEntityType;
  sourceEntityId:   string | null;
  targetChannels:   OrchestratorChannel[];
  createdBy:        string;
  scheduledAt:      string | null;
  metadata:         Record<string, unknown>;
}

// ── Stage factory ─────────────────────────────────────────────────────────────

function buildStage(
  planId:   string,
  type:     OrchestratorJobType,
  order:    number,
  allTypes: OrchestratorJobType[],
): OrchestratorStage {
  const stageId = randomUUID();

  // Resolve dependsOn as stage IDs — we'll wire them after all stages are built
  // For now store type refs; repository will resolve to IDs on re-load
  const dependsOnTypes = STAGE_DEPENDENCIES[type].filter(dep => allTypes.includes(dep));

  const job: OrchestratorJob = {
    id:            randomUUID(),
    stageId,
    type,
    label:         ORCHESTRATOR_JOB_TYPE_LABEL[type],
    status:        "pending",
    startedAt:     null,
    completedAt:   null,
    failedAt:      null,
    failReason:    null,
    retryCount:    0,
    executionJobId: null,
  };

  return {
    id:           stageId,
    planId,
    type,
    label:        ORCHESTRATOR_JOB_TYPE_LABEL[type],
    status:       order === 0 ? "ready" : "pending",
    order,
    dependsOn:    dependsOnTypes,  // placeholder — resolved on load
    jobs:         [job],
    startedAt:    null,
    completedAt:  null,
    failedReason: null,
  };
}

// ── Plan factory ──────────────────────────────────────────────────────────────

export function buildOrchestratorPlan(ctx: OrchestratorPlanBuildContext): OrchestratorPlan {
  const planId = randomUUID();
  const now    = new Date().toISOString();
  const stageTypes = PLAN_STAGE_ORDER[ctx.type];

  const stages = stageTypes.map((type, i) => buildStage(planId, type, i, stageTypes));

  // Wire dependsOn to actual stage IDs
  const typeToId: Record<string, string> = {};
  for (const stage of stages) typeToId[stage.type] = stage.id;
  for (const stage of stages) {
    stage.dependsOn = (STAGE_DEPENDENCIES[stage.type] as string[])
      .filter(dep => typeToId[dep] !== undefined)
      .map(dep => typeToId[dep]);
  }

  return {
    id:               planId,
    organizationId:   ctx.organizationId,
    type:             ctx.type,
    status:           "draft",
    priority:         ctx.priority,
    sourceEntityType: ctx.sourceEntityType,
    sourceEntityId:   ctx.sourceEntityId,
    targetChannels:   ctx.targetChannels,
    createdBy:        ctx.createdBy,
    scheduledAt:      ctx.scheduledAt,
    startedAt:        null,
    completedAt:      null,
    failedAt:         null,
    healthScore:      100,
    readinessScore:   ctx.targetChannels.length > 0 ? 80 : 40,
    retryCount:       0,
    stages,
    blockers:         [],
    executionSummary: {
      totalJobs:     stages.length,
      completedJobs: 0,
      failedJobs:    0,
      blockedJobs:   0,
      retryingJobs:  0,
      avgDurationMs: null,
      lastActivityAt: null,
    },
    metadata:         ctx.metadata,
    createdAt:        now,
    updatedAt:        now,
    progress:         0,
    completedStages:  0,
    totalStages:      stages.length,
  };
}

// ── Pre-built templates ───────────────────────────────────────────────────────

export function buildProductLaunchPlan(orgId: string, productId: string): OrchestratorPlan {
  return buildOrchestratorPlan({
    organizationId:   orgId,
    type:             "product_launch",
    priority:         "high",
    sourceEntityType: "product",
    sourceEntityId:   productId,
    targetChannels:   ["shopify", "instagram", "catalog"],
    createdBy:        "system",
    scheduledAt:      null,
    metadata:         { productId },
  });
}

export function buildCampaignLaunchPlan(orgId: string, campaignId: string): OrchestratorPlan {
  return buildOrchestratorPlan({
    organizationId:   orgId,
    type:             "campaign_launch",
    priority:         "high",
    sourceEntityType: "campaign",
    sourceEntityId:   campaignId,
    targetChannels:   ["instagram", "facebook", "shopify", "whatsapp"],
    createdBy:        "system",
    scheduledAt:      null,
    metadata:         { campaignId },
  });
}

export function buildCatalogDistributionPlan(orgId: string, catalogId: string): OrchestratorPlan {
  return buildOrchestratorPlan({
    organizationId:   orgId,
    type:             "catalog_distribution",
    priority:         "medium",
    sourceEntityType: "catalog",
    sourceEntityId:   catalogId,
    targetChannels:   ["shopify", "whatsapp", "catalog"],
    createdBy:        "system",
    scheduledAt:      null,
    metadata:         { catalogId },
  });
}

export function buildSocialPushPlan(orgId: string): OrchestratorPlan {
  return buildOrchestratorPlan({
    organizationId:   orgId,
    type:             "social_push",
    priority:         "medium",
    sourceEntityType: "asset",
    sourceEntityId:   null,
    targetChannels:   ["instagram", "facebook", "tiktok"],
    createdBy:        "system",
    scheduledAt:      null,
    metadata:         {},
  });
}

// ── Compute plan progress from stages ────────────────────────────────────────

export function computePlanProgress(plan: OrchestratorPlan): number {
  if (plan.stages.length === 0) return 0;
  const done = plan.stages.filter(s => s.status === "completed" || s.status === "skipped").length;
  return Math.round((done / plan.stages.length) * 100);
}
