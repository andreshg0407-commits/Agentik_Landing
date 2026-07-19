/**
 * lib/marketing-studio/orchestrator/orchestrator-action-dispatcher.ts
 *
 * MS-18 — Execution Actions: Central action dispatcher
 *
 * Responsibilities:
 *   1. Validate organizationId
 *   2. Route to correct handler
 *   3. Wrap errors into safe OrchestratorActionResult
 *   4. Never expose internals to caller
 *
 * SERVER ONLY — never import in client components.
 */

import type {
  OrchestratorActionRequest,
  OrchestratorActionResult,
  OrchestratorActionType,
} from "./orchestrator-actions";
import {
  toActionError,
  ActionNotAllowedError,
  HandlerNotImplementedError,
  ORCHESTRATOR_ACTION_TYPE,
} from "./orchestrator-actions";
import {
  handleValidatePlan,
  handleRunPlan,
  handleRunStage,
  handleRunJob,
  handleRetryPlan,
  handleRetryStage,
  handlePausePlan,
  handleResumePlan,
  handleCancelPlan,
  handleArchivePlan,
  handleRebuildDependencies,
  handleRefreshHealth,
  handleSyncShopify,
  handlePublishSocial,
  handlePrepareWhatsApp,
  handleRebuildCatalog,
} from "./orchestrator-action-handlers";

// ── Action handler registry ───────────────────────────────────────────────────

type ActionHandler = (req: OrchestratorActionRequest) => Promise<OrchestratorActionResult>;

const HANDLER_REGISTRY: Partial<Record<OrchestratorActionType, ActionHandler>> = {
  [ORCHESTRATOR_ACTION_TYPE.VALIDATE_PLAN]:        handleValidatePlan,
  [ORCHESTRATOR_ACTION_TYPE.RUN_PLAN]:             handleRunPlan,
  [ORCHESTRATOR_ACTION_TYPE.RUN_STAGE]:            handleRunStage,
  [ORCHESTRATOR_ACTION_TYPE.RUN_JOB]:              handleRunJob,
  [ORCHESTRATOR_ACTION_TYPE.RETRY_PLAN]:           handleRetryPlan,
  [ORCHESTRATOR_ACTION_TYPE.RETRY_STAGE]:          handleRetryStage,
  [ORCHESTRATOR_ACTION_TYPE.PAUSE_PLAN]:           handlePausePlan,
  [ORCHESTRATOR_ACTION_TYPE.RESUME_PLAN]:          handleResumePlan,
  [ORCHESTRATOR_ACTION_TYPE.CANCEL_PLAN]:          handleCancelPlan,
  [ORCHESTRATOR_ACTION_TYPE.ARCHIVE_PLAN]:         handleArchivePlan,
  [ORCHESTRATOR_ACTION_TYPE.REBUILD_DEPENDENCIES]: handleRebuildDependencies,
  [ORCHESTRATOR_ACTION_TYPE.REFRESH_HEALTH]:       handleRefreshHealth,
  [ORCHESTRATOR_ACTION_TYPE.SYNC_SHOPIFY]:         handleSyncShopify,
  [ORCHESTRATOR_ACTION_TYPE.PUBLISH_SOCIAL]:       handlePublishSocial,
  [ORCHESTRATOR_ACTION_TYPE.PREPARE_WHATSAPP]:     handlePrepareWhatsApp,
  [ORCHESTRATOR_ACTION_TYPE.REBUILD_CATALOG]:      handleRebuildCatalog,
  // create_plan is handled via the plan builder directly — not via dispatcher
};

// ── Dispatcher ────────────────────────────────────────────────────────────────

export async function dispatchOrchestratorAction(
  req: OrchestratorActionRequest,
): Promise<OrchestratorActionResult> {
  // Basic validation
  if (!req.organizationId) {
    return failResult(req, new ActionNotAllowedError("organizationId is required"));
  }

  // Route to handler
  const handler = HANDLER_REGISTRY[req.actionType];
  if (!handler) {
    return failResult(req, new HandlerNotImplementedError(req.actionType));
  }

  try {
    return await handler(req);
  } catch (err) {
    return failResult(req, err);
  }
}

// ── Safe failure result ───────────────────────────────────────────────────────

function failResult(
  req: OrchestratorActionRequest,
  err: unknown,
): OrchestratorActionResult {
  return {
    success:        false,
    actionType:     req.actionType,
    planId:         req.planId,
    stageId:        req.stageId,
    jobId:          req.jobId,
    executionJobId: null,
    wasDeduped:     false,
    message:        "Action failed",
    newPlanStatus:  null,
    newStageStatus: null,
    error:          toActionError(err),
  };
}
