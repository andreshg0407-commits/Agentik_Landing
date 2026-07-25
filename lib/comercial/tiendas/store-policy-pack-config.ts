/**
 * lib/comercial/tiendas/store-policy-pack-config.ts
 *
 * FASE 11 — All configurable values live here. Never hardcoded in evaluators.
 *
 * To modify a rule without changing code:
 *   1. Find the config section for the policy
 *   2. Change the number
 *   3. Re-run the engine
 *
 * Future: These values will live in Prisma (per-tenant configuration).
 *
 * Sprint: CASTILLITOS-STORE-POLICY-PACK-01
 */

import type { StoreSizeClass } from "./store-policy-types";

// ── FASE 2: Textile Coverage ────────────────────────────────────────────────

export interface TextileCoverageConfig {
  /** Minimum units per reference per store */
  minimumUnits: number;
  /** Ideal units per reference per store */
  idealUnits: number;
  /** Maximum units per reference per store */
  maximumUnits: number;
}

export const CASTILLITOS_TEXTILE_COVERAGE: TextileCoverageConfig = {
  minimumUnits: 8,
  idealUnits: 10,
  maximumUnits: 12,
};

/**
 * Latin Kids textile defaults — independent from Castillitos.
 * Initially identical values; can be configured independently per tenant.
 */
export const LATIN_KIDS_TEXTILE_COVERAGE: TextileCoverageConfig = {
  minimumUnits: 8,
  idealUnits: 10,
  maximumUnits: 12,
};

// ── FASE 3: Global Low Stock (Rule 36) ──────────────────────────────────────

export interface GlobalLowStockConfig {
  /** When total units across ALL warehouses fall to this or below */
  threshold: number;
  /** Stores allowed to keep stock when threshold is breached */
  allowedStoreIds: string[];
  /** Human-readable names for allowed stores */
  allowedStoreNames: string[];
}

export const CASTILLITOS_GLOBAL_LOW_STOCK: GlobalLowStockConfig = {
  threshold: 36,
  allowedStoreIds: ["centro", "caldas"],
  allowedStoreNames: ["Centro", "Caldas"],
};

// ── FASE 4: Accessory Coverage ──────────────────────────────────────────────

export interface AccessoryCoverageConfig {
  /** Ideal units by size class */
  idealBySize: Record<StoreSizeClass, number>;
}

export const CASTILLITOS_ACCESSORY_COVERAGE: AccessoryCoverageConfig = {
  idealBySize: {
    small: 6,
    medium: 4,
    large: 1,
  },
};

// ── FASE 5: Special Products ────────────────────────────────────────────────

export interface SpecialProductConfig {
  /** Reference codes that are "special" */
  referencePatterns: string[];
  /** Ideal units per store */
  idealByStore: Record<string, number>;
  /** Default for stores not listed */
  defaultIdeal: number;
}

export const CASTILLITOS_SPECIAL_PRODUCTS: SpecialProductConfig = {
  referencePatterns: ["BANERA", "CUNA_COLECHO", "CORRAL"],
  idealByStore: {
    san_diego: 3,
    caldas: 3,
  },
  defaultIdeal: 0,
};

// ── FASE 6: Automatic Markdowns ─────────────────────────────────────────────

export interface MarkdownTier {
  /** Months of age in store */
  monthsThreshold: number;
  /** Suggested discount percentage */
  discountPct: number;
}

export interface AutomaticMarkdownConfig {
  /** Stores where markdown applies */
  applicableStoreIds: string[];
  /** Markdown tiers (sorted ascending by months) */
  tiers: MarkdownTier[];
}

export const CASTILLITOS_AUTOMATIC_MARKDOWN: AutomaticMarkdownConfig = {
  applicableStoreIds: ["centro", "caldas"],
  tiers: [
    { monthsThreshold: 3, discountPct: 10 },
    { monthsThreshold: 6, discountPct: 30 },
    { monthsThreshold: 9, discountPct: 50 },
    { monthsThreshold: 12, discountPct: 70 },
  ],
};

// ── FASE 7: Slow Rotation ───────────────────────────────────────────────────

export interface SlowRotationConfig {
  /** Minimum days in store to consider "slow" */
  minimumDaysThreshold: number;
}

export const CASTILLITOS_SLOW_ROTATION: SlowRotationConfig = {
  minimumDaysThreshold: 90,
};

// ── FASE 8: Replacement / Substitution Config ─────────────────────────────

export type ReplacementMatchMode = "SAME_GROUP_AND_SUBGROUP" | "SAME_SUBGROUP";

export interface ReplacementLineConfig {
  /** Allow substitution when same-reference stock is exhausted */
  allowReplacementWhenNoStock: boolean;
  /** Matching mode for substitution candidates */
  replacementMatchMode: ReplacementMatchMode;
  /** Max candidates to return per need */
  maxCandidates: number;
}

export interface ReplacementConfig {
  castillitos: ReplacementLineConfig;
  latinKids: ReplacementLineConfig;
}

export const CASTILLITOS_REPLACEMENT_CONFIG: ReplacementConfig = {
  castillitos: {
    allowReplacementWhenNoStock: true,
    replacementMatchMode: "SAME_GROUP_AND_SUBGROUP",
    maxCandidates: 3,
  },
  latinKids: {
    allowReplacementWhenNoStock: true,
    replacementMatchMode: "SAME_SUBGROUP",
    maxCandidates: 3,
  },
};

// ── Full Policy Pack Config ─────────────────────────────────────────────────

export interface StorePolicyPackConfig {
  tenantId: string;
  version: string;
  textileCoverage: TextileCoverageConfig;
  latinKidsTextileCoverage: TextileCoverageConfig;
  globalLowStock: GlobalLowStockConfig;
  accessoryCoverage: AccessoryCoverageConfig;
  specialProducts: SpecialProductConfig;
  automaticMarkdown: AutomaticMarkdownConfig;
  slowRotation: SlowRotationConfig;
  replacement: ReplacementConfig;
}

export const CASTILLITOS_STORE_POLICY_PACK_CONFIG: StorePolicyPackConfig = {
  tenantId: "castillitos",
  version: "1.1.0",
  textileCoverage: CASTILLITOS_TEXTILE_COVERAGE,
  latinKidsTextileCoverage: LATIN_KIDS_TEXTILE_COVERAGE,
  globalLowStock: CASTILLITOS_GLOBAL_LOW_STOCK,
  accessoryCoverage: CASTILLITOS_ACCESSORY_COVERAGE,
  specialProducts: CASTILLITOS_SPECIAL_PRODUCTS,
  automaticMarkdown: CASTILLITOS_AUTOMATIC_MARKDOWN,
  slowRotation: CASTILLITOS_SLOW_ROTATION,
  replacement: CASTILLITOS_REPLACEMENT_CONFIG,
};
