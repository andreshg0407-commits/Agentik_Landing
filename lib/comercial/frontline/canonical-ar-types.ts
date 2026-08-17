/**
 * lib/comercial/frontline/canonical-ar-types.ts
 *
 * AGENTIK-RECEIVABLES-AR-TRUTH-01
 *
 * Canonical types for accounts receivable truth derived from SAG views:
 *   vw_agentik_cartera    → open receivable documents (SALDO_PENDIENTE pre-computed)
 *   vw_agentik_recaudos   → collection applications at document level
 *
 * These types replace the legacy CustomerReceivable pipeline where:
 *   - paidAmount was always 0
 *   - balanceDue = originalAmount (never reduced)
 *   - overdue amounts were grossly over-reported
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

// ── Raw SAG row types (match actual view output) ─────────────────────────────

/** Raw row from vw_agentik_cartera */
export interface SagCarteraRow {
  DOCUMENTO:          string;
  TIPO_DOCUMENTO:     string;   // "Factura" | "Nota Crédito"
  CLIENTE_ID:         number;   // ka_nl_tercero (SAG customer PK)
  CLIENTE:            string;
  VENDEDOR:           string;
  FECHA_DOCUMENTO:    string;   // ISO datetime "2026-06-05T00:00:00"
  FECHA_VENCIMIENTO:  string | null;
  DIAS_MORA:          number | null; // live-computed by SAG; null for some credit notes
  VALOR_DOCUMENTO:    number;   // original doc amount (negative for credit notes)
  SALDO_PENDIENTE:    number;   // remaining balance (negative for unapplied credits)
  ESTADO_CARTERA:     string;   // "En Mora" | "Pendiente de Pago"
  CIUDAD:             string;
  CANAL_VENTA:        string;   // currently empty for all rows
}

/** Raw row from vw_agentik_recaudos */
export interface SagRecaudoRow {
  ID_RECAUDO:            number;   // NOT unique per row — same for multi-doc applications
  FECHA_RECAUDO:         string;   // ISO datetime
  CLIENTE_ID:            number;   // ka_nl_tercero
  CLIENTE:               string;
  DOCUMENTO_RELACIONADO: string;   // document this payment applies to (FE-xxx, F2-xxx, NC-xxx)
  VALOR_RECAUDADO:       number;   // positive=payment, negative=credit/reversal
  CONCILIADO:            null;     // always null (bank recon not used)
  REFERENCIA_BANCARIA:   null;     // always null
  ID_MOVIMIENTO_BANCO:   null;     // always null
  MONTO_NO_APLICADO:     number;   // unapplied remainder
  BANCO:                 string;   // PUC code + description
  REFERENCIA_PAGO:       string;   // always empty string
}

// ── Canonical domain types ───────────────────────────────────────────────────

/** Document-level receivable truth */
export interface CertifiedReceivableDocument {
  /** Document number (e.g. "FE-7688", "F2-8484") */
  documento:          string;
  /** "Factura" | "Nota Crédito" */
  tipoDocumento:      string;
  /** SAG customer PK (ka_nl_tercero) */
  clienteId:          number;
  /** Customer name from SAG */
  clienteName:        string;
  /** Document issue date */
  fechaDocumento:     Date;
  /** Due date (null for some credit notes) */
  fechaVencimiento:   Date | null;
  /** Days overdue — live-computed by SAG */
  diasMora:           number | null;
  /** Original document amount */
  valorDocumento:     number;
  /** Remaining balance — pre-computed by SAG, includes all applied collections */
  saldoPendiente:     number;
  /** "En Mora" | "Pendiente de Pago" */
  estadoCartera:      string;
  /** City */
  ciudad:             string;
  /** Seller name */
  vendedor:           string;
}

/** Customer-level receivable snapshot */
export interface CertifiedCustomerReceivableSnapshot {
  /** SAG customer PK (ka_nl_tercero) */
  clienteId:              number;
  /** Customer NIT (from TERCEROS join) */
  nit:                    number | null;
  /** Customer name */
  clienteName:            string;
  /** Gross receivable (sum of SALDO_PENDIENTE for positive balances only) */
  totalPendiente:         number;
  /** Total overdue balance (SALDO_PENDIENTE where DIAS_MORA > 0, positive only) */
  totalVencido:           number;
  /** Total current balance (SALDO_PENDIENTE where DIAS_MORA <= 0, positive only) */
  totalVigente:           number;
  /** Absolute value of sum of negative SALDO_PENDIENTE documents (credits/saldo a favor) */
  creditBalance:          number;
  /** Signed net receivable (totalPendiente - creditBalance) */
  netReceivable:          number;
  /** Count of all documents with non-zero balance */
  documentCount:          number;
  /** Count of overdue documents */
  overdueDocumentCount:   number;
  /** Max days overdue across all documents */
  maxDiasMora:            number;
  /** Individual document details */
  documents:              CertifiedReceivableDocument[];
  /** Snapshot timestamp (when SAG was queried) */
  asOf:                   Date;
  /** Source authority */
  source:                 "vw_agentik_cartera";
  /** Truth status */
  truthStatus:            "CERTIFIED";
}

/** Global AR snapshot for an organization */
export interface CertifiedArSnapshot {
  /** Snapshot timestamp */
  asOf:                   Date;
  /** SAG database used */
  sagSource:              "CURRENT" | "HISTORICAL";
  /** Total open AR (sum of positive SALDO_PENDIENTE) */
  totalOpenAr:            number;
  /** Total overdue AR (SALDO_PENDIENTE where DIAS_MORA > 0) */
  totalOverdueAr:         number;
  /** Total credit notes with unapplied balance */
  totalUnappliedCredits:  number;
  /** Count of open documents */
  totalOpenDocuments:     number;
  /** Count of overdue documents */
  totalOverdueDocuments:  number;
  /** Count of distinct customers with open balances */
  totalOpenCustomers:     number;
  /** Count of distinct customers with overdue balances */
  totalOverdueCustomers:  number;
  /** Aging bands */
  agingBands:             ArAgingBand[];
  /** Per-customer snapshots */
  customers:              CertifiedCustomerReceivableSnapshot[];
  /** Source authority */
  source:                 "vw_agentik_cartera";
  /** Truth status */
  truthStatus:            "CERTIFIED";
}

/** Aging band summary */
export interface ArAgingBand {
  band:       string;   // "CURRENT" | "1-30" | "31-60" | "61-90" | "91-180" | "181-365" | "365+"
  docCount:   number;
  totalPending: number;
}

/** Result of querying canonical AR from SAG */
export type CanonicalArResult =
  | { ok: true; snapshot: CertifiedArSnapshot }
  | { ok: false; error: string; code: "SAG_UNAVAILABLE" | "VIEW_NOT_FOUND" | "PARSE_ERROR" };

/**
 * Result of querying canonical AR for a single customer.
 *
 * Zero-row safety policy:
 *   CERTIFIED_ZERO   — customer identity resolved, zero open AR (genuine fully paid)
 *   HAS_OPEN_AR      — customer has open receivable documents
 *   SAG_UNAVAILABLE   — canonical source unavailable (NOT certified)
 *   IDENTITY_UNKNOWN — clienteId not resolvable or invalid
 */
export type CustomerArResult =
  | { status: "CERTIFIED_ZERO"; clienteId: number; asOf: Date }
  | { status: "HAS_OPEN_AR"; snapshot: CertifiedCustomerReceivableSnapshot }
  | { status: "SAG_UNAVAILABLE"; error: string }
  | { status: "IDENTITY_UNKNOWN"; clienteId: number };

// ── Canonical collection application types ──────────────────────────────────

/** Document-level collection application */
export interface CertifiedCollectionApplication {
  /** Recaudo ID (NOT unique — same for multi-doc applications) */
  idRecaudo:            number;
  /** Collection date */
  fechaRecaudo:         Date;
  /** SAG customer PK */
  clienteId:            number;
  /** Customer name */
  clienteName:          string;
  /** Document this payment applies to (FE-xxx, F2-xxx, NC-xxx) */
  documentoRelacionado: string;
  /** Amount collected (positive=payment, negative=credit/reversal) */
  valorRecaudado:       number;
  /** Unapplied remainder */
  montoNoAplicado:      number;
  /** Bank PUC code + description */
  banco:                string;
}

/** Customer-level collection summary */
export interface CertifiedCustomerCollectionSnapshot {
  clienteId:            number;
  clienteName:          string;
  /** Total collected (sum of positive VALOR_RECAUDADO) */
  totalRecaudado:       number;
  /** Total credit/reversals (sum of negative VALOR_RECAUDADO) */
  totalCreditos:        number;
  /** Net collected */
  totalNeto:            number;
  /** Total unapplied */
  totalNoAplicado:      number;
  /** Number of collection applications */
  applicationCount:     number;
  /** Distinct documents with applications */
  documentCount:        number;
  /** Individual applications */
  applications:         CertifiedCollectionApplication[];
  asOf:                 Date;
  source:               "vw_agentik_recaudos";
  truthStatus:          "CERTIFIED";
}

/** Result of querying canonical collections from SAG */
export type CanonicalRecaudosResult =
  | { ok: true; snapshot: CertifiedCustomerCollectionSnapshot }
  | { ok: false; error: string; code: "SAG_UNAVAILABLE" | "VIEW_NOT_FOUND" | "PARSE_ERROR" };
