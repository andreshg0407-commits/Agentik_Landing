/**
 * SagPyaAdapter — reads Castillitos pivot-style order exports.
 *
 * File format (handled by lib/sales/pivot-parser):
 *   - Multi-row header: seller row → line-group row → column-header row
 *   - Line groups: CASTILLITOS / LATIN KIDS / IMPORTACION (one valor+cantidad pair each)
 *   - Data rows: fecha | nombre cliente | valor | cantidad (per line group)
 *
 * Adapter behaviour:
 *   - One RawSagRow → one UnifiedOrder (each row = one transaction per line group)
 *   - sourceId is a deterministic hash of the row's key fields (no native ID in SAG)
 *   - cursor is the ISO-8601 string of the latest orderedAt seen; on incremental
 *     pulls only rows with orderedAt > cursor are returned
 *   - File is provided via config (base64 buffer, absolute path, or HTTP URL)
 *
 * Config shape (stored in Connector.config):
 *   {
 *     fileName?:       string   // "export.xlsx" — determines xlsx vs csv parser
 *     fileBuffer?:     string   // base64-encoded bytes  (dev / small files)
 *     filePath?:       string   // absolute FS path      (server-side jobs)
 *     fileUrl?:        string   // https://… URL         (R2 / GCS / presigned)
 *     sellerOverride?: string   // override auto-detected seller name
 *     defaultCanal?:   string   // default canal ("tienda", "distribuidor", …)
 *     minOrderAmount?: number   // skip rows below this COP amount (default: 0)
 *   }
 */

import fs                                 from "fs";
import { createHash }                     from "crypto";
import { parsePivotXlsx, parsePivotCsv } from "@/lib/sales/pivot-parser";
import { parseColombianAmount }            from "@/lib/sales/normalize";
import { BaseAdapter }                     from "../../core/base-adapter";
import { buildOrder }                      from "../../core/normalizers/orders";
import type {
  AdapterConfig,
  PullResult,
  SyncModule,
  UnifiedOrder,
}                                          from "../../core/types";
import type { RawSagRow }                  from "@/lib/sales/types";

// ── Config ────────────────────────────────────────────────────────────────────

interface SagPyaConfig extends AdapterConfig {
  fileName?:       string;
  fileBuffer?:     string;  // base64 — NOTE: use fileUrl in production
  filePath?:       string;
  fileUrl?:        string;
  sellerOverride?: string;
  defaultCanal?:   string;
  minOrderAmount?: number;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class SagPyaAdapter extends BaseAdapter {
  readonly source        = "sag_pya" as const;
  readonly displayName   = "SAG PYA (Castillitos Format)";
  readonly supportedModules: SyncModule[] = ["orders"];

  private get cfg(): SagPyaConfig {
    return this.config as SagPyaConfig;
  }

  // ── pullOrders ──────────────────────────────────────────────────────────────

  async pullOrders(cursor?: string): Promise<PullResult<UnifiedOrder>> {
    // 1. Load file bytes
    const { buffer, fileName } = await this._loadFile();

    // 2. Parse pivot
    const parseOpts = {
      sellerOverride: this.cfg.sellerOverride,
      defaultCanal:   this.cfg.defaultCanal ?? "tienda",
    };
    const isXlsx   = /\.(xlsx|xls|ods)$/i.test(fileName);
    const parsed   = isXlsx
      ? parsePivotXlsx(buffer, parseOpts)
      : parsePivotCsv(buffer.toString("utf-8"), parseOpts);

    if (parsed.warnings.length > 0) {
      console.warn(`[SagPyaAdapter] ${parsed.warnings.length} parser warning(s):`);
      parsed.warnings.forEach(w => console.warn(`  ⚠  ${w}`));
    }

    if (parsed.producedRows === 0) {
      console.warn(
        `[SagPyaAdapter] Parser produced 0 rows. ` +
        `Sheet="${parsed.sheetName}", headerRow=${parsed.colHeaderRowIdx}, lineGroupRow=${parsed.lineGroupRowIdx}`
      );
    }

    // 3. Cursor-based incremental filter
    const cursorDate = cursor ? new Date(cursor) : null;
    const minAmount  = this.cfg.minOrderAmount ?? 0;

    // 4. Map rows → UnifiedOrder
    const orders: UnifiedOrder[] = [];

    for (const row of parsed.rows) {
      const orderedAt = parseRawDate(row.fecha);
      if (!orderedAt) continue;

      // Incremental: skip rows at or before the last cursor
      if (cursorDate && orderedAt <= cursorDate) continue;

      const order = rowToOrder(row, this.orgId, orderedAt, minAmount);
      if (order) orders.push(order);
    }

    // 5. Next cursor = latest orderedAt (ISO string)
    const latestDate = orders.reduce<Date | null>(
      (mx, o) => (!mx || o.orderedAt > mx ? o.orderedAt : mx),
      null
    );

    return {
      records:    orders,
      nextCursor: latestDate ? latestDate.toISOString() : null,
      hasMore:    false,    // file-based: single page, no pagination
      totalCount: parsed.producedRows,
    };
  }

  // ── testConnection ──────────────────────────────────────────────────────────

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const { buffer, fileName } = await this._loadFile();
      // Light parse: just check header detection
      const isXlsx = /\.(xlsx|xls|ods)$/i.test(fileName);
      const result  = isXlsx
        ? parsePivotXlsx(buffer, { sellerOverride: this.cfg.sellerOverride })
        : parsePivotCsv(buffer.toString("utf-8"), { sellerOverride: this.cfg.sellerOverride });

      if (result.colHeaderRowIdx === -1) {
        return { ok: false, error: `Could not detect column-header row in "${result.sheetName}". Check firstRowsPreview.` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  describeCursor(cursor: string): string {
    try {
      return `desde ${new Date(cursor).toLocaleDateString("es-CO", { dateStyle: "medium" })}`;
    } catch {
      return cursor;
    }
  }

  // ── File loading ──────────────────────────────────────────────────────────

  private async _loadFile(): Promise<{ buffer: Buffer; fileName: string }> {
    const { fileName = "report.xlsx", fileBuffer, filePath, fileUrl } = this.cfg;

    if (fileBuffer) {
      return { buffer: Buffer.from(fileBuffer, "base64"), fileName };
    }
    if (filePath) {
      return { buffer: fs.readFileSync(filePath), fileName: fileName || filePath };
    }
    if (fileUrl) {
      const res = await fetch(fileUrl);
      if (!res.ok) throw new Error(`[SagPyaAdapter] HTTP ${res.status} fetching file: ${fileUrl}`);
      return { buffer: Buffer.from(await res.arrayBuffer()), fileName };
    }

    throw new Error(
      "[SagPyaAdapter] No file source configured. " +
      "Provide config.fileBuffer (base64), config.filePath, or config.fileUrl."
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Row → UnifiedOrder mapping (module-level, not a class method)
// ─────────────────────────────────────────────────────────────────────────────

function rowToOrder(
  row:       RawSagRow,
  orgId:     string,
  orderedAt: Date,
  minAmount: number
): UnifiedOrder | null {
  // Parse amount
  let amount: number;
  try {
    amount = parseColombianAmount(row.valor);
  } catch {
    return null;
  }
  if (amount <= 0 || amount < minAmount) return null;

  // Parse quantity (optional — default to 1)
  const rawQty = row.unidades ? Number(row.unidades.toString().replace(/[^0-9.,-]/g, "").replace(",", ".")) : NaN;
  const qty    = !isNaN(rawQty) && rawQty > 0 ? rawQty : 1;

  // Stable sourceId: hash of the row's semantic identity
  // Uses the same fields as buildNaturalKey (TXN branch) so it is consistent
  // with records written by the old pivot-import UI path.
  const sourceId = createHash("sha256")
    .update([
      "TXN",
      orderedAt.toISOString().slice(0, 10),
      (row.tienda ?? row.vendedor ?? "").trim(),
      row.linea.trim(),
      (row.canal ?? "tienda").trim(),
      String(Math.round(amount * 100)),
    ].join("|"))
    .digest("hex")
    .slice(0, 32);

  const sellerName = row.tienda ?? row.vendedor ?? "DESCONOCIDO";

  return buildOrder({
    sourceId,
    source:   "sag_pya",
    orgId,

    orderNumber:   sourceId.slice(0, 12).toUpperCase(),
    status:        "fulfilled",   // SAG exports are historical completed orders

    customerName:   row.nombre_cliente ?? undefined,
    customerTaxId:  row.nit_cliente    ?? undefined,

    lineItems: [{
      productName: row.linea,
      quantity:    qty,
      unitPrice:   qty > 1 ? +(amount / qty).toFixed(2) : amount,
      total:       amount,
      discount:    0,
      tax:         0,
    }],

    total:        amount,
    discountTotal: 0,
    taxTotal:     0,
    subtotal:     amount,
    currency:     "COP",

    channel:      row.canal ?? "tienda",
    storeId:      slugify(sellerName),
    storeName:    sellerName,

    orderedAt,
    updatedAt:    orderedAt,

    meta: {
      vendedor:     row.vendedor,
      tienda:       row.tienda,
      periodoAoMes: row.periodo_ao_mes,
      rawFecha:     row.fecha,
      rawValor:     row.valor,
    },
  });
}

// ── Date parser ───────────────────────────────────────────────────────────────

export function parseRawDate(fecha: string): Date | null {
  const s = (fecha ?? "").trim();
  if (!s) return null;

  // ISO: 2024-03-15
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s.slice(0, 10) + "T00:00:00Z");
    return isNaN(d.getTime()) ? null : d;
  }

  // Colombian d/m/Y or d-m-Y
  const co = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (co) {
    const d = new Date(`${co[3]}-${co[2].padStart(2, "0")}-${co[1].padStart(2, "0")}T00:00:00Z`);
    return isNaN(d.getTime()) ? null : d;
  }

  // YYYYMMDD
  if (/^\d{8}$/.test(s)) {
    const d = new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T00:00:00Z`);
    return isNaN(d.getTime()) ? null : d;
  }

  // Excel date serial (e.g. "45366")
  const serial = Number(s);
  if (!isNaN(serial) && serial > 40000 && serial < 60000) {
    const d = new Date((serial - 25569) * 86_400_000);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

// ── Slug helper ───────────────────────────────────────────────────────────────

export function slugify(s: string): string {
  return s.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}
