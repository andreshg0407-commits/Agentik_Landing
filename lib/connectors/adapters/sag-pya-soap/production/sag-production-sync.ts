/**
 * sag-production-sync.ts
 *
 * PRODUCTION-SYNC-01A — Sync service for SAG production orders (fuente 33).
 * Reads OP headers + lines from SAG MOVIMIENTOS, normalizes, and upserts
 * into ProductionOrder / ProductionOrderLine tables.
 *
 * READ-ONLY against SAG. Writes only to Agentik's Prisma database.
 * Idempotent: uses @@unique([organizationId, erpMovId]) for headers
 * and @@unique([organizationId, erpItemId]) for lines.
 */

import { consultaSagJson } from "@/lib/connectors/pya/client";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";
import { buildProductionSnapshots } from "./sag-production-normalizer";
import type {
  ProductionSyncResult,
  ProductionSyncMetrics,
  ProductionSyncError,
  ProductionOrderSnapshot,
} from "@/lib/production/production-types";
import { prisma } from "@/lib/prisma";

// ── Queries ───────────────────────────────────────────────────────────────────

function buildHeaderQuery(sinceDate: Date | null): string {
  const base = `
    SELECT m.*
    FROM MOVIMIENTOS m
    WHERE m.ka_ni_fuente = 33
  `;
  if (sinceDate) {
    const iso = sinceDate.toISOString().split("T")[0];
    return `${base} AND m.d_fecha_documento >= '${iso}' ORDER BY m.d_fecha_documento DESC`;
  }
  return `${base} ORDER BY m.d_fecha_documento DESC`;
}

function buildItemsQuery(movIds: number[]): string {
  if (movIds.length === 0) return "SELECT TOP 0 * FROM MOVIMIENTOS_ITEMS";
  // SAG SQL: IN clause with integer list
  const idList = movIds.join(",");
  return `
    SELECT mi.*, v.k_sc_codigo_articulo, v.sc_detalle_articulo
    FROM MOVIMIENTOS_ITEMS mi
    LEFT JOIN v_articulos v ON v.ka_nl_articulo = mi.ka_nl_articulo
    WHERE mi.ka_nl_movimiento IN (${idList})
  `;
}

// ── Sync Engine ───────────────────────────────────────────────────────────────

interface SyncOptions {
  organizationId: string;
  sagConfig: PyaApiConfig;
  sagDatabase: string;
  /** Only sync OPs with documentDate >= sinceDate. Null = full sync. */
  sinceDate?: Date | null;
  /** If true, reads from SAG but does NOT write to Prisma. */
  dryRun?: boolean;
  /** Max OP headers to process per batch (default: 500). */
  batchSize?: number;
}

export async function syncProductionOrders(
  opts: SyncOptions,
): Promise<ProductionSyncResult> {
  const start = Date.now();
  const sinceDate = opts.sinceDate ?? null;
  const dryRun = opts.dryRun ?? false;
  const batchSize = opts.batchSize ?? 500;
  const errors: ProductionSyncError[] = [];

  const metrics: ProductionSyncMetrics = {
    ordersRead: 0,
    ordersCreated: 0,
    ordersUpdated: 0,
    ordersSkipped: 0,
    linesRead: 0,
    linesCreated: 0,
    linesUpdated: 0,
    linesSkipped: 0,
    errors: [],
    durationMs: 0,
  };

  try {
    // 1. Fetch OP headers from SAG
    const config: PyaApiConfig = {
      ...opts.sagConfig,
      database: opts.sagDatabase,
    };
    const headerSql = buildHeaderQuery(sinceDate);
    const headers = await consultaSagJson(config, headerSql);
    metrics.ordersRead = headers.length;

    if (headers.length === 0) {
      metrics.durationMs = Date.now() - start;
      return { success: true, dryRun, metrics, sinceDate };
    }

    // 2. Fetch items for these headers (in batches)
    const allMovIds = headers.map((h) => Number(h.ka_nl_movimiento)).filter((id) => id > 0);

    let allItems: Record<string, unknown>[] = [];
    for (let i = 0; i < allMovIds.length; i += batchSize) {
      const batch = allMovIds.slice(i, i + batchSize);
      const itemsSql = buildItemsQuery(batch);
      const batchItems = await consultaSagJson(config, itemsSql);
      allItems = allItems.concat(batchItems);
    }
    metrics.linesRead = allItems.length;

    // 3. Normalize
    const snapshots = buildProductionSnapshots(headers, allItems);

    if (dryRun) {
      // Report what would happen without writing
      metrics.ordersCreated = snapshots.length;
      metrics.linesCreated = allItems.length;
      metrics.durationMs = Date.now() - start;
      metrics.errors = errors;
      return { success: true, dryRun: true, metrics, sinceDate };
    }

    // 4. Upsert into Prisma — batched for performance
    const BATCH = 50; // OPs per transaction batch
    for (let i = 0; i < snapshots.length; i += BATCH) {
      const batch = snapshots.slice(i, i + BATCH);
      try {
        await upsertBatch(opts.organizationId, batch, metrics);
      } catch (err) {
        // If batch fails, try individually to isolate the bad record
        for (const snap of batch) {
          try {
            await upsertBatch(opts.organizationId, [snap], metrics);
          } catch (innerErr) {
            errors.push({
              erpMovId: snap.erpMovId,
              documentNumber: snap.documentNumber,
              message: innerErr instanceof Error ? innerErr.message : String(innerErr),
            });
          }
        }
      }
      // Progress every 500 OPs
      if ((i + BATCH) % 500 < BATCH) {
        console.log(`  ... synced ${Math.min(i + BATCH, snapshots.length)} / ${snapshots.length} OPs`);
      }
    }
  } catch (err) {
    errors.push({
      message: `Top-level sync error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  metrics.errors = errors;
  metrics.durationMs = Date.now() - start;
  return {
    success: errors.length === 0,
    dryRun,
    metrics,
    sinceDate,
  };
}

// ── Batched Upsert ────────────────────────────────────────────────────────────

async function upsertBatch(
  organizationId: string,
  snapshots: ProductionOrderSnapshot[],
  metrics: ProductionSyncMetrics,
): Promise<void> {
  const db = prisma as any;

  // Use a Prisma transaction to batch multiple upserts in one round-trip
  await db.$transaction(async (tx: any) => {
    for (const snap of snapshots) {
      // Upsert header using Prisma's built-in upsert
      const order = await tx.productionOrder.upsert({
        where: {
          organizationId_erpMovId: {
            organizationId,
            erpMovId: snap.erpMovId,
          },
        },
        update: {
          documentNumber: snap.documentNumber,
          sourceCode: snap.sourceCode,
          sourceName: snap.sourceName,
          status: snap.status,
          isClosed: snap.isClosed,
          documentDate: snap.documentDate,
          createdBy: snap.createdBy,
          remisionRef: snap.remisionRef,
          warehouseCode: snap.warehouseCode,
          warehouseName: snap.warehouseName,
          rawJson: snap.rawJson,
          syncedAt: new Date(),
        },
        create: {
          organizationId,
          erpMovId: snap.erpMovId,
          documentNumber: snap.documentNumber,
          sourceCode: snap.sourceCode,
          sourceName: snap.sourceName,
          status: snap.status,
          isClosed: snap.isClosed,
          documentDate: snap.documentDate,
          createdBy: snap.createdBy,
          remisionRef: snap.remisionRef,
          warehouseCode: snap.warehouseCode,
          warehouseName: snap.warehouseName,
          rawJson: snap.rawJson,
          syncedAt: new Date(),
        },
      });

      // Track creates vs updates (upsert doesn't tell us, so count by checking if createdAt == updatedAt)
      const isNew = order.createdAt.getTime() === order.updatedAt.getTime();
      if (isNew) metrics.ordersCreated++;
      else metrics.ordersUpdated++;

      // Upsert lines
      for (const line of snap.lines) {
        const upsertedLine = await tx.productionOrderLine.upsert({
          where: {
            organizationId_erpItemId: {
              organizationId,
              erpItemId: line.erpItemId,
            },
          },
          update: {
            productionOrderId: order.id,
            referenceCode: line.referenceCode,
            productName: line.productName,
            size: line.size,
            color: line.color,
            quantityOrdered: line.quantityOrdered,
            unitCost: line.unitCost,
            lineTotal: line.lineTotal,
            rawJson: line.rawJson,
          },
          create: {
            organizationId,
            productionOrderId: order.id,
            erpItemId: line.erpItemId,
            referenceCode: line.referenceCode,
            productName: line.productName,
            size: line.size,
            color: line.color,
            quantityOrdered: line.quantityOrdered,
            unitCost: line.unitCost,
            lineTotal: line.lineTotal,
            rawJson: line.rawJson,
          },
        });

        const lineIsNew = upsertedLine.createdAt.getTime() === upsertedLine.updatedAt.getTime();
        if (lineIsNew) metrics.linesCreated++;
        else metrics.linesUpdated++;
      }
    }
  }, { timeout: 120000 }); // 2 min timeout per batch
}
