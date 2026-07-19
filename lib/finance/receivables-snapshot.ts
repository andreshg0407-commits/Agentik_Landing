/**
 * lib/finance/receivables-snapshot.ts
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FUENTE DE VERDAD ÚNICA de cuentas por cobrar (cartera).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Todos los módulos que muestran cartera deben consumir esta función:
 *   - Torre de Control   (executive/page.tsx  → getCarteraKpis)
 *   - Cliente 360        (customer360/service.ts → bucket summary)
 *   - Cola de Cobranza   (collections/queue.ts)
 *   - FP&A / Cash Flow   (fpa-queries.ts → getFpaCashFlow)
 *   - Copilot            (agentik context)
 *
 * ── Reglas canónicas ────────────────────────────────────────────────────────
 *
 *   Fuente:     CustomerReceivable (live — NO datos denormalizados)
 *
 *   Estatuses abiertos:
 *     OPEN | PARTIAL | OVERDUE
 *     Se excluyen: PAID (cobrado), WRITTEN_OFF (incobrable), CANCELLED (anulado).
 *
 *   Vencido:
 *     daysOverdue > 0  — campo calculado por SAG en sync.
 *     NO usar dueDate < NOW() porque es una comparación live que diverge del
 *     campo almacenado y genera resultados distintos en cada pantalla.
 *
 *   Ventana fiscal + carry-over:
 *     Igual que buildRxWhere en cobranza/page.tsx:
 *       invoiceDate >= window.from                                   (ventana actual)
 *       OR (invoiceDate en año anterior AND daysOverdue > 0)         (carry-over)
 *     Para full_history: sin filtro de fecha.
 *
 *   Aging buckets:
 *     Usa el campo "agingBucket" almacenado — calculado en sync por SAG.
 *     Buckets: CURRENT | 1-30 | 31-60 | 61-90 | 90+
 *
 * ── Por qué NO usar CustomerProfile ─────────────────────────────────────────
 *
 *   CustomerProfile.totalReceivable / overdueReceivable son campos denormalizados
 *   calculados en sync con el filtro INCORRECTO  status NOT IN ('PAID','WRITTEN_OFF'),
 *   que inadvertidamente INCLUYE documentos CANCELLED.
 *   Además quedan obsoletos hasta el próximo sync (pueden diferir horas/días).
 *   Esta función consulta CustomerReceivable directamente → siempre en vivo.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { FiscalWindow } from "@/lib/finance/fiscal-window";

// ── Canonical status set ──────────────────────────────────────────────────────

/** Estatuses que representan un saldo abierto / pendiente de cobro. */
export const RX_OPEN_STATUSES = ["OPEN", "PARTIAL", "OVERDUE"] as const;
export type  RxOpenStatus     = (typeof RX_OPEN_STATUSES)[number];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RxAgingBucket {
  bucket: "CURRENT" | "1-30" | "31-60" | "61-90" | "90+";
  amount: number;
  count:  number;
}

export interface RxCustomerBalance {
  customerNit:  string | null;
  customerId:   string | null;  // CustomerProfile.id (FK from CustomerReceivable)
  customerName: string;
  totalOpen:    number;   // SUM(balanceDue) — toda deuda abierta
  overdue:      number;   // SUM(balanceDue) donde daysOverdue > 0
  maxDpd:       number;   // MAX(daysOverdue)
  docCount:     number;
  /** Enriquecido por el caller cuando tiene acceso a CustomerProfile */
  slug?:        string | null;
}

export interface ReceivablesSnapshot {
  hasData:          boolean;
  currency:         "COP";
  windowLabel:      string;
  computedAt:       Date;
  // Org-level totals
  totalOpenBalance: number;    // SUM(balanceDue) todos los docs OPEN/PARTIAL/OVERDUE
  overdueBalance:   number;    // SUM(balanceDue) donde daysOverdue > 0
  overdueRatio:     number;    // overdueBalance / totalOpenBalance × 100
  docCount:         number;    // total documentos abiertos
  overdueDocCount:  number;    // documentos con daysOverdue > 0
  // Aging
  agingBuckets:     RxAgingBucket[];
  // Top debtors (org-level only; vacío cuando customerNit/customerId están presentes)
  topDebtors:       RxCustomerBalance[];
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isFinite(n) ? n : 0;
}

const BUCKET_ORDER = ["CURRENT", "1-30", "31-60", "61-90", "90+"] as const;

/**
 * Construye el fragmento SQL de carry-over para CustomerReceivable.
 * Mirrors buildRxWhere() en cobranza/page.tsx.
 *
 *   window = current_and_prior:
 *     invoiceDate >= Jan 1 prior year  (ya cubre carry-over implícito)
 *     → no se necesita OR adicional porque window.from ya está un año atrás
 *
 *   window = current_year / trailing_12 / etc.:
 *     invoiceDate >= window.from
 *     OR (invoiceDate >= window.from - 1 año AND invoiceDate < window.from AND daysOverdue > 0)
 *
 *   window = full_history / undefined: sin filtro de fecha.
 */
function buildSqlDateCarryOver(window?: FiscalWindow): Prisma.Sql {
  if (!window || window.mode === "full_history") return Prisma.sql``;

  if (window.mode === "strict_year") {
    // No carry-over. Hard range: invoiceDate IN [from, from+1yr).
    const to = new Date(window.year + 1, 0, 1);
    return Prisma.sql`AND "invoiceDate" >= ${window.from} AND "invoiceDate" < ${to}`;
  }

  if (window.mode === "current_and_prior") {
    // window.from ya es Jan 1 del año anterior — un simple >= basta.
    return Prisma.sql`AND "invoiceDate" >= ${window.from}`;
  }

  const priorYearFrom = new Date(window.from);
  priorYearFrom.setFullYear(priorYearFrom.getFullYear() - 1);
  return Prisma.sql`
    AND (
      "invoiceDate" >= ${window.from}
      OR (
        "invoiceDate" >= ${priorYearFrom}
        AND "invoiceDate" <  ${window.from}
        AND "daysOverdue" > 0
      )
    )
  `;
}

/**
 * Construye el fragmento WHERE de Prisma para CustomerReceivable con carry-over.
 */
function buildPrismaDateFilter(window?: FiscalWindow): Prisma.CustomerReceivableWhereInput {
  if (!window || window.mode === "full_history") return {};

  if (window.mode === "strict_year") {
    // No carry-over. Hard range: [Jan 1 year, Jan 1 year+1).
    const to = new Date(window.year + 1, 0, 1);
    return { invoiceDate: { gte: window.from, lt: to } };
  }

  if (window.mode === "current_and_prior") {
    return { invoiceDate: { gte: window.from } };
  }

  const priorYearFrom = new Date(window.from);
  priorYearFrom.setFullYear(priorYearFrom.getFullYear() - 1);
  return {
    OR: [
      { invoiceDate: { gte: window.from } },
      { invoiceDate: { gte: priorYearFrom, lt: window.from }, daysOverdue: { gt: 0 } },
    ],
  };
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Retorna un snapshot de cartera en vivo desde CustomerReceivable.
 *
 * @param organizationId  Tenant obligatorio.
 * @param window          Ventana fiscal con carry-over (recomendada: current_and_prior).
 *                        Sin ventana = todo el historial.
 * @param opts.customerNit     Filtrar a un solo cliente (por NIT).
 * @param opts.customerId      Filtrar a un solo cliente (por ID interno).
 * @param opts.topDebtorsLimit Límite de deudores. Default 10. Solo aplica org-level.
 */
export async function getReceivablesSnapshot(
  organizationId: string,
  window?:        FiscalWindow,
  opts?: {
    customerNit?:      string | null;
    customerId?:       string | null;
    topDebtorsLimit?:  number;
  },
): Promise<ReceivablesSnapshot> {
  const now   = new Date();
  const limit = opts?.topDebtorsLimit ?? 10;

  // ── Prisma baseWhere ──────────────────────────────────────────────────────
  const andClauses: Prisma.CustomerReceivableWhereInput[] = [];
  const dateFilter = buildPrismaDateFilter(window);
  if (Object.keys(dateFilter).length > 0) andClauses.push(dateFilter);

  if (opts?.customerId || opts?.customerNit) {
    const customerOr: Prisma.CustomerReceivableWhereInput[] = [];
    if (opts.customerId)  customerOr.push({ customerId:  opts.customerId });
    if (opts.customerNit) customerOr.push({ customerNit: opts.customerNit });
    andClauses.push({ OR: customerOr });
  }

  // balanceDue > 0: exclude credit notes, overpayments and sign-reversal adjustments.
  // Negative balanceDue reduces totals and contaminates aging buckets (e.g. 61-90 shows -118M).
  // These records represent "saldos a favor" — tracked separately, not part of open cartera.
  const baseWhere: Prisma.CustomerReceivableWhereInput = {
    organizationId,
    status:     { in: [...RX_OPEN_STATUSES] },
    balanceDue: { gt: 0 },
    ...(andClauses.length > 0 ? { AND: andClauses } : {}),
  };

  // ── Parallel Prisma queries ───────────────────────────────────────────────
  const [totalAgg, overdueAgg, agingRaw] = await Promise.all([
    // Total open balance + doc count
    prisma.customerReceivable.aggregate({
      where:  baseWhere,
      _sum:   { balanceDue: true },
      _count: true,
    }),
    // Overdue: daysOverdue > 0 (campo SAG — no live date comparison)
    prisma.customerReceivable.aggregate({
      where:  { ...baseWhere, daysOverdue: { gt: 0 } },
      _sum:   { balanceDue: true },
      _count: true,
    }),
    // Aging breakdown
    prisma.customerReceivable.groupBy({
      by:     ["agingBucket"],
      where:  baseWhere,
      _sum:   { balanceDue: true },
      _count: true,
    }),
  ]);

  // ── Top debtors (raw SQL, org-level only) ────────────────────────────────
  let topDebtors: RxCustomerBalance[] = [];

  if (!opts?.customerId && !opts?.customerNit) {
    type DebtorRow = {
      customerNit:  string | null;
      customerId:   string | null;
      customerName: string;
      total:        number;
      overdue:      number;
      maxDpd:       number;
      docs:         string;
    };

    const dateCondition = buildSqlDateCarryOver(window);

    const rows = await prisma.$queryRaw<DebtorRow[]>(Prisma.sql`
      SELECT
        "customerNit",
        MAX("customerId")                                                             AS "customerId",
        "customerName",
        SUM("balanceDue")::float8                                                    AS total,
        SUM(CASE WHEN "daysOverdue" > 0 THEN "balanceDue" ELSE 0 END)::float8       AS overdue,
        MAX("daysOverdue")                                                            AS "maxDpd",
        CAST(COUNT(*) AS TEXT)                                                       AS docs
      FROM  "CustomerReceivable"
      WHERE "organizationId" = ${organizationId}
        AND "status" IN ('OPEN', 'PARTIAL', 'OVERDUE')
        AND "balanceDue" > 0
        ${dateCondition}
      GROUP BY "customerNit", "customerName"
      ORDER BY overdue DESC, total DESC
      LIMIT  ${limit}
    `);

    topDebtors = rows.map(r => ({
      customerNit:  r.customerNit,
      customerId:   r.customerId ?? null,
      customerName: r.customerName,
      totalOpen:    toNum(r.total),
      overdue:      toNum(r.overdue),
      maxDpd:       toNum(r.maxDpd),
      docCount:     Number(r.docs),
    }));
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalOpenBalance = toNum(totalAgg._sum.balanceDue);
  const overdueBalance   = toNum(overdueAgg._sum.balanceDue);
  const docCount         = totalAgg._count         as number;
  const overdueDocCount  = overdueAgg._count        as number;
  const overdueRatio     = totalOpenBalance > 0
    ? (overdueBalance / totalOpenBalance) * 100
    : 0;

  const agingBuckets: RxAgingBucket[] = BUCKET_ORDER.map(bucket => {
    const row = agingRaw.find(r => r.agingBucket === bucket);
    return {
      bucket,
      amount: row ? toNum(row._sum.balanceDue) : 0,
      count:  row ? (row._count as number)     : 0,
    };
  });

  return {
    hasData:          docCount > 0,
    currency:         "COP",
    windowLabel:      window?.label ?? "Todo el historial",
    computedAt:       now,
    totalOpenBalance,
    overdueBalance,
    overdueRatio,
    docCount,
    overdueDocCount,
    agingBuckets,
    topDebtors,
  };
}
