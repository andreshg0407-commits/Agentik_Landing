/**
 * Storage handler — UnifiedOrder → SaleRecord.
 *
 * Bridges the connector layer and the existing SaleRecord table.
 * Uses buildNaturalKey from normalize.ts so connector-imported records are
 * deduplicated against records already written by the pivot-import UI path.
 *
 * Two records with the same (TXN | date | seller | line | channel | amount) are
 * treated as the same logical transaction regardless of which import path
 * produced them.
 */

import { prisma }                from "@/lib/prisma";
import { SaleChannel, SaleGrain, SaleScopeType, SagDocumentFamily } from "@prisma/client";
import {
  buildNaturalKey,
  normalizeChannel,
  toSlug,
}                                 from "@/lib/sales/normalize";
import type { RunContext, StorageHandler, UnifiedOrder } from "../../core/types";

const BATCH_SIZE = 500;

// ── Channel mapping ───────────────────────────────────────────────────────────

function toSaleChannel(channel: string | undefined): SaleChannel {
  return normalizeChannel(channel ?? "tienda");
}

// ── Order → SaleRecord row ────────────────────────────────────────────────────

function toSaleRecordRow(order: UnifiedOrder, batchId: string) {
  const line       = order.lineItems[0];
  const productLine = line?.productName ?? "SIN LÍNEA";
  const sellerName  = order.storeName   ?? "DESCONOCIDO";
  const sellerSlug  = order.storeId     ?? toSlug(sellerName);
  const channel     = toSaleChannel(order.channel);

  // Derive saleDate from orderedAt (already a Date)
  const saleDate    = order.orderedAt;

  // Derive periodoAoMes from saleDate
  const periodoAoMes =
    `${saleDate.getUTCFullYear()}${String(saleDate.getUTCMonth() + 1).padStart(2, "0")}`;

  // Use the same naturalKey formula as the pivot-import UI path so cross-path
  // deduplication works correctly.
  const nk = buildNaturalKey({
    grain:           SaleGrain.TRANSACTION,
    periodoAoMes,
    saleDate,
    sellerSlug,
    storeSlug:       sellerSlug,
    productLine,
    channel,
    comprobanteCode: null,
    comprobante:     null,
    amount:          order.total,
  });

  return {
    organizationId:  order.orgId,
    importBatchId:   batchId,
    grain:           SaleGrain.TRANSACTION,
    saleDate,
    periodoAoMes,
    sellerSlug,
    sellerName,
    storeSlug:       sellerSlug,
    storeName:       sellerName,
    productLine,
    channel,
    amount:          order.total,
    txCount:         1,
    customerName:      order.customerName   ?? null,
    customerNit:       order.customerTaxId  ?? null,
    naturalKey:        nk,
    rawJson:           (order.meta ?? {}) as object,
    // Document family classification: connector-sourced orders don't carry a
    // comprobante code, so they default to OTHER until the pivot-import path
    // is used (which does receive cod_comprobante and can classify properly).
    sagDocumentFamily: SagDocumentFamily.OTHER,
    originDocumentRef: null,
  };
}

// ── Ensure a SalesImportBatch exists for this connector run ───────────────────
//
// Uses the ConnectorRun ID as the ADHOC scopeKey so it is idempotent across
// retries and the FK constraint on SaleRecord.importBatchId is satisfied.

async function ensureBatch(ctx: RunContext): Promise<string> {
  const existing = await prisma.salesImportBatch.findFirst({
    where: { organizationId: ctx.orgId, scopeType: SaleScopeType.ADHOC, scopeKey: ctx.runId },
    select: { id: true },
  });
  if (existing) return existing.id;

  const batch = await prisma.salesImportBatch.create({
    data: {
      organizationId: ctx.orgId,
      source:         ctx.source,
      grain:          SaleGrain.TRANSACTION,
      scopeType:      SaleScopeType.ADHOC,
      scopeKey:       ctx.runId,    // unique per connector run
      status:         "PROCESSING",
    },
  });
  return batch.id;
}

// ── StorageHandler ────────────────────────────────────────────────────────────

export const sagPyaOrderStorage: StorageHandler<UnifiedOrder> = {
  async upsertMany(
    records: UnifiedOrder[],
    ctx:     RunContext
  ): Promise<{ imported: number; skipped: number; errored: number }> {
    let imported = 0;
    let skipped  = 0;
    let errored  = 0;

    // Ensure a SalesImportBatch row exists (satisfies FK on SaleRecord)
    const batchId = await ensureBatch(ctx);

    // Build rows
    const rows = records.map(o => toSaleRecordRow(o, batchId));

    // Upsert in batches
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      try {
        const result = await prisma.saleRecord.createMany({
          data:           batch,
          skipDuplicates: true,  // dedup via @@unique([organizationId, naturalKey])
        });
        imported += result.count;
        skipped  += batch.length - result.count;
      } catch (e) {
        console.error(`[sagPyaOrderStorage] Batch ${i}–${i + batch.length} error:`, e);
        errored += batch.length;
      }
    }

    // Mark batch as done (best-effort — don't fail the run if this errors)
    await prisma.salesImportBatch.update({
      where:  { id: batchId },
      data:   { status: errored > 0 ? "FAILED" : "DONE", rowCount: records.length, importedCount: imported, skippedCount: skipped },
    }).catch(() => {/* non-critical */});

    return { imported, skipped, errored };
  },
};
