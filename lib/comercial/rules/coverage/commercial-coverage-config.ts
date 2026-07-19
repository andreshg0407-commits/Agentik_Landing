/**
 * lib/comercial/rules/coverage/commercial-coverage-config.ts
 *
 * Configuration constants for the Commercial Coverage Rules Engine.
 * Safe defaults when no rule matches.
 *
 * Sprint: COMMERCIAL-COVERAGE-RULES-ENGINE-01
 */

import type { StoreSizeClass } from "@/lib/comercial/tiendas/store-policy-types";

// ── Default thresholds (when no rule matches) ───────────────────────────────

export const DEFAULT_THRESHOLDS = {
  minQty: 1,
  idealQty: 2,
  maxQty: 4,
} as const;

// ── Size label map ──────────────────────────────────────────────────────────

export const SIZE_LABEL: Record<StoreSizeClass, string> = {
  small: "Pequeno",
  medium: "Mediano",
  large: "Grande",
  oversized: "Extra grande",
};

// ── Scope priority (lower = more specific = wins) ───────────────────────────

export const SCOPE_PRIORITY: Record<string, number> = {
  variant_override: 1,
  reference: 2,
  line_subgroup: 3,
  subgroup: 4,
  line: 5,
  class_size: 6,
  productClass: 7,
  store: 8,
};
