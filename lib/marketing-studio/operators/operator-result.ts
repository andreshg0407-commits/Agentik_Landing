/**
 * lib/marketing-studio/operators/operator-result.ts
 *
 * MS-19 — Channel Operator Layer: Result builder helpers
 */

import {
  OPERATOR_STATUS,
  type OperatorChannel,
  type OperatorAction,
  type OperatorResult,
  type OperatorFailureType,
} from "./operator-types";
import type { OperatorError } from "./operator-errors";

export function operatorOk(opts: {
  channel:         OperatorChannel;
  action:          OperatorAction;
  receiptId?:      string | null;
  executionJobId?: string | null;
  externalRef?:    string | null;
  wasDeduped?:     boolean;
  durationMs?:     number;
}): OperatorResult {
  return {
    success:        true,
    channel:        opts.channel,
    action:         opts.action,
    status:         opts.wasDeduped ? OPERATOR_STATUS.DISPATCHED : OPERATOR_STATUS.DISPATCHED,
    receiptId:      opts.receiptId      ?? null,
    executionJobId: opts.executionJobId ?? null,
    externalRef:    opts.externalRef    ?? null,
    wasDeduped:     opts.wasDeduped     ?? false,
    durationMs:     opts.durationMs,
  };
}

export function operatorFail(opts: {
  channel:  OperatorChannel;
  action:   OperatorAction;
  code:     OperatorFailureType;
  message:  string;
  receiptId?: string | null;
  durationMs?: number;
}): OperatorResult {
  return {
    success:   false,
    channel:   opts.channel,
    action:    opts.action,
    status:    OPERATOR_STATUS.FAILED,
    receiptId: opts.receiptId ?? null,
    durationMs: opts.durationMs,
    error: {
      code:    opts.code,
      message: opts.message,
    },
  };
}

export function operatorFailFromError(
  channel: OperatorChannel,
  action:  OperatorAction,
  err:     OperatorError,
  opts?:   { receiptId?: string | null; durationMs?: number },
): OperatorResult {
  return operatorFail({
    channel,
    action,
    code:      err.code as OperatorFailureType,
    message:   err.message,
    receiptId: opts?.receiptId ?? null,
    durationMs: opts?.durationMs,
  });
}
