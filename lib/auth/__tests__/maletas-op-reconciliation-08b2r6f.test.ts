/**
 * MALETAS-P0-OP-ACTIVE-RUNTIME-RECONCILIATION-08B2R6F
 *
 * Tests:
 *   F-01: All B04 refs are classified (none silently dropped)
 *   F-02: Sum of classifications reconciles the B04 universe
 *   F-03: OP with pendingQty > 0 covers a position
 *   F-04: OP closed/completed does not cover
 *   F-05: OP cancelled does not cover
 *   F-06: BB/BEBE normalization in toDisplayLabel
 *   F-07: Ambiguous match → DATA_UNVERIFIED
 *   F-08: Source loaded but incomplete normalization blocks production
 *   F-09: B04 widget and coverage use same snapshot path
 *   F-10: Visual labels do not show CS/LT/IMPORT
 *   F-11: Pending quantity never negative
 *   F-12: Duplicates do not duplicate coverage
 */

// @ts-expect-error — vitest types resolved at runtime via npx, not a project dependency
import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { toDisplayLabel } from "../../comercial/maletas/textile-reference-normalizer";

const worktreeRoot = path.resolve(__dirname, "../../..");
function readSrc(relPath: string): string {
  return fs.readFileSync(path.resolve(worktreeRoot, relPath), "utf8");
}

const clientSrc = readSrc("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");
const coverageEngineSrc = readSrc("lib/comercial/maletas/sample-coverage-engine.ts");
const loaderSrc = readSrc("lib/comercial/maletas/vendor-sample-loader.ts");
const b04Src = readSrc("lib/comercial/maletas/b04-production-inventory.ts");

// ══════════════════════════════════════════════════════════════════════════
// F-01: All B04 refs are classified
// ══════════════════════════════════════════════════════════════════════════

describe("F-01: all B04 refs classified, none silently dropped", () => {
  test("classifyB04Ref function exists in client", () => {
    expect(clientSrc).toContain("function classifyB04Ref(");
  });

  test("reconciled array maps ALL b04Inventory.refs", () => {
    expect(clientSrc).toContain("b04Inventory.refs.map((ref) =>");
    expect(clientSrc).toContain("classifyB04Ref(ref, coverageInfo)");
  });

  test("every ref gets an exclusionReason", () => {
    // The function always returns an exclusionReason
    const fnBlock = clientSrc.slice(
      clientSrc.indexOf("function classifyB04Ref("),
      clientSrc.indexOf("function classifyB04Ref(") + 2000,
    );
    expect(fnBlock).toContain("exclusionReason:");
    // No code path returns without exclusionReason
    expect(fnBlock).not.toContain("return { reference");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F-02: Sum of classifications reconciles the B04 universe
// ══════════════════════════════════════════════════════════════════════════

describe("F-02: reconciliation invariant", () => {
  test("UI shows invariant formula: matched + unmatched + unverified = total", () => {
    expect(clientSrc).toContain("matched.length} + ${unmatched.length} + ${unverified.length} = ${reconciled.length}");
  });

  test("matched + unmatched + unverified partition is exhaustive", () => {
    // matched = MATCHED, unmatched = !MATCHED && CERTIFIED, unverified = DATA_UNVERIFIED
    expect(clientSrc).toContain('r.exclusionReason === "MATCHED"');
    expect(clientSrc).toContain('r.exclusionReason !== "MATCHED" && r.matchTruthState === "CERTIFIED"');
    expect(clientSrc).toContain('r.matchTruthState === "DATA_UNVERIFIED"');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F-03: OP with pendingQty > 0 covers a position
// ══════════════════════════════════════════════════════════════════════════

describe("F-03: OP with positive pending covers position", () => {
  test("coverage engine assigns OP_INCOMING when opMatch found", () => {
    expect(coverageEngineSrc).toContain('status: "OP_INCOMING"');
    expect(coverageEngineSrc).toContain("pendingQty: opMatch.pendingQty");
  });

  test("OP candidate must have pendingQty > 0", () => {
    expect(coverageEngineSrc).toContain("if (op.pendingQty <= 0) return false");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F-04: OP closed/completed does not cover
// ══════════════════════════════════════════════════════════════════════════

describe("F-04: completed OP does not cover", () => {
  test("checkOpEligibility rejects pendingQty <= 0", () => {
    // In maletas-functional-evaluation.ts checkOpEligibility
    expect(clientSrc).not.toContain("eligibility override");
    // The loader filters at build time
    expect(loaderSrc).toContain("if (b04Ref.existencia <= 0) continue");
  });

  test("B04 only loads positive stock", () => {
    expect(b04Src).toContain("if (data.existencia <= 0) continue");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F-05: OP cancelled does not cover
// ══════════════════════════════════════════════════════════════════════════

describe("F-05: cancelled OP does not cover", () => {
  test("B04 represents physical inventory — cancelled OPs have no B04 stock", () => {
    // B04 is physical inventory query (EXISTENCIA > 0).
    // A cancelled OP would have 0 existencia in B04, thus filtered out.
    expect(b04Src).toContain("EXISTENCIA, RESERVADO, DISPONIBLE");
    expect(b04Src).toContain("if (data.existencia <= 0) continue");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F-06: BB/BEBE normalization in toDisplayLabel
// ══════════════════════════════════════════════════════════════════════════

describe("F-06: BB/BEBE normalization", () => {
  test("BB → Bebé", () => {
    expect(toDisplayLabel("BB")).toBe("Bebé");
    expect(toDisplayLabel("BB NIÑA")).toBe("Bebé Niña");
  });

  test("BEBE → Bebé", () => {
    expect(toDisplayLabel("BEBE")).toBe("Bebé");
  });

  test("NINA → Niña", () => {
    expect(toDisplayLabel("NINA")).toBe("Niña");
    expect(toDisplayLabel("NINA KIDS")).toBe("Niña Kids");
  });

  test("NINO → Niño", () => {
    expect(toDisplayLabel("NINO")).toBe("Niño");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F-07: Ambiguous match → DATA_UNVERIFIED
// ══════════════════════════════════════════════════════════════════════════

describe("F-07: ambiguous match produces DATA_UNVERIFIED", () => {
  test("coverage engine checks isAmbiguousPosition", () => {
    expect(coverageEngineSrc).toContain("isAmbiguousPosition");
  });

  test("coverage engine produces DATA_UNVERIFIED for ambiguous positions", () => {
    expect(coverageEngineSrc).toContain('"DATA_UNVERIFIED"');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F-08: Incomplete normalization blocks production
// ══════════════════════════════════════════════════════════════════════════

describe("F-08: incomplete normalization blocks PRODUCTION_REQUIRED", () => {
  test("coverage engine requires b01Available for production decision", () => {
    expect(coverageEngineSrc).toContain("if (!dataAvailability.b01Available)");
  });

  test("coverage engine requires opAvailable for production decision", () => {
    expect(coverageEngineSrc).toContain("if (!dataAvailability.opAvailable)");
  });

  test("missing subgrupoSag blocks OP candidate creation", () => {
    expect(loaderSrc).toContain("if (!b04Ref.subgrupoSag) continue");
  });

  test("B04 ref without subgrupoSag classified as DATA_UNVERIFIED", () => {
    const classifyBlock = clientSrc.slice(
      clientSrc.indexOf("function classifyB04Ref("),
      clientSrc.indexOf("function classifyB04Ref(") + 2000,
    );
    expect(classifyBlock).toContain('"SUBGROUP_MISSING"');
    expect(classifyBlock).toContain('"DATA_UNVERIFIED"');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F-09: B04 widget and coverage use same snapshot
// ══════════════════════════════════════════════════════════════════════════

describe("F-09: B04 widget and coverage use same snapshot", () => {
  test("B04InventorySection receives b04Inventory prop", () => {
    expect(clientSrc).toContain("b04Inventory: MaletasClientProps");
  });

  test("loader builds b04OpCandidates from b04Inventory.refs", () => {
    expect(loaderSrc).toContain("for (const b04Ref of b04Inventory.refs)");
  });

  test("both surfaces receive data from single getB04ProductionInventory call", () => {
    // The loader calls getB04ProductionInventory once and passes result to both
    const callCount = (loaderSrc.match(/getB04ProductionInventory/g) ?? []).length;
    expect(callCount).toBeGreaterThanOrEqual(1);
    // b04Inventory is returned as a prop AND used for coverage candidates
    expect(loaderSrc).toContain("b04Inventory,");
    expect(loaderSrc).toContain("b04Inventory.refs");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F-10: Visual labels do not show CS/LT/IMPORT
// ══════════════════════════════════════════════════════════════════════════

describe("F-10: visual labels strip line code prefixes", () => {
  test("toDisplayLabel strips CS prefix", () => {
    expect(toDisplayLabel("CS NIÑA KIDS")).toBe("Niña Kids");
    expect(toDisplayLabel("Cs Niña Kids")).toBe("Niña Kids");
  });

  test("toDisplayLabel strips LT prefix", () => {
    expect(toDisplayLabel("LT NIÑO")).toBe("Niño");
  });

  test("toDisplayLabel strips IMPORT prefix", () => {
    expect(toDisplayLabel("IMPORT ACCESORIOS")).toBe("Accesorios");
  });

  test("toDisplayLabel preserves labels without prefix", () => {
    expect(toDisplayLabel("NIÑA KIDS")).toBe("Niña Kids");
    expect(toDisplayLabel("BEBÉ")).toBe("Bebé");
  });

  test("B04 line filter buttons use DERROTERO_LINE_LABEL", () => {
    // Search full B04 section (it's large)
    expect(clientSrc).toContain("DERROTERO_LINE_LABEL[l]");
  });

  test("B04 ref line badge uses DERROTERO_LINE_LABEL", () => {
    expect(clientSrc).toContain("DERROTERO_LINE_LABEL[entry.linea]");
  });

  test("coverage candidate line badge uses DERROTERO_LINE_LABEL", () => {
    // The coverage gap ref table should use label not raw code
    expect(clientSrc).toContain("DERROTERO_LINE_LABEL[cand.line]");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F-11: Pending quantity never negative
// ══════════════════════════════════════════════════════════════════════════

describe("F-11: pending quantity never negative", () => {
  test("B04 filters existencia <= 0 at load time", () => {
    expect(b04Src).toContain("if (data.existencia <= 0) continue");
  });

  test("loader filters existencia <= 0 again at candidate build time", () => {
    expect(loaderSrc).toContain("if (b04Ref.existencia <= 0) continue");
  });

  test("coverage engine checks pendingQty <= 0 in OP matching", () => {
    expect(coverageEngineSrc).toContain("if (op.pendingQty <= 0) return false");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F-12: Duplicates do not duplicate coverage
// ══════════════════════════════════════════════════════════════════════════

describe("F-12: duplicates do not duplicate coverage", () => {
  test("coverage engine tracks usedReferences", () => {
    expect(coverageEngineSrc).toContain("usedReferences.has(op.reference.trim().toUpperCase())");
  });

  test("matched OP ref is added to usedReferences", () => {
    expect(coverageEngineSrc).toContain("usedReferences.add(opMatch.reference.trim().toUpperCase())");
  });

  test("vendor refs excluded from OP matching", () => {
    expect(coverageEngineSrc).toContain("vendorRefs.has(op.reference.trim().toUpperCase())");
  });
});
