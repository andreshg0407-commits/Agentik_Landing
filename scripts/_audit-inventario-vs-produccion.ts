/**
 * scripts/_audit-inventario-vs-produccion.ts
 *
 * READ-ONLY audit: Trace each column of the Inventario module to its real source.
 * Test 3 specific references: C-1922141, C-1501212, C-1602212
 * Compare with what Production would see.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

function inferProductType(description: string): string {
  const upper = description.toUpperCase();
  if (upper.includes("PIJAMA")) return "PIJAMA";
  if (upper.includes("VESTIDO")) return "VESTIDO";
  if (upper.includes("CONJUNTO")) return "CONJUNTO";
  if (upper.includes("BLUSA")) return "BLUSA";
  if (upper.includes("BUZO") || upper.includes("CAMIBUSO")) return "BUZO/CAMIBUSO";
  if (upper.includes("CAMISETA")) return "CAMISETA";
  if (upper.includes("POLO")) return "POLO";
  if (upper.includes("MAMELUCO")) return "MAMELUCO";
  return "OTRO";
}

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "castillitos" } });
  if (!org) {
    console.log("No org found");
    return;
  }

  const testRefs = ["C-1922141", "C-1501212", "C-1602212"];

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 1: CommercialCoverageSnapshot — raw DB values
  // ══════════════════════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════════════");
  console.log("SECTION 1: CommercialCoverageSnapshot — raw DB values");
  console.log("═══════════════════════════════════════════════════════════");

  interface CcsRow {
    refCode: string;
    description: string;
    line: string;
    disponible: number;
    pendingOrdersQty: number | null;
    subgrupoId: number | null;
    subgrupoSag: string | null;
    snapshotAt: Date;
  }

  for (const ref of testRefs) {
    const rows: CcsRow[] = await prisma.$queryRawUnsafe(`
      SELECT "refCode", description, line, disponible, "pendingOrdersQty",
             "subgrupoId", "subgrupoSag", "snapshotAt"
      FROM "CommercialCoverageSnapshot"
      WHERE "organizationId" = $1 AND "refCode" = $2
      ORDER BY "snapshotAt" DESC
      LIMIT 1
    `, org.id, ref);

    if (rows.length > 0) {
      const r = rows[0];
      console.log(`\n${ref}:`);
      console.log(`  description:      ${r.description}`);
      console.log(`  line:             ${r.line}`);
      console.log(`  disponible:       ${r.disponible}`);
      console.log(`  pendingOrdersQty: ${r.pendingOrdersQty}`);
      console.log(`  subgrupoId:       ${r.subgrupoId}`);
      console.log(`  subgrupoSag:      ${r.subgrupoSag}`);
      console.log(`  snapshotAt:       ${r.snapshotAt}`);
    } else {
      console.log(`\n${ref}: NOT FOUND in CCS`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 2: ProductEntity — raw DB values
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("SECTION 2: ProductEntity — raw DB values");
  console.log("═══════════════════════════════════════════════════════════");

  interface PeRow {
    sku: string;
    name: string | null;
    description: string | null;
    productLine: string | null;
    subgrupoId: number | null;
    subgrupoSag: string | null;
    category: string | null;
  }

  for (const ref of testRefs) {
    const rows: PeRow[] = await prisma.$queryRawUnsafe(`
      SELECT sku, name, description, "productLine", "subgrupoId", "subgrupoSag", category
      FROM "ProductEntity"
      WHERE "organizationId" = $1 AND sku = $2
      LIMIT 1
    `, org.id, ref);

    if (rows.length > 0) {
      const r = rows[0];
      console.log(`\n${ref}:`);
      console.log(`  name:        ${r.name}`);
      console.log(`  description: ${r.description}`);
      console.log(`  productLine: ${r.productLine}`);
      console.log(`  subgrupoId:  ${r.subgrupoId}`);
      console.log(`  subgrupoSag: ${r.subgrupoSag}`);
      console.log(`  category:    ${r.category}`);
    } else {
      console.log(`\n${ref}: NOT FOUND in ProductEntity`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 3: What Inventario actually shows (tracing the code path)
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("SECTION 3: Inventario module — column source trace");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("\nCode path: report-loader.ts:81");
  console.log("  subGrupo = (row as any).subgrupoSag ?? inferProductType(row.description)");
  console.log("\nThen inventory-control-service.ts:502:");
  console.log("  subgrupoSag = row.subGrupo  (aliased from above)");
  console.log("\nResult per reference:");

  for (const ref of testRefs) {
    const rows: CcsRow[] = await prisma.$queryRawUnsafe(`
      SELECT "refCode", description, "subgrupoSag"
      FROM "CommercialCoverageSnapshot"
      WHERE "organizationId" = $1 AND "refCode" = $2
      ORDER BY "snapshotAt" DESC LIMIT 1
    `, org.id, ref);

    if (rows.length > 0) {
      const r = rows[0];
      const inferred = inferProductType(r.description);
      const inventarioShows = r.subgrupoSag ?? inferred;
      console.log(`\n${ref}:`);
      console.log(`  CCS.subgrupoSag:        "${r.subgrupoSag}"`);
      console.log(`  inferProductType():      "${inferred}"`);
      console.log(`  Inventario UI shows:     "${inventarioShows}"`);
      console.log(`  Source classification:   ${r.subgrupoSag ? "CCS STALE VALUE" : "TEXT-DERIVED (inferProductType)"}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 4: Production module — what key it builds
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("SECTION 4: Production module — key trace for 'CS NINA KIDS / CONJUNTO NINA KIDS CC'");
  console.log("═══════════════════════════════════════════════════════════");

  // Find all CCS rows with description matching "conjunto" in line CS
  interface ConjuntoRow {
    refCode: string;
    description: string;
    subgrupoId: number | null;
    subgrupoSag: string | null;
    disponible: number;
  }
  const conjuntoRefs: ConjuntoRow[] = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT ON ("refCode")
      "refCode", description, "subgrupoId", "subgrupoSag", disponible
    FROM "CommercialCoverageSnapshot"
    WHERE "organizationId" = $1
      AND line = 'CS'
      AND LOWER(description) LIKE '%conjunto%ni_a%kids%'
    ORDER BY "refCode", "snapshotAt" DESC
  `, org.id);

  console.log(`\nRefs matching 'conjunto nina kids' in CS line: ${conjuntoRefs.length}`);
  console.log("refCode | subgrupoId | subgrupoSag (CCS) | disponible");
  for (const r of conjuntoRefs) {
    console.log(`  ${r.refCode} | ${r.subgrupoId} | ${r.subgrupoSag} | ${r.disponible}`);
  }

  // Get unique subgrupoIds
  const subgrupoIds = [...new Set(conjuntoRefs.filter(r => r.subgrupoId !== null).map(r => r.subgrupoId as number))];
  console.log(`\nUnique subgrupoIds found: [${subgrupoIds.join(", ")}]`);

  // Check what SAG SUBGRUPOS table has for these IDs (via ProductEntity which stores the SAG values)
  if (subgrupoIds.length > 0) {
    interface SubgrupoNameRow { subgrupoId: number; subgrupoSag: string; cnt: bigint }
    const peNames: SubgrupoNameRow[] = await prisma.$queryRawUnsafe(`
      SELECT "subgrupoId", "subgrupoSag", COUNT(*)::bigint AS cnt
      FROM "ProductEntity"
      WHERE "organizationId" = $1
        AND "subgrupoId" = ANY($2::int[])
      GROUP BY "subgrupoId", "subgrupoSag"
      ORDER BY "subgrupoId", "subgrupoSag"
    `, org.id, subgrupoIds);

    console.log("\nProductEntity subgrupoSag for these subgrupoIds:");
    for (const r of peNames) {
      console.log(`  subgrupoId=${r.subgrupoId}: "${r.subgrupoSag}" (${r.cnt} refs)`);
    }

    // CCS subgrupoSag for same IDs
    const ccsNames: SubgrupoNameRow[] = await prisma.$queryRawUnsafe(`
      SELECT "subgrupoId", "subgrupoSag", COUNT(*)::bigint AS cnt
      FROM "CommercialCoverageSnapshot"
      WHERE "organizationId" = $1
        AND "subgrupoId" = ANY($2::int[])
      GROUP BY "subgrupoId", "subgrupoSag"
      ORDER BY "subgrupoId", "subgrupoSag"
    `, org.id, subgrupoIds);

    console.log("\nCCS subgrupoSag for same subgrupoIds:");
    for (const r of ccsNames) {
      console.log(`  subgrupoId=${r.subgrupoId}: "${r.subgrupoSag}" (${r.cnt} rows)`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 5: Production key composition
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("SECTION 5: Production key — what the assortment catalog expects");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("\nAssortment catalog entry:");
  console.log('  sagGrupo: "CS NINA KIDS"');
  console.log('  sagSubgrupo: "CONJUNTO NINA KIDS CC"');
  console.log('  → productionStockKey("Castillitos", "CS NINA KIDS", "CONJUNTO NINA KIDS CC")');
  console.log('  → "CS NINA KIDS|CONJUNTO NINA KIDS CC"');
  console.log("\nQuestion: Does the stock map have this key?");
  console.log("Stock map key is built from live SAG lookup of subgrupoId.");
  console.log("If live SAG returns a DIFFERENT name than the catalog expects, key won't match.");

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 6: Snapshot freshness
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("SECTION 6: Snapshot freshness");
  console.log("═══════════════════════════════════════════════════════════");

  interface FreshnessRow { maxSnapshot: Date | null }
  const freshness: FreshnessRow[] = await prisma.$queryRawUnsafe(`
    SELECT MAX("snapshotAt") AS "maxSnapshot"
    FROM "CommercialCoverageSnapshot"
    WHERE "organizationId" = $1
  `, org.id);

  if (freshness[0]?.maxSnapshot) {
    const age = Math.round((Date.now() - new Date(freshness[0].maxSnapshot).getTime()) / (1000 * 60 * 60 * 24));
    console.log(`Latest snapshot: ${freshness[0].maxSnapshot}`);
    console.log(`Age: ${age} days`);
    console.log(`Stale (>7 days): ${age > 7 ? "YES" : "NO"}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 7: Column classification summary
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("SECTION 7: Column classification");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`
INVENTARIO MODULE COLUMNS:
  REFERENCIA       → CCS.refCode                    → REAL SAG (synced at snapshot time)
  DESCRIPCION      → CCS.description                → REAL SAG (synced at snapshot time)
  SUBLINEA         → CCS.line mapped via LINE_TO_SUBLINEA → DERIVED (CS→CASTILLITOS, LT→LATIN KIDS)
  SUBGRUPO/grupo   → (CCS.subgrupoSag ?? inferProductType(desc)) → MIXED:
                       If CCS.subgrupoSag exists: STALE SAG (snapshot-era value, never re-resolved)
                       If CCS.subgrupoSag is null: TEXT-DERIVED (regex on description)
  DISPONIBLE       → CCS.disponible                 → REAL SAG (B01+B04, at snapshot time)
  PENDIENTES       → CCS.pendingOrdersQty           → REAL SAG (at snapshot time)
  DISPONIBLE_REAL  → disponible (reconstructed)     → DERIVED (from CCS fields)
  ESTADO           → deriveTextileState(disponibleReal, threshold) → DERIVED (pure function)

PRODUCTION MODULE COLUMNS:
  GRUPO            → live SAG via subgrupoToGrupoLookup(subgrupoId) → REAL SAG (live SOAP query)
  SUBGRUPO         → live SAG via subgrupoLookup(subgrupoId)        → REAL SAG (live SOAP query)
                     OR assortment catalog sagSubgrupo               → HARDCODED CATALOG VALUE
  STOCK            → SUM(CCS.disponible) grouped by canonical key   → REAL SAG (but stale snapshot)
  KEY              → productionStockKey(brand, grupoSag, subgrupoSag) → DERIVED

KEY INSIGHT:
  Inventario subgrupo = CCS.subgrupoSag (stale, from snapshot era)
  Production ref grouping uses live SAG subgrupoLookup(subgrupoId) for stock map,
    but assortment catalog uses hardcoded sagSubgrupo for ref grouping.
  THREE DIFFERENT NAMING SOURCES for the same concept.
`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
