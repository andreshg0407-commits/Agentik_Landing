/**
 * lib/marketing-studio/operators/social/social-operator.ts
 *
 * MS-19 — Social Channel Operator
 *
 * Dispatches social publishing execution jobs (Instagram, TikTok, Facebook, YouTube).
 * Channel is read from req.payload.channel or defaults to instagram.
 *
 * SERVER ONLY — never import in client components.
 */

import {
  createExecutionJobForAction,
} from "@/lib/marketing-studio/orchestrator/orchestrator-execution-bridge";
import {
  EXECUTION_JOB_TYPE,
  EXECUTION_DESTINATION,
} from "@/lib/marketing-studio/execution/execution-types";
import { createOperatorReceipt }    from "../operator-receipts";
import { recordOperatorAuditEvent } from "../operator-audit";
import { operatorOk, operatorFailFromError } from "../operator-result";
import { assertChannelNotRateLimited }       from "../operator-rate-limits";
import { toOperatorError, OperatorValidationError } from "../operator-errors";
import {
  OPERATOR_CHANNEL,
  OPERATOR_ACTION,
  OPERATOR_STATUS,
  OPERATOR_HEALTH,
  type OperatorRequest,
  type OperatorResult,
  type OperatorHealth,
  type ChannelOperator,
} from "../operator-types";

// Social sub-channel → ExecutionJobType
const SOCIAL_PLATFORM_JOB: Record<string, string> = {
  instagram: EXECUTION_JOB_TYPE.SOCIAL_PUBLISH_INSTAGRAM,
  tiktok:    EXECUTION_JOB_TYPE.SOCIAL_PUBLISH_TIKTOK,
  facebook:  EXECUTION_JOB_TYPE.SOCIAL_PUBLISH_FACEBOOK,
  youtube:   EXECUTION_JOB_TYPE.SOCIAL_PUBLISH_YOUTUBE,
};

export const socialOperator: ChannelOperator = {
  channel: OPERATOR_CHANNEL.SOCIAL,

  async dispatch(req: OperatorRequest): Promise<OperatorResult> {
    const started = Date.now();

    assertChannelNotRateLimited(OPERATOR_CHANNEL.SOCIAL, req.organizationId);

    const platform = (req.payload.platform as string | undefined) ?? "instagram";
    const jobType  = SOCIAL_PLATFORM_JOB[platform] ?? EXECUTION_JOB_TYPE.SOCIAL_PUBLISH_INSTAGRAM;

    if (!req.entityId && !req.productId) {
      throw new OperatorValidationError(
        OPERATOR_CHANNEL.SOCIAL,
        "entityId is required for social dispatch",
      );
    }

    try {
      const result = await createExecutionJobForAction({
        organizationId: req.organizationId,
        actionType:     `social.${platform}.${req.action}`,
        jobType,
        destination:    EXECUTION_DESTINATION.SOCIAL,
        entityId:       req.entityId ?? req.productId ?? req.organizationId,
        planId:         req.planId   ?? null,
        productId:      req.productId ?? null,
        catalogId:      req.catalogId ?? null,
        payload:        { ...req.payload, platform },
        retryCount:     req.retryCount ?? 0,
      });

      const durationMs     = Date.now() - started;
      const executionJobId = result.job?.id ?? null;

      const { id: receiptId } = await createOperatorReceipt({
        organizationId: req.organizationId,
        channel:        OPERATOR_CHANNEL.SOCIAL,
        action:         req.action,
        status:         OPERATOR_STATUS.DISPATCHED,
        executionJobId,
        planId:         req.planId  ?? null,
        stageId:        req.stageId ?? null,
        resultPayload:  { jobType, platform, wasDeduped: result.wasDeduped },
        durationMs,
      });

      await recordOperatorAuditEvent({
        organizationId: req.organizationId,
        channel:        OPERATOR_CHANNEL.SOCIAL,
        action:         req.action as typeof OPERATOR_ACTION[keyof typeof OPERATOR_ACTION],
        actorId:        req.actorId ?? null,
        receiptId,
        planId:         req.planId  ?? null,
        stageId:        req.stageId ?? null,
        payload:        { executionJobId, platform, wasDeduped: result.wasDeduped },
      });

      return operatorOk({
        channel:        OPERATOR_CHANNEL.SOCIAL,
        action:         req.action as typeof OPERATOR_ACTION[keyof typeof OPERATOR_ACTION],
        receiptId,
        executionJobId,
        wasDeduped:     result.wasDeduped,
        durationMs,
      });

    } catch (err) {
      const opErr = toOperatorError(OPERATOR_CHANNEL.SOCIAL, err);
      return operatorFailFromError(
        OPERATOR_CHANNEL.SOCIAL,
        req.action as typeof OPERATOR_ACTION[keyof typeof OPERATOR_ACTION],
        opErr,
        { durationMs: Date.now() - started },
      );
    }
  },

  async healthCheck(_organizationId: string): Promise<OperatorHealth> {
    return OPERATOR_HEALTH.HEALTHY;
  },
};
