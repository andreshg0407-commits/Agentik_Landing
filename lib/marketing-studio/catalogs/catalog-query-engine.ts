/**
 * lib/marketing-studio/catalogs/catalog-query-engine.ts
 *
 * MS-08 — Catalog Query Engine
 *
 * Pure computation — filters and ranks ProductConsoleItem[] using CatalogRule[].
 * No Prisma, no side effects. Works entirely in memory.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   filterProductsForCatalog()  — splits products into included/partial/excluded
 *   rankCatalogProducts()       — sorts by operational value desc
 *   matchesRule()               — evaluates a single rule against a product
 */

import type { ProductConsoleItem } from "../products/product-display";
import type { CatalogRule } from "./catalog-types";

// ── Exclusion result ──────────────────────────────────────────────────────────

export interface ExcludedProduct {
  product: ProductConsoleItem;
  reason:  string;
}

// ── Filter result ─────────────────────────────────────────────────────────────

export interface CatalogFilterResult {
  included: ProductConsoleItem[];
  partial:  ProductConsoleItem[];
  excluded: ExcludedProduct[];
}

// ── Rule evaluator ────────────────────────────────────────────────────────────

/**
 * Derive inferred signals from Mila signals embedded in ProductConsoleItem.
 * Used to approximate field presence when raw values aren't in the DTO.
 */
function hasAvailability(product: ProductConsoleItem): boolean {
  return !product.milaSignals.some(s => s.key === "missing_availability");
}

function hasPrice(product: ProductConsoleItem): boolean {
  return !product.milaSignals.some(s => s.key === "missing_commercial_data") || !!product.sku;
}

function matchesRule(product: ProductConsoleItem, rule: CatalogRule): boolean {
  switch (rule.field) {
    case "category":
      if (rule.operator === "eq")       return product.category === rule.value;
      if (rule.operator === "contains") return product.category?.toLowerCase().includes(String(rule.value).toLowerCase()) ?? false;
      return true;

    case "channel_ready":
      return product.readyDestinations.includes(rule.value as never);

    case "channel_partial":
      return product.partialDestinations.includes(rule.value as never) ||
             product.readyDestinations.includes(rule.value as never);

    case "readiness_score":
      if (rule.operator === "gte") return product.readinessScore >= Number(rule.value);
      if (rule.operator === "lte") return product.readinessScore <= Number(rule.value);
      return true;

    case "has_primary_asset":
      return rule.value === true
        ? product.primaryAssetUrl !== null
        : product.primaryAssetUrl === null;

    case "has_variants":
      return rule.value === true
        ? product.variantCount > 0
        : product.variantCount === 0;

    case "has_sku":
      return rule.value === true
        ? product.sku !== null && product.sku.trim().length > 0
        : product.sku === null;

    case "not_blocked_for_channel":
      return !product.blockedDestinations.includes(rule.value as never);

    case "has_availability":
      return rule.value === true ? hasAvailability(product) : !hasAvailability(product);

    case "has_price":
      return rule.value === true ? hasPrice(product) : !hasPrice(product);

    default:
      return true;
  }
}

// ── Exclusion reason ──────────────────────────────────────────────────────────

function exclusionReason(product: ProductConsoleItem, failedRules: CatalogRule[]): string {
  for (const rule of failedRules) {
    switch (rule.field) {
      case "channel_ready":
        if (product.blockedDestinations.includes(rule.value as never))
          return `Canal ${String(rule.value)} bloqueado — metadata incompleta`;
        return `No habilitado para ${String(rule.value)}`;
      case "has_primary_asset":
        return "Sin imagen principal";
      case "has_sku":
        return "Sin SKU";
      case "has_variants":
        return "Sin variantes de formato";
      case "has_price":
        return "Sin precio definido";
      case "has_availability":
        return "Sin disponibilidad de stock";
      case "readiness_score":
        return `Readiness insuficiente (${product.readinessScore}/${rule.value})`;
      case "not_blocked_for_channel":
        return `Bloqueado para canal ${String(rule.value)}`;
      default:
        return "No cumple los criterios del catálogo";
    }
  }
  return "No cumple los criterios del catálogo";
}

// ── Main filter function ───────────────────────────────────────────────────────

/**
 * filterProductsForCatalog — splits products into:
 *   included  — all hard rules satisfied
 *   partial   — satisfies most rules but has warnings (partial readiness)
 *   excluded  — fails at least one hard rule, with reason
 *
 * Hard rules: channel_ready, has_primary_asset, has_sku, not_blocked_for_channel
 * Soft rules: readiness_score, has_variants, has_availability, has_price
 */
export function filterProductsForCatalog(
  products: ProductConsoleItem[],
  rules:    CatalogRule[],
): CatalogFilterResult {
  const hardRuleFields = new Set<string>([
    "channel_ready", "has_primary_asset", "has_sku", "not_blocked_for_channel",
  ]);

  const hardRules = rules.filter(r => hardRuleFields.has(r.field));
  const softRules = rules.filter(r => !hardRuleFields.has(r.field));

  const included: ProductConsoleItem[]  = [];
  const partial:  ProductConsoleItem[]  = [];
  const excluded: ExcludedProduct[]     = [];

  for (const product of products) {
    const failedHard = hardRules.filter(rule => !matchesRule(product, rule));
    if (failedHard.length > 0) {
      excluded.push({ product, reason: exclusionReason(product, failedHard) });
      continue;
    }

    const failedSoft = softRules.filter(rule => !matchesRule(product, rule));
    if (failedSoft.length > 0) {
      partial.push(product);
    } else {
      included.push(product);
    }
  }

  return { included, partial, excluded };
}

// ── Ranking ───────────────────────────────────────────────────────────────────

/**
 * rankCatalogProducts — sorts by operational value:
 *   1. Readiness score desc
 *   2. Has primary asset (above those without)
 *   3. Has SKU (above those without)
 *   4. Alphabetical by name
 */
export function rankCatalogProducts(products: ProductConsoleItem[]): ProductConsoleItem[] {
  return [...products].sort((a, b) => {
    // Primary: readiness score
    if (b.readinessScore !== a.readinessScore) return b.readinessScore - a.readinessScore;
    // Secondary: has asset
    const aAsset = a.primaryAssetUrl ? 1 : 0;
    const bAsset = b.primaryAssetUrl ? 1 : 0;
    if (bAsset !== aAsset) return bAsset - aAsset;
    // Tertiary: has SKU
    const aSku = a.sku ? 1 : 0;
    const bSku = b.sku ? 1 : 0;
    if (bSku !== aSku) return bSku - aSku;
    // Fallback: name
    return a.name.localeCompare(b.name, "es");
  });
}

// ── Ad-hoc preset filters (convenience wrappers) ──────────────────────────────

export function filterForWhatsApp(products: ProductConsoleItem[]): CatalogFilterResult {
  return filterProductsForCatalog(products, [
    { field: "channel_ready",     operator: "eq", value: "whatsapp" },
    { field: "has_primary_asset", operator: "eq", value: true       },
  ]);
}

export function filterForShopify(products: ProductConsoleItem[]): CatalogFilterResult {
  return filterProductsForCatalog(products, [
    { field: "channel_ready",     operator: "eq", value: "shopify" },
    { field: "has_primary_asset", operator: "eq", value: true      },
  ]);
}

export function filterByCategory(
  products: ProductConsoleItem[],
  category: string,
): ProductConsoleItem[] {
  const q = category.toLowerCase().trim();
  if (!q) return products;
  return products.filter(p => p.category?.toLowerCase().includes(q) ?? false);
}
