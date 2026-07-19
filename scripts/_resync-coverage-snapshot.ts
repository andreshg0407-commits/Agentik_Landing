/**
 * _resync-coverage-snapshot.ts
 *
 * CASTILLITOS-SAG-FULL-RESYNC-01 + INVENTORY-COMMERCIAL-AVAILABILITY-MULTI-BODEGA-01
 *
 * Reads existing ProductInventoryLevel + ProductEntity data,
 * aggregates by product reference (SKU) across commercial warehouses,
 * and writes to CommercialCoverageSnapshot via sag-inventory-storage pipeline.
 *
 * MULTI-BODEGA (INVENTORY-COMMERCIAL-AVAILABILITY-MULTI-BODEGA-01):
 *   Textile availability = Bodega 01 (dispatch) + Bodega 04 (production/support)
 *   This reflects the real Castillitos flow where B01 goes negative when
 *   sales/dispatch precede transfers from production (B04).
 *
 * Line mapping (from SAG LINEAS FK):
 *   1 → "LT" (Latin Kids — L-prefix products)
 *   2 → "CS" (Castillitos — C-prefix products)
 *   3 → "PK" (Packaging — bolsas)
 *   5 → "AC" (Accessories — baby accessories)
 *   Other → "OT"
 *
 * READ-ONLY against SAG. Writes only to Agentik CommercialCoverageSnapshot.
 *
 * Usage: npx dotenv-cli -e .env -- npx tsx scripts/_resync-coverage-snapshot.ts [dryrun|sync]
 */

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { SAG_LINE_FK_MAP as LINE_MAP } from "@/lib/comercial/line-map";

const ORG = "cmmpwstuf000dp5y58kj1daaj";

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;

async function main() {
  const mode = (process.argv[2] || "dryrun").toLowerCase();
  if (!["dryrun", "sync"].includes(mode)) {
    console.error(R("Usage: _resync-coverage-snapshot.ts [dryrun|sync]"));
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);
  const db = prisma as any;

  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  CASTILLITOS-SAG-FULL-RESYNC-01 — Coverage Snapshot Builder"));
  console.log(B(`  Mode: ${mode.toUpperCase()}`));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log("");

  // 1. Aggregate ProductInventoryLevel by product across commercial warehouses
  // MULTI-BODEGA: Textile uses B01 (dispatch) + B04 (production/support)
  const commercialWarehouses = ["01", "04"];
  const commercialAgg: Array<{
    productId: string;
    total_qty: number;
  }> = await db.$queryRawUnsafe(
    `SELECT "productId", SUM("quantity")::float as total_qty
     FROM "ProductInventoryLevel"
     WHERE "organizationId" = $1 AND "externalRef" = ANY($2::text[])
     GROUP BY "productId"`,
    ORG,
    commercialWarehouses,
  );

  console.log(`  Commercial warehouse products (B${commercialWarehouses.join("+B")}): ${B(String(commercialAgg.length))}`);

  // 2. Load all relevant product entities
  const productIds = commercialAgg.map(r => r.productId);
  const products = await db.productEntity.findMany({
    where: { id: { in: productIds } },
    select: { id: true, sku: true, name: true, productLine: true, category: true },
  });

  const productMap = new Map<string, { sku: string; name: string; line: string }>();
  for (const p of products) {
    productMap.set(p.id, {
      sku: p.sku ?? p.id,
      name: p.name ?? "—",
      line: LINE_MAP[p.productLine ?? ""] ?? "OT",
    });
  }

  // 3. Pending orders deduction — aggregate from CustomerOrderLine (INVENTORY-PENDING-ORDERS-SYNC-01).
  // Sums quantity per referenceCode across PENDIENTE CustomerOrderRecords.
  // STATUS-BASED FILTER (INVENTORY-PD-STATUS-RECONCILIATION-01):
  // PD orders are reconciled against SaleRecord invoices — fulfilled orders
  // transitioned to FACTURADO/CANCELADO. Only genuinely PENDIENTE orders remain.
  // No recency window needed — status is the source of truth.
  const pdAgg: Array<{ productRef: string; pending_qty: number }> =
    await db.$queryRawUnsafe(
      `SELECT col."referenceCode" AS "productRef",
              SUM(col."quantity")::float AS "pending_qty"
       FROM "CustomerOrderLine" col
       JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
       WHERE col."organizationId" = $1
         AND cor.status = 'PENDIENTE'
       GROUP BY col."referenceCode"
       HAVING SUM(col."quantity") > 0`,
      ORG,
    );

  const pendingByRef = new Map<string, number>();
  for (const pd of pdAgg) {
    if (pd.productRef) pendingByRef.set(pd.productRef, Math.round(pd.pending_qty));
  }

  console.log(`  Open PD orders with qty: ${B(String(pdAgg.length))} references`);

  // 3b. CRM DRAFT reservations — PRODUCTO EN PROCESO only (INVENTORY-CRM-RESERVATION-LAYER-01)
  const crmAgg: Array<{ reference: string; reserved_qty: number }> =
    await db.$queryRawUnsafe(
      `SELECT cql."reference", SUM(cql.qty)::float AS "reserved_qty"
       FROM "CRMQuoteLine" cql
       JOIN "CRMQuote" cq ON cq.id = cql."quoteId"
       WHERE cql."organizationId" = $1
         AND cq.status = 'DRAFT'
         AND cql."warehouseName" = 'PRODUCTO EN PROCESO'
       GROUP BY cql."reference"
       HAVING SUM(cql.qty) > 0`,
      ORG,
    );

  const crmByRef = new Map<string, number>();
  for (const c of crmAgg) {
    if (c.reference) crmByRef.set(c.reference, Math.round(c.reserved_qty));
  }

  console.log(`  CRM DRAFT reservations (PRODUCTO EN PROCESO): ${B(String(crmAgg.length))} references`);

  // 4. Build CommercialCoverageSnapshot rows
  const snapshotAt = new Date();
  let ltCount = 0;
  let csCount = 0;
  let otCount = 0;
  let totalDisponible = 0;
  let sinStockCount = 0;

  interface CoverageRow {
    refCode: string;
    description: string;
    line: string;
    disponible: number;
    pendingOrdersQty: number;
    physicalQty: number;
    crmReservedQty: number;
  }

  const rows: CoverageRow[] = [];

  for (const agg of commercialAgg) {
    const product = productMap.get(agg.productId);
    if (!product) continue;

    const physicalQty = Math.round(agg.total_qty);
    const pendingOrders = Math.round(pendingByRef.get(product.sku) ?? 0);
    const crmReserved = Math.round(crmByRef.get(product.sku) ?? 0);
    // INVENTORY-CRM-RESERVATION-LAYER-01: disponible = max(0, physical - PD - CRM)
    const disponible = Math.max(0, physicalQty - pendingOrders - crmReserved);

    rows.push({
      refCode: product.sku,
      description: product.name,
      line: product.line,
      disponible,
      pendingOrdersQty: pendingOrders,
      physicalQty,
      crmReservedQty: crmReserved,
    });

    if (product.line === "LT") ltCount++;
    else if (product.line === "CS") csCount++;
    else otCount++;

    totalDisponible += disponible;
    if (disponible <= 0) sinStockCount++;
  }

  console.log("");
  console.log(B("  RESUMEN DE DATOS"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(`  Total referencias:        ${B(String(rows.length))}`);
  console.log(`  Latin Kids (LT):          ${G(String(ltCount))}`);
  console.log(`  Castillitos (CS):         ${G(String(csCount))}`);
  console.log(`  Otros (PK/AC/OT):         ${Y(String(otCount))}`);
  console.log(`  Total disponible:         ${G(String(totalDisponible))}`);
  console.log(`  Sin stock:                ${sinStockCount > 0 ? R(String(sinStockCount)) : G("0")}`);
  console.log(`  Con pedidos pendientes:   ${B(String(pendingByRef.size))}`);
  console.log(`  Con reservas CRM:         ${B(String(crmByRef.size))}`);
  console.log("");

  // Show 10 sample rows
  console.log(B("  MUESTRA (10 filas)"));
  console.log(`  ${"REF".padEnd(15)} ${"DESCRIPCIÓN".padEnd(35)} ${"LÍNEA".padEnd(5)} ${"DISP".padStart(6)} ${"PD".padStart(6)}`);
  console.log(`  ${"─".repeat(15)} ${"─".repeat(35)} ${"─".repeat(5)} ${"─".repeat(6)} ${"─".repeat(6)}`);
  for (const r of rows.slice(0, 10)) {
    console.log(`  ${r.refCode.padEnd(15)} ${r.description.slice(0, 33).padEnd(35)} ${r.line.padEnd(5)} ${String(r.disponible).padStart(6)} ${String(r.pendingOrdersQty).padStart(6)}`);
  }
  console.log("");

  if (mode === "dryrun") {
    console.log(Y("  DRY RUN — No se escribieron datos. Use 'sync' para persistir."));
    console.log("");
    await prisma.$disconnect();
    pool.end();
    return;
  }

  // 5. Persist to CommercialCoverageSnapshot
  // Filter to only LT/CS lines (the engine only knows these two)
  const commercialRows = rows.filter(r => r.line === "LT" || r.line === "CS");
  console.log(`  Commercial rows (LT+CS): ${B(String(commercialRows.length))}`);
  console.log(B("  ESCRIBIENDO CommercialCoverageSnapshot..."));
  const t0 = Date.now();

  // Use the existing storage function directly
  const { persistSagInventorySnapshot } = await import(
    "../lib/integrations/sag/sag-inventory-storage"
  );

  // Map to SagInventoryNormalizedRow shape
  const normalizedRows = commercialRows.map(r => ({
    refCode: r.refCode,
    description: r.description,
    line: r.line as "LT" | "CS",
    disponible: r.disponible,
    warehouseQty: r.physicalQty,
    pendingOrdersQty: r.pendingOrdersQty,
    category: "—",
    productType: "—",
    bodega: "01+04",
    physicalQty: r.physicalQty,
    crmReservedQty: r.crmReservedQty,
  }));

  const result = await persistSagInventorySnapshot(
    ORG,
    normalizedRows,
    snapshotAt,
  );

  const elapsed = Date.now() - t0;

  console.log("");
  console.log(B("  RESULTADO"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(`  Registros escritos:   ${G(String(result.refsWritten))}`);
  console.log(`  Duración:             ${B(String(elapsed))}ms`);
  console.log(`  Snapshot at:          ${B(snapshotAt.toISOString())}`);
  console.log("");

  // Verify
  const postCount = await db.commercialCoverageSnapshot.count({
    where: { organizationId: ORG },
  });
  console.log(`  CommercialCoverageSnapshot total: ${G(String(postCount))}`);
  console.log("");

  await prisma.$disconnect();
  pool.end();
}

main().catch(e => {
  console.error(`FATAL: ${(e as Error).message}`);
  process.exit(1);
});
