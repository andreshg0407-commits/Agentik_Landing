/**
 * Customer 360 — Query service for the commercial intelligence platform.
 *
 * Uses Prisma ORM for CustomerProfile / CRM table reads and writes.
 * Uses raw SQL (Prisma.$queryRaw + Prisma.sql) for SaleRecord aggregations,
 * following the same patterns as lib/sales/data-explorer.ts.
 *
 * NOTE: The Prisma migration for the new models has not run yet.
 * All new-model accessors are called via `(prisma as any).<accessor>` and
 * local TypeScript types are used instead of @prisma/client generated types.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// ── Local type mirrors for new Prisma models ──────────────────────────────────
// These mirror the schema exactly so callers get full type-safety even before
// the migration is applied.

export interface CustomerProfile_type {
  id: string;
  organizationId: string;
  erpId: string | null;
  crmId: string | null;
  nit: string | null;
  nitNormalized: string | null;
  sagTerceroId: number | null;
  slug: string;
  name: string;
  legalName: string | null;
  status: string;
  segment: string | null;
  customerType: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  department: string | null;
  address: string | null;
  sellerSlug: string | null;
  sellerName: string | null;
  ltv: number | null;
  lastPurchaseAt: Date | null;
  purchasePeriods: number;
  avgMonthlyRevenue: number | null;
  avgTicket: number | null;
  totalSalesL12: number | null;
  totalReceivable: number | null;
  overdueReceivable: number | null;
  maxDpd: number | null;
  healthScore: number | null;
  riskScore: number | null;
  churnRisk: string | null;
  nextBestAction: string | null;
  aiSummary: string | null;
  scoredAt: Date | null;
  erpSyncedAt: Date | null;
  crmSyncedAt: Date | null;
  rawErpJson: unknown | null;
  rawCrmJson: unknown | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerReceivable_type {
  id: string;
  organizationId: string;
  customerId: string | null;
  erpId: string | null;
  invoiceNumber: string | null;
  customerNit: string | null;
  customerName: string;
  originalAmount: number;
  paidAmount: number;
  balanceDue: number;
  currency: string;
  invoiceDate: Date;
  dueDate: Date;
  paidAt: Date | null;
  daysOverdue: number;
  agingBucket: string;
  status: string;
  rawErpJson: unknown | null;
  syncedAt: Date;
  // Reconciliation fields — populated from PaymentAllocation joins
  appliedDocuments: Array<{
    id: string;
    type: "PAGO" | "ND" | "AJUSTE";
    amount: number;
    date: Date | null;
    reference: string | null;
    method: string | null;
  }>;
  appliedTotal:     number;
  remainingBalance: number;
  recoStatus:       "SIN_SOPORTE" | "PARCIAL" | "CONCILIADA" | "EXCESO";
}

export interface CRMOpportunity_type {
  id: string;
  organizationId: string;
  customerId: string | null;
  crmId: string | null;
  title: string;
  stage: string;
  amount: number;
  currency: string;
  probability: number;
  openedAt: Date;
  expectedCloseAt: Date | null;
  closedAt: Date | null;
  lastActivityAt: Date | null;
  status: string;
  lossReason: string | null;
  lossNote: string | null;
  sellerSlug: string | null;
  sellerName: string | null;
  aiCloseProbability: number | null;
  riskFlags: string[];
  rawCrmJson: unknown | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CRMActivity_type {
  id: string;
  organizationId: string;
  customerId: string | null;
  opportunityId: string | null;
  crmId: string | null;
  type: string;
  subject: string | null;
  body: string | null;
  outcome: string | null;
  occurredAt: Date;
  dueAt: Date | null;
  completedAt: Date | null;
  sellerSlug: string | null;
  sellerName: string | null;
  rawCrmJson: unknown | null;
  createdAt: Date;
}

export interface CRMQuote_type {
  id: string;
  organizationId: string;
  customerId: string | null;
  opportunityId: string | null;
  crmId: string | null;
  quoteNumber: string | null;
  status: string;
  amount: number;
  currency: string;
  issuedAt: Date;
  expiresAt: Date | null;
  respondedAt: Date | null;
  sellerSlug: string | null;
  sellerName: string | null;
  rawCrmJson: unknown | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Public output types ────────────────────────────────────────────────────────

export interface CustomerSummary {
  id: string;
  slug: string;
  nit: string | null;
  name: string;
  status: string;
  segment: string | null;
  sellerName: string | null;
  city: string | null;
  ltv: number | null;
  lastPurchaseAt: Date | null;
  totalReceivable: number | null;
  overdueReceivable: number | null;
  churnRisk: string | null;
  healthScore: number | null;
  openOpportunities: number;
  totalSalesL12: number | null;
}

export interface Customer360 {
  profile: CustomerProfile_type;
  salesSummary: {
    totalSalesAllTime: number;
    totalSalesL12: number;
    totalSalesL3: number;
    avgMonthlyRevenue: number;
    avgTicket: number | null;
    purchasePeriods: number;
    lastPurchaseAt: string | null;
    topLines: Array<{ productLine: string; amount: number; share: number }>;
    monthlyTrend: Array<{ period: string; amount: number }>;
    /** Source split — Fuente 1 (OFICIAL) vs Fuente 2 (REMISION) — last 12 months. */
    source: {
      oficialAmountL12:    number;
      remisionAmountL12:   number;
      conversionRate:      number;   // % of total volume that is officially invoiced
      remisionPendingCount: number;  // count of REMISION records in last 12 months
      hasSourceData:       boolean;
    };
  };
  receivables: {
    total: number;
    overdue: number;
    current: number;
    maxDpd: number;
    byBucket: Array<{ bucket: string; amount: number; count: number }>;
    documents: CustomerReceivable_type[];
    /** Total open docs in DB (before take:20 slice) — for "Mostrando X de Y" */
    totalOpenCount: number;
  };
  opportunities: CRMOpportunity_type[];
  recentActivities: CRMActivity_type[];
  quotes: CRMQuote_type[];
  aiInsight: {
    riskScore: number | null;
    churnRisk: string | null;
    healthScore: number | null;
    nextBestAction: string | null;
    aiSummary: string | null;
    scoredAt: Date | null;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Safely cast a Prisma Decimal-serialized value to a plain JS number. */
function toNumber(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  return Number(v);
}

function toNumberOrNull(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// ── searchCustomers ───────────────────────────────────────────────────────────

export async function searchCustomers(
  organizationId: string,
  query?: string,
  filters?: {
    status?: string;
    churnRisk?: string;
    sellerSlug?: string;
    hasOverdue?: boolean;
  },
  limit = 50,
): Promise<CustomerSummary[]> {
  const db = prisma as any;

  // Build Prisma where clause
  const where: Record<string, unknown> = { organizationId };

  if (filters?.status) where.status = filters.status;
  if (filters?.churnRisk) where.churnRisk = filters.churnRisk;
  if (filters?.sellerSlug) where.sellerSlug = filters.sellerSlug;
  if (filters?.hasOverdue === true) {
    where.overdueReceivable = { gt: 0 };
  }

  if (query) {
    where.OR = [
      { name: { contains: query, mode: "insensitive" } },
      { nit: { contains: query, mode: "insensitive" } },
      { legalName: { contains: query, mode: "insensitive" } },
    ];
  }

  const rows: CustomerProfile_type[] = await db.customerProfile.findMany({
    where,
    take: limit,
    orderBy: [{ ltv: "desc" }, { name: "asc" }],
    include: {
      _count: {
        select: { crmOpportunities: { where: { status: "OPEN" } } },
      },
    },
  });

  return rows.map((r: any) => ({
    id: r.id,
    slug: r.slug,
    nit: r.nit,
    name: r.name,
    status: r.status,
    segment: r.segment,
    sellerName: r.sellerName,
    city: r.city,
    ltv: toNumberOrNull(r.ltv),
    lastPurchaseAt: r.lastPurchaseAt,
    totalReceivable: toNumberOrNull(r.totalReceivable),
    overdueReceivable: toNumberOrNull(r.overdueReceivable),
    churnRisk: r.churnRisk,
    healthScore: toNumberOrNull(r.healthScore),
    openOpportunities: r._count?.crmOpportunities ?? 0,
    totalSalesL12: toNumberOrNull(r.totalSalesL12),
  }));
}

// ── getCustomer360 ────────────────────────────────────────────────────────────

export async function getCustomer360(
  organizationId: string,
  slug: string,
): Promise<Customer360 | null> {
  const db = prisma as any;

  // 1. Load profile
  const profile: CustomerProfile_type | null = await db.customerProfile.findFirst({
    where: { organizationId, slug },
  });

  if (!profile) return null;

  const customerId  = profile.id;
  const customerNit = profile.nit ?? profile.nitNormalized;
  // SaleRecord.customerNit stores the SAG tercero integer ID (ka_nl_tercero), NOT the real NIT.
  // Use sagTerceroId as the lookup key for all SaleRecord queries.
  const saleNitKey  = profile.sagTerceroId != null ? String(profile.sagTerceroId) : customerNit;

  // 2. Run all queries in parallel
  const [
    salesAllTime,
    salesL12,
    salesL3,
    topLines,
    monthlyTrend,
    receivableRows,
    receivableBuckets,
    opportunities,
    quotes,
    sourceSplit,
    totalOpenCount,
  ] = await Promise.all([
    // Total sales all time for this customer NIT
    customerNit
      ? prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`
          SELECT SUM("amount")::float8 AS total
          FROM "SaleRecord"
          WHERE "organizationId" = ${organizationId}
            AND "customerNit" = ${saleNitKey}
            AND "productLine" NOT ILIKE 'Total %'
            AND "productLine" NOT ILIKE 'Subtotal%'
        `)
      : Promise.resolve([{ total: 0 }]),

    // Sales last 12 months
    customerNit
      ? prisma.$queryRaw<Array<{ total: number; periods: string; last_date: string | null; avg_ticket: number | null }>>(Prisma.sql`
          SELECT
            SUM("amount")::float8                             AS total,
            CAST(COUNT(DISTINCT "periodoAoMes") AS TEXT)      AS periods,
            TO_CHAR(MAX("saleDate"), 'YYYY-MM-DD')            AS last_date,
            CASE
              WHEN SUM("txCount") IS NOT NULL AND SUM("txCount")::float8 > 0
              THEN (SUM("amount") / SUM("txCount"))::float8
              ELSE NULL
            END                                               AS avg_ticket
          FROM "SaleRecord"
          WHERE "organizationId" = ${organizationId}
            AND "customerNit" = ${saleNitKey}
            AND "productLine" NOT ILIKE 'Total %'
            AND "productLine" NOT ILIKE 'Subtotal%'
            AND "saleDate" >= NOW() - INTERVAL '12 months'
        `)
      : Promise.resolve([{ total: 0, periods: "0", last_date: null, avg_ticket: null }]),

    // Sales last 3 months
    customerNit
      ? prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`
          SELECT SUM("amount")::float8 AS total
          FROM "SaleRecord"
          WHERE "organizationId" = ${organizationId}
            AND "customerNit" = ${saleNitKey}
            AND "productLine" NOT ILIKE 'Total %'
            AND "productLine" NOT ILIKE 'Subtotal%'
            AND "saleDate" >= NOW() - INTERVAL '3 months'
        `)
      : Promise.resolve([{ total: 0 }]),

    // Top product lines all time
    customerNit
      ? prisma.$queryRaw<Array<{ product_line: string; amount: number }>>(Prisma.sql`
          SELECT
            "productLine"         AS product_line,
            SUM("amount")::float8 AS amount
          FROM "SaleRecord"
          WHERE "organizationId" = ${organizationId}
            AND "customerNit" = ${saleNitKey}
            AND "productLine" NOT ILIKE 'Total %'
            AND "productLine" NOT ILIKE 'Subtotal%'
          GROUP BY "productLine"
          ORDER BY amount DESC
          LIMIT 10
        `)
      : Promise.resolve([]),

    // Monthly trend — last 12 periods
    customerNit
      ? prisma.$queryRaw<Array<{ period: string; amount: number }>>(Prisma.sql`
          SELECT
            "periodoAoMes"        AS period,
            SUM("amount")::float8 AS amount
          FROM "SaleRecord"
          WHERE "organizationId" = ${organizationId}
            AND "customerNit" = ${saleNitKey}
            AND "productLine" NOT ILIKE 'Total %'
            AND "productLine" NOT ILIKE 'Subtotal%'
            AND "periodoAoMes" IS NOT NULL
            AND "saleDate" >= NOW() - INTERVAL '12 months'
          GROUP BY "periodoAoMes"
          ORDER BY "periodoAoMes" ASC
        `)
      : Promise.resolve([]),

    // Top 20 open receivable documents — keyed by customerId (SAG tercero NIT ≠ real NIT)
    // Include PaymentAllocation joins to compute per-invoice reconciliation status.
    db.customerReceivable.findMany({
      where: {
        organizationId,
        customerId,
        status: { in: ["OPEN", "OVERDUE", "PARTIAL"] },
      },
      orderBy: { dueDate: "asc" },
      take: 20,
      include: {
        allocations: {
          select: {
            id:              true,
            allocatedAmount: true,
            payment: {
              select: { paymentDate: true, paymentMethod: true, documentType: true, reference: true },
            },
          },
        },
      },
    }),

    // Receivable bucket summary — keyed by customerId only
    prisma.$queryRaw<Array<{ bucket: string; amount: number; count: string }>>(Prisma.sql`
      SELECT
        "agingBucket"               AS bucket,
        SUM("balanceDue")::float8   AS amount,
        CAST(COUNT(*) AS TEXT)      AS count
      FROM "CustomerReceivable"
      WHERE "organizationId" = ${organizationId}
        AND "customerId" = ${customerId}
        AND "status" IN ('OPEN', 'PARTIAL', 'OVERDUE')
      GROUP BY "agingBucket"
      ORDER BY "agingBucket"
    `),

    // Open opportunities
    db.cRMOpportunity.findMany({
      where: { organizationId, customerId, status: "OPEN" },
      orderBy: { amount: "desc" },
    }),

    // Last 5 quotes
    db.cRMQuote.findMany({
      where: { organizationId, customerId },
      orderBy: { issuedAt: "desc" },
      take: 5,
    }),

    // Source split: Fuente 1 (OFICIAL) vs Fuente 2 (REMISION) — last 12 months
    customerNit
      ? prisma.$queryRaw<Array<{ source: string; amount: number; count: string }>>(Prisma.sql`
          SELECT
            "sagSourceType"::text          AS source,
            SUM("amount")::float8          AS amount,
            CAST(COUNT(*) AS TEXT)         AS count
          FROM "SaleRecord"
          WHERE "organizationId" = ${organizationId}
            AND "customerNit" = ${saleNitKey}
            AND "saleDate" >= NOW() - INTERVAL '12 months'
            AND "productLine" NOT ILIKE 'Total %'
            AND "productLine" NOT ILIKE 'Subtotal%'
          GROUP BY "sagSourceType"
        `)
      : Promise.resolve([]),

    // Total open receivable count (no take limit) — for "Mostrando X de Y"
    db.customerReceivable.count({
      where: {
        organizationId,
        customerId,
        status: { in: ["OPEN", "OVERDUE", "PARTIAL"] },
      },
    }),
  ]);

  // Load last 10 activities — include those linked via opportunity so records
  // synced before the customer profile existed are not silently dropped.
  const opportunityIds = (opportunities as CRMOpportunity_type[]).map(o => o.id);
  const recentActivities: CRMActivity_type[] = await db.cRMActivity.findMany({
    where: {
      organizationId,
      OR: [
        { customerId },
        ...(opportunityIds.length > 0 ? [{ opportunityId: { in: opportunityIds } }] : []),
      ],
    },
    orderBy: { occurredAt: "desc" },
    take: 10,
  });

  // Compute sales summary
  const totalSalesAllTime = toNumber(salesAllTime[0]?.total);
  const totalSalesL12 = toNumber(salesL12[0]?.total);
  const totalSalesL3 = toNumber(salesL3[0]?.total);
  const purchasePeriods = Number(salesL12[0]?.periods ?? 0);
  const lastPurchaseAt = salesL12[0]?.last_date ?? null;
  const avgTicket = toNumberOrNull(salesL12[0]?.avg_ticket);
  const avgMonthlyRevenue = purchasePeriods > 0 ? totalSalesL12 / purchasePeriods : 0;

  const totalTopLines = topLines.reduce((s: number, r: any) => s + toNumber(r.amount), 0);
  const topLinesFormatted = (topLines as Array<{ product_line: string; amount: number }>).map(r => ({
    productLine: r.product_line,
    amount: toNumber(r.amount),
    share: totalTopLines > 0 ? Math.round((toNumber(r.amount) / totalTopLines) * 10000) / 100 : 0,
  }));

  const monthlyTrendFormatted = (monthlyTrend as Array<{ period: string; amount: number }>).map(r => ({
    period: r.period,
    amount: toNumber(r.amount),
  }));

  // Compute receivables summary — enrich each doc with reconciliation fields
  const allReceivableDocs: CustomerReceivable_type[] = (receivableRows as any[]).map(r => {
    const origAmt = toNumber(r.originalAmount);
    const appliedDocuments = (r.allocations ?? []).map((a: any) => {
      const rawType: string = a.payment?.documentType ?? "PAGO";
      const type = (rawType === "ND" || rawType === "AJUSTE" || rawType === "PAGO")
        ? rawType as "PAGO" | "ND" | "AJUSTE"
        : "PAGO" as const;
      return {
        id:        a.id as string,
        type,
        amount:    toNumber(a.allocatedAmount),
        date:      a.payment?.paymentDate ?? null,
        reference: a.payment?.reference   ?? null,
        method:    a.payment?.paymentMethod ?? null,
      };
    });
    const appliedTotal     = appliedDocuments.reduce((s: number, a: { amount: number }) => s + a.amount, 0);
    const remainingBalance = origAmt - appliedTotal;
    const recoStatus: CustomerReceivable_type["recoStatus"] =
      appliedDocuments.length === 0  ? "SIN_SOPORTE"
      : remainingBalance < 0         ? "EXCESO"
      : remainingBalance === 0       ? "CONCILIADA"
      : "PARCIAL";
    return {
      ...r,
      originalAmount:  origAmt,
      paidAmount:      toNumber(r.paidAmount),
      balanceDue:      toNumber(r.balanceDue),
      appliedDocuments,
      appliedTotal,
      remainingBalance,
      recoStatus,
    } as CustomerReceivable_type;
  });
  const receivableBucketFormatted = (receivableBuckets as Array<{ bucket: string; amount: number; count: string }>).map(r => ({
    bucket: r.bucket,
    amount: toNumber(r.amount),
    count: Number(r.count),
  }));

  const totalReceivable = receivableBucketFormatted.reduce((s, r) => s + r.amount, 0);
  const overdueReceivable = receivableBucketFormatted
    .filter(r => r.bucket !== "CURRENT")
    .reduce((s, r) => s + r.amount, 0);
  const currentReceivable = totalReceivable - overdueReceivable;

  // Max DPD across open docs
  const maxDpd = allReceivableDocs.reduce((max, r) => Math.max(max, r.daysOverdue ?? 0), 0);

  // Compute source split (Fuente 1 vs Fuente 2) — last 12 months
  const sourceSplitRows = sourceSplit as Array<{ source: string; amount: number; count: string }>;
  const oficialRow  = sourceSplitRows.find(r => r.source === "OFICIAL");
  const remisionRow = sourceSplitRows.find(r => r.source === "REMISION");
  const oficialAmountL12  = toNumber(oficialRow?.amount);
  const remisionAmountL12 = toNumber(remisionRow?.amount);
  const totalSourceL12    = oficialAmountL12 + remisionAmountL12;
  const conversionRate = totalSourceL12 > 0
    ? Math.round((oficialAmountL12 / totalSourceL12) * 10000) / 100
    : 100;
  const remisionPendingCount = Number(remisionRow?.count ?? 0);

  return {
    profile,
    salesSummary: {
      totalSalesAllTime,
      totalSalesL12,
      totalSalesL3,
      avgMonthlyRevenue,
      avgTicket,
      purchasePeriods,
      lastPurchaseAt,
      topLines: topLinesFormatted,
      monthlyTrend: monthlyTrendFormatted,
      // Source awareness — Fuente 1 vs Fuente 2
      source: {
        oficialAmountL12,
        remisionAmountL12,
        conversionRate,          // % of commercial volume that is official invoiced
        remisionPendingCount,    // count of REMISION records in last 12 months
        hasSourceData: totalSourceL12 > 0,
      },
    },
    receivables: {
      total: totalReceivable,
      overdue: overdueReceivable,
      current: currentReceivable,
      maxDpd,
      byBucket: receivableBucketFormatted,
      documents: allReceivableDocs,
      totalOpenCount: totalOpenCount as number,
    },
    opportunities: opportunities as CRMOpportunity_type[],
    recentActivities: recentActivities as CRMActivity_type[],
    quotes: quotes as CRMQuote_type[],
    aiInsight: {
      riskScore: toNumberOrNull(profile.riskScore),
      churnRisk: profile.churnRisk,
      healthScore: toNumberOrNull(profile.healthScore),
      nextBestAction: profile.nextBestAction,
      aiSummary: profile.aiSummary,
      scoredAt: profile.scoredAt,
    },
  };
}

// ── refreshCustomerFinancials ─────────────────────────────────────────────────

export async function refreshCustomerFinancials(
  organizationId: string,
  customerNit: string,
): Promise<void> {
  const db = prisma as any;

  type SaleAgg = {
    ltv: number;
    total_l12: number;
    avg_monthly: number;
    avg_ticket: number | null;
    last_purchase: string | null;
    purchase_periods: string;
  };

  const [agg] = await prisma.$queryRaw<SaleAgg[]>(Prisma.sql`
    SELECT
      SUM("amount")::float8                                               AS ltv,
      SUM(CASE WHEN "saleDate" >= NOW() - INTERVAL '12 months'
               THEN "amount" ELSE 0 END)::float8                        AS total_l12,
      (
        SUM(CASE WHEN "saleDate" >= NOW() - INTERVAL '12 months'
                 THEN "amount" ELSE 0 END)::float8
        / NULLIF(COUNT(DISTINCT CASE
            WHEN "saleDate" >= NOW() - INTERVAL '12 months'
            THEN "periodoAoMes" END), 0)
      )                                                                  AS avg_monthly,
      CASE
        WHEN SUM("txCount") IS NOT NULL AND SUM("txCount")::float8 > 0
        THEN (SUM("amount") / SUM("txCount"))::float8
        ELSE NULL
      END                                                                AS avg_ticket,
      TO_CHAR(MAX("saleDate"), 'YYYY-MM-DD')                            AS last_purchase,
      CAST(COUNT(DISTINCT "periodoAoMes") AS TEXT)                      AS purchase_periods
    FROM "SaleRecord"
    WHERE "organizationId" = ${organizationId}
      AND "customerNit" = ${customerNit}
      AND "productLine" NOT ILIKE 'Total %'
      AND "productLine" NOT ILIKE 'Subtotal%'
  `);

  if (!agg) return;

  // Also compute receivables summary via raw SQL
  type RecAgg = {
    total_receivable: number | null;
    overdue_receivable: number | null;
    max_dpd: number | null;
  };

  const [recAgg] = await prisma.$queryRaw<RecAgg[]>(Prisma.sql`
    SELECT
      SUM("balanceDue")::float8                                              AS total_receivable,
      SUM(CASE WHEN "daysOverdue" > 0 THEN "balanceDue" ELSE 0 END)::float8 AS overdue_receivable,
      MAX("daysOverdue")                                                     AS max_dpd
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${organizationId}
      AND "customerNit" = ${customerNit}
      AND "status" IN ('OPEN', 'PARTIAL', 'OVERDUE')
  `);

  const updateData: Record<string, unknown> = {
    ltv: toNumber(agg.ltv),
    totalSalesL12: toNumber(agg.total_l12),
    avgMonthlyRevenue: toNumberOrNull(agg.avg_monthly),
    avgTicket: toNumberOrNull(agg.avg_ticket),
    purchasePeriods: Number(agg.purchase_periods ?? 0),
    lastPurchaseAt: agg.last_purchase ? new Date(agg.last_purchase) : null,
    erpSyncedAt: new Date(),
    updatedAt: new Date(),
  };

  if (recAgg) {
    updateData.totalReceivable = toNumberOrNull(recAgg.total_receivable);
    updateData.overdueReceivable = toNumberOrNull(recAgg.overdue_receivable);
    updateData.maxDpd = recAgg.max_dpd != null ? Number(recAgg.max_dpd) : null;
  }

  await db.customerProfile.updateMany({
    where: { organizationId, nit: customerNit },
    data: updateData,
  });
}

// ── bootstrapCustomerProfilesFromSales ────────────────────────────────────────

/**
 * Creates CustomerProfile records for every distinct customerNit found in
 * SaleRecord for this org. Idempotent — skips NITs that already have a profile.
 *
 * This lets Customer 360 show real Castillitos customers immediately, before
 * any CRM connector has been configured. Profiles are seeded with sales KPIs
 * and can be enriched later by the ERP/CRM adapters.
 *
 * Returns the number of new profiles created.
 */
export async function bootstrapCustomerProfilesFromSales(
  organizationId: string,
): Promise<number> {
  const db = prisma as any;

  type CustomerRow = {
    customer_nit:  string | null;
    customer_name: string | null;
    seller_name:   string | null;
    seller_slug:   string | null;
    ltv:           number;
    total_l12:     number;
    last_purchase: string | null;
    periods:       string;
    avg_ticket:    number | null;
  };

  // Aggregate sales per customer NIT, taking the most recent seller assignment
  const rows = await prisma.$queryRaw<CustomerRow[]>(Prisma.sql`
    WITH ranked AS (
      SELECT
        "customerNit"                                                          AS customer_nit,
        MAX("customerName")                                                    AS customer_name,
        MAX("sellerName")                                                      AS seller_name,
        MAX("sellerSlug")                                                      AS seller_slug,
        SUM("amount")::float8                                                  AS ltv,
        SUM(CASE WHEN "saleDate" >= NOW() - INTERVAL '12 months'
                 THEN "amount" ELSE 0 END)::float8                            AS total_l12,
        TO_CHAR(MAX("saleDate"), 'YYYY-MM-DD')                                AS last_purchase,
        CAST(COUNT(DISTINCT "periodoAoMes") AS TEXT)                          AS periods,
        CASE
          WHEN SUM("txCount") IS NOT NULL AND SUM("txCount")::float8 > 0
          THEN (SUM("amount") / SUM("txCount"))::float8
          ELSE NULL
        END                                                                    AS avg_ticket
      FROM "SaleRecord"
      WHERE "organizationId" = ${organizationId}
        AND "customerNit" IS NOT NULL
        AND "customerName" IS NOT NULL
        AND "productLine" NOT ILIKE 'Total %'
        AND "productLine" NOT ILIKE 'Subtotal%'
      GROUP BY "customerNit"
    )
    SELECT * FROM ranked
    ORDER BY ltv DESC
    LIMIT 2000
  `);

  if (rows.length === 0) return 0;

  // Find NITs that already have profiles
  const existingNits: Array<{ nit: string }> = await prisma.$queryRaw(Prisma.sql`
    SELECT nit FROM "CustomerProfile"
    WHERE "organizationId" = ${organizationId}
      AND nit IS NOT NULL
  `);
  const existingSet = new Set(existingNits.map(r => r.nit));

  const toCreate = rows.filter(r => r.customer_nit && !existingSet.has(r.customer_nit));
  if (toCreate.length === 0) return 0;

  // Build slug from nit (stable, unique within org)
  function toSlug(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  // Batch upserts in chunks of 100
  const CHUNK = 100;
  let created = 0;

  for (let i = 0; i < toCreate.length; i += CHUNK) {
    const chunk = toCreate.slice(i, i + CHUNK);

    await db.customerProfile.createMany({
      skipDuplicates: true,
      data: chunk.map(r => ({
        organizationId,
        nit:              r.customer_nit,
        slug:             toSlug(r.customer_nit!),
        name:             r.customer_name ?? r.customer_nit ?? "Desconocido",
        sellerName:       r.seller_name ?? null,
        sellerSlug:       r.seller_slug ?? null,
        status:           "ACTIVE",
        customerType:     "B2B",
        ltv:              toNumber(r.ltv),
        totalSalesL12:    toNumber(r.total_l12),
        lastPurchaseAt:   r.last_purchase ? new Date(r.last_purchase) : null,
        purchasePeriods:  Number(r.periods ?? 0),
        avgTicket:        toNumberOrNull(r.avg_ticket),
        erpSyncedAt:      new Date(),
      })),
    });

    created += chunk.length;
  }

  return created;
}

// ── linkCustomerSagTerceroIds ─────────────────────────────────────────────────

/**
 * Populates CustomerProfile.sagTerceroId by bridging through CollectionRecord.
 *
 * WHY: SaleRecord.customerNit stores String(ka_nl_tercero) for the SAG PYA SOAP
 * integration — NOT the real NIT. For SaleRecord queries to return data,
 * CustomerProfile.sagTerceroId must be set to ka_nl_tercero.
 *
 * CollectionRecord has BOTH fields:
 *   sagTerceroId INT  — ka_nl_tercero (SAG internal PK)
 *   customerNit  TEXT — real NIT from TERCEROS JOIN
 *
 * This function uses CollectionRecord to build the sagTerceroId → real NIT map,
 * then updates CustomerProfile.sagTerceroId where the nit matches.
 *
 * SAFE: only updates rows where sagTerceroId IS NULL (idempotent).
 * NO SCHEMA CHANGE needed — sagTerceroId already exists on CustomerProfile.
 *
 * Run this after every CollectionRecord sync (v_pagosnew).
 * Also callable manually via scripts/_verify-customer-identity.ts.
 *
 * @returns  Number of CustomerProfile rows updated.
 */
export async function linkCustomerSagTerceroIds(
  organizationId: string,
): Promise<number> {
  // Build sagTerceroId → real NIT map from CollectionRecord rows that have both.
  type Mapping = { tercero_id: number; nit: string };
  const mappings = await prisma.$queryRaw<Mapping[]>(Prisma.sql`
    SELECT DISTINCT
      "sagTerceroId"  AS tercero_id,
      "customerNit"   AS nit
    FROM  "CollectionRecord"
    WHERE "organizationId" = ${organizationId}
      AND "sagTerceroId"   IS NOT NULL
      AND "customerNit"    IS NOT NULL
      AND "customerNit"    != ''
    ORDER BY tercero_id
  `);

  if (mappings.length === 0) return 0;

  let updated = 0;
  for (const m of mappings) {
    // Update CustomerProfile rows that:
    //   a) have sagTerceroId IS NULL (not yet linked)
    //   b) have nit OR nitNormalized matching the real NIT from CollectionRecord
    const rows = await prisma.$executeRaw(Prisma.sql`
      UPDATE "CustomerProfile"
      SET
        "sagTerceroId" = ${m.tercero_id},
        "updatedAt"    = NOW()
      WHERE "organizationId" = ${organizationId}
        AND "sagTerceroId"   IS NULL
        AND (
          "nit"           = ${m.nit}
          OR "nitNormalized" = ${m.nit}
        )
    `);
    updated += Number(rows);
  }

  return updated;
}

// ── refreshAllCustomerFinancials ──────────────────────────────────────────────

/**
 * Single-pass bulk update of financial KPIs on ALL CustomerProfiles for an org.
 *
 * Computes LTV, totalSalesL12, avgMonthlyRevenue, avgTicket, lastPurchaseAt,
 * purchasePeriods from SaleRecord and totalReceivable, overdueReceivable, maxDpd
 * from CustomerReceivable — then writes them back to CustomerProfile in a
 * single UPDATE...FROM subquery per KPI group.
 *
 * Called automatically after a sag_pya_soap customers or receivables sync.
 * Safe to call any time — completely idempotent.
 */
export async function refreshAllCustomerFinancials(
  organizationId: string,
): Promise<void> {
  // 1. Refresh sales KPIs from SaleRecord grouped by NIT
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "CustomerProfile" cp
    SET
      "ltv"              = agg.ltv,
      "totalSalesL12"    = agg.total_l12,
      "avgMonthlyRevenue"= agg.avg_monthly,
      "avgTicket"        = agg.avg_ticket,
      "lastPurchaseAt"   = agg.last_purchase,
      "purchasePeriods"  = agg.periods::int,
      "erpSyncedAt"      = NOW(),
      "updatedAt"        = NOW()
    FROM (
      SELECT
        "customerNit"                                            AS nit,
        SUM("amount")::float8                                   AS ltv,
        SUM(CASE WHEN "saleDate" >= NOW() - INTERVAL '12 months'
                 THEN "amount" ELSE 0 END)::float8              AS total_l12,
        (SUM(CASE WHEN "saleDate" >= NOW() - INTERVAL '12 months'
                  THEN "amount" ELSE 0 END)
         / NULLIF(COUNT(DISTINCT CASE
              WHEN "saleDate" >= NOW() - INTERVAL '12 months'
              THEN "periodoAoMes" END), 0))::float8              AS avg_monthly,
        CASE WHEN SUM("txCount") > 0
             THEN (SUM("amount") / SUM("txCount"))::float8
             ELSE NULL END                                       AS avg_ticket,
        MAX("saleDate")                                         AS last_purchase,
        CAST(COUNT(DISTINCT "periodoAoMes") AS TEXT)            AS periods
      FROM "SaleRecord"
      WHERE "organizationId" = ${organizationId}
        AND "customerNit" IS NOT NULL
        AND "productLine" NOT ILIKE 'Total %'
        AND "productLine" NOT ILIKE 'Subtotal%'
      GROUP BY "customerNit"
    ) agg
    WHERE cp."organizationId" = ${organizationId}
      AND (cp."nit" = agg.nit OR cp."sagTerceroId"::text = agg.nit)
  `);

  // 2. Refresh receivables KPIs from CustomerReceivable grouped by NIT
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "CustomerProfile" cp
    SET
      "totalReceivable"   = rec.total_receivable,
      "overdueReceivable" = rec.overdue_receivable,
      "maxDpd"            = rec.max_dpd,
      "updatedAt"         = NOW()
    FROM (
      SELECT
        "customerNit"                                              AS nit,
        SUM("balanceDue")::float8                                 AS total_receivable,
        SUM(CASE WHEN "daysOverdue" > 0 THEN "balanceDue" ELSE 0 END)::float8
                                                                  AS overdue_receivable,
        MAX("daysOverdue")                                        AS max_dpd
      FROM "CustomerReceivable"
      WHERE "organizationId" = ${organizationId}
        AND "customerNit" IS NOT NULL
        AND "status" IN ('OPEN', 'PARTIAL', 'OVERDUE')
      GROUP BY "customerNit"
    ) rec
    WHERE cp."organizationId" = ${organizationId}
      AND cp."nit" = rec.nit
  `);
}
