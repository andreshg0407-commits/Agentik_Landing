/**
 * lib/marketing-studio/publishing/publishing-orchestrator.ts
 *
 * MS-17 — Unified Publishing OS: Main orchestrator
 *
 * runPublishingOrchestrator() — executes ready steps in a plan.
 * Dispatches to Shopify / Social / Distribution / Campaign runtimes.
 *
 * SERVER ONLY.
 */

import { dispatchExecutionJob }    from "@/lib/marketing-studio/execution/execution-dispatcher";
import { buildIdempotencyKey }     from "@/lib/marketing-studio/execution/execution-types";
import {
  PUBLISHING_EVENT,
  PUBLISHING_STATUS,
  type PublishingPlan,
  type PublishingPlanStep,
  type PublishingResult,
} from "./publishing-types";
import {
  mapDestinationToJobType,
  mapDestinationToExecutionDestination,
  isPendingExternalDestination,
} from "./publishing-actions";
import { isStepExecutable, derivePlanStatusFromSteps, computePlanProgress } from "./publishing-state-machine";
import { shouldRetryPublishingStep, computeNextRetryAt } from "./publishing-retries";
import {
  createPublishingPlan,
  updatePublishingPlanStatus,
  updatePublishingStepStatus,
  listStepsReadyToExecute,
  listPublishingPlans,
} from "./publishing-repository";
import { handlePublishingEvent } from "./publishing-events";
import type { PlanBuildContext }  from "./publishing-plan";
import { buildPublishingPlan }    from "./publishing-plan";
import { computePublishingHealth } from "./publishing-health";

// ── Single step execution ──────────────────────────────────────────────────────

export async function executePublishingStep(
  step:           PublishingPlanStep,
  organizationId: string,
): Promise<PublishingResult> {
  const jobType        = mapDestinationToJobType(step.destination);
  const execDest       = mapDestinationToExecutionDestination(step.destination);
  const isPendingExt   = isPendingExternalDestination(step.destination);

  // Mark step as starting
  await updatePublishingStepStatus(step.id, organizationId, PUBLISHING_STATUS.PUBLISHING, {
    startedAt: new Date(),
  });

  await handlePublishingEvent({
    organizationId,
    eventType:   PUBLISHING_EVENT.STEP_STARTED,
    planId:      step.planId,
    stepId:      step.id,
    destination: step.destination,
  });

  try {
    if (isPendingExt) {
      // No real handler — create pending_external job
      const { job } = await dispatchExecutionJob({
        organizationId,
        jobType:        "pending_external",
        destination:    execDest,
        payload:        { ...step.payload, targetJobType: jobType, destination: step.destination },
        idempotencyKey: buildIdempotencyKey("pending_external", organizationId, step.id),
        priority:       3,
        maxRetries:     0,
      });

      await updatePublishingStepStatus(step.id, organizationId, PUBLISHING_STATUS.QUEUED, {
        executionJobId: job.id,
      });

      return {
        stepId:            step.id,
        success:           false,
        executionJobId:    job.id,
        errorMessage:      null,
        isPendingExternal: true,
      };
    }

    // Dispatch real execution job
    const { job } = await dispatchExecutionJob({
      organizationId,
      jobType,
      destination:    execDest,
      productId:      (step.payload.productId as string) ?? null,
      catalogId:      (step.payload.catalogId as string) ?? null,
      payload:        { ...step.payload, stepId: step.id, planId: step.planId },
      idempotencyKey: buildIdempotencyKey(jobType, organizationId, step.id),
      priority:       step.destination === "shopify" ? 8 : 5,
      maxRetries:     3,
    });

    await updatePublishingStepStatus(step.id, organizationId, PUBLISHING_STATUS.QUEUED, {
      executionJobId: job.id,
    });

    await handlePublishingEvent({
      organizationId,
      eventType:   PUBLISHING_EVENT.STEP_QUEUED,
      planId:      step.planId,
      stepId:      step.id,
      destination: step.destination,
    });

    return {
      stepId:            step.id,
      success:           true,
      executionJobId:    job.id,
      errorMessage:      null,
      isPendingExternal: false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    if (shouldRetryPublishingStep(step, msg)) {
      const nextRetryAt = computeNextRetryAt(step.retryCount);
      await updatePublishingStepStatus(step.id, organizationId, PUBLISHING_STATUS.RETRYING, {
        retryCount: step.retryCount + 1,
        lastError:  msg,
      });
      await handlePublishingEvent({
        organizationId,
        eventType:    PUBLISHING_EVENT.STEP_RETRYING,
        planId:       step.planId,
        stepId:       step.id,
        destination:  step.destination,
        errorMessage: msg,
      });
    } else {
      await updatePublishingStepStatus(step.id, organizationId, PUBLISHING_STATUS.FAILED, {
        lastError: msg,
      });
      await handlePublishingEvent({
        organizationId,
        eventType:    PUBLISHING_EVENT.STEP_FAILED,
        planId:       step.planId,
        stepId:       step.id,
        destination:  step.destination,
        errorMessage: msg,
      });
    }

    return {
      stepId:            step.id,
      success:           false,
      executionJobId:    null,
      errorMessage:      msg,
      isPendingExternal: false,
    };
  }
}

// ── Plan execution ────────────────────────────────────────────────────────────

export async function runPublishingOrchestrator(
  plan:           PublishingPlan,
  organizationId: string,
): Promise<PublishingResult[]> {
  const executableSteps = plan.steps.filter(isStepExecutable);
  if (executableSteps.length === 0) return [];

  // Mark plan as publishing if not already
  if (!["publishing","queued"].includes(plan.status)) {
    await updatePublishingPlanStatus(plan.id, organizationId, PUBLISHING_STATUS.PUBLISHING, {
      startedAt: new Date(),
    });
  }

  const results = await Promise.allSettled(
    executableSteps.map(step => executePublishingStep(step, organizationId)),
  );

  const settled: PublishingResult[] = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return {
      stepId:            executableSteps[i].id,
      success:           false,
      executionJobId:    null,
      errorMessage:      r.reason instanceof Error ? r.reason.message : String(r.reason),
      isPendingExternal: false,
    };
  });

  // Recompute plan status based on updated steps
  const updatedSteps = plan.steps.map(s => {
    const res = settled.find(r => r.stepId === s.id);
    if (!res) return s;
    return {
      ...s,
      status: res.isPendingExternal ? PUBLISHING_STATUS.QUEUED
            : res.success           ? PUBLISHING_STATUS.QUEUED
            : PUBLISHING_STATUS.FAILED,
    };
  });

  const newPlanStatus = derivePlanStatusFromSteps(updatedSteps);
  const progress      = computePlanProgress(updatedSteps);
  await updatePublishingPlanStatus(plan.id, organizationId, newPlanStatus, { progress });

  return settled;
}

// ── High-level launch helpers ─────────────────────────────────────────────────

export async function orchestrateProductLaunch(ctx: Omit<PlanBuildContext, "destinations">): Promise<PublishingPlan> {
  const { buildProductLaunchPlan } = await import("./publishing-plan");
  const plan = buildProductLaunchPlan(ctx);
  const saved = await createPublishingPlan(plan);
  await handlePublishingEvent({
    organizationId: ctx.organizationId,
    eventType:      PUBLISHING_EVENT.PLAN_CREATED,
    planId:         saved.id,
    productId:      ctx.productId,
    campaignId:     ctx.campaignId,
  });
  return saved;
}

export async function orchestrateCampaignLaunch(ctx: Omit<PlanBuildContext, "destinations">): Promise<PublishingPlan> {
  const { buildCampaignLaunchPlan } = await import("./publishing-plan");
  const plan = buildCampaignLaunchPlan(ctx);
  const saved = await createPublishingPlan(plan);
  await handlePublishingEvent({
    organizationId: ctx.organizationId,
    eventType:      PUBLISHING_EVENT.PLAN_CREATED,
    planId:         saved.id,
    campaignId:     ctx.campaignId,
  });
  return saved;
}

export async function orchestrateCatalogDistribution(ctx: Omit<PlanBuildContext, "destinations">): Promise<PublishingPlan> {
  const { buildCatalogDistributionPlan } = await import("./publishing-plan");
  const plan = buildCatalogDistributionPlan(ctx);
  const saved = await createPublishingPlan(plan);
  await handlePublishingEvent({
    organizationId: ctx.organizationId,
    eventType:      PUBLISHING_EVENT.PLAN_CREATED,
    planId:         saved.id,
    catalogId:      ctx.catalogId,
  });
  return saved;
}

export async function orchestrateScheduledPublishing(organizationId: string): Promise<PublishingResult[]> {
  const steps = await listStepsReadyToExecute(organizationId);
  const results: PublishingResult[] = [];

  for (const step of steps) {
    const result = await executePublishingStep(step, organizationId);
    results.push(result);
  }

  return results;
}

// ── Runtime state builder (RSC entry point) ───────────────────────────────────

export async function buildPublishingRuntimeState(organizationId: string) {
  const [plans, recentEvents] = await Promise.all([
    listPublishingPlans(organizationId),
    import("./publishing-repository").then(r => r.listRecentPublishingEvents(organizationId, 25)),
  ]);

  const health         = computePublishingHealth(plans);
  const activePlanIds  = plans
    .filter(p => ["planned","queued","preparing","publishing","retrying","partial"].includes(p.status))
    .map(p => p.id);

  return {
    organizationId,
    computedAt:       new Date().toISOString(),
    plans,
    health,
    recentEvents,
    destinationStates: health.destinationHealth,
    totalPlans:        plans.length,
    activePlanIds,
  };
}
