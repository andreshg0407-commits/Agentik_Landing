/**
 * lib/customers/cartera-selectors.ts
 *
 * Copilot-ready selectors for cartera risk intelligence.
 *
 * All functions query the denormalized CustomerProfile fields
 * (totalReceivable, overdueReceivable, maxDpd).  They return structured,
 * serializable arrays that can be passed to the AI copilot or rendered
 * directly in dashboards.
 *
 * Exports:
 *   getTopDebtors          → top N by overdueReceivable
 *   getHighestDpdCustomers → top N by maxDpd
 *   getOverdueConcentration → org-level concentration metrics
 */

import { prisma } from "@/lib/prisma";

// ── Output types ──────────────────────────────────────────────────────────────

export interface DebtorRow {
  slug:              string;
  name:              string;
  nit:               string | null;
  city:              string | null;
  sellerName:        string | null;
  totalReceivable:   number;
  overdueReceivable: number;
  maxDpd:            number;
  /** share of this customer's overdue vs. org total overdue (0–100) */
  shareOfTotal:      number;
  riskTier:          "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
}

export interface OverdueConcentration {
  orgTotal:          number;
  top1Share:         number;   // top debtor's % of org total overdue
  top3Share:         number;
  top5Share:         number;
  isHighConcentration: boolean;  // true when top 3 > 50%
}

// ── Helper ────────────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isFinite(n) ? n : 0;
}

function riskTier(maxDpd: number, overdueRatio: number): DebtorRow["riskTier"] {
  if (maxDpd > 180 || overdueRatio > 90) return "CRITICAL";
  if (maxDpd > 90  || overdueRatio > 60) return "HIGH";
  if (maxDpd > 30  || overdueRatio > 30) return "MEDIUM";
  return "LOW";
}

// ── Selectors ─────────────────────────────────────────────────────────────────

/**
 * Top N customers by overdueReceivable (descending).
 * Copilot uses this to answer "¿quiénes son los mayores deudores?"
 */
export async function getTopDebtors(
  organizationId: string,
  limit = 10,
): Promise<DebtorRow[]> {
  const db = prisma as any;

  const [rows, orgAgg] = await Promise.all([
    db.customerProfile.findMany({
      where:   { organizationId, overdueReceivable: { gt: 0 } },
      orderBy: { overdueReceivable: "desc" },
      take:    limit,
      select: {
        slug:              true,
        name:              true,
        nit:               true,
        city:              true,
        sellerName:        true,
        totalReceivable:   true,
        overdueReceivable: true,
        maxDpd:            true,
      },
    }),
    db.customerProfile.aggregate({
      where: { organizationId },
      _sum:  { overdueReceivable: true },
    }),
  ]);

  const orgTotal = toNum(orgAgg._sum.overdueReceivable);

  return rows.map((r: any) => {
    const ov  = toNum(r.overdueReceivable);
    const tot = toNum(r.totalReceivable);
    return {
      slug:              r.slug,
      name:              r.name,
      nit:               r.nit,
      city:              r.city,
      sellerName:        r.sellerName,
      totalReceivable:   tot,
      overdueReceivable: ov,
      maxDpd:            r.maxDpd ?? 0,
      shareOfTotal:      orgTotal > 0 ? (ov / orgTotal) * 100 : 0,
      riskTier:          riskTier(r.maxDpd ?? 0, tot > 0 ? (ov / tot) * 100 : 0),
    };
  });
}

/**
 * Top N customers by maxDpd (descending).
 * Copilot uses this to answer "¿quiénes llevan más tiempo sin pagar?"
 */
export async function getHighestDpdCustomers(
  organizationId: string,
  limit = 10,
): Promise<DebtorRow[]> {
  const db = prisma as any;

  const [rows, orgAgg] = await Promise.all([
    db.customerProfile.findMany({
      where:   { organizationId, maxDpd: { gt: 0 } },
      orderBy: { maxDpd: "desc" },
      take:    limit,
      select: {
        slug:              true,
        name:              true,
        nit:               true,
        city:              true,
        sellerName:        true,
        totalReceivable:   true,
        overdueReceivable: true,
        maxDpd:            true,
      },
    }),
    db.customerProfile.aggregate({
      where: { organizationId },
      _sum:  { overdueReceivable: true },
    }),
  ]);

  const orgTotal = toNum(orgAgg._sum.overdueReceivable);

  return rows.map((r: any) => {
    const ov  = toNum(r.overdueReceivable);
    const tot = toNum(r.totalReceivable);
    return {
      slug:              r.slug,
      name:              r.name,
      nit:               r.nit,
      city:              r.city,
      sellerName:        r.sellerName,
      totalReceivable:   tot,
      overdueReceivable: ov,
      maxDpd:            r.maxDpd ?? 0,
      shareOfTotal:      orgTotal > 0 ? (ov / orgTotal) * 100 : 0,
      riskTier:          riskTier(r.maxDpd ?? 0, tot > 0 ? (ov / tot) * 100 : 0),
    };
  });
}

/**
 * Concentration metrics: how much of the org's overdue is concentrated
 * in the top 1 / 3 / 5 debtors.
 * Copilot uses this for concentration risk analysis.
 */
export async function getOverdueConcentration(
  organizationId: string,
): Promise<OverdueConcentration> {
  const db = prisma as any;

  const [top5Raw, orgAgg] = await Promise.all([
    db.customerProfile.findMany({
      where:   { organizationId, overdueReceivable: { gt: 0 } },
      orderBy: { overdueReceivable: "desc" },
      take:    5,
      select:  { overdueReceivable: true },
    }),
    db.customerProfile.aggregate({
      where: { organizationId },
      _sum:  { overdueReceivable: true },
    }),
  ]);

  const orgTotal = toNum(orgAgg._sum.overdueReceivable);
  const amounts  = top5Raw.map((r: any) => toNum(r.overdueReceivable));

  const pct = (n: number) => orgTotal > 0 ? (n / orgTotal) * 100 : 0;
  const top1 = amounts[0] ?? 0;
  const top3 = amounts.slice(0, 3).reduce((s: number, v: number) => s + v, 0);
  const top5 = amounts.reduce((s: number, v: number) => s + v, 0);

  return {
    orgTotal,
    top1Share: pct(top1),
    top3Share: pct(top3),
    top5Share: pct(top5),
    isHighConcentration: pct(top3) > 50,
  };
}
