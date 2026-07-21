/**
 * lib/inventory/reference-business-domain.ts
 *
 * COMERCIAL-INVENTORY-CANONICAL-STATUS-01 — Business Domain Gate
 *
 * Upstream gate that determines which business domain a reference belongs to.
 * References outside Castillitos commercial scope must NOT enter the
 * commercial availability classifier.
 *
 * Pure TypeScript. No Prisma. No React. No server-only.
 * No side effects. No queries. Fully deterministic.
 *
 * Domain is resolved from product metadata, NEVER from warehouse stock.
 * A product in BODEGA PRINCIPAL does not become CASTILLITOS_TEXTILE
 * if its grupoSag says JUPITER PETS.
 */

// ── Domain type ─────────────────────────────────────────────────────────────

export type ReferenceBusinessDomain =
  | "CASTILLITOS_TEXTILE"
  | "LATIN_KIDS_TEXTILE"
  | "CASTILLITOS_IMPORT"
  | "JUPITER_PETS"
  | "UNKNOWN";

// ── Resolver input ──────────────────────────────────────────────────────────

export interface DomainResolverInput {
  /** SAG line name (lineaSag field) */
  lineaSag: string | null;
  /** SAG line ID (productLine field: "1"=LT, "2"=CS, "3"/"4"/"6"=CS, "5"=import) */
  productLine: string | null;
  /** SAG group (grupoSag field) */
  grupoSag: string | null;
  /** SAG subgroup (subgrupoSag field) */
  subgrupoSag: string | null;
}

// ── Resolver ────────────────────────────────────────────────────────────────

/**
 * Resolve the business domain of a reference from product metadata.
 *
 * Rules (in precedence order):
 *   1. grupoSag contains "JUPITER" → JUPITER_PETS
 *   2. productLine === "5" → CASTILLITOS_IMPORT
 *   3. productLine === "1" → LATIN_KIDS_TEXTILE
 *   4. productLine === "2" | "3" | "4" | "6" → CASTILLITOS_TEXTILE
 *   5. grupoSag starts with "LT " → LATIN_KIDS_TEXTILE
 *   6. grupoSag starts with "CS " or is "PRODUCTO TERMINADO" or "BASICAS" → CASTILLITOS_TEXTILE
 *   7. grupoSag === "IMPORTACION" → CASTILLITOS_IMPORT
 *   8. Everything else → UNKNOWN
 *
 * Domain is NEVER inferred from warehouse stock location.
 */
export function resolveReferenceBusinessDomain(input: DomainResolverInput): ReferenceBusinessDomain {
  const { grupoSag, productLine } = input;

  // 1. Jupiter Pets — always first, unconditional
  if (grupoSag && grupoSag.toUpperCase().includes("JUPITER")) {
    return "JUPITER_PETS";
  }

  // 2. Import line
  if (productLine === "5") {
    return "CASTILLITOS_IMPORT";
  }

  // 3. Latin Kids textile (line 1)
  if (productLine === "1") {
    return "LATIN_KIDS_TEXTILE";
  }

  // 4. Castillitos textile (lines 2, 3, 4, 6)
  if (productLine === "2" || productLine === "3" || productLine === "4" || productLine === "6") {
    return "CASTILLITOS_TEXTILE";
  }

  // 5-7. Fallback by grupoSag when productLine is null
  if (grupoSag) {
    const upper = grupoSag.toUpperCase();
    if (upper.startsWith("LT ")) return "LATIN_KIDS_TEXTILE";
    if (upper.startsWith("CS ") || upper === "PRODUCTO TERMINADO" || upper.startsWith("BASICAS")) return "CASTILLITOS_TEXTILE";
    if (upper === "IMPORTACION") return "CASTILLITOS_IMPORT";
    if (upper === "PIJAMAS DAMA") return "CASTILLITOS_TEXTILE";
    if (upper === "PRODUCTO EN PROCESO") return "CASTILLITOS_TEXTILE";
  }

  return "UNKNOWN";
}

// ── Scope filter ────────────────────────────────────────────────────────────

/**
 * Returns true only for references that belong to Castillitos commercial scope.
 *
 * JUPITER_PETS and UNKNOWN are excluded.
 * They must not enter the commercial availability classifier.
 */
export function isReferenceInCastillitosCommercialScope(domain: ReferenceBusinessDomain): boolean {
  return domain === "CASTILLITOS_TEXTILE"
    || domain === "LATIN_KIDS_TEXTILE"
    || domain === "CASTILLITOS_IMPORT";
}

// ── Exclusion reason for out-of-scope references ────────────────────────────

export function getExclusionReason(domain: ReferenceBusinessDomain): string | null {
  switch (domain) {
    case "JUPITER_PETS":
      return "EXCLUDED_EXTERNAL_INTEGRATION";
    case "UNKNOWN":
      return "EXCLUDED_UNKNOWN_DOMAIN";
    default:
      return null;
  }
}
