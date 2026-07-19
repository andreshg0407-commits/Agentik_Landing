/**
 * accounting-taxonomy.ts
 *
 * Colombian PUC (Plan Único de Cuentas — Decreto 2649/93) taxonomy for the
 * Agentik accounting classification layer.
 *
 * Philosophy:
 *  - All codes are advisory: a real accountant confirms before posting.
 *  - The taxonomy is intentionally isolated here so it can be overridden
 *    per-organization without touching classifier logic.
 *  - Categories map 1-to-1 to PUC top-level accounts for V1 simplicity.
 *    Sub-accounts (5105 vs 5130 vs 5165) will be configurable in V2.
 */

// ── Category type ─────────────────────────────────────────────────────────────

export type AccountingCategory =
  | "INGRESO"             // 4135 — ventas de mercancías
  | "DEVOLUCION"          // 4175 — devoluciones en ventas / notas crédito
  | "COSTO"               // 6135 — costo de ventas
  | "GASTO_OPERATIVO"     // 5195 — gastos operativos
  | "GASTO_NOMINA"        // 5105 — sueldos y salarios
  | "BANCO"               // 1110 — bancos cuenta corriente
  | "CARTERA"             // 1305 — clientes nacionales
  | "PROVEEDOR"           // 2205 — proveedores nacionales
  | "IMPUESTO_IVA"        // 2408 — IVA por pagar
  | "IMPUESTO_RETENCION"  // 2365 — retención en la fuente
  | "ANTICIPO"            // 1330 — anticipos y avances
  | "AJUSTE"              // 1295 — ajuste / soporte contable
  | "SIN_CLASIFICAR";     // 0000 — no se pudo clasificar con certeza

// ── Account entry ─────────────────────────────────────────────────────────────

export interface AccountEntry {
  /** PUC account code (illustrative — configure per organization). */
  code:         string;
  /** Human-readable description in Spanish. */
  description:  string;
  /** Normal balance nature in double-entry accounting. */
  nature:       "DEBITO" | "CREDITO" | "AMBOS";
  /** Whether this account requires special tax review before posting. */
  taxSensitive: boolean;
  /** PUC class (1=activo, 2=pasivo, 3=patrimonio, 4=ingreso, 5=gasto, 6=costo) */
  pucClass:     "1" | "2" | "3" | "4" | "5" | "6" | "0";
}

// ── Chart of accounts (V1 — single suggested account per category) ────────────

export const CHART_OF_ACCOUNTS: Record<AccountingCategory, AccountEntry> = {
  INGRESO: {
    code:         "4135",
    description:  "Comercio al por mayor y al por menor",
    nature:       "CREDITO",
    taxSensitive: true,
    pucClass:     "4",
  },
  DEVOLUCION: {
    code:         "4175",
    description:  "Devoluciones en ventas",
    nature:       "DEBITO",
    taxSensitive: true,
    pucClass:     "4",
  },
  COSTO: {
    code:         "6135",
    description:  "Costo de ventas — mercancías",
    nature:       "DEBITO",
    taxSensitive: false,
    pucClass:     "6",
  },
  GASTO_OPERATIVO: {
    code:         "5195",
    description:  "Gastos operativos diversos",
    nature:       "DEBITO",
    taxSensitive: false,
    pucClass:     "5",
  },
  GASTO_NOMINA: {
    code:         "5105",
    description:  "Sueldos y salarios",
    nature:       "DEBITO",
    taxSensitive: true,
    pucClass:     "5",
  },
  BANCO: {
    code:         "1110",
    description:  "Bancos — cuenta corriente",
    nature:       "AMBOS",
    taxSensitive: false,
    pucClass:     "1",
  },
  CARTERA: {
    code:         "1305",
    description:  "Clientes — cartera nacional",
    nature:       "DEBITO",
    taxSensitive: false,
    pucClass:     "1",
  },
  PROVEEDOR: {
    code:         "2205",
    description:  "Proveedores nacionales",
    nature:       "CREDITO",
    taxSensitive: true,
    pucClass:     "2",
  },
  IMPUESTO_IVA: {
    code:         "2408",
    description:  "IVA por pagar",
    nature:       "CREDITO",
    taxSensitive: true,
    pucClass:     "2",
  },
  IMPUESTO_RETENCION: {
    code:         "2365",
    description:  "Retención en la fuente por pagar",
    nature:       "CREDITO",
    taxSensitive: true,
    pucClass:     "2",
  },
  ANTICIPO: {
    code:         "1330",
    description:  "Anticipos y avances a proveedores",
    nature:       "DEBITO",
    taxSensitive: false,
    pucClass:     "1",
  },
  AJUSTE: {
    code:         "1295",
    description:  "Ajuste contable — soporte",
    nature:       "AMBOS",
    taxSensitive: false,
    pucClass:     "1",
  },
  SIN_CLASIFICAR: {
    code:         "0000",
    description:  "Sin clasificar — requiere revisión manual",
    nature:       "AMBOS",
    taxSensitive: false,
    pucClass:     "0",
  },
};

// ── Labels ────────────────────────────────────────────────────────────────────

export const CATEGORY_LABEL: Record<AccountingCategory, string> = {
  INGRESO:            "Ingreso",
  DEVOLUCION:         "Devolución",
  COSTO:              "Costo",
  GASTO_OPERATIVO:    "Gasto Operativo",
  GASTO_NOMINA:       "Gasto Nómina",
  BANCO:              "Banco",
  CARTERA:            "Cartera",
  PROVEEDOR:          "Proveedor",
  IMPUESTO_IVA:       "IVA",
  IMPUESTO_RETENCION: "Retención",
  ANTICIPO:           "Anticipo",
  AJUSTE:             "Ajuste",
  SIN_CLASIFICAR:     "Sin clasificar",
};

/** Colour palette for the UI — one set per category. */
export const CATEGORY_STYLE: Record<AccountingCategory, {
  color: string; bg: string; border: string;
}> = {
  INGRESO:            { color: "#2e7d32", bg: "#e8f5e9", border: "#a5d6a7" },
  DEVOLUCION:         { color: "#c62828", bg: "#fce4ec", border: "#ef9a9a" },
  COSTO:              { color: "#e65100", bg: "#fff3e0", border: "#ffcc80" },
  GASTO_OPERATIVO:    { color: "#6a1b9a", bg: "#f3e5f5", border: "#ce93d8" },
  GASTO_NOMINA:       { color: "#4527a0", bg: "#ede7f6", border: "#b39ddb" },
  BANCO:              { color: "#1565c0", bg: "#e3f2fd", border: "#90caf9" },
  CARTERA:            { color: "#0277bd", bg: "#e1f5fe", border: "#81d4fa" },
  PROVEEDOR:          { color: "#5d4037", bg: "#efebe9", border: "#bcaaa4" },
  IMPUESTO_IVA:       { color: "#f57f17", bg: "#fff8e1", border: "#ffe082" },
  IMPUESTO_RETENCION: { color: "#f9a825", bg: "#fff9c4", border: "#fff176" },
  ANTICIPO:           { color: "#00695c", bg: "#e0f2f1", border: "#80cbc4" },
  AJUSTE:             { color: "#37474f", bg: "#eceff1", border: "#b0bec5" },
  SIN_CLASIFICAR:     { color: "#757575", bg: "#f5f5f5", border: "#e0e0e0" },
};

// ── Confidence thresholds ─────────────────────────────────────────────────────

/** Documents at or above this score are auto-approved (green). */
export const AUTO_APPROVE_THRESHOLD = 75;
/** Documents below this score always require review. */
export const REQUIRE_REVIEW_THRESHOLD = 60;
