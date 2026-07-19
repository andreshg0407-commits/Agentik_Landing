/**
 * sag-order-lines-sync.ts
 *
 * INVENTORY-PENDING-ORDERS-SYNC-01 — Sync PD order lines from SAG.
 *
 * Reads MOVIMIENTOS_ITEMS for existing CustomerOrderRecord headers
 * (k_n_clase_fuente=4, PD) and upserts into CustomerOrderLine.
 *
 * Pattern: same 2-step as sag-production-sync.ts:
 *   1. Read existing CustomerOrderRecord erpMovIds from Prisma
 *   2. Query MOVIMIENTOS_ITEMS by movId list from SAG
 *   3. Upsert into CustomerOrderLine
 *
 * READ-ONLY against SAG. Writes only to Agentik's Prisma database.
 * Idempotent: uses @@unique([organizationId, erpItemId]).
 */

import { consultaSagJson } from "@/lib/connectors/pya/client";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";
import { prisma } from "@/lib/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OrderLinesSyncOptions {
  organizationId: string;
  sagConfig: PyaApiConfig;
  sagDatabase: string;
  /** Only sync lines for orders with orderDate >= sinceDate. Null = all. */
  sinceDate?: Date | null;
  /** If true, reads from SAG but does NOT write to Prisma. */
  dryRun?: boolean;
  /** Max MOVIMIENTOS_ITEMS movIds per SOAP batch (default: 500). */
  batchSize?: number;
  /** If true, only sync lines for orders that have 0 lines. Default: false. */
  onlyMissing?: boolean;
}

export interface OrderLinesSyncMetrics {
  ordersScanned: number;
  linesRead: number;
  linesCreated: number;
  linesUpdated: number;
  linesErrored: number;
  errors: Array<{ erpMovId?: number; message: string }>;
  durationMs: number;
}

export interface OrderLinesSyncResult {
  success: boolean;
  dryRun: boolean;
  metrics: OrderLinesSyncMetrics;
}

// ── SAG Query ─────────────────────────────────────────────────────────────────

function buildItemsQuery(movIds: number[]): string {
  if (movIds.length === 0) return "SELECT TOP 0 * FROM MOVIMIENTOS_ITEMS";
  const idList = movIds.join(",");
  return `
    SELECT mi.ka_nl_movimiento_item, mi.ka_nl_movimiento, mi.ka_nl_articulo,
           mi.n_cantidad, mi.ss_talla, mi.ss_color, mi.ka_nl_bodega, mi.n_valor,
           v.k_sc_codigo_articulo, v.sc_detalle_articulo
    FROM MOVIMIENTOS_ITEMS mi
    LEFT JOIN v_articulos v ON v.ka_nl_articulo = mi.ka_nl_articulo
    WHERE mi.ka_nl_movimiento IN (${idList})
  `;
}

// ── Row normalizer ────────────────────────────────────────────────────────────

interface NormalizedLine {
  erpItemId: number;
  erpMovId: number;
  articleId: number;
  referenceCode: string;
  articleName: string;
  quantity: number;
  size: string | null;
  color: string | null;
  warehouseId: number | null;
  unitValue: number;
}

function normalizeLine(row: Record<string, unknown>): NormalizedLine | null {
  const erpItemId = Number(row["ka_nl_movimiento_item"] ?? 0);
  const erpMovId = Number(row["ka_nl_movimiento"] ?? 0);
  const articleId = Number(row["ka_nl_articulo"] ?? 0);
  if (erpItemId === 0 || erpMovId === 0 || articleId === 0) return null;

  const referenceCode = String(row["k_sc_codigo_articulo"] ?? "").trim();
  const articleName = String(row["sc_detalle_articulo"] ?? "").trim();
  const quantity = Number(row["n_cantidad"] ?? 0);
  const size = row["ss_talla"] != null ? String(row["ss_talla"]).trim() : null;
  const color = row["ss_color"] != null ? String(row["ss_color"]).trim() : null;
  const warehouseId = row["ka_nl_bodega"] != null ? Number(row["ka_nl_bodega"]) : null;
  const unitValue = Number(row["n_valor"] ?? 0);

  if (!referenceCode) return null; // skip lines without a product reference

  return {
    erpItemId,
    erpMovId,
    articleId,
    referenceCode,
    articleName,
    quantity,
    size,
    color,
    warehouseId,
    unitValue,
  };
}

// ── Sync Engine ───────────────────────────────────────────────────────────────

export async function syncOrderLines(
  opts: OrderLinesSyncOptions,
): Promise<OrderLinesSyncResult> {
  const start = Date.now();
  const dryRun = opts.dryRun ?? false;
  const batchSize = opts.batchSize ?? 500;
  const db = prisma as any;

  const metrics: OrderLinesSyncMetrics = {
    ordersScanned: 0,
    linesRead: 0,
    linesCreated: 0,
    linesUpdated: 0,
    linesErrored: 0,
    errors: [],
    durationMs: 0,
  };

  try {
    // 1. Load existing CustomerOrderRecord erpMovIds from Prisma
    // Query ALL statuses — lines are needed for display regardless of order status.
    // Previously filtered to PENDIENTE only, which left CONFIRMADO/DESPACHADO/FACTURADO
    // orders without lines.
    const where: Record<string, unknown> = {
      organizationId: opts.organizationId,
    };
    if (opts.sinceDate) {
      where["orderDate"] = { gte: opts.sinceDate };
    }

    let orders: Array<{ id: string; erpMovId: number }>;

    if (opts.onlyMissing) {
      // Only fetch orders that have zero lines — much faster for incremental cron runs
      orders = await db.$queryRawUnsafe(
        `SELECT r."id", r."erpMovId"
         FROM "CustomerOrderRecord" r
         LEFT JOIN "CustomerOrderLine" l ON l."orderId" = r."id"
         WHERE r."organizationId" = $1
         AND l."id" IS NULL
         ${opts.sinceDate ? `AND r."orderDate" >= $2` : ""}`,
        opts.organizationId,
        ...(opts.sinceDate ? [opts.sinceDate] : []),
      );
    } else {
      orders = await db.customerOrderRecord.findMany({
        where,
        select: { id: true, erpMovId: true },
      });
    }

    metrics.ordersScanned = orders.length;

    if (orders.length === 0) {
      metrics.durationMs = Date.now() - start;
      return { success: true, dryRun, metrics };
    }

    // Build erpMovId → orderId map for FK resolution
    const movIdToOrderId = new Map<number, string>();
    for (const o of orders) {
      movIdToOrderId.set(o.erpMovId, o.id);
    }
    const allMovIds = orders.map((o) => o.erpMovId);

    // 2. Fetch MOVIMIENTOS_ITEMS from SAG in batches
    const config: PyaApiConfig = {
      ...opts.sagConfig,
      database: opts.sagDatabase,
    };

    let allRawItems: Record<string, unknown>[] = [];
    for (let i = 0; i < allMovIds.length; i += batchSize) {
      const batch = allMovIds.slice(i, i + batchSize);
      const sql = buildItemsQuery(batch);
      const batchItems = await consultaSagJson(config, sql);
      allRawItems = allRawItems.concat(batchItems);
    }
    metrics.linesRead = allRawItems.length;

    // 3. Normalize
    const lines: Array<NormalizedLine & { orderId: string }> = [];
    for (const raw of allRawItems) {
      const normalized = normalizeLine(raw);
      if (!normalized) continue;
      const orderId = movIdToOrderId.get(normalized.erpMovId);
      if (!orderId) continue; // orphan line — header not in our set
      lines.push({ ...normalized, orderId });
    }

    if (dryRun) {
      metrics.linesCreated = lines.length;
      metrics.durationMs = Date.now() - start;
      return { success: true, dryRun: true, metrics };
    }

    // 4. Bulk upsert via raw SQL — INSERT ... ON CONFLICT for 1M+ rows
    const BULK_BATCH = 500;
    for (let i = 0; i < lines.length; i += BULK_BATCH) {
      const batch = lines.slice(i, i + BULK_BATCH);
      try {
        // Build parameterized VALUES clause
        const values: unknown[] = [];
        const placeholders: string[] = [];
        let paramIdx = 1;

        for (const line of batch) {
          const id = `col_${line.erpItemId}_${Date.now().toString(36)}`;
          placeholders.push(
            `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, NOW())`,
          );
          values.push(
            id,
            opts.organizationId,
            line.orderId,
            line.erpItemId,
            line.erpMovId,
            line.articleId,
            line.referenceCode,
            line.articleName,
            line.quantity,
            line.size,
            line.color,
            line.warehouseId,
            line.unitValue,
          );
        }

        const sql = `
          INSERT INTO "CustomerOrderLine"
            ("id", "organizationId", "orderId", "erpItemId", "erpMovId", "articleId",
             "referenceCode", "articleName", "quantity", "size", "color", "warehouseId",
             "unitValue", "syncedAt")
          VALUES ${placeholders.join(", ")}
          ON CONFLICT ("organizationId", "erpItemId") DO UPDATE SET
            "orderId"       = EXCLUDED."orderId",
            "referenceCode" = EXCLUDED."referenceCode",
            "articleName"   = EXCLUDED."articleName",
            "quantity"      = EXCLUDED."quantity",
            "size"          = EXCLUDED."size",
            "color"         = EXCLUDED."color",
            "warehouseId"   = EXCLUDED."warehouseId",
            "unitValue"     = EXCLUDED."unitValue",
            "syncedAt"      = NOW()
        `;

        await db.$executeRawUnsafe(sql, ...values);
        metrics.linesCreated += batch.length;
      } catch (err) {
        metrics.linesErrored += batch.length;
        metrics.errors.push({
          message: `Bulk batch at offset ${i}: ${err instanceof Error ? err.message : String(err)}`,
        });
      }

      if ((i + BULK_BATCH) % 5000 < BULK_BATCH) {
        console.log(
          `  ... synced ${Math.min(i + BULK_BATCH, lines.length)} / ${lines.length} order lines`,
        );
      }
    }
  } catch (err) {
    metrics.errors.push({
      message: `Top-level sync error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  metrics.durationMs = Date.now() - start;
  return {
    success: metrics.errors.length === 0,
    dryRun,
    metrics,
  };
}
