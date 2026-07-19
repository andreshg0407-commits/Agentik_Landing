/**
 * COMERCIAL-INVENTARIO-AGOTADOS-HISTORICO-02 — Phase 1 Audit
 *
 * Before any code change, validate:
 * 1. Total refs
 * 2. ACTIVE / OUT_OF_STOCK / NO_DATA counts
 * 3. Per canonical line: active vs out_of_stock
 * 4. ACTIVE + OUT_OF_STOCK + NO_DATA = total
 */

import { prisma } from "../lib/prisma";

const ORG_ID = "cmmpwstuf000dp5y58kj1daaj";

async function run() {
  console.log("=== AGOTADOS HISTORICO — PHASE 1 AUDIT ===\n");

  const db = prisma as any;

  // ── 1. Textile pipeline (CCS) ──────────────────────────────────────────
  const latest = await db.commercialCoverageSnapshot.findFirst({
    where: { organizationId: ORG_ID },
    orderBy: { snapshotAt: "desc" },
    select: { snapshotAt: true },
  });

  if (!latest) {
    console.log("ABORT: No CCS snapshot");
    process.exit(1);
  }

  const ccsRows = await db.commercialCoverageSnapshot.findMany({
    where: { organizationId: ORG_ID, snapshotAt: latest.snapshotAt },
    select: {
      refCode: true,
      line: true,
      disponible: true,
      pendingOrdersQty: true,
    },
  });

  // ── 2. Accessory pipeline ──────────────────────────────────────────────
  const accProducts = await db.productEntity.findMany({
    where: { organizationId: ORG_ID, productLine: "5" },
    select: { sku: true },
  });
  const accSkuSet = new Set(
    accProducts.filter((p: any) => p.sku).map((p: any) => p.sku),
  );

  // Dedup textile (remove any accesory that leaked into CCS)
  const dedupedTextile = ccsRows.filter((r: any) => !accSkuSet.has(r.refCode));

  // ── 3. Accessory availability (B26+B27) ────────────────────────────────
  interface AccRow { sku: string; available: number }
  const accAvail: AccRow[] = await db.$queryRawUnsafe(`
    SELECT pe."sku",
           SUM(GREATEST(pil."quantity", 0))::int AS available
    FROM "ProductInventoryLevel" pil
    JOIN "ProductEntity" pe ON pe."id" = pil."productId"
      AND pe."organizationId" = pil."organizationId"
    WHERE pe."organizationId" = $1
      AND pil."externalRef" IN ('26','27')
      AND pe."productLine" = '5'
    GROUP BY pe."sku"
  `, ORG_ID);
  const accAvailMap = new Map(accAvail.map(r => [r.sku, Number(r.available)]));

  // ── 4. Build unified counts ────────────────────────────────────────────
  const LINE_MAP: Record<string, string> = { CS: "CASTILLITOS", LT: "LATIN KIDS" };

  // Textile items
  type ItemInfo = { ref: string; canonicalLine: string; visibility: string; disponibleReal: number };
  const allItems: ItemInfo[] = [];

  for (const row of dedupedTextile) {
    const subLinea = LINE_MAP[row.line] ?? row.line;
    let canonicalLine: string;
    if (subLinea === "CASTILLITOS") canonicalLine = "CASTILLITOS";
    else if (subLinea === "LATIN KIDS") canonicalLine = "LATIN_KIDS";
    else canonicalLine = "SIN_CLASIFICAR";

    const disp = Number(row.disponible ?? 0);
    const visibility = disp > 0 ? "ACTIVE" : "OUT_OF_STOCK";

    allItems.push({
      ref: row.refCode,
      canonicalLine,
      visibility,
      disponibleReal: disp,
    });
  }

  // Accessory items
  for (const sku of accSkuSet) {
    const rawAvail = accAvailMap.get(sku);
    const hasData = rawAvail !== undefined;
    const available = rawAvail ?? 0;
    const visibility = !hasData ? "NO_DATA" : available > 0 ? "ACTIVE" : "OUT_OF_STOCK";

    allItems.push({
      ref: sku,
      canonicalLine: "IMPORTACION",
      visibility,
      disponibleReal: available,
    });
  }

  // ── 5. Count ───────────────────────────────────────────────────────────
  const total = allItems.length;
  const active = allItems.filter(i => i.visibility === "ACTIVE").length;
  const outOfStock = allItems.filter(i => i.visibility === "OUT_OF_STOCK").length;
  const noData = allItems.filter(i => i.visibility === "NO_DATA").length;

  console.log(`Total referencias:      ${total}`);
  console.log(`  ACTIVE:               ${active}`);
  console.log(`  OUT_OF_STOCK:         ${outOfStock}`);
  console.log(`  NO_DATA:              ${noData}`);
  console.log(`  Sum:                  ${active + outOfStock + noData}`);
  console.log(`  Match:                ${active + outOfStock + noData === total ? "YES" : "FAIL"}\n`);

  // ── 6. Per canonical line ──────────────────────────────────────────────
  const lines = ["CASTILLITOS", "LATIN_KIDS", "IMPORTACION", "SIN_CLASIFICAR"];
  console.log("--- PER CANONICAL LINE ---");
  for (const cl of lines) {
    const lineItems = allItems.filter(i => i.canonicalLine === cl);
    const lineActive = lineItems.filter(i => i.visibility === "ACTIVE").length;
    const lineOOS = lineItems.filter(i => i.visibility === "OUT_OF_STOCK").length;
    const lineND = lineItems.filter(i => i.visibility === "NO_DATA").length;
    console.log(`  ${cl}: ${lineItems.length} total | ${lineActive} active | ${lineOOS} agotadas | ${lineND} no_data`);
  }

  // ── 7. Integrity check ────────────────────────────────────────────────
  console.log("\n--- INTEGRITY ---");
  const refSet = new Set(allItems.map(i => i.ref));
  console.log(`  Unique refs:          ${refSet.size}`);
  console.log(`  Total items:          ${total}`);
  console.log(`  Duplicates:           ${total - refSet.size}`);

  const totalDisp = allItems.reduce((s, i) => s + Math.max(i.disponibleReal, 0), 0);
  console.log(`  Total disponible:     ${totalDisp}`);

  console.log("\n=== AUDIT COMPLETE ===");
  process.exit(0);
}

run();
