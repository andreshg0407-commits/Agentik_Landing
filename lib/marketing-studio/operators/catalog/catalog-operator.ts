/**
 * lib/marketing-studio/operators/catalog/catalog-operator.ts
 *
 * MS-19 — Catalog Channel Operator
 *
 * Dispatches catalog rebuild / refresh readiness jobs.
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
import { toOperatorError }                   from "../operator-errors";
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

export const catalogOperator: ChannelOperator = {
  channel: OPERATOR_CHANNEL.CATALOG,

  async dispatch(req: OperatorRequest): Promise<OperatorResult> {
    const started = Date.now();

    assertChannelNotRateLimited(OPERATOR_CHANNEL.CATALOG, req.organizationId);

    try {
      const jobType = req.action === OPERATOR_ACTION.SYNC
        ? EXECUTION_JOB_TYPE.CATALOG_REBUILD
        : EXECUTION_JOB_TYPE.CATALOG_REFRESH_READINESS;

      const result = await createExecutionJobForAction({
        organizationId: req.organizationId,
        actionType:     `catalog.${req.action}`,
        jobType,
        destination:    EXECUTION_DESTINATION.CATALOG,
        entityId:       req.catalogId ?? req.entityId ?? req.organizationId,
        planId:         req.planId    ?? null,
        productId:      req.productId ?? null,
        catalogId:      req.catalogId ?? null,
        payload:        req.payload,
        retryCount:     req.retryCount ?? 0,
      });

      const durationMs     = Date.now() - started;
      const executionJobId = result.job?.id ?? null;

      const { id: receiptId } = await createOperatorReceipt({
        organizationId: req.organizationId,
        channel:        OPERATOR_CHANNEL.CATALOG,
        action:         req.action,
        status:         OPERATOR_STATUS.DISPATCHED,
        executionJobId,
        planId:         req.planId  ?? null,
        stageId:        req.stageId ?? null,
        resultPayload:  { jobType, wasDeduped: result.wasDeduped },
        durationMs,
      });

      await recordOperatorAuditEvent({
        organizationId: req.organizationId,
        channel:        OPERATOR_CHANNEL.CATALOG,
        action:         req.action as typeof OPERATOR_ACTION[keyof typeof OPERATOR_ACTION],
        actorId:        req.actorId ?? null,
        receiptId,
        planId:         req.planId  ?? null,
        stageId:        req.stageId ?? null,
        payload:        { executionJobId, jobType, wasDeduped: result.wasDeduped },
      });

      return operatorOk({
        channel:        OPERATOR_CHANNEL.CATALOG,
        action:         req.action as typeof OPERATOR_ACTION[keyof typeof OPERATOR_ACTION],
        receiptId,
        executionJobId,
        wasDeduped:     result.wasDeduped,
        durationMs,
      });

    } catch (err) {
      const opErr = toOperatorError(OPERATOR_CHANNEL.CATALOG, err);
      return operatorFailFromError(
        OPERATOR_CHANNEL.CATALOG,
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
