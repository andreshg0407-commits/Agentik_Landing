/**
 * lib/marketing-studio/orchestrator/orchestrator-action-handlers.ts
 *
 * MS-18 — Execution Actions: All action handlers
 *
 * Each handler:
 *   1. Validates current state
 *   2. Asserts transition is valid
 *   3. Creates ExecutionJob via bridge if applicable
 *   4. Updates plan/stage via publishing-repository
 *   5. Records event via publishing-repository
 *   6. Returns OrchestratorActionResult
 *
 * SERVER ONLY — never import in client components.
 */

import { randomUUID } from "crypto";
import {
  getOrchestratorPlan,
  listOrchestratorPlans,
} from "./orchestrator-repository";
import {
  updatePublishingPlanStatus,
  updatePublishingStepStatus,
  recordPublishingEvent,
} from "@/lib/marketing-studio/publishing/publishing-repository";
import {
  createExecutionJobForStage,
  createExecutionJobForAction,
} from "./orchestrator-execution-bridge";
import {
  assertValidPlanTransition,
  orchestratorStatusToPublishing,
  derivePlanStatusFromStages,
} from "./orchestrator-state-machine";
import {
  computeOrchestratorHealth,
} from "./orchestrator-health";
import {
  EXECUTION_JOB_TYPE,
  EXECUTION_DESTINATION,
} from "@/lib/marketing-studio/execution/execution-types";
import {
  dispatchOperatorRequest,
} from "@/lib/marketing-studio/operators/operator-dispatcher";
import {
  OPERATOR_ACTION,
} from "@/lib/marketing-studio/operators/operator-types";
import {
  PlanNotFoundError,
  StageNotFoundError,
  ActionNotAllowedError,
  DependencyBlockedError,
} from "./orchestrator-actions";
import type {
  OrchestratorActionResult,
  OrchestratorActionRequest,
} from "./orchestrator-actions";
import type { OrchestratorChannel } from "./orchestrator-types";

// ── Event recorder helper ─────────────────────────────────────────────────────

async function emit(
  organizationId: string,
  eventType:      string,
  planId:         string | null,
  payload:        Record<string, unknown>,
): Promise<void> {
  await recordPublishingEvent({ organizationId, planId, stepId: null, eventType, payload });
}

// ── Result builder ────────────────────────────────────────────────────────────

function ok(
  req:            OrchestratorActionRequest,
  message:        string,
  extras?: {
    executionJobId?: string | null;
    newPlanStatus?:  string | null;
    newStageStatus?: string | null;
    wasDeduped?:     boolean;
  },
): OrchestratorActionResult {
  return {
    success:        true,
    actionType:     req.actionType,
    planId:         req.planId,
    stageId:        req.stageId,
    jobId:          req.jobId,
    executionJobId: extras?.executionJobId ?? null,
    wasDeduped:     extras?.wasDeduped     ?? false,
    message,
    newPlanStatus:  extras?.newPlanStatus  ?? null,
    newStageStatus: extras?.newStageStatus ?? null,
    error:          null,
  };
}

// ── handleValidatePlan ────────────────────────────────────────────────────────

export async function handleValidatePlan(req: OrchestratorActionRequest): Promise<OrchestratorActionResult> {
  const { organizationId, planId } = req;
  if (!planId) throw new ActionNotAllowedError("planId is required for validate_plan");

  const plan = await getOrchestratorPlan(organizationId, planId);
  if (!plan) throw new PlanNotFoundError(planId);

  assertValidPlanTransition(plan.status, "validating");

  const dbStatus = orchestratorStatusToPublishing("validating");
  await updatePublishingPlanStatus(planId, organizationId, dbStatus);

  // Dispatch a validation job
  const { job, wasDeduped } = await createExecutionJobForAction({
    organizationId,
    actionType:  "validate_plan",
    jobType:     EXECUTION_JOB_TYPE.PRODUCT_RECOMPUTE_READINESS,
    destination: EXECUTION_DESTINATION.INTERNAL,
    entityId:    planId,
    planId,
    payload:     { trigger: "manual_validate" },
  });

  await emit(organizationId, "orchestrator.plan_validated", planId, { jobId: job.id, trigger: "manual" });

  return ok(req, "Plan en validación", {
    executionJobId: job.id,
    newPlanStatus:  "validating",
    wasDeduped,
  });
}

// ── handleRunPlan ─────────────────────────────────────────────────────────────

export async function handleRunPlan(req: OrchestratorActionRequest): Promise<OrchestratorActionResult> {
  const { organizationId, planId } = req;
  if (!planId) throw new ActionNotAllowedError("planId is required for run_plan");

  const plan = await getOrchestratorPlan(organizationId, planId);
  if (!plan) throw new PlanNotFoundError(planId);

  // Allow from draft, queued, or validating
  if (!["draft","queued","validating","partially_completed","failed"].includes(plan.status)) {
    assertValidPlanTransition(plan.status, "running");
  }

  const now = new Date();
  await updatePublishingPlanStatus(planId, organizationId,
    orchestratorStatusToPublishing("running"),
    { startedAt: now },
  );

  // Dispatch jobs for all ready/pending stages
  const channels = plan.targetChannels;
  const dispatchedJobs: string[] = [];

  for (const stage of plan.stages) {
    if (!["pending","ready","failed","blocked"].includes(stage.status)) continue;

    const channel = (stage.type === "social_publish" && channels.length > 0)
      ? channels[0] as OrchestratorChannel
      : undefined;

    const { job, wasDeduped } = await createExecutionJobForStage({
      organizationId,
      planId,
      stageId:       stage.id,
      stageType:     stage.type,
      channel,
      sourceEntityId: plan.sourceEntityId,
      productId:     plan.metadata.productId  as string | null ?? null,
      catalogId:     plan.metadata.catalogId  as string | null ?? null,
      retryCount:    0,
      priority:      plan.priority === "critical" ? 1 : plan.priority === "high" ? 2 : 5,
    });

    if (!wasDeduped) dispatchedJobs.push(job.id);

    await updatePublishingStepStatus(stage.id, organizationId, "publishing", {
      executionJobId: job.id,
      startedAt:      now,
    });
  }

  await emit(organizationId, "orchestrator.plan_running", planId, {
    dispatchedJobs,
    trigger: "manual",
  });

  return ok(req, `Plan ejecutado · ${dispatchedJobs.length} jobs despachados`, {
    newPlanStatus: "running",
    executionJobId: dispatchedJobs[0] ?? null,
  });
}

// ── handleRunStage ────────────────────────────────────────────────────────────

export async function handleRunStage(req: OrchestratorActionRequest): Promise<OrchestratorActionResult> {
  const { organizationId, planId, stageId } = req;
  if (!planId || !stageId) throw new ActionNotAllowedError("planId and stageId required for run_stage");

  const plan = await getOrchestratorPlan(organizationId, planId);
  if (!plan) throw new PlanNotFoundError(planId);

  const stage = plan.stages.find(s => s.id === stageId);
  if (!stage) throw new StageNotFoundError(stageId);

  if (stage.status === "blocked") {
    throw new DependencyBlockedError(`Stage "${stage.label}" is blocked by unresolved dependencies`);
  }

  const { job, wasDeduped } = await createExecutionJobForStage({
    organizationId,
    planId,
    stageId,
    stageType:     stage.type,
    sourceEntityId: plan.sourceEntityId,
    productId:     plan.metadata.productId  as string | null ?? null,
    catalogId:     plan.metadata.catalogId  as string | null ?? null,
  });

  await updatePublishingStepStatus(stageId, organizationId, "publishing", {
    executionJobId: job.id,
    startedAt:      new Date(),
  });

  await emit(organizationId, "orchestrator.stage_started", planId, {
    stageId, jobId: job.id,
  });

  return ok(req, `Stage "${stage.label}" ejecutado`, {
    executionJobId: job.id,
    newStageStatus: "running",
    wasDeduped,
  });
}

// ── handleRunJob ──────────────────────────────────────────────────────────────

export async function handleRunJob(req: OrchestratorActionRequest): Promise<OrchestratorActionResult> {
  const { organizationId, planId, stageId } = req;
  if (!planId || !stageId) throw new ActionNotAllowedError("planId and stageId required for run_job");

  // run_job delegates to run_stage at this architecture level
  return handleRunStage({ ...req, actionType: "run_stage" });
}

// ── handleRetryPlan ───────────────────────────────────────────────────────────

export async function handleRetryPlan(req: OrchestratorActionRequest): Promise<OrchestratorActionResult> {
  const { organizationId, planId } = req;
  if (!planId) throw new ActionNotAllowedError("planId is required for retry_plan");

  const plan = await getOrchestratorPlan(organizationId, planId);
  if (!plan) throw new PlanNotFoundError(planId);

  // Reset to queued first
  await updatePublishingPlanStatus(planId, organizationId,
    orchestratorStatusToPublishing("queued"),
  );

  // Re-dispatch failed stages
  const failedStages = plan.stages.filter(s => s.status === "failed" || s.status === "blocked");
  const dispatchedJobs: string[] = [];
  const now = new Date();

  for (const stage of failedStages) {
    const retryCount = stage.jobs[0]?.retryCount ?? 0;
    const { job, wasDeduped } = await createExecutionJobForStage({
      organizationId,
      planId,
      stageId:    stage.id,
      stageType:  stage.type,
      sourceEntityId: plan.sourceEntityId,
      productId:  plan.metadata.productId  as string | null ?? null,
      catalogId:  plan.metadata.catalogId  as string | null ?? null,
      retryCount: retryCount + 1,
    });

    if (!wasDeduped) dispatchedJobs.push(job.id);

    await updatePublishingStepStatus(stage.id, organizationId, "retrying", {
      executionJobId: job.id,
      retryCount:     retryCount + 1,
      lastError:      null,
      startedAt:      now,
    });
  }

  await emit(organizationId, "orchestrator.retry_scheduled", planId, {
    dispatchedJobs, failedStages: failedStages.length,
  });

  return ok(req, `${dispatchedJobs.length} stage(s) reintentados`, {
    newPlanStatus: "queued",
    executionJobId: dispatchedJobs[0] ?? null,
  });
}

// ── handleRetryStage ──────────────────────────────────────────────────────────

export async function handleRetryStage(req: OrchestratorActionRequest): Promise<OrchestratorActionResult> {
  const { organizationId, planId, stageId } = req;
  if (!planId || !stageId) throw new ActionNotAllowedError("planId and stageId required for retry_stage");

  const plan = await getOrchestratorPlan(organizationId, planId);
  if (!plan) throw new PlanNotFoundError(planId);

  const stage = plan.stages.find(s => s.id === stageId);
  if (!stage) throw new StageNotFoundError(stageId);

  const retryCount = stage.jobs[0]?.retryCount ?? 0;
  const { job, wasDeduped } = await createExecutionJobForStage({
    organizationId,
    planId,
    stageId,
    stageType:  stage.type,
    sourceEntityId: plan.sourceEntityId,
    productId:  plan.metadata.productId  as string | null ?? null,
    catalogId:  plan.metadata.catalogId  as string | null ?? null,
    retryCount: retryCount + 1,
  });

  await updatePublishingStepStatus(stageId, organizationId, "retrying", {
    executionJobId: job.id,
    retryCount:     retryCount + 1,
    lastError:      null,
    startedAt:      new Date(),
  });

  await emit(organizationId, "orchestrator.retry_scheduled", planId, { stageId, jobId: job.id });

  return ok(req, `Stage "${stage.label}" reintentado`, {
    executionJobId: job.id,
    newStageStatus: "running",
    wasDeduped,
  });
}

// ── handlePausePlan ───────────────────────────────────────────────────────────

export async function handlePausePlan(req: OrchestratorActionRequest): Promise<OrchestratorActionResult> {
  const { organizationId, planId } = req;
  if (!planId) throw new ActionNotAllowedError("planId is required for pause_plan");

  const plan = await getOrchestratorPlan(organizationId, planId);
  if (!plan) throw new PlanNotFoundError(planId);

  assertValidPlanTransition(plan.status, "paused");

  // Map paused → "queued" in publishing schema (no direct paused status)
  await updatePublishingPlanStatus(planId, organizationId,
    orchestratorStatusToPublishing("paused"),
  );

  await emit(organizationId, "orchestrator.plan_paused", planId, { trigger: "manual" });

  return ok(req, "Plan pausado", { newPlanStatus: "paused" });
}

// ── handleResumePlan ──────────────────────────────────────────────────────────

export async function handleResumePlan(req: OrchestratorActionRequest): Promise<OrchestratorActionResult> {
  const { organizationId, planId } = req;
  if (!planId) throw new ActionNotAllowedError("planId is required for resume_plan");

  const plan = await getOrchestratorPlan(organizationId, planId);
  if (!plan) throw new PlanNotFoundError(planId);

  // Resume goes to queued (will be picked up by worker)
  await updatePublishingPlanStatus(planId, organizationId,
    orchestratorStatusToPublishing("queued"),
  );

  await emit(organizationId, "orchestrator.plan_running", planId, { trigger: "resume" });

  return ok(req, "Plan reanudado — en cola de ejecución", { newPlanStatus: "queued" });
}

// ── handleCancelPlan ──────────────────────────────────────────────────────────

export async function handleCancelPlan(req: OrchestratorActionRequest): Promise<OrchestratorActionResult> {
  const { organizationId, planId } = req;
  if (!planId) throw new ActionNotAllowedError("planId is required for cancel_plan");

  const plan = await getOrchestratorPlan(organizationId, planId);
  if (!plan) throw new PlanNotFoundError(planId);

  if (plan.status === "archived" || plan.status === "completed") {
    throw new ActionNotAllowedError(`Cannot cancel plan in status "${plan.status}"`);
  }

  await updatePublishingPlanStatus(planId, organizationId, "cancelled",
    { completedAt: new Date() },
  );

  await emit(organizationId, "orchestrator.plan_cancelled", planId, { trigger: "manual" });

  return ok(req, "Plan cancelado", { newPlanStatus: "archived" });
}

// ── handleArchivePlan ─────────────────────────────────────────────────────────

export async function handleArchivePlan(req: OrchestratorActionRequest): Promise<OrchestratorActionResult> {
  const { organizationId, planId } = req;
  if (!planId) throw new ActionNotAllowedError("planId is required for archive_plan");

  const plan = await getOrchestratorPlan(organizationId, planId);
  if (!plan) throw new PlanNotFoundError(planId);

  if (plan.status === "running") {
    throw new ActionNotAllowedError("Cannot archive a running plan. Pause or cancel first.");
  }

  await updatePublishingPlanStatus(planId, organizationId, "archived");
  await emit(organizationId, "orchestrator.plan_archived", planId, { trigger: "manual" });

  return ok(req, "Plan archivado", { newPlanStatus: "archived" });
}

// ── handleRebuildDependencies ─────────────────────────────────────────────────

export async function handleRebuildDependencies(req: OrchestratorActionRequest): Promise<OrchestratorActionResult> {
  const { organizationId, planId } = req;
  if (!planId) throw new ActionNotAllowedError("planId is required for rebuild_dependencies");

  const plan = await getOrchestratorPlan(organizationId, planId);
  if (!plan) throw new PlanNotFoundError(planId);

  // Dispatch readiness recompute for the source entity
  const entityId = plan.sourceEntityId ?? planId;
  const { job, wasDeduped } = await createExecutionJobForAction({
    organizationId,
    actionType:  "rebuild_dependencies",
    jobType:     EXECUTION_JOB_TYPE.PRODUCT_RECOMPUTE_READINESS,
    destination: EXECUTION_DESTINATION.INTERNAL,
    entityId,
    planId,
    payload:     { rebuildType: "dependencies" },
  });

  await emit(organizationId, "orchestrator.plan_validated", planId, {
    trigger: "rebuild_dependencies", jobId: job.id,
  });

  return ok(req, "Dependencias en recálculo", {
    executionJobId: job.id,
    wasDeduped,
  });
}

// ── handleRefreshHealth ───────────────────────────────────────────────────────

export async function handleRefreshHealth(req: OrchestratorActionRequest): Promise<OrchestratorActionResult> {
  const { organizationId } = req;

  const plans = await listOrchestratorPlans(organizationId, 50);
  const health = computeOrchestratorHealth(plans);

  await emit(organizationId, "orchestrator.health_refreshed", req.planId, {
    level:      health.level,
    activePlans: health.activePlans,
    blockedPlans: health.blockedPlans,
  });

  return ok(req, `Health actualizado · ${health.label}`, { newPlanStatus: null });
}

// ── handleSyncShopify ─────────────────────────────────────────────────────────

export async function handleSyncShopify(req: OrchestratorActionRequest): Promise<OrchestratorActionResult> {
  const { organizationId, planId } = req;
  const productId = (req.payload.productId as string | undefined) ?? null;
  const entityId  = productId ?? planId ?? organizationId;

  const result = await dispatchOperatorRequest({
    organizationId,
    channel:   "shopify",
    action:    OPERATOR_ACTION.SYNC,
    actorId:   req.actorId ?? null,
    planId:    planId ?? null,
    stageId:   req.stageId ?? null,
    entityId,
    productId,
    payload:   { trigger: "manual_sync" },
  });

  await emit(organizationId, "orchestrator.job_created", planId, {
    receiptId: result.receiptId, executionJobId: result.executionJobId, destination: "shopify",
  });

  return ok(req, "Shopify sync despachado", {
    executionJobId: result.executionJobId ?? null,
    wasDeduped:     result.wasDeduped,
  });
}

// ── handlePublishSocial ───────────────────────────────────────────────────────

export async function handlePublishSocial(req: OrchestratorActionRequest): Promise<OrchestratorActionResult> {
  const { organizationId, planId } = req;
  const platform = (req.payload.channel  as string | undefined) ?? "instagram";
  const entityId = (req.payload.entityId as string | undefined) ?? planId ?? organizationId;

  const result = await dispatchOperatorRequest({
    organizationId,
    channel:  "social",
    action:   OPERATOR_ACTION.PUBLISH,
    actorId:  req.actorId ?? null,
    planId:   planId ?? null,
    stageId:  req.stageId ?? null,
    entityId,
    payload:  { platform, trigger: "manual_publish" },
  });

  await emit(organizationId, "orchestrator.job_created", planId, {
    receiptId: result.receiptId, executionJobId: result.executionJobId,
    destination: "social", platform,
  });

  return ok(req, `Publicación social (${platform}) despachada`, {
    executionJobId: result.executionJobId ?? null,
    wasDeduped:     result.wasDeduped,
  });
}

// ── handlePrepareWhatsApp ─────────────────────────────────────────────────────

export async function handlePrepareWhatsApp(req: OrchestratorActionRequest): Promise<OrchestratorActionResult> {
  const { organizationId, planId } = req;
  const catalogId = (req.payload.catalogId as string | undefined) ?? null;

  const result = await dispatchOperatorRequest({
    organizationId,
    channel:   "whatsapp",
    action:    OPERATOR_ACTION.PREPARE,
    actorId:   req.actorId ?? null,
    planId:    planId ?? null,
    stageId:   req.stageId ?? null,
    catalogId,
    payload:   { trigger: "manual_prepare" },
  });

  await emit(organizationId, "orchestrator.job_created", planId, {
    receiptId: result.receiptId, executionJobId: result.executionJobId, destination: "whatsapp",
  });

  return ok(req, "Preparación WhatsApp despachada (pending_external)", {
    executionJobId: result.executionJobId ?? null,
    wasDeduped:     result.wasDeduped,
  });
}

// ── handleRebuildCatalog ──────────────────────────────────────────────────────

export async function handleRebuildCatalog(req: OrchestratorActionRequest): Promise<OrchestratorActionResult> {
  const { organizationId, planId } = req;
  const catalogId = (req.payload.catalogId as string | undefined) ?? null;

  const result = await dispatchOperatorRequest({
    organizationId,
    channel:   "catalog",
    action:    OPERATOR_ACTION.SYNC,
    actorId:   req.actorId ?? null,
    planId:    planId ?? null,
    stageId:   req.stageId ?? null,
    catalogId,
    payload:   { trigger: "manual_rebuild" },
  });

  await emit(organizationId, "orchestrator.job_created", planId, {
    receiptId: result.receiptId, executionJobId: result.executionJobId, destination: "catalog",
  });

  return ok(req, "Catálogo en reconstrucción", {
    executionJobId: result.executionJobId ?? null,
    wasDeduped:     result.wasDeduped,
  });
}
