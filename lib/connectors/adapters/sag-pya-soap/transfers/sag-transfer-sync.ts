/**
 * sag-transfer-sync.ts
 *
 * CASTILLITOS-LOGISTICS-SYNC-01 — Sync service for SAG inventory transfers.
 * Reads TR (fuente 34) and TM (fuente 206) from SAG MOVIMIENTOS,
 * normalizes, and upserts into InventoryTransfer / InventoryTransferLine tables.
 *
 * READ-ONLY against SAG. Writes only to Agentik's Prisma database.
 * Idempotent: uses @@unique([organizationId, erpMovId]) for headers
 * and @@unique([organizationId, erpItemId]) for lines.
 */

import { consultaSagJson } from "@/lib/connectors/pya/client";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";
import { buildTransferSnapshots } from "./sag-transfer-normalizer";
import type {
  TransferSyncResult,
  TransferSyncMetrics,
  TransferSyncError,
  TransferSnapshot,
  TransferType,
} from "@/lib/logistics/transfer-types";
import { prisma } from "@/lib/prisma";

// ── SAG fuente IDs ───────────────────────────────────────────────────────────

const FUENTE_IDS: Record<TransferType, number> = {
  TR: 34,
  TM: 206,
};

// ── Queries ──────────────────────────────────────────────────────────────────

function buildHeaderQuery(fuenteIds: number[], sinceDate: Date | null): string {
  const idList = fuenteIds.join(",");
  const base = `
    SELECT m.*
    FROM MOVIMIENTOS m
    WHERE m.ka_ni_fuente IN (${idList})
  `;
  if (sinceDate) {
    const iso = sinceDate.toISOString().split("T")[0];
    return `${base} AND m.d_fecha_documento >= '${iso}' ORDER BY m.d_fecha_documento DESC`;
  }
  return `${base} ORDER BY m.d_fecha_documento DESC`;
}

function buildItemsQuery(movIds: number[]): string {
  if (movIds.length === 0) return "SELECT TOP 0 * FROM movimientos_traslados";
  const idList = movIds.join(",");
  // INVENTORY-F34-TRANSFER-SYNC-01: Transfer lines live in movimientos_traslados,
  // NOT in MOVIMIENTOS_ITEMS. This SAG table has per-line origin/destination bodegas.
  return `
    SELECT mt.*, v.k_sc_codigo_articulo, v.sc_detalle_articulo
    FROM movimientos_traslados mt
    LEFT JOIN v_articulos v ON v.ka_nl_articulo = mt.ka_nl_articulo
    WHERE mt.ka_nl_movimiento IN (${idList})
  `;
}

// ── Sync Engine ──────────────────────────────────────────────────────────────

interface TransferSyncOptions {
  organizationId: string;
  sagConfig: PyaApiConfig;
  sagDatabase: string;
  /** Which transfer types to sync. Defaults to both TR and TM. */
  transferTypes?: TransferType[];
  /** Only sync transfers with documentDate >= sinceDate. Null = full sync. */
  sinceDate?: Date | null;
  /** If true, reads from SAG but does NOT write to Prisma. */
  dryRun?: boolean;
  /** Max headers to process per SOAP batch (default: 500). */
  batchSize?: number;
}

export async function syncInventoryTransfers(
  opts: TransferSyncOptions,
): Promise<TransferSyncResult> {
  const start = Date.now();
  const sinceDate = opts.sinceDate ?? null;
  const dryRun = opts.dryRun ?? false;
  const batchSize = opts.batchSize ?? 500;
  const types = opts.transferTypes ?? (["TR", "TM"] as TransferType[]);
  const errors: TransferSyncError[] = [];

  const metrics: TransferSyncMetrics = {
    transfersRead: 0,
    transfersCreated: 0,
    transfersUpdated: 0,
    transfersSkipped: 0,
    linesRead: 0,
    linesCreated: 0,
    linesUpdated: 0,
    linesSkipped: 0,
    errors: [],
    durationMs: 0,
  };

  try {
    const config: PyaApiConfig = {
      ...opts.sagConfig,
      database: opts.sagDatabase,
    };

    // 1. Fetch transfer headers from SAG
    const fuenteIds = types.map((t) => FUENTE_IDS[t]);
    const headerSql = buildHeaderQuery(fuenteIds, sinceDate);
    const headers = await consultaSagJson(config, headerSql);
    metrics.transfersRead = headers.length;

    if (headers.length === 0) {
      metrics.durationMs = Date.now() - start;
      return { success: true, dryRun, metrics, transferTypes: types, sinceDate };
    }

    // 2. Fetch items for these headers (in batches)
    const allMovIds = headers
      .map((h) => Number(h.ka_nl_movimiento))
      .filter((id) => id > 0);

    let allItems: Record<string, unknown>[] = [];
    for (let i = 0; i < allMovIds.length; i += batchSize) {
      const batch = allMovIds.slice(i, i + batchSize);
      const itemsSql = buildItemsQuery(batch);
      const batchItems = await consultaSagJson(config, itemsSql);
      allItems = allItems.concat(batchItems);
    }
    metrics.linesRead = allItems.length;

    // 3. Normalize
    const snapshots = buildTransferSnapshots(headers, allItems);

    if (dryRun) {
      metrics.transfersCreated = snapshots.length;
      metrics.linesCreated = allItems.length;
      metrics.durationMs = Date.now() - start;
      metrics.errors = errors;
      return { success: true, dryRun: true, metrics, transferTypes: types, sinceDate };
    }

    // 4. Upsert into Prisma — batched for performance
    const BATCH = 50;
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
      if ((i + BATCH) % 500 < BATCH) {
        console.log(`  ... synced ${Math.min(i + BATCH, snapshots.length)} / ${snapshots.length} transfers`);
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
    transferTypes: types,
    sinceDate,
  };
}

// ── Batched Upsert ───────────────────────────────────────────────────────────

async function upsertBatch(
  organizationId: string,
  snapshots: TransferSnapshot[],
  metrics: TransferSyncMetrics,
): Promise<void> {
  const db = prisma as any;

  await db.$transaction(async (tx: any) => {
    for (const snap of snapshots) {
      const transfer = await tx.inventoryTransfer.upsert({
        where: {
          organizationId_erpMovId: {
            organizationId,
            erpMovId: snap.erpMovId,
          },
        },
        update: {
          documentNumber: snap.documentNumber,
          transferType: snap.transferType,
          sourceCode: snap.sourceCode,
          sourceName: snap.sourceName,
          status: snap.status,
          isClosed: snap.isClosed,
          documentDate: snap.documentDate,
          createdBy: snap.createdBy,
          remisionRef: snap.remisionRef,
          originWarehouseCode: snap.originWarehouseCode,
          originWarehouseName: snap.originWarehouseName,
          destinationWarehouseCode: snap.destinationWarehouseCode,
          destinationWarehouseName: snap.destinationWarehouseName,
          rawJson: snap.rawJson,
          syncedAt: new Date(),
        },
        create: {
          organizationId,
          erpMovId: snap.erpMovId,
          documentNumber: snap.documentNumber,
          transferType: snap.transferType,
          sourceCode: snap.sourceCode,
          sourceName: snap.sourceName,
          status: snap.status,
          isClosed: snap.isClosed,
          documentDate: snap.documentDate,
          createdBy: snap.createdBy,
          remisionRef: snap.remisionRef,
          originWarehouseCode: snap.originWarehouseCode,
          originWarehouseName: snap.originWarehouseName,
          destinationWarehouseCode: snap.destinationWarehouseCode,
          destinationWarehouseName: snap.destinationWarehouseName,
          rawJson: snap.rawJson,
          syncedAt: new Date(),
        },
      });

      const isNew = transfer.createdAt.getTime() === transfer.updatedAt.getTime();
      if (isNew) metrics.transfersCreated++;
      else metrics.transfersUpdated++;

      // Upsert lines
      for (const line of snap.lines) {
        const upsertedLine = await tx.inventoryTransferLine.upsert({
          where: {
            organizationId_erpItemId: {
              organizationId,
              erpItemId: line.erpItemId,
            },
          },
          update: {
            inventoryTransferId: transfer.id,
            referenceCode: line.referenceCode,
            productName: line.productName,
            size: line.size,
            color: line.color,
            quantity: line.quantity,
            unitCost: line.unitCost,
            lineTotal: line.lineTotal,
            destinationWarehouseCode: line.destinationWarehouseCode,
            rawJson: line.rawJson,
          },
          create: {
            organizationId,
            inventoryTransferId: transfer.id,
            erpItemId: line.erpItemId,
            referenceCode: line.referenceCode,
            productName: line.productName,
            size: line.size,
            color: line.color,
            quantity: line.quantity,
            unitCost: line.unitCost,
            lineTotal: line.lineTotal,
            destinationWarehouseCode: line.destinationWarehouseCode,
            rawJson: line.rawJson,
          },
        });

        const lineIsNew = upsertedLine.createdAt.getTime() === upsertedLine.updatedAt.getTime();
        if (lineIsNew) metrics.linesCreated++;
        else metrics.linesUpdated++;
      }
    }
  }, { timeout: 120000 });
}
