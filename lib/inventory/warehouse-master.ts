/**
 * lib/inventory/warehouse-master.ts
 *
 * COMMERCIAL-INVENTORY-WAREHOUSE-AND-REFERENCE-LIFECYCLE-01 — Part A
 *
 * Single source of truth for warehouse identity resolution.
 *
 * Identity layers (never mix):
 *   ka_nl_bodega  → ProductInventoryLevel.warehouseId (SAG internal PK)
 *   ss_codigo     → ProductInventoryLevel.externalRef  (SAG business code, zero-padded)
 *   ss_nombre     → Human-readable name from SAG BODEGAS
 *
 * Certified from official Castillitos CSV (Jul 2026).
 *
 * No Prisma. No React. No server-only. Pure config + helpers.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type WarehouseBusinessType =
  | "COMMERCIAL_TEXTILE"
  | "COMMERCIAL_AVAILABLE_IMPORT"
  | "IMPORT_STAGING"
  | "IMPORT_CONTAINER"
  | "PRODUCTION_ONLY"
  | "VENDOR"
  | "STORE"
  | "EXCLUDED"
  | "UNKNOWN";

export interface WarehouseEntry {
  /** SAG internal PK — stored in ProductInventoryLevel.warehouseId */
  kaNlBodega: string;
  /** SAG business code — stored in ProductInventoryLevel.externalRef (zero-padded) */
  ssCodigo: string;
  /** Human name from SAG BODEGAS */
  ssNombre: string;
  /** Functional classification */
  businessType: WarehouseBusinessType;
  /** Business domain this warehouse serves */
  domain: "textile" | "import" | "production" | "vendor" | "store" | "web" | "none";
  /** Include when computing commercial textile availability */
  includeInCommercialInventory: boolean;
  /** Include when computing import availability */
  includeInImportInventory: boolean;
  /** Include in production calculations */
  includeInProduction: boolean;
  /** Include in vendor sample calculations */
  includeInVendorSamples: boolean;
  /** Include in store distribution counts */
  includeInStores: boolean;
  /** Why this warehouse is excluded from commercial inventory, if applicable */
  exclusionReason: string | null;
}

// ── Castillitos Warehouse Master ────────────────────────────────────────────
// Certified from official BODEGAS.csv + database audit (Jul 2026).
// 40 entries confirmed with PIL data; 10 entries from CSV with no PIL data.

const CASTILLITOS_WAREHOUSES: WarehouseEntry[] = [
  // ── STORES ──
  { kaNlBodega: "31", ssCodigo: "00", ssNombre: "BODEGA CENTRO", businessType: "STORE", domain: "store", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: true, exclusionReason: null },
  { kaNlBodega: "11", ssCodigo: "02", ssNombre: "BODEGA SANDIEGO", businessType: "STORE", domain: "store", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: true, exclusionReason: null },
  { kaNlBodega: "32", ssCodigo: "23", ssNombre: "GRAN PLAZA", businessType: "STORE", domain: "store", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: true, exclusionReason: null },
  { kaNlBodega: "39", ssCodigo: "29", ssNombre: "BODEGA CALDAS", businessType: "STORE", domain: "store", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: true, exclusionReason: null },

  // ── COMMERCIAL TEXTILE ──
  { kaNlBodega: "10", ssCodigo: "01", ssNombre: "BODEGA PRINCIPAL", businessType: "COMMERCIAL_TEXTILE", domain: "textile", includeInCommercialInventory: true, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: false, exclusionReason: null },

  // ── COMMERCIAL IMPORT ──
  { kaNlBodega: "33", ssCodigo: "24", ssNombre: "IMPORTACIÓN", businessType: "COMMERCIAL_AVAILABLE_IMPORT", domain: "import", includeInCommercialInventory: false, includeInImportInventory: true, includeInProduction: false, includeInVendorSamples: false, includeInStores: false, exclusionReason: null },

  // ── IMPORT STAGING — "NO TENER EN CUENTA" per admin CSV ──
  // Not commercial inventory. Future: may be promoted to commercial with explicit approval.
  { kaNlBodega: "36", ssCodigo: "26", ssNombre: "IMPORTACIÓN PARTE 2", businessType: "IMPORT_STAGING", domain: "import", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: false, exclusionReason: "Staging — no tener en cuenta per admin" },
  { kaNlBodega: "37", ssCodigo: "27", ssNombre: "IMPORTACIÓN PARTE 1", businessType: "IMPORT_STAGING", domain: "import", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: false, exclusionReason: "Staging — no tener en cuenta per admin" },

  // ── IMPORT CONTAINERS — "NO TENER EN CUENTA" per admin CSV ──
  // Never participate in commercial inventory.
  { kaNlBodega: "41", ssCodigo: "30", ssNombre: "IMPO CONTENEDOR 2", businessType: "IMPORT_CONTAINER", domain: "import", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: false, exclusionReason: "Contenedor temporal" },
  { kaNlBodega: "42", ssCodigo: "31", ssNombre: "IMPO CONTENEDOR 2-1", businessType: "IMPORT_CONTAINER", domain: "import", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: false, exclusionReason: "Contenedor temporal" },
  { kaNlBodega: "43", ssCodigo: "32", ssNombre: "IMPO CONTENEDOR 3", businessType: "IMPORT_CONTAINER", domain: "import", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: false, exclusionReason: "Contenedor temporal" },
  { kaNlBodega: "44", ssCodigo: "33", ssNombre: "IMPO CONTENEDOR 4", businessType: "IMPORT_CONTAINER", domain: "import", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: false, exclusionReason: "Contenedor temporal" },
  { kaNlBodega: "51", ssCodigo: "34", ssNombre: "IMPO CONTENEDOR 5", businessType: "IMPORT_CONTAINER", domain: "import", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: false, exclusionReason: "Contenedor temporal" },
  { kaNlBodega: "53", ssCodigo: "42", ssNombre: "IMPO CONTENEDOR 6", businessType: "IMPORT_CONTAINER", domain: "import", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: false, exclusionReason: "Contenedor temporal" },
  { kaNlBodega: "54", ssCodigo: "43", ssNombre: "IMPO CONTENEDOR 7", businessType: "IMPORT_CONTAINER", domain: "import", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: false, exclusionReason: "Contenedor temporal" },
  { kaNlBodega: "55", ssCodigo: "44", ssNombre: "IMPO CONTENEDOR 7-1", businessType: "IMPORT_CONTAINER", domain: "import", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: false, exclusionReason: "Contenedor temporal" },
  { kaNlBodega: "56", ssCodigo: "45", ssNombre: "IMPO CONTENEDOR 7-2", businessType: "IMPORT_CONTAINER", domain: "import", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: false, exclusionReason: "Contenedor temporal" },
  { kaNlBodega: "57", ssCodigo: "46", ssNombre: "IMPO CONTENEDOR 7-3", businessType: "IMPORT_CONTAINER", domain: "import", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: false, exclusionReason: "Contenedor temporal" },
  { kaNlBodega: "59", ssCodigo: "48", ssNombre: "IMPO CONTENEDOR 9-1", businessType: "IMPORT_CONTAINER", domain: "import", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: false, exclusionReason: "Contenedor temporal" },
  { kaNlBodega: "60", ssCodigo: "49", ssNombre: "IMPO CONTENEDOR 10-1", businessType: "IMPORT_CONTAINER", domain: "import", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: false, exclusionReason: "Contenedor temporal" },

  // ── PRODUCTION ──
  { kaNlBodega: "13", ssCodigo: "04", ssNombre: "PRODUCTO EN PROCESO", businessType: "PRODUCTION_ONLY", domain: "production", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: true, includeInVendorSamples: false, includeInStores: false, exclusionReason: null },
  { kaNlBodega: "25", ssCodigo: "16", ssNombre: "MUESTRAS", businessType: "PRODUCTION_ONLY", domain: "production", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: true, includeInVendorSamples: false, includeInStores: false, exclusionReason: "Muestras — se maneja aparte" },
  { kaNlBodega: "26", ssCodigo: "18", ssNombre: "ARREGLOS", businessType: "PRODUCTION_ONLY", domain: "production", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: true, includeInVendorSamples: false, includeInStores: false, exclusionReason: "Arreglos — se maneja aparte" },
  { kaNlBodega: "27", ssCodigo: "19", ssNombre: "SEGUNDAS Y SALDOS", businessType: "PRODUCTION_ONLY", domain: "production", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: true, includeInVendorSamples: false, includeInStores: false, exclusionReason: "Segundas y saldos — se maneja aparte" },
  // No PIL data for these, but confirmed from CSV:
  // kaNlBodega UNKNOWN for ss_codigo 05 (MATERIA PRIMA), 06 (TELAS), 07 (RETAZOS)

  // ── VENDORS ──
  { kaNlBodega: "45", ssCodigo: "35", ssNombre: "VEND ORLANDO", businessType: "VENDOR", domain: "vendor", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: true, includeInStores: false, exclusionReason: null },
  // kaNlBodega "46" for CARLOS LEON — no PIL data, but confirmed ka_nl_bodega from vendor-sample-service
  { kaNlBodega: "46", ssCodigo: "36", ssNombre: "VEND CARLOS LEON", businessType: "VENDOR", domain: "vendor", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: true, includeInStores: false, exclusionReason: null },
  { kaNlBodega: "47", ssCodigo: "37", ssNombre: "VEND LUIS", businessType: "VENDOR", domain: "vendor", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: true, includeInStores: false, exclusionReason: null },
  { kaNlBodega: "48", ssCodigo: "38", ssNombre: "VEND NESTOR", businessType: "VENDOR", domain: "vendor", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: true, includeInStores: false, exclusionReason: null },
  { kaNlBodega: "49", ssCodigo: "39", ssNombre: "VEND CARLOS VILLA", businessType: "VENDOR", domain: "vendor", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: true, includeInStores: false, exclusionReason: null },
  { kaNlBodega: "50", ssCodigo: "40", ssNombre: "VEND FREDY", businessType: "VENDOR", domain: "vendor", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: true, includeInStores: false, exclusionReason: null },

  // ── EXCLUDED ──
  { kaNlBodega: "12", ssCodigo: "03", ssNombre: "BODEGA MAYORCA", businessType: "EXCLUDED", domain: "none", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: false, exclusionReason: "No tener en cuenta" },
  { kaNlBodega: "17", ssCodigo: "08", ssNombre: "F1 - PAQUE BERRIO", businessType: "EXCLUDED", domain: "none", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: false, exclusionReason: "Franquicia cerrada" },
  { kaNlBodega: "19", ssCodigo: "09", ssNombre: "F3 - BOLIVAR", businessType: "EXCLUDED", domain: "none", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: false, exclusionReason: "Franquicia cerrada" },
  { kaNlBodega: "18", ssCodigo: "10", ssNombre: "F6 - BELLO", businessType: "EXCLUDED", domain: "none", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: false, exclusionReason: "Franquicia cerrada" },
  { kaNlBodega: "20", ssCodigo: "11", ssNombre: "F7 - ARMENIA", businessType: "EXCLUDED", domain: "none", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: false, exclusionReason: "Franquicia cerrada" },
  { kaNlBodega: "21", ssCodigo: "12", ssNombre: "F9 - PEREIRA", businessType: "EXCLUDED", domain: "none", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: false, exclusionReason: "Franquicia cerrada" },
  { kaNlBodega: "22", ssCodigo: "13", ssNombre: "F16 - CENT MAY BOGOT", businessType: "EXCLUDED", domain: "none", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: false, exclusionReason: "Franquicia cerrada" },
  { kaNlBodega: "23", ssCodigo: "14", ssNombre: "F17 - MAYORCA", businessType: "EXCLUDED", domain: "none", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: false, exclusionReason: "Franquicia cerrada" },
  { kaNlBodega: "24", ssCodigo: "15", ssNombre: "F10 - IBAGUE", businessType: "EXCLUDED", domain: "none", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: false, exclusionReason: "Franquicia cerrada" },
  { kaNlBodega: "28", ssCodigo: "20", ssNombre: "TEMPORAL FLAMINGO", businessType: "EXCLUDED", domain: "none", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: false, exclusionReason: "No tener en cuenta" },
  { kaNlBodega: "30", ssCodigo: "22", ssNombre: "PAGINA WEB", businessType: "EXCLUDED", domain: "web", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: false, exclusionReason: "Canal web — no inventario comercial directo" },
  { kaNlBodega: "38", ssCodigo: "28", ssNombre: "PLAN SEPARE", businessType: "EXCLUDED", domain: "none", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: false, exclusionReason: "No tener en cuenta" },
  { kaNlBodega: "52", ssCodigo: "41", ssNombre: "DEXCATO MC", businessType: "EXCLUDED", domain: "none", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: false, exclusionReason: "No tener en cuenta" },
  { kaNlBodega: "50_dup", ssCodigo: "47", ssNombre: "MARCA SAMUEL", businessType: "EXCLUDED", domain: "none", includeInCommercialInventory: false, includeInImportInventory: false, includeInProduction: false, includeInVendorSamples: false, includeInStores: false, exclusionReason: "No tener en cuenta — no PIL data" },
];

// ── Lookup indexes (built once) ─────────────────────────────────────────────

const BY_PK = new Map<string, WarehouseEntry>();
const BY_CODE = new Map<string, WarehouseEntry>();

for (const wh of CASTILLITOS_WAREHOUSES) {
  BY_PK.set(wh.kaNlBodega, wh);
  BY_CODE.set(wh.ssCodigo, wh);
}

// ── Pre-computed sets for fast membership checks ────────────────────────────

/** ka_nl_bodega — COMMERCIAL_AVAILABLE_IMPORT only (ss_codigo 24 = IMPORTACIÓN) */
const COMMERCIAL_AVAILABLE_IMPORT_PKS = new Set(
  CASTILLITOS_WAREHOUSES
    .filter(w => w.businessType === "COMMERCIAL_AVAILABLE_IMPORT")
    .map(w => w.kaNlBodega),
);

/** ka_nl_bodega — IMPORT_STAGING only (ss_codigo 26, 27 — "no tener en cuenta" per admin) */
const IMPORT_STAGING_PKS = new Set(
  CASTILLITOS_WAREHOUSES
    .filter(w => w.businessType === "IMPORT_STAGING")
    .map(w => w.kaNlBodega),
);

/** ka_nl_bodega — IMPORT_CONTAINER only (contenedores temporales) */
const IMPORT_CONTAINER_PKS = new Set(
  CASTILLITOS_WAREHOUSES
    .filter(w => w.businessType === "IMPORT_CONTAINER")
    .map(w => w.kaNlBodega),
);

/** ka_nl_bodega — all import-domain warehouses (COMMERCIAL_AVAILABLE_IMPORT + STAGING + CONTAINER) */
const ALL_IMPORT_DOMAIN_PKS = new Set(
  CASTILLITOS_WAREHOUSES
    .filter(w => w.domain === "import")
    .map(w => w.kaNlBodega),
);

/** ka_nl_bodega — warehouses that participate in commercial import inventory */
const IMPORT_INVENTORY_PKS = new Set(
  CASTILLITOS_WAREHOUSES
    .filter(w => w.includeInImportInventory)
    .map(w => w.kaNlBodega),
);

/** ka_nl_bodega values for production warehouses */
const PRODUCTION_ONLY_PKS = new Set(
  CASTILLITOS_WAREHOUSES
    .filter(w => w.includeInProduction)
    .map(w => w.kaNlBodega),
);

/** ka_nl_bodega values for store warehouses */
const STORE_WAREHOUSE_PKS = new Set(
  CASTILLITOS_WAREHOUSES
    .filter(w => w.includeInStores)
    .map(w => w.kaNlBodega),
);

/** ka_nl_bodega values for vendor warehouses */
const VENDOR_WAREHOUSE_PKS = new Set(
  CASTILLITOS_WAREHOUSES
    .filter(w => w.includeInVendorSamples)
    .map(w => w.kaNlBodega),
);

/** ka_nl_bodega values for commercial textile warehouses */
const COMMERCIAL_TEXTILE_PKS = new Set(
  CASTILLITOS_WAREHOUSES
    .filter(w => w.includeInCommercialInventory)
    .map(w => w.kaNlBodega),
);

// ── Resolution helpers ──────────────────────────────────────────────────────

/** Resolve warehouse by ka_nl_bodega (ProductInventoryLevel.warehouseId) */
export function resolveWarehouseByPk(kaNlBodega: string): WarehouseEntry | undefined {
  return BY_PK.get(kaNlBodega);
}

/** Resolve warehouse by ss_codigo (ProductInventoryLevel.externalRef) */
export function resolveWarehouseByBusinessCode(ssCodigo: string): WarehouseEntry | undefined {
  return BY_CODE.get(ssCodigo);
}

// ── Classification predicates (use ka_nl_bodega / warehouseId) ──────────────

export function isCommercialTextileWarehouse(kaNlBodega: string): boolean {
  return COMMERCIAL_TEXTILE_PKS.has(kaNlBodega);
}

export function isCommercialAvailableImportWarehouse(kaNlBodega: string): boolean {
  const wh = BY_PK.get(kaNlBodega);
  return wh?.businessType === "COMMERCIAL_AVAILABLE_IMPORT";
}

export function isImportStagingWarehouse(kaNlBodega: string): boolean {
  const wh = BY_PK.get(kaNlBodega);
  return wh?.businessType === "IMPORT_STAGING";
}

export function isImportContainerWarehouse(kaNlBodega: string): boolean {
  const wh = BY_PK.get(kaNlBodega);
  return wh?.businessType === "IMPORT_CONTAINER";
}

/** Any import-domain warehouse (COMMERCIAL_AVAILABLE_IMPORT + STAGING + CONTAINER) */
export function isAnyImportWarehouse(kaNlBodega: string): boolean {
  return ALL_IMPORT_DOMAIN_PKS.has(kaNlBodega);
}

export function isProductionOnlyWarehouse(kaNlBodega: string): boolean {
  return PRODUCTION_ONLY_PKS.has(kaNlBodega);
}

export function isVendorWarehouse(kaNlBodega: string): boolean {
  return VENDOR_WAREHOUSE_PKS.has(kaNlBodega);
}

export function isStoreWarehouse(kaNlBodega: string): boolean {
  return STORE_WAREHOUSE_PKS.has(kaNlBodega);
}

export function isExcludedWarehouse(kaNlBodega: string): boolean {
  const wh = BY_PK.get(kaNlBodega);
  return wh?.businessType === "EXCLUDED";
}

// ── Bulk accessors ──────────────────────────────────────────────────────────

/** ka_nl_bodega — COMMERCIAL_AVAILABLE_IMPORT only (vendible) */
export function getCommercialAvailableImportPks(): ReadonlySet<string> {
  return COMMERCIAL_AVAILABLE_IMPORT_PKS;
}

/** ka_nl_bodega — IMPORT_STAGING only (no tener en cuenta) */
export function getImportStagingWarehousePks(): ReadonlySet<string> {
  return IMPORT_STAGING_PKS;
}

/** ka_nl_bodega — IMPORT_CONTAINER only (contenedores temporales) */
export function getImportContainerWarehousePks(): ReadonlySet<string> {
  return IMPORT_CONTAINER_PKS;
}

/** ka_nl_bodega — all import domain (COMMERCIAL_IMPORT + STAGING + CONTAINER) */
export function getAllImportDomainPks(): ReadonlySet<string> {
  return ALL_IMPORT_DOMAIN_PKS;
}

/** ka_nl_bodega — warehouses with includeInImportInventory: true */
export function getImportInventoryPks(): ReadonlySet<string> {
  return IMPORT_INVENTORY_PKS;
}

/** All ka_nl_bodega values for production-only warehouses */
export function getProductionOnlyPks(): ReadonlySet<string> {
  return PRODUCTION_ONLY_PKS;
}

/** All ka_nl_bodega values for store warehouses */
export function getStoreWarehousePks(): ReadonlySet<string> {
  return STORE_WAREHOUSE_PKS;
}

/** All ka_nl_bodega values for vendor warehouses */
export function getVendorWarehousePks(): ReadonlySet<string> {
  return VENDOR_WAREHOUSE_PKS;
}

/** All ka_nl_bodega values for commercial textile warehouses */
export function getCommercialTextilePks(): ReadonlySet<string> {
  return COMMERCIAL_TEXTILE_PKS;
}

/** Full warehouse master for iteration */
export function getAllWarehouses(): readonly WarehouseEntry[] {
  return CASTILLITOS_WAREHOUSES;
}

// ── Commercial Stock Policy ─────────────────────────────────────────────────
// Defines exactly which warehouses contribute to "compatible commercial stock"
// for each business domain. This is the canonical commercial availability policy.

export type CommercialStockPolicyName = "TEXTILE" | "IMPORT";

export interface CommercialStockPolicyConfig {
  policy: CommercialStockPolicyName;
  /** Authorized warehouse entries for this policy */
  authorizedWarehouses: readonly WarehouseEntry[];
  /** ka_nl_bodega set for fast membership check */
  authorizedPks: ReadonlySet<string>;
  /** Human-readable description */
  description: string;
}

/** TEXTILE policy: only warehouses with includeInCommercialInventory=true */
const TEXTILE_POLICY: CommercialStockPolicyConfig = {
  policy: "TEXTILE",
  authorizedWarehouses: CASTILLITOS_WAREHOUSES.filter(w => w.includeInCommercialInventory),
  authorizedPks: COMMERCIAL_TEXTILE_PKS,
  description: "Inventario comercial textil (B01 BODEGA PRINCIPAL, ka_nl=10)",
};

/** IMPORT policy: only warehouses with includeInImportInventory=true */
const IMPORT_POLICY: CommercialStockPolicyConfig = {
  policy: "IMPORT",
  authorizedWarehouses: CASTILLITOS_WAREHOUSES.filter(w => w.includeInImportInventory),
  authorizedPks: IMPORT_INVENTORY_PKS,
  description: "Inventario comercial importacion (B24 IMPORTACIÓN, ka_nl=33)",
};

/**
 * Resolve the commercial stock policy for a business domain.
 * Returns null for domains outside Castillitos commercial scope.
 */
export function getCommercialStockPolicy(
  domain: string,
): CommercialStockPolicyConfig | null {
  switch (domain) {
    case "CASTILLITOS_TEXTILE":
    case "LATIN_KIDS_TEXTILE":
      return TEXTILE_POLICY;
    case "CASTILLITOS_IMPORT":
      return IMPORT_POLICY;
    default:
      return null;
  }
}

/**
 * Check if a CCS record is compatible with a business domain.
 * CCS is built from bodegas 01+04+14+15 (textile pipeline).
 * Only TEXTILE domains are compatible with CCS.
 */
export function isCcsCompatibleWithDomain(domain: string): boolean {
  return domain === "CASTILLITOS_TEXTILE" || domain === "LATIN_KIDS_TEXTILE";
}
