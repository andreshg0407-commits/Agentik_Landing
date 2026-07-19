/**
 * lib/comercial/data-sources/sag-direct-commercial-product-data-source.ts
 *
 * SagDirectCommercialProductDataSource — queries SAG SOAP directly for:
 *   1. PV3 (nd_precio3) and PV4 (nd_precio4) from v_articulos
 *   2. Entry receipts from MOVIMIENTOS + MOVIMIENTOS_ITEMS (fuente C1/C2)
 *
 * Uses the existing SAG SOAP transport: consultaSagJson(config, query).
 * Shared across all Comercial modules (Importaciones, Maletas, Compras, etc.).
 *
 * SAG column evidence (SAG-IMPORT-RESEARCH-01):
 *   PV3 = v_articulos.nd_precio3 (detal)
 *   PV4 = v_articulos.nd_precio4 (mayorista)
 *   WRONG columns (do NOT use): n_valor_venta_promocion, nd_valor_venta4
 *
 * Sprint: COMMERCIAL-PRODUCT-DRAWER-DATA-01
 */

import { consultaSagJson } from "@/lib/connectors/pya/client";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";
import type {
  CommercialProductDataSource,
  SagPricePair,
  ImportReceipt,
  ProductEnrichment,
} from "./commercial-product-data-source";

// ── SAG fuente codes for purchase/entry documents ───────────────────────────
// C1 = FACTURA DE COMPRA (kaNiFuente=1)
// C2 = FACTURA DE COMPRAS 2 (kaNiFuente=95)
const PURCHASE_FUENTE_IDS = [1, 95];

// ── Helpers ─────────────────────────────────────────────────────────────────

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function toDateStr(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// ── Implementation ──────────────────────────────────────────────────────────

export class SagDirectCommercialProductDataSource implements CommercialProductDataSource {
  readonly name = "sag-direct";
  private config: PyaApiConfig;

  constructor(config: PyaApiConfig) {
    this.config = config;
  }

  // ── Prices ──────────────────────────────────────────────────────────────

  async fetchPrices(productCodes: string[]): Promise<Map<string, SagPricePair>> {
    const result = new Map<string, SagPricePair>();
    if (productCodes.length === 0) return result;

    const query = [
      "SELECT",
      "  k_sc_codigo_articulo,",
      "  nd_precio3,",
      "  nd_precio4",
      "FROM v_articulos",
    ].join(" ");

    try {
      const rows = await consultaSagJson(this.config, query);
      const codeSet = new Set(productCodes.map(c => c.toUpperCase()));

      for (const row of rows) {
        const code = toStr(row.k_sc_codigo_articulo);
        if (!code || !codeSet.has(code.toUpperCase())) continue;

        result.set(code.toUpperCase(), {
          pricePV3: toNum(row.nd_precio3),
          pricePV4: toNum(row.nd_precio4),
        });
      }
    } catch (err) {
      console.error("[SAG-DIRECT] fetchPrices failed:", err);
    }

    return result;
  }

  // ── Single-product price (efficient WHERE clause) ─────────────────────

  async fetchPriceForSingle(productCode: string): Promise<SagPricePair | null> {
    const upper = productCode.toUpperCase().trim();
    if (!upper) return null;

    const query = [
      "SELECT",
      "  k_sc_codigo_articulo,",
      "  nd_precio3,",
      "  nd_precio4",
      "FROM v_articulos",
      `WHERE k_sc_codigo_articulo = '${upper}'`,
    ].join(" ");

    try {
      const rows = await consultaSagJson(this.config, query);
      if (rows.length === 0) return null;

      const row = rows[0];
      return {
        pricePV3: toNum(row.nd_precio3),
        pricePV4: toNum(row.nd_precio4),
      };
    } catch (err) {
      console.error("[SAG-DIRECT] fetchPriceForSingle failed:", err);
      return null;
    }
  }

  // ── Receipts ────────────────────────────────────────────────────────────

  async fetchReceipts(productCodes: string[]): Promise<Map<string, ImportReceipt[]>> {
    const result = new Map<string, ImportReceipt[]>();
    if (productCodes.length === 0) return result;

    const fuenteList = PURCHASE_FUENTE_IDS.join(",");
    const query = [
      "SELECT",
      "  m.n_numero_documento,",
      "  m.d_fecha_documento,",
      "  m.ka_ni_fuente,",
      "  m.ka_nl_tercero,",
      "  m.sc_beneficiario,",
      "  mi.n_cantidad,",
      "  v.k_sc_codigo_articulo,",
      "  MAX(t.n_nit) AS nit_tercero",
      "FROM MOVIMIENTOS m",
      "LEFT JOIN MOVIMIENTOS_ITEMS mi",
      "  ON mi.ka_nl_movimiento = m.ka_nl_movimiento",
      "LEFT JOIN v_articulos v",
      "  ON v.ka_nl_articulo = mi.ka_nl_articulo",
      "LEFT JOIN TERCEROS t",
      "  ON t.ka_nl_tercero = m.ka_nl_tercero",
      `WHERE m.ka_ni_fuente IN (${fuenteList})`,
      "  AND m.sc_anulado = 'N'",
      "GROUP BY",
      "  m.n_numero_documento, m.d_fecha_documento, m.ka_ni_fuente,",
      "  m.ka_nl_tercero, m.sc_beneficiario,",
      "  mi.n_cantidad, v.k_sc_codigo_articulo",
      "ORDER BY m.d_fecha_documento DESC",
    ].join(" ");

    try {
      const rows = await consultaSagJson(this.config, query);
      const codeSet = new Set(productCodes.map(c => c.toUpperCase()));

      for (const row of rows) {
        const code = toStr(row.k_sc_codigo_articulo);
        if (!code || !codeSet.has(code.toUpperCase())) continue;

        const upperCode = code.toUpperCase();
        // Only count positive quantities as valid purchase receipts.
        // Negative quantities represent returns/adjustments — skip them.
        const rawQty = toNum(row.n_cantidad) ?? 0;
        if (rawQty <= 0) continue;

        const receipt: ImportReceipt = {
          documentNumber: String(row.n_numero_documento ?? ""),
          date: toDateStr(row.d_fecha_documento) ?? "",
          fuenteCode: row.ka_ni_fuente === 1 ? "C1" : row.ka_ni_fuente === 95 ? "C2" : `F${row.ka_ni_fuente}`,
          quantity: rawQty,
          providerNit: toStr(row.nit_tercero),
          providerName: toStr(row.sc_beneficiario),
        };

        if (!result.has(upperCode)) {
          result.set(upperCode, []);
        }
        result.get(upperCode)!.push(receipt);
      }
    } catch (err) {
      console.error("[SAG-DIRECT] fetchReceipts failed:", err);
    }

    return result;
  }

  // ── Full enrichment ─────────────────────────────────────────────────────

  async fetchEnrichment(productCodes: string[]): Promise<Map<string, ProductEnrichment>> {
    const result = new Map<string, ProductEnrichment>();
    if (productCodes.length === 0) return result;

    const [prices, receipts] = await Promise.all([
      this.fetchPrices(productCodes),
      this.fetchReceipts(productCodes),
    ]);

    for (const code of productCodes) {
      const upper = code.toUpperCase();
      const pricePair = prices.get(upper) ?? { pricePV3: null, pricePV4: null };
      const codeReceipts = receipts.get(upper) ?? [];

      const sorted = [...codeReceipts].sort((a, b) => a.date.localeCompare(b.date));
      const firstEntryDate = sorted.length > 0 ? sorted[0].date : null;
      const lastEntryDate = sorted.length > 0 ? sorted[sorted.length - 1].date : null;
      const totalImported = codeReceipts.length > 0
        ? codeReceipts.reduce((sum, r) => sum + r.quantity, 0)
        : null;

      const distinctDocs = new Set(codeReceipts.map(r => r.documentNumber));
      const batchCount = distinctDocs.size;

      result.set(upper, {
        productCode: upper,
        prices: pricePair,
        receipts: sorted,
        firstEntryDate,
        lastEntryDate,
        totalImported,
        batchCount,
      });
    }

    return result;
  }
}

// ── Factory ─────────────────────────────────────────────────────────────────

/** Create a SagDirectCommercialProductDataSource from environment variables. */
export function createSagDirectDataSource(): SagDirectCommercialProductDataSource {
  const config: PyaApiConfig = {
    endpointUrl:
      process.env.PYA_SOAP_ENDPOINT ??
      "https://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap",
    token: process.env.PYA_SOAP_TOKEN ?? process.env.SAG_TEST_TOKEN ?? "",
    database: process.env.PYA_SAG_BD,
  };
  return new SagDirectCommercialProductDataSource(config);
}
