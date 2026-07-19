/**
 * lib/marketing-studio/publishing/publishing-plan.ts
 *
 * MS-17 — Unified Publishing OS: Plan engine
 *
 * buildPublishingPlan() — constructs a multi-step publishing plan.
 * Pure computation. No Prisma. No async.
 */

import { randomUUID } from "crypto";
import {
  PUBLISHING_DESTINATION,
  PUBLISHING_STATUS,
  PUBLISHING_PRIORITY,
  PUBLISHING_TRIGGER,
  type PublishingPlan,
  type PublishingPlanStep,
  type PublishingDestination,
  type PublishingPriority,
  type PublishingTrigger,
} from "./publishing-types";
import { buildRequiredDependencies, canExecutePublishingStep, computeStepBlockers } from "./publishing-dependencies";
import { mapDestinationToJobType } from "./publishing-actions";

// ── Plan context ──────────────────────────────────────────────────────────────

export interface PlanBuildContext {
  organizationId:  string;
  productId?:      string | null;
  catalogId?:      string | null;
  campaignId?:     string | null;
  assetId?:        string | null;
  destinations:    PublishingDestination[];
  priority?:       PublishingPriority;
  trigger?:        PublishingTrigger;
  scheduledAt?:    string | null;
  notes?:          string;
}

// ── Standard plan templates ───────────────────────────────────────────────────

export const PLAN_TEMPLATE = {
  PRODUCT_LAUNCH: [
    PUBLISHING_DESTINATION.SHOPIFY,
    PUBLISHING_DESTINATION.CATALOG,
    PUBLISHING_DESTINATION.WHATSAPP,
    PUBLISHING_DESTINATION.INSTAGRAM,
    PUBLISHING_DESTINATION.TIKTOK,
    PUBLISHING_DESTINATION.ADS,
  ],
  CAMPAIGN_LAUNCH: [
    PUBLISHING_DESTINATION.SHOPIFY,
    PUBLISHING_DESTINATION.INSTAGRAM,
    PUBLISHING_DESTINATION.FACEBOOK,
    PUBLISHING_DESTINATION.TIKTOK,
    PUBLISHING_DESTINATION.ADS,
    PUBLISHING_DESTINATION.EMAIL,
  ],
  CATALOG_DISTRIBUTION: [
    PUBLISHING_DESTINATION.SHOPIFY,
    PUBLISHING_DESTINATION.CATALOG,
    PUBLISHING_DESTINATION.WHATSAPP,
  ],
  SOCIAL_DROP: [
    PUBLISHING_DESTINATION.INSTAGRAM,
    PUBLISHING_DESTINATION.FACEBOOK,
    PUBLISHING_DESTINATION.TIKTOK,
  ],
} as const;

// ── Step builder ──────────────────────────────────────────────────────────────

function buildStep(
  organizationId: string,
  planId:         string,
  destination:    PublishingDestination,
  ctx:            PlanBuildContext,
  now:            string,
): PublishingPlanStep {
  const deps = buildRequiredDependencies(destination, {
    productId:  ctx.productId,
    assetId:    ctx.assetId,
    campaignId: ctx.campaignId,
    catalogId:  ctx.catalogId,
    scheduledAt: ctx.scheduledAt,
  });

  const step: PublishingPlanStep = {
    id:             randomUUID(),
    organizationId,
    planId,
    destination,
    status:         PUBLISHING_STATUS.PLANNED,
    dependencies:   deps,
    payload:        {
      productId:  ctx.productId  ?? null,
      catalogId:  ctx.catalogId  ?? null,
      campaignId: ctx.campaignId ?? null,
      assetId:    ctx.assetId    ?? null,
      scheduledAt: ctx.scheduledAt ?? null,
    },
    executionJobId:   null,
    retryCount:       0,
    lastError:        null,
    scheduledAt:      ctx.scheduledAt ?? null,
    startedAt:        null,
    completedAt:      null,
    createdAt:        now,
    updatedAt:        now,
    canExecute:       false,
    isBlocked:        false,
    isOverdue:        false,
    executionJobType: mapDestinationToJobType(destination),
  };

  step.canExecute = canExecutePublishingStep(step);
  step.isBlocked  = !step.canExecute && deps.some(d => !d.isResolved);
  step.isOverdue  = !!(
    ctx.scheduledAt &&
    new Date(ctx.scheduledAt) < new Date() &&
    !["published", "cancelled", "archived"].includes(step.status)
  );

  return step;
}

// ── Plan builder ──────────────────────────────────────────────────────────────

export function buildPublishingPlan(ctx: PlanBuildContext): PublishingPlan {
  const now    = new Date().toISOString();
  const planId = randomUUID();

  const steps = ctx.destinations.map(dest =>
    buildStep(ctx.organizationId, planId, dest, ctx, now),
  );

  const destinationSummary: Record<string, string> = {};
  for (const step of steps) {
    destinationSummary[step.destination] = step.status;
  }

  return {
    id:                 planId,
    organizationId:     ctx.organizationId,
    campaignId:         ctx.campaignId  ?? null,
    productId:          ctx.productId   ?? null,
    catalogId:          ctx.catalogId   ?? null,
    status:             PUBLISHING_STATUS.PLANNED,
    priority:           ctx.priority    ?? PUBLISHING_PRIORITY.MEDIUM,
    trigger:            ctx.trigger     ?? PUBLISHING_TRIGGER.MANUAL,
    destinationSummary,
    progress:           0,
    scheduledAt:        ctx.scheduledAt ?? null,
    startedAt:          null,
    completedAt:        null,
    createdAt:          now,
    updatedAt:          now,
    steps,
  };
}

// ── Template helpers ──────────────────────────────────────────────────────────

export function buildProductLaunchPlan(ctx: Omit<PlanBuildContext, "destinations">): PublishingPlan {
  return buildPublishingPlan({ ...ctx, destinations: [...PLAN_TEMPLATE.PRODUCT_LAUNCH], trigger: PUBLISHING_TRIGGER.PRODUCT_APPROVED });
}

export function buildCampaignLaunchPlan(ctx: Omit<PlanBuildContext, "destinations">): PublishingPlan {
  return buildPublishingPlan({ ...ctx, destinations: [...PLAN_TEMPLATE.CAMPAIGN_LAUNCH], trigger: PUBLISHING_TRIGGER.CAMPAIGN });
}

export function buildCatalogDistributionPlan(ctx: Omit<PlanBuildContext, "destinations">): PublishingPlan {
  return buildPublishingPlan({ ...ctx, destinations: [...PLAN_TEMPLATE.CATALOG_DISTRIBUTION], trigger: PUBLISHING_TRIGGER.CATALOG_UPDATED });
}
