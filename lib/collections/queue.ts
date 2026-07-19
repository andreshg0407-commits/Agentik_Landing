/**
 * lib/collections/queue.ts
 *
 * Collections work queue — sorted by combined risk signal.
 *
 * Produces a prioritised list of customers that need collection action today.
 * Reads exclusively from the denormalized CustomerProfile fields so no JOIN
 * against CustomerReceivable is needed (fast for large orgs).
 *
 * Sort key: riskScore DESC → maxDpd DESC → overdueReceivable DESC
 *
 * ── Fiscal window + carry-over rule ──────────────────────────────────────────
 *
 * The carry-over rule mandates that customers with overdue balances ALWAYS appear
 * in the collections queue, regardless of fiscal window. The window filter only
 * adds context: each row is annotated with isCarryOver = true when the customer's
 * last purchase falls before the window start (they are an old commercial
 * relationship whose debt carries into the current period).
 *
 * No rows are excluded due to window filtering — all overdue balances show up.
 *
 * Exports:
 *   getCollectionsQueue(orgId, limit?, window?)   → CollectionsQueueRow[]
 *   suggestAction(maxDpd, overdueRatio)           → SuggestedCollectionAction (pure)
 *   getWhoToCallToday(orgId, limit?, window?)     → top-N work queue (copilot-ready)
 */

import { Prisma }                        from "@prisma/client";
import { prisma }                        from "@/lib/prisma";
import type { FiscalWindow }             from "@/lib/finance/fiscal-window";
import { isCarryOver as checkCarryOver } from "@/lib/finance/fiscal-window";
import { suggestAction }                from "./suggest-action";
import type {
  CollectionChannel,
  CollectionPriority,
  RiskTier,
  SuggestedCollectionAction,
} from "./suggest-action";

// ── Re-export pure types (no prisma) for consumers ────────────────────────────
export type { CollectionChannel, CollectionPriority, RiskTier, SuggestedCollectionAction };
export { suggestAction };

export interface CollectionsQueueRow {
  slug:              string;
  name:              string;
  nit:               string | null;
  city:              string | null;
  sellerName:        string | null;
  overdueReceivable: number;
  totalReceivable:   number;
  maxDpd:            number;
  riskScore:         number | null;
  riskTier:          RiskTier;
  overdueRatio:      number;    // 0–100
  suggestedAction:   SuggestedCollectionAction;
  /**
   * True when the customer's last purchase predates the active fiscal window.
   * Indicates a carry-over balance from a prior fiscal year.
   * Always false when no fiscal window is active (full history mode).
   */
  isCarryOver:       boolean;
}

// ── Helper ────────────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isFinite(n) ? n : 0;
}

function riskTier(maxDpd: number, overdueRatio: number): RiskTier {
  if (maxDpd > 180 || overdueRatio > 90) return "CRITICAL";
  if (maxDpd > 90  || overdueRatio > 60) return "HIGH";
  if (maxDpd > 30  || overdueRatio > 30) return "MEDIUM";
  return "LOW";
}

// ── Main query ────────────────────────────────────────────────────────────────

// ── SQL date filter for CustomerReceivable ────────────────────────────────────

function buildRxDateSql(window: FiscalWindow): Prisma.Sql {
  if (window.mode === "full_history") return Prisma.sql``;

  if (window.mode === "current_and_prior") {
    // window.from is already Jan 1 of prior year — simple >= suffices
    return Prisma.sql`AND rx."invoiceDate" >= ${window.from}`;
  }

  // For all other modes: window + one-year carry-over for overdue docs
  const priorYearFrom = new Date(window.from);
  priorYearFrom.setFullYear(priorYearFrom.getFullYear() - 1);
  return Prisma.sql`
    AND (
      rx."invoiceDate" >= ${window.from}
      OR (
        rx."invoiceDate" >= ${priorYearFrom}
        AND rx."invoiceDate" <  ${window.from}
        AND rx."daysOverdue" > 0
      )
    )
  `;
}

// ── Queue row shape returned by the raw SQL ───────────────────────────────────

type RawQueueRow = {
  slug:           string;
  name:           string;
  nit:            string | null;
  city:           string | null;
  sellerName:     string | null;
  overdue:        number;
  total:          number;
  maxDpd:         number;
  riskScore:      string | null;
  lastPurchaseAt: Date   | null;
};

/**
 * Returns the collections work queue for an org, sorted by risk.
 *
 * When a fiscal window (other than full_history) is provided, the overdue
 * and total balances are computed from CustomerReceivable directly so that
 * old debts outside the window do not contaminate current-year KPIs.
 *
 * For full_history (or no window): reads the denormalized CustomerProfile
 * fields for speed — returns all customers with any outstanding balance.
 *
 * @param organizationId  Org to query.
 * @param limit           Max rows (default 50).
 * @param window          Optional fiscal window — controls which invoices count.
 */
export async function getCollectionsQueue(
  organizationId: string,
  limit  = 50,
  window?: FiscalWindow,
): Promise<CollectionsQueueRow[]> {
  const db = prisma as any;

  // ── Windowed path: query CustomerReceivable with date filter ───────────────
  if (window && window.mode !== "full_history") {
    const dateSql = buildRxDateSql(window);

    const rows = await prisma.$queryRaw<RawQueueRow[]>(Prisma.sql`
      SELECT
        cp.slug,
        cp.name,
        cp.nit,
        cp.city,
        cp."sellerName"                                                           AS "sellerName",
        SUM(CASE WHEN rx."daysOverdue" > 0 THEN rx."balanceDue" ELSE 0 END)::float8
                                                                                 AS overdue,
        SUM(rx."balanceDue")::float8                                             AS total,
        COALESCE(MAX(rx."daysOverdue"), 0)                                       AS "maxDpd",
        cp."riskScore"::text                                                     AS "riskScore",
        cp."lastPurchaseAt"
      FROM  "CustomerProfile"  cp
      JOIN  "CustomerReceivable" rx
        ON  rx."organizationId" = cp."organizationId"
        AND rx."customerId"     = cp.id
        AND rx.status IN ('OPEN', 'PARTIAL', 'OVERDUE')
        ${dateSql}
      WHERE cp."organizationId" = ${organizationId}
      GROUP BY cp.id, cp.slug, cp.name, cp.nit, cp.city, cp."sellerName", cp."riskScore", cp."lastPurchaseAt"
      HAVING SUM(CASE WHEN rx."daysOverdue" > 0 THEN rx."balanceDue" ELSE 0 END) > 0
      ORDER BY overdue DESC, "maxDpd" DESC
      LIMIT ${limit}
    `);

    return rows.map((r) => {
      const ov  = toNum(r.overdue);
      const tot = toNum(r.total);
      const dpd = toNum(r.maxDpd);
      const ovRatio = tot > 0 ? (ov / tot) * 100 : 0;
      return {
        slug:              r.slug,
        name:              r.name,
        nit:               r.nit ?? null,
        city:              r.city ?? null,
        sellerName:        r.sellerName ?? null,
        overdueReceivable: ov,
        totalReceivable:   tot,
        maxDpd:            dpd,
        riskScore:         r.riskScore != null ? Number(r.riskScore) : null,
        riskTier:          riskTier(dpd, ovRatio),
        overdueRatio:      ovRatio,
        suggestedAction:   suggestAction(dpd, ovRatio),
        isCarryOver:       checkCarryOver(r.lastPurchaseAt, window),
      };
    });
  }

  // ── Full-history path: fast denormalized read from CustomerProfile ──────────
  const rows = await db.customerProfile.findMany({
    where: {
      organizationId,
      overdueReceivable: { gt: 0 },
    },
    orderBy: [
      { riskScore:         "desc" },
      { maxDpd:            "desc" },
      { overdueReceivable: "desc" },
    ],
    take: limit,
    select: {
      slug:              true,
      name:              true,
      nit:               true,
      city:              true,
      sellerName:        true,
      overdueReceivable: true,
      totalReceivable:   true,
      maxDpd:            true,
      riskScore:         true,
      lastPurchaseAt:    true,
    },
  });

  return rows.map((r: any) => {
    const ov  = toNum(r.overdueReceivable);
    const tot = toNum(r.totalReceivable);
    const dpd = r.maxDpd ?? 0;
    const ovRatio = tot > 0 ? (ov / tot) * 100 : 0;

    return {
      slug:              r.slug,
      name:              r.name,
      nit:               r.nit ?? null,
      city:              r.city ?? null,
      sellerName:        r.sellerName ?? null,
      overdueReceivable: ov,
      totalReceivable:   tot,
      maxDpd:            dpd,
      riskScore:         r.riskScore != null ? Number(r.riskScore) : null,
      riskTier:          riskTier(dpd, ovRatio),
      overdueRatio:      ovRatio,
      suggestedAction:   suggestAction(dpd, ovRatio),
      isCarryOver:       window ? checkCarryOver(r.lastPurchaseAt, window) : false,
    };
  });
}

/**
 * Copilot-ready selector: top-N customers to contact today.
 *
 * Filters to URGENT + HIGH priority actions only.
 * Used by the copilot to answer "¿a quién debo llamar hoy?"
 */
export async function getWhoToCallToday(
  organizationId: string,
  limit  = 10,
  window?: FiscalWindow,
): Promise<CollectionsQueueRow[]> {
  const queue = await getCollectionsQueue(organizationId, 100, window);
  return queue
    .filter(r => r.suggestedAction.priority === "URGENT" || r.suggestedAction.priority === "HIGH")
    .slice(0, limit);
}
