/**
 * lib/finance/banking/banking-status.ts
 *
 * AGENTIK-BANKING-FOUNDATION-01 — Banking health and status computation.
 */

import type { BankBalanceReport, AccountBalance } from "./banking-types";

// ── Health levels ─────────────────────────────────────────────────────────────

export type BankingHealthLevel = "healthy" | "attention" | "critical" | "no_data";

export interface BankingHealthSummary {
  level:               BankingHealthLevel;
  label:               string;
  availableBalance:    number;
  unreconciledCount:   number;
  hasRealData:         boolean;
  lastSyncAt:          Date | null;
  staleAccounts:       number;
}

// ── Status helpers ────────────────────────────────────────────────────────────

/**
 * Returns a UI-facing health summary for the banking domain.
 * Used by Tesorería Operativa to replace "Pendiente de integración".
 */
export function computeBankingHealth(
  report: BankBalanceReport | null,
): BankingHealthSummary {
  if (!report || !report.hasRealData) {
    return {
      level:             "no_data",
      label:             "Sin datos bancarios — integración pendiente",
      availableBalance:  0,
      unreconciledCount: 0,
      hasRealData:       false,
      lastSyncAt:        null,
      staleAccounts:     0,
    };
  }

  const staleThresholdMs = 24 * 60 * 60 * 1000; // 24 hours
  const now              = Date.now();
  const staleAccounts    = report.accounts.filter(
    (a) => !a.lastSyncAt || now - a.lastSyncAt.getTime() > staleThresholdMs,
  ).length;

  const unreconciledBalance = report.unreconciledBalance;
  const hasStale            = staleAccounts > 0;
  const hasCriticalGap      = unreconciledBalance > 5_000_000; // >5M COP unreconciled = critical

  const level: BankingHealthLevel = hasCriticalGap
    ? "critical"
    : hasStale
    ? "attention"
    : "healthy";

  const label =
    level === "critical"
      ? `${staleAccounts} cuenta(s) sin sincronizar · $${(unreconciledBalance / 1_000_000).toFixed(1)}M sin conciliar`
      : level === "attention"
      ? `${staleAccounts} cuenta(s) con datos desactualizados`
      : "Todas las cuentas sincronizadas";

  const lastSyncAt =
    report.accounts.reduce<Date | null>((best, a) => {
      if (!a.lastSyncAt) return best;
      if (!best) return a.lastSyncAt;
      return a.lastSyncAt > best ? a.lastSyncAt : best;
    }, null);

  return {
    level,
    label,
    availableBalance:  report.totalAvailable,
    unreconciledCount: report.accounts.length, // approximate
    hasRealData:       true,
    lastSyncAt,
    staleAccounts,
  };
}

/**
 * Format a COP amount for display in Tesorería KPI cards.
 */
export function fmtBankAmount(amount: number): string {
  if (Math.abs(amount) >= 1_000_000_000) {
    return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  }
  if (Math.abs(amount) >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }
  return `$${amount.toLocaleString("es-CO")}`;
}
