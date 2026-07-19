/**
 * lib/marketing-studio/distribution/distribution-pipelines.ts
 *
 * MS-14 — Distribution Runtime: Pipeline builder + executor
 *
 * buildPipelineStages()    — derives ordered stages from channels + type
 * executePipelineStage()   — dispatches execution jobs per stage
 * advancePipeline()        — moves pipeline to next stage
 *
 * SERVER ONLY.
 */

import {
  DISTRIBUTION_PIPELINE_TYPE,
  DISTRIBUTION_STATUS,
  type DistributionPipelineDTO,
  type PipelineStage,
} from "./distribution-types";
import {
  updatePipelineStatus,
  getDistributionPipeline,
} from "./distribution-repository";
import { dispatchExecutionJob } from "@/lib/marketing-studio/execution/execution-dispatcher";
import { EXECUTION_JOB_TYPE, buildIdempotencyKey } from "@/lib/marketing-studio/execution/execution-types";
import { EXECUTION_DESTINATION } from "@/lib/marketing-studio/execution/execution-types";

// ── Stage builder ──────────────────────────────────────────────────────────────

/**
 * Derives an ordered list of pipeline stages from the requested channels
 * and pipeline type. Each stage maps to an execution job type.
 */
export function buildPipelineStages(
  channels:     string[],
  pipelineType: string,
): PipelineStage[] {
  const stages: PipelineStage[] = [];
  let order = 0;

  // Always start with a readiness check
  stages.push({
    key:        "readiness_check",
    label:      "Verificación de Readiness",
    channel:    "internal",
    jobType:    EXECUTION_JOB_TYPE.CATALOG_REFRESH_READINESS,
    status:     DISTRIBUTION_STATUS.DRAFT,
    dependsOn:  [],
    isRequired: true,
  });
  order++;

  // Shopify stage
  if (channels.includes("shopify")) {
    stages.push({
      key:        "shopify_publish",
      label:      "Publicación Shopify",
      channel:    "shopify",
      jobType:    EXECUTION_JOB_TYPE.SHOPIFY_PUBLISH_DRAFT,
      status:     DISTRIBUTION_STATUS.DRAFT,
      dependsOn:  ["readiness_check"],
      isRequired: true,
    });
    order++;
  }

  // Catalog stage (for WhatsApp and catalog channel)
  if (channels.includes("whatsapp") || channels.includes("catalog")) {
    stages.push({
      key:        "catalog_build",
      label:      "Construcción de Catálogo",
      channel:    "catalog",
      jobType:    EXECUTION_JOB_TYPE.CATALOG_REBUILD,
      status:     DISTRIBUTION_STATUS.DRAFT,
      dependsOn:  ["readiness_check"],
      isRequired: channels.includes("whatsapp"),
    });
    order++;
  }

  // WhatsApp stage
  if (channels.includes("whatsapp")) {
    stages.push({
      key:        "whatsapp_drop",
      label:      "Drop WhatsApp",
      channel:    "whatsapp",
      jobType:    EXECUTION_JOB_TYPE.WHATSAPP_PREPARE_CATALOG,
      status:     DISTRIBUTION_STATUS.DRAFT,
      dependsOn:  ["catalog_build"],
      isRequired: true,
    });
    order++;
  }

  // Social asset generation stage
  const socialChannels = channels.filter(c =>
    ["instagram", "facebook", "tiktok", "ads"].includes(c),
  );
  if (socialChannels.length > 0 || pipelineType === DISTRIBUTION_PIPELINE_TYPE.CAMPAIGN_LAUNCH) {
    stages.push({
      key:        "social_assets",
      label:      "Generación de Assets Sociales",
      channel:    "instagram",
      jobType:    EXECUTION_JOB_TYPE.ASSETS_GENERATE_VARIANTS,
      status:     DISTRIBUTION_STATUS.DRAFT,
      dependsOn:  ["readiness_check"],
      isRequired: false,
    });
    order++;
  }

  return stages;
}

// ── Pipeline advancement ───────────────────────────────────────────────────────

/**
 * Dispatch execution jobs for a single pipeline stage.
 * Returns array of dispatched job IDs.
 */
export async function executePipelineStage(opts: {
  organizationId: string;
  pipelineId:     string;
  stage:          PipelineStage;
  productIds:     string[];
  catalogId?:     string | null;
}): Promise<string[]> {
  const { organizationId, pipelineId, stage, productIds, catalogId } = opts;
  const dispatchedJobIds: string[] = [];

  if (stage.jobType === EXECUTION_JOB_TYPE.SHOPIFY_PUBLISH_DRAFT) {
    // Dispatch one job per product
    for (const productId of productIds.slice(0, 50)) {
      const { job } = await dispatchExecutionJob({
        organizationId,
        jobType:        stage.jobType,
        destination:    EXECUTION_DESTINATION.SHOPIFY,
        productId,
        idempotencyKey: buildIdempotencyKey(stage.jobType, organizationId, `${pipelineId}:${productId}`),
        priority:       5,
        maxRetries:     3,
      });
      dispatchedJobIds.push(job.id);
    }
  } else if (stage.jobType === EXECUTION_JOB_TYPE.CATALOG_REBUILD) {
    const { job } = await dispatchExecutionJob({
      organizationId,
      jobType:        stage.jobType,
      destination:    EXECUTION_DESTINATION.INTERNAL,
      catalogId:      catalogId ?? null,
      idempotencyKey: buildIdempotencyKey(stage.jobType, organizationId, pipelineId),
      priority:       6,
      maxRetries:     2,
    });
    dispatchedJobIds.push(job.id);
  } else if (stage.jobType === EXECUTION_JOB_TYPE.CATALOG_REFRESH_READINESS) {
    const { job } = await dispatchExecutionJob({
      organizationId,
      jobType:        stage.jobType,
      destination:    EXECUTION_DESTINATION.INTERNAL,
      idempotencyKey: buildIdempotencyKey(stage.jobType, organizationId, pipelineId),
      priority:       7,
      maxRetries:     1,
    });
    dispatchedJobIds.push(job.id);
  } else if (stage.jobType === EXECUTION_JOB_TYPE.WHATSAPP_PREPARE_CATALOG) {
    const { job } = await dispatchExecutionJob({
      organizationId,
      jobType:        stage.jobType,
      destination:    EXECUTION_DESTINATION.WHATSAPP,
      catalogId:      catalogId ?? null,
      idempotencyKey: buildIdempotencyKey(stage.jobType, organizationId, pipelineId),
      priority:       5,
      maxRetries:     3,
    });
    dispatchedJobIds.push(job.id);
  } else {
    // Generic fallback for other job types
    const { job } = await dispatchExecutionJob({
      organizationId,
      jobType:        stage.jobType,
      destination:    EXECUTION_DESTINATION.INTERNAL,
      idempotencyKey: buildIdempotencyKey(stage.jobType, organizationId, pipelineId),
      priority:       4,
      maxRetries:     2,
    });
    dispatchedJobIds.push(job.id);
  }

  return dispatchedJobIds;
}

/**
 * Advance a pipeline to the next pending stage.
 * Updates pipeline status and stage statuses in DB.
 */
export async function advancePipeline(
  pipelineId:     string,
  organizationId: string,
): Promise<{ advanced: boolean; completedStageKey?: string; nextStageKey?: string }> {
  const pipeline = await getDistributionPipeline(pipelineId, organizationId);
  if (!pipeline) return { advanced: false };

  const stages = [...pipeline.stages];

  // Find first stage that's still in draft state and whose dependencies are all done
  const completedKeys = new Set(
    stages.filter(s => s.status === DISTRIBUTION_STATUS.PUBLISHED).map(s => s.key),
  );

  const nextStage = stages.find(s =>
    s.status === DISTRIBUTION_STATUS.DRAFT &&
    s.dependsOn.every(dep => completedKeys.has(dep)),
  );

  if (!nextStage) {
    // All stages done — mark pipeline complete
    const allDone = stages.every(s =>
      s.status === DISTRIBUTION_STATUS.PUBLISHED ||
      (!s.isRequired && s.status === DISTRIBUTION_STATUS.DRAFT),
    );
    if (allDone) {
      await updatePipelineStatus(pipelineId, organizationId, DISTRIBUTION_STATUS.PUBLISHED, {
        completedAt: new Date(),
      });
    }
    return { advanced: false };
  }

  // Mark next stage as queued
  const updatedStages = stages.map(s =>
    s.key === nextStage.key ? { ...s, status: DISTRIBUTION_STATUS.QUEUED } : s,
  );

  await updatePipelineStatus(pipelineId, organizationId, DISTRIBUTION_STATUS.PUBLISHING, {
    startedAt: pipeline.startedAt ? undefined : new Date(),
    stages:    updatedStages,
  });

  return {
    advanced:          true,
    nextStageKey:      nextStage.key,
  };
}

/**
 * Mark a pipeline stage as complete and advance to next.
 */
export async function completePipelineStage(
  pipelineId:     string,
  organizationId: string,
  stageKey:       string,
): Promise<void> {
  const pipeline = await getDistributionPipeline(pipelineId, organizationId);
  if (!pipeline) return;

  const updatedStages = pipeline.stages.map(s =>
    s.key === stageKey ? { ...s, status: DISTRIBUTION_STATUS.PUBLISHED } : s,
  );

  await updatePipelineStatus(pipelineId, organizationId, DISTRIBUTION_STATUS.PUBLISHING, {
    stages: updatedStages,
  });

  await advancePipeline(pipelineId, organizationId);
}

/**
 * Fail a pipeline stage (and the pipeline) with error.
 */
export async function failPipelineStage(
  pipelineId:     string,
  organizationId: string,
  stageKey:       string,
  error:          string,
): Promise<void> {
  const pipeline = await getDistributionPipeline(pipelineId, organizationId);
  if (!pipeline) return;

  const updatedStages = pipeline.stages.map(s =>
    s.key === stageKey ? { ...s, status: DISTRIBUTION_STATUS.FAILED } : s,
  );

  await updatePipelineStatus(pipelineId, organizationId, DISTRIBUTION_STATUS.FAILED, {
    lastError:   error,
    completedAt: new Date(),
    stages:      updatedStages,
  });
}
