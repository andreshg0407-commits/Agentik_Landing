/**
 * lib/integrations/sag/inventory-refresh-pipeline.ts
 *
 * INVENTORY-SYNC-FRESHNESS-01 — Unified inventory refresh pipeline.
 *
 * Runs the three-step inventory pipeline:
 *   1. PIL SYNC  — SAG SOAP → ProductVariant + ProductInventoryLevel
 *   2. PD RECON  — Cross-reference PD with SaleRecord, transition statuses
 *   3. SNAPSHOT  — PIL + PD → CommercialCoverageSnapshot
 *
 * Used by:
 *   - /api/cron/inventory-refresh (daily cron)
 *   - /api/orgs/[orgSlug]/integrations/sag/refresh-inventory (on-demand)
 *   - scripts/_full-inventory-refresh.ts (CLI)
 *
 * The single biggest accuracy improvement for inventory gaps:
 * reducing the days between SAG saldo sync and Agentik snapshot.
 */

import { prisma } from "@/lib/prisma";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";
import { syncSagInventory } from "@/lib/connectors/adapters/sag-pya-soap/inventory/sag-inventory-sync";
import { persistSagInventorySnapshot } from "./sag-inventory-storage";

// ── Line mapping (from SAG LINEAS FK — Phase 7: shared map) ─────────────────

import { SAG_LINE_FK_MAP as LINE_MAP } from "@/lib/comercial/line-map";

// ── Result type ──────────────────────────────────────────────────────────────

export interface InventoryRefreshResult {
  status: "success" | "partial" | "error";
  pilSync: {
    status: string;
    productsProcessed: number;
    variantsUpdated: number;
    levelsUpdated: number;
    warehousesSynced: number;
    durationMs: number;
  };
  pdRecon: {
    pendingBefore: number;
    facturado: number;
    cancelado: number;
    pendingAfter: number;
    durationMs: number;
  };
  snapshot: {
    refsWritten: number;
    totalDisponible: number;
    sinStock: number;
    pendingRefs: number;
    snapshotAt: string;
    durationMs: number;
  };
  totalDurationMs: number;
  error?: string;
}

// ── Pipeline ─────────────────────────────────────────────────────────────────

/**
 * Runs the full inventory refresh pipeline for an organization.
 *
 * Resolves PyaApiConfig from env vars (same source as the CLI sync script).
 * All three steps run in sequence — each depends on the previous.
 */
export async function refreshInventoryPipeline(
  orgId: string,
): Promise<InventoryRefreshResult> {
  const t0 = Date.now();
  const db = prisma as any;

  // ── Resolve SAG config ───────────────────────────────────────────────────

  const token = (process.env.PYA_SOAP_TOKEN ?? "").trim();
  const database = (process.env.PYA_SAG_BD ?? "").trim() || undefined;
  const endpointUrl =
    process.env.PYA_SOAP_ENDPOINT?.trim() ??
    "http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";

  if (!token) {
    return {
      status: "error",
      pilSync: emptyPilResult(),
      pdRecon: emptyPdResult(),
      snapshot: emptySnapshotResult(),
      totalDurationMs: Date.now() - t0,
      error: "PYA_SOAP_TOKEN not configured",
    };
  }

  const config: PyaApiConfig = { token, endpointUrl, database };

  // ── STEP 1: PIL Sync ─────────────────────────────────────────────────────

  const pilT0 = Date.now();
  const pilResult = await syncSagInventory(orgId, config);
  const pilDuration = Date.now() - pilT0;

  console.log(
    `[inventory-refresh] PIL sync: ${pilResult.status} — ${pilResult.productsProcessed} products, ${pilResult.levelsUpdated} levels updated (${pilDuration}ms)`,
  );

  if (pilResult.status === "error") {
    return {
      status: "error",
      pilSync: {
        status: pilResult.status,
        productsProcessed: pilResult.productsProcessed,
        variantsUpdated: pilResult.variantsUpdated,
        levelsUpdated: pilResult.levelsUpdated,
        warehousesSynced: pilResult.warehousesSynced,
        durationMs: pilDuration,
      },
      pdRecon: emptyPdResult(),
      snapshot: emptySnapshotResult(),
      totalDurationMs: Date.now() - t0,
      error: `PIL sync failed: ${pilResult.error}`,
    };
  }

  // ── STEP 2: PD Reconciliation ────────────────────────────────────────────

  const reconT0 = Date.now();

  const prePending: Array<{ cnt: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int as cnt FROM "CustomerOrderRecord"
     WHERE "organizationId" = $1 AND status = 'PENDIENTE'`,
    orgId,
  );
  const pendingBefore = prePending[0]?.cnt ?? 0;

  let facturadoCount = 0;
  let canceladoCount = 0;

  if (pendingBefore > 0) {
    // FACTURADO: customerNit has SaleRecord with saleDate >= orderDate
    facturadoCount = await db.$executeRawUnsafe(
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
      orgId,
    );

    // CANCELADO: >90 days old, no customer invoices
    canceladoCount = await db.$executeRawUnsafe(
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
      orgId,
    );
  }

  const postPending: Array<{ cnt: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int as cnt FROM "CustomerOrderRecord"
     WHERE "organizationId" = $1 AND status = 'PENDIENTE'`,
    orgId,
  );
  const pendingAfter = postPending[0]?.cnt ?? 0;
  const reconDuration = Date.now() - reconT0;

  console.log(
    `[inventory-refresh] PD recon: ${pendingBefore} → ${pendingAfter} pending, ${facturadoCount} facturado, ${canceladoCount} cancelado (${reconDuration}ms)`,
  );

  // ── STEP 3: Coverage Snapshot ────────────────────────────────────────────

  const snapT0 = Date.now();

  // SAG-DATAFLOW-FIX-01: include all commercial + vendedor bodegas
  // Previously only ["01","04"] — hid 37.2% of inventory data
  const commercialWarehouses = ["01", "04", "14", "15"];
  const commercialAgg: Array<{ productId: string; total_qty: number }> =
    await db.$queryRawUnsafe(
      `SELECT "productId", SUM("quantity")::float as total_qty
       FROM "ProductInventoryLevel"
       WHERE "organizationId" = $1 AND "externalRef" = ANY($2::text[])
       GROUP BY "productId"`,
      orgId,
      commercialWarehouses,
    );

  // Load product metadata
  const productIds = commercialAgg.map((r) => r.productId);
  const products = await db.productEntity.findMany({
    where: { id: { in: productIds } },
    select: { id: true, sku: true, name: true, productLine: true, subgrupoId: true, subgrupoSag: true },
  });

  const productMap = new Map<
    string,
    { sku: string; name: string; line: string; subgrupoId: number | null; subgrupoSag: string | null; isAccessory: boolean }
  >();
  for (const p of products) {
    productMap.set(p.id, {
      sku: p.sku ?? p.id,
      name: p.name ?? "—",
      line: LINE_MAP[p.productLine ?? ""] ?? "OT",
      subgrupoId: p.subgrupoId ?? null,
      subgrupoSag: p.subgrupoSag ?? null,
      isAccessory: p.productLine === "5",
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
      orgId,
    );

  const pendingByRef = new Map<string, number>();
  for (const pd of pdAgg) {
    if (pd.productRef)
      pendingByRef.set(pd.productRef, Math.round(pd.pending_qty));
  }

  // Aggregate CRM DRAFT reservations — PRODUCTO EN PROCESO only
  // (INVENTORY-CRM-RESERVATION-LAYER-01)
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
      orgId,
    );

  const crmByRef = new Map<string, number>();
  for (const c of crmAgg) {
    if (c.reference)
      crmByRef.set(c.reference, Math.round(c.reserved_qty));
  }

  // Build rows
  let totalDisponible = 0;
  let sinStockCount = 0;

  const snapRows: Array<{
    refCode: string;
    description: string;
    line: string;
    disponible: number;
    pendingOrdersQty: number;
    physicalQty: number;
    crmReservedQty: number;
    subgrupoId: number | null;
    subgrupoSag: string | null;
    isAccessory: boolean;
  }> = [];

  for (const agg of commercialAgg) {
    const product = productMap.get(agg.productId);
    if (!product) continue;

    const physicalQty = Math.round(agg.total_qty);
    const pendingOrders = Math.round(pendingByRef.get(product.sku) ?? 0);
    const crmReserved = Math.round(crmByRef.get(product.sku) ?? 0);
    // INVENTORY-CRM-RESERVATION-LAYER-01: disponible = max(0, physical - PD - CRM)
    const disponible = Math.max(0, physicalQty - pendingOrders - crmReserved);

    snapRows.push({
      refCode: product.sku,
      description: product.name,
      line: product.line,
      disponible,
      pendingOrdersQty: pendingOrders,
      physicalQty,
      crmReservedQty: crmReserved,
      subgrupoId: product.subgrupoId,
      subgrupoSag: product.subgrupoSag,
      isAccessory: product.isAccessory,
    });

    totalDisponible += disponible;
    if (disponible <= 0) sinStockCount++;
  }

  // COMERCIAL-INVENTARIO-IMPORT-PIPELINE-CANONICALIZATION-01:
  // Exclude productLine="5" (IMPORTACION/ACCESORIOS) from textile snapshot.
  // These refs belong to the accessory pipeline (PIL bodegas 26/27).
  // Including them here causes double-counting and wrong bodega data.
  const accessoryExcluded = snapRows.filter((r) => r.isAccessory).length;
  const commercialRows = snapRows.filter((r) => !r.isAccessory);
  const snapshotAt = new Date();

  if (accessoryExcluded > 0) {
    console.log(
      `[inventory-refresh] Excluded ${accessoryExcluded} accessory refs (productLine=5) from textile snapshot`,
    );
  }

  const normalizedRows = commercialRows.map((r) => ({
    refCode: r.refCode,
    description: r.description,
    line: r.line as "LT" | "CS" | "OTRO",
    disponible: r.disponible,
    warehouseQty: r.physicalQty,
    pendingOrdersQty: r.pendingOrdersQty,
    category: "—",
    productType: "—",
    bodega: "01+04+14+15",
    physicalQty: r.physicalQty,
    crmReservedQty: r.crmReservedQty,
    subgrupoId: r.subgrupoId ?? undefined,
    subgrupoSag: r.subgrupoSag ?? undefined,
  }));

  const persisted = await persistSagInventorySnapshot(
    orgId,
    normalizedRows,
    snapshotAt,
  );

  const snapDuration = Date.now() - snapT0;

  console.log(
    `[inventory-refresh] CRM reservations: ${crmByRef.size} refs with PRODUCTO EN PROCESO deductions`,
  );
  console.log(
    `[inventory-refresh] Snapshot: ${persisted.refsWritten} refs, ${totalDisponible} disponible, ${sinStockCount} sin stock (${snapDuration}ms)`,
  );

  // ── Result ───────────────────────────────────────────────────────────────

  return {
    status: pilResult.errors > 0 ? "partial" : "success",
    pilSync: {
      status: pilResult.status,
      productsProcessed: pilResult.productsProcessed,
      variantsUpdated: pilResult.variantsUpdated,
      levelsUpdated: pilResult.levelsUpdated,
      warehousesSynced: pilResult.warehousesSynced,
      durationMs: pilDuration,
    },
    pdRecon: {
      pendingBefore,
      facturado: facturadoCount,
      cancelado: canceladoCount,
      pendingAfter,
      durationMs: reconDuration,
    },
    snapshot: {
      refsWritten: persisted.refsWritten,
      totalDisponible,
      sinStock: sinStockCount,
      pendingRefs: pendingByRef.size,
      snapshotAt: snapshotAt.toISOString(),
      durationMs: snapDuration,
    },
    totalDurationMs: Date.now() - t0,
  };
}

// ── Empty result helpers ─────────────────────────────────────────────────────

function emptyPilResult() {
  return {
    status: "skipped",
    productsProcessed: 0,
    variantsUpdated: 0,
    levelsUpdated: 0,
    warehousesSynced: 0,
    durationMs: 0,
  };
}

function emptyPdResult() {
  return {
    pendingBefore: 0,
    facturado: 0,
    cancelado: 0,
    pendingAfter: 0,
    durationMs: 0,
  };
}

function emptySnapshotResult() {
  return {
    refsWritten: 0,
    totalDisponible: 0,
    sinStock: 0,
    pendingRefs: 0,
    snapshotAt: new Date().toISOString(),
    durationMs: 0,
  };
}
