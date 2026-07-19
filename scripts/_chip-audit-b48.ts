/**
 * scripts/_chip-audit-b48.ts
 * READ-ONLY audit: diagnose chip counts for Néstor/B48
 * MALETAS-PANEL-CHIPS-OPERATIVOS-01
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

  // 1. Import ref set (productLine=5)
  const importProducts = await prisma.productEntity.findMany({
    where: { organizationId: org.id, productLine: "5" },
    select: { sku: true },
  });
  const importRefSet = new Set(importProducts.map((p) => p.sku).filter(Boolean));
  console.log(`\n=== IMPORT REF SET: ${importRefSet.size} refs (productLine=5) ===`);

  // 2. Import availability (B36+B37)
  interface ImportRow { sku: string; available: number }
  const importRows: ImportRow[] = await prisma.$queryRawUnsafe(`
    SELECT pe.sku,
           SUM(GREATEST(pil.quantity, 0))::int AS available
    FROM "ProductInventoryLevel" pil
    JOIN "ProductEntity" pe ON pe.id = pil."productId"
      AND pe."organizationId" = pil."organizationId"
    WHERE pil."organizationId" = $1
      AND pil."warehouseId" IN ('36', '37')
    GROUP BY pe.sku
  `, org.id);
  const importAvailMap = new Map(importRows.map((r) => [r.sku, r.available]));
  console.log(`Import availability: ${importAvailMap.size} refs from B36+B37`);

  // 3. Coverage snapshot (main warehouse)
  interface CoverageRow { refCode: string; disponible: number; line: string }
  const coverageRows: CoverageRow[] = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT ON ("refCode")
      "refCode", disponible, line
    FROM "CommercialCoverageSnapshot"
    WHERE "organizationId" = $1
    ORDER BY "refCode", "snapshotAt" DESC
  `, org.id);
  const coverageMap = new Map(coverageRows.map((r) => [r.refCode, r]));
  console.log(`Coverage snapshot: ${coverageMap.size} refs`);

  // Presence comes from SAG via buildVendorBalanceQuery — not queryable from Prisma.
  // Audit the 63 Escasez by checking all import refs and their availability.

  console.log(`\n=== IMPORT REF AVAILABILITY ANALYSIS ===`);
  const IMPORT_SCARCITY_MINIMUM = 10;
  let scarcityCount = 0;
  let healthyImportCount = 0;
  let zeroStockImport = 0;
  const scarcityRefs: { sku: string; available: number; hasCoverage: boolean }[] = [];

  for (const sku of importRefSet) {
    const avail = importAvailMap.get(sku) ?? 0;
    const hasCoverage = coverageMap.has(sku);
    if (avail <= IMPORT_SCARCITY_MINIMUM) {
      scarcityCount++;
      scarcityRefs.push({ sku, available: avail, hasCoverage });
      if (avail <= 0) zeroStockImport++;
    } else {
      healthyImportCount++;
    }
  }
  console.log(`Total import refs: ${importRefSet.size}`);
  console.log(`Scarcity (avail <= ${IMPORT_SCARCITY_MINIMUM}): ${scarcityCount}`);
  console.log(`  of which zero stock: ${zeroStockImport}`);
  console.log(`Healthy (avail > ${IMPORT_SCARCITY_MINIMUM}): ${healthyImportCount}`);

  // Now check overlap: how many scarcity refs also have coverage data
  const withCoverage = scarcityRefs.filter((r) => r.hasCoverage);
  const withoutCoverage = scarcityRefs.filter((r) => !r.hasCoverage);
  console.log(`\n=== OVERLAP: SCARCITY REFS WITH COVERAGE DATA ===`);
  console.log(`With coverage (potential double-count in Agotado/StockBajo): ${withCoverage.length}`);
  console.log(`Without coverage (INSUFFICIENT_DATA, only Escasez): ${withoutCoverage.length}`);

  // For those with coverage, check their commercialHealth
  console.log(`\n=== DOUBLE-COUNT CANDIDATES ===`);
  let doubleCountOOS = 0;
  let doubleCountLow = 0;
  for (const ref of withCoverage) {
    const cov = coverageMap.get(ref.sku);
    if (!cov) continue;
    // Note: for accessories, centralAvailable is from importAvailMap, NOT coverage.disponible
    // But deriveCommercialHealth uses centralAvailable (from importAvailMap) with hasCoverageData=true
    const centralAvailable = ref.available; // this is importAvailMap value
    if (centralAvailable <= 0) { doubleCountOOS++; }
    else if (centralAvailable <= 10) { doubleCountLow++; } // minimum for IMPORT=10
  }
  console.log(`Would be Agotado AND Escasez: ${doubleCountOOS}`);
  console.log(`Would be StockBajo AND Escasez: ${doubleCountLow}`);

  // Show first 20 scarcity refs for inspection
  console.log(`\n=== FIRST 20 SCARCITY REFS ===`);
  for (const ref of scarcityRefs.slice(0, 20)) {
    const cov = coverageMap.get(ref.sku);
    console.log(`  ${ref.sku} | avail=${ref.available} | hasCoverage=${ref.hasCoverage} | covDisponible=${cov?.disponible ?? '-'} | covLine=${cov?.line ?? '-'}`);
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
