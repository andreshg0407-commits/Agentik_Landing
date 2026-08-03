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
 *   small     — PEQUENO (accesorios, bolsos)
 *   medium    — MEDIANO (maletas medianas, sillas)
 *   large     — GRANDE (cunas, coches, muebles)
 *
 * Canonical source: ProductEntity.handlingUnit normalized by Inventario Canonico.
 * Shared by: Inventario, Maletas, Importaciones, Tiendas.
 * Tiendas NEVER resolves sizeClass locally — it consumes the canonical value.
 */
export type StoreSizeClass = "small" | "medium" | "large";

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

// ── Rule kind (Sprint DYNAMIC-DERROTERO-RULES-01) ────────────────────────

/**
 * Discriminator for coverage rule projection.
 * Determines which target dimensions are meaningful.
 */
export type StorePolicyRuleKind =
  | "TEXTILE_STRUCTURE"
  | "ACCESSORY_SIZE"
  | "SPECIAL_PRODUCT"
  | "AGING_DISCOUNT";

// ── Rule effect (Sprint DYNAMIC-DERROTERO-RULES-01) ──────────────────────

/**
 * Semantic effect of a persisted rule relative to the Policy Pack base.
 *
 *   OVERRIDE — replaces thresholds/config of an equivalent base rule.
 *   DISABLE  — suppresses an equivalent base rule from the effective universe.
 *   ADD      — introduces a new rule that does not exist in the pack.
 *
 * IMPORTANT: active=false means "this persisted entry does not participate"
 * (pack base keeps applying). effect=DISABLE + active=true means "pack base
 * is explicitly suppressed".
 */
export type StorePolicyRuleEffect = "OVERRIDE" | "DISABLE" | "ADD";

// ── Policy rule ─────────────────────────────────────────────────────────────

export interface StorePolicyRule {
  id:           string;
  storeId:      string;
  scope:        StorePolicyScope;
  productClass: StoreProductClass;

  /** Match filters — populated based on scope */
  line?:          string;
  /** SAG grupo (for CS textiles — group+subgroup = structure identity) */
  group?:         string;
  subgroup?:      string;
  sizeClass?:     StoreSizeClass;
  referenceCode?: string;
  category?:      string;
  size?:          string;
  color?:         string;

  /**
   * Coverage thresholds — required for TEXTILE_STRUCTURE, ACCESSORY_SIZE,
   * SPECIAL_PRODUCT. NOT used by AGING_DISCOUNT (uses minDays/maxDays/discountPercent).
   */
  minQty?:   number;
  idealQty?: number;
  maxQty?:   number | null;

  /** Behavior flags */
  allowReplacement:          boolean;
  allowProductionSignal:     boolean;
  allowMainWarehouseTransfer: boolean;
  priority:                  number;

  active: boolean;

  /** How this rule defines coverage — SUBGROUP (textil) or SIZE (importacion) */
  coverageStrategy?: CoverageStrategy;

  /** Coverage rule kind discriminator (Sprint DYNAMIC-DERROTERO-RULES-01) */
  ruleKind?: StorePolicyRuleKind;

  /** Semantic effect relative to Policy Pack base */
  effect?: StorePolicyRuleEffect;

  /** Pattern identifier for special products (e.g. "BAÑERA") */
  specialPattern?: string;

  /**
   * AGING_DISCOUNT fields — minimum days in store for this discount band.
   * Sprint: AGENTIK-STORES-DISCOUNTS-DYNAMIC-RULES-01
   */
  minDays?:          number;
  /** Maximum days in store for this band. null = open-ended (e.g. 365+). */
  maxDays?:          number | null;
  /** Discount percentage for this aging band (0–100). */
  discountPercent?:  number;

  /** Vigencia — optional temporal applicability */
  validFrom?: string | null;
  validTo?:   string | null;
  season?:    string | null;
  notes?:     string | null;

  /** Audit metadata for disable operations */
  disabledAt?:     string | null;
  disableReason?:  string | null;
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
