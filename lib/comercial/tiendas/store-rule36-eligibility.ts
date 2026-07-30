/**
 * lib/comercial/tiendas/store-rule36-eligibility.ts
 *
 * AGENTIK-NEEDS-RULE36-DIAGNOSIS-FIX-01 — Predicado canónico de la Regla 36.
 *
 * LEY DE NEGOCIO (certificada por esta corrección):
 *   La Regla 36 protege referencias textiles con inventario GLOBAL ≤ umbral
 *   (36 unidades). Bajo esa escasez, SOLO las tiendas permitidas (Centro y
 *   Caldas — CASTILLITOS_GLOBAL_LOW_STOCK.allowedStoreIds) pueden recibirla.
 *   Para Centro y Caldas la referencia protegida SIGUE SIENDO ELEGIBLE —
 *   siempre, sea reposición, complemento o referencia nueva.
 *
 * BUG CORREGIDO: el predicado anterior (heredado de la expansión de
 * candidatos de Cobertura) exigía además que la tienda YA TUVIERA la
 * referencia (`isReposicion && allowed`), bloqueando para Centro/Caldas los
 * complementos y referencias nuevas escasas. Eso hacía que la pestaña
 * Necesidades mostrara en Centro "excluidas por Regla 36" — un diagnóstico
 * imposible por definición de la regla.
 *
 * CONTRATO de blockedUnits/eligibleUnits (para la capa de presentación):
 *   La disponibilidad del Sprint 5 se calcula POR TIENDA DESTINO con este
 *   predicado. blockedUnits de la disponibilidad de una tienda son unidades
 *   bloqueadas PARA ESA tienda — nunca un agregado global ni de otra tienda.
 *   Con este predicado, una tienda permitida jamás acumula blockedUnits por
 *   Regla 36.
 *
 * Única implementación — TODO consumidor (proveedor de disponibilidad,
 * candidatos del plan, expansión de Cobertura) importa de aquí. Pure,
 * client-safe.
 */

export interface Rule36EligibilityInput {
  /** Stock global de la referencia en bodega principal. */
  readonly mainStockUnits: number;
  /** Umbral de escasez (CASTILLITOS_GLOBAL_LOW_STOCK.threshold = 36). */
  readonly scarcityThreshold: number;
  /** Tienda DESTINO evaluada. */
  readonly destinationStoreId: string;
  /** Tiendas permitidas bajo escasez (allowedStoreIds: centro, caldas). */
  readonly allowedStoreIds: readonly string[];
}

/**
 * true si la referencia puede moverse a la tienda destino:
 *   - stock global > umbral → elegible para TODAS las tiendas;
 *   - stock global ≤ umbral → elegible SOLO para las tiendas permitidas
 *     (independiente de si la tienda ya tiene o no la referencia).
 */
export function isRule36Eligible(input: Rule36EligibilityInput): boolean {
  if (input.mainStockUnits > input.scarcityThreshold) return true;
  return input.allowedStoreIds.includes(input.destinationStoreId);
}
