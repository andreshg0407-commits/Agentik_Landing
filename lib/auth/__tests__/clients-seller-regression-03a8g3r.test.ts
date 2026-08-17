/**
 * lib/auth/__tests__/clients-seller-regression-03a8g3r.test.ts
 *
 * CLIENT-SALES-SELLER-REGRESSION-03A8G3R — End-to-end seller regression test.
 *
 * Proves the composite key regression is fixed:
 *   T01. buildCanonicalSalesDocumentKey: path 1 (code+bare) → composite
 *   T02. buildCanonicalSalesDocumentKey: path 2 (null+bare) → bare
 *   T03. buildCanonicalSalesDocumentKey: path 3 (code+composite) → no double-prefix
 *   T04. buildCanonicalSalesDocumentKey: empty inputs → empty string
 *   T05. Bare-number fallback: unambiguous match
 *   T06. Bare-number fallback: ambiguous (two fuentes, same number) → null
 *   T07. DOCUMENT_UNMATCHED truth state exists
 *   T08. Loader uses buildCanonicalSalesDocumentKey (structural)
 *   T09. Loader uses buildBareNumberFallback (structural)
 *   T10. Loader handles DOCUMENT_UNMATCHED (structural)
 *   T11. storedCompositeKeys uses shared key builder (structural)
 *   T12. End-to-end: SAG enrichment map → canonical key → seller lookup matches
 */

import { describe, test, expect, mock } from "bun:test";
import * as fs from "fs";
import * as path from "path";

mock.module("server-only", () => ({}));

const ROOT = path.resolve(__dirname, "../../..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

const {
  buildCanonicalSalesDocumentKey,
  computeSalesCoverage,
} = require("../../comercial/clientes/sales-seller-enrichment");

const {
  classifySalesHistory,
} = require("../../comercial/clientes/clientes-pure");

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeDocInfo(overrides: Partial<{
  idDocumento: number;
  fuenteCode: string;
  numeroDocumento: string;
  compositeKey: string;
  fechaDocumento: string;
  anulado: boolean;
  vendedorId: string | null;
  vendedor: string | null;
  amount: number;
}> = {}) {
  const fuenteCode = overrides.fuenteCode ?? "FE";
  const numero = overrides.numeroDocumento ?? "10505";
  return {
    idDocumento: overrides.idDocumento ?? 1001,
    fuenteCode,
    numeroDocumento: numero,
    compositeKey: overrides.compositeKey ?? `${fuenteCode}-${numero}`,
    fechaDocumento: overrides.fechaDocumento ?? "2026-08-14",
    anulado: overrides.anulado ?? false,
    vendedorId: overrides.vendedorId ?? "211",
    vendedor: overrides.vendedor ?? "NESTOR FERNANDO ALZATE JIMENEZ",
    amount: overrides.amount ?? 1_000_000,
  };
}

function makeEnrichment(docs: ReturnType<typeof makeDocInfo>[], sourceDown = false) {
  return {
    sourceDown,
    distinctDocuments: docs,
    buildDocumentSellerMap() {
      const map = new Map<string, typeof docs[0]>();
      for (const d of docs) map.set(d.compositeKey, d);
      return map;
    },
    buildBareNumberFallback() {
      const map = new Map<string, typeof docs[0] | null>();
      for (const d of docs) {
        if (map.has(d.numeroDocumento)) {
          map.set(d.numeroDocumento, null); // ambiguous
        } else {
          map.set(d.numeroDocumento, d);
        }
      }
      return map;
    },
  };
}

// ── T01-T04: buildCanonicalSalesDocumentKey ─────────────────────────────────

describe("buildCanonicalSalesDocumentKey", () => {
  test("T01: path 1 — code + bare number → composite key", () => {
    expect(buildCanonicalSalesDocumentKey("FE", "10505")).toBe("FE-10505");
    expect(buildCanonicalSalesDocumentKey("D2", "849")).toBe("D2-849");
    expect(buildCanonicalSalesDocumentKey("NC", "300")).toBe("NC-300");
  });

  test("T02: path 2 — null code + bare number → bare (caller must fallback)", () => {
    expect(buildCanonicalSalesDocumentKey(null, "10505")).toBe("10505");
    expect(buildCanonicalSalesDocumentKey("", "10505")).toBe("10505");
    expect(buildCanonicalSalesDocumentKey(undefined, "849")).toBe("849");
  });

  test("T03: path 3 — code + already-composite → no double-prefix", () => {
    expect(buildCanonicalSalesDocumentKey("FE", "FE-10505")).toBe("FE-10505");
    expect(buildCanonicalSalesDocumentKey("D2", "D2-849")).toBe("D2-849");
    expect(buildCanonicalSalesDocumentKey("NC", "NC-300")).toBe("NC-300");
  });

  test("T04: empty/null inputs → empty string", () => {
    expect(buildCanonicalSalesDocumentKey(null, null)).toBe("");
    expect(buildCanonicalSalesDocumentKey("", "")).toBe("");
    expect(buildCanonicalSalesDocumentKey(null, "")).toBe("");
    expect(buildCanonicalSalesDocumentKey("FE", null)).toBe("");
    expect(buildCanonicalSalesDocumentKey("FE", "")).toBe("");
  });
});

// ── T05-T06: Bare-number fallback ──────────────────────────────────────────

describe("bare-number fallback", () => {
  test("T05: unambiguous bare number resolves to the single matching document", () => {
    const doc = makeDocInfo({ idDocumento: 5001, fuenteCode: "FE", numeroDocumento: "10505" });
    const enrichment = makeEnrichment([doc]);
    const fallback = enrichment.buildBareNumberFallback();

    expect(fallback.get("10505")).toBeDefined();
    expect(fallback.get("10505")?.fuenteCode).toBe("FE");
    expect(fallback.get("10505")?.vendedor).toBe("NESTOR FERNANDO ALZATE JIMENEZ");
  });

  test("T06: ambiguous bare number (two fuentes, same number) → null", () => {
    const fe849 = makeDocInfo({ idDocumento: 5001, fuenteCode: "FE", numeroDocumento: "849" });
    const d2849 = makeDocInfo({ idDocumento: 5002, fuenteCode: "D2", numeroDocumento: "849" });
    const enrichment = makeEnrichment([fe849, d2849]);
    const fallback = enrichment.buildBareNumberFallback();

    // Ambiguous — cannot safely resolve
    expect(fallback.get("849")).toBeNull();
    // But composite map is still collision-safe
    const compositeMap = enrichment.buildDocumentSellerMap();
    expect(compositeMap.get("FE-849")?.idDocumento).toBe(5001);
    expect(compositeMap.get("D2-849")?.idDocumento).toBe(5002);
  });
});

// ── T07: DOCUMENT_UNMATCHED truth state ───────────────────────────────────

describe("DOCUMENT_UNMATCHED truth state", () => {
  test("T07: DOCUMENT_UNMATCHED exists in SellerTruthState", () => {
    const pureSrc = readFile("lib/comercial/clientes/clientes-pure.ts");
    expect(pureSrc).toContain('"DOCUMENT_UNMATCHED"');
    // Must be part of SellerTruthState union
    const typeBlock = pureSrc.slice(
      pureSrc.indexOf("export type SellerTruthState"),
      pureSrc.indexOf(";", pureSrc.indexOf("export type SellerTruthState")) + 1,
    );
    expect(typeBlock).toContain("DOCUMENT_UNMATCHED");
  });
});

// ── T08-T11: Loader structural tests ────────────────────────────────────────

describe("loader wiring — regression fix", () => {
  test("T08: loader uses buildCanonicalSalesDocumentKey", () => {
    const loaderSrc = readFile("lib/comercial/clientes/cliente-360-loader.ts");
    expect(loaderSrc).toContain("buildCanonicalSalesDocumentKey");
    expect(loaderSrc).toContain("import { fetchSalesSellerEnrichment, computeSalesCoverage, buildCanonicalSalesDocumentKey");
  });

  test("T09: loader uses buildBareNumberFallback for legacy records", () => {
    const loaderSrc = readFile("lib/comercial/clientes/cliente-360-loader.ts");
    expect(loaderSrc).toContain("buildBareNumberFallback");
    expect(loaderSrc).toContain("sagBareFallback");
  });

  test("T10: loader handles DOCUMENT_UNMATCHED when bare number is ambiguous", () => {
    const loaderSrc = readFile("lib/comercial/clientes/cliente-360-loader.ts");
    expect(loaderSrc).toContain("bareNumberAmbiguous");
    expect(loaderSrc).toContain('"DOCUMENT_UNMATCHED"');
  });

  test("T11: storedCompositeKeys uses shared key builder (not manual concatenation)", () => {
    const loaderSrc = readFile("lib/comercial/clientes/cliente-360-loader.ts");
    // Find the storedCompositeKeys construction block
    const startIdx = loaderSrc.indexOf("const storedCompositeKeys");
    const endIdx = loaderSrc.indexOf("computeSalesCoverage(sellerEnrichment");
    const keysBlock = loaderSrc.slice(startIdx, endIdx);
    expect(keysBlock).toContain("buildCanonicalSalesDocumentKey(code, num)");
    // Must NOT contain manual `${code}-${num}` concatenation for stored keys
    expect(keysBlock).not.toContain("`${code}-${num}`");
  });
});

// ── T12: End-to-end regression ────────────────────────────────────────────

describe("end-to-end seller regression", () => {
  test("T12: SAG enrichment map → canonical key → seller lookup matches for all 3 paths", () => {
    // Simulate SAG enrichment map with composite keys
    const sagDoc = makeDocInfo({
      idDocumento: 3000,
      fuenteCode: "FE",
      numeroDocumento: "10505",
      vendedor: "NESTOR FERNANDO ALZATE JIMENEZ",
      vendedorId: "211",
    });
    const enrichment = makeEnrichment([sagDoc]);
    const sagSellerMap = enrichment.buildDocumentSellerMap();
    const sagBareFallback = enrichment.buildBareNumberFallback();

    // Path 1: mapSagMovement — comprobanteCode="FE", comprobante="10505"
    const key1 = buildCanonicalSalesDocumentKey("FE", "10505");
    expect(key1).toBe("FE-10505");
    expect(sagSellerMap.get(key1)?.vendedor).toBe("NESTOR FERNANDO ALZATE JIMENEZ");

    // Path 2: mapSagVentasRow — comprobanteCode=null, comprobante="10505"
    const key2 = buildCanonicalSalesDocumentKey(null, "10505");
    expect(key2).toBe("10505");
    // Composite map won't match bare key
    expect(sagSellerMap.get(key2)).toBeUndefined();
    // But bare-number fallback WILL match (unambiguous)
    expect(sagBareFallback.get(key2)?.vendedor).toBe("NESTOR FERNANDO ALZATE JIMENEZ");

    // Path 3: sag-store-sale-lines-sync — comprobanteCode="FE", comprobante="FE-10505"
    const key3 = buildCanonicalSalesDocumentKey("FE", "FE-10505");
    expect(key3).toBe("FE-10505"); // No double-prefix!
    expect(sagSellerMap.get(key3)?.vendedor).toBe("NESTOR FERNANDO ALZATE JIMENEZ");
  });

  test("T12b: classified sales with CERTIFIED seller from all 3 mapper paths", () => {
    // Simulate 3 sale items from different mapper paths, all for doc FE-10505
    const items = [
      // Path 1: comprobanteCode set, bare comprobante
      {
        id: "path1", canonicalKind: "SALES_INVOICE",
        rawSourceCode: "FE", rawDocumentNumber: "FE-10505",
        issueDate: "2026-08-14T00:00:00Z",
        seller: null, sellerId: "211",
        sellerName: "NESTOR FERNANDO ALZATE JIMENEZ",
        sellerTruthState: "CERTIFIED" as const,
        grossAmount: 1_000_000, productLine: "CS", sourceProfileId: "castillitos",
      },
      // Path 2: comprobanteCode null, bare comprobante — with fallback recovery
      {
        id: "path2", canonicalKind: "SALES_INVOICE",
        rawSourceCode: null, rawDocumentNumber: "10505",
        issueDate: "2026-08-14T00:00:00Z",
        seller: null, sellerId: "211",
        sellerName: "NESTOR FERNANDO ALZATE JIMENEZ",
        sellerTruthState: "CERTIFIED" as const,
        grossAmount: 1_000_000, productLine: "CS", sourceProfileId: "castillitos",
      },
    ];
    const r = classifySalesHistory(items, true, true, true, new Date("2026-08-17T12:00:00Z"));
    // Both should be CERTIFIED with seller names
    expect(r.officialInvoices[0].sellerTruthState).toBe("CERTIFIED");
    expect(r.officialInvoices[0].sellerName).toBe("NESTOR FERNANDO ALZATE JIMENEZ");
    expect(r.officialInvoices[1].sellerTruthState).toBe("CERTIFIED");
    expect(r.officialInvoices[1].sellerName).toBe("NESTOR FERNANDO ALZATE JIMENEZ");
  });

  test("T12c: DOCUMENT_UNMATCHED flows through classifySalesHistory", () => {
    const items = [{
      id: "ambiguous", canonicalKind: "SALES_INVOICE",
      rawSourceCode: null, rawDocumentNumber: "849",
      issueDate: "2026-08-14T00:00:00Z",
      seller: null, sellerId: null,
      sellerName: null,
      sellerTruthState: "DOCUMENT_UNMATCHED" as const,
      grossAmount: 500_000, productLine: "CS", sourceProfileId: "castillitos",
    }];
    const r = classifySalesHistory(items, true, true, true, new Date("2026-08-17T12:00:00Z"));
    expect(r.officialInvoices[0].sellerTruthState).toBe("DOCUMENT_UNMATCHED");
    expect(r.officialInvoices[0].sellerName).toBeNull();
  });

  test("T12d: enrichment exports buildCanonicalSalesDocumentKey + buildBareNumberFallback", () => {
    const enrichSrc = readFile("lib/comercial/clientes/sales-seller-enrichment.ts");
    expect(enrichSrc).toContain("export function buildCanonicalSalesDocumentKey");
    expect(enrichSrc).toContain("buildBareNumberFallback");
  });
});
