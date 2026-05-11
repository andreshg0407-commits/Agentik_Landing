/**
 * lib/finance/cartera-kpis.ts
 *
 * Cartera (accounts receivable) analytics layer — Torre de Control.
 *
 * Delega toda la lógica de datos a getReceivablesSnapshot() que es la
 * fuente de verdad única de cartera.  Este módulo agrega:
 *   • Enriquecimiento de slug (URL) para top debtors (desde CustomerProfile)
 *   • Cálculo de concentración (share de cartera vencida por cliente)
 *   • Tipos y shape que espera el panel ejecutivo
 *
 * ── Reglas de datos heredadas de receivables-snapshot ────────────────────────
 *
 *   Fuente:    CustomerReceivable (live)
 *   Estatuses: OPEN | PARTIAL | OVERDUE
 *   Vencido:   daysOverdue > 0
 *   Ventana:   fiscal window + carry-over en invoiceDate
 *
 * Exports:
 *   getCarteraKpis(orgId, window?)  → org-level cartera summary + top debtors
 *   CarteraKpis                     → output type
 *   TopDebtorRow                    → per-customer type usado por exec panel y copilot
 */

import { Prisma }                    from "@prisma/client";
import { prisma }                   from "@/lib/prisma";
import type { FiscalWindow }        from "@/lib/finance/fiscal-window";
import { getReceivablesSnapshot }   from "@/lib/finance/receivables-snapshot";

// ── Window SQL helper (mirrors buildSqlDateCarryOver in receivables-snapshot) ─
// Applied to count90Plus, activeDebtors, maxDpd queries so they respect the
// same fiscal window as the main snapshot — prevents 6-year-old DPD leaking in.

function buildWindowSql(window?: FiscalWindow): Prisma.Sql {
  if (!window || window.mode === "full_history") return Prisma.sql``;
  if (window.mode === "strict_year") {
    const to = new Date(window.year + 1, 0, 1);
    return Prisma.sql`AND "invoiceDate" >= ${window.from} AND "invoiceDate" < ${to}`;
  }
  if (window.mode === "current_and_prior") {
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

function buildWindowPrisma(window?: FiscalWindow): Prisma.CustomerReceivableWhereInput {
  if (!window || window.mode === "full_history") return {};
  if (window.mode === "strict_year") {
    const to = new Date(window.year + 1, 0, 1);
    return { invoiceDate: { gte: window.from, lt: to } };
  }
  if (window.mode === "current_and_prior") return { invoiceDate: { gte: window.from } };
  const priorYearFrom = new Date(window.from);
  priorYearFrom.setFullYear(priorYearFrom.getFullYear() - 1);
  return {
    OR: [
      { invoiceDate: { gte: window.from } },
      { invoiceDate: { gte: priorYearFrom, lt: window.from }, daysOverdue: { gt: 0 } },
    ],
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgingBucket {
  key:     "0-30" | "31-60" | "61-90" | "90+";
  /** SUM(balanceDue) for documents in this bucket */
  amount:  number;
  /** Document count */
  count:   number;
  /** Distinct customer count */
  clients: number;
}

export interface TopDebtorRow {
  slug:              string | null;   // null when CustomerProfile not found
  customerId:        string | null;   // CustomerProfile.id — preferred nav key
  nit:               string | null;   // fallback nav key when no profile
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
  /** Label de la ventana fiscal activa, e.g. "Año fiscal 2026" */
  windowLabel:       string;
  // Org-level totals
  totalReceivable:   number;   // SUM(balanceDue) todos los docs abiertos en ventana
  overdueReceivable: number;   // SUM(balanceDue) donde daysOverdue > 0
  overdueRatio:      number;   // overdueReceivable / totalReceivable × 100
  // Aging extremes
  maxDpd:            number;   // MAX(daysOverdue) en org
  count90Plus:       number;   // clientes con daysOverdue > 90 (= aging["90+"].clients)
  activeDebtors:     number;   // clientes con daysOverdue > 0
  // Client counts (unified source — CustomerReceivable same window)
  totalClients:      number;   // distinct customers with OPEN/PARTIAL/OVERDUE
  overdueClients:    number;   // distinct customers with daysOverdue > 0
  moraPct:           number;   // overdueClients / totalClients × 100
  // Aging buckets — derived from CustomerReceivable.daysOverdue, same window
  aging:             AgingBucket[];
  // Concentration
  topDebtor:         TopDebtorRow | null;
  concentrationRisk: number;   // share del top deudor sobre total vencido (0–100)
  top5Debtors:       TopDebtorRow[];
}

// ── Main query ────────────────────────────────────────────────────────────────

/**
 * Retorna el resumen de cartera para Torre de Control.
 *
 * Usa getReceivablesSnapshot() como fuente de datos (live, CustomerReceivable)
 * y enriquece con slugs desde CustomerProfile para habilitar navegación.
 *
 * @param organizationId  Tenant.
 * @param window          Ventana fiscal. Recomendada: current_and_prior (carry-over).
 */
export async function getCarteraKpis(
  organizationId: string,
  window?: FiscalWindow,
): Promise<CarteraKpis> {
  const db = prisma as any;

  // ── 1. Snapshot canónico de cartera ──────────────────────────────────────
  const snapshot = await getReceivablesSnapshot(organizationId, window, {
    topDebtorsLimit: 5,
  });

  const { totalOpenBalance, overdueBalance, overdueRatio, topDebtors } = snapshot;

  // ── 2. Enriquecer top debtors con slug desde CustomerProfile ─────────────
  // Los slugs son necesarios para navegación desde el panel ejecutivo.
  // CustomerReceivable.customerNit = real NIT from TERCEROS JOIN.
  // Search by both nitNormalized (canonical S1) and legacy nit field.
  // LEGACY_NIT_JOIN: once all profiles have nitNormalized populated (via TERCEROS sync +
  // resolveCustomersByNit), the nit fallback can be removed.
  // Do NOT use sagTerceroId here — CustomerReceivable.customerNit is always the real NIT.
  const nits = topDebtors
    .map(d => d.customerNit)
    .filter((n): n is string => n != null);

  type ProfileEntry = { slug: string | null; id: string };
  const profileMap = new Map<string, ProfileEntry>();
  if (nits.length > 0) {
    const profiles = await db.customerProfile.findMany({
      where: {
        organizationId,
        OR: [
          { nitNormalized: { in: nits } },
          // LEGACY_NIT_JOIN: fallback for profiles where nitNormalized was not yet set
          { nit: { in: nits } },
        ],
      },
      select: { nit: true, nitNormalized: true, slug: true, id: true },
    });
    for (const p of profiles) {
      const entry = { slug: p.slug ?? null, id: p.id };
      // Index by both normalized and legacy nit so the lookup works regardless
      if (p.nitNormalized) profileMap.set(p.nitNormalized, entry);
      if (p.nit && !profileMap.has(p.nit)) profileMap.set(p.nit, entry);
    }
  }

  // Name-based fallback for debtors without a NIT match (e.g. synced before TERCEROS JOIN fix).
  const nameProfileMap = new Map<string, ProfileEntry>();
  const unmatchedDebtors = topDebtors.filter(
    d => !d.customerId && !profileMap.has(d.customerNit ?? ""),
  );
  if (unmatchedDebtors.length > 0) {
    const names = [...new Set(unmatchedDebtors.map(d => d.customerName).filter(Boolean))];
    if (names.length > 0) {
      const byName = await db.customerProfile.findMany({
        where:  { organizationId, name: { in: names } },
        select: { id: true, name: true, nit: true, slug: true },
      });
      for (const p of byName) {
        nameProfileMap.set(p.name, { slug: p.slug ?? null, id: p.id });
      }
    }
  }

  // ── 3. Métricas de concentración y extremos ───────────────────────────────
  const top5Debtors: TopDebtorRow[] = topDebtors.map(d => {
    const prof       = profileMap.get(d.customerNit ?? "");
    const profByName = nameProfileMap.get(d.customerName);
    return {
      // customerId: prefer direct FK, then NIT-matched profile, then name-matched profile
      customerId:        d.customerId   ?? prof?.id       ?? profByName?.id   ?? null,
      slug:              prof?.slug                        ?? profByName?.slug ?? null,
      nit:               d.customerNit                    ?? null,
      name:              d.customerName,
      overdueReceivable: d.overdue,
      totalReceivable:   d.totalOpen,
      maxDpd:            d.maxDpd,
      share:             overdueBalance > 0 ? (d.overdue / overdueBalance) * 100 : 0,
    };
  });

  // Aging + client counts: single consistent source — CustomerReceivable, same window.
  // All 4 aging buckets + totalClients + overdueClients computed in parallel.
  type CountRow   = { n: string };
  type AgingRow   = { bucket: string; amount: string; cnt: string; clients: string };
  const windowSql = buildWindowSql(window);

  const [agingRaw, activeDebtorsRow, totalClientsRow] = await Promise.all([
    // Aging by daysOverdue ranges — all 4 buckets in one query, same window.
    // Buckets: 0-30 (cartera sana), 31-60 (atención), 61-90 (riesgo), 90+ (crítico).
    // balanceDue > 0: exclude credit notes / adjustments that corrupt aging amounts.
    prisma.$queryRaw<AgingRow[]>(Prisma.sql`
      SELECT
        CASE
          WHEN "daysOverdue" <= 30 THEN '0-30'
          WHEN "daysOverdue" <= 60 THEN '31-60'
          WHEN "daysOverdue" <= 90 THEN '61-90'
          ELSE '90+'
        END AS bucket,
        SUM("balanceDue")::float8::text                                               AS amount,
        CAST(COUNT(*) AS TEXT)                                                         AS cnt,
        CAST(COUNT(DISTINCT COALESCE("customerNit", "id"::text)) AS TEXT)              AS clients
      FROM "CustomerReceivable"
      WHERE "organizationId" = ${organizationId}
        AND "status" IN ('OPEN', 'PARTIAL', 'OVERDUE')
        AND "balanceDue" > 0
        ${windowSql}
      GROUP BY bucket
    `),
    // overdueClients: distinct customers with daysOverdue > 0 and balanceDue > 0 (same window)
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT CAST(COUNT(DISTINCT COALESCE("customerNit", "id"::text)) AS TEXT) AS n
      FROM "CustomerReceivable"
      WHERE "organizationId" = ${organizationId}
        AND "status" IN ('OPEN', 'PARTIAL', 'OVERDUE')
        AND "balanceDue" > 0
        AND "daysOverdue" > 0
        ${windowSql}
    `),
    // totalClients: all distinct customers with positive balanceDue in scope (same window)
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT CAST(COUNT(DISTINCT COALESCE("customerNit", "id"::text)) AS TEXT) AS n
      FROM "CustomerReceivable"
      WHERE "organizationId" = ${organizationId}
        AND "status" IN ('OPEN', 'PARTIAL', 'OVERDUE')
        AND "balanceDue" > 0
        ${windowSql}
    `),
  ]);

  // Build aging buckets array (always 4 entries, zero-filled if no data)
  const BUCKET_KEYS = ["0-30", "31-60", "61-90", "90+"] as const;
  const aging: AgingBucket[] = BUCKET_KEYS.map(key => {
    const row = agingRaw.find(r => r.bucket === key);
    return {
      key,
      amount:  row ? parseFloat(row.amount ?? "0") : 0,
      count:   row ? parseInt(row.cnt     ?? "0", 10) : 0,
      clients: row ? parseInt(row.clients ?? "0", 10) : 0,
    };
  });

  // Derive count90Plus from the aging bucket (consistent with aging display)
  const count90PlusRow = aging.find(b => b.key === "90+");
  const count90Plus    = count90PlusRow?.clients ?? 0;

  // maxDpd: aggregate con la misma ventana fiscal para no reportar DPD de cartera antigua.
  let maxDpd = 0;
  if (topDebtors.length > 0) {
    maxDpd = Math.max(...topDebtors.map(d => d.maxDpd));
    // Si hay más deudores que el top 5, maxDpd puede estar subestimado.
    // Aggregate exacto con filtro de ventana.
    const windowPrisma = buildWindowPrisma(window);
    const maxWhere: Prisma.CustomerReceivableWhereInput = {
      organizationId,
      status: { in: ["OPEN", "PARTIAL", "OVERDUE"] },
      ...(Object.keys(windowPrisma).length > 0 ? { AND: [windowPrisma] } : {}),
    };
    const maxRow = await prisma.customerReceivable.aggregate({
      where: maxWhere,
      _max:  { daysOverdue: true },
    });
    maxDpd = maxRow._max.daysOverdue ?? maxDpd;
  }

  const overdueClients    = Number((activeDebtorsRow[0]?.n ?? "0"));
  const totalClients      = Number((totalClientsRow[0]?.n  ?? "0"));
  const moraPct           = totalClients > 0 ? (overdueClients / totalClients) * 100 : 0;
  const topDebtor         = top5Debtors[0] ?? null;
  const concentrationRisk = topDebtor?.share ?? 0;

  return {
    hasData:           snapshot.hasData,
    currency:          "COP",
    windowLabel:       snapshot.windowLabel,
    totalReceivable:   totalOpenBalance,
    overdueReceivable: overdueBalance,
    overdueRatio,
    maxDpd,
    count90Plus,
    activeDebtors:     overdueClients,
    totalClients,
    overdueClients,
    moraPct,
    aging,
    topDebtor,
    concentrationRisk,
    top5Debtors,
  };
}

// ── Histórico por depurar ──────────────────────────────────────────────────────

export interface CarteraHistoricoYear {
  year:           number;
  totalBalance:   number;
  overdueBalance: number;
  docCount:       number;
}

/**
 * Retorna el saldo vivo (OPEN/PARTIAL/OVERDUE) de años anteriores a `beforeYear`,
 * agrupado por año de invoiceDate.  Sólo incluye años con saldo > 0.
 *
 * Usado en el bloque "Cartera histórica por depurar" del panel ejecutivo B2.
 *
 * @param organizationId  Tenant.
 * @param beforeYear      Año exclusivo superior (default 2026). Solo retorna invoiceDate < Jan 1 beforeYear.
 */
export async function getCarteraHistoricoByYear(
  organizationId: string,
  beforeYear = 2026,
): Promise<CarteraHistoricoYear[]> {
  const cutoff = new Date(beforeYear, 0, 1, 0, 0, 0, 0);

  type Row = { yr: number; total: string; overdue: string; cnt: string };
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT
      EXTRACT(YEAR FROM "invoiceDate")::int                                         AS yr,
      SUM("balanceDue")::float8::text                                               AS total,
      SUM(CASE WHEN "daysOverdue" > 0 THEN "balanceDue" ELSE 0 END)::float8::text  AS overdue,
      CAST(COUNT(*) AS TEXT)                                                         AS cnt
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${organizationId}
      AND "status" IN ('OPEN', 'PARTIAL', 'OVERDUE')
      AND "invoiceDate" < ${cutoff}
    GROUP BY yr
    HAVING SUM("balanceDue") > 0
    ORDER BY yr DESC
  `);

  return rows.map(r => ({
    year:           Number(r.yr),
    totalBalance:   parseFloat(r.total   ?? "0"),
    overdueBalance: parseFloat(r.overdue ?? "0"),
    docCount:       parseInt(r.cnt       ?? "0", 10),
  }));
}
