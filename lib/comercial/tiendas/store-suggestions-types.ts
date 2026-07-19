/**
 * lib/comercial/tiendas/store-suggestions-types.ts
 *
 * FASE 1 — Domain types for Store Replenishment Suggestions.
 * Pure types — no runtime logic, no Prisma, no imports.
 *
 * Converts StoreNeed → StoreReplenishmentSuggestion.
 * Each suggestion is an actionable recommendation:
 *   - transfer_full:     bodega principal can fulfill 100%
 *   - transfer_partial:  bodega principal can fulfill partially
 *   - find_replacement:  item unavailable, suggest replacement candidates
 *   - no_action:         healthy or no stock anywhere
 *   - overstock_review:  excess stock, review for redistribution
 *
 * Sprint: TIENDAS-REPLENISHMENT-SUGGESTIONS-01
 */

import type { StoreProductClass, StoreSizeClass } from "./store-policy-types";
import type { NeedStatus, NeedPolicySource } from "./store-needs-types";
import type { ReplacementConfidence } from "./store-replacement-types";

// ── Suggested action ────────────────────────────────────────────────────────

export type SuggestedAction =
  | "transfer_full"
  | "transfer_partial"
  | "find_replacement"
  | "no_action"
  | "overstock_review";

// ── Confidence level ────────────────────────────────────────────────────────

export type SuggestionConfidence = "high" | "medium" | "low";

// ── Replenishment suggestion ────────────────────────────────────────────────

export interface StoreReplenishmentSuggestion {
  // Identity
  suggestionId:    string;

  // Location
  storeId:         string;
  storeName:       string;
  warehouseId:     string;
  warehouseName:   string;

  // Product identity
  referenceCode:   string;
  productName:     string;
  line:            string;
  subgroup:        string;
  productClass:    StoreProductClass;
  sizeClass?:      StoreSizeClass;

  // Variant
  size:            string;
  color:           string;

  // Need context (from StoreNeed)
  currentStoreQty:    number;
  neededQty:          number;
  mainWarehouseQty:   number;
  needStatus:         NeedStatus;
  priorityScore:      number;
  policySource:       NeedPolicySource;

  // Suggestion
  suggestedAction:    SuggestedAction;
  transferQty:        number;    // units to transfer (0 if no transfer)
  confidence:         SuggestionConfidence;
  reason:             string;    // human-readable operational text

  // Replacement (only for find_replacement)
  replacementCandidates?: StoreReplacementCandidate[];

  // Overstock (only for overstock_review)
  excessQty?:         number;    // units above maxQty

  // Warnings
  warnings:           string[];
}

// ── Replacement candidate ───────────────────────────────────────────────────

export interface StoreReplacementCandidate {
  referenceCode:   string;
  productName:     string;
  size:            string;
  color:           string;
  line:            string;
  subgroup:        string;
  productClass:    StoreProductClass;

  // Availability & pricing
  mainWarehouseQty: number;
  price:            number | null;
  priceDeltaPercent: number | null;
  recentSalesQty:   number;

  // Evaluation
  matchScore:       number;
  matchConfidence:  ReplacementConfidence;
  matchReasons:     string[];
}

// ── Aggregation summaries ───────────────────────────────────────────────────

export interface StoreSuggestionsSummary {
  storeId:           string;
  storeName:         string;
  transferFullCount: number;
  transferPartialCount: number;
  findReplacementCount: number;
  noActionCount:     number;
  overstockReviewCount: number;
  totalSuggestions:  number;
  totalTransferUnits: number;
}

export interface ActionSuggestionsSummary {
  action:            SuggestedAction;
  count:             number;
  totalTransferUnits: number;
}

// ── Engine input ────────────────────────────────────────────────────────────

export interface SuggestionsEngineInput {
  storeId:       string;
  storeName:     string;
  warehouseId:   string;
  warehouseName: string;
}
