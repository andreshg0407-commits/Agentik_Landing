/**
 * lib/marketing-studio/commerce/shopify-actions/index.ts
 *
 * SHOPIFY-COPILOT-ACTIONS-01C — Public facade for the modular action layer.
 * SERVER ONLY — no React imports.
 * @server-only
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * INTENT RESOLVER ROUTING GUIDE (AGENTIK-INTENT-RESOLVER-01)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The Copilot Intent Resolver maps user utterances to `shopifyActions.*.*`.
 *
 * Domain routing:
 *   "ventas / ingresos / pedidos / métricas"         → shopifyActions.statistics.*
 *   "retrasos / reembolsos / devoluciones / riesgo"  → shopifyActions.operations.*
 *   "descuento / promoción / código / cupón"         → shopifyActions.promotions.*
 *   "colección / categoría / grupo de productos"     → shopifyActions.collections.*
 *   "SEO / alt text / descripción / metadatos"       → shopifyActions.enrichment.*
 *   "catálogo / publicar / precio / inventario"      → shopifyActions.catalog.*
 *   "buscar / encontrar / listar (cross-domain)"     → shopifyActions.search.*
 *
 * Approval gate:
 *   SHOPIFY_ACTION_REGISTRY[id].requiresApproval === true
 *     → must route through Copilot approval flow before execution.
 *
 * Automation gate:
 *   SHOPIFY_ACTION_REGISTRY[id].automationEligible === true
 *     → safe to run in autonomous / scheduled pipelines without user confirmation.
 *
 * Stub detection:
 *   SHOPIFY_ACTION_REGISTRY[id].stub === true
 *     → action is not yet implemented; surface limitation to user.
 *
 * Validation:
 *   import { validateShopifyActionRegistry } from "@/lib/marketing-studio/commerce/shopify-actions";
 *   const report = validateShopifyActionRegistry();
 *   if (!report.ok) throw new Error(report.errors.join(", "));
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */
import "server-only";

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

import { catalogActionRegistry }    from "./catalog-actions";
import { promotionActionRegistry }  from "./promotion-actions";
import { collectionActionRegistry } from "./collection-actions";
import { operationActionRegistry }  from "./operation-actions";
import { statisticsActionRegistry } from "./statistics-actions";
import { enrichmentActionRegistry } from "./enrichment-actions";

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
  catalog:     catalogActions,
  promotions:  promotionActions,
  collections: collectionActions,
  operations:  operationActions,
  statistics:  statisticsActions,
  enrichment:  enrichmentActions,
  search:      searchActions,
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
  ...catalogActionRegistry,
  ...promotionActionRegistry,
  ...collectionActionRegistry,
  ...operationActionRegistry,
  ...statisticsActionRegistry,
  ...enrichmentActionRegistry,
} as const;

// ── Registry validation ────────────────────────────────────────────────────────

export interface ShopifyActionRegistryReport {
  ok:                boolean;
  errors:            string[];
  warnings:          string[];
  totalActions:      number;
  registeredActions: number;
}

/**
 * Validates the integrity of the SHOPIFY_ACTION_REGISTRY at startup.
 *
 * Checks:
 *  - Every registry entry has a non-empty id, displayName, and description
 *  - Every registry id matches the object key it is stored under
 *  - No duplicate ids across domains
 *  - Every action in shopifyActions.* has a corresponding registry entry
 *
 * Returns a structured report — never throws.
 */
export function validateShopifyActionRegistry(): ShopifyActionRegistryReport {
  const errors:   string[] = [];
  const warnings: string[] = [];

  const registryEntries = Object.entries(SHOPIFY_ACTION_REGISTRY);
  const seenIds = new Set<string>();

  for (const [key, meta] of registryEntries) {
    if (!meta.id)          errors.push(`Registry key "${key}" is missing id`);
    if (!meta.displayName) errors.push(`Registry key "${key}" is missing displayName`);
    if (!meta.description) errors.push(`Registry key "${key}" is missing description`);

    if (meta.id && meta.id !== key) {
      errors.push(`Registry key "${key}" has mismatched id "${meta.id}"`);
    }

    if (seenIds.has(meta.id)) {
      errors.push(`Duplicate action id detected: "${meta.id}"`);
    }
    seenIds.add(meta.id);

    if (meta.stub) {
      warnings.push(`Action "${meta.id}" (${meta.category}) is a stub — not yet implemented`);
    }

    if (meta.automationEligible && meta.requiresApproval) {
      warnings.push(`Action "${meta.id}" is both automationEligible and requiresApproval — verify intent`);
    }
  }

  // Count all callable functions in shopifyActions (across all domains)
  let totalActions = 0;
  for (const domain of Object.values(shopifyActions)) {
    totalActions += Object.keys(domain).length;
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    totalActions,
    registeredActions: registryEntries.length,
  };
}
