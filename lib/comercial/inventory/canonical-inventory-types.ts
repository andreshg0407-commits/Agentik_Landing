/**
 * lib/comercial/inventory/canonical-inventory-types.ts
 *
 * INVENTORY-CANONICAL-TRUTH-04A — Canonical Inventory Contract
 *
 * Single source of truth for inventory classification across all surfaces:
 * control dashboard, tiendas, maletas, pedidos, produccion, recommendations.
 *
 * Key distinctions:
 *   - Physical stock vs available vs reserved vs shortage
 *   - Finished goods vs raw materials vs WIP
 *   - Commercial bodegas vs production vs vendor suitcases vs stores
 *   - Certified data (from SAG snapshot) vs derived (computed by Agentik)
 *
 * RULE: No Prisma, no React, no server-only. Pure domain types.
 */

// ── Warehouse Classification ────────────────────────────────────────────────

/**
 * Semantic warehouse role — determined by business function, not SAG clase.
 *
 * SAG sc_clase (P=Permanente, T=Transito) does NOT map 1:1 to business role.
 * Example: "IMPORTACION" is clase=T but functions as a staging warehouse.
 */
export type WarehouseRole =
  | "PRINCIPAL"          // Main finished goods warehouse (B01)
  | "STORE"             // Retail store inventory (San Diego, Centro, Gran Plaza, Caldas)
  | "FRANCHISE"         // Franchise store (F1, F3, F6, F7, F9, F10, F16, F17)
  | "VENDOR_SUITCASE"   // Traveling salesperson inventory
  | "RAW_MATERIAL"      // Materia prima, telas, retazos
  | "WIP"               // Producto en proceso
  | "IMPORT_STAGING"    // Importacion containers (active and closed)
  | "SPECIAL"           // Muestras, arreglos, segundas, plan separe, web, flamingo, descuento
  | "INACTIVE";         // Closed, archived, or inactive bodegas

/**
 * Whether a warehouse's inventory should be included in commercial KPIs.
 *
 * - COMMERCIAL: finished goods available for sale (stores, principal, suitcases)
 * - SUPPLY_CHAIN: raw materials, WIP, imports — affects production planning but not commercial availability
 * - EXCLUDED: inactive, closed, special-purpose — not counted anywhere
 */
export type WarehouseCommercialScope =
  | "COMMERCIAL"
  | "SUPPLY_CHAIN"
  | "EXCLUDED";

export interface WarehouseProfile {
  /** SAG ka_nl_bodega */
  bodegaId: number;
  /** SAG ss_codigo */
  code: string;
  /** SAG ss_nombre */
  name: string;
  /** SAG sc_clase: P=Permanente, T=Transito */
  sagClase: string;
  /** Semantic role */
  role: WarehouseRole;
  /** Whether to include in commercial KPIs */
  commercialScope: WarehouseCommercialScope;
  /** Whether the bodega is active (sc_activo='S') */
  active: boolean;
}

// ── Canonical Inventory Levels ──────────────────────────────────────────────

/**
 * Inventory truth state for a single product+bodega.
 *
 * - CERTIFIED: from SAG saldos_articulos in current period, confirmed by sync
 * - STALE: from an older SAG period (bodega didn't post in current period)
 * - DERIVED: computed by Agentik (e.g., reserved qty from CRM orders)
 * - UNVERIFIED: data exists but hasn't been cross-checked with SAG
 */
export type InventoryTruthState =
  | "CERTIFIED"
  | "STALE"
  | "DERIVED"
  | "UNVERIFIED";

export interface CanonicalInventoryLevel {
  /** Product reference code (e.g., "CD-4243339") */
  productCode: string;
  /** Product description */
  productName: string;
  /** Warehouse profile */
  warehouse: WarehouseProfile;

  /** Physical stock from SAG saldos_articulos.n_saldo_actual */
  physicalStock: number;
  /** Reserved by pending orders (SAG saldos_pedidos or Agentik CRM reservations) */
  reserved: number;
  /** Available = physicalStock - reserved */
  available: number;

  /** Truth state of this inventory level */
  truthState: InventoryTruthState;
  /** SAG period this data is from (e.g., "202608") */
  sagPeriod: string;
  /** Last movement date for this product (per-article, NOT per-article+bodega) */
  lastMovementDate: string | null;
  /** Average cost from SAG */
  costPromedio: number;
}

// ── Canonical Product Inventory ─────────────────────────────────────────────

/**
 * Aggregated inventory for a single product across all relevant bodegas.
 */
export interface CanonicalProductInventory {
  productCode: string;
  productName: string;
  line: string;
  category: string;

  /** Total physical stock across all commercial bodegas */
  commercialPhysical: number;
  /** Total reserved across all commercial bodegas */
  commercialReserved: number;
  /** Total available across all commercial bodegas */
  commercialAvailable: number;

  /** Total physical stock across supply chain bodegas (raw materials, WIP, imports) */
  supplyChainPhysical: number;

  /** Per-warehouse breakdown */
  levels: CanonicalInventoryLevel[];

  /** Whether this product has active production orders */
  hasActiveProduction: boolean;
  /** Pending production quantity (open OPs) */
  pendingProductionQty: number;
}

// ── Canonical Inventory Snapshot ─────────────────────────────────────────────

/**
 * Complete inventory snapshot with commercial vs supply chain separation.
 * This is what consumers (control dashboard, manager, tiendas) should use.
 */
export interface CanonicalInventorySnapshot {
  /** SAG period this snapshot is from */
  sagPeriod: string;
  /** When this snapshot was computed */
  computedAt: string;

  // ── Commercial KPIs (finished goods only) ──
  /** Total distinct product references in commercial bodegas */
  commercialRefCount: number;
  /** Total available units across all commercial bodegas */
  commercialAvailableUnits: number;
  /** Total reserved units across all commercial bodegas */
  commercialReservedUnits: number;
  /** References with zero availability */
  commercialOutOfStockRefs: number;
  /** References with availability < 20 */
  commercialCriticalRefs: number;
  /** Total commercial inventory value */
  commercialInventoryValue: number;

  // ── Supply chain KPIs ──
  /** Raw material units (materia prima + telas) */
  rawMaterialUnits: number;
  /** WIP units (producto en proceso) */
  wipUnits: number;
  /** Import staging units */
  importStagingUnits: number;
  /** Active production orders pending */
  activeProductionOrders: number;
  /** Pending production units */
  pendingProductionUnits: number;

  // ── Warehouse breakdown ──
  warehouseProfiles: WarehouseProfile[];

  // ── Per-product detail (optional, only when requested) ──
  products?: CanonicalProductInventory[];
}

// ── Transfer tracking ───────────────────────────────────────────────────────

export interface CanonicalTransferSummary {
  /** Total transfer documents in period */
  totalTransfers: number;
  /** Transfers by fuente code */
  byFuente: Array<{
    fuenteId: number;
    fuenteCode: string;
    fuenteName: string;
    documentCount: number;
  }>;
}
