/**
 * lib/marketing-studio/catalogs/catalog-layout-engine.ts
 *
 * MARKETING-STUDIO-CATALOG-LAYOUTS-01 — Catalog Layout Engine
 *
 * Transforms a flat product list into organized category sections.
 * Pure domain logic — no Prisma, no I/O, no side effects.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   - Always groups by the `category` field when groupByCategory = true
 *   - Products without a category land in UNCATEGORIZED_LABEL (always last)
 *   - categorySort: "manual"      → follow categoryOrder, unknown categories alpha after
 *   - categorySort: "alphabetical" → all categories A→Z, uncategorized last
 *   - Products WITHIN each section retain their resolved sort order
 *   - Future layout types (COMMERCIAL, SEASONAL) extend CategorySortMode
 */

import type { CatalogProductItem, CatalogProductGroup } from "./catalog-query-service";
import type { CategorySortMode }                        from "./catalog-definition-types";
import { UNCATEGORIZED_LABEL }                          from "./catalog-definition-types";

// ── Category Section ──────────────────────────────────────────────────────────

export interface CatalogCategorySection {
  /** The category key (raw value from ProductEntity.category, or UNCATEGORIZED_LABEL) */
  key:           string;
  /** Display label — same as key for now; extensible for future i18n */
  label:         string;
  /** Number of products in this section */
  count:         number;
  /** Ordered products within this section */
  items:         CatalogProductItem[];
  /** True if this is the "Sin categoría" fallback section */
  isUncategorized: boolean;
}

// ── Catalog Layout Result ─────────────────────────────────────────────────────

export interface CatalogLayoutResult {
  /** Ordered category sections */
  sections:         CatalogCategorySection[];
  /** Total product count across all sections */
  totalCount:       number;
  /** True if any products are in the uncategorized section */
  hasUncategorized: boolean;
  /** Distinct category keys in render order (excluding uncategorized) */
  categoryKeys:     string[];
}

// ── Grouping ──────────────────────────────────────────────────────────────────

function collectSections(
  items: CatalogProductItem[],
): Map<string, CatalogProductItem[]> {
  const map = new Map<string, CatalogProductItem[]>();

  for (const item of items) {
    const key = item.category?.trim() || UNCATEGORIZED_LABEL;
    const bucket = map.get(key) ?? [];
    bucket.push(item);
    map.set(key, bucket);
  }

  return map;
}

// ── Ordering ──────────────────────────────────────────────────────────────────

function orderSections(
  sectionMap:    Map<string, CatalogProductItem[]>,
  categorySort:  CategorySortMode,
  categoryOrder: string[],
): CatalogCategorySection[] {
  const allKeys    = Array.from(sectionMap.keys());
  const namedKeys  = allKeys.filter(k => k !== UNCATEGORIZED_LABEL);
  const hasUncat   = sectionMap.has(UNCATEGORIZED_LABEL);

  let sortedKeys: string[];

  if (categorySort === "manual" && categoryOrder.length > 0) {
    // Start with user-defined order (only keys that actually have products)
    const ordered     = categoryOrder.filter(k => sectionMap.has(k));
    // Remaining keys not in the manual list → alphabetical after
    const orderedSet  = new Set(ordered);
    const remaining   = namedKeys
      .filter(k => !orderedSet.has(k))
      .sort((a, b) => a.localeCompare(b, "es"));
    sortedKeys = [...ordered, ...remaining];
  } else {
    // Alphabetical — always
    sortedKeys = namedKeys.sort((a, b) => a.localeCompare(b, "es"));
  }

  const sections: CatalogCategorySection[] = sortedKeys.map(key => ({
    key,
    label:           key,
    count:           sectionMap.get(key)!.length,
    items:           sectionMap.get(key)!,
    isUncategorized: false,
  }));

  // Uncategorized section is always last
  if (hasUncat) {
    const uncatItems = sectionMap.get(UNCATEGORIZED_LABEL)!;
    sections.push({
      key:             UNCATEGORIZED_LABEL,
      label:           UNCATEGORIZED_LABEL,
      count:           uncatItems.length,
      items:           uncatItems,
      isUncategorized: true,
    });
  }

  return sections;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * buildCatalogLayout
 *
 * Converts a flat product list into ordered category sections.
 * Called after `resolveCatalog()` when groupByCategory = true.
 */
export function buildCatalogLayout(
  items:         CatalogProductItem[],
  categorySort:  CategorySortMode,
  categoryOrder: string[],
): CatalogLayoutResult {
  if (items.length === 0) {
    return {
      sections:         [],
      totalCount:       0,
      hasUncategorized: false,
      categoryKeys:     [],
    };
  }

  const sectionMap = collectSections(items);
  const sections   = orderSections(sectionMap, categorySort, categoryOrder);

  return {
    sections,
    totalCount:       items.length,
    hasUncategorized: sectionMap.has(UNCATEGORIZED_LABEL),
    categoryKeys:     sections
      .filter(s => !s.isUncategorized)
      .map(s => s.key),
  };
}

/**
 * buildFlatLayout
 *
 * Returns a single "all products" section when groupByCategory = false.
 * Preserves resolved sort order.
 */
export function buildFlatLayout(
  items:       CatalogProductItem[],
  catalogName: string,
): CatalogLayoutResult {
  if (items.length === 0) {
    return { sections: [], totalCount: 0, hasUncategorized: false, categoryKeys: [] };
  }

  return {
    sections: [{
      key:             catalogName,
      label:           catalogName,
      count:           items.length,
      items,
      isUncategorized: false,
    }],
    totalCount:       items.length,
    hasUncategorized: false,
    categoryKeys:     [],
  };
}
