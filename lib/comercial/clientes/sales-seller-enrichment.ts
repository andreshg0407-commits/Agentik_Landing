/**
 * lib/comercial/clientes/sales-seller-enrichment.ts
 *
 * CLIENT-SALES-SELLER-PROVENANCE-03A8G2
 *
 * Runtime seller recovery from SAG vw_agentik_ventas.
 * Single batch query per client — no N+1 queries.
 *
 * Recovers seller data lost by the legacy mapSagMovement() import path,
 * which stored "Sin Vendedor" as a fallback when the MOVIMIENTOS source
 * does not carry seller fields.
 *
 * Join key: NUMERO_DOCUMENTO (document number within SAG is unique per fuente
 * type for a given client). The enrichment map is keyed by document number
 * and grouped by document to detect seller conflicts within the same document.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import "server-only";
import { consultaSagJson } from "@/lib/connectors/pya/client";
import { getSagConnection } from "@/lib/connectors/pya/sag-source-router";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SagVentasSellerRow {
  ID_DOCUMENTO: number;        // ka_nl_movimiento — stable SAG PK
  NUMERO_DOCUMENTO: string;    // document number
  TIPO_DOCUMENTO: string;      // "Factura" | "Nota Credito"
  ESTADO_DOCUMENTO: string;    // "Anulado" | "Con Saldo Pendiente" | "Sin Saldo Pendiente"
  FECHA_DOCUMENTO: string;     // ISO date
  VENDEDOR_ID: string | null;  // ka_nl_tercero of seller
  VENDEDOR: string | null;     // seller name
}

export interface DocumentSellerInfo {
  idDocumento: number;
  numeroDocumento: string;
  tipoDocumento: string;
  estadoDocumento: string;
  fechaDocumento: string;
  vendedorId: string | null;
  vendedor: string | null;
}

export interface SellerEnrichmentResult {
  /** Whether the SAG query failed */
  sourceDown: boolean;
  /** All rows returned by SAG (line-item grain, may have duplicates per document) */
  rawRows: SagVentasSellerRow[];
  /** Distinct documents from SAG */
  distinctDocuments: DocumentSellerInfo[];
  /** Build a map keyed by NUMERO_DOCUMENTO for fast lookup */
  buildDocumentSellerMap(): Map<string, DocumentSellerInfo>;
}

// ── Fetch ────────────────────────────────────────────────────────────────────

/**
 * Fetch all sales documents for a client from vw_agentik_ventas in a single
 * batch query. Returns seller info per document for runtime enrichment.
 *
 * The view only covers facturas (F) and notas credito (X) — remisiones (F2)
 * are NOT included in the view. Documents outside the view scope will not
 * appear in the enrichment map.
 */
export async function fetchSalesSellerEnrichment(
  sagTerceroId: number | null,
): Promise<SellerEnrichmentResult> {
  const empty: SellerEnrichmentResult = {
    sourceDown: false,
    rawRows: [],
    distinctDocuments: [],
    buildDocumentSellerMap: () => new Map(),
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

  let rows: SagVentasSellerRow[];
  try {
    rows = await consultaSagJson(
      config,
      `SELECT ID_DOCUMENTO, NUMERO_DOCUMENTO, TIPO_DOCUMENTO, ESTADO_DOCUMENTO, FECHA_DOCUMENTO, VENDEDOR_ID, VENDEDOR FROM vw_agentik_ventas WHERE CLIENTE_ID = ${Number(sagTerceroId)}`,
    ) as unknown as SagVentasSellerRow[];
  } catch {
    return { ...empty, sourceDown: true };
  }

  if (!Array.isArray(rows)) {
    return { ...empty, sourceDown: true };
  }

  // Deduplicate by ID_DOCUMENTO (view is line-item grain — many rows per document)
  // Fail closed on seller conflict within the same document
  const docMap = new Map<number, DocumentSellerInfo>();
  for (const row of rows) {
    const id = typeof row.ID_DOCUMENTO === "number" ? row.ID_DOCUMENTO : Number(row.ID_DOCUMENTO);
    if (!id || isNaN(id)) continue;

    const existing = docMap.get(id);
    if (existing) {
      // Conflict check: if same document has different sellers, fail closed
      const rowVendedorId = row.VENDEDOR_ID != null ? String(row.VENDEDOR_ID) : null;
      if (existing.vendedorId && rowVendedorId && existing.vendedorId !== rowVendedorId) {
        // Seller conflict within same document — fail closed: keep first, mark conflict
        existing.vendedor = `${existing.vendedor} [CONFLICTO]`;
      }
      continue; // Already have this document
    }

    docMap.set(id, {
      idDocumento: id,
      numeroDocumento: String(row.NUMERO_DOCUMENTO ?? ""),
      tipoDocumento: String(row.TIPO_DOCUMENTO ?? ""),
      estadoDocumento: String(row.ESTADO_DOCUMENTO ?? ""),
      fechaDocumento: String(row.FECHA_DOCUMENTO ?? ""),
      vendedorId: row.VENDEDOR_ID != null ? String(row.VENDEDOR_ID) : null,
      vendedor: row.VENDEDOR != null ? String(row.VENDEDOR) : null,
    });
  }

  const distinctDocuments = Array.from(docMap.values());

  return {
    sourceDown: false,
    rawRows: rows,
    distinctDocuments,
    buildDocumentSellerMap(): Map<string, DocumentSellerInfo> {
      // Key by NUMERO_DOCUMENTO for join with SaleRecord.comprobante
      const map = new Map<string, DocumentSellerInfo>();
      for (const doc of distinctDocuments) {
        if (doc.numeroDocumento) {
          map.set(doc.numeroDocumento, doc);
        }
      }
      return map;
    },
  };
}
