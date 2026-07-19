/**
 * lib/marketing-studio/operators/placeholders/landing-operator.ts
 *
 * MS-19 — Landing Channel Operator (placeholder)
 *
 * Landing page publish requires CMS / Vercel integration.
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

export const landingOperator: ChannelOperator = {
  channel: OPERATOR_CHANNEL.LANDING,

  async dispatch(req: OperatorRequest): Promise<OperatorResult> {
    throw new OperatorNotImplementedError(OPERATOR_CHANNEL.LANDING, req.action);
  },

  async healthCheck(_organizationId: string): Promise<OperatorHealth> {
    return OPERATOR_HEALTH.UNKNOWN;
  },
};
