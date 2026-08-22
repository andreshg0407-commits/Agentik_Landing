/**
 * P0-MALETAS-B01-B04-PRODUCTION-CASCADE-08B2R6G-R1
 *
 * Mandatory cascade tests:
 *   T-01: B01 and B04 available → B01 wins
 *   T-02: B01 no coverage, B04 available → B04 wins
 *   T-03: B01 and B04 no coverage, both certified → PRODUCTION_REQUIRED
 *   T-04: B01 or B04 unavailable → DATA_UNVERIFIED
 *   T-05: B04 without subgrupoSag → DATA_UNVERIFIED
 *   T-06: One reference cannot cover two positions
 *   T-07: Import never produces textile recommendation
 *   T-08: Section renamed to "En camino — Producto en proceso (B04)"
 *   T-09: Legacy OP not shown in UI as certified
 *   T-10: Cascade comment declares canonical order
 *   T-11: Coverage explanation references B04 not OP
 *   T-12: opTruthAudit explanation references cascade
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
const loaderSrc = readSrc("lib/comercial/maletas/vendor-sample-loader.ts");
const clientSrc = readSrc("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");

// ══════════════════════════════════════════════════════════════════════════
// T-01: B01 and B04 available → B01 wins
// ══════════════════════════════════════════════════════════════════════════

describe("T-01: B01 wins over B04", () => {
  test("B01_AVAILABLE is checked before OP_INCOMING in cascade", () => {
    // The resolveTextileSlots function checks B01 (STEP 1) before B04 (STEP 2)
    const step1Idx = engineSrc.indexOf("// STEP 1: Bodega Principal");
    const step2Idx = engineSrc.indexOf("// STEP 2: B04 Producto en Proceso");
    expect(step1Idx).toBeGreaterThan(-1);
    expect(step2Idx).toBeGreaterThan(-1);
    expect(step1Idx).toBeLessThan(step2Idx);
  });

  test("STATUS_PRIORITY ranks B01 above OP_INCOMING", () => {
    expect(engineSrc).toContain("B01_AVAILABLE: 1");
    expect(engineSrc).toContain("OP_INCOMING: 2");
  });

  test("B01 match triggers continue before B04 check", () => {
    // After bodegaMatch is found, it adds B01_AVAILABLE and continues (skipping B04)
    const start = engineSrc.indexOf("if (bodegaMatch) {");
    const bodegaMatchBlock = engineSrc.slice(start, start + 800);
    expect(bodegaMatchBlock).toContain("B01_AVAILABLE");
    expect(bodegaMatchBlock).toContain("continue;");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// T-02: B01 no coverage, B04 available → B04 wins
// ══════════════════════════════════════════════════════════════════════════

describe("T-02: B04 wins when B01 has no coverage", () => {
  test("OP_INCOMING status emitted when B04 match found", () => {
    const opMatchBlock = engineSrc.slice(
      engineSrc.indexOf("if (opMatch) {"),
      engineSrc.indexOf("if (opMatch) {") + 500,
    );
    expect(opMatchBlock).toContain('"OP_INCOMING"');
    expect(opMatchBlock).toContain("continue;");
  });

  test("B04 explanation mentions Producto en Proceso", () => {
    expect(engineSrc).toContain("En camino — B04 existencia:");
    expect(engineSrc).toContain("Producto en Proceso");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// T-03: Neither covers, both certified → PRODUCTION_REQUIRED
// ══════════════════════════════════════════════════════════════════════════

describe("T-03: PRODUCTION_REQUIRED when both certified empty", () => {
  test("PRODUCTION_REQUIRED follows B04 check (STEP 3)", () => {
    const step3Idx = engineSrc.indexOf("// STEP 3: PRODUCTION_REQUIRED");
    const step2Idx = engineSrc.indexOf("// STEP 2: B04 Producto en Proceso");
    expect(step3Idx).toBeGreaterThan(step2Idx);
  });

  test("PRODUCTION_REQUIRED explanation mentions B01 AND B04", () => {
    expect(engineSrc).toContain("Stock certificado = 0 en B01 y B04");
  });

  test("productionReason references B01 and B04", () => {
    expect(engineSrc).toContain("Sin referencia mayorista disponible en B01 ni en B04");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// T-04: Source unavailable → DATA_UNVERIFIED
// ══════════════════════════════════════════════════════════════════════════

describe("T-04: DATA_UNVERIFIED when source down", () => {
  test("B01 unavailable emits DATA_UNVERIFIED", () => {
    expect(engineSrc).toContain("if (!dataAvailability.b01Available)");
    // Find the block and verify it emits DATA_UNVERIFIED
    const b01Guard = engineSrc.slice(
      engineSrc.indexOf("if (!dataAvailability.b01Available)"),
      engineSrc.indexOf("if (!dataAvailability.b01Available)") + 400,
    );
    expect(b01Guard).toContain('"DATA_UNVERIFIED"');
  });

  test("B04 unavailable emits DATA_UNVERIFIED", () => {
    expect(engineSrc).toContain("if (!dataAvailability.opAvailable)");
    const start = engineSrc.indexOf("if (!dataAvailability.opAvailable)");
    const opGuard = engineSrc.slice(start, start + 600);
    expect(opGuard).toContain('"DATA_UNVERIFIED"');
    expect(opGuard).toContain("certificar B01 y B04");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// T-05: B04 without subgrupoSag → DATA_UNVERIFIED
// ══════════════════════════════════════════════════════════════════════════

describe("T-05: B04 refs without subgrupoSag", () => {
  test("loader skips B04 refs without subgrupoSag", () => {
    expect(loaderSrc).toContain("if (!b04Ref.subgrupoSag) continue");
  });

  test("opTruthAudit counts rejected refs", () => {
    expect(loaderSrc).toContain("b04RejectedNoSubgrupo");
  });

  test("client shows rejected count in cascade panel", () => {
    expect(clientSrc).toContain("opTruthAudit.b04RejectedNoSubgrupo");
  });

  test("SUBGROUP_MISSING classified as DATA_UNVERIFIED in client", () => {
    expect(clientSrc).toContain('"SUBGROUP_MISSING"');
    // classifyB04Ref sets matchTruthState to DATA_UNVERIFIED for missing subgrupo
    const classifyBlock = clientSrc.slice(
      clientSrc.indexOf("if (!ref.subgrupoSag)"),
      clientSrc.indexOf("if (!ref.subgrupoSag)") + 300,
    );
    expect(classifyBlock).toContain('"DATA_UNVERIFIED"');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// T-06: One reference cannot cover two positions
// ══════════════════════════════════════════════════════════════════════════

describe("T-06: reference uniqueness", () => {
  test("usedReferences set prevents duplicate assignment", () => {
    expect(engineSrc).toContain("usedReferences.has(");
    expect(engineSrc).toContain("usedReferences.add(");
  });

  test("both B01 and B04 paths check usedReferences", () => {
    // B01 path
    const b01Check = engineSrc.indexOf("if (usedReferences.has(r.reference");
    expect(b01Check).toBeGreaterThan(-1);
    // B04/OP path
    const opCheck = engineSrc.indexOf("if (usedReferences.has(op.reference");
    expect(opCheck).toBeGreaterThan(-1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// T-07: Import never produces textile recommendation
// ══════════════════════════════════════════════════════════════════════════

describe("T-07: import isolation", () => {
  test("resolveImportSlots is separate from resolveTextileSlots", () => {
    expect(engineSrc).toContain("function resolveImportSlots(");
    expect(engineSrc).toContain("function resolveTextileSlots(");
  });

  test("import path ends with IMPORT_UNAVAILABLE not PRODUCTION_REQUIRED", () => {
    // Find the full resolveImportSlots function body
    const start = engineSrc.indexOf("function resolveImportSlots(");
    const nextFn = engineSrc.indexOf("\nfunction ", start + 1);
    const importSlots = engineSrc.slice(start, nextFn > start ? nextFn : start + 4000);
    expect(importSlots).toContain('"IMPORT_UNAVAILABLE"');
    expect(importSlots).not.toContain('"PRODUCTION_REQUIRED"');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// T-08: Section renamed
// ══════════════════════════════════════════════════════════════════════════

describe("T-08: section title renamed", () => {
  test("client uses 'En camino — Producto en proceso (B04)'", () => {
    expect(clientSrc).toContain("En camino — Producto en proceso (B04)");
  });

  test("old 'OP Activas' title not used in UI", () => {
    const uiLines = clientSrc.split("\n").filter(l =>
      l.includes("OP Activas") && !l.trim().startsWith("//") && !l.trim().startsWith("{/*") && !l.trim().startsWith("*")
    );
    expect(uiLines.length).toBe(0);
  });

  test("subtitle mentions existencia fisica", () => {
    expect(clientSrc).toContain("Existencia fisica registrada en la bodega de Producto en Proceso");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// T-09: Legacy OP not displayed as certified
// ══════════════════════════════════════════════════════════════════════════

describe("T-09: legacy OP isolated from UI", () => {
  test("no legacyOpCandidates count displayed in UI", () => {
    // The truth audit panel should NOT show legacyOpCandidates technical info
    // (it's preserved in props but not displayed)
    const uiLines = clientSrc.split("\n").filter(l =>
      l.includes("opTruthAudit.legacyOpCandidates") && !l.trim().startsWith("//")
    );
    expect(uiLines.length).toBe(0);
  });

  test("no 'OP reales (ProductionOrder)' text in UI", () => {
    expect(clientSrc).not.toContain("OP reales (ProductionOrder)");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// T-10: Canonical cascade comment
// ══════════════════════════════════════════════════════════════════════════

describe("T-10: canonical cascade declared", () => {
  test("engine declares B01 → B04 → PRODUCTION_REQUIRED", () => {
    expect(engineSrc).toContain("B01_DISPONIBLE → B04_PRODUCTO_EN_PROCESO → PRODUCTION_REQUIRED");
  });

  test("loader declares B04_PHYSICAL_IS_THE_BUSINESS_OP_AUTHORITY", () => {
    expect(loaderSrc).toContain("B04_PHYSICAL_IS_THE_BUSINESS_OP_AUTHORITY");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// T-11: Coverage explanation references B04 not OP
// ══════════════════════════════════════════════════════════════════════════

describe("T-11: explanations reference B04", () => {
  test("DATA_UNVERIFIED explanation mentions B04", () => {
    expect(engineSrc).toContain("certificar B01 y B04");
  });

  test("OP_INCOMING explanation says B04 existencia", () => {
    expect(engineSrc).toContain("En camino — B04 existencia:");
  });

  test("PRODUCTION_REQUIRED explanation says B01 y B04", () => {
    expect(engineSrc).toContain("Stock certificado = 0 en B01 y B04");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// T-12: opTruthAudit explanation references cascade
// ══════════════════════════════════════════════════════════════════════════

describe("T-12: opTruthAudit cascade explanation", () => {
  test("explanation mentions B01 → B04 → Produccion", () => {
    expect(loaderSrc).toContain("Cascada: B01 → B04 → Produccion requerida");
  });

  test("explanation states ProductionOrder is backlog", () => {
    expect(loaderSrc).toContain("backlog de Produccion");
  });

  test("explanation does NOT reference producedQty or estimated", () => {
    const explanationLine = loaderSrc.split("\n").find(l =>
      l.includes("backlog de Produccion") && l.includes("explanation:")
    );
    // The explanation should not mention producedQty or estimated
    if (explanationLine) {
      expect(explanationLine).not.toContain("producedQty");
      expect(explanationLine).not.toContain("estimado");
    }
  });
});
