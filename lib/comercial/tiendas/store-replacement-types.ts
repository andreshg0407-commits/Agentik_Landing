/**
 * lib/comercial/tiendas/store-replacement-types.ts
 *
 * FASE 1 — Domain types for the Replacement Intelligence Engine.
 * Pure types — no runtime logic, no Prisma, no imports.
 *
 * Sprint: TIENDAS-REPLACEMENT-INTELLIGENCE-01
 */

import type { StoreProductClass } from "./store-policy-types";

// ── Replacement match ───────────────────────────────────────────────────────

export type ReplacementConfidence = "high" | "medium" | "low";

export interface ReplacementMatch {
  // Source (the item that needs replacement)
  sourceReferenceCode:    string;
  sourceProductName:      string;

  // Candidate
  candidateReferenceCode: string;
  candidateProductName:   string;

  // Classification
  line:                   string;
  subgroup:               string;

  // Pricing
  sourcePrice:            number | null;
  candidatePrice:         number | null;
  priceDeltaPercent:      number | null;  // null when either price is unknown

  // Availability
  mainWarehouseQty:       number;

  // Sales velocity
  recentSalesQty:         number;  // units sold in recent period (0 = unknown)

  // Evaluation
  score:                  number;  // 0-200+ composite score
  confidence:             ReplacementConfidence;
  reasons:                string[];
}

// ── Candidate product (engine input) ────────────────────────────────────────

/**
 * A product available in main warehouse that could serve as replacement.
 * Populated from ProductEntity + ProductInventoryLevel + SaleRecord aggregation.
 */
export interface CandidateProduct {
  referenceCode:   string;
  productName:     string;
  line:            string;
  subgroup:        string;
  category:        string;
  productClass:    StoreProductClass;
  price:           number | null;

  // Aggregated main warehouse stock (all variants)
  mainWarehouseQty: number;

  // Recent sales velocity (units sold in last 90 days, 0 = no data)
  recentSalesQty:   number;
}

// ── Source need context ─────────────────────────────────────────────────────

export interface ReplacementSourceContext {
  referenceCode:  string;
  productName:    string;
  line:           string;
  subgroup:       string;
  category:       string;
  productClass:   StoreProductClass;
  price:          number | null;
}
