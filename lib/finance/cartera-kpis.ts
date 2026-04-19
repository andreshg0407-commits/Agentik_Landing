/**
 * lib/finance/cartera-kpis.ts
 *
 * Cartera (accounts receivable) analytics layer.
 *
 * Reads exclusively from the denormalized CustomerProfile fields
 * (totalReceivable, overdueReceivable, maxDpd) that are refreshed by the
 * bulk KPI refresh job.  One aggregate pass — no per-customer queries.
 *
 * ── Fiscal window support ─────────────────────────────────────────────────────
 *
 * Accepts an optional FiscalWindow to scope results to the active fiscal period.
 * The carry-over rule is always applied: customers with overdue balances are
 * included regardless of the window, so old debt is never silently dropped.
 *
 * Default (no window): all ERP-linked customers — backward compatible.
 *
 * Exports:
 *   getCarteraKpis(orgId, window?)  → org-level cartera summary + top debtors
 *   CarteraKpis                     → output type
 *   TopDebtorRow                    → per-customer type used by exec panel and copilot
 */

import { prisma }           from "@/lib/prisma";
import type { FiscalWindow } from "@/lib/finance/fiscal-window";
import { buildCarryOverWhere } from "@/lib/finance/fiscal-window";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TopDebtorRow {
  slug:              string;
  name:              string;
  overdueReceivable: number;
  totalReceivable:   number;
  maxDpd:            number;
  /** share of this customer's overdue vs. org total overdue (0–100) */
  share:             number;
}

export interface CarteraKpis {
  hasData:           boolean;
  currency:          string;
  /** Label of the active fiscal window, e.g. "Año fiscal 2026" */
  windowLabel:       string;
  // Org-level totals
  totalReceivable:   number;   // SUM across all active debtors in window
  overdueReceivable: number;   // SUM where daysOverdue > 0 (carry-over included)
  overdueRatio:      number;   // overdueReceivable / totalReceivable × 100
  // Aging extremes
  maxDpd:            number;   // MAX(maxDpd) across org
  count90Plus:       number;   // customers with maxDpd > 90
  activeDebtors:     number;   // customers with overdueReceivable > 0
  // Concentration
  topDebtor:         TopDebtorRow | null;
  concentrationRisk: number;   // top debtor's share of total overdue (0–100)
  top5Debtors:       TopDebtorRow[];
}

// ── Helper ────────────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isFinite(n) ? n : 0;
}

// ── Main query ────────────────────────────────────────────────────────────────

/**
 * Return cartera summary KPIs for an organisation.
 *
 * Safe to call from server components — all reads come from the already-
 * denormalized CustomerProfile columns.  Runs in parallel: aggregate totals +
 * count90Plus + activeDebtorCount + top5 list.
 *
 * @param organizationId  Target org.
 * @param window          Optional fiscal window. When provided, applies carry-over
 *                        rule: (lastPurchaseAt >= from) OR (overdueReceivable > 0).
 *                        Omit or pass undefined for full-history behavior.
 */
export async function getCarteraKpis(
  organizationId: string,
  window?: FiscalWindow,
): Promise<CarteraKpis> {
  const db = prisma as any;

  // Base WHERE clause — always scoped to ERP-linked customers in this org
  const baseWhere = {
    organizationId,
    erpId: { not: null },
    ...buildCarryOverWhere(window),
  };

  const [aggResult, count90Plus, activeDebtors, top5Raw] = await Promise.all([
    // Org-level aggregates
    db.customerProfile.aggregate({
      where: baseWhere,
      _sum: { totalReceivable: true, overdueReceivable: true },
      _max: { maxDpd: true },
    }),
    // Customers with maxDpd > 90 (critical exposure)
    db.customerProfile.count({
      where: { ...baseWhere, maxDpd: { gt: 90 } },
    }),
    // Customers with any overdue balance within the active window (carry-over bounded)
    db.customerProfile.count({
      where: {
        ...baseWhere,
        overdueReceivable: { gt: 0 },
      },
    }),
    // Top 5 by overdueReceivable for concentration analysis (bounded to active window)
    db.customerProfile.findMany({
      where: {
        ...baseWhere,
        overdueReceivable: { gt: 0 },
      },
      orderBy: { overdueReceivable: "desc" },
      take: 5,
      select: {
        slug:              true,
        name:              true,
        overdueReceivable: true,
        totalReceivable:   true,
        maxDpd:            true,
      },
    }),
  ]);

  const totalReceivable   = toNum(aggResult._sum.totalReceivable);
  const overdueReceivable = toNum(aggResult._sum.overdueReceivable);
  const maxDpd            = aggResult._max.maxDpd ?? 0;
  const overdueRatio      = totalReceivable > 0 ? (overdueReceivable / totalReceivable) * 100 : 0;

  const top5Debtors: TopDebtorRow[] = top5Raw.map((r: any) => ({
    slug:              r.slug,
    name:              r.name,
    overdueReceivable: toNum(r.overdueReceivable),
    totalReceivable:   toNum(r.totalReceivable),
    maxDpd:            r.maxDpd ?? 0,
    share:             overdueReceivable > 0
      ? (toNum(r.overdueReceivable) / overdueReceivable) * 100
      : 0,
  }));

  const topDebtor        = top5Debtors[0] ?? null;
  const concentrationRisk = topDebtor?.share ?? 0;
  const hasData          = totalReceivable > 0 || overdueReceivable > 0;

  return {
    hasData,
    currency:    "COP",
    windowLabel: window?.label ?? "Todo el historial",
    totalReceivable,
    overdueReceivable,
    overdueRatio,
    maxDpd,
    count90Plus,
    activeDebtors,
    topDebtor,
    concentrationRisk,
    top5Debtors,
  };
}
