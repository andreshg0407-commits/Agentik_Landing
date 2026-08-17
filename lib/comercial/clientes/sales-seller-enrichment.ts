/**
 * lib/comercial/clientes/sales-seller-enrichment.ts
 *
 * CLIENT-SALES-CANONICAL-COMPLETENESS-03A8G3
 *
 * Collision-safe runtime seller recovery + coverage reconciliation.
 *
 * Uses a direct MOVIMIENTOS+FUENTES query (not vw_agentik_ventas) to obtain
 * the fuente code (sc_codigo_fuente) for each document. This prevents
 * document number collisions: FE-849 and D2-849 are different documents
 * with the same NUMERO_DOCUMENTO but different fuentes.
 *
 * Map key: composite "fuenteCode-numero" (e.g. "FE-10505", "D2-849").
 * Primary identity: ID_DOCUMENTO (ka_nl_movimiento) when available.
 * Fallback identity: CLIENTE_ID + fuenteCode + NUMERO_DOCUMENTO.
 *
 * Single batch query per client — zero N+1 queries.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import "server-only";
import { consultaSagJson } from "@/lib/connectors/pya/client";
import { getSagConnection } from "@/lib/connectors/pya/sag-source-router";
import { CASTILLITOS_SOURCE_SEMANTIC_RULES } from "@/lib/sag/master-data/source-semantic-rules";

// ── Shared key builder ────────────────────────────────────────────────────────

/**
 * Canonical composite key builder for sales documents.
 *
 * Handles three storage formats produced by different mappers:
 *   Path 1 (mapSagMovement):       comprobanteCode="FE", comprobante="10505"  → "FE-10505"
 *   Path 2 (mapSagVentasRow):      comprobanteCode=null,  comprobante="10505" → "10505" (bare)
 *   Path 3 (store-sale-lines-sync): comprobanteCode="FE", comprobante="FE-10505" → "FE-10505"
 *
 * Path 2 returns a bare number — callers must use bare-number fallback for lookup.
 */
export function buildCanonicalSalesDocumentKey(
  comprobanteCode: string | null | undefined,
  comprobante: string | null | undefined,
): string {
  const code = (comprobanteCode ?? "").trim();
  const raw = (comprobante ?? "").trim();
  if (!raw) return "";
  // Prevent double-prefix (path 3): "FE" + "FE-10505" → "FE-10505"
  if (code && raw.startsWith(`${code}-`)) return raw;
  // Normal composite (path 1): "FE" + "10505" → "FE-10505"
  if (code) return `${code}-${raw}`;
  // Bare number (path 2): no code available
  return raw;
}

// ── Fuente code lookup ───────────────────────────────────────────────────────

const FUENTE_ID_TO_CODE = new Map<number, string>(
  CASTILLITOS_SOURCE_SEMANTIC_RULES.map(r => [r.kaNiFuente, r.codigoFuente]),
);

// ── Types ────────────────────────────────────────────────────────────────────

/** Raw row from the direct MOVIMIENTOS+FUENTES+TERCEROS query */
export interface SagDocumentRow {
  ka_nl_movimiento: number;
  ka_ni_fuente: number;
  codigo_fuente: string;       // f.k_sc_codigo_fuente
  n_numero_documento: string;
  d_fecha_documento: string;
  sc_anulado: string;          // 'S' or 'N'
  vendedor_id: number | null;  // seller ka_nl_tercero
  vendedor_nombre: string | null;
  total_valor: number;
}

export interface DocumentSellerInfo {
  idDocumento: number;
  fuenteCode: string;          // composite-safe fuente code (FE, D2, F2, etc.)
  numeroDocumento: string;
  compositeKey: string;        // "fuenteCode-numero" — collision-safe map key
  fechaDocumento: string;
  anulado: boolean;
  vendedorId: string | null;
  vendedor: string | null;
  amount: number;
}

export type SalesCoverageState =
  | "COMPLETE"
  | "STORAGE_LAG"
  | "SOURCE_DOWN"
  | "IDENTITY_MISSING"
  | "DOCUMENT_CONFLICT";

export interface SalesCoverage {
  state: SalesCoverageState;
  sourceDocumentCount: number;
  storedDocumentCount: number;
  matchedDocumentCount: number;
  sourceOnlyDocumentCount: number;
  storageOnlyDocumentCount: number;
  sourceAsOf: string | null;
  pendingDocuments: DocumentSellerInfo[];
  reason: string;
}

export interface SellerEnrichmentResult {
  sourceDown: boolean;
  distinctDocuments: DocumentSellerInfo[];
  /** Build a collision-safe map keyed by "fuenteCode-numero" */
  buildDocumentSellerMap(): Map<string, DocumentSellerInfo>;
  /**
   * Bare-number fallback for records where comprobanteCode is null.
   * Maps bare document number → DocumentSellerInfo if unambiguous, null if ambiguous.
   */
  buildBareNumberFallback(): Map<string, DocumentSellerInfo | null>;
}

// ── Query ────────────────────────────────────────────────────────────────────

/**
 * Direct MOVIMIENTOS+FUENTES+TERCEROS query for a single client.
 * Returns one row per document header (GROUP BY on header fields).
 *
 * Seller resolution (03A8G3R): two-layer fallback mirroring vw_agentik_ventas:
 *   1. Header-level: MOVIMIENTOS.ka_nl_tercero_vend (F2 remisiones carry seller here)
 *   2. Invoice-level: movimientos_facturas.ka_nl_tercero (FE facturas carry seller here)
 *
 * Authorized by Section D of 03A8G3: vw_agentik_ventas does not expose
 * fuente code, making collision-safe identity impossible via the view alone.
 */
function buildClientDocumentsQuery(sagTerceroId: number): string {
  return [
    "SELECT",
    "  m.ka_nl_movimiento,",
    "  m.ka_ni_fuente,",
    "  f.k_sc_codigo_fuente AS codigo_fuente,",
    "  m.n_numero_documento,",
    "  m.d_fecha_documento,",
    "  m.sc_anulado,",
    "  COALESCE(NULLIF(m.ka_nl_tercero_vend, 0), NULLIF(mf.ka_nl_tercero, 0), 0) AS vendedor_id,",
    "  COALESCE(tv_header.sc_nombre, tv_mf.sc_nombre) AS vendedor_nombre,",
    "  SUM(ISNULL(mi.n_valor, 0)) AS total_valor",
    "FROM MOVIMIENTOS m",
    "LEFT JOIN FUENTES f ON f.ka_ni_fuente = m.ka_ni_fuente",
    "LEFT JOIN MOVIMIENTOS_ITEMS mi ON mi.ka_nl_movimiento = m.ka_nl_movimiento",
    "LEFT JOIN TERCEROS tv_header ON tv_header.ka_nl_tercero = m.ka_nl_tercero_vend AND m.ka_nl_tercero_vend > 0",
    "LEFT JOIN movimientos_facturas mf ON mf.ka_nl_movimiento = m.ka_nl_movimiento",
    "LEFT JOIN TERCEROS tv_mf ON tv_mf.ka_nl_tercero = mf.ka_nl_tercero AND mf.ka_nl_tercero > 0",
    `WHERE m.ka_nl_tercero = ${Number(sagTerceroId)}`,
    "  AND f.sc_cobrar_pagar = 'C'",        // receivables only (not payables)
    "  AND f.k_n_clase_fuente IN (1, 2, 3)", // exclude class 4 (orders)
    "GROUP BY",
    "  m.ka_nl_movimiento, m.ka_ni_fuente,",
    "  f.k_sc_codigo_fuente, m.n_numero_documento,",
    "  m.d_fecha_documento, m.sc_anulado,",
    "  m.ka_nl_tercero_vend, tv_header.sc_nombre,",
    "  mf.ka_nl_tercero, tv_mf.sc_nombre",
    "ORDER BY m.d_fecha_documento DESC",
  ].join(" ");
}

// ── Fetch ────────────────────────────────────────────────────────────────────

export async function fetchSalesSellerEnrichment(
  sagTerceroId: number | null,
): Promise<SellerEnrichmentResult> {
  const empty: SellerEnrichmentResult = {
    sourceDown: false,
    distinctDocuments: [],
    buildDocumentSellerMap: () => new Map(),
    buildBareNumberFallback: () => new Map(),
  };

  if (sagTerceroId == null || sagTerceroId <= 0) {
    return empty;
  }

  let config;
  try {
    config = getSagConnection("CURRENT");
  } catch {
    return { ...empty, sourceDown: true };
  }

  let rawRows: Record<string, unknown>[];
  try {
    rawRows = await consultaSagJson(
      config,
      buildClientDocumentsQuery(sagTerceroId),
    ) as Record<string, unknown>[];
  } catch {
    return { ...empty, sourceDown: true };
  }

  if (!Array.isArray(rawRows)) {
    return { ...empty, sourceDown: true };
  }

  // Deduplicate by ka_nl_movimiento (rows are grouped by document header)
  const docMap = new Map<number, DocumentSellerInfo>();
  for (const row of rawRows) {
    const movId = typeof row.ka_nl_movimiento === "number"
      ? row.ka_nl_movimiento : Number(row.ka_nl_movimiento);
    if (!movId || isNaN(movId)) continue;

    if (docMap.has(movId)) {
      // Conflict check within same document
      const existing = docMap.get(movId)!;
      const rowVendedorId = row.vendedor_id != null && Number(row.vendedor_id) > 0
        ? String(row.vendedor_id) : null;
      if (existing.vendedorId && rowVendedorId && existing.vendedorId !== rowVendedorId) {
        existing.vendedor = `${existing.vendedor} [CONFLICTO]`;
      }
      continue;
    }

    // Derive fuente code: prefer the query's codigo_fuente, fall back to semantic rules
    const fuenteId = typeof row.ka_ni_fuente === "number"
      ? row.ka_ni_fuente : Number(row.ka_ni_fuente);
    const codigoFuente = (row.codigo_fuente as string)
      ?? FUENTE_ID_TO_CODE.get(fuenteId)
      ?? null;
    if (!codigoFuente) continue; // cannot classify without fuente code

    const numero = String(row.n_numero_documento ?? "");
    const compositeKey = `${codigoFuente}-${numero}`;
    const vendedorIdRaw = row.vendedor_id != null && Number(row.vendedor_id) > 0
      ? String(row.vendedor_id) : null;

    docMap.set(movId, {
      idDocumento: movId,
      fuenteCode: codigoFuente,
      numeroDocumento: numero,
      compositeKey,
      fechaDocumento: String(row.d_fecha_documento ?? ""),
      anulado: String(row.sc_anulado ?? "N") === "S",
      vendedorId: vendedorIdRaw,
      vendedor: vendedorIdRaw ? (row.vendedor_nombre as string ?? null) : null,
      amount: Number(row.total_valor ?? 0),
    });
  }

  const distinctDocuments = Array.from(docMap.values());

  return {
    sourceDown: false,
    distinctDocuments,
    buildDocumentSellerMap(): Map<string, DocumentSellerInfo> {
      // Key by composite "fuenteCode-numero" — collision-safe
      const map = new Map<string, DocumentSellerInfo>();
      for (const doc of distinctDocuments) {
        map.set(doc.compositeKey, doc);
      }
      return map;
    },
    buildBareNumberFallback(): Map<string, DocumentSellerInfo | null> {
      // Bare document number → info (null if ambiguous = multiple fuentes share same number)
      const map = new Map<string, DocumentSellerInfo | null>();
      for (const doc of distinctDocuments) {
        if (map.has(doc.numeroDocumento)) {
          // Ambiguous — mark as null (collision risk)
          map.set(doc.numeroDocumento, null);
        } else {
          map.set(doc.numeroDocumento, doc);
        }
      }
      return map;
    },
  };
}

// ── Coverage reconciliation ─────────────────────────────────────────────────

/**
 * Compute sales coverage state by comparing SAG source documents
 * against stored SaleRecord documents.
 */
export function computeSalesCoverage(
  enrichment: SellerEnrichmentResult,
  storedCompositeKeys: Set<string>,
  hasSagIdentity: boolean,
): SalesCoverage {
  if (!hasSagIdentity) {
    return {
      state: "IDENTITY_MISSING",
      sourceDocumentCount: 0, storedDocumentCount: storedCompositeKeys.size,
      matchedDocumentCount: 0, sourceOnlyDocumentCount: 0, storageOnlyDocumentCount: 0,
      sourceAsOf: null, pendingDocuments: [], reason: "Sin identidad SAG",
    };
  }

  if (enrichment.sourceDown) {
    return {
      state: "SOURCE_DOWN",
      sourceDocumentCount: 0, storedDocumentCount: storedCompositeKeys.size,
      matchedDocumentCount: 0, sourceOnlyDocumentCount: 0, storageOnlyDocumentCount: 0,
      sourceAsOf: null, pendingDocuments: [],
      reason: "Consulta SAG de documentos fallida",
    };
  }

  // Only count non-anulled sales documents for coverage
  // (receivable-class fuentes like R1, AP are in the query but excluded from sales classification)
  const salesFuentes = new Set(["FE", "F1", "F2", "F3", "FD", "FC", "FG", "FA", "FW",
    "D2", "NC", "ND", "V1", "V2", "V3", "V4", "V5", "V6", "VC"]);
  const sourceSalesDocs = enrichment.distinctDocuments.filter(
    d => !d.anulado && salesFuentes.has(d.fuenteCode),
  );
  const sourceDocumentCount = sourceSalesDocs.length;
  const storedDocumentCount = storedCompositeKeys.size;

  let matched = 0;
  const pending: DocumentSellerInfo[] = [];
  for (const doc of sourceSalesDocs) {
    if (storedCompositeKeys.has(doc.compositeKey)) {
      matched++;
    } else {
      pending.push(doc);
    }
  }
  const storageOnly = [...storedCompositeKeys].filter(
    k => !sourceSalesDocs.some(d => d.compositeKey === k),
  ).length;

  const sourceOnlyCount = pending.length;
  let state: SalesCoverageState;
  if (sourceOnlyCount === 0) {
    state = "COMPLETE";
  } else {
    state = "STORAGE_LAG";
  }

  return {
    state,
    sourceDocumentCount,
    storedDocumentCount,
    matchedDocumentCount: matched,
    sourceOnlyDocumentCount: sourceOnlyCount,
    storageOnlyDocumentCount: storageOnly,
    sourceAsOf: new Date().toISOString(),
    pendingDocuments: pending,
    reason: state === "COMPLETE"
      ? `${sourceDocumentCount} documentos SAG, todos sincronizados`
      : `${sourceOnlyCount} documento(s) SAG pendiente(s) de sincronización`,
  };
}
