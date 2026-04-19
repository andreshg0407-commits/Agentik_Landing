/**
 * Pipeline Intelligence — Query service for CRM deal pipeline.
 *
 * Provides KPI aggregations, at-risk deal detection, seller leaderboard,
 * lost deal analysis, and default stage seeding.
 *
 * NOTE: The Prisma migration for the new models has not run yet.
 * All new-model accessors are called via `(prisma as any).<accessor>`.
 * Raw SQL (prisma.$queryRaw + Prisma.sql) is used for complex aggregations
 * following the same patterns as lib/sales/data-explorer.ts.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// ── Public output types ────────────────────────────────────────────────────────

export interface PipelineStageKpi {
  key: string;
  label: string;
  order: number;
  color: string | null;
  count: number;
  totalAmount: number;
  avgAge: number;        // avg days since openedAt for deals in this stage
  probability: number;
}

export interface PipelineKpis {
  totalOpen: number;
  totalOpenAmount: number;
  weightedForecast: number;
  conversionRate: number;        // WON / (WON + LOST) last 90 days, 0-100
  avgDealCycleDays: number;
  byStage: PipelineStageKpi[];
  forecast: Array<{ month: string; amount: number; weightedAmount: number }>;
}

export interface DealRisk {
  id: string;
  title: string;
  customerName: string | null;
  sellerName: string | null;
  stage: string;
  amount: number;
  daysSinceLastActivity: number;
  expectedCloseAt: Date | null;
  riskFlags: string[];
}

export interface SellerPipelineRow {
  sellerSlug: string;
  sellerName: string;
  openDeals: number;
  openAmount: number;
  wonDeals: number;
  wonAmountL30: number;
  conversionRate: number;
  avgDaysToClose: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNumber(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  return Number(v);
}

function toNumberOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

/** Format a JS Date (or ISO string) as "YYYY-MM" for forecast grouping. */
function toYearMonth(d: Date | string | null): string {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Add N months to today and return the resulting Date. */
function monthsFromNow(n: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d;
}

/** ISO YYYY-MM string for the month that is N months ahead. */
function yearMonthOffset(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// ── getPipelineKpis ───────────────────────────────────────────────────────────

export async function getPipelineKpis(organizationId: string): Promise<PipelineKpis> {
  const db = prisma as any;

  // Fetch pipeline stages defined for this org (for byStage metadata)
  const stages: Array<{
    key: string;
    label: string;
    order: number;
    color: string | null;
    probability: number;
  }> = await db.pipelineStage.findMany({
    where: { organizationId },
    orderBy: { order: "asc" },
  });

  // All raw queries in parallel
  type OpenByStageRaw = {
    stage: string;
    count: string;
    total_amount: number;
    avg_age_days: number | null;
  };

  type ConversionRaw = {
    won_count: string;
    lost_count: string;
  };

  type CycleRaw = {
    avg_days: number | null;
  };

  type ForecastRaw = {
    month: string;
    total_amount: number;
    weighted_amount: number;
  };

  const [openByStage, conversionRaw, cycleRaw, forecastRaw, openTotals] = await Promise.all([
    // Open deals grouped by stage with avg age
    prisma.$queryRaw<OpenByStageRaw[]>(Prisma.sql`
      SELECT
        "stage",
        CAST(COUNT(*) AS TEXT)                                 AS count,
        SUM("amount")::float8                                  AS total_amount,
        AVG(EXTRACT(EPOCH FROM (NOW() - "openedAt")) / 86400)  AS avg_age_days
      FROM "CRMOpportunity"
      WHERE "organizationId" = ${organizationId}
        AND "status" = 'OPEN'
      GROUP BY "stage"
    `),

    // Conversion rate: WON / (WON + LOST) in last 90 days
    prisma.$queryRaw<ConversionRaw[]>(Prisma.sql`
      SELECT
        CAST(COUNT(*) FILTER (WHERE "status" = 'WON')  AS TEXT) AS won_count,
        CAST(COUNT(*) FILTER (WHERE "status" = 'LOST') AS TEXT) AS lost_count
      FROM "CRMOpportunity"
      WHERE "organizationId" = ${organizationId}
        AND "closedAt" >= NOW() - INTERVAL '90 days'
        AND "status" IN ('WON', 'LOST')
    `),

    // Avg deal cycle for WON deals (days from openedAt to closedAt)
    prisma.$queryRaw<CycleRaw[]>(Prisma.sql`
      SELECT
        AVG(EXTRACT(EPOCH FROM ("closedAt" - "openedAt")) / 86400) AS avg_days
      FROM "CRMOpportunity"
      WHERE "organizationId" = ${organizationId}
        AND "status" = 'WON'
        AND "closedAt" IS NOT NULL
    `),

    // Forecast: group OPEN+WON by expectedCloseAt month for next 3 months
    prisma.$queryRaw<ForecastRaw[]>(Prisma.sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', COALESCE("expectedCloseAt", "closedAt")), 'YYYY-MM') AS month,
        SUM("amount")::float8                                                             AS total_amount,
        SUM("amount" * "probability" / 100.0)::float8                                    AS weighted_amount
      FROM "CRMOpportunity"
      WHERE "organizationId" = ${organizationId}
        AND "status" IN ('OPEN', 'WON')
        AND COALESCE("expectedCloseAt", "closedAt") >= DATE_TRUNC('month', NOW())
        AND COALESCE("expectedCloseAt", "closedAt") < DATE_TRUNC('month', NOW()) + INTERVAL '3 months'
      GROUP BY 1
      ORDER BY 1
    `),

    // Open totals
    prisma.$queryRaw<Array<{ total_count: string; total_amount: number; weighted_forecast: number }>>(
      Prisma.sql`
        SELECT
          CAST(COUNT(*) AS TEXT)                       AS total_count,
          SUM("amount")::float8                        AS total_amount,
          SUM("amount" * "probability" / 100.0)::float8 AS weighted_forecast
        FROM "CRMOpportunity"
        WHERE "organizationId" = ${organizationId}
          AND "status" = 'OPEN'
      `,
    ),
  ]);

  // Build stage map from DB stages + open data
  const openMap = new Map(openByStage.map(r => [r.stage, r]));

  const byStage: PipelineStageKpi[] = stages.map(s => {
    const raw = openMap.get(s.key);
    return {
      key: s.key,
      label: s.label,
      order: s.order,
      color: s.color,
      count: raw ? Number(raw.count) : 0,
      totalAmount: raw ? toNumber(raw.total_amount) : 0,
      avgAge: raw?.avg_age_days != null ? Math.round(toNumber(raw.avg_age_days)) : 0,
      probability: s.probability,
    };
  });

  // For stages present in opportunities but not yet in PipelineStage table
  for (const raw of openByStage) {
    if (!byStage.find(s => s.key === raw.stage)) {
      byStage.push({
        key: raw.stage,
        label: raw.stage,
        order: 99,
        color: null,
        count: Number(raw.count),
        totalAmount: toNumber(raw.total_amount),
        avgAge: raw.avg_age_days != null ? Math.round(toNumber(raw.avg_age_days)) : 0,
        probability: 50,
      });
    }
  }

  byStage.sort((a, b) => a.order - b.order);

  const wonCount = Number(conversionRaw[0]?.won_count ?? 0);
  const lostCount = Number(conversionRaw[0]?.lost_count ?? 0);
  const conversionRate =
    wonCount + lostCount > 0
      ? Math.round((wonCount / (wonCount + lostCount)) * 10000) / 100
      : 0;

  const avgDealCycleDays =
    cycleRaw[0]?.avg_days != null ? Math.round(toNumber(cycleRaw[0].avg_days)) : 0;

  // Build forecast for next 3 months (fill in months with no data as 0)
  const forecastMap = new Map(forecastRaw.map(r => [r.month, r]));
  const forecast = [0, 1, 2].map(offset => {
    const month = yearMonthOffset(offset);
    const raw = forecastMap.get(month);
    return {
      month,
      amount: raw ? toNumber(raw.total_amount) : 0,
      weightedAmount: raw ? toNumber(raw.weighted_amount) : 0,
    };
  });

  const totalRow = openTotals[0];
  return {
    totalOpen: Number(totalRow?.total_count ?? 0),
    totalOpenAmount: toNumber(totalRow?.total_amount),
    weightedForecast: toNumber(totalRow?.weighted_forecast),
    conversionRate,
    avgDealCycleDays,
    byStage,
    forecast,
  };
}

// ── getAtRiskDeals ────────────────────────────────────────────────────────────

export async function getAtRiskDeals(
  organizationId: string,
  noActivityDays = 14,
): Promise<DealRisk[]> {
  const db = prisma as any;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - noActivityDays);
  const now = new Date();

  // Find OPEN deals that are inactive or overdue
  const deals: Array<{
    id: string;
    title: string;
    stage: string;
    amount: unknown;
    sellerName: string | null;
    expectedCloseAt: Date | null;
    lastActivityAt: Date | null;
    openedAt: Date;
    customerId: string | null;
  }> = await db.cRMOpportunity.findMany({
    where: {
      organizationId,
      status: "OPEN",
      OR: [
        { lastActivityAt: { lt: cutoffDate } },
        { lastActivityAt: null },
        { expectedCloseAt: { lt: now } },
      ],
    },
    orderBy: { amount: "desc" },
    take: 100,
    include: {
      customer: {
        select: { name: true },
      },
    },
  });

  return deals.map((d: any) => {
    const daysSinceLastActivity =
      d.lastActivityAt != null
        ? Math.floor((now.getTime() - new Date(d.lastActivityAt).getTime()) / 86_400_000)
        : Math.floor((now.getTime() - new Date(d.openedAt).getTime()) / 86_400_000);

    const riskFlags: string[] = [];

    if (daysSinceLastActivity >= noActivityDays) {
      riskFlags.push(`no_activity_${daysSinceLastActivity}d`);
    }

    if (d.expectedCloseAt != null && new Date(d.expectedCloseAt) < now) {
      riskFlags.push("past_due_date");
    }

    if (toNumber(d.amount) > 50_000_000) {
      riskFlags.push("large_deal");
    }

    return {
      id: d.id,
      title: d.title,
      customerName: d.customer?.name ?? null,
      sellerName: d.sellerName ?? null,
      stage: d.stage,
      amount: toNumber(d.amount),
      daysSinceLastActivity,
      expectedCloseAt: d.expectedCloseAt ? new Date(d.expectedCloseAt) : null,
      riskFlags,
    };
  });
}

// ── getSellerLeaderboard ──────────────────────────────────────────────────────

export async function getSellerLeaderboard(
  organizationId: string,
): Promise<SellerPipelineRow[]> {
  type RawRow = {
    seller_slug: string;
    seller_name: string;
    open_deals: string;
    open_amount: number;
    won_deals_l30: string;
    won_amount_l30: number;
    won_total: string;
    lost_total: string;
    avg_days_to_close: number | null;
  };

  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT
      COALESCE("sellerSlug", 'unknown')                      AS seller_slug,
      COALESCE(MAX("sellerName"), 'Desconocido')             AS seller_name,

      CAST(COUNT(*) FILTER (WHERE "status" = 'OPEN')   AS TEXT)                         AS open_deals,
      SUM(CASE WHEN "status" = 'OPEN' THEN "amount" ELSE 0 END)::float8                 AS open_amount,

      CAST(COUNT(*) FILTER (
        WHERE "status" = 'WON'
          AND "closedAt" >= NOW() - INTERVAL '30 days'
      ) AS TEXT)                                                                          AS won_deals_l30,
      SUM(CASE WHEN "status" = 'WON'
               AND "closedAt" >= NOW() - INTERVAL '30 days'
               THEN "amount" ELSE 0 END)::float8                                         AS won_amount_l30,

      CAST(COUNT(*) FILTER (
        WHERE "status" = 'WON' AND "closedAt" >= NOW() - INTERVAL '90 days'
      ) AS TEXT)                                                                          AS won_total,
      CAST(COUNT(*) FILTER (
        WHERE "status" = 'LOST' AND "closedAt" >= NOW() - INTERVAL '90 days'
      ) AS TEXT)                                                                          AS lost_total,

      AVG(CASE WHEN "status" = 'WON' AND "closedAt" IS NOT NULL
          THEN EXTRACT(EPOCH FROM ("closedAt" - "openedAt")) / 86400
          ELSE NULL END)                                                                  AS avg_days_to_close

    FROM "CRMOpportunity"
    WHERE "organizationId" = ${organizationId}
    GROUP BY "sellerSlug"
    ORDER BY open_amount DESC
  `);

  return rows.map(r => {
    const won = Number(r.won_total ?? 0);
    const lost = Number(r.lost_total ?? 0);
    const conversionRate =
      won + lost > 0 ? Math.round((won / (won + lost)) * 10000) / 100 : 0;

    return {
      sellerSlug: r.seller_slug,
      sellerName: r.seller_name,
      openDeals: Number(r.open_deals ?? 0),
      openAmount: toNumber(r.open_amount),
      wonDeals: Number(r.won_deals_l30 ?? 0),
      wonAmountL30: toNumber(r.won_amount_l30),
      conversionRate,
      avgDaysToClose:
        r.avg_days_to_close != null ? Math.round(toNumber(r.avg_days_to_close)) : null,
    };
  });
}

// ── getLostDealAnalysis ───────────────────────────────────────────────────────

export async function getLostDealAnalysis(
  organizationId: string,
  lastNDays = 90,
): Promise<Array<{ reason: string; count: number; totalAmount: number }>> {
  type RawRow = {
    reason: string;
    count: string;
    total_amount: number;
  };

  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT
      COALESCE("lossReason", 'Sin razón especificada')   AS reason,
      CAST(COUNT(*) AS TEXT)                              AS count,
      SUM("amount")::float8                               AS total_amount
    FROM "CRMOpportunity"
    WHERE "organizationId" = ${organizationId}
      AND "status" = 'LOST'
      AND "closedAt" >= NOW() - INTERVAL '1 day' * ${lastNDays}
    GROUP BY "lossReason"
    ORDER BY total_amount DESC
  `);

  return rows.map(r => ({
    reason: r.reason,
    count: Number(r.count),
    totalAmount: toNumber(r.total_amount),
  }));
}

// ── hasCrmData ────────────────────────────────────────────────────────────────

/**
 * Returns true if the org has at least one CRMOpportunity row.
 * Used by the pipeline page to distinguish "empty pipeline" from
 * "CRM has never been synced" so the UI can show the right empty state.
 */
export async function hasCrmData(organizationId: string): Promise<boolean> {
  const db = prisma as any;
  try {
    const count = await db.cRMOpportunity.count({ where: { organizationId } });
    return count > 0;
  } catch {
    return false;
  }
}

// ── getQuotesPipelineSummary ──────────────────────────────────────────────────

export interface QuoteStageKpi {
  /** CRMQuote.status enum value (DRAFT, SENT, ACCEPTED, REJECTED, EXPIRED) */
  status:      string;
  count:       number;
  totalAmount: number;
}

export interface RecentQuote {
  id:            string;
  crmId:         string | null;
  quoteNumber:   string | null;
  customerName:  string | null;
  sellerName:    string | null;
  status:        string;
  amount:        number;
  currency:      string;
  issuedAt:      Date;
  // Extracted from rawCrmJson (AOS_Quotes custom fields)
  quoteName:     string | null;   // AOS_Quotes.name
  stage:         string | null;   // AOS_Quotes.stage (raw string, e.g. "Confirmed")
  invoiceStatus: string | null;   // invoice_status
  idSag:         string | null;   // id_sag_c
  respuestaSag:  string | null;   // respuesta_sag_c
  sucursal:      string | null;   // sucursal_c
  listaPrecios:  string | null;   // lista_precios_c
}

export interface QuotesPipelineSummary {
  totalQuotes:  number;
  totalAmount:  number;
  byStage:      QuoteStageKpi[];
  recentQuotes: RecentQuote[];
}

/**
 * Aggregate CRMQuote data for the pipeline page.
 * Groups by status and returns the last 20 quotes ordered by issuedAt desc.
 * Custom AOS_Quotes fields (id_sag_c, stage, etc.) are extracted from rawCrmJson.
 */
export async function getQuotesPipelineSummary(
  organizationId: string,
): Promise<QuotesPipelineSummary> {
  const db = prisma as any;

  type StatusAgg = { status: string; count: string; total_amount: number };

  const [byStatusRaw, recentRaw] = await Promise.all([
    prisma.$queryRaw<StatusAgg[]>(Prisma.sql`
      SELECT
        "status",
        CAST(COUNT(*) AS TEXT) AS count,
        SUM("amount")::float8  AS total_amount
      FROM "CRMQuote"
      WHERE "organizationId" = ${organizationId}
      GROUP BY "status"
      ORDER BY total_amount DESC
    `),
    db.cRMQuote.findMany({
      where:   { organizationId },
      orderBy: { issuedAt: "desc" },
      take:    20,
      include: { customer: { select: { name: true } } },
    }),
  ]);

  function rawStr(obj: Record<string, unknown>, key: string): string | null {
    const v = obj[key];
    if (v == null || String(v).trim() === "" || String(v) === "null") return null;
    return String(v).trim();
  }

  const recentQuotes: RecentQuote[] = (recentRaw as any[]).map(q => {
    const raw = ((q.rawCrmJson as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
    // rawCrmJson stores the flattened V8 row ({ raw: { name, stage, ... } })
    const attrs = (raw["raw"] as Record<string, unknown> | null) ?? raw;
    return {
      id:            String(q.id),
      crmId:         q.crmId     ?? null,
      quoteNumber:   q.quoteNumber ?? null,
      customerName:  (q as any).customer?.name ?? null,
      sellerName:    q.sellerName ?? null,
      status:        String(q.status),
      amount:        toNumber(q.amount),
      currency:      String(q.currency ?? "COP"),
      issuedAt:      new Date(q.issuedAt),
      quoteName:     rawStr(attrs, "name"),
      stage:         rawStr(attrs, "stage"),
      invoiceStatus: rawStr(attrs, "invoice_status"),
      idSag:         rawStr(attrs, "id_sag_c"),
      respuestaSag:  rawStr(attrs, "respuesta_sag_c"),
      sucursal:      rawStr(attrs, "sucursal_c"),
      listaPrecios:  rawStr(attrs, "lista_precios_c"),
    };
  });

  const byStage: QuoteStageKpi[] = byStatusRaw.map(r => ({
    status:      String(r.status),
    count:       Number(r.count),
    totalAmount: toNumber(r.total_amount),
  }));

  const totalQuotes = byStage.reduce((s, r) => s + r.count, 0);
  const totalAmount = byStage.reduce((s, r) => s + r.totalAmount, 0);

  return { totalQuotes, totalAmount, byStage, recentQuotes };
}

/** Returns true if any CRMQuote rows exist for this org. */
export async function hasQuotesData(organizationId: string): Promise<boolean> {
  const db = prisma as any;
  try {
    const count = await db.cRMQuote.count({ where: { organizationId } });
    return count > 0;
  } catch {
    return false;
  }
}

// ── ensureDefaultPipelineStages ───────────────────────────────────────────────

const DEFAULT_STAGES = [
  { key: "prospect",     label: "Prospecto",    order: 1, isWon: false, isLost: false, color: "#94a3b8", probability: 20 },
  { key: "qualified",    label: "Calificado",   order: 2, isWon: false, isLost: false, color: "#60a5fa", probability: 40 },
  { key: "proposal",     label: "Propuesta",    order: 3, isWon: false, isLost: false, color: "#a78bfa", probability: 60 },
  { key: "negotiation",  label: "Negociación",  order: 4, isWon: false, isLost: false, color: "#fb923c", probability: 80 },
  { key: "closed_won",   label: "Ganado",       order: 5, isWon: true,  isLost: false, color: "#4ade80", probability: 100 },
  { key: "closed_lost",  label: "Perdido",      order: 6, isWon: false, isLost: true,  color: "#f87171", probability: 0 },
] as const;

export async function ensureDefaultPipelineStages(
  organizationId: string,
): Promise<void> {
  const db = prisma as any;

  const existingCount: number = await db.pipelineStage.count({
    where: { organizationId },
  });

  if (existingCount > 0) return;

  await db.pipelineStage.createMany({
    data: DEFAULT_STAGES.map(s => ({
      organizationId,
      key: s.key,
      label: s.label,
      order: s.order,
      isWon: s.isWon,
      isLost: s.isLost,
      color: s.color,
      probability: s.probability,
    })),
    skipDuplicates: true,
  });
}
