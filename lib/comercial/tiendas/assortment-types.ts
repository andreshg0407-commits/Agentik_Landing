/**
 * lib/comercial/tiendas/assortment-types.ts
 *
 * Types for the assortment-based evaluation engine.
 * Pure types — no runtime logic.
 *
 * Core principle:
 *   Tiendas responds "Falta cobertura del subgrupo X" — NOT "Falta referencia Y".
 *   References only appear as candidates to fulfill a need.
 *
 * Sprint: TIENDAS-ASSORTMENT-RULES-ENGINE-01
 */

import type { StoreSizeClass, StoreProductClass } from "./store-policy-types";

// ── Assortment rule types ───────────────────────────────────────────────────

/**
 * TEXTILE_SUBGROUP — evaluate by number of active references in a subgroup.
 *   "Pijama corta must have at least 2 active references."
 *
 * ACCESSORY_SIZE — evaluate by units of a given commercial size class.
 *   "Large products must have at least 1 unit."
 */
export type AssortmentRuleType = "textile_subgroup" | "accessory_size";

export interface TextileSubgroupRule {
  ruleType:               "textile_subgroup";
  storeId:                string;
  productClass:           "textile";
  line?:                  string;
  subgroup:               string;
  minActiveReferences:    number;
  idealActiveReferences:  number;
  maxActiveReferences?:   number;
}

export interface AccessorySizeRule {
  ruleType:        "accessory_size";
  storeId:         string;
  productClass:    StoreProductClass;
  sizeClass:       StoreSizeClass;
  minUnits:        number;
  idealUnits:      number;
  maxUnits?:       number;
}

export type AssortmentRule = TextileSubgroupRule | AccessorySizeRule;

// ── Assortment need status ──────────────────────────────────────────────────

export type AssortmentNeedStatus = "out" | "low" | "ok" | "overstock";

// ── Assortment need (output of evaluation) ──────────────────────────────────

export interface StoreAssortmentNeed {
  storeId:           string;
  storeName:         string;
  ruleType:          AssortmentRuleType;
  productClass:      StoreProductClass;

  /** For textile_subgroup */
  line?:             string;
  subgroup?:         string;

  /** For accessory_size */
  sizeClass?:        StoreSizeClass;

  currentCoverage:   number;
  minRequired:       number;
  idealRequired:     number;
  missingQty:        number;
  status:            AssortmentNeedStatus;
  message:           string;

  candidates:        AssortmentCandidate[];
}

export interface AssortmentCandidate {
  referenceCode:              string;
  productName:                string;
  availableMainWarehouseQty:  number;
  line:                       string;
  subgroup:                   string;
  sizeClass?:                 StoreSizeClass;
  size?:                      string;
  color?:                     string;
  reason:                     string;
}

// ── Textile coverage key ────────────────────────────────────────────────────

/**
 * Stable key representing a unique line+subgroup+talla+color combination.
 * Used for combination-based coverage evaluation.
 *
 * Sprint: TIENDAS-TEXTILE-COVERAGE-REAL-01
 */
export interface TextileCoverageKey {
  line:     string;
  subgroup: string;
  size:     string;
  color:    string;
}

/** Sentinel values that indicate absence — excluded from coverage computation. */
export const TEXTILE_COVERAGE_SENTINELS = ["SIN_TALLA", "SIN_COLOR", "SIN_SUBGRUPO_SAG"] as const;

/**
 * Build a stable string key from a TextileCoverageKey.
 * Returns null if any field is a sentinel (unless diagnostic mode).
 */
export function buildTextileCoverageKey(
  item: { line: string; category: string; size: string; color: string },
  diagnosticMode = false,
): string | null {
  const line = (item.line || "").trim().toUpperCase();
  const subgroup = (item.category || "").trim().toUpperCase();
  const size = (item.size || "").trim().toUpperCase();
  const color = (item.color || "").trim().toUpperCase();

  if (!diagnosticMode) {
    if (!line || !subgroup || !size || !color) return null;
    if (TEXTILE_COVERAGE_SENTINELS.some(s => s === size || s === color || s === subgroup)) return null;
  }

  return `${line}|${subgroup}|${size}|${color}`;
}

// ── Textile size/color coverage ─────────────────────────────────────────────

export type TextileCoverageGapSeverity = "critica" | "alta" | "media" | "baja" | "saludable";

export interface TextileCoverageAnalysis {
  storeId:                string;
  line:                   string;
  subgroup:               string;
  expectedSizes:          string[];
  expectedColors:         string[];
  coveredSizes:           string[];
  coveredColors:          string[];
  missingSizes:           string[];
  missingColors:          string[];
  sizeCoveragePercent:    number;
  colorCoveragePercent:   number;
  overallCoveragePercent: number;
  severity:               TextileCoverageGapSeverity;
  gaps:                   TextileCoverageGap[];

  /** Combination-based coverage (TIENDAS-TEXTILE-COVERAGE-REAL-01) */
  expectedCombinations:   number;
  coveredCombinations:    number;
  missingCombinations:    number;
  combinationCoveragePercent: number;
}

export interface TextileCoverageGap {
  subgroup:     string;
  line:         string;
  size:         string;
  color:        string;
  currentQty:   number;
  idealQty:     number;
  severity:     TextileCoverageGapSeverity;
  candidates:   TextileCoverageCandidate[];
}

export interface TextileCoverageCandidate {
  referenceCode:              string;
  productName:                string;
  size:                       string;
  color:                      string;
  availableMainWarehouseQty:  number;
  matchLevel:                 "exact" | "same_size" | "same_subgroup";
  reason:                     string;
}
