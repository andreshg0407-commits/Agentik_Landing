/**
 * lib/marketing-studio/commerce/shopify-runtime/shopify-action-provider.ts
 *
 * AGENTIK-RUNTIME-INTEGRATION-01 — Shopify ActionRegistryProvider implementation.
 * SERVER ONLY — no React imports, no UI dependencies.
 * @server-only
 *
 * This is the ONLY file where the Action Runtime and Shopify domain code meet.
 * The Runtime itself never imports SHOPIFY_ACTION_REGISTRY or shopifyActions.
 *
 * Responsibilities:
 *   1. Implement ActionRegistryProvider<ShopifyContext>
 *   2. Map "category.functionName" actionIds → shopifyActions calls
 *   3. Wrap ShopifyActionResult → ActionHandlerResult
 *   4. Delegate context resolution to an injected ShopifyContextResolver
 *   5. Expose all registered actions as ActionDefinition entries
 *
 * To add a new Shopify action to the runtime:
 *   1. Add it to the shopify-actions domain file (catalog, operations, etc.)
 *   2. Add a case to SHOPIFY_HANDLER_MAP below — or it will be registered as a stub handler
 *
 * Dependency direction (must never be violated):
 *   shopify-action-provider → ActionRegistryProvider (runtime, abstract interface only)
 *   shopify-action-provider → SHOPIFY_ACTION_REGISTRY + shopifyActions (domain)
 *   shopify-action-provider → ShopifyContextResolver (injected)
 *   runtime core (action-dispatcher, action-runtime) ← NEVER imports this file
 */
import "server-only";

import type {
  ActionRegistryProvider,
  ActionDefinition,
  ActionHandlerResult,
  ActionHandler,
} from "@/lib/copilot/runtime/action-dispatcher";

import type { ExecutionContext, RuntimeStepSpec } from "@/lib/copilot/runtime/runtime-types";

import {
  shopifyActions,
  SHOPIFY_ACTION_REGISTRY,
} from "@/lib/marketing-studio/commerce/shopify-actions";

import type { ShopifyContext } from "@/lib/marketing-studio/commerce/shopify-actions/action-types";
import type { ShopifyContextResolver } from "./shopify-context-resolver";

// ── Handler type ───────────────────────────────────────────────────────────────

/** Internal handler: (shopifyCtx, params) → ShopifyActionResult-like output */
type ShopifyHandlerFn = (
  ctx:    ShopifyContext,
  params: Record<string, unknown>,
) => Promise<{ success: boolean; data?: unknown; warnings: string[]; errors: string[]; summary: string }>;

// ── Handler dispatch table ─────────────────────────────────────────────────────

/**
 * Maps the last segment of an actionId (the function name) to its handler.
 *
 * All ShopifyActionResult types are compatible via structural typing:
 *   { success, data, warnings, errors, summary }
 *
 * Parameters are extracted from spec.parameters (Record<string, unknown>)
 * and cast to the expected types per action.
 *
 * Adding a new action: add a case here + register it in the domain action file.
 */
const SHOPIFY_HANDLER_MAP: Record<string, ShopifyHandlerFn> = {

  // ── Catalog ──────────────────────────────────────────────────────────────────

  publishPendingProducts: (ctx) =>
    shopifyActions.catalog.publishPendingProducts(ctx),

  publishProducts: (ctx, p) =>
    shopifyActions.catalog.publishProducts(ctx, (p.productIds as string[]) ?? []),

  syncCatalog: (ctx) =>
    shopifyActions.catalog.syncCatalog(ctx),

  findUnpublishedProducts: (ctx) =>
    shopifyActions.catalog.findUnpublishedProducts(ctx),

  findProductsWithoutImages: (ctx) =>
    shopifyActions.catalog.findProductsWithoutImages(ctx),

  findProductsWithoutPrice: (ctx) =>
    shopifyActions.catalog.findProductsWithoutPrice(ctx),

  findProductsWithoutDescription: (ctx) =>
    shopifyActions.catalog.findProductsWithoutDescription(ctx),

  findProductsWithoutSeo: (ctx) =>
    shopifyActions.catalog.findProductsWithoutSeo(ctx),

  findProductsWithoutCollections: (ctx) =>
    shopifyActions.catalog.findProductsWithoutCollections(ctx),

  findLowQualityProducts: (ctx, p) =>
    shopifyActions.catalog.findLowQualityProducts(ctx, {
      threshold: typeof p.threshold === "number" ? p.threshold : undefined,
    }),

  // ── Statistics ───────────────────────────────────────────────────────────────

  getOverview: (ctx) =>
    shopifyActions.statistics.getOverview(ctx),

  getAttentionSummary: (ctx) =>
    shopifyActions.statistics.getAttentionSummary(ctx),

  getSalesMetrics: (ctx) =>
    shopifyActions.statistics.getSalesMetrics(ctx),

  getCatalogMetrics: (ctx) =>
    shopifyActions.statistics.getCatalogMetrics(ctx),

  getPromotionMetrics: (ctx) =>
    shopifyActions.statistics.getPromotionMetrics(ctx),

  getOperationsMetrics: (ctx) =>
    shopifyActions.statistics.getOperationsMetrics(ctx),

  getTrendMetrics: (ctx) =>
    shopifyActions.statistics.getTrendMetrics(ctx),

  getExecutiveInsights: (ctx) =>
    shopifyActions.statistics.getExecutiveInsights(ctx),

  // ── Operations ───────────────────────────────────────────────────────────────

  findDelayedOrders: (ctx, p) =>
    shopifyActions.operations.findDelayedOrders(ctx, {
      minDays: typeof p.minDays === "number" ? p.minDays : undefined,
      carrier: typeof p.carrier === "string" ? p.carrier : undefined,
    }),

  findFailedPayments: (ctx) =>
    shopifyActions.operations.findFailedPayments(ctx),

  findPendingRefunds: (ctx) =>
    shopifyActions.operations.findPendingRefunds(ctx),

  findPendingReturns: (ctx) =>
    shopifyActions.operations.findPendingReturns(ctx),

  findOrdersAtRisk: (ctx) =>
    shopifyActions.operations.findOrdersAtRisk(ctx),

  findCarrierIncidents: (ctx) =>
    shopifyActions.operations.findCarrierIncidents(ctx),

  reviewCarrierPerformance: (ctx) =>
    shopifyActions.operations.reviewCarrierPerformance(ctx),

  // ── Promotions ───────────────────────────────────────────────────────────────

  createPromotion: (ctx, p) =>
    shopifyActions.promotions.createPromotion(
      ctx,
      p as unknown as Parameters<typeof shopifyActions.promotions.createPromotion>[1],
    ),

  duplicatePromotion: (ctx, p) =>
    shopifyActions.promotions.duplicatePromotion(
      ctx,
      p.promotionId as string,
      p.overrides as unknown as Parameters<typeof shopifyActions.promotions.duplicatePromotion>[2],
    ),

  schedulePromotion: (ctx, p) =>
    shopifyActions.promotions.schedulePromotion(
      ctx,
      p as unknown as Parameters<typeof shopifyActions.promotions.schedulePromotion>[1],
    ),

  pausePromotion: (ctx, p) =>
    shopifyActions.promotions.pausePromotion(ctx, p.promotionId as string),

  resumePromotion: (ctx, p) =>
    shopifyActions.promotions.resumePromotion(ctx, p.promotionId as string),

  expirePromotion: (ctx, p) =>
    shopifyActions.promotions.expirePromotion(ctx, p.promotionId as string),

  deletePromotion: (ctx, p) =>
    shopifyActions.promotions.deletePromotion(ctx, p.promotionId as string),

  generateDiscountCode: (ctx, p) =>
    shopifyActions.promotions.generateDiscountCode(
      ctx,
      p.promotionId as string,
      p.code as string,
    ),

  generateBulkDiscountCodes: (ctx, p) =>
    shopifyActions.promotions.generateBulkDiscountCodes(ctx, {
      promotionId: p.priceRuleId as string ?? p.promotionId as string ?? "",
      count:       typeof p.count  === "number" ? p.count  : 10,
      prefix:      typeof p.prefix === "string" ? p.prefix : "AGENTIK",
    }),

  findActivePromotions: (ctx) =>
    shopifyActions.promotions.findActivePromotions(ctx),

  findScheduledPromotions: (ctx) =>
    shopifyActions.promotions.findScheduledPromotions(ctx),

  findExpiredPromotions: (ctx) =>
    shopifyActions.promotions.findExpiredPromotions(ctx),

  // ── Enrichment ───────────────────────────────────────────────────────────────

  completeSeo: (ctx) =>
    shopifyActions.enrichment.completeSeo(ctx),

  completeSeoTitle: (ctx) =>
    shopifyActions.enrichment.completeSeoTitle(ctx),

  completeSeoDescription: (ctx) =>
    shopifyActions.enrichment.completeSeoDescription(ctx),

  completeAltText: (ctx) =>
    shopifyActions.enrichment.completeAltText(ctx),

  completeSearchKeywords: (ctx) =>
    shopifyActions.enrichment.completeSearchKeywords(ctx),

  completeCommercialDescription: (ctx) =>
    shopifyActions.enrichment.completeCommercialDescription(ctx),

  completeShopifyTitle: (ctx) =>
    shopifyActions.enrichment.completeShopifyTitle(ctx),

  completeCatalogMetadata: (ctx) =>
    shopifyActions.enrichment.completeCatalogMetadata(ctx),

  // ── Collections ──────────────────────────────────────────────────────────────

  findCollection: (ctx, p) =>
    shopifyActions.collections.findCollection(
      ctx,
      typeof p.query === "string" ? p.query : undefined,
    ),

  createCollection: (ctx, p) =>
    shopifyActions.collections.createCollection(ctx, {
      title:       p.title as string,
      description: typeof p.description === "string" ? p.description : undefined,
    }),

  addProductsToCollection: (ctx, p) =>
    shopifyActions.collections.addProductsToCollection(
      ctx,
      p.collectionId as number,
      (p.productIds as string[]) ?? [],
    ),

  removeProductsFromCollection: (ctx, p) =>
    shopifyActions.collections.removeProductsFromCollection(
      ctx,
      p.collectionId as number,
      (p.productIds as string[]) ?? [],
    ),

  syncCollection: (ctx, p) =>
    shopifyActions.collections.syncCollection(
      ctx,
      p.collectionId as number,
      typeof p.productIds !== "undefined" ? (p.productIds as string[]) : undefined,
    ),

  renameCollection: (ctx, p) =>
    shopifyActions.collections.renameCollection(
      ctx,
      p.collectionId as number,
      p.newTitle as string,
    ),

  deleteCollection: (ctx, p) =>
    shopifyActions.collections.deleteCollection(ctx, p.collectionId as number),

  findProductsOutsideCollections: (ctx) =>
    shopifyActions.collections.findProductsOutsideCollections(ctx),

};

// ── Result adapter ─────────────────────────────────────────────────────────────

/**
 * Wrap a ShopifyActionResult into an ActionHandlerResult.
 * The ShopifyActionResult type is structurally compatible — no import needed.
 */
function wrapResult(
  raw: { success: boolean; data?: unknown; warnings: string[]; errors: string[]; summary: string },
): ActionHandlerResult {
  const error = raw.success ? undefined : (raw.errors[0] ?? raw.summary ?? "Action failed");
  return {
    success:   raw.success,
    data:      raw.data,
    error,
    warnings:  [...raw.warnings, ...(!raw.success && raw.errors.length > 1 ? raw.errors.slice(1) : [])],
    auditNote: raw.summary,
  };
}

// ── Provider ───────────────────────────────────────────────────────────────────

/**
 * Shopify ActionRegistryProvider — bridges SHOPIFY_ACTION_REGISTRY to the
 * domain-agnostic ActionDispatcher.
 *
 * Usage:
 *   import { ShopifyActionProvider } from "@/lib/marketing-studio/commerce/shopify-runtime";
 *   import { staticShopifyContextResolver } from "...";
 *
 *   const provider = new ShopifyActionProvider(
 *     staticShopifyContextResolver({ organizationId: orgId, accessToken, shopDomain }),
 *   );
 *   dispatcher.registerProvider(provider);
 */
export class ShopifyActionProvider implements ActionRegistryProvider<ShopifyContext> {
  readonly domain = "shopify" as const;

  constructor(
    private readonly contextResolver: ShopifyContextResolver,
  ) {}

  // ── ActionRegistryProvider interface ────────────────────────────────────────

  /**
   * Build ActionDefinition entries for every entry in SHOPIFY_ACTION_REGISTRY.
   *
   * ActionId format: "{category}.{functionKey}"
   * e.g. "catalog.publishPendingProducts", "promotions.createPromotion"
   *
   * Actions without a handler in SHOPIFY_HANDLER_MAP are registered as
   * stub handlers (return not_found equivalent via success=false).
   */
  getActions(): ActionDefinition<ShopifyContext>[] {
    const definitions: ActionDefinition<ShopifyContext>[] = [];

    for (const [fnKey, meta] of Object.entries(SHOPIFY_ACTION_REGISTRY)) {
      const actionId = `${meta.category}.${fnKey}`;
      const handlerFn = SHOPIFY_HANDLER_MAP[fnKey];

      const handler: ActionHandler<ShopifyContext> = async (
        spec:    RuntimeStepSpec,
        _ctx:    ExecutionContext,
        shopCtx: ShopifyContext,
      ): Promise<ActionHandlerResult> => {
        if (!handlerFn) {
          // Handler not yet wired — surface as a descriptive stub result
          return {
            success:   false,
            error:     `Shopify action "${fnKey}" is not yet wired in the runtime handler map.`,
            warnings:  [`Stub: "${meta.displayName}" requires runtime implementation.`],
            auditNote: `Handler missing for ${actionId}`,
          };
        }

        try {
          const raw = await handlerFn(shopCtx, spec.parameters);
          return wrapResult(raw);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            success:   false,
            error:     `Shopify action "${fnKey}" threw an exception: ${message}`,
            warnings:  [],
            auditNote: `Exception in handler for ${actionId}`,
          };
        }
      };

      definitions.push({
        actionId,
        domain:             this.domain,
        displayName:        meta.displayName,
        requiresApproval:   meta.requiresApproval,
        automationEligible: meta.automationEligible,
        handler,
      });
    }

    return definitions;
  }

  /**
   * Resolve a ShopifyContext for the current execution.
   * Delegates to the injected resolver (static, env-based, or Vault-backed).
   */
  async resolveContext(ctx: ExecutionContext): Promise<ShopifyContext | null> {
    try {
      return await this.contextResolver(ctx);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[ShopifyActionProvider] resolveContext threw for tenant "${ctx.tenantId}": ${msg}`,
      );
      return null;
    }
  }
}
