/**
 * lib/financial/stream-model.ts
 *
 * Financial Stream Model — Operational visibility layer.
 *
 * Enriches BankAccountSource entries with operational stream state derived
 * from real integration status and available financial data.
 *
 * ── What this module does ────────────────────────────────────────────────────
 *
 *   buildFinancialStreams(sources, pendingDepositsTotal)
 *     — Derives FinancialStream[] from registry + real pending deposit totals.
 *     — No fake data. No invented balances. No simulated activity.
 *
 *   getStreamRecommendations(streams)
 *     — Returns contextual action text from real stream states.
 *     — No AI. No heuristics. Pure state derivation.
 *
 *   groupStreams(streams)
 *     — Buckets streams into bancos / tarjetas / plataformas for sectioned UI.
 *
 * ── Data flow ────────────────────────────────────────────────────────────────
 *
 *   Server (page.tsx)
 *     getCobrosBreakdown(orgId).consignacionesPendientes  — real SAG amounts
 *     Object.values(BANK_ACCOUNT_SOURCES)                 — registered accounts
 *       ↓
 *     buildFinancialStreams(sources, pendingDepositsTotal) — derives state
 *       ↓
 *     FinancialStream[] → serialized as props → ReconClient (client component)
 *
 * ── Safety ───────────────────────────────────────────────────────────────────
 *
 *   SAFE READ-ONLY. Pure TypeScript — no Prisma, no SAG writes.
 *   Zero side effects. All types are JSON-serializable for RSC → client props.
 */

import type {
  BankAccountSource,
  FinancialSourceType,
} from "@/lib/financial/bank-account-registry";

// ── Stream operational status ─────────────────────────────────────────────────

/**
 * Visual/semantic operational state of a financial stream.
 *
 * Maps to row severity and status badge in Conciliación Inteligente surface.
 * Every state is derived from real data — no invented states.
 */
export type StreamOperationalStatus =
  | "healthy"                // Active and reconciled. No open items. (future state)
  | "pending_review"         // Requires manual attention — unresolved items present
  | "reconciliation_pending" // Unidentified deposits or unresolved pending items in SAG
  | "partial_visibility"     // Source active but SAG coverage incomplete
  | "integration_pending"    // Registered; awaiting SAG link or bank feed validation
  | "blocked_source"         // Source cannot process — blocked
  | "missing_sag_mapping"    // PUC code confirmed absent in SAG chart of accounts
  | "low_activity"           // No recent activity detected
  | "settlement_pending";    // Platform settlement model — funds in transit

// ── Stream signal ─────────────────────────────────────────────────────────────

/** A compact operational signal shown on a stream row. Only real data. */
export interface FinancialStreamSignal {
  /** Short label e.g. "Consignaciones", "Sin lectura bancaria". */
  label: string;
  /** Formatted value, or null for state-only signals. */
  value: string | null;
  /** Display level for color coding. */
  level: "neutral" | "info" | "warn" | "ok";
}

// ── Financial stream ──────────────────────────────────────────────────────────

/** Display group for sectioned rendering. */
export type StreamGroup = "bancos" | "tarjetas" | "plataformas";

/** Row severity modifier for ag-op-row. */
export type StreamRowSeverity = "normal" | "warning" | "passive";

/** ag-op-status CSS modifier suffix. */
export type StreamStatusBadge = "ok" | "pending" | "warning" | "critical" | "info";

/**
 * Enriched operational view of a BankAccountSource.
 *
 * All fields are JSON-serializable — safe to pass as RSC → client props.
 * Derived at server render from bank-account-registry + real financial data.
 */
export interface FinancialStream {
  /** Stable id from BankAccountSource. */
  id:                   string;
  displayName:          string;
  shortName:            string;
  sourceType:           FinancialSourceType;
  bank:                 string;
  accountSuffix:        string | null;
  sagAccountCode:       string;
  /** SAG PENDING_DEPOSIT code (B1/B2/H1/H2/CP), or null when not linked. */
  relatedSagSourceCode: string | null;
  /** Rendering group. */
  group:                StreamGroup;
  /** Derived operational status from real data. */
  status:               StreamOperationalStatus;
  /** Human label for status badge. */
  statusLabel:          string;
  /** CSS modifier for ag-op-status. */
  statusBadge:          StreamStatusBadge;
  /** CSS modifier for ag-op-row. */
  rowSeverity:          StreamRowSeverity;
  /** Real operational signals. Empty when no data is available. */
  signals:              FinancialStreamSignal[];
  /** True when this stream has actionable pending items. */
  requiresAction:       boolean;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function fmtCOP(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style:                 "currency",
    currency:              "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function deriveGroup(sourceType: FinancialSourceType): StreamGroup {
  if (sourceType === "CREDIT_CARD")      return "tarjetas";
  if (sourceType === "PAYMENT_PLATFORM") return "plataformas";
  return "bancos";
}

type DerivedState = Pick<FinancialStream,
  "status" | "statusLabel" | "statusBadge" | "rowSeverity" | "signals" | "requiresAction"
>;

function deriveStreamState(
  source:               BankAccountSource,
  pendingDepositsTotal: { amount: number; count: number },
): DerivedState {

  // ── Credit cards — liability accounts, outflow only ──────────────────────
  if (source.sourceType === "CREDIT_CARD") {
    return {
      status:         "partial_visibility",
      statusLabel:    "Solo egresos",
      statusBadge:    "info",
      rowSeverity:    "normal",
      requiresAction: false,
      signals: [
        { label: "Tipo",         value: "Tarjeta crédito · egresos",  level: "neutral" },
        { label: "PUC SAG",      value: source.sagAccountCode,         level: "neutral" },
        { label: "Conciliación", value: "Extracto requerido",          level: "neutral" },
      ],
    };
  }

  // ── Payment platforms — settlement model, funds in transit ───────────────
  if (source.sourceType === "PAYMENT_PLATFORM") {
    return {
      status:         "settlement_pending",
      statusLabel:    "Liquidaciones",
      statusBadge:    "pending",
      rowSeverity:    "normal",
      requiresAction: false,
      signals: [
        { label: "Tipo",    value: "Plataforma digital",         level: "neutral" },
        { label: "PUC SAG", value: source.sagAccountCode,         level: "neutral" },
        { label: "API",     value: "Sin integración activa",      level: "neutral" },
      ],
    };
  }

  // ── Bank accounts ─────────────────────────────────────────────────────────

  // Has SAG PENDING_DEPOSIT link (B1/B2/H1)
  if (source.relatedSagSourceCode !== null) {
    if (pendingDepositsTotal.count > 0) {
      // Real pending deposit pool — shared across all linked accounts
      return {
        status:         "reconciliation_pending",
        statusLabel:    "Consignaciones pendientes",
        statusBadge:    "warning",
        rowSeverity:    "warning",
        requiresAction: true,
        signals: [
          { label: "Fuente SAG",      value: source.relatedSagSourceCode,                      level: "info" },
          { label: "Sin identificar", value: `${pendingDepositsTotal.count} consignaciones`,   level: "warn" },
          { label: "Pool total",      value: fmtCOP(pendingDepositsTotal.amount),              level: "warn" },
        ],
      };
    }
    // Linked but pool is currently empty
    return {
      status:         "partial_visibility",
      statusLabel:    "Vinculado · al día",
      statusBadge:    "info",
      rowSeverity:    "normal",
      requiresAction: false,
      signals: [
        { label: "Fuente SAG", value: source.relatedSagSourceCode,      level: "info" },
        { label: "Estado",     value: "Sin consignaciones pendientes",   level: "ok"   },
      ],
    };
  }

  // SAG confirmed missing
  if (source.status === "missing_in_sag") {
    return {
      status:         "missing_sag_mapping",
      statusLabel:    "Sin cuenta SAG",
      statusBadge:    "critical",
      rowSeverity:    "warning",
      requiresAction: true,
      signals: [
        { label: "PUC SAG", value: source.sagAccountCode, level: "warn" },
        { label: "Estado",  value: "No encontrada en SAG", level: "warn" },
      ],
    };
  }

  // Default: pending_validation — no SAG link found yet
  return {
    status:         "integration_pending",
    statusLabel:    "Sin lectura bancaria",
    statusBadge:    "pending",
    rowSeverity:    "passive",
    requiresAction: false,
    signals: [
      { label: "PUC SAG", value: source.sagAccountCode,        level: "neutral" },
      { label: "Estado",  value: "Pendiente validación SAG",   level: "neutral" },
    ],
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Builds FinancialStream[] from the bank account registry + real financial data.
 *
 * @param sources                 BankAccountSource[] — from getSourcesByTenant()
 *                                or Object.values(BANK_ACCOUNT_SOURCES).
 * @param pendingDepositsTotal    Total pending deposit pool from
 *                                getCobrosBreakdown().consignacionesPendientes.
 *                                This pool is shared across B1/B2/H1/H2/CP accounts.
 *                                Pass { amount: 0, count: 0 } when unavailable.
 *
 * @returns FinancialStream[] — JSON-serializable, safe for RSC → client props.
 */
export function buildFinancialStreams(
  sources:              BankAccountSource[],
  pendingDepositsTotal: { amount: number; count: number } = { amount: 0, count: 0 },
): FinancialStream[] {
  return sources.map(source => ({
    id:                   source.id,
    displayName:          source.displayName,
    shortName:            source.shortName,
    sourceType:           source.sourceType,
    bank:                 source.bank,
    accountSuffix:        source.accountSuffix,
    sagAccountCode:       source.sagAccountCode,
    relatedSagSourceCode: source.relatedSagSourceCode,
    group:                deriveGroup(source.sourceType),
    ...deriveStreamState(source, pendingDepositsTotal),
  }));
}

/**
 * Derives contextual action recommendations from real stream states.
 *
 * NO fake intelligence. All recommendations are directly derived from
 * the operational status of each stream — nothing invented or approximated.
 *
 * Returns at least one entry (nominal state message when all is well).
 */
export function getStreamRecommendations(streams: FinancialStream[]): string[] {
  const recs: string[] = [];

  const pendingRecon  = streams.filter(s => s.status === "reconciliation_pending");
  const missingLink   = streams.filter(s => s.status === "integration_pending" && s.group === "bancos");
  const platforms     = streams.filter(s => s.group === "plataformas");
  const requireAction = streams.filter(s => s.requiresAction);

  if (pendingRecon.length > 0) {
    const names = pendingRecon.map(s => s.shortName).join(", ");
    recs.push(
      `Consignaciones sin identificar en: ${names} — revisar antes del cierre de conciliación`,
    );
  }

  if (requireAction.length > 0 && pendingRecon.length === 0) {
    recs.push(
      `${requireAction.length} cuenta${requireAction.length > 1 ? "s" : ""} ` +
      `requiere${requireAction.length > 1 ? "n" : ""} atención operacional`,
    );
  }

  if (missingLink.length > 0) {
    recs.push(
      `${missingLink.length} cuenta${missingLink.length > 1 ? "s" : ""} ` +
      `bancaria${missingLink.length > 1 ? "s" : ""} sin lectura bancaria configurada — ` +
      `falta extracto para completar conciliación`,
    );
  }

  if (platforms.length > 0) {
    recs.push(
      `Plataformas digitales (${platforms.map(p => p.shortName).join(", ")}) ` +
      `sin integración API — liquidaciones pendientes de verificación manual`,
    );
  }

  if (recs.length === 0) {
    recs.push("Todas las fuentes financieras están en estado operativo nominal");
  }

  return recs;
}

/**
 * Groups FinancialStream[] by display group for sectioned rendering.
 */
export function groupStreams(streams: FinancialStream[]): {
  bancos:      FinancialStream[];
  tarjetas:    FinancialStream[];
  plataformas: FinancialStream[];
} {
  return {
    bancos:      streams.filter(s => s.group === "bancos"),
    tarjetas:    streams.filter(s => s.group === "tarjetas"),
    plataformas: streams.filter(s => s.group === "plataformas"),
  };
}
