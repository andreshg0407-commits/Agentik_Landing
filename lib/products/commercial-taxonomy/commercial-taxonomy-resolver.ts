/**
 * lib/products/commercial-taxonomy/commercial-taxonomy-resolver.ts
 *
 * Resolves ACC (line=5) products to their commercial family.
 *
 * Resolution order:
 *   1. REFERENCE_OVERRIDE — exact ref match (highest priority)
 *   2. SPLIT guard — if subgroup is SPLIT and no override → sin_clasificar
 *   3. SUBGROUP_RULE — subgroup→family direct mapping
 *   4. Fallback — sin_clasificar
 *
 * Single boundary: only store-snapshot-assembler.ts calls this.
 */

import type { CommercialFamilyKey, TaxonomyResolverInput, TaxonomyResolverResult } from "./commercial-taxonomy-types";
import { SUBGROUP_FAMILY_MAP, SPLIT_SUBGROUPS, REFERENCE_OVERRIDES } from "./commercial-taxonomy-data";

export function resolveCommercialTaxonomy(input: TaxonomyResolverInput): TaxonomyResolverResult {
  const refUpper = input.referenceCode.toUpperCase();
  const subUpper = input.subgrupoSag?.toUpperCase() ?? null;

  // 1. Reference-level override (highest priority)
  const refOverride = REFERENCE_OVERRIDES[refUpper];
  if (refOverride !== undefined) {
    return { familyKey: refOverride, ruleType: "REFERENCE_OVERRIDE" };
  }

  // 2. SPLIT guard — unknown ref in a SPLIT subgroup → sin_clasificar
  if (subUpper && SPLIT_SUBGROUPS.has(subUpper)) {
    return { familyKey: "sin_clasificar", ruleType: "SPLIT" };
  }

  // 3. Subgroup→family direct mapping
  if (subUpper) {
    const family = SUBGROUP_FAMILY_MAP[subUpper];
    if (family) {
      return { familyKey: family, ruleType: "SUBGROUP_RULE" };
    }
  }

  // 4. Fallback
  return { familyKey: "sin_clasificar", ruleType: "SUBGROUP_RULE" };
}
