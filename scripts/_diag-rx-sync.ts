/**
 * scripts/_diag-rx-sync.ts
 *
 * Diagnóstico del estado del sync de receivables del conector SAG de Castillitos.
 * Muestra: estado del conector, runs zombie (RUNNING), último run de receivables,
 * cursor actual. No modifica nada.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/_diag-rx-sync.ts
 */

import { prisma } from "@/lib/prisma";

const CONNECTOR_ID = "cmnhu4hky0000n4y50jlhkfib";

async function main() {
  console.log("\n══════════════════════════════════════════════════");
  console.log("  DIAGNÓSTICO SYNC RECEIVABLES — CASTILLITOS");
  console.log("══════════════════════════════════════════════════\n");

  // 1. Estado del conector
  const c = await prisma.connector.findUnique({
    where:  { id: CONNECTOR_ID },
    select: { status: true, updatedAt: true, source: true },
  });
  console.log("CONECTOR:");
  console.log(`  status:    ${c?.status}`);
  console.log(`  source:    ${c?.source}`);
  console.log(`  updatedAt: ${c?.updatedAt?.toISOString()}`);

  // 2. Runs zombie — RUNNING sin finishedAt
  const zombies = await prisma.connectorRun.findMany({
    where:   { connectorId: CONNECTOR_ID, status: "RUNNING" },
    select:  { id: true, module: true, startedAt: true, cursorBefore: true },
    orderBy: { startedAt: "desc" },
  });
  console.log(`\nRUNS ZOMBIE (status=RUNNING): ${zombies.length}`);
  for (const z of zombies) {
    const ageMin = Math.round((Date.now() - (z.startedAt?.getTime() ?? Date.now())) / 60_000);
    console.log(`  id=${z.id} module=${z.module} age=${ageMin}min cursorBefore=${z.cursorBefore ?? "null"}`);
  }

  // 3. Últimos 5 runs de receivables (cualquier estado)
  const runs = await prisma.connectorRun.findMany({
    where:   { connectorId: CONNECTOR_ID, module: "receivables" },
    select:  {
      id: true, status: true, rowsRead: true, rowsImported: true,
      startedAt: true, finishedAt: true,
      cursorBefore: true, cursorAfter: true, error: true,
    },
    orderBy: { startedAt: "desc" },
    take:    5,
  });
  console.log(`\nÚLTIMOS RUNS receivables (${runs.length}):`);
  for (const r of runs) {
    const dur = r.finishedAt
      ? Math.round((r.finishedAt.getTime() - (r.startedAt?.getTime() ?? r.finishedAt.getTime())) / 1000) + "s"
      : "STILL RUNNING";
    console.log(
      `  [${r.status}] id=${r.id} dur=${dur}` +
      ` read=${r.rowsRead} imported=${r.rowsImported}` +
      ` cursorBefore=${r.cursorBefore ?? "null"} cursorAfter=${r.cursorAfter ?? "null"}` +
      (r.error ? ` ERROR=${r.error}` : "")
    );
  }

  // 4. Cursor persisitido
  const cursor = await prisma.connectorCursor.findUnique({
    where:  { connectorId_module: { connectorId: CONNECTOR_ID, module: "receivables" } },
    select: { cursor: true, updatedAt: true },
  });
  console.log(`\nCURSOR PERSISTIDO:`);
  console.log(`  cursor:    ${cursor?.cursor ?? "(NONE)"}`);
  console.log(`  updatedAt: ${cursor?.updatedAt?.toISOString() ?? "(NONE)"}`);

  // 5. Todos los cursores del conector
  const allCursors = await prisma.connectorCursor.findMany({
    where:  { connectorId: CONNECTOR_ID },
    select: { module: true, cursor: true, updatedAt: true },
  });
  console.log(`\nTODOS LOS CURSORES (${allCursors.length}):`);
  for (const cur of allCursors) {
    console.log(`  module=${cur.module} cursor=${cur.cursor} updatedAt=${cur.updatedAt.toISOString()}`);
  }

  console.log("\n══════════════════════════════════════════════════\n");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
