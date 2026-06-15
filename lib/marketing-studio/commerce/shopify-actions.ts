/**
 * lib/marketing-studio/commerce/shopify-actions.ts
 *
 * SHOPIFY-COPILOT-ACTIONS-01 — Unified Shopify Action Layer
 *
 * SERVER ONLY — never import from client components.
 *
 * This file is the official internal API for any intelligent interaction with
 * the Shopify domain inside Agentik. It wraps all lower-level services and
 * provides a stable, Copilot-callable surface grouped by business category.
 *
 * ── Architectural invariants ──────────────────────────────────────────────────
 *
 *   - No React imports. No Next.js router imports.
 *   - No Shopify REST or GraphQL details leak through the public surface.
 *   - All logic is delegated to domain services — zero logic duplication.
 *   - Every function accepts a ShopifyContext: { organizationId, accessToken, shopDomain }
 *   - accessToken is never logged (⚠ server-only param).
 *   - Enrichment actions are STUBBED — prepared as extension points, not live AI.
 *   - All functions return ShopifyActionResult<T> — consistent contract everywhere.
 *
 * ── Copilot usage pattern ─────────────────────────────────────────────────────
 *
 *   User: "Publica todos los productos pendientes."
 *     Copilot: await shopifyActions.catalog.publishPendingProducts(ctx)
 *
 *   User: "¿Qué pedidos tienen pagos fallidos?"
 *     Copilot: await shopifyActions.operations.findFailedPayments(ctx)
 *
 *   User: "Crea una promoción del 20% para juguetes."
 *     Copilot: await shopifyActions.promotions.createPromotion(ctx, input)
 *
 *   User: "Muéstrame el resumen ejecutivo de la tienda."
 *     Copilot: await shopifyActions.statistics.getOverview(ctx)
 *
 *   User: "¿Qué productos no tienen descripción?"
 *     Copilot: await shopifyActions.catalog.findProductsWithoutDescription(ctx)
 *
 *   User: "¿Qué promociones vencen esta semana?"
 *     Copilot: await shopifyActions.promotions.findScheduledPromotions(ctx)
 *
 *   User: "Completa la información faltante del catálogo."
 *     Copilot: await shopifyActions.enrichment.completeCatalogMetadata(ctx)
 *
 *   User: "Genera códigos de descuento para clientes VIP."
 *     Copilot: await shopifyActions.promotions.generateBulkDiscountCodes(ctx, opts)
 *
 *   User: "¿Qué indicadores requieren atención?"
 *     Copilot: await shopifyActions.statistics.getAttentionSummary(ctx)
 *
 *   User: "Optimiza el SEO de los productos sin completar."
 *     Copilot: await shopifyActions.enrichment.completeSeo(ctx)
 */

import { listProductConsoleItems }            from "@/lib/marketing-studio/products/product-query-service";
import {
  listPromotions,
  createPromotion      as _createPromotion,
  duplicatePromotion   as _duplicatePromotion,
  schedulePromotion    as _schedulePromotion,
  disablePromotion     as _disablePromotion,
  findPromotion        as _findPromotion,
  generateDiscountCode as _generateDiscountCode,
}                                             from "./shopify-promotions-service";
import {
  listDelayedShipments,
  listFailedPayments,
  listReturns,
  listRefunds,
  findOrdersAtRisk     as _findOrdersAtRisk,
  findFailedDeliveries,
  findPendingRefunds   as _findPendingRefunds,
  listCarrierPerformance,
}                                             from "./shopify-operations-service";
import {
  findShopifyCollections,
  createShopifyCollection,
  syncProductsToCollection,
  removeProductsFromCollection as _removeProductsFromCollection,
}                                             from "./shopify-collections-service";
import {
  getOverview          as _getOverview,
  getSalesMetrics      as _getSalesMetrics,
  getCatalogMetrics    as _getCatalogMetrics,
  getPromotionMetrics  as _getPromotionMetrics,
  getOperationsMetrics as _getOperationsMetrics,
  getTrendAnalysis     as _getTrendAnalysis,
  getExecutiveInsights as _getExecutiveInsights,
}                                             from "./shopify-statistics-service";
import type { PromotionCreateInput }          from "./shopify-promotions-types";
import type { StatisticsPeriod }              from "./shopify-statistics-types";

// ── Canonical types ────────────────────────────────────────────────────────────

export type ShopifyActionCategory =
  | "catalog"
  | "promotions"
  | "collections"
  | "operations"
  | "statistics"
  | "enrichment"
  | "search";

/**
 * Registry entry for a single Shopify action.
 * Used for introspection, capability listing, and Copilot documentation.
 */
export interface ShopifyActionMeta {
  /** Stable identifier. Never renamed — used as Copilot routing key. */
  id:                string;
  category:          ShopifyActionCategory;
  displayName:       string;
  description:       string;
  /** If true, Copilot MUST present a confirmation to the user before executing. */
  requiresApproval:  boolean;
  /**
   * If true, the action may be invoked by automation workers without user confirmation.
   * Copilot MUST NOT bypass requiresApproval when automationEligible = true.
   * Both flags are independent — an action can be automatable AND require approval.
   */
  automationEligible: boolean;
  /** Whether the Copilot layer can reason about and invoke this action. */
  supportedByCopilot: boolean;
  /** Human-readable list of inputs Copilot expects from the user or context. */
  expectedInputs:    string[];
  /** Human-readable list of outputs this action returns. */
  expectedOutputs:   string[];
  /**
   * true if the action is a stub (extension point — not yet fully implemented).
   * Copilot should communicate this limitation to the user.
   */
  stub?:             boolean;
}

/**
 * Standardised result for every Shopify action.
 *
 * All service functions return ShopifyActionResult — UI, API, and Copilot
 * can consume a single contract without special-casing per domain.
 *
 * Copilot read-aloud template:
 *   "{success ? '✓' : '✗'} {summary}
 *    Ejecutados: {executed} | Omitidos: {skipped} | Fallidos: {failed}
 *    {warnings.length > 0 ? 'Advertencias: ' + warnings.join(', ') : ''}"
 */
export interface ShopifyActionResult<T = unknown> {
  success:       boolean;
  /** The domain payload (list, entity, metrics, etc.). */
  data:          T;
  /** Number of records processed successfully. */
  executed:      number;
  /** Records intentionally skipped (already in desired state, filtered out). */
  skipped:       number;
  /** Records that failed processing. */
  failed:        number;
  /** Non-blocking warnings that did not stop execution. */
  warnings:      string[];
  /** Error messages for failed records. */
  errors:        string[];
  /** Wall-clock time in milliseconds. */
  executionTime: number;
  /** Copilot-ready plain-Spanish summary of what happened. */
  summary:       string;
}

/**
 * Pre-execution plan for bulk or destructive Shopify operations.
 * Copilot MUST build this plan and present it for user approval before executing
 * any action where requiresApproval = true.
 *
 * Copilot usage:
 *   const plan = buildExecutionPlan(...)
 *   // present plan to user → await confirmation
 *   // if confirmed: execute actions in plan.actions order
 */
export interface ShopifyExecutionPlan {
  title:               string;
  summary:             string;
  /** Ordered list of action metadata that will be executed. */
  actions:             ShopifyActionMeta[];
  /** Human-readable count of expected state changes. */
  estimatedChanges:    string;
  /** Entities that will be modified (product IDs, promotion IDs, etc.). */
  affectedResources:   string[];
  requiresApproval:    boolean;
  /** Whether the batch can be reversed without data loss. */
  canRollback:         boolean;
  /** Risk warnings user must acknowledge before execution. */
  warnings:            string[];
  /** Exact text Copilot must show the user when requesting confirmation. */
  confirmationMessage: string;
}

/**
 * Shared context injected into every action.
 * accessToken is server-only and must never be exposed to client components.
 */
export interface ShopifyContext {
  organizationId: string;
  accessToken:    string;   // ⚠ server-only
  shopDomain:     string;
}

// ── Action registry ────────────────────────────────────────────────────────────

/**
 * Central registry of all Shopify actions supported by Agentik.
 *
 * Copilot uses this registry to:
 *   - Discover available operations
 *   - Route user intents to the correct action
 *   - Enforce approval policies before execution
 *   - Surface stub limitations to the user
 */
export const SHOPIFY_ACTION_REGISTRY: Record<string, ShopifyActionMeta> = {

  // ── Catalog ──────────────────────────────────────────────────────────────

  publishPendingProducts: {
    id: "publishPendingProducts", category: "catalog",
    displayName: "Publicar productos pendientes",
    description: "Publica en Shopify todos los productos en estado pendiente del catálogo de Agentik.",
    requiresApproval: true, automationEligible: false, supportedByCopilot: true, stub: true,
    expectedInputs:  [],
    expectedOutputs: ["Lista de productos publicados", "Errores por producto"],
  },
  publishProducts: {
    id: "publishProducts", category: "catalog",
    displayName: "Publicar productos seleccionados",
    description: "Publica en Shopify los productos con los IDs indicados.",
    requiresApproval: true, automationEligible: false, supportedByCopilot: true, stub: true,
    expectedInputs:  ["productIds: string[]"],
    expectedOutputs: ["Resultado de publicación por producto"],
  },
  syncCatalog: {
    id: "syncCatalog", category: "catalog",
    displayName: "Sincronizar catálogo completo",
    description: "Sincroniza el estado del catálogo de Agentik con Shopify (lectura/escritura).",
    requiresApproval: true, automationEligible: false, supportedByCopilot: true, stub: true,
    expectedInputs:  [],
    expectedOutputs: ["Estado de sincronización por producto"],
  },
  findUnpublishedProducts: {
    id: "findUnpublishedProducts", category: "catalog",
    displayName: "Buscar productos sin publicar",
    description: "Lista los productos del catálogo que aún no se han publicado en Shopify.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  [],
    expectedOutputs: ["ProductConsoleItem[]"],
  },
  findProductsWithoutImages: {
    id: "findProductsWithoutImages", category: "catalog",
    displayName: "Buscar productos sin imágenes",
    description: "Devuelve productos sin imagen principal cargada.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  [],
    expectedOutputs: ["ProductConsoleItem[]"],
  },
  findProductsWithoutPrice: {
    id: "findProductsWithoutPrice", category: "catalog",
    displayName: "Buscar productos sin precio",
    description: "Devuelve productos sin precio comercial definido.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  [],
    expectedOutputs: ["ProductConsoleItem[]"],
  },
  findProductsWithoutDescription: {
    id: "findProductsWithoutDescription", category: "catalog",
    displayName: "Buscar productos sin descripción",
    description: "Devuelve productos sin texto comercial registrado.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true, stub: true,
    expectedInputs:  [],
    expectedOutputs: ["ProductConsoleItem[]"],
  },
  findProductsWithoutSeo: {
    id: "findProductsWithoutSeo", category: "catalog",
    displayName: "Buscar productos sin SEO",
    description: "Devuelve productos publicados en Shopify sin metadatos SEO completados.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true, stub: true,
    expectedInputs:  [],
    expectedOutputs: ["ProductConsoleItem[]"],
  },
  findProductsWithoutCollections: {
    id: "findProductsWithoutCollections", category: "catalog",
    displayName: "Buscar productos fuera de colecciones",
    description: "Devuelve productos publicados en Shopify que no pertenecen a ninguna colección.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true, stub: true,
    expectedInputs:  [],
    expectedOutputs: ["ProductConsoleItem[]"],
  },
  findLowQualityProducts: {
    id: "findLowQualityProducts", category: "catalog",
    displayName: "Buscar productos con calidad baja",
    description: "Devuelve productos cuyo readinessScore es inferior al umbral de calidad.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  ["threshold?: number (default: 70)"],
    expectedOutputs: ["ProductConsoleItem[]"],
  },

  // ── Promotions ────────────────────────────────────────────────────────────

  createPromotion: {
    id: "createPromotion", category: "promotions",
    displayName: "Crear promoción",
    description: "Crea una nueva regla de descuento en Shopify con los parámetros indicados.",
    requiresApproval: true, automationEligible: false, supportedByCopilot: true,
    expectedInputs:  ["PromotionCreateInput"],
    expectedOutputs: ["PromotionOperationResult"],
  },
  duplicatePromotion: {
    id: "duplicatePromotion", category: "promotions",
    displayName: "Duplicar promoción",
    description: "Duplica una promoción existente con un nuevo título y fecha de inicio.",
    requiresApproval: true, automationEligible: false, supportedByCopilot: true,
    expectedInputs:  ["promotionId: string", "overrides?: Partial<PromotionCreateInput>"],
    expectedOutputs: ["PromotionOperationResult"],
  },
  schedulePromotion: {
    id: "schedulePromotion", category: "promotions",
    displayName: "Programar promoción",
    description: "Programa una promoción para que se active en una fecha futura.",
    requiresApproval: true, automationEligible: false, supportedByCopilot: true,
    expectedInputs:  ["PromotionCreateInput con startsAt futuro"],
    expectedOutputs: ["PromotionOperationResult"],
  },
  pausePromotion: {
    id: "pausePromotion", category: "promotions",
    displayName: "Pausar promoción",
    description: "Desactiva una promoción activa sin eliminarla.",
    requiresApproval: true, automationEligible: false, supportedByCopilot: true,
    expectedInputs:  ["promotionId: string"],
    expectedOutputs: ["PromotionOperationResult"],
  },
  generateDiscountCode: {
    id: "generateDiscountCode", category: "promotions",
    displayName: "Generar código de descuento",
    description: "Genera un nuevo código de descuento asociado a una regla de precio existente.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  ["promotionId: string", "code: string"],
    expectedOutputs: ["PromotionOperationResult"],
  },
  generateBulkDiscountCodes: {
    id: "generateBulkDiscountCodes", category: "promotions",
    displayName: "Generar códigos de descuento en lote",
    description: "Genera múltiples códigos únicos para una regla de precio.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  ["promotionId: string", "prefix: string", "count: number"],
    expectedOutputs: ["codes: string[]", "PromotionOperationResult[]"],
  },
  findActivePromotions: {
    id: "findActivePromotions", category: "promotions",
    displayName: "Buscar promociones activas",
    description: "Devuelve todas las promociones activas en este momento.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  [],
    expectedOutputs: ["ShopifyPromotionSummary[]"],
  },
  findScheduledPromotions: {
    id: "findScheduledPromotions", category: "promotions",
    displayName: "Buscar promociones programadas",
    description: "Devuelve promociones creadas pero aún no activas.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  [],
    expectedOutputs: ["ShopifyPromotionSummary[]"],
  },
  findExpiredPromotions: {
    id: "findExpiredPromotions", category: "promotions",
    displayName: "Buscar promociones vencidas",
    description: "Devuelve promociones cuya fecha de fin ya pasó.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  [],
    expectedOutputs: ["ShopifyPromotionSummary[]"],
  },

  // ── Collections ───────────────────────────────────────────────────────────

  createCollection: {
    id: "createCollection", category: "collections",
    displayName: "Crear colección",
    description: "Crea una nueva colección manual en Shopify.",
    requiresApproval: true, automationEligible: false, supportedByCopilot: true,
    expectedInputs:  ["title: string", "description?: string"],
    expectedOutputs: ["AgentikCollection"],
  },
  addProductsToCollection: {
    id: "addProductsToCollection", category: "collections",
    displayName: "Agregar productos a colección",
    description: "Asigna una lista de productos a una colección existente.",
    requiresApproval: true, automationEligible: false, supportedByCopilot: true,
    expectedInputs:  ["collectionId: number", "productIds: string[]"],
    expectedOutputs: ["CollectionSyncResult"],
  },
  removeProductsFromCollection: {
    id: "removeProductsFromCollection", category: "collections",
    displayName: "Remover productos de colección",
    description: "Elimina productos de una colección sin eliminar los productos.",
    requiresApproval: true, automationEligible: false, supportedByCopilot: true,
    expectedInputs:  ["collectionId: number", "productIds: string[]"],
    expectedOutputs: ["{ removed: boolean }"],
  },
  findCollection: {
    id: "findCollection", category: "collections",
    displayName: "Buscar colección",
    description: "Busca colecciones de Shopify por título.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  ["query?: string"],
    expectedOutputs: ["AgentikCollection[]"],
  },
  findProductsOutsideCollections: {
    id: "findProductsOutsideCollections", category: "collections",
    displayName: "Buscar productos sin colección",
    description: "Devuelve productos publicados en Shopify que no están en ninguna colección.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true, stub: true,
    expectedInputs:  [],
    expectedOutputs: ["ProductConsoleItem[]"],
  },

  // ── Operations ────────────────────────────────────────────────────────────

  findDelayedOrders: {
    id: "findDelayedOrders", category: "operations",
    displayName: "Buscar envíos retrasados",
    description: "Devuelve envíos sin actividad de transportadora por 5 o más días.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  ["minDays?: number (default: 5)", "carrier?: string"],
    expectedOutputs: ["OperationShipmentSummary[]"],
  },
  findFailedPayments: {
    id: "findFailedPayments", category: "operations",
    displayName: "Buscar pagos fallidos",
    description: "Devuelve pedidos con estado de pago fallido o revertido.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  [],
    expectedOutputs: ["OperationOrderSummary[]"],
  },
  findPendingRefunds: {
    id: "findPendingRefunds", category: "operations",
    displayName: "Buscar reembolsos pendientes",
    description: "Devuelve pedidos con reembolso solicitado pero no procesado.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  [],
    expectedOutputs: ["OperationOrderSummary[]"],
  },
  findPendingReturns: {
    id: "findPendingReturns", category: "operations",
    displayName: "Buscar devoluciones pendientes",
    description: "Devuelve pedidos con artículos devueltos no resueltos.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  [],
    expectedOutputs: ["OperationOrderSummary[]"],
  },
  findOrdersAtRisk: {
    id: "findOrdersAtRisk", category: "operations",
    displayName: "Buscar pedidos en riesgo",
    description: "Devuelve pedidos con indicadores de alto riesgo (retrasos, pagos, incidencias).",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  [],
    expectedOutputs: ["OperationOrderSummary[]"],
  },
  reviewCarrierPerformance: {
    id: "reviewCarrierPerformance", category: "operations",
    displayName: "Revisar desempeño de transportadoras",
    description: "Agrega métricas de entrega por transportadora para el período actual.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  [],
    expectedOutputs: ["CarrierPerformanceSummary[]"],
  },

  // ── Statistics ────────────────────────────────────────────────────────────

  getOverview: {
    id: "getOverview", category: "statistics",
    displayName: "Resumen ejecutivo",
    description: "Devuelve el snapshot ejecutivo completo de la tienda para el período indicado.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  ["period?: StatisticsPeriod (default: week)"],
    expectedOutputs: ["StatisticsOverview"],
  },
  getAttentionSummary: {
    id: "getAttentionSummary", category: "statistics",
    displayName: "Resumen de indicadores a atender",
    description: "Devuelve los KPIs con salud warning/critical, pre-ordenados por urgencia.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  ["period?: StatisticsPeriod (default: week)"],
    expectedOutputs: ["MetricHealthSummary.needsAttention"],
  },

  // ── Enrichment ────────────────────────────────────────────────────────────

  completeSeo: {
    id: "completeSeo", category: "enrichment",
    displayName: "Completar SEO",
    description: "Completa metadatos SEO (título, descripción, palabras clave) de los productos indicados.",
    requiresApproval: true, automationEligible: false, supportedByCopilot: true, stub: true,
    expectedInputs:  ["productIds?: string[]"],
    expectedOutputs: ["ShopifyActionResult"],
  },
  completeCatalogMetadata: {
    id: "completeCatalogMetadata", category: "enrichment",
    displayName: "Completar metadatos del catálogo",
    description: "Detecta y completa campos faltantes (descripción, SEO, alt text, tags) en el catálogo.",
    requiresApproval: true, automationEligible: false, supportedByCopilot: true, stub: true,
    expectedInputs:  [],
    expectedOutputs: ["ShopifyActionResult"],
  },
} as const;

// ── Internal helpers ──────────────────────────────────────────────────────────

const start = () => Date.now();

function mkOk<T>(
  data:     T,
  summary:  string,
  opts:     Partial<Pick<ShopifyActionResult<T>, "executed" | "skipped" | "failed" | "warnings">> = {},
  t0 = 0,
): ShopifyActionResult<T> {
  return {
    success:       true,
    data,
    executed:      opts.executed   ?? (Array.isArray(data) ? data.length : 1),
    skipped:       opts.skipped    ?? 0,
    failed:        opts.failed     ?? 0,
    warnings:      opts.warnings   ?? [],
    errors:        [],
    executionTime: t0 > 0 ? Date.now() - t0 : 0,
    summary,
  };
}

function mkFail<T = never>(
  errors:  string[],
  summary: string,
  t0 = 0,
): ShopifyActionResult<T> {
  return {
    success:       false,
    data:          undefined as unknown as T,
    executed:      0,
    skipped:       0,
    failed:        errors.length,
    warnings:      [],
    errors,
    executionTime: t0 > 0 ? Date.now() - t0 : 0,
    summary,
  };
}

function mkStub(actionId: string): ShopifyActionResult<null> {
  return {
    success:       false,
    data:          null,
    executed:      0,
    skipped:       0,
    failed:        0,
    warnings:      [`La acción "${actionId}" es un stub — no implementada todavía.`],
    errors:        [],
    executionTime: 0,
    summary:       `${actionId}: aún no disponible. Requiere implementación futura.`,
  };
}

// ── Catalog actions ────────────────────────────────────────────────────────────

/**
 * Lists all products in the Agentik catalog that have not yet been
 * published to the Shopify channel.
 *
 * Copilot: shopifyActions.catalog.findUnpublishedProducts(ctx)
 */
export async function findUnpublishedProducts(
  ctx: ShopifyContext,
): Promise<ShopifyActionResult<ReturnType<typeof listProductConsoleItems> extends Promise<infer U> ? U : never>> {
  const t0       = start();
  const products = await listProductConsoleItems(ctx.organizationId);
  const pending  = products.filter(p =>
    !p.publicationSummary.some(
      s => s.channel === "shopify" && s.publicationStatus === "published",
    ),
  );
  return mkOk(pending, `${pending.length} producto(s) sin publicar en Shopify.`, {}, t0);
}

/**
 * Lists products with no primary asset (image) uploaded.
 *
 * Copilot: shopifyActions.catalog.findProductsWithoutImages(ctx)
 */
export async function findProductsWithoutImages(
  ctx: ShopifyContext,
): Promise<ShopifyActionResult<Awaited<ReturnType<typeof listProductConsoleItems>>>> {
  const t0       = start();
  const products = await listProductConsoleItems(ctx.organizationId);
  const missing  = products.filter(p => p.assetCount === 0 || p.primaryAssetUrl === null);
  return mkOk(missing, `${missing.length} producto(s) sin imagen principal.`, {}, t0);
}

/**
 * Lists products with no commercial price defined.
 *
 * Copilot: shopifyActions.catalog.findProductsWithoutPrice(ctx)
 */
export async function findProductsWithoutPrice(
  ctx: ShopifyContext,
): Promise<ShopifyActionResult<Awaited<ReturnType<typeof listProductConsoleItems>>>> {
  const t0       = start();
  const products = await listProductConsoleItems(ctx.organizationId);
  const missing  = products.filter(p => p.price === null);
  return mkOk(missing, `${missing.length} producto(s) sin precio definido.`, {}, t0);
}

/**
 * Lists products with a readinessScore below the quality threshold.
 * Default threshold: 70 (out of 100).
 *
 * Copilot: shopifyActions.catalog.findLowQualityProducts(ctx, { threshold })
 */
export async function findLowQualityProducts(
  ctx:       ShopifyContext,
  opts?:     { threshold?: number },
): Promise<ShopifyActionResult<Awaited<ReturnType<typeof listProductConsoleItems>>>> {
  const t0        = start();
  const threshold = opts?.threshold ?? 70;
  const products  = await listProductConsoleItems(ctx.organizationId);
  const low       = products.filter(p => p.readinessScore < threshold);
  return mkOk(
    low,
    `${low.length} producto(s) con calidad por debajo del umbral (${threshold}%).`,
    {},
    t0,
  );
}

/**
 * @stub — Publish all pending products to Shopify.
 * Requires Shopify write integration (SHOPIFY-CATALOG-PUBLISH-01).
 */
export async function publishPendingProducts(
  _ctx: ShopifyContext,
): Promise<ShopifyActionResult<null>> {
  return mkStub("publishPendingProducts");
}

/**
 * @stub — Publish specific products by ID to Shopify.
 */
export async function publishProducts(
  _ctx:        ShopifyContext,
  _productIds: string[],
): Promise<ShopifyActionResult<null>> {
  return mkStub("publishProducts");
}

/**
 * @stub — Update product data for specific product IDs.
 */
export async function updateProducts(
  _ctx:        ShopifyContext,
  _productIds: string[],
): Promise<ShopifyActionResult<null>> {
  return mkStub("updateProducts");
}

/**
 * @stub — Full catalog sync (Agentik catalog ↔ Shopify).
 */
export async function syncCatalog(
  _ctx: ShopifyContext,
): Promise<ShopifyActionResult<null>> {
  return mkStub("syncCatalog");
}

/**
 * @stub — Find products published in Shopify without SEO metadata.
 * Requires extended product field (SHOPIFY-STATISTICS-05).
 */
export async function findProductsWithoutSeo(
  _ctx: ShopifyContext,
): Promise<ShopifyActionResult<null>> {
  return mkStub("findProductsWithoutSeo");
}

/**
 * @stub — Find products without a commercial description.
 */
export async function findProductsWithoutDescription(
  _ctx: ShopifyContext,
): Promise<ShopifyActionResult<null>> {
  return mkStub("findProductsWithoutDescription");
}

/**
 * @stub — Find products not assigned to any Shopify collection.
 */
export async function findProductsWithoutCollections(
  _ctx: ShopifyContext,
): Promise<ShopifyActionResult<null>> {
  return mkStub("findProductsWithoutCollections");
}

// ── Promotion actions ──────────────────────────────────────────────────────────

/**
 * Returns all active promotions.
 *
 * Copilot: shopifyActions.promotions.findActivePromotions(ctx)
 */
export async function findActivePromotions(
  ctx: ShopifyContext,
) {
  const t0     = start();
  const result = await listPromotions(ctx.organizationId, ctx.accessToken, ctx.shopDomain);
  return mkOk(result.active, `${result.active.length} promoción(es) activa(s).`, {}, t0);
}

/**
 * Returns all scheduled (future-dated) promotions.
 *
 * Copilot: shopifyActions.promotions.findScheduledPromotions(ctx)
 */
export async function findScheduledPromotions(
  ctx: ShopifyContext,
) {
  const t0     = start();
  const result = await listPromotions(ctx.organizationId, ctx.accessToken, ctx.shopDomain);
  return mkOk(result.scheduled, `${result.scheduled.length} promoción(es) programada(s).`, {}, t0);
}

/**
 * Returns all expired promotions.
 *
 * Copilot: shopifyActions.promotions.findExpiredPromotions(ctx)
 */
export async function findExpiredPromotions(
  ctx: ShopifyContext,
) {
  const t0     = start();
  const result = await listPromotions(ctx.organizationId, ctx.accessToken, ctx.shopDomain);
  return mkOk(result.expired, `${result.expired.length} promoción(es) vencida(s).`, {}, t0);
}

/**
 * Creates a new Shopify price rule with the given parameters.
 *
 * Copilot: shopifyActions.promotions.createPromotion(ctx, input)
 * Requires approval before execution.
 */
export async function createPromotion(
  ctx:   ShopifyContext,
  input: PromotionCreateInput,
) {
  const t0     = start();
  const result = await _createPromotion(
    ctx.organizationId,
    ctx.accessToken,
    ctx.shopDomain,
    input,
  );
  if (result.ok) {
    return mkOk(result, result.message ?? "Promoción creada correctamente.", {}, t0);
  }
  return mkFail(result.errors ?? [result.message ?? "Error desconocido"], "No se pudo crear la promoción.", t0);
}

/**
 * Duplicates an existing promotion with optional overrides.
 *
 * Copilot: shopifyActions.promotions.duplicatePromotion(ctx, promotionId, overrides?)
 */
export async function duplicatePromotion(
  ctx:         ShopifyContext,
  promotionId: string,
  overrides?:  Partial<PromotionCreateInput>,
) {
  const t0     = start();
  const result = await _duplicatePromotion(
    ctx.organizationId,
    ctx.accessToken,
    ctx.shopDomain,
    promotionId,
    overrides,
  );
  if (result.ok) {
    return mkOk(result, result.message ?? "Promoción duplicada correctamente.", {}, t0);
  }
  return mkFail(result.errors ?? [result.message ?? "Error"], "No se pudo duplicar la promoción.", t0);
}

/**
 * Schedules a new promotion for a future start date.
 *
 * Copilot: shopifyActions.promotions.schedulePromotion(ctx, input)
 */
export async function schedulePromotion(
  ctx:   ShopifyContext,
  input: PromotionCreateInput,
) {
  const t0     = start();
  const result = await _schedulePromotion(
    ctx.organizationId,
    ctx.accessToken,
    ctx.shopDomain,
    input,
  );
  if (result.ok) {
    return mkOk(result, result.message ?? "Promoción programada.", {}, t0);
  }
  return mkFail(result.errors ?? [result.message ?? "Error"], "No se pudo programar la promoción.", t0);
}

/**
 * Pauses an active promotion by setting its end date to now.
 *
 * Copilot: shopifyActions.promotions.pausePromotion(ctx, promotionId)
 */
export async function pausePromotion(
  ctx:         ShopifyContext,
  promotionId: string,
) {
  const t0     = start();
  const result = await _disablePromotion(
    ctx.organizationId,
    ctx.accessToken,
    ctx.shopDomain,
    promotionId,
  );
  if (result.ok) {
    return mkOk(result, result.message ?? "Promoción pausada.", {}, t0);
  }
  return mkFail(result.errors ?? [result.message ?? "Error"], "No se pudo pausar la promoción.", t0);
}

/**
 * Generates a single discount code for an existing price rule.
 *
 * Copilot: shopifyActions.promotions.generateDiscountCode(ctx, promotionId, code)
 */
export async function generateDiscountCode(
  ctx:         ShopifyContext,
  promotionId: string,
  code:        string,
) {
  const t0     = start();
  const result = await _generateDiscountCode(
    ctx.organizationId,
    ctx.accessToken,
    ctx.shopDomain,
    promotionId,
    code,
  );
  if (result.ok) {
    return mkOk(result, `Código "${code}" generado.`, {}, t0);
  }
  return mkFail(result.errors ?? [result.message ?? "Error"], `No se pudo generar el código "${code}".`, t0);
}

/**
 * Generates multiple unique discount codes for a price rule.
 * Prefix is prepended to a random suffix: e.g. "VIP-A3B7".
 *
 * Copilot: shopifyActions.promotions.generateBulkDiscountCodes(ctx, { promotionId, prefix, count })
 */
export async function generateBulkDiscountCodes(
  ctx:  ShopifyContext,
  opts: { promotionId: string; prefix: string; count: number },
): Promise<ShopifyActionResult<{ codes: string[]; failed: string[] }>> {
  const t0       = start();
  const codes: string[]  = [];
  const failed: string[] = [];

  for (let i = 0; i < Math.min(opts.count, 100); i++) {
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const code   = `${opts.prefix}-${suffix}`;
    try {
      const result = await _generateDiscountCode(
        ctx.organizationId,
        ctx.accessToken,
        ctx.shopDomain,
        opts.promotionId,
        code,
      );
      if (result.ok) codes.push(code);
      else failed.push(code);
    } catch {
      failed.push(code);
    }
  }

  const data = { codes, failed };
  if (codes.length > 0) {
    return mkOk(
      data,
      `${codes.length} código(s) generado(s). ${failed.length} fallido(s).`,
      { executed: codes.length, failed: failed.length },
      t0,
    );
  }
  return mkFail([`No se pudo generar ningún código para la promoción ${opts.promotionId}.`], "Generación de códigos fallida.", t0);
}

/**
 * Finds a promotion by ID or title.
 *
 * Copilot: shopifyActions.promotions.findPromotionByName(ctx, title)
 */
export async function findPromotionByName(
  ctx:   ShopifyContext,
  title: string,
) {
  const t0     = start();
  const result = await _findPromotion(
    ctx.organizationId,
    ctx.accessToken,
    ctx.shopDomain,
    { title },
  );
  if (result) {
    return mkOk(result, `Promoción encontrada: "${result.title}".`, { executed: 1 }, t0);
  }
  return mkOk(null, `No se encontró ninguna promoción con el nombre "${title}".`, { executed: 0, skipped: 1 }, t0);
}

/**
 * @stub — Resume a paused promotion (re-activate price rule).
 */
export async function resumePromotion(
  _ctx:         ShopifyContext,
  _promotionId: string,
): Promise<ShopifyActionResult<null>> {
  return mkStub("resumePromotion");
}

/**
 * @stub — Permanently expire a promotion by forcing its end date.
 */
export async function expirePromotion(
  _ctx:         ShopifyContext,
  _promotionId: string,
): Promise<ShopifyActionResult<null>> {
  return mkStub("expirePromotion");
}

/**
 * @stub — Delete a price rule from Shopify permanently.
 */
export async function deletePromotion(
  _ctx:         ShopifyContext,
  _promotionId: string,
): Promise<ShopifyActionResult<null>> {
  return mkStub("deletePromotion");
}

// ── Collection actions ─────────────────────────────────────────────────────────

/**
 * Finds all Shopify collections, optionally filtered by title keyword.
 *
 * Copilot: shopifyActions.collections.findCollection(ctx, query?)
 */
export async function findCollection(
  ctx:    ShopifyContext,
  query?: string,
) {
  const t0          = start();
  const collections = await findShopifyCollections(ctx.organizationId, ctx.accessToken, ctx.shopDomain);
  const filtered    = query
    ? collections.filter(c => c.title.toLowerCase().includes(query.toLowerCase()))
    : collections;
  return mkOk(filtered, `${filtered.length} colección(es) encontrada(s).`, {}, t0);
}

/**
 * Creates a new manual collection in Shopify.
 *
 * Copilot: shopifyActions.collections.createCollection(ctx, { title, description? })
 */
export async function createCollection(
  ctx:   ShopifyContext,
  input: { title: string; description?: string },
) {
  const t0     = start();
  const result = await createShopifyCollection(
    ctx.organizationId,
    ctx.accessToken,
    ctx.shopDomain,
    { title: input.title, description: input.description },
  );
  return mkOk(
    result.collection,
    result.created
      ? `Colección "${input.title}" creada correctamente.`
      : `La colección "${input.title}" ya existía.`,
    { executed: result.created ? 1 : 0, skipped: result.created ? 0 : 1 },
    t0,
  );
}

/**
 * Adds products to an existing Shopify collection.
 *
 * Copilot: shopifyActions.collections.addProductsToCollection(ctx, collectionId, productIds)
 */
export async function addProductsToCollection(
  ctx:          ShopifyContext,
  collectionId: number,
  productIds:   string[],
) {
  const t0     = start();
  const result = await syncProductsToCollection(
    ctx.organizationId,
    ctx.accessToken,
    ctx.shopDomain,
    { title: "", collectionId, productIds },
  );
  return mkOk(
    result,
    `${result.productsAdded} producto(s) agregado(s) a la colección ${collectionId}.`,
    { executed: result.productsAdded, skipped: result.alreadyInCollection, failed: result.productsBlocked },
    t0,
  );
}

/**
 * Removes specific products from a Shopify collection.
 *
 * Copilot: shopifyActions.collections.removeProductsFromCollection(ctx, collectionId, productIds)
 */
export async function removeProductsFromCollection(
  ctx:          ShopifyContext,
  collectionId: number,
  productIds:   string[],
) {
  const t0     = start();
  const result = await _removeProductsFromCollection(
    ctx.organizationId,
    ctx.accessToken,
    ctx.shopDomain,
    collectionId,
    productIds,
  );
  return mkOk(result, `Productos removidos de la colección ${collectionId}.`, {}, t0);
}

/**
 * @stub — Rename an existing collection.
 */
export async function renameCollection(
  _ctx:          ShopifyContext,
  _collectionId: number,
  _newTitle:     string,
): Promise<ShopifyActionResult<null>> {
  return mkStub("renameCollection");
}

/**
 * @stub — Delete an existing collection (products are NOT deleted).
 */
export async function deleteCollection(
  _ctx:          ShopifyContext,
  _collectionId: number,
): Promise<ShopifyActionResult<null>> {
  return mkStub("deleteCollection");
}

/**
 * @stub — Sync a collection from an Agentik category.
 */
export async function syncCollection(
  _ctx:          ShopifyContext,
  _collectionId: number,
  _productIds?:  string[],
): Promise<ShopifyActionResult<null>> {
  return mkStub("syncCollection");
}

/**
 * @stub — Find products published in Shopify without a collection.
 */
export async function findProductsOutsideCollections(
  _ctx: ShopifyContext,
): Promise<ShopifyActionResult<null>> {
  return mkStub("findProductsOutsideCollections");
}

/**
 * Alias for findCollection — search by title keyword.
 *
 * Copilot: shopifyActions.search.findCollectionByName(ctx, name)
 */
export async function findCollectionByName(
  ctx:  ShopifyContext,
  name: string,
) {
  return findCollection(ctx, name);
}

// ── Operations actions ─────────────────────────────────────────────────────────

/**
 * Returns shipments stalled for 5+ days without carrier updates.
 *
 * Copilot: shopifyActions.operations.findDelayedOrders(ctx, opts?)
 */
export async function findDelayedOrders(
  ctx:   ShopifyContext,
  opts?: { minDays?: number; carrier?: string },
) {
  const t0     = start();
  const result = await listDelayedShipments(
    ctx.organizationId, ctx.accessToken, ctx.shopDomain, opts,
  );
  return mkOk(result, `${result.length} envío(s) retrasado(s).`, {}, t0);
}

/**
 * Returns orders with voided or failed payment status.
 *
 * Copilot: shopifyActions.operations.findFailedPayments(ctx)
 */
export async function findFailedPayments(
  ctx: ShopifyContext,
) {
  const t0     = start();
  const result = await listFailedPayments(
    ctx.organizationId, ctx.accessToken, ctx.shopDomain,
  );
  return mkOk(result, `${result.length} pedido(s) con pago fallido.`, {}, t0);
}

/**
 * Returns orders with pending (unprocessed) refund requests.
 *
 * Copilot: shopifyActions.operations.findPendingRefunds(ctx)
 */
export async function findPendingRefunds(
  ctx: ShopifyContext,
) {
  const t0     = start();
  const result = await _findPendingRefunds(
    ctx.organizationId, ctx.accessToken, ctx.shopDomain,
  );
  return mkOk(result, `${result.length} reembolso(s) pendiente(s).`, {}, t0);
}

/**
 * Returns orders with unresolved returned line items.
 *
 * Copilot: shopifyActions.operations.findPendingReturns(ctx)
 */
export async function findPendingReturns(
  ctx: ShopifyContext,
) {
  const t0     = start();
  const result = await listReturns(
    ctx.organizationId, ctx.accessToken, ctx.shopDomain,
  );
  return mkOk(result, `${result.length} devolución(es) pendiente(s).`, {}, t0);
}

/**
 * Returns orders flagged as at-risk based on multi-signal analysis.
 *
 * Copilot: shopifyActions.operations.findOrdersAtRisk(ctx)
 */
export async function findOrdersAtRisk(
  ctx: ShopifyContext,
) {
  const t0     = start();
  const result = await _findOrdersAtRisk(
    ctx.organizationId, ctx.accessToken, ctx.shopDomain,
  );
  return mkOk(result, `${result.length} pedido(s) en riesgo.`, {}, t0);
}

/**
 * Returns shipments with confirmed delivery failures.
 *
 * Copilot: shopifyActions.operations.findCarrierIncidents(ctx)
 */
export async function findCarrierIncidents(
  ctx: ShopifyContext,
) {
  const t0     = start();
  const result = await findFailedDeliveries(
    ctx.organizationId, ctx.accessToken, ctx.shopDomain,
  );
  return mkOk(result, `${result.length} incidencia(s) de transportadora.`, {}, t0);
}

/**
 * Alias for findDelayedOrders — same semantic, different Copilot intent.
 *
 * Copilot: shopifyActions.operations.findShipmentDelays(ctx)
 */
export const findShipmentDelays = findDelayedOrders;

/**
 * Aggregates delivery metrics per carrier for performance analysis.
 *
 * Copilot: shopifyActions.operations.reviewCarrierPerformance(ctx)
 */
export async function reviewCarrierPerformance(
  ctx: ShopifyContext,
) {
  const t0     = start();
  const result = await listCarrierPerformance(
    ctx.organizationId, ctx.accessToken, ctx.shopDomain,
  );
  return mkOk(result, `Desempeño de ${result.length} transportadora(s).`, {}, t0);
}

// ── Statistics actions ─────────────────────────────────────────────────────────

/**
 * Full executive overview for the given period.
 * Includes healthSummary.needsAttention / improving for Copilot priority routing.
 *
 * Copilot: shopifyActions.statistics.getOverview(ctx, period?)
 */
export async function getOverview(
  ctx:     ShopifyContext,
  period?: StatisticsPeriod,
) {
  const t0     = start();
  const result = await _getOverview(
    ctx.organizationId, ctx.accessToken, ctx.shopDomain, period,
  );
  return mkOk(result, `Resumen ejecutivo generado (${result.period}).`, { executed: 1 }, t0);
}

/**
 * Returns only the attention-priority KPIs (warning or critical health).
 * Pre-sorted: critical first, then warning, then by delta magnitude.
 *
 * Copilot: shopifyActions.statistics.getAttentionSummary(ctx, period?)
 */
export async function getAttentionSummary(
  ctx:     ShopifyContext,
  period?: StatisticsPeriod,
) {
  const t0      = start();
  const overview = await _getOverview(
    ctx.organizationId, ctx.accessToken, ctx.shopDomain, period,
  );
  const attn = overview.healthSummary.needsAttention;
  return mkOk(
    attn,
    attn.length > 0
      ? `${attn.length} indicador(es) requieren atención: ${attn.map(m => m.label).join(", ")}.`
      : "Todos los indicadores están en niveles normales.",
    { executed: attn.length },
    t0,
  );
}

/**
 * Sales performance metrics for the given period.
 *
 * Copilot: shopifyActions.statistics.getSalesMetrics(ctx, period?)
 */
export async function getSalesMetrics(
  ctx:     ShopifyContext,
  period?: StatisticsPeriod,
) {
  const t0     = start();
  const result = await _getSalesMetrics(
    ctx.organizationId, ctx.accessToken, ctx.shopDomain, period,
  );
  return mkOk(result, `Métricas de ventas (${result.period}): ${result.totalRevenue} ${result.currency}.`, { executed: 1 }, t0);
}

/**
 * Catalog health and top/bottom sellers.
 *
 * Copilot: shopifyActions.statistics.getCatalogMetrics(ctx, period?)
 */
export async function getCatalogMetrics(
  ctx:     ShopifyContext,
  period?: StatisticsPeriod,
) {
  const t0     = start();
  const result = await _getCatalogMetrics(
    ctx.organizationId, ctx.accessToken, ctx.shopDomain, period,
  );
  return mkOk(result, `Catálogo: ${result.published} publicados, ${result.pending} pendientes.`, { executed: 1 }, t0);
}

/**
 * Promotion campaign statistics.
 *
 * Copilot: shopifyActions.statistics.getPromotionMetrics(ctx)
 */
export async function getPromotionMetrics(
  ctx: ShopifyContext,
) {
  const t0     = start();
  const result = await _getPromotionMetrics(
    ctx.organizationId, ctx.accessToken, ctx.shopDomain,
  );
  return mkOk(result, `Promociones: ${result.active} activas, ${result.scheduled} programadas.`, { executed: 1 }, t0);
}

/**
 * Operational health statistics (alerts, delays, returns, refunds).
 *
 * Copilot: shopifyActions.statistics.getOperationsMetrics(ctx)
 */
export async function getOperationsMetrics(
  ctx: ShopifyContext,
) {
  const t0     = start();
  const result = await _getOperationsMetrics(
    ctx.organizationId, ctx.accessToken, ctx.shopDomain,
  );
  return mkOk(result, `Operaciones: ${result.criticalAlerts} alerta(s) crítica(s).`, { executed: 1 }, t0);
}

/**
 * Period-over-period trend analysis for 6 core commercial KPIs.
 *
 * Copilot: shopifyActions.statistics.getTrendMetrics(ctx, period?)
 */
export async function getTrendMetrics(
  ctx:     ShopifyContext,
  period?: StatisticsPeriod,
) {
  const t0     = start();
  const result = await _getTrendAnalysis(
    ctx.organizationId, ctx.accessToken, ctx.shopDomain, period,
  );
  return mkOk(result, `Tendencias del período: ingresos ${result.revenue.direction} ${result.revenue.pct}%.`, { executed: 1 }, t0);
}

/**
 * Deterministic executive insights from threshold rules (NON-AI).
 *
 * Copilot: shopifyActions.statistics.getExecutiveInsights(ctx, period?)
 */
export async function getExecutiveInsights(
  ctx:     ShopifyContext,
  period?: StatisticsPeriod,
) {
  const t0     = start();
  const result = await _getExecutiveInsights(
    ctx.organizationId, ctx.accessToken, ctx.shopDomain, period,
  );
  const critical = result.filter(i => i.severity === "critical").length;
  return mkOk(
    result,
    `${result.length} insight(s) ejecutivos. ${critical} crítico(s).`,
    { executed: result.length },
    t0,
  );
}

// ── Enrichment actions (extension points — NOT live AI) ───────────────────────

/**
 * @stub — Complete all SEO metadata (title, description, keywords) for products.
 * Extension point for future AI enrichment (SHOPIFY-ENRICHMENT-01).
 *
 * Copilot: shopifyActions.enrichment.completeSeo(ctx, productIds?)
 */
export async function completeSeo(
  _ctx:         ShopifyContext,
  _productIds?: string[],
): Promise<ShopifyActionResult<null>> {
  return mkStub("completeSeo");
}

/**
 * @stub — Complete only the SEO title for the given products.
 */
export async function completeSeoTitle(
  _ctx:         ShopifyContext,
  _productIds?: string[],
): Promise<ShopifyActionResult<null>> {
  return mkStub("completeSeoTitle");
}

/**
 * @stub — Complete only the SEO meta-description for the given products.
 */
export async function completeSeoDescription(
  _ctx:         ShopifyContext,
  _productIds?: string[],
): Promise<ShopifyActionResult<null>> {
  return mkStub("completeSeoDescription");
}

/**
 * @stub — Generate missing alt-text for all product images.
 */
export async function completeAltText(
  _ctx:         ShopifyContext,
  _productIds?: string[],
): Promise<ShopifyActionResult<null>> {
  return mkStub("completeAltText");
}

/**
 * @stub — Generate Shopify-optimised search keywords for products.
 */
export async function completeSearchKeywords(
  _ctx:         ShopifyContext,
  _productIds?: string[],
): Promise<ShopifyActionResult<null>> {
  return mkStub("completeSearchKeywords");
}

/**
 * @stub — Write a commercial product description for each product.
 */
export async function completeCommercialDescription(
  _ctx:         ShopifyContext,
  _productIds?: string[],
): Promise<ShopifyActionResult<null>> {
  return mkStub("completeCommercialDescription");
}

/**
 * @stub — Rewrite product title to meet Shopify SEO best practices.
 */
export async function completeShopifyTitle(
  _ctx:         ShopifyContext,
  _productIds?: string[],
): Promise<ShopifyActionResult<null>> {
  return mkStub("completeShopifyTitle");
}

/**
 * @stub — Complete ALL missing metadata fields for the entire catalog.
 * Combines: SEO, alt text, description, tags, title.
 */
export async function completeCatalogMetadata(
  _ctx: ShopifyContext,
): Promise<ShopifyActionResult<null>> {
  return mkStub("completeCatalogMetadata");
}

// ── Semantic search ────────────────────────────────────────────────────────────

/**
 * Finds a product by name (case-insensitive, partial match).
 *
 * Copilot: shopifyActions.search.findProductByName(ctx, name)
 */
export async function findProductByName(
  ctx:  ShopifyContext,
  name: string,
) {
  const t0       = start();
  const products = await listProductConsoleItems(ctx.organizationId);
  const needle   = name.toLowerCase();
  const found    = products.filter(p => p.name.toLowerCase().includes(needle));
  return mkOk(found, `${found.length} producto(s) con nombre que contiene "${name}".`, {}, t0);
}

// findPromotionByName and findCollectionByName are already exported above.
// They are included in shopifyActions.search below for Copilot routing clarity.

/**
 * Finds an order detail by ID.
 *
 * Copilot: shopifyActions.search.findOrder(ctx, orderId)
 */
export async function findOrder(
  ctx:     ShopifyContext,
  orderId: string,
) {
  const { findOperation } = await import("./shopify-operations-service");
  const t0     = start();
  const result = await findOperation(ctx.organizationId, ctx.accessToken, ctx.shopDomain, { id: orderId });
  if (result) {
    return mkOk(result, `Pedido ${orderId} encontrado.`, { executed: 1 }, t0);
  }
  return mkOk(null, `No se encontró el pedido ${orderId}.`, { executed: 0, skipped: 1 }, t0);
}

/**
 * @stub — Find a discount code across all active promotions.
 */
export async function findDiscountCode(
  _ctx:  ShopifyContext,
  _code: string,
): Promise<ShopifyActionResult<null>> {
  return mkStub("findDiscountCode");
}

/**
 * @stub — Find a customer by name, email, or ID.
 */
export async function findCustomer(
  _ctx:   ShopifyContext,
  _query: string,
): Promise<ShopifyActionResult<null>> {
  return mkStub("findCustomer");
}

// ── shopifyActions — unified Copilot API surface ──────────────────────────────

/**
 * Top-level Copilot-callable interface for all Shopify operations.
 *
 * Grouped by business domain for clear intent routing.
 *
 * Usage:
 *   import { shopifyActions } from "@/lib/marketing-studio/commerce/shopify-actions";
 *   const ctx = { organizationId, accessToken, shopDomain };
 *
 *   const overview   = await shopifyActions.statistics.getOverview(ctx);
 *   const attention  = await shopifyActions.statistics.getAttentionSummary(ctx);
 *   const delayed    = await shopifyActions.operations.findDelayedOrders(ctx);
 *   const active     = await shopifyActions.promotions.findActivePromotions(ctx);
 */
export const shopifyActions = {
  catalog: {
    publishPendingProducts,
    publishProducts,
    updateProducts,
    syncCatalog,
    findUnpublishedProducts,
    findProductsWithoutSeo,
    findProductsWithoutImages,
    findProductsWithoutDescription,
    findProductsWithoutPrice,
    findProductsWithoutCollections,
    findLowQualityProducts,
  },
  promotions: {
    createPromotion,
    duplicatePromotion,
    schedulePromotion,
    pausePromotion,
    resumePromotion,
    expirePromotion,
    deletePromotion,
    generateDiscountCode,
    generateBulkDiscountCodes,
    findActivePromotions,
    findExpiredPromotions,
    findScheduledPromotions,
    findPromotionByName,
  },
  collections: {
    createCollection,
    renameCollection,
    deleteCollection,
    syncCollection,
    addProductsToCollection,
    removeProductsFromCollection,
    findCollection,
    findCollectionByName,
    findProductsOutsideCollections,
  },
  operations: {
    findDelayedOrders,
    findFailedPayments,
    findPendingRefunds,
    findPendingReturns,
    findOrdersAtRisk,
    findCarrierIncidents,
    findShipmentDelays,
    reviewCarrierPerformance,
  },
  statistics: {
    getOverview,
    getSalesMetrics,
    getCatalogMetrics,
    getPromotionMetrics,
    getOperationsMetrics,
    getTrendMetrics,
    getExecutiveInsights,
    getAttentionSummary,
  },
  enrichment: {
    completeSeo,
    completeSeoTitle,
    completeSeoDescription,
    completeAltText,
    completeSearchKeywords,
    completeCommercialDescription,
    completeShopifyTitle,
    completeCatalogMetadata,
  },
  search: {
    findProductByName,
    findPromotionByName,
    findCollectionByName,
    findDiscountCode,
    findOrder,
    findCustomer,
  },
} as const;
