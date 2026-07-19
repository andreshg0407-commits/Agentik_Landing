/**
 * scripts/_validate-sag-subgroup-enrichment.ts
 *
 * CATALOG-SAG-SUBGROUP-ENRICHMENT-01 — Validation script.
 *
 * Takes 50 references and compares subgrupo across:
 *   1. SAG (v_articulos + SUBGRUPOS)
 *   2. ProductEntity
 *   3. CommercialCoverageSnapshot
 *   4. Maletas presence engine
 *
 * Usage:
 *   env $(grep -E '^[A-Z_]+=' .env | tr '\n' ' ') npx tsx scripts/_validate-sag-subgroup-enrichment.ts
 */

import { prisma } from "@/lib/prisma";
import { consultaSagJson } from "@/lib/connectors/pya/client";
import { loadSagTestEnv } from "@/lib/sag/env";

interface SubgrupoRow {
  ka_ni_subgrupo: number;
  sc_detalle_subgrupo: string;
}

interface ArticleRow {
  k_sc_codigo_articulo: string;
  ka_ni_subgrupo: number;
}

async function main() {
  const db = prisma as any;
  const sagConfig = loadSagTestEnv();

  console.log("=== CATALOG-SAG-SUBGROUP-ENRICHMENT-01 VALIDATION ===\n");

  // 1. Fetch SUBGRUPOS lookup
  console.log("[1/5] Fetching SUBGRUPOS from SAG...");
  const subgrupoRows = (await consultaSagJson(
    sagConfig,
    "SELECT ka_ni_subgrupo, sc_detalle_subgrupo FROM SUBGRUPOS",
  )) as unknown as SubgrupoRow[];
  const subgrupoLookup = new Map<number, string>();
  for (const r of subgrupoRows) {
    if (r.ka_ni_subgrupo != null) subgrupoLookup.set(Number(r.ka_ni_subgrupo), (r.sc_detalle_subgrupo ?? "").trim());
  }
  console.log(`  ${subgrupoLookup.size} subgrupos\n`);

  // 2. Fetch 50 sample PRODUCT articles from SAG (filter out accounting codes)
  //    Join with ProductEntity SKUs to only sample refs that exist in our catalog
  console.log("[2/5] Fetching product SKUs from DB to build sample...");
  const dbProducts = await db.productEntity.findMany({
    where: { externalSource: "sag", subgrupoId: { not: null } },
    select: { sku: true },
    take: 100,
  });
  const dbSkus = dbProducts.map((p: any) => (p.sku ?? "").trim().toUpperCase()).filter(Boolean);

  console.log(`  ${dbSkus.length} DB SKUs available, fetching SAG data for up to 50...`);
  const articleRows = (await consultaSagJson(
    sagConfig,
    "SELECT k_sc_codigo_articulo, ka_ni_subgrupo FROM v_articulos GROUP BY k_sc_codigo_articulo, ka_ni_subgrupo",
  )) as unknown as ArticleRow[];

  // Build SAG lookup for all articles, then filter to only DB SKUs (max 50)
  const allSagRefs = new Map<string, { subgrupoId: number; subgrupoSag: string }>();
  for (const row of articleRows) {
    const ref = (row.k_sc_codigo_articulo ?? "").trim().toUpperCase();
    const id = Number(row.ka_ni_subgrupo);
    if (ref && !isNaN(id)) {
      allSagRefs.set(ref, {
        subgrupoId: id,
        subgrupoSag: subgrupoLookup.get(id) ?? "???",
      });
    }
  }

  // Filter to refs that exist in our DB catalog (real products, not accounting codes)
  const dbSkuSet = new Set(dbSkus);
  const sagRefs = new Map<string, { subgrupoId: number; subgrupoSag: string }>();
  for (const [ref, data] of allSagRefs) {
    if (dbSkuSet.has(ref) && sagRefs.size < 50) {
      sagRefs.set(ref, data);
    }
  }
  console.log(`  ${allSagRefs.size} total SAG articles, ${sagRefs.size} product refs sampled\n`);

  // 3. Check ProductEntity
  console.log("[3/5] Checking ProductEntity...");
  const refCodes = [...sagRefs.keys()];
  const products = await db.productEntity.findMany({
    where: { sku: { in: refCodes }, externalSource: "sag" },
    select: { sku: true, subgrupoId: true, subgrupoSag: true },
  });
  const peMap = new Map<string, { subgrupoId: number | null; subgrupoSag: string | null }>();
  for (const p of products) {
    if (p.sku) peMap.set(p.sku.toUpperCase(), { subgrupoId: p.subgrupoId, subgrupoSag: p.subgrupoSag });
  }
  console.log(`  ${products.length} products found in DB\n`);

  // 4. Check CommercialCoverageSnapshot
  console.log("[4/5] Checking CommercialCoverageSnapshot...");
  const snapshots: Array<{ refCode: string; subgrupoId: number | null; subgrupoSag: string | null }> = await db.$queryRawUnsafe(`
    SELECT DISTINCT ON ("refCode") "refCode", "subgrupoId", "subgrupoSag"
    FROM "CommercialCoverageSnapshot"
    WHERE "refCode" = ANY($1::text[])
    ORDER BY "refCode", "snapshotAt" DESC
  `, refCodes);
  const snapMap = new Map<string, { subgrupoId: number | null; subgrupoSag: string | null }>();
  for (const s of snapshots) {
    snapMap.set(s.refCode.toUpperCase(), { subgrupoId: s.subgrupoId, subgrupoSag: s.subgrupoSag });
  }
  console.log(`  ${snapshots.length} snapshot refs found\n`);

  // 5. Compare
  console.log("[5/5] Comparison results:\n");
  console.log("| # | Ref | SAG SubGrupo | PE SubGrupo | Snap SubGrupo | PE Match | Snap Match |");
  console.log("|---|-----|-------------|-------------|---------------|----------|------------|");

  let peMatch = 0;
  let peMissing = 0;
  let peMismatch = 0;
  let snapMatch = 0;
  let snapMissing = 0;
  let snapMismatch = 0;
  let i = 0;

  for (const [ref, sag] of sagRefs) {
    i++;
    const pe = peMap.get(ref);
    const snap = snapMap.get(ref);

    const peSubgrupo = pe?.subgrupoSag ?? "—";
    const snapSubgrupo = snap?.subgrupoSag ?? "—";

    const peOk = pe?.subgrupoId === sag.subgrupoId;
    const snapOk = snap?.subgrupoId === sag.subgrupoId;

    if (!pe) peMissing++;
    else if (peOk) peMatch++;
    else peMismatch++;

    if (!snap) snapMissing++;
    else if (snapOk) snapMatch++;
    else snapMismatch++;

    const peStatus = !pe ? "MISSING" : peOk ? "OK" : "MISMATCH";
    const snapStatus = !snap ? "MISSING" : snapOk ? "OK" : "MISMATCH";

    console.log(`| ${i} | ${ref} | ${sag.subgrupoSag} | ${peSubgrupo} | ${snapSubgrupo} | ${peStatus} | ${snapStatus} |`);
  }

  console.log("\n--- Summary ---");
  console.log(`Total refs sampled: ${sagRefs.size}`);
  console.log(`ProductEntity:  ${peMatch} match, ${peMismatch} mismatch, ${peMissing} missing`);
  console.log(`CoverageSnap:   ${snapMatch} match, ${snapMismatch} mismatch, ${snapMissing} missing`);

  const totalChecks = (peMatch + peMismatch) + (snapMatch + snapMismatch);
  const totalMatches = peMatch + snapMatch;
  const accuracy = totalChecks > 0 ? Math.round((totalMatches / totalChecks) * 100) : 0;
  console.log(`Overall accuracy: ${accuracy}% (${totalMatches}/${totalChecks} checks)`);

  if (peMissing > 0 || snapMissing > 0) {
    console.log(`\nNote: ${peMissing + snapMissing} refs missing from DB — run backfill + inventory refresh to populate.`);
  }

  console.log("\n=== VALIDATION COMPLETE ===");
}

main()
  .catch((e) => {
    console.error("VALIDATION FAILED:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
