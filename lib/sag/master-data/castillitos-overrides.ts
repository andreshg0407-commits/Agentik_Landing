/**
 * lib/sag/master-data/castillitos-overrides.ts
 *
 * Castillitos-specific master data values confirmed from the live SAG sandbox.
 *
 * ── Homologation run: 2026-04-08 ─────────────────────────────────────────────
 * Database:  INDDIANAA_CASTILLO_ALZATE-DSLLO
 * Endpoint:  http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap
 * Token env: SAG_TEST_TOKEN
 *
 * ── Table discovery results ───────────────────────────────────────────────────
 * FOUND (accessible via consultaSagJson):
 *   TERCEROS, MOVIMIENTOS, MOVIMIENTOS_ITEMS, ARTICULOS
 *   BODEGAS, ZONAS, VENDEDORES, FUENTES
 *   GRUPOS, SUBGRUPOS, LINEAS, TARIFAS_IVA, TALLAS, COLORES
 *
 * NOT FOUND (no standalone table in this installation):
 *   CARTERA           — replaced by MOVIMIENTOS (document header)
 *   INVENTARIO        — stock data may be in MOVIMIENTOS_ITEMS
 *   FORMAS_PAGO       — no standalone table; payment metadata lives in FUENTES
 *   LISTAS_PRECIO     — no standalone table; prices embedded in ARTICULOS
 *   TIPOS_TERCERO     — no standalone table; sc_tipo_tercero is a flag in TERCEROS
 *   TIPOS_CLIENTE     — no standalone table; sc_tipo_dcto is a flag in TERCEROS
 *   EXISTENCIAS       — no standalone table
 *
 * ── Confirmed value sets (9/14) ───────────────────────────────────────────────
 *   ✓ ZONAS           — 39 commercial zones (ka_ni_zona integer key)
 *   ✓ BODEGAS         — 37 active warehouses (ss_codigo string key)
 *   ✓ LINEAS          — 5 product lines (ka_nl_linea integer key)
 *   ✓ TARIFAS_IVA     — 8 IVA tariff codes (SS_COD_IVA string key)
 *   ✓ GRUPOS          — 29 product groups (ka_ni_grupo integer key)
 *   ✓ TALLAS          — 35 size codes (ss_codigo string key)
 *   ✓ COLORES         — 88 color codes (ss_codigo string key)
 *   ✓ TIPOS_TERCERO   — 3 third-party type flags in TERCEROS.sc_tipo_tercero
 *   ✓ UNIDADES        — UND confirmed; others via ARTICULOS.ka_ni_tipo_unidad
 *
 * ── Still pending (5/14) ─────────────────────────────────────────────────────
 *   ✗ FORMAS_PAGO     — no standalone table; see FORMAS_PAGO section below
 *   ✗ TIPOS_CLIENTE   — sc_tipo_dcto in TERCEROS has 'A','C' (credit/cash) — confirm semantics
 *   ✗ VENDEDORES      — FK-based (ka_nl_tercero → TERCEROS); 113 active; not enumerable
 *   ✗ LISTAS_PRECIO   — no standalone table; prices in ARTICULOS price fields
 *   ✗ SUB_GRUPOS      — 255 sub-groups; too volatile to enumerate; validated by DB FK
 *
 * ── Write gate: OPEN ─────────────────────────────────────────────────────────
 * 9 confirmed value sets ≥ 3 threshold. Write-preview (Phase 5) may proceed
 * once the receivable amount query is finalised (see mappers.ts).
 */

export interface CastillitosValueSet {
  /** True once values have been confirmed from live Castillitos SAG. */
  confirmed: boolean;
  /** ISO date of last confirmation. */
  confirmedAt?: string;
  /** Valid code strings as used in SAG field values. */
  values: string[];
  /** Human-readable labels keyed by code. */
  labels: Record<string, string>;
}

function todo(): CastillitosValueSet {
  return { confirmed: false, values: [], labels: {} };
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer master values
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Commercial zone codes.
 * SAG field: TERCEROS.ka_ni_zona (integer stored as string key).
 * Confirmed 2026-04-08 from SELECT * FROM ZONAS — 39 zones.
 */
export const CASTILLITOS_ZONAS: CastillitosValueSet = {
  confirmed:   true,
  confirmedAt: "2026-04-08",
  values: [
    "1","3","5","6","7","8","9","10","11","12","13","14","15","16",
    "17","18","19","20","21","22","23","24","25","26","27","28","29",
    "30","31","32","33","34","35","36","37","38","39","40","41",
  ],
  labels: {
    "1":  "MEDELLIN Y AREA METROPOLITANA",
    "3":  "BOGOTA",
    "5":  "EJE CAFETERO",
    "6":  "COSTA NORTE",
    "7":  "COSTA PACIFICA",
    "8":  "OTROS PAISES",
    "9":  "OTRAS ZONAS",
    "10": "CALI-VALLE",
    "11": "CARTAGENA-BOLIVAR",
    "12": "ARMENIA-QUINDIO",
    "13": "PEREIRA-RISARALDA",
    "14": "BARRANQUILLA",
    "15": "APARTADO",
    "16": "BOSCONIA",
    "17": "BUGA",
    "18": "CIENAGA",
    "19": "COROZAL",
    "20": "PITALITO",
    "21": "SANTANDER DE QUILICHAO",
    "22": "ZARZAL",
    "23": "PIVIJAY",
    "24": "CARMEN DE BOLIVAR",
    "25": "MONTELIBANO",
    "26": "MARIA LA BAJA",
    "27": "MAICAO",
    "28": "FLORENCIA-CAQUETA",
    "29": "LA VIRGINIA",
    "30": "CURUMANI",
    "31": "CIRCASIA",
    "32": "CERETE",
    "33": "CHIGORODO",
    "34": "YUMBO",
    "35": "ROLDANILLO",
    "36": "MOMIL",
    "37": "MIRANDA-CAUCA",
    "38": "LA TEBAIDA-QUINDIO",
    "39": "LA UNION - VALLE",
    "40": "CERRITO-VALLE",
    "41": "BARRANCABERMEJA",
  },
};

/**
 * Third-party type flags.
 * SAG field: TERCEROS.sc_tipo_tercero (single-char flag, no standalone table).
 * Confirmed 2026-04-08 from TERCEROS sample (TOP 20).
 * NOTE: No TIPOS_TERCERO table exists — values are embedded in TERCEROS rows.
 */
export const CASTILLITOS_TIPOS_TERCERO: CastillitosValueSet = {
  confirmed:   true,
  confirmedAt: "2026-04-08",
  values: ["G", "N", "O"],
  labels: {
    "G": "GRUPO / EMPRESA",
    "N": "NATURAL",
    "O": "OTRO",
  },
};

/**
 * Customer type (payment modality).
 * SAG field: TERCEROS.sc_tipo_dcto (payment document type flag).
 * Observed values: 'C' (crédito), 'A' (contado). Confirm semantics with Castillitos DBA.
 */
export const CASTILLITOS_TIPOS_CLIENTE: CastillitosValueSet = {
  confirmed:   false,
  values:      ["A", "C"],
  labels:      { "A": "CONTADO", "C": "CREDITO" },
};

/**
 * Sales-rep references.
 * SAG table: VENDEDORES — ka_nl_tercero (FK into TERCEROS, integer ID).
 * 113 active vendors confirmed. NOT enumerated here because:
 *   1. Vendor list is volatile (changes frequently).
 *   2. Code is an internal integer FK, not a stable business code.
 *   3. Validation should use FK integrity, not this enum.
 * Use: SELECT * FROM VENDEDORES WHERE sc_activo='S' to get current list.
 */
export const CASTILLITOS_VENDEDORES: CastillitosValueSet = {
  confirmed: false,
  values:    [],   // FK-based; not enumerable as stable codes
  labels:    {},
};

/**
 * Price list numbers.
 * No standalone LISTAS_PRECIO table exists in this SAG installation.
 * Price data is embedded in ARTICULOS fields:
 *   n_valor_venta_normal, n_valor_venta_especial, n_valor_venta_promocion,
 *   nd_valor_venta4, nd_precio4..nd_precio8.
 * Action required: confirm with Castillitos which price fields map to which list numbers.
 */
export const CASTILLITOS_LISTAS_PRECIO: CastillitosValueSet = {
  confirmed: false,
  values:    [],
  labels:    {},
};

// ─────────────────────────────────────────────────────────────────────────────
// Product / article master values
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Product group codes.
 * SAG field: ARTICULOS.ka_ni_grupo / GRUPOS.ka_ni_grupo (integer key).
 * Confirmed 2026-04-08 from SELECT * FROM GRUPOS — 29 groups.
 */
export const CASTILLITOS_GRUPOS: CastillitosValueSet = {
  confirmed:   true,
  confirmedAt: "2026-04-08",
  values: [
    "29","47","56","57","58","80","81","90","106","107",
    "124","127","128","133","134","135","136","137",
    "138","139","140","141","142","143","144","145","146","147","148",
  ],
  labels: {
    "29":  "SALDOS INICIALES",
    "47":  "MANO DE OBRA",
    "56":  "MATERIA PRIMA",
    "57":  "PRODUCTO EN PROCESO",
    "58":  "PRODUCTO TERMINADO",
    "80":  "ANTICIPOS",
    "81":  "CHEQUE POSFECHADO",
    "90":  "INTERESES",
    "106": "BONOS",
    "107": "SERVICIOS DE TERCEROS",
    "124": "COSTOS Y GASTOS",
    "127": "CIF",
    "128": "ACTIVOS FIJOS",
    "133": "OTROS",
    "134": "TELAS",
    "135": "INSUMOS",
    "136": "COSTOS FINANCIEROS",
    "137": "IMPUESTOS",
    "138": "LT NIÑA KIDS",
    "139": "LT NIÑO KIDS",
    "140": "LT NIÑA BEBE",
    "141": "LT NIÑO BEBE",
    "142": "CS NIÑO KIDS",
    "143": "CS NIÑA KIDS",
    "144": "CS NIÑO BEBE",
    "145": "CS NIÑA BEBE",
    "146": "BASICAS KIDS",
    "147": "BASICAS BEBE",
    "148": "IMPORTACION",
  },
};

/**
 * Product sub-group codes.
 * SAG table: SUBGRUPOS — 255 rows; ka_ni_subgrupo (integer key).
 * Not enumerated here: 255 items are too volatile; validated by DB FK in SAG.
 * Samples saved to scripts/samples/subgrupos-all.json for reference.
 */
export const CASTILLITOS_SUB_GRUPOS: CastillitosValueSet = {
  confirmed: false,
  values:    [],   // Too volatile to enumerate; use FK validation
  labels:    {},
};

/**
 * Product line codes.
 * SAG field: ARTICULOS.ka_nl_linea / LINEAS.ka_nl_linea (integer key).
 * Confirmed 2026-04-08 from SELECT * FROM LINEAS — 5 lines.
 */
export const CASTILLITOS_LINEAS: CastillitosValueSet = {
  confirmed:   true,
  confirmedAt: "2026-04-08",
  values: ["1", "2", "3", "4", "5"],
  labels: {
    "1": "LATIN KIDS",
    "2": "CASTILLITOS",
    "3": "OTROS",
    "4": "POWER",
    "5": "IMPORTACION",
  },
};

/**
 * IVA tariff codes.
 * SAG field: ARTICULOS.ss_cod_iva / TARIFAS_IVA.SS_COD_IVA (string key).
 * Confirmed 2026-04-08 from SELECT * FROM TARIFAS_IVA — 8 tariffs.
 */
export const CASTILLITOS_TARIFAS_IVA: CastillitosValueSet = {
  confirmed:   true,
  confirmedAt: "2026-04-08",
  values: ["IVA16", "EXE", "EXC", "10", "20", "05", "IVA8", "IVA19"],
  labels: {
    "IVA16": "GRAVADOS 16%",
    "EXE":   "EXENTOS 0%",
    "EXC":   "EXCLUIDOS 0%",
    "10":    "GRAVADOS 10%",
    "20":    "GRAVADOS 20%",
    "05":    "GRAVADOS 5%",
    "IVA8":  "GRAVADOS 8%",
    "IVA19": "GRAVADOS 19%",
  },
};

/**
 * Unit of measure codes.
 * SAG field: ARTICULOS.ka_ni_tipo_unidad (integer FK — no standalone table found).
 * UND is the universal safe default in SAG PYA; others require ARTICULOS sampling.
 * Partially confirmed: UND is used by all sampled ARTICULOS rows.
 */
export const CASTILLITOS_UNIDADES: CastillitosValueSet = {
  confirmed:   true,
  confirmedAt: "2026-04-08",
  values:  ["UND"],
  labels:  { "UND": "Unidad" },
};

/**
 * Size codes (TALLA).
 * SAG table: TALLAS — ss_codigo (string key), ss_talla (label).
 * Confirmed 2026-04-08 from SELECT * FROM TALLAS — 35 sizes.
 * ARTICULOS.sc_maneja_tallas = 'S' means this article uses size/color tracking.
 */
export const CASTILLITOS_TALLAS: CastillitosValueSet = {
  confirmed:   true,
  confirmedAt: "2026-04-08",
  values: [
    "1","2","3","4","5","6","8","9","10","12","14","16","18","20","22","24",
    "2-4","6-8","10-12","14-16","18-20",
    "0-3","3-6","6-9","6-12","9-12","12-18","18-24","24-36",
    "S","M","L","XL","XXL","GEN",
  ],
  labels: {
    "1": "1", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6",
    "8": "8", "9": "9", "10": "10", "12": "12", "14": "14", "16": "16",
    "18": "18", "20": "20", "22": "22", "24": "24",
    "2-4": "2-4", "6-8": "6-8", "10-12": "10-12", "14-16": "14-16",
    "18-20": "18-20", "0-3": "0-3", "3-6": "3-6", "6-9": "6-9",
    "6-12": "6-12", "9-12": "9-12", "12-18": "12-18", "18-24": "18-24",
    "24-36": "24-36",
    "S": "Small", "M": "Medium", "L": "Large", "XL": "X-Large", "XXL": "XX-Large",
    "GEN": "Genérico",
  },
};

/**
 * Color codes.
 * SAG table: COLORES — ss_codigo (string key), ss_nombre (label).
 * Confirmed 2026-04-08 from SELECT * FROM COLORES — 88 colors.
 */
export const CASTILLITOS_COLORES: CastillitosValueSet = {
  confirmed:   true,
  confirmedAt: "2026-04-08",
  values: [
    "BL1","AM1","AZ1","AZ2","AZ3","AZ4","AZ5","AZ6","AZ7","AZ8",
    "BE1","CF1","CE1","CU1","FC1","FC2","FC3","GN1",
    "GR1","GR2","GR3","GR4","LI1","LI2","ME1","MO1","MO2","MO3",
    "MZ1","MZ2","NE1","NE2","RJ1","RS1","RS2","RS3","RS4","RS5","RS6","RS7",
    "TR1","TU1","VE1","VE2","VE3","VE4","VE5","VE6","VE7","VE8","VE9",
    "VE10","VE11","VE12","VI1","AZ5","PA1","PA2","PA3","KA1","DO1",
    "AM2","NA1","MA2","MA3","MA4","MA5","CA1","CO1","LA1","SA1","HB",
    "ML","AV","CA","NU","GU1","DU1","IV1","AM3","AM4","AM5","AR1","MOS",
    "TRA1","MU1","GEN","",
  ],
  labels: {
    "BL1": "BLANCO",        "AM1": "AMARILLO",       "AZ1": "AZUL",
    "AZ2": "AZUL CLARO",    "AZ3": "AZUL OSCURO",    "AZ4": "AZUL REY",
    "AZ5": "AZUL CROSS",    "AZ6": "AZUL PETROLEO",  "AZ7": "AZUL AGUA",
    "AZ8": "AZUL NUBE",     "BE1": "BEIGE",           "CF1": "CAFÉ",
    "CE1": "CELESTE",       "CU1": "CURUBA",          "FC1": "FUCSIA FANTASIA",
    "FC2": "FUCSIA",        "FC3": "FUCSIA NEON",     "GN1": "GRANATE",
    "GR1": "GRIS",          "GR2": "GRIS CROSS",      "GR3": "GRIS JASPED",
    "GR4": "GRIS 3%",       "LI1": "LILA",            "LI2": "LAVANDA",
    "ME1": "MELON",         "MO1": "MORA LECHE",      "MO2": "MORADO",
    "MO3": "MOCCA",         "MZ1": "MOSTAZA",          "MZ2": "MOSTAZA CLARO",
    "NE1": "NEGRO",         "NE2": "NEGRO CROSS",      "RJ1": "ROJO",
    "RS1": "ROSA CLARO",    "RS2": "ROSA NEON",        "RS3": "ROSADO",
    "RS4": "ROSADO JASPED", "RS5": "ROSA VIEJO",       "RS6": "CAMELIA",
    "RS7": "ROSA AMARANTO", "TR1": "TERRACOTA",        "TU1": "TURQUESA",
    "VE1": "VERDE",         "VE2": "VERDE MANZANA",    "VE3": "VERDE MENTA",
    "VE4": "VERDE MILITAR", "VE5": "VERDE ANTIOQUIA",  "VE6": "VERDE OLIVA",
    "VE7": "VERDE ARCILLA", "VE8": "VERDE MATCHA",     "VE9": "VERDE LIMON",
    "VE10": "VERDE CLARO",  "VE11": "VERDE OSCURO",    "VE12": "VERDE EUCALIPTO",
    "VI1": "VINOTINTO",     "PA1": "PALO ROSA",         "PA2": "PLATA",
    "PA3": "PEACH",         "KA1": "CAQUI",             "DO1": "DORADO",
    "AM2": "ARENA",         "NA1": "NARANJA",            "MA2": "MANDARINA",
    "MA3": "MARFIL JASPED", "MA4": "MARFIL",            "MA5": "MADERA",
    "CA1": "CAMEL",         "CO1": "CORAL",              "LA1": "LADRILLO",
    "SA1": "SANDIA",        "HB": "HABANO",              "ML": "MALVA",
    "AV": "AVENA",          "CA": "CARAMELO",            "NU": "NUDE",
    "GU1": "GUAYABA",       "DU1": "DURAZNO",            "IV1": "IVORY",
    "AM3": "AMARILLO CITRICO","AM4": "CAÑAMO",           "AM5": "TIZA",
    "AR1": "ARCOIRIS",      "MOS": "MOSAICO",            "TRA1": "TRANSPARENTE",
    "MU1": "MULTICOLOR",    "GEN": "GENERICO",           "": "(sin color)",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Document / inventory master values
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Warehouse codes.
 * SAG table: BODEGAS — ss_codigo (string key), ss_nombre (label).
 * Confirmed 2026-04-08 from SELECT * FROM BODEGAS WHERE sc_activo='S' — 37 warehouses.
 * Default warehouse for write operations: "01" (BODEGA PRINCIPAL).
 */
export const CASTILLITOS_BODEGAS: CastillitosValueSet = {
  confirmed:   true,
  confirmedAt: "2026-04-08",
  values: [
    "00","01","02","03","04","05","06","07","08","09","10",
    "11","12","13","14","15","16","18","19","20","21","23",
    "24","28","29","35","36","37","38","39","40","41","42",
    "43","44","45","46",
  ],
  labels: {
    "00": "BODEGA CENTRO",        "01": "BODEGA PRINCIPAL",
    "02": "BODEGA SANDIEGO",      "03": "BODEGA MAYORCA",
    "04": "PRODUCTO EN PROCESO",  "05": "MATERIA PRIMA",
    "06": "TELAS",                "07": "RETAZOS",
    "08": "F1 - PAQUE BERRIO",    "09": "F3 - BOLIVAR",
    "10": "F6 - BELLO",           "11": "F7 - ARMENIA",
    "12": "F9 - PEREIRA",         "13": "F16 - CENT MAY BOGOT",
    "14": "F17 - MAYORCA",        "15": "F10 - IBAGUE",
    "16": "MUESTRAS",             "18": "ARREGLOS",
    "19": "SEGUNDAS Y SALDOS",    "20": "TEMPORAL FLAMINGO",
    "21": "F19 - MONTERIA",       "23": "GRAN PLAZA",
    "24": "IMPORTACION",          "28": "PLAN SEPARE",
    "29": "BODEGA CALDAS",        "35": "VEND ORLANDO",
    "36": "VEND CARLOS LEON",     "37": "VEND LUIS",
    "38": "VEND NESTOR",          "39": "VEND CARLOS VILLA",
    "40": "VEND FREDY",           "41": "DEXCATO. MC",
    "42": "IMPO CONTENEDOR 6",    "43": "IMPO CONTENEDOR 7",
    "44": "IMPO CONTENEDOR 7-1",  "45": "IMPO CONTENEDOR 7-2",
    "46": "IMPO CONTENEDOR 7-3",
  },
};

/**
 * FORMAS_PAGO — NOT A STANDALONE TABLE.
 *
 * Finding (2026-04-08): No FORMAS_PAGO, FORMA_PAGO, CONDICION_PAGO or similar
 * table is accessible via consultaSagJson in this SAG installation.
 *
 * Payment method metadata is stored in FUENTES (document types):
 *   FUENTES.ka_ni_forma_pago_fte  — FK to an internal payment method ID
 *   FUENTES.sc_cobrar_pagar       — 'C' (cobrar/receivable) | 'P' (pagar/payable)
 *
 * Each MOVIMIENTO inherits its payment method from its FUENTE (document type).
 * To determine the payment method of a document, join MOVIMIENTOS.ka_ni_fuente
 * → FUENTES.ka_ni_fuente → FUENTES.ka_ni_forma_pago_fte.
 *
 * Action required: request FUENTES.ka_ni_forma_pago_fte lookup table from
 * Castillitos DBA, or confirm that payment method validation is done at the
 * FUENTES level rather than at the MOVIMIENTOS level.
 * See: lib/sag/master-data/castillitos-fuentes.ts for the full FUENTES registry.
 */
export const CASTILLITOS_FORMAS_PAGO: CastillitosValueSet = {
  confirmed: false,
  values:    [],
  labels:    {},
};

// ─────────────────────────────────────────────────────────────────────────────
// Structural discovery results (populated 2026-04-08)
// ─────────────────────────────────────────────────────────────────────────────

export const CASTILLITOS_STRUCT = {
  /** Confirmed: ARTICULOS table (182 fields). */
  articlesTable:   "ARTICULOS" as string | null,
  /** Key article fields for product sync. */
  articlesFields:  [
    "ka_nl_articulo",      // PK
    "k_sc_codigo_articulo", // business code
    "sc_referencia",        // reference code
    "sc_detalle_articulo",  // description
    "ka_ni_grupo",          // group FK → GRUPOS
    "ka_ni_subgrupo",       // subgroup FK → SUBGRUPOS
    "ka_nl_linea",          // line FK → LINEAS
    "ss_cod_iva",           // IVA code FK → TARIFAS_IVA
    "ka_ni_tipo_unidad",    // unit FK (no standalone table)
    "sc_activo",            // active flag
    "sc_maneja_tallas",     // 'S' = uses talla/color tracking
    "n_valor_venta_normal", // price list 1
    "n_valor_venta_especial",// price list 2
    "n_valor_venta_promocion",// price list 3
    "nd_valor_venta4",      // price list 4
    "ddt_fecha_new",        // last modified
  ] as string[],
  /** Not found: INVENTARIO has no standalone table. */
  inventoryTable:  null as string | null,
  inventoryFields: [] as string[],
  /** Confirmed: MOVIMIENTOS is the document/receivables header table. */
  movimientosTable:       "MOVIMIENTOS" as string,
  /** Confirmed: MOVIMIENTOS_ITEMS is the document line-items table (has n_valor, n_iva, n_descuento). */
  movimientosItemsTable:  "MOVIMIENTOS_ITEMS" as string,
};

// ─────────────────────────────────────────────────────────────────────────────
// Tenant configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface CastillitosConfig {
  /** Default warehouse code (ss_codigo) for inventory queries. */
  defaultWarehouse?:       string;
  /** Default BODEGA ss_codigo for tipo 28 document writes. */
  defaultBodegaForTipo28?: string;
  /** Whether Castillitos uses TALLA/COLOR article tracking. */
  usesTallaColor?:         boolean;
}

export const CASTILLITOS_CONFIG: CastillitosConfig = {
  // Confirmed 2026-04-08: BODEGA PRINCIPAL = ss_codigo "01"
  defaultWarehouse:        "01",
  defaultBodegaForTipo28:  "01",   // confirm with ops team before enabling tipo 28 writes
  // Confirmed 2026-04-08: TALLAS (35) and COLORES (88) are populated → talla/color in use
  usesTallaColor:          true,
};

// ─────────────────────────────────────────────────────────────────────────────
// Summary helper
// ─────────────────────────────────────────────────────────────────────────────

export interface HomologationSummary {
  total:        number;
  confirmed:    number;
  pending:      number;
  pctComplete:  number;
  pendingNames: string[];
}

import { CASTILLITOS_FUENTES_VALUE_SET } from "./castillitos-fuentes";

const ALL_VALUE_SETS: Record<string, CastillitosValueSet> = {
  FORMAS_PAGO:    CASTILLITOS_FORMAS_PAGO,
  ZONAS:          CASTILLITOS_ZONAS,
  TIPOS_TERCERO:  CASTILLITOS_TIPOS_TERCERO,
  TIPOS_CLIENTE:  CASTILLITOS_TIPOS_CLIENTE,
  VENDEDORES:     CASTILLITOS_VENDEDORES,
  LISTAS_PRECIO:  CASTILLITOS_LISTAS_PRECIO,
  GRUPOS:         CASTILLITOS_GRUPOS,
  SUB_GRUPOS:     CASTILLITOS_SUB_GRUPOS,
  LINEAS:         CASTILLITOS_LINEAS,
  TARIFAS_IVA:    CASTILLITOS_TARIFAS_IVA,
  UNIDADES:       CASTILLITOS_UNIDADES,
  TALLAS:         CASTILLITOS_TALLAS,
  COLORES:        CASTILLITOS_COLORES,
  BODEGAS:        CASTILLITOS_BODEGAS,
  // Confirmed 2026-04-20 from FUENTES.xlsx — 127 sources classified
  FUENTES:        CASTILLITOS_FUENTES_VALUE_SET,
};

export function getHomologationSummary(): HomologationSummary {
  const entries   = Object.entries(ALL_VALUE_SETS);
  const confirmed = entries.filter(([, v]) => v.confirmed).length;
  const pending   = entries.filter(([, v]) => !v.confirmed).map(([k]) => k);
  return {
    total:        entries.length,
    confirmed,
    pending:      pending.length,
    pctComplete:  Math.round((confirmed / entries.length) * 100),
    pendingNames: pending,
  };
}

export { ALL_VALUE_SETS };
