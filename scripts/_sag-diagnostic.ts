import { prisma as p } from "../lib/prisma";

async function run() {
  // Q1: Find castillitos org
  const orgs = await p.$queryRawUnsafe<any[]>(`SELECT id, slug FROM "Organization" LIMIT 10`);
  console.log("=== ORGANIZATIONS ===");
  for (const o of orgs) console.log(`  ${o.slug} -> ${o.id}`);

  const castOrg = orgs.find((o: any) => o.slug === "castillitos");
  if (!castOrg) { console.log("NO CASTILLITOS ORG FOUND"); return; }
  const orgId = castOrg.id;

  // Q2: ProductEntity counts
  const peTotal = await p.productEntity.count({ where: { organizationId: orgId } });
  const peSag = await p.productEntity.count({ where: { organizationId: orgId, externalSource: "sag" } });
  console.log("\n=== PRODUCT ENTITY ===");
  console.log(`Total: ${peTotal} | SAG: ${peSag}`);

  // Q3: ProductEntity by productLine
  const peByLine = await p.$queryRawUnsafe<any[]>(`
    SELECT "productLine", COUNT(*)::int as cnt
    FROM "ProductEntity"
    WHERE "organizationId" = $1
    GROUP BY "productLine"
    ORDER BY cnt DESC
  `, orgId);
  console.log("By productLine:");
  for (const r of peByLine) console.log(`  line=${r.productLine} -> ${r.cnt} products`);

  // Q4: ProductVariant counts and statuses
  const pvTotal = await p.productVariant.count({ where: { product: { organizationId: orgId } } });
  const pvByStatus = await p.$queryRawUnsafe<any[]>(`
    SELECT pv.status, COUNT(*)::int as cnt
    FROM "ProductVariant" pv
    JOIN "ProductEntity" pe ON pv."productId" = pe.id
    WHERE pe."organizationId" = $1
    GROUP BY pv.status
  `, orgId);
  console.log("\n=== PRODUCT VARIANT ===");
  console.log(`Total: ${pvTotal}`);
  for (const r of pvByStatus) console.log(`  status=${r.status} -> ${r.cnt}`);

  // Q5: ProductInventoryLevel total
  const pilTotal = await p.$queryRawUnsafe<any[]>(`
    SELECT COUNT(*)::int as cnt FROM "ProductInventoryLevel" WHERE "organizationId" = $1
  `, orgId);
  console.log("\n=== PRODUCT INVENTORY LEVEL ===");
  console.log(`Total PIL rows: ${pilTotal[0]?.cnt}`);

  // Q6: PIL by externalRef -- THE CRITICAL BP-12 CHECK
  const pilByRef = await p.$queryRawUnsafe<any[]>(`
    SELECT "externalRef", COUNT(*)::int as cnt, SUM(quantity)::float as total_qty
    FROM "ProductInventoryLevel"
    WHERE "organizationId" = $1
    GROUP BY "externalRef"
    ORDER BY cnt DESC
  `, orgId);
  console.log("\nBy externalRef (warehouse code) -- BP-12 CHECK:");
  for (const r of pilByRef) console.log(`  ref=${r.externalRef} -> ${r.cnt} rows, qty=${r.total_qty}`);

  // Q7: PIL by warehouseId -- check numeric PKs vs codes
  const pilByWh = await p.$queryRawUnsafe<any[]>(`
    SELECT "warehouseId", COUNT(*)::int as cnt, SUM(quantity)::float as total_qty
    FROM "ProductInventoryLevel"
    WHERE "organizationId" = $1
    GROUP BY "warehouseId"
    ORDER BY cnt DESC
  `, orgId);
  console.log("\nBy warehouseId (SAG numeric PK) -- BP-11 CHECK:");
  for (const r of pilByWh) console.log(`  wh=${r.warehouseId} -> ${r.cnt} rows, qty=${r.total_qty}`);

  // Q8: CommercialCoverageSnapshot
  const snapCount = await p.$queryRawUnsafe<any[]>(`
    SELECT COUNT(*)::int as cnt, COUNT(DISTINCT "snapshotAt")::int as batches,
           MAX("snapshotAt") as latest, MIN("snapshotAt") as oldest
    FROM "CommercialCoverageSnapshot"
    WHERE "organizationId" = $1
  `, orgId);
  console.log("\n=== COMMERCIAL COVERAGE SNAPSHOT ===");
  const s = snapCount[0];
  console.log(`Total rows: ${s?.cnt} | Batches: ${s?.batches} | Latest: ${s?.latest} | Oldest: ${s?.oldest}`);

  // Q9: Latest snapshot line distribution
  const latestSnap = await p.$queryRawUnsafe<any[]>(`
    SELECT "line", COUNT(*)::int as cnt, SUM(disponible)::float as total_disp,
           SUM("physicalQty")::float as total_phys
    FROM "CommercialCoverageSnapshot"
    WHERE "organizationId" = $1
      AND "snapshotAt" = (SELECT MAX("snapshotAt") FROM "CommercialCoverageSnapshot" WHERE "organizationId" = $1)
    GROUP BY "line"
  `, orgId);
  console.log("Latest snapshot by line:");
  for (const r of latestSnap) console.log(`  line=${r.line} -> ${r.cnt} refs, disponible=${r.total_disp}, physical=${r.total_phys}`);

  // Q10: Last connector runs
  const lastRuns = await p.$queryRawUnsafe<any[]>(`
    SELECT module, status, "rowsRead"::int, "rowsImported"::int, "rowsSkipped"::int,
           "rowsErrored"::int, "startedAt", "finishedAt",
           LEFT(error, 120) as error_preview
    FROM "ConnectorRun"
    WHERE "organizationId" = $1
    ORDER BY "startedAt" DESC
    LIMIT 15
  `, orgId);
  console.log("\n=== LAST 15 CONNECTOR RUNS ===");
  for (const r of lastRuns) {
    const dur = r.finishedAt ? Math.round((new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 1000) : "?";
    console.log(`  ${String(r.module).padEnd(14)} | ${String(r.status).padEnd(8)} | read=${r.rowsRead} imp=${r.rowsImported} skip=${r.rowsSkipped} err=${r.rowsErrored} | ${dur}s | ${r.error_preview || "OK"}`);
  }

  // Q11: PIL freshness
  const pilFresh = await p.$queryRawUnsafe<any[]>(`
    SELECT MAX("syncedAt") as latest_sync, MIN("syncedAt") as oldest_sync,
           COUNT(*)::int as total,
           COUNT(CASE WHEN "syncedAt" > NOW() - INTERVAL '7 days' THEN 1 END)::int as synced_7d,
           COUNT(CASE WHEN "syncedAt" > NOW() - INTERVAL '30 days' THEN 1 END)::int as synced_30d
    FROM "ProductInventoryLevel"
    WHERE "organizationId" = $1
  `, orgId);
  console.log("\n=== PIL FRESHNESS ===");
  const f = pilFresh[0];
  console.log(`Latest sync: ${f?.latest_sync}`);
  console.log(`Oldest sync: ${f?.oldest_sync}`);
  console.log(`Total: ${f?.total} | Last 7d: ${f?.synced_7d} | Last 30d: ${f?.synced_30d}`);

  // Q12: Sample PIL rows
  const refSample = await p.$queryRawUnsafe<any[]>(`
    SELECT "warehouseId", "externalRef", quantity, "syncedAt"
    FROM "ProductInventoryLevel"
    WHERE "organizationId" = $1
    LIMIT 5
  `, orgId);
  console.log("\n=== SAMPLE PIL ROWS (warehouseId vs externalRef) ===");
  for (const r of refSample) console.log(`  warehouseId=${r.warehouseId} | externalRef=${r.externalRef} | qty=${r.quantity} | synced=${r.syncedAt}`);

  // Q13: Warehouse filter impact
  const matchCount = await p.$queryRawUnsafe<any[]>(`
    SELECT
      COUNT(*)::int as total_pil,
      COUNT(CASE WHEN "externalRef" IN ('01','04') THEN 1 END)::int as match_01_04,
      COUNT(CASE WHEN "externalRef" NOT IN ('01','04') THEN 1 END)::int as other_warehouses,
      SUM(CASE WHEN "externalRef" IN ('01','04') THEN quantity ELSE 0 END)::float as qty_01_04,
      SUM(CASE WHEN "externalRef" NOT IN ('01','04') THEN quantity ELSE 0 END)::float as qty_other
    FROM "ProductInventoryLevel"
    WHERE "organizationId" = $1
  `, orgId);
  console.log("\n=== BP-4/BP-12 WAREHOUSE FILTER IMPACT ===");
  const m = matchCount[0];
  console.log(`Total PIL: ${m?.total_pil}`);
  console.log(`Match "01"+"04": ${m?.match_01_04} rows (qty: ${m?.qty_01_04})`);
  console.log(`Other warehouses: ${m?.other_warehouses} rows (qty: ${m?.qty_other})`);
  if (m?.total_pil > 0) {
    console.log(`Data hidden by warehouse filter: ${((m?.other_warehouses / m?.total_pil) * 100).toFixed(1)}%`);
  }

  // Q14: Connector cursor state
  const cursors = await p.$queryRawUnsafe<any[]>(`
    SELECT cc.module, cc.cursor
    FROM "ConnectorCursor" cc
    JOIN "Connector" c ON cc."connectorId" = c.id
    WHERE c."organizationId" = $1
  `, orgId);
  console.log("\n=== CONNECTOR CURSORS (sync position) ===");
  for (const r of cursors) console.log(`  ${r.module} -> ${r.cursor}`);

  console.log("\n=== DIAGNOSTIC COMPLETE ===");
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
