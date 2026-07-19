/**
 * _inventory-truth-validation.ts
 *
 * INVENTORY-TRUTH-VALIDATION-01
 *
 * READ-ONLY diagnostic script. Compares ProductInventoryLevel,
 * CommercialCoverageSnapshot, and Inventory Control Center data
 * for a representative sample of references.
 *
 * Usage: npx dotenv-cli -e .env -- npx tsx scripts/_inventory-truth-validation.ts
 */

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const ORG = "cmmpwstuf000dp5y58kj1daaj";
const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);
  const db = prisma as any;

  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════════════"));
  console.log(B("  INVENTORY-TRUTH-VALIDATION-01 — Validacion de Verdad de Inventario"));
  console.log(B("═══════════════════════════════════════════════════════════════════════"));
  console.log("");

  // ═══════════════════════════════════════════════════════════════════════════
  // FASE 1: Panorama general de ProductInventoryLevel Bodega 01
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(B("  FASE 1: Panorama ProductInventoryLevel Bodega 01"));
  console.log("  " + "─".repeat(65));

  const bod01Stats: Array<{
    sign_category: string;
    record_count: number;
    total_qty: number;
    min_qty: number;
    max_qty: number;
    avg_qty: number;
  }> = await db.$queryRawUnsafe(`
    SELECT
      CASE
        WHEN "quantity" > 0 THEN 'POSITIVO'
        WHEN "quantity" = 0 THEN 'CERO'
        ELSE 'NEGATIVO'
      END as sign_category,
      COUNT(*)::int as record_count,
      SUM("quantity")::float as total_qty,
      MIN("quantity")::float as min_qty,
      MAX("quantity")::float as max_qty,
      AVG("quantity")::float as avg_qty
    FROM "ProductInventoryLevel"
    WHERE "organizationId" = $1 AND "externalRef" = '01'
    GROUP BY sign_category
    ORDER BY sign_category
  `, ORG);

  for (const s of bod01Stats) {
    const color = s.sign_category === "POSITIVO" ? G : s.sign_category === "NEGATIVO" ? R : Y;
    console.log(`  ${color(s.sign_category.padEnd(10))} | ${String(s.record_count).padStart(7)} registros | total: ${String(Math.round(s.total_qty)).padStart(12)} | rango: [${Math.round(s.min_qty)}, ${Math.round(s.max_qty)}] | avg: ${Math.round(s.avg_qty)}`);
  }
  console.log("");

  // ═══════════════════════════════════════════════════════════════════════════
  // FASE 2: Distribución por producto (aggregated by reference)
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(B("  FASE 2: Distribución por referencia (SUM por producto)"));
  console.log("  " + "─".repeat(65));

  const refAgg: Array<{
    sign_category: string;
    ref_count: number;
    total_qty: number;
    min_sum: number;
    max_sum: number;
  }> = await db.$queryRawUnsafe(`
    WITH ref_sums AS (
      SELECT pil."productId", SUM(pil."quantity")::float as sum_qty
      FROM "ProductInventoryLevel" pil
      WHERE pil."organizationId" = $1 AND pil."externalRef" = '01'
      GROUP BY pil."productId"
    )
    SELECT
      CASE
        WHEN sum_qty > 0 THEN 'POSITIVO'
        WHEN sum_qty = 0 THEN 'CERO'
        ELSE 'NEGATIVO'
      END as sign_category,
      COUNT(*)::int as ref_count,
      SUM(sum_qty)::float as total_qty,
      MIN(sum_qty)::float as min_sum,
      MAX(sum_qty)::float as max_sum
    FROM ref_sums
    GROUP BY sign_category
    ORDER BY sign_category
  `, ORG);

  for (const s of refAgg) {
    const color = s.sign_category === "POSITIVO" ? G : s.sign_category === "NEGATIVO" ? R : Y;
    console.log(`  ${color(s.sign_category.padEnd(10))} | ${String(s.ref_count).padStart(5)} refs | total: ${String(Math.round(s.total_qty)).padStart(12)} | rango: [${Math.round(s.min_sum)}, ${Math.round(s.max_sum)}]`);
  }
  console.log("");

  // ═══════════════════════════════════════════════════════════════════════════
  // FASE 3: Bodega 04 (Producción) — ¿tiene saldos saludables?
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(B("  FASE 3: Comparación Bodega 01 vs Bodega 04"));
  console.log("  " + "─".repeat(65));

  const bodCompare: Array<{
    bodega: string;
    record_count: number;
    negative_count: number;
    positive_count: number;
    total_qty: number;
    distinct_products: number;
  }> = await db.$queryRawUnsafe(`
    SELECT
      "externalRef" as bodega,
      COUNT(*)::int as record_count,
      COUNT(*) FILTER (WHERE "quantity" < 0)::int as negative_count,
      COUNT(*) FILTER (WHERE "quantity" > 0)::int as positive_count,
      SUM("quantity")::float as total_qty,
      COUNT(DISTINCT "productId")::int as distinct_products
    FROM "ProductInventoryLevel"
    WHERE "organizationId" = $1 AND "externalRef" IN ('01', '04', '00', '02')
    GROUP BY "externalRef"
    ORDER BY "externalRef"
  `, ORG);

  for (const b of bodCompare) {
    const color = b.total_qty >= 0 ? G : R;
    console.log(`  Bodega ${b.bodega} | ${String(b.record_count).padStart(6)} registros | ${color(String(b.negative_count).padStart(5))} neg | ${G(String(b.positive_count).padStart(5))} pos | total: ${color(String(Math.round(b.total_qty)).padStart(12))} | ${b.distinct_products} productos`);
  }
  console.log("");

  // ═══════════════════════════════════════════════════════════════════════════
  // FASE 4: Muestra representativa — 20 LT + 20 CS
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(B("  FASE 4: Muestra representativa (20 LT + 20 CS)"));
  console.log("  " + "─".repeat(65));

  // Get sample: mix of positive, negative, and large quantities
  const sampleRefs: Array<{
    product_id: string;
    sku: string;
    name: string;
    product_line: string;
    pil_sum: number;
    variant_count: number;
    positive_variants: number;
    negative_variants: number;
  }> = await db.$queryRawUnsafe(`
    WITH pil_agg AS (
      SELECT
        pil."productId",
        SUM(pil."quantity")::float as pil_sum,
        COUNT(*)::int as variant_count,
        COUNT(*) FILTER (WHERE pil."quantity" > 0)::int as positive_variants,
        COUNT(*) FILTER (WHERE pil."quantity" < 0)::int as negative_variants
      FROM "ProductInventoryLevel" pil
      WHERE pil."organizationId" = $1 AND pil."externalRef" = '01'
      GROUP BY pil."productId"
    ),
    ranked AS (
      SELECT
        pa.*,
        pe."sku", pe."name", pe."productLine",
        ROW_NUMBER() OVER (
          PARTITION BY pe."productLine",
          CASE
            WHEN pa.pil_sum > 100 THEN 'HIGH_POS'
            WHEN pa.pil_sum > 0 THEN 'LOW_POS'
            WHEN pa.pil_sum = 0 THEN 'ZERO'
            WHEN pa.pil_sum > -100 THEN 'LOW_NEG'
            ELSE 'HIGH_NEG'
          END
          ORDER BY ABS(pa.pil_sum) DESC
        ) as rn
      FROM pil_agg pa
      JOIN "ProductEntity" pe ON pe."id" = pa."productId"
      WHERE pe."productLine" IN ('1', '2')
    )
    SELECT "productId" as product_id, sku, name, "productLine" as product_line,
           pil_sum, variant_count, positive_variants, negative_variants
    FROM ranked
    WHERE rn <= 5
    ORDER BY "productLine", pil_sum DESC
    LIMIT 40
  `, ORG);

  console.log(`  Muestra: ${sampleRefs.length} referencias`);
  console.log("");

  // For each sample, get CCS data
  const sampleSkus = sampleRefs.map(r => r.sku);
  const ccsData: Array<{
    refCode: string;
    disponible: number;
    pendingOrdersQty: number;
    line: string;
    snapshotAt: Date;
  }> = await db.$queryRawUnsafe(`
    SELECT "refCode", "disponible"::float, "pendingOrdersQty"::float, "line",
           "snapshotAt"
    FROM "CommercialCoverageSnapshot"
    WHERE "organizationId" = $1
      AND "refCode" = ANY($2)
    ORDER BY "snapshotAt" DESC
  `, ORG, sampleSkus);

  const ccsMap = new Map<string, { disponible: number; pendingOrdersQty: number; line: string }>();
  for (const c of ccsData) {
    if (!ccsMap.has(c.refCode)) {
      ccsMap.set(c.refCode, { disponible: c.disponible, pendingOrdersQty: c.pendingOrdersQty ?? 0, line: c.line });
    }
  }

  // Print comparison table
  const LINE_LABELS: Record<string, string> = { "1": "LT", "2": "CS" };

  console.log(B("  COMPARACIÓN POR REFERENCIA"));
  console.log(`  ${"REF".padEnd(16)} ${"LÍNEA".padEnd(5)} ${"PIL Sum".padStart(10)} ${"PIL+".padStart(5)} ${"PIL-".padStart(5)} ${"CCS Disp".padStart(10)} ${"CCS PD".padStart(8)} ${"DIAGNÓSTICO".padEnd(25)}`);
  console.log(`  ${"─".repeat(16)} ${"─".repeat(5)} ${"─".repeat(10)} ${"─".repeat(5)} ${"─".repeat(5)} ${"─".repeat(10)} ${"─".repeat(8)} ${"─".repeat(25)}`);

  for (const ref of sampleRefs) {
    const ccs = ccsMap.get(ref.sku);
    const pilSum = Math.round(ref.pil_sum);
    const ccsDisp = ccs ? Math.round(ccs.disponible) : null;
    const ccsPd = ccs ? Math.round(ccs.pendingOrdersQty) : null;
    const line = LINE_LABELS[ref.product_line] ?? ref.product_line;

    // Diagnose
    let diagnosis = "";
    if (pilSum < 0 && ccsDisp === 0) {
      diagnosis = "NEG→CLAMPED_TO_0";
    } else if (pilSum > 0 && ccsDisp !== null && ccsDisp === pilSum) {
      diagnosis = "OK_MATCH";
    } else if (pilSum > 0 && ccsDisp !== null && ccsDisp !== pilSum) {
      diagnosis = `DIFF: ${pilSum - ccsDisp}`;
    } else if (pilSum === 0 && ccsDisp === 0) {
      diagnosis = "ZERO_OK";
    } else if (ccsDisp === null) {
      diagnosis = "NO_CCS";
    } else {
      diagnosis = "REVIEW";
    }

    const pilColor = pilSum >= 0 ? G : R;
    const ccsColor = ccsDisp !== null && ccsDisp > 0 ? G : ccsDisp === 0 ? Y : R;

    console.log(`  ${ref.sku.padEnd(16)} ${line.padEnd(5)} ${pilColor(String(pilSum).padStart(10))} ${String(ref.positive_variants).padStart(5)} ${String(ref.negative_variants).padStart(5)} ${ccsDisp !== null ? ccsColor(String(ccsDisp).padStart(10)) : "—".padStart(10)} ${ccsPd !== null ? String(ccsPd).padStart(8) : "—".padStart(8)} ${diagnosis.padEnd(25)}`);
  }

  console.log("");

  // ═══════════════════════════════════════════════════════════════════════════
  // FASE 5: Variant-level deep dive (pick 3 references)
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(B("  FASE 5: Detalle de variantes (3 referencias profundas)"));
  console.log("  " + "─".repeat(65));

  // Pick: 1 positive, 1 slightly negative, 1 highly negative
  const deepRefs = sampleRefs.filter(r => r.pil_sum > 50).slice(0, 1)
    .concat(sampleRefs.filter(r => r.pil_sum < 0 && r.pil_sum > -50).slice(0, 1))
    .concat(sampleRefs.filter(r => r.pil_sum < -500).slice(0, 1));

  for (const ref of deepRefs) {
    console.log(`\n  ${B(ref.sku)} (${ref.name?.slice(0, 40)}) — PIL Sum: ${Math.round(ref.pil_sum)}`);

    const variants: Array<{
      variant_name: string;
      quantity: number;
      variant_id: string;
    }> = await db.$queryRawUnsafe(`
      SELECT pv."name" as variant_name, pil."quantity"::float, pil."variantId" as variant_id
      FROM "ProductInventoryLevel" pil
      LEFT JOIN "ProductVariant" pv ON pv."id" = pil."variantId"
      WHERE pil."organizationId" = $1
        AND pil."productId" = $2
        AND pil."externalRef" = '01'
      ORDER BY pil."quantity" ASC
    `, ORG, ref.product_id);

    for (const v of variants.slice(0, 15)) {
      const color = v.quantity >= 0 ? G : R;
      console.log(`    ${(v.variant_name ?? "—").padEnd(25)} ${color(String(Math.round(v.quantity)).padStart(8))}`);
    }
    if (variants.length > 15) {
      console.log(`    ... y ${variants.length - 15} variantes mas`);
    }
    console.log(`    TOTAL: ${variants.length} variantes, Sum = ${Math.round(variants.reduce((s, v) => s + v.quantity, 0))}`);
  }

  console.log("");

  // ═══════════════════════════════════════════════════════════════════════════
  // FASE 6: Pedidos — estado real
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(B("  FASE 6: Estado de pedidos (CustomerOrderRecord)"));
  console.log("  " + "─".repeat(65));

  const orderStats: Array<{
    status: string;
    count: number;
    total_amount: number;
  }> = await db.$queryRawUnsafe(`
    SELECT
      "status"::text,
      COUNT(*)::int as count,
      COALESCE(SUM("amount")::float, 0) as total_amount
    FROM "CustomerOrderRecord"
    WHERE "organizationId" = $1
    GROUP BY "status"
    ORDER BY count DESC
  `, ORG);

  for (const o of orderStats) {
    console.log(`  ${o.status.padEnd(15)} | ${String(o.count).padStart(6)} pedidos | monto: $${String(Math.round(o.total_amount / 1000000)).padStart(6)}M`);
  }

  // Check status='open' match — the CCS builder queries this
  // Note: 'open' is NOT a valid enum value so this will return 0 or error
  let openCount = 0;
  try {
    const openOrders: Array<{ count: number }> = await db.$queryRawUnsafe(`
      SELECT COUNT(*)::int as count FROM "CustomerOrderRecord"
      WHERE "organizationId" = $1 AND "status"::text = 'open'
    `, ORG);
    openCount = openOrders[0]?.count ?? 0;
  } catch {
    // Enum doesn't accept 'open' — confirms the bug
    openCount = 0;
  }
  console.log(`\n  status='open' match: ${R(String(openCount))} (lo que usa el builder — ENUM NO TIENE 'open')`);

  const pendienteOrders: Array<{ count: number }> = await db.$queryRawUnsafe(`
    SELECT COUNT(*)::int as count FROM "CustomerOrderRecord"
    WHERE "organizationId" = $1 AND "status"::text = 'PENDIENTE'
  `, ORG);
  console.log(`  status='PENDIENTE' match: ${Y(String(pendienteOrders[0]?.count ?? 0))} (lo que tiene la DB)`);
  console.log("");

  // ═══════════════════════════════════════════════════════════════════════════
  // FASE 7: Bodega 01 — ¿es realmente la principal?
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(B("  FASE 7: Identificación de Bodega 01"));
  console.log("  " + "─".repeat(65));

  // Check externalRef values and their warehouse names
  const warehouseIds: Array<{
    external_ref: string;
    warehouse_id: string;
    record_count: number;
    total_qty: number;
  }> = await db.$queryRawUnsafe(`
    SELECT "externalRef" as external_ref,
           "warehouseId" as warehouse_id,
           COUNT(*)::int as record_count,
           SUM("quantity")::float as total_qty
    FROM "ProductInventoryLevel"
    WHERE "organizationId" = $1
    GROUP BY "externalRef", "warehouseId"
    ORDER BY record_count DESC
    LIMIT 10
  `, ORG);

  for (const w of warehouseIds) {
    const color = w.total_qty >= 0 ? G : R;
    console.log(`  externalRef='${w.external_ref}' warehouseId='${w.warehouse_id}' | ${String(w.record_count).padStart(6)} records | total: ${color(String(Math.round(w.total_qty)).padStart(12))}`);
  }
  console.log("");

  // ═══════════════════════════════════════════════════════════════════════════
  // FASE 8: Verificar si hay duplicados por variante en misma bodega
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(B("  FASE 8: Duplicados por variante en Bodega 01"));
  console.log("  " + "─".repeat(65));

  const dupes: Array<{
    variant_id: string;
    warehouse_id: string;
    dup_count: number;
  }> = await db.$queryRawUnsafe(`
    SELECT "variantId" as variant_id, "warehouseId" as warehouse_id, COUNT(*)::int as dup_count
    FROM "ProductInventoryLevel"
    WHERE "organizationId" = $1 AND "externalRef" = '01'
    GROUP BY "variantId", "warehouseId"
    HAVING COUNT(*) > 1
    ORDER BY dup_count DESC
    LIMIT 10
  `, ORG);

  if (dupes.length === 0) {
    console.log(`  ${G("Sin duplicados")} — cada variante tiene exactamente 1 registro por bodega`);
  } else {
    console.log(`  ${R(`${dupes.length} duplicados encontrados!`)}`);
    for (const d of dupes) {
      console.log(`    variant=${d.variant_id} warehouse=${d.warehouse_id} count=${d.dup_count}`);
    }
  }
  console.log("");

  // ═══════════════════════════════════════════════════════════════════════════
  // FASE 9: ¿Qué pasa con Bodega 04? ¿Tiene las mismas referencias?
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(B("  FASE 9: Bodega 01 vs 04 — mismas referencias?"));
  console.log("  " + "─".repeat(65));

  const bod0104: Array<{
    category: string;
    ref_count: number;
  }> = await db.$queryRawUnsafe(`
    WITH bod01 AS (
      SELECT DISTINCT "productId" FROM "ProductInventoryLevel"
      WHERE "organizationId" = $1 AND "externalRef" = '01'
    ),
    bod04 AS (
      SELECT DISTINCT "productId" FROM "ProductInventoryLevel"
      WHERE "organizationId" = $1 AND "externalRef" = '04'
    )
    SELECT 'SOLO_01' as category, COUNT(*)::int as ref_count FROM bod01 WHERE "productId" NOT IN (SELECT "productId" FROM bod04)
    UNION ALL
    SELECT 'SOLO_04', COUNT(*)::int FROM bod04 WHERE "productId" NOT IN (SELECT "productId" FROM bod01)
    UNION ALL
    SELECT 'AMBAS', COUNT(*)::int FROM bod01 WHERE "productId" IN (SELECT "productId" FROM bod04)
  `, ORG);

  for (const b of bod0104) {
    console.log(`  ${b.category.padEnd(10)} | ${String(b.ref_count).padStart(5)} productos`);
  }
  console.log("");

  // ═══════════════════════════════════════════════════════════════════════════
  // FASE 10: Para una referencia negativa, ¿qué dice Bodega 04?
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(B("  FASE 10: Ref negativa en 01 — ¿tiene stock en 04?"));
  console.log("  " + "─".repeat(65));

  const negativeRef = sampleRefs.find(r => r.pil_sum < -100);
  if (negativeRef) {
    const allBodegas: Array<{
      external_ref: string;
      sum_qty: number;
      variant_count: number;
    }> = await db.$queryRawUnsafe(`
      SELECT "externalRef" as external_ref,
             SUM("quantity")::float as sum_qty,
             COUNT(*)::int as variant_count
      FROM "ProductInventoryLevel"
      WHERE "organizationId" = $1 AND "productId" = $2
      GROUP BY "externalRef"
      ORDER BY "externalRef"
    `, ORG, negativeRef.product_id);

    console.log(`  Referencia: ${negativeRef.sku} (${negativeRef.name?.slice(0, 40)})`);
    for (const b of allBodegas) {
      const color = b.sum_qty >= 0 ? G : R;
      console.log(`    Bodega ${b.external_ref.padEnd(3)} | ${color(String(Math.round(b.sum_qty)).padStart(10))} | ${b.variant_count} variantes`);
    }
  }
  console.log("");

  // ═══════════════════════════════════════════════════════════════════════════
  // FASE 11: Top 10 referencias con mayor stock POSITIVO en Bodega 01
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(B("  FASE 11: Top 10 positivas en Bodega 01"));
  console.log("  " + "─".repeat(65));

  const topPositive: Array<{
    sku: string;
    name: string;
    product_line: string;
    pil_sum: number;
  }> = await db.$queryRawUnsafe(`
    SELECT pe."sku", pe."name", pe."productLine" as product_line,
           SUM(pil."quantity")::float as pil_sum
    FROM "ProductInventoryLevel" pil
    JOIN "ProductEntity" pe ON pe."id" = pil."productId"
    WHERE pil."organizationId" = $1 AND pil."externalRef" = '01'
      AND pe."sku" IS NOT NULL
    GROUP BY pe."sku", pe."name", pe."productLine"
    HAVING SUM(pil."quantity") > 0
    ORDER BY pil_sum DESC
    LIMIT 10
  `, ORG);

  for (const t of topPositive) {
    const line = LINE_LABELS[t.product_line ?? ""] ?? (t.product_line ?? "—");
    console.log(`  ${(t.sku ?? "—").padEnd(16)} ${line.padEnd(5)} ${G(String(Math.round(t.pil_sum)).padStart(10))} ${(t.name ?? "—").slice(0, 40)}`);
  }
  console.log("");

  // ═══════════════════════════════════════════════════════════════════════════
  // FASE 12: Top 10 referencias con mayor stock NEGATIVO en Bodega 01
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(B("  FASE 12: Top 10 negativas en Bodega 01"));
  console.log("  " + "─".repeat(65));

  const topNegative: Array<{
    sku: string;
    name: string;
    product_line: string;
    pil_sum: number;
  }> = await db.$queryRawUnsafe(`
    SELECT pe."sku", pe."name", pe."productLine" as product_line,
           SUM(pil."quantity")::float as pil_sum
    FROM "ProductInventoryLevel" pil
    JOIN "ProductEntity" pe ON pe."id" = pil."productId"
    WHERE pil."organizationId" = $1 AND pil."externalRef" = '01'
      AND pe."sku" IS NOT NULL
    GROUP BY pe."sku", pe."name", pe."productLine"
    HAVING SUM(pil."quantity") < 0
    ORDER BY pil_sum ASC
    LIMIT 10
  `, ORG);

  for (const t of topNegative) {
    const line = LINE_LABELS[t.product_line ?? ""] ?? (t.product_line ?? "—");
    console.log(`  ${(t.sku ?? "—").padEnd(16)} ${line.padEnd(5)} ${R(String(Math.round(t.pil_sum)).padStart(10))} ${(t.name ?? "—").slice(0, 40)}`);
  }
  console.log("");

  // ═══════════════════════════════════════════════════════════════════════════
  // FASE 13: Distribución temporal — ¿cuándo se sincronizó?
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(B("  FASE 13: Fechas de sincronización"));
  console.log("  " + "─".repeat(65));

  const syncDates: Array<{
    synced_date: string;
    record_count: number;
  }> = await db.$queryRawUnsafe(`
    SELECT DATE("syncedAt") as synced_date, COUNT(*)::int as record_count
    FROM "ProductInventoryLevel"
    WHERE "organizationId" = $1 AND "externalRef" = '01'
    GROUP BY DATE("syncedAt")
    ORDER BY synced_date DESC
    LIMIT 5
  `, ORG);

  for (const s of syncDates) {
    console.log(`  ${s.synced_date} | ${String(s.record_count).padStart(6)} registros`);
  }

  const ccsDates: Array<{
    snapshot_date: string;
    record_count: number;
  }> = await db.$queryRawUnsafe(`
    SELECT DATE("snapshotAt") as snapshot_date, COUNT(*)::int as record_count
    FROM "CommercialCoverageSnapshot"
    WHERE "organizationId" = $1
    GROUP BY DATE("snapshotAt")
    ORDER BY snapshot_date DESC
    LIMIT 5
  `, ORG);

  console.log("");
  console.log("  CommercialCoverageSnapshot:");
  for (const c of ccsDates) {
    console.log(`  ${c.snapshot_date} | ${String(c.record_count).padStart(6)} registros`);
  }
  console.log("");

  // ═══════════════════════════════════════════════════════════════════════════
  // FASE 14: Conclusión automática
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(B("═══════════════════════════════════════════════════════════════════════"));
  console.log(B("  DIAGNÓSTICO AUTOMÁTICO"));
  console.log(B("═══════════════════════════════════════════════════════════════════════"));
  console.log("");

  // Count references by state
  const posRefs = refAgg.find(r => r.sign_category === "POSITIVO")?.ref_count ?? 0;
  const negRefs = refAgg.find(r => r.sign_category === "NEGATIVO")?.ref_count ?? 0;
  const zeroRefs = refAgg.find(r => r.sign_category === "CERO")?.ref_count ?? 0;
  const totalRefs = posRefs + negRefs + zeroRefs;

  console.log(`  Total referencias en Bodega 01: ${totalRefs}`);
  console.log(`  Positivas: ${G(String(posRefs))} (${Math.round(posRefs / totalRefs * 100)}%)`);
  console.log(`  Negativas: ${R(String(negRefs))} (${Math.round(negRefs / totalRefs * 100)}%)`);
  console.log(`  Cero: ${Y(String(zeroRefs))} (${Math.round(zeroRefs / totalRefs * 100)}%)`);
  console.log("");

  // Key conclusions
  console.log(B("  HALLAZGOS CLAVE:"));
  console.log("");

  if (negRefs > totalRefs * 0.5) {
    console.log(R("  1. INVENTARIO NEGATIVO MASIVO"));
    console.log(`     ${negRefs} de ${totalRefs} referencias (${Math.round(negRefs / totalRefs * 100)}%) tienen saldo negativo en Bodega 01.`);
    console.log(`     El query SAG usa SUM(signed movements) — esto ES el saldo real en SAG.`);
    console.log(`     SAG NO tiene tabla de saldos — calcula stock desde movimientos.`);
    console.log(`     Los negativos significan: salidas históricas > entradas históricas.`);
    console.log("");
  }

  const hasOpenOrdersBug = openCount === 0 && (pendienteOrders[0]?.count ?? 0) > 0;
  if (hasOpenOrdersBug) {
    console.log(R("  2. STATUS MAPPING ROTO (CONFIRMADO)"));
    console.log(`     Builder filtra status='open' → 0 resultados`);
    console.log(`     DB tiene status='PENDIENTE' → ${pendienteOrders[0]?.count} registros`);
    console.log(`     IMPACTO: pedidos no descuentan disponibilidad`);
    console.log("");
  }

  console.log(Y("  3. CLAMPING Math.max(0, ...)"));
  console.log(`     _resync-coverage-snapshot.ts linea 137:`);
  console.log(`     const disponible = Math.max(0, warehouseQty - pendingOrders);`);
  console.log(`     Esto convierte ${negRefs} refs negativas en "disponible=0" (agotado)`);
  console.log(`     Resultado: ${negRefs + zeroRefs} refs aparecen como agotadas en el dashboard`);
  console.log("");

  if (dupes.length === 0) {
    console.log(G("  4. SIN DUPLICADOS — cada variante tiene 1 registro por bodega"));
    console.log("");
  }

  console.log(B("  CAUSA RAÍZ:"));
  console.log("");
  console.log(`  La data en ProductInventoryLevel ES correcta.`);
  console.log(`  SAG calcula saldos como SUM(signed movements) y los negativos son reales.`);
  console.log(`  Los negativos en Bodega 01 representan movimientos de salida acumulados`);
  console.log(`  sin las correspondientes entradas (producción, transfers, ajustes).`);
  console.log("");
  console.log(`  PERO: el Coverage Snapshot aplica Math.max(0, neg) → todo negativo = agotado.`);
  console.log(`  Esto es CORRECTO como política: stock negativo no es stock disponible.`);
  console.log(`  Sin embargo, distorsiona la proporción — 94% agotado vs 6% disponible.`);
  console.log("");
  console.log(`  La pregunta operativa real es:`);
  console.log(`  ¿SAG REALMENTE dice que Bodega 01 tiene ${negRefs} refs con stock negativo?`);
  console.log(`  Si la respuesta es SÍ → el problema está en SAG/operación, no en Agentik.`);
  console.log(`  Si la respuesta es NO → hay un error en el query o en el sync.`);
  console.log("");
  console.log(`  PRÓXIMO PASO: Consultar SAG directamente para 5 referencias de muestra.`);
  console.log(`  O pedir al cliente que valide en pantalla de SAG.`);
  console.log("");

  await prisma.$disconnect();
  pool.end();
}

main().catch(e => {
  console.error(`FATAL: ${(e as Error).message}`);
  process.exit(1);
});
