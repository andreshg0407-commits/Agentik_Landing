/**
 * lib/auth/__tests__/clients-canonical-truth-03a8c.test.ts
 *
 * CLIENTS-CANONICAL-TRUTH-03A8C — Aging and collection context closure.
 *
 * Behavioral tests proving:
 *   1. isAgingVerified requires BOTH daysOverdue AND dueDate
 *   2. DIAS_MORA=0 with dueDate=null is NOT verified
 *   3. computeAgingCompleteness returns COMPLETE/PARTIAL/UNVERIFIED correctly
 *   4. resolveOverdueDisplay returns null when aging != COMPLETE
 *   5. carteraTrafficLight shows "Vencimiento no verificado" when no items have verified aging
 *   6. carteraTrafficLight shows "Al dia" ONLY when verified items have 0 overdue
 *   7. resolveCollectionContext produces correct linkage states
 *   8. resolveReceivableDisplayStatus: CREDIT → "NC aplicada" / "Saldo a favor"
 *   9. Cliente360Data.receivables has agingCompleteness and collectionContext fields
 *  10. Provenance text includes collection linkage context
 *  11. "Vencida" label changes to "Vencida (parcial)" when aging != COMPLETE
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

// ── 1. isAgingVerified — requires BOTH daysOverdue AND dueDate ──────────────

describe("isAgingVerified — dual requirement", () => {
  const {
    isAgingVerified,
    computeAgingCompleteness,
    resolveOverdueDisplay,
  } = require("../../comercial/clientes/clientes-pure");

  test("daysOverdue=0, dueDate=null → NOT verified", () => {
    expect(isAgingVerified({ daysOverdue: 0, dueDate: null, balanceDue: 100 })).toBe(false);
  });

  test("daysOverdue=null, dueDate='2026-01-01' → NOT verified", () => {
    expect(isAgingVerified({ daysOverdue: null, dueDate: "2026-01-01", balanceDue: 100 })).toBe(false);
  });

  test("daysOverdue=null, dueDate=null → NOT verified", () => {
    expect(isAgingVerified({ daysOverdue: null, dueDate: null, balanceDue: 100 })).toBe(false);
  });

  test("daysOverdue=0, dueDate='2026-08-01' → verified", () => {
    expect(isAgingVerified({ daysOverdue: 0, dueDate: "2026-08-01", balanceDue: 100 })).toBe(true);
  });

  test("daysOverdue=45, dueDate='2026-06-15' → verified", () => {
    expect(isAgingVerified({ daysOverdue: 45, dueDate: "2026-06-15", balanceDue: 500 })).toBe(true);
  });
});

// ── 2. computeAgingCompleteness ─────────────────────────────────────────────

describe("computeAgingCompleteness", () => {
  const { computeAgingCompleteness } = require("../../comercial/clientes/clientes-pure");

  test("no open items → COMPLETE", () => {
    expect(computeAgingCompleteness([])).toBe("COMPLETE");
  });

  test("all open items verified → COMPLETE", () => {
    const items = [
      { daysOverdue: 0, dueDate: "2026-08-01", balanceDue: 100 },
      { daysOverdue: 30, dueDate: "2026-07-01", balanceDue: 200 },
    ];
    expect(computeAgingCompleteness(items)).toBe("COMPLETE");
  });

  test("some verified, some not → PARTIAL", () => {
    const items = [
      { daysOverdue: 0, dueDate: "2026-08-01", balanceDue: 100 },
      { daysOverdue: 0, dueDate: null, balanceDue: 200 },  // DIAS_MORA=0 but no dueDate
    ];
    expect(computeAgingCompleteness(items)).toBe("PARTIAL");
  });

  test("no items verified → UNVERIFIED", () => {
    const items = [
      { daysOverdue: 0, dueDate: null, balanceDue: 100 },
      { daysOverdue: null, dueDate: null, balanceDue: 200 },
    ];
    expect(computeAgingCompleteness(items)).toBe("UNVERIFIED");
  });

  test("closed items (balanceDue=0) are excluded from completeness check", () => {
    const items = [
      { daysOverdue: null, dueDate: null, balanceDue: 0 },  // closed — excluded
      { daysOverdue: 30, dueDate: "2026-07-01", balanceDue: 200 },  // open + verified
    ];
    expect(computeAgingCompleteness(items)).toBe("COMPLETE");
  });

  test("credit items (balanceDue<0) are excluded from completeness check", () => {
    const items = [
      { daysOverdue: null, dueDate: null, balanceDue: -50 },  // credit — excluded
      { daysOverdue: 10, dueDate: "2026-08-01", balanceDue: 300 },
    ];
    expect(computeAgingCompleteness(items)).toBe("COMPLETE");
  });
});

// ── 3. resolveOverdueDisplay — null-safe vencida ────────────────────────────

describe("resolveOverdueDisplay", () => {
  const { resolveOverdueDisplay } = require("../../comercial/clientes/clientes-pure");

  test("COMPLETE aging → returns totalVencido value", () => {
    expect(resolveOverdueDisplay(1_500_000, "COMPLETE")).toBe(1_500_000);
  });

  test("COMPLETE aging with 0 → returns 0", () => {
    expect(resolveOverdueDisplay(0, "COMPLETE")).toBe(0);
  });

  test("PARTIAL aging → returns null", () => {
    expect(resolveOverdueDisplay(1_500_000, "PARTIAL")).toBeNull();
  });

  test("UNVERIFIED aging → returns null", () => {
    expect(resolveOverdueDisplay(0, "UNVERIFIED")).toBeNull();
  });
});

// ── 4. carteraTrafficLight — aging verification gate ────────────────────────

describe("carteraTrafficLight — verified aging gate", () => {
  const { carteraTrafficLight } = require("../../comercial/clientes/clientes-pure");

  test("NIT 24296154 scenario: DIAS_MORA=0, dueDate=null → 'Vencimiento no verificado' (NOT 'Al dia')", () => {
    const result = carteraTrafficLight({
      truthStatus: "CERTIFIED",
      totalBalance: 500_000,
      items: [
        { daysOverdue: 0, dueDate: null, balanceDue: 500_000 },
      ],
    });
    expect(result.label).toBe("Vencimiento no verificado");
    expect(result.label).not.toBe("Al dia");
  });

  test("all items have verified aging with 0 overdue → 'Al dia'", () => {
    const result = carteraTrafficLight({
      truthStatus: "CERTIFIED",
      totalBalance: 500_000,
      items: [
        { daysOverdue: 0, dueDate: "2026-09-01", balanceDue: 500_000 },
      ],
    });
    expect(result.label).toBe("Al dia");
  });

  test("mixed: one verified current, one unverified → 'Al dia' (verified items show no overdue)", () => {
    const result = carteraTrafficLight({
      truthStatus: "CERTIFIED",
      totalBalance: 700_000,
      items: [
        { daysOverdue: 0, dueDate: "2026-09-01", balanceDue: 500_000 },
        { daysOverdue: 0, dueDate: null, balanceDue: 200_000 },  // unverified, filtered out
      ],
    });
    // The verified items show 0 overdue → Al dia
    expect(result.label).toBe("Al dia");
  });

  test("verified items with overdue → 'En mora' or 'Critica'", () => {
    const result = carteraTrafficLight({
      truthStatus: "CERTIFIED",
      totalBalance: 1_000_000,
      items: [
        { daysOverdue: 45, dueDate: "2026-06-15", balanceDue: 500_000 },
        { daysOverdue: 0, dueDate: "2026-09-01", balanceDue: 500_000 },
      ],
    });
    expect(result.label).toBe("En mora");
  });

  test("UNVERIFIED truthStatus → 'No verificada'", () => {
    const result = carteraTrafficLight({
      truthStatus: "UNVERIFIED",
      totalBalance: null,
      items: [],
    });
    expect(result.label).toBe("No verificada");
  });

  test("CERTIFIED with totalBalance=0 → 'Sin cartera'", () => {
    const result = carteraTrafficLight({
      truthStatus: "CERTIFIED",
      totalBalance: 0,
      items: [],
    });
    expect(result.label).toBe("Sin cartera");
  });
});

// ── 5. resolveCollectionContext ──────────────────────────────────────────────

describe("resolveCollectionContext", () => {
  const { resolveCollectionContext } = require("../../comercial/clientes/clientes-pure");

  test("recaudos unavailable → UNVERIFIED", () => {
    const ctx = resolveCollectionContext(false, null, [], []);
    expect(ctx.collectionLinkageState).toBe("UNVERIFIED");
    expect(ctx.collectionAsOf).toBeNull();
    expect(ctx.collectionWindowLabel).toBe("\u2014");
  });

  test("recaudos OK, documents match open AR → APPLIED_TO_CURRENT_DOCUMENTS", () => {
    const ctx = resolveCollectionContext(
      true, new Date("2026-08-16"),
      ["F2-001234", "F2-005678"],
      ["F2-001234", "F2-009999"],
    );
    expect(ctx.collectionLinkageState).toBe("APPLIED_TO_CURRENT_DOCUMENTS");
    expect(ctx.collectionWindowLabel).toBe("Recaudos históricos");
    expect(ctx.collectionAsOf).not.toBeNull();
  });

  test("recaudos OK, no document overlap → CUSTOMER_HISTORY_ONLY", () => {
    const ctx = resolveCollectionContext(
      true, new Date("2026-08-16"),
      ["F2-001234"],
      ["F2-009999"],
    );
    expect(ctx.collectionLinkageState).toBe("CUSTOMER_HISTORY_ONLY");
  });

  test("recaudos OK, empty recaudo documents → CUSTOMER_HISTORY_ONLY", () => {
    const ctx = resolveCollectionContext(
      true, new Date("2026-08-16"),
      [],
      ["F2-009999"],
    );
    expect(ctx.collectionLinkageState).toBe("CUSTOMER_HISTORY_ONLY");
  });
});

// ── 6. resolveReceivableDisplayStatus — NC status ───────────────────────────

describe("resolveReceivableDisplayStatus", () => {
  const { resolveReceivableDisplayStatus } = require("../../comercial/clientes/clientes-pure");

  test("CREDIT linked to open AR → 'NC aplicada'", () => {
    expect(resolveReceivableDisplayStatus("CREDIT", true)).toBe("NC aplicada");
  });

  test("CREDIT not linked to open AR → 'Saldo a favor'", () => {
    expect(resolveReceivableDisplayStatus("CREDIT", false)).toBe("Saldo a favor");
  });

  test("OPEN status → passes through unchanged", () => {
    expect(resolveReceivableDisplayStatus("OPEN", true)).toBe("OPEN");
  });

  test("OVERDUE status → passes through unchanged", () => {
    expect(resolveReceivableDisplayStatus("OVERDUE", false)).toBe("OVERDUE");
  });
});

// ── 7. Structural: Cliente360Data has agingCompleteness and collectionContext ─

describe("cliente-360-loader.ts — aging and collection fields", () => {
  const src = readFile("lib/comercial/clientes/cliente-360-loader.ts");

  test("receivables type has agingCompleteness field", () => {
    expect(src).toContain("agingCompleteness: AgingCompleteness");
  });

  test("receivables type has collectionContext field", () => {
    expect(src).toContain("collectionContext: CollectionContext");
  });

  test("imports computeAgingCompleteness from clientes-pure", () => {
    expect(src).toContain("computeAgingCompleteness");
  });

  test("imports resolveOverdueDisplay from clientes-pure", () => {
    expect(src).toContain("resolveOverdueDisplay");
  });

  test("imports resolveCollectionContext from clientes-pure", () => {
    expect(src).toContain("resolveCollectionContext");
  });

  test("HAS_OPEN_AR uses resolveOverdueDisplay for totalOverdue", () => {
    const hasOpenBlock = src.slice(
      src.indexOf('"HAS_OPEN_AR"'),
      src.indexOf("} else {", src.indexOf('"HAS_OPEN_AR"')),
    );
    expect(hasOpenBlock).toContain("resolveOverdueDisplay(arResult.snapshot.totalVencido, agingCompleteness)");
  });

  test("HAS_OPEN_AR computes agingCompleteness from receivableItems", () => {
    const hasOpenBlock = src.slice(
      src.indexOf('"HAS_OPEN_AR"'),
      src.indexOf("} else {", src.indexOf('"HAS_OPEN_AR"')),
    );
    expect(hasOpenBlock).toContain("computeAgingCompleteness(receivableItems)");
  });
});

// ── 8. Structural: UI provenance includes collection linkage ─────────────────

describe("clientes-client.tsx — provenance and aging labels", () => {
  const src = readFile("app/(app)/[orgSlug]/comercial/clientes/clientes-client.tsx");

  test("carteraTrafficLight items include dueDate", () => {
    expect(src).toContain("dueDate: r.dueDate");
  });

  test("provenance mentions APPLIED_TO_CURRENT_DOCUMENTS", () => {
    expect(src).toContain("APPLIED_TO_CURRENT_DOCUMENTS");
  });

  test("provenance mentions CUSTOMER_HISTORY_ONLY", () => {
    expect(src).toContain("CUSTOMER_HISTORY_ONLY");
  });

  test("Recaudos label uses collectionWindowLabel", () => {
    expect(src).toContain("collectionContext.collectionWindowLabel");
  });

  test("Vencida label shows '(parcial)' when aging not COMPLETE", () => {
    expect(src).toContain('agingCompleteness === "COMPLETE" ? "Vencida" : "Vencida (parcial)"');
  });
});

describe("cliente-360-client.tsx — provenance and aging labels", () => {
  const src = readFile("app/(app)/[orgSlug]/comercial/clientes/[clienteId]/cliente-360-client.tsx");

  test("provenance mentions APPLIED_TO_CURRENT_DOCUMENTS", () => {
    expect(src).toContain("APPLIED_TO_CURRENT_DOCUMENTS");
  });

  test("provenance mentions CUSTOMER_HISTORY_ONLY", () => {
    expect(src).toContain("CUSTOMER_HISTORY_ONLY");
  });

  test("Recaudos label uses collectionWindowLabel", () => {
    expect(src).toContain("collectionContext.collectionWindowLabel");
  });

  test("Vencida label shows '(parcial)' when aging not COMPLETE", () => {
    expect(src).toContain('agingCompleteness === "COMPLETE" ? "Vencida" : "Vencida (parcial)"');
  });
});

// ── 9. clientes-pure.ts — structural purity checks ──────────────────────────

describe("clientes-pure.ts — aging/collection purity", () => {
  const src = readFile("lib/comercial/clientes/clientes-pure.ts");

  test("exports isAgingVerified", () => {
    expect(src).toContain("export function isAgingVerified");
  });

  test("exports computeAgingCompleteness", () => {
    expect(src).toContain("export function computeAgingCompleteness");
  });

  test("exports resolveOverdueDisplay", () => {
    expect(src).toContain("export function resolveOverdueDisplay");
  });

  test("exports resolveCollectionContext", () => {
    expect(src).toContain("export function resolveCollectionContext");
  });

  test("exports resolveReceivableDisplayStatus", () => {
    expect(src).toContain("export function resolveReceivableDisplayStatus");
  });

  test("CarteraTrafficLightInput.items uses AgingItem (includes dueDate)", () => {
    expect(src).toContain("items: AgingItem[]");
  });

  test("carteraTrafficLight filters by isAgingVerified (not just daysOverdue)", () => {
    expect(src).toContain("receivables.items.filter(isAgingVerified)");
  });

  test("does NOT contain 'from \"server-only\"'", () => {
    expect(src).not.toContain('from "server-only"');
  });

  test("does NOT import Prisma", () => {
    expect(src).not.toContain('from "@/lib/prisma"');
  });
});
