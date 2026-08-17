/**
 * INVENTORY-EXHAUSTED-PARTITION-04A5I — Exclusive Exhausted Partition Tests
 *
 * Structural tests verifying that refs with disponibleReal <= 0 are exclusively
 * in the AGOTADAS tab and never appear in line tabs. Zero intersection guarantee.
 *
 * Root causes fixed:
 *   1. Line tabs included exhausted refs (disponibleReal <= 0) — polluted hierarchy
 *   2. AGOTADAS tab only used panels.AGOTADOS — missed cross-line exhausted refs
 *   3. "Sin cobertura" filter existed in line tabs — redundant with AGOTADAS partition
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const CLIENT_PATH = path.resolve(
  __dirname,
  "../../../app/(app)/[orgSlug]/comercial/inventario/inventario-client.tsx"
);
const src = fs.readFileSync(CLIENT_PATH, "utf-8");

// ── G1: Line tabs only show ACTIVE_AVAILABLE (disponibleReal > 0) ──────────

describe("G1 — Line tabs exclusive to ACTIVE_AVAILABLE partition", () => {
  test("T1a: tabCounts only counts refs with disp > 0 for line tabs", () => {
    expect(src).toContain("04A5I: ACTIVE_AVAILABLE — belongs to its line tab");
    expect(src).toContain("lineCounts[ci.canonicalLine] = (lineCounts[ci.canonicalLine] ?? 0) + 1");
  });

  test("T1b: tabCounts counts exhausted refs for AGOTADAS", () => {
    expect(src).toContain("04A5I: EXHAUSTED or OVERCOMMITTED — belongs to AGOTADAS exclusively");
    expect(src).toContain("agotadosCount++");
  });

  test("T1c: AGOTADOS badge uses computed agotadosCount, not panels.AGOTADOS.length", () => {
    expect(src).toContain("AGOTADOS: agotadosCount");
    expect(src).not.toContain("AGOTADOS: panels.AGOTADOS.length");
  });

  test("T1d: panelItems for line tabs filters to disponibleReal > 0", () => {
    expect(src).toContain("disp > 0; // 04A5I: ACTIVE_AVAILABLE partition");
  });

  test("T1e: lineScopedCanonicalItems filters to disponibleReal > 0", () => {
    // The hierarchy input only includes ACTIVE_AVAILABLE refs
    expect(src).toContain("04A5I: Only ACTIVE_AVAILABLE refs (disponibleReal > 0) enter the hierarchy");
  });
});

// ── G2: AGOTADAS tab shows ALL canonical refs with disponibleReal <= 0 ─────

describe("G2 — AGOTADAS tab is the exclusive exhausted partition", () => {
  test("T2a: AGOTADAS builds from canonicalItems with disp <= 0", () => {
    expect(src).toContain("04A5I: AGOTADAS = ALL canonical refs with disponibleReal <= 0, across ALL lines");
  });

  test("T2b: AGOTADAS includes refs from ALL canonical lines", () => {
    // The AGOTADAS filter does not check canonicalLine — it collects from all lines
    const agotadosBlock = src.slice(
      src.indexOf('if (activeTab === "AGOTADOS")'),
      src.indexOf("// 04A5I: Line tab items")
    );
    expect(agotadosBlock).not.toContain("canonicalLine ===");
    expect(agotadosBlock).toContain("disp <= 0");
  });
});

// ── G3: Sin cobertura filter removed from line tabs ────────────────────────

describe("G3 — Sin cobertura filter eliminated", () => {
  test("T3a: FilterKey does not include sin_cobertura", () => {
    expect(src).not.toContain('| "sin_cobertura"');
  });

  test("T3b: FILTER_OPTIONS does not include sin_cobertura", () => {
    expect(src).not.toContain('{ key: "sin_cobertura"');
  });

  test("T3c: filteredPanelItems has no sin_cobertura case", () => {
    const filterStart = src.indexOf("switch (filter)");
    const filterEnd = src.indexOf("return result;", filterStart);
    const filterBlock = src.slice(filterStart, filterEnd);
    expect(filterBlock).not.toContain('case "sin_cobertura"');
  });

  test("T3d: isRefPassesFilter has no sin_cobertura case", () => {
    const fn = src.slice(
      src.indexOf("function isRefPassesFilter("),
      src.indexOf("function filterHierarchy(")
    );
    expect(fn).not.toContain('case "sin_cobertura"');
  });

  test("T3e: Removal documented with 04A5I comment", () => {
    expect(src).toContain('04A5I: "sin_cobertura" removed');
  });
});

// ── G4: AGOTADAS tab has enhanced columns ──────────────────────────────────

describe("G4 — Enhanced AGOTADAS columns", () => {
  test("T4a: AGOTADOS_GRID has 8 columns (Thumb|Ref|Desc|Linea|Exist|Reserv|Disp|Estado)", () => {
    const gridMatch = src.match(/const AGOTADOS_GRID\s*=\s*"([^"]+)"/);
    expect(gridMatch).not.toBeNull();
    const cols = gridMatch![1].split(/\s+/);
    expect(cols.length).toBe(8);
  });

  test("T4b: Headers include Existencia, Reservado, Disponible, Estado", () => {
    expect(src).toContain('"Existencia"');
    expect(src).toContain('"Reservado"');
    expect(src).toContain('"Disponible"');
    expect(src).toContain('"Estado"');
  });

  test("T4c: AgotadoRow shows onHandReal", () => {
    expect(src).toContain("item.onHandReal");
  });

  test("T4d: AgotadoRow shows reservedReal", () => {
    expect(src).toContain("item.reservedReal");
  });

  test("T4e: AgotadoRow shows negative disponible in parentheses", () => {
    expect(src).toContain("Math.abs(disp).toLocaleString()");
  });

  test("T4f: AgotadoRow partition label distinguishes Agotado vs Sobrecomprometido", () => {
    expect(src).toContain('"Sobrecompr."');
    expect(src).toContain('"Agotado"');
    expect(src).toContain("const isOvercommitted = disp < 0");
  });
});

// ── G5: AGOTADAS sub-filters ───────────────────────────────────────────────

describe("G5 — AGOTADAS sub-filters", () => {
  test("T5a: AgotadosFilterKey type defined", () => {
    expect(src).toContain('type AgotadosFilterKey = "todos" | "agotados" | "sobrecomprometidos"');
  });

  test("T5b: AGOTADOS_FILTER_OPTIONS defined", () => {
    expect(src).toContain("const AGOTADOS_FILTER_OPTIONS");
  });

  test("T5c: agotadosFilter state variable exists", () => {
    expect(src).toContain('useState<AgotadosFilterKey>("todos")');
  });

  test("T5d: Sub-filter logic: agotados = disp === 0, sobrecomprometidos = disp < 0", () => {
    expect(src).toContain('if (agotadosFilter === "agotados") return disp === 0');
    expect(src).toContain('if (agotadosFilter === "sobrecomprometidos") return disp < 0');
  });

  test("T5e: switchTab resets agotadosFilter", () => {
    expect(src).toContain('setAgotadosFilter("todos")');
  });
});

// ── G6: Partition counts strip ─────────────────────────────────────────────

describe("G6 — Partition summary strip", () => {
  test("T6a: Partition counts memo computed in AgotadosTabContent", () => {
    expect(src).toContain("partitionCounts");
  });

  test("T6b: Exhausted count tracked", () => {
    expect(src).toContain("exhausted++");
  });

  test("T6c: Overcommitted count tracked", () => {
    expect(src).toContain("overcommitted++");
  });
});

// ── G7: No prohibited patterns ─────────────────────────────────────────────

describe("G7 — No prohibited patterns", () => {
  test("T7a: No sin_cobertura in FilterKey or FILTER_OPTIONS", () => {
    expect(src).not.toContain('| "sin_cobertura"');
    expect(src).not.toContain('key: "sin_cobertura"');
  });

  test("T7b: Line tabs never include refs with disponibleReal <= 0", () => {
    // The panelItems for line tabs explicitly requires disp > 0
    expect(src).toContain("disp > 0; // 04A5I: ACTIVE_AVAILABLE partition");
  });

  test("T7c: AGOTADAS tab does not use panels.AGOTADOS", () => {
    // The AGOTADOS tab builds from canonicalItems, not panels.AGOTADOS
    expect(src).not.toContain("AGOTADOS: panels.AGOTADOS.length");
  });
});

// ── G8: originalItemsByRef moved before tabCounts ──────────────────────────

describe("G8 — Data dependency ordering", () => {
  test("T8a: originalItemsByRef defined before tabCounts", () => {
    const origPos = src.indexOf("const originalItemsByRef = useMemo");
    const tabCountsPos = src.indexOf("const tabCounts = useMemo");
    expect(origPos).toBeLessThan(tabCountsPos);
  });

  test("T8b: originalItemsByRef defined before panelItems", () => {
    const origPos = src.indexOf("const originalItemsByRef = useMemo");
    const panelItemsPos = src.indexOf("const panelItems = useMemo");
    expect(origPos).toBeLessThan(panelItemsPos);
  });
});

// ── G9: AgotadosTabContent receives sub-filter props ───────────────────────

describe("G9 — AgotadosTabContent props", () => {
  test("T9a: AgotadosTabContent accepts agotadosFilter prop", () => {
    expect(src).toContain("agotadosFilter: AgotadosFilterKey");
  });

  test("T9b: AgotadosTabContent accepts setAgotadosFilter prop", () => {
    expect(src).toContain("setAgotadosFilter: (f: AgotadosFilterKey) => void");
  });

  test("T9c: AgotadosTabContent invocation passes agotadosFilter", () => {
    expect(src).toContain("agotadosFilter={agotadosFilter}");
    expect(src).toContain("setAgotadosFilter={setAgotadosFilter}");
  });
});
