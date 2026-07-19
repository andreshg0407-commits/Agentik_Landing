/**
 * lib/marketing-studio/operators/operator-dispatcher.ts
 *
 * MS-19 — Channel Operator Layer: Main dispatch entrypoint
 *
 * All operator dispatches route through here.
 * Handles channel resolution, error wrapping, and logging.
 *
 * SERVER ONLY — never import in client components.
 */

import { getOperator }            from "./operator-registry";
import { toOperatorError }        from "./operator-errors";
import { operatorFailFromError }  from "./operator-result";
import { OPERATOR_ACTION }        from "./operator-types";
import type {
  OperatorRequest,
  OperatorResult,
  OperatorChannel,
} from "./operator-types";

// ── Main dispatch ─────────────────────────────────────────────────────────────

export async function dispatchOperatorRequest(
  req: OperatorRequest,
): Promise<OperatorResult> {
  const operator = getOperator(req.channel);

  try {
    return await operator.dispatch(req);
  } catch (err) {
    const opErr = toOperatorError(req.channel, err);
    return operatorFailFromError(
      req.channel,
      req.action,
      opErr,
    );
  }
}

// ── Convenience wrappers ──────────────────────────────────────────────────────

export async function dispatchShopifyPublish(opts: {
  organizationId: string;
  productId:      string;
  planId?:        string | null;
  stageId?:       string | null;
  actorId?:       string | null;
  retryCount?:    number;
}): Promise<OperatorResult> {
  return dispatchOperatorRequest({
    organizationId: opts.organizationId,
    channel:        "shopify",
    action:         OPERATOR_ACTION.PUBLISH,
    actorId:        opts.actorId   ?? null,
    planId:         opts.planId    ?? null,
    stageId:        opts.stageId   ?? null,
    productId:      opts.productId,
    retryCount:     opts.retryCount ?? 0,
    payload:        {},
  });
}

export async function dispatchSocialPublish(opts: {
  organizationId: string;
  entityId:       string;
  platform:       string;
  planId?:        string | null;
  stageId?:       string | null;
  actorId?:       string | null;
  retryCount?:    number;
}): Promise<OperatorResult> {
  return dispatchOperatorRequest({
    organizationId: opts.organizationId,
    channel:        "social",
    action:         OPERATOR_ACTION.PUBLISH,
    actorId:        opts.actorId ?? null,
    planId:         opts.planId  ?? null,
    stageId:        opts.stageId ?? null,
    entityId:       opts.entityId,
    retryCount:     opts.retryCount ?? 0,
    payload:        { platform: opts.platform },
  });
}

export async function dispatchWhatsAppPrepare(opts: {
  organizationId: string;
  catalogId:      string;
  planId?:        string | null;
  stageId?:       string | null;
  actorId?:       string | null;
}): Promise<OperatorResult> {
  return dispatchOperatorRequest({
    organizationId: opts.organizationId,
    channel:        "whatsapp",
    action:         OPERATOR_ACTION.PREPARE,
    actorId:        opts.actorId  ?? null,
    planId:         opts.planId   ?? null,
    stageId:        opts.stageId  ?? null,
    catalogId:      opts.catalogId,
    payload:        {},
  });
}

export async function dispatchCatalogRebuild(opts: {
  organizationId: string;
  catalogId?:     string | null;
  planId?:        string | null;
  stageId?:       string | null;
  actorId?:       string | null;
}): Promise<OperatorResult> {
  return dispatchOperatorRequest({
    organizationId: opts.organizationId,
    channel:        "catalog",
    action:         OPERATOR_ACTION.SYNC,
    actorId:        opts.actorId  ?? null,
    planId:         opts.planId   ?? null,
    stageId:        opts.stageId  ?? null,
    catalogId:      opts.catalogId ?? null,
    payload:        {},
  });
}

// ── Multi-channel broadcast ───────────────────────────────────────────────────

export async function broadcastToChannels(
  channels:       OperatorChannel[],
  baseReq:        Omit<OperatorRequest, "channel">,
): Promise<OperatorResult[]> {
  return Promise.all(
    channels.map(channel => dispatchOperatorRequest({ ...baseReq, channel })),
  );
}
