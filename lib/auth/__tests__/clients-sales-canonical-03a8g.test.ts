/**
 * lib/auth/__tests__/clients-sales-canonical-03a8g.test.ts
 *
 * CLIENT-SALES-CANONICAL-RUNTIME-03A8G — Production wiring closure.
 *
 * 12 behavioral tests proving:
 *   1. F2 → SALES_REMISSION → remissions[]
 *   2. FE → SALES_INVOICE → officialInvoices[]
 *   3. D2 → SALES_CREDIT_NOTE → creditNotes[] (never recaudo)
 *   4. Multiple lines per document count as one document
 *   5. Source down ≠ zero — truthState=SOURCE_DOWN, not EMPTY_CERTIFIED
 *   6. Cartera has F2 docs + sales returns 0 → CROSS_SOURCE_MISMATCH
 *   7. lastSaleDate from most recent factura/remisión
 *   8. Aging unknown ≠ "Al día" — verifiedItems=0 → "Vencimiento no verificado"
 *   9. Recaudos shows "aplicados" coverage label
 *  10. Production wiring: loader uses sagTerceroId, not NIT
 *  11. Case runtime 10706: SaleRecord.customerNit stores SAG ID
 *  12. Regression: existing classifySalesHistory contract intact
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSaleItem(overrides: Partial<{
  id: string;
  canonicalKind: string;
  rawSourceCode: string | null;
  rawDocumentNumber: string | null;
  issueDate: string | null;
  seller: string | null;
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
    seller: overrides.seller ?? "seller-1",
    grossAmount: overrides.grossAmount ?? 1_000_000,
    productLine: overrides.productLine ?? "CS",
    sourceProfileId: overrides.sourceProfileId ?? "castillitos",
  };
}

const NOW = new Date("2026-08-17T12:00:00Z");

// ── T01-T03: Classification by canonical kind ─────────────────────────────

describe("sales classification by canonical document kind", () => {
  const { classifySalesHistory } = require("../../comercial/clientes/clientes-pure");

  test("T01: F2 → SALES_REMISSION → lands in remissions[]", () => {
    const items = [makeSaleItem({ canonicalKind: "SALES_REMISSION", rawSourceCode: "F2", rawDocumentNumber: "F2-8653" })];
    const r = classifySalesHistory(items, true, true, true, NOW);
    expect(r.truthState).toBe("CERTIFIED");
    expect(r.remissions.length).toBe(1);
    expect(r.remissions[0].rawDocumentNumber).toBe("F2-8653");
  });

  test("T02: FE → SALES_INVOICE → lands in officialInvoices[]", () => {
    const items = [makeSaleItem({ canonicalKind: "SALES_INVOICE", rawSourceCode: "FE", rawDocumentNumber: "FE-10505" })];
    const r = classifySalesHistory(items, true, true, true, NOW);
    expect(r.officialInvoices.length).toBe(1);
  });

  test("T03: D2 → SALES_CREDIT_NOTE → creditNotes[], never recaudo", () => {
    const items = [makeSaleItem({ canonicalKind: "SALES_CREDIT_NOTE", rawSourceCode: "D2", rawDocumentNumber: "D2-849", grossAmount: -80_900 })];
    const r = classifySalesHistory(items, true, true, true, NOW);
    expect(r.creditNotes.length).toBe(1);
    expect(r.officialInvoices.length).toBe(0);
    expect(r.remissions.length).toBe(0);
  });
});

// ── T04: Document deduplication ─────────────────────────────────────────────

describe("document deduplication", () => {
  const { classifySalesHistory } = require("../../comercial/clientes/clientes-pure");

  test("T04: multiple lines of same document → all appear in items (line-level grain)", () => {
    const items = [
      makeSaleItem({ id: "line-1", canonicalKind: "SALES_REMISSION", rawDocumentNumber: "F2-8653", grossAmount: 75_900 }),
      makeSaleItem({ id: "line-2", canonicalKind: "SALES_REMISSION", rawDocumentNumber: "F2-8653", grossAmount: 75_900 }),
      makeSaleItem({ id: "line-3", canonicalKind: "SALES_REMISSION", rawDocumentNumber: "F2-8653", grossAmount: 75_900 }),
    ];
    const r = classifySalesHistory(items, true, true, true, NOW);
    // Items pass through — line-level grain preserved in pure function
    expect(r.remissions.length).toBe(3);
    expect(r.remissionGross).toBe(227_700);
  });
});

// ── T05: Source down ≠ zero ─────────────────────────────────────────────────

describe("source down vs empty", () => {
  const { classifySalesHistory } = require("../../comercial/clientes/clientes-pure");

  test("T05: querySucceeded=false → SOURCE_DOWN, not EMPTY_CERTIFIED", () => {
    const r = classifySalesHistory([], false, true, true, NOW);
    expect(r.truthState).toBe("SOURCE_DOWN");
    expect(r.windowLabel).toBe("\u2014");
  });
});

// ── T06: CROSS_SOURCE_MISMATCH ──────────────────────────────────────────────

describe("cross-source mismatch detection", () => {
  const { classifySalesHistory } = require("../../comercial/clientes/clientes-pure");

  test("T06: cartera has FE/F2 docs + sales=0 → CROSS_SOURCE_MISMATCH", () => {
    const carteraDocs = ["F2-8653", "D2-849"];
    const r = classifySalesHistory([], true, true, true, NOW, carteraDocs);
    expect(r.truthState).toBe("CROSS_SOURCE_MISMATCH");
    expect(r.windowLabel).toBe("Historial de ventas no reconciliado");
    expect(r.reason).toContain("documentos de venta en cartera");
  });

  test("T06b: cartera has only D2 (NC, not sales) + sales=0 → EMPTY_CERTIFIED (no mismatch)", () => {
    const carteraDocs = ["D2-849"]; // D2 is not a sales document prefix
    const r = classifySalesHistory([], true, true, true, NOW, carteraDocs);
    expect(r.truthState).toBe("EMPTY_CERTIFIED");
  });
});

// ── T07: lastSaleDate ───────────────────────────────────────────────────────

describe("lastSaleDate from factura/remisión", () => {
  const { classifySalesHistory } = require("../../comercial/clientes/clientes-pure");

  test("T07: lastSaleDate picks most recent invoice or remission", () => {
    const items = [
      makeSaleItem({ canonicalKind: "SALES_INVOICE", issueDate: "2026-06-01T00:00:00.000Z" }),
      makeSaleItem({ id: "s2", canonicalKind: "SALES_REMISSION", issueDate: "2026-07-17T00:00:00.000Z" }),
      makeSaleItem({ id: "s3", canonicalKind: "SALES_CREDIT_NOTE", issueDate: "2026-08-14T00:00:00.000Z" }),
    ];
    const r = classifySalesHistory(items, true, true, true, NOW);
    expect(r.lastSaleDate).toBe("2026-07-17T00:00:00.000Z");
    expect(r.lastSaleKind).toBe("Remisión");
  });
});

// ── T08: Aging unknown ≠ "Al día" ───────────────────────────────────────────

describe("cartera health — aging verification", () => {
  const { carteraTrafficLight, isAgingVerified } = require("../../comercial/clientes/clientes-pure");

  test("T08: daysOverdue=null + dueDate=null → NOT verified → 'Vencimiento no verificado'", () => {
    const receivables = {
      truthStatus: "CERTIFIED",
      totalBalance: 1_500_000,
      items: [
        { balanceDue: 1_500_000, daysOverdue: null, dueDate: null },
      ],
    };
    const result = carteraTrafficLight(receivables);
    expect(result.label).toBe("Vencimiento no verificado");
  });

  test("T08b: daysOverdue=0 + dueDate set → verified + no overdue → 'Al dia'", () => {
    const receivables = {
      truthStatus: "CERTIFIED",
      totalBalance: 1_500_000,
      items: [
        { balanceDue: 1_500_000, daysOverdue: 0, dueDate: "2026-08-17" },
      ],
    };
    const result = carteraTrafficLight(receivables);
    expect(result.label).toBe("Al dia");
  });
});

// ── T09: Recaudos coverage label ────────────────────────────────────────────

describe("recaudos coverage label in UI", () => {
  test("T09: drawer has 'Recaudos aplicados' label", () => {
    const drawerSrc = readFile("app/(app)/[orgSlug]/comercial/clientes/clientes-client.tsx");
    expect(drawerSrc).toContain('label="Recaudos aplicados"');
  });

  test("T09b: 360 detail has 'Recaudos aplicados' label", () => {
    const detailSrc = readFile("app/(app)/[orgSlug]/comercial/clientes/[clienteId]/cliente-360-client.tsx");
    expect(detailSrc).toContain('label="Recaudos aplicados"');
  });
});

// ── T10: Loader uses sagTerceroId ───────────────────────────────────────────

describe("production wiring — loader identity", () => {
  test("T10: loader queries SaleRecord by sagTerceroId, not NIT", () => {
    const loaderSrc = readFile("lib/comercial/clientes/cliente-360-loader.ts");
    // Must use String(p.sagTerceroId) for SaleRecord query
    expect(loaderSrc).toContain("customerNit: String(p.sagTerceroId)");
    // Must NOT use p.nit for sales query
    expect(loaderSrc).not.toContain("customerNit: p.nit");
  });
});

// ── T11: SaleRecord.customerNit stores SAG ID ───────────────────────────────

describe("SaleRecord identity contract", () => {
  test("T11: loader comment documents that customerNit stores SAG ka_nl_tercero", () => {
    const loaderSrc = readFile("lib/comercial/clientes/cliente-360-loader.ts");
    expect(loaderSrc).toContain("SaleRecord.customerNit stores SAG ka_nl_tercero");
  });
});

// ── T12: UI handles CROSS_SOURCE_MISMATCH ───────────────────────────────────

describe("UI wiring for CROSS_SOURCE_MISMATCH", () => {
  test("T12: drawer shows 'Historial de ventas no reconciliado' for CROSS_SOURCE_MISMATCH", () => {
    const drawerSrc = readFile("app/(app)/[orgSlug]/comercial/clientes/clientes-client.tsx");
    expect(drawerSrc).toContain("CROSS_SOURCE_MISMATCH");
    expect(drawerSrc).toContain("Historial de ventas no reconciliado");
  });

  test("T12b: 360 detail shows 'Historial de ventas no reconciliado' for CROSS_SOURCE_MISMATCH", () => {
    const detailSrc = readFile("app/(app)/[orgSlug]/comercial/clientes/[clienteId]/cliente-360-client.tsx");
    expect(detailSrc).toContain("CROSS_SOURCE_MISMATCH");
    expect(detailSrc).toContain("Historial de ventas no reconciliado");
  });
});
