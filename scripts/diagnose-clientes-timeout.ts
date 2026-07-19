/**
 * CLIENTES-HOTFIX-01 — Diagnose query read timeout in loadClientesSummary()
 *
 * Usage: npx tsx scripts/diagnose-clientes-timeout.ts
 */
import { prisma } from "@/lib/prisma";

async function main() {
  const db = prisma as any;
  const org = await db.organization.findFirst({ where: { slug: "castillitos" } });
  if (!org) { console.log("ERROR: castillitos not found"); return; }
  const orgId = org.id;
  console.log("orgId:", orgId);

  // ── Row counts ──────────────────────────────────────────────────────
  const t0 = performance.now();
  const profileCount = await db.customerProfile.count({ where: { organizationId: orgId } });
  console.log("CustomerProfile count: " + profileCount + " (" + (performance.now() - t0).toFixed(1) + "ms)");

  const t1 = performance.now();
  const quoteCount = await db.cRMQuote.count({ where: { organizationId: orgId } });
  console.log("CRMQuote count: " + quoteCount + " (" + (performance.now() - t1).toFixed(1) + "ms)");

  // ── Profile findMany WITHOUT rawCrmJson ─────────────────────────────
  const t2 = performance.now();
  const profiles = await db.customerProfile.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true, nit: true, city: true, crmId: true, status: true },
    orderBy: { name: "asc" },
  });
  console.log("Profile findMany (no JSON): " + profiles.length + " rows (" + (performance.now() - t2).toFixed(1) + "ms)");

  // ── Profile sample WITH rawCrmJson (100 rows) ──────────────────────
  const t3 = performance.now();
  const profilesJson = await db.customerProfile.findMany({
    where: { organizationId: orgId },
    select: { id: true, rawCrmJson: true },
    take: 100,
  });
  const withJson = profilesJson.filter((p: any) => p.rawCrmJson).length;
  let jsonSize = 0;
  for (const p of profilesJson) {
    if (p.rawCrmJson) jsonSize += JSON.stringify(p.rawCrmJson).length;
  }
  const avgKb = withJson > 0 ? (jsonSize / withJson / 1024).toFixed(1) : "0";
  console.log("Profile sample (100, with JSON): " + withJson + "/100 have rawCrmJson, avg " + avgKb + " KB each (" + (performance.now() - t3).toFixed(1) + "ms)");
  if (withJson > 0) {
    const pctWithJson = Math.round(withJson);
    const estimatedTotalMB = ((jsonSize / withJson) * profileCount / 1024 / 1024).toFixed(1);
    console.log("Estimated total rawCrmJson transfer: ~" + estimatedTotalMB + " MB for " + profileCount + " profiles");
  }

  // ── CRMQuote findMany WITH rawCrmJson ──────────────────────────────
  const t4 = performance.now();
  const quotesJson = await db.cRMQuote.findMany({
    where: { organizationId: orgId },
    select: { sellerName: true, rawCrmJson: true },
  });
  let quoteJsonSize = 0;
  for (const q of quotesJson) {
    if (q.rawCrmJson) quoteJsonSize += JSON.stringify(q.rawCrmJson).length;
  }
  console.log("CRMQuote findMany (with JSON): " + quotesJson.length + " rows, " + (quoteJsonSize / 1024).toFixed(1) + " KB total (" + (performance.now() - t4).toFixed(1) + "ms)");

  // ── EXPLAIN ANALYZE ─────────────────────────────────────────────────
  console.log("\n--- EXPLAIN: CustomerProfile (no JSON) ---");
  try {
    const explain1: any[] = await db.$queryRawUnsafe(
      'EXPLAIN ANALYZE SELECT id, name, nit, city, "crmId", status FROM "CustomerProfile" WHERE "organizationId" = $1 ORDER BY name ASC',
      orgId,
    );
    for (const row of explain1) console.log("  " + ((row as any)["QUERY PLAN"] ?? JSON.stringify(row)));
  } catch (e: any) { console.log("  ERROR: " + e.message); }

  console.log("\n--- EXPLAIN: CustomerProfile (WITH rawCrmJson) ---");
  try {
    const explain2: any[] = await db.$queryRawUnsafe(
      'EXPLAIN ANALYZE SELECT id, name, nit, city, "crmId", status, "rawCrmJson" FROM "CustomerProfile" WHERE "organizationId" = $1 ORDER BY name ASC',
      orgId,
    );
    for (const row of explain2) console.log("  " + ((row as any)["QUERY PLAN"] ?? JSON.stringify(row)));
  } catch (e: any) { console.log("  ERROR: " + e.message); }

  console.log("\n--- EXPLAIN: CRMQuote ---");
  try {
    const explain3: any[] = await db.$queryRawUnsafe(
      'EXPLAIN ANALYZE SELECT "sellerName", "rawCrmJson" FROM "CRMQuote" WHERE "organizationId" = $1',
      orgId,
    );
    for (const row of explain3) console.log("  " + ((row as any)["QUERY PLAN"] ?? JSON.stringify(row)));
  } catch (e: any) { console.log("  ERROR: " + e.message); }

  // ── Column/table sizes on disk ─────────────────────────────────────
  console.log("\n--- COLUMN SIZES ---");
  try {
    const colSize: any[] = await db.$queryRawUnsafe(
      'SELECT pg_size_pretty(SUM(pg_column_size("rawCrmJson"))) as json_size, COUNT(*) as rows FROM "CustomerProfile" WHERE "organizationId" = $1',
      orgId,
    );
    console.log("  CustomerProfile.rawCrmJson on disk: " + (colSize[0]?.json_size ?? "?"));
    console.log("  Rows: " + (colSize[0]?.rows ?? "?"));
  } catch (e: any) { console.log("  Profile column size failed: " + e.message); }

  try {
    const quoteColSize: any[] = await db.$queryRawUnsafe(
      'SELECT pg_size_pretty(SUM(pg_column_size("rawCrmJson"))) as json_size, COUNT(*) as rows FROM "CRMQuote" WHERE "organizationId" = $1',
      orgId,
    );
    console.log("  CRMQuote.rawCrmJson on disk: " + (quoteColSize[0]?.json_size ?? "?"));
    console.log("  Rows: " + (quoteColSize[0]?.rows ?? "?"));
  } catch (e: any) { console.log("  Quote column size failed: " + e.message); }

  try {
    const tableSize: any[] = await db.$queryRawUnsafe(
      "SELECT pg_size_pretty(pg_total_relation_size('\"CustomerProfile\"')) as total_size"
    );
    console.log("  CustomerProfile table total: " + (tableSize[0]?.total_size ?? "?"));
  } catch (e: any) { console.log("  Table size failed: " + e.message); }

  console.log("\n=== DIAGNOSTIC COMPLETE ===");
  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
