/**
 * lib/marketing-studio/operators/operator-registry.ts
 *
 * MS-19 — Channel Operator Layer: Central operator registry
 *
 * SERVER ONLY — never import in client components.
 */

import { shopifyOperator }  from "./shopify/shopify-operator";
import { socialOperator }   from "./social/social-operator";
import { whatsappOperator } from "./whatsapp/whatsapp-operator";
import { catalogOperator }  from "./catalog/catalog-operator";
import { adsOperator }      from "./placeholders/ads-operator";
import { emailOperator }    from "./placeholders/email-operator";
import { landingOperator }  from "./placeholders/landing-operator";
import { OperatorNotFoundError } from "./operator-errors";
import type { ChannelOperator, OperatorChannel } from "./operator-types";

// ── Registry map ──────────────────────────────────────────────────────────────

const _registry = new Map<OperatorChannel, ChannelOperator>([
  ["shopify",  shopifyOperator],
  ["social",   socialOperator],
  ["whatsapp", whatsappOperator],
  ["catalog",  catalogOperator],
  ["ads",      adsOperator],
  ["email",    emailOperator],
  ["landing",  landingOperator],
]);

// ── Public API ────────────────────────────────────────────────────────────────

export function getOperator(channel: OperatorChannel): ChannelOperator {
  const op = _registry.get(channel);
  if (!op) throw new OperatorNotFoundError(channel);
  return op;
}

export function listOperators(): ChannelOperator[] {
  return Array.from(_registry.values());
}

export function isChannelSupported(channel: string): channel is OperatorChannel {
  return _registry.has(channel as OperatorChannel);
}
