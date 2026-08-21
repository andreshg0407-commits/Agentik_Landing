/**
 * P0-ACTIVE-PRODUCTION-ORDER-TRUTH-08B2R6G
 *
 * Tests:
 *   G-01: opTruthAudit returned by loader
 *   G-02: B04 physical inventory != real OP
 *   G-03: Widget title says "Producto en proceso" not "OP Activas"
 *   G-04: Legacy OP (ProductionOrder fuente 33) exists in sync pipeline
 *   G-05: Legacy OP producedQty is null (not certified)
 *   G-06: pendingQty = quantityOrdered when producedQty unknown
 *   G-07: B04 candidates require subgrupoSag
 *   G-08: opTruthAudit displays in B04 section
 *   G-09: Three truth states for OP source
 *   G-10: OP truth audit explanation present
 *   G-11: Empty return paths include opTruthAudit
 *   G-12: Coverage authority is B04_PHYSICAL
 */

// @ts-expect-error — vitest types resolved at runtime via npx, not a project dependency
import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const worktreeRoot = path.resolve(__dirname, "../../..");
function readSrc(relPath: string): string {
  return fs.readFileSync(path.resolve(worktreeRoot, relPath), "utf8");
}

const loaderSrc = readSrc("lib/comercial/maletas/vendor-sample-loader.ts");
const clientSrc = readSrc("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");
const pageSrc = readSrc("app/(app)/[orgSlug]/comercial/maletas/page.tsx");

// ══════════════════════════════════════════════════════════════════════════
// G-01: opTruthAudit returned by loader
// ══════════════════════════════════════════════════════════════════════════

describe("G-01: opTruthAudit in loader return", () => {
  test("opTruthAudit is in VendorSampleLoadResult interface", () => {
    expect(loaderSrc).toContain("opTruthAudit:");
  });

  test("opTruthAudit computed in main return path", () => {
    expect(loaderSrc).toContain("b04PhysicalRefs: b04Inventory.totalRefs");
  });

  test("opTruthAudit passed from page to client", () => {
    expect(pageSrc).toContain("opTruthAudit={data.opTruthAudit}");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// G-02: B04 is physical inventory, not real OP
// ══════════════════════════════════════════════════════════════════════════

describe("G-02: B04 != real OP", () => {
  test("loader documents B04 as physical inventory", () => {
    expect(loaderSrc).toContain("B04 = inventario fisico en Producto en Proceso");
  });

  test("B04 candidates use opNumber='B04' marker", () => {
    expect(loaderSrc).toContain('opNumber: "B04"');
  });

  test("opCoverageAuthority is B04_PHYSICAL", () => {
    expect(loaderSrc).toContain('opCoverageAuthority: "B04_PHYSICAL"');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// G-03: Widget title
// ══════════════════════════════════════════════════════════════════════════

describe("G-03: widget title corrected", () => {
  test("B04 section says 'Producto en proceso' not 'OP Activas'", () => {
    expect(clientSrc).toContain("Producto en proceso");
    // The old title should only remain in a comment
    const uiTitle = clientSrc.split("\n").filter(l =>
      l.includes("Inventario de OP Activas") && !l.trim().startsWith("//") && !l.trim().startsWith("{/*") && !l.trim().startsWith("*")
    );
    expect(uiTitle.length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// G-04: Legacy OP sync exists
// ══════════════════════════════════════════════════════════════════════════

describe("G-04: real OP sync pipeline exists", () => {
  test("ProductionOrder query uses fuente 33 (MOVIMIENTOS)", () => {
    const syncSrc = readSrc("lib/connectors/adapters/sag-pya-soap/production/sag-production-sync.ts");
    expect(syncSrc).toContain("ka_ni_fuente = 33");
  });

  test("loadOpBySubgrupo queries ProductionOrder table", () => {
    expect(loaderSrc).toContain('FROM "ProductionOrderLine" pol');
    expect(loaderSrc).toContain('JOIN "ProductionOrder" po');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// G-05: producedQty is null (uncertified)
// ══════════════════════════════════════════════════════════════════════════

describe("G-05: producedQty null", () => {
  test("legacy OP sets producedQty to null", () => {
    expect(loaderSrc).toContain("producedQty: null");
  });

  test("pendingQtyQuality marked as ESTIMATED", () => {
    expect(loaderSrc).toContain('pendingQtyQuality: "ESTIMATED"');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// G-06: pendingQty = quantityOrdered when uncertified
// ══════════════════════════════════════════════════════════════════════════

describe("G-06: pendingQty estimation", () => {
  test("pendingQty defaults to quantityOrdered", () => {
    expect(loaderSrc).toContain("pendingQty: Math.round(line.quantityOrdered)");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// G-07: B04 candidates require subgrupoSag
// ══════════════════════════════════════════════════════════════════════════

describe("G-07: subgrupoSag required for B04 candidates", () => {
  test("B04 refs without subgrupoSag are skipped", () => {
    expect(loaderSrc).toContain("if (!b04Ref.subgrupoSag) continue");
  });

  test("opTruthAudit counts rejected refs", () => {
    expect(loaderSrc).toContain("b04RejectedNoSubgrupo");
    expect(loaderSrc).toContain("b04Inventory.refs.filter(r => !r.subgrupoSag)");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// G-08: opTruthAudit displayed in B04 section
// ══════════════════════════════════════════════════════════════════════════

describe("G-08: OP truth audit in UI", () => {
  test("B04 section receives opTruthAudit prop", () => {
    expect(clientSrc).toContain("opTruthAudit: MaletasClientProps");
  });

  test("UI shows OP source truth state", () => {
    expect(clientSrc).toContain("opTruthAudit.opSourceTruthState");
  });

  test("UI shows B04 physical ref count", () => {
    expect(clientSrc).toContain("opTruthAudit.b04PhysicalRefs");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// G-09: Three truth states
// ══════════════════════════════════════════════════════════════════════════

describe("G-09: OP source truth states", () => {
  test("ESTIMATED state for legacy OP with data", () => {
    expect(loaderSrc).toContain('"ESTIMATED"');
  });

  test("NO_DATA state when no legacy OP", () => {
    expect(loaderSrc).toContain('"NO_DATA"');
  });

  test("B04 source can be CERTIFIED or UNAVAILABLE", () => {
    expect(loaderSrc).toContain('"CERTIFIED"');
    expect(loaderSrc).toContain('"UNAVAILABLE"');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// G-10: Explanation present
// ══════════════════════════════════════════════════════════════════════════

describe("G-10: explanation field", () => {
  test("explanation describes B04 vs OP semantics", () => {
    expect(loaderSrc).toContain("No es una OP real");
  });

  test("explanation mentions producedQty=null", () => {
    expect(loaderSrc).toContain("producedQty=null");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// G-11: Empty return paths include opTruthAudit
// ══════════════════════════════════════════════════════════════════════════

describe("G-11: empty paths include opTruthAudit", () => {
  test("empty source has opTruthAudit", () => {
    const emptyStart = loaderSrc.indexOf('source: "empty"');
    const emptyBlock = loaderSrc.slice(emptyStart, emptyStart + 2000);
    expect(emptyBlock).toContain("opTruthAudit:");
  });

  test("sag_source_down has opTruthAudit", () => {
    const downStart = loaderSrc.indexOf('source: "sag_source_down"');
    const downBlock = loaderSrc.slice(downStart, downStart + 2000);
    expect(downBlock).toContain("opTruthAudit:");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// G-12: Coverage authority
// ══════════════════════════════════════════════════════════════════════════

describe("G-12: coverage authority is B04_PHYSICAL", () => {
  test("all opTruthAudit instances use B04_PHYSICAL", () => {
    const matches = loaderSrc.match(/opCoverageAuthority: "B04_PHYSICAL"/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3); // main + empty + source_down
  });
});
