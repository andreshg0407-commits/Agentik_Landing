/**
 * scripts/_audit-customer-identity-quality.ts
 *
 * Post-backfill identity quality audit for org castillitos.
 * READ-ONLY — no writes, no side effects.
 *
 * Reports:
 *   1. CustomerProfile totals by identityStatus
 *   2. Top 20 NEEDS_REVIEW profiles by cartera balance (overdue first)
 *   3. Top 20 CONSUMIDOR_FINAL profiles by cartera balance
 *   4. Possible duplicates by nitNormalized (same NIT, same org, multiple profiles)
 *   5. Possible duplicates by normalized name (same name, same org, multiple profiles)
 *   6. CustomerReceivable without customerId (unlinked)
 *   7. CollectionRecord without customerId (unlinked)
 *
 * Usage:
 *   node --env-file=.env -e "require('tsx/cjs'); require('./scripts/_audit-customer-identity-quality.ts')" \
 *     -- --org castillitos
 */

import { prisma }       from "@/lib/prisma";
import { Prisma }       from "@prisma/client";

// ── CLI ───────────────────────────────────────────────────────────────────────

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const orgSlugArg = getArg("--org") ?? "castillitos";

// ── Formatting ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtCop(n: number): string {
  return `$${fmt(n)}`;
}

function pad(s: string, len: number): string {
  return s.length >= len ? s.slice(0, len) : s + " ".repeat(len - s.length);
}

function hr(char = "─", len = 72): string {
  return char.repeat(len);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  const db = prisma as any;

  // Resolve org
  const org = await db.organization.findFirst({
    where:  { slug: orgSlugArg },
    select: { id: true, slug: true, name: true },
  });
  if (!org) {
    console.error(`Organization not found: ${orgSlugArg}`);
    process.exit(1);
  }
  const orgId = org.id as string;

  console.log(`\n${hr("═")}`);
  console.log(`  Customer Identity Quality Audit`);
  console.log(`  org    : ${org.slug} (${orgId})`);
  console.log(`  date   : ${new Date().toISOString()}`);
  console.log(hr("═"));

  // ── 1. CustomerProfile totals by identityStatus ──────────────────────────

  const profileTotal: number = await db.customerProfile.count({
    where: { organizationId: orgId },
  });

  const statusCounts = await db.customerProfile.groupBy({
    by:     ["identityStatus"],
    where:  { organizationId: orgId },
    _count: { identityStatus: true },
    orderBy: { identityStatus: "asc" },
  });

  console.log(`\n${hr()}`);
  console.log(`  1. CustomerProfile — totals por identityStatus`);
  console.log(hr());
  console.log(`  Total profiles : ${fmt(profileTotal)}`);
  for (const row of statusCounts) {
    const pct = profileTotal > 0 ? ((row._count.identityStatus / profileTotal) * 100).toFixed(1) : "0.0";
    console.log(`  ${pad(row.identityStatus, 20)}  ${String(row._count.identityStatus).padStart(7)}  (${pct}%)`);
  }

  // ── 2. Top 20 NEEDS_REVIEW by cartera balance ────────────────────────────

  type DebtorRow = { customerId: string; total: string; overdue: string };

  const needsReviewProfiles: Array<{ id: string; name: string; nit: string | null; sagTerceroId: number | null; identityNotes: string | null }> =
    await db.customerProfile.findMany({
      where:  { organizationId: orgId, identityStatus: "NEEDS_REVIEW" },
      select: { id: true, name: true, nit: true, sagTerceroId: true, identityNotes: true },
    });

  console.log(`\n${hr()}`);
  console.log(`  2. Top 20 NEEDS_REVIEW por saldo cartera`);
  console.log(hr());

  if (needsReviewProfiles.length === 0) {
    console.log(`  (ninguno — NEEDS_REVIEW = 0)`);
  } else {
    const nrIds = needsReviewProfiles.map(p => p.id);
    const nrBalances = await prisma.$queryRaw<DebtorRow[]>(Prisma.sql`
      SELECT
        "customerId",
        SUM("balanceDue")::float8::text                                 AS total,
        SUM(CASE WHEN "daysOverdue" > 0 THEN "balanceDue" ELSE 0 END)::float8::text AS overdue
      FROM "CustomerReceivable"
      WHERE "organizationId" = ${orgId}
        AND "customerId" = ANY(${nrIds}::text[])
        AND "status" IN ('OPEN','PARTIAL','OVERDUE')
        AND "balanceDue" > 0
      GROUP BY "customerId"
      ORDER BY 3 DESC
      LIMIT 20
    `);

    const balMap = new Map(nrBalances.map(r => [r.customerId, { total: parseFloat(r.total), overdue: parseFloat(r.overdue) }]));
    const profMap = new Map(needsReviewProfiles.map(p => [p.id, p]));

    // Also include profiles with no cartera (zero balance) at the end
    const withBalance = nrBalances.map(r => {
      const p = profMap.get(r.customerId)!;
      return { ...p, total: parseFloat(r.total), overdue: parseFloat(r.overdue) };
    });
    const withoutBalance = needsReviewProfiles
      .filter(p => !balMap.has(p.id))
      .slice(0, Math.max(0, 20 - withBalance.length))
      .map(p => ({ ...p, total: 0, overdue: 0 }));
    const top20Nr = [...withBalance, ...withoutBalance].slice(0, 20);

    console.log(`  ${"name".padEnd(40)}  ${"nit".padEnd(12)}  ${"terceroId".padEnd(10)}  ${"overdue".padStart(16)}  ${"total".padStart(16)}`);
    console.log(`  ${"-".repeat(40)}  ${"-".repeat(12)}  ${"-".repeat(10)}  ${"-".repeat(16)}  ${"-".repeat(16)}`);
    for (const p of top20Nr) {
      console.log(
        `  ${pad(p.name, 40)}  ${pad(p.nit ?? "—", 12)}  ${String(p.sagTerceroId ?? "—").padEnd(10)}  ` +
        `${fmtCop(p.overdue).padStart(16)}  ${fmtCop(p.total).padStart(16)}`
      );
      if (p.identityNotes) {
        console.log(`    note: ${p.identityNotes}`);
      }
    }
    if (needsReviewProfiles.length > 20) {
      console.log(`  ... y ${needsReviewProfiles.length - 20} más`);
    }
  }

  // ── 3. Top 20 CONSUMIDOR_FINAL by cartera balance ────────────────────────

  const cfProfiles: Array<{ id: string; name: string }> = await db.customerProfile.findMany({
    where:  { organizationId: orgId, identityStatus: "CONSUMIDOR_FINAL" },
    select: { id: true, name: true },
  });

  console.log(`\n${hr()}`);
  console.log(`  3. CONSUMIDOR_FINAL profiles por saldo cartera`);
  console.log(hr());
  console.log(`  Total CONSUMIDOR_FINAL profiles : ${cfProfiles.length}`);

  if (cfProfiles.length > 0) {
    const cfIds = cfProfiles.map(p => p.id);
    const cfBalances = await prisma.$queryRaw<DebtorRow[]>(Prisma.sql`
      SELECT
        "customerId",
        SUM("balanceDue")::float8::text                                 AS total,
        SUM(CASE WHEN "daysOverdue" > 0 THEN "balanceDue" ELSE 0 END)::float8::text AS overdue
      FROM "CustomerReceivable"
      WHERE "organizationId" = ${orgId}
        AND "customerId" = ANY(${cfIds}::text[])
        AND "status" IN ('OPEN','PARTIAL','OVERDUE')
        AND "balanceDue" > 0
      GROUP BY "customerId"
      ORDER BY 3 DESC
      LIMIT 20
    `);

    if (cfBalances.length === 0) {
      console.log(`  (sin cartera abierta en CONSUMIDOR_FINAL)`);
    } else {
      const cfProfMap = new Map(cfProfiles.map(p => [p.id, p]));
      console.log(`  ${"customerId".padEnd(28)}  ${"name".padEnd(30)}  ${"overdue".padStart(16)}  ${"total".padStart(16)}`);
      console.log(`  ${"-".repeat(28)}  ${"-".repeat(30)}  ${"-".repeat(16)}  ${"-".repeat(16)}`);
      for (const r of cfBalances) {
        const p = cfProfMap.get(r.customerId);
        console.log(
          `  ${pad(r.customerId, 28)}  ${pad(p?.name ?? "—", 30)}  ` +
          `${fmtCop(parseFloat(r.overdue)).padStart(16)}  ${fmtCop(parseFloat(r.total)).padStart(16)}`
        );
      }
    }
  }

  // ── 4. Possible duplicates by nitNormalized ───────────────────────────────

  type DupNitRow = { nitNormalized: string; cnt: string };

  const dupNits = await prisma.$queryRaw<DupNitRow[]>(Prisma.sql`
    SELECT "nitNormalized", CAST(COUNT(*) AS TEXT) AS cnt
    FROM "CustomerProfile"
    WHERE "organizationId" = ${orgId}
      AND "nitNormalized" IS NOT NULL
    GROUP BY "nitNormalized"
    HAVING COUNT(*) > 1
    ORDER BY 2 DESC
    LIMIT 20
  `);

  console.log(`\n${hr()}`);
  console.log(`  4. Posibles duplicados por nitNormalized`);
  console.log(hr());

  if (dupNits.length === 0) {
    console.log(`  (ninguno — sin duplicados NIT)`);
  } else {
    console.log(`  ATENCION: ${dupNits.length} NITs con mas de un CustomerProfile`);
    console.log(`  ${"nitNormalized".padEnd(15)}  ${"profiles".padStart(8)}`);
    for (const r of dupNits) {
      console.log(`  ${pad(r.nitNormalized, 15)}  ${String(r.cnt).padStart(8)}`);
      // Show the conflicting profiles
      const conflicts: Array<{ id: string; name: string; identityStatus: string; sagTerceroId: number | null }> =
        await db.customerProfile.findMany({
          where:  { organizationId: orgId, nitNormalized: r.nitNormalized },
          select: { id: true, name: true, identityStatus: true, sagTerceroId: true },
        });
      for (const c of conflicts) {
        console.log(`    id=${c.id}  status=${c.identityStatus}  tercero=${c.sagTerceroId ?? "null"}  name=${c.name}`);
      }
    }
  }

  // ── 5. Possible duplicates by normalized name ─────────────────────────────

  type DupNameRow = { name: string; cnt: string };

  const dupNames = await prisma.$queryRaw<DupNameRow[]>(Prisma.sql`
    SELECT "name", CAST(COUNT(*) AS TEXT) AS cnt
    FROM "CustomerProfile"
    WHERE "organizationId" = ${orgId}
      AND "nitNormalized" IS NULL
    GROUP BY "name"
    HAVING COUNT(*) > 1
    ORDER BY 2 DESC
    LIMIT 20
  `);

  console.log(`\n${hr()}`);
  console.log(`  5. Posibles duplicados por name (solo perfiles sin NIT)`);
  console.log(hr());

  if (dupNames.length === 0) {
    console.log(`  (ninguno)`);
  } else {
    console.log(`  ${dupNames.length} nombre(s) con mas de un perfil (sin NIT)`);
    console.log(`  ${"name".padEnd(45)}  ${"profiles".padStart(8)}`);
    for (const r of dupNames) {
      console.log(`  ${pad(r.name, 45)}  ${String(r.cnt).padStart(8)}`);
    }
  }

  // ── 6. CustomerReceivable sin customerId ─────────────────────────────────

  const unlinkRec: number = await db.customerReceivable.count({
    where: { organizationId: orgId, customerId: null },
  });
  const totalRec: number = await db.customerReceivable.count({
    where: { organizationId: orgId },
  });

  console.log(`\n${hr()}`);
  console.log(`  6. CustomerReceivable sin customerId`);
  console.log(hr());
  console.log(`  Total records    : ${fmt(totalRec)}`);
  console.log(`  Sin customerId   : ${fmt(unlinkRec)}  (${totalRec > 0 ? ((unlinkRec / totalRec) * 100).toFixed(2) : "0.00"}%)`);
  console.log(`  Con customerId   : ${fmt(totalRec - unlinkRec)}  (${totalRec > 0 ? (((totalRec - unlinkRec) / totalRec) * 100).toFixed(2) : "0.00"}%)`);

  if (unlinkRec > 0) {
    // Show unlinked balance to quantify risk
    const unlinkedBal = await prisma.$queryRaw<Array<{ total: string; overdue: string }>>(Prisma.sql`
      SELECT
        COALESCE(SUM("balanceDue"), 0)::float8::text                                           AS total,
        COALESCE(SUM(CASE WHEN "daysOverdue" > 0 THEN "balanceDue" ELSE 0 END), 0)::float8::text AS overdue
      FROM "CustomerReceivable"
      WHERE "organizationId" = ${orgId}
        AND "customerId" IS NULL
        AND "status" IN ('OPEN','PARTIAL','OVERDUE')
        AND "balanceDue" > 0
    `);
    const bl = unlinkedBal[0];
    console.log(`  Saldo unlinked   : ${fmtCop(parseFloat(bl.total)).padStart(16)}  (vencido: ${fmtCop(parseFloat(bl.overdue))})`);

    // Sample unlinked (5 rows)
    const sample: Array<{ id: string; customerNit: string | null; customerName: string | null; balanceDue: unknown }> =
      await db.customerReceivable.findMany({
        where:   { organizationId: orgId, customerId: null },
        orderBy: { balanceDue: "desc" },
        take:    5,
        select:  { id: true, customerNit: true, customerName: true, balanceDue: true },
      });
    console.log(`  Sample (top 5 by balance):`);
    for (const r of sample) {
      console.log(`    id=${r.id.slice(0, 12)}…  nit=${r.customerNit ?? "null"}  name=${(r.customerName ?? "null").slice(0, 35)}  balance=${fmtCop(Number(r.balanceDue))}`);
    }
  }

  // ── 7. CollectionRecord sin customerId ───────────────────────────────────

  const unlinkCol: number = await db.collectionRecord.count({
    where: { organizationId: orgId, customerId: null },
  });
  const totalCol: number = await db.collectionRecord.count({
    where: { organizationId: orgId },
  });

  console.log(`\n${hr()}`);
  console.log(`  7. CollectionRecord sin customerId`);
  console.log(hr());
  console.log(`  Total records    : ${fmt(totalCol)}`);
  console.log(`  Sin customerId   : ${fmt(unlinkCol)}  (${totalCol > 0 ? ((unlinkCol / totalCol) * 100).toFixed(2) : "0.00"}%)`);
  console.log(`  Con customerId   : ${fmt(totalCol - unlinkCol)}  (${totalCol > 0 ? (((totalCol - unlinkCol) / totalCol) * 100).toFixed(2) : "0.00"}%)`);

  if (unlinkCol > 0) {
    const unlinkedColBal = await prisma.$queryRaw<Array<{ total: string }>>(Prisma.sql`
      SELECT COALESCE(SUM("amount"), 0)::float8::text AS total
      FROM "CollectionRecord"
      WHERE "organizationId" = ${orgId}
        AND "customerId" IS NULL
    `);
    const cb = unlinkedColBal[0];
    console.log(`  Monto unlinked   : ${fmtCop(parseFloat(cb.total))}`);

    const sampleCol: Array<{ id: string; customerNit: string | null; customerName: string | null; amount: unknown }> =
      await db.collectionRecord.findMany({
        where:   { organizationId: orgId, customerId: null },
        orderBy: { amount: "desc" },
        take:    5,
        select:  { id: true, customerNit: true, customerName: true, amount: true },
      });
    console.log(`  Sample (top 5 by amount):`);
    for (const r of sampleCol) {
      console.log(`    id=${r.id.slice(0, 12)}…  nit=${r.customerNit ?? "null"}  name=${(r.customerName ?? "null").slice(0, 35)}  amount=${fmtCop(Number(r.amount))}`);
    }
  }

  // ── 8. Navigation validation: INDUSTRIAS DIANA ALZATE SAS ────────────────

  console.log(`\n${hr()}`);
  console.log(`  8. Validacion navegacion: INDUSTRIAS DIANA ALZATE SAS`);
  console.log(hr());

  const diana: Array<{ id: string; slug: string | null; nit: string | null; nitNormalized: string | null; sagTerceroId: number | null; identityStatus: string }> =
    await db.customerProfile.findMany({
      where: {
        organizationId: orgId,
        name: { contains: "DIANA ALZATE", mode: "insensitive" },
      },
      select: { id: true, slug: true, nit: true, nitNormalized: true, sagTerceroId: true, identityStatus: true },
    });

  if (diana.length === 0) {
    console.log(`  (no encontrado — puede no tener cartera activa o nombre diferente)`);
  } else {
    for (const p of diana) {
      console.log(`  customerId     : ${p.id}`);
      console.log(`  slug           : ${p.slug ?? "null"}`);
      console.log(`  nit            : ${p.nit ?? "null"}`);
      console.log(`  nitNormalized  : ${p.nitNormalized ?? "null"}`);
      console.log(`  sagTerceroId   : ${p.sagTerceroId ?? "null"}`);
      console.log(`  identityStatus : ${p.identityStatus}`);
      console.log(`  nav href       : /${orgSlugArg}/customer-360?customerId=${p.id}`);

      // Check if any CustomerReceivable for this profile exists
      const recCount: number = await db.customerReceivable.count({
        where: { organizationId: orgId, customerId: p.id },
      });
      const recCountByNit: number = p.nit
        ? await db.customerReceivable.count({
            where: { organizationId: orgId, customerNit: p.nit },
          })
        : 0;
      console.log(`  receivables linked via customerId : ${fmt(recCount)}`);
      console.log(`  receivables with matching nit     : ${fmt(recCountByNit)}`);

      // Check top debtors: does this customer appear in cartera?
      const carteraRows = await prisma.$queryRaw<Array<{ total: string; overdue: string; maxdpd: string }>>(Prisma.sql`
        SELECT
          SUM("balanceDue")::float8::text                                                    AS total,
          SUM(CASE WHEN "daysOverdue" > 0 THEN "balanceDue" ELSE 0 END)::float8::text       AS overdue,
          MAX("daysOverdue")::text                                                            AS maxdpd
        FROM "CustomerReceivable"
        WHERE "organizationId" = ${orgId}
          AND "customerId" = ${p.id}
          AND "status" IN ('OPEN','PARTIAL','OVERDUE')
          AND "balanceDue" > 0
      `);
      const cr = carteraRows[0];
      console.log(`  cartera total  : ${fmtCop(parseFloat(cr.total ?? "0"))}`);
      console.log(`  cartera vencido: ${fmtCop(parseFloat(cr.overdue ?? "0"))}`);
      console.log(`  maxDpd         : ${cr.maxdpd ?? "0"}d`);
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────

  console.log(`\n${hr("═")}`);
  console.log(`  Audit complete — no writes performed.`);
  console.log(hr("═"));
  console.log();

  await prisma.$disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
