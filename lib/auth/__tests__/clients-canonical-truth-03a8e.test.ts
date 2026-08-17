/**
 * lib/auth/__tests__/clients-canonical-truth-03a8e.test.ts
 *
 * CLIENTS-CANONICAL-TRUTH-03A8E — F1/F2 sales history separation.
 *
 * Behavioral tests proving:
 *   1. Client with only F1 invoices → officialInvoices only
 *   2. Client with only F2 remissions → remissions only
 *   3. Client with F1 and F2 → both populated, no cross-contamination
 *   4. Official invoice never in remissions bucket
 *   5. Remission never in official invoices bucket
 *   6. Official NC (NE, NC, ND) reduces F1 (officialCreditTotal)
 *   7. Remission NC (D2, 2D-6D) reduces F2 (remissionCreditTotal)
 *   8. Recaudo (CUSTOMER_RECEIPT) never appears in any sales section
 *   9. Anticipo (CUSTOMER_ADVANCE) never appears in any sales section
 *  10. 0 certified ≠ source down (truthState differs)
 *  11. IDENTITY_MISSING → empty arrays + reason
 *  12. PROFILE_MISSING → items go to unclassifiedDocuments
 *  13. Structural: "ventas" tab in drawer, SALES_GRID in 360
 *  14. resolveCanonicalDocumentKind used for classification (not sagSourceType)
 *  15. getSalesProfileLabels returns profile-specific labels
 *  16. lastSaleDate picks most recent invoice or remission, not NC
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<{
  id: string; canonicalKind: string; rawSourceCode: string | null;
  rawDocumentNumber: string | null; issueDate: string | null;
  seller: string | null; grossAmount: number; productLine: string | null;
  sourceProfileId: string;
}> = {}) {
  return {
    id: overrides.id ?? "item-1",
    canonicalKind: overrides.canonicalKind ?? "SALES_INVOICE",
    rawSourceCode: overrides.rawSourceCode ?? "FE",
    rawDocumentNumber: overrides.rawDocumentNumber ?? "FE-1001",
    issueDate: overrides.issueDate ?? "2026-08-01T00:00:00Z",
    seller: overrides.seller ?? null,
    grossAmount: overrides.grossAmount ?? 1_000_000,
    productLine: overrides.productLine ?? null,
    sourceProfileId: overrides.sourceProfileId ?? "castillitos",
  };
}

const NOW = new Date("2026-08-16T12:00:00Z");

// ── 1. classifySalesHistory ──────────────────────────────────────────────────

describe("classifySalesHistory — F1/F2 separation", () => {
  const { classifySalesHistory } = require("../../comercial/clientes/clientes-pure");

  test("client with only F1 invoices → officialInvoices only", () => {
    const items = [
      makeItem({ id: "f1", canonicalKind: "SALES_INVOICE", rawSourceCode: "FE", grossAmount: 5_000_000 }),
      makeItem({ id: "f2", canonicalKind: "SALES_INVOICE", rawSourceCode: "F1", grossAmount: 3_000_000 }),
    ];
    const r = classifySalesHistory(items, true, true, true, NOW);
    expect(r.truthState).toBe("CERTIFIED");
    expect(r.officialInvoices.length).toBe(2);
    expect(r.remissions.length).toBe(0);
    expect(r.officialGross).toBe(8_000_000);
    expect(r.remissionGross).toBe(0);
  });

  test("client with only F2 remissions → remissions only", () => {
    const items = [
      makeItem({ id: "r1", canonicalKind: "SALES_REMISSION", rawSourceCode: "F2", grossAmount: 2_000_000 }),
      makeItem({ id: "r2", canonicalKind: "SALES_REMISSION", rawSourceCode: "F3", grossAmount: 1_500_000 }),
    ];
    const r = classifySalesHistory(items, true, true, true, NOW);
    expect(r.truthState).toBe("CERTIFIED");
    expect(r.officialInvoices.length).toBe(0);
    expect(r.remissions.length).toBe(2);
    expect(r.remissionGross).toBe(3_500_000);
    expect(r.officialGross).toBe(0);
  });

  test("client with F1 and F2 → both populated, no cross-contamination", () => {
    const items = [
      makeItem({ id: "f1", canonicalKind: "SALES_INVOICE", rawSourceCode: "FE", grossAmount: 5_000_000 }),
      makeItem({ id: "r1", canonicalKind: "SALES_REMISSION", rawSourceCode: "F2", grossAmount: 2_000_000 }),
    ];
    const r = classifySalesHistory(items, true, true, true, NOW);
    expect(r.officialInvoices.length).toBe(1);
    expect(r.remissions.length).toBe(1);
    expect(r.officialInvoices[0].id).toBe("f1");
    expect(r.remissions[0].id).toBe("r1");
  });

  test("official invoice never in remissions bucket", () => {
    const items = [
      makeItem({ id: "f1", canonicalKind: "SALES_INVOICE", rawSourceCode: "FE" }),
    ];
    const r = classifySalesHistory(items, true, true, true, NOW);
    expect(r.remissions.find((i: any) => i.id === "f1")).toBeUndefined();
    expect(r.officialInvoices.find((i: any) => i.id === "f1")).toBeDefined();
  });

  test("remission never in official invoices bucket", () => {
    const items = [
      makeItem({ id: "r1", canonicalKind: "SALES_REMISSION", rawSourceCode: "F2" }),
    ];
    const r = classifySalesHistory(items, true, true, true, NOW);
    expect(r.officialInvoices.find((i: any) => i.id === "r1")).toBeUndefined();
    expect(r.remissions.find((i: any) => i.id === "r1")).toBeDefined();
  });

  test("official NC (NE) reduces F1 — contributes to officialCreditTotal", () => {
    const items = [
      makeItem({ id: "f1", canonicalKind: "SALES_INVOICE", rawSourceCode: "FE", grossAmount: 10_000_000 }),
      makeItem({ id: "nc1", canonicalKind: "SALES_CREDIT_NOTE", rawSourceCode: "NE", grossAmount: -1_500_000 }),
    ];
    const r = classifySalesHistory(items, true, true, true, NOW);
    expect(r.officialCreditTotal).toBe(1_500_000);
    expect(r.remissionCreditTotal).toBe(0);
    expect(r.officialNet).toBe(8_500_000);
    expect(r.creditNotes.length).toBe(1);
  });

  test("official NC codes: NC, ND, NF, NS, NT, NG, NA, NW, NX, D1, D3", () => {
    const officialCodes = ["NC", "ND", "NF", "NS", "NT", "NG", "NA", "NW", "NX", "D1", "D3"];
    for (const code of officialCodes) {
      const items = [
        makeItem({ id: `nc-${code}`, canonicalKind: "SALES_CREDIT_NOTE", rawSourceCode: code, grossAmount: -100_000 }),
      ];
      const r = classifySalesHistory(items, true, true, true, NOW);
      expect(r.officialCreditTotal).toBe(100_000);
      expect(r.remissionCreditTotal).toBe(0);
    }
  });

  test("remission NC (D2) reduces F2 — contributes to remissionCreditTotal", () => {
    const items = [
      makeItem({ id: "r1", canonicalKind: "SALES_REMISSION", rawSourceCode: "F2", grossAmount: 5_000_000 }),
      makeItem({ id: "nc1", canonicalKind: "SALES_CREDIT_NOTE", rawSourceCode: "D2", grossAmount: -800_000 }),
    ];
    const r = classifySalesHistory(items, true, true, true, NOW);
    expect(r.remissionCreditTotal).toBe(800_000);
    expect(r.officialCreditTotal).toBe(0);
    expect(r.remissionNet).toBe(4_200_000);
  });

  test("remission NC codes: 2D, 3D, 4D, 5D, 6D", () => {
    const remissionCodes = ["2D", "3D", "4D", "5D", "6D"];
    for (const code of remissionCodes) {
      const items = [
        makeItem({ id: `nc-${code}`, canonicalKind: "SALES_CREDIT_NOTE", rawSourceCode: code, grossAmount: -200_000 }),
      ];
      const r = classifySalesHistory(items, true, true, true, NOW);
      expect(r.remissionCreditTotal).toBe(200_000);
      expect(r.officialCreditTotal).toBe(0);
    }
  });

  test("recaudo (CUSTOMER_RECEIPT) never appears in any sales section", () => {
    const items = [
      makeItem({ id: "f1", canonicalKind: "SALES_INVOICE", rawSourceCode: "FE", grossAmount: 5_000_000 }),
      makeItem({ id: "rc1", canonicalKind: "CUSTOMER_RECEIPT", rawSourceCode: "R1", grossAmount: 3_000_000 }),
    ];
    const r = classifySalesHistory(items, true, true, true, NOW);
    expect(r.officialInvoices.length).toBe(1);
    expect(r.remissions.length).toBe(0);
    expect(r.creditNotes.length).toBe(0);
    expect(r.unclassifiedDocuments.length).toBe(0);
    expect(r.excludedCount).toBe(1);
  });

  test("anticipo (CUSTOMER_ADVANCE) never appears in any sales section", () => {
    const items = [
      makeItem({ id: "an1", canonicalKind: "CUSTOMER_ADVANCE", rawSourceCode: "AN", grossAmount: 500_000 }),
    ];
    const r = classifySalesHistory(items, true, true, true, NOW);
    expect(r.officialInvoices.length).toBe(0);
    expect(r.remissions.length).toBe(0);
    expect(r.creditNotes.length).toBe(0);
    expect(r.unclassifiedDocuments.length).toBe(0);
    expect(r.excludedCount).toBe(1);
  });

  test("0 certified ≠ source down — different truthStates", () => {
    const emptyCertified = classifySalesHistory([], true, true, true, NOW);
    const sourceDown = classifySalesHistory([], false, true, true, NOW);
    expect(emptyCertified.truthState).toBe("EMPTY_CERTIFIED");
    expect(sourceDown.truthState).toBe("SOURCE_DOWN");
    expect(emptyCertified.truthState).not.toBe(sourceDown.truthState);
  });

  test("IDENTITY_MISSING → empty arrays + clear reason", () => {
    const r = classifySalesHistory([], true, false, true, NOW);
    expect(r.truthState).toBe("IDENTITY_MISSING");
    expect(r.officialInvoices.length).toBe(0);
    expect(r.remissions.length).toBe(0);
    expect(r.creditNotes.length).toBe(0);
    expect(r.reason).toContain("identidad SAG");
  });

  test("PROFILE_MISSING → items go to unclassifiedDocuments", () => {
    const items = [
      makeItem({ id: "f1", canonicalKind: "SALES_INVOICE", rawSourceCode: "FE" }),
    ];
    const r = classifySalesHistory(items, true, true, false, NOW);
    expect(r.truthState).toBe("PROFILE_MISSING");
    expect(r.unclassifiedDocuments.length).toBe(1);
    expect(r.officialInvoices.length).toBe(0);
  });

  test("lastSaleDate picks most recent invoice or remission, not NC", () => {
    const items = [
      makeItem({ id: "f1", canonicalKind: "SALES_INVOICE", rawSourceCode: "FE", issueDate: "2026-07-01T00:00:00Z" }),
      makeItem({ id: "r1", canonicalKind: "SALES_REMISSION", rawSourceCode: "F2", issueDate: "2026-08-10T00:00:00Z" }),
      makeItem({ id: "nc1", canonicalKind: "SALES_CREDIT_NOTE", rawSourceCode: "NE", issueDate: "2026-08-15T00:00:00Z" }),
    ];
    const r = classifySalesHistory(items, true, true, true, NOW);
    expect(r.lastSaleDate).toBe("2026-08-10T00:00:00Z");
    expect(r.lastSaleKind).toBe("Remisión");
  });

  test("lastSaleKind = 'Factura' when last sale is an invoice", () => {
    const items = [
      makeItem({ id: "f1", canonicalKind: "SALES_INVOICE", rawSourceCode: "FE", issueDate: "2026-08-10T00:00:00Z" }),
      makeItem({ id: "r1", canonicalKind: "SALES_REMISSION", rawSourceCode: "F2", issueDate: "2026-07-01T00:00:00Z" }),
    ];
    const r = classifySalesHistory(items, true, true, true, NOW);
    expect(r.lastSaleKind).toBe("Factura");
  });

  test("sourceAsOf is set from queryAsOf", () => {
    const r = classifySalesHistory([], true, true, true, NOW);
    expect(r.sourceAsOf).toBe("2026-08-16T12:00:00.000Z");
  });

  test("source is SaleRecord", () => {
    const r = classifySalesHistory([], true, true, true, NOW);
    expect(r.source).toContain("SaleRecord");
  });

  test("excludedCount = receipts + advances", () => {
    const items = [
      makeItem({ id: "rc1", canonicalKind: "CUSTOMER_RECEIPT", rawSourceCode: "R1" }),
      makeItem({ id: "rc2", canonicalKind: "CUSTOMER_RECEIPT", rawSourceCode: "R2" }),
      makeItem({ id: "an1", canonicalKind: "CUSTOMER_ADVANCE", rawSourceCode: "AN" }),
      makeItem({ id: "f1", canonicalKind: "SALES_INVOICE", rawSourceCode: "FE" }),
    ];
    const r = classifySalesHistory(items, true, true, true, NOW);
    expect(r.excludedCount).toBe(3);
    expect(r.officialInvoices.length).toBe(1);
  });

  test("reason string includes counts for all buckets", () => {
    const items = [
      makeItem({ id: "f1", canonicalKind: "SALES_INVOICE", rawSourceCode: "FE" }),
      makeItem({ id: "r1", canonicalKind: "SALES_REMISSION", rawSourceCode: "F2" }),
      makeItem({ id: "nc1", canonicalKind: "SALES_CREDIT_NOTE", rawSourceCode: "NE" }),
      makeItem({ id: "rc1", canonicalKind: "CUSTOMER_RECEIPT", rawSourceCode: "R1" }),
    ];
    const r = classifySalesHistory(items, true, true, true, NOW);
    expect(r.reason).toContain("1 facturas");
    expect(r.reason).toContain("1 remisiones");
    expect(r.reason).toContain("1 NC");
    expect(r.reason).toContain("1 excluidos");
  });
});

// ── 2. resolveCanonicalDocumentKind ──────────────────────────────────────────

describe("resolveCanonicalDocumentKind — classification authority", () => {
  const { resolveCanonicalDocumentKind } = require("../../comercial/clientes/document-source-profiles");

  test("FE → SALES_INVOICE for castillitos", () => {
    const r = resolveCanonicalDocumentKind("castillitos", { documento: "FE-1234", tipoDocumento: "" });
    expect(r.kind).toBe("SALES_INVOICE");
  });

  test("F2 → SALES_REMISSION for castillitos", () => {
    const r = resolveCanonicalDocumentKind("castillitos", { documento: "F2-5678", tipoDocumento: "" });
    expect(r.kind).toBe("SALES_REMISSION");
  });

  test("NE → SALES_CREDIT_NOTE for castillitos", () => {
    const r = resolveCanonicalDocumentKind("castillitos", { documento: "NE-9999", tipoDocumento: "" });
    expect(r.kind).toBe("SALES_CREDIT_NOTE");
  });

  test("R1 → CUSTOMER_RECEIPT for castillitos", () => {
    const r = resolveCanonicalDocumentKind("castillitos", { documento: "R1-100", tipoDocumento: "" });
    expect(r.kind).toBe("CUSTOMER_RECEIPT");
  });

  test("AN → CUSTOMER_ADVANCE for castillitos", () => {
    const r = resolveCanonicalDocumentKind("castillitos", { documento: "AN-200", tipoDocumento: "" });
    expect(r.kind).toBe("CUSTOMER_ADVANCE");
  });

  test("unknown prefix → UNKNOWN_DOCUMENT", () => {
    const r = resolveCanonicalDocumentKind("castillitos", { documento: "ZZ-999", tipoDocumento: "" });
    expect(r.kind).toBe("UNKNOWN_DOCUMENT");
  });

  test("unknown profileId → UNKNOWN_DOCUMENT for all", () => {
    const r = resolveCanonicalDocumentKind("nonexistent", { documento: "FE-1234", tipoDocumento: "" });
    expect(r.kind).toBe("UNKNOWN_DOCUMENT");
  });

  test("ludisam profile: F7 → SALES_INVOICE, RE → SALES_REMISSION", () => {
    const f7 = resolveCanonicalDocumentKind("ludisam", { documento: "F7-001", tipoDocumento: "" });
    expect(f7.kind).toBe("SALES_INVOICE");
    const re = resolveCanonicalDocumentKind("ludisam", { documento: "RE-001", tipoDocumento: "" });
    expect(re.kind).toBe("SALES_REMISSION");
  });
});

// ── 3. getSalesProfileLabels ────────────────────────────────────────────────

describe("getSalesProfileLabels — profile-specific section labels", () => {
  const { getSalesProfileLabels } = require("../../comercial/clientes/document-source-profiles");

  test("castillitos → F1/F2 labels", () => {
    const labels = getSalesProfileLabels("castillitos");
    expect(labels.invoiceLabel).toContain("F1");
    expect(labels.remissionLabel).toContain("F2");
    expect(labels.profileName).toContain("Castillitos");
  });

  test("ludisam → F7/RE labels", () => {
    const labels = getSalesProfileLabels("ludisam");
    expect(labels.invoiceLabel).toContain("F7");
    expect(labels.remissionLabel).toContain("RE");
  });

  test("unknown profile → defaults", () => {
    const labels = getSalesProfileLabels("unknown");
    expect(labels.invoiceLabel).toBe("Facturación oficial");
    expect(labels.remissionLabel).toBe("Remisiones");
    expect(labels.profileName).toBe("Desconocido");
  });
});

// ── 4. Structural tests ────────────────────────────────────────────────────

describe("structural — UI wiring for F1/F2 separation", () => {
  const drawerSrc = readFile("app/(app)/[orgSlug]/comercial/clientes/clientes-client.tsx");
  const detail360Src = readFile("app/(app)/[orgSlug]/comercial/clientes/[clienteId]/cliente-360-client.tsx");

  test("drawer tab renamed from 'facturas' to 'ventas'", () => {
    expect(drawerSrc).toContain('"ventas"');
    expect(drawerSrc).not.toMatch(/key:\s*["']facturas["']/);
  });

  test("drawer tab label is VENTAS", () => {
    expect(drawerSrc).toContain('"VENTAS"');
  });

  test("drawer has TabVentas component", () => {
    expect(drawerSrc).toContain("TabVentas");
  });

  test("drawer badge uses salesHistory.officialInvoices + remissions", () => {
    expect(drawerSrc).toContain("salesHistory.officialInvoices.length");
    expect(drawerSrc).toContain("salesHistory.remissions.length");
  });

  test("drawer has SalesTable sub-component", () => {
    expect(drawerSrc).toContain("function SalesTable");
  });

  test("drawer KPI strip includes Remisiones", () => {
    expect(drawerSrc).toContain('label="Remisiones"');
  });

  test("drawer KPI strip includes Ultima venta", () => {
    expect(drawerSrc).toMatch(/label="[Úú]ltima venta"/i);
  });

  test("360 detail has SALES_GRID constant", () => {
    expect(detail360Src).toContain("SALES_GRID");
  });

  test("360 detail destructures salesHistory as sh", () => {
    expect(detail360Src).toContain("salesHistory: sh");
  });

  test("360 detail references data.salesProfileLabels", () => {
    expect(detail360Src).toContain("data.salesProfileLabels");
  });

  test("360 detail KPI strip has 'Facturas oficiales'", () => {
    expect(detail360Src).toContain("Facturas oficiales");
  });

  test("360 detail KPI strip has 'Remisiones'", () => {
    expect(detail360Src).toContain('"Remisiones"');
  });

  test("360 detail section title is 'Ventas'", () => {
    expect(detail360Src).toMatch(/title="Ventas"/);
  });

  test("no Cobro/cobro rows in sales sections", () => {
    // Ventas section should not reference "Cobro" as a row type
    // (collections belong in Cartera)
    const ventasSection = detail360Src.slice(detail360Src.indexOf('title="Ventas"'));
    expect(ventasSection).not.toMatch(/kindLabel.*Cobro/);
    expect(ventasSection).not.toMatch(/"Cobro"/);
  });

  test("loader imports classifySalesHistory from clientes-pure", () => {
    const loaderSrc = readFile("lib/comercial/clientes/cliente-360-loader.ts");
    expect(loaderSrc).toContain("classifySalesHistory");
  });

  test("loader imports resolveCanonicalDocumentKind from document-source-profiles", () => {
    const loaderSrc = readFile("lib/comercial/clientes/cliente-360-loader.ts");
    expect(loaderSrc).toContain("resolveCanonicalDocumentKind");
    expect(loaderSrc).toContain("document-source-profiles");
  });

  test("loader does NOT use sagSourceType for classification", () => {
    const loaderSrc = readFile("lib/comercial/clientes/cliente-360-loader.ts");
    // The sales classification section should use resolveCanonicalDocumentKind, not sagSourceType
    expect(loaderSrc).not.toMatch(/sagSourceType.*===.*["']factura["']/i);
  });

  test("Cliente360Data has salesHistory and salesProfileLabels fields", () => {
    const loaderSrc = readFile("lib/comercial/clientes/cliente-360-loader.ts");
    expect(loaderSrc).toContain("salesHistory: SalesHistoryResult");
    expect(loaderSrc).toContain("salesProfileLabels: SalesProfileLabels");
  });
});
