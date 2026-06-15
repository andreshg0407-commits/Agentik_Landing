/**
 * lib/marketing-studio/commerce/shopify-actions/index.ts
 *
 * SHOPIFY-COPILOT-ACTIONS-01B — Public facade for the modular action layer.
 *
 * Exports:
 *   shopifyActions      — top-level Copilot-callable API grouped by domain
 *   SHOPIFY_ACTION_REGISTRY — flat registry of all action metadata
 *
 * All types from action-types.ts are re-exported for consumer convenience.
 *
 * SERVER ONLY — never import from client components.
 */

// ── Domain objects ─────────────────────────────────────────────────────────────

export { catalogActions }    from "./catalog-actions";
export { promotionActions, findPromotionByName }  from "./promotion-actions";
export { collectionActions, findCollectionByName } from "./collection-actions";
export { operationActions }  from "./operation-actions";
export { statisticsActions } from "./statistics-actions";
export { enrichmentActions } from "./enrichment-actions";
export { searchActions }     from "./search-actions";

// ── Types ──────────────────────────────────────────────────────────────────────

export type {
  ShopifyActionCategory,
  ShopifyActionMeta,
  ShopifyActionResult,
  ShopifyExecutionPlan,
  ShopifyContext,
} from "./action-types";

// ── Composition ────────────────────────────────────────────────────────────────

import { catalogActions }    from "./catalog-actions";
import { promotionActions }  from "./promotion-actions";
import { collectionActions } from "./collection-actions";
import { operationActions }  from "./operation-actions";
import { statisticsActions } from "./statistics-actions";
import { enrichmentActions } from "./enrichment-actions";
import { searchActions }     from "./search-actions";

import { CATALOG_ACTION_META }    from "./catalog-actions";
import { PROMOTION_ACTION_META }  from "./promotion-actions";
import { COLLECTION_ACTION_META } from "./collection-actions";
import { OPERATION_ACTION_META }  from "./operation-actions";
import { STATISTICS_ACTION_META } from "./statistics-actions";
import { ENRICHMENT_ACTION_META } from "./enrichment-actions";

/**
 * Top-level Copilot-callable interface for all Shopify operations.
 *
 * Grouped by business domain for clear intent routing.
 *
 * Usage:
 *   import { shopifyActions } from "@/lib/marketing-studio/commerce/shopify-actions";
 *   const ctx = { organizationId, accessToken, shopDomain };
 *
 *   const overview  = await shopifyActions.statistics.getOverview(ctx);
 *   const attention = await shopifyActions.statistics.getAttentionSummary(ctx);
 *   const delayed   = await shopifyActions.operations.findDelayedOrders(ctx);
 *   const active    = await shopifyActions.promotions.findActivePromotions(ctx);
 */
export const shopifyActions = {
  catalog:    catalogActions,
  promotions: promotionActions,
  collections: collectionActions,
  operations: operationActions,
  statistics: statisticsActions,
  enrichment: enrichmentActions,
  search:     searchActions,
} as const;

/**
 * Central registry of all Shopify actions supported by Agentik.
 * Composed from per-domain metadata records.
 *
 * Copilot uses this registry to:
 *   - Discover available operations
 *   - Route user intents to the correct action
 *   - Enforce approval policies before execution
 *   - Surface stub limitations to the user
 */
export const SHOPIFY_ACTION_REGISTRY = {
  ...CATALOG_ACTION_META,
  ...PROMOTION_ACTION_META,
  ...COLLECTION_ACTION_META,
  ...OPERATION_ACTION_META,
  ...STATISTICS_ACTION_META,
  ...ENRICHMENT_ACTION_META,
} as const;
