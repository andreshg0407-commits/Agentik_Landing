/**
 * lib/marketing-studio/catalogs/catalog-query-service.ts
 *
 * MARKETING-STUDIO-CATALOG-BUILDER-01 — Catalog Query Service
 *
 * Dynamic catalog resolution: applies a CatalogDefinition's filters, sort,
 * and groupBy to the live ProductEntity table, returning typed display items.
 *
 * SERVER ONLY — never import from client components.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   - Products are NEVER stored on the catalog — always resolved at query time
 *   - buildCatalogWhereClause() converts filter rules to Prisma WHERE
 *   - Grouping is applied post-query (in-memory, deterministic)
 *   - pricingMode controls whether price is included in output
 *   - Returns CatalogResolvedResult with items + groups + metadata
 */

import { prisma }                     from "@/lib/prisma";
import { buildCatalogWhereClause }    from "./catalog-filter-engine";
import { buildCatalogLayout, buildFlatLayout } from "./catalog-layout-engine";
import type { CatalogDefinitionRecord, CatalogGroupBy, PricingMode, CatalogLayout, CategorySortMode } from "./catalog-definition-types";
import type { CatalogLayoutResult }   from "./catalog-layout-engine";
import { getContentProjections }      from "../products/product-content-repository";

// ── Output Types ──────────────────────────────────────────────────────────────

export interface CatalogProductItem {
  id:              string;
  name:            string;
  sku:             string | null;
  category:        string | null;
  productLine:     string | null;
  commercialStatus: string;
  readinessLevel:  string;
  price:           number | null;  // null when pricingMode = "without_prices"
  currency:        string;
  heroAssetUrl:    string | null;
  // CATALOG_CONTENT_SLOT: enriched from ProductContent when available
  commercialTitle:  string | null;
  shortDescription: string | null;
}

export interface CatalogProductGroup {
  key:   string;
  label: string;
  items: CatalogProductItem[];
}

export interface CatalogResolvedResult {
  catalogId:       string;
  totalCount:      number;
  pricingMode:     PricingMode;
  layout:          CatalogLayout;
  groupByCategory: boolean;
  categorySort:    CategorySortMode;
  categoryOrder:   string[];
  /** Flat list — always populated */
  items:           CatalogProductItem[];
  /** Legacy grouped list (when groupBy is set — for back-compat) */
  groups:          CatalogProductGroup[];
  /** Category-sectioned layout result */
  layoutResult:    CatalogLayoutResult;
  resolvedAt:      Date;
}

// ── Prisma select for minimal product projection ──────────────────────────────

const PRODUCT_SELECT = {
  id:              true,
  name:            true,
  sku:             true,
  category:        true,
  productLine:     true,
  commercialStatus: true,
  readinessLevel:  true,
  price:           true,
  currency:        true,
  assetLinks: {
    where: { role: "hero" },
    take:  1,
    select: {
      asset: {
        select: { url: true },
      },
    },
  },
} as const;

// ── Sort mapping ──────────────────────────────────────────────────────────────

function buildOrderBy(
  sortField: string,
  sortDirection: "asc" | "desc",
) {
  const dir = sortDirection as "asc" | "desc";
  switch (sortField) {
    case "name":      return [{ name: dir }];
    case "price":     return [{ price: dir }];
    case "createdAt": return [{ createdAt: dir }];
    case "updatedAt": return [{ updatedAt: dir }];
    case "sortOrder":
    default:          return [{ name: "asc" as const }];
  }
}

// ── Item mapper ───────────────────────────────────────────────────────────────

function mapItem(
  row: {
    id:              string;
    name:            string;
    sku:             string | null;
    category:        string | null;
    productLine:     string | null;
    commercialStatus: string;
    readinessLevel:  string;
    price:           number | null;
    currency:        string;
    assetLinks:      { asset: { url: string } | null }[];
  },
  pricingMode: PricingMode,
  contentMap?: Map<string, { commercialTitle: string | null; shortDescription: string | null }>,
): CatalogProductItem {
  const heroLink   = row.assetLinks[0];
  const projection = contentMap?.get(row.id);
  return {
    id:              row.id,
    name:            row.name,
    sku:             row.sku,
    category:        row.category,
    productLine:     row.productLine,
    commercialStatus: row.commercialStatus,
    readinessLevel:  row.readinessLevel,
    price:           pricingMode === "with_prices" ? row.price : null,
    currency:        row.currency,
    heroAssetUrl:    heroLink?.asset?.url ?? null,
    // CATALOG_CONTENT_SLOT: null when ProductContent not yet created for this product
    commercialTitle:  projection?.commercialTitle  ?? null,
    shortDescription: projection?.shortDescription ?? null,
  };
}

// ── Grouping ──────────────────────────────────────────────────────────────────

function groupItems(
  items: CatalogProductItem[],
  groupBy: CatalogGroupBy,
): CatalogProductGroup[] {
  if (!groupBy) return [];

  const groupMap = new Map<string, CatalogProductItem[]>();

  const getKey = (item: CatalogProductItem): string => {
    if (groupBy === "category")         return item.category        ?? "Sin categoría";
    if (groupBy === "productLine")      return item.productLine     ?? "Sin línea";
    if (groupBy === "commercialStatus") return item.commercialStatus ?? "unknown";
    // attribute:{key} — not resolvable at this stage without attribute data
    return "Sin grupo";
  };

  for (const item of items) {
    const key = getKey(item);
    const bucket = groupMap.get(key) ?? [];
    bucket.push(item);
    groupMap.set(key, bucket);
  }

  return Array.from(groupMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, groupItems]) => ({ key, label: key, items: groupItems }));
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * resolveCatalog
 *
 * Dynamically resolves all products matching a CatalogDefinition's rules.
 * Applies filter, sort, and groupBy at query time — never reads stored products.
 */
export async function resolveCatalog(
  catalog: CatalogDefinitionRecord,
  options?: { limit?: number; offset?: number },
): Promise<CatalogResolvedResult> {
  const where    = buildCatalogWhereClause(catalog.organizationId, catalog.filters);
  const orderBy  = buildOrderBy(catalog.sortField, catalog.sortDirection);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (prisma as any).productEntity.findMany({
    where,
    orderBy,
    select:  PRODUCT_SELECT,
    take:    options?.limit  ?? 500,
    skip:    options?.offset ?? 0,
  });

  const productIds = (rows as { id: string }[]).map(r => r.id);
  const contentMap = await getContentProjections(catalog.organizationId, productIds);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = (rows as any[]).map((row: any) => mapItem(row, catalog.pricingMode, contentMap));

  const layoutResult = catalog.groupByCategory
    ? buildCatalogLayout(items, catalog.categorySort, catalog.categoryOrder)
    : buildFlatLayout(items, catalog.name);

  return {
    catalogId:       catalog.id,
    totalCount:      items.length,
    pricingMode:     catalog.pricingMode,
    layout:          catalog.layout,
    groupByCategory: catalog.groupByCategory,
    categorySort:    catalog.categorySort,
    categoryOrder:   catalog.categoryOrder,
    items,
    groups:          groupItems(items, catalog.groupBy),
    layoutResult,
    resolvedAt:      new Date(),
  };
}

/**
 * previewCatalogRules
 *
 * Resolves products for a set of rules without a persisted catalog definition.
 * Used by the catalog builder UI for live previews.
 */
export async function previewCatalogRules(
  organizationId: string,
  rules: import("./catalog-definition-types").CatalogFilterRule[],
  sortField:     string = "name",
  sortDirection: "asc" | "desc" = "asc",
  pricingMode:   PricingMode = "with_prices",
  limit = 50,
): Promise<{ items: CatalogProductItem[]; totalCount: number }> {
  const where   = buildCatalogWhereClause(organizationId, rules);
  const orderBy = buildOrderBy(sortField, sortDirection);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (prisma as any).productEntity.findMany({
    where,
    orderBy,
    select: PRODUCT_SELECT,
    take:   limit,
  });

  const previewIds   = (rows as { id: string }[]).map(r => r.id);
  const previewContent = await getContentProjections(organizationId, previewIds);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = (rows as any[]).map((row: any) => mapItem(row, pricingMode, previewContent));
  return { items, totalCount: items.length };
}
