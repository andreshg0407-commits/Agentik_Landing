/**
 * lib/comercial/tiendas/store-replenishment-types.ts
 *
 * Domain type system for the Tiendas (Store Replenishment) module.
 * Pure types — no runtime logic, no Prisma, no imports.
 *
 * Sprint: COMERCIAL-TIENDAS-SURTIDO-01
 * Sprint: COMERCIAL-TIENDAS-DATA-CONTRACT-03
 */

// ── Store location ───────────────────────────────────────────────────────────

export type StoreStatus = "activa" | "pausada" | "cerrada";
export type StoreType   = "tienda" | "outlet" | "punto_venta";

export interface StoreLocation {
  id:               string;
  name:             string;
  sagWarehouseCode: string;
  responsibleName:  string;
  status:           StoreStatus;
  storeType:        StoreType;
  city:             string;
  lastSyncAt:       string | null;
}

// ── Inventory at variant level ───────────────────────────────────────────────

export interface StoreInventoryVariant {
  storeId:        string;
  warehouseCode:  string;
  referenceCode:  string;
  productName:    string;
  category:       string;
  line:           string;
  size:           string;
  color:          string;
  currentUnits:   number;
  minUnits:       number;
  idealUnits:     number;
  maxUnits?:      number;
  updatedAt:      string;
}

// ── Main warehouse availability ──────────────────────────────────────────────

export interface MainWarehouseAvailability {
  warehouseCode:  string;
  referenceCode:  string;
  size:           string;
  color:          string;
  availableUnits: number;
  reservedUnits:  number;
  updatedAt:      string;
}

// ── Replenishment rules ──────────────────────────────────────────────────────

export type ReplenishmentRuleType =
  | "category"
  | "line"
  | "reference"
  | "size_group"
  | "import_size";

export interface StoreReplenishmentRule {
  id:         string;
  storeId:    string;
  ruleType:   ReplenishmentRuleType;
  appliesTo:  string;
  minUnits:   number;
  idealUnits: number;
  priority:   number;
  active:     boolean;
}

// ── Shortages ────────────────────────────────────────────────────────────────

export type ShortageSeverity = "critical" | "warning" | "normal";

export interface StoreShortage {
  storeId:        string;
  referenceCode:  string;
  productName:    string;
  category:       string;
  line:           string;
  size:           string;
  color:          string;
  currentUnits:   number;
  minUnits:       number;
  idealUnits:     number;
  missingUnits:   number;
  severity:       ShortageSeverity;
}

// ── Replenishment suggestions ────────────────────────────────────────────────

export type SuggestionType =
  | "exact_transfer"
  | "partial_transfer"
  | "production_needed"
  | "substitute_available";

export interface SubstituteOption {
  referenceCode: string;
  productName:   string;
  size:          string;
  color:         string;
  availableUnits: number;
  reason:        string;
}

export interface ReplenishmentSuggestion {
  storeId:                string;
  referenceCode:          string;
  productName:            string;
  size:                   string;
  color:                  string;
  missingUnits:           number;
  exactAvailableUnits:    number;
  suggestedTransferUnits: number;
  productionSuggestedUnits: number;
  suggestionType:         SuggestionType;
  substituteOptions?:     SubstituteOption[];
  message:                string;
}

// ── Store health summary ─────────────────────────────────────────────────────

export interface StoreHealthSummary {
  storeId:                   string;
  /** Coverage %. -1 = no rules configured (show "Sin reglas" instead of %) */
  coveragePercent:           number;
  criticalShortages:         number;
  warningShortages:          number;
  exactTransferSuggestions:  number;
  lastSyncAt:                string | null;
  /** Whether any policy rules are configured for this store */
  hasRules:                  boolean;
  /** Items with currentUnits > 0 */
  activeItemCount:           number;
  /** Subgroup coverage: % of subgroups with at least one active item */
  subgroupCoveragePercent:   number;
  /** Subgroups with at least one active item */
  subgroupsCovered:          number;
  /** Total subgroups observed in inventory */
  subgroupsExpected:         number;
  /** Actionable replenishment opportunities (critica + alta + media) */
  replenishmentOpportunities: number;
}

// ── Composite workspace data ─────────────────────────────────────────────────

export type StoreHealthStatus = "ok" | "requiere_surtido" | "critica" | "sin_reglas";

export interface StoreCard {
  store:   StoreLocation;
  health:  StoreHealthSummary;
  status:  StoreHealthStatus;
}

export interface StoreDetailData {
  store:            StoreLocation;
  health:           StoreHealthSummary;
  shortages:        StoreShortage[];
  suggestions:      ReplenishmentSuggestion[];
  rules:            StoreReplenishmentRule[];
  mainWarehouse:    MainWarehouseAvailability[];
  assortmentNeeds?: import("./assortment-types").StoreAssortmentNeed[];
  textileCoverage?: import("./assortment-types").TextileCoverageAnalysis[];
}

export interface TiendasWorkspaceData {
  stores:              StoreCard[];
  mainWarehouseCode:   string;
  mainWarehouseName:   string;
  lastSyncAt:          string | null;
}

// ── Copilot signals ──────────────────────────────────────────────────────────

export interface StoreCopilotSignal {
  storeId:  string;
  type:     "critical_shortage" | "transfer_ready" | "opportunity_available" | "healthy";
  message:  string;
  priority: number;
}

// ── Data provider contract (COMERCIAL-TIENDAS-DATA-CONTRACT-03) ──────────────
//
// Canonical interface that any inventory data source must implement.
// When SAG delivers the data warehouse, create SagDataWarehouseProvider
// implementing this interface and swap it in store-replenishment-service.ts.
// Engine + UI remain untouched.

/**
 * Canonical store inventory record — the contract between
 * any data source and the replenishment engine.
 *
 * Matches StoreInventoryVariant exactly; defined here as the
 * provider-facing name so the contract is explicit.
 */
export type CanonicalStoreInventoryRecord = StoreInventoryVariant;

/**
 * Canonical main warehouse availability record — the contract
 * between any data source and the replenishment engine.
 *
 * Fields:
 *   referenceCode  — SAG reference code
 *   size           — exact size (talla)
 *   color          — exact color
 *   availableUnits — net available (disponible)
 *   reservedUnits  — reserved for pending orders
 *   committedUnits — committed to production/transfer (optional)
 *   updatedAt      — ISO timestamp of the source reading
 */
export interface CanonicalMainWarehouseRecord {
  warehouseCode:   string;
  referenceCode:   string;
  size:            string;
  color:           string;
  availableUnits:  number;
  reservedUnits:   number;
  committedUnits:  number;
  updatedAt:       string;
}

/**
 * Provider identity — which data source is active.
 *
 *   sag_current         — SAG current (SaleRecord, CRMQuoteLine, ProductInventoryLevel)
 *   sag_data_warehouse  — SAG data warehouse (future — full variant-level inventory)
 *   demo                — development-only demo data
 */
export type InventoryProviderKind = "sag_current" | "sag_data_warehouse" | "demo";

/**
 * Metadata about the active provider — passed to UI for display.
 */
export interface ProviderMetadata {
  kind:           InventoryProviderKind;
  label:          string;
  connected:      boolean;
  lastReadAt:     string | null;
  variantSupport: boolean;
}

/**
 * Result shape returned by every StoreInventoryProvider.
 */
export interface ProviderResult {
  stores:         StoreLocation[];
  inventory:      CanonicalStoreInventoryRecord[];
  mainStock:      CanonicalMainWarehouseRecord[];
  rules:          StoreReplenishmentRule[];
  mainWarehouse:  { code: string; name: string };
  metadata:       ProviderMetadata;
}

/**
 * StoreInventoryProvider — the single interface that decouples
 * the replenishment engine from the data source.
 *
 * Implementations:
 *   SagCurrentProvider          — queries current SAG Prisma models
 *   SagDataWarehouseProvider    — future: queries SAG data warehouse
 *   DemoProvider                — development-only demo data
 *
 * Contract rules:
 *   1. Never fake data — return empty arrays when data is unavailable.
 *   2. Variant key = referenceCode + size + color. Never collapse variants.
 *   3. committedUnits defaults to 0 if the source doesn't track commitments.
 *   4. metadata.connected = false if the source is unreachable.
 *   5. metadata.variantSupport = true only if size+color are populated.
 */
export interface StoreInventoryProvider {
  readonly kind: InventoryProviderKind;
  load(orgId: string): Promise<ProviderResult>;
}
