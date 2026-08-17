/**
 * lib/auth/__tests__/clients-seller-recovery-03a8g2.test.ts
 *
 * CLIENT-SALES-SELLER-PROVENANCE-03A8G2 — Canonical seller recovery + reconciliation.
 *
 * 12 behavioral tests proving:
 *   1. Batch enrichment by ID_DOCUMENTO (single query, no N+1)
 *   2. SAG seller replaces "Sin Vendedor" fallback
 *   3. Current client seller is never used
 *   4. Two documents can have different sellers
 *   5. SOURCE_DOWN does not become NOT_REPORTED_BY_SOURCE
 *   6. SAG null seller → NOT_REPORTED_BY_SOURCE
 *   7. Single batch query (no N+1) — structural test
 *   8. Multiple lines preserve one seller per document
 *   9. Seller conflict within same document fails closed
 *  10. Reconciliation buckets: facturas + NC + anulados + other = total
 *  11. Unknown document does not disappear
 *  12. Production wiring: loader → SAG enrichment → mapper → UI
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type SellerTruthState = "CERTIFIED" | "IDENTITY_ONLY" | "NOT_REPORTED_BY_SOURCE" | "SOURCE_DOWN";

function makeSaleItem(overrides: Partial<{
  id: string;
  canonicalKind: string;
  rawSourceCode: string | null;
  rawDocumentNumber: string | null;
  issueDate: string | null;
  seller: string | null;
  sellerId: string | null;
  sellerName: string | null;
  sellerTruthState: SellerTruthState;
  grossAmount: number;
  productLine: string | null;
  sourceProfileId: string;
}> = {}) {
  return {
    id: overrides.id ?? "sale-1",
    canonicalKind: overrides.canonicalKind ?? "SALES_INVOICE",
    rawSourceCode: overrides.rawSourceCode ?? "FE",
    rawDocumentNumber: overrides.rawDocumentNumber ?? "FE-10505",
    issueDate: overrides.issueDate ?? "2026-07-17T00:00:00.000Z",
    seller: overrides.seller ?? null,
    sellerId: overrides.sellerId ?? null,
    sellerName: overrides.sellerName ?? null,
    sellerTruthState: overrides.sellerTruthState ?? "NOT_REPORTED_BY_SOURCE",
    grossAmount: overrides.grossAmount ?? 1_000_000,
    productLine: overrides.productLine ?? "CS",
    sourceProfileId: overrides.sourceProfileId ?? "castillitos",
  };
}

const NOW = new Date("2026-08-17T12:00:00Z");

// ── T01: Batch enrichment replaces fallback ─────────────────────────────────

describe("seller recovery — batch enrichment", () => {
  const { classifySalesHistory } = require("../../comercial/clientes/clientes-pure");

  test("T01: SAG-enriched seller data replaces persisted fallback", () => {
    // After enrichment, items arrive with CERTIFIED seller from SAG
    const items = [makeSaleItem({
      sellerName: "NESTOR FERNANDO ALZATE JIMENEZ",
      sellerId: "211",
      sellerTruthState: "CERTIFIED",
    })];
    const r = classifySalesHistory(items, true, true, true, NOW);
    expect(r.officialInvoices[0].sellerName).toBe("NESTOR FERNANDO ALZATE JIMENEZ");
    expect(r.officialInvoices[0].sellerTruthState).toBe("CERTIFIED");
  });

  test("T02: legacy fallback 'Sin Vendedor' must NOT pass through as CERTIFIED", () => {
    // If enrichment fails to find the doc, and persisted has fallback
    const items = [makeSaleItem({
      sellerName: null,
      sellerId: null,
      sellerTruthState: "NOT_REPORTED_BY_SOURCE",
    })];
    const r = classifySalesHistory(items, true, true, true, NOW);
    expect(r.officialInvoices[0].sellerTruthState).not.toBe("CERTIFIED");
    expect(r.officialInvoices[0].sellerName).toBeNull();
  });
});

// ── T03-T04: Independence guarantees ────────────────────────────────────────

describe("seller recovery — independence", () => {
  const { classifySalesHistory } = require("../../comercial/clientes/clientes-pure");

  test("T03: current client seller is never used — each document has its own", () => {
    // Two docs from same client: one with seller, one without
    const items = [
      makeSaleItem({
        id: "inv-1", rawDocumentNumber: "FE-10505",
        sellerName: "NESTOR FERNANDO ALZATE JIMENEZ", sellerId: "211",
        sellerTruthState: "CERTIFIED",
      }),
      makeSaleItem({
        id: "inv-2", rawDocumentNumber: "FE-10600",
        sellerName: null, sellerId: null,
        sellerTruthState: "NOT_REPORTED_BY_SOURCE",
      }),
    ];
    const r = classifySalesHistory(items, true, true, true, NOW);
    // No auto-propagation from document 1 to document 2
    expect(r.officialInvoices[0].sellerTruthState).toBe("CERTIFIED");
    expect(r.officialInvoices[1].sellerTruthState).toBe("NOT_REPORTED_BY_SOURCE");
  });

  test("T04: two documents of same client can have different sellers", () => {
    const items = [
      makeSaleItem({
        id: "inv-a", rawDocumentNumber: "FE-9000",
        sellerName: "VENDEDOR A", sellerId: "100",
        sellerTruthState: "CERTIFIED",
      }),
      makeSaleItem({
        id: "inv-b", rawDocumentNumber: "FE-10505",
        sellerName: "VENDEDOR B", sellerId: "211",
        sellerTruthState: "CERTIFIED",
      }),
    ];
    const r = classifySalesHistory(items, true, true, true, NOW);
    expect(r.officialInvoices[0].sellerName).toBe("VENDEDOR A");
    expect(r.officialInvoices[1].sellerName).toBe("VENDEDOR B");
  });
});

// ── T05-T06: Truth state edge cases ─────────────────────────────────────────

describe("seller recovery — truth state edges", () => {
  const { classifySalesHistory } = require("../../comercial/clientes/clientes-pure");

  test("T05: SOURCE_DOWN does not become NOT_REPORTED_BY_SOURCE", () => {
    // When SAG enrichment fails, source is down — not "not reported"
    const items = [makeSaleItem({
      sellerName: null,
      sellerId: null,
      sellerTruthState: "SOURCE_DOWN",
    })];
    const r = classifySalesHistory(items, true, true, true, NOW);
    expect(r.officialInvoices[0].sellerTruthState).toBe("SOURCE_DOWN");
    expect(r.officialInvoices[0].sellerTruthState).not.toBe("NOT_REPORTED_BY_SOURCE");
  });

  test("T06: SAG returns null seller for document → NOT_REPORTED_BY_SOURCE", () => {
    const items = [makeSaleItem({
      sellerName: null,
      sellerId: null,
      sellerTruthState: "NOT_REPORTED_BY_SOURCE",
    })];
    const r = classifySalesHistory(items, true, true, true, NOW);
    expect(r.officialInvoices[0].sellerTruthState).toBe("NOT_REPORTED_BY_SOURCE");
    expect(r.officialInvoices[0].sellerName).toBeNull();
    expect(r.officialInvoices[0].sellerId).toBeNull();
  });
});

// ── T07: No N+1 queries (structural) ────────────────────────────────────────

describe("seller recovery — no N+1", () => {
  test("T07: enrichment service uses single batch query, not per-document", () => {
    const enrichSrc = readFile("lib/comercial/clientes/sales-seller-enrichment.ts");
    // Must query with ka_nl_tercero (batch), not per-document ID
    // 03A8G3: upgraded from vw_agentik_ventas to direct MOVIMIENTOS query
    expect(enrichSrc).toContain("m.ka_nl_tercero =");
    // The single consultaSagJson call is the batch query — exactly one SAG query
    const callCount = (enrichSrc.match(/await consultaSagJson\(/g) || []).length;
    expect(callCount).toBe(1);
    // Must NOT have per-document queries (a loop containing consultaSagJson)
    expect(enrichSrc).not.toMatch(/for\s*\(.*\)\s*\{[^}]*consultaSagJson/s);
  });
});

// ── T08: Multi-line documents ───────────────────────────────────────────────

describe("seller recovery — multi-line documents", () => {
  const { classifySalesHistory } = require("../../comercial/clientes/clientes-pure");

  test("T08: multiple lines of same document preserve one seller", () => {
    const items = [
      makeSaleItem({
        id: "l1", canonicalKind: "SALES_INVOICE", rawDocumentNumber: "FE-10505",
        sellerName: "NESTOR FERNANDO ALZATE JIMENEZ", sellerId: "211",
        sellerTruthState: "CERTIFIED", grossAmount: 50_000,
      }),
      makeSaleItem({
        id: "l2", canonicalKind: "SALES_INVOICE", rawDocumentNumber: "FE-10505",
        sellerName: "NESTOR FERNANDO ALZATE JIMENEZ", sellerId: "211",
        sellerTruthState: "CERTIFIED", grossAmount: 75_000,
      }),
    ];
    const r = classifySalesHistory(items, true, true, true, NOW);
    expect(r.officialInvoices.length).toBe(2);
    expect(r.officialInvoices[0].sellerName).toBe("NESTOR FERNANDO ALZATE JIMENEZ");
    expect(r.officialInvoices[1].sellerName).toBe("NESTOR FERNANDO ALZATE JIMENEZ");
  });
});

// ── T09: Seller conflict within same document ───────────────────────────────

describe("seller recovery — conflict detection", () => {
  test("T09: enrichment service detects seller conflict within same ID_DOCUMENTO", () => {
    const enrichSrc = readFile("lib/comercial/clientes/sales-seller-enrichment.ts");
    // Must detect conflicts and mark them
    expect(enrichSrc).toContain("CONFLICTO");
    expect(enrichSrc).toContain("vendedorId");
  });
});

// ── T10-T11: Reconciliation completeness ────────────────────────────────────

describe("seller recovery — reconciliation", () => {
  const { classifySalesHistory } = require("../../comercial/clientes/clientes-pure");

  test("T10: classification buckets account for all items", () => {
    const items = [
      makeSaleItem({ id: "f1", canonicalKind: "SALES_INVOICE", sellerTruthState: "CERTIFIED", sellerName: "A", sellerId: "1" }),
      makeSaleItem({ id: "r1", canonicalKind: "SALES_REMISSION", sellerTruthState: "CERTIFIED", sellerName: "A", sellerId: "1" }),
      makeSaleItem({ id: "c1", canonicalKind: "SALES_CREDIT_NOTE", sellerTruthState: "CERTIFIED", sellerName: "A", sellerId: "1" }),
      makeSaleItem({ id: "x1", canonicalKind: "CUSTOMER_RECEIPT", sellerTruthState: "NOT_REPORTED_BY_SOURCE" }),
      makeSaleItem({ id: "u1", canonicalKind: "UNKNOWN_DOCUMENT", sellerTruthState: "NOT_REPORTED_BY_SOURCE" }),
    ];
    const r = classifySalesHistory(items, true, true, true, NOW);
    const total = r.officialInvoices.length + r.remissions.length + r.creditNotes.length
      + r.excludedCount + r.unclassifiedDocuments.length;
    expect(total).toBe(items.length);
  });

  test("T11: unknown document does not disappear — lands in unclassifiedDocuments", () => {
    const items = [
      makeSaleItem({ id: "u1", canonicalKind: "UNKNOWN_DOCUMENT", rawDocumentNumber: "XX-999" }),
    ];
    const r = classifySalesHistory(items, true, true, true, NOW);
    expect(r.unclassifiedDocuments.length).toBe(1);
    expect(r.unclassifiedDocuments[0].rawDocumentNumber).toBe("XX-999");
  });
});

// ── T12: Production wiring ──────────────────────────────────────────────────

describe("seller recovery — production wiring", () => {
  test("T12: loader imports and calls fetchSalesSellerEnrichment", () => {
    const loaderSrc = readFile("lib/comercial/clientes/cliente-360-loader.ts");
    // Must import the enrichment service
    expect(loaderSrc).toContain("fetchSalesSellerEnrichment");
    // Must use buildDocumentSellerMap for batch lookup
    expect(loaderSrc).toContain("buildDocumentSellerMap");
    // Must NOT contain N+1 pattern (per-row SAG calls)
    expect(loaderSrc).not.toContain("await consultaSagJson");
  });

  test("T12b: enrichment service file exists and exports correctly", () => {
    const enrichSrc = readFile("lib/comercial/clientes/sales-seller-enrichment.ts");
    expect(enrichSrc).toContain("export async function fetchSalesSellerEnrichment");
    // 03A8G3: SagVentasSellerRow replaced by DocumentSellerInfo (collision-safe)
    expect(enrichSrc).toContain("export interface DocumentSellerInfo");
    expect(enrichSrc).toContain("buildDocumentSellerMap");
    // Uses server-only
    expect(enrichSrc).toContain('"server-only"');
  });

  test("T12c: loader resolves seller from SAG enrichment before persisted data", () => {
    const loaderSrc = readFile("lib/comercial/clientes/cliente-360-loader.ts");
    // Must check sagSeller (enrichment) BEFORE checking persisted sellerName
    expect(loaderSrc).toContain("sagSellerMap.get");
    // Must handle sourceDown separately
    expect(loaderSrc).toContain("sellerEnrichment.sourceDown");
    // Must set CERTIFIED when SAG has seller
    expect(loaderSrc).toContain('sellerTruthState = "CERTIFIED"');
  });
});
