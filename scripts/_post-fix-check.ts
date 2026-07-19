import { prisma as p } from "../lib/prisma";

async function run() {
  const orgId = "cmmpwstuf000dp5y58kj1daaj";

  const snap = await p.$queryRawUnsafe<any[]>(`
    SELECT "line", COUNT(*)::int as cnt, SUM(disponible)::float as total_disp,
           SUM("physicalQty")::float as total_phys
    FROM "CommercialCoverageSnapshot"
    WHERE "organizationId" = $1
      AND "snapshotAt" = (SELECT MAX("snapshotAt") FROM "CommercialCoverageSnapshot" WHERE "organizationId" = $1)
    GROUP BY "line"
    ORDER BY cnt DESC
  `, orgId);

  console.log("=== POST-FIX SNAPSHOT (latest) ===");
  let totalRefs = 0;
  let totalDisp = 0;
  for (const r of snap) {
    console.log(`  line=${r.line} -> ${r.cnt} refs, disponible=${r.total_disp}, physical=${r.total_phys}`);
    totalRefs += r.cnt;
    totalDisp += r.total_disp;
  }
  console.log(`  TOTAL: ${totalRefs} refs, ${totalDisp} disponible`);

  console.log("\n=== BEFORE vs AFTER ===");
  console.log("BEFORE: 3,071 refs (LT=1695, CS=1376), disponible=144,668");
  console.log(`AFTER:  ${totalRefs} refs, disponible=${totalDisp}`);
  console.log(`GAIN:   +${totalRefs - 3071} refs (${((totalRefs - 3071) / 3071 * 100).toFixed(1)}% more)`);

  const fresh = await p.$queryRawUnsafe<any[]>(`
    SELECT MAX("syncedAt") as latest FROM "ProductInventoryLevel" WHERE "organizationId" = $1
  `, orgId);
  console.log(`\nPIL freshness: ${fresh[0]?.latest} (was July 7 = 10 days stale)`);

  process.exit(0);
}
run();
