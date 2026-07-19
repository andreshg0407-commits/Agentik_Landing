/**
 * scripts/_audit-production-inventory-reconciliation.ts
 * Phase 1: Trace the exact case CS NIÑA KIDS / CONJUNTO NIÑA KIDS CC
 * Phase 2: Compare Inventario vs Production data sources
 * READ-ONLY audit — no mutations
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "castillitos" } });
  if (!org) { console.log("No org found"); return; }

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 1A: Find all subgrupoIds whose subgrupoSag contains "CONJUNTO"
  // in line=CS from CommercialCoverageSnapshot
  // ═══════════════════════════════════════════════════════════════════════
  interface SubgrupoRow {
    subgrupoId: number;
    subgrupoSag: string;
    line: string;
    cnt: bigint;
    totalDisponible: bigint;
  }
  const conjuntoSubgrupos: SubgrupoRow[] = await prisma.$queryRawUnsafe(`
    WITH latest AS (
      SELECT DISTINCT ON ("refCode")
        "refCode", line, disponible, "subgrupoId", "subgrupoSag"
      FROM "CommercialCoverageSnapshot"
      WHERE "organizationId" = $1
      ORDER BY "refCode", "snapshotAt" DESC
    )
    SELECT "subgrupoId", "subgrupoSag", line,
           COUNT(*)::bigint AS cnt,
           SUM(GREATEST(disponible, 0))::bigint AS "totalDisponible"
    FROM latest
    WHERE line = 'CS'
      AND "subgrupoSag" LIKE '%CONJUNTO%'
      AND "subgrupoId" IS NOT NULL
    GROUP BY "subgrupoId", "subgrupoSag", line
    ORDER BY "subgrupoSag", "subgrupoId"
  `, org.id);

  console.log("\n=== PHASE 1A: CS CONJUNTO subgrupoIds in CoverageSnapshot ===");
  console.log("subgrupoId | subgrupoSag | refs | totalDisponible");
  for (const r of conjuntoSubgrupos) {
    console.log(`${r.subgrupoId} | ${r.subgrupoSag} | ${r.cnt} | ${r.totalDisponible}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 1B: Find ProductEntity grupo info for these refs
  // ProductEntity has subgrupoId + subgrupoSag but NO grupoSag
  // However, we can check if the subgrupoSag values match
  // ═══════════════════════════════════════════════════════════════════════
  interface PeSubgrupoRow {
    subgrupoId: number;
    subgrupoSag: string;
    productLine: string;
    cnt: bigint;
  }
  const peSubgrupos: PeSubgrupoRow[] = await prisma.$queryRawUnsafe(`
    SELECT "subgrupoId", "subgrupoSag", "productLine", COUNT(*)::bigint AS cnt
    FROM "ProductEntity"
    WHERE "organizationId" = $1
      AND "subgrupoSag" LIKE '%CONJUNTO%'
      AND "productLine" = '2'
      AND "subgrupoId" IS NOT NULL
    GROUP BY "subgrupoId", "subgrupoSag", "productLine"
    ORDER BY "subgrupoSag", "subgrupoId"
  `, org.id);

  console.log("\n=== PHASE 1B: ProductEntity CS CONJUNTO subgrupoIds ===");
  console.log("subgrupoId | subgrupoSag | productLine | refs");
  for (const r of peSubgrupos) {
    console.log(`${r.subgrupoId} | ${r.subgrupoSag} | ${r.productLine} | ${r.cnt}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 1C: Show actual refs for specific subgrupoIds (CONJUNTO CC)
  // Show reference, description, disponible, subgrupoId
  // ═══════════════════════════════════════════════════════════════════════
  interface RefRow {
    refCode: string;
    description: string;
    disponible: number;
    subgrupoId: number | null;
    subgrupoSag: string | null;
    snapshotAt: Date;
  }
  const conjuntoRefs: RefRow[] = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT ON ("refCode")
      "refCode", description, disponible, "subgrupoId", "subgrupoSag", "snapshotAt"
    FROM "CommercialCoverageSnapshot"
    WHERE "organizationId" = $1
      AND line = 'CS'
      AND "subgrupoSag" = 'CONJUNTO CC'
    ORDER BY "refCode", "snapshotAt" DESC
    LIMIT 20
  `, org.id);

  console.log("\n=== PHASE 1C: Sample refs with subgrupoSag='CONJUNTO CC' (first 20) ===");
  console.log("refCode | description | disponible | subgrupoId | snapshotAt");
  for (const r of conjuntoRefs) {
    console.log(`${r.refCode} | ${(r.description ?? "").substring(0, 50)} | ${r.disponible} | ${r.subgrupoId} | ${r.snapshotAt?.toISOString?.() ?? "?"}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 1D: Check if "CONJUNTO NIÑA KIDS CC" exists as a subgrupoSag
  // in either CoverageSnapshot or ProductEntity
  // ═══════════════════════════════════════════════════════════════════════
  interface ExactMatch { cnt: bigint }
  const ccsExact: ExactMatch[] = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::bigint AS cnt
    FROM "CommercialCoverageSnapshot"
    WHERE "organizationId" = $1
      AND "subgrupoSag" = 'CONJUNTO NIÑA KIDS CC'
  `, org.id);

  const peExact: ExactMatch[] = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::bigint AS cnt
    FROM "ProductEntity"
    WHERE "organizationId" = $1
      AND "subgrupoSag" = 'CONJUNTO NIÑA KIDS CC'
  `, org.id);

  console.log("\n=== PHASE 1D: Exact match 'CONJUNTO NIÑA KIDS CC' ===");
  console.log(`CommercialCoverageSnapshot: ${ccsExact[0]?.cnt ?? 0} rows`);
  console.log(`ProductEntity: ${peExact[0]?.cnt ?? 0} rows`);

  // Also check any subgrupoSag containing "NIÑA KIDS" in CS
  interface NinaKidsRow { subgrupoSag: string; cnt: bigint }
  const ninaKidsCcs: NinaKidsRow[] = await prisma.$queryRawUnsafe(`
    SELECT "subgrupoSag", COUNT(*)::bigint AS cnt
    FROM "CommercialCoverageSnapshot"
    WHERE "organizationId" = $1
      AND line = 'CS'
      AND "subgrupoSag" LIKE '%NIÑA%'
    GROUP BY "subgrupoSag"
    ORDER BY "subgrupoSag"
  `, org.id);

  console.log("\n=== PHASE 1D-bis: CCS rows with subgrupoSag LIKE '%NIÑA%' ===");
  if (ninaKidsCcs.length === 0) console.log("NONE FOUND");
  for (const r of ninaKidsCcs) {
    console.log(`${r.subgrupoSag}: ${r.cnt} rows`);
  }

  const ninaKidsPe: NinaKidsRow[] = await prisma.$queryRawUnsafe(`
    SELECT "subgrupoSag", COUNT(*)::bigint AS cnt
    FROM "ProductEntity"
    WHERE "organizationId" = $1
      AND "productLine" = '2'
      AND "subgrupoSag" LIKE '%NIÑA%'
    GROUP BY "subgrupoSag"
    ORDER BY "subgrupoSag"
  `, org.id);

  console.log("\n=== PHASE 1D-ter: PE rows with subgrupoSag LIKE '%NIÑA%' ===");
  if (ninaKidsPe.length === 0) console.log("NONE FOUND");
  for (const r of ninaKidsPe) {
    console.log(`${r.subgrupoSag}: ${r.cnt} rows`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 1E: Check refs matching "conjunto niña kids" by description
  // (what Inventario search would show)
  // ═══════════════════════════════════════════════════════════════════════
  const searchRefs: RefRow[] = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT ON ("refCode")
      "refCode", description, disponible, "subgrupoId", "subgrupoSag", "snapshotAt"
    FROM "CommercialCoverageSnapshot"
    WHERE "organizationId" = $1
      AND line = 'CS'
      AND LOWER(description) LIKE '%conjunto%ni_a%kids%'
    ORDER BY "refCode", "snapshotAt" DESC
  `, org.id);

  console.log("\n=== PHASE 1E: Refs matching 'conjunto niña kids' in description ===");
  console.log("refCode | description | disponible | subgrupoId | subgrupoSag");
  for (const r of searchRefs) {
    console.log(`${r.refCode} | ${(r.description ?? "").substring(0, 60)} | ${r.disponible} | ${r.subgrupoId} | ${r.subgrupoSag}`);
  }
  console.log(`Total disponible: ${searchRefs.reduce((s, r) => s + (r.disponible > 0 ? r.disponible : 0), 0)}`);

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 2A: All distinct subgrupoSag values in CS CoverageSnapshot
  // ═══════════════════════════════════════════════════════════════════════
  interface SubgrupoAgg { subgrupoSag: string; totalDisponible: bigint; refCount: bigint }
  const allCsSubgrupos: SubgrupoAgg[] = await prisma.$queryRawUnsafe(`
    WITH latest AS (
      SELECT DISTINCT ON ("refCode")
        "refCode", disponible, "subgrupoSag"
      FROM "CommercialCoverageSnapshot"
      WHERE "organizationId" = $1
        AND line = 'CS'
      ORDER BY "refCode", "snapshotAt" DESC
    )
    SELECT "subgrupoSag",
           SUM(GREATEST(disponible, 0))::bigint AS "totalDisponible",
           COUNT(*)::bigint AS "refCount"
    FROM latest
    WHERE "subgrupoSag" IS NOT NULL
    GROUP BY "subgrupoSag"
    ORDER BY "subgrupoSag"
  `, org.id);

  console.log("\n=== PHASE 2A: ALL CS subgrupoSag values in CoverageSnapshot ===");
  console.log("subgrupoSag | totalDisponible | refCount");
  for (const r of allCsSubgrupos) {
    console.log(`${r.subgrupoSag} | ${r.totalDisponible} | ${r.refCount}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 2B: Snapshot freshness
  // ═══════════════════════════════════════════════════════════════════════
  interface FreshnessRow { maxSnapshot: Date | null; minSnapshot: Date | null }
  const freshness: FreshnessRow[] = await prisma.$queryRawUnsafe(`
    SELECT MAX("snapshotAt") AS "maxSnapshot", MIN("snapshotAt") AS "minSnapshot"
    FROM "CommercialCoverageSnapshot"
    WHERE "organizationId" = $1
  `, org.id);

  console.log("\n=== PHASE 2B: CoverageSnapshot freshness ===");
  if (freshness[0]) {
    console.log(`Latest snapshot: ${freshness[0].maxSnapshot?.toISOString?.() ?? "null"}`);
    console.log(`Oldest snapshot: ${freshness[0].minSnapshot?.toISOString?.() ?? "null"}`);
    if (freshness[0].maxSnapshot) {
      const ageMs = Date.now() - new Date(freshness[0].maxSnapshot).getTime();
      const ageDays = Math.round(ageMs / (1000 * 60 * 60 * 24));
      console.log(`Age: ${ageDays} days`);
    }
  }

  // PIL freshness
  interface PilFreshness { maxSynced: Date | null }
  const pilFreshness: PilFreshness[] = await prisma.$queryRawUnsafe(`
    SELECT MAX("syncedAt") AS "maxSynced"
    FROM "ProductInventoryLevel"
    WHERE "organizationId" = $1
  `, org.id);

  console.log(`PIL latest syncedAt: ${pilFreshness[0]?.maxSynced?.toISOString?.() ?? "null"}`);

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 2C: Check F34 presence for CONJUNTO CC refs
  // What subgrupoId does the vendor balance query return?
  // ═══════════════════════════════════════════════════════════════════════
  // We check if VendorCommercialBag items have CONJUNTO refs and trace them
  interface BagRefRow {
    salesRepId: string;
    reference: string;
  }
  const bagRefs: BagRefRow[] = await prisma.$queryRawUnsafe(`
    SELECT b."salesRepId", i.reference
    FROM "VendorCommercialBag" b
    JOIN "VendorCommercialBagItem" i ON i."bagId" = b.id
    JOIN "CommercialCoverageSnapshot" ccs
      ON ccs."refCode" = i.reference
      AND ccs."organizationId" = b."organizationId"
      AND ccs."subgrupoSag" = 'CONJUNTO CC'
      AND ccs.line = 'CS'
    WHERE b."organizationId" = $1
    ORDER BY b."salesRepId", i.reference
    LIMIT 30
  `, org.id);

  console.log("\n=== PHASE 2C: Vendor bag items in CONJUNTO CC subgrupo ===");
  console.log("salesRepId | reference");
  for (const r of bagRefs) {
    console.log(`${r.salesRepId} | ${r.reference}`);
  }
  if (bagRefs.length === 0) console.log("NONE FOUND — no vendor bags have CONJUNTO CC refs");

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 3: Production orders for CONJUNTO CC refs
  // ═══════════════════════════════════════════════════════════════════════
  interface OpRow { status: string; cnt: bigint }
  const opData: OpRow[] = await prisma.$queryRawUnsafe(`
    SELECT po.status, COUNT(DISTINCT po.id)::bigint AS cnt
    FROM "ProductionOrder" po
    JOIN "ProductionOrderLine" pol ON pol."orderId" = po.id
    JOIN "ProductEntity" pe ON pe.sku = pol."referenceCode" AND pe."organizationId" = po."organizationId"
    WHERE po."organizationId" = $1
      AND pe."subgrupoSag" = 'CONJUNTO CC'
      AND pe."productLine" = '2'
      AND po.status NOT IN ('cerrada', 'cancelada', 'terminada', 'anulada', 'CERRADA', 'CANCELADA', 'TERMINADA', 'ANULADA')
    GROUP BY po.status
    ORDER BY cnt DESC
  `, org.id);

  console.log("\n=== PHASE 3: Active OPs for CONJUNTO CC refs ===");
  if (opData.length === 0) console.log("No active OPs found");
  for (const r of opData) {
    console.log(`${r.status}: ${r.cnt} orders`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("RECONCILIATION SUMMARY");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");
  console.log("KEY QUESTION: Does 'CONJUNTO NIÑA KIDS CC' exist as a subgrupoSag in the DB?");
  console.log(`  CoverageSnapshot: ${ccsExact[0]?.cnt ?? 0} rows`);
  console.log(`  ProductEntity: ${peExact[0]?.cnt ?? 0} rows`);
  console.log("");
  console.log("HYPOTHESIS: The assortment catalog uses sagSubgrupo='CONJUNTO NIÑA KIDS CC'");
  console.log("but the actual SAG subgrupo name is 'CONJUNTO CC'. This name mismatch");
  console.log("causes the production evaluation to create a group entry that doesn't");
  console.log("match any stock data → DATOS_INSUFICIENTES / stock=0.");
  console.log("");
  console.log("Refs matching description 'conjunto niña kids':");
  console.log(`  Count: ${searchRefs.length}`);
  console.log(`  Total disponible: ${searchRefs.reduce((s, r) => s + Math.max(r.disponible, 0), 0)}`);
  console.log(`  Actual subgrupoSag: ${[...new Set(searchRefs.map((r) => r.subgrupoSag))].join(", ")}`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
