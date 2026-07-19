/**
 * lib/marketing-studio/category-requirements.ts
 *
 * Category-specific required and recommended inputs per fidelity mode.
 *
 * ── What this module does ────────────────────────────────────────────────────
 *
 *   Different garment categories need different attributes to produce a
 *   high-fidelity generative prompt:
 *
 *     jeans  — detail locks (pocket, stitching, wash, rise) are non-negotiable
 *              in strict mode; wash + rise are strongly recommended in standard.
 *
 *     dress  — silhouette and occasion carry more weight than fit.
 *
 *     shirt  — fabric and pattern are the primary distinguishing axes.
 *
 *   This module maps each GarmentCategory to its `CategoryRequirements` object
 *   and exposes a validator that returns errors (strict) or warnings (standard).
 *
 * Exports:
 *   CategoryRequirements
 *   CATEGORY_REQUIREMENTS   — Map<GarmentCategory, CategoryRequirements>
 *   getRequiredInputs(category, mode)  → { required: string[]; recommended: string[] }
 *   validateCategoryInputs(attrs, mode) → ValidationResult
 */

import type { GarmentAttributes, GarmentCategory, FidelityMode, ValidationResult } from "./types";
import { validateJeansDetailLocks } from "./detail-locks";

// ── Category requirements schema ──────────────────────────────────────────────

export interface CategoryRequirements {
  /** GarmentAttributes fields required in strict mode (ValidationResult error if absent) */
  strictRequired:      (keyof GarmentAttributes)[];
  /** GarmentAttributes fields required in standard mode (ValidationResult error if absent) */
  standardRequired:    (keyof GarmentAttributes)[];
  /** Fields that generate a warning when absent in either mode */
  recommended:         (keyof GarmentAttributes)[];
  /**
   * When true, detail locks must be validated in strict mode.
   * Currently only "jeans" uses the jeans detail lock validator.
   */
  validateDetailLocks: boolean;
}

// ── Registry ──────────────────────────────────────────────────────────────────

export const CATEGORY_REQUIREMENTS: ReadonlyMap<GarmentCategory, CategoryRequirements> = new Map([
  [
    "jeans",
    {
      strictRequired:      ["category", "colors", "gender", "fit", "detailLocks"],
      standardRequired:    ["category", "colors", "gender"],
      recommended:         ["fit", "fabric", "detailLocks"],
      validateDetailLocks: true,
    },
  ],
  [
    "pants",
    {
      strictRequired:      ["category", "colors", "gender", "fit"],
      standardRequired:    ["category", "colors", "gender"],
      recommended:         ["fit", "fabric", "pattern"],
      validateDetailLocks: false,
    },
  ],
  [
    "shorts",
    {
      strictRequired:      ["category", "colors", "gender", "fit"],
      standardRequired:    ["category", "colors", "gender"],
      recommended:         ["fit", "fabric"],
      validateDetailLocks: false,
    },
  ],
  [
    "shirt",
    {
      strictRequired:      ["category", "colors", "gender", "fabric"],
      standardRequired:    ["category", "colors", "gender"],
      recommended:         ["fabric", "pattern", "fit"],
      validateDetailLocks: false,
    },
  ],
  [
    "blouse",
    {
      strictRequired:      ["category", "colors", "gender", "fabric"],
      standardRequired:    ["category", "colors", "gender"],
      recommended:         ["fabric", "pattern", "silhouette"],
      validateDetailLocks: false,
    },
  ],
  [
    "dress",
    {
      strictRequired:      ["category", "colors", "gender", "silhouette"],
      standardRequired:    ["category", "colors", "gender"],
      recommended:         ["silhouette", "occasion", "fabric"],
      validateDetailLocks: false,
    },
  ],
  [
    "skirt",
    {
      strictRequired:      ["category", "colors", "gender", "silhouette"],
      standardRequired:    ["category", "colors", "gender"],
      recommended:         ["silhouette", "fabric", "pattern"],
      validateDetailLocks: false,
    },
  ],
  [
    "jacket",
    {
      strictRequired:      ["category", "colors", "gender", "fabric"],
      standardRequired:    ["category", "colors", "gender"],
      recommended:         ["fabric", "fit", "occasion"],
      validateDetailLocks: false,
    },
  ],
  [
    "outerwear",
    {
      strictRequired:      ["category", "colors", "gender", "fabric"],
      standardRequired:    ["category", "colors", "gender"],
      recommended:         ["fabric", "fit", "season"],
      validateDetailLocks: false,
    },
  ],
  [
    "activewear",
    {
      strictRequired:      ["category", "colors", "gender", "fit"],
      standardRequired:    ["category", "colors", "gender"],
      recommended:         ["fit", "fabric", "occasion"],
      validateDetailLocks: false,
    },
  ],
  [
    "accessories",
    {
      strictRequired:      ["category", "colors", "gender"],
      standardRequired:    ["category", "colors", "gender"],
      recommended:         ["pattern", "tags"],
      validateDetailLocks: false,
    },
  ],
  [
    "footwear",
    {
      strictRequired:      ["category", "colors", "gender"],
      standardRequired:    ["category", "colors", "gender"],
      recommended:         ["fabric", "tags"],
      validateDetailLocks: false,
    },
  ],
  [
    "other",
    {
      strictRequired:      ["category", "colors", "gender"],
      standardRequired:    ["category", "colors", "gender"],
      recommended:         [],
      validateDetailLocks: false,
    },
  ],
]);

// ── Public helpers ────────────────────────────────────────────────────────────

/**
 * Returns which GarmentAttributes fields are required and recommended
 * for a given category + fidelity mode combination.
 */
export function getRequiredInputs(
  category: GarmentCategory,
  mode:     FidelityMode,
): { required: (keyof GarmentAttributes)[]; recommended: (keyof GarmentAttributes)[] } {
  const reqs = CATEGORY_REQUIREMENTS.get(category);
  if (!reqs) {
    return { required: ["category", "colors", "gender"], recommended: [] };
  }
  return {
    required:    mode === "strict" ? reqs.strictRequired : reqs.standardRequired,
    recommended: reqs.recommended,
  };
}

/**
 * Validates GarmentAttributes against category + fidelity mode requirements.
 *
 * Strict mode:  any missing required field is an error.
 *               For jeans, also runs validateJeansDetailLocks in strict mode.
 *
 * Standard mode: missing required fields are errors (the standard required set
 *               is intentionally smaller). Missing recommended fields are
 *               returned as warnings in the errors array prefixed "WARN:".
 */
export function validateCategoryInputs(
  attrs: GarmentAttributes,
  mode:  FidelityMode,
): ValidationResult {
  const errors: string[] = [];
  const reqs = CATEGORY_REQUIREMENTS.get(attrs.category);

  if (!reqs) {
    // Unknown category — pass through with a warning
    errors.push(`WARN: category "${attrs.category}" has no defined requirements`);
    return { valid: true, errors };
  }

  const required = mode === "strict" ? reqs.strictRequired : reqs.standardRequired;

  for (const field of required) {
    const val = attrs[field];
    const missing =
      val === undefined ||
      val === null ||
      (Array.isArray(val) && (val as unknown[]).length === 0);
    if (missing) {
      errors.push(
        `garment.attributes.${field} is required for ${attrs.category} in ${mode} mode`,
      );
    }
  }

  // Recommended fields → warnings in standard mode; errors in strict mode
  for (const field of reqs.recommended) {
    if (required.includes(field)) continue; // already checked above
    const val = attrs[field];
    const missing =
      val === undefined ||
      val === null ||
      (Array.isArray(val) && (val as unknown[]).length === 0);
    if (missing) {
      if (mode === "strict") {
        errors.push(
          `garment.attributes.${field} is recommended for ${attrs.category} in strict mode`,
        );
      }
      // standard: silently omit — operators can use editorial latitude
    }
  }

  // Jeans detail lock validation
  if (reqs.validateDetailLocks) {
    const lockResult = validateJeansDetailLocks(attrs.detailLocks, mode);
    errors.push(...lockResult.errors);
  }

  const hasErrors = errors.some(e => !e.startsWith("WARN:"));
  return { valid: !hasErrors, errors };
}
