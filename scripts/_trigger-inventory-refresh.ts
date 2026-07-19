// Trigger inventory refresh manually using the pipeline directly
import { refreshInventoryPipeline } from "../lib/integrations/sag/inventory-refresh-pipeline";
import { prisma } from "../lib/prisma";

async function run() {
  // Find castillitos org
  const orgs = await prisma.$queryRawUnsafe<any[]>(`SELECT id, slug FROM "Organization" WHERE slug = 'castillitos'`);
  if (orgs.length === 0) { console.log("NO CASTILLITOS ORG"); return; }
  const orgId = orgs[0].id;
  console.log(`[trigger] Starting inventory refresh for castillitos (${orgId})...`);
  console.log(`[trigger] Time: ${new Date().toISOString()}`);

  const t0 = Date.now();
  try {
    const result = await refreshInventoryPipeline(orgId);
    console.log(`\n[trigger] RESULT:`);
    console.log(JSON.stringify(result, null, 2));
    console.log(`\n[trigger] Total: ${Date.now() - t0}ms`);
  } catch (err: any) {
    console.error(`[trigger] FATAL ERROR: ${err.message}`);
    console.error(err.stack);
  }

  process.exit(0);
}

run();
