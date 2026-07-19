/**
 * lib/sag/master-data/compatibility-matrix.ts
 *
 * Formal inventory of all SAG master-data fields that affect Agentik flows.
 *
 * For each field we record:
 *   - which SAG operations use it (read / write customer / write product / document)
 *   - whether it is required
 *   - what SAG does when the value is invalid
 *   - whether we should block the enqueue or only warn
 *   - how the value is validated (from Colombian standard, from SAG query, or unknown)
 *   - which values are known safe and which are pending homologation
 *
 * HOW TO READ blockPolicy:
 *   "hard_block"   — we know enough to reject bad values before enqueue
 *   "warn_only"    — we cannot fully validate without Castillitos config data;
 *                    enqueue is allowed but the preview UI shows a warning
 *   "validated_ok" — fully validated at the TypeScript / validator layer already
 *
 * HOW TO READ validationStatus:
 *   "validated"              — known values confirmed, blocking validation active
 *   "known_standard"         — Colombian legal standard; blocking validation active
 *   "pending_homologation"   — valid values depend on Castillitos SAG config;
 *                              must be obtained from DBA or via SAG master query
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type FieldScope =
  | "write_customer"   // SagCustomerInput (tipo 1 / 3)
  | "write_product"    // SagProductInput  (tipo 5)
  | "write_document"   // SagDocumentInput (tipo 2 / 28)
  | "read_customer"    // consultaSagJson TERCEROS
  | "read_receivable"  // consultaSagJson CARTERA
  | "read_product"     // consultaSagJson ARTICULOS
  | "read_inventory"   // consultaSagJson INVENTARIO
  | "read_orders";     // consultaSagJson DOCUMENTOS

export type BlockPolicy =
  | "hard_block"        // blocking error prevents enqueue when value is invalid
  | "warn_only"         // warning shown in preview but enqueue is still allowed
  | "validated_ok";     // already fully validated in the write validator

export type ValidationStatus =
  | "validated"              // confirmed valid value set in code
  | "known_standard"         // follows Colombian law / DIAN standard
  | "pending_homologation";  // must be confirmed with Castillitos DBA / SAG query

export type ValueSource =
  | "CODE_CONST"      // hardcoded in validators (e.g. IVA: 0|5|19)
  | "DIAN_STANDARD"   // DIAN / Colombian legal standard
  | "SAG_QUERY"       // must be fetched from SAG via consultaSagJson master query
  | "CASTILLITOS_DB"  // must be confirmed from Castillitos actual SAG config
  | "UNKNOWN";        // completely unknown until homologation

export interface MasterField {
  id:               string;
  sagField:         string;           // SAG XML / column name (uppercase)
  agentikField:     string;           // camelCase form / normalizer field name
  scope:            FieldScope[];
  required:         boolean;
  description:      string;
  failureMode:      string;           // what happens in SAG if value is invalid
  blockPolicy:      BlockPolicy;
  validationStatus: ValidationStatus;
  valueSource:      ValueSource;
  knownValues:      string[];         // empty = pending homologation
  homologationQuery?: string;         // SQL to run against SAG to discover valid values
  notes:            string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Master field inventory
// ─────────────────────────────────────────────────────────────────────────────

export const MASTER_FIELDS: MasterField[] = [

  // ── Customer fields ─────────────────────────────────────────────────────────

  {
    id:               "tipo_doc",
    sagField:         "TIPO_DOC",
    agentikField:     "tipoDocumento",
    scope:            ["write_customer"],
    required:         false,
    description:      "Tipo de documento de identificación del cliente (NIT, CC, CE, etc.)",
    failureMode:      "SAG rechaza el registro si el tipo no existe en su catálogo interno.",
    blockPolicy:      "hard_block",
    validationStatus: "known_standard",
    valueSource:      "DIAN_STANDARD",
    knownValues:      ["NIT", "CC", "CE", "PPN", "TI", "TE", "RC", "DE", "PA", "CD", "SC", "OT"],
    notes:            "Valores estandarizados por DIAN. Validación activa en master-validation.ts.",
  },

  {
    id:               "codigo_dane_ciudad",
    sagField:         "CODIGO_DANE_CIUDAD",
    agentikField:     "codigoDaneCiudad",
    scope:            ["write_customer"],
    required:         false,
    description:      "Código DANE del municipio del cliente (5 o 6 dígitos).",
    failureMode:      "SAG puede rechazar o ignorar silenciosamente códigos no reconocidos; afecta reportes tributarios.",
    blockPolicy:      "warn_only",
    validationStatus: "pending_homologation",
    valueSource:      "SAG_QUERY",
    knownValues:      [],
    homologationQuery: "SELECT CODIGO_DANE, NOMBRE FROM MUNICIPIOS ORDER BY NOMBRE",
    notes:            "El formato (5-6 dígitos) ya está validado. El valor exacto debe existir en tabla MUNICIPIOS de SAG. Pendiente: confirmar query de tabla.",
  },

  {
    id:               "forma_pago",
    sagField:         "FORMA_PAGO",
    agentikField:     "formaPago",
    scope:            ["write_customer"],
    required:         false,
    description:      "Código de forma de pago asignada al cliente (plazo, contado, crédito 30, etc.).",
    failureMode:      "SAG puede rechazar o asignar forma de pago por defecto si el código no existe.",
    blockPolicy:      "warn_only",
    validationStatus: "pending_homologation",
    valueSource:      "CASTILLITOS_DB",
    knownValues:      [],
    homologationQuery: "SELECT CODIGO, DESCRIPCION FROM FORMAS_PAGO ORDER BY CODIGO",
    notes:            "Códigos varían por instancia SAG. Castillitos debe suministrar su tabla FORMAS_PAGO. Afecta crédito y días de plazo.",
  },

  {
    id:               "zona",
    sagField:         "ZONA",
    agentikField:     "zona",
    scope:            ["write_customer"],
    required:         false,
    description:      "Zona comercial del cliente (para rutas de vendedor y análisis territorial).",
    failureMode:      "SAG puede ignorar o rechazar zonas no registradas. No afecta la operación en SAG pero rompe reportes de cobertura.",
    blockPolicy:      "warn_only",
    validationStatus: "pending_homologation",
    valueSource:      "CASTILLITOS_DB",
    knownValues:      [],
    homologationQuery: "SELECT CODIGO, DESCRIPCION FROM ZONAS ORDER BY CODIGO",
    notes:            "Estructura de zonas específica de Castillitos. Requerir tabla ZONAS.",
  },

  {
    id:               "tipo_tercero",
    sagField:         "TIPO_TERCERO",
    agentikField:     "tipoTercero",
    scope:            ["write_customer"],
    required:         false,
    description:      "Clasificación del tercero en SAG (cliente, proveedor, empleado, etc.).",
    failureMode:      "SAG puede rechazar o usar el tipo por defecto. Afecta workflows contables.",
    blockPolicy:      "warn_only",
    validationStatus: "pending_homologation",
    valueSource:      "CASTILLITOS_DB",
    knownValues:      [],
    homologationQuery: "SELECT CODIGO, DESCRIPCION FROM TIPO_TERCERO ORDER BY CODIGO",
    notes:            "Código SAG específico de la instancia Castillitos. Tabla puede llamarse TIPO_TERCERO o TIPOS_TERCERO.",
  },

  {
    id:               "tipo_cliente",
    sagField:         "TIPO_CLIENTE",
    agentikField:     "tipoCliente",
    scope:            ["write_customer"],
    required:         false,
    description:      "Segmento o tipo de cliente (mayorista, minorista, distribuidor, etc.).",
    failureMode:      "SAG puede rechazar si el código no existe en su tabla. Afecta políticas de precio.",
    blockPolicy:      "warn_only",
    validationStatus: "pending_homologation",
    valueSource:      "CASTILLITOS_DB",
    knownValues:      [],
    homologationQuery: "SELECT CODIGO, DESCRIPCION FROM TIPO_CLIENTE ORDER BY CODIGO",
    notes:            "Directamente ligado a PRECIO_VENTA. Confirmar con Castillitos.",
  },

  {
    id:               "nit_vendedor",
    sagField:         "NIT_VENDEDOR",
    agentikField:     "nitVendedor",
    scope:            ["write_customer"],
    required:         false,
    description:      "NIT del vendedor asignado al cliente. Debe ser un tercero activo en SAG.",
    failureMode:      "SAG rechaza si el NIT vendedor no existe como TERCERO activo. El cliente queda sin vendedor.",
    blockPolicy:      "warn_only",
    validationStatus: "pending_homologation",
    valueSource:      "CASTILLITOS_DB",
    knownValues:      [],
    homologationQuery: "SELECT NIT, NOMBRE FROM TERCEROS WHERE TIPO_TERCERO = 'V' ORDER BY NOMBRE",
    notes:            "El formato NIT ya es validado (9 dígitos). El valor específico debe existir en TERCEROS. Requiere listado de vendedores activos de Castillitos.",
  },

  {
    id:               "precio_venta",
    sagField:         "PRECIO_VENTA",
    agentikField:     "precioVenta",
    scope:            ["write_customer"],
    required:         false,
    description:      "Número de lista de precios asignada al cliente (1–7 típicamente).",
    failureMode:      "SAG puede rechazar o usar precio 1 por defecto si el número no existe. Cliente quedaría en lista de precio incorrecta.",
    blockPolicy:      "warn_only",
    validationStatus: "pending_homologation",
    valueSource:      "CASTILLITOS_DB",
    knownValues:      [],
    homologationQuery: "SELECT DISTINCT LISTA_PRECIO FROM LISTAS_PRECIOS ORDER BY LISTA_PRECIO",
    notes:            "Confirmar cuántas listas de precios tiene Castillitos y cuáles están activas.",
  },

  {
    id:               "responsabilidad_fiscal",
    sagField:         "RESPONSABILIDAD_FISCAL",
    agentikField:     "responsabilidadFiscal",
    scope:            ["write_customer"],
    required:         false,
    description:      "Responsabilidades tributarias del cliente (DIAN códigos de obligaciones fiscales).",
    failureMode:      "SAG puede aceptar valores inválidos pero afectan reportes de retención y facturación electrónica.",
    blockPolicy:      "warn_only",
    validationStatus: "known_standard",
    valueSource:      "DIAN_STANDARD",
    knownValues:      [
      "O-13",   // Gran contribuyente
      "O-15",   // Autorretenedor
      "O-23",   // Agente de retención IVA
      "O-47",   // Régimen simple tributación
      "R-99-PN", // No responsable
      "ZA",     // No responsable de IVA
      "ZD",     // Responsable de IVA
      "ZE",     // No responsable de consumo
      "ZF",     // Responsable de consumo
      "ZG",     // Pertenece a grupo empresarial
      "ZH",     // Establecimiento de comercio
      "ZI",     // Sucursal
      "ZJ",     // Agencia
      "ZW",     // Contribuyente del impuesto unificado
      "ZS",     // Patrimonio autónomo
    ],
    notes:            "Códigos DIAN estándar. Sin embargo, SAG puede tener su propio mapeo interno. Confirmar con Castillitos si SAG usa estos códigos o tiene tabla propia.",
  },

  {
    id:               "iva_responsable",
    sagField:         "IVA",
    agentikField:     "iva",
    scope:            ["write_customer"],
    required:         false,
    description:      "Indica si el cliente es responsable de IVA (S/N).",
    failureMode:      "SAG rechaza valores distintos a S/N.",
    blockPolicy:      "validated_ok",
    validationStatus: "validated",
    valueSource:      "CODE_CONST",
    knownValues:      ["S", "N"],
    notes:            "Ya validado por el validador S/N en validators/index.ts.",
  },

  {
    id:               "retenedor",
    sagField:         "RETENEDOR",
    agentikField:     "retenedor",
    scope:            ["write_customer"],
    required:         false,
    description:      "Indica si el cliente es agente de retención (S/N).",
    failureMode:      "SAG rechaza valores distintos a S/N.",
    blockPolicy:      "validated_ok",
    validationStatus: "validated",
    valueSource:      "CODE_CONST",
    knownValues:      ["S", "N"],
    notes:            "Ya validado por el validador S/N en validators/index.ts.",
  },

  // ── Product fields ───────────────────────────────────────────────────────────

  {
    id:               "grupo",
    sagField:         "GRUPO",
    agentikField:     "grupo",
    scope:            ["write_product", "read_product"],
    required:         false,
    description:      "Grupo de producto en el catálogo SAG de Castillitos.",
    failureMode:      "SAG puede crear el grupo automáticamente (malo: genera grupos huérfanos) o rechazar el artículo.",
    blockPolicy:      "warn_only",
    validationStatus: "pending_homologation",
    valueSource:      "CASTILLITOS_DB",
    knownValues:      [],
    homologationQuery: "SELECT CODIGO, DESCRIPCION FROM GRUPOS_ARTICULOS ORDER BY CODIGO",
    notes:            "Fundamental para la estructura del catálogo. Sin homologación, los artículos quedan mal clasificados.",
  },

  {
    id:               "sub_grupo",
    sagField:         "SUB_GRUPO",
    agentikField:     "subGrupo",
    scope:            ["write_product", "read_product"],
    required:         false,
    description:      "Sub-grupo dentro del grupo de producto.",
    failureMode:      "Mismo comportamiento que GRUPO — puede crear o rechazar.",
    blockPolicy:      "warn_only",
    validationStatus: "pending_homologation",
    valueSource:      "CASTILLITOS_DB",
    knownValues:      [],
    homologationQuery: "SELECT GRUPO, SUB_GRUPO, DESCRIPCION FROM SUB_GRUPOS_ARTICULOS ORDER BY GRUPO, SUB_GRUPO",
    notes:            "Depende de GRUPO. Confirmar estructura jerárquica con Castillitos.",
  },

  {
    id:               "linea",
    sagField:         "LINEA",
    agentikField:     "linea",
    scope:            ["write_product", "read_product"],
    required:         false,
    description:      "Línea de producto (categoría dentro del catálogo).",
    failureMode:      "SAG puede crear la línea o rechazar. Afecta reportes de ventas por línea.",
    blockPolicy:      "warn_only",
    validationStatus: "pending_homologation",
    valueSource:      "CASTILLITOS_DB",
    knownValues:      [],
    homologationQuery: "SELECT CODIGO, DESCRIPCION FROM LINEAS_ARTICULOS ORDER BY CODIGO",
    notes:            "Confirmar si Castillitos usa LINEAS_ARTICULOS o tabla propia.",
  },

  {
    id:               "tarifa_iva",
    sagField:         "TARIFA_IVA",
    agentikField:     "tarifaIVA",
    scope:            ["write_product"],
    required:         false,
    description:      "Código de la tarifa IVA en SAG (ej: IVA19, IVA5, IVA0). Complementa el porcentaje numérico.",
    failureMode:      "SAG puede rechazar o usar tarifa por defecto. Afecta facturación electrónica y reportes tributarios.",
    blockPolicy:      "warn_only",
    validationStatus: "pending_homologation",
    valueSource:      "CASTILLITOS_DB",
    knownValues:      [],
    homologationQuery: "SELECT CODIGO, DESCRIPCION, PORCENTAJE FROM TARIFAS_IVA ORDER BY PORCENTAJE",
    notes:            "Los códigos varían por instancia SAG. Posibles valores: IVA0, IVA5, IVA19 pero deben confirmarse.",
  },

  {
    id:               "porcentaje_iva",
    sagField:         "IVA",
    agentikField:     "porcentajeIVA",
    scope:            ["write_product"],
    required:         false,
    description:      "Porcentaje de IVA del artículo. Solo valores legales colombianos: 0, 5, 19.",
    failureMode:      "SAG rechaza porcentajes distintos a los configurados en TARIFAS_IVA.",
    blockPolicy:      "hard_block",
    validationStatus: "validated",
    valueSource:      "CODE_CONST",
    knownValues:      ["0", "5", "19"],
    notes:            "Ya validado en validators/index.ts (must be 0, 5, or 19). Hard block activo.",
  },

  {
    id:               "unidad",
    sagField:         "UNIDAD",
    agentikField:     "unidad",
    scope:            ["write_product", "write_document"],
    required:         false,
    description:      "Unidad de medida del artículo (UND, KG, LT, CJ, BOL, etc.).",
    failureMode:      "SAG puede rechazar si la unidad no existe en su catálogo. Afecta manejo de inventario.",
    blockPolicy:      "warn_only",
    validationStatus: "known_standard",
    valueSource:      "CASTILLITOS_DB",
    knownValues:      ["UND", "KG", "GR", "LT", "ML", "MT", "CM", "CJ", "BOL", "PAR", "DOC", "TON", "M2", "M3"],
    homologationQuery: "SELECT CODIGO, DESCRIPCION FROM UNIDADES_MEDIDA ORDER BY CODIGO",
    notes:            "UND es el default seguro. Si el artículo usa unidad distinta, confirmar que exista en Castillitos SAG.",
  },

  {
    id:               "talla",
    sagField:         "TALLA",
    agentikField:     "talla",
    scope:            ["write_product"],
    required:         false,
    description:      "Código de talla. Solo relevante si MANEJA_TALLA_COLOR = S.",
    failureMode:      "SAG puede rechazar o crear tallas inconsistentes si el código no existe.",
    blockPolicy:      "warn_only",
    validationStatus: "pending_homologation",
    valueSource:      "CASTILLITOS_DB",
    knownValues:      [],
    homologationQuery: "SELECT CODIGO, DESCRIPCION FROM TALLAS ORDER BY CODIGO",
    notes:            "Solo necesario cuando MANEJA_TALLA_COLOR=S. Confirmar tabla TALLAS con Castillitos.",
  },

  {
    id:               "color",
    sagField:         "COLOR",
    agentikField:     "color",
    scope:            ["write_product"],
    required:         false,
    description:      "Código de color. Solo relevante si MANEJA_TALLA_COLOR = S.",
    failureMode:      "SAG puede rechazar o crear colores inconsistentes si el código no existe.",
    blockPolicy:      "warn_only",
    validationStatus: "pending_homologation",
    valueSource:      "CASTILLITOS_DB",
    knownValues:      [],
    homologationQuery: "SELECT CODIGO, DESCRIPCION FROM COLORES ORDER BY CODIGO",
    notes:            "Solo necesario cuando MANEJA_TALLA_COLOR=S. Confirmar tabla COLORES con Castillitos.",
  },

  {
    id:               "maneja_kardex",
    sagField:         "MANEJA_KARDEX",
    agentikField:     "manejaKardex",
    scope:            ["write_product"],
    required:         false,
    description:      "Controla si el artículo maneja kardex de inventario (S/N). Default S.",
    failureMode:      "SAG rechaza valores distintos a S/N.",
    blockPolicy:      "validated_ok",
    validationStatus: "validated",
    valueSource:      "CODE_CONST",
    knownValues:      ["S", "N"],
    notes:            "Ya validado en validators/index.ts. Default seguro: S.",
  },

  {
    id:               "maneja_talla_color",
    sagField:         "MANEJA_TALLA_COLOR",
    agentikField:     "manejaTallaColor",
    scope:            ["write_product"],
    required:         false,
    description:      "Controla si el artículo tiene variantes por talla/color (S/N). Default N.",
    failureMode:      "SAG rechaza valores distintos a S/N. Si se activa, requiere TALLA y COLOR válidos.",
    blockPolicy:      "validated_ok",
    validationStatus: "validated",
    valueSource:      "CODE_CONST",
    knownValues:      ["S", "N"],
    notes:            "Ya validado. Si S, los campos TALLA y COLOR deben existir en Castillitos SAG.",
  },

  // ── Document fields ─────────────────────────────────────────────────────────

  {
    id:               "bodega",
    sagField:         "BODEGA",
    agentikField:     "bodega",
    scope:            ["write_document", "read_inventory"],
    required:         true,
    description:      "Código de bodega para documentos de inventario (tipo 2 / 28). Requerido en líneas de documento.",
    failureMode:      "SAG rechaza documentos con bodegas inexistentes. Falla crítica en movimientos de inventario.",
    blockPolicy:      "hard_block",
    validationStatus: "pending_homologation",
    valueSource:      "CASTILLITOS_DB",
    knownValues:      [],
    homologationQuery: "SELECT CODIGO, DESCRIPCION, ACTIVO FROM BODEGAS ORDER BY CODIGO",
    notes:            "BLOQUEADOR CRÍTICO para tipo 2/28. Los documentos no se pueden crear sin bodega válida. Primer dato a confirmar con Castillitos.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Derived views
// ─────────────────────────────────────────────────────────────────────────────

/** Fields that block enqueue when value is invalid */
export const HARD_BLOCK_FIELDS = MASTER_FIELDS.filter(f => f.blockPolicy === "hard_block");

/** Fields requiring homologation before safe production use */
export const PENDING_HOMOLOGATION = MASTER_FIELDS.filter(f => f.validationStatus === "pending_homologation");

/** Fields with known-safe values (standard or fully validated) */
export const VALIDATED_FIELDS = MASTER_FIELDS.filter(f =>
  f.validationStatus === "validated" || f.validationStatus === "known_standard"
);

/** Fields relevant to customer writes */
export const CUSTOMER_FIELDS = MASTER_FIELDS.filter(f => f.scope.includes("write_customer"));

/** Fields relevant to product writes */
export const PRODUCT_FIELDS = MASTER_FIELDS.filter(f => f.scope.includes("write_product"));

/** Fields relevant to document writes */
export const DOCUMENT_FIELDS = MASTER_FIELDS.filter(f => f.scope.includes("write_document"));

/** Return the matrix as a plain text table for logging / report output */
export function renderCompatibilityTable(): string {
  const rows = MASTER_FIELDS.map(f => ({
    Campo:       f.sagField,
    Uso:         f.scope.map(s => s.replace("write_", "W:").replace("read_", "R:")).join(", "),
    Requerido:   f.required ? "SÍ" : "No",
    Bloqueo:     f.blockPolicy,
    Estado:      f.validationStatus,
    Fuente:      f.valueSource,
    ValoresConocidos: f.knownValues.length > 0 ? `${f.knownValues.length} valores` : "PENDIENTE",
  }));

  const header = ["Campo", "Uso", "Req.", "Bloqueo", "Estado", "Fuente", "Valores"];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map(r => Object.values(r)[i].length)));
  const sep = widths.map(w => "-".repeat(w)).join("-+-");
  const fmt = (row: string[]) => row.map((c, i) => c.padEnd(widths[i])).join(" | ");

  return [
    fmt(header),
    sep,
    ...rows.map(r => fmt(Object.values(r) as string[])),
  ].join("\n");
}

/** Group homologation queries by domain for reporting */
export function getHomologationQueries(): Record<string, { field: string; sagField: string; query: string }[]> {
  const out: Record<string, { field: string; sagField: string; query: string }[]> = {
    customers: [],
    products:  [],
    documents: [],
  };
  for (const f of MASTER_FIELDS) {
    if (!f.homologationQuery) continue;
    const domains = f.scope.includes("write_customer") ? ["customers"]
      : f.scope.includes("write_product") ? ["products"]
      : f.scope.includes("write_document") ? ["documents"]
      : [];
    for (const d of domains) {
      out[d].push({ field: f.id, sagField: f.sagField, query: f.homologationQuery });
    }
  }
  return out;
}
