/**
 * lib/marketing-studio/operators/placeholders/ads-operator.ts
 *
 * MS-19 — Ads Channel Operator (placeholder)
 *
 * Ads dispatch requires Meta Ads / Google Ads credentials.
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

export const adsOperator: ChannelOperator = {
  channel: OPERATOR_CHANNEL.ADS,

  async dispatch(req: OperatorRequest): Promise<OperatorResult> {
    throw new OperatorNotImplementedError(OPERATOR_CHANNEL.ADS, req.action);
  },

  async healthCheck(_organizationId: string): Promise<OperatorHealth> {
    return OPERATOR_HEALTH.UNKNOWN;
  },
};
