/**
 * IMPORTS-EXECUTIVE-INTELLIGENCE-AND-REENTRY-05A4 + 05A4A
 *
 * Verifies executive intelligence redesign:
 *   1. Executive KPIs in COP (Ventas netas, Unidades, Promedio, Ventas ultimo mes cerrado)
 *   2. Monthly sales chart (6M, COP, partial month)
 *   3. No purchases chart (removed in 05A4A)
 *   4. Top products by size (PEQUENO/MEDIANO/GRANDE/Sin clasificar)
 *   5. Sortable headers on ALL tables
 *   6. No classification distribution chart
 *   7. Monthly sales aggregation in service
 *   8. monthlySales in cache sentinel
 *   9. "Ventas ultimo mes cerrado" uses lastClosed (not growth %)
 *
 * Sprint: IMPORTS-EXECUTIVE-INTELLIGENCE-AND-REENTRY-05A4
 * Patch: IMPORTS-EXECUTIVE-UX-05A4A
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

  test("T4: Ventas ultimo mes cerrado KPI (05A4A replaces growth)", () => {
    expect(clientSrc).toContain("Ventas ultimo mes cerrado");
    expect(clientSrc).not.toContain("Crecimiento ultimo mes");
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

// ── D: Purchases chart REMOVED (05A4A) ───────────────────────────────────

describe("05A4A-D — Purchases chart removed", () => {
  test("T15: No 'Compras documentadas' in UI", () => {
    expect(clientSrc).not.toContain("Compras documentadas");
  });

  test("T16: No monthlyPurchases variable", () => {
    expect(clientSrc).not.toContain("monthlyPurchases");
  });

  test("T17: No amber purchase bars (C.amber chart)", () => {
    // The amber bar purchase chart was removed — no orange/amber bar chart remains
    expect(clientSrc).not.toContain("Facturas C1/C2");
  });

  test("T18: No classification distribution", () => {
    expect(clientSrc).not.toContain("Distribucion por clasificacion");
    expect(clientSrc).not.toContain("classDistribution");
  });

  test("T19: No growth percentage KPI", () => {
    expect(clientSrc).not.toContain("growthPct");
    expect(clientSrc).not.toContain("Mes completo vs anterior");
  });
});

// ── E: Ventas ultimo mes cerrado (05A4A) ──────────────────────────────────

describe("05A4A-E — Ventas ultimo mes cerrado KPI", () => {
  test("T20: Uses lastClosed from complete months", () => {
    expect(clientSrc).toContain("lastClosed");
    expect(clientSrc).toContain("partial");
  });

  test("T21: Excludes partial (current) month", () => {
    // completeMonths filters out partial months
    expect(clientSrc).toContain("!m.partial");
  });

  test("T22: Displays COP format", () => {
    expect(clientSrc).toContain("fmtCOP(execKpis.lastClosed.revenueNet)");
  });

  test("T23: Shows month name in subtitle", () => {
    expect(clientSrc).toContain("Ventas netas");
    expect(clientSrc).toContain('month: "long"');
    expect(clientSrc).toContain('year: "numeric"');
  });

  test("T24: Shows units as secondary datum", () => {
    expect(clientSrc).toContain("unidades netas");
  });

  test("T25: Shows 'No disponible' only when no closed months exist", () => {
    expect(clientSrc).toContain("No disponible");
    expect(clientSrc).toContain("Sin meses cerrados en fuente");
  });

  test("T26: Does NOT show em dash for available data", () => {
    // The old growth KPI showed "—" when null; the new KPI shows "No disponible" only
    // when there are genuinely no closed months — not an em dash
    const kpiSection = clientSrc.slice(
      clientSrc.indexOf("Ventas ultimo mes cerrado"),
      clientSrc.indexOf("Ventas ultimo mes cerrado") + 800
    );
    // Em dash only appears in the "No disponible" fallback path, not in the data path
    expect(kpiSection).not.toContain('"\u2014"');
  });
});

// ── F: Top products by size ───────────────────────────────────────────────

describe("05A4-F — Top products by size", () => {
  test("T27: Top productos por tamano section", () => {
    expect(clientSrc).toContain("Top productos por tamano");
  });

  test("T28: Size tab labels", () => {
    expect(clientSrc).toContain("PEQUENO");
    expect(clientSrc).toContain("MEDIANO");
    expect(clientSrc).toContain("GRANDE");
  });

  test("T29: Sin clasificar tab for null sizeClass", () => {
    expect(clientSrc).toContain("Sin clasificar");
  });

  test("T30: TopProductsBySize component", () => {
    expect(clientSrc).toContain("TopProductsBySize");
  });
});

// ── G: Sortable headers ──────────────────────────────────────────────────

describe("05A4-G — Sortable headers on ALL tables", () => {
  test("T31: SortableHeader component defined", () => {
    expect(clientSrc).toContain("function SortableHeader");
  });

  test("T32: useSortable hook defined", () => {
    expect(clientSrc).toContain("function useSortable");
  });

  test("T33: stableSort utility defined", () => {
    expect(clientSrc).toContain("function stableSort");
  });

  test("T34: MayorRotacionView uses sortable", () => {
    expect(clientSrc).toContain("MayorSortCol");
  });

  test("T35: MenorRotacionView uses sortable", () => {
    expect(clientSrc).toContain("MenorSortCol");
  });

  test("T36: Masde8MesesView uses sortable", () => {
    expect(clientSrc).toContain("EightMSortCol");
  });
});

// ── H: Cache sentinel ────────────────────────────────────────────────────

describe("05A4-H — Cache sentinel", () => {
  test("T37: SOURCE_UNAVAILABLE sentinel includes monthlySales: []", () => {
    expect(cacheSrc).toContain("monthlySales: []");
  });
});

// ── I: Freshness footer ──────────────────────────────────────────────────

describe("05A4-I — Freshness footer", () => {
  test("T38: Actualizado timestamp", () => {
    expect(clientSrc).toContain("Actualizado:");
  });

  test("T39: Sales coverage in footer", () => {
    expect(clientSrc).toContain("salesCoverage?.salesAsOf");
    expect(clientSrc).toContain("Ventas al:");
  });
});

// ── J: Inteligencia layout order (05A4A) ──────────────────────────────────

describe("05A4A-J — Inteligencia layout order", () => {
  test("T40: KPIs appear before sales chart", () => {
    const kpiIdx = clientSrc.indexOf("Executive KPIs");
    const chartIdx = clientSrc.indexOf("Monthly Sales Chart");
    expect(kpiIdx).toBeLessThan(chartIdx);
  });

  test("T41: Sales chart appears before Top Products", () => {
    const chartIdx = clientSrc.indexOf("Monthly Sales Chart");
    const topIdx = clientSrc.indexOf("Top Products by Size");
    expect(chartIdx).toBeLessThan(topIdx);
  });

  test("T42: Top Products appears before freshness footer", () => {
    const topIdx = clientSrc.indexOf("Top Products by Size");
    const footerIdx = clientSrc.indexOf("Compact freshness footer");
    expect(topIdx).toBeLessThan(footerIdx);
  });

  test("T43: Monthly sales chart still present", () => {
    expect(clientSrc).toContain("Ventas mensuales de productos importados");
  });

  test("T44: Top productos still present", () => {
    expect(clientSrc).toContain("Top productos por tamano");
  });
});
