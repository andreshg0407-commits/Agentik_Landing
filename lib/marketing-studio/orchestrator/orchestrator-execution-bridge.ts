/**
 * lib/marketing-studio/orchestrator/orchestrator-execution-bridge.ts
 *
 * MS-18 — Execution Actions: Bridge between Orchestrator (MS-17) and
 * Execution Runtime (MS-13).
 *
 * Maps orchestrator stages + actions to ExecutionJob dispatches.
 *
 * SERVER ONLY — never import in client components.
 */

import { dispatchExecutionJob }  from "@/lib/marketing-studio/execution/execution-dispatcher";
import {
  EXECUTION_JOB_TYPE,
  EXECUTION_DESTINATION,
  buildIdempotencyKey,
} from "@/lib/marketing-studio/execution/execution-types";
import type { DispatchJobResult } from "@/lib/marketing-studio/execution/execution-types";
import type { OrchestratorJobType, OrchestratorChannel } from "./orchestrator-types";

// ── Stage type → ExecutionJob type ────────────────────────────────────────────

export function mapStageToExecutionJobType(
  stageType: OrchestratorJobType,
  channel?:  OrchestratorChannel,
): string {
  switch (stageType) {
    case "shopify_publish":  return EXECUTION_JOB_TYPE.SHOPIFY_PUBLISH_DRAFT;
    case "catalog_sync":     return EXECUTION_JOB_TYPE.CATALOG_REBUILD;
    case "whatsapp_publish": return EXECUTION_JOB_TYPE.WHATSAPP_PREPARE_CATALOG;
    case "asset_sync":       return EXECUTION_JOB_TYPE.ASSETS_GENERATE_VARIANTS;
    case "validation":       return EXECUTION_JOB_TYPE.PRODUCT_RECOMPUTE_READINESS;
    case "campaign_attach":  return EXECUTION_JOB_TYPE.CATALOG_REFRESH_READINESS;
    case "cleanup":          return EXECUTION_JOB_TYPE.CATALOG_REFRESH_READINESS;
    case "social_publish":
      switch (channel) {
        case "instagram": return EXECUTION_JOB_TYPE.SOCIAL_PUBLISH_INSTAGRAM;
        case "tiktok":    return EXECUTION_JOB_TYPE.SOCIAL_PUBLISH_TIKTOK;
        case "facebook":  return EXECUTION_JOB_TYPE.SOCIAL_PUBLISH_FACEBOOK;
        case "youtube":   return EXECUTION_JOB_TYPE.SOCIAL_PUBLISH_YOUTUBE;
        default:          return EXECUTION_JOB_TYPE.SOCIAL_PUBLISH_INSTAGRAM;
      }
    default:               return EXECUTION_JOB_TYPE.PRODUCT_RECOMPUTE_READINESS;
  }
}

// ── Stage type → ExecutionDestination ─────────────────────────────────────────

export function mapStageToExecutionDestination(stageType: OrchestratorJobType): string {
  switch (stageType) {
    case "shopify_publish":  return EXECUTION_DESTINATION.SHOPIFY;
    case "catalog_sync":     return EXECUTION_DESTINATION.CATALOG;
    case "whatsapp_publish": return EXECUTION_DESTINATION.WHATSAPP;
    case "social_publish":   return EXECUTION_DESTINATION.SOCIAL;
    case "campaign_attach":  return EXECUTION_DESTINATION.CRM;
    case "asset_sync":       return EXECUTION_DESTINATION.INTERNAL;
    case "validation":       return EXECUTION_DESTINATION.INTERNAL;
    case "cleanup":          return EXECUTION_DESTINATION.INTERNAL;
    default:                 return EXECUTION_DESTINATION.INTERNAL;
  }
}

// ── Create an ExecutionJob for a stage ────────────────────────────────────────

export async function createExecutionJobForStage(opts: {
  organizationId:  string;
  planId:          string;
  stageId:         string;
  stageType:       OrchestratorJobType;
  channel?:        OrchestratorChannel;
  sourceEntityId?: string | null;
  productId?:      string | null;
  catalogId?:      string | null;
  retryCount?:     number;
  priority?:       number;
}): Promise<DispatchJobResult> {
  const jobType     = mapStageToExecutionJobType(opts.stageType, opts.channel);
  const destination = mapStageToExecutionDestination(opts.stageType);
  const entityId    = opts.stageId;
  const suffix      = opts.retryCount ? `retry${opts.retryCount}` : undefined;
  const idempotencyKey = suffix
    ? `${jobType}:${opts.organizationId}:${entityId}:${suffix}`
    : buildIdempotencyKey(jobType, opts.organizationId, entityId);

  return dispatchExecutionJob({
    organizationId:  opts.organizationId,
    jobType,
    destination,
    productId:       opts.productId  ?? null,
    catalogId:       opts.catalogId  ?? null,
    payload: {
      planId:   opts.planId,
      stageId:  opts.stageId,
      channel:  opts.channel ?? null,
      entityId: opts.sourceEntityId ?? null,
    },
    priority:       opts.priority ?? 5,
    idempotencyKey,
    maxRetries:     3,
  });
}

// ── Create an ExecutionJob for a direct action ────────────────────────────────

export async function createExecutionJobForAction(opts: {
  organizationId: string;
  actionType:     string;
  jobType:        string;
  destination:    string;
  entityId:       string;
  planId?:        string | null;
  productId?:     string | null;
  catalogId?:     string | null;
  payload?:       Record<string, unknown>;
  retryCount?:    number;
}): Promise<DispatchJobResult> {
  const suffix = opts.retryCount ? `retry${opts.retryCount}` : undefined;
  const idempotencyKey = suffix
    ? `${opts.actionType}:${opts.organizationId}:${opts.entityId}:${suffix}`
    : buildIdempotencyKey(opts.actionType, opts.organizationId, opts.entityId);

  return dispatchExecutionJob({
    organizationId:  opts.organizationId,
    jobType:         opts.jobType,
    destination:     opts.destination,
    productId:       opts.productId  ?? null,
    catalogId:       opts.catalogId  ?? null,
    payload: {
      planId:     opts.planId    ?? null,
      actionType: opts.actionType,
      entityId:   opts.entityId,
      ...(opts.payload ?? {}),
    },
    priority:       5,
    idempotencyKey,
    maxRetries:     3,
  });
}

// ── Run a linked execution job after creation ─────────────────────────────────
// Placeholder: in production this would push to queue / call execution runner

export async function runLinkedExecutionJob(opts: {
  organizationId: string;
  jobId:          string;
}): Promise<{ launched: boolean; jobId: string }> {
  // TODO: call execution-runner.runJob(opts.jobId) once queue is wired
  // For now: job is created as PENDING and worker will pick it up on next cycle
  return { launched: true, jobId: opts.jobId };
}
