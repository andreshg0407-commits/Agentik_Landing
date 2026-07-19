/**
 * sag-bulk-kpi-refresh.ts
 *
 * Bulk refresh of CustomerProfile receivable KPIs for Castillitos org.
 *
 * Replaces the slow per-NIT sequential approach (which hung due to Neon idle
 * timeouts after a long SOAP wait) with a single CTE UPDATE query.
 *
 * Join key:
 *   CustomerReceivable.customerNit = CustomerProfile.rawErpJson->'raw'->>'ka_nl_tercero'
 *   (ka_nl_tercero is the internal SAG PK on TERCEROS, stored in rawErpJson
 *    from the full TERCEROS row captured during the customers sync)
 *
 * Fields refreshed:
 *   - totalReceivable   : SUM(balanceDue) for non-PAID/non-WRITTEN_OFF rows
 *   - overdueReceivable : SUM(balanceDue) for non-PAID/non-WRITTEN_OFF rows with daysOverdue > 0
 *   - maxDpd            : MAX(daysOverdue) for non-PAID/non-WRITTEN_OFF rows
 *
 * Scope: organizationId = cmmpwstuf000dp5y58kj1daaj (Castillitos), erpId IS NOT NULL only.
 *
 * Dry-run by default. Pass --apply to commit.
 */
import * as path   from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

const APPLY  = process.argv.includes("--apply");
const ORG_ID = "cmmpwstuf000dp5y58kj1daaj";

async function main() {
  const { prisma } = await import("../lib/prisma");
  const t0 = Date.now();

  console.log(`\n── SAG Bulk KPI Refresh ──`);
  console.log(APPLY ? "MODE: APPLY" : "MODE: DRY-RUN");

  // ── Pre-flight counts ───────────────────────────────────────────────────────
  const cpTotal = await prisma.customerProfile.count({
    where: { organizationId: ORG_ID, erpId: { not: null } },
  });
  const crTotal = await prisma.customerReceivable.count({
    where: { organizationId: ORG_ID },
  });
  const alreadyRefreshed = await prisma.customerProfile.count({
    where: { organizationId: ORG_ID, erpId: { not: null }, totalReceivable: { not: null } },
  });

  console.log(`\nCustomerProfile (erpId set)   : ${cpTotal}`);
  console.log(`CustomerReceivable            : ${crTotal}`);
  console.log(`Already have totalReceivable  : ${alreadyRefreshed}`);
  console.log(`Still null                    : ${cpTotal - alreadyRefreshed}`);

  // ── Join preview ────────────────────────────────────────────────────────────
  const joinPreview = await prisma.$queryRaw<{
    matched_profiles: bigint;
    matched_receivables: bigint;
    unmatched_receivables: bigint;
  }[]>`
    SELECT
      COUNT(DISTINCT cp.id)                                   AS matched_profiles,
      COUNT(cr."erpId") FILTER (WHERE cp.id IS NOT NULL)     AS matched_receivables,
      COUNT(cr."erpId") FILTER (WHERE cp.id IS NULL)         AS unmatched_receivables
    FROM "CustomerReceivable" cr
    LEFT JOIN "CustomerProfile" cp
      ON cp."organizationId" = cr."organizationId"
     AND cp."rawErpJson"->'raw'->>'ka_nl_tercero' = cr."customerNit"
    WHERE cr."organizationId" = ${ORG_ID}
  `;
  const jp = joinPreview[0];
  console.log(`\nJoin preview:`);
  console.log(`  CustomerProfile rows matched to receivables : ${jp.matched_profiles}`);
  console.log(`  CustomerReceivable rows matched             : ${jp.matched_receivables}`);
  console.log(`  CustomerReceivable rows unmatched           : ${jp.unmatched_receivables} (ka_nl_tercero not in CustomerProfile — no NIT in SAG)`);

  if (!APPLY) {
    console.log(`\nDRY-RUN: would update:`);
    console.log(`  1. ${cpTotal} CustomerProfile rows (${jp.matched_profiles} with receivable data, ${BigInt(cpTotal) - jp.matched_profiles} zeroed out)`);
    console.log(`  2. All 3 KPI fields: totalReceivable, overdueReceivable, maxDpd`);
    console.log(`\nRe-run with --apply to commit.`);
    await prisma.$disconnect();
    process.exit(0);
  }

  // ── Step 1: Bulk update profiles THAT HAVE receivables via CTE JOIN ─────────
  console.log(`\n[1/2] Bulk UPDATE via CTE join (ka_nl_tercero)...`);
  const t1 = Date.now();

  const withReceivables = await prisma.$queryRaw<{ id: string }[]>`
    WITH agg AS (
      SELECT
        cp.id                                                                            AS profile_id,
        COALESCE(
          SUM(CASE WHEN cr.status NOT IN ('PAID', 'WRITTEN_OFF')
                   THEN cr."balanceDue"::numeric END),
          0
        )                                                                                AS "totalReceivable",
        COALESCE(
          SUM(CASE WHEN cr.status NOT IN ('PAID', 'WRITTEN_OFF')
                        AND cr."daysOverdue" > 0
                   THEN cr."balanceDue"::numeric END),
          0
        )                                                                                AS "overdueReceivable",
        COALESCE(
          MAX(CASE WHEN cr.status NOT IN ('PAID', 'WRITTEN_OFF')
                   THEN cr."daysOverdue" END),
          0
        )                                                                                AS "maxDpd"
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
  console.log(`  ✓ Updated ${withReceivables.length} profiles with receivable KPIs in ${Date.now() - t1}ms`);

  // ── Step 2: Zero-out profiles with erpId but no matched receivables ─────────
  console.log(`[2/2] Zeroing out profiles with erpId but no receivables...`);
  const t2 = Date.now();

  const updatedIds = withReceivables.map(r => r.id);
  const { count: zeroedOut } = await prisma.customerProfile.updateMany({
    where: {
      organizationId: ORG_ID,
      erpId: { not: null },
      id:    { notIn: updatedIds },
    },
    data: {
      totalReceivable:   0,
      overdueReceivable: 0,
      maxDpd:            0,
    },
  });
  console.log(`  ✓ Zeroed out ${zeroedOut} profiles in ${Date.now() - t2}ms`);

  // ── Verification ─────────────────────────────────────────────────────────────
  console.log(`\n── Verification ──`);
  const finalNullCount = await prisma.customerProfile.count({
    where: { organizationId: ORG_ID, erpId: { not: null }, totalReceivable: null },
  });
  const withPositiveBalance = await prisma.customerProfile.count({
    where: { organizationId: ORG_ID, totalReceivable: { gt: 0 } },
  });
  const totalBalanceSum = await prisma.$queryRaw<{ s: string }[]>`
    SELECT COALESCE(SUM("totalReceivable"), 0)::text AS s
    FROM "CustomerProfile"
    WHERE "organizationId" = ${ORG_ID}
  `;
  const sampleProfiles = await prisma.customerProfile.findMany({
    where: { organizationId: ORG_ID, totalReceivable: { gt: 0 } },
    orderBy: { totalReceivable: "desc" },
    take: 5,
    select: { slug: true, name: true, totalReceivable: true, overdueReceivable: true, maxDpd: true },
  });

  console.log(`CustomerProfile (erpId) still null after refresh : ${finalNullCount}`);
  console.log(`CustomerProfile with totalReceivable > 0         : ${withPositiveBalance}`);
  console.log(`SUM(totalReceivable) across org                  : ${Number(totalBalanceSum[0].s).toLocaleString("es-CO")} COP`);

  if (sampleProfiles.length > 0) {
    console.log(`\nTop 5 by totalReceivable:`);
    console.log(`  ${"name".padEnd(40)} ${"total".padStart(15)} ${"overdue".padStart(15)} ${"maxDpd".padStart(8)}`);
    console.log(`  ${"-".repeat(82)}`);
    for (const p of sampleProfiles) {
      console.log(
        `  ${p.name.slice(0, 40).padEnd(40)} ` +
        `${Number(p.totalReceivable).toLocaleString("es-CO").padStart(15)} ` +
        `${Number(p.overdueReceivable).toLocaleString("es-CO").padStart(15)} ` +
        `${String(p.maxDpd ?? 0).padStart(8)}`
      );
    }
  }

  const totalElapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✓ Bulk KPI refresh complete in ${totalElapsed}s`);
  console.log(`  withReceivables updated : ${withReceivables.length}`);
  console.log(`  zeroed out              : ${zeroedOut}`);
  console.log(`  still null              : ${finalNullCount}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
