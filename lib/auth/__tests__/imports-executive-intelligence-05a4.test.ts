/**
 * IMPORTS-EXECUTIVE-INTELLIGENCE-AND-REENTRY-05A4
 *
 * Verifies executive intelligence redesign:
 *   1. Executive KPIs in COP (Ventas netas, Unidades, Promedio, Crecimiento)
 *   2. Monthly sales chart (6M, COP, partial month, growth)
 *   3. Purchases chart (quantity only, PURCHASE_AMOUNT_SOURCE_BLOCKED)
 *   4. Top products by size (PEQUENO/MEDIANO/GRANDE/Sin clasificar)
 *   5. Sortable headers on ALL tables
 *   6. No classification distribution chart
 *   7. Monthly sales aggregation in service
 *   8. monthlySales in cache sentinel
 *
 * Sprint: IMPORTS-EXECUTIVE-INTELLIGENCE-AND-REENTRY-05A4
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const CLIENT_PATH = path.resolve(
  __dirname,
  "../../../app/(app)/[orgSlug]/comercial/importaciones/importaciones-client.tsx"
);
const clientSrc = fs.readFileSync(CLIENT_PATH, "utf-8");

const SERVICE_PATH = path.resolve(
  __dirname,
  "../../comercial/importaciones/import-intelligence-service.ts"
);
const serviceSrc = fs.readFileSync(SERVICE_PATH, "utf-8");

const CACHE_PATH = path.resolve(
  __dirname,
  "../../comercial/importaciones/import-intelligence-cache.ts"
);
const cacheSrc = fs.readFileSync(CACHE_PATH, "utf-8");

const TYPES_PATH = path.resolve(
  __dirname,
  "../../comercial/importaciones/import-types.ts"
);
const typesSrc = fs.readFileSync(TYPES_PATH, "utf-8");

const PAGE_PATH = path.resolve(
  __dirname,
  "../../../app/(app)/[orgSlug]/comercial/importaciones/page.tsx"
);
const pageSrc = fs.readFileSync(PAGE_PATH, "utf-8");

// ── A: Executive KPIs ─────────────────────────────────────────────────────

describe("05A4-A — Executive KPIs in COP", () => {
  test("T1: Ventas netas 6M KPI", () => {
    expect(clientSrc).toContain("Ventas netas 6M");
  });

  test("T2: Unidades netas 6M KPI", () => {
    expect(clientSrc).toContain("Unidades netas 6M");
  });

  test("T3: Promedio mensual KPI", () => {
    expect(clientSrc).toContain("Promedio mensual");
  });

  test("T4: Crecimiento ultimo mes KPI", () => {
    expect(clientSrc).toContain("Crecimiento ultimo mes");
  });

  test("T5: fmtCOP helper for abbreviated COP", () => {
    expect(clientSrc).toContain("function fmtCOP");
    expect(clientSrc).toContain("1_000_000");
  });

  test("T6: fmtCOPFull helper for full COP", () => {
    expect(clientSrc).toContain("function fmtCOPFull");
    expect(clientSrc).toContain('es-CO');
  });
});

// ── B: Monthly sales chart ────────────────────────────────────────────────

describe("05A4-B — Monthly sales chart", () => {
  test("T7: monthlySales prop accepted by client", () => {
    expect(clientSrc).toContain("monthlySales");
    expect(clientSrc).toContain("ImportMonthlySalesEntry");
  });

  test("T8: Page passes monthlySales to client", () => {
    expect(pageSrc).toContain("monthlySales={monthlySales");
  });

  test("T9: Partial month indicator", () => {
    expect(clientSrc).toContain("partial");
  });
});

// ── C: Monthly sales server-side aggregation ──────────────────────────────

describe("05A4-C — Monthly sales aggregation (service)", () => {
  test("T10: computeMonthlySales function exists", () => {
    expect(serviceSrc).toContain("computeMonthlySales");
  });

  test("T11: Queries CustomerOrderLine", () => {
    expect(serviceSrc).toContain("CustomerOrderLine");
  });

  test("T12: Groups by YYYY-MM", () => {
    expect(serviceSrc).toContain("YYYY-MM");
  });

  test("T13: Result includes monthlySales", () => {
    expect(serviceSrc).toContain("return { items, kpis, salesCoverage, monthlySales }");
  });

  test("T14: ImportMonthlySalesEntry type defined", () => {
    expect(typesSrc).toContain("export interface ImportMonthlySalesEntry");
    expect(typesSrc).toContain("unitsNet:");
    expect(typesSrc).toContain("revenueNet:");
    expect(typesSrc).toContain("partial:");
  });
});

// ── D: Purchases chart — quantity only ────────────────────────────────────

describe("05A4-D — Purchases chart (honest)", () => {
  test("T15: Compras documentadas label", () => {
    expect(clientSrc).toContain("Compras documentadas");
  });

  test("T16: monthlyPurchases computed in client", () => {
    expect(clientSrc).toContain("monthlyPurchases");
  });

  test("T17: No classification distribution (removed)", () => {
    expect(clientSrc).not.toContain("Distribucion por clasificacion");
    expect(clientSrc).not.toContain("classDistribution");
  });
});

// ── E: Top products by size ───────────────────────────────────────────────

describe("05A4-E — Top products by size", () => {
  test("T18: Top productos por tamano section", () => {
    expect(clientSrc).toContain("Top productos por tamano");
  });

  test("T19: Size tab labels", () => {
    expect(clientSrc).toContain("PEQUENO");
    expect(clientSrc).toContain("MEDIANO");
    expect(clientSrc).toContain("GRANDE");
  });

  test("T20: Sin clasificar tab for null sizeClass", () => {
    expect(clientSrc).toContain("Sin clasificar");
  });

  test("T21: TopProductsBySize component", () => {
    expect(clientSrc).toContain("TopProductsBySize");
  });
});

// ── F: Sortable headers ──────────────────────────────────────────────────

describe("05A4-F — Sortable headers on ALL tables", () => {
  test("T22: SortableHeader component defined", () => {
    expect(clientSrc).toContain("function SortableHeader");
  });

  test("T23: useSortable hook defined", () => {
    expect(clientSrc).toContain("function useSortable");
  });

  test("T24: stableSort utility defined", () => {
    expect(clientSrc).toContain("function stableSort");
  });

  test("T25: MayorRotacionView uses sortable", () => {
    expect(clientSrc).toContain("MayorSortCol");
  });

  test("T26: MenorRotacionView uses sortable", () => {
    expect(clientSrc).toContain("MenorSortCol");
  });

  test("T27: Masde8MesesView uses sortable", () => {
    expect(clientSrc).toContain("EightMSortCol");
  });
});

// ── G: Cache sentinel includes monthlySales ──────────────────────────────

describe("05A4-G — Cache sentinel", () => {
  test("T28: SOURCE_UNAVAILABLE sentinel includes monthlySales: []", () => {
    expect(cacheSrc).toContain("monthlySales: []");
  });
});

// ── H: Freshness footer ──────────────────────────────────────────────────

describe("05A4-H — Freshness footer", () => {
  test("T29: Actualizado timestamp", () => {
    expect(clientSrc).toContain("Actualizado:");
  });

  test("T30: Sales coverage in footer", () => {
    expect(clientSrc).toContain("salesCoverage?.salesAsOf");
    expect(clientSrc).toContain("Ventas al:");
  });
});
