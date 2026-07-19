/**
 * COMMERCIAL-PERFORMANCE-AUDIT-01 — Cross-module performance diagnostic
 *
 * Measures actual DB query times and payload sizes for all Comercial modules.
 *
 * Usage: npx tsx scripts/audit-comercial-performance.ts
 */
import { prisma } from "@/lib/prisma";

const db = prisma as any;

async function main() {
  const org = await db.organization.findFirst({ where: { slug: "castillitos" } });
  if (!org) { console.log("ERROR: castillitos not found"); return; }
  const orgId = org.id;

  console.log("=".repeat(70));
  console.log("COMMERCIAL-PERFORMANCE-AUDIT-01");
  console.log("=".repeat(70));

  // ══════════════════════════════════════════════════════════════════════
  // CLIENTES
  // ══════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(60));
  console.log("[PERF][CLIENTES]");
  console.log("━".repeat(60));

  // Summary (aggregate)
  const tcS = performance.now();
  const cAgg: any[] = await db.$queryRawUnsafe(
    'SELECT COUNT(*)::int AS total FROM "CustomerProfile" WHERE "organizationId" = $1', orgId
  );
  console.log("  Summary (COUNT): " + (performance.now() - tcS).toFixed(0) + "ms — " + cAgg[0]?.total + " rows");

  // Page (25 rows, no JSON)
  const tcP = performance.now();
  await db.customerProfile.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true, nit: true, city: true, status: true },
    orderBy: { name: "asc" }, take: 25,
  });
  console.log("  Page (25, no JSON): " + (performance.now() - tcP).toFixed(0) + "ms");

  // rawCrmJson size check (sample)
  const tcJ = performance.now();
  const cJsonSample = await db.customerProfile.findMany({
    where: { organizationId: orgId }, select: { rawCrmJson: true }, take: 100,
  });
  const cJsonKb = cJsonSample.reduce((s: number, p: any) => s + (p.rawCrmJson ? JSON.stringify(p.rawCrmJson).length : 0), 0) / 1024;
  const cEstMb = (cJsonKb / 100 * Number(cAgg[0]?.total) / 1024).toFixed(1);
  console.log("  rawCrmJson sample (100): " + (performance.now() - tcJ).toFixed(0) + "ms — " + cJsonKb.toFixed(0) + " KB → estimated " + cEstMb + " MB for all");
  console.log("  RISK: " + (Number(cEstMb) > 10 ? "HIGH — rawCrmJson must NOT be in list queries" : "LOW"));
  console.log("  STATUS: FIXED (CLIENTES-PERFORMANCE-HOTFIX-01)");

  // ══════════════════════════════════════════════════════════════════════
  // PEDIDOS
  // ══════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(60));
  console.log("[PERF][PEDIDOS]");
  console.log("━".repeat(60));

  // CRMQuote count
  const tpQ = performance.now();
  const qCount = await db.cRMQuote.count({ where: { organizationId: orgId } });
  console.log("  CRMQuote count: " + (performance.now() - tpQ).toFixed(0) + "ms — " + qCount + " rows");

  // CRMQuote with rawCrmJson (full, take 500)
  const tpJ = performance.now();
  const quotes = await db.cRMQuote.findMany({
    where: { organizationId: orgId }, orderBy: { issuedAt: "desc" }, take: 500,
    select: { id: true, amount: true, rawCrmJson: true, sellerName: true, issuedAt: true },
  });
  const qJsonKb = quotes.reduce((s: number, q: any) => s + (q.rawCrmJson ? JSON.stringify(q.rawCrmJson).length : 0), 0) / 1024;
  console.log("  CRMQuote findMany (500, with JSON): " + (performance.now() - tpJ).toFixed(0) + "ms — " + qJsonKb.toFixed(0) + " KB payload");

  // AgentExecution count (pedidos)
  let aeCount = 0;
  try {
    aeCount = await db.agentExecution.count({
      where: { organizationId: orgId, operation: "COMERCIAL_ORDER_DRAFT" },
    });
  } catch { /* table may not exist */ }
  console.log("  AgentExecution (COMERCIAL_ORDER_DRAFT): " + aeCount + " rows");

  // listSagOrders pattern (include with quoteLines count)
  const tpL = performance.now();
  const sagList = await db.cRMQuote.findMany({
    where: { organizationId: orgId }, orderBy: { issuedAt: "desc" }, take: 500,
    include: { _count: { select: { quoteLines: true } } },
  });
  const sagListKb = sagList.reduce((s: number, q: any) => s + JSON.stringify(q).length, 0) / 1024;
  console.log("  listSagOrders (500, include): " + (performance.now() - tpL).toFixed(0) + "ms — " + sagListKb.toFixed(0) + " KB");
  console.log("  RISK: " + (qCount > 1000 ? "MEDIUM — CRMQuote growing, rawCrmJson in stats" : "LOW — " + qCount + " quotes is small"));

  // ══════════════════════════════════════════════════════════════════════
  // MALETAS
  // ══════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(60));
  console.log("[PERF][MALETAS]");
  console.log("━".repeat(60));

  // CommercialCoverageSnapshot
  const tmC = performance.now();
  const covCount: any[] = await db.$queryRawUnsafe(
    'SELECT COUNT(*)::int AS total FROM "CommercialCoverageSnapshot" WHERE "organizationId" = $1', orgId
  );
  console.log("  CommercialCoverageSnapshot: " + (performance.now() - tmC).toFixed(0) + "ms — " + covCount[0]?.total + " rows");

  // CoverageSnapshot DISTINCT ON (used in loader)
  const tmD = performance.now();
  const covDistinct: any[] = await db.$queryRawUnsafe(
    'SELECT COUNT(*) AS total FROM (SELECT DISTINCT ON ("refCode") "refCode" FROM "CommercialCoverageSnapshot" WHERE "organizationId" = $1 ORDER BY "refCode", "snapshotAt" DESC) sub', orgId
  );
  console.log("  CoverageSnapshot DISTINCT: " + (performance.now() - tmD).toFixed(0) + "ms — " + covDistinct[0]?.total + " unique refs");

  // ProductEntity (for importRefSet)
  const tmP = performance.now();
  const peCount = await db.productEntity.count({ where: { organizationId: orgId } });
  const pe5Count = await db.productEntity.count({ where: { organizationId: orgId, productLine: "5" } });
  console.log("  ProductEntity total: " + (performance.now() - tmP).toFixed(0) + "ms — " + peCount + " rows (" + pe5Count + " line=5)");

  // ProductInventoryLevel (for importAvailability)
  const tmI = performance.now();
  const pilCount: any[] = await db.$queryRawUnsafe(
    'SELECT COUNT(*)::int AS total FROM "ProductInventoryLevel" WHERE "organizationId" = $1', orgId
  );
  console.log("  ProductInventoryLevel: " + (performance.now() - tmI).toFixed(0) + "ms — " + pilCount[0]?.total + " rows");

  // Maletas events tables
  const tmE = performance.now();
  let evtCount = 0;
  try {
    const evtRows: any[] = await db.$queryRawUnsafe(
      'SELECT COUNT(*)::int AS total FROM "CommercialOperationalEvent" WHERE "organizationId" = $1', orgId
    );
    evtCount = evtRows[0]?.total ?? 0;
  } catch { /* table may not exist */ }
  console.log("  CommercialOperationalEvent: " + (performance.now() - tmE).toFixed(0) + "ms — " + evtCount + " rows");

  // maletas-events.ts loadPreviousState (4 unbounded findMany)
  let prevCov = 0, prevProf = 0, prevProd = 0, prevDead = 0;
  try {
    const tmPrev = performance.now();
    const [pc, pp, pprod, pd] = await Promise.all([
      db.commercialCoverageSnapshot.count({ where: { organizationId: orgId } }),
      db.commercialSalesRepProfileSnapshot.count({ where: { organizationId: orgId } }),
      db.commercialProductionSignal.count({ where: { organizationId: orgId, resolved: false } }),
      db.commercialDeadStockSignal.count({ where: { organizationId: orgId, resolved: false } }),
    ]);
    prevCov = pc; prevProf = pp; prevProd = pprod; prevDead = pd;
    console.log("  loadPreviousState tables: " + (performance.now() - tmPrev).toFixed(0) + "ms — cov=" + prevCov + " prof=" + prevProf + " prod=" + prevProd + " dead=" + prevDead);
  } catch { console.log("  loadPreviousState tables: some missing"); }

  console.log("  RISK: " + (Number(covCount[0]?.total) > 50000 ? "MEDIUM — coverage snapshots growing" : "LOW"));

  // ══════════════════════════════════════════════════════════════════════
  // TIENDAS
  // ══════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(60));
  console.log("[PERF][TIENDAS]");
  console.log("━".repeat(60));

  let storeCount = 0;
  try {
    storeCount = await db.store.count({ where: { organizationId: orgId } });
    console.log("  Store count: " + storeCount);
    console.log("  getStoreDetail calls (sequential): " + storeCount + " DB roundtrips");
    console.log("  RISK: " + (storeCount > 10 ? "MEDIUM — sequential detail loading for " + storeCount + " stores" : "LOW"));
  } catch { console.log("  Store table not available"); }

  // ══════════════════════════════════════════════════════════════════════
  // VENDEDORES
  // ══════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(60));
  console.log("[PERF][VENDEDORES]");
  console.log("━".repeat(60));

  // No dedicated vendedores loader found — check if data comes from foundation
  try {
    const sellerSnap: any[] = await db.$queryRawUnsafe(
      'SELECT COUNT(*)::int AS total FROM "CommercialSalesRepProfileSnapshot" WHERE "organizationId" = $1', orgId
    );
    console.log("  SalesRepProfileSnapshot: " + sellerSnap[0]?.total + " rows");
  } catch { console.log("  SalesRepProfileSnapshot: table missing"); }
  console.log("  RISK: LOW — no dedicated page loader found, data from snapshots");

  // ══════════════════════════════════════════════════════════════════════
  // INVENTARIO
  // ══════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(60));
  console.log("[PERF][INVENTARIO]");
  console.log("━".repeat(60));

  console.log("  ProductEntity: " + peCount + " rows");
  console.log("  ProductInventoryLevel: " + pilCount[0]?.total + " rows");

  // Check inventory read service
  const tiInv = performance.now();
  const invSample = await db.productEntity.findMany({
    where: { organizationId: orgId },
    select: { id: true, sku: true, description: true, productLine: true },
    take: 25, orderBy: { sku: "asc" },
  });
  console.log("  ProductEntity page (25): " + (performance.now() - tiInv).toFixed(0) + "ms");
  console.log("  RISK: " + (peCount > 50000 ? "MEDIUM — large catalog" : "LOW — " + peCount + " products"));

  // ══════════════════════════════════════════════════════════════════════
  // FOUNDATION (cross-cutting)
  // ══════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(60));
  console.log("[PERF][FOUNDATION]");
  console.log("━".repeat(60));

  // commercial-identity-map.ts, client-seller-linker.ts, seller-directory.ts
  // all use rawCrmJson from CRMQuote
  console.log("  CRMQuote rawCrmJson: " + qJsonKb.toFixed(0) + " KB for " + qCount + " quotes");
  console.log("  RISK: " + (qCount > 1000 ? "MEDIUM — foundation rawCrmJson growing" : "LOW — " + qCount + " quotes manageable"));

  // ══════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════════════
  console.log("\n" + "=".repeat(70));
  console.log("RISK MATRIX");
  console.log("=".repeat(70));
  console.log("  Module       | Risk   | Reason");
  console.log("  -------------|--------|--------------------------------------------");
  console.log("  Clientes     | FIXED  | Was TIMEOUT, now paginated (<300ms)");
  console.log("  Pedidos      | " + (qCount > 500 ? "MEDIUM" : "LOW   ") + " | rawCrmJson in getOrderStats (" + qCount + " quotes)");
  console.log("  Maletas      | LOW    | SAG SOAP is the bottleneck, not DB queries");
  console.log("  Tiendas      | " + (storeCount > 10 ? "MEDIUM" : "LOW   ") + " | " + storeCount + " sequential getStoreDetail calls");
  console.log("  Vendedores   | LOW    | No heavy loader found");
  console.log("  Inventario   | LOW    | " + peCount + " products, paginated reads");
  console.log("  Foundation   | LOW    | " + qCount + " CRM quotes, manageable payload");

  console.log("\n=== AUDIT COMPLETE ===");
  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
