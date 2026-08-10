/**
 * lib/comercial/frontline/seller-commission-service.ts
 *
 * AGENTIK-SELLER-COMMISSION-V1-IMPLEMENTATION-01
 *
 * Domain service: computes seller commission statement from certified SAG views.
 *
 * Pipeline (event-first, row-level eligibility):
 *   1. Query vw_agentik_recaudos for positive applications in [startDate, endDateExclusive)
 *   2. Split DOCUMENTO_RELACIONADO into (prefix, number)
 *   3. Lookup each parseable document in vw_agentik_ventas by (NUMERO_DOCUMENTO, CLIENTE_ID)
 *   4. Row-level eligibility: exact sale must exist + VENDEDOR_ID must match
 *   5. Compute days = calendar(FECHA_RECAUDO - FECHA_DOCUMENTO)
 *   6. Apply commission band → rate → commission per application row
 *
 * Row-level eligibility (no prefix whitelist gate):
 *   - VALOR_RECAUDADO > 0
 *   - DOCUMENTO_RELACIONADO parses deterministically (PREFIX-NUMBER)
 *   - Exact sale exists in vw_agentik_ventas (NUMERO_DOCUMENTO + CLIENTE_ID)
 *   - VENDEDOR_ID exists and matches sellerTerceroId
 *   - FECHA_DOCUMENTO exists
 *
 * Authorities:
 *   COLLECTION = vw_agentik_recaudos (FECHA_RECAUDO, VALOR_RECAUDADO, DOCUMENTO_RELACIONADO, CLIENTE_ID)
 *   SALE = vw_agentik_ventas (NUMERO_DOCUMENTO, CLIENTE_ID, VENDEDOR_ID, FECHA_DOCUMENTO)
 *   SELLER = VENDEDOR_ID (integer, SAG ka_nl_tercero_vend)
 *   INVOICE DATE = FECHA_DOCUMENTO from vw_agentik_ventas
 *   PERIOD = half-open [startDate, endDateExclusive) on FECHA_RECAUDO
 *   AMOUNT = integer cents — round(collectedCents * rate) per row, then sum
 *
 * Money: all financial arithmetic uses integer cents (DECIMAL(38,2) × 100).
 *   No binary floating-point in financial computation paths.
 *
 * Security:
 *   - sellerTerceroId comes from server-side identity resolution (never client)
 *   - No SQL injection: only integer/date params interpolated, validated before use
 *   - server-only module
 */

import "server-only";
import { consultaSagJson } from "@/lib/connectors/pya/client";
import { getSagConnection, type SagSource } from "@/lib/connectors/pya/sag-source-router";
import { SELLER_COMMISSION_BANDS } from "./seller-app-types";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SellerCommissionEntryDto {
  document: string;            // e.g. "F2-8645"
  invoiceDate: string;         // ISO date YYYY-MM-DD
  collectionDate: string;      // ISO date YYYY-MM-DD
  collectedAmount: number;     // DECIMAL(38,2) as number (dollars.cents)
  days: number;                // calendar days invoice→collection
  band: string;                // "0-59" | "60-75" | "76-90" | "91-105" | "106+"
  rate: number;                // 0.05 | 0.04 | 0.03 | 0.02 | 0.01
  commissionAmount: number;    // round(collectedAmount * rate, 2) — computed via integer cents
  receiptId: number;           // ID_RECAUDO
}

export interface SellerCommissionBandSummary {
  band: string;
  applications: number;
  collectedAmount: number;
  commissionAmount: number;
}

export type CommissionTruthState =
  | "CERTIFIED"               // computation succeeded with real data
  | "CERTIFIED_ZERO"          // computation succeeded but zero applications found
  | "SAG_UNAVAILABLE"         // SAG SOAP connection failed
  | "IDENTITY_UNRESOLVED";    // sellerTerceroId is null/unknown

export interface SellerCommissionStatementDto {
  sellerTerceroId: number;
  year: number;
  month: number;               // 1-12
  periodStart: string;         // ISO date (inclusive)
  periodEndExclusive: string;  // ISO date (exclusive)

  totalApplications: number;
  totalCollected: number;      // sum of collectedAmount
  totalCommission: number;     // sum of commissionAmount

  bandSummary: SellerCommissionBandSummary[];
  entries: SellerCommissionEntryDto[];

  truthState: CommissionTruthState;
  computedAt: string;          // ISO timestamp
}

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Known sale document prefixes (CERT-05/06) — for diagnostics/audit only.
 * NOT used as an eligibility gate. Row-level exact sale evidence decides
 * commissionability.
 */
const KNOWN_SALE_PREFIXES = new Set(["FE", "F2", "FW", "EW", ".7", "RE", "F3", "F7"]);

const DAY_MS = 86_400_000;

// ── Exact cents arithmetic ──────────────────────────────────────────────────

/**
 * Convert a DECIMAL(38,2) value to integer cents.
 * Rounds to nearest cent to absorb any floating-point parse noise.
 */
function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/** Convert integer cents back to a 2-decimal number for DTO serialization. */
function fromCents(cents: number): number {
  return cents / 100;
}

/**
 * Compute commission in integer cents: round(amountCents × rate).
 * Rates are exact fractions (5/100, 4/100, 3/100, 2/100, 1/100).
 * Using integer multiplication avoids floating-point accumulation error.
 *
 * Formula: round(amountCents × rateNumerator / 100)
 * where rateNumerator is 5, 4, 3, 2, or 1.
 */
function commissionCents(amountCents: number, rate: number): number {
  const rateNumerator = Math.round(rate * 100); // 0.05 → 5, 0.04 → 4, etc.
  return Math.round(amountCents * rateNumerator / 100);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function splitDocument(doc: string): { code: string; num: number } | null {
  const i = doc.indexOf("-");
  if (i <= 0) return null;
  const num = parseInt(doc.slice(i + 1), 10);
  if (!Number.isFinite(num)) return null;
  return { code: doc.slice(0, i).trim().toUpperCase(), num };
}

function computeRate(days: number): number {
  for (const b of SELLER_COMMISSION_BANDS) {
    if (days >= b.minDays && days <= b.maxDays) return b.rate;
  }
  return 0;
}

function computeBand(days: number): string {
  if (days <= 59) return "0-59";
  if (days <= 75) return "60-75";
  if (days <= 90) return "76-90";
  if (days <= 105) return "91-105";
  return "106+";
}

function isoDate(v: unknown): string {
  return String(v ?? "").slice(0, 10);
}

function validateYearMonth(year: number, month: number): boolean {
  return (
    Number.isInteger(year) && year >= 2020 && year <= 2099 &&
    Number.isInteger(month) && month >= 1 && month <= 12
  );
}

function periodBounds(year: number, month: number): { start: string; endExclusive: string } {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endExclusive = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { start, endExclusive };
}

async function sagQuery(source: SagSource, sql: string): Promise<any[] | null> {
  try {
    const cfg = getSagConnection(source);
    const rows = await consultaSagJson(cfg, sql);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return null;
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

// ── Main computation ─────────────────────────────────────────────────────────

/**
 * Computes the commission statement for a seller in a given year/month.
 *
 * Event-first pipeline (row-level eligibility — no prefix whitelist gate):
 *   recaudos(period) → parse(doc) → lookup(ventas) → match(vendedor) → compute
 *
 * @param sellerTerceroId — SAG ka_nl_tercero_vend (integer). From server-side identity.
 * @param year — e.g. 2026
 * @param month — 1-12
 */
export async function computeSellerCommissionStatement(
  sellerTerceroId: number,
  year: number,
  month: number,
): Promise<SellerCommissionStatementDto> {
  const computedAt = new Date().toISOString();

  if (!validateYearMonth(year, month)) {
    return emptyStatement(sellerTerceroId, year, month, "CERTIFIED_ZERO", computedAt);
  }

  const { start, endExclusive } = periodBounds(year, month);

  // §1: Query all positive recaudos in the period
  const recaudos = await sagQuery("CURRENT", `
    SELECT ID_RECAUDO, FECHA_RECAUDO, CLIENTE_ID, DOCUMENTO_RELACIONADO, VALOR_RECAUDADO
    FROM vw_agentik_recaudos
    WHERE VALOR_RECAUDADO > 0
      AND FECHA_RECAUDO >= '${start}'
      AND FECHA_RECAUDO < '${endExclusive}'
  `);

  if (recaudos === null) {
    return emptyStatement(sellerTerceroId, year, month, "SAG_UNAVAILABLE", computedAt);
  }

  // §2: Parse documents — any parseable PREFIX-NUMBER format qualifies for lookup.
  //     No prefix whitelist gate. Commissionability is decided by exact sale evidence.
  interface ParsedRecaudo {
    receiptId: number;
    collectionDate: string;
    clienteId: number;
    documentLabel: string;
    collectedCents: number;
    parsed: { code: string; num: number };
  }

  const parsedRecaudos: ParsedRecaudo[] = [];
  for (const r of recaudos) {
    const docLabel = String(r.DOCUMENTO_RELACIONADO ?? "");
    const parsed = splitDocument(docLabel);
    if (!parsed) continue;

    parsedRecaudos.push({
      receiptId: Number(r.ID_RECAUDO),
      collectionDate: isoDate(r.FECHA_RECAUDO),
      clienteId: Number(r.CLIENTE_ID),
      documentLabel: docLabel,
      collectedCents: toCents(Number(r.VALOR_RECAUDADO)),
      parsed,
    });
  }

  if (parsedRecaudos.length === 0) {
    return emptyStatement(sellerTerceroId, year, month, "CERTIFIED_ZERO", computedAt);
  }

  // §3: Lookup sales in vw_agentik_ventas
  // Key: "num|clienteId" → { fecha, vendedorId }
  const uniqueNums = [...new Set(parsedRecaudos.map(r => r.parsed.num))];

  const ventasMap = new Map<string, { fecha: string; vendedorId: number | null }>();

  // Query both sources — the view exists in both CURRENT and HISTORICAL with full data
  const sources: SagSource[] = ["CURRENT"];
  try {
    getSagConnection("HISTORICAL");
    sources.push("HISTORICAL");
  } catch {
    // HISTORICAL not configured — use CURRENT only
  }

  for (const source of sources) {
    for (const numChunk of chunk(uniqueNums, 200)) {
      const inList = numChunk.map(n => `'${n}'`).join(",");
      const rows = await sagQuery(source, `
        SELECT DISTINCT NUMERO_DOCUMENTO, CLIENTE_ID, VENDEDOR_ID, FECHA_DOCUMENTO
        FROM vw_agentik_ventas
        WHERE NUMERO_DOCUMENTO IN (${inList})
      `);
      if (!rows) continue;

      for (const v of rows) {
        const key = `${parseInt(String(v.NUMERO_DOCUMENTO), 10)}|${Number(v.CLIENTE_ID)}`;
        // First source wins (CURRENT preferred)
        if (!ventasMap.has(key)) {
          ventasMap.set(key, {
            fecha: isoDate(v.FECHA_DOCUMENTO),
            vendedorId: v.VENDEDOR_ID != null ? Number(v.VENDEDOR_ID) : null,
          });
        }
      }
    }
  }

  // §4-6: Row-level eligibility — exact sale + seller match + compute
  const entries: SellerCommissionEntryDto[] = [];

  for (const r of parsedRecaudos) {
    const key = `${r.parsed.num}|${r.clienteId}`;
    const sale = ventasMap.get(key);
    // No exact sale in ventas → not commissionable
    if (!sale) continue;

    // VENDEDOR_ID must exist and match
    if (sale.vendedorId !== sellerTerceroId) continue;

    // FECHA_DOCUMENTO must exist
    const invoiceDate = new Date(sale.fecha);
    const collectionDate = new Date(r.collectionDate);
    if (isNaN(invoiceDate.getTime()) || isNaN(collectionDate.getTime())) continue;

    const days = Math.max(0, Math.floor((collectionDate.getTime() - invoiceDate.getTime()) / DAY_MS));

    // Commission via exact integer cents arithmetic
    const rate = computeRate(days);
    const comCents = commissionCents(r.collectedCents, rate);

    entries.push({
      document: r.documentLabel,
      invoiceDate: sale.fecha,
      collectionDate: r.collectionDate,
      collectedAmount: fromCents(r.collectedCents),
      days,
      band: computeBand(days),
      rate,
      commissionAmount: fromCents(comCents),
      receiptId: r.receiptId,
    });
  }

  // Sort by collection date desc, then document
  entries.sort((a, b) =>
    b.collectionDate.localeCompare(a.collectionDate) || a.document.localeCompare(b.document),
  );

  // Build band summary — accumulate in integer cents
  const bandMap = new Map<string, { applications: number; collectedCents: number; commissionCents: number }>();
  for (const e of entries) {
    const existing = bandMap.get(e.band) ?? { applications: 0, collectedCents: 0, commissionCents: 0 };
    existing.applications++;
    existing.collectedCents += toCents(e.collectedAmount);
    existing.commissionCents += toCents(e.commissionAmount);
    bandMap.set(e.band, existing);
  }

  const bandOrder = ["0-59", "60-75", "76-90", "91-105", "106+"];
  const bandSummary: SellerCommissionBandSummary[] = bandOrder
    .filter(b => bandMap.has(b))
    .map(b => {
      const d = bandMap.get(b)!;
      return {
        band: b,
        applications: d.applications,
        collectedAmount: fromCents(d.collectedCents),
        commissionAmount: fromCents(d.commissionCents),
      };
    });

  // Accumulate totals in integer cents
  let totalCollectedCents = 0;
  let totalCommissionCents = 0;
  for (const e of entries) {
    totalCollectedCents += toCents(e.collectedAmount);
    totalCommissionCents += toCents(e.commissionAmount);
  }

  return {
    sellerTerceroId,
    year,
    month,
    periodStart: start,
    periodEndExclusive: endExclusive,
    totalApplications: entries.length,
    totalCollected: fromCents(totalCollectedCents),
    totalCommission: fromCents(totalCommissionCents),
    bandSummary,
    entries,
    truthState: entries.length > 0 ? "CERTIFIED" : "CERTIFIED_ZERO",
    computedAt,
  };
}

// ── Empty statement factory ──────────────────────────────────────────────────

function emptyStatement(
  sellerTerceroId: number,
  year: number,
  month: number,
  truthState: CommissionTruthState,
  computedAt: string,
): SellerCommissionStatementDto {
  const { start, endExclusive } = validateYearMonth(year, month)
    ? periodBounds(year, month)
    : { start: `${year}-${String(month).padStart(2, "0")}-01`, endExclusive: "" };

  return {
    sellerTerceroId,
    year,
    month,
    periodStart: start,
    periodEndExclusive: endExclusive,
    totalApplications: 0,
    totalCollected: 0,
    totalCommission: 0,
    bandSummary: [],
    entries: [],
    truthState,
    computedAt,
  };
}
