import { formatDateWeekdayMonthShort, formatMonthYear } from "@/lib/utils/formatDate";

/**
 * lib/finance/fiscal-window.ts
 *
 * Fiscal year window engine for Agentik enterprise views.
 *
 * ── Business rules (Colombia, Jan–Dec fiscal year) ────────────────────────────
 *
 *   1. Default front-facing views use the CURRENT fiscal year.
 *   2. Overdue receivables ALWAYS include carry-over from the prior fiscal year.
 *      (A customer with an unpaid 2025 invoice still appears in 2026 views.)
 *   3. Full historical data is accessible via "full_history" mode only.
 *
 * ── Window modes ──────────────────────────────────────────────────────────────
 *
 *   current_year      Jan 1 of current year → today
 *                     Used by: sales KPIs, commercial dashboards
 *
 *   current_and_prior Jan 1 of prior year → today  (DEFAULT for cartera/collections)
 *                     Covers: new fiscal year + all carry-over balances
 *                     Used by: cartera KPIs, collections queue
 *
 *   trailing_12       Exactly 12 months back → today (rolling)
 *                     Used by: trend analysis, churn detection
 *
 *   full_history      No date filter — all stored data
 *                     Used by: reports, advanced views
 *
 * ── Carry-over rule (for Prisma queries) ─────────────────────────────────────
 *
 *   When window is not "full_history", overdue receivables are included via an
 *   OR condition so they always appear regardless of last purchase date:
 *
 *     WHERE (lastPurchaseAt >= window.from) OR (overdueReceivable > 0)
 *
 *   This ensures carry-over balances from previous fiscal years are never
 *   silently excluded from collections or executive views.
 *
 * Exports:
 *   FiscalWindowMode           — union type
 *   FiscalWindow               — full window descriptor
 *   getFiscalWindow()          — compute window from mode + optional date
 *   defaultCarteraWindow()     — current_and_prior (carry-over safe)
 *   defaultSalesWindow()       — current_year
 *   parseFiscalWindowMode()    — URL param → FiscalWindowMode
 *   buildCarryOverWhere()      — Prisma WHERE clause fragment with carry-over OR
 *   FISCAL_WINDOW_LABELS       — UI labels for each mode
 *   FISCAL_WINDOW_MODES        — ordered array of all modes
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type FiscalWindowMode =
  | "today"             // Start of today → now
  | "current_month"     // 1st of current month → today
  | "trailing_6"        // Rolling 6-month window
  | "current_year"      // Jan 1 current year → today
  | "current_and_prior" // Jan 1 prior year → today (carry-over default)
  | "trailing_12"       // Rolling 12-month window
  | "strict_year"       // Jan 1 current year → Dec 31 current year — NO carry-over. Used for B2 cartera principal.
  | "full_history";     // All time — no date filter

export interface FiscalWindow {
  mode:  FiscalWindowMode;
  from:  Date;     // window start (inclusive)
  to:    Date;     // window end — always today
  label: string;   // human-readable label, e.g. "Año fiscal 2026"
  year:  number;   // primary fiscal year (e.g. 2026)
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const FISCAL_WINDOW_MODES: FiscalWindowMode[] = [
  "today",
  "current_month",
  "trailing_6",
  "current_year",
  "current_and_prior",
  "trailing_12",
  "strict_year",
  "full_history",
];

/**
 * Modes shown in cartera/collections selectors.
 * "current_and_prior" is intentionally excluded from the UI —
 * it's kept internally for carry-over logic but not surfaced to managers.
 */
export const CARTERA_WINDOW_MODES: FiscalWindowMode[] = [
  "strict_year",
  "current_year",
  "trailing_12",
  "full_history",
];

export const FISCAL_WINDOW_LABELS: Record<FiscalWindowMode, string> = {
  today:             "Hoy",
  current_month:     "Mes actual",
  trailing_6:        "Últimos 6 meses",
  current_year:      "Año fiscal",
  current_and_prior: "AF + año anterior",
  trailing_12:       "Últimos 12 meses",
  strict_year:       "Facturación 2026",
  full_history:      "Todo el historial",
};

/** Short labels for compact UI selectors */
export const FISCAL_WINDOW_SHORT_LABELS: Record<FiscalWindowMode, string> = {
  today:             "Hoy",
  current_month:     "Mes actual",
  trailing_6:        "6 meses",
  current_year:      "AF actual",
  current_and_prior: "AF + anterior",
  trailing_12:       "12 meses",
  strict_year:       "2026 (estricto)",
  full_history:      "Historial",
};

/** URL param key used across all pages */
export const FISCAL_WINDOW_PARAM = "window" as const;

// ── Core computation ──────────────────────────────────────────────────────────

/**
 * Computes the FiscalWindow for the given mode.
 *
 * @param mode   The window mode.
 * @param today  Override "today" — useful for testing. Defaults to real now.
 */
export function getFiscalWindow(
  mode:   FiscalWindowMode,
  today?: Date,
): FiscalWindow {
  const now  = today ?? new Date();
  const year = now.getFullYear();

  switch (mode) {

    case "today": {
      const from = new Date(year, now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const dayLabel = formatDateWeekdayMonthShort(now);
      return { mode, from, to: now, label: `Hoy · ${dayLabel}`, year };
    }

    case "current_month": {
      const from = new Date(year, now.getMonth(), 1, 0, 0, 0, 0);
      const monthLabel = formatMonthYear(now);
      return { mode, from, to: now, label: monthLabel, year };
    }

    case "trailing_6": {
      const from = new Date(now);
      from.setMonth(from.getMonth() - 6);
      from.setHours(0, 0, 0, 0);
      return { mode, from, to: now, label: "Últimos 6 meses", year };
    }

    case "current_year": {
      const from = new Date(year, 0, 1, 0, 0, 0, 0); // Jan 1 current year
      return {
        mode,
        from,
        to:    now,
        label: `Año fiscal ${year}`,
        year,
      };
    }

    case "current_and_prior": {
      // Jan 1 of the PRIOR year — covers current year + prior year carry-over
      const from = new Date(year - 1, 0, 1, 0, 0, 0, 0);
      return {
        mode,
        from,
        to:    now,
        label: `${year - 1}–${year} (c/carry-over)`,
        year,
      };
    }

    case "trailing_12": {
      // Exactly 12 months back from today (rolling)
      const from = new Date(now);
      from.setFullYear(from.getFullYear() - 1);
      from.setHours(0, 0, 0, 0);
      return {
        mode,
        from,
        to:    now,
        label: `Últimos 12 meses`,
        year,
      };
    }

    case "strict_year": {
      // Jan 1 – Dec 31 of the current year.
      // NO carry-over from prior years. Used for B2 cartera principal (facturación 2026).
      // `to` is Jan 1 of the NEXT year (exclusive upper bound) — differs from other modes
      // where `to` is always today.
      const from = new Date(year, 0, 1, 0, 0, 0, 0);
      const to   = new Date(year + 1, 0, 1, 0, 0, 0, 0);
      return {
        mode,
        from,
        to,
        label: `Facturación ${year}`,
        year,
      };
    }

    case "full_history": {
      // Sentinel: very early date — treated as "no filter" in queries
      const from = new Date(2000, 0, 1, 0, 0, 0, 0);
      return {
        mode,
        from,
        to:    now,
        label: "Todo el historial",
        year,
      };
    }
  }
}

// ── Defaults ──────────────────────────────────────────────────────────────────

/**
 * Default window for cartera and collections views:
 * current_year — shows the active fiscal year only (carry-over via OR clause).
 * "current_and_prior" is still available internally but not the UI default.
 */
export function defaultCarteraWindow(today?: Date): FiscalWindow {
  return getFiscalWindow("current_year", today);
}

/**
 * Default window for sales and commercial KPI views:
 * current_year — reflects the active fiscal year only.
 */
export function defaultSalesWindow(today?: Date): FiscalWindow {
  return getFiscalWindow("current_year", today);
}

// ── URL param parsing ─────────────────────────────────────────────────────────

const VALID_MODES = new Set<FiscalWindowMode>(FISCAL_WINDOW_MODES);

/**
 * Parses a URL search parameter string into a FiscalWindowMode.
 * Falls back to the provided default (or "current_year") for invalid/missing values.
 */
export function parseFiscalWindowMode(
  param:        string | null | undefined,
  defaultMode?: FiscalWindowMode,
): FiscalWindowMode {
  if (param && VALID_MODES.has(param as FiscalWindowMode)) {
    return param as FiscalWindowMode;
  }
  return defaultMode ?? "current_year";
}

// ── Prisma WHERE clause builder ───────────────────────────────────────────────

/**
 * Builds the Prisma WHERE fragment that implements the carry-over business rule.
 *
 * For any window except "full_history", returns an OR that covers:
 *   1. Customers active within the fiscal window (lastPurchaseAt >= window.from).
 *   2. Carry-over: customers whose last purchase falls in the PRIOR fiscal year
 *      (the 12-month period immediately before window.from) AND who have an
 *      outstanding overdue balance.
 *
 * The carry-over clause is intentionally bounded to one prior year so that
 * ancient debts (e.g. DPD 2146d from 2020) do NOT contaminate current-year
 * KPIs.  Full historical data remains accessible via "full_history" mode.
 *
 * For "full_history" returns {} (no date filter — all records).
 *
 * Merge into your base WHERE with spread:
 *   { organizationId, erpId: { not: null }, ...buildCarryOverWhere(window) }
 */
export function buildCarryOverWhere(
  window?: FiscalWindow,
): { OR: object[] } | Record<string, never> {
  if (!window || window.mode === "full_history") {
    return {};
  }
  // One-year lookback: the carry-over window is [window.from − 1 year, window.from)
  const priorYearFrom = new Date(window.from);
  priorYearFrom.setFullYear(priorYearFrom.getFullYear() - 1);
  return {
    OR: [
      // Normal path: customer was active inside the fiscal window
      { lastPurchaseAt: { gte: window.from } },
      // Carry-over path: customer last purchased in the prior year AND still owes money
      {
        lastPurchaseAt: { gte: priorYearFrom, lt: window.from },
        overdueReceivable: { gt: 0 },
      },
    ],
  };
}

/**
 * Builds a strict date-only filter (no carry-over override).
 * Use this for sales KPIs where the carry-over rule does not apply.
 *
 * For "full_history" returns {} (no filter).
 */
export function buildSalesWindowWhere(
  window?: FiscalWindow,
): { lastPurchaseAt?: { gte: Date } } {
  if (!window || window.mode === "full_history") return {};
  return { lastPurchaseAt: { gte: window.from } };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true if a given date is before the window start.
 * Used to flag "carry-over" rows in UI (customer last purchased before this window).
 */
export function isCarryOver(lastPurchaseAt: Date | null | undefined, window: FiscalWindow): boolean {
  if (window.mode === "full_history") return false;
  if (!lastPurchaseAt) return true; // no purchase date = no recent activity = carry-over
  return lastPurchaseAt < window.from;
}
