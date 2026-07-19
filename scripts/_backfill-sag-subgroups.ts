/**
 * scripts/_backfill-sag-subgroups.ts
 *
 * CATALOG-SAG-SUBGROUP-ENRICHMENT-01 — Backfill script.
 *
 * Updates existing ProductEntity and CommercialCoverageSnapshot records
 * with subgrupoId + subgrupoSag from SAG SUBGRUPOS lookup.
 *
 * Usage:
 *   env $(grep -E '^[A-Z_]+=' .env | tr '\n' ' ') npx tsx scripts/_backfill-sag-subgroups.ts
 *
 * Safe: read-only on SAG, write to Prisma ProductEntity + CommercialCoverageSnapshot.
 */

import { prisma } from "@/lib/prisma";
import { consultaSagJson } from "@/lib/connectors/pya/client";
import { loadSagTestEnv } from "@/lib/sag/env";

interface SubgrupoRow {
  ka_ni_subgrupo: number;
  sc_detalle_subgrupo: string;
}

interface ArticleSubgrupoRow {
  k_sc_codigo_articulo: string;
  ka_ni_subgrupo: number;
}

async function main() {
  const db = prisma as any;
  const sagConfig = loadSagTestEnv();

  console.log("=== CATALOG-SAG-SUBGROUP-ENRICHMENT-01 BACKFILL ===\n");

  // Step 1: Fetch SUBGRUPOS lookup from SAG
  console.log("[1/5] Fetching SUBGRUPOS from SAG...");
  const subgrupoRows = (await consultaSagJson(
    sagConfig,
    "SELECT ka_ni_subgrupo, sc_detalle_subgrupo FROM SUBGRUPOS",
  )) as unknown as SubgrupoRow[];

  const subgrupoLookup = new Map<number, string>();
  for (const row of subgrupoRows) {
    if (row.ka_ni_subgrupo != null) {
      subgrupoLookup.set(Number(row.ka_ni_subgrupo), (row.sc_detalle_subgrupo ?? "").trim());
    }
  }
  console.log(`  ${subgrupoLookup.size} subgrupos loaded\n`);

  // Step 2: Fetch article → subgrupo mapping from SAG v_articulos
  console.log("[2/5] Fetching article subgrupos from v_articulos...");
  const articleRows = (await consultaSagJson(
    sagConfig,
    "SELECT k_sc_codigo_articulo, ka_ni_subgrupo FROM v_articulos GROUP BY k_sc_codigo_articulo, ka_ni_subgrupo",
  )) as unknown as ArticleSubgrupoRow[];

  const articleSubgrupoMap = new Map<string, number>();
  for (const row of articleRows) {
    const ref = (row.k_sc_codigo_articulo ?? "").trim().toUpperCase();
    if (ref && row.ka_ni_subgrupo != null) {
      articleSubgrupoMap.set(ref, Number(row.ka_ni_subgrupo));
    }
  }
  console.log(`  ${articleSubgrupoMap.size} article→subgrupo mappings\n`);

  // Step 3: Update ProductEntity records
  console.log("[3/5] Updating ProductEntity records...");
  const products = await db.productEntity.findMany({
    where: { externalSource: "sag", subgrupoId: null },
    select: { id: true, sku: true },
  });

  let peUpdated = 0;
  let peSkipped = 0;
  for (const product of products) {
    const sku = (product.sku ?? "").trim().toUpperCase();
    const subgrupoId = articleSubgrupoMap.get(sku);
    if (subgrupoId == null) {
      peSkipped++;
      continue;
    }
    const subgrupoSag = subgrupoLookup.get(subgrupoId) ?? null;
    await db.productEntity.update({
      where: { id: product.id },
      data: { subgrupoId, subgrupoSag },
    });
    peUpdated++;
  }
  console.log(`  ProductEntity: ${peUpdated} updated, ${peSkipped} skipped (no SAG match)\n`);

  // Step 4: Update latest CommercialCoverageSnapshot batch
  console.log("[4/5] Updating CommercialCoverageSnapshot...");
  const orgRows: Array<{ organizationId: string }> = await db.$queryRawUnsafe(
    `SELECT DISTINCT "organizationId" FROM "CommercialCoverageSnapshot"`,
  );

  let snapUpdated = 0;
  for (const { organizationId } of orgRows) {
    // Get latest snapshot timestamp
    const latest = await db.commercialCoverageSnapshot.findFirst({
      where: { organizationId },
      orderBy: { snapshotAt: "desc" },
      select: { snapshotAt: true },
    });
    if (!latest) continue;

    // Get all refs in latest batch that are missing subgrupo
    const refs = await db.commercialCoverageSnapshot.findMany({
      where: { organizationId, snapshotAt: latest.snapshotAt, subgrupoId: null },
      select: { id: true, refCode: true },
    });

    for (const snap of refs) {
      const ref = (snap.refCode ?? "").trim().toUpperCase();
      const subgrupoId = articleSubgrupoMap.get(ref);
      if (subgrupoId == null) continue;
      const subgrupoSag = subgrupoLookup.get(subgrupoId) ?? null;
      await db.commercialCoverageSnapshot.update({
        where: { id: snap.id },
        data: { subgrupoId, subgrupoSag },
      });
      snapUpdated++;
    }
  }
  console.log(`  CommercialCoverageSnapshot: ${snapUpdated} updated\n`);

  // Step 5: Summary
  console.log("[5/5] Summary:");
  console.log(`  SAG SUBGRUPOS:      ${subgrupoLookup.size}`);
  console.log(`  Article mappings:   ${articleSubgrupoMap.size}`);
  console.log(`  ProductEntity:      ${peUpdated} enriched`);
  console.log(`  CoverageSnapshot:   ${snapUpdated} enriched`);
  console.log("\n=== BACKFILL COMPLETE ===");
}

main()
  .catch((e) => {
    console.error("BACKFILL FAILED:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
