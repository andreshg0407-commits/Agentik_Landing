/**
 * _run-movements-sync.ts — first sync of the "movements" module for Castillitos.
 */
process.env.DEBUG = "";
process.env.LOG_LEVEL = "warn";

import { prisma }     from "@/lib/prisma";
import "@/lib/connectors/adapters/index";
import { syncEngine }  from "@/lib/connectors/core/sync-engine";

const CONNECTOR_ID = "cmnhu4hky0000n4y50jlhkfib";
const ORG_ID       = "cmmpwstuf000dp5y58kj1daaj";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

async function main() {
  const db = prisma as any;

  process.stdout.write("\n═══════════════════════════════════════════\n");
  process.stdout.write(" SAG MOVEMENTS — PRIMER SYNC\n");
  process.stdout.write("═══════════════════════════════════════════\n\n");
  process.stdout.write("Iniciando sync (puede tardar 3-5 min)...\n");

  const runId = await syncEngine.syncModule(CONNECTOR_ID, "movements", {
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

  if (run.status === "FAILED") return;

  const [total, topCodes, agg, recent] = await Promise.all([
    db.saleRecord.count({ where: { organizationId: ORG_ID } }),
    db.saleRecord.groupBy({
      by: ["comprobanteCode"],
      where: { organizationId: ORG_ID },
      _count: true,
      _sum: { amount: true },
      orderBy: { _count: { comprobanteCode: "desc" } },
      take: 15,
    }),
    db.saleRecord.aggregate({ where: { organizationId: ORG_ID }, _sum: { amount: true } }),
    db.saleRecord.findMany({
      where:   { organizationId: ORG_ID },
      orderBy: { saleDate: "desc" },
      take: 10,
      select: { saleDate: true, comprobanteCode: true, channel: true, sagSourceType: true, customerName: true, amount: true },
    }),
  ]);

  process.stdout.write(`\n─── RESULTADO ──────────────────────────────\n`);
  process.stdout.write(`Total SaleRecord: ${total.toLocaleString()} rows\n`);
  process.stdout.write(`Total amount:     ${fmt(Number(agg._sum.amount ?? 0))}\n`);

  process.stdout.write(`\nTop comprobanteCode:\n`);
  for (const r of topCodes) {
    const code = (r.comprobanteCode ?? "(null)").padEnd(6);
    const cnt  = String(r._count).padStart(7);
    const amt  = fmt(Number(r._sum?.amount ?? 0)).padStart(22);
    process.stdout.write(`  ${code} ${cnt} docs ${amt}\n`);
  }

  process.stdout.write(`\nÚltimas 10 filas (más recientes):\n`);
  for (const r of recent) {
    const d  = r.saleDate instanceof Date ? r.saleDate.toISOString().slice(0, 10) : String(r.saleDate);
    const c  = (r.comprobanteCode ?? "—").padEnd(4);
    const ch = (r.channel ?? "—").padEnd(8);
    const st = (r.sagSourceType ?? "—").padEnd(8);
    const nm = (r.customerName ?? "").slice(0, 22).padEnd(22);
    const am = fmt(Number(r.amount ?? 0)).padStart(16);
    process.stdout.write(`  ${d}  ${c}  ${ch}  ${st}  ${nm}  ${am}\n`);
  }
}

main()
  .catch(e => { process.stderr.write(`\nFATAL: ${e.message}\n`); process.exit(1); })
  .finally(() => prisma.$disconnect());
