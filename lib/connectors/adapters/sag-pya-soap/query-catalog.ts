/**
 * lib/connectors/adapters/sag-pya-soap/query-catalog.ts
 *
 * Official SAG query catalog for Castillitos / PYA SOAP integration.
 *
 * Each entry documents:
 *   - key:               unique identifier used in code and reports
 *   - purpose:           human description of what this query returns
 *   - method:            which SOAP method to use (consultaSagJson | consultaSagJson2)
 *   - query:             the SQL string to pass as parameter
 *   - expectedFields:    fields expected in each row of the response
 *   - notes:             assumptions and caveats about the query
 *   - validationChecklist: what must be confirmed before using this query in production
 *   - status:            "validated" | "pending" | "placeholder"
 *
 * STATUS MEANINGS:
 *   "validated"   — query confirmed working on Castillitos SAG; fields verified
 *   "pending"     — query structure known but not yet tested on Castillitos instance
 *   "placeholder" — table / field names assumed; must be confirmed with DBA
 *
 * IMPORTANT: SQL syntax is SAG-internal SQL (not standard T-SQL).
 * SAG PYA may not support all SQL clauses. Test each query before relying on it.
 *
 * Usage in code:
 *   import { QUERY_CATALOG } from "@/lib/connectors/adapters/sag-pya-soap/query-catalog";
 *   const entry = QUERY_CATALOG.customers.all;
 *   const rows  = await consultaSagJson(config, entry.query);
 */

export type QueryStatus = "validated" | "pending" | "placeholder";
export type SoapMethod  = "consultaSagJson" | "consultaSagJson2";

export interface QueryEntry {
  key:                  string;
  purpose:              string;
  method:               SoapMethod;
  query:                string;
  expectedFields:       string[];
  notes:                string;
  validationChecklist:  string[];
  status:               QueryStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMERS — Terceros / Clientes
// ─────────────────────────────────────────────────────────────────────────────

const CUSTOMERS: Record<string, QueryEntry> = {

  all: {
    key:     "customers.all",
    purpose: "Pull all terceros (customers + third parties) for incremental sync.",
    method:  "consultaSagJson",
    query:   "SELECT * FROM TERCEROS",
    expectedFields: [
      "NIT", "NOMBRE", "TIPO_DOC", "NATURALEZA",
      "CIUDAD", "DEPARTAMENTO", "DIRECCION", "TELEFONO",
      "EMAIL", "VENDEDOR", "NIT_VENDEDOR", "ZONA", "FORMA_PAGO",
      "TIPO_TERCERO", "TIPO_CLIENTE", "PRECIO_VENTA",
      "CREDITO", "DIAS_CREDITO", "ACTIVO", "FECHA_MODIFICACION",
    ],
    notes: "Used by SagPyaSoapAdapter.pullCustomers(). Returns all rows; incremental filtering applied client-side via FECHA_MODIFICACION.",
    validationChecklist: [
      "Confirm FECHA_MODIFICACION field name and date format in response",
      "Confirm NIT format (9 digits vs with DV)",
      "Confirm ACTIVO values (1/0 vs S/N)",
      "Confirm VENDEDOR vs NIT_VENDEDOR both present",
      "Confirm PRECIO_VENTA is numeric",
    ],
    status: "validated",
  },

  byNit: {
    key:     "customers.byNit",
    purpose: "Look up a single tercero by NIT — used for preview prefill and enqueue validation.",
    method:  "consultaSagJson",
    query:   "SELECT * FROM TERCEROS WHERE NIT = '{nit}'",
    expectedFields: ["NIT", "NOMBRE", "CIUDAD", "EMAIL", "VENDEDOR", "ACTIVO"],
    notes:  "Replace {nit} with the 9-digit normalized NIT before calling. SAG may or may not support parameterized WHERE.",
    validationChecklist: [
      "Confirm SAG PYA supports WHERE clause filtering in consultaSagJson",
      "Confirm NIT field accepts bare 9-digit value vs formatted",
    ],
    status: "pending",
  },

  active: {
    key:     "customers.active",
    purpose: "Pull only active terceros — reduces payload size for large catalogs.",
    method:  "consultaSagJson",
    query:   "SELECT * FROM TERCEROS WHERE ACTIVO = 1",
    expectedFields: ["NIT", "NOMBRE", "CIUDAD", "VENDEDOR", "ACTIVO"],
    notes:  "ACTIVO value (1 vs 'S') must be confirmed. Fallback: pull all and filter client-side.",
    validationChecklist: [
      "Confirm ACTIVO = 1 vs ACTIVO = 'S'",
      "Confirm SAG supports WHERE on ACTIVO",
    ],
    status: "pending",
  },

};

// ─────────────────────────────────────────────────────────────────────────────
// RECEIVABLES — Cartera
// ─────────────────────────────────────────────────────────────────────────────

const RECEIVABLES: Record<string, QueryEntry> = {

  all: {
    key:     "receivables.all",
    purpose: "Pull full accounts-receivable portfolio for sync.",
    method:  "consultaSagJson",
    query:   "SELECT * FROM CARTERA",
    expectedFields: [
      "NIT", "NOMBRE", "NUMERO_DOC", "TIPO_DOC", "FECHA_FACTURA",
      "FECHA_VENCIMIENTO", "VALOR_FACTURA", "SALDO", "DIAS_MORA",
      "VENDEDOR", "BODEGA",
    ],
    notes:  "Used by SagPyaSoapAdapter.pullReceivables(). Returns all open + closed receivables. Incremental via FECHA_FACTURA.",
    validationChecklist: [
      "Confirm SALDO field name (some SAG instances use SALDO_ACTUAL)",
      "Confirm DIAS_MORA is numeric",
      "Confirm date format: YYYY-MM-DD or DD/MM/YYYY",
      "Confirm closed receivables are included (SALDO = 0) or excluded",
    ],
    status: "validated",
  },

  byNit: {
    key:     "receivables.byNit",
    purpose: "Pull receivables for a specific customer — used in Customer 360 panel.",
    method:  "consultaSagJson",
    query:   "SELECT * FROM CARTERA WHERE NIT = '{nit}'",
    expectedFields: ["NIT", "NUMERO_DOC", "SALDO", "FECHA_VENCIMIENTO", "DIAS_MORA"],
    notes:  "Replace {nit} with 9-digit normalized NIT.",
    validationChecklist: [
      "Confirm WHERE filtering works in consultaSagJson",
      "Confirm NIT format",
    ],
    status: "pending",
  },

  overdue: {
    key:     "receivables.overdue",
    purpose: "Pull only overdue receivables — for collections dashboard.",
    method:  "consultaSagJson",
    query:   "SELECT * FROM CARTERA WHERE DIAS_MORA > 0",
    expectedFields: ["NIT", "NOMBRE", "SALDO", "DIAS_MORA", "FECHA_VENCIMIENTO"],
    notes:  "Requires WHERE support in SAG PYA. Fallback: pull all, filter client-side.",
    validationChecklist: [
      "Confirm DIAS_MORA field name",
      "Confirm SAG supports numeric WHERE clauses",
    ],
    status: "pending",
  },

};

// ─────────────────────────────────────────────────────────────────────────────
// ARTICLES — Catálogo de artículos
// ─────────────────────────────────────────────────────────────────────────────

const ARTICLES: Record<string, QueryEntry> = {

  all: {
    key:     "articles.all",
    purpose: "Pull full product catalog from SAG.",
    method:  "consultaSagJson",
    query:   "SELECT * FROM ARTICULOS",
    expectedFields: [
      "CODIGO", "DESCRIPCION", "GRUPO", "SUB_GRUPO", "LINEA", "MARCA",
      "UNIDAD", "IVA", "TARIFA_IVA", "PRECIO", "COSTO",
      "MANEJA_KARDEX", "MANEJA_TALLA_COLOR", "MANEJA_LOTE",
      "ACTIVO", "BLOQUEADO", "FECHA_MODIFICACION",
    ],
    notes:
      "Table name confirmed as ARTICULOS by sag-homologate-castillitos.ts structural discovery. " +
      "Price field may be PRECIO, PRECIO_1, or PV1 — check CASTILLITOS_STRUCT.articlesFields. " +
      "ACTIVO is typically 1/0 (numeric) in SAG PYA, not 'S'/'N'. " +
      "FECHA_MODIFICACION presence determines incremental sync viability.",
    validationChecklist: [
      "Run sag-homologate-castillitos.ts --write to confirm table name",
      "Check CASTILLITOS_STRUCT.articlesFields for actual price field name",
      "Confirm ACTIVO value type (1/0 vs S/N)",
      "Confirm FECHA_MODIFICACION is present for incremental sync",
    ],
    status: "pending",
  },

  structuralProbe: {
    key:     "articles.structuralProbe",
    purpose: "One-time structural probe to confirm table name and field layout.",
    method:  "consultaSagJson",
    query:   "SELECT * FROM ARTICULOS",
    expectedFields: [],
    notes:
      "Run this once via sag-homologate-castillitos.ts to populate CASTILLITOS_STRUCT. " +
      "Fallback table candidates: PRODUCTOS, ITEMS. " +
      "The homologation script tries all candidates in order.",
    validationChecklist: [
      "Run sag-homologate-castillitos.ts --write",
      "Check CASTILLITOS_STRUCT.articlesTable after run",
    ],
    status: "pending",
  },

  byCodigo: {
    key:     "articles.byCodigo",
    purpose: "Look up a single article by CODIGO — pre-write existence check.",
    method:  "consultaSagJson",
    query:   "SELECT * FROM ARTICULOS WHERE CODIGO = '{codigo}'",
    expectedFields: ["CODIGO", "DESCRIPCION", "ACTIVO", "IVA", "PRECIO"],
    notes:
      "Used by master-validation.ts when MANEJA_TALLA_COLOR is involved. " +
      "Replace {codigo} with article code. Requires WHERE filtering support in consultaSagJson.",
    validationChecklist: [
      "Confirm table name from CASTILLITOS_STRUCT.articlesTable",
      "Confirm WHERE filtering works in consultaSagJson for ARTICULOS",
    ],
    status: "pending",
  },

  active: {
    key:     "articles.active",
    purpose: "Pull only active articles — reduced payload for catalog sync.",
    method:  "consultaSagJson",
    query:   "SELECT * FROM ARTICULOS WHERE ACTIVO = 1",
    expectedFields: ["CODIGO", "DESCRIPCION", "GRUPO", "LINEA", "PRECIO", "ACTIVO"],
    notes:
      "ACTIVO = 1 for numeric style. If SAG uses 'S'/'N', change to ACTIVO = 'S'. " +
      "Check first row of articles.all to determine ACTIVO format.",
    validationChecklist: [
      "Confirm ACTIVO = 1 vs ACTIVO = 'S' from articles.all sample",
    ],
    status: "pending",
  },

};

// ─────────────────────────────────────────────────────────────────────────────
// INVENTORY — Saldos de inventario por bodega
// ─────────────────────────────────────────────────────────────────────────────

const INVENTORY: Record<string, QueryEntry> = {

  all: {
    key:     "inventory.all",
    purpose: "Pull full inventory balances across all warehouses.",
    method:  "consultaSagJson",
    query:   "SELECT * FROM INVENTARIO",
    expectedFields: [
      "CODIGO", "DESCRIPCION", "BODEGA", "SALDO", "COSTO_PROMEDIO",
      "FECHA_MODIFICACION",
    ],
    notes:
      "Table name confirmed by sag-homologate-castillitos.ts structural discovery. " +
      "Fallback candidates: SALDOS, EXISTENCIAS, SALDOS_INVENTARIO. " +
      "After homologation, check CASTILLITOS_STRUCT.inventoryTable for confirmed name. " +
      "Balance field may be SALDO, EXISTENCIA, or CANTIDAD — check CASTILLITOS_STRUCT.inventoryFields.",
    validationChecklist: [
      "Run sag-homologate-castillitos.ts --write to confirm table name",
      "Check CASTILLITOS_STRUCT.inventoryTable and inventoryFields",
      "Confirm SALDO vs EXISTENCIA field name",
      "Confirm BODEGA field presence for per-warehouse queries",
      "Test for timeout on large catalogs before enabling full sync",
    ],
    status: "pending",
  },

  byBodega: {
    key:     "inventory.byBodega",
    purpose: "Pull inventory for a specific warehouse — used in warehouse stock reports.",
    method:  "consultaSagJson",
    query:   "SELECT * FROM INVENTARIO WHERE BODEGA = '{bodega}'",
    expectedFields: ["CODIGO", "DESCRIPCION", "BODEGA", "SALDO"],
    notes:
      "Replace {bodega} with a confirmed code from CASTILLITOS_BODEGAS. " +
      "Update table name from CASTILLITOS_STRUCT.inventoryTable after homologation.",
    validationChecklist: [
      "Confirm table name",
      "Confirm BODEGA field in inventory table",
      "Confirm WHERE filtering works on BODEGA",
    ],
    status: "pending",
  },

  byCodigo: {
    key:     "inventory.byCodigo",
    purpose: "Pull inventory balance for a specific article across all warehouses.",
    method:  "consultaSagJson",
    query:   "SELECT * FROM INVENTARIO WHERE CODIGO = '{codigo}'",
    expectedFields: ["CODIGO", "BODEGA", "SALDO", "COSTO_PROMEDIO"],
    notes:
      "Used for pre-write document validation (check stock before creating movement). " +
      "Update table name from CASTILLITOS_STRUCT.inventoryTable after homologation.",
    validationChecklist: [
      "Confirm table name",
      "Confirm WHERE filtering works on CODIGO",
    ],
    status: "pending",
  },

};

// ─────────────────────────────────────────────────────────────────────────────
// PRICES — Listas de precios
// ─────────────────────────────────────────────────────────────────────────────

const PRICES: Record<string, QueryEntry> = {

  allLists: {
    key:     "prices.allLists",
    purpose: "Pull all price lists and their article prices — needed for quote validation.",
    method:  "consultaSagJson",
    query:   "SELECT * FROM LISTAS_PRECIOS",
    expectedFields: [
      "CODIGO", "LISTA_PRECIO", "PRECIO", "DESCUENTO", "FECHA_VIGENCIA",
    ],
    notes:  "Table name may vary: LISTAS_PRECIOS, PRECIOS, TABLA_PRECIOS. Critical for customer PRECIO_VENTA validation.",
    validationChecklist: [
      "Confirm table name",
      "Confirm LISTA_PRECIO field name and value type (integer or string)",
      "Confirm price includes or excludes IVA",
    ],
    status: "placeholder",
  },

  byArticle: {
    key:     "prices.byArticle",
    purpose: "Pull all price-list entries for a specific article.",
    method:  "consultaSagJson",
    query:   "SELECT * FROM LISTAS_PRECIOS WHERE CODIGO = '{codigo}'",
    expectedFields: ["CODIGO", "LISTA_PRECIO", "PRECIO"],
    notes:  "Used to validate that a price list number is assigned to a given article.",
    validationChecklist: [
      "Confirm WHERE filtering works",
    ],
    status: "placeholder",
  },

};

// ─────────────────────────────────────────────────────────────────────────────
// ORDERS & DOCUMENTS — Facturas, pedidos, documentos
// ─────────────────────────────────────────────────────────────────────────────

const ORDERS: Record<string, QueryEntry> = {

  recentInvoices: {
    key:     "orders.recentInvoices",
    purpose: "Pull recent sales invoices (FV) for sales reporting.",
    method:  "consultaSagJson",
    query:   "SELECT * FROM DOCUMENTOS WHERE TIPO_DOC = 'FV'",
    expectedFields: [
      "NUMERO_DOC", "TIPO_DOC", "NIT", "NOMBRE", "FECHA", "VENDEDOR",
      "BODEGA", "TOTAL", "TOTAL_IVA", "FORMA_PAGO", "ESTADO",
    ],
    notes:  "Table may be DOCUMENTOS or FACTURAS depending on SAG version. TIPO_DOC='FV' for facturas de venta.",
    validationChecklist: [
      "Confirm table name (DOCUMENTOS vs FACTURAS)",
      "Confirm TIPO_DOC value for factura de venta",
      "Confirm ESTADO values (APLICADO, ANULADO, etc.)",
      "Confirm TOTAL includes or excludes IVA",
      "Confirm date format",
    ],
    status: "placeholder",
  },

  byCustomer: {
    key:     "orders.byCustomer",
    purpose: "Pull all documents for a specific customer — Customer 360 purchase history.",
    method:  "consultaSagJson",
    query:   "SELECT * FROM DOCUMENTOS WHERE NIT = '{nit}'",
    expectedFields: ["NUMERO_DOC", "TIPO_DOC", "FECHA", "TOTAL", "ESTADO"],
    notes:  "Replace {nit} with 9-digit normalized NIT.",
    validationChecklist: [
      "Confirm WHERE filtering works",
      "Confirm all document types are returned (FV, NC, ND, CO, etc.)",
    ],
    status: "placeholder",
  },

  pendingOrders: {
    key:     "orders.pendingOrders",
    purpose: "Pull open purchase/sales orders (pedidos).",
    method:  "consultaSagJson",
    query:   "SELECT * FROM PEDIDOS WHERE ESTADO = 'PENDIENTE'",
    expectedFields: ["NUMERO_DOC", "NIT", "FECHA", "TOTAL", "ESTADO", "VENDEDOR"],
    notes:  "Table PEDIDOS may not exist in all SAG PYA installations. Confirm with Castillitos.",
    validationChecklist: [
      "Confirm PEDIDOS table exists in Castillitos SAG",
      "Confirm ESTADO values for pending orders",
    ],
    status: "placeholder",
  },

};

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCTION ORDERS
// ─────────────────────────────────────────────────────────────────────────────

const PRODUCTION: Record<string, QueryEntry> = {

  allOrders: {
    key:     "production.allOrders",
    purpose: "Pull production orders for manufacturing visibility.",
    method:  "consultaSagJson",
    query:   "SELECT * FROM ORDENES_PRODUCCION",
    expectedFields: [
      "NUMERO", "ARTICULO", "CANTIDAD", "FECHA_INICIO", "FECHA_FIN",
      "ESTADO", "BODEGA_ENTRADA",
    ],
    notes:  "PLACEHOLDER — table name and fields completely unknown. Castillitos uses SAG PYA; confirm if production module is activated.",
    validationChecklist: [
      "Confirm production module is activated in Castillitos SAG",
      "Confirm table name (ORDENES_PRODUCCION vs OP vs PRODUCCION)",
      "Confirm field names and date format",
      "Confirm ESTADO values",
    ],
    status: "placeholder",
  },

};

// ─────────────────────────────────────────────────────────────────────────────
// MASTER DATA LOOKUP QUERIES — for homologation (Phase 1)
// ─────────────────────────────────────────────────────────────────────────────
//
// These queries are NOT for sync. They exist to populate castillitos-overrides.ts
// with confirmed valid values. Run once during homologation sprint.

const MASTER_LOOKUPS: Record<string, QueryEntry> = {

  formasPago: {
    key:     "master.formasPago",
    purpose: "Discover all valid payment method codes for FORMA_PAGO field.",
    method:  "consultaSagJson",
    query:   "SELECT * FROM FORMAS_PAGO ORDER BY CODIGO",
    expectedFields: ["CODIGO", "DESCRIPCION"],
    notes:  "Run once during homologation. Populate CASTILLITOS_FORMAS_PAGO in castillitos-overrides.ts.",
    validationChecklist: ["Confirm table name", "Confirm ACTIVO filter if needed"],
    status: "pending",
  },

  zonas: {
    key:     "master.zonas",
    purpose: "Discover all valid zone codes for ZONA field.",
    method:  "consultaSagJson",
    query:   "SELECT * FROM ZONAS ORDER BY CODIGO",
    expectedFields: ["CODIGO", "DESCRIPCION"],
    notes:  "Populate CASTILLITOS_ZONAS in castillitos-overrides.ts.",
    validationChecklist: ["Confirm table name (ZONAS vs ZONAS_COMERCIALES)"],
    status: "pending",
  },

  tiposTercero: {
    key:     "master.tiposTercero",
    purpose: "Discover all valid third-party type codes for TIPO_TERCERO field.",
    method:  "consultaSagJson",
    query:   "SELECT * FROM TIPO_TERCERO ORDER BY CODIGO",
    expectedFields: ["CODIGO", "DESCRIPCION"],
    notes:  "Populate CASTILLITOS_TIPOS_TERCERO in castillitos-overrides.ts.",
    validationChecklist: ["Confirm table name (TIPO_TERCERO vs TIPOS_TERCERO)"],
    status: "pending",
  },

  tiposCliente: {
    key:     "master.tiposCliente",
    purpose: "Discover all valid customer type codes for TIPO_CLIENTE field.",
    method:  "consultaSagJson",
    query:   "SELECT * FROM TIPO_CLIENTE ORDER BY CODIGO",
    expectedFields: ["CODIGO", "DESCRIPCION"],
    notes:  "Populate CASTILLITOS_TIPOS_CLIENTE in castillitos-overrides.ts.",
    validationChecklist: ["Confirm table name"],
    status: "pending",
  },

  vendedores: {
    key:     "master.vendedores",
    purpose: "Discover all active sales rep NITs for NIT_VENDEDOR validation.",
    method:  "consultaSagJson",
    query:   "SELECT NIT, NOMBRE FROM TERCEROS WHERE TIPO_TERCERO = 'V' ORDER BY NOMBRE",
    expectedFields: ["NIT", "NOMBRE"],
    notes:  "TIPO_TERCERO code for vendedor may differ from 'V'. Confirm with Castillitos. Populate CASTILLITOS_VENDEDORES.",
    validationChecklist: [
      "Confirm TIPO_TERCERO code for vendedores",
      "Confirm NIT format in response",
    ],
    status: "pending",
  },

  listasPrecios: {
    key:     "master.listasPrecios",
    purpose: "Discover active price list numbers for PRECIO_VENTA validation.",
    method:  "consultaSagJson",
    query:   "SELECT DISTINCT LISTA_PRECIO FROM LISTAS_PRECIOS ORDER BY LISTA_PRECIO",
    expectedFields: ["LISTA_PRECIO"],
    notes:  "Populate CASTILLITOS_LISTAS_PRECIO. Typically 1–7 for SAG PYA.",
    validationChecklist: ["Confirm table and field name"],
    status: "placeholder",
  },

  gruposArticulos: {
    key:     "master.gruposArticulos",
    purpose: "Discover all product group codes for GRUPO validation.",
    method:  "consultaSagJson",
    query:   "SELECT CODIGO, DESCRIPCION FROM GRUPOS_ARTICULOS ORDER BY CODIGO",
    expectedFields: ["CODIGO", "DESCRIPCION"],
    notes:  "Populate CASTILLITOS_GRUPOS. Table may be GRUPOS or GRUPOS_ARTICULOS.",
    validationChecklist: ["Confirm table name"],
    status: "pending",
  },

  lineasArticulos: {
    key:     "master.lineasArticulos",
    purpose: "Discover all product line codes for LINEA validation.",
    method:  "consultaSagJson",
    query:   "SELECT CODIGO, DESCRIPCION FROM LINEAS_ARTICULOS ORDER BY CODIGO",
    expectedFields: ["CODIGO", "DESCRIPCION"],
    notes:  "Populate CASTILLITOS_LINEAS. Table may be LINEAS or LINEAS_ARTICULOS.",
    validationChecklist: ["Confirm table name"],
    status: "pending",
  },

  tarifasIva: {
    key:     "master.tarifasIva",
    purpose: "Discover all IVA tariff codes for TARIFA_IVA validation.",
    method:  "consultaSagJson",
    query:   "SELECT CODIGO, DESCRIPCION, PORCENTAJE FROM TARIFAS_IVA ORDER BY PORCENTAJE",
    expectedFields: ["CODIGO", "DESCRIPCION", "PORCENTAJE"],
    notes:  "Populate CASTILLITOS_TARIFAS_IVA. Table may be TARIFAS_IVA or IVA.",
    validationChecklist: ["Confirm table name", "Confirm PORCENTAJE field type (numeric vs string)"],
    status: "pending",
  },

  bodegas: {
    key:     "master.bodegas",
    purpose: "Discover all warehouse codes for BODEGA validation — critical for tipo 2/28.",
    method:  "consultaSagJson",
    query:   "SELECT CODIGO, DESCRIPCION, ACTIVO FROM BODEGAS ORDER BY CODIGO",
    expectedFields: ["CODIGO", "DESCRIPCION", "ACTIVO"],
    notes:  "CRITICAL — required before any document write. Populate CASTILLITOS_BODEGAS.",
    validationChecklist: [
      "Confirm table name (BODEGAS vs ALMACENES)",
      "Confirm ACTIVO filter for active warehouses only",
    ],
    status: "pending",
  },

  unidades: {
    key:     "master.unidades",
    purpose: "Discover all valid unit-of-measure codes for UNIDAD validation.",
    method:  "consultaSagJson",
    query:   "SELECT CODIGO, DESCRIPCION FROM UNIDADES_MEDIDA ORDER BY CODIGO",
    expectedFields: ["CODIGO", "DESCRIPCION"],
    notes:  "UND is always safe. Populate CASTILLITOS_UNIDADES for non-standard articles.",
    validationChecklist: ["Confirm table name (UNIDADES_MEDIDA vs UNIDADES)"],
    status: "pending",
  },

  tallas: {
    key:     "master.tallas",
    purpose: "Discover all valid size codes for TALLA validation.",
    method:  "consultaSagJson",
    query:   "SELECT CODIGO, DESCRIPCION FROM TALLAS ORDER BY CODIGO",
    expectedFields: ["CODIGO", "DESCRIPCION"],
    notes:  "Only needed if Castillitos has MANEJA_TALLA_COLOR articles.",
    validationChecklist: ["Confirm table name", "Confirm Castillitos uses size/color variants"],
    status: "placeholder",
  },

  colores: {
    key:     "master.colores",
    purpose: "Discover all valid color codes for COLOR validation.",
    method:  "consultaSagJson",
    query:   "SELECT CODIGO, DESCRIPCION FROM COLORES ORDER BY CODIGO",
    expectedFields: ["CODIGO", "DESCRIPCION"],
    notes:  "Only needed if Castillitos has MANEJA_TALLA_COLOR articles.",
    validationChecklist: ["Confirm table name", "Confirm Castillitos uses color variants"],
    status: "placeholder",
  },

};

// ─────────────────────────────────────────────────────────────────────────────
// Unified catalog export
// ─────────────────────────────────────────────────────────────────────────────

export const QUERY_CATALOG = {
  customers:     CUSTOMERS,
  receivables:   RECEIVABLES,
  articles:      ARTICLES,
  inventory:     INVENTORY,
  prices:        PRICES,
  orders:        ORDERS,
  production:    PRODUCTION,
  masterLookups: MASTER_LOOKUPS,
} as const;

/** Flat list of all query entries for iteration / report generation */
export function allQueries(): QueryEntry[] {
  return Object.values(QUERY_CATALOG).flatMap(domain =>
    Object.values(domain) as QueryEntry[]
  );
}

/** Summary of query readiness by status */
export function queryCatalogSummary(): {
  total:       number;
  validated:   number;
  pending:     number;
  placeholder: number;
  byDomain:    Record<string, { total: number; validated: number }>;
} {
  const entries = allQueries();
  const byDomain: Record<string, { total: number; validated: number }> = {};

  for (const [domain, queries] of Object.entries(QUERY_CATALOG)) {
    const list = Object.values(queries) as QueryEntry[];
    byDomain[domain] = {
      total:     list.length,
      validated: list.filter(q => q.status === "validated").length,
    };
  }

  return {
    total:       entries.length,
    validated:   entries.filter(q => q.status === "validated").length,
    pending:     entries.filter(q => q.status === "pending").length,
    placeholder: entries.filter(q => q.status === "placeholder").length,
    byDomain,
  };
}
