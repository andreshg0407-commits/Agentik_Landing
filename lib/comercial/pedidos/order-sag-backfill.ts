/**
 * lib/comercial/pedidos/order-sag-backfill.ts
 *
 * Backfill service for SAG historical orders.
 * Enriches CustomerOrderRecord with:
 *   1. Seller data (sellerTerceroId, sellerName, sellerSource, sellerConfidence)
 *   2. Line aggregates (lineCount, totalUnits, totalLineValue)
 *
 * Does NOT trigger line sync — use sag-order-lines-sync.ts for that.
 * This service reads existing lines and persists aggregates + seller resolution.
 *
 * Sprint: AGENTIK-ORDERS-SAG-HISTORICAL-READ-COMPLETENESS-01
 */
import { prisma } from "@/lib/prisma";
import { resolveSellersBatch, type ResolvedSeller } from "./seller-resolution-service";

// ── Types ────────────────────────────────────────────────────────────────────

export interface BackfillOptions {
  organizationId: string;
  /** Only backfill orders missing seller data. Default: true */
  onlyMissingSeller?: boolean;
  /** Only backfill line aggregates for orders with lines but no aggregates. Default: true */
  onlyMissingAggregates?: boolean;
  /** If true, compute but do NOT write to DB. Default: false */
  dryRun?: boolean;
  /** Batch size for DB updates. Default: 100 */
  batchSize?: number;
}

export interface BackfillMetrics {
  totalOrders: number;
  sellerResolved: number;
  sellerAlreadyPresent: number;
  sellerUnresolvable: number;
  aggregatesUpdated: number;
  aggregatesAlreadyPresent: number;
  ordersWithZeroLines: number;
  errors: Array<{ orderId: string; message: string }>;
  durationMs: number;
}

export interface BackfillResult {
  success: boolean;
  dryRun: boolean;
  metrics: BackfillMetrics;
}

// ── Backfill Engine ──────────────────────────────────────────────────────────

export async function backfillSagOrders(
  opts: BackfillOptions,
): Promise<BackfillResult> {
  const start = Date.now();
  const dryRun = opts.dryRun ?? false;
  const batchSize = opts.batchSize ?? 100;
  const onlyMissingSeller = opts.onlyMissingSeller ?? true;
  const onlyMissingAggregates = opts.onlyMissingAggregates ?? true;
  const db = prisma as any;

  const metrics: BackfillMetrics = {
    totalOrders: 0,
    sellerResolved: 0,
    sellerAlreadyPresent: 0,
    sellerUnresolvable: 0,
    aggregatesUpdated: 0,
    aggregatesAlreadyPresent: 0,
    ordersWithZeroLines: 0,
    errors: [],
    durationMs: 0,
  };

  try {
    // 1. Load all CustomerOrderRecords
    const orders = await db.customerOrderRecord.findMany({
      where: { organizationId: opts.organizationId },
      select: {
        id: true,
        erpMovId: true,
        customerNit: true,
        sellerTerceroId: true,
        sellerName: true,
        lineCount: true,
        totalUnits: true,
        _count: { select: { lines: true } },
      },
    });

    metrics.totalOrders = orders.length;

    if (orders.length === 0) {
      metrics.durationMs = Date.now() - start;
      return { success: true, dryRun, metrics };
    }

    // 2. Seller backfill — resolve sellers for orders missing seller data
    const needsSeller = onlyMissingSeller
      ? orders.filter((o: any) => !o.sellerName)
      : orders;

    metrics.sellerAlreadyPresent = orders.length - needsSeller.length;

    if (needsSeller.length > 0) {
      const sellerResults = await resolveSellersBatch(
        opts.organizationId,
        needsSeller.map((o: any) => ({
          erpMovId: o.erpMovId,
          customerNit: o.customerNit,
        })),
      );

      // Apply seller resolution
      for (const order of needsSeller) {
        const key = String(order.erpMovId ?? order.customerNit ?? "unknown");
        const resolved: ResolvedSeller | undefined = sellerResults.get(key);
        if (!resolved || !resolved.sellerName) {
          metrics.sellerUnresolvable++;
          continue;
        }
        if (resolved.confidence !== "high" && resolved.confidence !== "medium") {
          metrics.sellerUnresolvable++;
          continue;
        }

        metrics.sellerResolved++;

        if (!dryRun) {
          try {
            await db.customerOrderRecord.update({
              where: { id: order.id },
              data: {
                sellerTerceroId: resolved.sellerCode ? parseInt(resolved.sellerCode, 10) : null,
                sellerName: resolved.sellerName,
                sellerSource: resolved.source,
                sellerConfidence: resolved.confidence,
              },
            });
          } catch (e: any) {
            metrics.errors.push({ orderId: order.id, message: `seller update: ${e.message}` });
          }
        }
      }
    }

    // 3. Line aggregate backfill — compute lineCount, totalUnits, totalLineValue from existing lines
    const needsAggregates = onlyMissingAggregates
      ? orders.filter((o: any) => o.lineCount == null || o.totalUnits == null)
      : orders;

    metrics.aggregatesAlreadyPresent = orders.length - needsAggregates.length;

    // Process in batches
    for (let i = 0; i < needsAggregates.length; i += batchSize) {
      const batch = needsAggregates.slice(i, i + batchSize);
      const orderIds = batch.map((o: any) => o.id);

      // Query aggregate from CustomerOrderLine
      const aggregates = await db.$queryRawUnsafe(`
        SELECT "orderId",
               COUNT(*)::int AS "lineCount",
               COALESCE(SUM("quantity"), 0) AS "totalUnits",
               COALESCE(SUM("quantity" * "unitValue"), 0) AS "totalLineValue"
        FROM "CustomerOrderLine"
        WHERE "orderId" = ANY($1::text[])
        GROUP BY "orderId"
      `, orderIds) as any[];

      const aggMap = new Map<string, { lineCount: number; totalUnits: number; totalLineValue: number }>();
      for (const a of aggregates) {
        aggMap.set(a.orderId, {
          lineCount: Number(a.lineCount),
          totalUnits: Number(a.totalUnits),
          totalLineValue: Number(a.totalLineValue),
        });
      }

      for (const order of batch) {
        const agg = aggMap.get(order.id);
        if (!agg || agg.lineCount === 0) {
          metrics.ordersWithZeroLines++;
          continue;
        }

        metrics.aggregatesUpdated++;

        if (!dryRun) {
          try {
            await db.customerOrderRecord.update({
              where: { id: order.id },
              data: {
                lineCount: agg.lineCount,
                totalUnits: agg.totalUnits,
                totalLineValue: agg.totalLineValue,
              },
            });
          } catch (e: any) {
            metrics.errors.push({ orderId: order.id, message: `aggregate update: ${e.message}` });
          }
        }
      }
    }
  } catch (e: any) {
    metrics.errors.push({ orderId: "global", message: e.message });
  }

  metrics.durationMs = Date.now() - start;
  return { success: metrics.errors.length === 0, dryRun, metrics };
}
