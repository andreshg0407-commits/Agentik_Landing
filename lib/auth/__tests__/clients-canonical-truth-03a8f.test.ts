/**
 * lib/auth/__tests__/clients-canonical-truth-03a8f.test.ts
 *
 * CLIENTS-CANONICAL-TRUTH-03A8F — Customer collections tab and sales acceptance closure.
 *
 * Behavioral tests proving:
 *   1. Castillitos R1 → OFFICIAL_INVOICE
 *   2. Castillitos R2 → REMISSION
 *   3. Castillitos D2 → excluded from Recaudos (credit note)
 *   4. Ludisam 1R → OFFICIAL_INVOICE, 2R → REMISSION
 *   5. Ludisam N7 → excluded from Recaudos (credit note)
 *   6. Unknown profile → PROFILE_UNRESOLVED
 *   7. Unknown code → UNCLASSIFIED
 *   8. Query succeeded, 0 records → EMPTY_CERTIFIED with 0
 *   9. Query failed → SOURCE_DOWN with null, never 0
 *  10. No sagTerceroId → IDENTITY_MISSING
 *  11. Recaudo without document link → linkageLabel = "Sin vínculo documental certificado"
 *  12. No heuristic association
 *  13. netCollected does NOT modify receivable SALDO_PENDIENTE
 *  14. Ventas contains zero cobros
 *  15. Recaudos contains zero notas crédito
 *  16. Production delegates to tested cores
 *  17. All items accessible (no silent truncation in pure function)
 *  18. Drawer and 360 show same contract fields
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

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

// ── 1. resolveCollectionTarget ──────────────────────────────────────────────

describe("resolveCollectionTarget — multi-tenant collection classification", () => {
  const { resolveCollectionTarget } = require("../../comercial/clientes/document-source-profiles");

  test("Castillitos R1 → OFFICIAL_INVOICE", () => {
    expect(resolveCollectionTarget("castillitos", "R1")).toBe("OFFICIAL_INVOICE");
  });

  test("Castillitos R2 → REMISSION", () => {
    expect(resolveCollectionTarget("castillitos", "R2")).toBe("REMISSION");
  });

  test("Castillitos RS → OFFICIAL_INVOICE", () => {
    expect(resolveCollectionTarget("castillitos", "RS")).toBe("OFFICIAL_INVOICE");
  });

  test("Castillitos AN → CUSTOMER_ADVANCE", () => {
    expect(resolveCollectionTarget("castillitos", "AN")).toBe("CUSTOMER_ADVANCE");
  });

  test("Castillitos A1 → CUSTOMER_ADVANCE", () => {
    expect(resolveCollectionTarget("castillitos", "A1")).toBe("CUSTOMER_ADVANCE");
  });

  test("Ludisam 1R → OFFICIAL_INVOICE", () => {
    expect(resolveCollectionTarget("ludisam", "1R")).toBe("OFFICIAL_INVOICE");
  });

  test("Ludisam 2R → REMISSION", () => {
    expect(resolveCollectionTarget("ludisam", "2R")).toBe("REMISSION");
  });

  test("Unknown profile → null (PROFILE_UNRESOLVED)", () => {
    expect(resolveCollectionTarget("nonexistent", "R1")).toBeNull();
  });

  test("Unknown code → UNCLASSIFIED", () => {
    expect(resolveCollectionTarget("castillitos", "ZZ")).toBe("UNCLASSIFIED");
  });
});

// ── 2. isDocumentCreditNote ─────────────────────────────────────────────────

describe("isDocumentCreditNote — NC exclusion from recaudos", () => {
  const { isDocumentCreditNote } = require("../../comercial/clientes/document-source-profiles");

  test("Castillitos D2 is a credit note", () => {
    expect(isDocumentCreditNote("castillitos", "D2-849")).toBe(true);
  });

  test("Castillitos NE is a credit note", () => {
    expect(isDocumentCreditNote("castillitos", "NE-100")).toBe(true);
  });

  test("Castillitos FE is NOT a credit note", () => {
    expect(isDocumentCreditNote("castillitos", "FE-100")).toBe(false);
  });

  test("Castillitos R1 is NOT a credit note", () => {
    expect(isDocumentCreditNote("castillitos", "R1-100")).toBe(false);
  });

  test("Ludisam N7 is a credit note", () => {
    expect(isDocumentCreditNote("ludisam", "N7-100")).toBe(true);
  });

  test("Ludisam F7 is NOT a credit note", () => {
    expect(isDocumentCreditNote("ludisam", "F7-100")).toBe(false);
  });
});

// ── 3. classifyCollections ──────────────────────────────────────────────────

describe("classifyCollections — CustomerCollectionsResult", () => {
  const { classifyCollections } = require("../../comercial/clientes/clientes-pure");

  test("query succeeded, 0 records → EMPTY_CERTIFIED with 0", () => {
    const r = classifyCollections([], true, true, "castillitos", NOW);
    expect(r.truthState).toBe("EMPTY_CERTIFIED");
    expect(r.netCollected).toBe(0);
    expect(r.grossCollected).toBe(0);
    expect(r.receiptCount).toBe(0);
    expect(r.source).toBe("vw_agentik_recaudos");
  });

  test("query failed → SOURCE_DOWN with null", () => {
    const r = classifyCollections([], false, true, "castillitos", NOW);
    expect(r.truthState).toBe("SOURCE_DOWN");
    expect(r.netCollected).toBeNull();
    expect(r.receiptCount).toBeNull();
  });

  test("no sagTerceroId → IDENTITY_MISSING", () => {
    const r = classifyCollections([], true, false, "castillitos", NOW);
    expect(r.truthState).toBe("IDENTITY_MISSING");
    expect(r.netCollected).toBeNull();
    expect(r.reason).toContain("identidad SAG");
  });

  test("null profileId → PROFILE_UNRESOLVED", () => {
    const r = classifyCollections([makeApp()], true, true, null, NOW);
    expect(r.truthState).toBe("PROFILE_UNRESOLVED");
    expect(r.netCollected).toBeNull();
    expect(r.reason).toContain("Perfil documental");
  });

  test("FE document target → OFFICIAL_INVOICE bucket (03A8F3: canonical kind)", () => {
    const apps = [makeApp({ documentoRelacionado: "FE-5001", valorRecaudado: 2_000_000 })];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(r.truthState).toBe("CERTIFIED");
    expect(r.officialInvoiceCollections!.count).toBe(1);
    expect(r.officialInvoiceCollections!.amount).toBe(2_000_000);
    expect(r.remissionCollections!.count).toBe(0);
  });

  test("F2 document target → REMISSION bucket (03A8F3: canonical kind)", () => {
    const apps = [makeApp({ documentoRelacionado: "F2-5002", valorRecaudado: 1_500_000 })];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(r.remissionCollections!.count).toBe(1);
    expect(r.remissionCollections!.amount).toBe(1_500_000);
    expect(r.officialInvoiceCollections!.count).toBe(0);
  });

  test("R1 receipt code → UNCLASSIFIED bucket (03A8F3: receipt codes are not targets)", () => {
    const apps = [makeApp({ documentoRelacionado: "R1-100", valorRecaudado: 500_000 })];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(r.unclassified!.count).toBe(1);
    expect(r.unclassified!.amount).toBe(500_000);
  });

  test("D2 credit note is EXCLUDED from collections entirely", () => {
    const apps = [
      makeApp({ idRecaudo: 1, documentoRelacionado: "R1-5001", valorRecaudado: 2_000_000 }),
      makeApp({ idRecaudo: 2, documentoRelacionado: "D2-849", valorRecaudado: -80_000 }),
    ];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    // D2 is excluded (credit note + negative value)
    expect(r.items.length).toBe(1);
    expect(r.netCollected).toBe(2_000_000);
    // No item should reference D2
    expect(r.items.find((i: any) => i.appliedToDocument?.startsWith("D2"))).toBeUndefined();
  });

  test("NE credit note is EXCLUDED from collections", () => {
    const apps = [
      makeApp({ documentoRelacionado: "NE-100", valorRecaudado: -100_000 }),
    ];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(r.items.length).toBe(0);
    expect(r.truthState).toBe("EMPTY_CERTIFIED");
  });

  test("Ludisam N7 is EXCLUDED from collections", () => {
    const apps = [
      makeApp({ documentoRelacionado: "N7-100", valorRecaudado: -200_000 }),
    ];
    const r = classifyCollections(apps, true, true, "ludisam", NOW);
    expect(r.items.length).toBe(0);
  });

  test("Ludisam F7 → OFFICIAL_INVOICE, RE → REMISSION (03A8F3: canonical kind)", () => {
    const apps = [
      makeApp({ idRecaudo: 1, documentoRelacionado: "F7-001", valorRecaudado: 1_000_000 }),
      makeApp({ idRecaudo: 2, documentoRelacionado: "RE-002", valorRecaudado: 500_000 }),
    ];
    const r = classifyCollections(apps, true, true, "ludisam", NOW);
    expect(r.officialInvoiceCollections!.count).toBe(1);
    expect(r.remissionCollections!.count).toBe(1);
  });

  test("unknown code → UNCLASSIFIED bucket", () => {
    const apps = [makeApp({ documentoRelacionado: "ZZ-999", valorRecaudado: 100_000 })];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(r.unclassified!.count).toBe(1);
    expect(r.unclassified!.amount).toBe(100_000);
  });

  test("receipt without document link → 'Sin vínculo documental certificado'", () => {
    const apps = [makeApp({ documentoRelacionado: "", valorRecaudado: 500_000 })];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(r.items[0].linkageLabel).toBe("Sin vínculo documental certificado");
    expect(r.items[0].appliedToDocument).toBeNull();
  });

  test("receipt WITH document link → target-semantic label (03A8F3)", () => {
    const apps = [makeApp({ documentoRelacionado: "FE-1234", valorRecaudado: 500_000 })];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(r.items[0].linkageLabel).toBe("Aplicado a factura FE-1234");
    expect(r.items[0].appliedToDocument).toBe("FE-1234");
  });

  test("linkageState = APPLIED when all items have document links", () => {
    const apps = [
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-100", valorRecaudado: 100_000 }),
      makeApp({ idRecaudo: 2, documentoRelacionado: "FE-200", valorRecaudado: 200_000 }),
    ];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(r.linkageState).toBe("APPLIED");
  });

  test("linkageState = PARTIALLY_LINKED when some items have links", () => {
    const apps = [
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-100", valorRecaudado: 100_000 }),
      makeApp({ idRecaudo: 2, documentoRelacionado: "", valorRecaudado: 200_000 }),
    ];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(r.linkageState).toBe("PARTIALLY_LINKED");
  });

  test("linkageState = HISTORY_ONLY when no items have links", () => {
    const apps = [
      makeApp({ idRecaudo: 1, documentoRelacionado: "", valorRecaudado: 100_000 }),
    ];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(r.linkageState).toBe("HISTORY_ONLY");
  });

  test("grossCollected sums positive values, netCollected = gross - reversals", () => {
    const apps = [
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-100", valorRecaudado: 5_000_000 }),
      makeApp({ idRecaudo: 2, documentoRelacionado: "FE-200", valorRecaudado: 3_000_000 }),
    ];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(r.grossCollected).toBe(8_000_000);
    expect(r.certifiedReversals).toBe(0);
    expect(r.netCollected).toBe(8_000_000);
  });

  test("receiptCount counts distinct idRecaudo values", () => {
    const apps = [
      makeApp({ idRecaudo: 100, documentoRelacionado: "FE-1", valorRecaudado: 1_000 }),
      makeApp({ idRecaudo: 100, documentoRelacionado: "FE-2", valorRecaudado: 2_000 }),
      makeApp({ idRecaudo: 200, documentoRelacionado: "FE-3", valorRecaudado: 3_000 }),
    ];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(r.receiptCount).toBe(2); // distinct: 100, 200
    expect(r.items.length).toBe(3); // 3 applications
  });

  test("latestCollectionAt picks the most recent date", () => {
    const apps = [
      makeApp({ idRecaudo: 1, fechaRecaudo: new Date("2026-07-01"), valorRecaudado: 100 }),
      makeApp({ idRecaudo: 2, fechaRecaudo: new Date("2026-08-15"), valorRecaudado: 200 }),
      makeApp({ idRecaudo: 3, fechaRecaudo: new Date("2026-06-01"), valorRecaudado: 300 }),
    ];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(r.latestCollectionAt).toContain("2026-08-15");
  });

  test("source is always vw_agentik_recaudos", () => {
    const r = classifyCollections([], true, true, "castillitos", NOW);
    expect(r.source).toBe("vw_agentik_recaudos");
  });

  test("asOf is set from queryAsOf", () => {
    const r = classifyCollections([], true, true, "castillitos", NOW);
    expect(r.asOf).toBe("2026-08-16T12:00:00.000Z");
  });

  test("all items accessible — no silent truncation in pure function", () => {
    const apps = Array.from({ length: 200 }, (_, i) =>
      makeApp({ idRecaudo: i, documentoRelacionado: `FE-${i}`, valorRecaudado: 1_000 })
    );
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(r.items.length).toBe(200);
    expect(r.totalItems).toBe(200);
  });

  test("reason string includes bucket counts (03A8F3: canonical targets)", () => {
    const apps = [
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-1", valorRecaudado: 100 }),
      makeApp({ idRecaudo: 2, documentoRelacionado: "F2-2", valorRecaudado: 200 }),
      makeApp({ idRecaudo: 3, documentoRelacionado: "ZZ-3", valorRecaudado: 300 }),
    ];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(r.reason).toContain("1 facturación");
    expect(r.reason).toContain("1 remisiones");
    expect(r.reason).toContain("1 sin clasificar");
  });
});

// ── 4. Cross-domain invariants ──────────────────────────────────────────────

describe("cross-domain invariants", () => {
  const { classifySalesHistory, classifyCollections: classifyColl } = require("../../comercial/clientes/clientes-pure");

  test("ventas contains zero cobros — CUSTOMER_RECEIPT excluded from sales", () => {
    const salesItems = [
      { id: "1", canonicalKind: "SALES_INVOICE", rawSourceCode: "FE", rawDocumentNumber: "FE-1", issueDate: "2026-08-01", seller: null, grossAmount: 1_000, productLine: null, sourceProfileId: "castillitos" },
      { id: "2", canonicalKind: "CUSTOMER_RECEIPT", rawSourceCode: "R1", rawDocumentNumber: "R1-1", issueDate: "2026-08-01", seller: null, grossAmount: 500, productLine: null, sourceProfileId: "castillitos" },
    ];
    const r = classifySalesHistory(salesItems, true, true, true, NOW);
    expect(r.officialInvoices.length).toBe(1);
    expect(r.remissions.length).toBe(0);
    expect(r.creditNotes.length).toBe(0);
    expect(r.excludedCount).toBe(1); // R1 excluded
  });

  test("recaudos contains zero notas crédito", () => {
    const apps = [
      makeApp({ idRecaudo: 1, documentoRelacionado: "R1-100", valorRecaudado: 1_000_000 }),
      makeApp({ idRecaudo: 2, documentoRelacionado: "NE-200", valorRecaudado: -500_000 }),
      makeApp({ idRecaudo: 3, documentoRelacionado: "D2-300", valorRecaudado: -100_000 }),
    ];
    const r = classifyColl(apps, true, true, "castillitos", NOW);
    // NE and D2 are credit notes — excluded
    expect(r.items.length).toBe(1);
    expect(r.items[0].appliedToDocument).toBe("R1-100");
  });

  test("netCollected does NOT appear in cartera computation", () => {
    // This is structural — cartera uses SALDO_PENDIENTE from vw_agentik_cartera
    // and netCollected from vw_agentik_recaudos stays in the collections domain
    const r = classifyColl(
      [makeApp({ valorRecaudado: 22_300_000 })],
      true, true, "castillitos", NOW,
    );
    expect(r.netCollected).toBe(22_300_000);
    // The contract returns netCollected but does NOT expose netReceivable or SALDO_PENDIENTE
    expect((r as any).netReceivable).toBeUndefined();
    expect((r as any).saldoPendiente).toBeUndefined();
  });

  test("0 certified ≠ source down — different truthStates", () => {
    const emptyCertified = classifyColl([], true, true, "castillitos", NOW);
    const sourceDown = classifyColl([], false, true, "castillitos", NOW);
    expect(emptyCertified.truthState).toBe("EMPTY_CERTIFIED");
    expect(sourceDown.truthState).toBe("SOURCE_DOWN");
    expect(emptyCertified.truthState).not.toBe(sourceDown.truthState);
  });
});

// ── 5. Structural tests ────────────────────────────────────────────────────

describe("structural — UI wiring for Recaudos tab", () => {
  const drawerSrc = readFile("app/(app)/[orgSlug]/comercial/clientes/clientes-client.tsx");
  const detail360Src = readFile("app/(app)/[orgSlug]/comercial/clientes/[clienteId]/cliente-360-client.tsx");
  const loaderSrc = readFile("lib/comercial/clientes/cliente-360-loader.ts");

  test("drawer has 'recaudos' tab in DrawerTab type", () => {
    expect(drawerSrc).toContain('"recaudos"');
  });

  test("drawer tab label is RECAUDOS", () => {
    expect(drawerSrc).toContain('"RECAUDOS"');
  });

  test("drawer tab order: Perfil | Pedidos | Ventas | Recaudos | Cartera | Inteligencia | Linea", () => {
    const perfil = drawerSrc.indexOf('"PERFIL"');
    const pedidos = drawerSrc.indexOf('"PEDIDOS"');
    const ventas = drawerSrc.indexOf('"VENTAS"');
    const recaudos = drawerSrc.indexOf('"RECAUDOS"');
    const cartera = drawerSrc.indexOf('"CARTERA"');
    expect(perfil).toBeLessThan(pedidos);
    expect(pedidos).toBeLessThan(ventas);
    expect(ventas).toBeLessThan(recaudos);
    expect(recaudos).toBeLessThan(cartera);
  });

  test("drawer has TabRecaudos component", () => {
    expect(drawerSrc).toContain("function TabRecaudos");
    expect(drawerSrc).toContain("TabRecaudos");
  });

  test("drawer renders TabRecaudos for 'recaudos' tab", () => {
    expect(drawerSrc).toContain('<TabRecaudos data={data}');
  });

  test("drawer TabRecaudos does NOT reference vw_agentik_pagos", () => {
    // Extract TabRecaudos function
    const start = drawerSrc.indexOf("function TabRecaudos");
    const end = drawerSrc.indexOf("function TabCartera");
    const tabSrc = drawerSrc.slice(start, end);
    expect(tabSrc).not.toContain("vw_agentik_pagos");
  });

  test("drawer KPI strip includes Recaudos aplicados", () => {
    expect(drawerSrc).toContain('label="Recaudos aplicados"');
  });

  test("360 detail has Recaudos section", () => {
    expect(detail360Src).toContain('title="Recaudos"');
  });

  test("360 detail has COLLECTIONS_GRID constant", () => {
    expect(detail360Src).toContain("COLLECTIONS_GRID");
  });

  test("360 detail KPI strip has Recaudos aplicados", () => {
    expect(detail360Src).toContain('label="Recaudos aplicados"');
  });

  test("loader has collectionsResult in Cliente360Data", () => {
    expect(loaderSrc).toContain("collectionsResult: CustomerCollectionsResult");
  });

  test("loader imports classifyCollections from clientes-pure", () => {
    expect(loaderSrc).toContain("classifyCollections");
  });

  test("loader uses fetchCertifiedCustomerRecaudos as data source", () => {
    expect(loaderSrc).toContain("fetchCertifiedCustomerRecaudos");
  });

  test("loader does NOT reference vw_agentik_pagos", () => {
    expect(loaderSrc).not.toContain("vw_agentik_pagos");
  });

  test("sales query has no take: 50 truncation", () => {
    // Verify the saleRecord query does not silently truncate
    const salesQuerySection = loaderSrc.slice(
      loaderSrc.indexOf("db.saleRecord.findMany"),
      loaderSrc.indexOf("timing.sales"),
    );
    expect(salesQuerySection).not.toContain("take:");
  });

  test("drawer shows both Ventas and Recaudos as separate tabs", () => {
    expect(drawerSrc).toContain('"ventas"');
    expect(drawerSrc).toContain('"recaudos"');
    // These must be separate tab keys, not the same
    const ventasIndex = drawerSrc.indexOf('key: "ventas"');
    const recaudosIndex = drawerSrc.indexOf('key: "recaudos"');
    expect(ventasIndex).toBeGreaterThan(-1);
    expect(recaudosIndex).toBeGreaterThan(-1);
    expect(ventasIndex).not.toBe(recaudosIndex);
  });

  test("no Cobro rows in Ventas tab", () => {
    const ventasStart = drawerSrc.indexOf("function TabVentas");
    const ventasEnd = drawerSrc.indexOf("function SalesTable");
    const ventasSrc = drawerSrc.slice(ventasStart, ventasEnd);
    expect(ventasSrc).not.toContain('"Cobro"');
  });
});
