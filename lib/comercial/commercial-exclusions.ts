/**
 * lib/comercial/commercial-exclusions.ts
 *
 * AGENTIK-COMMERCIAL-CD-LINE-GLOBAL-EXCLUSION-01 — Central exclusion law.
 *
 * Business law:
 *   CD-* es una colección / línea especial con reglas de precio propias.
 *   NUNCA entra a superficies de precio automático ni de inventario lento:
 *     - Descuentos automáticos (aging de tiendas)
 *     - Markdowns automáticos del policy pack
 *     - Baja rotación en tienda (STORE_SLOW_ROTATION)
 *     - Dead stock de maletas
 *     - Bóveda de referencias dormidas (vault de revisión)
 *     - Outlet (consumidor futuro del motor de aging — hereda la regla)
 *
 * Every surface MUST consume this module — never re-implement the prefix
 * check inline. One law, one file, N consumers.
 *
 * Client-safe: NO "server-only" import. Pure functions only.
 */

// ── The protected prefix ─────────────────────────────────────────────────────

/**
 * Reference prefixes that mark a protected special collection.
 * "CD-2071343B" and "CD 2071343B" both match (same convention the
 * production classifier uses for C-/C variants).
 */
export const SPECIAL_COLLECTION_PREFIXES = ["CD-", "CD "] as const;

// ── Surfaces governed by this law (documentation + telemetry) ────────────────

export type AutomaticPricingSurface =
  | "DESCUENTOS_TIENDA"        // store-discount-service (aging tiers)
  | "MARKDOWN_AUTOMATICO"      // store-decision-engine evaluateAutomaticMarkdowns
  | "BAJA_ROTACION_TIENDA"     // store-decision-engine evaluateSlowRotation
  | "DEADSTOCK_MALETAS"        // maletas-deadstock detectDeadStock
  | "VAULT_DORMIDAS"           // dormant-reference-loader review vault
  | "OUTLET";                  // future consumer of the aging engine

export const GOVERNED_SURFACES: readonly AutomaticPricingSurface[] = [
  "DESCUENTOS_TIENDA",
  "MARKDOWN_AUTOMATICO",
  "BAJA_ROTACION_TIENDA",
  "DEADSTOCK_MALETAS",
  "VAULT_DORMIDAS",
  "OUTLET",
];

// ── The rule ─────────────────────────────────────────────────────────────────

/**
 * True when the reference belongs to the protected special collection (CD-*).
 * Null/empty references are NOT special (they fail other gates elsewhere).
 */
export function isSpecialCollectionReference(
  referenceCode: string | null | undefined,
): boolean {
  if (!referenceCode) return false;
  const ref = referenceCode.trim().toUpperCase();
  return SPECIAL_COLLECTION_PREFIXES.some(p => ref.startsWith(p));
}

/**
 * True when the reference must be excluded from an automatic pricing or
 * slow-inventory surface. Today this is exactly the special collection rule;
 * new global exclusions (other prefixes, other flags) extend HERE, never
 * inline in a consumer.
 */
export function isExcludedFromAutomaticPricing(
  referenceCode: string | null | undefined,
): boolean {
  return isSpecialCollectionReference(referenceCode);
}

/**
 * Split items into eligible/excluded for an automatic pricing surface.
 * Generic helper so consumers keep one-line call sites.
 */
export function partitionPricingEligible<T>(
  items: readonly T[],
  getReference: (item: T) => string | null | undefined,
): { eligible: T[]; excluded: T[] } {
  const eligible: T[] = [];
  const excluded: T[] = [];
  for (const item of items) {
    if (isExcludedFromAutomaticPricing(getReference(item))) excluded.push(item);
    else eligible.push(item);
  }
  return { eligible, excluded };
}

/**
 * Standard human-readable reason for UI/reports when an item is withheld.
 */
export function specialCollectionExclusionReason(referenceCode: string): string {
  return `${referenceCode} pertenece a la colección especial CD-* (reglas de precio propias). ` +
         `Excluida de descuentos, outlet e inventario lento por regla global.`;
}
