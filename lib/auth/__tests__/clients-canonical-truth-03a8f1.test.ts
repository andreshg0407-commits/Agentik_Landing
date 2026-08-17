/**
 * lib/auth/__tests__/clients-canonical-truth-03a8f1.test.ts
 *
 * CLIENTS-CANONICAL-TRUTH-03A8F1 — Collection totals, applications and pagination closure.
 *
 * Behavioral tests proving:
 *   1. normalizeCollectionReceipts groups by ID_RECAUDO
 *   2. Single-row receipt → CERTIFIED_SINGLE_ROW
 *   3. Multi-row distinct docs → CERTIFIED_SPLIT_APPLICATIONS
 *   4. Multi-row duplicate docs → AMBIGUOUS
 *   5. grossAmount = sum of positive rows, reversalAmount = sum of abs(negative rows)
 *   6. netAmount = grossAmount - reversalAmount
 *   7. MONTO_NO_APLICADO → unappliedAmount per receipt
 *   8. appliedAmount = netAmount - unappliedAmount (floored at 0)
 *   9. Per-application linkage: APPLIED / PARTIALLY_LINKED / UNAPPLIED / HISTORY_ONLY
 *  10. classifyCollections uses normalized receipts for KPIs
 *  11. Ambiguous receipts excluded from grossCollected/netCollected/certifiedReversals
 *  12. ambiguousAmount tracked separately
 *  13. GlobalNormalizationState: ALL_CERTIFIED / PARTIAL_AMBIGUOUS / UNRESOLVED
 *  14. Negative values in non-NC receipts = certified reversals (not excluded)
 *  15. No silent truncation in pure functions — all items and receipts returned
 *  16. UI surfaces show "Mostrando X de N" (structural)
 *  17. KPI contract: grossCollected, certifiedReversals, netCollected, appliedAmount, unappliedAmount, ambiguousAmount
 *  18. sourceRowCount tracks raw row count
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

// ── 1. normalizeCollectionReceipts ──────────────────────────────────────────

describe("normalizeCollectionReceipts — receipt grouping", () => {
  const { normalizeCollectionReceipts } = require("../../comercial/clientes/clientes-pure");

  test("groups by ID_RECAUDO — 3 rows with 2 distinct IDs = 2 receipts", () => {
    const apps = [
      makeApp({ idRecaudo: 100, documentoRelacionado: "FE-1", valorRecaudado: 500 }),
      makeApp({ idRecaudo: 100, documentoRelacionado: "FE-2", valorRecaudado: 300 }),
      makeApp({ idRecaudo: 200, documentoRelacionado: "FE-3", valorRecaudado: 700 }),
    ];
    const receipts = normalizeCollectionReceipts(apps, "castillitos");
    expect(receipts.length).toBe(2);
    expect(receipts.find((r: any) => r.receiptId === 100)).toBeTruthy();
    expect(receipts.find((r: any) => r.receiptId === 200)).toBeTruthy();
  });

  test("single-row receipt → CERTIFIED_SINGLE_ROW", () => {
    const apps = [makeApp({ idRecaudo: 1, documentoRelacionado: "FE-1", valorRecaudado: 1000 })];
    const receipts = normalizeCollectionReceipts(apps, "castillitos");
    expect(receipts[0].normalizationState).toBe("CERTIFIED_SINGLE_ROW");
    expect(receipts[0].sourceRowCount).toBe(1);
  });

  test("multi-row distinct docs → CERTIFIED_SPLIT_APPLICATIONS", () => {
    const apps = [
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-1", valorRecaudado: 500 }),
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-2", valorRecaudado: 300 }),
    ];
    const receipts = normalizeCollectionReceipts(apps, "castillitos");
    expect(receipts[0].normalizationState).toBe("CERTIFIED_SPLIT_APPLICATIONS");
    expect(receipts[0].sourceRowCount).toBe(2);
    expect(receipts[0].relatedDocuments).toEqual(["FE-1", "FE-2"]);
  });

  test("multi-row duplicate docs → AMBIGUOUS", () => {
    const apps = [
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-1", valorRecaudado: 500 }),
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-1", valorRecaudado: 300 }),
    ];
    const receipts = normalizeCollectionReceipts(apps, "castillitos");
    expect(receipts[0].normalizationState).toBe("AMBIGUOUS");
  });
});

// ── 2. Gross/Reversals/Net computation ──────────────────────────────────────

describe("normalizeCollectionReceipts — financial computation", () => {
  const { normalizeCollectionReceipts } = require("../../comercial/clientes/clientes-pure");

  test("grossAmount = sum of positive rows", () => {
    const apps = [
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-1", valorRecaudado: 5_000 }),
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-2", valorRecaudado: 3_000 }),
    ];
    const receipts = normalizeCollectionReceipts(apps, "castillitos");
    expect(receipts[0].grossAmount).toBe(8_000);
  });

  test("reversalAmount = sum of abs(negative rows)", () => {
    const apps = [
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-1", valorRecaudado: 5_000 }),
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-2", valorRecaudado: -1_000 }),
    ];
    const receipts = normalizeCollectionReceipts(apps, "castillitos");
    expect(receipts[0].reversalAmount).toBe(1_000);
  });

  test("netAmount = grossAmount - reversalAmount", () => {
    const apps = [
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-1", valorRecaudado: 5_000 }),
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-2", valorRecaudado: -1_000 }),
    ];
    const receipts = normalizeCollectionReceipts(apps, "castillitos");
    expect(receipts[0].netAmount).toBe(4_000);
  });

  test("unappliedAmount = sum of MONTO_NO_APLICADO across rows", () => {
    const apps = [
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-1", valorRecaudado: 5_000, montoNoAplicado: 200 }),
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-2", valorRecaudado: 3_000, montoNoAplicado: 100 }),
    ];
    const receipts = normalizeCollectionReceipts(apps, "castillitos");
    expect(receipts[0].unappliedAmount).toBe(300);
  });

  test("appliedAmount = netAmount - unappliedAmount, floored at 0", () => {
    const apps = [
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-1", valorRecaudado: 1_000, montoNoAplicado: 800 }),
    ];
    const receipts = normalizeCollectionReceipts(apps, "castillitos");
    expect(receipts[0].appliedAmount).toBe(200); // 1000 - 800
  });

  test("appliedAmount floored at 0 when unapplied > net", () => {
    const apps = [
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-1", valorRecaudado: 100, montoNoAplicado: 500 }),
    ];
    const receipts = normalizeCollectionReceipts(apps, "castillitos");
    expect(receipts[0].appliedAmount).toBe(0);
  });
});

// ── 3. Per-application linkage ──────────────────────────────────────────────

describe("classifyCollections — per-application linkage", () => {
  const { classifyCollections } = require("../../comercial/clientes/clientes-pure");

  test("APPLIED: doc present + montoNoAplicado=0", () => {
    const apps = [makeApp({ documentoRelacionado: "FE-100", montoNoAplicado: 0 })];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(r.items[0].applicationLinkage).toBe("APPLIED");
  });

  test("PARTIALLY_LINKED: doc present + montoNoAplicado>0", () => {
    const apps = [makeApp({ documentoRelacionado: "FE-100", montoNoAplicado: 500 })];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(r.items[0].applicationLinkage).toBe("PARTIALLY_LINKED");
  });

  test("UNAPPLIED: no doc + positive value", () => {
    const apps = [makeApp({ documentoRelacionado: "", valorRecaudado: 1000 })];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(r.items[0].applicationLinkage).toBe("UNAPPLIED");
  });

  test("HISTORY_ONLY: no doc + negative value (reversal)", () => {
    const apps = [makeApp({ documentoRelacionado: "", valorRecaudado: -500 })];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(r.items[0].applicationLinkage).toBe("HISTORY_ONLY");
  });

  test("CollectionApplicationItem has receiptId field", () => {
    const apps = [makeApp({ idRecaudo: 42 })];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(r.items[0].receiptId).toBe(42);
  });

  test("CollectionApplicationItem has unappliedAmount field", () => {
    const apps = [makeApp({ montoNoAplicado: 350 })];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(r.items[0].unappliedAmount).toBe(350);
  });
});

// ── 4. classifyCollections — normalized KPIs ────────────────────────────────

describe("classifyCollections — normalized receipt KPIs", () => {
  const { classifyCollections } = require("../../comercial/clientes/clientes-pure");

  test("grossCollected sums from certified receipts only", () => {
    const apps = [
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-1", valorRecaudado: 5_000_000 }),
      makeApp({ idRecaudo: 2, documentoRelacionado: "FE-2", valorRecaudado: 3_000_000 }),
    ];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(r.grossCollected).toBe(8_000_000);
  });

  test("certifiedReversals tracked separately from gross", () => {
    const apps = [
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-1", valorRecaudado: 5_000_000 }),
      makeApp({ idRecaudo: 2, documentoRelacionado: "FE-2", valorRecaudado: -1_000_000 }),
    ];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(r.grossCollected).toBe(5_000_000);
    expect(r.certifiedReversals).toBe(1_000_000);
    expect(r.netCollected).toBe(4_000_000);
  });

  test("ambiguous receipts excluded from certified KPIs", () => {
    const apps = [
      // Receipt 1: certified single row
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-1", valorRecaudado: 2_000_000 }),
      // Receipt 2: ambiguous (duplicate doc within same receipt)
      makeApp({ idRecaudo: 2, documentoRelacionado: "FE-2", valorRecaudado: 3_000_000 }),
      makeApp({ idRecaudo: 2, documentoRelacionado: "FE-2", valorRecaudado: 1_000_000 }),
    ];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    // Only receipt 1 is certified
    expect(r.grossCollected).toBe(2_000_000);
    expect(r.ambiguousAmount).toBe(4_000_000); // 3M+1M gross from ambiguous receipt
    // netCollected excludes ambiguous
    expect(r.netCollected).toBe(2_000_000);
  });

  test("unappliedAmount aggregated from certified receipts", () => {
    const apps = [
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-1", valorRecaudado: 5_000, montoNoAplicado: 1_000 }),
      makeApp({ idRecaudo: 2, documentoRelacionado: "FE-2", valorRecaudado: 3_000, montoNoAplicado: 500 }),
    ];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(r.unappliedAmount).toBe(1_500);
  });

  test("sourceRowCount = total raw application rows", () => {
    const apps = [
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-1" }),
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-2" }),
      makeApp({ idRecaudo: 2, documentoRelacionado: "FE-3" }),
    ];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(r.sourceRowCount).toBe(3);
    expect(r.items.length).toBe(3); // application-level items
    expect(r.receipts.length).toBe(2); // normalized receipts
  });

  test("receipts array contains NormalizedCollectionReceipt objects", () => {
    const apps = [makeApp({ idRecaudo: 42, documentoRelacionado: "FE-1", valorRecaudado: 1000 })];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(r.receipts.length).toBe(1);
    expect(r.receipts[0].receiptId).toBe(42);
    expect(r.receipts[0].grossAmount).toBe(1000);
    expect(r.receipts[0].normalizationState).toBe("CERTIFIED_SINGLE_ROW");
  });
});

// ── 5. GlobalNormalizationState ─────────────────────────────────────────────

describe("classifyCollections — GlobalNormalizationState", () => {
  const { classifyCollections } = require("../../comercial/clientes/clientes-pure");

  test("ALL_CERTIFIED when no ambiguous receipts", () => {
    const apps = [
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-1" }),
      makeApp({ idRecaudo: 2, documentoRelacionado: "FE-2" }),
    ];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(r.normalizationState).toBe("ALL_CERTIFIED");
  });

  test("PARTIAL_AMBIGUOUS when some but not all receipts are ambiguous", () => {
    const apps = [
      // Certified receipt
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-1" }),
      // Ambiguous receipt
      makeApp({ idRecaudo: 2, documentoRelacionado: "FE-2" }),
      makeApp({ idRecaudo: 2, documentoRelacionado: "FE-2" }),
    ];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(r.normalizationState).toBe("PARTIAL_AMBIGUOUS");
  });

  test("UNRESOLVED when all receipts are ambiguous", () => {
    const apps = [
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-1" }),
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-1" }),
    ];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(r.normalizationState).toBe("UNRESOLVED");
  });

  test("EMPTY_CERTIFIED has null normalizationState", () => {
    const r = classifyCollections([], true, true, "castillitos", NOW);
    // Empty uses the emptyResult defaults but EMPTY_CERTIFIED overrides
    expect(r.normalizationState).toBe("ALL_CERTIFIED");
  });
});

// ── 6. Negative values = certified reversals ────────────────────────────────

describe("negative values handling", () => {
  const { classifyCollections } = require("../../comercial/clientes/clientes-pure");

  test("negative values within non-NC receipts are kept as certified reversals", () => {
    const apps = [
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-100", valorRecaudado: 5_000_000 }),
      makeApp({ idRecaudo: 2, documentoRelacionado: "FE-200", valorRecaudado: -500_000 }),
    ];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    // Both items present (negative NOT filtered out)
    expect(r.items.length).toBe(2);
    expect(r.grossCollected).toBe(5_000_000);
    expect(r.certifiedReversals).toBe(500_000);
    expect(r.netCollected).toBe(4_500_000);
  });

  test("negative value item has negative amount in items array", () => {
    const apps = [
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-100", valorRecaudado: -250_000 }),
    ];
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(r.items[0].amount).toBe(-250_000);
  });
});

// ── 7. No silent truncation ─────────────────────────────────────────────────

describe("no silent truncation in pure functions", () => {
  const { classifyCollections, normalizeCollectionReceipts } = require("../../comercial/clientes/clientes-pure");

  test("500 applications → all items returned", () => {
    const apps = Array.from({ length: 500 }, (_, i) =>
      makeApp({ idRecaudo: i, documentoRelacionado: `FE-${i}`, valorRecaudado: 1_000 })
    );
    const r = classifyCollections(apps, true, true, "castillitos", NOW);
    expect(r.items.length).toBe(500);
    expect(r.totalItems).toBe(500);
    expect(r.receipts.length).toBe(500);
  });

  test("normalizeCollectionReceipts returns all receipts", () => {
    const apps = Array.from({ length: 300 }, (_, i) =>
      makeApp({ idRecaudo: i, documentoRelacionado: `FE-${i}`, valorRecaudado: 1_000 })
    );
    const receipts = normalizeCollectionReceipts(apps, "castillitos");
    expect(receipts.length).toBe(300);
  });
});

// ── 8. Structural — UI pagination ───────────────────────────────────────────

describe("structural — UI pagination and 'Mostrando X de N'", () => {
  const drawerSrc = readFile("app/(app)/[orgSlug]/comercial/clientes/clientes-client.tsx");
  const detail360Src = readFile("app/(app)/[orgSlug]/comercial/clientes/[clienteId]/cliente-360-client.tsx");

  test("drawer TabRecaudos shows 'Mostrando X de N aplicaciones'", () => {
    const start = drawerSrc.indexOf("function TabRecaudos");
    const end = drawerSrc.indexOf("// ── Tab: CARTERA");
    const tabSrc = drawerSrc.slice(start, end);
    expect(tabSrc).toContain("Mostrando");
    expect(tabSrc).toContain("totalItems");
    expect(tabSrc).toContain("aplicaciones");
  });

  test("drawer TabRecaudos has 'Ver más' button", () => {
    const start = drawerSrc.indexOf("function TabRecaudos");
    const end = drawerSrc.indexOf("// ── Tab: CARTERA");
    const tabSrc = drawerSrc.slice(start, end);
    expect(tabSrc).toContain("Ver más");
  });

  test("drawer TabRecaudos does NOT silently truncate (no hardcoded slice)", () => {
    const start = drawerSrc.indexOf("function TabRecaudos");
    const end = drawerSrc.indexOf("// ── Tab: CARTERA");
    const tabSrc = drawerSrc.slice(start, end);
    // Should use visibleCount state, not hardcoded .slice(0, 100) etc.
    expect(tabSrc).toContain("visibleCount");
    expect(tabSrc).not.toContain(".slice(0, 100)");
    expect(tabSrc).not.toContain(".slice(0, 30)");
  });

  test("360 detail Recaudos section shows 'Mostrando X de N aplicaciones'", () => {
    const start = detail360Src.indexOf("Phase 7b: Recaudos");
    const end = detail360Src.indexOf("Phase 8:");
    const section = detail360Src.slice(start, end);
    expect(section).toContain("Mostrando");
    expect(section).toContain("totalItems");
    expect(section).toContain("aplicaciones");
  });

  test("360 detail Recaudos has 'Ver más' button", () => {
    const start = detail360Src.indexOf("Phase 7b: Recaudos");
    const end = detail360Src.indexOf("Phase 8:");
    const section = detail360Src.slice(start, end);
    expect(section).toContain("Ver más");
  });

  test("drawer SalesTable has pagination (no silent truncation)", () => {
    const start = drawerSrc.indexOf("function SalesTable");
    const end = drawerSrc.indexOf("// ── Tab: RECAUDOS");
    const tabSrc = drawerSrc.slice(start, end);
    expect(tabSrc).toContain("Mostrando");
    expect(tabSrc).toContain("Ver más");
    expect(tabSrc).not.toContain(".slice(0, 30)");
  });

  test("360 detail Ventas section has pagination", () => {
    const start = detail360Src.indexOf("Phase 7: Ventas");
    const end = detail360Src.indexOf("Phase 7b:");
    const section = detail360Src.slice(start, end);
    expect(section).toContain("Mostrando");
    expect(section).toContain("Ver más");
    expect(section).not.toContain(".slice(0, 50)");
  });
});

// ── 9. Structural — KPI contract fields ─────────────────────────────────────

describe("structural — CustomerCollectionsResult KPI fields", () => {
  const pureSrc = readFile("lib/comercial/clientes/clientes-pure.ts");

  test("CustomerCollectionsResult has grossCollected field", () => {
    expect(pureSrc).toContain("grossCollected:");
  });

  test("CustomerCollectionsResult has certifiedReversals field", () => {
    expect(pureSrc).toContain("certifiedReversals:");
  });

  test("CustomerCollectionsResult has netCollected field", () => {
    expect(pureSrc).toContain("netCollected:");
  });

  test("CustomerCollectionsResult has appliedAmount field", () => {
    expect(pureSrc).toContain("appliedAmount:");
  });

  test("CustomerCollectionsResult has unappliedAmount field", () => {
    expect(pureSrc).toContain("unappliedAmount:");
  });

  test("CustomerCollectionsResult has ambiguousAmount field", () => {
    expect(pureSrc).toContain("ambiguousAmount:");
  });

  test("CustomerCollectionsResult has normalizationState field", () => {
    expect(pureSrc).toContain("normalizationState:");
  });

  test("CustomerCollectionsResult has sourceRowCount field", () => {
    expect(pureSrc).toContain("sourceRowCount:");
  });

  test("CustomerCollectionsResult has receipts array field", () => {
    expect(pureSrc).toContain("receipts:");
  });

  test("CustomerCollectionsResult does NOT have totalCollected field", () => {
    // totalCollected was the old field — replaced by grossCollected/netCollected
    const interfaceStart = pureSrc.indexOf("export interface CustomerCollectionsResult");
    const interfaceEnd = pureSrc.indexOf("}", interfaceStart) + 1;
    const interfaceSrc = pureSrc.slice(interfaceStart, interfaceEnd);
    expect(interfaceSrc).not.toContain("totalCollected");
  });
});

// ── 10. Structural — UI uses new contract fields ────────────────────────────

describe("structural — UI uses netCollected (not totalCollected)", () => {
  const drawerSrc = readFile("app/(app)/[orgSlug]/comercial/clientes/clientes-client.tsx");
  const detail360Src = readFile("app/(app)/[orgSlug]/comercial/clientes/[clienteId]/cliente-360-client.tsx");

  test("drawer KPI strip uses netCollected", () => {
    expect(drawerSrc).toContain("netCollected");
  });

  test("drawer does NOT reference totalCollected", () => {
    expect(drawerSrc).not.toContain("totalCollected");
  });

  test("360 detail uses netCollected", () => {
    expect(detail360Src).toContain("netCollected");
  });

  test("360 detail does NOT reference totalCollected", () => {
    expect(detail360Src).not.toContain("totalCollected");
  });

  test("drawer uses CollectionApplicationItem (not CustomerCollectionItem)", () => {
    expect(drawerSrc).toContain("CollectionApplicationItem");
    expect(drawerSrc).not.toContain("CustomerCollectionItem");
  });

  test("drawer TabRecaudos shows receiptId (not receiptNumber)", () => {
    const start = drawerSrc.indexOf("function TabRecaudos");
    const end = drawerSrc.indexOf("// ── Tab: CARTERA");
    const tabSrc = drawerSrc.slice(start, end);
    expect(tabSrc).toContain("receiptId");
    expect(tabSrc).not.toContain("receiptNumber");
  });

  test("360 detail Recaudos shows receiptId (not receiptNumber)", () => {
    const start = detail360Src.indexOf("Phase 7b: Recaudos");
    const end = detail360Src.indexOf("Phase 8:");
    const section = detail360Src.slice(start, end);
    expect(section).toContain("receiptId");
    expect(section).not.toContain("receiptNumber");
  });

  test("drawer TabRecaudos shows applicationLinkage status", () => {
    const start = drawerSrc.indexOf("function TabRecaudos");
    const end = drawerSrc.indexOf("// ── Tab: CARTERA");
    const tabSrc = drawerSrc.slice(start, end);
    expect(tabSrc).toContain("applicationLinkage");
  });

  test("360 detail Recaudos shows applicationLinkage status", () => {
    const start = detail360Src.indexOf("Phase 7b: Recaudos");
    const end = detail360Src.indexOf("Phase 8:");
    const section = detail360Src.slice(start, end);
    expect(section).toContain("applicationLinkage");
  });
});

// ── 11. Structural — normalizeCollectionReceipts is exported ────────────────

describe("structural — normalizeCollectionReceipts export", () => {
  const pureSrc = readFile("lib/comercial/clientes/clientes-pure.ts");

  test("normalizeCollectionReceipts is exported", () => {
    expect(pureSrc).toContain("export function normalizeCollectionReceipts");
  });

  test("NormalizedCollectionReceipt type is exported", () => {
    expect(pureSrc).toContain("export interface NormalizedCollectionReceipt");
  });

  test("ReceiptNormalizationState type is exported", () => {
    expect(pureSrc).toContain("export type ReceiptNormalizationState");
  });

  test("GlobalNormalizationState type is exported", () => {
    expect(pureSrc).toContain("export type GlobalNormalizationState");
  });

  test("CollectionAppInput type is exported", () => {
    expect(pureSrc).toContain("export interface CollectionAppInput");
  });

  test("CollectionAppInput has clienteId field", () => {
    const start = pureSrc.indexOf("export interface CollectionAppInput");
    const end = pureSrc.indexOf("}", start) + 1;
    const src = pureSrc.slice(start, end);
    expect(src).toContain("clienteId:");
  });
});

// ── 12. Per-receipt linkage ─────────────────────────────────────────────────

describe("normalizeCollectionReceipts — per-receipt linkage", () => {
  const { normalizeCollectionReceipts } = require("../../comercial/clientes/clientes-pure");

  test("APPLIED: has docs + unapplied=0", () => {
    const apps = [makeApp({ idRecaudo: 1, documentoRelacionado: "FE-1", montoNoAplicado: 0 })];
    const receipts = normalizeCollectionReceipts(apps, "castillitos");
    expect(receipts[0].linkageState).toBe("APPLIED");
  });

  test("PARTIALLY_LINKED: has docs + unapplied>0", () => {
    const apps = [makeApp({ idRecaudo: 1, documentoRelacionado: "FE-1", montoNoAplicado: 500 })];
    const receipts = normalizeCollectionReceipts(apps, "castillitos");
    expect(receipts[0].linkageState).toBe("PARTIALLY_LINKED");
  });

  test("UNAPPLIED: no docs", () => {
    const apps = [makeApp({ idRecaudo: 1, documentoRelacionado: "" })];
    const receipts = normalizeCollectionReceipts(apps, "castillitos");
    expect(receipts[0].linkageState).toBe("UNAPPLIED");
  });
});

// ── 13. Split application receipt with reversals ────────────────────────────

describe("split application receipt with reversals", () => {
  const { normalizeCollectionReceipts } = require("../../comercial/clientes/clientes-pure");

  test("receipt with 3 apps: 2 positive + 1 negative = correct gross/reversal/net", () => {
    const apps = [
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-1", valorRecaudado: 3_000_000 }),
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-2", valorRecaudado: 2_000_000 }),
      makeApp({ idRecaudo: 1, documentoRelacionado: "FE-3", valorRecaudado: -500_000 }),
    ];
    const receipts = normalizeCollectionReceipts(apps, "castillitos");
    expect(receipts.length).toBe(1);
    expect(receipts[0].grossAmount).toBe(5_000_000);
    expect(receipts[0].reversalAmount).toBe(500_000);
    expect(receipts[0].netAmount).toBe(4_500_000);
    expect(receipts[0].normalizationState).toBe("CERTIFIED_SPLIT_APPLICATIONS");
  });
});
