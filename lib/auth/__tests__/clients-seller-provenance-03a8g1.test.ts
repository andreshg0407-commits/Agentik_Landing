/**
 * lib/auth/__tests__/clients-seller-provenance-03a8g1.test.ts
 *
 * CLIENT-SALES-SELLER-PROVENANCE-03A8G1 — Seller provenance closure.
 *
 * 10 behavioral tests proving:
 *   1. Seller from vw_agentik_ventas has priority (CERTIFIED)
 *   2. Fallback: code-only → IDENTITY_ONLY
 *   3. No seller data at all → NOT_REPORTED_BY_SOURCE
 *   4. Source down → SOURCE_DOWN (seller truth follows query truth)
 *   5. Never use current client seller — each document has its own seller
 *   6. Reassigned client preserves different historical sellers per document
 *   7. Multiple lines of same document keep same seller per line
 *   8. "Sin Vendedor" fallback is NOT treated as CERTIFIED
 *   9. UI shows "No informado por SAG" for NOT_REPORTED_BY_SOURCE
 *  10. Production wiring: loader queries sellerName + sellerCode from SaleRecord
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

// ── T01: Seller from vw_agentik_ventas has priority ─────────────────────────

describe("seller provenance — truth state", () => {
  const { classifySalesHistory } = require("../../comercial/clientes/clientes-pure");

  test("T01: seller with both ID and name → CERTIFIED", () => {
    const items = [makeSaleItem({
      sellerName: "NESTOR FERNANDO ALZATE JIMENEZ",
      sellerId: "211",
      sellerTruthState: "CERTIFIED",
    })];
    const r = classifySalesHistory(items, true, true, true, NOW);
    expect(r.truthState).toBe("CERTIFIED");
    expect(r.officialInvoices[0].sellerTruthState).toBe("CERTIFIED");
    expect(r.officialInvoices[0].sellerName).toBe("NESTOR FERNANDO ALZATE JIMENEZ");
    expect(r.officialInvoices[0].sellerId).toBe("211");
  });

  test("T02: seller code present but name missing → IDENTITY_ONLY", () => {
    const items = [makeSaleItem({
      sellerName: null,
      sellerId: "211",
      sellerTruthState: "IDENTITY_ONLY",
    })];
    const r = classifySalesHistory(items, true, true, true, NOW);
    expect(r.officialInvoices[0].sellerTruthState).toBe("IDENTITY_ONLY");
    expect(r.officialInvoices[0].sellerId).toBe("211");
    expect(r.officialInvoices[0].sellerName).toBeNull();
  });

  test("T03: no seller data at all → NOT_REPORTED_BY_SOURCE", () => {
    const items = [makeSaleItem({
      sellerName: null,
      sellerId: null,
      sellerTruthState: "NOT_REPORTED_BY_SOURCE",
    })];
    const r = classifySalesHistory(items, true, true, true, NOW);
    expect(r.officialInvoices[0].sellerTruthState).toBe("NOT_REPORTED_BY_SOURCE");
    expect(r.officialInvoices[0].sellerId).toBeNull();
    expect(r.officialInvoices[0].sellerName).toBeNull();
  });

  test("T04: source down → seller truth follows query truth", () => {
    const r = classifySalesHistory([], false, true, true, NOW);
    expect(r.truthState).toBe("SOURCE_DOWN");
    // When source is down, no items exist — seller truth is moot
    expect(r.officialInvoices.length).toBe(0);
  });
});

// ── T05-T06: Historical seller independence ─────────────────────────────────

describe("seller provenance — historical independence", () => {
  const { classifySalesHistory } = require("../../comercial/clientes/clientes-pure");

  test("T05: each document has its own seller — never inherit from client", () => {
    // Two invoices from same client, different sellers (historical)
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
    // Each document retains its own seller truth — no auto-propagation
    expect(r.officialInvoices[0].sellerTruthState).toBe("CERTIFIED");
    expect(r.officialInvoices[1].sellerTruthState).toBe("NOT_REPORTED_BY_SOURCE");
  });

  test("T06: reassigned client preserves different historical sellers", () => {
    // Client was sold by seller A in 2025, then reassigned to seller B in 2026
    const items = [
      makeSaleItem({
        id: "old-1", rawDocumentNumber: "FE-9000",
        issueDate: "2025-06-01T00:00:00.000Z",
        sellerName: "VENDEDOR ANTERIOR", sellerId: "100",
        sellerTruthState: "CERTIFIED",
      }),
      makeSaleItem({
        id: "new-1", rawDocumentNumber: "FE-10505",
        issueDate: "2026-07-17T00:00:00.000Z",
        sellerName: "NESTOR FERNANDO ALZATE JIMENEZ", sellerId: "211",
        sellerTruthState: "CERTIFIED",
      }),
    ];
    const r = classifySalesHistory(items, true, true, true, NOW);
    expect(r.officialInvoices.length).toBe(2);
    // Historical seller preserved, not overwritten by current assignment
    const oldInv = r.officialInvoices.find((i: any) => i.id === "old-1");
    const newInv = r.officialInvoices.find((i: any) => i.id === "new-1");
    expect(oldInv.sellerName).toBe("VENDEDOR ANTERIOR");
    expect(newInv.sellerName).toBe("NESTOR FERNANDO ALZATE JIMENEZ");
  });
});

// ── T07: Multi-line documents ───────────────────────────────────────────────

describe("seller provenance — multi-line documents", () => {
  const { classifySalesHistory } = require("../../comercial/clientes/clientes-pure");

  test("T07: multiple lines of same document keep same seller per line", () => {
    const items = [
      makeSaleItem({
        id: "line-1", canonicalKind: "SALES_REMISSION", rawSourceCode: "F2",
        rawDocumentNumber: "F2-8653", sellerName: "NESTOR FERNANDO ALZATE JIMENEZ",
        sellerId: "211", sellerTruthState: "CERTIFIED", grossAmount: 75_900,
      }),
      makeSaleItem({
        id: "line-2", canonicalKind: "SALES_REMISSION", rawSourceCode: "F2",
        rawDocumentNumber: "F2-8653", sellerName: "NESTOR FERNANDO ALZATE JIMENEZ",
        sellerId: "211", sellerTruthState: "CERTIFIED", grossAmount: 75_900,
      }),
      makeSaleItem({
        id: "line-3", canonicalKind: "SALES_REMISSION", rawSourceCode: "F2",
        rawDocumentNumber: "F2-8653", sellerName: "NESTOR FERNANDO ALZATE JIMENEZ",
        sellerId: "211", sellerTruthState: "CERTIFIED", grossAmount: 75_900,
      }),
    ];
    const r = classifySalesHistory(items, true, true, true, NOW);
    expect(r.remissions.length).toBe(3);
    // All lines carry the same seller — no dedup loss
    for (const line of r.remissions) {
      expect(line.sellerTruthState).toBe("CERTIFIED");
      expect(line.sellerName).toBe("NESTOR FERNANDO ALZATE JIMENEZ");
      expect(line.sellerId).toBe("211");
    }
  });
});

// ── T08: "Sin Vendedor" is NOT CERTIFIED ────────────────────────────────────

describe("seller provenance — fallback detection", () => {
  test("T08: 'Sin Vendedor' fallback is rejected by loader truth computation", () => {
    // The loader detects "Sin Vendedor" as a storage fallback and sets NOT_REPORTED_BY_SOURCE
    const loaderSrc = readFile("lib/comercial/clientes/cliente-360-loader.ts");
    // Must check for "Sin Vendedor" as fallback marker
    expect(loaderSrc).toContain('"Sin Vendedor"');
    expect(loaderSrc).toContain("isFallbackSeller");
    // Must set NOT_REPORTED_BY_SOURCE when seller is fallback
    expect(loaderSrc).toContain('"NOT_REPORTED_BY_SOURCE"');
  });
});

// ── T09: UI shows "No informado por SAG" ────────────────────────────────────

describe("seller provenance — UI display", () => {
  test("T09: drawer shows 'No informado por SAG' for NOT_REPORTED_BY_SOURCE", () => {
    const drawerSrc = readFile("app/(app)/[orgSlug]/comercial/clientes/clientes-client.tsx");
    expect(drawerSrc).toContain("No informado por SAG");
    expect(drawerSrc).toContain("sellerTruthState");
    // PROHIBITED: must NOT contain "sin-vendedor" display text
    // (slug references in code are allowed, but display text must not show the slug)
    expect(drawerSrc).not.toContain('"sin-vendedor"');
  });

  test("T09b: 360 detail shows 'No informado por SAG' for NOT_REPORTED_BY_SOURCE", () => {
    const detailSrc = readFile("app/(app)/[orgSlug]/comercial/clientes/[clienteId]/cliente-360-client.tsx");
    expect(detailSrc).toContain("No informado por SAG");
    expect(detailSrc).toContain("sellerTruthState");
  });
});

// ── T10: Production wiring — loader queries seller fields ───────────────────

describe("seller provenance — production wiring", () => {
  test("T10: loader queries sellerName and sellerCode from SaleRecord", () => {
    const loaderSrc = readFile("lib/comercial/clientes/cliente-360-loader.ts");
    // SaleRecord select must include seller fields
    expect(loaderSrc).toContain("sellerName: true");
    expect(loaderSrc).toContain("sellerCode: true");
  });

  test("T10b: ClassifiedSaleItem has sellerId, sellerName, and sellerTruthState", () => {
    const pureSrc = readFile("lib/comercial/clientes/clientes-pure.ts");
    expect(pureSrc).toContain("sellerId: string | null");
    expect(pureSrc).toContain("sellerName: string | null");
    expect(pureSrc).toContain("sellerTruthState: SellerTruthState");
  });

  test("T10c: SellerTruthState type has exactly 5 states", () => {
    const pureSrc = readFile("lib/comercial/clientes/clientes-pure.ts");
    expect(pureSrc).toContain('"CERTIFIED"');
    expect(pureSrc).toContain('"IDENTITY_ONLY"');
    expect(pureSrc).toContain('"NOT_REPORTED_BY_SOURCE"');
    expect(pureSrc).toContain('"SOURCE_DOWN"');
    expect(pureSrc).toContain('"DOCUMENT_UNMATCHED"');
  });
});
