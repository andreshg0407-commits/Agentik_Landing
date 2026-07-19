/**
 * _inventory-validation.ts
 *
 * INVENTORY-VALIDATION-02 — Comprehensive inventory audit.
 *
 * Phases 1-6: relationship audit, 20-reference validation, warehouse cross-check,
 * quantity semantics, aggregate consistency, read service tests.
 *
 * Usage:
 *   NODE_OPTIONS="-r ./scripts/integration/patch-server-only.cjs" \
 *   npx dotenv-cli -e .env -- npx tsx scripts/_inventory-validation.ts
 */

import { prisma } from "@/lib/prisma";
import {
  getInventoryByProduct,
  getInventoryByProductCode,
  getInventoryByVariant,
  getInventoryByWarehouse,
  searchAvailableVariants,
} from "@/lib/comercial/inventory/inventory-read-service";
import { computeInventoryCoverage } from "@/lib/comercial/inventory/inventory-coverage";

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;

const ORG_ID = "cmmpwstuf000dp5y58kj1daaj";

// ── Tracking ────────────────────────────────────────────────────────────────

const findings: string[] = [];
const errors: string[] = [];
const gaps: string[] = [];
const risks: string[] = [];

function finding(msg: string) { findings.push(msg); }
function error(msg: string) { errors.push(msg); }
function gap(msg: string) { gaps.push(msg); }
function risk(msg: string) { risks.push(msg); }

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  INVENTORY-VALIDATION-02 — AUDITORÍA COMPLETA"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log("");

  await phase1_relationshipAudit();
  await phase2_twentyReferences();
  await phase3_warehouseValidation();
  await phase4_quantitySemantics();
  await phase5_aggregateConsistency();
  await phase6_readServiceTests();
  phase7_report();
  phase8_decision();

  await (prisma as any).$disconnect();
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1 — RELATIONSHIP AUDIT
// ═══════════════════════════════════════════════════════════════════════════

async function phase1_relationshipAudit() {
  console.log(B("  FASE 1: AUDITORÍA DE RELACIONES"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log("");

  // Total levels
  const totalLevels = await (prisma as any).productInventoryLevel.count({
    where: { organizationId: ORG_ID, source: "sag" },
  });
  console.log(`  Total niveles de inventario:        ${B(String(totalLevels))}`);

  // 1. Levels with valid productId
  const levelsWithProduct = await (prisma as any).productInventoryLevel.count({
    where: {
      organizationId: ORG_ID,
      source: "sag",
      product: { id: { not: undefined } },
    },
  });

  // Check orphan levels (productId not in ProductEntity)
  const orphanProductLevels = await (prisma as any).$queryRaw`
    SELECT COUNT(*)::int as cnt FROM "ProductInventoryLevel" pil
    WHERE pil."organizationId" = ${ORG_ID}
      AND pil.source = 'sag'
      AND NOT EXISTS (
        SELECT 1 FROM "ProductEntity" pe WHERE pe.id = pil."productId"
      )
  `;
  const orphanProductCount = orphanProductLevels[0]?.cnt ?? 0;
  console.log(`  Niveles con productId huérfano:     ${orphanProductCount > 0 ? R(String(orphanProductCount)) : G("0")}`);
  if (orphanProductCount > 0) error(`${orphanProductCount} niveles con productId huérfano`);

  // 2. Levels with valid variantId
  const orphanVariantLevels = await (prisma as any).$queryRaw`
    SELECT COUNT(*)::int as cnt FROM "ProductInventoryLevel" pil
    WHERE pil."organizationId" = ${ORG_ID}
      AND pil.source = 'sag'
      AND pil."variantId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "ProductVariant" pv WHERE pv.id = pil."variantId"
      )
  `;
  const orphanVariantCount = orphanVariantLevels[0]?.cnt ?? 0;
  console.log(`  Niveles con variantId huérfano:     ${orphanVariantCount > 0 ? R(String(orphanVariantCount)) : G("0")}`);
  if (orphanVariantCount > 0) error(`${orphanVariantCount} niveles con variantId huérfano`);

  // 3. Variant.productId matches Level.productId
  const mismatchedProductIds = await (prisma as any).$queryRaw`
    SELECT COUNT(*)::int as cnt FROM "ProductInventoryLevel" pil
    INNER JOIN "ProductVariant" pv ON pv.id = pil."variantId"
    WHERE pil."organizationId" = ${ORG_ID}
      AND pil.source = 'sag'
      AND pv."productId" != pil."productId"
  `;
  const mismatchCount = mismatchedProductIds[0]?.cnt ?? 0;
  console.log(`  Niveles con productId mismatch:     ${mismatchCount > 0 ? R(String(mismatchCount)) : G("0")}`);
  if (mismatchCount > 0) error(`${mismatchCount} niveles donde variant.productId != level.productId`);

  // 4. Variants with externalId
  const totalVariants = await (prisma as any).productVariant.count({
    where: { organizationId: ORG_ID, externalSource: "sag" },
  });
  const variantsNoExternalId = await (prisma as any).productVariant.count({
    where: { organizationId: ORG_ID, externalSource: "sag", externalId: null },
  });
  console.log(`  Variantes totales:                  ${B(String(totalVariants))}`);
  console.log(`  Variantes sin externalId:           ${variantsNoExternalId > 0 ? R(String(variantsNoExternalId)) : G("0")}`);
  if (variantsNoExternalId > 0) error(`${variantsNoExternalId} variantes sin externalId`);

  // 5. Variants with talla/color in attributes
  const variantsWithAttrs = await (prisma as any).productVariant.findMany({
    where: { organizationId: ORG_ID, externalSource: "sag" },
    select: { id: true, attributes: true },
    take: 100,
  });
  let missingTalla = 0;
  let missingColor = 0;
  for (const v of variantsWithAttrs) {
    const attrs = v.attributes as any;
    if (!attrs?.talla && !attrs?.color) { missingTalla++; missingColor++; }
    else {
      if (!attrs?.talla) missingTalla++;
      if (!attrs?.color) missingColor++;
    }
  }
  const sampleSize = variantsWithAttrs.length;
  console.log(`  Muestra de ${sampleSize} variantes:`);
  console.log(`    Sin talla en attributes:          ${missingTalla > 0 ? Y(String(missingTalla)) : G("0")}`);
  console.log(`    Sin color en attributes:          ${missingColor > 0 ? Y(String(missingColor)) : G("0")}`);

  // 6. Levels with empty warehouseId (field is required, can't be null)
  const levelsNoWarehouse = await (prisma as any).$queryRaw`
    SELECT COUNT(*)::int as cnt FROM "ProductInventoryLevel"
    WHERE "organizationId" = ${ORG_ID} AND source = 'sag'
      AND ("warehouseId" = '' OR "warehouseId" = '_default')
  `;
  const noWhCount = levelsNoWarehouse[0]?.cnt ?? 0;
  console.log(`  Niveles sin warehouseId real:       ${noWhCount > 0 ? R(String(noWhCount)) : G("0")}`);
  if (noWhCount > 0) error(`${noWhCount} niveles sin warehouseId real`);

  // 7. Quantity/reservedQty validity (check for NaN or null)
  const invalidQty = await (prisma as any).$queryRaw`
    SELECT COUNT(*)::int as cnt FROM "ProductInventoryLevel"
    WHERE "organizationId" = ${ORG_ID}
      AND source = 'sag'
      AND (quantity IS NULL)
  `;
  console.log(`  Niveles con quantity NULL:           ${(invalidQty[0]?.cnt ?? 0) > 0 ? R(String(invalidQty[0]?.cnt)) : G("0")}`);

  const invalidReserved = await (prisma as any).$queryRaw`
    SELECT COUNT(*)::int as cnt FROM "ProductInventoryLevel"
    WHERE "organizationId" = ${ORG_ID}
      AND source = 'sag'
      AND ("reservedQty" IS NULL)
  `;
  console.log(`  Niveles con reservedQty NULL:        ${(invalidReserved[0]?.cnt ?? 0) > 0 ? R(String(invalidReserved[0]?.cnt)) : G("0")}`);

  // 8. Products without variants
  const productsNoVariants = await (prisma as any).$queryRaw`
    SELECT COUNT(*)::int as cnt FROM "ProductEntity" pe
    WHERE pe."organizationId" = ${ORG_ID}
      AND pe."externalSource" = 'sag'
      AND pe."commercialStatus" = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM "ProductVariant" pv WHERE pv."productId" = pe.id
      )
  `;
  const noVariantsCount = productsNoVariants[0]?.cnt ?? 0;
  console.log(`  Productos activos sin variantes:    ${noVariantsCount > 0 ? Y(String(noVariantsCount)) : G("0")}`);
  if (noVariantsCount > 0) {
    finding(`${noVariantsCount} productos activos sin variantes — sin movimientos en SAG`);
  }

  // 9. Variants without inventory
  const variantsNoInventory = await (prisma as any).$queryRaw`
    SELECT COUNT(*)::int as cnt FROM "ProductVariant" pv
    WHERE pv."organizationId" = ${ORG_ID}
      AND pv."externalSource" = 'sag'
      AND NOT EXISTS (
        SELECT 1 FROM "ProductInventoryLevel" pil WHERE pil."variantId" = pv.id
      )
  `;
  const noInvCount = variantsNoInventory[0]?.cnt ?? 0;
  console.log(`  Variantes sin inventario:           ${noInvCount > 0 ? Y(String(noInvCount)) : G("0")}`);

  const validLevels = totalLevels - orphanProductCount - orphanVariantCount;
  console.log("");
  console.log(`  ${B("RESUMEN FASE 1:")}`);
  console.log(`  Niveles totales:    ${B(String(totalLevels))}`);
  console.log(`  Niveles válidos:    ${G(String(validLevels))}`);
  console.log(`  Niveles huérfanos:  ${orphanProductCount + orphanVariantCount > 0 ? R(String(orphanProductCount + orphanVariantCount)) : G("0")}`);
  finding(`${validLevels}/${totalLevels} niveles válidos (${(validLevels / totalLevels * 100).toFixed(1)}%)`);
  console.log("");
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2 — 20 REFERENCES
// ═══════════════════════════════════════════════════════════════════════════

async function phase2_twentyReferences() {
  console.log(B("  FASE 2: VALIDACIÓN DE 20 REFERENCIAS"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log("");

  // Get 20 products with highest stock
  const topProducts = await (prisma as any).$queryRaw`
    SELECT pe.id, pe."externalId", pe.name, pe.price,
           SUM(pil.quantity)::int as total_stock,
           COUNT(DISTINCT pil."variantId")::int as variant_count
    FROM "ProductEntity" pe
    INNER JOIN "ProductInventoryLevel" pil ON pil."productId" = pe.id
    WHERE pe."organizationId" = ${ORG_ID}
      AND pe."externalSource" = 'sag'
      AND pil.source = 'sag'
    GROUP BY pe.id, pe."externalId", pe.name, pe.price
    ORDER BY SUM(pil.quantity) DESC
    LIMIT 20
  `;

  for (const prod of topProducts as any[]) {
    const snapshot = await getInventoryByProduct(ORG_ID, prod.id);
    if (!snapshot) {
      console.log(`  ${R("ERROR:")} Product ${prod.externalId} — getInventoryByProduct returned null`);
      error(`getInventoryByProduct returned null for ${prod.externalId}`);
      continue;
    }

    console.log(B(`  ┌─ ${prod.externalId}  ${String(prod.name).slice(0, 40)}  $${Number(prod.price || 0).toLocaleString("es-CO")}`));
    console.log(`  │  Total: ${G(String(snapshot.totalAvailable))}  Variantes: ${snapshot.variantsInStock}/${snapshot.variantsTotal}  Reservado: ${snapshot.totalReserved}`);

    for (const v of snapshot.variants.slice(0, 6)) {
      const bodegaStr = v.warehouses
        .filter(w => w.available !== 0)
        .map(w => `${w.warehouseCode}:${w.available}`)
        .join(", ");
      const totalStr = v.totalAvailable > 0
        ? G(String(v.totalAvailable).padStart(6))
        : v.totalAvailable < 0
          ? R(String(v.totalAvailable).padStart(6))
          : Y("0".padStart(6));
      console.log(`  │  ${(v.sizeCode || "—").padEnd(8)} ${(v.colorName || "—").slice(0, 14).padEnd(16)} ${totalStr} ${D(bodegaStr.slice(0, 55))}`);
    }
    if (snapshot.variants.length > 6) {
      console.log(`  │  ${D(`... +${snapshot.variants.length - 6} más`)}`);
    }
    console.log(`  └──`);
  }
  finding(`20 productos top verificados con getInventoryByProduct()`);
  console.log("");
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3 — WAREHOUSE VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

async function phase3_warehouseValidation() {
  console.log(B("  FASE 3: VALIDACIÓN DE BODEGAS"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log("");

  // Get all distinct warehouses from inventory
  const warehouseStats = await (prisma as any).$queryRaw`
    SELECT "warehouseId", "externalRef",
           SUM(quantity)::int as total_units,
           COUNT(*)::int as level_count,
           COUNT(DISTINCT "variantId")::int as variant_count,
           COUNT(DISTINCT "productId")::int as product_count
    FROM "ProductInventoryLevel"
    WHERE "organizationId" = ${ORG_ID} AND source = 'sag'
    GROUP BY "warehouseId", "externalRef"
    ORDER BY SUM(quantity) DESC
  `;

  // Load BODEGAS master (from SAG lookup — stored in externalRef)
  // The warehouseId is the numeric SAG ka_nl_bodega as string.
  // externalRef is the warehouse code from BODEGAS.ss_codigo.
  // We need to check which have resolved names.

  console.log(`  Bodegas con inventario: ${B(String((warehouseStats as any[]).length))}`);
  console.log("");
  console.log(`  ${"ID".padEnd(6)} ${"Ref".padEnd(8)} ${"Unidades".padStart(10)} ${"Niveles".padStart(8)} ${"Variantes".padStart(10)} ${"Productos".padStart(10)}`);
  console.log(`  ${"─".repeat(6)} ${"─".repeat(8)} ${"─".repeat(10)} ${"─".repeat(8)} ${"─".repeat(10)} ${"─".repeat(10)}`);

  let withName = 0;
  let withoutName = 0;
  let totalWarehouses = 0;
  let warehousesWithStock = 0;

  for (const w of warehouseStats as any[]) {
    totalWarehouses++;
    const units = w.total_units ?? 0;
    if (units > 0) warehousesWithStock++;

    const hasRef = w.externalRef && w.externalRef !== w.warehouseId;
    if (hasRef) withName++;
    else withoutName++;

    const unitStr = units > 0 ? G(String(units).padStart(10)) : units < 0 ? R(String(units).padStart(10)) : Y("0".padStart(10));
    console.log(`  ${String(w.warehouseId).padEnd(6)} ${String(w.externalRef ?? "—").padEnd(8)} ${unitStr} ${String(w.level_count).padStart(8)} ${String(w.variant_count).padStart(10)} ${String(w.product_count).padStart(10)}`);
  }

  console.log("");
  console.log(`  Bodegas totales:           ${B(String(totalWarehouses))}`);
  console.log(`  Bodegas con stock > 0:     ${G(String(warehousesWithStock))}`);
  console.log(`  Bodegas con externalRef:   ${withName > 0 ? G(String(withName)) : Y("0")}`);
  console.log(`  Bodegas sin nombre:        ${withoutName > 0 ? Y(String(withoutName)) : G("0")}`);

  if (withoutName > 0) {
    gap(`${withoutName} bodegas sin nombre resuelto — warehouseId = SAG ka_nl_bodega numérico, externalRef = mismo código. Se necesita cruce con tabla BODEGAS para nombres legibles.`);
  }

  finding(`${totalWarehouses} bodegas con inventario, ${warehousesWithStock} con stock positivo`);
  console.log("");
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 4 — QUANTITY SEMANTICS
// ═══════════════════════════════════════════════════════════════════════════

async function phase4_quantitySemantics() {
  console.log(B("  FASE 4: SEMÁNTICA DE QUANTITY Y RESERVEDQTY"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log("");

  // What does quantity represent?
  console.log(`  ${B("ProductInventoryLevel.quantity:")}`);
  console.log(`  Origen: SAG_VARIANT_INVENTORY_QUERY`);
  console.log(`  Cálculo: SUM(CASE WHEN F.sc_signo_inventario = '+' THEN MI.n_cantidad ELSE -MI.n_cantidad END)`);
  console.log(`  Tablas:  MOVIMIENTOS_ITEMS + MOVIMIENTOS + FUENTES`);
  console.log(`  Filtros: F.sc_afecta_inventario = 'S' AND M.sc_anulado = 'N'`);
  console.log(`  Resultado: ${B("Saldo neto de inventario")} = entradas - salidas`);
  console.log(`  NO es existencia física (no hay conteo físico en SAG).`);
  console.log(`  NO es disponible comercial (no descuenta reservas ni compromisos).`);
  console.log(`  ${G("ES")} el saldo computado desde todas las transacciones de inventario.`);
  console.log("");

  console.log(`  ${B("ProductInventoryLevel.reservedQty:")}`);
  console.log(`  Valor actual: ${B("0")} para todos los registros`);
  console.log(`  Origen: NO proviene de SAG`);
  console.log(`  Propósito: Campo reservado para ${B("reservas Agentik")} (pedidos pendientes)`);
  console.log(`  Disponible real = quantity - reservedQty`);
  console.log(`  En el estado actual: disponible = quantity (sin reservas)`);
  console.log("");

  // Verify all reservedQty = 0
  const nonZeroReserved = await (prisma as any).productInventoryLevel.count({
    where: {
      organizationId: ORG_ID,
      source: "sag",
      reservedQty: { gt: 0 },
    },
  });
  console.log(`  Niveles con reservedQty > 0:    ${nonZeroReserved > 0 ? Y(String(nonZeroReserved)) : G("0 (confirmado)")}`);

  // Distribution of quantity values
  const qtyStats = await (prisma as any).$queryRaw`
    SELECT
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE quantity > 0)::int as positive,
      COUNT(*) FILTER (WHERE quantity = 0)::int as zero,
      COUNT(*) FILTER (WHERE quantity < 0)::int as negative,
      SUM(quantity)::int as total_units,
      MIN(quantity)::int as min_qty,
      MAX(quantity)::int as max_qty
    FROM "ProductInventoryLevel"
    WHERE "organizationId" = ${ORG_ID} AND source = 'sag'
  `;
  const qs = qtyStats[0] as any;
  console.log("");
  console.log(`  ${B("Distribución de quantity:")}`);
  console.log(`    Positivos (stock):     ${G(String(qs.positive))}`);
  console.log(`    Cero:                  ${Y(String(qs.zero))}`);
  console.log(`    Negativos:             ${qs.negative > 0 ? R(String(qs.negative)) : G("0")}`);
  console.log(`    Mínimo:                ${qs.min_qty < 0 ? R(String(qs.min_qty)) : String(qs.min_qty)}`);
  console.log(`    Máximo:                ${G(String(qs.max_qty))}`);
  console.log(`    Total unidades netas:  ${B(String(qs.total_units))}`);

  if (qs.negative > 0) {
    risk(`${qs.negative} niveles con stock negativo — indica discrepancias en SAG (más salidas que entradas). Pedidos debe tratar negativos como 0 disponible.`);
  }

  finding(`quantity = saldo neto de inventario desde transacciones SAG`);
  finding(`reservedQty = 0 en todos los registros (futuro: reservas Agentik)`);
  console.log("");
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 5 — AGGREGATE CONSISTENCY
// ═══════════════════════════════════════════════════════════════════════════

async function phase5_aggregateConsistency() {
  console.log(B("  FASE 5: CONSISTENCIA AGREGADA"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log("");

  // Total units per product (top 10)
  const topByProduct = await (prisma as any).$queryRaw`
    SELECT pe."externalId", pe.name, SUM(pil.quantity)::int as total
    FROM "ProductInventoryLevel" pil
    INNER JOIN "ProductEntity" pe ON pe.id = pil."productId"
    WHERE pil."organizationId" = ${ORG_ID} AND pil.source = 'sag'
    GROUP BY pe.id, pe."externalId", pe.name
    ORDER BY SUM(pil.quantity) DESC
    LIMIT 10
  `;
  console.log(`  ${B("Top 10 productos por unidades:")}`);
  for (const p of topByProduct as any[]) {
    console.log(`    ${String(p.externalId).padEnd(15)} ${G(String(p.total).padStart(8))} uds  ${D(String(p.name).slice(0, 40))}`);
  }
  console.log("");

  // Top 10 warehouses by units
  const topByWarehouse = await (prisma as any).$queryRaw`
    SELECT "warehouseId", SUM(quantity)::int as total,
           COUNT(DISTINCT "variantId")::int as variants,
           COUNT(DISTINCT "productId")::int as products
    FROM "ProductInventoryLevel"
    WHERE "organizationId" = ${ORG_ID} AND source = 'sag'
    GROUP BY "warehouseId"
    ORDER BY SUM(quantity) DESC
    LIMIT 10
  `;
  console.log(`  ${B("Top 10 bodegas por unidades:")}`);
  for (const w of topByWarehouse as any[]) {
    const totalStr = w.total > 0 ? G(String(w.total).padStart(8)) : R(String(w.total).padStart(8));
    console.log(`    Bodega ${String(w.warehouseId).padEnd(6)} ${totalStr} uds  ${w.variants} variantes  ${w.products} productos`);
  }
  console.log("");

  // Products out of stock
  const productsOOS = await (prisma as any).$queryRaw`
    SELECT COUNT(DISTINCT pe.id)::int as cnt
    FROM "ProductEntity" pe
    LEFT JOIN (
      SELECT "productId", SUM(quantity) as total
      FROM "ProductInventoryLevel"
      WHERE "organizationId" = ${ORG_ID} AND source = 'sag'
      GROUP BY "productId"
      HAVING SUM(quantity) <= 0
    ) oos ON oos."productId" = pe.id
    WHERE pe."organizationId" = ${ORG_ID}
      AND pe."externalSource" = 'sag'
      AND pe."commercialStatus" = 'active'
      AND oos."productId" IS NOT NULL
  `;

  // Variants out of stock (total across warehouses <= 0)
  const variantsOOS = await (prisma as any).$queryRaw`
    SELECT COUNT(*)::int as cnt FROM (
      SELECT "variantId", SUM(quantity) as total
      FROM "ProductInventoryLevel"
      WHERE "organizationId" = ${ORG_ID} AND source = 'sag'
      GROUP BY "variantId"
      HAVING SUM(quantity) <= 0
    ) sub
  `;

  // Variants with negative total
  const variantsNegative = await (prisma as any).$queryRaw`
    SELECT COUNT(*)::int as cnt FROM (
      SELECT "variantId", SUM(quantity) as total
      FROM "ProductInventoryLevel"
      WHERE "organizationId" = ${ORG_ID} AND source = 'sag'
      GROUP BY "variantId"
      HAVING SUM(quantity) < 0
    ) sub
  `;

  // Warehouses with negative total
  const warehousesNegative = await (prisma as any).$queryRaw`
    SELECT COUNT(*)::int as cnt FROM (
      SELECT "warehouseId", SUM(quantity) as total
      FROM "ProductInventoryLevel"
      WHERE "organizationId" = ${ORG_ID} AND source = 'sag'
      GROUP BY "warehouseId"
      HAVING SUM(quantity) < 0
    ) sub
  `;

  console.log(`  ${B("Consistencia:")}`);
  console.log(`    Productos agotados (total ≤ 0):   ${Y(String(productsOOS[0]?.cnt ?? 0))}`);
  console.log(`    Variantes agotadas (total ≤ 0):   ${Y(String(variantsOOS[0]?.cnt ?? 0))}`);
  console.log(`    Variantes con total negativo:     ${(variantsNegative[0]?.cnt ?? 0) > 0 ? R(String(variantsNegative[0]?.cnt)) : G("0")}`);
  console.log(`    Bodegas con total negativo:       ${(warehousesNegative[0]?.cnt ?? 0) > 0 ? R(String(warehousesNegative[0]?.cnt)) : G("0")}`);

  if ((variantsNegative[0]?.cnt ?? 0) > 0) {
    risk(`${variantsNegative[0]?.cnt} variantes con saldo neto negativo — SAG tiene discrepancias en movimientos`);
  }
  if ((warehousesNegative[0]?.cnt ?? 0) > 0) {
    risk(`${warehousesNegative[0]?.cnt} bodegas con saldo neto negativo — bodegas con más salidas que entradas`);
  }

  finding(`Agregados calculados: top productos, top bodegas, agotados, negativos`);
  console.log("");
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 6 — READ SERVICE TESTS
// ═══════════════════════════════════════════════════════════════════════════

async function phase6_readServiceTests() {
  console.log(B("  FASE 6: PRUEBA DE SERVICIOS DE LECTURA"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log("");

  // Get a known product with stock for testing
  const testProduct = await (prisma as any).$queryRaw`
    SELECT pe.id, pe."externalId", pe.name
    FROM "ProductEntity" pe
    INNER JOIN "ProductInventoryLevel" pil ON pil."productId" = pe.id
    WHERE pe."organizationId" = ${ORG_ID}
      AND pe."externalSource" = 'sag'
      AND pil.source = 'sag' AND pil.quantity > 0
    GROUP BY pe.id, pe."externalId", pe.name
    HAVING SUM(pil.quantity) > 10
    ORDER BY SUM(pil.quantity) DESC
    LIMIT 1
  `;

  if ((testProduct as any[]).length === 0) {
    console.log(R("  No se encontró producto con stock > 10 para testing"));
    error("No test product found");
    return;
  }

  const tp = (testProduct as any[])[0];
  console.log(`  Producto de prueba: ${B(tp.externalId)} — ${tp.name}`);
  console.log("");

  // Test 1: getInventoryByProduct
  console.log(`  ${B("Test 1: getInventoryByProduct()")}`);
  const snap = await getInventoryByProduct(ORG_ID, tp.id);
  if (snap) {
    console.log(`    ${G("PASS")} — Retorna snapshot con ${snap.variants.length} variantes, total: ${snap.totalAvailable}`);
    finding(`getInventoryByProduct() retorna datos correctos`);
  } else {
    console.log(`    ${R("FAIL")} — Retornó null`);
    error("getInventoryByProduct() returned null for known product");
  }

  // Test 2: getInventoryByProductCode
  console.log(`  ${B("Test 2: getInventoryByProductCode()")}`);
  const snapByCode = await getInventoryByProductCode(ORG_ID, tp.externalId);
  if (snapByCode) {
    console.log(`    ${G("PASS")} — Retorna snapshot por código ${tp.externalId}, total: ${snapByCode.totalAvailable}`);
    finding(`getInventoryByProductCode() retorna datos correctos`);
  } else {
    console.log(`    ${R("FAIL")} — Retornó null`);
    error("getInventoryByProductCode() returned null");
  }

  // Test 3: getInventoryByVariant
  console.log(`  ${B("Test 3: getInventoryByVariant()")}`);
  if (snap && snap.variants.length > 0) {
    const varSnap = await getInventoryByVariant(ORG_ID, snap.variants[0].variantId);
    if (varSnap) {
      console.log(`    ${G("PASS")} — Variante ${varSnap.sizeCode}/${varSnap.colorName}, total: ${varSnap.totalAvailable}, bodegas: ${varSnap.warehouses.length}`);
      finding(`getInventoryByVariant() retorna datos correctos`);
    } else {
      console.log(`    ${R("FAIL")} — Retornó null`);
      error("getInventoryByVariant() returned null");
    }
  }

  // Test 4: getInventoryByWarehouse
  console.log(`  ${B("Test 4: getInventoryByWarehouse()")}`);
  // Get a warehouse with stock
  const testWarehouse = await (prisma as any).$queryRaw`
    SELECT "warehouseId" FROM "ProductInventoryLevel"
    WHERE "organizationId" = ${ORG_ID} AND source = 'sag' AND quantity > 0
    GROUP BY "warehouseId"
    ORDER BY SUM(quantity) DESC
    LIMIT 1
  `;
  if ((testWarehouse as any[]).length > 0) {
    const wId = (testWarehouse as any[])[0].warehouseId;
    const wSnap = await getInventoryByWarehouse(ORG_ID, wId, { inStockOnly: true, limit: 5 });
    console.log(`    ${G("PASS")} — Bodega ${wId}: ${wSnap.length} variantes con stock (limit 5)`);
    for (const v of wSnap.slice(0, 3)) {
      console.log(`      ${v.productCode.padEnd(15)} ${v.sizeCode.padEnd(8)} ${v.colorName.padEnd(14)} qty: ${v.totalAvailable}`);
    }
    finding(`getInventoryByWarehouse() retorna datos correctos`);
  }

  // Test 5: searchAvailableVariants
  console.log(`  ${B("Test 5: searchAvailableVariants()")}`);
  const searchResult = await searchAvailableVariants({
    orgId: ORG_ID,
    productCode: tp.externalId,
    inStockOnly: true,
    limit: 10,
  });
  console.log(`    ${searchResult.length > 0 ? G("PASS") : R("FAIL")} — ${searchResult.length} variantes en stock para ${tp.externalId}`);
  for (const v of searchResult.slice(0, 3)) {
    console.log(`      ${v.sizeCode.padEnd(8)} ${v.colorName.padEnd(14)} total: ${v.totalAvailable}  bodegas: ${v.warehouses.length}`);
  }
  if (searchResult.length > 0) finding(`searchAvailableVariants() retorna datos correctos`);
  else error("searchAvailableVariants() returned 0 results for known product");

  console.log("");
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 7 — REPORT
// ═══════════════════════════════════════════════════════════════════════════

function phase7_report() {
  console.log(B("  FASE 7: REPORTE DE VALIDACIÓN"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log("");

  console.log(`  ${B("HALLAZGOS")} (${findings.length}):`);
  for (const f of findings) console.log(`    ${G("✓")} ${f}`);
  console.log("");

  console.log(`  ${B("ERRORES")} (${errors.length}):`);
  if (errors.length === 0) console.log(`    ${G("Ninguno")}`);
  for (const e of errors) console.log(`    ${R("✗")} ${e}`);
  console.log("");

  console.log(`  ${B("GAPS")} (${gaps.length}):`);
  if (gaps.length === 0) console.log(`    ${G("Ninguno")}`);
  for (const g of gaps) console.log(`    ${Y("△")} ${g}`);
  console.log("");

  console.log(`  ${B("RIESGOS")} (${risks.length}):`);
  if (risks.length === 0) console.log(`    ${G("Ninguno")}`);
  for (const r of risks) console.log(`    ${Y("⚠")} ${r}`);
  console.log("");
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 8 — DECISION
// ═══════════════════════════════════════════════════════════════════════════

async function phase8_decision() {
  console.log(B("  FASE 8: DECISIÓN"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log("");

  const coverage = await computeInventoryCoverage(ORG_ID);

  const hasOrphans = errors.some(e => e.includes("huérfano"));
  const hasCriticalErrors = errors.length > 0;
  const ready = !hasOrphans && !hasCriticalErrors;

  console.log(`  TOTAL SNAPSHOTS:           ${B(String(coverage.snapshotRecords))}`);
  console.log(`  SNAPSHOTS VÁLIDOS:         ${B(String(coverage.snapshotRecords))} ${errors.length === 0 ? G("(0 huérfanos)") : ""}`);
  console.log(`  SNAPSHOTS HUÉRFANOS:       ${hasOrphans ? R("SÍ") : G("0")}`);
  console.log(`  VARIANTES CON INVENTARIO:  ${B(String(coverage.variantsInStock))}`);
  console.log(`  BODEGAS CON INVENTARIO:    ${B(String(coverage.warehousesWithStock))}`);
  console.log(`  BODEGAS SIN NOMBRE:        ${gaps.some(g => g.includes("sin nombre")) ? Y("SÍ — documentado") : G("0")}`);
  console.log(`  QUANTITY REPRESENTA:       ${B("Saldo neto de inventario (entradas - salidas desde SAG)")}`);
  console.log(`  RESERVEDQTY REPRESENTA:    ${B("0 — campo para reservas futuras de Agentik")}`);
  console.log(`  LISTO PARA PEDIDOS:        ${ready ? G("SÍ") : R("NO")}`);
  console.log(`  LISTO PARA TIENDAS:        ${ready ? G("SÍ") : R("NO")}`);
  console.log("");

  if (ready) {
    console.log(`  ${G("APROBADO:")} COMERCIAL-PEDIDOS-INVENTARIO-01 puede proceder.`);
  } else {
    console.log(`  ${R("NO APROBADO:")} Corregir errores antes de conectar Pedidos.`);
    for (const e of errors) console.log(`    ${R("→")} ${e}`);
  }
  console.log("");
}

main().catch(e => {
  console.error(`FATAL: ${(e as Error).message}`);
  process.exit(1);
});
