/**
 * lib/marketing-studio/commerce/shopify-actions/collection-actions.ts
 *
 * SHOPIFY-COPILOT-ACTIONS-01B — Collections domain actions.
 * SERVER ONLY — no React imports.
 */
import "server-only";

import {
  findShopifyCollections,
  createShopifyCollection,
  syncProductsToCollection,
  removeProductsFromCollection as _removeProductsFromCollection,
}                                           from "../shopify-collections-service";
import type { ShopifyActionMeta }           from "./action-types";
import {
  start,
  mkOk,
  mkStub,
  type ShopifyContext,
} from "./action-types";

// ── Registry entries ───────────────────────────────────────────────────────────

export const collectionActionRegistry: Record<string, ShopifyActionMeta> = {
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
    expectedOutputs: ["{ removed: number }"],
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
};

// ── Actions ────────────────────────────────────────────────────────────────────

export async function findCollectionByName(ctx: ShopifyContext, name: string) {
  return findCollection(ctx, name);
}

async function findCollection(ctx: ShopifyContext, query?: string) {
  const t0          = start();
  const collections = await findShopifyCollections(ctx.organizationId, ctx.accessToken, ctx.shopDomain);
  const filtered    = query
    ? collections.filter(c => c.title.toLowerCase().includes(query.toLowerCase()))
    : collections;
  return mkOk(filtered, `${filtered.length} colección(es) encontrada(s).`, {}, t0);
}

async function createCollection(ctx: ShopifyContext, input: { title: string; description?: string }) {
  const t0     = start();
  const result = await createShopifyCollection(
    ctx.organizationId, ctx.accessToken, ctx.shopDomain,
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

async function addProductsToCollection(ctx: ShopifyContext, collectionId: number, productIds: string[]) {
  const t0     = start();
  const result = await syncProductsToCollection(
    ctx.organizationId, ctx.accessToken, ctx.shopDomain,
    { title: "", collectionId, productIds },
  );
  return mkOk(
    result,
    `${result.productsAdded} producto(s) agregado(s) a la colección ${collectionId}.`,
    { executed: result.productsAdded, skipped: result.alreadyInCollection, failed: result.productsBlocked },
    t0,
  );
}

async function removeProductsFromCollection(ctx: ShopifyContext, collectionId: number, productIds: string[]) {
  const t0     = start();
  const result = await _removeProductsFromCollection(
    ctx.organizationId, ctx.accessToken, ctx.shopDomain, collectionId, productIds,
  );
  return mkOk(result, `Productos removidos de la colección ${collectionId}.`, {}, t0);
}

async function renameCollection(_ctx: ShopifyContext, _collectionId: number, _newTitle: string) {
  return mkStub("renameCollection");
}

async function deleteCollection(_ctx: ShopifyContext, _collectionId: number) {
  return mkStub("deleteCollection");
}

async function syncCollection(_ctx: ShopifyContext, _collectionId: number, _productIds?: string[]) {
  return mkStub("syncCollection");
}

async function findProductsOutsideCollections(_ctx: ShopifyContext) {
  return mkStub("findProductsOutsideCollections");
}

// ── Domain object ──────────────────────────────────────────────────────────────

export const collectionActions = {
  createCollection,
  renameCollection,
  deleteCollection,
  syncCollection,
  addProductsToCollection,
  removeProductsFromCollection,
  findCollection,
  findCollectionByName,
  findProductsOutsideCollections,
} as const;
