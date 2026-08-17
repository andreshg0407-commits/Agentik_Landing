/**
 * INVENTORY-LINE-HIERARCHY-04A5H — Line-Specific Hierarchy Tests
 *
 * Structural tests verifying that the hierarchical view uses line-specific
 * profiles (CASTILLITOS=3-level, LATIN_KIDS=2-level, IMPORTACION=tamaño,
 * SIN_CLASIFICAR=dimension bucket) from canonicalItems via resolveInventoryHierarchy.
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const CLIENT_PATH = path.resolve(
  __dirname,
  "../../../app/(app)/[orgSlug]/comercial/inventario/inventario-client.tsx"
);
const src = fs.readFileSync(CLIENT_PATH, "utf-8");

// ── T1: Castillitos hierarchy — GRUPO → SUBGRUPO → REFS (3 levels) ─────────

describe("T1 — Castillitos 3-level hierarchy", () => {
  test("T1a: buildCastillitosHierarchy function exists", () => {
    expect(src).toContain("function buildCastillitosHierarchy(");
  });

  test("T1b: CS groups by grupoSag then subgrupoSag", () => {
    const fn = src.slice(
      src.indexOf("function buildCastillitosHierarchy("),
      src.indexOf("// ── LATIN KIDS:")
    );
    expect(fn).toContain("grupoSag");
    expect(fn).toContain("subgrupoSag");
  });

  test("T1c: CS subgroups keyed with composite key preserving grupo separation", () => {
    // Subgroup key format: S::grupo::subgrupo — prevents cross-grupo merge
    expect(src).toContain("`S::${grupo}::${sg}`");
  });

  test("T1d: CS grupo keyed with G:: prefix", () => {
    expect(src).toContain("`G::${grupo}`");
  });

  test("T1e: is3Level check uses CASTILLITOS", () => {
    expect(src).toContain('lineProfile === "CASTILLITOS"');
  });
});

// ── T2: Homonymous subgroups in CS stay separate ────────────────────────────

describe("T2 — Homonymous subgroups under different grupos do not merge", () => {
  test("T2a: Subgroup key includes grupo prefix", () => {
    // S::PRODUCTO TERMINADO::PIJAMA vs S::MATERIA PRIMA::PIJAMA stay distinct
    expect(src).toContain("`S::${grupo}::${sg}`");
  });
});

// ── T3: Latin Kids hierarchy — SUBGRUPO → REFS (no grupo) ──────────────────

describe("T3 — Latin Kids 2-level hierarchy", () => {
  test("T3a: buildLatinKidsHierarchy function exists", () => {
    expect(src).toContain("function buildLatinKidsHierarchy(");
  });

  test("T3b: LT groups by subgrupoSag only (no grupo level)", () => {
    const fn = src.slice(
      src.indexOf("function buildLatinKidsHierarchy("),
      src.indexOf("// ── IMPORTACION:")
    );
    expect(fn).toContain("subgrupoSag");
    // No grupoMap (2-level grouping), only sgMap
    expect(fn).not.toContain("grupoMap");
    expect(fn).toContain("sgMap");
  });

  test("T3c: LT group key is simple G:: prefix (no grupo composite)", () => {
    const fn = src.slice(
      src.indexOf("function buildLatinKidsHierarchy("),
      src.indexOf("// ── IMPORTACION:")
    );
    expect(fn).toContain("`G::${sg}`");
    expect(fn).not.toContain("`S::");
  });
});

// ── T4: LT tab contains zero Castillitos nodes ─────────────────────────────

describe("T4 — LT tab isolation from CS", () => {
  test("T4a: Hierarchy built from lineScopedCanonicalItems filtered by canonicalLine", () => {
    expect(src).toContain("canonicalItems.filter(ci => ci.canonicalLine === activeTab && !ci.exclusionReason)");
  });

  test("T4b: resolveInventoryHierarchy dispatches by lineProfile", () => {
    const fn = src.slice(
      src.indexOf("function resolveInventoryHierarchy("),
      src.indexOf("function buildCastillitosHierarchy(")
    );
    expect(fn).toContain('case "CASTILLITOS"');
    expect(fn).toContain('case "LATIN_KIDS"');
    expect(fn).toContain('case "IMPORTACION"');
    expect(fn).toContain('case "SIN_CLASIFICAR"');
  });
});

// ── T5: Importacion hierarchy — TAMAÑO → REFS ──────────────────────────────

describe("T5 — Importacion tamano hierarchy", () => {
  test("T5a: buildImportacionHierarchy function exists", () => {
    expect(src).toContain("function buildImportacionHierarchy(");
  });

  test("T5b: IMP groups by handlingUnit", () => {
    const fn = src.slice(
      src.indexOf("function buildImportacionHierarchy("),
      src.indexOf("// ── SIN CLASIFICAR:")
    );
    expect(fn).toContain("handlingUnit");
    expect(fn).not.toContain("grupoSag");
    expect(fn).not.toContain("subgrupoSag");
  });

  test("T5c: Missing handlingUnit produces 'Sin tamano' bucket", () => {
    expect(src).toContain('"Sin tamano"');
  });
});

// ── T6: Missing dimension produces visible fail-closed bucket ───────────────

describe("T6 — Sin clasificar dimension buckets", () => {
  test("T6a: buildSinClasificarHierarchy function exists", () => {
    expect(src).toContain("function buildSinClasificarHierarchy(");
  });

  test("T6b: Missing grupo and subgrupo produces explicit bucket", () => {
    expect(src).toContain('"Sin grupo ni subgrupo"');
  });

  test("T6c: Missing grupo only produces explicit bucket", () => {
    expect(src).toContain('"Sin grupo"');
  });
});

// ── T7: Parent with N refs expands exactly N ────────────────────────────────

describe("T7 — Parent/child parity invariants", () => {
  test("T7a: refCount computed as items.length for leaf groups", () => {
    const fn = src.slice(
      src.indexOf("function computeGroupAggregates("),
      src.indexOf("function makeHGroup(")
    );
    expect(fn).toContain("refCount: items.length");
  });

  test("T7b: refCount computed as SUM(children.refCount) for parent groups", () => {
    const fn = src.slice(
      src.indexOf("function computeGroupAggregates("),
      src.indexOf("function makeHGroup(")
    );
    expect(fn).toContain("children.reduce((s, c) => s + c.refCount, 0)");
  });

  test("T7c: availability = SUM of descendant disponibleReal", () => {
    expect(src).toContain("orig?.disponibleReal ?? 0");
  });

  test("T7d: refsWithAvail = COUNT where disponibleReal > 0", () => {
    expect(src).toContain("orig.disponibleReal > 0");
  });
});

// ── T8: Sum of children matches parent ──────────────────────────────────────

describe("T8 — Aggregate reconciliation", () => {
  test("T8a: Parent aggregates delegate to computeGroupAggregates", () => {
    expect(src).toContain("computeGroupAggregates(items, children, originalItemsByRef)");
  });

  test("T8b: computeGroupAggregates returns consistent structure", () => {
    const fn = src.slice(
      src.indexOf("function computeGroupAggregates("),
      src.indexOf("function makeHGroup(")
    );
    expect(fn).toContain("refCount:");
    expect(fn).toContain("availability:");
    expect(fn).toContain("refsWithAvail:");
  });
});

// ── T9: Tab switch clears expansion ─────────────────────────────────────────

describe("T9 — Tab switch clears expansion", () => {
  test("T9a: switchTab clears expandedGroups", () => {
    const fn = src.slice(src.indexOf("const switchTab"), src.indexOf("const switchTab") + 300);
    expect(fn).toContain("setExpandedGroups(new Set())");
  });

  test("T9b: switchTab clears expandedSubgroups", () => {
    const fn = src.slice(src.indexOf("const switchTab"), src.indexOf("const switchTab") + 300);
    expect(fn).toContain("setExpandedSubgroups(new Set())");
  });
});

// ── T10: Search maintains ancestors visible ─────────────────────────────────

describe("T10 — Search behavior in hierarchy", () => {
  test("T10a: Search matches group labels", () => {
    expect(src).toContain("matchesSearch(group.label)");
  });

  test("T10b: Search matches child labels in 3-level", () => {
    expect(src).toContain("matchesSearch(child.label)");
  });

  test("T10c: Search matches ref code and description", () => {
    expect(src).toContain("ci.reference.toLowerCase().includes(q) || ci.description.toLowerCase().includes(q)");
  });

  test("T10d: Search auto-expands groups (hasSearch prop)", () => {
    expect(src).toContain("hasSearch || expandedGroups.has(group.key)");
  });
});

// ── T11: No empty nodes rendered ────────────────────────────────────────────

describe("T11 — No empty nodes rendered", () => {
  test("T11a: filterHierarchy removes groups with 0 visible items", () => {
    const fn = src.slice(
      src.indexOf("function filterHierarchy("),
      src.indexOf("// ── 04A5H: HierarchicalTable Component")
    );
    expect(fn).toContain("if (visibleItems.length === 0) return null");
    expect(fn).toContain("if (visibleChildren.length === 0) return null");
  });

  test("T11b: Filtered nodes pruned via filter(Boolean)", () => {
    const fn = src.slice(
      src.indexOf("function filterHierarchy("),
      src.indexOf("// ── 04A5H: HierarchicalTable Component")
    );
    expect(fn).toContain(".filter((g): g is HierarchyGroup => g !== null)");
  });
});

// ── T12: 04A5 regression — counters and filters preserved ───────────────────

describe("T12 — 04A5 regression: dynamic counters and filters preserved", () => {
  test("T12a: Tab counts still derive from canonicalItems by canonicalLine", () => {
    expect(src).toContain('lineCounts[ci.canonicalLine]');
  });

  test("T12b: Cobertura suficiente still uses pure threshold", () => {
    expect(src).toContain("orig.disponibleReal > orig.threshold");
  });

  test("T12c: isRefPassesFilter replicates 04A5 filter predicates", () => {
    const fn = src.slice(
      src.indexOf("function isRefPassesFilter("),
      src.indexOf("function filterHierarchy(")
    );
    expect(fn).toContain("orig.threshold != null && orig.disponibleReal > orig.threshold");
    expect(fn).toContain("orig.threshold != null && orig.disponibleReal > 0 && orig.disponibleReal <= orig.threshold");
    expect(fn).toContain("orig.disponibleReal <= 0");
  });

  test("T12d: HierarchicalTable replaces LineBasedTable in render", () => {
    expect(src).toContain("<HierarchicalTable");
    // LineBasedTable function still exists but is no longer invoked in main render
    const renderSection = src.slice(
      src.indexOf("04A5H: Hierarchical Tab Content"),
      src.indexOf("AGOTADOS Tab Content")
    );
    expect(renderSection).not.toContain("<LineBasedTable");
  });

  test("T12e: AGOTADOS/VAULT tabs unchanged", () => {
    expect(src).toContain("<AgotadosTabContent");
    expect(src).toContain("<VaultTabContent");
  });

  test("T12f: Drawer unchanged", () => {
    expect(src).toContain("<CommercialProductDrawer");
  });
});

// ── T13: Expand/collapse controls ───────────────────────────────────────────

describe("T13 — Expand/collapse controls", () => {
  test("T13a: expandAll expands all groups in filtered hierarchy", () => {
    expect(src).toContain("filteredHierarchyResult.nodes.map(g => g.key)");
  });

  test("T13b: expandAll for CS also expands subgroups", () => {
    expect(src).toContain("filteredHierarchyResult.nodes.flatMap(g => g.children.map(c => c.key))");
  });

  test("T13c: collapseAll clears both sets", () => {
    const fn = src.slice(src.indexOf("const collapseAllHierarchy"), src.indexOf("const collapseAllHierarchy") + 200);
    expect(fn).toContain("setExpandedGroups(new Set())");
    expect(fn).toContain("setExpandedSubgroups(new Set())");
  });

  test("T13d: aria-expanded on group headers", () => {
    expect(src).toContain("aria-expanded={expanded}");
  });

  test("T13e: Keyboard Enter/Space on group headers", () => {
    expect(src).toContain('e.key === "Enter"');
    expect(src).toContain('e.key === " "');
  });
});

// ── T14: HierarchyGroup interface invariants ────────────────────────────────

describe("T14 — HierarchyGroup type contract", () => {
  test("T14a: HierarchyGroup has refCount field", () => {
    expect(src).toContain("refCount: number");
  });

  test("T14b: HierarchyGroup has availability field", () => {
    expect(src).toContain("availability: number");
  });

  test("T14c: HierarchyGroup has refsWithAvail field", () => {
    expect(src).toContain("refsWithAvail: number");
  });

  test("T14d: HierarchyGroup has children and items arrays", () => {
    expect(src).toContain("items: CanonicalInventoryItemStatus[]");
    expect(src).toContain("children: HierarchyGroup[]");
  });
});

// ── T15: Rendering components ───────────────────────────────────────────────

describe("T15 — Rendering components exist", () => {
  test("T15a: HierarchicalTable component exists", () => {
    expect(src).toContain("function HierarchicalTable(");
  });

  test("T15b: HierarchyGroupHeader component exists", () => {
    expect(src).toContain("function HierarchyGroupHeader(");
  });

  test("T15c: HierarchyRefBlock component exists", () => {
    expect(src).toContain("function HierarchyRefBlock(");
  });

  test("T15d: Ref rows show disponibleReal, reservedReal, and estado", () => {
    // Within HierarchyRefBlock
    const fn = src.slice(
      src.indexOf("function HierarchyRefBlock("),
      src.indexOf("// ── Subgrupo Coverage Panel")
    );
    expect(fn).toContain("orig.disponibleReal");
    expect(fn).toContain("orig.reservedReal");
    expect(fn).toContain("STATE_LABELS[orig.operationalState]");
  });
});
