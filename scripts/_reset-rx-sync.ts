/**
 * scripts/_reset-rx-sync.ts
 *
 * Mata los runs zombie (status=RUNNING) del módulo receivables del conector
 * SAG de Castillitos y deja el conector en ACTIVE listo para reanudar.
 *
 * NO toca el cursor (page:11500) — la próxima sync lo retoma desde ahí.
 * NO modifica nada más (clientes, datos, otros módulos).
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/_reset-rx-sync.ts
 */

import { prisma } from "@/lib/prisma";

const CONNECTOR_ID = "cmnhu4hky0000n4y50jlhkfib";

async function main() {
  console.log("\n══════════════════════════════════════════════════");
  console.log("  RESET ZOMBIE RUNS — RECEIVABLES CASTILLITOS");
  console.log("══════════════════════════════════════════════════\n");

  // Cursor actual (must NOT be touched)
  const cursor = await prisma.connectorCursor.findUnique({
    where:  { connectorId_module: { connectorId: CONNECTOR_ID, module: "receivables" } },
    select: { cursor: true, updatedAt: true },
  });
  console.log(`Cursor actual (NO se toca): ${cursor?.cursor ?? "(NONE)"}`);
  console.log(`  updatedAt: ${cursor?.updatedAt?.toISOString() ?? "(NONE)"}\n`);

  // Buscar zombies
  const zombies = await prisma.connectorRun.findMany({
    where:   { connectorId: CONNECTOR_ID, status: "RUNNING" },
    select:  { id: true, module: true, startedAt: true },
    orderBy: { startedAt: "desc" },
  });

  if (zombies.length === 0) {
    console.log("✓ No hay runs zombie. Nada que hacer.");
  } else {
    console.log(`Runs zombie encontrados: ${zombies.length}`);
    for (const z of zombies) {
      const ageMin = Math.round((Date.now() - (z.startedAt?.getTime() ?? Date.now())) / 60_000);
      console.log(`  ${z.id}  module=${z.module}  age=${ageMin}min`);
    }
    console.log("");

    // Marcarlos como FAILED
    const ids = zombies.map(z => z.id);
    const updated = await prisma.connectorRun.updateMany({
      where: { id: { in: ids } },
      data: {
        status:     "FAILED",
        finishedAt: new Date(),
        error:      "Reset manual: proceso zombie terminado sin finalizar (no timeout configurado). Ver _reset-rx-sync.ts.",
      },
    });
    console.log(`✓ ${updated.count} runs marcados como FAILED.\n`);
  }

  // Asegurar que el conector esté en ACTIVE (no SYNCING)
  const connector = await prisma.connector.findUnique({
    where:  { id: CONNECTOR_ID },
    select: { status: true },
  });
  console.log(`Conector status actual: ${connector?.status}`);

  if (connector?.status === "SYNCING") {
    await prisma.connector.update({
      where: { id: CONNECTOR_ID },
      data:  { status: "ACTIVE" },
    });
    console.log("✓ Conector reseteado a ACTIVE.");
  } else {
    console.log("✓ Conector ya está en estado correcto.");
  }

  // Confirmación final
  const cursorFinal = await prisma.connectorCursor.findUnique({
    where:  { connectorId_module: { connectorId: CONNECTOR_ID, module: "receivables" } },
    select: { cursor: true },
  });
  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`LISTO. Cursor para próximo sync: ${cursorFinal?.cursor ?? "(NONE)"}`);
  console.log(`Próximos pasos:`);
  console.log(`  1. Cierra el tab del browser que está esperando`);
  console.log(`  2. Recarga la página del conector`);
  console.log(`  3. Haz click en "Sincronizar Cartera"`);
  console.log(`  El sync retomará desde ${cursorFinal?.cursor ?? "el principio"}`);
  console.log(`══════════════════════════════════════════════════\n`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
