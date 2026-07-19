/**
 * Quick idempotency check — syncs only last 7 days of OPs
 * and verifies no new records are created (only updates).
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { loadSagTestEnv } from "@/lib/sag/env";
import { syncProductionOrders } from "@/lib/connectors/adapters/sag-pya-soap/production/sag-production-sync";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";

async function main() {
  const sagEnv = loadSagTestEnv();
  const sagConfig: PyaApiConfig = {
    endpointUrl: sagEnv.endpointUrl,
    token: sagEnv.token,
    database: sagEnv.database,
  };
  const db = prisma as any;
  const org = await db.organization.findUnique({
    where: { slug: "castillitos" },
    select: { id: true },
  });

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - 7);

  console.log("IDEMPOTENCY TEST — last 7 days");
  const result = await syncProductionOrders({
    organizationId: org.id,
    sagConfig,
    sagDatabase: sagEnv.database,
    sinceDate,
    dryRun: false,
  });

  console.log(`  Orders read:    ${result.metrics.ordersRead}`);
  console.log(`  Orders created: ${result.metrics.ordersCreated} (expect 0)`);
  console.log(`  Orders updated: ${result.metrics.ordersUpdated}`);
  console.log(`  Lines created:  ${result.metrics.linesCreated} (expect 0)`);
  console.log(`  Lines updated:  ${result.metrics.linesUpdated}`);
  console.log(`  Errors:         ${result.metrics.errors.length}`);
  console.log(`  Duration:       ${result.metrics.durationMs}ms`);

  const idempotent = result.metrics.ordersCreated === 0 && result.metrics.linesCreated === 0;
  console.log(`\n  IDEMPOTENT: ${idempotent ? "YES" : "NO"}`);

  await prisma.$disconnect();
}
main();
