/**
 * vendor-sample-types.ts
 *
 * VENDOR-SAMPLE-REPLACEMENT-INTELLIGENCE-01
 * VENDOR-SAMPLE-SUBGROUP-REPLACEMENT-ENGINE-01
 * VENDOR-SAMPLE-IMPORT-SCARCITY-ENGINE-01
 *
 * RECOMPRA NO SE IMPLEMENTA — futuro sprint: ACCESSORY-REPLENISHMENT-INTELLIGENCE-01
 *
 * 2-state model:
 *   SALUDABLE  — disponible > minimo (strict greater-than)
 *   REEMPLAZAR — disponible <= minimo
 *
 * Subgrupo SAG is the primary unit of replacement decision.
 * Multiple replacement options per ref (not just one).
 */

// ── Operational states (2-state model) ──────────────────────────────────────

export type SampleState = "saludable" | "reemplazar" | "sin_datos";

export type VendorHealth = "saludable" | "riesgo" | "critico" | "sin_datos";

// ── Commercial health (MALLETS-OPERATIONAL-LOGIC-ALIGNMENT-01) ──────────────
// Per-ref assessment of MAIN WAREHOUSE stock availability.
// Independent from vendor mallet presence (which is always true for returned refs).

export type SampleCommercialHealth =
  | "HEALTHY"          // centralAvailable > minimumRequired
  | "LOW_STOCK"        // 0 < centralAvailable <= minimumRequired
  | "OUT_OF_STOCK"     // centralAvailable <= 0
  | "INSUFFICIENT_DATA"; // no coverage data available

/** Whether stock data is a real certified reading vs absent/uncertifiable. */
export type StockDataState =
  | "CERTIFIED"        // real data from canonical or CCS — value is trustworthy
  | "ABSENT";          // no data source — show "—", never "0"

// ── Accessory/import scarcity (IMPORT-SCARCITY-ENGINE-01) ───────────────────

export type AccessoryScarcityState = "saludable" | "escasez";

export const IMPORT_SCARCITY_MINIMUM = 10;

/** Import source warehouses — bodega CODES (externalRef), not SAG numeric PKs.
 *  SAG-DATAFLOW-FIX-01: was ["36","37"] (SAG PKs) which mapped to codes "26","27".
 *  Now uses the actual codes that match ProductInventoryLevel.externalRef. */
export const IMPORT_SOURCE_WAREHOUSES = ["26", "27"];

// ── Motor 2: Derrotero de Maleta Ideal ──────────────────────────────────────
// Subgroup coverage thresholds for vendor bags.
// When a vendor's active refs in a subgroup drop to MINIMUM → Motor 2 cascade triggers.
// IDEAL is the target, MINIMUM is the alert threshold.
// These defaults apply to all subgroups. Per-subgroup config is a future sprint.

export const DEFAULT_SUBGROUP_IDEAL_REFS = 3;
export const DEFAULT_SUBGROUP_MINIMUM_REFS = 3;

// ── Business rules ──────────────────────────────────────────────────────────

export interface SampleMinimumRule {
  line: string;         // "LT" | "CS" | "IMPORT"
  minimumUnits: number; // LT=30, CS=20, IMPORT=10
}

export const SAMPLE_MINIMUM_RULES: SampleMinimumRule[] = [
  { line: "LT", minimumUnits: 30 },
  { line: "CS", minimumUnits: 20 },
  { line: "IMPORT", minimumUnits: 10 },
];

export function getMinimumForLine(line: string): number {
  const rule = SAMPLE_MINIMUM_RULES.find((r) => r.line === line);
  return rule?.minimumUnits ?? 20; // default CS
}

// ── RETIRO classification (COMERCIAL-MALETAS-DERROTERO-EXCLUDE-RETIRO-01) ──────
//
// Canonical removal classification for maleta references.
// Single source of truth: thresholds by business domain, no duplicates.
// A reference is candidate for RETIRO when:
//   - compatibleCommercialStock <= domain threshold, OR
//   - stockDataState is not certified (no reading), OR
//   - domain is unknown/external

/** Business domain as resolved by the canonical inventory system. */
export type RemovalBusinessDomain =
  | "CASTILLITOS_TEXTILE"
  | "LATIN_KIDS_TEXTILE"
  | "CASTILLITOS_IMPORT"
  | "UNKNOWN";

/** Thresholds by business domain. Change here to adjust policy. */
export const RETIRO_THRESHOLDS: Record<RemovalBusinessDomain, number> = {
  CASTILLITOS_TEXTILE: 20,
  LATIN_KIDS_TEXTILE: 30,
  CASTILLITOS_IMPORT: 10,
  UNKNOWN: 0,
};

/** Map drawer line → business domain */
const LINE_TO_DOMAIN: Record<string, RemovalBusinessDomain> = {
  CS: "CASTILLITOS_TEXTILE",
  LT: "LATIN_KIDS_TEXTILE",
  IMPORT: "CASTILLITOS_IMPORT",
};

export interface RemovalInput {
  businessDomain?: RemovalBusinessDomain;
  /** Drawer line — used as fallback when businessDomain is not available */
  line?: string;
  compatibleCommercialStock: number;
  stockDataState: StockDataState;
}

/**
 * Pure classification: is this reference a candidate for RETIRO?
 *
 * Consumes exclusively:
 *   - businessDomain (or line as fallback)
 *   - compatibleCommercialStock (from canonical resolver)
 *   - stockDataState (certified or absent)
 *   - RETIRO_THRESHOLDS (configurable per domain)
 *
 * Does NOT depend on: badges, UI state, centralAvailable, colors.
 */
export function isCandidateForRemoval(input: RemovalInput): boolean {
  // No certified reading → retiro for audit
  if (input.stockDataState !== "CERTIFIED") return true;

  // Resolve domain
  const domain: RemovalBusinessDomain = input.businessDomain
    ?? LINE_TO_DOMAIN[input.line ?? ""]
    ?? "UNKNOWN";

  // Unknown/external domain → retiro
  if (domain === "UNKNOWN") return true;

  const threshold = RETIRO_THRESHOLDS[domain];
  return input.compatibleCommercialStock <= threshold;
}

// ── Replacement option ─────────────────────────────────────────────────────

export type ReplacementSource = "bodega_principal" | "op_activa";

export interface VendorReplacementOption {
  reference: string;
  description: string;
  subgrupoId: number | null;
  subgrupoSag: string;
  line: string;
  available: number;
  source: ReplacementSource;
}

// ── OP replacement option (VENDOR-SAMPLE-OP-LINKING-01) ────────────────────

export interface VendorOpReplacementOption {
  reference: string;
  description: string;
  subgrupoId: number | null;
  subgrupoSag: string;
  line: string;
  opNumber: string;
  orderedQty: number;
  producedQty: number;
  pendingQty: number;
  createdAt: string;
  /** Last ProductionEvent date for this OP, ISO string or null */
  lastEventDate: string | null;
  source: "op_activa";
}

// ── Supply action types (GO-LIVE-MALETAS-MOTOR-ABASTECIMIENTO-01) ───────────
// Typed supply actions following Castillitos commercial decision flow.
// Textil (LT/CS): bodega → OP → PRODUCCION_SUGERIDA → retirar
// Import:          bodega → OP → RECOMPRA_SUGERIDA   → retirar (NEVER produccion)
// A ref may have exactly ONE supplyAction (no duplicates).

export type SupplyActionType =
  | "REEMPLAZAR_BODEGA"
  | "COMPLETAR_DESDE_OP"
  | "PRODUCCION_SUGERIDA"
  | "RECOMPRA_SUGERIDA"
  | "RETIRAR_MOSTRARIO";

// ── Per-reference view ──────────────────────────────────────────────────────

export interface VendorSampleRef {
  reference: string;
  description: string;
  line: string;
  subgrupoSag: string;              // from SAG SUBGRUPOS sc_detalle_subgrupo
  subgrupoId: number | null;        // FK to SUBGRUPOS
  grupoSag: string | null;          // from SAG GRUPOS sc_detalle_grupo (via subgrupo→grupo FK)
  group: string | null;             // ProductEntity.category (legacy, NOT SAG grupo)
  imageUrl: string | null;          // hero image URL from ProductAssetLink→GeneratedAsset
  brand: string | null;             // "Castillitos" | "Latin Kids" resolved from productLine
  sizeClass: string | null;         // IMPORT only: "PEQUENO" | "MEDIANO" | "GRANDE"
  present: boolean;                  // F34 net balance > 0
  centralAvailable: number;          // textil: B01+B04 (CCS), import: B24 (canonical)
  minimumRequired: number;           // from business rules
  state: SampleState;                // "saludable" | "reemplazar" (central stock vs minimum)
  commercialHealth: SampleCommercialHealth; // MAIN warehouse health (independent of presence)
  stockDataState: StockDataState;    // CERTIFIED = real reading, ABSENT = no data (show "—")
  riesgoAgotamiento: boolean;        // saludable but disponible <= minimo + 10
  suggestedAction: string | null;    // "Reemplazar referencia" | "Sugerir produccion" | null
  /** @deprecated Use replacementOptions instead */
  replacementRef: string | null;
  /** @deprecated Use replacementOptions instead */
  replacementDesc: string | null;
  /** @deprecated Use replacementOptions instead */
  replacementAvailable: number | null;
  replacementSource: string | null;  // "mismo subgrupo SAG" | "misma linea" | null
  // Multi-option replacement engine (SUBGROUP-REPLACEMENT-ENGINE-01)
  replacementOptions: VendorReplacementOption[];      // bodega principal candidates
  // OP linking (VENDOR-SAMPLE-OP-LINKING-01)
  opReplacementOptions: VendorOpReplacementOption[];  // OP activa candidates
  requiresProductionSuggestion: boolean;              // true when no options & LT/CS
  // Typed supply action (GO-LIVE-MALETAS-MOTOR-ABASTECIMIENTO-01)
  supplyAction: SupplyActionType | null;
  lastTransferDate: string | null;
  sourceWarehouse: string | null;
  // Accessory/import scarcity (IMPORT-SCARCITY-ENGINE-01)
  isAccessory: boolean;                                // true when line = "IMPORT" or productLine = "5"
  availableB24: number | null;                         // sum of import source warehouses (B36+B37)
  accessoryScarcityState: AccessoryScarcityState | null; // "saludable" | "escasez"
  accessorySuggestedAction: "DEJAR_DE_VENDER" | null;
}

// ── Per-vendor snapshot ─────────────────────────────────────────────────────

export interface VendorSampleSnapshot {
  vendorId: string;
  vendorName: string;
  warehouseCode: string;
  warehouseName: string;
  health: VendorHealth;
  isActive: boolean;                // vendor activation state (Go Live)
  totalRefs: number;
  totalUnits: number;
  estimatedValue: number;
  replaceRefs: number;              // state === "reemplazar"
  healthyRefs: number;              // state === "saludable"
  sinDatosRefs: number;             // state === "sin_datos" (COMERCIAL-INVENTARIO-DATA-SAFETY-LOCK-01)
  riesgoAgotamientoRefs: number;    // riesgoAgotamiento === true
  // Commercial health KPIs (MALLETS-OPERATIONAL-LOGIC-ALIGNMENT-01)
  healthyCommercialRefs: number;    // commercialHealth === "HEALTHY"
  lowStockCommercialRefs: number;   // commercialHealth === "LOW_STOCK"
  outOfStockCommercialRefs: number; // commercialHealth === "OUT_OF_STOCK"
  // Accessory KPIs (IMPORT-SCARCITY-ENGINE-01)
  accessoryRefs: number;            // isAccessory === true
  accessoryScarcityRefs: number;    // accessoryScarcityState === "escasez"
  refs: VendorSampleRef[];
  lines: string[];
}

// ── Executive summary ───────────────────────────────────────────────────────

export interface MaletasExecutiveSummary {
  activeVendors: number;
  totalDistributedRefs: number;
  replaceRefs: number;
  riesgoAgotamientoRefs: number;
  coverageGapRefs: number;
  totalDistributedUnits: number;
  estimatedTotalValue: number;
  // Accessory KPIs (IMPORT-SCARCITY-ENGINE-01)
  accessoryRefs: number;
  accessoryScarcityRefs: number;
}

// ── Accessory summary (MALETAS-ACCESSORY-LINE-INTELLIGENCE-FIX-01) ─────────
// Global (not per-vendor): all vendors sell from the same B36+B37 pool.
// Accessories DO appear in F34 vendor presence (same bodegas 45-50 as textil).
// Central availability controlled by B36+B37 import warehouses.

export interface AccessorySummary {
  totalRefs: number;       // all productLine=5 refs in ProductEntity
  availableRefs: number;   // refs with B36+B37 available > 0
  scarcityRefs: number;    // refs with 0 < available <= IMPORT_SCARCITY_MINIMUM
  healthyRefs: number;     // refs with available > IMPORT_SCARCITY_MINIMUM
  zeroStockRefs: number;   // refs with available = 0
}

// ── Coverage gap ────────────────────────────────────────────────────────────

export interface CoverageGapRef {
  reference: string;
  description: string;
  line: string;
  subgrupoId: number | null;
  subgrupoSag: string | null;
  centralAvailable: number;
  vendorPresence: number;
  suggestedAction: string;
}

// ── Replacement suggestion ──────────────────────────────────────────────────

export interface ReplacementSuggestion {
  vendorId: string;
  currentRef: string;
  currentDesc: string;
  currentAvailable: number;
  replacementRef: string;
  replacementDesc: string;
  replacementAvailable: number;
  matchReason: string;
}

// ── Production suggestion ───────────────────────────────────────────────────

export type ProductionReasonType =
  | "subgroup_shortage"
  | "no_replacement_available"
  | "central_stock_insufficient";

// ── Production suggestion eligibility (COMERCIAL-MALETAS-PRODUCTION-CANONICAL-FILTER-01)
//
// Pure function — determines if a vendor sample ref is eligible to feed
// the production suggestion engine.
//
// Does NOT filter by centralAvailable — a correctly classified ref with
// stock === 0 IS a legitimate production suggestion.
//
// Filters OUT:
//   - refs not flagged for production suggestion
//   - non-textile lines (only LT/CS produce)
//   - missing or sentinel grupoSag values
//   - missing or sentinel subgrupoSag values
//   - refs with state "sin_datos" (no inventory data = cannot certify need)

/** Sentinel values that indicate missing or fallback classification. */
const CLASSIFICATION_SENTINELS = new Set([
  "OTRO",
  "SIN_CLASIFICAR",
  "SIN CLASIFICAR",
  "SIN_GRUPO",
  "SIN GRUPO",
  "SIN_SUBGRUPO",
  "SIN SUBGRUPO",
  "SIN_SUBGRUPO_SAG",
  "SIN SUBGRUPO SAG",
  "",
  "—",
  "-",
]);

function isSentinel(value: string | null | undefined): boolean {
  if (value == null) return true;
  return CLASSIFICATION_SENTINELS.has(value.trim().toUpperCase());
}

/** Textile lines eligible for production suggestions. */
const TEXTILE_LINES = new Set(["LT", "CS"]);

/**
 * Determines if a VendorSampleRef is eligible to feed production suggestions.
 *
 * Eligible if ALL of:
 *   - requiresProductionSuggestion === true
 *   - line is LT or CS (textile only — imports use RECOMPRA, never production)
 *   - grupoSag exists and is not a sentinel/fallback value
 *   - subgrupoSag exists and is not a sentinel/fallback value
 *   - state !== "sin_datos" (inventory data must be certified)
 *
 * Does NOT require centralAvailable > 0.
 * A classified ref with certified stock === 0 IS a valid production suggestion.
 */
export function isEligibleForProductionSuggestion(ref: {
  requiresProductionSuggestion: boolean;
  line: string;
  grupoSag: string | null;
  subgrupoSag: string;
  state: SampleState;
}): boolean {
  if (!ref.requiresProductionSuggestion) return false;
  if (!TEXTILE_LINES.has(ref.line.trim().toUpperCase())) return false;
  if (isSentinel(ref.grupoSag)) return false;
  if (isSentinel(ref.subgrupoSag)) return false;
  if (ref.state === "sin_datos") return false;
  return true;
}

export interface ProductionSuggestion {
  /** Subgroup key: line + subgrupoSag */
  subgrupoSag: string;
  line: string;
  /** Total central inventory available for the entire subgroup */
  centralAvailable: number;
  /** Total required across all affected maletas */
  minimumRequired: number;
  shortfall: number;
  suggestedQty: number;
  urgency: "alta" | "media" | "baja";
  /** Maleta vendor IDs affected */
  affectedVendors: string[];
  vendorsWithPresence: number;
  /** References used as evidence of the deficit (not necessarily what to produce) */
  evidenceRefs: Array<{ reference: string; description: string; available: number }>;
  reasonType: ProductionReasonType;
  // ── Backward compat (set to first evidence ref for display) ──
  reference: string;
  description: string;
}
