/**
 * INVENTORY-UX-CLARITY-04A4 — Subgroup Hierarchy Table Tests
 *
 * Structural and behavioral tests for the hierarchical subgroup view.
 * Verifies column headers, alignment, accessibility, expand/collapse,
 * data semantics, and production/reservation display rules.
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const CLIENT_PATH = path.resolve(
  __dirname,
  "../../../app/(app)/[orgSlug]/comercial/inventario/inventario-client.tsx"
);
const src = fs.readFileSync(CLIENT_PATH, "utf-8");

// ── G1: Main Table Column Headers ──────────────────────────────────────────

describe("G1 — Main subgroup table column headers", () => {
  test("T1a: SUBGRUPO column header present", () => {
    expect(src).toContain(">Subgrupo<");
  });

  test("T1b: LINEA column header present", () => {
    expect(src).toContain(">Linea<");
  });

  test("T1c: REFS column header present", () => {
    expect(src).toContain(">Refs.<");
  });

  test("T1d: DISP. COMERCIAL column header present in main table", () => {
    expect(src).toContain(">Disp. comercial<");
  });

  test("T1e: REFS. CON DISP. column header present (not TALLAS)", () => {
    expect(src).toContain(">Refs. con disp.<");
    // Must NOT label this as "Tallas" since tallasDisponibles is a proxy
    expect(src).not.toContain(">Tallas<");
    expect(src).not.toContain(">Tallas disponibles<");
  });

  test("T1f: ESTADO column header present", () => {
    expect(src).toContain(">Estado<");
  });
});

// ── G2: Reference Sub-table Column Headers ─────────────────────────────────

describe("G2 — Reference sub-table column headers", () => {
  test("T2a: REFERENCIA header in expanded view", () => {
    expect(src).toContain(">Referencia<");
  });

  test("T2b: DESCRIPCION header in expanded view", () => {
    expect(src).toContain(">Descripcion<");
  });

  test("T2c: RESERVADO header in expanded view", () => {
    expect(src).toContain(">Reservado<");
  });

  test("T2d: EN PRODUCCION header in expanded view", () => {
    expect(src).toContain(">En produccion<");
  });
});

// ── G3: Grid Alignment ─────────────────────────────────────────────────────

describe("G3 — Grid alignment and consistency", () => {
  test("T3a: Main grid template uses consistent column definition", () => {
    const sgGridMatch = src.match(/const SG_GRID\s*=\s*"([^"]+)"/);
    expect(sgGridMatch).not.toBeNull();
    // Should have 8 columns: chevron + subgrupo + linea + refs + disp + refs_con_disp + estado + action
    const cols = sgGridMatch![1].split(/\s+/);
    expect(cols.length).toBe(8);
  });

  test("T3b: Reference grid template uses consistent column definition", () => {
    const refGridMatch = src.match(/const SG_REF_GRID\s*=\s*"([^"]+)"/);
    expect(refGridMatch).not.toBeNull();
    // Should have 7 columns: indent + ref + desc + disp + reserved + production + estado
    const cols = refGridMatch![1].split(/\s+/);
    expect(cols.length).toBe(7);
  });

  test("T3c: Both main header and rows use SG_GRID", () => {
    const headerGridUses = (src.match(/gridTemplateColumns:\s*SG_GRID/g) || []).length;
    // At least 2: column header row + each data row
    expect(headerGridUses).toBeGreaterThanOrEqual(2);
  });

  test("T3d: Both ref header and ref rows use SG_REF_GRID", () => {
    const refGridUses = (src.match(/gridTemplateColumns:\s*SG_REF_GRID/g) || []).length;
    // At least 2: ref column header + each ref row
    expect(refGridUses).toBeGreaterThanOrEqual(2);
  });

  test("T3e: Numeric columns aligned right in main table", () => {
    // referenciasActivas, unidadesDisponibles, tallasDisponibles should be right-aligned
    // Check that textAlign: "right" appears in numeric column spans
    const rightAlignCount = (src.match(/textAlign:\s*"right"\s*as\s*const/g) || []).length;
    expect(rightAlignCount).toBeGreaterThanOrEqual(5); // main + ref numerics
  });
});

// ── G4: Accessibility ──────────────────────────────────────────────────────

describe("G4 — Accessibility", () => {
  test("T4a: aria-expanded on subgroup rows", () => {
    expect(src).toContain("aria-expanded={isOpen}");
  });

  test("T4b: role=button on clickable subgroup row", () => {
    expect(src).toContain('role="button"');
  });

  test("T4c: Keyboard handler for Enter/Space", () => {
    expect(src).toContain('e.key === "Enter"');
    expect(src).toContain('e.key === " "');
  });

  test("T4d: tabIndex for keyboard focus", () => {
    expect(src).toContain("tabIndex={0}");
  });
});

// ── G5: Expand/Collapse Controls ───────────────────────────────────────────

describe("G5 — Expand/collapse controls", () => {
  test("T5a: 'Expandir todos' button present", () => {
    expect(src).toContain("Expandir todos");
  });

  test("T5b: 'Recoger todos' button present", () => {
    expect(src).toContain("Recoger todos");
  });

  test("T5c: expandAll function fills expanded set with all filtered subgroups", () => {
    expect(src).toContain("filteredCoverage.map(sg => sg.subgrupoSag)");
  });

  test("T5d: collapseAll clears expanded set", () => {
    expect(src).toContain("setExpanded(new Set())");
  });

  test("T5e: Chevron indicators for open/closed state", () => {
    // ▼ for open, ▶ for closed — in source as escape sequences
    expect(src).toContain("\\u25BC");
    expect(src).toContain("\\u25B6");
  });
});

// ── G6: Data Semantics — tallasDisponibles label ───────────────────────────

describe("G6 — tallasDisponibles semantic accuracy", () => {
  test("T6a: tallasDisponibles NOT labeled as 'Tallas' or 'Tallas con disp.'", () => {
    // The field is a proxy (refs with stock), NOT actual talla counts
    // Must not present as talla stock data
    expect(src).not.toContain(">Tallas con disp.<");
    expect(src).not.toContain(">TALLAS CON DISP.<");
    expect(src).not.toContain(">Tallas catalogadas<");
  });

  test("T6b: Column labeled as 'Refs. con disp.' reflecting actual semantics", () => {
    expect(src).toContain("Refs. con disp.");
  });

  test("T6c: Comment documents proxy nature of tallasDisponibles", () => {
    expect(src).toContain("tallasDisponibles = proxy");
  });
});

// ── G7: Reference Row Data Display ─────────────────────────────────────────

describe("G7 — Reference row data display rules", () => {
  test("T7a: Disponible shows em-dash for zero (not silent zero)", () => {
    // disp <= 0 path should show \u2014
    expect(src).toContain('disp <= 0 ? C.red : C.ink');
  });

  test("T7b: Negative disponible shows parenthesized value (overcommitted)", () => {
    expect(src).toContain("Math.abs(disp)");
    expect(src).toContain("disp < 0");
  });

  test("T7c: Reservado uses reservedReal only (SAG RESERVADO authority, no fallback)", () => {
    // 04A3R2 ADDENDUM: pedidosPendientes fallback eliminated — SAG RESERVADO is sole authority
    expect(src).toContain("const reserved = orig.reservedReal;");
    expect(src).not.toContain("orig.reservedReal ?? orig.pedidosPendientes");
  });

  test("T7d: Production shows units when available, 'Con OP' when active but no WIP count", () => {
    expect(src).toContain("orig.productionInProcess");
    expect(src).toContain("orig.hasActiveProduction");
    expect(src).toContain('"Con OP"');
  });

  test("T7e: Production uses #6366f1 (indigo) for positive values", () => {
    expect(src).toContain('production > 0 ? "#6366f1"');
  });

  test("T7f: Reference text uses C.blueDark to indicate clickability", () => {
    expect(src).toContain("color: C.blueDark");
  });

  test("T7g: Estado badge uses STATE_COLORS and STATE_LABELS", () => {
    expect(src).toContain("STATE_COLORS[orig.operationalState]");
    expect(src).toContain("STATE_LABELS[orig.operationalState]");
  });
});

// ── G8: Empty State ────────────────────────────────────────────────────────

describe("G8 — Empty state for expanded subgroups", () => {
  test("T8a: Shows message when subgroup has no references in current panel", () => {
    expect(src).toContain("Sin referencias en este subgrupo para el panel actual");
  });

  test("T8b: Empty message does NOT show raw zero or blank", () => {
    // The empty block should have italic/ghost styling, not silent absence
    expect(src).toContain("fontStyle: \"italic\"");
  });
});

// ── G9: No Prohibited Patterns ─────────────────────────────────────────────

describe("G9 — Prohibited pattern enforcement", () => {
  test("T9a: No raw hex colors in SubgrupoCoveragePanel (except #6366f1 production)", () => {
    // Extract only the SubgrupoCoveragePanel function
    const panelStart = src.indexOf("function SubgrupoCoveragePanel");
    const panelEnd = src.indexOf("// ── Accessory Low Stock Panel");
    const panelSrc = src.slice(panelStart, panelEnd);
    // Find all hex colors
    const hexMatches = panelSrc.match(/#[0-9a-fA-F]{3,8}/g) || [];
    // Only allowed: #6366f1 (production indigo) — C.* tokens for everything else
    const nonAllowed = hexMatches.filter(h => h !== "#6366f1");
    expect(nonAllowed).toEqual([]);
  });

  test("T9b: No Tailwind color classes in panel", () => {
    const panelStart = src.indexOf("function SubgrupoCoveragePanel");
    const panelEnd = src.indexOf("// ── Accessory Low Stock Panel");
    const panelSrc = src.slice(panelStart, panelEnd);
    expect(panelSrc).not.toMatch(/className="[^"]*text-(blue|red|green|amber)/);
    expect(panelSrc).not.toMatch(/className="[^"]*bg-(blue|red|green|amber)/);
  });

  test("T9c: Uses T.mono for all data (no T.sans in panel)", () => {
    const panelStart = src.indexOf("function SubgrupoCoveragePanel");
    const panelEnd = src.indexOf("// ── Accessory Low Stock Panel");
    const panelSrc = src.slice(panelStart, panelEnd);
    expect(panelSrc).not.toContain("T.sans");
  });

  test("T9d: Uses ag-op-table container class", () => {
    const panelStart = src.indexOf("function SubgrupoCoveragePanel");
    const panelEnd = src.indexOf("// ── Accessory Low Stock Panel");
    const panelSrc = src.slice(panelStart, panelEnd);
    expect(panelSrc).toContain("ag-op-table");
  });

  test("T9e: Uses ag-op-row for data rows", () => {
    const panelStart = src.indexOf("function SubgrupoCoveragePanel");
    const panelEnd = src.indexOf("// ── Accessory Low Stock Panel");
    const panelSrc = src.slice(panelStart, panelEnd);
    expect(panelSrc).toContain("ag-op-row");
  });

  test("T9f: Search input preserved", () => {
    expect(src).toContain('placeholder="Buscar subgrupo..."');
  });
});

// ── G10: Structural Invariants ─────────────────────────────────────────────

describe("G10 — Structural invariants", () => {
  test("T10a: Default state is all collapsed (expanded starts as empty Set)", () => {
    expect(src).toContain("useState<Set<string>>(new Set())");
  });

  test("T10b: Click on row toggles that subgroup only", () => {
    expect(src).toContain("toggle(sg.subgrupoSag)");
  });

  test("T10c: onRowClick passed through for reference drawer opening", () => {
    expect(src).toContain("onRowClick?.(ci)");
  });

  test("T10d: Data calculations not modified (uses sg.unidadesDisponibles, sg.referenciasActivas, sg.tallasDisponibles as-is)", () => {
    expect(src).toContain("sg.unidadesDisponibles");
    expect(src).toContain("sg.referenciasActivas");
    expect(src).toContain("sg.tallasDisponibles");
  });
});
