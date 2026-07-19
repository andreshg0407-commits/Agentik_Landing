/**
 * CLIENTES-PERFORMANCE-HOTFIX-01 — Validation
 *
 * Simulates the same queries as the refactored loader WITHOUT server-only guard.
 *
 * Usage: npx tsx scripts/validate-clientes-performance.ts
 */
import { prisma } from "@/lib/prisma";

async function main() {
  const db = prisma as any;
  const org = await db.organization.findFirst({ where: { slug: "castillitos" } });
  if (!org) { console.log("ERROR: castillitos not found"); return; }
  const orgId = org.id;

  console.log("=".repeat(70));
  console.log("CLIENTES-PERFORMANCE-HOTFIX-01 VALIDATION");
  console.log("=".repeat(70));

  // ── TEST 1: Summary aggregate (no rows) ────────────────────────────
  console.log("\n--- TEST 1: Summary aggregate (replaces 33K-row findMany) ---");
  const t1 = performance.now();
  const agg: any[] = await db.$queryRawUnsafe(`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE status = 'ACTIVE')::bigint AS active,
      COUNT(*) FILTER (WHERE "overdueReceivable" > 0)::bigint AS with_overdue
    FROM "CustomerProfile"
    WHERE "organizationId" = $1
  `, orgId);
  const t1Ms = (performance.now() - t1).toFixed(1);
  console.log("  Time: " + t1Ms + "ms");
  console.log("  Total: " + agg[0]?.total + " Active: " + agg[0]?.active);
  console.log("  PASS: " + (Number(t1Ms) < 2000 ? "YES" : "NO"));

  // ── TEST 2: Page 1 (25 rows, NO rawCrmJson) ───────────────────────
  console.log("\n--- TEST 2: Paginated findMany (25 rows, no rawCrmJson) ---");
  const t2 = performance.now();
  const profiles = await db.customerProfile.findMany({
    where: { organizationId: orgId },
    select: {
      id: true, name: true, nit: true, city: true, crmId: true,
      sellerName: true, status: true, segment: true, lastPurchaseAt: true,
      totalSalesL12: true, totalReceivable: true, overdueReceivable: true,
    },
    orderBy: { name: "asc" },
    take: 25,
    skip: 0,
  });
  const t2Ms = (performance.now() - t2).toFixed(1);
  console.log("  Time: " + t2Ms + "ms");
  console.log("  Rows: " + profiles.length);
  console.log("  First: " + (profiles[0]?.name ?? "none"));
  console.log("  PASS: " + (Number(t2Ms) < 3000 && profiles.length === 25 ? "YES" : "NO"));

  // ── TEST 3: CRM city extraction (targeted JSON path) ──────────────
  console.log("\n--- TEST 3: CRM city extraction (JSON path, not full blob) ---");
  const profileIds = profiles.map((p: any) => p.id);
  const t3 = performance.now();
  const cityRows: any[] = await db.$queryRawUnsafe(`
    SELECT id, "rawCrmJson"->'raw'->>'billing_address_city' AS crm_city
    FROM "CustomerProfile"
    WHERE "organizationId" = $1
      AND id = ANY($2::text[])
      AND "rawCrmJson" IS NOT NULL
  `, orgId, profileIds);
  const t3Ms = (performance.now() - t3).toFixed(1);
  const citiesFound = cityRows.filter((r: any) => r.crm_city).length;
  console.log("  Time: " + t3Ms + "ms");
  console.log("  Cities found: " + citiesFound + "/" + profileIds.length);
  console.log("  PASS: " + (Number(t3Ms) < 1000 ? "YES" : "NO"));

  // ── TEST 4: Seller linking (scoped to page crmIds) ────────────────
  console.log("\n--- TEST 4: Seller linking (scoped to page) ---");
  const pageCrmIds = profiles.filter((p: any) => p.crmId).map((p: any) => p.crmId);
  const t4 = performance.now();
  let sellerRows: any[] = [];
  if (pageCrmIds.length > 0) {
    sellerRows = await db.$queryRawUnsafe(`
      SELECT
        "rawCrmJson"->'raw'->>'billing_account_id' AS billing_id,
        "sellerName" AS seller
      FROM "CRMQuote"
      WHERE "organizationId" = $1
        AND "sellerName" IS NOT NULL
        AND "rawCrmJson"->'raw'->>'billing_account_id' = ANY($2::text[])
    `, orgId, pageCrmIds);
  }
  const t4Ms = (performance.now() - t4).toFixed(1);
  console.log("  Time: " + t4Ms + "ms");
  console.log("  CRM IDs in page: " + pageCrmIds.length);
  console.log("  Seller rows found: " + sellerRows.length);
  console.log("  PASS: " + (Number(t4Ms) < 1000 ? "YES" : "NO"));

  // ── TEST 5: Search by name (ILIKE) ────────────────────────────────
  console.log("\n--- TEST 5: Search by name (DB-level ILIKE) ---");
  const t5 = performance.now();
  const searchResults = await db.customerProfile.findMany({
    where: {
      organizationId: orgId,
      OR: [
        { name: { contains: "cast", mode: "insensitive" } },
        { nit: { contains: "cast", mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 25,
  });
  const t5Ms = (performance.now() - t5).toFixed(1);
  console.log("  Time: " + t5Ms + "ms");
  console.log("  Results: " + searchResults.length);
  console.log("  PASS: " + (Number(t5Ms) < 3000 ? "YES" : "NO"));

  // ── TEST 6: Filter con_cartera ────────────────────────────────────
  console.log("\n--- TEST 6: Filter con_cartera ---");
  const t6 = performance.now();
  const carteraResults = await db.customerProfile.findMany({
    where: { organizationId: orgId, overdueReceivable: { gt: 0 } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 25,
  });
  const t6Ms = (performance.now() - t6).toFixed(1);
  console.log("  Time: " + t6Ms + "ms");
  console.log("  Results: " + carteraResults.length);
  console.log("  PASS: " + (Number(t6Ms) < 3000 ? "YES" : "NO"));

  // ── TEST 7: con_vendedor filter (CRM join) ────────────────────────
  console.log("\n--- TEST 7: Filter con_vendedor (CRM join) ---");
  const t7 = performance.now();
  const vendedorCount: any[] = await db.$queryRawUnsafe(`
    SELECT COUNT(DISTINCT cp.id)::bigint AS count
    FROM "CustomerProfile" cp
    WHERE cp."organizationId" = $1
      AND cp."crmId" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "CRMQuote" cq
        WHERE cq."organizationId" = $1
          AND cq."sellerName" IS NOT NULL
          AND cq."rawCrmJson"->'raw'->>'billing_account_id' = cp."crmId"
      )
  `, orgId);
  const t7Ms = (performance.now() - t7).toFixed(1);
  console.log("  Time: " + t7Ms + "ms");
  console.log("  With seller: " + vendedorCount[0]?.count);
  console.log("  PASS: " + (Number(t7Ms) < 5000 ? "YES" : "NO"));

  // ── TEST 8: BEFORE comparison (rawCrmJson included — sampled) ─────
  console.log("\n--- TEST 8: BEFORE comparison (rawCrmJson, 100 rows) ---");
  const t8 = performance.now();
  const withJson = await db.customerProfile.findMany({
    where: { organizationId: orgId },
    select: { id: true, rawCrmJson: true },
    take: 100,
  });
  const t8Ms = (performance.now() - t8).toFixed(1);
  const jsonSizeKb = withJson.reduce((s: number, p: any) => s + (p.rawCrmJson ? JSON.stringify(p.rawCrmJson).length : 0), 0) / 1024;
  console.log("  Time (100 rows with JSON): " + t8Ms + "ms");
  console.log("  JSON size (100 rows): " + jsonSizeKb.toFixed(1) + " KB");
  console.log("  Estimated 33K rows: " + (jsonSizeKb * 332).toFixed(0) + " KB = " + (jsonSizeKb * 332 / 1024).toFixed(1) + " MB");

  // ── TEST 9: Indexes ───────────────────────────────────────────────
  console.log("\n--- TEST 9: Index verification ---");
  try {
    const indexes: any[] = await db.$queryRawUnsafe(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'CustomerProfile' ORDER BY indexname"
    );
    for (const idx of indexes) {
      console.log("  " + idx.indexname);
    }

    const quoteIndexes: any[] = await db.$queryRawUnsafe(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'CRMQuote' ORDER BY indexname"
    );
    console.log("  CRMQuote: " + quoteIndexes.map((i: any) => i.indexname).join(", "));
  } catch (e: any) {
    console.log("  " + e.message);
  }

  // ── SUMMARY ───────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(70));
  console.log("PERFORMANCE COMPARISON");
  console.log("=".repeat(70));
  console.log("                        BEFORE          AFTER");
  console.log("  Summary KPIs:         TIMEOUT         " + t1Ms + "ms");
  console.log("  Page (25 rows):       TIMEOUT         " + t2Ms + "ms");
  console.log("  CRM city:             (in blob)       " + t3Ms + "ms (targeted)");
  console.log("  Seller linking:       (all 33K)       " + t4Ms + "ms (page only)");
  console.log("  Search:               (client-side)   " + t5Ms + "ms (DB ILIKE)");
  console.log("  Filter cartera:       (client-side)   " + t6Ms + "ms (DB WHERE)");
  console.log("  Filter vendedor:      (client-side)   " + t7Ms + "ms (DB EXISTS)");
  console.log("  rawCrmJson loaded:    YES (76 MB)     NO");
  console.log("  Rows transferred:     33,203          25");

  const times = [t1Ms, t2Ms, t3Ms, t4Ms, t5Ms, t6Ms, t7Ms].map(Number);
  const maxTime = Math.max(...times);
  console.log("\n  Slowest query: " + maxTime.toFixed(1) + "ms");
  console.log("  All < 5s: " + (maxTime < 5000 ? "YES" : "NO"));
  console.log("\n=== VALIDATION COMPLETE ===");

  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
