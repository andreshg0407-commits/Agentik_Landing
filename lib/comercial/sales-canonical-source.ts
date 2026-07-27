/**
 * lib/comercial/sales-canonical-source.ts
 *
 * AGENTIK-SALES-CANONICAL-SOURCE-01 — Canonical store attribution from SAG fuente codes
 *
 * Single source of truth for mapping SAG document codes (comprobante codes)
 * to canonical store identities. Every module that needs "which store did this
 * sale happen at?" MUST consume this file — never derive store from city,
 * customer name, channel, seller, or other heuristics.
 *
 * Architecture:
 *   SAG FUENTES table → ka_ni_fuente (integer PK) → k_sc_codigo_fuente (text code)
 *   The adapter maps ka_ni_fuente → code via fuenteToCode() in mappers.ts.
 *   SaleRecord.rawJson.code stores the resolved text code.
 *   This file maps code → canonical store identity.
 *
 * Confirmed mapping (audit 2026-07-26, SaleRecord data for Castillitos):
 *   Facturas:  FC→Centro, FD→San Diego, FG→Gran Plaza, FA→Caldas
 *   Notas:     NT→Centro, NS→San Diego, NG→Gran Plaza, NA→Caldas
 *   Recaudos:  RC→Centro, RS→San Diego, RG→Gran Plaza, RA→Caldas
 *
 * Nota crédito suffix differs from factura suffix because NC/ND were already
 * taken by empresa document codes. T=Tienda(Centro), S=San(Diego).
 *
 * Client-safe: NO "server-only" import. Types + pure functions only.
 */

// ── Canonical store identity ─────────────────────────────────────────────────

export interface CanonicalSalesStore {
  storeId:   string;   // slug: "centro" | "san_diego" | "gran_plaza" | "caldas"
  storeName: string;   // display: "Centro" | "San Diego" | "Gran Plaza" | "Caldas"
  city:      string;
}

// ── Document classification ──────────────────────────────────────────────────

export type SalesDocumentFamily =
  | "FACTURA"         // F-prefix: official invoice (revenue)
  | "NOTA_CREDITO"    // N-prefix: credit note (return/adjustment)
  | "RECAUDO_POS"     // R-prefix: POS cash receipt
  | "VENTA_CONTADO"   // V-prefix: cash sale
  | "DEVOLUCION";     // D-prefix: return document

export type SalesChannel =
  | "ALMACEN"         // store sales (tiendas)
  | "EMPRESA"         // wholesale/corporate sales
  | "ONLINE"          // web sales
  | "OTRO";           // unclassified

// ── Full code resolution ─────────────────────────────────────────────────────

export interface SalesCodeResolution {
  code:            string;
  store:           CanonicalSalesStore | null;  // null = not a store sale
  documentFamily:  SalesDocumentFamily;
  channel:         SalesChannel;
  revenueSign:     1 | -1;  // 1 for invoices/sales, -1 for credit notes/returns
  kaNiFuente:      number;  // SAG integer PK (for traceability)
}

// ── The canonical mapping ────────────────────────────────────────────────────
//
// Every entry is confirmed from SaleRecord audit data (2026-07-26).
// ka_ni_fuente values are Castillitos-specific (per-connector FUENTES registry).

const CENTRO:     CanonicalSalesStore = { storeId: "centro",     storeName: "Centro",     city: "Medellin" };
const SAN_DIEGO:  CanonicalSalesStore = { storeId: "san_diego",  storeName: "San Diego",  city: "Medellin" };
const GRAN_PLAZA: CanonicalSalesStore = { storeId: "gran_plaza", storeName: "Gran Plaza", city: "Medellin" };
const CALDAS:     CanonicalSalesStore = { storeId: "caldas",     storeName: "Caldas",     city: "Caldas"   };

// ── Code → Resolution mapping ────────────────────────────────────────────────

interface CodeEntry {
  store: CanonicalSalesStore | null;
  family: SalesDocumentFamily;
  channel: SalesChannel;
  sign: 1 | -1;
  fuente: number;
}

const CODE_MAP: Record<string, CodeEntry> = {
  // ── Store invoices (facturas de almacen) ─────────────────────────────────
  FC: { store: CENTRO,     family: "FACTURA",       channel: "ALMACEN",  sign:  1, fuente: 176 },
  FD: { store: SAN_DIEGO,  family: "FACTURA",       channel: "ALMACEN",  sign:  1, fuente: 175 },
  FG: { store: GRAN_PLAZA, family: "FACTURA",       channel: "ALMACEN",  sign:  1, fuente: 177 },
  FA: { store: CALDAS,     family: "FACTURA",       channel: "ALMACEN",  sign:  1, fuente: 194 },

  // ── Store credit notes (notas credito almacen) ───────────────────────────
  // Suffix differs from facturas: T=Centro(Tienda), S=San Diego
  // because NC/ND are already empresa codes.
  NT: { store: CENTRO,     family: "NOTA_CREDITO",  channel: "ALMACEN",  sign: -1, fuente: 202 },
  NS: { store: SAN_DIEGO,  family: "NOTA_CREDITO",  channel: "ALMACEN",  sign: -1, fuente: 200 },
  NG: { store: GRAN_PLAZA, family: "NOTA_CREDITO",  channel: "ALMACEN",  sign: -1, fuente: 197 },
  NA: { store: CALDAS,     family: "NOTA_CREDITO",  channel: "ALMACEN",  sign: -1, fuente: 196 },

  // ── Store POS receipts (recaudos de caja) ────────────────────────────────
  RC: { store: CENTRO,     family: "RECAUDO_POS",   channel: "ALMACEN",  sign:  1, fuente: 174 },
  RS: { store: SAN_DIEGO,  family: "RECAUDO_POS",   channel: "ALMACEN",  sign:  1, fuente: 108 },
  RG: { store: GRAN_PLAZA, family: "RECAUDO_POS",   channel: "ALMACEN",  sign:  1, fuente: 178 },
  RA: { store: CALDAS,     family: "RECAUDO_POS",   channel: "ALMACEN",  sign:  1, fuente: 198 },

  // ── Store cash sales (ventas de contado) ─────────────────────────────────
  VC: { store: null,        family: "VENTA_CONTADO", channel: "ALMACEN",  sign:  1, fuente: 48  },

  // ── Store returns ────────────────────────────────────────────────────────
  DA: { store: null,        family: "DEVOLUCION",    channel: "ALMACEN",  sign: -1, fuente: 0   },

  // ── Empresa invoices (NOT store sales) ───────────────────────────────────
  FE: { store: null, family: "FACTURA",       channel: "EMPRESA", sign:  1, fuente: 101 },
  F1: { store: null, family: "FACTURA",       channel: "EMPRESA", sign:  1, fuente: 0   },
  NC: { store: null, family: "NOTA_CREDITO",  channel: "EMPRESA", sign: -1, fuente: 139 },
  ND: { store: null, family: "NOTA_CREDITO",  channel: "EMPRESA", sign: -1, fuente: 170 },
  NE: { store: null, family: "NOTA_CREDITO",  channel: "EMPRESA", sign: -1, fuente: 0   },
  NF: { store: null, family: "NOTA_CREDITO",  channel: "EMPRESA", sign: -1, fuente: 171 },

  // ── Online ───────────────────────────────────────────────────────────────
  FW: { store: null, family: "FACTURA",       channel: "ONLINE",  sign:  1, fuente: 207 },
  NW: { store: null, family: "NOTA_CREDITO",  channel: "ONLINE",  sign: -1, fuente: 208 },

  // ── Retail finance (Addi/Sistecredit — at stores, but no store attribution)
  AN: { store: null, family: "RECAUDO_POS",   channel: "ALMACEN", sign:  1, fuente: 12  },
  SI: { store: null, family: "RECAUDO_POS",   channel: "ALMACEN", sign:  1, fuente: 111 },
};

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve a SAG fuente code to its canonical store identity and document classification.
 * Returns null if the code is unknown.
 */
export function resolveCanonicalSalesSource(code: string | null | undefined): SalesCodeResolution | null {
  if (!code) return null;
  const entry = CODE_MAP[code];
  if (!entry) return null;
  return {
    code,
    store:          entry.store,
    documentFamily: entry.family,
    channel:        entry.channel,
    revenueSign:    entry.sign,
    kaNiFuente:     entry.fuente,
  };
}

/**
 * Resolve store identity from a fuente code.
 * Returns null if the code doesn't map to a physical store.
 * Convenience wrapper for the common case.
 */
export function resolveStoreFromCode(code: string | null | undefined): CanonicalSalesStore | null {
  if (!code) return null;
  return CODE_MAP[code]?.store ?? null;
}

/**
 * Check if a fuente code represents a store sale (ALMACEN channel with known store).
 */
export function isStoreSale(code: string | null | undefined): boolean {
  if (!code) return false;
  const entry = CODE_MAP[code];
  return entry != null && entry.store != null;
}

/**
 * Get all fuente codes that map to a specific store.
 */
export function getCodesForStore(storeId: string): string[] {
  return Object.entries(CODE_MAP)
    .filter(([, entry]) => entry.store?.storeId === storeId)
    .map(([code]) => code);
}

/**
 * Get all fuente codes that represent store invoices (revenue-generating).
 * Useful for SQL IN clauses filtering store facturas.
 */
export function getStoreInvoiceCodes(): string[] {
  return Object.entries(CODE_MAP)
    .filter(([, entry]) => entry.store != null && entry.family === "FACTURA")
    .map(([code]) => code);
}

/**
 * Get all fuente codes for store credit notes.
 */
export function getStoreCreditNoteCodes(): string[] {
  return Object.entries(CODE_MAP)
    .filter(([, entry]) => entry.store != null && entry.family === "NOTA_CREDITO")
    .map(([code]) => code);
}

/**
 * Get the ka_ni_fuente integers for all codes that map to a specific store.
 * Useful for SQL queries directly against SAG or CustomerOrderLine.
 */
export function getFuenteIdsForStore(storeId: string): number[] {
  return Object.entries(CODE_MAP)
    .filter(([, entry]) => entry.store?.storeId === storeId && entry.fuente > 0)
    .map(([, entry]) => entry.fuente);
}

// ── All canonical stores ─────────────────────────────────────────────────────

export const CANONICAL_SALES_STORES: readonly CanonicalSalesStore[] = [
  CENTRO,
  SAN_DIEGO,
  GRAN_PLAZA,
  CALDAS,
];

// ── Reverse lookup: storeId → store ──────────────────────────────────────────

const STORE_BY_ID = new Map<string, CanonicalSalesStore>(
  CANONICAL_SALES_STORES.map(s => [s.storeId, s]),
);

export function getCanonicalStore(storeId: string): CanonicalSalesStore | undefined {
  return STORE_BY_ID.get(storeId);
}

// ── SaleRecord storeSlug correction ──────────────────────────────────────────
//
// The current mapSagMovement() in mappers.ts maps nota/recaudo codes to
// generic slugs ("almacen", "pos") instead of specific stores. This lookup
// corrects the storeSlug using the canonical source.
//
// Usage: const correctedSlug = correctStoreSlug(saleRecord.rawJson?.code, saleRecord.storeSlug);

export function correctStoreSlug(
  code: string | null | undefined,
  fallbackSlug: string,
): string {
  if (!code) return fallbackSlug;
  const store = CODE_MAP[code]?.store;
  return store ? store.storeId : fallbackSlug;
}

export function correctStoreName(
  code: string | null | undefined,
  fallbackName: string,
): string {
  if (!code) return fallbackName;
  const store = CODE_MAP[code]?.store;
  return store ? store.storeName : fallbackName;
}
