/**
 * lib/auth/__tests__/clients-canonical-truth-03a8f3.test.ts
 *
 * CLIENTS-CANONICAL-TRUTH-03A8F3 — Partial coverage + target semantics micro-closure.
 *
 * 10 behavioral tests proving:
 *   1. coverageState = APPLICATIONS_ONLY_PARTIAL for CERTIFIED results
 *   2. coverageState = APPLICATIONS_ONLY_PARTIAL for EMPTY_CERTIFIED results
 *   3. coverageState = IDENTITY_MISSING when no SAG identity
 *   4. coverageState = SOURCE_DOWN when query fails
 *   5. FE-xxx → OFFICIAL_INVOICE via resolveCanonicalDocumentKind (SALES_INVOICE)
 *   6. B1-xxx → REMISSION via resolveCanonicalDocumentKind (SALES_REMISSION)
 *   7. NC-xxx → excluded by isDocumentCreditNote (SALES_CREDIT_NOTE)
 *   8. ZZ-xxx → UNCLASSIFIED via UNKNOWN_DOCUMENT
 *   9. canonicalKindToCollectionTarget maps SALES_INVOICE→OFFICIAL_INVOICE, SALES_REMISSION→REMISSION, others→UNCLASSIFIED
 *  10. linkageLabel uses "Aplicado a factura", "Aplicado a remisión", "Documento no clasificado"
 */

import { describe, test, expect } from "bun:test";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeApp(overrides: Partial<{
  idRecaudo: number;
  fechaRecaudo: Date;
  clienteId: number;
  documentoRelacionado: string;
  valorRecaudado: number;
  montoNoAplicado: number;
  banco: string;
}> = {}) {
  return {
    idRecaudo: overrides.idRecaudo ?? 1001,
    fechaRecaudo: overrides.fechaRecaudo ?? new Date("2026-08-01T00:00:00Z"),
    clienteId: overrides.clienteId ?? 99999,
    documentoRelacionado: overrides.documentoRelacionado ?? "FE-1234",
    valorRecaudado: overrides.valorRecaudado ?? 1_000_000,
    montoNoAplicado: overrides.montoNoAplicado ?? 0,
    banco: overrides.banco ?? "1105 - Banco Test",
  };
}

const NOW = new Date("2026-08-16T12:00:00Z");

// ── 1-4. coverageState in all truth paths ────────────────────────────────────

describe("coverageState — all truth paths", () => {
  const { classifyCollections } = require("../../comercial/clientes/clientes-pure");

  test("T01: CERTIFIED result has coverageState = APPLICATIONS_ONLY_PARTIAL", () => {
    const apps = [makeApp({ documentoRelacionado: "FE-100", valorRecaudado: 500_000 })];
    const result = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(result.truthState).toBe("CERTIFIED");
    expect(result.coverageState).toBe("APPLICATIONS_ONLY_PARTIAL");
  });

  test("T02: EMPTY_CERTIFIED result has coverageState = APPLICATIONS_ONLY_PARTIAL", () => {
    const result = classifyCollections([], true, true, "castillitos", NOW);
    expect(result.truthState).toBe("EMPTY_CERTIFIED");
    expect(result.coverageState).toBe("APPLICATIONS_ONLY_PARTIAL");
  });

  test("T03: IDENTITY_MISSING has coverageState = IDENTITY_MISSING", () => {
    const result = classifyCollections([], true, false, "castillitos", NOW);
    expect(result.truthState).toBe("IDENTITY_MISSING");
    expect(result.coverageState).toBe("IDENTITY_MISSING");
  });

  test("T04: SOURCE_DOWN has coverageState = SOURCE_DOWN", () => {
    const result = classifyCollections([], false, true, "castillitos", NOW);
    expect(result.truthState).toBe("SOURCE_DOWN");
    expect(result.coverageState).toBe("SOURCE_DOWN");
  });
});

// ── 5-8. Classification via resolveCanonicalDocumentKind ──────────────────────

describe("classification via canonical document kind", () => {
  const { classifyCollections, normalizeCollectionReceipts } = require("../../comercial/clientes/clientes-pure");

  test("T05: FE-xxx document → OFFICIAL_INVOICE target", () => {
    const apps = [makeApp({ documentoRelacionado: "FE-8484", valorRecaudado: 1_000_000 })];
    const receipts = normalizeCollectionReceipts(apps, "castillitos");
    expect(receipts[0].collectionTarget).toBe("OFFICIAL_INVOICE");
  });

  test("T06: F2-xxx document → REMISSION target (castillitos remission prefix)", () => {
    const apps = [makeApp({ documentoRelacionado: "F2-5678", valorRecaudado: 500_000 })];
    const receipts = normalizeCollectionReceipts(apps, "castillitos");
    expect(receipts[0].collectionTarget).toBe("REMISSION");
  });

  test("T07: NC-xxx document excluded by credit note filter — not in certified result", () => {
    const apps = [
      makeApp({ idRecaudo: 1, documentoRelacionado: "NC-999", valorRecaudado: -200_000 }),
      makeApp({ idRecaudo: 2, documentoRelacionado: "FE-100", valorRecaudado: 500_000 }),
    ];
    const result = classifyCollections(apps, true, true, "castillitos", NOW);
    // NC row excluded, only FE row remains
    expect(result.items.length).toBe(1);
    expect(result.items[0].collectionTarget).toBe("OFFICIAL_INVOICE");
  });

  test("T08: ZZ-xxx document → UNCLASSIFIED target", () => {
    const apps = [makeApp({ documentoRelacionado: "ZZ-1234", valorRecaudado: 300_000 })];
    const receipts = normalizeCollectionReceipts(apps, "castillitos");
    expect(receipts[0].collectionTarget).toBe("UNCLASSIFIED");
  });
});

// ── 9. canonicalKindToCollectionTarget mapping ─────────────────────────────

describe("canonicalKindToCollectionTarget mapping", () => {
  const { canonicalKindToCollectionTarget } = require("../../comercial/clientes/clientes-pure");

  test("T09: maps SALES_INVOICE→OFFICIAL_INVOICE, SALES_REMISSION→REMISSION, others→UNCLASSIFIED", () => {
    expect(canonicalKindToCollectionTarget("SALES_INVOICE")).toBe("OFFICIAL_INVOICE");
    expect(canonicalKindToCollectionTarget("SALES_REMISSION")).toBe("REMISSION");
    expect(canonicalKindToCollectionTarget("SALES_CREDIT_NOTE")).toBe("UNCLASSIFIED");
    expect(canonicalKindToCollectionTarget("UNKNOWN_DOCUMENT")).toBe("UNCLASSIFIED");
  });
});

// ── 10. linkageLabel semantic labels ────────────────────────────────────────

describe("linkageLabel uses target-semantic labels", () => {
  const { classifyCollections } = require("../../comercial/clientes/clientes-pure");

  test("T10: FE→ 'Aplicado a factura', F2→ 'Aplicado a remisión', ZZ→ 'Documento no clasificado'", () => {
    const apps = [
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-100", valorRecaudado: 100 }),
      makeApp({ idRecaudo: 2, documentoRelacionado: "F2-200", valorRecaudado: 200 }),
      makeApp({ idRecaudo: 3, documentoRelacionado: "ZZ-300", valorRecaudado: 300 }),
    ];
    const result = classifyCollections(apps, true, true, "castillitos", NOW);
    const fe = result.items.find((i: any) => i.appliedToDocument === "FE-100");
    const f2 = result.items.find((i: any) => i.appliedToDocument === "F2-200");
    const zz = result.items.find((i: any) => i.appliedToDocument === "ZZ-300");

    expect(fe.linkageLabel).toContain("Aplicado a factura");
    expect(f2.linkageLabel).toContain("Aplicado a remisión");
    expect(zz.linkageLabel).toContain("Documento no clasificado");
  });
});
