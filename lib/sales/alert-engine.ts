/**
 * Business Alert Engine — Sales module, v1
 *
 * Rules implemented:
 *   sales_drop         — seller or store revenue drops > SALES_DROP_THRESHOLD vs prev month
 *   seller_dependency  — a single seller exceeds SELLER_DEPENDENCY_THRESHOLD of org total
 *
 * Entry point: generateSalesAlerts(organizationId, period)
 * Called after every successful import batch (fire-and-forget).
 *
 * Deduplication: @@unique([organizationId, type, entityKey, period])
 * Re-running the same period upserts existing alerts so amounts stay current.
 */

import { prisma }        from "@/lib/prisma";
import { AlertSeverity } from "@prisma/client";

// ── Thresholds (tune without schema changes) ──────────────────────────────────

const SALES_DROP_THRESHOLD        = 0.20;  // 20% drop triggers WARNING
const SALES_DROP_CRITICAL         = 0.40;  // 40%+ drop escalates to CRITICAL
const SELLER_DEPENDENCY_THRESHOLD = 0.35;  // 35% share triggers WARNING
const SELLER_DEPENDENCY_CRITICAL  = 0.60;  // 60%+ share escalates to CRITICAL

// New rule thresholds
const LINE_DROP_THRESHOLD         = 0.20;  // line drops >20% vs 3-month avg → WARNING
const LINE_DROP_CRITICAL          = 0.40;  // line drops >40% → CRITICAL
const LINE_GROWTH_THRESHOLD       = 0.25;  // line grows >25% vs 3-month avg → INFO
const CUSTOMER_INACTIVITY_DAYS    = 30;    // top customer not seen in 30 days → WARNING
const CUSTOMER_CONCENTRATION      = 0.35;  // customer >35% of period revenue → WARNING
const CUSTOMER_CONCENTRATION_CRIT = 0.60;  // customer >60% → CRITICAL
const SELLER_TICKET_DROP          = 0.15;  // avg ticket drops >15% vs 3-month avg → WARNING
const SELLER_TICKET_DROP_CRITICAL = 0.30;  // avg ticket drops >30% → CRITICAL

// Minimum revenue (COP) an entity must have in the CURRENT period to be evaluated.
// Entities below this are considered noise and skipped entirely.
// Rationale for Castillitos: anything under $500k/month is a marginal seller/store
// whose fluctuations carry no operational significance.
const MIN_AMOUNT_RELEVANCE        = 500_000;

// ── Internal types ────────────────────────────────────────────────────────────

interface AlertInput {
  organizationId: string;
  module:         string;
  type:           string;
  severity:       AlertSeverity;
  title:          string;
  message:        string;
  entityType:     string;
  entityKey:      string;
  entityLabel:    string;
  period:         string;
  payloadJson:    object;
}

// ── Period helpers ────────────────────────────────────────────────────────────

function prevPeriod(period: string): string {
  const y = Number(period.slice(0, 4));
  const m = Number(period.slice(4, 6));
  if (m === 1) return `${y - 1}12`;
  return `${y}${String(m - 1).padStart(2, "0")}`;
}

/** Return the N periods immediately before `period` (most recent first). */
function prevNPeriods(period: string, n: number): string[] {
  const y0 = Number(period.slice(0, 4));
  const m0 = Number(period.slice(4, 6));
  return Array.from({ length: n }, (_, i) => {
    const total = y0 * 12 + (m0 - 1) - (i + 1);
    return `${Math.floor(total / 12)}${String((total % 12) + 1).padStart(2, "0")}`;
  });
}

// ── Shared query: amounts by seller for a given period ────────────────────────

async function sellerAmounts(
  organizationId: string,
  period: string
): Promise<Array<{ seller_slug: string; seller_name: string; amount: number }>> {
  type Row = { seller_slug: string; seller_name: string; amount: number };
  return prisma.$queryRaw<Row[]>`
    SELECT
      "sellerSlug"             AS seller_slug,
      MAX("sellerName")        AS seller_name,
      SUM("amount")::float     AS amount
    FROM  "SaleRecord"
    WHERE "organizationId" = ${organizationId}
      AND COALESCE("periodoAoMes", TO_CHAR("saleDate", 'YYYYMM')) = ${period}
    GROUP BY "sellerSlug"
  `;
}

async function storeAmounts(
  organizationId: string,
  period: string
): Promise<Array<{ store_slug: string; store_name: string; amount: number }>> {
  type Row = { store_slug: string; store_name: string; amount: number };
  return prisma.$queryRaw<Row[]>`
    SELECT
      "storeSlug"              AS store_slug,
      MAX("storeName")         AS store_name,
      SUM("amount")::float     AS amount
    FROM  "SaleRecord"
    WHERE "organizationId" = ${organizationId}
      AND COALESCE("periodoAoMes", TO_CHAR("saleDate", 'YYYYMM')) = ${period}
    GROUP BY "storeSlug"
  `;
}

// ── Rule 1: sales_drop ────────────────────────────────────────────────────────
// Fire when current period drops > threshold vs previous period.
// Evaluated separately for sellers and stores.

async function checkSalesDrop(
  organizationId: string,
  period:         string
): Promise<AlertInput[]> {
  const prev    = prevPeriod(period);
  const alerts: AlertInput[] = [];

  // ── Sellers ──
  const [currSellers, prevSellers] = await Promise.all([
    sellerAmounts(organizationId, period),
    sellerAmounts(organizationId, prev),
  ]);

  const prevSellerMap = new Map(prevSellers.map(r => [r.seller_slug, r]));

  for (const cur of currSellers) {
    if (cur.amount < MIN_AMOUNT_RELEVANCE) continue;
    const prevRow = prevSellerMap.get(cur.seller_slug);
    if (!prevRow || prevRow.amount === 0) continue;

    const pctChange = (cur.amount - prevRow.amount) / prevRow.amount;
    if (pctChange >= -SALES_DROP_THRESHOLD) continue;

    const severity = pctChange <= -SALES_DROP_CRITICAL
      ? AlertSeverity.CRITICAL
      : AlertSeverity.WARNING;

    const pct = Math.abs(Math.round(pctChange * 100));

    alerts.push({
      organizationId,
      module:      "sales",
      type:        "sales_drop",
      severity,
      title:       `Caída de ventas: ${cur.seller_name}`,
      message:     `${cur.seller_name} cayó ${pct}% (${fmtCOP(prevRow.amount)} → ${fmtCOP(cur.amount)}) en ${period} vs ${prev}.`,
      entityType:  "seller",
      entityKey:   `seller:${cur.seller_slug}:${period}`,
      entityLabel: cur.seller_name,
      period,
      payloadJson: {
        sellerSlug:    cur.seller_slug,
        sellerName:    cur.seller_name,
        currentAmount: cur.amount,
        prevAmount:    prevRow.amount,
        pctChange:     Math.round(pctChange * 10000) / 100,
        prevPeriod:    prev,
        threshold:     SALES_DROP_THRESHOLD,
      },
    });
  }

  // ── Stores ──
  const [currStores, prevStores] = await Promise.all([
    storeAmounts(organizationId, period),
    storeAmounts(organizationId, prev),
  ]);

  const prevStoreMap = new Map(prevStores.map(r => [r.store_slug, r]));

  for (const cur of currStores) {
    if (cur.amount < MIN_AMOUNT_RELEVANCE) continue;
    const prevRow = prevStoreMap.get(cur.store_slug);
    if (!prevRow || prevRow.amount === 0) continue;

    const pctChange = (cur.amount - prevRow.amount) / prevRow.amount;
    if (pctChange >= -SALES_DROP_THRESHOLD) continue;

    const severity = pctChange <= -SALES_DROP_CRITICAL
      ? AlertSeverity.CRITICAL
      : AlertSeverity.WARNING;

    const pct = Math.abs(Math.round(pctChange * 100));

    alerts.push({
      organizationId,
      module:      "sales",
      type:        "sales_drop",
      severity,
      title:       `Caída de ventas: ${cur.store_name}`,
      message:     `${cur.store_name} cayó ${pct}% (${fmtCOP(prevRow.amount)} → ${fmtCOP(cur.amount)}) en ${period} vs ${prev}.`,
      entityType:  "store",
      entityKey:   `store:${cur.store_slug}:${period}`,
      entityLabel: cur.store_name,
      period,
      payloadJson: {
        storeSlug:     cur.store_slug,
        storeName:     cur.store_name,
        currentAmount: cur.amount,
        prevAmount:    prevRow.amount,
        pctChange:     Math.round(pctChange * 10000) / 100,
        prevPeriod:    prev,
        threshold:     SALES_DROP_THRESHOLD,
      },
    });
  }

  return alerts;
}

// ── Rule 2: seller_dependency ─────────────────────────────────────────────────
// Fire when one seller exceeds the configured share of org total for the period.

async function checkSellerDependency(
  organizationId: string,
  period:         string
): Promise<AlertInput[]> {
  const sellers = await sellerAmounts(organizationId, period);
  if (sellers.length === 0) return [];

  const total  = sellers.reduce((s, r) => s + r.amount, 0);
  if (total === 0) return [];

  const alerts: AlertInput[] = [];

  for (const s of sellers) {
    if (s.amount < MIN_AMOUNT_RELEVANCE) continue;
    const share = s.amount / total;
    if (share <= SELLER_DEPENDENCY_THRESHOLD) continue;

    const severity = share >= SELLER_DEPENDENCY_CRITICAL
      ? AlertSeverity.CRITICAL
      : AlertSeverity.WARNING;

    const pct = Math.round(share * 100);

    alerts.push({
      organizationId,
      module:      "sales",
      type:        "seller_dependency",
      severity,
      title:       `Concentración de ventas: ${s.seller_name}`,
      message:     `${s.seller_name} concentra el ${pct}% de las ventas en ${period} ` +
                   `(${fmtCOP(s.amount)} de ${fmtCOP(total)}). ` +
                   `Umbral: ${Math.round(SELLER_DEPENDENCY_THRESHOLD * 100)}%.`,
      entityType:  "seller",
      entityKey:   `seller:${s.seller_slug}:${period}`,
      entityLabel: s.seller_name,
      period,
      payloadJson: {
        sellerSlug:  s.seller_slug,
        sellerName:  s.seller_name,
        amount:      s.amount,
        totalAmount: total,
        share:       Math.round(share * 10000) / 100,
        threshold:   SELLER_DEPENDENCY_THRESHOLD,
      },
    });
  }

  return alerts;
}

// ── Rule 3: line_sales_drop / line_growth ─────────────────────────────────────
// Compare current-period productLine revenue vs 3-month rolling average.
// Excludes technical/total lines via the same NOT ILIKE guard used in reports.ts.

async function lineAmountsForPeriod(
  organizationId: string,
  period:         string
): Promise<Array<{ line: string; amount: number }>> {
  type Row = { line: string; amount: number };
  return prisma.$queryRaw<Row[]>`
    SELECT
      "productLine"          AS line,
      SUM("amount")::float   AS amount
    FROM  "SaleRecord"
    WHERE "organizationId" = ${organizationId}
      AND "periodoAoMes"   = ${period}
      AND "productLine"    NOT ILIKE 'Total %'
      AND "productLine"    NOT ILIKE 'Subtotal%'
      AND "productLine"    NOT ILIKE 'Gran Total%'
    GROUP BY "productLine"
  `;
}

async function checkLineTrend(
  organizationId: string,
  period:         string
): Promise<AlertInput[]> {
  const lookback = prevNPeriods(period, 3);  // 3 months before current

  const [current, ...histRaw] = await Promise.all([
    lineAmountsForPeriod(organizationId, period),
    ...lookback.map(p => lineAmountsForPeriod(organizationId, p)),
  ]);

  if (current.length === 0) return [];

  // Compute 3-month average per line (only include periods that have data)
  const avgMap = new Map<string, number>();
  for (const row of current) {
    const historical = histRaw
      .flat()
      .filter(r => r.line === row.line)
      .map(r => r.amount);
    if (historical.length === 0) continue;
    avgMap.set(row.line, historical.reduce((s, v) => s + v, 0) / historical.length);
  }

  const alerts: AlertInput[] = [];

  for (const cur of current) {
    if (cur.amount < MIN_AMOUNT_RELEVANCE) continue;
    const avg = avgMap.get(cur.line);
    if (!avg || avg === 0) continue;

    const pctChange = (cur.amount - avg) / avg;

    if (pctChange <= -LINE_DROP_THRESHOLD) {
      // DROP
      const severity = pctChange <= -LINE_DROP_CRITICAL
        ? AlertSeverity.CRITICAL
        : AlertSeverity.WARNING;
      const pct = Math.abs(Math.round(pctChange * 100));

      alerts.push({
        organizationId,
        module:      "sales",
        type:        "line_sales_drop",
        severity,
        title:       `Caída en línea: ${cur.line}`,
        message:     `La línea ${cur.line} cayó ${pct}% (${fmtCOP(cur.amount)}) ` +
                     `vs promedio 3 meses (${fmtCOP(avg)}). ` +
                     `Períodos base: ${lookback.join(", ")}.`,
        entityType:  "product_line",
        entityKey:   `line:${cur.line.toLowerCase().replace(/\s+/g, "-")}:${period}`,
        entityLabel: cur.line,
        period,
        payloadJson: {
          line: cur.line, currentAmount: cur.amount, avg3m: Math.round(avg),
          pctChange: Math.round(pctChange * 10000) / 100, lookback,
        },
      });
    } else if (pctChange >= LINE_GROWTH_THRESHOLD) {
      // GROWTH — positive signal, INFO severity
      const pct = Math.round(pctChange * 100);

      alerts.push({
        organizationId,
        module:      "sales",
        type:        "line_growth",
        severity:    AlertSeverity.INFO,
        title:       `Crecimiento destacado: ${cur.line}`,
        message:     `La línea ${cur.line} creció ${pct}% (${fmtCOP(cur.amount)}) ` +
                     `vs promedio 3 meses (${fmtCOP(avg)}).`,
        entityType:  "product_line",
        entityKey:   `line:${cur.line.toLowerCase().replace(/\s+/g, "-")}:${period}`,
        entityLabel: cur.line,
        period,
        payloadJson: {
          line: cur.line, currentAmount: cur.amount, avg3m: Math.round(avg),
          pctChange: Math.round(pctChange * 10000) / 100, lookback,
        },
      });
    }
  }

  return alerts;
}

// ── Rule 4: customer_inactive ─────────────────────────────────────────────────
// A customer who had significant revenue in the last 3 periods has not appeared
// in the last CUSTOMER_INACTIVITY_DAYS calendar days.

async function checkCustomerInactive(
  organizationId: string,
  period:         string
): Promise<AlertInput[]> {
  type Row = {
    customer_name: string;
    customer_nit:  string | null;
    last_sale:     string;         // ISO date string
    amount_3m:     number;
  };

  const lookback = prevNPeriods(period, 3);

  // Customers with material revenue in the last 3 months + their latest saleDate overall
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      "customerName"                              AS customer_name,
      MAX("customerNit")                          AS customer_nit,
      TO_CHAR(MAX("saleDate"), 'YYYY-MM-DD')     AS last_sale,
      SUM("amount")::float                        AS amount_3m
    FROM  "SaleRecord"
    WHERE "organizationId" = ${organizationId}
      AND "periodoAoMes"   = ANY(${lookback}::text[])
      AND "customerName"   IS NOT NULL
    GROUP BY "customerName"
    HAVING SUM("amount")::float >= ${MIN_AMOUNT_RELEVANCE}
    ORDER BY amount_3m DESC
    LIMIT 50
  `;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CUSTOMER_INACTIVITY_DAYS);

  const alerts: AlertInput[] = [];

  for (const r of rows) {
    const lastSale = new Date(r.last_sale);
    if (lastSale >= cutoff) continue;

    const daysInactive = Math.floor(
      (Date.now() - lastSale.getTime()) / 86_400_000
    );

    const customerKey = (r.customer_nit ?? r.customer_name)
      .toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

    alerts.push({
      organizationId,
      module:      "sales",
      type:        "customer_inactive",
      severity:    AlertSeverity.WARNING,
      title:       `Cliente inactivo: ${r.customer_name}`,
      message:     `${r.customer_name} no ha comprado en ${daysInactive} días ` +
                   `(última compra: ${r.last_sale}). Compras últimos 3 meses: ${fmtCOP(r.amount_3m)}.`,
      entityType:  "customer",
      entityKey:   `customer:${customerKey}:${period}`,
      entityLabel: r.customer_name,
      period,
      payloadJson: {
        customerName: r.customer_name,
        customerNit:  r.customer_nit,
        lastSaleDate: r.last_sale,
        daysInactive,
        amount3m:     Math.round(r.amount_3m),
        inactivityThreshold: CUSTOMER_INACTIVITY_DAYS,
      },
    });
  }

  return alerts;
}

// ── Rule 5: customer_concentration ───────────────────────────────────────────
// Fire when a single customer exceeds the configured share of period revenue.

async function checkCustomerConcentration(
  organizationId: string,
  period:         string
): Promise<AlertInput[]> {
  type Row = {
    customer_name: string;
    customer_nit:  string | null;
    amount:        number;
  };

  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      "customerName"         AS customer_name,
      MAX("customerNit")     AS customer_nit,
      SUM("amount")::float   AS amount
    FROM  "SaleRecord"
    WHERE "organizationId" = ${organizationId}
      AND "periodoAoMes"   = ${period}
      AND "customerName"   IS NOT NULL
    GROUP BY "customerName"
    ORDER BY amount DESC
  `;

  if (rows.length === 0) return [];
  const total = rows.reduce((s, r) => s + r.amount, 0);
  if (total === 0) return [];

  const alerts: AlertInput[] = [];

  for (const r of rows) {
    if (r.amount < MIN_AMOUNT_RELEVANCE) continue;
    const share = r.amount / total;
    if (share <= CUSTOMER_CONCENTRATION) continue;

    const severity = share >= CUSTOMER_CONCENTRATION_CRIT
      ? AlertSeverity.CRITICAL
      : AlertSeverity.WARNING;

    const customerKey = (r.customer_nit ?? r.customer_name)
      .toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const pct = Math.round(share * 100);

    alerts.push({
      organizationId,
      module:      "sales",
      type:        "customer_concentration",
      severity,
      title:       `Alta concentración de cliente: ${r.customer_name}`,
      message:     `${r.customer_name} representa el ${pct}% del total de ventas en ${period} ` +
                   `(${fmtCOP(r.amount)} de ${fmtCOP(total)}). ` +
                   `Umbral: ${Math.round(CUSTOMER_CONCENTRATION * 100)}%.`,
      entityType:  "customer",
      entityKey:   `customer:${customerKey}:${period}`,
      entityLabel: r.customer_name,
      period,
      payloadJson: {
        customerName: r.customer_name, customerNit: r.customer_nit,
        amount: r.amount, totalAmount: total,
        share: Math.round(share * 10000) / 100,
        threshold: CUSTOMER_CONCENTRATION,
      },
    });
  }

  return alerts;
}

// ── Rule 6: seller_ticket_drop ────────────────────────────────────────────────
// Fire when a seller's avg ticket (amount/txCount) drops >15% vs 3-month avg.
// Requires txCount to be non-null.

async function checkSellerTicketDrop(
  organizationId: string,
  period:         string
): Promise<AlertInput[]> {
  type Row = {
    seller_slug: string;
    seller_name: string;
    amount:      number;
    tx_count:    string;   // cast to text because of Prisma BigInt handling
  };

  async function sellerTickets(p: string): Promise<Row[]> {
    return prisma.$queryRaw<Row[]>`
      SELECT
        "sellerSlug"             AS seller_slug,
        MAX("sellerName")        AS seller_name,
        SUM("amount")::float     AS amount,
        CAST(SUM("txCount") AS TEXT) AS tx_count
      FROM  "SaleRecord"
      WHERE "organizationId" = ${organizationId}
        AND "periodoAoMes"   = ${p}
        AND "txCount"        IS NOT NULL
      GROUP BY "sellerSlug"
      HAVING SUM("txCount") > 0
    `;
  }

  const lookback = prevNPeriods(period, 3);
  const [curRows, ...histRows] = await Promise.all([
    sellerTickets(period),
    ...lookback.map(p => sellerTickets(p)),
  ]);

  if (curRows.length === 0) return [];

  const alerts: AlertInput[] = [];

  for (const cur of curRows) {
    if (cur.amount < MIN_AMOUNT_RELEVANCE) continue;

    const curTx     = Number(cur.tx_count);
    if (curTx === 0) continue;
    const curTicket = cur.amount / curTx;

    // Avg ticket across available historical periods
    const histTickets: number[] = histRows
      .flat()
      .filter(r => r.seller_slug === cur.seller_slug)
      .map(r => {
        const tx = Number(r.tx_count);
        return tx > 0 ? r.amount / tx : null;
      })
      .filter((v): v is number => v !== null);

    if (histTickets.length === 0) continue;
    const avgHistTicket = histTickets.reduce((s, v) => s + v, 0) / histTickets.length;
    if (avgHistTicket === 0) continue;

    const pctChange = (curTicket - avgHistTicket) / avgHistTicket;
    if (pctChange >= -SELLER_TICKET_DROP) continue;

    const severity = pctChange <= -SELLER_TICKET_DROP_CRITICAL
      ? AlertSeverity.CRITICAL
      : AlertSeverity.WARNING;
    const pct = Math.abs(Math.round(pctChange * 100));

    alerts.push({
      organizationId,
      module:      "sales",
      type:        "seller_ticket_drop",
      severity,
      title:       `Ticket promedio bajo: ${cur.seller_name}`,
      message:     `Ticket promedio de ${cur.seller_name} cayó ${pct}% en ${period} ` +
                   `(${fmtCOP(curTicket)} vs promedio histórico ${fmtCOP(avgHistTicket)}). ` +
                   `Puede indicar descuentos excesivos o clientes de menor valor.`,
      entityType:  "seller",
      entityKey:   `seller:${cur.seller_slug}:ticket:${period}`,
      entityLabel: cur.seller_name,
      period,
      payloadJson: {
        sellerSlug: cur.seller_slug, sellerName: cur.seller_name,
        currentTicket: Math.round(curTicket), avgTicket3m: Math.round(avgHistTicket),
        pctChange: Math.round(pctChange * 10000) / 100,
        currentTxCount: curTx, lookback,
      },
    });
  }

  return alerts;
}

// ── Upsert: dedup by (orgId, type, entityKey, period) ────────────────────────
// Updates an existing alert if the numbers changed (re-import of same period).

async function upsertAlerts(alerts: AlertInput[]): Promise<number> {
  if (alerts.length === 0) return 0;

  let count = 0;
  for (const a of alerts) {
    await prisma.businessAlert.upsert({
      where: {
        organizationId_type_entityKey_period: {
          organizationId: a.organizationId,
          type:           a.type,
          entityKey:      a.entityKey,
          period:         a.period,
        },
      },
      create: {
        organizationId: a.organizationId,
        module:         a.module,
        type:           a.type,
        severity:       a.severity,
        status:         "OPEN",
        title:          a.title,
        message:        a.message,
        entityType:     a.entityType,
        entityKey:      a.entityKey,
        entityLabel:    a.entityLabel,
        period:         a.period,
        payloadJson:    a.payloadJson,
      },
      update: {
        // Re-import of same period: refresh numbers, reset to OPEN if it regressed
        severity:    a.severity,
        title:       a.title,
        message:     a.message,
        payloadJson: a.payloadJson,
        status:      "OPEN",
        resolvedAt:  null,
      },
    });
    count++;
  }
  return count;
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function generateSalesAlerts(
  organizationId: string,
  period:         string   // "YYYYMM"
): Promise<{ generated: number; rules: Record<string, number> }> {
  const [
    dropAlerts,
    depAlerts,
    lineTrendAlerts,
    customerInactiveAlerts,
    customerConcAlerts,
    ticketDropAlerts,
  ] = await Promise.all([
    checkSalesDrop(organizationId, period),
    checkSellerDependency(organizationId, period),
    checkLineTrend(organizationId, period),
    checkCustomerInactive(organizationId, period),
    checkCustomerConcentration(organizationId, period),
    checkSellerTicketDrop(organizationId, period),
  ]);

  const lineDropAlerts   = lineTrendAlerts.filter(a => a.type === "line_sales_drop");
  const lineGrowthAlerts = lineTrendAlerts.filter(a => a.type === "line_growth");

  const allAlerts = [
    ...dropAlerts,
    ...depAlerts,
    ...lineTrendAlerts,
    ...customerInactiveAlerts,
    ...customerConcAlerts,
    ...ticketDropAlerts,
  ];
  await upsertAlerts(allAlerts);

  return {
    generated: allAlerts.length,
    rules: {
      sales_drop:              dropAlerts.length,
      seller_dependency:       depAlerts.length,
      line_sales_drop:         lineDropAlerts.length,
      line_growth:             lineGrowthAlerts.length,
      customer_inactive:       customerInactiveAlerts.length,
      customer_concentration:  customerConcAlerts.length,
      seller_ticket_drop:      ticketDropAlerts.length,
    },
  };
}

// ── Query: load alerts for a given period (for debug page) ───────────────────

export interface BusinessAlertRow {
  id:          string;
  type:        string;
  severity:    string;
  status:      string;
  title:       string;
  message:     string;
  entityType:  string;
  entityLabel: string;
  period:      string;
  payloadJson: unknown;
  createdAt:   Date;
}

export async function getSalesAlerts(
  organizationId: string,
  period:         string
): Promise<BusinessAlertRow[]> {
  const rows = await prisma.businessAlert.findMany({
    where:  { organizationId, module: "sales", period },
    select: {
      id:          true,
      type:        true,
      severity:    true,
      status:      true,
      title:       true,
      message:     true,
      entityType:  true,
      entityLabel: true,
      period:      true,
      payloadJson: true,
      createdAt:   true,
    },
  }) as BusinessAlertRow[];

  return rows.sort((a, b) => {
    // 1. CRITICAL before WARNING before INFO
    const severityOrder: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
    const sev = (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9);
    if (sev !== 0) return sev;

    // 2. Higher absolute COP impact first
    return alertDelta(b) - alertDelta(a);
  });
}

// Extract a comparable COP delta from payloadJson.
// sales_drop      → prevAmount - currentAmount  (size of the drop)
// seller_dependency → amount                    (concentrated revenue at risk)
function alertDelta(a: BusinessAlertRow): number {
  const p = a.payloadJson as Record<string, number>;
  if (a.type === "sales_drop") return (p.prevAmount ?? 0) - (p.currentAmount ?? 0);
  if (a.type === "seller_dependency") return p.amount ?? 0;
  return 0;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCOP(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}
