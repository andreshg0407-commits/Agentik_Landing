/**
 * lib/marketing-studio/operators/whatsapp/whatsapp-operator.ts
 *
 * MS-19 — WhatsApp Channel Operator
 *
 * Dispatches WhatsApp catalog preparation jobs.
 * Meta Business API integration happens inside the execution worker.
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

export const whatsappOperator: ChannelOperator = {
  channel: OPERATOR_CHANNEL.WHATSAPP,

  async dispatch(req: OperatorRequest): Promise<OperatorResult> {
    const started = Date.now();

    assertChannelNotRateLimited(OPERATOR_CHANNEL.WHATSAPP, req.organizationId);

    if (!req.catalogId && !req.entityId) {
      throw new OperatorValidationError(
        OPERATOR_CHANNEL.WHATSAPP,
        "catalogId or entityId is required for WhatsApp dispatch",
      );
    }

    try {
      const result = await createExecutionJobForAction({
        organizationId: req.organizationId,
        actionType:     `whatsapp.${req.action}`,
        jobType:        EXECUTION_JOB_TYPE.WHATSAPP_PREPARE_CATALOG,
        destination:    EXECUTION_DESTINATION.WHATSAPP,
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
        channel:        OPERATOR_CHANNEL.WHATSAPP,
        action:         req.action,
        status:         OPERATOR_STATUS.DISPATCHED,
        executionJobId,
        planId:         req.planId  ?? null,
        stageId:        req.stageId ?? null,
        resultPayload:  { wasDeduped: result.wasDeduped },
        durationMs,
      });

      await recordOperatorAuditEvent({
        organizationId: req.organizationId,
        channel:        OPERATOR_CHANNEL.WHATSAPP,
        action:         req.action as typeof OPERATOR_ACTION[keyof typeof OPERATOR_ACTION],
        actorId:        req.actorId ?? null,
        receiptId,
        planId:         req.planId  ?? null,
        stageId:        req.stageId ?? null,
        payload:        { executionJobId, wasDeduped: result.wasDeduped },
      });

      return operatorOk({
        channel:        OPERATOR_CHANNEL.WHATSAPP,
        action:         req.action as typeof OPERATOR_ACTION[keyof typeof OPERATOR_ACTION],
        receiptId,
        executionJobId,
        wasDeduped:     result.wasDeduped,
        durationMs,
      });

    } catch (err) {
      const opErr = toOperatorError(OPERATOR_CHANNEL.WHATSAPP, err);
      return operatorFailFromError(
        OPERATOR_CHANNEL.WHATSAPP,
        req.action as typeof OPERATOR_ACTION[keyof typeof OPERATOR_ACTION],
        opErr,
        { durationMs: Date.now() - started },
      );
    }
  },

  async healthCheck(_organizationId: string): Promise<OperatorHealth> {
    // WhatsApp health depends on Meta API credentials — placeholder for now
    return OPERATOR_HEALTH.HEALTHY;
  },
};
