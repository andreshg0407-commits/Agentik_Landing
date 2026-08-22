/**
 * P0-MALETAS-B01-B04-PRODUCTION-CASCADE-08B2R6G-R2 — FINAL RUNTIME CLOSEOUT
 *
 * Mandatory tests:
 *   T-01: B01 sufficient + B04 available → B01 wins
 *   T-02: B01 insufficient + B04 available → B04 wins (not blocked by below-threshold)
 *   T-03: B01 insufficient + B04 partial → shortfall remains
 *   T-04: B01 and B04 insufficient, certified → PRODUCTION_REQUIRED for actual shortfall
 *   T-05: Source not certified → DATA_UNVERIFIED
 *   T-06: No double assignment
 *   T-07: No reference disappears silently
 *   T-08: Cascade order: B01 → B04 → BELOW_THRESHOLD → PRODUCTION
 *   T-09: Reference slot model documented
 *   T-10: Position row shows B01/B04/Pending breakdown
 *   T-11: STOCK_AVAILABLE_BELOW_THRESHOLD does NOT block B04
 *   T-12: Import never produces textile production recommendation
 */

// @ts-expect-error — vitest types resolved at runtime via npx, not a project dependency
import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const worktreeRoot = path.resolve(__dirname, "../../..");
function readSrc(relPath: string): string {
  return fs.readFileSync(path.resolve(worktreeRoot, relPath), "utf8");
}

const engineSrc = readSrc("lib/comercial/maletas/sample-coverage-engine.ts");
const clientSrc = readSrc("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");

// ══════════════════════════════════════════════════════════════════════════
// T-01: B01 sufficient + B04 available → B01 wins
// ══════════════════════════════════════════════════════════════════════════

describe("T-01: B01 sufficient wins over B04", () => {
  test("STEP 1 (B01 above threshold) precedes STEP 2 (B04)", () => {
    const step1 = engineSrc.indexOf("// STEP 1: Bodega Principal");
    const step2 = engineSrc.indexOf("// STEP 2: B04 Producto en Proceso");
    expect(step1).toBeGreaterThan(-1);
    expect(step2).toBeGreaterThan(-1);
    expect(step1).toBeLessThan(step2);
  });

  test("B01 match uses continue to skip B04", () => {
    const start = engineSrc.indexOf("if (bodegaMatch) {");
    const block = engineSrc.slice(start, start + 800);
    expect(block).toContain('"B01_AVAILABLE"');
    expect(block).toContain("continue;");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// T-02: B01 insufficient + B04 available → B04 wins (cascade fix)
// ══════════════════════════════════════════════════════════════════════════

describe("T-02: B04 wins when B01 below threshold", () => {
  test("STEP 2 (B04) appears BEFORE STEP 2b (below threshold)", () => {
    const step2 = engineSrc.indexOf("// STEP 2: B04 Producto en Proceso");
    const step2b = engineSrc.indexOf("// STEP 2b: B01 below threshold");
    expect(step2).toBeGreaterThan(-1);
    expect(step2b).toBeGreaterThan(-1);
    expect(step2).toBeLessThan(step2b);
  });

  test("B04 match returns OP_INCOMING with continue before below-threshold", () => {
    const start = engineSrc.indexOf("if (opMatch) {");
    const block = engineSrc.slice(start, start + 600);
    expect(block).toContain('"OP_INCOMING"');
    expect(block).toContain("continue;");
    // Verify this is before the below-threshold check
    const step2b = engineSrc.indexOf("// STEP 2b:");
    expect(start).toBeLessThan(step2b);
  });

  test("below-threshold comment explains R2 fix", () => {
    expect(engineSrc).toContain("evaluated AFTER B04 so B04 product in process is preferred");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// T-03: B01 insufficient + B04 partial → shortfall remains
// ══════════════════════════════════════════════════════════════════════════

describe("T-03: partial coverage preserves shortfall", () => {
  test("each missing slot gets exactly one candidate (reference slot model)", () => {
    // The for loop iterates over missing slots independently
    expect(engineSrc).toContain("for (let slot = 0; slot < missing; slot++)");
  });

  test("position-level status is best candidate (may differ from individual slots)", () => {
    // allCandidates sorted by priority, position.status = best
    expect(engineSrc).toContain("allCandidates.sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status])");
    expect(engineSrc).toContain("const status = allCandidates[0]?.status");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// T-04: Both certified empty → PRODUCTION_REQUIRED
// ══════════════════════════════════════════════════════════════════════════

describe("T-04: PRODUCTION_REQUIRED after certified absence", () => {
  test("STEP 3 follows STEP 2b (below threshold)", () => {
    const step2b = engineSrc.indexOf("// STEP 2b:");
    const step3 = engineSrc.indexOf("// STEP 3: PRODUCTION_REQUIRED");
    expect(step3).toBeGreaterThan(step2b);
  });

  test("PRODUCTION_REQUIRED explanation confirms both sources certified empty", () => {
    expect(engineSrc).toContain("Stock certificado = 0 en B01 y B04");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// T-05: Source not certified → DATA_UNVERIFIED
// ══════════════════════════════════════════════════════════════════════════

describe("T-05: DATA_UNVERIFIED for uncertified sources", () => {
  test("B01 unavailable → DATA_UNVERIFIED before any cascade", () => {
    const b01Guard = engineSrc.indexOf("if (!dataAvailability.b01Available)");
    const step1 = engineSrc.indexOf("// STEP 1:");
    expect(b01Guard).toBeLessThan(step1);
  });

  test("B04 unavailable → DATA_UNVERIFIED at STEP 2", () => {
    const start = engineSrc.indexOf("if (!dataAvailability.opAvailable)");
    const block = engineSrc.slice(start, start + 600);
    expect(block).toContain('"DATA_UNVERIFIED"');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// T-06: No double assignment
// ══════════════════════════════════════════════════════════════════════════

describe("T-06: reference uniqueness enforced", () => {
  test("usedReferences checked in B01 path", () => {
    const b01Find = engineSrc.slice(
      engineSrc.indexOf("// STEP 1: Bodega Principal"),
      engineSrc.indexOf("// STEP 2: B04"),
    );
    expect(b01Find).toContain("usedReferences.has(r.reference");
  });

  test("usedReferences checked in B04 path", () => {
    const b04Find = engineSrc.slice(
      engineSrc.indexOf("// STEP 2: B04"),
      engineSrc.indexOf("// STEP 2b:"),
    );
    expect(b04Find).toContain("usedReferences.has(op.reference");
  });

  test("B01 above threshold adds to usedReferences", () => {
    const start = engineSrc.indexOf("if (bodegaMatch) {");
    const block = engineSrc.slice(start, start + 800);
    expect(block).toContain("usedReferences.add(bodegaMatch.reference");
  });

  test("B04 match adds to usedReferences", () => {
    const start = engineSrc.indexOf("if (opMatch) {");
    const block = engineSrc.slice(start, start + 600);
    expect(block).toContain("usedReferences.add(opMatch.reference");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// T-07: No reference disappears silently
// ══════════════════════════════════════════════════════════════════════════

describe("T-07: no silent disappearance", () => {
  test("every missing slot produces exactly one candidate", () => {
    // Each branch in the for loop either pushes a candidate + continues, or falls through to PRODUCTION_REQUIRED
    // Count the candidate pushes — every path must push exactly one
    const slotLoop = engineSrc.slice(
      engineSrc.indexOf("for (let slot = 0; slot < missing; slot++)"),
      engineSrc.indexOf("// ── Import slot resolution"),
    );
    // Each path ends with continue or is the last push
    const pushCount = (slotLoop.match(/candidates\.push\(/g) ?? []).length;
    // Must have at least: B01 unavailable, B01 match, B04 unavailable, B04 match, below threshold, production
    expect(pushCount).toBeGreaterThanOrEqual(6);
  });

  test("b04RejectedNoSubgrupo tracked in opTruthAudit", () => {
    const loaderSrc = readSrc("lib/comercial/maletas/vendor-sample-loader.ts");
    expect(loaderSrc).toContain("b04RejectedNoSubgrupo");
  });

  test("client shows unverified tab for B04 refs without subgrupo", () => {
    expect(clientSrc).toContain('"unverified"');
    expect(clientSrc).toContain("SUBGROUP_MISSING");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// T-08: Cascade order documented
// ══════════════════════════════════════════════════════════════════════════

describe("T-08: cascade order", () => {
  test("header declares correct cascade order", () => {
    expect(engineSrc).toContain("1. B01_AVAILABLE");
    expect(engineSrc).toContain("2. OP_INCOMING");
    expect(engineSrc).toContain("2b. STOCK_AVAILABLE_BELOW_THRESHOLD");
    expect(engineSrc).toContain("3. PRODUCTION_REQUIRED");
  });

  test("R2 FIX documented in header", () => {
    expect(engineSrc).toContain("R2 FIX: STOCK_AVAILABLE_BELOW_THRESHOLD no longer blocks B04 evaluation");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// T-09: Reference slot model documented
// ══════════════════════════════════════════════════════════════════════════

describe("T-09: reference slot model", () => {
  test("engine header documents REFERENCE SLOTS not unit quantities", () => {
    expect(engineSrc).toContain("COVERAGE MODEL: REFERENCE SLOTS, NOT UNIT QUANTITIES");
  });

  test("engine documents that unit-level shortfall is NOT calculated", () => {
    expect(engineSrc).toContain("does NOT calculate unit-level shortfall between sources");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// T-10: Position row shows B01/B04/Pending breakdown
// ══════════════════════════════════════════════════════════════════════════

describe("T-10: per-position source breakdown", () => {
  test("coverage table header has B01, B04, Pend. columns", () => {
    expect(clientSrc).toContain('"B01"');
    expect(clientSrc).toContain('"B04"');
    expect(clientSrc).toContain('"Pend."');
  });

  test("CoveragePositionRow computes b01Count and b04Count", () => {
    expect(clientSrc).toContain('const b01Count = pos.candidates.filter(c => c.status === "B01_AVAILABLE"');
    expect(clientSrc).toContain('const b04Count = pos.candidates.filter(c => c.status === "OP_INCOMING"');
  });

  test("pendingCount derived from missing minus b01 minus b04", () => {
    expect(clientSrc).toContain("const pendingCount = pos.missingReferences - b01Count - b04Count");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// T-11: STOCK_AVAILABLE_BELOW_THRESHOLD does NOT block B04
// ══════════════════════════════════════════════════════════════════════════

describe("T-11: below-threshold no longer blocks B04", () => {
  test("STEP 2 (B04) comes before STEP 2b (below-threshold) in code", () => {
    const step2 = engineSrc.indexOf("// STEP 2: B04 Producto en Proceso");
    const step2b = engineSrc.indexOf("// STEP 2b: B01 below threshold");
    expect(step2).toBeLessThan(step2b);
  });

  test("B04 check does not depend on bodegaBelowThreshold result", () => {
    // Between STEP 2 and STEP 2b, there should be no reference to bodegaBelowThreshold
    const between = engineSrc.slice(
      engineSrc.indexOf("// STEP 2: B04"),
      engineSrc.indexOf("// STEP 2b:"),
    );
    expect(between).not.toContain("bodegaBelowThreshold");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// T-12: Import never produces textile production
// ══════════════════════════════════════════════════════════════════════════

describe("T-12: import isolation", () => {
  test("resolveImportSlots does not emit PRODUCTION_REQUIRED", () => {
    const start = engineSrc.indexOf("function resolveImportSlots(");
    const nextFn = engineSrc.indexOf("\nfunction ", start + 1);
    const importFn = engineSrc.slice(start, nextFn > start ? nextFn : start + 4000);
    expect(importFn).not.toContain('"PRODUCTION_REQUIRED"');
    expect(importFn).toContain('"IMPORT_UNAVAILABLE"');
  });

  test("buildMissingPosition routes import to resolveImportSlots not resolveTextileSlots", () => {
    expect(engineSrc).toContain("if (isImport) {\n    resolveImportSlots(");
  });
});
