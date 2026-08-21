/**
 * MALETAS-P0-COVERAGE-OP-IMPORT-TRUTH-08B2R6E
 *
 * Tests:
 *   E-01: effectiveAvail helper routes imports to availableB24, textiles to centralAvailable
 *   E-02: KPI partition invariant — total = vigentes + retiro + sinVerificar
 *   E-03: HOLD refs excluded from commercialRefs (vigentes only)
 *   E-04: Coverage engine blocks PRODUCTION_REQUIRED when OP source unavailable
 *   E-05: Coverage engine blocks PRODUCTION_REQUIRED when B01 source unavailable
 *   E-06: B04 OP candidates require subgrupoSag for matching
 *   E-07: Presentation labels — DERROTERO_LINE_LABEL maps CS/LT/IMPORT correctly
 *   E-08: Vigentes accordion uses DERROTERO_LINE_LABEL (not raw line code)
 *   E-09: DepletedVault uses effectiveAvail for rotation rating
 *   E-10: AccessoryScarcityPanel displays B24 label (not B36+B37)
 */

// @ts-expect-error — vitest types resolved at runtime via npx, not a project dependency
import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  classifyRetiroDecision,
  RETIRO_THRESHOLDS,
} from "../../comercial/maletas/vendor-sample-types";

const worktreeRoot = path.resolve(__dirname, "../../..");
function readSrc(relPath: string): string {
  return fs.readFileSync(path.resolve(worktreeRoot, relPath), "utf8");
}

const clientSrc = readSrc("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");
const coverageEngineSrc = readSrc("lib/comercial/maletas/sample-coverage-engine.ts");
const loaderSrc = readSrc("lib/comercial/maletas/vendor-sample-loader.ts");

// ══════════════════════════════════════════════════════════════════════════
// E-01: effectiveAvail helper routes imports to availableB24
// ══════════════════════════════════════════════════════════════════════════

describe("E-01: effectiveAvail routes by ref type", () => {
  test("effectiveAvail helper defined in client", () => {
    expect(clientSrc).toContain("const effectiveAvail = (ref:");
  });

  test("returns availableB24 for isAccessory refs", () => {
    expect(clientSrc).toContain("ref.isAccessory ? (ref.availableB24 ?? null) : ref.centralAvailable");
  });

  test("sort comparators use effectiveAvail not raw centralAvailable", () => {
    expect(clientSrc).toContain("availSort(effectiveAvail(a), effectiveAvail(b))");
    // Should NOT have raw centralAvailable in sort comparators
    expect(clientSrc).not.toContain("availSort(a.centralAvailable, b.centralAvailable)");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E-02: KPI partition invariant
// ══════════════════════════════════════════════════════════════════════════

describe("E-02: KPI partition invariant", () => {
  test("client displays partition formula", () => {
    expect(clientSrc).toContain("commercialRefs.length} + ${retiroRefs.length} + ${holdRefs.length} = ${allPresenceRefs.length}");
  });

  test("3-state classification exhausts all possibilities", () => {
    const vigente = classifyRetiroDecision({ businessDomain: "CASTILLITOS_IMPORT", compatibleCommercialStock: 100, stockDataState: "CERTIFIED" });
    const retiro = classifyRetiroDecision({ businessDomain: "CASTILLITOS_IMPORT", compatibleCommercialStock: 5, stockDataState: "CERTIFIED" });
    const hold = classifyRetiroDecision({ businessDomain: "CASTILLITOS_IMPORT", compatibleCommercialStock: null, stockDataState: "ABSENT" });
    expect(new Set([vigente, retiro, hold]).size).toBe(3);
    expect(vigente).toBe("VIGENTE");
    expect(retiro).toBe("RETIRO");
    expect(hold).toBe("DATA_UNVERIFIED_HOLD");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E-03: HOLD excluded from commercialRefs
// ══════════════════════════════════════════════════════════════════════════

describe("E-03: HOLD excluded from vigentes", () => {
  test("commercialRefs filter is === VIGENTE (not !== RETIRO)", () => {
    expect(clientSrc).toContain('r.retiroDecision === "VIGENTE"');
    // Must NOT use the old filter that included HOLD
    const commercialRefsBlock = clientSrc.slice(
      clientSrc.indexOf("const commercialRefs = useMemo"),
      clientSrc.indexOf("const commercialRefs = useMemo") + 200,
    );
    expect(commercialRefsBlock).not.toContain('!== "RETIRO"');
  });

  test("holdRefs memo exists", () => {
    expect(clientSrc).toContain("const holdRefs = useMemo");
    expect(clientSrc).toContain('r.retiroDecision === "DATA_UNVERIFIED_HOLD"');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E-04: Coverage engine blocks PRODUCTION_REQUIRED when OP unavailable
// ══════════════════════════════════════════════════════════════════════════

describe("E-04: PRODUCTION_REQUIRED blocked when OP source unavailable", () => {
  test("resolveTextileSlots checks opAvailable before OP matching", () => {
    // When !dataAvailability.opAvailable → DATA_UNVERIFIED, not PRODUCTION_REQUIRED
    expect(coverageEngineSrc).toContain("if (!dataAvailability.opAvailable)");
    const opBlock = coverageEngineSrc.slice(
      coverageEngineSrc.indexOf("if (!dataAvailability.opAvailable)"),
      coverageEngineSrc.indexOf("if (!dataAvailability.opAvailable)") + 300,
    );
    expect(opBlock).toContain('"DATA_UNVERIFIED"');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E-05: Coverage engine blocks PRODUCTION_REQUIRED when B01 unavailable
// ══════════════════════════════════════════════════════════════════════════

describe("E-05: PRODUCTION_REQUIRED blocked when B01 source unavailable", () => {
  test("resolveTextileSlots checks b01Available before stock evaluation", () => {
    expect(coverageEngineSrc).toContain("if (!dataAvailability.b01Available)");
    const b01Block = coverageEngineSrc.slice(
      coverageEngineSrc.indexOf("if (!dataAvailability.b01Available)"),
      coverageEngineSrc.indexOf("if (!dataAvailability.b01Available)") + 300,
    );
    expect(b01Block).toContain('"DATA_UNVERIFIED"');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E-06: B04 OP candidates require subgrupoSag
// ══════════════════════════════════════════════════════════════════════════

describe("E-06: B04 OP candidates require subgrupoSag", () => {
  test("loader skips B04 refs without subgrupoSag", () => {
    expect(loaderSrc).toContain("if (!b04Ref.subgrupoSag) continue");
  });

  test("OP matching uses matchesTextilEntry (line + subgrupoSag + grupoSag)", () => {
    expect(coverageEngineSrc).toContain("matchesTextilEntry(");
    expect(coverageEngineSrc).toContain("op.line, op.subgrupoSag, op.grupoSag");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E-07: Presentation labels
// ══════════════════════════════════════════════════════════════════════════

describe("E-07: DERROTERO_LINE_LABEL maps correctly", () => {
  test("CS → Castillitos", () => {
    expect(clientSrc).toContain('CS: "Castillitos"');
  });

  test("LT → Latin Kids", () => {
    expect(clientSrc).toContain('LT: "Latin Kids"');
  });

  test("IMPORT → Importacion", () => {
    expect(clientSrc).toContain('IMPORT: "Importacion"');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E-08: Vigentes accordion uses label (not raw code)
// ══════════════════════════════════════════════════════════════════════════

describe("E-08: vigentes accordion uses DERROTERO_LINE_LABEL", () => {
  test("no raw lineName displayed without label lookup in vigentes accordion", () => {
    // The vigentes accordion header must use DERROTERO_LINE_LABEL
    // Count occurrences of the label lookup pattern — should appear in both vigentes and retiro
    const matches = clientSrc.match(/DERROTERO_LINE_LABEL\[lineName\]/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E-09: DepletedVault uses effectiveAvail
// ══════════════════════════════════════════════════════════════════════════

describe("E-09: DepletedVault uses effectiveAvail", () => {
  test("rotation rating uses effectiveAvail", () => {
    const vaultBlock = clientSrc.slice(
      clientSrc.indexOf("function DepletedVault"),
      clientSrc.indexOf("function DepletedVault") + 1500,
    );
    expect(vaultBlock).toContain("effectiveAvail(ref)");
    expect(vaultBlock).not.toContain("ref.centralAvailable");
  });

  test("zero/low stock insights use effectiveAvail", () => {
    const insightsBlock = clientSrc.slice(
      clientSrc.indexOf("const zeroStock = refs.filter"),
      clientSrc.indexOf("const zeroStock = refs.filter") + 200,
    );
    expect(insightsBlock).toContain("effectiveAvail(r)");
    expect(insightsBlock).not.toContain("r.centralAvailable");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E-10: AccessoryScarcityPanel displays B24 label
// ══════════════════════════════════════════════════════════════════════════

describe("E-10: AccessoryScarcityPanel B24 label", () => {
  test("panel shows Disponible B24 (not B36+B37)", () => {
    // Search the full AccessoryScarcityPanel function body
    const start = clientSrc.indexOf("function AccessoryScarcityPanel");
    const end = clientSrc.indexOf("\n}\n", start + 100);
    const panelBlock = clientSrc.slice(start, end);
    expect(panelBlock).toContain("Disponible B24");
    expect(panelBlock).not.toContain("B36+B37");
  });

  test("panel renders availableB24 value", () => {
    const start = clientSrc.indexOf("function AccessoryScarcityPanel");
    const end = clientSrc.indexOf("\n}\n", start + 100);
    const panelBlock = clientSrc.slice(start, end);
    expect(panelBlock).toContain("ref_.availableB24");
  });
});
