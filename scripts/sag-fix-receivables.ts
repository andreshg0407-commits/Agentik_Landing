/**
 * sag-fix-receivables.ts
 *
 * Fixes existing CustomerReceivable data for Castillitos:
 *
 *  Phase 1 — Fetch full FUENTES map from SAG API:
 *    - sc_cobrar_pagar: 'C' (Cobrar/AR) or 'P' (Pagar/AP)
 *    - k_n_clase_fuente: 4 = customer orders (not yet invoiced)
 *    - ka_ni_forma_pago_fte: 1 = immediate, 2 = credit (30-day default)
 *
 *  Phase 2 — DELETE non-AR rows from CustomerReceivable:
 *    - sc_cobrar_pagar = 'P'  (payables: Egresos, Gastos, Compras, etc.)
 *    - k_n_clase_fuente = 4   (Pedidos Clientes — customer orders not yet billed)
 *
 *  Phase 3 — UPDATE dueDate and daysOverdue on remaining rows:
 *    - forma_pago = 2 → dueDate = issueDate + 30 days
 *    - otherwise      → dueDate = issueDate (immediate/POS)
 *    - daysOverdue = MAX(0, days since dueDate) for non-PAID rows
 *
 *  Phase 4 — Bulk KPI refresh on CustomerProfile.
 *
 * Dry-run by default. Pass --apply to commit.
 */
import * as path   from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

const APPLY  = process.argv.includes("--apply");
const ORG_ID = "cmmpwstuf000dp5y58kj1daaj";

// Credit days by ka_ni_forma_pago_fte value (FK to FORMAS_PAGO which doesn't exist)
// Based on Colombian invoice conventions:
//   1 = immediate/cash (POS, contado)
//   2 = credit (30-day default — actual terms not available in DB)
const CREDIT_DAYS_BY_FORMA: Record<number, number> = {
  1: 0,
  2: 30,
};

interface FuenteRow {
  ka_ni_fuente:        number;
  sc_cobrar_pagar:     string; // 'C' = cobrar (AR), 'P' = pagar (AP)
  k_n_clase_fuente:    number; // 4 = customer orders
  ka_ni_forma_pago_fte: number | null;
}

function section(title: string) {
  console.log(`\n${"═".repeat(65)}`);
  console.log(`  ${title}`);
  console.log(`${"═".repeat(65)}`);
}

async function main() {
  const { getPyaConfig }    = await import("../lib/connectors/pya/auth");
  const { consultaSagJson } = await import("../lib/connectors/pya/client");
  const { prisma }          = await import("../lib/prisma");

  const token    = process.env.PYA_SOAP_TOKEN?.trim() || process.env.SAG_TEST_TOKEN?.trim();
  const database = process.env.PYA_SAG_BD?.trim();
  if (!token) throw new Error("PYA_SOAP_TOKEN or SAG_TEST_TOKEN required");
  const apiConfig = getPyaConfig({ token, database });

  console.log(`\n── SAG Fix Receivables ──`);
  console.log(APPLY ? "MODE: APPLY" : "MODE: DRY-RUN");

  // ── Phase 1: Fetch FUENTES map ────────────────────────────────────────────────
  section("Phase 1 — Fetch FUENTES from SAG");
  const fuenteRows = await consultaSagJson(
    apiConfig,
    "SELECT ka_ni_fuente, sc_cobrar_pagar, k_n_clase_fuente, ka_ni_forma_pago_fte FROM FUENTES"
  ) as unknown as FuenteRow[];
  console.log(`  Fetched ${fuenteRows.length} FUENTES rows`);

  // Build maps
  const excludeIds: number[] = []; // fuentes that are payables or orders
  const creditIds: number[]  = []; // C-type fuentes with 30-day credit (forma=2)
  const fuente30Days         = new Set<number>();

  for (const f of fuenteRows) {
    const cobrarPagar = String(f.sc_cobrar_pagar ?? "").trim();
    const clase       = Number(f.k_n_clase_fuente ?? 0);
    const formaPago   = f.ka_ni_forma_pago_fte != null ? Number(f.ka_ni_forma_pago_fte) : null;
    const fuenteId    = Number(f.ka_ni_fuente);

    if (cobrarPagar === "P" || clase === 4) {
      excludeIds.push(fuenteId);
    } else if (cobrarPagar === "C") {
      const days = formaPago != null ? (CREDIT_DAYS_BY_FORMA[formaPago] ?? 0) : 0;
      if (days > 0) {
        fuente30Days.add(fuenteId);
        creditIds.push(fuenteId);
      }
    }
  }

  console.log(`\n  EXCLUDE (P-type + class-4 orders): ${excludeIds.length} fuentes`);
  console.log(`  AR with 0-day credit (C-type, forma≠2): ${fuenteRows.length - excludeIds.length - creditIds.length} fuentes`);
  console.log(`  AR with 30-day credit (C-type, forma=2): ${creditIds.length} fuentes`);
  console.log(`\n  30-day credit fuente IDs: ${creditIds.slice(0, 30).join(", ")}${creditIds.length > 30 ? " ..." : ""}`);
  console.log(`  Exclude fuente IDs (first 30): ${excludeIds.slice(0, 30).join(", ")}${excludeIds.length > 30 ? " ..." : ""}`);

  // ── Pre-flight DB counts ──────────────────────────────────────────────────────
  section("Pre-flight DB counts");
  const totalBefore = await prisma.customerReceivable.count({ where: { organizationId: ORG_ID } });

  const excludableCount = await prisma.$queryRaw<{ cnt: bigint }[]>`
    SELECT COUNT(*) AS cnt
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${ORG_ID}
      AND ("rawErpJson"->'raw'->>'ka_ni_fuente')::int = ANY(${excludeIds}::int[])
  `;
  const excludableCnt = Number(excludableCount[0].cnt);

  const creditCount = await prisma.$queryRaw<{ cnt: bigint }[]>`
    SELECT COUNT(*) AS cnt
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${ORG_ID}
      AND ("rawErpJson"->'raw'->>'ka_ni_fuente')::int = ANY(${creditIds}::int[])
      AND status NOT IN ('PAID', 'WRITTEN_OFF')
  `;
  const creditCnt = Number(creditCount[0].cnt);

  console.log(`  CustomerReceivable total                : ${totalBefore}`);
  console.log(`  Rows to DELETE (non-AR fuentes)         : ${excludableCnt}`);
  console.log(`  Remaining after delete                  : ${totalBefore - excludableCnt}`);
  console.log(`  Rows to get 30-day dueDate              : ${creditCnt}`);
  console.log(`  Remaining rows get 0-day dueDate        : ${totalBefore - excludableCnt - creditCnt}`);

  // Balance impact
  const balanceBefore = await prisma.$queryRaw<{ total: string }[]>`
    SELECT COALESCE(SUM("balanceDue"), 0)::text AS total
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${ORG_ID}
      AND status NOT IN ('PAID', 'WRITTEN_OFF')
  `;
  const excludeBalance = await prisma.$queryRaw<{ total: string }[]>`
    SELECT COALESCE(SUM("balanceDue"), 0)::text AS total
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${ORG_ID}
      AND status NOT IN ('PAID', 'WRITTEN_OFF')
      AND ("rawErpJson"->'raw'->>'ka_ni_fuente')::int = ANY(${excludeIds}::int[])
  `;
  console.log(`\n  Current SUM(balanceDue)                 : ${Number(balanceBefore[0].total).toLocaleString("es-CO")} COP`);
  console.log(`  Balance in non-AR rows (to be deleted)  : ${Number(excludeBalance[0].total).toLocaleString("es-CO")} COP`);
  console.log(`  Projected clean AR balance              : ${(Number(balanceBefore[0].total) - Number(excludeBalance[0].total)).toLocaleString("es-CO")} COP`);

  if (!APPLY) {
    console.log(`\nDRY-RUN complete. Re-run with --apply to commit.`);
    await prisma.$disconnect();
    process.exit(0);
  }

  // ── Phase 2: DELETE non-AR rows ───────────────────────────────────────────────
  section("Phase 2 — DELETE non-AR CustomerReceivable rows");
  const t2 = Date.now();
  const deleted = await prisma.$queryRaw<{ cnt: bigint }[]>`
    WITH del AS (
      DELETE FROM "CustomerReceivable"
      WHERE "organizationId" = ${ORG_ID}
        AND ("rawErpJson"->'raw'->>'ka_ni_fuente')::int = ANY(${excludeIds}::int[])
      RETURNING 1
    )
    SELECT COUNT(*) AS cnt FROM del
  `;
  console.log(`  ✓ Deleted ${Number(deleted[0].cnt)} non-AR rows in ${Date.now() - t2}ms`);

  // ── Phase 3: UPDATE dueDate and daysOverdue ───────────────────────────────────
  section("Phase 3 — UPDATE dueDate and daysOverdue");

  // 3a: 30-day credit fuentes
  if (creditIds.length > 0) {
    const t3a = Date.now();
    const upd30 = await prisma.$queryRaw<{ cnt: bigint }[]>`
      WITH upd AS (
        UPDATE "CustomerReceivable"
        SET
          "dueDate"     = "invoiceDate" + INTERVAL '30 days',
          "daysOverdue" = GREATEST(0, EXTRACT(DAY FROM (NOW() - ("invoiceDate" + INTERVAL '30 days')))::int),
          "agingBucket" = CASE
            WHEN GREATEST(0, EXTRACT(DAY FROM (NOW() - ("invoiceDate" + INTERVAL '30 days')))::int) = 0 THEN 'CURRENT'
            WHEN GREATEST(0, EXTRACT(DAY FROM (NOW() - ("invoiceDate" + INTERVAL '30 days')))::int) <= 30 THEN '1-30'
            WHEN GREATEST(0, EXTRACT(DAY FROM (NOW() - ("invoiceDate" + INTERVAL '30 days')))::int) <= 60 THEN '31-60'
            WHEN GREATEST(0, EXTRACT(DAY FROM (NOW() - ("invoiceDate" + INTERVAL '30 days')))::int) <= 90 THEN '61-90'
            ELSE '90+'
          END
        WHERE "organizationId" = ${ORG_ID}
          AND ("rawErpJson"->'raw'->>'ka_ni_fuente')::int = ANY(${creditIds}::int[])
          AND status NOT IN ('PAID', 'WRITTEN_OFF')
        RETURNING 1
      )
      SELECT COUNT(*) AS cnt FROM upd
    `;
    console.log(`  ✓ Updated ${Number(upd30[0].cnt)} rows with 30-day dueDate in ${Date.now() - t3a}ms`);
  }

  // 3b: 0-day fuentes (dueDate = issueDate, daysOverdue = days past issue date)
  //     These are POS / immediate-payment invoices — technically overdue from day 1
  //     Use dueDate = issueDate, daysOverdue = MAX(0, days since issueDate)
  const t3b = Date.now();
  const upd0 = await prisma.$queryRaw<{ cnt: bigint }[]>`
    WITH upd AS (
      UPDATE "CustomerReceivable"
      SET
        "dueDate"     = "invoiceDate",
        "daysOverdue" = GREATEST(0, EXTRACT(DAY FROM (NOW() - "invoiceDate"))::int),
        "agingBucket" = CASE
          WHEN GREATEST(0, EXTRACT(DAY FROM (NOW() - "invoiceDate"))::int) = 0 THEN 'CURRENT'
          WHEN GREATEST(0, EXTRACT(DAY FROM (NOW() - "invoiceDate"))::int) <= 30 THEN '1-30'
          WHEN GREATEST(0, EXTRACT(DAY FROM (NOW() - "invoiceDate"))::int) <= 60 THEN '31-60'
          WHEN GREATEST(0, EXTRACT(DAY FROM (NOW() - "invoiceDate"))::int) <= 90 THEN '61-90'
          ELSE '90+'
        END
      WHERE "organizationId" = ${ORG_ID}
        AND ("rawErpJson"->'raw'->>'ka_ni_fuente')::int != ALL(${creditIds}::int[])
        AND status NOT IN ('PAID', 'WRITTEN_OFF')
      RETURNING 1
    )
    SELECT COUNT(*) AS cnt FROM upd
  `;
  console.log(`  ✓ Updated ${Number(upd0[0].cnt)} rows with 0-day dueDate in ${Date.now() - t3b}ms`);

  // ── Phase 4: Bulk KPI refresh ─────────────────────────────────────────────────
  section("Phase 4 — Bulk KPI refresh on CustomerProfile");
  const t4 = Date.now();

  const withReceivables = await prisma.$queryRaw<{ id: string }[]>`
    WITH agg AS (
      SELECT
        cp.id                                                                             AS profile_id,
        COALESCE(
          SUM(CASE WHEN cr.status NOT IN ('PAID', 'WRITTEN_OFF')
                   THEN cr."balanceDue"::numeric END),
          0
        )                                                                                 AS "totalReceivable",
        COALESCE(
          SUM(CASE WHEN cr.status NOT IN ('PAID', 'WRITTEN_OFF')
                        AND cr."daysOverdue" > 0
                   THEN cr."balanceDue"::numeric END),
          0
        )                                                                                 AS "overdueReceivable",
        COALESCE(
          MAX(CASE WHEN cr.status NOT IN ('PAID', 'WRITTEN_OFF')
                   THEN cr."daysOverdue" END),
          0
        )                                                                                 AS "maxDpd"
      FROM "CustomerProfile" cp
      JOIN "CustomerReceivable" cr
        ON cr."organizationId" = cp."organizationId"
       AND cr."customerNit"    = cp."rawErpJson"->'raw'->>'ka_nl_tercero'
      WHERE cp."organizationId" = ${ORG_ID}
        AND cp."erpId"          IS NOT NULL
      GROUP BY cp.id
    )
    UPDATE "CustomerProfile" cp
    SET
      "totalReceivable"   = agg."totalReceivable",
      "overdueReceivable" = agg."overdueReceivable",
      "maxDpd"            = agg."maxDpd"::int,
      "updatedAt"         = NOW()
    FROM agg
    WHERE cp.id = agg.profile_id
    RETURNING cp.id
  `;
  console.log(`  ✓ Updated ${withReceivables.length} CustomerProfile rows with receivable KPIs in ${Date.now() - t4}ms`);

  // Zero-out profiles that no longer have receivables (rows deleted above may affect some)
  const updatedIds = withReceivables.map(r => r.id);
  const { count: zeroedOut } = await prisma.customerProfile.updateMany({
    where: {
      organizationId: ORG_ID,
      erpId: { not: null },
      id:    { notIn: updatedIds },
    },
    data: { totalReceivable: 0, overdueReceivable: 0, maxDpd: 0 },
  });
  console.log(`  ✓ Zeroed out ${zeroedOut} profiles with no remaining receivables`);

  // ── Verification ──────────────────────────────────────────────────────────────
  section("Verification");

  const totalAfter = await prisma.customerReceivable.count({ where: { organizationId: ORG_ID } });
  const nowOverdue = await prisma.customerReceivable.count({
    where: { organizationId: ORG_ID, daysOverdue: { gt: 0 } },
  });
  const balanceAfter = await prisma.$queryRaw<{ total: string }[]>`
    SELECT COALESCE(SUM("balanceDue"), 0)::text AS total
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${ORG_ID}
      AND status NOT IN ('PAID', 'WRITTEN_OFF')
  `;
  const overdueBalance = await prisma.$queryRaw<{ total: string }[]>`
    SELECT COALESCE(SUM("balanceDue"), 0)::text AS total
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${ORG_ID}
      AND status NOT IN ('PAID', 'WRITTEN_OFF')
      AND "daysOverdue" > 0
  `;
  const maxDpd = await prisma.$queryRaw<{ max: number }[]>`
    SELECT MAX("daysOverdue") AS max
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${ORG_ID}
      AND status NOT IN ('PAID', 'WRITTEN_OFF')
  `;
  const kpiSample = await prisma.customerProfile.findMany({
    where: { organizationId: ORG_ID, overdueReceivable: { gt: 0 } },
    orderBy: { overdueReceivable: "desc" },
    take: 5,
    select: { name: true, totalReceivable: true, overdueReceivable: true, maxDpd: true },
  });

  console.log(`  CustomerReceivable rows (after delete) : ${totalAfter}`);
  console.log(`  Rows with daysOverdue > 0              : ${nowOverdue}`);
  console.log(`  Clean SUM(balanceDue)                  : ${Number(balanceAfter[0].total).toLocaleString("es-CO")} COP`);
  console.log(`  SUM(balanceDue) overdue rows           : ${Number(overdueBalance[0].total).toLocaleString("es-CO")} COP`);
  console.log(`  MAX(daysOverdue)                       : ${maxDpd[0].max ?? 0} days`);

  if (kpiSample.length > 0) {
    console.log(`\n  Top 5 customers by overdueReceivable:`);
    console.log(`  ${"name".padEnd(40)} ${"total".padStart(15)} ${"overdue".padStart(15)} ${"maxDpd".padStart(8)}`);
    console.log(`  ${"-".repeat(82)}`);
    for (const p of kpiSample) {
      console.log(
        `  ${p.name.slice(0, 40).padEnd(40)} ` +
        `${Number(p.totalReceivable).toLocaleString("es-CO").padStart(15)} ` +
        `${Number(p.overdueReceivable).toLocaleString("es-CO").padStart(15)} ` +
        `${String(p.maxDpd ?? 0).padStart(8)}`
      );
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
