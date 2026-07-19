/**
 * lib/marketing-studio/operators/shopify/shopify-operator.ts
 *
 * MS-19 — Shopify Channel Operator
 *
 * Dispatches Shopify execution jobs via the existing ExecutionJob infrastructure.
 * Does NOT call Shopify APIs directly — that is handled by the execution worker.
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
import {
  createOperatorReceipt,
} from "../operator-receipts";
import {
  recordOperatorAuditEvent,
} from "../operator-audit";
import {
  operatorOk,
  operatorFailFromError,
} from "../operator-result";
import {
  assertChannelNotRateLimited,
} from "../operator-rate-limits";
import {
  toOperatorError,
  OperatorValidationError,
} from "../operator-errors";
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

export const shopifyOperator: ChannelOperator = {
  channel: OPERATOR_CHANNEL.SHOPIFY,

  async dispatch(req: OperatorRequest): Promise<OperatorResult> {
    const started = Date.now();

    assertChannelNotRateLimited(OPERATOR_CHANNEL.SHOPIFY, req.organizationId);

    // Validate
    if (!req.productId && !req.entityId) {
      throw new OperatorValidationError(
        OPERATOR_CHANNEL.SHOPIFY,
        "productId or entityId is required for Shopify dispatch",
      );
    }

    try {
      const jobType = req.action === OPERATOR_ACTION.SYNC
        ? EXECUTION_JOB_TYPE.CATALOG_REBUILD
        : EXECUTION_JOB_TYPE.SHOPIFY_PUBLISH_DRAFT;

      const result = await createExecutionJobForAction({
        organizationId: req.organizationId,
        actionType:     `shopify.${req.action}`,
        jobType,
        destination:    EXECUTION_DESTINATION.SHOPIFY,
        entityId:       req.productId ?? req.entityId ?? req.organizationId,
        planId:         req.planId    ?? null,
        productId:      req.productId ?? null,
        catalogId:      req.catalogId ?? null,
        payload:        req.payload,
        retryCount:     req.retryCount ?? 0,
      });

      const durationMs = Date.now() - started;
      const executionJobId = result.job?.id ?? null;

      const { id: receiptId } = await createOperatorReceipt({
        organizationId: req.organizationId,
        channel:        OPERATOR_CHANNEL.SHOPIFY,
        action:         req.action,
        status:         result.wasDeduped ? OPERATOR_STATUS.DISPATCHED : OPERATOR_STATUS.DISPATCHED,
        executionJobId,
        planId:         req.planId  ?? null,
        stageId:        req.stageId ?? null,
        resultPayload:  { jobType, wasDeduped: result.wasDeduped },
        durationMs,
      });

      await recordOperatorAuditEvent({
        organizationId: req.organizationId,
        channel:        OPERATOR_CHANNEL.SHOPIFY,
        action:         req.action as typeof OPERATOR_ACTION[keyof typeof OPERATOR_ACTION],
        actorId:        req.actorId ?? null,
        receiptId,
        planId:         req.planId  ?? null,
        stageId:        req.stageId ?? null,
        payload:        { executionJobId, wasDeduped: result.wasDeduped },
      });

      return operatorOk({
        channel:        OPERATOR_CHANNEL.SHOPIFY,
        action:         req.action as typeof OPERATOR_ACTION[keyof typeof OPERATOR_ACTION],
        receiptId,
        executionJobId,
        wasDeduped:     result.wasDeduped,
        durationMs,
      });

    } catch (err) {
      const opErr = toOperatorError(OPERATOR_CHANNEL.SHOPIFY, err);
      return operatorFailFromError(
        OPERATOR_CHANNEL.SHOPIFY,
        req.action as typeof OPERATOR_ACTION[keyof typeof OPERATOR_ACTION],
        opErr,
        { durationMs: Date.now() - started },
      );
    }
  },

  async healthCheck(_organizationId: string): Promise<OperatorHealth> {
    // Shopify health is inferred from recent receipt stats in operator-health.ts
    // Direct API ping would go here once credentials are wired
    return OPERATOR_HEALTH.HEALTHY;
  },
};
