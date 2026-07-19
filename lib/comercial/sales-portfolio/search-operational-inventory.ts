/**
 * lib/comercial/sales-portfolio/search-operational-inventory.ts
 *
 * Sales Portfolio Reference Search Engine.
 *
 * Searches OperationalInventoryItem[] by reference, description, line, and
 * category. Returns ranked, normalized results with pressure level included.
 *
 * ─── DESIGN ──────────────────────────────────────────────────────────────────
 * Pure function — no Prisma, no React, no side effects.
 * All search logic lives here — never inline inside React components.
 *
 * ─── RANKING ─────────────────────────────────────────────────────────────────
 * 100 — exact reference match
 *  90 — reference starts with query
 *  70 — description starts with query
 *  50 — reference contains query
 *  30 — description contains query
 *  10 — line or category contains query
 *
 * Sprint: AGENTIK-SALES-PORTFOLIO-REFERENCE-SOURCE-01
 */

import type { OperationalInventoryItem } from "@/lib/operational-inventory/operational-inventory-types";
import {
  computePressureLevel,
  type PressureLevel,
} from "@/lib/operational-inventory/operational-inventory-status";

// ─── Result shape ─────────────────────────────────────────────────────────────

/**
 * Normalized search result for the Sales Portfolio reference picker.
 *
 * Uses operationalAvailableQty — never SAG's raw disponible.
 * Includes pressureLevel for visual signal in the search results.
 */
export interface OperationalSearchResult {
  reference:               string;
  description:             string;
  line:                    string;
  category:                string;
  productType:             string;
  /** Agentik operational availability — use for assignment decisions */
  operationalAvailableQty: number;
  /** SAG physical quantity — informational */
  physicalQty:             number;
  /** Total reserved (SAG PD + Agentik reservations) */
  reservedQty:             number;
  /** Units committed to Sales Portfolio bags */
  salesAssignedQty:        number;
  /** Computed pressure level */
  pressureLevel:           PressureLevel;
  /** Relevance score 0–100 */
  relevance:               number;
}

// ─── Options ──────────────────────────────────────────────────────────────────

export interface SearchOperationalInventoryOptions {
  /** Maximum results to return. Default: 8 */
  limit?:              number;
  /** Minimum query length to start searching. Default: 1 */
  minChars?:           number;
  /** When true, exclude items with operationalAvailableQty === 0. Default: false */
  excludeDepletedRefs?: boolean;
}

// ─── Normalizer ───────────────────────────────────────────────────────────────

/**
 * Normalizes an OperationalInventoryItem into an OperationalSearchResult.
 * Computes pressure level and sets all display fields.
 */
export function normalizeOperationalSearchResult(
  item:      OperationalInventoryItem,
  relevance: number = 50,
): OperationalSearchResult {
  return {
    reference:               item.reference,
    description:             item.description,
    line:                    item.line,
    category:                item.category,
    productType:             item.productType,
    operationalAvailableQty: item.operationalAvailableQty,
    physicalQty:             item.physicalQty,
    reservedQty:             item.reservedQty,
    salesAssignedQty:        item.salesAssignedQty,
    pressureLevel:           computePressureLevel(item),
    relevance,
  };
}

// ─── Main search function ─────────────────────────────────────────────────────

/**
 * Searches the operational inventory for references matching `query`.
 *
 * @param query     Search string — searches reference, description, line, category
 * @param snapshot  The full operational inventory snapshot
 * @param options   Limit, minChars, excludeDepletedRefs
 */
export function searchOperationalInventory(
  query:    string,
  snapshot: OperationalInventoryItem[],
  options:  SearchOperationalInventoryOptions = {},
): OperationalSearchResult[] {
  const {
    limit              = 8,
    minChars           = 1,
    excludeDepletedRefs = false,
  } = options;

  const q = query.trim().toUpperCase();
  if (q.length < minChars) return [];
  if (snapshot.length === 0) return [];

  const results: OperationalSearchResult[] = [];

  for (const item of snapshot) {
    if (excludeDepletedRefs && item.operationalAvailableQty === 0) continue;

    const ref  = item.reference.toUpperCase();
    const desc = item.description.toUpperCase();
    const line = item.line.toUpperCase();
    const cat  = item.category.toUpperCase();

    let relevance = 0;

    if (ref === q)                    relevance = 100;
    else if (ref.startsWith(q))       relevance = 90;
    else if (desc.startsWith(q))      relevance = 70;
    else if (ref.includes(q))         relevance = 50;
    else if (desc.includes(q))        relevance = 30;
    else if (line.includes(q) || cat.includes(q)) relevance = 10;

    if (relevance === 0) continue;

    results.push(normalizeOperationalSearchResult(item, relevance));
  }

  // Sort: relevance desc, then operationalAvailableQty desc within same relevance tier
  results.sort((a, b) => {
    if (b.relevance !== a.relevance) return b.relevance - a.relevance;
    return b.operationalAvailableQty - a.operationalAvailableQty;
  });

  return results.slice(0, limit);
}
