import { createHash } from "crypto";
import { SaleChannel, SaleGrain } from "@prisma/client";
import type { RawSagRow, NormalizedSale, ParseError } from "./types";
import {
  classifyDocumentFamily,
  type SagDocumentFamilyMap,
} from "./sag-document-type";
import { inferSourceType } from "@/lib/sag/source-inference";
import { fromSagSourceType, type SourceInferredFrom } from "@/lib/sag/source-semantics";

// ── Amount parser ─────────────────────────────────────────────────────────────
//
// SAG Colombia uses dots as thousand separators and commas as decimal separators.
// This parser handles every format seen in real Castillitos exports:
//
//   "1.250.000"      → 1250000        (dots = thousands, no decimal)
//   "1.250.000,50"   → 1250000.50     (Colombian standard)
//   "1,250,000"      → 1250000        (US thousands)
//   "1,250,000.50"   → 1250000.50     (US decimal)
//   "$1.250.000"     → 1250000        (with currency symbol)
//   "1250000"        → 1250000        (bare integer)
//   "1.5"            → 1.50           (small decimal, NOT 1500)
//   "0"              → 0
//   ""               → 0
//   0                → 0              (already a number)

export function parseColombianAmount(raw: string | number): number {
  if (typeof raw === "number") {
    if (!isFinite(raw)) throw new Error(`Non-finite amount: ${raw}`);
    return raw;
  }

  // Strip currency symbols, spaces, alphabetic characters (COP, $, etc.)
  const stripped = raw.replace(/[^0-9.,-]/g, "").trim();
  if (stripped === "" || stripped === "-" || stripped === ".") return 0;

  const dotCount   = (stripped.match(/\./g) ?? []).length;
  const commaCount = (stripped.match(/,/g)  ?? []).length;
  const lastDot    = stripped.lastIndexOf(".");
  const lastComma  = stripped.lastIndexOf(",");

  let normalized: string;

  if (dotCount > 0 && commaCount > 0) {
    // Both separators — the one that appears LAST is the decimal separator.
    if (lastComma > lastDot) {
      // Colombian: "1.250.000,50" → remove dots, replace comma with dot
      normalized = stripped.replace(/\./g, "").replace(",", ".");
    } else {
      // US: "1,250,000.50" → remove commas
      normalized = stripped.replace(/,/g, "");
    }
  } else if (commaCount > 0 && dotCount === 0) {
    // Only commas present.
    if (commaCount > 1) {
      // Multiple commas: "1,250,000" → all are thousands separators
      normalized = stripped.replace(/,/g, "");
    } else {
      const afterLastComma = stripped.slice(lastComma + 1);
      if (afterLastComma.length === 3 && /^\d{3}$/.test(afterLastComma)) {
        // Single comma with exactly 3 digits after: "1,250" → thousands separator
        normalized = stripped.replace(",", "");
      } else {
        // "1250,50" or "1,5" → comma is decimal separator
        normalized = stripped.replace(",", ".");
      }
    }
  } else if (dotCount > 0 && commaCount === 0) {
    // Only dots present.
    if (dotCount > 1) {
      // Multiple dots: "1.250.000" → all are thousands separators
      normalized = stripped.replace(/\./g, "");
    } else {
      // Single dot: determine by digit count after dot
      const afterDot = stripped.slice(lastDot + 1);
      if (afterDot.length === 3 && /^\d{3}$/.test(afterDot)) {
        // "1.250" — 3 exact digits: thousands separator (common in Colombian accounting)
        normalized = stripped.replace(".", "");
      } else {
        // "1250.50" or "1.5" → decimal point
        normalized = stripped;
      }
    }
  } else {
    // No separators at all: plain integer or empty
    normalized = stripped;
  }

  const result = parseFloat(normalized);
  if (!isFinite(result)) throw new Error(`Cannot parse amount: "${raw}"`);
  return result;
}

// ── Channel normalization ─────────────────────────────────────────────────────

const CHANNEL_MAP: Record<string, SaleChannel> = {
  tienda:             SaleChannel.TIENDA,
  "tienda fisica":    SaleChannel.TIENDA,
  "tienda física":    SaleChannel.TIENDA,
  local:              SaleChannel.TIENDA,
  online:             SaleChannel.ONLINE,
  web:                SaleChannel.ONLINE,
  ecommerce:          SaleChannel.ONLINE,
  "e-commerce":       SaleChannel.ONLINE,
  telefono:           SaleChannel.TELEFONO,
  teléfono:           SaleChannel.TELEFONO,
  "call center":      SaleChannel.TELEFONO,
  distribuidor:       SaleChannel.DISTRIBUIDOR,
  dist:               SaleChannel.DISTRIBUIDOR,
  mayorista:          SaleChannel.MAYORISTA,
  wholesale:          SaleChannel.MAYORISTA,
};

export function normalizeChannel(raw: string): SaleChannel {
  return CHANNEL_MAP[raw.toLowerCase().trim()] ?? SaleChannel.OTRO;
}

// ── Date normalization ────────────────────────────────────────────────────────

export function normalizeDate(raw: string): Date {
  const s = raw.trim();
  // ISO: "2024-03-15"
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + "T00:00:00Z");
  // Colombian d/m/Y or d-m-Y: "15/03/2024" or "15-03-2024"
  const co = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (co) return new Date(`${co[3]}-${co[2].padStart(2,"0")}-${co[1].padStart(2,"0")}T00:00:00Z`);
  // SAG YYYYMM: "202403" → first of month
  if (/^\d{6}$/.test(s)) return new Date(`${s.slice(0,4)}-${s.slice(4,6)}-01T00:00:00Z`);
  throw new Error(`Cannot parse date: "${s}"`);
}

// ── PeriodoAoMes normalization ────────────────────────────────────────────────
// Accepts "202403", "2024-03", "20240315" → always "YYYYMM" or null.

export function normalizePeriodo(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = raw.trim().replace(/[\-\/\s]/g, "");
  if (/^\d{6}$/.test(s)) return s;
  if (/^\d{8}$/.test(s)) return s.slice(0, 6); // "20240315" → "202403"
  return null;
}

// ── Slug — stable display-friendly key ───────────────────────────────────────

export function toSlug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

// ── Seller / store resolution ─────────────────────────────────────────────────
// sellerCode = SAG code when it looks like a short alphanumeric code (no spaces,
// ≤10 chars). sellerSlug is always derived from the name (stable join key).

function looksLikeCode(s: string): boolean {
  return /^[A-Z0-9]{1,10}$/.test(s.trim());
}

export function resolveSellerFields(raw: string): {
  sellerCode: string | null;
  sellerSlug: string;
  sellerName: string;
} {
  const name = raw.trim();
  return {
    sellerCode: looksLikeCode(name) ? name : null,
    sellerSlug: toSlug(name),
    sellerName: name,
  };
}

export function resolveStoreFields(raw: string): {
  storeCode: string | null;
  storeSlug: string;
  storeName: string;
} {
  const name = raw.trim();
  return {
    storeCode: looksLikeCode(name) ? name : null,
    storeSlug: toSlug(name),
    storeName: name,
  };
}

// ── Natural key (deduplication hash) ─────────────────────────────────────────
// Short SHA-256 of the row's stable identifying fields — NOT including orgId
// (orgId is enforced at the DB level via @@unique([organizationId, naturalKey])).
//
// TRANSACTION: date + seller + store + line + channel + comprobante + amount
// AGGREGATED:  period + seller + store + line + channel + comprobanteCode
// (amount excluded for AGGREGATED since the same group can be re-exported with
// corrections, and the scopeKey replacement strategy is the dedup mechanism)

export function buildNaturalKey(params: {
  grain:           SaleGrain;
  periodoAoMes:    string | null;
  saleDate:        Date;
  sellerSlug:      string;
  storeSlug:       string;
  productLine:     string;
  channel:         string;
  comprobanteCode: string | null;
  comprobante:     string | null;
  amount:          number;
}): string {
  const parts =
    params.grain === SaleGrain.AGGREGATED
      ? [
          "AGG",
          params.periodoAoMes ?? params.saleDate.toISOString().slice(0, 7).replace("-", ""),
          params.sellerSlug,
          params.storeSlug,
          params.productLine.toLowerCase().trim(),
          params.channel,
          params.comprobanteCode ?? "",
        ]
      : [
          "TXN",
          params.saleDate.toISOString().slice(0, 10),
          params.sellerSlug,
          params.storeSlug,
          params.productLine.toLowerCase().trim(),
          params.channel,
          params.comprobante ?? params.comprobanteCode ?? "",
          // Use integer centavos to avoid float hash drift
          String(Math.round(params.amount * 100)),
        ];

  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}

// ── Row normalizer ────────────────────────────────────────────────────────────

export function normalizeRow(
  raw:               RawSagRow,
  organizationId:    string,
  grain:             SaleGrain,
  documentFamilyMap: SagDocumentFamilyMap = {},
  fileName?:         string | null,
): NormalizedSale {
  const saleDate        = normalizeDate(raw.fecha);
  const periodoAoMes    = normalizePeriodo(raw.periodo_ao_mes ?? raw.periodo);
  const amount          = parseColombianAmount(raw.valor);
  const channel         = normalizeChannel(raw.canal);
  const seller          = resolveSellerFields(raw.vendedor);
  const store           = resolveStoreFields(raw.tienda);
  const comprobanteCode = raw.cod_comprobante?.trim() ?? null;
  const comprobante     = raw.comprobante?.trim()     ?? null;
  const sagDocumentFamily = classifyDocumentFamily(comprobanteCode, documentFamilyMap);
  const originDocumentRef = (raw.origen_documento as string | undefined)?.trim() ?? null;
  // Explicit source column: check all known SAG export field names and aliases.
  // Accepts strings ("Fuente 1", "F2", "remision") and numbers (1, 2).
  const explicitSource: string | number | null = (
    (raw.fuente as string | number | undefined) ??
    (raw.f     as string | number | undefined) ??
    (raw["tipo_fuente"]            as string | undefined) ??
    (raw["source"]                 as string | undefined) ??
    (raw["tipo_documento_fuente"]  as string | undefined)
  ) ?? null;
  const { sagSourceType, sourceDocumentStage, inferredFrom } = inferSourceType({
    sagDocumentFamily,
    comprobanteCode,
    comprobante,
    explicitSource,
    fileName,
  });
  const sourceType = fromSagSourceType(sagSourceType);

  // txCount semantics:
  // TRANSACTION: always 1 — we know exactly one transaction.
  // AGGREGATED:  use SAG-provided count when available, NULL otherwise.
  //              NULL = "we don't know how many transactions this row summarises"
  //              → callers must NOT compute avgTicket from a NULL txCount row.
  let txCount: number | null;
  if (grain === SaleGrain.TRANSACTION) {
    txCount = 1;
  } else {
    txCount = raw.num_transacciones != null ? Number(raw.num_transacciones) : null;
  }

  const naturalKey = buildNaturalKey({
    grain,
    periodoAoMes,
    saleDate,
    sellerSlug:      seller.sellerSlug,
    storeSlug:       store.storeSlug,
    productLine:     raw.linea,
    channel,
    comprobanteCode,
    comprobante,
    amount,
  });

  return {
    grain,
    saleDate,
    periodoAoMes,
    ...seller,
    ...store,
    productLine:         raw.linea.trim(),
    brand:               raw.marca?.trim()          ?? null,
    zone:                raw.zona?.trim()            ?? null,
    productCode:         raw.codigo?.trim()          ?? null,
    productName:         raw.producto?.trim()        ?? null,
    channel,
    comprobanteCode,
    comprobante,
    sagDocumentFamily,
    originDocumentRef,
    sagSourceType,
    sourceDocumentStage,
    sourceType,
    sourceInferredFrom:  inferredFrom as SourceInferredFrom,
    customerNit:         raw.nit_cliente?.trim()     ?? null,
    customerName:        raw.nombre_cliente?.trim()  ?? null,
    amount,
    currency:            "COP" as const,
    units:               raw.unidades != null ? Math.round(Number(raw.unidades)) : null,
    txCount,
    naturalKey,
    rawJson:             raw,
  };
}

// ── Batch normalizer with error collection ────────────────────────────────────

export function normalizeRows(
  rows:              RawSagRow[],
  organizationId:    string,
  grain:             SaleGrain,
  documentFamilyMap: SagDocumentFamilyMap = {},
  fileName?:         string | null,
): { ok: NormalizedSale[]; errors: ParseError[] } {
  const ok:     NormalizedSale[] = [];
  const errors: ParseError[]     = [];
  const seen    = new Set<string>(); // dedup within the batch

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const normalized = normalizeRow(row, organizationId, grain, documentFamilyMap, fileName);
      if (seen.has(normalized.naturalKey)) {
        errors.push({
          rowIndex:  i,
          row,
          error:    "Duplicate row within batch — skipped",
          severity: "warn",
        });
        continue;
      }
      seen.add(normalized.naturalKey);
      ok.push(normalized);
    } catch (e) {
      errors.push({
        rowIndex: i,
        row,
        error:    e instanceof Error ? e.message : String(e),
        severity: "error",
      });
    }
  }

  return { ok, errors };
}
