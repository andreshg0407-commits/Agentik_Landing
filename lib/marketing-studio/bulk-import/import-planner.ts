/**
 * lib/marketing-studio/bulk-import/import-planner.ts
 *
 * MARKETING-STUDIO-BULK-IMPORT-01
 *
 * Dry-run engine: converts a ParsedImportStructure into an ImportPlan
 * by cross-referencing existing SKUs and detecting conflicts.
 *
 * ── Guarantees ────────────────────────────────────────────────────────────────
 *   - No DB writes
 *   - No side effects
 *   - Deterministic output for same input
 *   - Every reference in the plan belongs to exactly one category
 *   - Every asset in the plan belongs to exactly one reference
 */

import type {
  ParsedImportStructure,
  ImportPlan,
  ImportPlanCategory,
  ImportPlanReference,
  ImportConflict,
  ConflictResolution,
} from "./import-types";

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * planImport — builds an ImportPlan from a parsed structure and the set
 * of existing SKUs in the organization.
 *
 * @param structure   Output of parseFolder() or parseZip()
 * @param existingSkus  Map<sku, productId> from the organization's DB
 * @param conflictResolutions  Optional pre-set resolutions from user (Step 3)
 */
export function planImport(
  structure:            ParsedImportStructure,
  existingSkus:         Map<string, string>,
  conflictResolutions?: Map<string, ConflictResolution>,
): ImportPlan {
  const planCategories: ImportPlanCategory[] = [];
  const allConflicts:   ImportConflict[]     = [];
  let   totalRefs      = 0;
  let   totalAssets    = 0;
  let   skippedFiles   = structure.unknownFiles.length;

  for (const cat of structure.categories) {
    const planRefs: ImportPlanReference[] = [];

    for (const ref of cat.references) {
      // Detect SKU conflict
      let conflict: ImportConflict | undefined;

      if (ref.sku && existingSkus.has(ref.sku.toUpperCase())) {
        const existingId = existingSkus.get(ref.sku.toUpperCase())!;
        const preset     = conflictResolutions?.get(ref.sku);
        conflict = {
          type:          "sku_exists",
          referenceName: ref.name,
          sku:           ref.sku,
          existingId,
          resolution:    preset ?? "skip",  // default safe: skip, user can change
        };
        allConflicts.push(conflict);
      }

      planRefs.push({
        name:     ref.name,
        sku:      ref.sku,
        category: cat.name,
        files:    ref.files,
        conflict,
      });
    }

    const catAssets = planRefs.reduce((s, r) => s + r.files.length, 0);
    totalRefs   += planRefs.length;
    totalAssets += catAssets;

    planCategories.push({
      name:           cat.name,
      referenceCount: planRefs.length,
      assetCount:     catAssets,
      references:     planRefs,
    });
  }

  return {
    source:          structure.source,
    categories:      planCategories,
    totalCategories: planCategories.length,
    totalReferences: totalRefs,
    totalAssets,
    skippedFiles,
    conflicts:       allConflicts,
  };
}

/**
 * countExecutableRefs — refs that will actually be created
 * (excludes those with resolution="skip").
 */
export function countExecutableRefs(plan: ImportPlan): {
  refs:   number;
  assets: number;
} {
  let refs   = 0;
  let assets = 0;
  for (const cat of plan.categories) {
    for (const ref of cat.references) {
      if (ref.conflict?.resolution === "skip") continue;
      refs++;
      assets += ref.files.length;
    }
  }
  return { refs, assets };
}

// ── Re-export for convenience ─────────────────────────────────────────────────

export type { ConflictResolution } from "./import-types";
