/**
 * _sync-orders-audit.ts
 * Sync SAG PD orders (module="orders") then audit CustomerOrderRecord.
 */
process.env.DEBUG = "";
process.env.LOG_LEVEL = "warn";

import { prisma }     from "@/lib/prisma";
import "@/lib/connectors/adapters/index";
import { syncEngine } from "@/lib/connectors/core/sync-engine";

const CONNECTOR_ID = "cmnhu4hky0000n4y50jlhkfib";
const ORG_ID       = "cmmpwstuf000dp5y58kj1daaj";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

async function main() {
  const db = prisma as any;

  process.stdout.write("\n═══════════════════════════════════════════\n");
  process.stdout.write(" SAG ORDERS — SYNC + AUDIT\n");
  process.stdout.write("═══════════════════════════════════════════\n\n");
  process.stdout.write("Iniciando sync orders (fullSync)...\n");

  // NOTE: pullOrders() internally calls pullMovements() to fill _movCache + _orderCache.
  // fullSync = true to avoid cursor filtering.
  const runId = await syncEngine.syncModule(CONNECTOR_ID, "orders", {
    fullSync: true,
    maxPages: 300,
  });

  const run = await db.connectorRun.findUnique({
    where:  { id: runId },
    select: { status: true, rowsRead: true, rowsImported: true, rowsSkipped: true, rowsErrored: true, error: true },
  });

  process.stdout.write(`\nRun ${runId}: ${run.status}\n`);
  process.stdout.write(`  leídos:   ${run.rowsRead}\n`);
  process.stdout.write(`  imported: ${run.rowsImported}\n`);
  process.stdout.write(`  skipped:  ${run.rowsSkipped}\n`);
  process.stdout.write(`  errored:  ${run.rowsErrored}\n`);
  if (run.error) process.stdout.write(`  error:    ${run.error}\n`);

  if (run.status === "FAILED") {
    process.stdout.write("\nSync failed — skipping audit.\n");
    await prisma.$disconnect();
    return;
  }

  process.stdout.write("\n────────────────────────────────────────────\n");
  process.stdout.write(" AUDIT: CustomerOrderRecord\n");
  process.stdout.write("────────────────────────────────────────────\n");

  const [total, agg, latest, recent] = await Promise.all([
    // 1. count total
    db.customerOrderRecord.count({ where: { organizationId: ORG_ID } }),

    // 3. count + amount para el último día operativo (resolved after we get latest)
    db.customerOrderRecord.aggregate({
      where: { organizationId: ORG_ID },
      _count: { _all: true },
      _sum:   { amount: true },
      _max:   { orderDate: true },
      _min:   { orderDate: true },
    }),

    // 2. max orderDate
    db.customerOrderRecord.findFirst({
      where:   { organizationId: ORG_ID },
      orderBy: { orderDate: "desc" },
      select:  { orderDate: true },
    }),

    // 4. 5 pedidos recientes
    db.customerOrderRecord.findMany({
      where:   { organizationId: ORG_ID },
      orderBy: { orderDate: "desc" },
      take:    5,
      select: {
        orderNumber:  true,
        customerName: true,
        orderDate:    true,
        amount:       true,
        status:       true,
        sourceCode:   true,
      },
    }),
  ]);

  process.stdout.write(`\n1. Total CustomerOrderRecord: ${total}\n`);
  process.stdout.write(`2. Max orderDate: ${latest?.orderDate?.toISOString()?.slice(0, 10) ?? "—"}\n`);
  process.stdout.write(`   Min orderDate: ${agg._min?.orderDate?.toISOString()?.slice(0, 10) ?? "—"}\n`);

  // Count + amount for latest operational day
  if (latest?.orderDate) {
    const dayStart = new Date(latest.orderDate);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const dayAgg = await db.customerOrderRecord.aggregate({
      where: { organizationId: ORG_ID, orderDate: { gte: dayStart, lt: dayEnd } },
      _count: { _all: true },
      _sum:   { amount: true },
    });
    process.stdout.write(`\n3. Último día operativo (${dayStart.toISOString().slice(0, 10)}):\n`);
    process.stdout.write(`   count:  ${dayAgg._count._all}\n`);
    process.stdout.write(`   amount: ${fmt(Number(dayAgg._sum.amount ?? 0))}\n`);
  } else {
    process.stdout.write("\n3. Sin datos en el último día operativo.\n");
  }

  process.stdout.write("\n4. 5 pedidos recientes:\n");
  if (recent.length === 0) {
    process.stdout.write("   (ninguno)\n");
  } else {
    for (const r of recent) {
      process.stdout.write(
        `   [${r.orderDate.toISOString().slice(0, 10)}] ` +
        `#${r.orderNumber} · ${r.customerName.slice(0, 30).padEnd(30)} · ` +
        `${fmt(Number(r.amount)).padStart(14)} · ${r.status} · ${r.sourceCode}\n`
      );
    }
  }

  process.stdout.write("\n═══════════════════════════════════════════\n");
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
