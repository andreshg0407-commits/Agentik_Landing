/**
 * _bodega-flow-forensics.ts
 * INVENTORY-BODEGA-FLOW-FORENSICS-01 — Deep bodega analysis.
 * READ ONLY.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const ORG = "cmmpwstuf000dp5y58kj1daaj";
const REFS = ["L-1367", "L-8467", "CJ-1126012", "CJ-2026004B", "C7-J-004", "C8-K004"];
const ADMIN: Record<string, number> = {
  "L-1367": 64, "L-8467": 511, "CJ-1126012": 79,
  "CJ-2026004B": 164, "C7-J-004": 350, "C8-K004": 1230,
};

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);
  const db = prisma as any;

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 2: Bodega 01, 04, 24 per ref
  // ══════════════════════════════════════════════════════════════════════════
  console.log("=".repeat(80));
  console.log("FASE 2: BODEGA RECONSTRUCTION PER REFERENCE");
  console.log("=".repeat(80));

  for (const ref of REFS) {
    const pe = await db.productEntity.findFirst({
      where: { organizationId: ORG, sku: ref },
      select: { id: true, name: true, productLine: true },
    });
    if (!pe) { console.log(`\n${ref}: NO ProductEntity`); continue; }

    console.log(`\n${ref} (line=${pe.productLine}): "${pe.name}"`);

    for (const extRef of ["01", "04", "24"]) {
      const levels = await db.productInventoryLevel.findMany({
        where: { productId: pe.id, externalRef: extRef },
        select: { quantity: true, reservedQty: true, syncedAt: true },
      });
      const sum = levels.reduce((s: number, l: any) => s + l.quantity, 0);
      const reserved = levels.reduce((s: number, l: any) => s + l.reservedQty, 0);
      const synced = levels[0]?.syncedAt?.toISOString()?.slice(0, 10) ?? "—";
      console.log(`  Bodega ${extRef}: qty=${sum} reserved=${reserved} variants=${levels.length} synced=${synced}`);
    }

    // Also show ALL bodegas for completeness
    const all = await db.productInventoryLevel.findMany({
      where: { productId: pe.id },
      select: { quantity: true, externalRef: true },
    });
    const byBod = new Map<string, number>();
    for (const l of all) {
      byBod.set(l.externalRef || "?", (byBod.get(l.externalRef || "?") || 0) + l.quantity);
    }
    const sorted = [...byBod.entries()].sort((a, b) => b[1] - a[1]);
    console.log(`  ALL bodegas: ${sorted.map(([b, q]) => `B${b}=${q}`).join(", ")}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 3: Global negative analysis for Bodega 01
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n" + "=".repeat(80));
  console.log("FASE 3: BODEGA 01 NEGATIVE ANALYSIS (GLOBAL)");
  console.log("=".repeat(80));

  // Aggregate by product for B01
  const b01Stats: Array<{ productId: string; total: number }> = await db.$queryRawUnsafe(
    `SELECT "productId", SUM("quantity")::float as total
     FROM "ProductInventoryLevel"
     WHERE "organizationId" = $1 AND "externalRef" = '01'
     GROUP BY "productId"`,
    ORG,
  );

  const b01Negative = b01Stats.filter(r => r.total < 0);
  const b01Zero = b01Stats.filter(r => r.total === 0);
  const b01Positive = b01Stats.filter(r => r.total > 0);
  const b01NegSum = b01Negative.reduce((s, r) => s + r.total, 0);
  const b01PosSum = b01Positive.reduce((s, r) => s + r.total, 0);

  console.log(`\nBodega 01 products: ${b01Stats.length}`);
  console.log(`  Negative: ${b01Negative.length} (${Math.round(b01Negative.length / b01Stats.length * 100)}%) — total: ${Math.round(b01NegSum).toLocaleString()}`);
  console.log(`  Zero: ${b01Zero.length} (${Math.round(b01Zero.length / b01Stats.length * 100)}%)`);
  console.log(`  Positive: ${b01Positive.length} (${Math.round(b01Positive.length / b01Stats.length * 100)}%) — total: ${Math.round(b01PosSum).toLocaleString()}`);
  console.log(`  Net B01: ${Math.round(b01NegSum + b01PosSum).toLocaleString()}`);

  // Same for B04
  const b04Stats: Array<{ productId: string; total: number }> = await db.$queryRawUnsafe(
    `SELECT "productId", SUM("quantity")::float as total
     FROM "ProductInventoryLevel"
     WHERE "organizationId" = $1 AND "externalRef" = '04'
     GROUP BY "productId"`,
    ORG,
  );

  const b04Negative = b04Stats.filter(r => r.total < 0);
  const b04Positive = b04Stats.filter(r => r.total > 0);
  const b04NegSum = b04Negative.reduce((s, r) => s + r.total, 0);
  const b04PosSum = b04Positive.reduce((s, r) => s + r.total, 0);

  console.log(`\nBodega 04 products: ${b04Stats.length}`);
  console.log(`  Negative: ${b04Negative.length} (${Math.round(b04Negative.length / b04Stats.length * 100)}%)`);
  console.log(`  Positive: ${b04Positive.length} (${Math.round(b04Positive.length / b04Stats.length * 100)}%) — total: ${Math.round(b04PosSum).toLocaleString()}`);
  console.log(`  Net B04: ${Math.round(b04NegSum + b04PosSum).toLocaleString()}`);

  // Same for B24
  const b24Stats: Array<{ productId: string; total: number }> = await db.$queryRawUnsafe(
    `SELECT "productId", SUM("quantity")::float as total
     FROM "ProductInventoryLevel"
     WHERE "organizationId" = $1 AND "externalRef" = '24'
     GROUP BY "productId"`,
    ORG,
  );

  const b24Negative = b24Stats.filter(r => r.total < 0);
  const b24Positive = b24Stats.filter(r => r.total > 0);
  const b24NegSum = b24Negative.reduce((s, r) => s + r.total, 0);
  const b24PosSum = b24Positive.reduce((s, r) => s + r.total, 0);

  console.log(`\nBodega 24 products: ${b24Stats.length}`);
  console.log(`  Negative: ${b24Negative.length} (${Math.round(b24Negative.length / b24Stats.length * 100)}%)`);
  console.log(`  Positive: ${b24Positive.length} (${Math.round(b24Positive.length / b24Stats.length * 100)}%) — total: ${Math.round(b24PosSum).toLocaleString()}`);
  console.log(`  Net B24: ${Math.round(b24NegSum + b24PosSum).toLocaleString()}`);

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 3B: Cross-reference B01 negatives with B04 positives
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n" + "=".repeat(80));
  console.log("FASE 3B: B01 NEGATIVE ↔ B04 POSITIVE CORRELATION");
  console.log("=".repeat(80));

  const b01Map = new Map(b01Stats.map(r => [r.productId, r.total]));
  const b04Map = new Map(b04Stats.map(r => [r.productId, r.total]));

  let bothExist = 0;
  let b01NegB04Pos = 0;
  let b01NegB04PosCompensated = 0;
  let compensationSum = 0;
  let deficitSum = 0;

  for (const [pid, b01val] of b01Map) {
    if (b01val >= 0) continue; // only negatives
    const b04val = b04Map.get(pid);
    if (b04val !== undefined) {
      bothExist++;
      if (b04val > 0) {
        b01NegB04Pos++;
        const combined = b01val + b04val;
        compensationSum += b04val;
        if (combined >= 0) {
          b01NegB04PosCompensated++;
        } else {
          deficitSum += combined;
        }
      }
    }
  }

  console.log(`B01 negative products: ${b01Negative.length}`);
  console.log(`  Also have B04 data: ${bothExist}`);
  console.log(`  B04 is positive (compensation available): ${b01NegB04Pos}`);
  console.log(`  B01+B04 >= 0 (fully compensated): ${b01NegB04PosCompensated}`);
  console.log(`  B01+B04 < 0 (still deficit): ${b01NegB04Pos - b01NegB04PosCompensated}`);
  console.log(`  Compensation capacity: ${Math.round(compensationSum).toLocaleString()} units`);

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 4: Transfer evidence — InventoryTransfer
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n" + "=".repeat(80));
  console.log("FASE 4: TRANSFER EVIDENCE");
  console.log("=".repeat(80));

  try {
    const transfers = await db.inventoryTransfer.findMany({
      where: { organizationId: ORG },
      take: 5,
      orderBy: { documentDate: "desc" },
      select: { id: true, documentNumber: true, sourceWarehouse: true, destinationWarehouse: true, documentDate: true, status: true },
    });
    console.log(`InventoryTransfer records: ${transfers.length}`);
    for (const t of transfers) {
      console.log(`  ${t.documentNumber}: ${t.sourceWarehouse} → ${t.destinationWarehouse} date=${t.documentDate?.toISOString()?.slice(0, 10)} status=${t.status}`);
    }
    const totalTransfers = await db.inventoryTransfer.count({ where: { organizationId: ORG } });
    console.log(`Total InventoryTransfer: ${totalTransfers}`);
  } catch {
    console.log("InventoryTransfer: TABLE NOT ACCESSIBLE / EMPTY");
  }

  // Check ProductionEvent for ET (transfers from production)
  try {
    const etCount = await db.productionEvent.count({
      where: { organizationId: ORG, sourceDocumentType: "ET" },
    });
    console.log(`\nProductionEvent (ET — entradas/transferencias): ${etCount}`);

    // Sample ETs for audit refs
    for (const ref of ["L-1367", "L-8467"]) {
      const ets = await db.productionEvent.findMany({
        where: {
          organizationId: ORG,
          sourceDocumentType: "ET",
          productionOrderRef: { contains: ref.replace("L-", "") },
        },
        take: 3,
        orderBy: { eventDate: "desc" },
        select: { documentNumber: true, productionOrderRef: true, eventDate: true, warehouseFrom: true, warehouseTo: true },
      });
      if (ets.length > 0) {
        console.log(`  ${ref} ET events:`);
        for (const e of ets) {
          console.log(`    doc=${e.documentNumber} ref=${e.productionOrderRef} date=${e.eventDate?.toISOString()?.slice(0, 10)} from=${e.warehouseFrom} to=${e.warehouseTo}`);
        }
      }
    }
  } catch {
    console.log("ProductionEvent: not accessible");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 5: Test B01+B04 model against admin values
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n" + "=".repeat(80));
  console.log("FASE 5: MODEL COMPARISON — Admin vs B01 vs B04 vs B01+B04");
  console.log("=".repeat(80));

  console.log(`\n${"Ref".padEnd(16)} | ${"Admin".padStart(6)} | ${"B01".padStart(7)} | ${"B04".padStart(7)} | ${"B24".padStart(7)} | ${"B01+B04".padStart(8)} | ${"B01+B04+B24".padStart(12)} | ${"All".padStart(7)} | BestFit`);
  console.log("-".repeat(100));

  for (const ref of REFS) {
    const pe = await db.productEntity.findFirst({
      where: { organizationId: ORG, sku: ref },
      select: { id: true },
    });
    if (!pe) {
      console.log(`${ref.padEnd(16)} | ${"—".padStart(6)} | — no ProductEntity —`);
      continue;
    }

    const levels = await db.productInventoryLevel.findMany({
      where: { productId: pe.id },
      select: { quantity: true, externalRef: true },
    });

    const byBod = new Map<string, number>();
    for (const l of levels) {
      byBod.set(l.externalRef || "?", (byBod.get(l.externalRef || "?") || 0) + l.quantity);
    }

    const admin = ADMIN[ref];
    const b01 = byBod.get("01") || 0;
    const b04 = byBod.get("04") || 0;
    const b24 = byBod.get("24") || 0;
    const b0104 = b01 + b04;
    const b010424 = b01 + b04 + b24;
    const allSum = [...byBod.values()].reduce((s, v) => s + v, 0);

    // Find best fit
    const models = [
      { name: "B01", val: b01 },
      { name: "B04", val: b04 },
      { name: "B24", val: b24 },
      { name: "B01+B04", val: b0104 },
      { name: "B01+B04+B24", val: b010424 },
      { name: "All", val: allSum },
    ];
    const best = models.reduce((a, b) =>
      Math.abs(a.val - admin) <= Math.abs(b.val - admin) ? a : b
    );
    const bestDiff = Math.abs(best.val - admin);
    const bestPct = admin > 0 ? Math.round(bestDiff / admin * 100) : 0;

    console.log(
      `${ref.padEnd(16)} | ${String(admin).padStart(6)} | ${String(b01).padStart(7)} | ${String(b04).padStart(7)} | ${String(b24).padStart(7)} | ${String(b0104).padStart(8)} | ${String(b010424).padStart(12)} | ${String(allSum).padStart(7)} | ${best.name} (${bestPct}%)`
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 6: IMPORTACION bodegas
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n" + "=".repeat(80));
  console.log("FASE 6: IMPORTACION (line 5) — BODEGA ANALYSIS");
  console.log("=".repeat(80));

  // Get all products with productLine=5
  const impProducts = await db.productEntity.findMany({
    where: { organizationId: ORG, productLine: "5" },
    select: { id: true, sku: true, name: true },
    take: 1000,
  });
  console.log(`IMPORTACION products (productLine=5): ${impProducts.length}`);

  // Aggregate by bodega for all importacion products
  const impIds = impProducts.map((p: any) => p.id);
  if (impIds.length > 0) {
    const impLevels: Array<{ externalRef: string; total: number; cnt: number }> = await db.$queryRawUnsafe(
      `SELECT "externalRef", SUM("quantity")::float as total, COUNT(*)::int as cnt
       FROM "ProductInventoryLevel"
       WHERE "productId" = ANY($1::text[])
       GROUP BY "externalRef"
       ORDER BY total DESC`,
      impIds,
    );
    console.log(`\nIMPORTACION inventory by bodega:`);
    for (const l of impLevels) {
      console.log(`  Bodega ${l.externalRef || "?"}: qty=${Math.round(l.total)} (${l.cnt} rows)`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 9: GLOBAL PATTERN — does B01+B04 work for ALL products?
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n" + "=".repeat(80));
  console.log("FASE 9: GLOBAL PATTERN — B01+B04 COMBINED");
  console.log("=".repeat(80));

  // For textil (LT+CS), what does B01+B04 look like?
  const textilProducts = await db.productEntity.findMany({
    where: { organizationId: ORG, productLine: { in: ["1", "2"] } },
    select: { id: true },
    take: 10000,
  });
  const textilIds = textilProducts.map((p: any) => p.id);

  if (textilIds.length > 0) {
    const textilB01: Array<{ productId: string; total: number }> = await db.$queryRawUnsafe(
      `SELECT "productId", SUM("quantity")::float as total
       FROM "ProductInventoryLevel"
       WHERE "productId" = ANY($1::text[]) AND "externalRef" = '01'
       GROUP BY "productId"`,
      textilIds,
    );
    const textilB04: Array<{ productId: string; total: number }> = await db.$queryRawUnsafe(
      `SELECT "productId", SUM("quantity")::float as total
       FROM "ProductInventoryLevel"
       WHERE "productId" = ANY($1::text[]) AND "externalRef" = '04'
       GROUP BY "productId"`,
      textilIds,
    );

    const t01Map = new Map(textilB01.map(r => [r.productId, r.total]));
    const t04Map = new Map(textilB04.map(r => [r.productId, r.total]));

    let textilNeg = 0, textilZero = 0, textilPos = 0;
    let combNeg = 0, combZero = 0, combPos = 0;

    const allIds = new Set([...t01Map.keys(), ...t04Map.keys()]);
    for (const pid of allIds) {
      const v01 = t01Map.get(pid) ?? 0;
      const v04 = t04Map.get(pid) ?? 0;
      if (v01 < 0) textilNeg++;
      else if (v01 === 0) textilZero++;
      else textilPos++;

      const comb = v01 + v04;
      if (comb < 0) combNeg++;
      else if (comb === 0) combZero++;
      else combPos++;
    }

    console.log(`\nTextil products (line 1+2): ${textilIds.length} total, ${allIds.size} with inventory`);
    console.log(`\nB01 only:`);
    console.log(`  Negative: ${textilNeg} (${Math.round(textilNeg / allIds.size * 100)}%)`);
    console.log(`  Zero: ${textilZero} (${Math.round(textilZero / allIds.size * 100)}%)`);
    console.log(`  Positive: ${textilPos} (${Math.round(textilPos / allIds.size * 100)}%)`);

    console.log(`\nB01 + B04 combined:`);
    console.log(`  Negative: ${combNeg} (${Math.round(combNeg / allIds.size * 100)}%)`);
    console.log(`  Zero: ${combZero} (${Math.round(combZero / allIds.size * 100)}%)`);
    console.log(`  Positive: ${combPos} (${Math.round(combPos / allIds.size * 100)}%)`);
    console.log(`  Improvement: ${textilNeg - combNeg} fewer negatives (${Math.round((textilNeg - combNeg) / textilNeg * 100)}% reduction)`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 9B: CommercialCoverageSnapshot vs B01+B04 for top refs
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n" + "=".repeat(80));
  console.log("FASE 9B: CCS disponible vs B01+B04 — SAMPLE (20 random refs)");
  console.log("=".repeat(80));

  const latestSnap = await db.commercialCoverageSnapshot.findFirst({
    where: { organizationId: ORG },
    orderBy: { snapshotAt: "desc" },
    select: { snapshotAt: true },
  });

  if (latestSnap) {
    const sampleCcs = await db.commercialCoverageSnapshot.findMany({
      where: { organizationId: ORG, snapshotAt: latestSnap.snapshotAt, disponible: { gt: 0 } },
      select: { refCode: true, disponible: true, pendingOrdersQty: true },
      take: 20,
    });

    console.log(`\n${"Ref".padEnd(16)} | ${"CCS".padStart(6)} | ${"B01".padStart(7)} | ${"B04".padStart(7)} | ${"B01+B04".padStart(8)} | Match?`);
    console.log("-".repeat(65));

    for (const ccs of sampleCcs) {
      const pe = await db.productEntity.findFirst({
        where: { organizationId: ORG, sku: ccs.refCode },
        select: { id: true },
      });
      if (!pe) continue;

      const levs = await db.productInventoryLevel.findMany({
        where: { productId: pe.id, externalRef: { in: ["01", "04"] } },
        select: { quantity: true, externalRef: true },
      });
      let b01v = 0, b04v = 0;
      for (const l of levs) {
        if (l.externalRef === "01") b01v += l.quantity;
        else if (l.externalRef === "04") b04v += l.quantity;
      }

      const combined = b01v + b04v;
      const ccsDisp = ccs.disponible;
      const match = Math.abs(combined - ccsDisp) < ccsDisp * 0.1 ? "~MATCH" :
                    Math.abs(b01v - ccsDisp) < 5 ? "=B01" :
                    Math.abs(b04v - ccsDisp) < ccsDisp * 0.1 ? "=B04" : "DIFF";

      console.log(`${ccs.refCode.padEnd(16)} | ${String(ccsDisp).padStart(6)} | ${String(b01v).padStart(7)} | ${String(b04v).padStart(7)} | ${String(combined).padStart(8)} | ${match}`);
    }
  }

  await prisma.$disconnect();
  pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
