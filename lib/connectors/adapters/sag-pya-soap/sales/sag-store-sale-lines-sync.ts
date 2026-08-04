/**
 * sag-store-sale-lines-sync.ts
 *
 * AGENTIK-STORES-PRODUCT-SALES-SYNC-01 — Sync store sale lines from SAG.
 *
 * Reads MOVIMIENTOS headers (by fuente codes) + MOVIMIENTOS_ITEMS (lines)
 * + v_articulos (product reference) from SAG SOAP and upserts into
 * StoreSaleLineRecord in Prisma.
 *
 * Pattern: 2-step SAG sync (same as sag-order-lines-sync.ts):
 *   1. Query MOVIMIENTOS headers by fuente codes + date range from SAG
 *   2. Batch query MOVIMIENTOS_ITEMS by movId list from SAG
 *   3. Upsert into StoreSaleLineRecord
 *
 * Store attribution: uses sales-canonical-source.ts exclusively.
 * NC semantics: n_cantidad positive, n_valor negative. No sign flipping.
 *
 * READ-ONLY against SAG. Writes only to Agentik's Prisma database.
 * Idempotent: uses @@unique([organizationId, erpItemId]).
 */

import { consultaSagJson } from "@/lib/connectors/pya/client";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";
import {
  getSagConnection,
  resolveSagSourcesForRange,
  resolveSagSourceForDate,
  SAG_CURRENT_START_DATE,
  type SagSource,
} from "@/lib/connectors/pya/sag-source-router";
import { prisma } from "@/lib/prisma";
import {
  resolveCanonicalSalesSource,
  type SalesCodeResolution,
} from "@/lib/comercial/sales-canonical-source";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StoreSaleLinesSyncOptions {
  organizationId: string;
  sagConfig: PyaApiConfig;
  sagDatabase: string;
  /** Fuente codes to sync. E.g. ["FG", "NG"] for Gran Plaza. */
  fuenteCodes: string[];
  /** Only sync documents with d_fecha >= dateFrom. ISO date string. */
  dateFrom?: string;
  /** Only sync documents with d_fecha <= dateTo. ISO date string. */
  dateTo?: string;
  /** If true, reads from SAG but does NOT write to Prisma. */
  dryRun?: boolean;
  /** Max MOVIMIENTOS_ITEMS movIds per SOAP batch (default: 500). */
  batchSize?: number;
}

export interface StoreSaleLinesSyncMetrics {
  headersRead: number;
  linesRead: number;
  linesWritten: number;
  linesSkipped: number;
  linesErrored: number;
  errors: Array<{ erpMovId?: number; message: string }>;
  durationMs: number;
  /** Per-fuente code breakdown */
  perCode: Record<string, { headers: number; lines: number }>;
}

export interface StoreSaleLinesSyncResult {
  success: boolean;
  dryRun: boolean;
  metrics: StoreSaleLinesSyncMetrics;
}

// ── SAG Queries ──────────────────────────────────────────────────────────────

function buildHeadersQuery(
  fuenteIds: number[],
  dateFrom?: string,
  dateTo?: string,
): string {
  const idList = fuenteIds.join(",");
  const dateClause = [
    dateFrom ? `AND m.d_fecha_documento >= '${dateFrom}'` : "",
    dateTo ? `AND m.d_fecha_documento <= '${dateTo}'` : "",
  ].join(" ");
  return `
    SELECT m.ka_nl_movimiento, m.ka_ni_fuente, m.d_fecha_documento,
           m.n_numero_documento
    FROM MOVIMIENTOS m
    WHERE m.sc_anulado = 'N'
    AND m.ka_ni_fuente IN (${idList})
    ${dateClause}
    ORDER BY m.d_fecha_documento DESC
  `;
}

function buildItemsQuery(movIds: number[]): string {
  if (movIds.length === 0) return "SELECT TOP 0 * FROM MOVIMIENTOS_ITEMS";
  const idList = movIds.join(",");
  return `
    SELECT mi.ka_nl_movimiento_item, mi.ka_nl_movimiento, mi.ka_nl_articulo,
           mi.n_cantidad, mi.ss_talla, mi.ss_color, mi.ka_nl_bodega,
           mi.n_valor, mi.n_descuento, mi.n_iva,
           v.k_sc_codigo_articulo, v.sc_detalle_articulo
    FROM MOVIMIENTOS_ITEMS mi
    LEFT JOIN v_articulos v ON v.ka_nl_articulo = mi.ka_nl_articulo
    WHERE mi.ka_nl_movimiento IN (${idList})
  `;
}

// ── Row normalizers ──────────────────────────────────────────────────────────

interface NormalizedHeader {
  erpMovId: number;
  fuenteId: number;
  documentDate: string;  // ISO date
  documentNumber: string | null;
}

function normalizeHeader(row: Record<string, unknown>): NormalizedHeader | null {
  const erpMovId = Number(row["ka_nl_movimiento"] ?? 0);
  const fuenteId = Number(row["ka_ni_fuente"] ?? 0);
  if (erpMovId === 0 || fuenteId === 0) return null;

  const rawDate = row["d_fecha_documento"];
  let documentDate: string;
  if (rawDate instanceof Date) {
    documentDate = rawDate.toISOString().slice(0, 10);
  } else if (typeof rawDate === "string") {
    documentDate = rawDate.slice(0, 10);
  } else {
    return null; // no date = unusable
  }

  return {
    erpMovId,
    fuenteId,
    documentDate,
    documentNumber: row["n_numero_documento"] != null
      ? String(row["n_numero_documento"]).trim()
      : null,
  };
}

interface NormalizedLine {
  erpItemId: number;
  erpMovId: number;
  articleId: number;
  referenceCode: string;
  articleName: string;
  quantity: number;
  lineTotal: number;
  discountPercent: number;
  ivaRate: number;
  size: string | null;
  color: string | null;
  warehouseId: number | null;
}

function normalizeLine(row: Record<string, unknown>): NormalizedLine | null {
  const erpItemId = Number(row["ka_nl_movimiento_item"] ?? 0);
  const erpMovId = Number(row["ka_nl_movimiento"] ?? 0);
  const articleId = Number(row["ka_nl_articulo"] ?? 0);
  if (erpItemId === 0 || erpMovId === 0 || articleId === 0) return null;

  const referenceCode = String(row["k_sc_codigo_articulo"] ?? "").trim();
  const articleName = String(row["sc_detalle_articulo"] ?? "").trim();
  if (!referenceCode) return null;

  return {
    erpItemId,
    erpMovId,
    articleId,
    referenceCode,
    articleName,
    quantity: Number(row["n_cantidad"] ?? 0),
    lineTotal: Number(row["n_valor"] ?? 0),
    discountPercent: Number(row["n_descuento"] ?? 0),
    ivaRate: Number(row["n_iva"] ?? 0),
    size: row["ss_talla"] != null ? String(row["ss_talla"]).trim() : null,
    color: row["ss_color"] != null ? String(row["ss_color"]).trim() : null,
    warehouseId: row["ka_nl_bodega"] != null ? Number(row["ka_nl_bodega"]) : null,
  };
}

// ── Fuente code resolver ─────────────────────────────────────────────────────

/** Build fuenteId → SalesCodeResolution map from the canonical source. */
function buildFuenteMap(
  fuenteCodes: string[],
): Map<number, SalesCodeResolution & { code: string }> {
  const map = new Map<number, SalesCodeResolution & { code: string }>();
  for (const code of fuenteCodes) {
    const res = resolveCanonicalSalesSource(code);
    if (res && res.store) {
      map.set(res.kaNiFuente, { ...res, code });
    }
  }
  return map;
}

// ── Sync Engine ──────────────────────────────────────────────────────────────

export async function syncStoreSaleLines(
  opts: StoreSaleLinesSyncOptions,
): Promise<StoreSaleLinesSyncResult> {
  const start = Date.now();
  const dryRun = opts.dryRun ?? false;
  const batchSize = opts.batchSize ?? 500;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any;

  const metrics: StoreSaleLinesSyncMetrics = {
    headersRead: 0,
    linesRead: 0,
    linesWritten: 0,
    linesSkipped: 0,
    linesErrored: 0,
    errors: [],
    durationMs: 0,
    perCode: {},
  };

  try {
    // 0. Resolve fuente codes → IDs + store attribution
    const fuenteMap = buildFuenteMap(opts.fuenteCodes);
    const fuenteIds = [...fuenteMap.keys()];

    if (fuenteIds.length === 0) {
      metrics.errors.push({ message: `No valid fuente codes found for: ${opts.fuenteCodes.join(",")}` });
      metrics.durationMs = Date.now() - start;
      return { success: false, dryRun, metrics };
    }

    // 1. Query MOVIMIENTOS headers from SAG
    const config: PyaApiConfig = {
      ...opts.sagConfig,
      database: opts.sagDatabase,
    };

    const headerSql = buildHeadersQuery(fuenteIds, opts.dateFrom, opts.dateTo);
    const rawHeaders = await consultaSagJson(config, headerSql);
    metrics.headersRead = rawHeaders.length;

    const headers = new Map<number, NormalizedHeader>();
    for (const raw of rawHeaders) {
      const h = normalizeHeader(raw);
      if (h) headers.set(h.erpMovId, h);
    }

    // Track per-code breakdown
    for (const [, h] of headers) {
      const res = fuenteMap.get(h.fuenteId);
      if (res) {
        const code = res.code;
        if (!metrics.perCode[code]) metrics.perCode[code] = { headers: 0, lines: 0 };
        metrics.perCode[code].headers++;
      }
    }

    if (headers.size === 0) {
      metrics.durationMs = Date.now() - start;
      return { success: true, dryRun, metrics };
    }

    // 2. Fetch MOVIMIENTOS_ITEMS from SAG in batches
    const allMovIds = [...headers.keys()];
    let allRawItems: Record<string, unknown>[] = [];
    for (let i = 0; i < allMovIds.length; i += batchSize) {
      const batch = allMovIds.slice(i, i + batchSize);
      const sql = buildItemsQuery(batch);
      const batchItems = await consultaSagJson(config, sql);
      allRawItems = allRawItems.concat(batchItems);
    }
    metrics.linesRead = allRawItems.length;

    // 3. Normalize + resolve store attribution
    interface ResolvedLine extends NormalizedLine {
      documentDate: string;
      comprobanteCode: string;
      comprobante: string | null;
      storeId: string;
      storeName: string;
      documentFamily: string;
    }

    const lines: ResolvedLine[] = [];
    for (const raw of allRawItems) {
      const normalized = normalizeLine(raw);
      if (!normalized) { metrics.linesSkipped++; continue; }

      const header = headers.get(normalized.erpMovId);
      if (!header) { metrics.linesSkipped++; continue; }

      const resolution = fuenteMap.get(header.fuenteId);
      if (!resolution || !resolution.store) { metrics.linesSkipped++; continue; }

      const comprobanteCode = resolution.code;
      const comprobante = header.documentNumber
        ? `${comprobanteCode}-${header.documentNumber}`
        : null;

      // Track per-code lines
      if (!metrics.perCode[comprobanteCode]) metrics.perCode[comprobanteCode] = { headers: 0, lines: 0 };
      metrics.perCode[comprobanteCode].lines++;

      lines.push({
        ...normalized,
        documentDate: header.documentDate,
        comprobanteCode,
        comprobante,
        storeId: resolution.store.storeId,
        storeName: resolution.store.storeName,
        documentFamily: resolution.documentFamily,
      });
    }

    if (dryRun) {
      metrics.linesWritten = lines.length;
      metrics.durationMs = Date.now() - start;
      return { success: true, dryRun: true, metrics };
    }

    // 4. Bulk upsert via raw SQL — INSERT ... ON CONFLICT
    const BULK_BATCH = 200;
    for (let i = 0; i < lines.length; i += BULK_BATCH) {
      const batch = lines.slice(i, i + BULK_BATCH);
      try {
        const values: unknown[] = [];
        const placeholders: string[] = [];
        let paramIdx = 1;

        for (const line of batch) {
          const id = `ssl_${line.erpItemId}_${Date.now().toString(36)}`;
          placeholders.push(
            `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}::decimal, $${paramIdx++}::decimal, $${paramIdx++}::decimal, $${paramIdx++}::decimal, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}::date, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, NOW())`,
          );
          values.push(
            id,                         // id
            opts.organizationId,        // organizationId
            line.erpItemId,             // erpItemId
            line.erpMovId,              // erpMovId
            line.articleId,             // articleId
            line.referenceCode,         // referenceCode
            line.articleName,           // articleName
            line.quantity,              // quantity
            line.lineTotal,             // lineTotal
            line.discountPercent,       // discountPercent
            line.ivaRate,               // ivaRate
            line.size,                  // size
            line.color,                 // color
            line.warehouseId,           // warehouseId
            line.documentDate,          // documentDate
            line.comprobanteCode,       // comprobanteCode
            line.comprobante,           // comprobante
            line.storeId,              // storeId
            line.storeName,            // storeName
            line.documentFamily,       // documentFamily
          );
        }

        const sql = `
          INSERT INTO "StoreSaleLineRecord"
            ("id", "organizationId", "erpItemId", "erpMovId", "articleId",
             "referenceCode", "articleName", "quantity", "lineTotal",
             "discountPercent", "ivaRate", "size", "color", "warehouseId",
             "documentDate", "comprobanteCode", "comprobante",
             "storeId", "storeName", "documentFamily", "syncedAt")
          VALUES ${placeholders.join(", ")}
          ON CONFLICT ("organizationId", "erpItemId") DO UPDATE SET
            "referenceCode"   = EXCLUDED."referenceCode",
            "articleName"     = EXCLUDED."articleName",
            "quantity"        = EXCLUDED."quantity",
            "lineTotal"       = EXCLUDED."lineTotal",
            "discountPercent" = EXCLUDED."discountPercent",
            "ivaRate"         = EXCLUDED."ivaRate",
            "size"            = EXCLUDED."size",
            "color"           = EXCLUDED."color",
            "warehouseId"     = EXCLUDED."warehouseId",
            "documentDate"    = EXCLUDED."documentDate",
            "comprobanteCode" = EXCLUDED."comprobanteCode",
            "comprobante"     = EXCLUDED."comprobante",
            "storeId"         = EXCLUDED."storeId",
            "storeName"       = EXCLUDED."storeName",
            "documentFamily"  = EXCLUDED."documentFamily",
            "syncedAt"        = NOW()
        `;

        await db.$executeRawUnsafe(sql, ...values);
        metrics.linesWritten += batch.length;
      } catch (err) {
        metrics.linesErrored += batch.length;
        metrics.errors.push({
          erpMovId: batch[0]?.erpMovId,
          message: `Bulk batch at offset ${i}: ${err instanceof Error ? err.message : String(err)}`,
        });
      }

      if ((i + BULK_BATCH) % 2000 < BULK_BATCH) {
        console.log(
          `  ... synced ${Math.min(i + BULK_BATCH, lines.length)} / ${lines.length} store sale lines`,
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

// ── Source-routed sync ─────────────────────────────────────────────────────

/**
 * AGENTIK-SAG-STORE-SALE-LINES-CURRENT-CUTOVER-01
 *
 * Source-aware wrapper around syncStoreSaleLines().
 *
 * Resolves SAG config from the central router instead of Connector.config.
 * Handles cross-cutoff date ranges by splitting into segments and syncing
 * each against the authoritative database.
 *
 * For current-only syncs (dateFrom >= 2026-07-21), a single CURRENT call
 * is made. For ranges crossing the cutoff, two calls are made and results
 * are merged.
 */
export interface RoutedStoreSaleLinesSyncOptions {
  organizationId: string;
  fuenteCodes: string[];
  dateFrom: string;
  dateTo: string;
  dryRun?: boolean;
  batchSize?: number;
}

export async function syncStoreSaleLinesRouted(
  opts: RoutedStoreSaleLinesSyncOptions,
): Promise<StoreSaleLinesSyncResult> {
  const route = resolveSagSourcesForRange(opts.dateFrom, opts.dateTo);

  console.log(
    `[store-sale-lines] routed sync: ${route.sourcesUsed.join("+")} ` +
    `(${opts.dateFrom} → ${opts.dateTo}, ${route.segments.length} segment(s))`,
  );

  const results: StoreSaleLinesSyncResult[] = [];

  for (const segment of route.segments) {
    const config = getSagConnection(segment.source);
    console.log(
      `[store-sale-lines] segment ${segment.source}: ${segment.from} → ${segment.to} ` +
      `(database=${config.database})`,
    );

    const segResult = await syncStoreSaleLines({
      organizationId: opts.organizationId,
      sagConfig: config,
      sagDatabase: config.database!,
      fuenteCodes: opts.fuenteCodes,
      dateFrom: segment.from,
      dateTo: segment.to,
      dryRun: opts.dryRun,
      batchSize: opts.batchSize,
    });

    results.push(segResult);
  }

  // Single segment — return directly
  if (results.length === 1) return results[0];

  // Merge multi-segment results
  const merged: StoreSaleLinesSyncMetrics = {
    headersRead: 0,
    linesRead: 0,
    linesWritten: 0,
    linesSkipped: 0,
    linesErrored: 0,
    errors: [],
    durationMs: 0,
    perCode: {},
  };

  for (const r of results) {
    merged.headersRead += r.metrics.headersRead;
    merged.linesRead += r.metrics.linesRead;
    merged.linesWritten += r.metrics.linesWritten;
    merged.linesSkipped += r.metrics.linesSkipped;
    merged.linesErrored += r.metrics.linesErrored;
    merged.errors.push(...r.metrics.errors);
    merged.durationMs += r.metrics.durationMs;

    for (const [code, stats] of Object.entries(r.metrics.perCode)) {
      if (!merged.perCode[code]) merged.perCode[code] = { headers: 0, lines: 0 };
      merged.perCode[code].headers += stats.headers;
      merged.perCode[code].lines += stats.lines;
    }
  }

  return {
    success: results.every((r) => r.success),
    dryRun: opts.dryRun ?? false,
    metrics: merged,
  };
}
