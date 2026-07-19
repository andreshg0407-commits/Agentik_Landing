/**
 * lib/reconciliation/source-contract.ts
 *
 * AGENTIK-RECON-SESSIONS-01 — Task 2
 * Canonical Source Contract
 *
 * Defines the universal contract for all reconcilable financial sources.
 * Every source that can participate in reconciliation must implement this contract.
 *
 * IMPORTANT:
 *   - This is a REGISTRY file — pure types + static data, zero Prisma.
 *   - Do NOT import from SAG adapters, DIAN sync, or SecureVault.
 *   - Readiness is DECLARATIVE — it describes current state, not live status.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

// ── Source type taxonomy ───────────────────────────────────────────────────────

/**
 * All possible source types in the reconciliation universe.
 *
 * sag_*         — SAG ERP data (orders, sales, payments, receivables)
 * dian_*        — DIAN fiscal data (XML invoices, electronic invoice registry)
 * bank_*        — Bank statement data (extracto bancario)
 * payment_*     — Payment gateway settlement data
 * manual_upload — Operator-uploaded CSV or XLSX
 * spreadsheet   — External spreadsheet (not yet normalized)
 * erp_external  — External ERP or third-party system
 */
export type ReconciliationSourceType =
  | "sag_sales"
  | "sag_payments"
  | "sag_receivables"
  | "sag_orders"
  | "dian_xml"
  | "dian_invoice"
  | "bank_statement"
  | "payment_gateway"
  | "manual_upload"
  | "spreadsheet"
  | "erp_external";

// ── Source readiness ───────────────────────────────────────────────────────────

/**
 * Operational readiness of a source for reconciliation.
 *
 *   available             → Data is live, adapter is wired, can run now.
 *   pending_sag_validation → PUC codes registered but not yet confirmed in SAG.
 *   pending_integration   → Source registered; API/feed not yet configured.
 *   requires_upload       → Source requires operator to upload a file (CSV/XML).
 *   requires_credential   → Source requires a credential (bank API key, DIAN cert).
 *   unavailable           → Source not yet planned or blocked by dependency.
 */
export type ReconciliationSourceReadiness =
  | "available"
  | "pending_sag_validation"
  | "pending_integration"
  | "requires_integration"
  | "requires_upload"
  | "requires_credential"
  | "unavailable";

// ── Source contract interface ──────────────────────────────────────────────────

/**
 * Universal contract for a reconcilable source.
 *
 * Every source in the registry must declare:
 *   - what fields it exposes (availableFields)
 *   - which fields can be used as match keys (supportedMatchFields)
 *   - what it needs to be operational (requiresCredential, requiresUpload, etc.)
 */
export interface ReconciliationSourceContract {
  /** Stable slug identifier. Used as sourceAType/sourceBType in sessions. */
  readonly sourceId:             ReconciliationSourceType;
  /** Human-readable label for UI display. */
  readonly label:                string;
  /** Short label for compact UI (column headers, chips). */
  readonly shortLabel:           string;
  /** Provider system that owns this source. */
  readonly provider:             string;
  /** Current operational readiness of this source. */
  readonly readiness:            ReconciliationSourceReadiness;
  /** All data fields available from this source when normalized. */
  readonly availableFields:      string[];
  /** Fields that can be used as match keys in reconciliation. */
  readonly supportedMatchFields: string[];
  /** True when an API credential or certificate is required. */
  readonly requiresCredential:   boolean;
  /** True when an operator must upload a file to use this source. */
  readonly requiresUpload:       boolean;
  /** True when a third-party integration (API, feed) must be configured. */
  readonly requiresIntegration:  boolean;
  /**
   * Human-readable note explaining the blocker or status.
   * Shown in the UI when readiness !== "available".
   */
  readonly readinessNote:        string;
  /**
   * SAG PUC account codes relevant to this source, if applicable.
   * Used for cross-referencing with bank-account-registry.ts.
   */
  readonly relatedSagCodes:      string[];
}

// ── Source registry ────────────────────────────────────────────────────────────

/**
 * The authoritative registry of all supported reconciliation sources.
 *
 * Readiness reflects the current state (2026-05-10).
 * Update this registry as integrations are activated.
 */
export const RECONCILIATION_SOURCES: Readonly<Record<ReconciliationSourceType, ReconciliationSourceContract>> = {

  // ── SAG Orders (Pedidos) ────────────────────────────────────────────────────
  // SaleRecord with source = "sag_pya" + comprobanteCode = PD
  // Grouped by (sellerSlug, productLine, channel)

  "sag_orders": {
    sourceId:             "sag_orders",
    label:                "Pedidos SAG",
    shortLabel:           "SAG Pedidos",
    provider:             "SAG PYA",
    readiness:            "available",
    availableFields:      ["sellerSlug", "sellerName", "productLine", "channel", "amount", "period", "importSource"],
    supportedMatchFields: ["sellerSlug|productLine|channel", "productLine|channel"],
    requiresCredential:   false,
    requiresUpload:       false,
    requiresIntegration:  false,
    readinessNote:        "Datos disponibles vía SaleRecord (SAG PYA sync).",
    relatedSagCodes:      [],
  },

  // ── SAG Sales (Ventas) ──────────────────────────────────────────────────────
  // SaleRecord with source grouped by (sellerSlug, productLine, channel)
  // Used in Pedidos vs Ventas — available today

  "sag_sales": {
    sourceId:             "sag_sales",
    label:                "Ventas SAG",
    shortLabel:           "SAG Ventas",
    provider:             "SAG PYA",
    readiness:            "available",
    availableFields:      ["sellerSlug", "sellerName", "productLine", "channel", "amount", "period", "importSource"],
    supportedMatchFields: ["sellerSlug|productLine|channel", "productLine|channel"],
    requiresCredential:   false,
    requiresUpload:       false,
    requiresIntegration:  false,
    readinessNote:        "Datos disponibles vía SaleRecord (SAG PYA sync).",
    relatedSagCodes:      [],
  },

  // ── SAG Payments (Cobros) ───────────────────────────────────────────────────
  // CollectionRecord from v_pagosnew
  // Partially available — SAG sync active, PUC validation pending

  "sag_payments": {
    sourceId:             "sag_payments",
    label:                "Cobros SAG",
    shortLabel:           "SAG Cobros",
    provider:             "SAG PYA",
    readiness:            "pending_sag_validation",
    availableFields:      ["customerNit", "customerName", "amount", "collectedAt", "sourceCode", "bankCode"],
    supportedMatchFields: ["customerNit", "documentNumber"],
    requiresCredential:   false,
    requiresUpload:       false,
    requiresIntegration:  false,
    readinessNote:        "CollectionRecord disponible. Validación de códigos PUC pendiente para conciliación bancaria.",
    relatedSagCodes:      ["H1", "B1", "B2", "CP"],
  },

  // ── SAG Receivables (Cartera) ───────────────────────────────────────────────
  // CustomerReceivable — active cartera open balances

  "sag_receivables": {
    sourceId:             "sag_receivables",
    label:                "Cartera SAG",
    shortLabel:           "SAG Cartera",
    provider:             "SAG PYA",
    readiness:            "pending_sag_validation",
    availableFields:      ["customerNit", "documentNumber", "originalAmount", "pendingAmount", "dueDate", "channel"],
    supportedMatchFields: ["customerNit", "documentNumber"],
    requiresCredential:   false,
    requiresUpload:       false,
    requiresIntegration:  false,
    readinessNote:        "CustomerReceivable disponible. Flujo de conciliación cartera vs recaudos pendiente activación.",
    relatedSagCodes:      [],
  },

  // ── DIAN XML ────────────────────────────────────────────────────────────────
  // XML files downloaded from the DIAN portal
  // Requires operator file upload per period

  "dian_xml": {
    sourceId:             "dian_xml",
    label:                "XML DIAN",
    shortLabel:           "DIAN XML",
    provider:             "DIAN",
    readiness:            "requires_upload",
    availableFields:      ["cufe", "invoiceNumber", "issueDate", "customerNit", "totalAmount", "taxAmount", "dianStatus"],
    supportedMatchFields: ["cufe", "invoiceNumber", "customerNit|invoiceNumber"],
    requiresCredential:   false,
    requiresUpload:       true,
    requiresIntegration:  false,
    readinessNote:        "Requiere carga de archivos XML descargados del portal DIAN para el período.",
    relatedSagCodes:      [],
  },

  // ── DIAN Invoice ────────────────────────────────────────────────────────────
  // DIAN GetAcquirer integration (via DIAN sync layer)
  // Requires active DIAN integration with valid certificate

  "dian_invoice": {
    sourceId:             "dian_invoice",
    label:                "Facturas Electrónicas DIAN",
    shortLabel:           "DIAN Facturas",
    provider:             "DIAN",
    readiness:            "requires_credential",
    availableFields:      ["cufe", "invoiceNumber", "issueDate", "customerNit", "totalAmount", "dianStatus", "rejectionReason"],
    supportedMatchFields: ["cufe", "invoiceNumber"],
    requiresCredential:   true,
    requiresUpload:       false,
    requiresIntegration:  true,
    readinessNote:        "Requiere integración DIAN activa con certificado digital vigente.",
    relatedSagCodes:      [],
  },

  // ── Bank Statement ──────────────────────────────────────────────────────────
  // Extracto bancario — uploaded CSV or connected via bank API

  "bank_statement": {
    sourceId:             "bank_statement",
    label:                "Extracto Bancario",
    shortLabel:           "Extracto",
    provider:             "Banco",
    readiness:            "requires_integration",
    availableFields:      ["transactionDate", "valueDate", "description", "credit", "debit", "balance", "reference"],
    supportedMatchFields: ["reference", "amount|date"],
    requiresCredential:   true,
    requiresUpload:       true,
    requiresIntegration:  true,
    readinessNote:        "Requiere conexión con extracto bancario o carga de archivo CSV del banco.",
    relatedSagCodes:      ["11200501", "11100501", "11100502", "11100503", "11100504"],
  },

  // ── Payment Gateway ─────────────────────────────────────────────────────────
  // PayCo, MercadoPago, EnvíoClick settlement reports

  "payment_gateway": {
    sourceId:             "payment_gateway",
    label:                "Plataforma de Pagos",
    shortLabel:           "Pasarela",
    provider:             "PayCo / MercadoPago / EnvíoClick",
    readiness:            "requires_integration",
    availableFields:      ["transactionId", "settledAt", "amount", "fee", "netAmount", "status", "reference"],
    supportedMatchFields: ["transactionId", "reference"],
    requiresCredential:   true,
    requiresUpload:       false,
    requiresIntegration:  true,
    readinessNote:        "Requiere integración de API con pasarela de pagos (PayCo, MercadoPago, EnvíoClick).",
    relatedSagCodes:      ["13803", "130526", "130528"],
  },

  // ── Manual Upload ───────────────────────────────────────────────────────────

  "manual_upload": {
    sourceId:             "manual_upload",
    label:                "Carga Manual",
    shortLabel:           "Manual",
    provider:             "Operador",
    readiness:            "requires_upload",
    availableFields:      ["externalId", "documentNumber", "amount", "date", "thirdPartyId", "reference"],
    supportedMatchFields: ["externalId", "documentNumber"],
    requiresCredential:   false,
    requiresUpload:       true,
    requiresIntegration:  false,
    readinessNote:        "Requiere carga de archivo CSV o XLSX por el operador.",
    relatedSagCodes:      [],
  },

  // ── Spreadsheet ─────────────────────────────────────────────────────────────

  "spreadsheet": {
    sourceId:             "spreadsheet",
    label:                "Hoja de Cálculo",
    shortLabel:           "Excel",
    provider:             "Externo",
    readiness:            "requires_upload",
    availableFields:      ["externalId", "documentNumber", "amount", "date", "reference", "notes"],
    supportedMatchFields: ["externalId", "documentNumber"],
    requiresCredential:   false,
    requiresUpload:       true,
    requiresIntegration:  false,
    readinessNote:        "Requiere carga y normalización de hoja de cálculo.",
    relatedSagCodes:      [],
  },

  // ── External ERP ────────────────────────────────────────────────────────────

  "erp_external": {
    sourceId:             "erp_external",
    label:                "ERP Externo",
    shortLabel:           "ERP Ext.",
    provider:             "Externo",
    readiness:            "unavailable",
    availableFields:      [],
    supportedMatchFields: [],
    requiresCredential:   true,
    requiresUpload:       false,
    requiresIntegration:  true,
    readinessNote:        "Fuente genérica para ERPs externos. Requiere adaptador específico.",
    relatedSagCodes:      [],
  },

} as const;

// Fix: bank_statement has "requires_integration" as readiness but the type
// only allows the defined union. Align the two cases that use this value.
// (declared above but needs the type fix via re-export)

// ── Derived lookups ────────────────────────────────────────────────────────────

export function getSourceContract(
  sourceType: ReconciliationSourceType,
): ReconciliationSourceContract {
  return RECONCILIATION_SOURCES[sourceType];
}

/**
 * Returns all sources that are currently available for reconciliation.
 */
export function getAvailableSources(): ReconciliationSourceContract[] {
  return Object.values(RECONCILIATION_SOURCES).filter(
    s => s.readiness === "available",
  );
}

/**
 * Returns true when two source types can be reconciled together today
 * (both are "available").
 */
export function canReconcileNow(
  a: ReconciliationSourceType,
  b: ReconciliationSourceType,
): boolean {
  return (
    RECONCILIATION_SOURCES[a].readiness === "available" &&
    RECONCILIATION_SOURCES[b].readiness === "available"
  );
}

/**
 * Given two source types, derive the session title.
 *
 * Example: "sag_orders" + "sag_sales" → "Pedidos vs Ventas SAG"
 */
export function deriveSessionTitle(
  a: ReconciliationSourceType,
  b: ReconciliationSourceType,
  period?: string,
): string {
  const labelA = RECONCILIATION_SOURCES[a].shortLabel;
  const labelB = RECONCILIATION_SOURCES[b].shortLabel;
  const suffix = period ? ` · ${period}` : "";
  return `${labelA} vs ${labelB}${suffix}`;
}
