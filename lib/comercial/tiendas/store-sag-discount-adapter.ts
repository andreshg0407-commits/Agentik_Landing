/**
 * lib/comercial/tiendas/store-sag-discount-adapter.ts
 *
 * AGENTIK-STORES-DISCOUNTS-SAG-AWARE-ENGINE-01
 *
 * Server-side read adapter for SAG CURRENT active discounts.
 *
 * Fetches all currently-active discounts in one SOAP batch from
 * v_articulos_descuento, then resolves per (reference, warehouse) in memory.
 *
 * Architecture:
 *   - Uses getSagConnection("CURRENT") — explicit source routing
 *   - Single SOAP request (no N+1)
 *   - Pure in-memory resolution after fetch
 *   - Read-only: NO SAG writes
 *
 * Time semantics:
 *   SAG uses FechaInicial <= GETDATE() AND FechaFinal >= GETDATE() (inclusive).
 *   We use the same comparison: effectiveFrom <= asOf AND effectiveTo >= asOf.
 *   asOf defaults to Colombia local date (UTC-5) to avoid timezone day-shift.
 */

import "server-only";

import { consultaSagJson } from "@/lib/connectors/pya/client";
import { getSagConnection } from "@/lib/connectors/pya/sag-source-router";
import type {
  SagActiveDiscount,
  SagDiscountResolution,
  SagDiscountFetchResult,
} from "./store-sag-discount-types";

// ── Colombia timezone offset ────────────────────────────────────────────────

/**
 * Get current date in Colombia timezone (UTC-5) as ISO date string.
 * This prevents a JS UTC midnight from shifting the discount date boundary.
 */
function getColombiaDateIso(): string {
  const now = new Date();
  // Colombia is UTC-5 (no DST)
  const colombiaOffset = -5 * 60;
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const colombiaMs = utcMs + colombiaOffset * 60_000;
  const colombiaDate = new Date(colombiaMs);
  return colombiaDate.toISOString().slice(0, 10);
}

// ── SAG row shape from v_articulos_descuento ────────────────────────────────

interface SagDiscountRow {
  k_sc_codigo_articulo: string;
  CodigoBodega: string;
  ka_nl_bodega?: number;
  NombreBodega: string;
  PorcentajeDescuento: number;
  FechaInicial: string;
  FechaFinal: string;
}

// ── Batch fetch ─────────────────────────────────────────────────────────────

/**
 * Fetch ALL currently-active discounts from SAG CURRENT in a single SOAP call.
 *
 * Uses v_articulos_descuento view which joins:
 *   ARTICULOS_DESCUENTOS + v_articulos + bodegas
 *
 * Expected payload: ~5,600 rows (small — fits in a single SOAP response).
 *
 * The ka_nl_bodega column is not always present in the view depending on
 * SAG configuration. We fetch it via a JOIN to ensure it's available.
 */
export async function fetchActiveSagDiscounts(): Promise<SagDiscountFetchResult> {
  const config = getSagConnection("CURRENT");
  const t0 = Date.now();

  const sql = `
    SELECT
      vd.k_sc_codigo_articulo,
      vd.CodigoBodega,
      ad.ka_nl_bodega,
      vd.NombreBodega,
      vd.PorcentajeDescuento,
      vd.FechaInicial,
      vd.FechaFinal
    FROM v_articulos_descuento vd
    JOIN ARTICULOS_DESCUENTOS ad
      ON ad.ka_nl_articulo = (
        SELECT TOP 1 va.ka_nl_articulo
        FROM v_articulos va
        WHERE va.k_sc_codigo_articulo = vd.k_sc_codigo_articulo
      )
      AND ad.ka_nl_bodega = (
        SELECT TOP 1 b.ka_nl_bodega
        FROM bodegas b
        WHERE b.ss_codigo = vd.CodigoBodega
      )
      AND ad.ddt_fecha_ini = vd.FechaInicial
      AND ad.ddt_fecha_fin = vd.FechaFinal
    WHERE vd.FechaInicial <= GETDATE()
      AND vd.FechaFinal >= GETDATE()
  `.trim();

  const rawRows = await consultaSagJson(config, sql);
  const rows = rawRows as unknown as SagDiscountRow[];
  const fetchDurationMs = Date.now() - t0;

  const discounts: SagActiveDiscount[] = rows.map(row => ({
    referenceCode: (row.k_sc_codigo_articulo ?? "").trim(),
    warehouseCode: (row.CodigoBodega ?? "").trim(),
    warehousePk: Number(row.ka_nl_bodega ?? 0),
    warehouseName: (row.NombreBodega ?? "").trim(),
    discountPercent: Number(row.PorcentajeDescuento ?? 0),
    effectiveFrom: parseSagDate(row.FechaInicial),
    effectiveTo: parseSagDate(row.FechaFinal),
  }));

  return {
    discounts,
    rowCount: discounts.length,
    fetchDurationMs,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Simpler fetch: direct query on v_articulos_descuento only.
 * Falls back to this if the JOIN approach has issues.
 * ka_nl_bodega is resolved from the STORE_PK mapping instead.
 */
export async function fetchActiveSagDiscountsSimple(): Promise<SagDiscountFetchResult> {
  const config = getSagConnection("CURRENT");
  const t0 = Date.now();

  const sql = `
    SELECT
      k_sc_codigo_articulo,
      CodigoBodega,
      NombreBodega,
      PorcentajeDescuento,
      FechaInicial,
      FechaFinal
    FROM v_articulos_descuento
    WHERE FechaInicial <= GETDATE()
      AND FechaFinal >= GETDATE()
  `.trim();

  const rawRows = await consultaSagJson(config, sql);
  const rows = rawRows as unknown as SagDiscountRow[];
  const fetchDurationMs = Date.now() - t0;

  // Resolve ka_nl_bodega from CodigoBodega using warehouse-master
  const { resolveWarehouseByBusinessCode } = await import("@/lib/inventory/warehouse-master");

  const discounts: SagActiveDiscount[] = rows.map(row => {
    const code = (row.CodigoBodega ?? "").trim();
    const wh = resolveWarehouseByBusinessCode(code);
    return {
      referenceCode: (row.k_sc_codigo_articulo ?? "").trim(),
      warehouseCode: code,
      warehousePk: wh ? Number(wh.kaNlBodega) : 0,
      warehouseName: (row.NombreBodega ?? "").trim(),
      discountPercent: Number(row.PorcentajeDescuento ?? 0),
      effectiveFrom: parseSagDate(row.FechaInicial),
      effectiveTo: parseSagDate(row.FechaFinal),
    };
  });

  return {
    discounts,
    rowCount: discounts.length,
    fetchDurationMs,
    fetchedAt: new Date().toISOString(),
  };
}

// ── In-memory resolution ────────────────────────────────────────────────────

/**
 * Build a lookup index from fetched discounts.
 * Key: "referenceCode|warehousePk"
 */
export function buildDiscountIndex(
  discounts: readonly SagActiveDiscount[],
): Map<string, SagActiveDiscount[]> {
  const index = new Map<string, SagActiveDiscount[]>();
  for (const d of discounts) {
    const key = `${d.referenceCode}|${d.warehousePk}`;
    const existing = index.get(key);
    if (existing) existing.push(d);
    else index.set(key, [d]);
  }
  return index;
}

/**
 * Resolve the current SAG discount for a specific (reference, warehousePk).
 *
 * Resolution law (fail-closed):
 *   0 rows → NONE
 *   1 row  → ACTIVE
 *   >1 rows → AMBIGUOUS (no automatic recommendation)
 */
export function resolveSagDiscount(
  index: Map<string, SagActiveDiscount[]>,
  referenceCode: string,
  warehousePk: number,
): SagDiscountResolution {
  const key = `${referenceCode}|${warehousePk}`;
  const entries = index.get(key);

  if (!entries || entries.length === 0) {
    return { status: "NONE" };
  }

  if (entries.length === 1) {
    return { status: "ACTIVE", discount: entries[0] };
  }

  // >1 active rows for same (ref, warehouse) — AMBIGUOUS, fail closed
  return { status: "AMBIGUOUS", discounts: entries };
}

/**
 * Resolve SAG discount for a reference across ALL eligible store warehouses.
 * Returns a Map: storeSlug → SagDiscountResolution.
 */
export function resolveSagDiscountForAllStores(
  index: Map<string, SagActiveDiscount[]>,
  referenceCode: string,
): Map<string, SagDiscountResolution> {
  const { DISCOUNT_ELIGIBLE_STORE_PKS } = require("./store-sag-discount-types");
  const result = new Map<string, SagDiscountResolution>();

  for (const [slug, { pk }] of DISCOUNT_ELIGIBLE_STORE_PKS) {
    result.set(slug, resolveSagDiscount(index, referenceCode, pk));
  }

  return result;
}

// ── Date parsing ────────────────────────────────────────────────────────────

/**
 * Parse SAG datetime string to ISO date string.
 * SAG returns dates as "2026-06-01T00:00:00" or similar.
 * We extract just the date part.
 */
function parseSagDate(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = String(raw).trim();
  // Handle ISO format
  if (s.includes("T")) return s.slice(0, 10);
  // Handle "YYYY-MM-DD" directly
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Handle "MM/DD/YYYY" format
  const parts = s.split("/");
  if (parts.length === 3) {
    return `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
  }
  return s.slice(0, 10);
}
