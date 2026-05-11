/**
 * scripts/_validate-cartera.ts
 * Valida coherencia de datos de cartera importados de SAG.
 * Usage: npx tsx --env-file=.env scripts/_validate-cartera.ts
 */
import { prisma } from "@/lib/prisma";

const ORG_SLUG = process.env.ORG_SLUG ?? "castillitos";

async function main() {
  const org = await prisma.organization.findFirst({
    where:  { slug: ORG_SLUG },
    select: { id: true, name: true },
  });
  if (!org) { console.error(`ORG NOT FOUND: ${ORG_SLUG}`); process.exit(1); }
  console.log("\nORG:", org.id, org.name, "\n");

  // ── Totales generales ─────────────────────────────────────────────────────
  const agg = await prisma.customerReceivable.aggregate({
    where: { organizationId: org.id },
    _count: { id: true },
    _sum:  { balanceDue: true, originalAmount: true, paidAmount: true },
  });
  const fmt = (n: number | null | undefined) =>
    (n ?? 0).toLocaleString("es-CO", { maximumFractionDigits: 0 });
  console.log("═══ TOTALES ═══════════════════════════════════════");
  console.log("  Documentos totales:  ", agg._count.id);
  console.log("  Total originalAmount:", fmt(agg._sum.originalAmount));
  console.log("  Total paidAmount:    ", fmt(agg._sum.paidAmount));
  console.log("  Total balanceDue:    ", fmt(agg._sum.balanceDue));

  // ── Por status ────────────────────────────────────────────────────────────
  const byStatus = await prisma.customerReceivable.groupBy({
    by:    ["status"],
    where: { organizationId: org.id },
    _count: { id: true },
    _sum:  { balanceDue: true },
    orderBy: { _sum: { balanceDue: "desc" } },
  });
  console.log("\n═══ POR STATUS ════════════════════════════════════");
  for (const s of byStatus) {
    console.log(`  ${s.status.padEnd(12)} docs=${s._count.id}  balance=${fmt(s._sum.balanceDue)}`);
  }

  // ── Por aging bucket ──────────────────────────────────────────────────────
  const byBucket = await prisma.customerReceivable.groupBy({
    by:    ["agingBucket"],
    where: { organizationId: org.id },
    _count: { id: true },
    _sum:  { balanceDue: true },
  });
  console.log("\n═══ AGING BUCKETS ═════════════════════════════════");
  const bucketOrder = ["CURRENT", "1-30", "31-60", "61-90", "90+"];
  const sorted = [...byBucket].sort(
    (a, b) => bucketOrder.indexOf(a.agingBucket) - bucketOrder.indexOf(b.agingBucket)
  );
  for (const b of sorted) {
    console.log(`  ${b.agingBucket.padEnd(8)} docs=${b._count.id}  balance=${fmt(b._sum.balanceDue)}`);
  }

  // ── Top 10 deudores ───────────────────────────────────────────────────────
  const top10raw = await prisma.$queryRaw<
    { customerNit: string; customerName: string; total: number; docs: bigint }[]
  >`
    SELECT "customerNit", "customerName",
           SUM("balanceDue") AS total,
           COUNT(*) AS docs
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${org.id}
      AND "status" NOT IN ('PAID', 'WRITTEN_OFF')
    GROUP BY "customerNit", "customerName"
    ORDER BY total DESC
    LIMIT 10
  `;
  console.log("\n═══ TOP 10 DEUDORES (saldo vivo) ══════════════════");
  for (const d of top10raw) {
    console.log(`  NIT=${d.customerNit ?? "N/A"}  docs=${d.docs}  balance=${fmt(Number(d.total))}  ${d.customerName?.slice(0, 40)}`);
  }

  // ── Rango de fechas ───────────────────────────────────────────────────────
  const dates = await prisma.customerReceivable.aggregate({
    where: { organizationId: org.id },
    _min:  { invoiceDate: true, dueDate: true },
    _max:  { invoiceDate: true, dueDate: true },
  });
  console.log("\n═══ RANGO DE FECHAS ═══════════════════════════════");
  console.log("  invoiceDate min:", dates._min.invoiceDate?.toISOString().slice(0, 10));
  console.log("  invoiceDate max:", dates._max.invoiceDate?.toISOString().slice(0, 10));
  console.log("  dueDate     min:", dates._min.dueDate?.toISOString().slice(0, 10));
  console.log("  dueDate     max:", dates._max.dueDate?.toISOString().slice(0, 10));

  // ── Duplicados por erpId ──────────────────────────────────────────────────
  const dups = await prisma.$queryRaw<{ erpId: string; cnt: bigint }[]>`
    SELECT "erpId", COUNT(*) AS cnt
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${org.id}
    GROUP BY "erpId"
    HAVING COUNT(*) > 1
    LIMIT 10
  `;
  console.log("\n═══ DUPLICADOS (erpId) ════════════════════════════");
  console.log("  Duplicados encontrados:", dups.length);
  for (const d of dups.slice(0, 5)) {
    console.log(`  erpId=${d.erpId} count=${d.cnt}`);
  }

  // ── Clientes únicos con cartera abierta ───────────────────────────────────
  const openClients = await prisma.$queryRaw<{ cnt: bigint }[]>`
    SELECT COUNT(DISTINCT "customerNit") AS cnt
    FROM "CustomerReceivable"
    WHERE "organizationId" = ${org.id}
      AND "status" NOT IN ('PAID', 'WRITTEN_OFF')
  `;
  console.log("\n═══ CLIENTES ÚNICOS CON CARTERA ABIERTA ══════════");
  console.log("  Clientes:", Number(openClients[0]?.cnt ?? 0));

  // ── Vencimientos próximos (30 días) ───────────────────────────────────────
  const now   = new Date();
  const in30d = new Date(now.getTime() + 30 * 86_400_000);
  const upcoming = await prisma.customerReceivable.count({
    where: {
      organizationId: org.id,
      status:  { notIn: ["PAID", "WRITTEN_OFF"] },
      dueDate: { gte: now, lte: in30d },
    },
  });
  const upcomingSum = await prisma.customerReceivable.aggregate({
    where: {
      organizationId: org.id,
      status:  { notIn: ["PAID", "WRITTEN_OFF"] },
      dueDate: { gte: now, lte: in30d },
    },
    _sum: { balanceDue: true },
  });
  console.log(`  Vencen en <30d: ${upcoming} docs, balance=${fmt(upcomingSum._sum.balanceDue)}`);

  // ── Muestra coherencia de fechas (últimos 3 docs) ─────────────────────────
  console.log("\n═══ MUESTRA COHERENCIA FECHAS (top 3 balance) ════");
  const sample = await prisma.customerReceivable.findMany({
    where:   { organizationId: org.id },
    select:  { erpId: true, invoiceDate: true, dueDate: true, daysOverdue: true, balanceDue: true, status: true, agingBucket: true },
    orderBy: { balanceDue: "desc" },
    take: 3,
  });
  for (const r of sample) {
    console.log(`  erpId=${r.erpId}  inv=${r.invoiceDate?.toISOString().slice(0,10)}  due=${r.dueDate?.toISOString().slice(0,10)}  dpd=${r.daysOverdue}  bucket=${r.agingBucket}  bal=${fmt(r.balanceDue)}  status=${r.status}`);
  }

  console.log("\n");
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
