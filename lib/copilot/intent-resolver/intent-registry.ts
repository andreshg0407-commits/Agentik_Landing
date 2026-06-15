/**
 * lib/copilot/intent-resolver/intent-registry.ts
 *
 * AGENTIK-INTENT-RESOLVER-01 — Central intent registry.
 * SERVER ONLY — no React imports, no AI, no LLM calls.
 * @server-only
 *
 * Architecture:
 *   Each domain (Shopify, Finance, Commercial...) owns a partial registry.
 *   The unified INTENT_REGISTRY merges all domain registries.
 *   To add a new domain, create a *_INTENT_REGISTRY constant and spread it below.
 *
 * Adding a new intent:
 *   1. Add an IntentCandidate to the relevant domain registry.
 *   2. Set actionId to "{namespace}.{exactFunctionName}" matching the domain action bundle.
 *   3. The resolver will automatically look up requiresApproval / automationEligible
 *      from the domain action registry — do NOT duplicate those fields here.
 */
import "server-only";

import type { IntentCandidate } from "./intent-types";

// ══════════════════════════════════════════════════════════════════════════════
// SHOPIFY INTENT REGISTRY
// Sprint: AGENTIK-INTENT-RESOLVER-01
// Domain action registry: lib/marketing-studio/commerce/shopify-actions/
// ══════════════════════════════════════════════════════════════════════════════

export const SHOPIFY_INTENT_REGISTRY: Record<string, IntentCandidate> = {

  // ── Catalog ────────────────────────────────────────────────────────────────

  publish_pending_products: {
    id:          "publish_pending_products",
    displayName: "Publicar productos pendientes",
    description: "Publica en Shopify todos los productos pendientes del catálogo.",
    domain:      "shopify",
    actionId:    "catalog.publishPendingProducts",
    keywords: [
      "publicar productos pendientes",
      "publicar pendientes",
      "publica los pendientes",
      "publica catálogo",
      "sube los faltantes",
      "publicar catálogo",
      "subir productos pendientes",
      "productos sin publicar",
    ],
    examples: [
      "Publica los productos pendientes",
      "Publica el catálogo",
      "Sube los faltantes a Shopify",
    ],
  },

  find_unpublished_products: {
    id:          "find_unpublished_products",
    displayName: "Buscar productos sin publicar",
    description: "Lista los productos del catálogo que no se han publicado en Shopify.",
    domain:      "shopify",
    actionId:    "catalog.findUnpublishedProducts",
    keywords: [
      "productos sin publicar",
      "productos no publicados",
      "qué falta publicar",
      "listar no publicados",
      "cuántos están sin publicar",
    ],
    examples: [
      "¿Qué productos no están publicados?",
      "Muéstrame los productos sin publicar",
    ],
  },

  find_products_without_images: {
    id:          "find_products_without_images",
    displayName: "Buscar productos sin imágenes",
    description: "Devuelve productos sin imagen principal cargada.",
    domain:      "shopify",
    actionId:    "catalog.findProductsWithoutImages",
    keywords: [
      "productos sin imagen",
      "productos sin foto",
      "faltan imágenes",
      "sin foto principal",
      "sin imagen",
    ],
    examples: [
      "¿Qué productos no tienen imagen?",
      "Muéstrame los productos sin foto",
    ],
  },

  find_products_without_price: {
    id:          "find_products_without_price",
    displayName: "Buscar productos sin precio",
    description: "Devuelve productos sin precio comercial definido.",
    domain:      "shopify",
    actionId:    "catalog.findProductsWithoutPrice",
    keywords: [
      "productos sin precio",
      "faltan precios",
      "sin precio definido",
      "sin precio comercial",
    ],
    examples: [
      "¿Cuáles productos no tienen precio?",
      "Muéstrame los que faltan precio",
    ],
  },

  sync_catalog: {
    id:          "sync_catalog",
    displayName: "Sincronizar catálogo",
    description: "Sincroniza el catálogo de Agentik con Shopify.",
    domain:      "shopify",
    actionId:    "catalog.syncCatalog",
    keywords: [
      "sincronizar catálogo",
      "sincronizar shopify",
      "sync catálogo",
      "actualizar catálogo shopify",
      "sincroniza todo",
    ],
    examples: [
      "Sincroniza el catálogo con Shopify",
      "Actualiza el catálogo en Shopify",
    ],
  },

  // ── Statistics ─────────────────────────────────────────────────────────────

  get_sales_overview: {
    id:          "get_sales_overview",
    displayName: "Resumen ejecutivo de ventas",
    description: "Devuelve el snapshot ejecutivo completo de la tienda.",
    domain:      "shopify",
    actionId:    "statistics.getOverview",
    keywords: [
      "resumen de ventas",
      "resumen ejecutivo",
      "cómo van las ventas",
      "ver ventas",
      "estadísticas de ventas",
      "rendimiento de la tienda",
      "overview shopify",
      "resumen shopify",
    ],
    examples: [
      "¿Cómo van las ventas esta semana?",
      "Dame el resumen ejecutivo de Shopify",
      "Muéstrame las estadísticas de la tienda",
    ],
  },

  get_attention_summary: {
    id:          "get_attention_summary",
    displayName: "Indicadores que requieren atención",
    description: "Devuelve KPIs con salud warning o critical, pre-ordenados por urgencia.",
    domain:      "shopify",
    actionId:    "statistics.getAttentionSummary",
    keywords: [
      "qué requiere atención",
      "alertas de kpi",
      "indicadores con problemas",
      "qué está mal",
      "problemas en shopify",
      "indicadores críticos",
      "qué debo atender",
    ],
    examples: [
      "¿Qué indicadores requieren atención?",
      "¿Qué está mal en la tienda?",
    ],
  },

  get_trend_analysis: {
    id:          "get_trend_analysis",
    displayName: "Análisis de tendencias",
    description: "Devuelve comparación período-sobre-período de KPIs comerciales.",
    domain:      "shopify",
    actionId:    "statistics.getTrendMetrics",
    keywords: [
      "tendencias de ventas",
      "comparar períodos",
      "cómo va respecto al mes pasado",
      "variación de ventas",
      "análisis de tendencias",
      "evolución de kpis",
    ],
    examples: [
      "¿Cómo van las ventas respecto al mes pasado?",
      "Muéstrame las tendencias de ingresos",
    ],
  },

  // ── Operations ─────────────────────────────────────────────────────────────

  find_failed_payments: {
    id:          "find_failed_payments",
    displayName: "Buscar pagos fallidos",
    description: "Devuelve pedidos con estado de pago fallido o revertido.",
    domain:      "shopify",
    actionId:    "operations.findFailedPayments",
    keywords: [
      "pagos fallidos",
      "pagos rechazados",
      "pagos con error",
      "pedidos con pago fallido",
      "cobros rechazados",
      "transacciones fallidas",
    ],
    examples: [
      "¿Cuántos pagos fallaron?",
      "Muéstrame los pagos rechazados",
      "¿Qué pedidos tienen pago con error?",
    ],
  },

  find_delayed_shipments: {
    id:          "find_delayed_shipments",
    displayName: "Buscar envíos retrasados",
    description: "Devuelve envíos sin actividad de transportadora por 5 o más días.",
    domain:      "shopify",
    actionId:    "operations.findShipmentDelays",
    keywords: [
      "envíos retrasados",
      "pedidos demorados",
      "tracking lento",
      "pedidos sin trackear",
      "envíos sin movimiento",
      "despachos retrasados",
      "envíos con retraso",
    ],
    examples: [
      "¿Qué envíos están retrasados?",
      "Muéstrame pedidos demorados",
      "¿Hay tracking lento?",
    ],
  },

  find_pending_refunds: {
    id:          "find_pending_refunds",
    displayName: "Buscar reembolsos pendientes",
    description: "Devuelve pedidos con reembolso solicitado pero no procesado.",
    domain:      "shopify",
    actionId:    "operations.findPendingRefunds",
    keywords: [
      "reembolsos pendientes",
      "devoluciones de dinero",
      "refunds pendientes",
      "reintegros sin procesar",
      "reembolsos sin resolver",
    ],
    examples: [
      "¿Cuántos reembolsos están pendientes?",
      "Muéstrame los refunds sin procesar",
    ],
  },

  find_pending_returns: {
    id:          "find_pending_returns",
    displayName: "Buscar devoluciones pendientes",
    description: "Devuelve pedidos con artículos devueltos no resueltos.",
    domain:      "shopify",
    actionId:    "operations.findPendingReturns",
    keywords: [
      "devoluciones pendientes",
      "returns pendientes",
      "artículos devueltos",
      "devoluciones sin resolver",
      "productos devueltos",
    ],
    examples: [
      "¿Hay devoluciones sin resolver?",
      "Muéstrame los returns pendientes",
    ],
  },

  find_orders_at_risk: {
    id:          "find_orders_at_risk",
    displayName: "Buscar pedidos en riesgo",
    description: "Devuelve pedidos con indicadores de alto riesgo.",
    domain:      "shopify",
    actionId:    "operations.findOrdersAtRisk",
    keywords: [
      "pedidos en riesgo",
      "orders en riesgo",
      "pedidos de alto riesgo",
      "pedidos riesgosos",
      "pedidos con riesgo",
    ],
    examples: [
      "¿Qué pedidos están en riesgo?",
      "Muéstrame los pedidos de alto riesgo",
    ],
  },

  // ── Promotions ─────────────────────────────────────────────────────────────

  create_discount: {
    id:          "create_discount",
    displayName: "Crear promoción de descuento",
    description: "Crea una nueva regla de descuento en Shopify.",
    domain:      "shopify",
    actionId:    "promotions.createPromotion",
    keywords: [
      "crear descuento",
      "hacer descuento",
      "crear promoción",
      "nueva promoción",
      "hacer promoción",
      "crear oferta",
      "hacer oferta",
      "crear rebaja",
    ],
    examples: [
      "Haz una promoción del 20%",
      "Crea un descuento para la colección de verano",
      "Quiero crear una rebaja del 15%",
    ],
  },

  generate_discount_codes: {
    id:          "generate_discount_codes",
    displayName: "Generar códigos de descuento",
    description: "Genera múltiples códigos únicos para una regla de precio.",
    domain:      "shopify",
    actionId:    "promotions.generateBulkDiscountCodes",
    keywords: [
      "generar códigos de descuento",
      "crear códigos",
      "crear cupones",
      "generar cupones",
      "discount codes",
      "bulk discount",
      "códigos en lote",
      "generar códigos",
    ],
    examples: [
      "Genera 50 códigos de descuento",
      "Crea 20 cupones para la campaña de verano",
      "Necesito códigos de descuento en lote",
    ],
  },

  find_active_promotions: {
    id:          "find_active_promotions",
    displayName: "Ver promociones activas",
    description: "Devuelve todas las promociones activas en este momento.",
    domain:      "shopify",
    actionId:    "promotions.findActivePromotions",
    keywords: [
      "promociones activas",
      "descuentos activos",
      "ofertas activas",
      "qué promociones hay",
      "ver descuentos",
      "listar promociones activas",
    ],
    examples: [
      "¿Qué promociones están activas?",
      "Muéstrame los descuentos actuales",
    ],
  },

  find_scheduled_promotions: {
    id:          "find_scheduled_promotions",
    displayName: "Ver promociones programadas",
    description: "Devuelve promociones creadas pero aún no activas.",
    domain:      "shopify",
    actionId:    "promotions.findScheduledPromotions",
    keywords: [
      "promociones programadas",
      "descuentos programados",
      "próximas promociones",
      "ofertas programadas",
    ],
    examples: [
      "¿Qué promociones están programadas?",
      "Muéstrame los descuentos futuros",
    ],
  },

  // ── Enrichment ─────────────────────────────────────────────────────────────

  complete_seo: {
    id:          "complete_seo",
    displayName: "Completar SEO de productos",
    description: "Completa metadatos SEO (título, descripción, palabras clave) de los productos.",
    domain:      "shopify",
    actionId:    "enrichment.completeSeo",
    keywords: [
      "completar seo",
      "optimizar seo",
      "seo productos",
      "mejorar seo",
      "completar metadatos seo",
      "optimizar metadatos",
    ],
    examples: [
      "Optimiza el SEO de los productos",
      "Completa los metadatos SEO",
    ],
  },

  complete_alt_text: {
    id:          "complete_alt_text",
    displayName: "Completar alt text de imágenes",
    description: "Genera alt text para todas las imágenes de los productos.",
    domain:      "shopify",
    actionId:    "enrichment.completeAltText",
    keywords: [
      "alt text",
      "completar alt text",
      "texto alternativo",
      "descripción de imágenes",
      "optimizar imágenes seo",
    ],
    examples: [
      "Completa el alt text de las imágenes",
      "Genera texto alternativo para los productos",
    ],
  },

  complete_catalog_metadata: {
    id:          "complete_catalog_metadata",
    displayName: "Completar metadatos del catálogo",
    description: "Detecta y completa campos faltantes en el catálogo.",
    domain:      "shopify",
    actionId:    "enrichment.completeCatalogMetadata",
    keywords: [
      "completar metadatos catálogo",
      "completar catálogo",
      "metadatos faltantes",
      "completar campos faltantes",
      "enriquecer catálogo",
    ],
    examples: [
      "Completa los metadatos del catálogo",
      "Rellena los campos faltantes del catálogo",
    ],
  },

  // ── Collections ────────────────────────────────────────────────────────────

  find_collection: {
    id:          "find_collection",
    displayName: "Buscar colección",
    description: "Busca colecciones de Shopify por título.",
    domain:      "shopify",
    actionId:    "collections.findCollection",
    keywords: [
      "buscar colección",
      "encontrar colección",
      "buscar categoría",
      "listar colecciones",
      "ver colecciones",
    ],
    examples: [
      "Busca la colección de verano",
      "¿Qué colecciones existen?",
    ],
  },

  create_collection: {
    id:          "create_collection",
    displayName: "Crear colección",
    description: "Crea una nueva colección manual en Shopify.",
    domain:      "shopify",
    actionId:    "collections.createCollection",
    keywords: [
      "crear colección",
      "nueva colección",
      "crear categoría",
      "agregar colección",
    ],
    examples: [
      "Crea una colección llamada Verano",
      "Nueva colección de juguetes",
    ],
  },

};

// ══════════════════════════════════════════════════════════════════════════════
// FUTURE DOMAIN REGISTRIES
// Add new domain registries here and spread them into INTENT_REGISTRY below.
// Each domain should be in its own sprint (e.g. AGENTIK-INTENT-FINANCE-01).
// ══════════════════════════════════════════════════════════════════════════════

// Placeholder — will be populated in AGENTIK-INTENT-FINANCE-01
export const FINANCE_INTENT_REGISTRY:     Record<string, IntentCandidate> = {};

// Placeholder — will be populated in AGENTIK-INTENT-COMMERCIAL-01
export const COMMERCIAL_INTENT_REGISTRY:  Record<string, IntentCandidate> = {};

// Placeholder — will be populated in AGENTIK-INTENT-MARKETING-01
export const MARKETING_INTENT_REGISTRY:   Record<string, IntentCandidate> = {};

// Placeholder — will be populated in AGENTIK-INTENT-COBRANZA-01
export const COBRANZA_INTENT_REGISTRY:    Record<string, IntentCandidate> = {};

// Placeholder — will be populated in AGENTIK-INTENT-INVENTORY-01
export const INVENTORY_INTENT_REGISTRY:   Record<string, IntentCandidate> = {};

// ══════════════════════════════════════════════════════════════════════════════
// UNIFIED INTENT REGISTRY
// Single source of truth — merges all domain registries.
// ══════════════════════════════════════════════════════════════════════════════

export const INTENT_REGISTRY: Record<string, IntentCandidate> = {
  ...SHOPIFY_INTENT_REGISTRY,
  // Future domains — uncomment as sprints complete:
  // ...FINANCE_INTENT_REGISTRY,
  // ...COMMERCIAL_INTENT_REGISTRY,
  // ...MARKETING_INTENT_REGISTRY,
  // ...COBRANZA_INTENT_REGISTRY,
  // ...INVENTORY_INTENT_REGISTRY,
};
