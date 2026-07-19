/**
 * lib/marketing-studio/catalogs/catalog-builder.ts
 *
 * MS-08 — Catalog Builder
 *
 * Orchestrates query → readiness → display into ready-to-render CatalogDisplayItem objects.
 * Entry point for all catalog construction in the MS-08 layer.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   - No Prisma, no side effects
 *   - Composes query-engine + readiness + display
 *   - Each build function produces a CatalogDisplayItem
 *   - buildDynamicCatalog() is the generic entry point
 */

import type { ProductConsoleItem }      from "../products/product-display";
import type { CatalogRule, CatalogPurpose, CatalogChannel } from "./catalog-types";
import { PURPOSE_DEFAULT_CHANNEL, PURPOSE_DEFAULT_RULES }   from "./catalog-types";
import {
  filterProductsForCatalog,
  filterForWhatsApp,
  filterForShopify,
  rankCatalogProducts,
}                                        from "./catalog-query-engine";
import { computeCatalogReadiness }       from "./catalog-readiness";
import {
  buildCatalogDisplayItem,
  type CatalogDisplayItem,
}                                        from "./catalog-display";

// ── Generic builder ───────────────────────────────────────────────────────────

export interface CatalogBuildConfig {
  id?:      string;
  name:     string;
  purpose:  CatalogPurpose;
  channel?: CatalogChannel;
  rules?:   CatalogRule[];
}

export function buildDynamicCatalog(
  products: ProductConsoleItem[],
  config:   CatalogBuildConfig,
): CatalogDisplayItem {
  const channel = config.channel ?? PURPOSE_DEFAULT_CHANNEL[config.purpose];
  const rules   = config.rules   ?? PURPOSE_DEFAULT_RULES[config.purpose];

  const { included, partial, excluded } = filterProductsForCatalog(products, rules);
  const ranked   = rankCatalogProducts(included);
  const readiness = computeCatalogReadiness(ranked, partial, excluded, channel);

  return buildCatalogDisplayItem({
    id:       config.id ?? `catalog_${config.purpose}_${Date.now()}`,
    name:     config.name,
    purpose:  config.purpose,
    channel,
    rules,
    included: ranked,
    partial,
    excluded,
    readiness,
  });
}

// ── WhatsApp catalog ──────────────────────────────────────────────────────────

export function buildWhatsAppCatalog(
  products: ProductConsoleItem[],
  name     = "Catálogo WhatsApp",
): CatalogDisplayItem {
  const { included, partial, excluded } = filterForWhatsApp(products);
  const ranked    = rankCatalogProducts(included);
  const readiness = computeCatalogReadiness(ranked, partial, excluded, "whatsapp");

  return buildCatalogDisplayItem({
    id:       "catalog_whatsapp_preset",
    name,
    purpose:  "whatsapp_sales",
    channel:  "whatsapp",
    rules:    PURPOSE_DEFAULT_RULES.whatsapp_sales,
    included: ranked,
    partial,
    excluded,
    readiness,
  });
}

// ── Shopify collection draft ──────────────────────────────────────────────────

export function buildShopifyCollectionDraft(
  products: ProductConsoleItem[],
  name     = "Colección Shopify",
): CatalogDisplayItem {
  const { included, partial, excluded } = filterForShopify(products);
  const ranked    = rankCatalogProducts(included);
  const readiness = computeCatalogReadiness(ranked, partial, excluded, "shopify");

  return buildCatalogDisplayItem({
    id:       "catalog_shopify_preset",
    name,
    purpose:  "shopify_collection",
    channel:  "shopify",
    rules:    PURPOSE_DEFAULT_RULES.shopify_collection,
    included: ranked,
    partial,
    excluded,
    readiness,
  });
}

// ── Campaign catalog ──────────────────────────────────────────────────────────

export function buildCampaignCatalog(
  products: ProductConsoleItem[],
  name     = "Campaña",
): CatalogDisplayItem {
  return buildDynamicCatalog(products, {
    id:      "catalog_campaign_preset",
    name,
    purpose: "seasonal_campaign",
  });
}

// ── Preset catalog set (page-level convenience) ───────────────────────────────

export interface PresetCatalogSet {
  whatsapp: CatalogDisplayItem;
  shopify:  CatalogDisplayItem;
  campaign: CatalogDisplayItem;
}

export function buildPresetCatalogs(products: ProductConsoleItem[]): PresetCatalogSet {
  return {
    whatsapp: buildWhatsAppCatalog(products),
    shopify:  buildShopifyCollectionDraft(products),
    campaign: buildCampaignCatalog(products),
  };
}
