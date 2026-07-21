/**
 * lib/comercial/maletas/maletas-commercial-scope.ts
 *
 * COMERCIAL-MALETAS-CANONICAL-ACTIVATION-01
 *
 * Commercial scope filter for the Maletas runtime.
 * Determines which references from the canonical inventory are eligible
 * to participate in Maletas commercial decisions.
 *
 * Pure function. No React. No Prisma. No queries. No side effects.
 * Consumes only canonical enums — never duplicates them.
 */

import type { CanonicalMaletaInventoryRef } from "./maletas-canonical-inventory";

/**
 * TRUE if the reference is eligible to participate in Maletas runtime decisions.
 *
 * Returns FALSE for:
 *   - JUPITER_PETS or UNKNOWN domain
 *   - DORMANT, ARCHIVE_REVIEW, or UNKNOWN status
 *   - ACTIVE_NON_COMMERCIAL or LOW_ACTIVITY_NON_COMMERCIAL status
 *   - NO_ACTIVITY_DATA stock distribution (no inventory visibility)
 *
 * Returns TRUE only for:
 *   - ACTIVE_AVAILABLE
 *   - LOW_ACTIVITY_AVAILABLE
 *
 * Fail closed: any status not explicitly allowed returns FALSE.
 */
export function isReferenceEligibleForMaletasRuntime(
  ref: CanonicalMaletaInventoryRef,
): boolean {
  // Excluded domains
  if (ref.businessDomain === "JUPITER_PETS") return false;
  if (ref.businessDomain === "UNKNOWN") return false;

  // No inventory visibility
  if (ref.stockDistribution === "NO_ACTIVITY_DATA") return false;

  // Allowed statuses (exhaustive — fail closed)
  return (
    ref.commercialReferenceStatus === "ACTIVE_AVAILABLE" ||
    ref.commercialReferenceStatus === "LOW_ACTIVITY_AVAILABLE"
  );
}
