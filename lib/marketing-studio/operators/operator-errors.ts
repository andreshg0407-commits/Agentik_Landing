/**
 * lib/marketing-studio/operators/operator-errors.ts
 *
 * MS-19 — Channel Operator Layer: Typed error classes
 */

import { OPERATOR_FAILURE_TYPE, type OperatorChannel } from "./operator-types";

export class OperatorError extends Error {
  constructor(
    public readonly code:    string,
    public readonly channel: OperatorChannel,
    message:                 string,
  ) {
    super(message);
    this.name = "OperatorError";
  }
}

export class OperatorRateLimitError extends OperatorError {
  constructor(channel: OperatorChannel, retryAfterMs?: number) {
    super(
      OPERATOR_FAILURE_TYPE.RATE_LIMITED,
      channel,
      `Rate limited on channel ${channel}${retryAfterMs ? ` — retry in ${retryAfterMs}ms` : ""}`,
    );
    this.name = "OperatorRateLimitError";
  }
}

export class OperatorValidationError extends OperatorError {
  constructor(channel: OperatorChannel, detail: string) {
    super(OPERATOR_FAILURE_TYPE.VALIDATION_FAILED, channel, `Validation failed [${channel}]: ${detail}`);
    this.name = "OperatorValidationError";
  }
}

export class OperatorNotImplementedError extends OperatorError {
  constructor(channel: OperatorChannel, action: string) {
    super(
      OPERATOR_FAILURE_TYPE.NOT_IMPLEMENTED,
      channel,
      `Action "${action}" not implemented for channel ${channel}`,
    );
    this.name = "OperatorNotImplementedError";
  }
}

export class OperatorExternalError extends OperatorError {
  constructor(channel: OperatorChannel, message: string) {
    super(OPERATOR_FAILURE_TYPE.EXTERNAL_ERROR, channel, message);
    this.name = "OperatorExternalError";
  }
}

export class OperatorNotFoundError extends OperatorError {
  constructor(channel: OperatorChannel) {
    super(
      OPERATOR_FAILURE_TYPE.NOT_IMPLEMENTED,
      channel,
      `No operator registered for channel: ${channel}`,
    );
    this.name = "OperatorNotFoundError";
  }
}

export function toOperatorError(
  channel: OperatorChannel,
  err: unknown,
): OperatorError {
  if (err instanceof OperatorError) return err;
  const message = err instanceof Error ? err.message : "Unknown error";
  return new OperatorError(OPERATOR_FAILURE_TYPE.EXECUTION_ERROR, channel, message);
}
