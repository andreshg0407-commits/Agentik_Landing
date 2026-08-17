/**
 * INVENTORY-CANONICAL-UI-04A5 — Dynamic Counters and Filters Tests
 *
 * Structural tests verifying that tab badges, filter predicates, and result
 * counts derive from canonical B01 universe per line, not from panel routing.
 *
 * Root causes fixed:
 *   1. Tab badges used panels[TAB].length — diverted refs to VAULT/AGOTADOS
 *   2. "Cobertura suficiente" used operationalState instead of pure threshold
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const CLIENT_PATH = path.resolve(
  __dirname,
  "../../../app/(app)/[orgSlug]/comercial/inventario/inventario-client.tsx"
);
const src = fs.readFileSync(CLIENT_PATH, "utf-8");

// ── G1: Tab counts derive from canonicalItems, not panels ──────────────

describe("G1 — Tab counts derive from canonical B01 universe", () => {
  test("T1a: tabCounts iterates canonicalItems, not panels", () => {
    // Must iterate canonicalItems by canonicalLine for line tab counts
    expect(src).toContain("for (const ci of canonicalItems)");
    expect(src).toContain('lineCounts[ci.canonicalLine]');
  });

  test("T1b: Line tab counts use lineCounts, not panels[TAB].length", () => {
    // CASTILLITOS/LATIN_KIDS/IMPORTACION/SIN_CLASIFICAR use lineCounts
    expect(src).toContain('CASTILLITOS: lineCounts["CASTILLITOS"]');
    expect(src).toContain('LATIN_KIDS: lineCounts["LATIN_KIDS"]');
    expect(src).toContain('IMPORTACION: lineCounts["IMPORTACION"]');
    expect(src).toContain('SIN_CLASIFICAR: lineCounts["SIN_CLASIFICAR"]');
  });

  test("T1c: AGOTADOS/VAULT still use panels length", () => {
    expect(src).toContain("AGOTADOS: panels.AGOTADOS.length");
    expect(src).toContain("VAULT: panels.VAULT.length");
  });

  test("T1d: EXTERNAL_EXCLUDED refs skipped via exclusionReason guard", () => {
    expect(src).toContain("if (ci.exclusionReason) continue");
  });

  test("T1e: tabCounts depends on canonicalItems (not only panels)", () => {
    expect(src).toContain("[canonicalItems, panels]");
  });
});

// ── G2: Line tab items derive from canonicalItems by canonicalLine ──────

describe("G2 — Line tab items use canonical B01 universe", () => {
  test("T2a: Line tabs filter canonicalItems by canonicalLine", () => {
    expect(src).toContain(
      "canonicalItems.filter(\n      ci => ci.canonicalLine === activeTab && !ci.exclusionReason,"
    );
  });

  test("T2b: VAULT/AGOTADOS still use panels[activeTab]", () => {
    expect(src).toContain("let result = panels[activeTab]");
  });

  test("T2c: panelItems depends on canonicalItems", () => {
    expect(src).toContain("[canonicalItems, panels, activeTab, search]");
  });
});

// ── G3: Cobertura suficiente uses pure threshold ────────────────────────

describe("G3 — Cobertura suficiente filter uses pure threshold", () => {
  test("T3a: Filter checks disponibleReal > threshold (not operationalState)", () => {
    expect(src).toContain("orig.disponibleReal > orig.threshold");
  });

  test("T3b: Null threshold excluded from cobertura suficiente", () => {
    expect(src).toContain("orig.threshold == null) return false");
  });

  test("T3c: No operationalState check in cobertura_suficiente filter", () => {
    // The old pattern used operationalState === "disponible" || "alta_disponibilidad"
    // Must NOT appear in the cobertura_suficiente case
    const csStart = src.indexOf('case "cobertura_suficiente"');
    const csEnd = src.indexOf("break;", csStart);
    const csBlock = src.slice(csStart, csEnd);
    expect(csBlock).not.toContain("operationalState");
  });
});

// ── G4: Bajo filter uses pure threshold ─────────────────────────────────

describe("G4 — Bajo filter uses pure threshold", () => {
  test("T4a: Bajo checks disponibleReal > 0 && disponibleReal <= threshold", () => {
    expect(src).toContain("orig.disponibleReal > 0 && orig.disponibleReal <= orig.threshold");
  });

  test("T4b: Null threshold excluded from bajo", () => {
    const bajoStart = src.indexOf('case "bajo"');
    const bajoEnd = src.indexOf("break;", bajoStart);
    const bajoBlock = src.slice(bajoStart, bajoEnd);
    expect(bajoBlock).toContain("orig.threshold == null");
  });

  test("T4c: No operationalState check in bajo filter", () => {
    const bajoStart = src.indexOf('case "bajo"');
    const bajoEnd = src.indexOf("break;", bajoStart);
    const bajoBlock = src.slice(bajoStart, bajoEnd);
    expect(bajoBlock).not.toContain("operationalState");
  });
});

// ── G5: Sin cobertura filter unchanged ──────────────────────────────────

describe("G5 — Sin cobertura filter", () => {
  test("T5a: Sin cobertura uses disponibleReal <= 0", () => {
    const scStart = src.indexOf('case "sin_cobertura"');
    const scEnd = src.indexOf("break;", scStart);
    const scBlock = src.slice(scStart, scEnd);
    expect(scBlock).toContain("orig.disponibleReal <= 0");
  });
});

// ── G6: Result count is post-filter, pre-pagination ─────────────────────

describe("G6 — Result count semantics", () => {
  test("T6a: Result count uses filteredPanelItems.length", () => {
    expect(src).toContain("filteredPanelItems.length} referencia");
  });

  test("T6b: PAGE_SIZE exists for pagination", () => {
    expect(src).toContain("PAGE_SIZE");
  });
});

// ── G7: Cross-panel hint updated for canonical source ───────────────────

describe("G7 — Cross-panel search hint", () => {
  test("T7a: Line tabs in crossPanelHint use canonicalItems, not panels", () => {
    expect(src).toContain(
      "canonicalItems.filter(ci => ci.canonicalLine === tab && !ci.exclusionReason)"
    );
  });

  test("T7b: LINE_TABS set defined for tab classification", () => {
    expect(src).toContain('const LINE_TABS = new Set');
  });

  test("T7c: crossPanelHint depends on canonicalItems", () => {
    expect(src).toContain("[search, panelItems.length, activeTab, canonicalItems, panels]");
  });
});

// ── G8: No prohibited patterns ──────────────────────────────────────────

describe("G8 — Prohibited patterns absent", () => {
  test("T8a: No panels[TAB].length in line tab counts", () => {
    // After 04A5, line tabs must NOT use panels.CASTILLITOS.length etc.
    expect(src).not.toContain("CASTILLITOS: panels.CASTILLITOS.length");
    expect(src).not.toContain("LATIN_KIDS: panels.LATIN_KIDS.length");
    expect(src).not.toContain("IMPORTACION: panels.IMPORTACION.length");
    expect(src).not.toContain("SIN_CLASIFICAR: panels.SIN_CLASIFICAR.length");
  });

  test("T8b: cobertura_suficiente does not use operationalState match", () => {
    expect(src).not.toContain(
      'orig.operationalState === "disponible" || orig.operationalState === "alta_disponibilidad"'
    );
  });

  test("T8c: bajo does not use operationalState match for bajo/critico", () => {
    expect(src).not.toContain(
      'orig.operationalState === "bajo" || orig.operationalState === "critico"'
    );
  });
});

// ── G9: Structural invariants preserved ─────────────────────────────────

describe("G9 — Structural invariants", () => {
  test("T9a: originalItemsByRef map still built from items", () => {
    expect(src).toContain("for (const item of items)");
    expect(src).toContain("map.set(item.reference, item)");
  });

  test("T9b: con_disponibilidad filter still uses disponibleReal > 0", () => {
    const cdStart = src.indexOf('case "con_disponibilidad"');
    const cdEnd = src.indexOf("break;", cdStart);
    const cdBlock = src.slice(cdStart, cdEnd);
    expect(cdBlock).toContain("orig.disponibleReal > 0");
  });

  test("T9c: sin_cobertura filter still uses disponibleReal <= 0", () => {
    const scStart = src.indexOf('case "sin_cobertura"');
    const scEnd = src.indexOf("break;", scStart);
    const scBlock = src.slice(scStart, scEnd);
    expect(scBlock).toContain("orig.disponibleReal <= 0");
  });

  test("T9d: switchTab resets filter, search, and pageMap", () => {
    expect(src).toContain('setFilter("todos")');
    expect(src).toContain('setSearch("")');
    expect(src).toContain("setPageMap({})");
  });

  test("T9e: VAULT/AGOTADOS tabs bypass filter logic", () => {
    expect(src).toContain(
      'if (activeTab === "VAULT" || activeTab === "AGOTADOS") return panelItems'
    );
  });
});

// ── G10: Comment documentation ──────────────────────────────────────────

describe("G10 — 04A5 documentation", () => {
  test("T10a: tabCounts has 04A5 comment", () => {
    expect(src).toContain("04A5: Line tab badges show the canonical B01 universe per line");
  });

  test("T10b: panelItems has 04A5 comment", () => {
    expect(src).toContain("04A5: Line tabs use ALL canonicalItems with matching canonicalLine");
  });

  test("T10c: cobertura_suficiente has 04A5 comment", () => {
    expect(src).toContain("04A5: Pure threshold");
  });

  test("T10d: bajo has 04A5 comment", () => {
    expect(src).toContain("04A5: Below threshold but above zero");
  });
});
