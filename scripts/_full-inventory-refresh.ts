/**
 * _full-inventory-refresh.ts
 *
 * INVENTORY-SYNC-FRESHNESS-01 — Unified inventory refresh pipeline.
 *
 * Runs the complete inventory pipeline in sequence:
 *   1. PIL SYNC  — SAG SOAP → ProductVariant + ProductInventoryLevel
 *   2. PD RECON  — Cross-reference PD orders with SaleRecord invoices
 *   3. SNAPSHOT  — PIL + PD → CommercialCoverageSnapshot
 *
 * This is the single command that keeps inventory fresh.
 * Designed for both manual execution and cron scheduling.
 *
 * Usage:
 *   npx dotenv-cli -e .env -- npx tsx scripts/_full-inventory-refresh.ts [dryrun|sync]
 *
 * Requires: PYA_SOAP_TOKEN, PYA_SAG_BD, DATABASE_URL
 */

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";
import { syncSagInventory } from "@/lib/connectors/adapters/sag-pya-soap/inventory/sag-inventory-sync";
import { persistSagInventorySnapshot } from "@/lib/integrations/sag/sag-inventory-storage";

const ORG = "cmmpwstuf000dp5y58kj1daaj";

const LINE_MAP: Record<string, string> = {
  "1": "LT",
  "2": "CS",
  "3": "PK",
  "5": "AC",
};

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;

interface RefreshResult {
  pilSync: {
    status: string;
    productsProcessed: number;
    variantsCreated: number;
    variantsUpdated: number;
    levelsCreated: number;
    levelsUpdated: number;
    durationMs: number;
  };
  pdRecon: {
    facturado: number;
    cancelado: number;
    stillPending: number;
    durationMs: number;
  };
  snapshot: {
    refsWritten: number;
    totalDisponible: number;
    sinStock: number;
    conPedidos: number;
    durationMs: number;
  };
  totalDurationMs: number;
}

async function main() {
  const mode = (process.argv[2] || "dryrun").toLowerCase();
  if (!["dryrun", "sync"].includes(mode)) {
    console.error(R("Usage: _full-inventory-refresh.ts [dryrun|sync]"));
    process.exit(1);
  }

  const dryRun = mode === "dryrun";
  const t0 = Date.now();

  console.log("");
  console.log(B("==============================================================="));
  console.log(B("  INVENTORY-SYNC-FRESHNESS-01 — Full Inventory Refresh"));
  console.log(B(`  Mode: ${mode.toUpperCase()}`));
  console.log(B("==============================================================="));
  console.log("");

  // ── PASO 1: PIL Sync (SAG SOAP → ProductVariant + ProductInventoryLevel) ──

  console.log(B("  PASO 1 — PIL Sync (SAG SOAP → ProductVariant + PIL)"));
  console.log("");

  const token = (process.env.PYA_SOAP_TOKEN ?? "").trim();
  const database = (process.env.PYA_SAG_BD ?? "").trim() || undefined;
  const endpointUrl = process.env.PYA_SOAP_ENDPOINT?.trim() ??
    "http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";

  if (!token) {
    console.error(R("  ERROR: PYA_SOAP_TOKEN required."));
    process.exit(1);
  }

  const config: PyaApiConfig = { token, endpointUrl, database };

  const pilT0 = Date.now();
  const pilResult = await syncSagInventory(ORG, config, { dryRun });
  const pilDuration = Date.now() - pilT0;

  console.log(`  Estado:              ${pilResult.status === "success" ? G(pilResult.status) : Y(pilResult.status)}`);
  console.log(`  Productos:           ${B(String(pilResult.productsProcessed))}`);
  console.log(`  Variantes creadas:   ${G(String(pilResult.variantsCreated))}`);
  console.log(`  Variantes actualizadas: ${B(String(pilResult.variantsUpdated))}`);
  console.log(`  Niveles creados:     ${G(String(pilResult.levelsCreated))}`);
  console.log(`  Niveles actualizados: ${B(String(pilResult.levelsUpdated))}`);
  console.log(`  Bodegas:             ${B(String(pilResult.warehousesSynced))}`);
  console.log(`  Errores:             ${pilResult.errors > 0 ? R(String(pilResult.errors)) : G("0")}`);
  console.log(`  Duracion:            ${B(String(pilDuration))}ms`);
  console.log("");

  if (pilResult.status === "error") {
    console.error(R(`  PIL sync failed: ${pilResult.error}`));
    console.error(R("  Aborting pipeline."));
    process.exit(1);
  }

  // ── PASO 2: PD Reconciliation ──────────────────────────────────────────────

  console.log(B("  PASO 2 — PD Reconciliation (PENDIENTE → FACTURADO/CANCELADO)"));
  console.log("");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);
  const db = prisma as any;

  const reconT0 = Date.now();

  // Count pre-reconciliation PENDIENTE
  const prePending: Array<{ cnt: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int as cnt FROM "CustomerOrderRecord"
     WHERE "organizationId" = $1 AND status = 'PENDIENTE'`,
    ORG,
  );
  const pendingBefore = prePending[0]?.cnt ?? 0;

  if (pendingBefore === 0) {
    console.log(`  No PENDIENTE orders to reconcile.`);
  } else {
    console.log(`  PENDIENTE orders before: ${B(String(pendingBefore))}`);

    if (!dryRun) {
      // Transition PENDIENTE → FACTURADO
      const facturadoResult = await db.$executeRawUnsafe(
        `UPDATE "CustomerOrderRecord" cor
         SET status = 'FACTURADO'::"CustomerOrderStatus", "syncedAt" = NOW()
         WHERE cor."organizationId" = $1
           AND cor.status = 'PENDIENTE'
           AND EXISTS (
             SELECT 1 FROM "SaleRecord" sr
             WHERE sr."organizationId" = $1
               AND sr."customerNit" = cor."customerNit"
               AND sr."saleDate" >= cor."orderDate"
               AND sr."sagDocumentFamily" IN ('OFFICIAL_INVOICE', 'DISPATCH_REMISION', 'OTHER')
           )`,
        ORG,
      );
      console.log(`  → FACTURADO: ${G(String(facturadoResult))} orders`);

      // Transition PENDIENTE → CANCELADO (>90 days, no invoices)
      const canceladoResult = await db.$executeRawUnsafe(
        `UPDATE "CustomerOrderRecord" cor
         SET status = 'CANCELADO'::"CustomerOrderStatus", "syncedAt" = NOW()
         WHERE cor."organizationId" = $1
           AND cor.status = 'PENDIENTE'
           AND cor."orderDate" < NOW() - INTERVAL '90 days'
           AND NOT EXISTS (
             SELECT 1 FROM "SaleRecord" sr
             WHERE sr."organizationId" = $1
               AND sr."customerNit" = cor."customerNit"
               AND sr."saleDate" >= cor."orderDate"
           )`,
        ORG,
      );
      console.log(`  → CANCELADO: ${Y(String(canceladoResult))} orders`);
    } else {
      console.log(Y("  DRY RUN — PD reconciliation skipped."));
    }
  }

  // Count post-reconciliation PENDIENTE
  const postPending: Array<{ cnt: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int as cnt FROM "CustomerOrderRecord"
     WHERE "organizationId" = $1 AND status = 'PENDIENTE'`,
    ORG,
  );
  const pendingAfter = postPending[0]?.cnt ?? 0;
  const reconDuration = Date.now() - reconT0;

  console.log(`  PENDIENTE orders after: ${B(String(pendingAfter))}`);
  console.log(`  Duracion: ${B(String(reconDuration))}ms`);
  console.log("");

  // ── PASO 3: Coverage Snapshot Rebuild ──────────────────────────────────────

  console.log(B("  PASO 3 — Coverage Snapshot (PIL + PD → CommercialCoverageSnapshot)"));
  console.log("");

  const snapT0 = Date.now();

  // Aggregate PIL across commercial warehouses (B01 + B04)
  const commercialWarehouses = ["01", "04"];
  const commercialAgg: Array<{ productId: string; total_qty: number }> = await db.$queryRawUnsafe(
    `SELECT "productId", SUM("quantity")::float as total_qty
     FROM "ProductInventoryLevel"
     WHERE "organizationId" = $1 AND "externalRef" = ANY($2::text[])
     GROUP BY "productId"`,
    ORG,
    commercialWarehouses,
  );

  console.log(`  Productos en B01+B04: ${B(String(commercialAgg.length))}`);

  // Load product metadata
  const productIds = commercialAgg.map(r => r.productId);
  const products = await db.productEntity.findMany({
    where: { id: { in: productIds } },
    select: { id: true, sku: true, name: true, productLine: true },
  });

  const productMap = new Map<string, { sku: string; name: string; line: string }>();
  for (const p of products) {
    productMap.set(p.id, {
      sku: p.sku ?? p.id,
      name: p.name ?? "—",
      line: LINE_MAP[p.productLine ?? ""] ?? "OT",
    });
  }

  // Aggregate pending orders (status-based)
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

  console.log(`  PD pendientes: ${B(String(pdAgg.length))} referencias`);

  // Build snapshot rows
  const snapshotAt = new Date();
  let totalDisponible = 0;
  let sinStockCount = 0;

  interface CoverageRow {
    refCode: string;
    description: string;
    line: string;
    disponible: number;
    pendingOrdersQty: number;
  }

  const rows: CoverageRow[] = [];

  for (const agg of commercialAgg) {
    const product = productMap.get(agg.productId);
    if (!product) continue;

    const warehouseQty = Math.round(agg.total_qty);
    const pendingOrders = Math.round(pendingByRef.get(product.sku) ?? 0);
    const disponible = warehouseQty - pendingOrders;

    rows.push({
      refCode: product.sku,
      description: product.name,
      line: product.line,
      disponible,
      pendingOrdersQty: pendingOrders,
    });

    totalDisponible += disponible;
    if (disponible <= 0) sinStockCount++;
  }

  // Persist snapshot (LT + CS only)
  const commercialRows = rows.filter(r => r.line === "LT" || r.line === "CS");

  if (!dryRun) {
    const normalizedRows = commercialRows.map(r => ({
      refCode: r.refCode,
      description: r.description,
      line: r.line as "LT" | "CS",
      disponible: r.disponible,
      warehouseQty: r.disponible + r.pendingOrdersQty,
      pendingOrdersQty: r.pendingOrdersQty,
      category: "—",
      productType: "—",
      bodega: "01+04",
    }));

    const result = await persistSagInventorySnapshot(ORG, normalizedRows, snapshotAt);
    console.log(`  Snapshot escrito: ${G(String(result.refsWritten))} refs`);
  } else {
    console.log(Y(`  DRY RUN — ${commercialRows.length} refs would be written.`));
  }

  const snapDuration = Date.now() - snapT0;

  console.log(`  Total referencias: ${B(String(rows.length))}`);
  console.log(`  Comercial (LT+CS): ${B(String(commercialRows.length))}`);
  console.log(`  Total disponible: ${G(String(totalDisponible))}`);
  console.log(`  Sin stock: ${sinStockCount > 0 ? R(String(sinStockCount)) : G("0")}`);
  console.log(`  Con pedidos pendientes: ${B(String(pendingByRef.size))}`);
  console.log(`  Duracion: ${B(String(snapDuration))}ms`);
  console.log("");

  // ── RESUMEN ────────────────────────────────────────────────────────────────

  const totalDuration = Date.now() - t0;

  console.log(B("==============================================================="));
  console.log(B("  RESUMEN — Full Inventory Refresh"));
  console.log(B("==============================================================="));
  console.log(`  PIL Sync:       ${pilResult.status === "success" ? G("OK") : Y(pilResult.status)} (${pilDuration}ms)`);
  console.log(`  PD Recon:       ${pendingBefore} → ${pendingAfter} pendientes (${reconDuration}ms)`);
  console.log(`  Snapshot:       ${commercialRows.length} refs, ${totalDisponible} disp (${snapDuration}ms)`);
  console.log(`  Total:          ${B(String(totalDuration))}ms`);
  console.log(`  Snapshot at:    ${B(snapshotAt.toISOString())}`);
  console.log(B("==============================================================="));
  console.log("");

  await prisma.$disconnect();
  pool.end();
}

main().catch(e => {
  console.error(`FATAL: ${(e as Error).message}`);
  process.exit(1);
});
