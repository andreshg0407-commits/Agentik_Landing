/**
 * lib/financial/source-registry.ts
 *
 * THE OFFICIAL FINANCIAL SOURCE REGISTRY for Agentik.
 *
 * This is the ONLY safe way to classify SAG/PYA financial sources.
 *
 * Canonical architecture defined in:
 *   FINANCIAL_SOURCE_INTELLIGENCE_MAP.md
 *   FINANCIAL_SOURCE_RELATIONSHIPS.md
 *
 * ── Design rules ─────────────────────────────────────────────────────────────
 *
 *   1. All financial queries MUST consume source groups from this file.
 *   2. Never hardcode ["FE", "FD", ...] in a query — import AR_CREATION_SOURCES.
 *   3. Never hardcode ["R1", "R2", ...] in a query — import COLLECTION_SOURCES.
 *   4. PENDING_DEPOSIT_SOURCES must NEVER be counted as confirmed cobros.
 *   5. REVENUE_ADJ_SOURCES reduce AR — they are NOT cash receipts.
 *
 * ── Relationship to existing files ───────────────────────────────────────────
 *
 *   lib/castillitos/cash-sources.ts        — Deep cash metadata (R1/R2/A1/A2/AN/Bx).
 *                                            Registry is authoritative for allowlists;
 *                                            cash-sources.ts provides extended flags.
 *   lib/sag/master-data/source-semantic-rules.ts — Per-source FUENTES classification.
 *                                            Migrate CODIGOS_* constants to import here.
 *   lib/finance/cobros-kpis.ts             — Migrated: COBRO_CODES → COLLECTION_SOURCES.
 *   lib/sales/source-rules.ts             — FUENTE_1/F2 sagSourceType layer (orthogonal).
 *
 * ── Source key ───────────────────────────────────────────────────────────────
 *
 *   k_sc_codigo_fuente = business code (FE, R1, C1, ...) — use for filters.
 *   ka_ni_fuente       = SAG numeric row ID — traceability only.
 */

// ── Canonical types ───────────────────────────────────────────────────────────

/**
 * Financial domain — what type of financial event a source code represents.
 *
 * These map to accounting primitives, not SAG classifications.
 */
export type FinancialDomain =
  | "REVENUE"            // Creates accounts receivable. Legal billing event.
  | "COLLECTION"         // Reduces accounts receivable. Cash confirmed received.
  | "ADVANCE_CLIENT"     // Client prepayment. Liability until applied to invoice.
  | "REVENUE_ADJ"        // Modifies AR: credit notes, returns, payment discounts.
  | "ACCOUNTS_PAYABLE"   // Creates supplier or expense obligation (CxP).
  | "AP_REDUCTION"       // Reduces CxP: purchase returns, expense reversals.
  | "EXPENSE"            // Operational cash outflow or accrued cost.
  | "ADVANCE_SUPPLIER"   // Supplier prepayment. Asset until matched to purchase.
  | "TREASURY"           // Cash movement not tied to specific AR/AP.
  | "PENDING_DEPOSIT"    // Unidentified cash received. Awaiting bank reconciliation.
  | "COMMERCIAL"         // Pre-revenue. Orders, pipeline. No AR/AP impact.
  | "PAYROLL"            // Labor cost accrual or provision.
  | "INVENTORY"          // Internal stock movement. No AR/AP impact.
  | "ACCOUNTING"         // Internal accounting correction. Audit trail only.
  | "PRODUCTION"         // Manufacturing process. Production module only.
  | "LEGACY"             // Historical only. Read-only for balance queries.
  | "IGNORE";            // Eliminate from all pipelines.

/**
 * Operational priority for this sprint.
 *
 *   CORE          — Required for AR, Revenue, Collections, AP, Treasury cards. Import now.
 *   IMPORTANT     — Modifies CORE sources (returns, credit notes, adjustments). Import now.
 *   SECONDARY     — Operational but not executive-critical. Import when module activates.
 *   ACCOUNTING_ONLY — Internal adjustments. Audit trail only. Not in executive dashboard.
 *   IGNORE_V1     — Do not import: ARKETOPS, N/A eliminated, historical, production.
 */
export type FinancialPriority =
  | "CORE"
  | "IMPORTANT"
  | "SECONDARY"
  | "ACCOUNTING_ONLY"
  | "IGNORE_V1";

/**
 * Data trust state — how reliable is this source's value for executive KPIs.
 *
 *   LIVE      — Real-time SAG feed. No reconciliation gap.
 *   PARTIAL   — SAG-registered but pending bank confirmation.
 *   PENDING   — Registered but not yet matched to counterpart document.
 *   ESTIMATED — Computed from unreconciled inputs (ratio, projection).
 */
export type FinancialTrustState =
  | "LIVE"
  | "PARTIAL"
  | "PENDING"
  | "ESTIMATED";

/**
 * Which executive dashboard blocks this source feeds.
 *
 *   B1 — Centro de Mando Diario (daily KPIs)
 *   B2 — Cartera y Riesgo (AR aging)
 *   B3 — Tesorería Operativa (CxP, treasury)
 *   B4 — Radar Comercial Ejecutivo (cobros, revenue trend)
 */
export type DashboardBlock = "B1" | "B2" | "B3" | "B4";

// ── Source metadata interface ─────────────────────────────────────────────────

/** Full financial classification metadata for one SAG source code. */
export interface FinancialSourceMetadata {
  /** Business code (k_sc_codigo_fuente). Used in ALL filters. */
  readonly code:           string;
  /** SAG numeric row ID (ka_ni_fuente). Traceability only. */
  readonly kaNiFuente:     number | null;
  /** Descriptive name. */
  readonly name:           string;
  /** Financial domain — what type of event this source creates. */
  readonly domain:         FinancialDomain;
  /** V1 operational priority. */
  readonly priority:       FinancialPriority;
  /** Trust state for executive display. */
  readonly trust:          FinancialTrustState;
  /** Belongs to F1 official track. */
  readonly f1Track:        boolean;
  /** Belongs to F2 non-official track. */
  readonly f2Track:        boolean;
  /** Creates accounts receivable entry. */
  readonly createsAR:      boolean;
  /** Reduces accounts receivable entry. */
  readonly reducesAR:      boolean;
  /** Creates accounts payable entry. */
  readonly createsAP:      boolean;
  /** Reduces accounts payable entry. */
  readonly reducesAP:      boolean;
  /** Represents cash received (positive treasury event). */
  readonly cashInflow:     boolean;
  /** Represents cash disbursed (negative treasury event). */
  readonly cashOutflow:    boolean;
  /** Should be shown in CEO-facing executive headline. */
  readonly ceoVisible:     boolean;
  /** MUST NEVER be counted as a confirmed cobro (unidentified). */
  readonly neverCountAsCobro: boolean;
  /** Dashboard blocks this source feeds. */
  readonly feedsBlocks:    readonly DashboardBlock[];
  /** Canonical note from FIN-01 intelligence map. */
  readonly note:           string;
}

// ── Full source metadata registry ────────────────────────────────────────────

/**
 * The canonical metadata for all V1 active financial sources.
 *
 * Sources with priority IGNORE_V1 are NOT included here.
 * They are listed in IGNORE_CODES below.
 *
 * Key: k_sc_codigo_fuente (business code).
 */
export const SOURCE_METADATA: Readonly<Record<string, FinancialSourceMetadata>> = {

  // ── Revenue F1 — Creates AR ─────────────────────────────────────────────────

  FE: {
    code: "FE", kaNiFuente: 101, name: "Factura Electrónica Empresa",
    domain: "REVENUE", priority: "CORE", trust: "LIVE",
    f1Track: true, f2Track: false,
    createsAR: true, reducesAR: false, createsAP: false, reducesAP: false,
    cashInflow: false, cashOutflow: false, ceoVisible: true, neverCountAsCobro: false,
    feedsBlocks: ["B1", "B2", "B4"],
    note: "Factura electrónica oficial empresa. Fuente primaria de AR y revenue F1.",
  },
  FD: {
    code: "FD", kaNiFuente: 175, name: "Factura Electrónica San Diego",
    domain: "REVENUE", priority: "CORE", trust: "LIVE",
    f1Track: true, f2Track: false,
    createsAR: true, reducesAR: false, createsAP: false, reducesAP: false,
    cashInflow: false, cashOutflow: false, ceoVisible: true, neverCountAsCobro: false,
    feedsBlocks: ["B1", "B2", "B4"],
    note: "Factura oficial almacén San Diego.",
  },
  FC: {
    code: "FC", kaNiFuente: 176, name: "Factura Electrónica Centro",
    domain: "REVENUE", priority: "CORE", trust: "LIVE",
    f1Track: true, f2Track: false,
    createsAR: true, reducesAR: false, createsAP: false, reducesAP: false,
    cashInflow: false, cashOutflow: false, ceoVisible: true, neverCountAsCobro: false,
    feedsBlocks: ["B1", "B2", "B4"],
    note: "Factura oficial almacén Centro.",
  },
  FG: {
    code: "FG", kaNiFuente: 177, name: "Factura Electrónica Gran Plaza",
    domain: "REVENUE", priority: "CORE", trust: "LIVE",
    f1Track: true, f2Track: false,
    createsAR: true, reducesAR: false, createsAP: false, reducesAP: false,
    cashInflow: false, cashOutflow: false, ceoVisible: true, neverCountAsCobro: false,
    feedsBlocks: ["B1", "B2", "B4"],
    note: "Factura oficial almacén Gran Plaza.",
  },
  FA: {
    code: "FA", kaNiFuente: 194, name: "Factura Electrónica Caldas",
    domain: "REVENUE", priority: "CORE", trust: "LIVE",
    f1Track: true, f2Track: false,
    createsAR: true, reducesAR: false, createsAP: false, reducesAP: false,
    cashInflow: false, cashOutflow: false, ceoVisible: true, neverCountAsCobro: false,
    feedsBlocks: ["B1", "B2", "B4"],
    note: "Factura oficial almacén Caldas.",
  },
  FW: {
    code: "FW", kaNiFuente: 207, name: "Factura Electrónica Web",
    domain: "REVENUE", priority: "CORE", trust: "LIVE",
    f1Track: true, f2Track: false,
    createsAR: true, reducesAR: false, createsAP: false, reducesAP: false,
    cashInflow: false, cashOutflow: false, ceoVisible: true, neverCountAsCobro: false,
    feedsBlocks: ["B1", "B2", "B4"],
    note: "Factura oficial canal e-commerce.",
  },

  // ── Revenue F2 — Non-official track ────────────────────────────────────────

  F2: {
    code: "F2", kaNiFuente: 2, name: "Remisión (F2)",
    domain: "REVENUE", priority: "IMPORTANT", trust: "PARTIAL",
    f1Track: false, f2Track: true,
    createsAR: true, reducesAR: false, createsAP: false, reducesAP: false,
    cashInflow: false, cashOutflow: false, ceoVisible: false, neverCountAsCobro: false,
    feedsBlocks: ["B4"],
    note: "Remisión empresa F2. AR no oficial. Track separado de F1. No mezclar con cartera F1.",
  },

  // ── Collections — Reduces AR ────────────────────────────────────────────────

  R1: {
    code: "R1", kaNiFuente: 4, name: "Recibo de Caja F1 Empresa",
    domain: "COLLECTION", priority: "CORE", trust: "PENDING",
    f1Track: true, f2Track: false,
    createsAR: false, reducesAR: true, createsAP: false, reducesAP: false,
    cashInflow: true, cashOutflow: false, ceoVisible: true, neverCountAsCobro: false,
    feedsBlocks: ["B1", "B4"],
    note: "Cobro oficial F1. Impacta recaudo real y flujo de caja. Pendiente conciliación bancaria.",
  },
  RS: {
    code: "RS", kaNiFuente: 108, name: "Recibo de Caja San Diego",
    domain: "COLLECTION", priority: "CORE", trust: "PENDING",
    f1Track: true, f2Track: false,
    createsAR: false, reducesAR: true, createsAP: false, reducesAP: false,
    cashInflow: true, cashOutflow: false, ceoVisible: true, neverCountAsCobro: false,
    feedsBlocks: ["B1", "B4"],
    note: "Cobro POS almacén San Diego. Conciliar con Sistecredit a fin de mes.",
  },
  RC: {
    code: "RC", kaNiFuente: 174, name: "Recibo de Caja Centro",
    domain: "COLLECTION", priority: "CORE", trust: "PENDING",
    f1Track: true, f2Track: false,
    createsAR: false, reducesAR: true, createsAP: false, reducesAP: false,
    cashInflow: true, cashOutflow: false, ceoVisible: true, neverCountAsCobro: false,
    feedsBlocks: ["B1", "B4"],
    note: "Abono Sistecredit tienda Centro. Informativo — conciliar mensualmente con Sistecredit.",
  },
  RG: {
    code: "RG", kaNiFuente: 178, name: "Recibo de Caja Gran Plaza",
    domain: "COLLECTION", priority: "CORE", trust: "PENDING",
    f1Track: true, f2Track: false,
    createsAR: false, reducesAR: true, createsAP: false, reducesAP: false,
    cashInflow: true, cashOutflow: false, ceoVisible: true, neverCountAsCobro: false,
    feedsBlocks: ["B1", "B4"],
    note: "Abono Sistecredit tienda Gran Plaza. Conciliar mensualmente.",
  },
  RA: {
    code: "RA", kaNiFuente: 198, name: "Recibo de Caja Caldas",
    domain: "COLLECTION", priority: "CORE", trust: "PENDING",
    f1Track: true, f2Track: false,
    createsAR: false, reducesAR: true, createsAP: false, reducesAP: false,
    cashInflow: true, cashOutflow: false, ceoVisible: true, neverCountAsCobro: false,
    feedsBlocks: ["B1", "B4"],
    note: "Abono Sistecredit tienda Caldas. Conciliar mensualmente.",
  },
  AN: {
    code: "AN", kaNiFuente: 12, name: "Anticipos Clientes Sistecredit",
    domain: "ADVANCE_CLIENT", priority: "CORE", trust: "PENDING",
    f1Track: true, f2Track: false,
    createsAR: false, reducesAR: false, createsAP: false, reducesAP: false,
    cashInflow: true, cashOutflow: false, ceoVisible: true, neverCountAsCobro: false,
    feedsBlocks: ["B1", "B4"],
    note: "Anticipo Sistecredit tiendas. Efectivo en el momento. Conciliar mensualmente. NO aplicar a AR hasta liquidación Sistecredit.",
  },
  A1: {
    code: "A1", kaNiFuente: 122, name: "Anticipo Cliente Empresa",
    domain: "ADVANCE_CLIENT", priority: "CORE", trust: "PENDING",
    f1Track: true, f2Track: false,
    createsAR: false, reducesAR: false, createsAP: false, reducesAP: false,
    cashInflow: true, cashOutflow: false, ceoVisible: true, neverCountAsCobro: false,
    feedsBlocks: ["B1", "B4"],
    note: "Anticipo oficial cliente empresa. Caja sí. AR reducida SOLO al cruzar con factura F1.",
  },
  R2: {
    code: "R2", kaNiFuente: 94, name: "Recibo de Caja F2",
    domain: "COLLECTION", priority: "IMPORTANT", trust: "PENDING",
    f1Track: false, f2Track: true,
    createsAR: false, reducesAR: true, createsAP: false, reducesAP: false,
    cashInflow: true, cashOutflow: false, ceoVisible: false, neverCountAsCobro: false,
    feedsBlocks: ["B4"],
    note: "Cobro F2. Track separado. NO mezclar con R1 ni con cartera F1.",
  },
  A2: {
    code: "A2", kaNiFuente: 128, name: "Anticipo Cliente F2",
    domain: "ADVANCE_CLIENT", priority: "IMPORTANT", trust: "PENDING",
    f1Track: false, f2Track: true,
    createsAR: false, reducesAR: false, createsAP: false, reducesAP: false,
    cashInflow: true, cashOutflow: false, ceoVisible: false, neverCountAsCobro: false,
    feedsBlocks: ["B4"],
    note: "Anticipo F2. Caja sí. NO cruzar con AR F1.",
  },

  // ── Revenue Adjustments — Modifies AR ──────────────────────────────────────

  NC: {
    code: "NC", kaNiFuente: 139, name: "Nota Crédito Electrónica Empresa",
    domain: "REVENUE_ADJ", priority: "IMPORTANT", trust: "LIVE",
    f1Track: true, f2Track: false,
    createsAR: false, reducesAR: true, createsAP: false, reducesAP: false,
    cashInflow: false, cashOutflow: false, ceoVisible: false, neverCountAsCobro: true,
    feedsBlocks: ["B2"],
    note: "Reduce facturación F1. NO es cobro. NO es ingreso. Ajuste fiscal — reduce AR.",
  },
  NE: {
    code: "NE", kaNiFuente: 102, name: "Nota Crédito Electrónica",
    domain: "REVENUE_ADJ", priority: "IMPORTANT", trust: "LIVE",
    f1Track: true, f2Track: false,
    createsAR: false, reducesAR: true, createsAP: false, reducesAP: false,
    cashInflow: false, cashOutflow: false, ceoVisible: false, neverCountAsCobro: true,
    feedsBlocks: ["B2"],
    note: "Nota crédito F1 empresa. Reduce AR.",
  },
  ND: {
    code: "ND", kaNiFuente: 170, name: "Nota Crédito — Descuentos Financieros",
    domain: "REVENUE_ADJ", priority: "IMPORTANT", trust: "LIVE",
    f1Track: true, f2Track: false,
    createsAR: false, reducesAR: true, createsAP: false, reducesAP: false,
    cashInflow: false, cashOutflow: false, ceoVisible: false, neverCountAsCobro: true,
    feedsBlocks: ["B2", "B4"],
    note: "CRITICAL: Descuento financiero aplicado al pago. Reduce AR pero NO ES EFECTIVO RECIBIDO. Nunca sumar a cobros cash.",
  },
  NF: {
    code: "NF", kaNiFuente: 171, name: "Nota Crédito — Devoluciones Clientes",
    domain: "REVENUE_ADJ", priority: "IMPORTANT", trust: "LIVE",
    f1Track: true, f2Track: false,
    createsAR: false, reducesAR: true, createsAP: false, reducesAP: false,
    cashInflow: false, cashOutflow: false, ceoVisible: false, neverCountAsCobro: true,
    feedsBlocks: ["B2"],
    note: "Devolución cliente empresa. Reduce AR y revenue F1. Aumenta inventario.",
  },
  NA: {
    code: "NA", kaNiFuente: 196, name: "Nota Crédito Caldas",
    domain: "REVENUE_ADJ", priority: "IMPORTANT", trust: "LIVE",
    f1Track: true, f2Track: false,
    createsAR: false, reducesAR: true, createsAP: false, reducesAP: false,
    cashInflow: false, cashOutflow: false, ceoVisible: false, neverCountAsCobro: true,
    feedsBlocks: ["B2"],
    note: "Nota crédito almacén Caldas — devoluciones clientes.",
  },
  NG: {
    code: "NG", kaNiFuente: 197, name: "Nota Crédito Gran Plaza",
    domain: "REVENUE_ADJ", priority: "IMPORTANT", trust: "LIVE",
    f1Track: true, f2Track: false,
    createsAR: false, reducesAR: true, createsAP: false, reducesAP: false,
    cashInflow: false, cashOutflow: false, ceoVisible: false, neverCountAsCobro: true,
    feedsBlocks: ["B2"],
    note: "Nota crédito almacén Gran Plaza — devoluciones clientes.",
  },
  NS: {
    code: "NS", kaNiFuente: 200, name: "Nota Crédito San Diego",
    domain: "REVENUE_ADJ", priority: "IMPORTANT", trust: "LIVE",
    f1Track: true, f2Track: false,
    createsAR: false, reducesAR: true, createsAP: false, reducesAP: false,
    cashInflow: false, cashOutflow: false, ceoVisible: false, neverCountAsCobro: true,
    feedsBlocks: ["B2"],
    note: "Nota crédito almacén San Diego — devoluciones clientes.",
  },
  NT: {
    code: "NT", kaNiFuente: 202, name: "Nota Crédito Centro",
    domain: "REVENUE_ADJ", priority: "IMPORTANT", trust: "LIVE",
    f1Track: true, f2Track: false,
    createsAR: false, reducesAR: true, createsAP: false, reducesAP: false,
    cashInflow: false, cashOutflow: false, ceoVisible: false, neverCountAsCobro: true,
    feedsBlocks: ["B2"],
    note: "Nota crédito almacén Centro — devoluciones clientes.",
  },
  NW: {
    code: "NW", kaNiFuente: 208, name: "Nota Crédito Web",
    domain: "REVENUE_ADJ", priority: "IMPORTANT", trust: "LIVE",
    f1Track: true, f2Track: false,
    createsAR: false, reducesAR: true, createsAP: false, reducesAP: false,
    cashInflow: false, cashOutflow: false, ceoVisible: false, neverCountAsCobro: true,
    feedsBlocks: ["B2"],
    note: "Nota crédito canal web.",
  },
  D2: {
    code: "D2", kaNiFuente: 98, name: "Devolución Ventas F2",
    domain: "REVENUE_ADJ", priority: "IMPORTANT", trust: "LIVE",
    f1Track: false, f2Track: true,
    createsAR: false, reducesAR: true, createsAP: false, reducesAP: false,
    cashInflow: false, cashOutflow: false, ceoVisible: false, neverCountAsCobro: true,
    feedsBlocks: ["B4"],
    note: "Devolución F2. Reduce AR F2 y aumenta inventario. NO afecta cartera F1.",
  },

  // ── Accounts Payable ───────────────────────────────────────────────────────

  C1: {
    code: "C1", kaNiFuente: 1, name: "Factura de Compra F1",
    domain: "ACCOUNTS_PAYABLE", priority: "CORE", trust: "LIVE",
    f1Track: true, f2Track: false,
    createsAR: false, reducesAR: false, createsAP: true, reducesAP: false,
    cashInflow: false, cashOutflow: false, ceoVisible: false, neverCountAsCobro: false,
    feedsBlocks: ["B3"],
    note: "Factura compra oficial. Genera CxP con proveedor. Afecta inventario al recibir.",
  },
  G1: {
    code: "G1", kaNiFuente: 10, name: "Gastos Causados",
    domain: "ACCOUNTS_PAYABLE", priority: "CORE", trust: "LIVE",
    f1Track: true, f2Track: false,
    createsAR: false, reducesAR: false, createsAP: true, reducesAP: false,
    cashInflow: false, cashOutflow: false, ceoVisible: false, neverCountAsCobro: false,
    feedsBlocks: ["B3"],
    note: "Gasto reconocido contablemente ANTES del pago. Genera CxP — afecta utilidad aunque no haya salida de caja aún.",
  },
  C2: {
    code: "C2", kaNiFuente: 95, name: "Factura de Compras F2",
    domain: "ACCOUNTS_PAYABLE", priority: "IMPORTANT", trust: "LIVE",
    f1Track: false, f2Track: true,
    createsAR: false, reducesAR: false, createsAP: true, reducesAP: false,
    cashInflow: false, cashOutflow: false, ceoVisible: false, neverCountAsCobro: false,
    feedsBlocks: ["B3"],
    note: "Compra F2 que genera CxP. Track separado de C1.",
  },
  DC: {
    code: "DC", kaNiFuente: 27, name: "Devolución Compras",
    domain: "AP_REDUCTION", priority: "IMPORTANT", trust: "LIVE",
    f1Track: true, f2Track: false,
    createsAR: false, reducesAR: false, createsAP: false, reducesAP: true,
    cashInflow: false, cashOutflow: false, ceoVisible: false, neverCountAsCobro: false,
    feedsBlocks: ["B3"],
    note: "Devolución de compras oficiales. Reduce CxP con proveedor.",
  },
  DG: {
    code: "DG", kaNiFuente: 130, name: "Devolución Gastos",
    domain: "AP_REDUCTION", priority: "IMPORTANT", trust: "LIVE",
    f1Track: true, f2Track: false,
    createsAR: false, reducesAR: false, createsAP: false, reducesAP: true,
    cashInflow: false, cashOutflow: false, ceoVisible: false, neverCountAsCobro: false,
    feedsBlocks: ["B3"],
    note: "Reversión de gastos causados. Reduce CxP en positivo.",
  },

  // ── Treasury ──────────────────────────────────────────────────────────────

  DB: {
    code: "DB", kaNiFuente: 21, name: "Notas Débito Bancarias",
    domain: "TREASURY", priority: "IMPORTANT", trust: "PARTIAL",
    f1Track: false, f2Track: false,
    createsAR: false, reducesAR: false, createsAP: false, reducesAP: false,
    cashInflow: false, cashOutflow: true, ceoVisible: false, neverCountAsCobro: false,
    feedsBlocks: ["B3"],
    note: "Débito bancario: comisión, cargo automático. Reduce caja. Sin AR/AP.",
  },
  "1V": {
    code: "1V", kaNiFuente: 68, name: "Anticipo Proveedores F1",
    domain: "ADVANCE_SUPPLIER", priority: "IMPORTANT", trust: "PENDING",
    f1Track: true, f2Track: false,
    createsAR: false, reducesAR: false, createsAP: false, reducesAP: false,
    cashInflow: false, cashOutflow: true, ceoVisible: false, neverCountAsCobro: false,
    feedsBlocks: ["B3"],
    note: "Anticipo a proveedor F1. Salida de caja. Activo hasta cruzar con C1.",
  },
  "2V": {
    code: "2V", kaNiFuente: 141, name: "Anticipo Proveedores F2",
    domain: "ADVANCE_SUPPLIER", priority: "IMPORTANT", trust: "PENDING",
    f1Track: false, f2Track: true,
    createsAR: false, reducesAR: false, createsAP: false, reducesAP: false,
    cashInflow: false, cashOutflow: true, ceoVisible: false, neverCountAsCobro: false,
    feedsBlocks: ["B3"],
    note: "Anticipo a proveedor F2. Mismo flujo que 1V en track no oficial.",
  },

  // ── Pending Deposits — NEVER count as cobros ───────────────────────────────

  B1: {
    code: "B1", kaNiFuente: 148, name: "Consignación Pendiente Bancolombia CRT 0711",
    domain: "PENDING_DEPOSIT", priority: "IMPORTANT", trust: "PENDING",
    f1Track: false, f2Track: false,
    createsAR: false, reducesAR: false, createsAP: false, reducesAP: false,
    cashInflow: false, cashOutflow: false, ceoVisible: false, neverCountAsCobro: true,
    feedsBlocks: ["B3"],
    note: "CRITICAL: Dinero recibido SIN IDENTIFICAR. NO cobro final. Puente de conciliación mensual.",
  },
  B2: {
    code: "B2", kaNiFuente: 149, name: "Consignación Pendiente Banco Bogotá CRT 9945",
    domain: "PENDING_DEPOSIT", priority: "IMPORTANT", trust: "PENDING",
    f1Track: false, f2Track: false,
    createsAR: false, reducesAR: false, createsAP: false, reducesAP: false,
    cashInflow: false, cashOutflow: false, ceoVisible: false, neverCountAsCobro: true,
    feedsBlocks: ["B3"],
    note: "CRITICAL: Sin identificar — misma regla que B1.",
  },
  H1: {
    code: "H1", kaNiFuente: 150, name: "Consignación Pendiente Bancolombia Ahorros 0313",
    domain: "PENDING_DEPOSIT", priority: "IMPORTANT", trust: "PENDING",
    f1Track: false, f2Track: false,
    createsAR: false, reducesAR: false, createsAP: false, reducesAP: false,
    cashInflow: false, cashOutflow: false, ceoVisible: false, neverCountAsCobro: true,
    feedsBlocks: ["B3"],
    note: "CRITICAL: Sin identificar — misma regla que B1.",
  },
  H2: {
    code: "H2", kaNiFuente: 151, name: "Consignación Pendiente Bancolombia Ahorros 6827",
    domain: "PENDING_DEPOSIT", priority: "IMPORTANT", trust: "PENDING",
    f1Track: false, f2Track: false,
    createsAR: false, reducesAR: false, createsAP: false, reducesAP: false,
    cashInflow: false, cashOutflow: false, ceoVisible: false, neverCountAsCobro: true,
    feedsBlocks: ["B3"],
    note: "CRITICAL: Sin identificar — misma regla que B1.",
  },
  CP: {
    code: "CP", kaNiFuente: 152, name: "Consignaciones Pendientes",
    domain: "PENDING_DEPOSIT", priority: "IMPORTANT", trust: "PENDING",
    f1Track: false, f2Track: false,
    createsAR: false, reducesAR: false, createsAP: false, reducesAP: false,
    cashInflow: false, cashOutflow: false, ceoVisible: false, neverCountAsCobro: true,
    feedsBlocks: ["B3"],
    note: "CRITICAL: Bucket genérico de consignaciones sin clasificar. Misma regla que B1.",
  },

  // ── Commercial Pipeline ───────────────────────────────────────────────────

  PD: {
    code: "PD", kaNiFuente: 40, name: "Pedidos Clientes",
    domain: "COMMERCIAL", priority: "CORE", trust: "LIVE",
    f1Track: true, f2Track: false,
    createsAR: false, reducesAR: false, createsAP: false, reducesAP: false,
    cashInflow: false, cashOutflow: false, ceoVisible: true, neverCountAsCobro: false,
    feedsBlocks: ["B1", "B4"],
    note: "Orden de venta PREVIA a facturación. 'PEDIDOS DEL DIA' sale de esta fuente. Pipeline comercial.",
  },

  // ── Payroll ───────────────────────────────────────────────────────────────

  NO: {
    code: "NO", kaNiFuente: 105, name: "Provisión de Nómina",
    domain: "PAYROLL", priority: "SECONDARY", trust: "LIVE",
    f1Track: true, f2Track: false,
    createsAR: false, reducesAR: false, createsAP: true, reducesAP: false,
    cashInflow: false, cashOutflow: false, ceoVisible: false, neverCountAsCobro: false,
    feedsBlocks: ["B3"],
    note: "Provisión mensual de nómina. 1 vez por fin de mes. Genera obligación laboral.",
  },
};

// ── Derived source allowlists ─────────────────────────────────────────────────
// All allowlists are derived from SOURCE_METADATA — single source of truth.

function codesWhere(pred: (m: FinancialSourceMetadata) => boolean): readonly string[] {
  return Object.values(SOURCE_METADATA).filter(pred).map(m => m.code);
}

/**
 * All sources that create accounts receivable (AR).
 * Use for cartera/revenue queries.
 * Equivalent to sagSourceType = 'OFICIAL' but at the code level.
 *
 * @example
 *   WHERE "comprobanteCode" IN (${AR_CREATION_SOURCES.join(",")})
 */
export const AR_CREATION_SOURCES: readonly string[] = codesWhere(m => m.createsAR);

/**
 * Official F1 revenue sources only.
 * Use for revenue executive KPIs — legal billing truth.
 */
export const REVENUE_SOURCES_F1: readonly string[] = codesWhere(
  m => m.domain === "REVENUE" && m.f1Track,
);

/**
 * All revenue sources including F2 remisiones.
 * Use for operational/forecast views — full pipeline.
 */
export const REVENUE_SOURCES_ALL: readonly string[] = codesWhere(
  m => m.domain === "REVENUE",
);

/**
 * Active collection sources — confirmed cash intent, reduces AR.
 * Includes F1 + F2 cobros and advances.
 *
 * CRITICAL: Does NOT include PENDING_DEPOSIT codes (B1/B2/H1/H2/CP).
 * CRITICAL: Does NOT include REVENUE_ADJ codes (NC/NE/ND/NF/etc.) — those are not cash.
 *
 * Use for: getCobrosKpis, getCobrosSegments, daily cobros B1 card.
 */
export const COLLECTION_SOURCES: readonly string[] = codesWhere(
  m => m.domain === "COLLECTION" || m.domain === "ADVANCE_CLIENT",
);

/**
 * F1-track collection sources only.
 * For official cartera collection KPIs.
 */
export const COLLECTION_SOURCES_F1: readonly string[] = codesWhere(
  m => (m.domain === "COLLECTION" || m.domain === "ADVANCE_CLIENT") && m.f1Track,
);

/**
 * F2-track collection sources.
 * For operational F2 recaudo KPIs.
 */
export const COLLECTION_SOURCES_F2: readonly string[] = codesWhere(
  m => (m.domain === "COLLECTION" || m.domain === "ADVANCE_CLIENT") && m.f2Track,
);

/**
 * Revenue adjustment sources — credit notes, returns, payment discounts.
 * These REDUCE AR and revenue but are NOT cash receipts.
 *
 * CRITICAL: Never add these to cobros/cash totals.
 */
export const REVENUE_ADJ_SOURCES: readonly string[] = codesWhere(
  m => m.domain === "REVENUE_ADJ",
);

/**
 * Sources that create accounts payable (CxP).
 */
export const AP_CREATION_SOURCES: readonly string[] = codesWhere(m => m.createsAP);

/**
 * Sources that reduce accounts payable (CxP).
 */
export const AP_REDUCTION_SOURCES: readonly string[] = codesWhere(m => m.reducesAP);

/**
 * All AP-impacting sources (creates + reduces).
 */
export const AP_SOURCES: readonly string[] = codesWhere(
  m => m.createsAP || m.reducesAP,
);

/**
 * Treasury sources — cash movements without direct AR/AP.
 */
export const TREASURY_SOURCES: readonly string[] = codesWhere(
  m => m.domain === "TREASURY" || m.domain === "ADVANCE_SUPPLIER",
);

/**
 * Pending deposit sources — unidentified cash received.
 *
 * CRITICAL RULE:
 *   These MUST NEVER be counted as confirmed cobros.
 *   Display as "X consignaciones por identificar — COP Y" with amber state.
 *   Do not reduce CustomerReceivable until each entry is resolved.
 */
export const PENDING_DEPOSIT_SOURCES: readonly string[] = codesWhere(
  m => m.domain === "PENDING_DEPOSIT",
);

/**
 * Commercial pipeline sources — pre-revenue.
 */
export const COMMERCIAL_SOURCES: readonly string[] = codesWhere(
  m => m.domain === "COMMERCIAL",
);

/**
 * Payroll sources.
 */
export const PAYROLL_SOURCES: readonly string[] = codesWhere(
  m => m.domain === "PAYROLL",
);

/**
 * Accounting-only sources — audit trail, not in executive dashboard.
 */
export const ACCOUNTING_ONLY_SOURCES: readonly string[] = codesWhere(
  m => m.domain === "ACCOUNTING",
);

/**
 * All V1 active sources (CORE + IMPORTANT + SECONDARY).
 * Use as the operational allowlist to filter out ARKETOPS/historical noise.
 */
export const ALL_ACTIVE_SOURCES: readonly string[] = Object.keys(SOURCE_METADATA);

// ── IGNORE lists (not in metadata — listed for documentation and safety) ─────

/**
 * Source codes that are marked N/A or ELIMINAR in FUENTES.xlsx.
 * These must not appear in any financial query.
 * If detected, treat as UNKNOWN and warn.
 */
export const NA_ELIMINATED_CODES: readonly string[] = [
  "N2", "NP", "CT", "OC", "VV", "AK", "OT", "T+", "T-", "CA",
  "XX", "ES", "EM", "TC", "I1", "TB", "FL", "PS", "FS", "AS", "VA",
  "SI", // SISTECREDIT duplicate — marked "EXCLUIR TOTALMENTE" in FUENTES.xlsx
];

/**
 * ARKETOPS source codes — NIIF/accounting system entries.
 * Exclude from all operational financial queries.
 */
export const ARKETOPS_CODES: readonly string[] = [
  "S1", "S2", "S3", "S4", "DE", "CI", "CB", "AC", "S5", "DF",
  "K1", "K", "K2", "IC", "FI", "GI", "PX", "GX", "LX", "DI",
  "FT", "PI", "AX", "LI", "AD", "DN", "J1", "J2",
];

/**
 * Historical-only source codes (SE USO HACE TIEMPO).
 * Read-only for balance history. Never display as current operational data.
 */
export const HISTORICAL_ONLY_CODES: readonly string[] = [
  "VC", "AA", "EA", "V1", "F1", "V2", "V3", "2D", "3D", "RM", "NX",
  "SC", "SG", "PP", "AG", "FX", "SA", "TF", "FF", "ED", "CE", "GE",
  "F3", "R3", "D3", "A3", "P1", "P2", "4D", "V4", "V5", "5D", "DT",
  "DX", "V6", "6D", "DL", "AJ",
];

/**
 * Production module source codes — scoped to manufacturing module only.
 */
export const PRODUCTION_CODES: readonly string[] = [
  "OP", "CN", "PT", "PC", "EC", "4", "MV", "ET", "CM", "T2",
  "Y1", "CV", "T1", "M2", "SR",
];

// ── Helper predicates ─────────────────────────────────────────────────────────

/** True when this source code creates accounts receivable. */
export function isRevenueSource(code: string): boolean {
  return SOURCE_METADATA[code]?.createsAR === true;
}

/** True when this source code represents a confirmed collection (reduces AR or is an advance). */
export function isCollectionSource(code: string): boolean {
  const d = SOURCE_METADATA[code]?.domain;
  return d === "COLLECTION" || d === "ADVANCE_CLIENT";
}

/** True when this source code creates accounts payable. */
export function isAccountsPayableSource(code: string): boolean {
  return SOURCE_METADATA[code]?.createsAP === true;
}

/** True when this source is a treasury movement (bank charge, supplier advance). */
export function isTreasurySource(code: string): boolean {
  const d = SOURCE_METADATA[code]?.domain;
  return d === "TREASURY" || d === "ADVANCE_SUPPLIER";
}

/**
 * True when this source is an unidentified pending deposit.
 *
 * CRITICAL: Pending deposit codes MUST NEVER be counted as confirmed cobros.
 */
export function isPendingDepositSource(code: string): boolean {
  return SOURCE_METADATA[code]?.domain === "PENDING_DEPOSIT";
}

/** True when this source is a revenue adjustment (credit note, return, discount). */
export function isRevenueAdjSource(code: string): boolean {
  return SOURCE_METADATA[code]?.domain === "REVENUE_ADJ";
}

/** True when this source belongs to the F1 official financial track. */
export function isF1Track(code: string): boolean {
  return SOURCE_METADATA[code]?.f1Track === true;
}

/** True when this source belongs to the F2 non-official financial track. */
export function isF2Track(code: string): boolean {
  return SOURCE_METADATA[code]?.f2Track === true;
}

/** True when this source should appear in CEO-facing executive headlines. */
export function isCeoVisible(code: string): boolean {
  return SOURCE_METADATA[code]?.ceoVisible === true;
}

/**
 * Returns the full metadata for a source code.
 * Returns undefined for IGNORE_V1 sources (ARKETOPS, historical, N/A).
 */
export function getSourceMetadata(code: string): FinancialSourceMetadata | undefined {
  return SOURCE_METADATA[code];
}

// ── Safety enforcement ────────────────────────────────────────────────────────

type UnknownSourceHandling = "warn" | "throw" | "silent";

/**
 * Asserts that a source code is known in the financial registry.
 *
 * Call this at import boundaries (SAG sync, external API payloads)
 * to catch unknown source codes before they silently corrupt financial KPIs.
 *
 * @param code     The source code to validate.
 * @param handling "warn" (default) logs a warning; "throw" raises; "silent" returns false.
 * @returns true if known, false if unknown.
 *
 * @example
 *   // At sync time — warn on unknown codes, don't break import
 *   assertKnownFinancialSource(row.comprobanteCode, "warn");
 *
 *   // In a financial aggregation — fail fast on unknown codes
 *   assertKnownFinancialSource(code, "throw");
 */
export function assertKnownFinancialSource(
  code: string,
  handling: UnknownSourceHandling = "warn",
): boolean {
  if (SOURCE_METADATA[code]) return true;

  // Provide a more specific diagnosis
  const isIgnoredN_A    = NA_ELIMINATED_CODES.includes(code);
  const isArketops      = ARKETOPS_CODES.includes(code);
  const isHistorical    = HISTORICAL_ONLY_CODES.includes(code);
  const isProduction    = PRODUCTION_CODES.includes(code);

  let reason = "completely unknown source code";
  if (isIgnoredN_A)   reason = "N/A or ELIMINATED source (should never appear in operational data)";
  if (isArketops)     reason = "ARKETOPS accounting system code (exclude from all operational queries)";
  if (isHistorical)   reason = "HISTORICAL source — read-only for balance history only";
  if (isProduction)   reason = "PRODUCTION module source — not operational finance";

  const msg = `[FinancialSourceRegistry] Unknown source code "${code}": ${reason}`;

  if (handling === "throw") throw new Error(msg);
  if (handling === "warn")  console.warn(msg);
  return false;
}

/**
 * Returns the financial domain for a source code.
 * Returns "IGNORE" for unknown/excluded sources.
 */
export function getFinancialDomain(code: string): FinancialDomain {
  return SOURCE_METADATA[code]?.domain ?? "IGNORE";
}

/**
 * Returns the trust state for a source code.
 * Returns "PENDING" as safe default for unknown sources.
 */
export function getTrustState(code: string): FinancialTrustState {
  return SOURCE_METADATA[code]?.trust ?? "PENDING";
}
