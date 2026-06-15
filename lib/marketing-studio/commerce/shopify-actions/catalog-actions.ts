/**
 * lib/marketing-studio/commerce/shopify-actions/catalog-actions.ts
 *
 * SHOPIFY-COPILOT-ACTIONS-01B — Catalog domain actions.
 * SERVER ONLY — no React imports.
 */

import { listProductConsoleItems }  from "@/lib/marketing-studio/products/product-query-service";
import type { ProductConsoleItem }  from "@/lib/marketing-studio/products/product-display";
import type { ShopifyActionMeta }   from "./action-types";
import {
  start,
  mkOk,
  mkStub,
  type ShopifyContext,
  type ShopifyActionResult,
} from "./action-types";

// ── Registry entries ───────────────────────────────────────────────────────────

export const CATALOG_ACTION_META: Record<string, ShopifyActionMeta> = {
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
    description: "Sincroniza el estado del catálogo de Agentik con Shopify.",
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
};

// ── Actions ────────────────────────────────────────────────────────────────────

async function findUnpublishedProducts(
  ctx: ShopifyContext,
): Promise<ShopifyActionResult<ProductConsoleItem[]>> {
  const t0       = start();
  const products = await listProductConsoleItems(ctx.organizationId);
  const pending  = products.filter(p =>
    !p.publicationSummary.some(
      s => s.channel === "shopify" && s.publicationStatus === "published",
    ),
  );
  return mkOk(pending, `${pending.length} producto(s) sin publicar en Shopify.`, {}, t0);
}

async function findProductsWithoutImages(
  ctx: ShopifyContext,
): Promise<ShopifyActionResult<ProductConsoleItem[]>> {
  const t0       = start();
  const products = await listProductConsoleItems(ctx.organizationId);
  const missing  = products.filter(p => p.assetCount === 0 || p.primaryAssetUrl === null);
  return mkOk(missing, `${missing.length} producto(s) sin imagen principal.`, {}, t0);
}

async function findProductsWithoutPrice(
  ctx: ShopifyContext,
): Promise<ShopifyActionResult<ProductConsoleItem[]>> {
  const t0       = start();
  const products = await listProductConsoleItems(ctx.organizationId);
  const missing  = products.filter(p => p.price === null);
  return mkOk(missing, `${missing.length} producto(s) sin precio definido.`, {}, t0);
}

async function findLowQualityProducts(
  ctx:   ShopifyContext,
  opts?: { threshold?: number },
): Promise<ShopifyActionResult<ProductConsoleItem[]>> {
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

async function publishPendingProducts(_ctx: ShopifyContext): Promise<ShopifyActionResult<null>> {
  return mkStub("publishPendingProducts");
}

async function publishProducts(_ctx: ShopifyContext, _productIds: string[]): Promise<ShopifyActionResult<null>> {
  return mkStub("publishProducts");
}

async function updateProducts(_ctx: ShopifyContext, _productIds: string[]): Promise<ShopifyActionResult<null>> {
  return mkStub("updateProducts");
}

async function updateProduct(_ctx: ShopifyContext, _productId: string): Promise<ShopifyActionResult<null>> {
  return mkStub("updateProduct");
}

async function syncCatalog(_ctx: ShopifyContext): Promise<ShopifyActionResult<null>> {
  return mkStub("syncCatalog");
}

async function findProductsWithoutSeo(_ctx: ShopifyContext): Promise<ShopifyActionResult<null>> {
  return mkStub("findProductsWithoutSeo");
}

async function findProductsWithoutDescription(_ctx: ShopifyContext): Promise<ShopifyActionResult<null>> {
  return mkStub("findProductsWithoutDescription");
}

async function findProductsWithoutCollections(_ctx: ShopifyContext): Promise<ShopifyActionResult<null>> {
  return mkStub("findProductsWithoutCollections");
}

// ── Domain object ──────────────────────────────────────────────────────────────

export const catalogActions = {
  publishPendingProducts,
  publishProducts,
  updateProducts,
  updateProduct,
  syncCatalog,
  findUnpublishedProducts,
  findProductsWithoutSeo,
  findProductsWithoutImages,
  findProductsWithoutDescription,
  findProductsWithoutPrice,
  findProductsWithoutCollections,
  findLowQualityProducts,
} as const;
