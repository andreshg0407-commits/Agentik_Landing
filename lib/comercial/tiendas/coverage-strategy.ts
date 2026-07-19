/**
 * lib/comercial/tiendas/coverage-strategy.ts
 *
 * Coverage Strategy abstraction for the Commercial Rules Engine.
 *
 * Each business line uses a strategy that defines:
 *   - How coverage rules are configured (UI shape)
 *   - How rules are interpreted (engine resolution)
 *   - How suggestions are generated (future replenishment engine)
 *
 * Initial strategies:
 *   SUBGROUP — Textil + Accesorios: rules keyed by linea + subgrupo
 *   SIZE     — Importacion: rules keyed by product size class
 *
 * Future strategies (no changes to existing):
 *   CATEGORY — rules by product category
 *   BRAND    — rules by brand/marca
 *   SEASON   — rules by commercial season
 *   SPECIAL  — individual product overrides
 *
 * Sprint: STORE-COVERAGE-SIZE-RULES-01
 */

import type {
  CoverageStrategy,
  StorePolicyRule,
  StorePolicyScope,
  StoreProductClass,
  StoreSizeClass,
} from "./store-policy-types";

// ── Strategy descriptor ───────────────────────────────────────────────────────

export interface CoverageStrategyDescriptor {
  /** Strategy identifier — matches CoverageStrategy type */
  id: CoverageStrategy;
  /** Human-readable label for UI */
  label: string;
  /** How the rule matches: which scope(s) this strategy produces */
  primaryScope: StorePolicyScope;
  /** Default product class for rules created by this strategy */
  defaultProductClass: StoreProductClass;
  /** Whether the strategy uses subgroup selection */
  usesSubgroups: boolean;
  /** Whether the strategy uses size class selection */
  usesSizeClass: boolean;
  /** Description for the rules panel */
  description: string;
}

// ── Strategy registry ─────────────────────────────────────────────────────────

export const COVERAGE_STRATEGIES: Record<CoverageStrategy, CoverageStrategyDescriptor> = {
  SUBGROUP: {
    id: "SUBGROUP",
    label: "Por subgrupo",
    primaryScope: "line_subgroup",
    defaultProductClass: "textile",
    usesSubgroups: true,
    usesSizeClass: false,
    description: "Cobertura definida por linea y subgrupo de producto. Cada combinacion talla/color se evalua individualmente.",
  },
  SIZE: {
    id: "SIZE",
    label: "Por tamano",
    primaryScope: "class_size",
    defaultProductClass: "accessory",
    usesSubgroups: false,
    usesSizeClass: true,
    description: "Cobertura definida por tamano fisico del producto. Min/Ideal/Max por cada clase de tamano.",
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Resolve the coverage strategy for a given rule.
 * Uses explicit coverageStrategy field if present, otherwise infers from scope.
 */
export function resolveRuleStrategy(rule: StorePolicyRule): CoverageStrategy {
  if (rule.coverageStrategy) return rule.coverageStrategy;
  // Inference for legacy rules without explicit strategy
  if (rule.scope === "class_size") return "SIZE";
  return "SUBGROUP";
}

/**
 * Get the strategy descriptor for a rule.
 */
export function getStrategyForRule(rule: StorePolicyRule): CoverageStrategyDescriptor {
  return COVERAGE_STRATEGIES[resolveRuleStrategy(rule)];
}

/**
 * Check if a strategy is compatible with a given product class.
 */
export function isStrategyCompatible(
  strategy: CoverageStrategy,
  productClass: StoreProductClass,
): boolean {
  if (strategy === "SUBGROUP") return productClass === "textile" || productClass === "accessory";
  if (strategy === "SIZE") return productClass === "accessory" || productClass === "bulky";
  return false;
}

// ── Size class defaults (for SIZE strategy UI) ───────────────────────────────

export interface SizeClassRow {
  sizeClass: StoreSizeClass;
  label: string;
  defaultMin: number;
  defaultIdeal: number;
  defaultMax: number;
}

export const SIZE_CLASS_DEFAULTS: readonly SizeClassRow[] = [
  { sizeClass: "small",  label: "Pequeno", defaultMin: 6, defaultIdeal: 8,  defaultMax: 10 },
  { sizeClass: "medium", label: "Mediano", defaultMin: 4, defaultIdeal: 6,  defaultMax: 8 },
  { sizeClass: "large",  label: "Grande",  defaultMin: 1, defaultIdeal: 2,  defaultMax: 3 },
];
