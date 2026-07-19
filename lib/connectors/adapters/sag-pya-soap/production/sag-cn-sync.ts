/**
 * sag-cn-sync.ts
 *
 * PRODUCTION-CN-SYNC-01 — Sync service for SAG CN documents (fuente 80).
 * Reads CN headers + lines from SAG MOVIMIENTOS, normalizes into universal
 * ProductionEvent + ProductionEventLine, and upserts into Prisma.
 *
 * Architecture:
 *   SAG CN (fuente 80) → ProductionEvent (eventType: MATERIAL_CONSUMED)
 *                       → ProductionEventLine (per raw material article)
 *
 * CN is NOT a domain entity. It is a SAG source document.
 * The universal model is ProductionEvent.
 *
 * READ-ONLY against SAG. Writes only to Agentik's Prisma database.
 * Idempotent: uses @@unique([organizationId, sourceSystem, sourceDocumentType, sourceDocumentId]).
 */

import { consultaSagJson } from "@/lib/connectors/pya/client";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";
import { buildCNProductionEvents } from "./sag-cn-normalizer";
import type { ProductionEvent } from "@/lib/production-events/production-event";
import { prisma } from "@/lib/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CNSyncMetrics {
  headersRead: number;
  itemsRead: number;
  eventsCreated: number;
  eventsUpdated: number;
  linesCreated: number;
  linesUpdated: number;
  headersWithLines: number;
  headersWithoutLines: number;
  errors: CNSyncError[];
  durationMs: number;
}

export interface CNSyncError {
  sourceDocumentId?: string;
  documentNumber?: string;
  message: string;
}

export interface CNSyncResult {
  success: boolean;
  dryRun: boolean;
  metrics: CNSyncMetrics;
  sinceDate: Date | null;
}

// ── Queries ───────────────────────────────────────────────────────────────────

function buildHeaderQuery(sinceDate: Date | null): string {
  const base = `
    SELECT m.*
    FROM MOVIMIENTOS m
    WHERE m.ka_ni_fuente = 80
  `;
  if (sinceDate) {
    const iso = sinceDate.toISOString().split("T")[0];
    return `${base} AND m.d_fecha_documento >= '${iso}' ORDER BY m.d_fecha_documento DESC`;
  }
  return `${base} ORDER BY m.d_fecha_documento DESC`;
}

function buildItemsQuery(movIds: number[]): string {
  if (movIds.length === 0) return "SELECT TOP 0 * FROM MOVIMIENTOS_ITEMS";
  const idList = movIds.join(",");
  return `
    SELECT mi.*, v.k_sc_codigo_articulo, v.sc_detalle_articulo
    FROM MOVIMIENTOS_ITEMS mi
    LEFT JOIN v_articulos v ON v.ka_nl_articulo = mi.ka_nl_articulo
    WHERE mi.ka_nl_movimiento IN (${idList})
  `;
}

// ── Sync Options ──────────────────────────────────────────────────────────────

interface CNSyncOptions {
  organizationId: string;
  sagConfig: PyaApiConfig;
  sagDatabase: string;
  /** Only sync CNs with documentDate >= sinceDate. Null = full sync. */
  sinceDate?: Date | null;
  /** If true, reads from SAG but does NOT write to Prisma. */
  dryRun?: boolean;
  /** Max CN headers to process per SOAP batch (default: 500). */
  batchSize?: number;
}

// ── Sync Engine ───────────────────────────────────────────────────────────────

export async function syncCNToProductionEvents(
  opts: CNSyncOptions,
): Promise<CNSyncResult> {
  const start = Date.now();
  const sinceDate = opts.sinceDate ?? null;
  const dryRun = opts.dryRun ?? false;
  const batchSize = opts.batchSize ?? 500;
  const errors: CNSyncError[] = [];

  const metrics: CNSyncMetrics = {
    headersRead: 0,
    itemsRead: 0,
    eventsCreated: 0,
    eventsUpdated: 0,
    linesCreated: 0,
    linesUpdated: 0,
    headersWithLines: 0,
    headersWithoutLines: 0,
    errors: [],
    durationMs: 0,
  };

  try {
    // 1. Fetch CN headers from SAG
    const config: PyaApiConfig = {
      ...opts.sagConfig,
      database: opts.sagDatabase,
    };
    const headerSql = buildHeaderQuery(sinceDate);
    console.log(`[CN-SYNC] Querying SAG MOVIMIENTOS WHERE ka_ni_fuente = 80...`);
    const headers = await consultaSagJson(config, headerSql);
    metrics.headersRead = headers.length;
    console.log(`[CN-SYNC] Headers read: ${headers.length}`);

    if (headers.length === 0) {
      metrics.durationMs = Date.now() - start;
      return { success: true, dryRun, metrics, sinceDate };
    }

    // 2. Fetch items for these headers (in batches)
    const allMovIds = headers
      .map((h) => Number(h.ka_nl_movimiento))
      .filter((id) => id > 0);

    let allItems: Record<string, unknown>[] = [];
    console.log(`[CN-SYNC] Querying MOVIMIENTOS_ITEMS for ${allMovIds.length} headers...`);
    for (let i = 0; i < allMovIds.length; i += batchSize) {
      const batch = allMovIds.slice(i, i + batchSize);
      const itemsSql = buildItemsQuery(batch);
      const batchItems = await consultaSagJson(config, itemsSql);
      allItems = allItems.concat(batchItems);
      console.log(`[CN-SYNC]   ... items batch ${Math.floor(i / batchSize) + 1}: ${batchItems.length} items`);
    }
    metrics.itemsRead = allItems.length;
    console.log(`[CN-SYNC] Total items read: ${allItems.length}`);

    // 3. Normalize into universal ProductionEvent objects
    const events = buildCNProductionEvents(headers, allItems);

    // Count headers with/without lines
    for (const evt of events) {
      if (evt.lines.length > 0) metrics.headersWithLines++;
      else metrics.headersWithoutLines++;
    }
    console.log(`[CN-SYNC] Events with lines: ${metrics.headersWithLines}, without lines: ${metrics.headersWithoutLines}`);

    if (dryRun) {
      metrics.eventsCreated = events.length;
      metrics.linesCreated = allItems.length;
      metrics.durationMs = Date.now() - start;
      metrics.errors = errors;
      return { success: true, dryRun: true, metrics, sinceDate };
    }

    // 4. Upsert into Prisma — batched for performance
    const BATCH = 20; // Smaller batches than ET because CN has many lines per event
    for (let i = 0; i < events.length; i += BATCH) {
      const batch = events.slice(i, i + BATCH);
      try {
        await upsertCNBatch(opts.organizationId, batch, metrics);
      } catch (err) {
        // If batch fails, try individually to isolate the bad record
        for (const evt of batch) {
          try {
            await upsertCNBatch(opts.organizationId, [evt], metrics);
          } catch (innerErr) {
            errors.push({
              sourceDocumentId: evt.source.sourceDocumentId,
              documentNumber: evt.source.sourceDocumentNumber,
              message: innerErr instanceof Error ? innerErr.message : String(innerErr),
            });
          }
        }
      }
      if ((i + BATCH) % 200 < BATCH) {
        console.log(`[CN-SYNC]   ... upserted ${Math.min(i + BATCH, events.length)} / ${events.length} events`);
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

async function upsertCNBatch(
  organizationId: string,
  events: ProductionEvent[],
  metrics: CNSyncMetrics,
): Promise<void> {
  const db = prisma as any;

  await db.$transaction(async (tx: any) => {
    for (const evt of events) {
      // Upsert event header
      const upserted = await tx.productionEvent.upsert({
        where: {
          organizationId_sourceSystem_sourceDocumentType_sourceDocumentId: {
            organizationId,
            sourceSystem: evt.sourceSystem,
            sourceDocumentType: evt.sourceDocumentType,
            sourceDocumentId: evt.source.sourceDocumentId,
          },
        },
        update: {
          eventType: evt.eventType,
          sourceDocumentNumber: evt.source.sourceDocumentNumber,
          sourceRawCode: evt.source.sourceRawCode,
          sourceRawName: evt.source.sourceRawName,
          productionOrderRef: evt.productionOrderRef,
          referenceCode: evt.referenceCode,
          description: evt.description,
          lineCount: evt.lineCount,
          line: evt.line,
          subGroup: evt.subGroup,
          locationFrom: evt.locationFrom,
          locationTo: evt.locationTo,
          stageFrom: evt.stageFrom,
          stageTo: evt.stageTo,
          quantity: evt.quantity,
          eventDate: new Date(evt.eventDate),
          status: evt.status,
          confidence: evt.confidence,
          evidence: evt.evidence,
          metadata: evt.metadata,
          syncedAt: new Date(),
        },
        create: {
          organizationId,
          eventType: evt.eventType,
          sourceSystem: evt.sourceSystem,
          sourceDocumentType: evt.sourceDocumentType,
          sourceDocumentId: evt.source.sourceDocumentId,
          sourceDocumentNumber: evt.source.sourceDocumentNumber,
          sourceRawCode: evt.source.sourceRawCode,
          sourceRawName: evt.source.sourceRawName,
          productionOrderRef: evt.productionOrderRef,
          referenceCode: evt.referenceCode,
          description: evt.description,
          lineCount: evt.lineCount,
          line: evt.line,
          subGroup: evt.subGroup,
          locationFrom: evt.locationFrom,
          locationTo: evt.locationTo,
          stageFrom: evt.stageFrom,
          stageTo: evt.stageTo,
          quantity: evt.quantity,
          eventDate: new Date(evt.eventDate),
          status: evt.status,
          confidence: evt.confidence,
          evidence: evt.evidence,
          metadata: evt.metadata,
          syncedAt: new Date(),
        },
      });

      const isNew = upserted.createdAt.getTime() === upserted.updatedAt.getTime();
      if (isNew) metrics.eventsCreated++;
      else metrics.eventsUpdated++;

      // Upsert lines
      for (const line of evt.lines) {
        const sourceLineId = line.lineMetadata?.sourceLineId != null
          ? String(line.lineMetadata.sourceLineId)
          : null;

        const upsertedLine = await tx.productionEventLine.upsert({
          where: {
            productionEventId_sourceLineId: {
              productionEventId: upserted.id,
              sourceLineId: sourceLineId,
            },
          },
          update: {
            organizationId,
            referenceCode: line.referenceCode,
            description: line.description,
            size: line.size,
            color: line.color,
            quantity: line.quantity,
            unit: line.unit,
            lineMetadata: line.lineMetadata,
            evidence: line.evidence,
          },
          create: {
            organizationId,
            productionEventId: upserted.id,
            referenceCode: line.referenceCode,
            description: line.description,
            size: line.size,
            color: line.color,
            quantity: line.quantity,
            unit: line.unit,
            sourceLineId,
            lineMetadata: line.lineMetadata,
            evidence: line.evidence,
          },
        });

        const lineIsNew = upsertedLine.createdAt.getTime() === upsertedLine.updatedAt.getTime();
        if (lineIsNew) metrics.linesCreated++;
        else metrics.linesUpdated++;
      }
    }
  }, { timeout: 180000 }); // 3 min — CN has many lines per event
}
