/**
 * lib/financial/bank-account-registry.ts
 *
 * FINANCIAL SOURCES REGISTRY — Bank Accounts & Payment Platforms.
 *
 * This registry maps real financial accounts (bank accounts, credit cards,
 * payment platforms) to their SAG PUC accounting codes (cuenta contable).
 *
 * ── Relationship to source-registry.ts ────────────────────────────────────────
 *
 *   source-registry.ts        — Maps SAG DOCUMENT CODES (FE, R1, B1, CP...).
 *                               Transaction-level: what kind of event a SAG row is.
 *
 *   bank-account-registry.ts  — Maps FINANCIAL ACCOUNTS (banks, platforms).
 *                               Account-level: where money lives in PUC.
 *
 * These are orthogonal layers. Both are required for full bank reconciliation:
 *
 *   SAG document (R1, B1...) ──→ source-registry      ──→ what happened
 *   SAG PUC code (11200501...)──→ bank-account-registry──→ where it lives
 *
 * ── Cross-reference with PENDING_DEPOSIT codes ───────────────────────────────
 *
 *   The following accounts already have partial linkage in source-registry.ts
 *   via PENDING_DEPOSIT source codes:
 *
 *     BANCOLOMBIA AHORRO 0313  (PUC 11200501) ←→ H1 (Consignación Pendiente)
 *     BANCOLOMBIA CORRIENTE 0711 (PUC 11100501) ←→ B1 (Consignación Pendiente)
 *     BANCO DE BOGOTA         (PUC 11100502) ←→ B2 (Consignación Pendiente)
 *
 *   NOTE: H2 in source-registry = "Bancolombia Ahorros 6827" — NOT in management's
 *   provided list of 10 accounts. Marked as requires_review — confirm with gerencia.
 *
 * ── Provided by gerencia — 2026-05-10 ────────────────────────────────────────
 *
 *   | BANCO / FUENTE               | CUENTA SAG |
 *   |------------------------------|------------|
 *   | BANCOLOMBIA AHORRO 0313      | 11200501   |
 *   | BANCOLOMBIA CORRIENTE 0711   | 11100501   |
 *   | BANCO OCCIDENTE              | 11100503   |
 *   | BANCO CAJA SOCIAL            | 11100504   |
 *   | BANCO DE BOGOTA              | 11100502   |
 *   | TARJETA CREDITO BOGOTA       | 211535     |
 *   | TARJETA CREDITO OCCIDENTE    | 21102503   |
 *   | PLATAFORMA PAYCO             | 13803      |
 *   | PLATAFORMA MERCADOPAGO       | 130526     |
 *   | PLATAFORMA ENVIOCLICK        | 130528     |
 *
 * ── Multi-tenant design ───────────────────────────────────────────────────────
 *
 *   All sources include `tenantId`. Registry is castillitos-only for now.
 *   Future: getSourcesByTenant(tenantId) will filter by org.
 *
 * ── SAFE READ-ONLY ────────────────────────────────────────────────────────────
 *
 *   This file is configuration only. Zero Prisma writes. Zero SAG writes.
 *   Zero reconciliation logic. No side effects. Pure types + static data.
 */

// ── Source type classification ─────────────────────────────────────────────────

/**
 * What kind of financial instrument this account represents.
 */
export type FinancialSourceType =
  | "BANK_ACCOUNT_SAVINGS"    // Cuenta de ahorro bancaria
  | "BANK_ACCOUNT_CHECKING"   // Cuenta corriente bancaria
  | "CREDIT_CARD"             // Tarjeta de crédito empresarial
  | "PAYMENT_PLATFORM"        // Plataforma digital de pagos / recaudos
  | "INTERNAL";               // Cuenta interna / puente contable

// ── Integration status ─────────────────────────────────────────────────────────

/**
 * Operational status of this financial source in Agentik.
 *
 *   connected              — Active and reconciling (future state)
 *   pending_validation     — Registered; PUC code not yet confirmed in SAG
 *   requires_review        — Inconsistency detected; confirm with gerencia
 *   missing_in_sag         — PUC code not found in SAG chart of accounts
 *   integration_pending    — PUC validated; bank feed / API not yet configured
 *   ready_for_reconciliation — Validated + feed configured; ready for auto-recon
 */
export type FinancialSourceStatus =
  | "connected"
  | "pending_validation"
  | "requires_review"
  | "missing_in_sag"
  | "integration_pending"
  | "ready_for_reconciliation";

// ── Reconciliation readiness ───────────────────────────────────────────────────

/**
 * Metadata describing this source's readiness for intelligent reconciliation.
 *
 * All fields are currently declarative — no logic implemented yet.
 * This is the FOUNDATION layer for the future Agentik reconciliation engine.
 */
export interface ReconciliationReadiness {
  /** True when this source can participate in automated reconciliation today. */
  canReconcile: boolean;
  /** True when a bank statement / extracto feed is available for this account. */
  supportsBankMovements: boolean;
  /** True when client payments arrive via this account (inbound cash). */
  supportsPayments: boolean;
  /** True when historical movements can be synced retrospectively. */
  supportsHistoricalSync: boolean;
  /** True when cobros for this account arrive via v_pagosnew (SaleRecord). */
  requiresPagosNew: boolean;
  /**
   * How reliable is SAG data for this source.
   *   HIGH    — SAG fully reflects real movements; can trust for KPIs.
   *   MEDIUM  — SAG partially reflects; supplement with bank statement.
   *   LOW     — SAG rarely reflects; primary truth is external (bank / platform).
   *   UNKNOWN — Not yet validated.
   */
  readonly confidenceLevel: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
}

// ── Main registry type ─────────────────────────────────────────────────────────

/**
 * Full metadata for one financial account source.
 *
 * Identified by `id` (slug). Referenced by `sagAccountCode` (PUC).
 */
export interface BankAccountSource {
  /** Unique slug identifier. Used as the stable key across all future lookups. */
  readonly id: string;
  /** Human-readable full name for display in UI, reports, Copilot. */
  readonly displayName: string;
  /** Compact label for KPI cards and narrow columns. */
  readonly shortName: string;
  /** What kind of financial instrument this is. */
  readonly sourceType: FinancialSourceType;
  /** Institution / bank / platform name. */
  readonly bank: string;
  /** Account suffix: last 4 digits, platform identifier, or null if not applicable. */
  readonly accountSuffix: string | null;
  /**
   * SAG PUC account code (cuenta contable) from the chart of accounts.
   * This is the PUC ledger code where movements for this account are posted in SAG.
   * Provided by gerencia — requires validation against SAG CUENTAS / PLAN_CUENTAS.
   */
  readonly sagAccountCode: string;
  /** Current integration status of this source in Agentik. */
  readonly status: FinancialSourceStatus;
  /** All Castillitos accounts operate in Colombian Pesos. */
  readonly currency: "COP";
  /** Tenant this source belongs to. Multi-tenant ready. */
  readonly tenantId: string;
  /** Whether this source is currently active in the business. */
  readonly active: boolean;
  /** Whether a bank feed / platform API is available and configured. */
  readonly integrationReady: boolean;
  /**
   * Related SAG PENDING_DEPOSIT source code from source-registry.ts, if any.
   *
   * These codes (B1, B2, H1, H2, CP) represent unidentified consignaciones
   * in SAG that are linked to this physical bank account.
   * Null when no PENDING_DEPOSIT code maps to this account.
   */
  readonly relatedSagSourceCode: string | null;
  /** Reconciliation readiness metadata. Foundation for future automation. */
  readonly reconciliationReadiness: ReconciliationReadiness;
  /** Operational note. Documents known state, gaps, and audit trail. */
  readonly notes: string;
  /**
   * Future Copilot hint — what the Agentik financial agent will say about this source.
   * Template strings. Placeholders ({count}, {amount}) filled at runtime.
   *
   * Examples:
   *   "Bancolombia 0313 tiene {count} movimientos pendientes de conciliación"
   *   "MercadoPago presenta diferencias crecientes este período"
   */
  readonly copilotHint: string;
}

// ── Registry ───────────────────────────────────────────────────────────────────

/**
 * The authoritative registry of all financial account sources for Castillitos.
 *
 * 10 sources provided by gerencia on 2026-05-10.
 * All set to `pending_validation` until SAG PUC codes are confirmed in
 * SAG CUENTAS / PLAN_CUENTAS. Validation query: see query-catalog.ts#accounts.byCode.
 *
 * Key: source `id` (slug).
 */
export const BANK_ACCOUNT_SOURCES: Readonly<Record<string, BankAccountSource>> = {

  // ── BANCOLOMBIA AHORRO 0313 ──────────────────────────────────────────────────
  // PUC: 11200501 | SAG Source: H1 (PENDING_DEPOSIT in source-registry.ts)
  // H1 name in registry: "Consignación Pendiente Bancolombia Ahorros 0313" ✓ — consistent

  "bancolombia-ahorro-0313": {
    id:           "bancolombia-ahorro-0313",
    displayName:  "Bancolombia Ahorro 0313",
    shortName:    "BNC AHO 0313",
    sourceType:   "BANK_ACCOUNT_SAVINGS",
    bank:         "Bancolombia",
    accountSuffix: "0313",
    sagAccountCode: "11200501",
    status:       "pending_validation",
    currency:     "COP",
    tenantId:     "castillitos",
    active:       true,
    integrationReady: false,
    relatedSagSourceCode: "H1",
    reconciliationReadiness: {
      canReconcile:          false,
      supportsBankMovements: true,
      supportsPayments:      true,
      supportsHistoricalSync: true,
      requiresPagosNew:      true,
      confidenceLevel:       "MEDIUM",
    },
    notes: "Cuenta de ahorro principal Bancolombia terminación 0313. SAG source H1 (PENDING_DEPOSIT) references this account directly — name alignment confirmed. PUC 11200501 pending SAG chart of accounts validation. Consignaciones sin identificar en SAG llegan como H1. Conciliación mensual requerida.",
    copilotHint: "Bancolombia Ahorro 0313 tiene {count} consignaciones sin identificar · {amount} bloqueando conciliación",
  },

  // ── BANCOLOMBIA CORRIENTE 0711 ───────────────────────────────────────────────
  // PUC: 11100501 | SAG Source: B1 (PENDING_DEPOSIT in source-registry.ts)
  // B1 name in registry: "Consignación Pendiente Bancolombia CRT 0711" ✓ — consistent

  "bancolombia-corriente-0711": {
    id:           "bancolombia-corriente-0711",
    displayName:  "Bancolombia Corriente 0711",
    shortName:    "BNC CRT 0711",
    sourceType:   "BANK_ACCOUNT_CHECKING",
    bank:         "Bancolombia",
    accountSuffix: "0711",
    sagAccountCode: "11100501",
    status:       "pending_validation",
    currency:     "COP",
    tenantId:     "castillitos",
    active:       true,
    integrationReady: false,
    relatedSagSourceCode: "B1",
    reconciliationReadiness: {
      canReconcile:          false,
      supportsBankMovements: true,
      supportsPayments:      true,
      supportsHistoricalSync: true,
      requiresPagosNew:      true,
      confidenceLevel:       "MEDIUM",
    },
    notes: "Cuenta corriente Bancolombia terminación 0711. SAG source B1 (PENDING_DEPOSIT) references this account — name alignment confirmed. PUC 11100501 pending SAG validation. This is the primary checking account for empresa collections (R1 cobros).",
    copilotHint: "Bancolombia Corriente 0711 tiene {count} consignaciones pendientes · {amount} en proceso de identificación",
  },

  // ── BANCO OCCIDENTE ──────────────────────────────────────────────────────────
  // PUC: 11100503 | SAG Source: none identified in source-registry.ts
  // No PENDING_DEPOSIT code currently linked to this bank.

  "banco-occidente": {
    id:           "banco-occidente",
    displayName:  "Banco Occidente",
    shortName:    "OCCIDENTE",
    sourceType:   "BANK_ACCOUNT_CHECKING",
    bank:         "Banco de Occidente",
    accountSuffix: null,
    sagAccountCode: "11100503",
    status:       "pending_validation",
    currency:     "COP",
    tenantId:     "castillitos",
    active:       true,
    integrationReady: false,
    relatedSagSourceCode: null,
    reconciliationReadiness: {
      canReconcile:          false,
      supportsBankMovements: true,
      supportsPayments:      true,
      supportsHistoricalSync: true,
      requiresPagosNew:      false,
      confidenceLevel:       "UNKNOWN",
    },
    notes: "Banco Occidente — cuenta corriente. Account suffix not provided by gerencia; confirm with treasury. PUC 11100503 pending SAG chart of accounts validation. No PENDING_DEPOSIT source code found in source-registry.ts for this bank — may not yet be represented in SAG cobros flow or may use CP (generic bucket). Investigate.",
    copilotHint: "Banco Occidente cuenta {sagAccountCode} · {count} movimientos detectados · pendiente validación SAG",
  },

  // ── BANCO CAJA SOCIAL ────────────────────────────────────────────────────────
  // PUC: 11100504 | SAG Source: none identified in source-registry.ts

  "banco-caja-social": {
    id:           "banco-caja-social",
    displayName:  "Banco Caja Social",
    shortName:    "CAJA SOCIAL",
    sourceType:   "BANK_ACCOUNT_CHECKING",
    bank:         "Banco Caja Social",
    accountSuffix: null,
    sagAccountCode: "11100504",
    status:       "pending_validation",
    currency:     "COP",
    tenantId:     "castillitos",
    active:       true,
    integrationReady: false,
    relatedSagSourceCode: null,
    reconciliationReadiness: {
      canReconcile:          false,
      supportsBankMovements: true,
      supportsPayments:      true,
      supportsHistoricalSync: true,
      requiresPagosNew:      false,
      confidenceLevel:       "UNKNOWN",
    },
    notes: "Banco Caja Social. Account suffix not provided; confirm with treasury. PUC 11100504 pending SAG validation. No PENDING_DEPOSIT source code mapped yet — same gap as Banco Occidente. May receive collections via CP (generic consignaciones bucket).",
    copilotHint: "Banco Caja Social cuenta {sagAccountCode} · validación SAG pendiente",
  },

  // ── BANCO DE BOGOTA ──────────────────────────────────────────────────────────
  // PUC: 11100502 | SAG Source: B2 (PENDING_DEPOSIT in source-registry.ts)
  // B2 name in registry: "Consignación Pendiente Banco Bogotá CRT 9945" ✓ — consistent

  "banco-bogota": {
    id:           "banco-bogota",
    displayName:  "Banco de Bogotá",
    shortName:    "BOGOTÁ",
    sourceType:   "BANK_ACCOUNT_CHECKING",
    bank:         "Banco de Bogotá",
    accountSuffix: "9945",
    sagAccountCode: "11100502",
    status:       "pending_validation",
    currency:     "COP",
    tenantId:     "castillitos",
    active:       true,
    integrationReady: false,
    relatedSagSourceCode: "B2",
    reconciliationReadiness: {
      canReconcile:          false,
      supportsBankMovements: true,
      supportsPayments:      true,
      supportsHistoricalSync: true,
      requiresPagosNew:      true,
      confidenceLevel:       "MEDIUM",
    },
    notes: "Banco de Bogotá CRT 9945. SAG source B2 (PENDING_DEPOSIT) references this account — name alignment confirmed. Note: gerencia provided this as 'Banco de Bogotá' without suffix; suffix 9945 derived from B2 registry entry. Confirm account suffix with treasury. PUC 11100502 pending SAG validation.",
    copilotHint: "Banco de Bogotá 9945 tiene {count} consignaciones sin identificar · {amount} pendiente conciliación",
  },

  // ── TARJETA CRÉDITO BOGOTÁ ───────────────────────────────────────────────────
  // PUC: 211535 | SAG Source: none identified
  // Note: PUC 21xxxx range = liability accounts (cuentas por pagar / obligaciones)

  "tarjeta-credito-bogota": {
    id:           "tarjeta-credito-bogota",
    displayName:  "Tarjeta Crédito Bogotá",
    shortName:    "TC BOGOTÁ",
    sourceType:   "CREDIT_CARD",
    bank:         "Banco de Bogotá",
    accountSuffix: null,
    sagAccountCode: "211535",
    status:       "pending_validation",
    currency:     "COP",
    tenantId:     "castillitos",
    active:       true,
    integrationReady: false,
    relatedSagSourceCode: null,
    reconciliationReadiness: {
      canReconcile:          false,
      supportsBankMovements: false,
      supportsPayments:      false,
      supportsHistoricalSync: false,
      requiresPagosNew:      false,
      confidenceLevel:       "UNKNOWN",
    },
    notes: "Tarjeta de crédito empresarial Banco de Bogotá. PUC 211535 — liability range (21xxxx = obligaciones financieras). This is an OUTFLOW account (expenses + credit card payments), not inbound cobros. Reconciliation pattern is different: match credit card statement charges to expense SAG entries. No PENDING_DEPOSIT code expected. Confirm exact card suffix with treasury.",
    copilotHint: "Tarjeta Crédito Bogotá {sagAccountCode} · {amount} cargos pendientes de conciliar con extracto",
  },

  // ── TARJETA CRÉDITO OCCIDENTE ────────────────────────────────────────────────
  // PUC: 21102503 | SAG Source: none identified
  // Note: PUC 21102503 = liability account (tarjetas crédito)

  "tarjeta-credito-occidente": {
    id:           "tarjeta-credito-occidente",
    displayName:  "Tarjeta Crédito Occidente",
    shortName:    "TC OCCIDENTE",
    sourceType:   "CREDIT_CARD",
    bank:         "Banco de Occidente",
    accountSuffix: null,
    sagAccountCode: "21102503",
    status:       "pending_validation",
    currency:     "COP",
    tenantId:     "castillitos",
    active:       true,
    integrationReady: false,
    relatedSagSourceCode: null,
    reconciliationReadiness: {
      canReconcile:          false,
      supportsBankMovements: false,
      supportsPayments:      false,
      supportsHistoricalSync: false,
      requiresPagosNew:      false,
      confidenceLevel:       "UNKNOWN",
    },
    notes: "Tarjeta de crédito empresarial Banco de Occidente. PUC 21102503 — liability account (21xxxx range). Same pattern as TC Bogotá: outflow / expense matching, not inbound cobros. Confirm card suffix with treasury.",
    copilotHint: "Tarjeta Crédito Occidente {sagAccountCode} · {amount} cargos detectados este período",
  },

  // ── PLATAFORMA PAYCO ─────────────────────────────────────────────────────────
  // PUC: 13803 | SAG Source: none identified
  // PUC 13803 = debtors / receivables sub-account (13xxxx range)

  "plataforma-payco": {
    id:           "plataforma-payco",
    displayName:  "Plataforma PayCo",
    shortName:    "PAYCO",
    sourceType:   "PAYMENT_PLATFORM",
    bank:         "PayCo",
    accountSuffix: null,
    sagAccountCode: "13803",
    status:       "pending_validation",
    currency:     "COP",
    tenantId:     "castillitos",
    active:       true,
    integrationReady: false,
    relatedSagSourceCode: null,
    reconciliationReadiness: {
      canReconcile:          false,
      supportsBankMovements: false,
      supportsPayments:      true,
      supportsHistoricalSync: false,
      requiresPagosNew:      false,
      confidenceLevel:       "UNKNOWN",
    },
    notes: "PayCo digital payment platform. PUC 13803 — debtors/receivables range (13xxxx). This account holds PayCo-collected funds pending transfer to bank. Future: connect PayCo API for automated movement import. No existing SAG document source code for PayCo detected — payments may arrive via CP (generic consignaciones) or a new source code. Confirm with gerencia.",
    copilotHint: "PayCo tiene {amount} en tránsito · {count} transacciones pendientes de transferir a banco",
  },

  // ── PLATAFORMA MERCADOPAGO ───────────────────────────────────────────────────
  // PUC: 130526 | SAG Source: none identified
  // PUC 130526 = debtors sub-account (13xxxx range)

  "plataforma-mercadopago": {
    id:           "plataforma-mercadopago",
    displayName:  "Plataforma MercadoPago",
    shortName:    "MERCADO PAGO",
    sourceType:   "PAYMENT_PLATFORM",
    bank:         "MercadoPago",
    accountSuffix: null,
    sagAccountCode: "130526",
    status:       "pending_validation",
    currency:     "COP",
    tenantId:     "castillitos",
    active:       true,
    integrationReady: false,
    relatedSagSourceCode: null,
    reconciliationReadiness: {
      canReconcile:          false,
      supportsBankMovements: false,
      supportsPayments:      true,
      supportsHistoricalSync: true,
      requiresPagosNew:      false,
      confidenceLevel:       "UNKNOWN",
    },
    notes: "MercadoPago digital payment platform. PUC 130526 — debtors range (13xxxx). Likely linked to e-commerce / web channel (FW invoices in SAG). Future: connect MercadoPago API. Historical sync possible via MercadoPago API v1. Monitor for growing differences — digital platforms accumulate reconciliation gaps quickly.",
    copilotHint: "MercadoPago presenta {count} transacciones · {amount} pendiente transferencia · revisar diferencias crecientes",
  },

  // ── PLATAFORMA ENVIOCLICK ────────────────────────────────────────────────────
  // PUC: 130528 | SAG Source: none identified
  // PUC 130528 = debtors sub-account (13xxxx range)
  // Note: EnvíoClick is a logistics / shipping platform — may handle COD collections

  "plataforma-envioclick": {
    id:           "plataforma-envioclick",
    displayName:  "Plataforma EnvíoClick",
    shortName:    "ENVÍOCLICK",
    sourceType:   "PAYMENT_PLATFORM",
    bank:         "EnvíoClick",
    accountSuffix: null,
    sagAccountCode: "130528",
    status:       "pending_validation",
    currency:     "COP",
    tenantId:     "castillitos",
    active:       true,
    integrationReady: false,
    relatedSagSourceCode: null,
    reconciliationReadiness: {
      canReconcile:          false,
      supportsBankMovements: false,
      supportsPayments:      true,
      supportsHistoricalSync: false,
      requiresPagosNew:      false,
      confidenceLevel:       "UNKNOWN",
    },
    notes: "EnvíoClick logistics/shipping platform. PUC 130528 — debtors range (13xxxx). Likely handles COD (cash on delivery) collections for e-commerce / web orders (FW). Funds collected by courier, periodic settlement to bank account. Future: connect EnvíoClick settlement API. Confirm with gerencia whether this is active for COD or only logistics cost.",
    copilotHint: "EnvíoClick {sagAccountCode} · {amount} en liquidaciones pendientes de transferencia · verificar saldo plataforma",
  },

};

// ── Derived lookups ────────────────────────────────────────────────────────────
// All lookups are derived from BANK_ACCOUNT_SOURCES — single source of truth.

/**
 * Returns all financial sources for a given tenant.
 *
 * @example
 *   const sources = getSourcesByTenant("castillitos");
 */
export function getSourcesByTenant(tenantId: string): BankAccountSource[] {
  return Object.values(BANK_ACCOUNT_SOURCES).filter(s => s.tenantId === tenantId);
}

/**
 * Returns a source by its SAG PUC account code.
 * Returns undefined when the code is not registered.
 *
 * @example
 *   const src = getSourceBySagCode("11200501"); // → bancolombia-ahorro-0313
 */
export function getSourceBySagCode(sagAccountCode: string): BankAccountSource | undefined {
  return Object.values(BANK_ACCOUNT_SOURCES).find(s => s.sagAccountCode === sagAccountCode);
}

/**
 * Returns a source by its related SAG PENDING_DEPOSIT code (from source-registry.ts).
 * Returns undefined when no source maps to that code.
 *
 * @example
 *   const src = getSourceByPendingDepositCode("H1"); // → bancolombia-ahorro-0313
 */
export function getSourceByPendingDepositCode(sagCode: string): BankAccountSource | undefined {
  return Object.values(BANK_ACCOUNT_SOURCES).find(s => s.relatedSagSourceCode === sagCode);
}

/**
 * Returns all bank account sources (savings + checking).
 */
export function getBankAccounts(): BankAccountSource[] {
  return Object.values(BANK_ACCOUNT_SOURCES).filter(
    s => s.sourceType === "BANK_ACCOUNT_SAVINGS" || s.sourceType === "BANK_ACCOUNT_CHECKING",
  );
}

/**
 * Returns all payment platform sources (PayCo, MercadoPago, EnvíoClick).
 */
export function getPaymentPlatforms(): BankAccountSource[] {
  return Object.values(BANK_ACCOUNT_SOURCES).filter(s => s.sourceType === "PAYMENT_PLATFORM");
}

/**
 * Returns all credit card sources.
 */
export function getCreditCards(): BankAccountSource[] {
  return Object.values(BANK_ACCOUNT_SOURCES).filter(s => s.sourceType === "CREDIT_CARD");
}

/**
 * Returns sources with a direct PENDING_DEPOSIT linkage in source-registry.ts.
 * These have the highest reconciliation confidence (partial link already exists).
 */
export function getLinkedSources(): BankAccountSource[] {
  return Object.values(BANK_ACCOUNT_SOURCES).filter(s => s.relatedSagSourceCode !== null);
}

/**
 * Returns all PUC account codes registered in this registry.
 * Useful for batch SAG validation queries.
 *
 * @example
 *   const codes = getAllSagAccountCodes();
 *   // Use with query-catalog.ts accounts.byCode for batch validation
 */
export function getAllSagAccountCodes(): string[] {
  return Object.values(BANK_ACCOUNT_SOURCES).map(s => s.sagAccountCode);
}

/**
 * Returns the Copilot hint template for a source, with optional variable substitution.
 *
 * Placeholders: {count}, {amount}, {sagAccountCode}
 *
 * @example
 *   getCopilotHint("bancolombia-ahorro-0313", { count: "293", amount: "$12.4M" })
 *   // → "Bancolombia Ahorro 0313 tiene 293 consignaciones sin identificar · $12.4M bloqueando conciliación"
 */
export function getCopilotHint(
  sourceId: string,
  vars: Record<string, string> = {},
): string | null {
  const source = BANK_ACCOUNT_SOURCES[sourceId];
  if (!source) return null;

  let hint = source.copilotHint;
  const allVars = { sagAccountCode: source.sagAccountCode, ...vars };
  for (const [key, value] of Object.entries(allVars)) {
    hint = hint.replaceAll(`{${key}}`, value);
  }
  return hint;
}

// ── SAG validation summary ─────────────────────────────────────────────────────

/**
 * Summary of SAG PUC code validation status for all registered sources.
 *
 * Call this to audit which sources still need SAG chart of accounts confirmation.
 * This is READ-ONLY — no SAG queries are made here.
 *
 * Use query-catalog.ts `accounts.byCode` (status: "placeholder") for the
 * actual SAG read query when ready to validate.
 */
export interface SagValidationSummary {
  total:              number;
  pendingValidation:  BankAccountSource[];
  linked:             BankAccountSource[];    // Have relatedSagSourceCode
  unlinked:           BankAccountSource[];    // No relatedSagSourceCode
  creditCards:        BankAccountSource[];
  platforms:          BankAccountSource[];
}

export function getSagValidationSummary(): SagValidationSummary {
  const all = Object.values(BANK_ACCOUNT_SOURCES);
  return {
    total:             all.length,
    pendingValidation: all.filter(s => s.status === "pending_validation"),
    linked:            all.filter(s => s.relatedSagSourceCode !== null),
    unlinked:          all.filter(s => s.relatedSagSourceCode === null),
    creditCards:       getCreditCards(),
    platforms:         getPaymentPlatforms(),
  };
}

// ── Type guards ────────────────────────────────────────────────────────────────

/** True when source is a bank account (savings or checking). */
export function isBankAccount(source: BankAccountSource): boolean {
  return source.sourceType === "BANK_ACCOUNT_SAVINGS"
      || source.sourceType === "BANK_ACCOUNT_CHECKING";
}

/** True when source is a digital payment platform. */
export function isPaymentPlatform(source: BankAccountSource): boolean {
  return source.sourceType === "PAYMENT_PLATFORM";
}

/** True when source has a linked PENDING_DEPOSIT code in source-registry.ts. */
export function hasLinkedPendingDeposit(source: BankAccountSource): boolean {
  return source.relatedSagSourceCode !== null;
}

/** True when source can participate in reconciliation today. */
export function isReconciliationReady(source: BankAccountSource): boolean {
  return source.status === "ready_for_reconciliation"
      || source.status === "connected";
}
