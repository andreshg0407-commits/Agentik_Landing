/**
 * lib/comercial/semantic/imports/import-semantic-mapping.ts
 *
 * Castillitos / SAG semantic mapping for import documents.
 *
 * Based on evidence from SAG-IMPORT-RESEARCH-01 (6,300 rows, 12 references).
 *
 * IMPORTANT: This mapping is specific to tenant "castillitos" with ERP "SAG".
 * Other tenants require their own mapping.
 *
 * Sprint: IMPORT-SEMANTIC-MAPPING-01
 */

import type {
  ImportSemanticTenantConfig,
  DocumentSemanticMapping,
  WarehouseSemanticMapping,
  PriceSemanticMapping,
} from "./import-semantic-config";
import { registerTenantConfig } from "./import-semantic-config";

// ── Document mappings ───────────────────────────────────────────────────────
// Based on SAG-IMPORT-RESEARCH-01 findings:
//   - FI(182): 11,368 units across 3 docs, warehouses 36/37/41
//   - PX(184): 40,104 units across 11 docs, warehouses 36/37/41
//   - FT(189): 3,000 units, 1 doc, warehouse 41
//   - DS(157): 7 rows, negative qty only, warehouse 33
//   - C1(1) and C2(95): zero appearances in import product lifecycle

const documentMappings: DocumentSemanticMapping[] = [
  // ── Import-specific fuentes ────────────────────────────────────────────
  {
    externalId: "182", externalCode: "FI",
    externalName: "FACTURA DE IMPORTACION NACIONAL",
    semanticType: "IMPORT_INVOICE", movementType: "IMPORT",
    confidence: 0.95,
    inventoryEffect: "INCREASE",
    countAsImportReceipt: true, countAsRepurchase: true,
    countInTotalImported: true, affectsCommercialStock: true,
    status: "PROBABLE",
    notes: "Research: 11,368 units in 3 docs. Positive qty into import warehouses (36/37/41). Named 'FACTURA DE IMPORTACION'. High confidence but not CONFIRMED until validated with business.",
    enabled: true,
  },
  {
    externalId: "184", externalCode: "PX",
    externalName: "PROVISION IMPORTACION 2",
    semanticType: "IMPORT_PROVISION", movementType: "PROVISION",
    confidence: 0.85,
    inventoryEffect: "UNKNOWN",
    countAsImportReceipt: false, countAsRepurchase: false,
    countInTotalImported: false, affectsCommercialStock: false,
    status: "PROBABLE",
    notes: "Research: 40,104 units in 11 docs. Appears alongside FI with same dates/warehouses. Provisioning may record cost allocation, not physical receipt. Do NOT count as receipt until confirmed.",
    enabled: true,
  },
  {
    externalId: "189", externalCode: "FT",
    externalName: "FACTURA COMPRA CHINA DIF MER2",
    semanticType: "IMPORT_INVOICE", movementType: "IMPORT",
    confidence: 0.80,
    inventoryEffect: "INCREASE",
    countAsImportReceipt: true, countAsRepurchase: true,
    countInTotalImported: true, affectsCommercialStock: true,
    status: "PROBABLE",
    notes: "Research: 3,000 units, 1 doc, warehouse 41. Named 'FACTURA COMPRA CHINA'. Represents international purchase. May overlap with FI for same goods — needs validation.",
    enabled: true,
  },
  {
    externalId: "157", externalCode: "DS",
    externalName: "DESGLOSE DE MERCANCIA",
    semanticType: "GOODS_BREAKDOWN", movementType: "ADJUSTMENT",
    confidence: 0.80,
    inventoryEffect: "TRANSFORM",
    countAsImportReceipt: false, countAsRepurchase: false,
    countInTotalImported: false, affectsCommercialStock: false,
    status: "PROBABLE",
    notes: "Research: 7 rows, ALL negative qty, warehouse 33. Appears to split/transform units. Not a purchase entry.",
    enabled: true,
  },
  {
    externalId: "201", externalCode: "PI",
    externalName: "PROVISION IMPORTACION",
    semanticType: "IMPORT_PROVISION", movementType: "PROVISION",
    confidence: 0.75,
    inventoryEffect: "UNKNOWN",
    countAsImportReceipt: false, countAsRepurchase: false,
    countInTotalImported: false, affectsCommercialStock: false,
    status: "UNKNOWN",
    notes: "Exists in FUENTES table but did not appear in research sample. Similar name to PX(184).",
    enabled: true,
  },
  {
    externalId: "183", externalCode: "GI",
    externalName: "GASTOS DE IMPORTACION",
    semanticType: "IMPORT_EXPENSE", movementType: "COST_ALLOCATION",
    confidence: 0.75,
    inventoryEffect: "NONE",
    countAsImportReceipt: false, countAsRepurchase: false,
    countInTotalImported: false, affectsCommercialStock: false,
    status: "UNKNOWN",
    notes: "Exists in FUENTES table but did not appear in research sample. Expense allocation, not physical goods.",
    enabled: true,
  },
  {
    externalId: "185", externalCode: "GX",
    externalName: "GASTO IMP 2",
    semanticType: "IMPORT_EXPENSE", movementType: "COST_ALLOCATION",
    confidence: 0.70,
    inventoryEffect: "NONE",
    countAsImportReceipt: false, countAsRepurchase: false,
    countInTotalImported: false, affectsCommercialStock: false,
    status: "UNKNOWN",
    notes: "Exists in FUENTES. Not seen in research sample.",
    enabled: true,
  },
  {
    externalId: "205", externalCode: "LI",
    externalName: "LIQUIDACION IMPORTACION",
    semanticType: "IMPORT_LIQUIDATION", movementType: "COST_ALLOCATION",
    confidence: 0.70,
    inventoryEffect: "NONE",
    countAsImportReceipt: false, countAsRepurchase: false,
    countInTotalImported: false, affectsCommercialStock: false,
    status: "UNKNOWN",
    notes: "Exists in FUENTES. Liquidation = final cost determination. Not physical goods.",
    enabled: true,
  },
  {
    externalId: "186", externalCode: "LX",
    externalName: "LIQUIDACION IMPORTACION 2",
    semanticType: "IMPORT_LIQUIDATION", movementType: "COST_ALLOCATION",
    confidence: 0.70,
    inventoryEffect: "NONE",
    countAsImportReceipt: false, countAsRepurchase: false,
    countInTotalImported: false, affectsCommercialStock: false,
    status: "UNKNOWN",
    notes: "Exists in FUENTES. Not seen in research sample.",
    enabled: true,
  },
  {
    externalId: "187", externalCode: "DI",
    externalName: "DEVOLUCION IMPORTACION",
    semanticType: "IMPORT_RETURN", movementType: "RETURN",
    confidence: 0.75,
    inventoryEffect: "DECREASE",
    countAsImportReceipt: false, countAsRepurchase: false,
    countInTotalImported: false, affectsCommercialStock: true,
    status: "UNKNOWN",
    notes: "Exists in FUENTES. Not seen in research sample. Return reduces inventory.",
    enabled: true,
  },
  {
    externalId: "204", externalCode: "AX",
    externalName: "DEVOLUCION IMPORTACION 2",
    semanticType: "IMPORT_RETURN", movementType: "RETURN",
    confidence: 0.70,
    inventoryEffect: "DECREASE",
    countAsImportReceipt: false, countAsRepurchase: false,
    countInTotalImported: false, affectsCommercialStock: true,
    status: "UNKNOWN",
    notes: "Exists in FUENTES. Not seen in research sample.",
    enabled: true,
  },

  // ── Domestic purchase fuentes ──────────────────────────────────────────
  {
    externalId: "1", externalCode: "C1",
    externalName: "FACTURA DE COMPRA",
    semanticType: "DOMESTIC_PURCHASE_INVOICE", movementType: "PURCHASE",
    confidence: 0.90,
    inventoryEffect: "INCREASE",
    countAsImportReceipt: false, countAsRepurchase: false,
    countInTotalImported: false, affectsCommercialStock: true,
    status: "PROBABLE",
    notes: "Research: zero appearances in import product lifecycle. Used for domestic purchases only. Previously assumed to be import receipt (incorrect).",
    enabled: true,
  },
  {
    externalId: "95", externalCode: "C2",
    externalName: "FACTURA DE COMPRAS 2",
    semanticType: "DOMESTIC_PURCHASE_INVOICE", movementType: "PURCHASE",
    confidence: 0.85,
    inventoryEffect: "INCREASE",
    countAsImportReceipt: false, countAsRepurchase: false,
    countInTotalImported: false, affectsCommercialStock: true,
    status: "PROBABLE",
    notes: "Research: zero appearances in import product lifecycle. NO_OFICIAL variant of C1.",
    enabled: true,
  },
  {
    externalId: "163", externalCode: "T3",
    externalName: "DOC SOPORTE ELECTRONICO",
    semanticType: "PURCHASE_SUPPORT_DOCUMENT", movementType: "PURCHASE",
    confidence: 0.70,
    inventoryEffect: "INCREASE",
    countAsImportReceipt: false, countAsRepurchase: false,
    countInTotalImported: false, affectsCommercialStock: true,
    status: "UNKNOWN",
    notes: "Active COMPRA fuente in semantic rules but not seen in import research sample. Electronic support document.",
    enabled: true,
  },
  {
    externalId: "134", externalCode: "SC",
    externalName: "DOCUMENTO SOPORTE COMPRAS",
    semanticType: "PURCHASE_SUPPORT_DOCUMENT", movementType: "PURCHASE",
    confidence: 0.50,
    inventoryEffect: "UNKNOWN",
    countAsImportReceipt: false, countAsRepurchase: false,
    countInTotalImported: false, affectsCommercialStock: false,
    status: "UNKNOWN",
    notes: "Historical fuente. 'SE USO HACE TIEMPO'. Not seen in research sample.",
    enabled: false,
  },
  {
    externalId: "159", externalCode: "ED",
    externalName: "DOC SOPORTE ELECTRONICO COMPRA",
    semanticType: "PURCHASE_SUPPORT_DOCUMENT", movementType: "PURCHASE",
    confidence: 0.50,
    inventoryEffect: "UNKNOWN",
    countAsImportReceipt: false, countAsRepurchase: false,
    countInTotalImported: false, affectsCommercialStock: false,
    status: "UNKNOWN",
    notes: "Historical fuente. Not seen in research sample.",
    enabled: false,
  },

  // ── Inventory/operational fuentes (seen in research) ───────────────────
  {
    externalId: "76", externalCode: "AI",
    externalName: "AJUSTE DE INVENTARIO",
    semanticType: "INVENTORY_ADJUSTMENT", movementType: "ADJUSTMENT",
    confidence: 0.90,
    inventoryEffect: "UNKNOWN",
    countAsImportReceipt: false, countAsRepurchase: false,
    countInTotalImported: false, affectsCommercialStock: true,
    status: "PROBABLE",
    notes: "Research: 415 rows, ~7k units in/out. Inventory corrections. Effect depends on sign.",
    enabled: true,
  },
  {
    externalId: "65", externalCode: "IF",
    externalName: "INV. FISICO",
    semanticType: "PHYSICAL_INVENTORY", movementType: "INVENTORY_COUNT",
    confidence: 0.90,
    inventoryEffect: "UNKNOWN",
    countAsImportReceipt: false, countAsRepurchase: false,
    countInTotalImported: false, affectsCommercialStock: true,
    status: "PROBABLE",
    notes: "Research: 556 rows, 37,596 positive units. Physical count — sets absolute inventory level.",
    enabled: true,
  },
  {
    externalId: "34", externalCode: "TR",
    externalName: "TRASLADO ENTRE BODEGAS",
    semanticType: "TRANSFER_IN", movementType: "TRANSFER",
    confidence: 0.85,
    inventoryEffect: "UNKNOWN",
    countAsImportReceipt: false, countAsRepurchase: false,
    countInTotalImported: false, affectsCommercialStock: false,
    status: "PROBABLE",
    notes: "Transfer between warehouses. Effect depends on perspective (source=out, dest=in).",
    enabled: true,
  },
  {
    externalId: "206", externalCode: "TM",
    externalName: "TRASLADO DE MALETAS",
    semanticType: "TRANSFER_OUT", movementType: "TRANSFER",
    confidence: 0.80,
    inventoryEffect: "DECREASE",
    countAsImportReceipt: false, countAsRepurchase: false,
    countInTotalImported: false, affectsCommercialStock: false,
    status: "PROBABLE",
    notes: "Transfer to seller bags (maletas). Moves goods from central to seller.",
    enabled: true,
  },
];

// ── Warehouse mappings ──────────────────────────────────────────────────────
// Based on BODEGAS table discovery in SAG-IMPORT-RESEARCH-01.
// CRITICAL: ka_nl_bodega (PK) != ss_codigo (business code).
// Our code previously used ss_codigo values assuming they were ka_nl_bodega.

const warehouseMappings: WarehouseSemanticMapping[] = [
  // Import warehouses (confirmed by BODEGAS name + research flow)
  { externalId: "33", externalCode: "24", externalName: "IMPORTACIÓN", semanticType: "IMPORT_STAGING", status: "PROBABLE", notes: "ka_nl_bodega=33, ss_codigo=24. Research: warehouse 33 appears with DS(157) documents." },
  { externalId: "36", externalCode: "26", externalName: "IMPORTACIÓN PARTE 2", semanticType: "IMPORT_STAGING", status: "PROBABLE", notes: "ka_nl_bodega=36, ss_codigo=26. Research: receives FI/PX import invoices." },
  { externalId: "37", externalCode: "27", externalName: "IMPORTACIÓN PARTE 1", semanticType: "IMPORT_STAGING", status: "PROBABLE", notes: "ka_nl_bodega=37, ss_codigo=27. Research: receives FI/PX import invoices." },
  { externalId: "41", externalCode: "30", externalName: "IMPO CONTENEDOR 2", semanticType: "IMPORT_CONTAINER", status: "PROBABLE", notes: "ka_nl_bodega=41, ss_codigo=30. Research: receives FI/PX/FT import docs." },
  { externalId: "42", externalCode: "31", externalName: "IMPO CONTENEDOR 2-1", semanticType: "IMPORT_CONTAINER", status: "UNKNOWN", notes: "ka_nl_bodega=42, ss_codigo=31. Not seen in research sample." },
  { externalId: "43", externalCode: "32", externalName: "IMPO CONTENEDOR 3", semanticType: "IMPORT_CONTAINER", status: "UNKNOWN", notes: "ka_nl_bodega=43, ss_codigo=32. Not seen in research sample." },
  { externalId: "44", externalCode: "33", externalName: "IMPO CONTENEDOR 4", semanticType: "IMPORT_CONTAINER", status: "UNKNOWN", notes: "ka_nl_bodega=44, ss_codigo=33. Not seen in research sample." },

  // Main/store warehouses
  { externalId: "10", externalCode: "01", externalName: "BODEGA PRINCIPAL", semanticType: "MAIN_WAREHOUSE", status: "PROBABLE", notes: "Primary warehouse. Appears in research." },
  { externalId: "11", externalCode: "02", externalName: "BODEGA SANDIEGO", semanticType: "STORE", status: "PROBABLE", notes: "Store location." },
  { externalId: "31", externalCode: "00", externalName: "BODEGA CENTRO", semanticType: "STORE", status: "PROBABLE", notes: "Store location." },
  { externalId: "32", externalCode: "23", externalName: "GRAN PLAZA", semanticType: "STORE", status: "PROBABLE", notes: "Store location." },
  { externalId: "39", externalCode: "29", externalName: "BODEGA CALDAS", semanticType: "STORE", status: "PROBABLE", notes: "Store location." },
  { externalId: "30", externalCode: "22", externalName: "PAGINA WEB", semanticType: "WEB", status: "PROBABLE", notes: "Web orders warehouse." },

  // Production
  { externalId: "13", externalCode: "04", externalName: "PRODUCTO EN PROCESO", semanticType: "PRODUCTION", status: "PROBABLE", notes: "WIP warehouse." },
  { externalId: "14", externalCode: "05", externalName: "MATERIA PRIMA", semanticType: "RAW_MATERIAL", status: "PROBABLE", notes: "Raw materials." },
  { externalId: "15", externalCode: "06", externalName: "TELAS", semanticType: "RAW_MATERIAL", status: "PROBABLE", notes: "Fabrics." },

  // Seller bags
  { externalId: "45", externalCode: "35", externalName: "VEND ORLANDO", semanticType: "SELLER_BAG", status: "PROBABLE", notes: "Vendedor warehouse." },
  { externalId: "46", externalCode: "36", externalName: "VEND CARLOS LEON", semanticType: "SELLER_BAG", status: "PROBABLE", notes: "Vendedor warehouse." },
  { externalId: "47", externalCode: "37", externalName: "VEND LUIS", semanticType: "SELLER_BAG", status: "PROBABLE", notes: "Vendedor warehouse." },
  { externalId: "48", externalCode: "38", externalName: "VEND NESTOR", semanticType: "SELLER_BAG", status: "PROBABLE", notes: "Vendedor warehouse." },
  { externalId: "49", externalCode: "39", externalName: "VEND CARLOS VILLA", semanticType: "SELLER_BAG", status: "PROBABLE", notes: "Vendedor warehouse." },
  { externalId: "50", externalCode: "40", externalName: "VEND FREDY", semanticType: "SELLER_BAG", status: "PROBABLE", notes: "Vendedor warehouse." },

  // Samples / misc
  { externalId: "25", externalCode: "16", externalName: "MUESTRAS", semanticType: "SAMPLES", status: "PROBABLE", notes: "Sample goods." },
  { externalId: "52", externalCode: "41", externalName: "DEXCATO. MC", semanticType: "TRANSIT", status: "UNKNOWN", notes: "Appears as transit in research. Discount/outlet?" },
];

// ── Price mappings ──────────────────────────────────────────────────────────
// v_articulos uses nd_precio1..8 and nd_costo_std.
// Previous code assumed n_valor_venta_promocion (PV3) and nd_valor_venta4 (PV4)
// but those columns do NOT exist in SAG.
// Research found: precio1=10840, precio3=12900, precio4=5670 for ref 9103.
// Mapping is UNKNOWN until validated with business.

const priceMappings: PriceSemanticMapping[] = [
  { externalField: "nd_precio1", semanticType: "UNKNOWN", status: "UNKNOWN", notes: "Research: 10840 for ref 9103. Possibly retail base price." },
  { externalField: "nd_precio2", semanticType: "UNKNOWN", status: "UNKNOWN", notes: "Research: 4765 for ref 9103. Possibly wholesale." },
  { externalField: "nd_precio3", semanticType: "UNKNOWN", status: "UNKNOWN", notes: "Research: 12900 for ref 9103. Highest price — possibly retail with markup?" },
  { externalField: "nd_precio4", semanticType: "UNKNOWN", status: "UNKNOWN", notes: "Research: 5670 for ref 9103. Possibly distributor." },
  { externalField: "nd_precio5", semanticType: "UNKNOWN", status: "UNKNOWN", notes: "Research: 0 for ref 9103." },
  { externalField: "nd_precio6", semanticType: "UNKNOWN", status: "UNKNOWN", notes: "Research: 0 for ref 9103." },
  { externalField: "nd_precio7", semanticType: "UNKNOWN", status: "UNKNOWN", notes: "Research: 6.55 for ref 9103. Very low — possibly a ratio or percentage?" },
  { externalField: "nd_precio8", semanticType: "UNKNOWN", status: "UNKNOWN", notes: "Research: 0 for ref 9103." },
  { externalField: "nd_costo_std", semanticType: "COST", status: "PROBABLE", notes: "Standard cost. Likely the production/purchase cost." },
];

// ── Tenant config ───────────────────────────────────────────────────────────

export const CASTILLITOS_IMPORT_CONFIG: ImportSemanticTenantConfig = {
  tenantId: "castillitos",
  erp: "SAG",
  version: "IMPORT_SEMANTIC_V1",
  documentMappings,
  warehouseMappings,
  priceMappings,
  codeAliases: {},
  namePatterns: [
    // Specific import sub-types (higher specificity by length + priority)
    { pattern: "DEVOLUCION IMPORTACION", semanticType: "IMPORT_RETURN", confidence: 0.55, priority: 10 },
    { pattern: "PROVISION IMPORTACION", semanticType: "IMPORT_PROVISION", confidence: 0.60, priority: 10 },
    { pattern: "LIQUIDACION IMPORTACION", semanticType: "IMPORT_LIQUIDATION", confidence: 0.55, priority: 10 },
    { pattern: "GASTO.*IMPORTACION", semanticType: "IMPORT_EXPENSE", confidence: 0.55, priority: 10 },
    { pattern: "FACTURA.*IMPORTACION", semanticType: "IMPORT_INVOICE", confidence: 0.55, priority: 10 },
    // Generic "IMPORTACION" — never auto-resolve to IMPORT_INVOICE.
    // If no specific sub-type matched, this is ambiguous.
    { pattern: "IMPORTACION", semanticType: "UNKNOWN", confidence: 0.20, priority: 0 },
    // Non-import patterns
    { pattern: "DESGLOSE", semanticType: "GOODS_BREAKDOWN", confidence: 0.50 },
    { pattern: "FACTURA.*COMPRA", semanticType: "DOMESTIC_PURCHASE_INVOICE", confidence: 0.50 },
    { pattern: "AJUSTE.*INVENTARIO", semanticType: "INVENTORY_ADJUSTMENT", confidence: 0.50 },
    { pattern: "INV.*FISICO", semanticType: "PHYSICAL_INVENTORY", confidence: 0.50 },
    { pattern: "TRASLADO", semanticType: "TRANSFER_IN", confidence: 0.45 },
    { pattern: "FACTURA.*VENTA", semanticType: "CUSTOMER_INVOICE", confidence: 0.50 },
    { pattern: "DEVOLUCION.*VENTA", semanticType: "CUSTOMER_RETURN", confidence: 0.50 },
    { pattern: "PEDIDO", semanticType: "CUSTOMER_ORDER", confidence: 0.50 },
  ],
};

// Auto-register on import
registerTenantConfig(CASTILLITOS_IMPORT_CONFIG);
