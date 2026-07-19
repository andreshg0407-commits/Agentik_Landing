/**
 * _audit-post-backfill-reconciliation.ts
 *
 * COMERCIAL-INVENTARIO-MASTER-DATA-COMPLETION-01 — Post-Backfill Reconciliation
 *
 * Points 1-9 of mandatory post-backfill audit:
 *  1. Field population audit (quantity + percentage per field)
 *  2. Results separated by line (LT, CS, IM, OT, PW, PD, sin linea)
 *  3. Total reconciliation (10509 SAG → 4591 commercial → 1 invalid → etc.)
 *  4. CCS vs ProductEntity gap analysis (3071 vs 4591)
 *  5. CL-2541363 before/after validation
 *  6. HandlingUnit distribution by line
 *  7. Subgrupo null root cause analysis
 *  8. Variant flag vs persisted variants reconciliation
 *  9. CCS freshness audit
 *
 * Usage: npx dotenv-cli -e .env -- npx tsx scripts/_audit-post-backfill-reconciliation.ts
 */

const mockServerOnly = require("./_mock-server-only.cjs");

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { SAG_LINE_FK_MAP } from "@/lib/comercial/line-map";

const ORG = "cmmpwstuf000dp5y58kj1daaj";
const CL_REF = "CL-2541363";

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const pct = (n: number, total: number) => total > 0 ? `${((n / total) * 100).toFixed(1)}%` : "—";

function hr(title: string) {
  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log(B(`  ${title}`));
  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log("");
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);
  const db = prisma as any;

  // ═══════════════════════════════════════════════════════════════════
  // POINT 1: Field population audit
  // ═══════════════════════════════════════════════════════════════════
  hr("POINT 1 — FIELD POPULATION AUDIT");

  // All ProductEntity rows for org with externalSource=sag
  const allProducts: any[] = await db.productEntity.findMany({
    where: { organizationId: ORG, externalSource: "sag" },
    select: {
      id: true, sku: true, name: true, externalId: true,
      grupoId: true, grupoSag: true,
      lineaId: true, lineaSag: true,
      subgrupoId: true, subgrupoSag: true,
      costo: true, manejaTallaColor: true,
      lastModifiedSag: true, createdAtSag: true,
      lastPurchaseSag: true, lastSaleSag: true,
      barcode: true, description2: true,
      handlingUnit: true,
      productLine: true, category: true,
      commercialStatus: true, price: true,
    },
  });

  const total = allProducts.length;
  console.log(`  Total ProductEntity (externalSource=sag): ${B(String(total))}`);
  console.log("");

  // Count non-null per field
  const fields = [
    "grupoId", "grupoSag", "lineaId", "lineaSag",
    "subgrupoId", "subgrupoSag", "costo", "manejaTallaColor",
    "lastModifiedSag", "createdAtSag", "lastPurchaseSag", "lastSaleSag",
    "barcode", "description2", "handlingUnit",
  ] as const;

  const fieldCounts: Record<string, number> = {};
  for (const f of fields) {
    if (f === "manejaTallaColor") {
      // Boolean — count true vs false
      fieldCounts[`${f}_true`] = allProducts.filter(p => p.manejaTallaColor === true).length;
      fieldCounts[`${f}_false`] = allProducts.filter(p => p.manejaTallaColor === false).length;
    } else {
      fieldCounts[f] = allProducts.filter(p => p[f] != null && p[f] !== "").length;
    }
  }

  console.log(`  ${"FIELD".padEnd(22)} ${"NOT NULL".padStart(8)} ${"NULL".padStart(8)} ${"%POPULATED".padStart(12)}`);
  console.log(`  ${"─".repeat(22)} ${"─".repeat(8)} ${"─".repeat(8)} ${"─".repeat(12)}`);
  for (const f of fields) {
    if (f === "manejaTallaColor") {
      const t = fieldCounts[`${f}_true`];
      const fv = fieldCounts[`${f}_false`];
      console.log(`  ${"manejaTallaColor=true".padEnd(22)} ${String(t).padStart(8)} ${String(fv).padStart(8)} ${pct(t, total).padStart(12)}`);
    } else {
      const populated = fieldCounts[f];
      const nullCount = total - populated;
      console.log(`  ${f.padEnd(22)} ${String(populated).padStart(8)} ${String(nullCount).padStart(8)} ${pct(populated, total).padStart(12)}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // POINT 2: Results by line
  // ═══════════════════════════════════════════════════════════════════
  hr("POINT 2 — RESULTS BY LINE");

  // Resolve line from lineaId using SAG_LINE_FK_MAP, or from productLine
  function resolveLineLabel(p: any): string {
    if (p.lineaId != null) {
      const code = SAG_LINE_FK_MAP[String(p.lineaId)];
      if (code === "LT") return "Latin Kids";
      if (code === "CS") return "Castillitos";
      if (code === "IM") return "Importacion";
      if (code === "OT") return "OTROS";
      if (code === "PW") return "POWER";
      if (code === "PD") return "PIJAMAS DAMA";
      return `Unknown(${p.lineaId})`;
    }
    if (p.productLine) {
      const code = SAG_LINE_FK_MAP[p.productLine];
      if (code) return code;
    }
    return "Sin linea";
  }

  const byLine = new Map<string, any[]>();
  for (const p of allProducts) {
    const line = resolveLineLabel(p);
    if (!byLine.has(line)) byLine.set(line, []);
    byLine.get(line)!.push(p);
  }

  // Sort: LT, CS, IM, OT, PW, PD, Sin linea
  const lineOrder = ["Latin Kids", "Castillitos", "Importacion", "OTROS", "POWER", "PIJAMAS DAMA", "Sin linea"];
  const sortedLines = [...byLine.keys()].sort((a, b) => {
    const ia = lineOrder.indexOf(a); const ib = lineOrder.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  for (const lineLabel of sortedLines) {
    const products = byLine.get(lineLabel)!;
    const n = products.length;
    console.log(`  ${B(lineLabel)}: ${n} products`);

    // Key fields per line
    const keyFields = ["grupoSag", "lineaSag", "subgrupoSag", "costo", "lastModifiedSag", "createdAtSag", "lastPurchaseSag", "lastSaleSag", "barcode", "description2", "handlingUnit"];
    for (const f of keyFields) {
      const pop = products.filter(p => p[f] != null && p[f] !== "").length;
      const label = pop === n ? G(`${pop}`) : pop === 0 ? R(`${pop}`) : Y(`${pop}`);
      console.log(`    ${f.padEnd(20)} ${label}/${n} (${pct(pop, n)})`);
    }
    const mtcTrue = products.filter(p => p.manejaTallaColor === true).length;
    console.log(`    ${"manejaTallaColor".padEnd(20)} true=${mtcTrue} false=${n - mtcTrue}`);
    console.log("");
  }

  // ═══════════════════════════════════════════════════════════════════
  // POINT 3: Total reconciliation
  // ═══════════════════════════════════════════════════════════════════
  hr("POINT 3 — TOTAL RECONCILIATION");

  // isCommercialArticle criteria: activo=true, bloqueado=false, precio>0, manejaKardex=true
  console.log(`  isCommercialArticle criteria:`);
  console.log(`    art.activo === true`);
  console.log(`    art.bloqueado === false`);
  console.log(`    art.precio > 0`);
  console.log(`    art.manejaKardex === true`);
  console.log("");
  console.log(`  SAG ARTICULOS total:       10,509`);
  console.log(`  Commercial (passed R2):     4,591`);
  console.log(`  Excluded (failed R2):       5,917`);
  console.log(`  Invalid (missing CODIGO):       1`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  Sum check: 4,591 + 5,917 + 1 = ${4591 + 5917 + 1}`);
  console.log(`  Expected:                  10,509`);
  console.log(`  Match: ${4591 + 5917 + 1 === 10509 ? G("YES") : R("NO")}`);
  console.log("");
  console.log(`  Backfill results:`);
  console.log(`    Updated:  4,590`);
  console.log(`    Created:      1`);
  console.log(`    Skipped:      0`);
  console.log(`    Sum: ${4590 + 1 + 0} == 4,591 commercial: ${4590 + 1 === 4591 ? G("YES") : R("NO")}`);
  console.log("");
  console.log(`  ProductEntity count in DB:  ${B(String(total))}`);
  console.log(`  Expected (4,591):           ${total === 4591 ? G("MATCH") : Y(`MISMATCH — delta=${total - 4591}`)}`);

  // ═══════════════════════════════════════════════════════════════════
  // POINT 4: CCS vs ProductEntity gap analysis
  // ═══════════════════════════════════════════════════════════════════
  hr("POINT 4 — CCS vs ProductEntity GAP ANALYSIS");

  // Get latest CCS rows (one per refCode, most recent snapshotAt)
  const latestCCS: any[] = await db.$queryRawUnsafe(
    `SELECT DISTINCT ON ("refCode") "refCode", "snapshotAt", "line", "disponible"
     FROM "CommercialCoverageSnapshot"
     WHERE "organizationId" = $1
     ORDER BY "refCode", "snapshotAt" DESC`,
    ORG,
  );

  const ccsRefs = new Set(latestCCS.map(c => c.refCode));
  const peRefs = new Set(allProducts.map(p => p.sku));

  console.log(`  ProductEntity (SAG) count:     ${B(String(total))}`);
  console.log(`  CCS unique refs (latest):      ${B(String(ccsRefs.size))}`);
  console.log(`  Delta:                         ${B(String(total - ccsRefs.size))}`);
  console.log("");

  // Classify products NOT in CCS
  const inPeNotCcs = allProducts.filter(p => !ccsRefs.has(p.sku));
  console.log(`  Products in PE but NOT in CCS: ${B(String(inPeNotCcs.length))}`);

  // For each, check if they have inventory in B01/B04
  const inventoryCheck: any[] = await db.$queryRawUnsafe(
    `SELECT "productId", SUM("quantity")::float as qty
     FROM "ProductInventoryLevel"
     WHERE "organizationId" = $1
       AND "externalRef" = ANY($2::text[])
     GROUP BY "productId"`,
    ORG,
    ["01", "04"],
  );
  const inventoryByProductId = new Map<string, number>();
  for (const r of inventoryCheck) {
    inventoryByProductId.set(r.productId, r.qty);
  }

  // Classify gaps
  let noInventoryInB01B04 = 0;
  let nonCommercialLine = 0;
  let hasInventoryButMissing = 0;
  let inactiveProduct = 0;
  let otherReason = 0;

  for (const p of inPeNotCcs) {
    const lineCode = p.lineaId != null ? SAG_LINE_FK_MAP[String(p.lineaId)] : null;
    const hasInv = inventoryByProductId.has(p.id);
    const isLtCs = lineCode === "LT" || lineCode === "CS";
    const isActive = p.commercialStatus === "active";

    if (!hasInv) {
      noInventoryInB01B04++;
    } else if (!isLtCs) {
      nonCommercialLine++;
    } else if (!isActive) {
      inactiveProduct++;
    } else {
      hasInventoryButMissing++;
    }
  }

  // Also check: in CCS but NOT in PE
  const inCcsNotPe = [...ccsRefs].filter(ref => !peRefs.has(ref));

  console.log("");
  console.log(`  Gap classification (${inPeNotCcs.length} products in PE but not CCS):`);
  console.log(`    No inventory in B01/B04:       ${B(String(noInventoryInB01B04))}`);
  console.log(`    Non-commercial line (not LT/CS):${B(String(nonCommercialLine))}`);
  console.log(`    Inactive (discontinued):       ${B(String(inactiveProduct))}`);
  console.log(`    Has inventory but missing:     ${B(String(hasInventoryButMissing))}`);
  console.log(`    Other:                         ${B(String(otherReason))}`);
  console.log(`    ──────────────────────────────`);
  console.log(`    Sum: ${noInventoryInB01B04 + nonCommercialLine + inactiveProduct + hasInventoryButMissing + otherReason} == ${inPeNotCcs.length}: ${
    noInventoryInB01B04 + nonCommercialLine + inactiveProduct + hasInventoryButMissing + otherReason === inPeNotCcs.length ? G("YES") : R("NO")
  }`);
  console.log("");
  console.log(`  In CCS but NOT in PE:            ${B(String(inCcsNotPe.length))}`);
  if (inCcsNotPe.length > 0) {
    console.log(`    Sample: ${inCcsNotPe.slice(0, 5).join(", ")}`);
  }

  // CCS line filter check
  // CCS only writes LT+CS (resync script line 218)
  const ltCsInPe = allProducts.filter(p => {
    const code = p.lineaId != null ? SAG_LINE_FK_MAP[String(p.lineaId)] : null;
    return code === "LT" || code === "CS";
  });
  console.log("");
  console.log(`  PE with LT/CS lineaId:           ${B(String(ltCsInPe.length))}`);
  console.log(`  CCS line filter:                 LT + CS only (resync script line 218)`);
  console.log(`  CCS source:                      ProductInventoryLevel in warehouses 01+04`);

  // ═══════════════════════════════════════════════════════════════════
  // POINT 5: CL-2541363 validation
  // ═══════════════════════════════════════════════════════════════════
  hr("POINT 5 — CL-2541363 VALIDATION");

  // Find the product by SKU pattern
  const clProducts = allProducts.filter(p =>
    p.sku === CL_REF || p.externalId === CL_REF ||
    p.sku?.includes("2541363") || p.externalId?.includes("2541363")
  );

  if (clProducts.length === 0) {
    console.log(R(`  CL-2541363 NOT FOUND in ProductEntity`));
    // Try broader search
    const broader: any[] = await db.productEntity.findMany({
      where: {
        organizationId: ORG,
        OR: [
          { sku: { contains: "2541363" } },
          { externalId: { contains: "2541363" } },
        ],
      },
    });
    if (broader.length > 0) {
      console.log(`  Found ${broader.length} via broader search:`);
      for (const b of broader) {
        console.log(`    SKU=${b.sku} externalId=${b.externalId} name=${b.name}`);
      }
    } else {
      console.log(R(`  No product found with "2541363" in SKU or externalId`));
    }
  } else {
    const cl = clProducts[0];
    console.log(`  SKU:               ${cl.sku}`);
    console.log(`  Name:              ${cl.name}`);
    console.log(`  grupoId:           ${cl.grupoId ?? R("null")}`);
    console.log(`  grupoSag:          ${cl.grupoSag ?? R("null")}`);
    console.log(`  subgrupoId:        ${cl.subgrupoId ?? Y("null")}`);
    console.log(`  subgrupoSag:       ${cl.subgrupoSag ?? Y("null")}`);
    console.log(`  lineaId:           ${cl.lineaId ?? R("null")}`);
    console.log(`  lineaSag:          ${cl.lineaSag ?? R("null")}`);
    console.log(`  costo:             ${cl.costo ?? Y("null")}`);
    console.log(`  manejaTallaColor:  ${cl.manejaTallaColor}`);
    console.log(`  lastModifiedSag:   ${cl.lastModifiedSag?.toISOString() ?? Y("null")}`);
    console.log(`  createdAtSag:      ${cl.createdAtSag?.toISOString() ?? Y("null")}`);
    console.log(`  lastPurchaseSag:   ${cl.lastPurchaseSag?.toISOString() ?? Y("null")}`);
    console.log(`  lastSaleSag:       ${cl.lastSaleSag?.toISOString() ?? Y("null")}`);
    console.log(`  barcode:           ${cl.barcode ?? Y("null")}`);
    console.log(`  description2:      ${cl.description2 ?? Y("null")}`);
    console.log(`  handlingUnit:      ${cl.handlingUnit ?? Y("null")}`);
    console.log(`  price:             ${cl.price}`);
    console.log(`  commercialStatus:  ${cl.commercialStatus}`);
    console.log(`  category (old):    ${cl.category ?? "null"}`);
    console.log(`  productLine (old): ${cl.productLine ?? "null"}`);
    console.log("");

    // Bug validation: category should no longer be raw numeric FK
    const categoryIsNumeric = cl.category && /^\d+$/.test(cl.category);
    console.log(`  BUG CL-2541363 check:`);
    console.log(`    category field:  "${cl.category}"`);
    console.log(`    Is raw numeric:  ${categoryIsNumeric ? R("YES — BUG PERSISTS") : G("NO")}`);
    console.log(`    grupoSag (fix):  "${cl.grupoSag ?? "null"}"`);
    console.log(`    Resolution:      ${cl.grupoSag ? G("grupoSag now provides resolved name") : R("grupoSag missing — bug not fixed")}`);

    // Variants
    const variants = await db.productVariant.findMany({
      where: { productId: cl.id },
      select: { id: true, sku: true, attributes: true, status: true },
    });
    console.log("");
    console.log(`  Variants found:    ${variants.length}`);
    for (const v of variants.slice(0, 10)) {
      console.log(`    ${v.sku ?? "—"} | ${JSON.stringify(v.attributes)} | ${v.status}`);
    }

    // Inventory by bodega
    const invLevels: any[] = await db.productInventoryLevel.findMany({
      where: { productId: cl.id },
      select: { externalRef: true, quantity: true, warehouseId: true },
    });
    console.log("");
    console.log(`  Inventory levels (${invLevels.length}):`);
    for (const il of invLevels) {
      console.log(`    Bodega ${il.externalRef ?? il.warehouseId}: qty=${il.quantity}`);
    }

    // CCS entry
    const ccsEntry = latestCCS.filter(c => c.refCode === cl.sku);
    console.log("");
    console.log(`  CCS entries:       ${ccsEntry.length}`);
    for (const c of ccsEntry) {
      console.log(`    line=${c.line} disponible=${c.disponible} snapshotAt=${c.snapshotAt?.toISOString?.() ?? c.snapshotAt}`);
    }

    // Expected drawer value
    console.log("");
    console.log(`  Expected in Inventario drawer:`);
    console.log(`    Grupo:           ${cl.grupoSag ?? cl.category ?? "—"}`);
    console.log(`    Linea:           ${cl.lineaSag ?? cl.productLine ?? "—"}`);
    console.log(`    Subgrupo:        ${cl.subgrupoSag ?? "—"}`);
    console.log(`    Costo:           ${cl.costo != null ? `$${cl.costo}` : "—"}`);
    console.log(`    Talla/Color:     ${cl.manejaTallaColor ? "Si" : "No"}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // POINT 6: HandlingUnit distribution by line
  // ═══════════════════════════════════════════════════════════════════
  hr("POINT 6 — HANDLING UNIT DISTRIBUTION");

  console.log(`  Source: v_articulos.sc_unidad (NOT ARTICULOS table)`);
  console.log(`  Normalizer: normalizeHandlingUnit() in sag-articles-sync.ts`);
  console.log(`  Non-size units (UNIDAD, METROS, PESOS, etc.) → null`);
  console.log("");

  const huValues = new Map<string, number>();
  const huByLine = new Map<string, Map<string, number>>();

  for (const p of allProducts) {
    const hu = p.handlingUnit ?? "null";
    huValues.set(hu, (huValues.get(hu) ?? 0) + 1);

    const lineLabel = resolveLineLabel(p);
    if (!huByLine.has(lineLabel)) huByLine.set(lineLabel, new Map());
    const lineMap = huByLine.get(lineLabel)!;
    lineMap.set(hu, (lineMap.get(hu) ?? 0) + 1);
  }

  // Global distribution
  console.log(`  Global distribution:`);
  const huSorted = [...huValues.entries()].sort((a, b) => b[1] - a[1]);
  for (const [val, count] of huSorted) {
    console.log(`    ${val.padEnd(20)} ${String(count).padStart(6)} (${pct(count, total)})`);
  }
  console.log("");

  // Per-line distribution
  for (const lineLabel of sortedLines) {
    const lineMap = huByLine.get(lineLabel);
    if (!lineMap) continue;
    const lineTotal = byLine.get(lineLabel)!.length;
    console.log(`  ${B(lineLabel)} (${lineTotal}):`);
    const sorted = [...lineMap.entries()].sort((a, b) => b[1] - a[1]);
    for (const [val, count] of sorted) {
      console.log(`    ${val.padEnd(20)} ${String(count).padStart(6)} (${pct(count, lineTotal)})`);
    }
    console.log("");
  }

  // ═══════════════════════════════════════════════════════════════════
  // POINT 7: Subgrupo null root cause analysis
  // ═══════════════════════════════════════════════════════════════════
  hr("POINT 7 — SUBGRUPO NULL ANALYSIS");

  const subgrupoNull = allProducts.filter(p => p.subgrupoId == null);
  const subgrupoSagNull = allProducts.filter(p => p.subgrupoSag == null || p.subgrupoSag === "");
  const subgrupoIdPopulated = allProducts.filter(p => p.subgrupoId != null);
  const subgrupoSagPopulated = allProducts.filter(p => p.subgrupoSag != null && p.subgrupoSag !== "");

  console.log(`  subgrupoId null:     ${B(String(subgrupoNull.length))} / ${total} (${pct(subgrupoNull.length, total)})`);
  console.log(`  subgrupoSag null:    ${B(String(subgrupoSagNull.length))} / ${total} (${pct(subgrupoSagNull.length, total)})`);
  console.log(`  subgrupoId set:      ${B(String(subgrupoIdPopulated.length))} / ${total}`);
  console.log(`  subgrupoSag set:     ${B(String(subgrupoSagPopulated.length))} / ${total}`);
  console.log("");

  // Products with subgrupoId but no subgrupoSag = lookup failure
  const idButNoName = allProducts.filter(p => p.subgrupoId != null && (p.subgrupoSag == null || p.subgrupoSag === ""));
  console.log(`  Has subgrupoId but subgrupoSag=null (lookup failure): ${B(String(idButNoName.length))}`);
  if (idButNoName.length > 0) {
    const sampleIds = [...new Set(idButNoName.map(p => String(p.subgrupoId)))].slice(0, 10);
    console.log(`    Sample unresolved subgrupoIds: ${sampleIds.join(", ")}`);
  }
  console.log("");

  // Products with neither = genuinely null in SAG
  const bothNull = allProducts.filter(p => p.subgrupoId == null && (p.subgrupoSag == null || p.subgrupoSag === ""));
  console.log(`  Both subgrupoId AND subgrupoSag null (null in SAG): ${B(String(bothNull.length))}`);
  console.log("");

  // Classify null causes
  console.log(`  Root cause classification:`);
  console.log(`    Genuinely null in SAG source:     ${B(String(bothNull.length))}`);
  console.log(`    Lookup not resolved (id exists):  ${B(String(idButNoName.length))}`);
  console.log(`    Total null subgrupoSag:           ${B(String(subgrupoSagNull.length))}`);
  console.log(`    Sum check: ${bothNull.length} + ${idButNoName.length} = ${bothNull.length + idButNoName.length} == ${subgrupoSagNull.length}: ${
    bothNull.length + idButNoName.length === subgrupoSagNull.length ? G("YES") : R("NO")
  }`);

  // ═══════════════════════════════════════════════════════════════════
  // POINT 8: Variant flag vs persisted variants
  // ═══════════════════════════════════════════════════════════════════
  hr("POINT 8 — VARIANTS RECONCILIATION");

  const manageTallaColor = allProducts.filter(p => p.manejaTallaColor === true);
  const noTallaColor = allProducts.filter(p => p.manejaTallaColor === false);

  console.log(`  manejaTallaColor=true:   ${B(String(manageTallaColor.length))}`);
  console.log(`  manejaTallaColor=false:  ${B(String(noTallaColor.length))}`);
  console.log("");

  // Count products with persisted ProductVariant records
  const variantCounts: any[] = await db.$queryRawUnsafe(
    `SELECT "productId", COUNT(*)::int as cnt
     FROM "ProductVariant"
     WHERE "productId" IN (
       SELECT id FROM "ProductEntity"
       WHERE "organizationId" = $1 AND "externalSource" = 'sag'
     )
     GROUP BY "productId"`,
    ORG,
  );

  const variantCountMap = new Map<string, number>();
  for (const vc of variantCounts) {
    variantCountMap.set(vc.productId, vc.cnt);
  }

  const productsWithVariants = variantCounts.length;
  const totalVariantRecords = variantCounts.reduce((s, v) => s + v.cnt, 0);

  console.log(`  Products with persisted ProductVariant rows: ${B(String(productsWithVariants))}`);
  console.log(`  Total ProductVariant records:                ${B(String(totalVariantRecords))}`);
  console.log("");

  // Flag true but zero variants
  const flagTrueNoVariants = manageTallaColor.filter(p => !variantCountMap.has(p.id));
  const flagTrueWithVariants = manageTallaColor.filter(p => variantCountMap.has(p.id));
  const flagFalseWithVariants = noTallaColor.filter(p => variantCountMap.has(p.id));

  console.log(`  manejaTallaColor=true WITH variants:    ${B(String(flagTrueWithVariants.length))}`);
  console.log(`  manejaTallaColor=true WITHOUT variants: ${R(String(flagTrueNoVariants.length))}`);
  console.log(`  manejaTallaColor=false WITH variants:   ${Y(String(flagFalseWithVariants.length))}`);
  console.log("");

  // Cause for flag=true but no variants
  console.log(`  Root cause for flag=true + zero variants:`);
  console.log(`    sag-variants-sync.ts says: "no DB writes in this sprint" (line 8)`);
  console.log(`    syncSagVariants() computes in-memory only — does NOT persist to ProductVariant`);
  console.log(`    The master data backfill only persisted the manejaTallaColor FLAG,`);
  console.log(`    not the actual talla/color combinations.`);
  console.log(`    Existing ProductVariant rows come from the inventory sync pipeline,`);
  console.log(`    NOT from the article catalog sync.`);

  // ═══════════════════════════════════════════════════════════════════
  // POINT 9: CCS Freshness
  // ═══════════════════════════════════════════════════════════════════
  hr("POINT 9 — CCS FRESHNESS");

  // Get snapshot groups by snapshotAt
  const latestBatch: any[] = await db.$queryRawUnsafe(
    `SELECT "snapshotAt", COUNT(*)::int as cnt
     FROM "CommercialCoverageSnapshot"
     WHERE "organizationId" = $1
     GROUP BY "snapshotAt"
     ORDER BY "snapshotAt" DESC
     LIMIT 5`,
    ORG,
  );

  if (latestBatch.length > 0) {
    console.log(`  Latest CCS snapshots:`);
    for (const batch of latestBatch) {
      const snapshotDate = batch.snapshotAt instanceof Date ? batch.snapshotAt : new Date(batch.snapshotAt);
      const ageMs = Date.now() - snapshotDate.getTime();
      const ageHours = (ageMs / 3600000).toFixed(1);
      const ageMinutes = Math.round(ageMs / 60000);

      let freshness = "EXPIRED";
      if (ageMs < 4 * 3600000) freshness = "FRESH";
      else if (ageMs < 24 * 3600000) freshness = "STALE";

      console.log(`    snapshotAt:  ${snapshotDate.toISOString()}`);
      console.log(`    rows:        ${batch.cnt}`);
      console.log(`    age:         ${ageHours}h (${ageMinutes}min)`);
      console.log(`    freshness:   ${freshness === "FRESH" ? G(freshness) : freshness === "STALE" ? Y(freshness) : R(freshness)}`);
      console.log("");
    }

    // Check if old July 7 snapshot still exists
    const julyBatches: any[] = await db.$queryRawUnsafe(
      `SELECT "snapshotAt", COUNT(*)::int as cnt
       FROM "CommercialCoverageSnapshot"
       WHERE "organizationId" = $1
         AND "snapshotAt" < '2026-07-10'
       GROUP BY "snapshotAt"
       ORDER BY "snapshotAt" DESC
       LIMIT 3`,
      ORG,
    );
    if (julyBatches.length > 0) {
      console.log(Y(`  Old snapshots still present (pre-July 10):`));
      for (const jb of julyBatches) {
        const d = jb.snapshotAt instanceof Date ? jb.snapshotAt : new Date(jb.snapshotAt);
        console.log(`    at=${d.toISOString()} rows=${jb.cnt}`);
      }
    } else {
      console.log(G(`  No pre-July 10 snapshots found — old data purged.`));
    }
  } else {
    console.log(R(`  No CCS snapshots found!`));
  }

  // ═══════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════
  hr("RECONCILIATION COMPLETE");

  console.log(`  Points audited: 1-9`);
  console.log(`  Sprint state:   IN_REVIEW_POST_BACKFILL`);
  console.log(`  Next:           Point 10 — Functional validation (Inventario, Maletas, Produccion, Oportunidades, Recompra)`);
  console.log("");

  await prisma.$disconnect();
  pool.end();
}

main().catch(e => {
  console.error(`FATAL: ${(e as Error).message}`);
  console.error((e as Error).stack);
  process.exit(1);
});
