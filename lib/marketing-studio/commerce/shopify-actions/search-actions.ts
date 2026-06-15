/**
 * lib/marketing-studio/commerce/shopify-actions/search-actions.ts
 *
 * SHOPIFY-COPILOT-ACTIONS-01B — Semantic search actions.
 * SERVER ONLY — no React imports.
 * @server-only
 *
 * Cross-cutting search functions for Copilot intent resolution.
 * Re-uses promotionActions and collectionActions to avoid duplicating logic.
 */
import "server-only";

import { listProductConsoleItems }  from "@/lib/marketing-studio/products/product-query-service";
import { findOperation }            from "../shopify-operations-service";
import { findPromotionByName }      from "./promotion-actions";
import { findCollectionByName }     from "./collection-actions";
import {
  start,
  mkOk,
  mkStub,
  type ShopifyContext,
  type ShopifyActionResult,
} from "./action-types";

// ── Actions ────────────────────────────────────────────────────────────────────

async function findProductByName(ctx: ShopifyContext, name: string) {
  const t0       = start();
  const products = await listProductConsoleItems(ctx.organizationId);
  const needle   = name.toLowerCase();
  const found    = products.filter(p => p.name.toLowerCase().includes(needle));
  return mkOk(found, `${found.length} producto(s) con nombre que contiene "${name}".`, {}, t0);
}

async function findOrder(ctx: ShopifyContext, orderId: string) {
  const t0     = start();
  const result = await findOperation(
    ctx.organizationId, ctx.accessToken, ctx.shopDomain, { id: orderId },
  );
  if (result) return mkOk(result, `Pedido ${orderId} encontrado.`, { executed: 1 }, t0);
  return mkOk(null, `No se encontró el pedido ${orderId}.`, { executed: 0, skipped: 1 }, t0);
}

async function findDiscountCode(_ctx: ShopifyContext, _code: string): Promise<ShopifyActionResult<null>> {
  return mkStub("findDiscountCode");
}

async function findCustomer(_ctx: ShopifyContext, _query: string): Promise<ShopifyActionResult<null>> {
  return mkStub("findCustomer");
}

// ── Domain object ──────────────────────────────────────────────────────────────

export const searchActions = {
  findProductByName,
  /** Delegates to promotionActions.findPromotionByName — no duplication. */
  findPromotionByName,
  /** Delegates to collectionActions.findCollectionByName — no duplication. */
  findCollectionByName,
  findDiscountCode,
  findOrder,
  findCustomer,
} as const;
