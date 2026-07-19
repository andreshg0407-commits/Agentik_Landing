/**
 * lib/comercial/tiendas/store-policy-types.ts
 *
 * Domain types for the Tiendas policy system.
 * Pure types — no runtime logic, no Prisma, no imports.
 *
 * Tiendas policy is fundamentally different from Maletas:
 *
 *   Maletas:                         Tiendas:
 *   - cobertura por vendedor         - surtido por punto fisico
 *   - reglas por subgrupo            - reglas por tienda + linea + subgrupo
 *   - sugiere produccion             - reposicion desde bodega principal
 *   - optimiza oportunidad           - optimiza exhibicion y disponibilidad
 *   - por referencia                 - textil por talla/color, importacion por tamano
 *
 * Sprint: TIENDAS-POLICY-FOUNDATION-01
 * Hotfix: TIENDAS-POLICY-SCOPE-CORRECTION-01
 */

// ── Product classification ──────────────────────────────────────────────────

/**
 * Product class determines default thresholds and how rules apply.
 *
 *   textile   — ropa: regla aplica a cada combinacion ref + talla + color
 *   bulky     — voluminosos: regla aplica por referencia, max limitado por espacio
 *   accessory — accesorios: mayor profundidad, max mas alto
 *   other     — generico
 */
export type StoreProductClass = "textile" | "bulky" | "accessory" | "other";

// ── Size class (for imports/bulky) ──────────────────────────────────────────

/**
 * Commercial size class — determines space constraints for non-textile products.
 *
 *   small     — productos pequenos (accesorios, bolsos)
 *   medium    — productos medianos (maletas medianas, sillas)
 *   large     — productos grandes (cunas, coches)
 *   oversized — productos extra grandes (muebles, exhibidores)
 */
export type StoreSizeClass = "small" | "medium" | "large" | "oversized";

// ── Policy scope ────────────────────────────────────────────────────────────

/**
 * Scope determines how a policy rule matches inventory items.
 * Resolution order (most specific wins):
 *
 *   1. variant_override — exact ref + talla + color (excepciones puntuales)
 *   2. reference        — exact ref (all tallas/colores)
 *   3. line_subgroup    — linea + subgrupo (flujo principal textil)
 *   4. subgroup         — SAG subgrupo solo
 *   5. line             — linea sola
 *   6. class_size       — productClass + sizeClass (flujo principal importacion)
 *   7. productClass     — solo clase de producto
 *   8. store            — store-wide default
 */
export type StorePolicyScope =
  | "variant_override"
  | "reference"
  | "line_subgroup"
  | "subgroup"
  | "line"
  | "class_size"
  | "productClass"
  | "store";

// ── Thresholds ──────────────────────────────────────────────────────────────

export interface StoreReplenishmentThreshold {
  minQty:   number;
  idealQty: number;
  maxQty:   number;
}

// ── Capacity profile ────────────────────────────────────────────────────────

export interface StoreCapacityProfile {
  /** Total display slots available in the store */
  totalSlots?:   number;
  /** Occupied slots (from current inventory) */
  usedSlots?:    number;
  /** Whether the store is at capacity */
  atCapacity:    boolean;
}

// ── Coverage strategy ─────────────────────────────────────────────────────

/**
 * Discriminator for how a rule defines coverage:
 *
 *   SUBGROUP — textil: regla por linea + subgrupo (talla/color)
 *   SIZE     — importacion/accesorios: regla por tamano (pequeno/mediano/grande)
 */
export type CoverageStrategy = "SUBGROUP" | "SIZE";

// ── Policy rule ─────────────────────────────────────────────────────────────

export interface StorePolicyRule {
  id:           string;
  storeId:      string;
  scope:        StorePolicyScope;
  productClass: StoreProductClass;

  /** Match filters — populated based on scope */
  line?:          string;
  subgroup?:      string;
  sizeClass?:     StoreSizeClass;
  referenceCode?: string;
  category?:      string;
  size?:          string;
  color?:         string;

  /** Thresholds */
  minQty:   number;
  idealQty: number;
  maxQty:   number;

  /** Behavior flags */
  allowReplacement:          boolean;
  allowProductionSignal:     boolean;
  allowMainWarehouseTransfer: boolean;
  priority:                  number;

  active: boolean;

  /** How this rule defines coverage — SUBGROUP (textil) or SIZE (importacion) */
  coverageStrategy?: CoverageStrategy;
}

// ── Store policy (aggregate) ────────────────────────────────────────────────

export interface StorePolicy {
  storeId:      string;
  storeName:    string;
  rules:        StorePolicyRule[];
  capacity?:    StoreCapacityProfile;
  active:       boolean;
  updatedAt:    string;
}

// ── Replenishment need (output of policy engine) ────────────────────────────

export type ReplenishmentStatus = "ok" | "low" | "out" | "overstock" | "blocked";

export interface StoreReplenishmentNeed {
  storeId:       string;
  referenceCode: string;
  productName:   string;
  size:          string;
  color:         string;
  productClass:  StoreProductClass;

  currentQty:    number;
  minQty:        number;
  idealQty:      number;
  maxQty:        number;
  neededQty:     number;
  status:        ReplenishmentStatus;

  /** The rule that resolved these thresholds */
  resolvedBy:    StorePolicyScope | "default";
}

// ── Replenishment decision (what to do about a need) ────────────────────────

export interface StoreReplenishmentDecision {
  storeId:                    string;
  referenceCode:              string;
  size:                       string;
  color:                      string;

  transferFromMainWarehouse:  boolean;
  transferQty:                number;
  replacementNeeded:          boolean;
  productionSignalAllowed:    boolean;
  reason:                     string;
}

// ── Policy resolution input ─────────────────────────────────────────────────

export interface PolicyResolutionInput {
  storeId:       string;
  referenceCode: string;
  size:          string;
  color:         string;
  line:          string;
  subgroup:      string;
  category:      string;
  productClass:  StoreProductClass;
  sizeClass?:    StoreSizeClass;
}

export interface ReplenishmentNeedInput {
  storeId:       string;
  referenceCode: string;
  productName:   string;
  size:          string;
  color:         string;
  line:          string;
  subgroup:      string;
  category:      string;
  productClass:  StoreProductClass;
  sizeClass?:    StoreSizeClass;
  currentQty:    number;
}

export interface ReplenishmentDecisionInput {
  need:              StoreReplenishmentNeed;
  mainWarehouseQty:  number;
  rule:              StorePolicyRule | null;
}
