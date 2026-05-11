/**
 * scripts/_audit-cartera-2026.ts
 *
 * Auditoría de cartera 2026 (strict) vs histórico por depurar.
 * Usage: ORG_SLUG=castillitos npx tsx --env-file=.env scripts/_audit-cartera-2026.ts
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const ORG_SLUG = process.env.ORG_SLUG ?? "castillitos";

const Y2026_FROM = new Date("2026-01-01T00:00:00.000Z");
const Y2026_TO   = new Date("2027-01-01T00:00:00.000Z");

const fmt = (n: unknown) => {
  const v = n == null ? 0 : typeof (n as any).toNumber === "function" ? (n as any).toNumber() : Number(n);
  return v.toLocaleString("es-CO", { maximumFractionDigits: 0 });
};

async function main() {
  const org = await prisma.organization.findFirst({
    where:  { slug: ORG_SLUG },
    select: { id: true, name: true },
  });
  if (!org) { console.error(`ORG NOT FOUND: ${ORG_SLUG}`); process.exit(1); }
  console.log(`\nORG: ${org.id} — ${org.name}\n`);

  // ── 1. Totales generales (todo el historial) ──────────────────────────────
  const total = await prisma.customerReceivable.aggregate({
    where: {
      organizationId: org.id,
      status: { in: ["OPEN", "PARTIAL", "OVERDUE"] },
    },
    _count: { id: true },
    _sum:   { balanceDue: true },
  });
  console.log("══ TOTALES GLOBALES (OPEN/PARTIAL/OVERDUE) ══════════════");
  console.log(`  Documentos: ${total._count.id}`);
  console.log(`  Saldo total: ${fmt(total._sum.balanceDue)}`);

  // ── 2. Cartera 2026 strict ────────────────────────────────────────────────
  const c2026 = await prisma.customerReceivable.aggregate({
    where: {
      organizationId: org.id,
      status:         { in: ["OPEN", "PARTIAL", "OVERDUE"] },
      invoiceDate:    { gte: Y2026_FROM, lt: Y2026_TO },
    },
    _count: { id: true },
    _sum:   { balanceDue: true },
  });
  const c2026overdue = await prisma.customerReceivable.aggregate({
    where: {
      organizationId: org.id,
      status:         { in: ["OPEN", "PARTIAL", "OVERDUE"] },
      invoiceDate:    { gte: Y2026_FROM, lt: Y2026_TO },
      daysOverdue:    { gt: 0 },
    },
    _sum: { balanceDue: true },
  });
  const c2026total   = (c2026._sum.balanceDue as any)?.toNumber?.() ?? Number(c2026._sum.balanceDue ?? 0);
  const c2026vencido = (c2026overdue._sum.balanceDue as any)?.toNumber?.() ?? Number(c2026overdue._sum.balanceDue ?? 0);
  console.log("\n══ CARTERA 2026 STRICT (invoiceDate 2026-01-01 → 2026-12-31) ══");
  console.log(`  Documentos:       ${c2026._count.id}`);
  console.log(`  Saldo abierto:    ${fmt(c2026total)}`);
  console.log(`  Vencido (dpd>0):  ${fmt(c2026vencido)}`);
  const ratio2026 = c2026total > 0
    ? (c2026vencido / c2026total * 100).toFixed(1)
    : "0.0";
  console.log(`  Ratio mora:       ${ratio2026}%`);

  // ── 3. Aging 2026 strict ──────────────────────────────────────────────────
  const aging2026 = await prisma.customerReceivable.groupBy({
    by:    ["agingBucket"],
    where: {
      organizationId: org.id,
      status:         { in: ["OPEN", "PARTIAL", "OVERDUE"] },
      invoiceDate:    { gte: Y2026_FROM, lt: Y2026_TO },
    },
    _count: { id: true },
    _sum:   { balanceDue: true },
    orderBy: { agingBucket: "asc" },
  });
  console.log("\n══ AGING 2026 ════════════════════════════════════════════");
  const BUCKET_ORDER = ["CURRENT", "1-30", "31-60", "61-90", "90+"];
  const sortedAging = [...aging2026].sort(
    (a, b) => BUCKET_ORDER.indexOf(a.agingBucket) - BUCKET_ORDER.indexOf(b.agingBucket)
  );
  for (const b of sortedAging) {
    console.log(`  ${b.agingBucket.padEnd(8)}  docs=${String(b._count.id).padStart(6)}  saldo=${fmt(b._sum.balanceDue)}`);
  }

  // ── 4. Top 5 deudores 2026 ────────────────────────────────────────────────
  type DebtorRow = { customerNit: string | null; customerName: string; total: number; overdue: number; maxDpd: number; docs: string };
  const top5 = await prisma.$queryRaw<DebtorRow[]>(Prisma.sql`
    SELECT
      "customerNit",
      "customerName",
      SUM("balanceDue")::float8        AS total,
      SUM(CASE WHEN "daysOverdue" > 0 THEN "balanceDue" ELSE 0 END)::float8 AS overdue,
      MAX("daysOverdue")               AS "maxDpd",
      CAST(COUNT(*) AS TEXT)           AS docs
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${org.id}
      AND "status" IN ('OPEN','PARTIAL','OVERDUE')
      AND "invoiceDate" >= ${Y2026_FROM}
      AND "invoiceDate" <  ${Y2026_TO}
    GROUP BY "customerNit", "customerName"
    ORDER BY overdue DESC, total DESC
    LIMIT 5
  `);
  console.log("\n══ TOP 5 DEUDORES 2026 ═══════════════════════════════════");
  for (const [i, d] of top5.entries()) {
    const name = d.customerName?.slice(0, 36) ?? "N/A";
    const cfNote = name.toLowerCase().includes("consumidor") ? " [CF - sin identificar]" : "";
    console.log(`  ${i + 1}. ${name}${cfNote}`);
    console.log(`     NIT=${d.customerNit ?? "N/A"}  vencido=${fmt(d.overdue)}  total=${fmt(d.total)}  dpd=${d.maxDpd}d`);
  }

  // ── 5. Histórico por año (invoiceDate < 2026-01-01) ───────────────────────
  type YearRow = { yr: number; total: string; overdue: string; cnt: string };
  const historical = await prisma.$queryRaw<YearRow[]>(Prisma.sql`
    SELECT
      EXTRACT(YEAR FROM "invoiceDate")::int AS yr,
      SUM("balanceDue")::float8::text       AS total,
      SUM(CASE WHEN "daysOverdue" > 0 THEN "balanceDue" ELSE 0 END)::float8::text AS overdue,
      CAST(COUNT(*) AS TEXT)                AS cnt
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${org.id}
      AND "status" IN ('OPEN','PARTIAL','OVERDUE')
      AND "invoiceDate" < ${Y2026_FROM}
    GROUP BY yr
    ORDER BY yr DESC
  `);
  console.log("\n══ HISTÓRICO POR DEPURAR (invoiceDate < 2026) ════════════");
  if (historical.length === 0) {
    console.log("  Sin cartera histórica con saldo abierto.");
  }
  let totalHistorico = 0;
  let totalHistVencido = 0;
  for (const h of historical) {
    const bal = parseFloat(h.total ?? "0");
    const ov  = parseFloat(h.overdue ?? "0");
    totalHistorico += bal;
    totalHistVencido += ov;
    console.log(`  ${h.yr}  docs=${String(Number(h.cnt)).padStart(6)}  saldo=${fmt(bal).padStart(18)}  vencido=${fmt(ov)}`);
  }
  if (historical.length > 0) {
    console.log(`  ${"TOTAL HIST.".padEnd(6)}  docs=${"".padStart(6)}  saldo=${fmt(totalHistorico).padStart(18)}  vencido=${fmt(totalHistVencido)}`);
  }

  // ── 6. Consumidor Final en 2026 ───────────────────────────────────────────
  const cfCount = await prisma.customerReceivable.aggregate({
    where: {
      organizationId: org.id,
      status:         { in: ["OPEN", "PARTIAL", "OVERDUE"] },
      invoiceDate:    { gte: Y2026_FROM, lt: Y2026_TO },
      customerName:   { contains: "CONSUMIDOR", mode: "insensitive" },
    },
    _count: { id: true },
    _sum:   { balanceDue: true },
  });
  console.log("\n══ CONSUMIDOR FINAL EN 2026 ══════════════════════════════");
  console.log(`  Documentos: ${cfCount._count.id}`);
  console.log(`  Saldo:      ${fmt(cfCount._sum.balanceDue)}`);
  const cfNote = cfCount._count.id === 0
    ? "  -> OK: sin documentos CF en 2026"
    : "  -> ATENCION: saldo CF requiere depuracion de NIT";
  console.log(cfNote);

  console.log("\n");
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
