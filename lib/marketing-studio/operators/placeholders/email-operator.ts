/**
 * lib/marketing-studio/operators/placeholders/email-operator.ts
 *
 * MS-19 — Email Channel Operator (placeholder)
 *
 * Email dispatch requires Resend / SendGrid integration.
 * Returns not_implemented until integration is wired.
 */

import { OperatorNotImplementedError } from "../operator-errors";
import {
  OPERATOR_CHANNEL,
  OPERATOR_HEALTH,
  type OperatorRequest,
  type OperatorResult,
  type OperatorHealth,
  type ChannelOperator,
} from "../operator-types";

export const emailOperator: ChannelOperator = {
  channel: OPERATOR_CHANNEL.EMAIL,

  async dispatch(req: OperatorRequest): Promise<OperatorResult> {
    throw new OperatorNotImplementedError(OPERATOR_CHANNEL.EMAIL, req.action);
  },

  async healthCheck(_organizationId: string): Promise<OperatorHealth> {
    return OPERATOR_HEALTH.UNKNOWN;
  },
};
