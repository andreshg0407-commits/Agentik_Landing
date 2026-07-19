/**
 * lib/operational-map/source-catalog/source-catalog-presets.ts
 *
 * Static presets of known data sources for SAG / CRM / Agentik / Banco.
 * Used to seed the source picker in Meeting Mode — no DB query needed.
 * Actual per-KPI assignments are stored in OperationalKpiSource.
 *
 * Sprint: AGENTIK-MEETING-SOURCE-MAPPING-01
 */

export interface SourcePreset {
  provider:    "sag" | "crm" | "agentik" | "bank" | "shopify" | "manual" | "external" | "gocem" | "other";
  sourceType:  "table" | "view" | "api" | "query" | "module" | "file" | "engine" | "custom";
  name:        string;
  label:       string;
  description: string;
  system?:     string;
  tableName?:  string;
  endpoint?:   string;
  fields?:     string[];
}

// ─── SAG sources ──────────────────────────────────────────────────────────────

export const SAG_PRESETS: SourcePreset[] = [
  {
    provider: "sag", sourceType: "table", name: "sag_facturas",
    label: "SAG FACTURAS (FUENTE_1)", description: "Facturas de venta confirmadas (FUENTE_1). Tabla principal de ingresos.",
    system: "SAG", tableName: "FAENCFAC",
    fields: ["DOCUMENTO", "FECHA", "NIT", "VENDEDOR", "VALOR_BRUTO", "VALOR_NETO", "EMPRESA"],
  },
  {
    provider: "sag", sourceType: "table", name: "sag_remisiones",
    label: "SAG REMISIONES (FUENTE_2)", description: "Remisiones / despachos sin facturar (FUENTE_2). Pipeline de ventas en tránsito.",
    system: "SAG", tableName: "FAENCDOC",
    fields: ["DOCUMENTO", "FECHA", "NIT", "VENDEDOR", "VALOR_BRUTO", "ESTADO"],
  },
  {
    provider: "sag", sourceType: "table", name: "sag_pedidos",
    label: "SAG PEDIDOS / PD", description: "Módulo de pedidos SAG. Órdenes creadas antes de facturar.",
    system: "SAG", tableName: "DOCPED",
    fields: ["NUMERO_PED", "FECHA_PED", "NIT", "VENDEDOR", "ESTADO", "VALOR_TOTAL", "TIPO_RETENCION"],
  },
  {
    provider: "sag", sourceType: "table", name: "sag_cartera",
    label: "SAG CARTERA / CXC", description: "Cartera de clientes. Saldos vencidos y vigentes por NIT.",
    system: "SAG", tableName: "CXCCXC",
    fields: ["NIT", "NOMBRE", "SALDO_TOTAL", "SALDO_VENCIDO", "FECHA_VENCIMIENTO", "DIAS_VENCIDO", "EMPRESA"],
  },
  {
    provider: "sag", sourceType: "table", name: "sag_inventario",
    label: "SAG INVENTARIO", description: "Existencias físicas por referencia y bodega.",
    system: "SAG", tableName: "INVANALI",
    fields: ["REFERENCIA", "DESCRIPCION", "BODEGA", "CANTIDAD", "COSTO_UNITARIO"],
  },
  {
    provider: "sag", sourceType: "table", name: "sag_articulos",
    label: "SAG ARTÍCULOS / CATÁLOGO", description: "Catálogo de referencias activas con precio y descripción.",
    system: "SAG", tableName: "INARTICU",
    fields: ["REFERENCIA", "DESCRIPCION", "LINEA", "ESTADO", "PRECIO_LISTA"],
  },
  {
    provider: "sag", sourceType: "table", name: "sag_cobros",
    label: "SAG COBROS / RECIBOS", description: "Pagos recibidos aplicados a cartera. Movimientos de caja.",
    system: "SAG", tableName: "CXCRECIB",
    fields: ["NIT", "FECHA", "VALOR", "TIPO_PAGO", "REFERENCIA_BANCARIA", "VENDEDOR"],
  },
  {
    provider: "sag", sourceType: "table", name: "sag_notas_credito",
    label: "SAG NOTAS CRÉDITO / DEVOLUCIONES", description: "Notas crédito y devoluciones de mercancía.",
    system: "SAG", tableName: "FAENCDOC",
    fields: ["DOCUMENTO", "FECHA", "NIT", "VALOR", "MOTIVO"],
  },
  {
    provider: "sag", sourceType: "table", name: "sag_bodegas",
    label: "SAG BODEGAS", description: "Maestro de bodegas / almacenes.",
    system: "SAG", tableName: "INBODEGA",
    fields: ["CODIGO", "NOMBRE", "ESTADO"],
  },
  {
    provider: "sag", sourceType: "table", name: "sag_terceros",
    label: "SAG TERCEROS / CLIENTES", description: "Maestro de clientes con datos de crédito y comerciales.",
    system: "SAG", tableName: "CXTERCIO",
    fields: ["NIT", "NOMBRE", "VENDEDOR", "ZONA", "CUPO_CREDITO", "PLAZO_CREDITO", "ESTADO"],
  },
  {
    provider: "sag", sourceType: "table", name: "sag_vendedores",
    label: "SAG VENDEDORES / REPRESENTANTES", description: "Maestro de vendedores y representantes comerciales.",
    system: "SAG", tableName: "VEVENDEDO",
    fields: ["CODIGO", "NOMBRE", "ZONA", "META_VENTAS", "ESTADO"],
  },
  {
    provider: "sag", sourceType: "table", name: "sag_listas_precios",
    label: "SAG LISTAS DE PRECIOS", description: "Listas de precios vigentes por referencia y lista.",
    system: "SAG", tableName: "INLISTAP",
    fields: ["REFERENCIA", "LISTA", "PRECIO", "FECHA_DESDE", "FECHA_HASTA"],
  },
  {
    provider: "sag", sourceType: "table", name: "sag_despachos",
    label: "SAG DESPACHOS / LOGÍSTICA", description: "Registro de despachos y trazabilidad de entrega.",
    system: "SAG", tableName: "LGDESPACHO",
    fields: ["NUMERO", "FECHA", "ESTADO", "TRANSPORTADORA", "GUIA"],
  },
];

// ─── CRM sources ──────────────────────────────────────────────────────────────

export const CRM_PRESETS: SourcePreset[] = [
  {
    provider: "crm", sourceType: "module", name: "crm_aos_quotes",
    label: "CRM AOS_Quotes", description: "Cotizaciones y pedidos creados en CRM.",
    system: "SugarCRM", tableName: "AOS_Quotes",
    fields: ["name", "total_amount", "date_entered", "assigned_user", "billing_account", "quote_stage"],
  },
  {
    provider: "crm", sourceType: "module", name: "crm_aos_products_quotes",
    label: "CRM AOS_Products_Quotes", description: "Líneas de productos dentro de cada cotización.",
    system: "SugarCRM", tableName: "AOS_Products_Quotes",
    fields: ["name", "quantity", "unit_price", "total_price", "product_id"],
  },
  {
    provider: "crm", sourceType: "module", name: "crm_opportunities",
    label: "CRM Opportunities", description: "Oportunidades comerciales en pipeline.",
    system: "SugarCRM", tableName: "Opportunities",
    fields: ["name", "amount", "sales_stage", "close_date", "assigned_user", "account_id"],
  },
  {
    provider: "crm", sourceType: "module", name: "crm_accounts",
    label: "CRM Accounts / Clientes", description: "Cuentas de clientes y prospectos en CRM.",
    system: "SugarCRM", tableName: "Accounts",
    fields: ["name", "phone_office", "billing_address_city", "assigned_user", "account_type"],
  },
  {
    provider: "crm", sourceType: "module", name: "crm_contacts",
    label: "CRM Contacts", description: "Contactos asociados a cuentas de clientes.",
    system: "SugarCRM", tableName: "Contacts",
    fields: ["first_name", "last_name", "email1", "phone_work", "account_id"],
  },
  {
    provider: "crm", sourceType: "module", name: "crm_users",
    label: "CRM Users / Vendedores", description: "Usuarios CRM — representantes y vendedores.",
    system: "SugarCRM", tableName: "Users",
    fields: ["user_name", "full_name", "email1", "status"],
  },
  {
    provider: "crm", sourceType: "api", name: "crm_api_rest",
    label: "CRM REST API", description: "Endpoint REST del CRM para consultas en tiempo real.",
    system: "SugarCRM", endpoint: "/api/v8/",
  },
];

// ─── Agentik sources ──────────────────────────────────────────────────────────

export const AGENTIK_PRESETS: SourcePreset[] = [
  {
    provider: "agentik", sourceType: "engine", name: "agentik_operational_orders",
    label: "Agentik OperationalOrders", description: "Órdenes operacionales registradas en Agentik. Estado de sincronización con SAG.",
    system: "Agentik",
    fields: ["id", "clientNit", "sellerId", "status", "sagSyncStatus", "totalAmount", "createdAt"],
  },
  {
    provider: "agentik", sourceType: "engine", name: "agentik_operational_reservations",
    label: "Agentik OperationalReservations", description: "Reservas de inventario por pedido. Descuenta disponibilidad operacional.",
    system: "Agentik",
    fields: ["id", "orderId", "refCode", "qty", "status", "reservedAt"],
  },
  {
    provider: "agentik", sourceType: "engine", name: "agentik_operational_inventory",
    label: "Agentik OperationalInventory", description: "Inventario operacional con fórmula de disponibilidad propia.",
    system: "Agentik",
    fields: ["refCode", "physicalQty", "reservedQty", "operationalAvailableQty", "coverageDays"],
  },
  {
    provider: "agentik", sourceType: "engine", name: "agentik_demand_signals",
    label: "Agentik DemandSignals", description: "Señales de demanda calculadas por Agentik.",
    system: "Agentik",
    fields: ["refCode", "demandPressureScore", "velocidad_venta", "forecast"],
  },
  {
    provider: "agentik", sourceType: "engine", name: "agentik_reconciliation",
    label: "Agentik ReconciliationEngine", description: "Motor de conciliación bancaria Agentik.",
    system: "Agentik",
    fields: ["id", "bankRef", "sagRef", "amount", "status", "matchType"],
  },
  {
    provider: "agentik", sourceType: "engine", name: "agentik_sales_portfolio",
    label: "Agentik SalesPortfolio", description: "Portafolio de ventas y cartera por representante.",
    system: "Agentik",
    fields: ["sellerId", "totalSales", "totalCartera", "coverageScore"],
  },
  {
    provider: "agentik", sourceType: "engine", name: "agentik_collection_cases",
    label: "Agentik CollectionCases", description: "Gestiones de cobranza activas.",
    system: "Agentik",
    fields: ["id", "clientNit", "status", "amountManaged", "assignedTo"],
  },
  {
    provider: "agentik", sourceType: "engine", name: "agentik_alert_engine",
    label: "Agentik AlertEngine", description: "Motor de alertas operacionales en tiempo real.",
    system: "Agentik",
    fields: ["id", "type", "severity", "domain", "message", "createdAt"],
  },
];

// ─── Bank sources ─────────────────────────────────────────────────────────────

export const BANK_PRESETS: SourcePreset[] = [
  {
    provider: "bank", sourceType: "api", name: "bank_feed_bancolombia",
    label: "Bancolombia — Feed Extracto", description: "Extracto bancario Bancolombia vía API o carga manual.",
    system: "Bancolombia",
    fields: ["fecha", "descripcion", "valor", "tipo", "saldo"],
  },
  {
    provider: "bank", sourceType: "file", name: "bank_extracto_manual",
    label: "Extracto Bancario — Carga Manual", description: "Extracto bancario cargado manualmente en formato CSV/XLS.",
    system: "Banco",
    fields: ["fecha", "referencia", "debito", "credito", "saldo"],
  },
];

// ─── Shopify sources ──────────────────────────────────────────────────────────

export const SHOPIFY_PRESETS: SourcePreset[] = [
  {
    provider: "shopify", sourceType: "api", name: "shopify_orders",
    label: "Shopify Orders", description: "Pedidos web de la tienda Shopify.",
    system: "Shopify", endpoint: "/admin/api/orders.json",
    fields: ["id", "total_price", "financial_status", "fulfillment_status", "created_at", "customer"],
  },
  {
    provider: "shopify", sourceType: "api", name: "shopify_products",
    label: "Shopify Products / Inventory", description: "Inventario y catálogo Shopify.",
    system: "Shopify", endpoint: "/admin/api/products.json",
    fields: ["id", "title", "variants", "inventory_quantity"],
  },
];

// ─── Combined catalog ─────────────────────────────────────────────────────────

export const ALL_SOURCE_PRESETS: SourcePreset[] = [
  ...SAG_PRESETS,
  ...CRM_PRESETS,
  ...AGENTIK_PRESETS,
  ...BANK_PRESETS,
  ...SHOPIFY_PRESETS,
];

export const SOURCE_PRESETS_BY_PROVIDER: Record<string, SourcePreset[]> = {
  sag:      SAG_PRESETS,
  crm:      CRM_PRESETS,
  agentik:  AGENTIK_PRESETS,
  bank:     BANK_PRESETS,
  shopify:  SHOPIFY_PRESETS,
};

export const PROVIDER_LABELS: Record<string, string> = {
  sag:      "SAG",
  crm:      "CRM",
  agentik:  "Agentik",
  bank:     "Banco",
  shopify:  "Shopify",
  gocem:    "GOCEM",
  manual:   "Manual",
  external: "Externo",
  other:    "Otro",
};
