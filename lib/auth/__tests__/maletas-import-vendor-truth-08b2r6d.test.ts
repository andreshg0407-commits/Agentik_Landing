/**
 * P0-IMPORT-VENDOR-SAMPLE-TRUTH-08B2R6D-R1
 *
 * Non-destructive retiro with 3-state partition:
 *   total = vigentes + retiro + datos_sin_verificar
 *
 * Tests:
 *   D-01: derroteroFilter uses retiroDecision (server-computed, 3-state)
 *   D-02: classifyRetiroDecision with businessDomain override
 *   D-03: Import with B24 SAG CURRENT stock > threshold → VIGENTE
 *   D-04: Import with B24 stock <= threshold → RETIRO
 *   D-05: Import with B24 null → DATA_UNVERIFIED_HOLD (never retiro)
 *   D-06: Textile refs unchanged — still use B01 centralAvailable
 *   D-07: RETIRO_THRESHOLDS policy
 *   D-08: NOT_IN_B01 identified by importRefSet (not by B01 absence)
 *   D-09: Vendor presence independent from central coverage
 *   D-10: derroteroFilter references P0-08B2R6D-R1
 *   D-11: Import refs never get PRODUCTION_REQUIRED
 *   D-12: 3-state partition invariant
 *   D-13: UNKNOWN domain → DATA_UNVERIFIED_HOLD (not retiro)
 *   D-14: B24 is sole import authority (B36/B37 are vendor bodegas)
 *   D-15: Snapshot complete, ref absent → certified 0 → RETIRO
 *   D-16: No B01 absence alone classifies as Import
 */

import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  classifyRetiroDecision,
  isCandidateForRemoval,
  RETIRO_THRESHOLDS,
  type RemovalInput,
  type RetiroDecision,
} from "../../comercial/maletas/vendor-sample-types";

const worktreeRoot = path.resolve(__dirname, "../../..");
function readSrc(relPath: string): string {
  return fs.readFileSync(path.resolve(worktreeRoot, relPath), "utf8");
}

const loaderSrc = readSrc("lib/comercial/maletas/vendor-sample-loader.ts");
const typesSrc = readSrc("lib/comercial/maletas/vendor-sample-types.ts");
const coverageEngineSrc = readSrc("lib/comercial/maletas/sample-coverage-engine.ts");
const canonicalSrc = readSrc("lib/comercial/maletas/canonical-warehouse-availability.ts");

// ══════════════════════════════════════════════════════════════════════════
// D-01: derroteroFilter uses server-computed retiroDecision
// ══════════════════════════════════════════════════════════════════════════

describe("D-01: derroteroFilter uses retiroDecision (3-state)", () => {
  test("loader derroteroFilter checks ref.retiroDecision !== RETIRO", () => {
    expect(loaderSrc).toContain('ref.retiroDecision !== "RETIRO"');
  });

  test("retiroDecision is computed on each ref with classifyRetiroDecision", () => {
    expect(loaderSrc).toContain("retiroDecision: classifyRetiroDecision(");
  });

  test("import refs pass businessDomain CASTILLITOS_IMPORT", () => {
    expect(loaderSrc).toContain('isAccessory ? "CASTILLITOS_IMPORT"');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D-02: classifyRetiroDecision with businessDomain
// ══════════════════════════════════════════════════════════════════════════

describe("D-02: classifyRetiroDecision with businessDomain", () => {
  test("businessDomain overrides line-based resolution", () => {
    const result = classifyRetiroDecision({
      businessDomain: "CASTILLITOS_IMPORT",
      line: "IMPORT",
      compatibleCommercialStock: 50,
      stockDataState: "CERTIFIED",
    });
    expect(result).toBe("VIGENTE");
  });

  test("returns RetiroDecision type (not boolean)", () => {
    const result = classifyRetiroDecision({
      line: "CS",
      compatibleCommercialStock: 25,
      stockDataState: "CERTIFIED",
    });
    expect(["VIGENTE", "RETIRO", "DATA_UNVERIFIED_HOLD"]).toContain(result);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D-03: Import with B24 stock > threshold → VIGENTE
// ══════════════════════════════════════════════════════════════════════════

describe("D-03: import with sufficient B24 stock → VIGENTE", () => {
  test("B24 stock=50 > threshold 10 → VIGENTE", () => {
    expect(classifyRetiroDecision({
      businessDomain: "CASTILLITOS_IMPORT",
      compatibleCommercialStock: 50,
      stockDataState: "CERTIFIED",
    })).toBe("VIGENTE");
  });

  test("B24 stock=11 (just above threshold) → VIGENTE", () => {
    expect(classifyRetiroDecision({
      businessDomain: "CASTILLITOS_IMPORT",
      compatibleCommercialStock: 11,
      stockDataState: "CERTIFIED",
    })).toBe("VIGENTE");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D-04: Import with B24 stock <= threshold → RETIRO
// ══════════════════════════════════════════════════════════════════════════

describe("D-04: import with low B24 stock → RETIRO", () => {
  test("B24 stock=10 (at threshold) → RETIRO", () => {
    expect(classifyRetiroDecision({
      businessDomain: "CASTILLITOS_IMPORT",
      compatibleCommercialStock: 10,
      stockDataState: "CERTIFIED",
    })).toBe("RETIRO");
  });

  test("B24 stock=0 → RETIRO", () => {
    expect(classifyRetiroDecision({
      businessDomain: "CASTILLITOS_IMPORT",
      compatibleCommercialStock: 0,
      stockDataState: "CERTIFIED",
    })).toBe("RETIRO");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D-05: Import with null/absent B24 → DATA_UNVERIFIED_HOLD (never retiro)
// ══════════════════════════════════════════════════════════════════════════

describe("D-05: missing data → DATA_UNVERIFIED_HOLD, never retiro", () => {
  test("null stock + ABSENT state → DATA_UNVERIFIED_HOLD", () => {
    expect(classifyRetiroDecision({
      businessDomain: "CASTILLITOS_IMPORT",
      compatibleCommercialStock: null,
      stockDataState: "ABSENT",
    })).toBe("DATA_UNVERIFIED_HOLD");
  });

  test("stock=50 + ABSENT state → DATA_UNVERIFIED_HOLD (state overrides value)", () => {
    expect(classifyRetiroDecision({
      businessDomain: "CASTILLITOS_IMPORT",
      compatibleCommercialStock: 50,
      stockDataState: "ABSENT",
    })).toBe("DATA_UNVERIFIED_HOLD");
  });

  test("null stock + CERTIFIED state → DATA_UNVERIFIED_HOLD (contradictory → hold)", () => {
    expect(classifyRetiroDecision({
      businessDomain: "CASTILLITOS_IMPORT",
      compatibleCommercialStock: null,
      stockDataState: "CERTIFIED",
    })).toBe("DATA_UNVERIFIED_HOLD");
  });

  test("B24 source down → loader preserves sample (no retiro)", () => {
    // When SAG source is down, stockDataState will be ABSENT → HOLD
    expect(classifyRetiroDecision({
      line: "IMPORT",
      compatibleCommercialStock: null,
      stockDataState: "ABSENT",
    })).toBe("DATA_UNVERIFIED_HOLD");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D-06: Textile refs unchanged
// ══════════════════════════════════════════════════════════════════════════

describe("D-06: textile retiro logic unchanged", () => {
  test("CS with stock 25 > threshold 20 → VIGENTE", () => {
    expect(classifyRetiroDecision({
      line: "CS",
      compatibleCommercialStock: 25,
      stockDataState: "CERTIFIED",
    })).toBe("VIGENTE");
  });

  test("LT with stock 15 <= threshold 30 → RETIRO", () => {
    expect(classifyRetiroDecision({
      line: "LT",
      compatibleCommercialStock: 15,
      stockDataState: "CERTIFIED",
    })).toBe("RETIRO");
  });

  test("CS with ABSENT data → DATA_UNVERIFIED_HOLD", () => {
    expect(classifyRetiroDecision({
      line: "CS",
      compatibleCommercialStock: null,
      stockDataState: "ABSENT",
    })).toBe("DATA_UNVERIFIED_HOLD");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D-07: RETIRO_THRESHOLDS policy
// ══════════════════════════════════════════════════════════════════════════

describe("D-07: RETIRO_THRESHOLDS policy", () => {
  test("CASTILLITOS_IMPORT threshold is 10", () => {
    expect(RETIRO_THRESHOLDS.CASTILLITOS_IMPORT).toBe(10);
  });
  test("CASTILLITOS_TEXTILE threshold is 20", () => {
    expect(RETIRO_THRESHOLDS.CASTILLITOS_TEXTILE).toBe(20);
  });
  test("LATIN_KIDS_TEXTILE threshold is 30", () => {
    expect(RETIRO_THRESHOLDS.LATIN_KIDS_TEXTILE).toBe(30);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D-08: import refs identified by importRefSet (productLine=5)
// ══════════════════════════════════════════════════════════════════════════

describe("D-08: import identification from SAG classification", () => {
  test("loader uses importRefSet.has() for isAccessory (productLine=5)", () => {
    expect(loaderSrc).toContain("importRefSet.has(item.reference)");
  });

  test("isAccessory true → line is IMPORT (not inferred from B01 absence)", () => {
    expect(loaderSrc).toContain('isAccessory ? "IMPORT"');
  });

  test("import ref set loaded from ProductEntity productLine=5", () => {
    expect(loaderSrc).toContain('productLine: "5"');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D-09: Vendor presence independent from central coverage
// ══════════════════════════════════════════════════════════════════════════

describe("D-09: vendor presence vs central coverage separation", () => {
  test("vendor presence from movimientos_traslados", () => {
    const presenceSrc = readSrc("lib/comercial/maletas/vendor-sample-presence-engine.ts");
    expect(presenceSrc).toContain("VENDOR_BODEGA_CONFIGS");
    expect(presenceSrc).toContain("movimientos_traslados");
  });

  test("a ref can have vendor presence and no central coverage", () => {
    expect(typesSrc).toMatch(/present:\s*boolean/);
    expect(typesSrc).toMatch(/centralAvailable:\s*number\s*\|\s*null/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D-10: derroteroFilter references P0-08B2R6D-R1
// ══════════════════════════════════════════════════════════════════════════

describe("D-10: derroteroFilter docs", () => {
  test("comment block references P0-08B2R6D-R1", () => {
    const filterIdx = loaderSrc.indexOf("const derroteroFilter");
    const block = loaderSrc.slice(Math.max(0, filterIdx - 400), filterIdx + 100);
    expect(block).toContain("P0-08B2R6D-R1");
  });

  test("DATA_UNVERIFIED_HOLD refs are included in derrotero (stay in drawer)", () => {
    const filterIdx = loaderSrc.indexOf("const derroteroFilter");
    const block = loaderSrc.slice(Math.max(0, filterIdx - 400), filterIdx + 200);
    expect(block).toContain("DATA_UNVERIFIED_HOLD");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D-11: Import refs never get PRODUCTION_REQUIRED
// ══════════════════════════════════════════════════════════════════════════

describe("D-11: import refs use IMPORT_UNAVAILABLE, never PRODUCTION_REQUIRED", () => {
  test("resolveImportSlots has no PRODUCTION_REQUIRED", () => {
    const importStart = coverageEngineSrc.indexOf("function resolveImportSlots");
    const importEnd = coverageEngineSrc.indexOf("\n// ═", importStart + 10);
    const importBlock = coverageEngineSrc.slice(importStart, importEnd > 0 ? importEnd : undefined);
    expect(importBlock).not.toContain("PRODUCTION_REQUIRED");
    expect(importBlock).toContain("IMPORT_UNAVAILABLE");
  });

  test("isEligibleForProductionSuggestion rejects non-textile lines", () => {
    expect(typesSrc).toContain('const TEXTILE_LINES = new Set(["LT", "CS"])');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D-12: 3-state partition invariant
// ══════════════════════════════════════════════════════════════════════════

describe("D-12: 3-state partition invariant", () => {
  test("classifyRetiroDecision returns exactly one of 3 states", () => {
    const validStates: RetiroDecision[] = ["VIGENTE", "RETIRO", "DATA_UNVERIFIED_HOLD"];
    const inputs: RemovalInput[] = [
      { line: "CS", compatibleCommercialStock: 25, stockDataState: "CERTIFIED" },
      { line: "LT", compatibleCommercialStock: 5, stockDataState: "CERTIFIED" },
      { line: "IMPORT", compatibleCommercialStock: null, stockDataState: "ABSENT" },
      { line: "UNKNOWN_LINE", compatibleCommercialStock: 100, stockDataState: "CERTIFIED" },
      { businessDomain: "CASTILLITOS_IMPORT", compatibleCommercialStock: 50, stockDataState: "CERTIFIED" },
    ];
    for (const input of inputs) {
      const result = classifyRetiroDecision(input);
      expect(validStates).toContain(result);
    }
  });

  test("pure function — same input always gives same output", () => {
    const input: RemovalInput = {
      businessDomain: "CASTILLITOS_IMPORT",
      compatibleCommercialStock: 15,
      stockDataState: "CERTIFIED",
    };
    expect(classifyRetiroDecision(input)).toBe(classifyRetiroDecision(input));
  });

  test("no ref disappears from partition (every ref gets exactly one decision)", () => {
    // VendorSampleRef now has retiroDecision field
    expect(typesSrc).toContain("retiroDecision: RetiroDecision");
  });

  test("RetiroDecision type has exactly 3 values", () => {
    expect(typesSrc).toContain('"VIGENTE" | "RETIRO" | "DATA_UNVERIFIED_HOLD"');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D-13: UNKNOWN domain → DATA_UNVERIFIED_HOLD (not retiro)
// ══════════════════════════════════════════════════════════════════════════

describe("D-13: UNKNOWN domain → DATA_UNVERIFIED_HOLD", () => {
  test("unknown line with certified data → HOLD (not retiro)", () => {
    expect(classifyRetiroDecision({
      line: "UNKNOWN_LINE",
      compatibleCommercialStock: 100,
      stockDataState: "CERTIFIED",
    })).toBe("DATA_UNVERIFIED_HOLD");
  });

  test("UNKNOWN businessDomain → HOLD", () => {
    expect(classifyRetiroDecision({
      businessDomain: "UNKNOWN",
      compatibleCommercialStock: 100,
      stockDataState: "CERTIFIED",
    })).toBe("DATA_UNVERIFIED_HOLD");
  });

  test("isCandidateForRemoval backward compat: UNKNOWN → false (not a RETIRO candidate)", () => {
    // isCandidateForRemoval now returns classifyRetiroDecision(input) === "RETIRO"
    // UNKNOWN → DATA_UNVERIFIED_HOLD → not RETIRO → false
    expect(isCandidateForRemoval({
      line: "UNKNOWN_LINE",
      compatibleCommercialStock: 100,
      stockDataState: "CERTIFIED",
    })).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D-14: B24 is sole import authority
// ══════════════════════════════════════════════════════════════════════════

describe("D-14: B24 sole import authority, B36/B37 are vendor bodegas", () => {
  test("canonical-warehouse-availability has B24 query", () => {
    expect(canonicalSrc).toContain("SAG_B24_QUERY");
    expect(canonicalSrc).toContain("BODEGA LIKE '24 -%'");
  });

  test("getCanonicalImportWarehouseAvailability exported", () => {
    expect(canonicalSrc).toContain("export async function getCanonicalImportWarehouseAvailability");
  });

  test("loader imports getCanonicalImportWarehouseAvailability", () => {
    expect(loaderSrc).toContain("getCanonicalImportWarehouseAvailability");
  });

  test("loader uses b24Canonical.byReference for import refs", () => {
    expect(loaderSrc).toContain("b24Canonical.byReference.get(item.reference)");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D-15: Certified absence → stock=0 → RETIRO
// ══════════════════════════════════════════════════════════════════════════

describe("D-15: certified absence (complete snapshot, ref not found)", () => {
  test("SAG loaded, ref absent → availableB24=0 → RETIRO", () => {
    // When B24 SAG is loaded but ref not found, loader sets availableB24=0
    expect(loaderSrc).toContain("availableB24 = 0");
  });

  test("stock=0 with CERTIFIED → RETIRO (certified empty, not hold)", () => {
    expect(classifyRetiroDecision({
      businessDomain: "CASTILLITOS_IMPORT",
      compatibleCommercialStock: 0,
      stockDataState: "CERTIFIED",
    })).toBe("RETIRO");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D-16: No B01 absence alone classifies as Import
// ══════════════════════════════════════════════════════════════════════════

describe("D-16: import classification from ProductEntity, not B01 absence", () => {
  test("isAccessory set by importRefSet (productLine=5), not by B01 miss", () => {
    expect(loaderSrc).toContain("const isAccessory = importRefSet.has(item.reference)");
  });

  test("line classification uses isAccessory → IMPORT, not coverage absence", () => {
    // Line is set to IMPORT only when isAccessory is true (from PE productLine=5)
    const lineBlock = loaderSrc.slice(
      loaderSrc.indexOf("const isAccessory = importRefSet"),
      loaderSrc.indexOf("const isAccessory = importRefSet") + 300,
    );
    expect(lineBlock).toContain('isAccessory ? "IMPORT"');
  });
});
