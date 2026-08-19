/**
 * CASTILLITOS-COMMERCIAL-TRUTH-08A0 — Structural truth tests
 *
 * Validates:
 *   A. Maletas totalUnits = SUM(centralAvailable), not ref count
 *   B. Suggestion exclusion by vendor ref set (normalized)
 *   C. Derrotero / plan de surtido structure
 *   D. Auto-activation from presence data
 *   E. SAG line mapping (1=Latin Kids, 2=Castillitos)
 *   F. Special articles exclusion (CD-*)
 *   G. Discount rules scoped to Castillitos only
 */

import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

function readSrc(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../../../", relPath), "utf-8");
}

// ── E. Line swap fix ────────────────────────────────────────────────────────

describe("E — SAG line mapping corrected", () => {
  const src = readSrc("lib/comercial/tiendas/store-business-lines.ts");

  test("T01: Line 1 maps to latin_kids (SAG LINEAS.1 = LATIN KIDS)", () => {
    const mapIdx = src.indexOf("SAG_LINE_MAP");
    const chunk = src.slice(mapIdx, mapIdx + 500);
    // "1": "latin_kids" must appear BEFORE "2"
    const line1Idx = chunk.indexOf('"1":');
    const line1Chunk = chunk.slice(line1Idx, line1Idx + 60);
    expect(line1Chunk).toContain('"latin_kids"');
  });

  test("T02: Line 2 maps to castillitos (SAG LINEAS.2 = CASTILLITOS)", () => {
    const mapIdx = src.indexOf("SAG_LINE_MAP");
    const chunk = src.slice(mapIdx, mapIdx + 500);
    const line2Idx = chunk.indexOf('"2":');
    const line2Chunk = chunk.slice(line2Idx, line2Idx + 60);
    expect(line2Chunk).toContain('"castillitos"');
  });

  test("T03: SAG_LINE_MAP has comments referencing confirmed dates", () => {
    expect(src).toContain("confirmed 2026-04-08");
  });

  test("T04: resolveCanonicalLineFromDomain fallback consistent with SAG_LINE_MAP", () => {
    const canonSrc = readSrc("lib/comercial/maletas/maletas-canonical-inventory.ts");
    // productLine === "1" should return LATIN_KIDS
    expect(canonSrc).toContain('if (productLine === "1") return "LATIN_KIDS"');
    // productLine === "2" should return CASTILLITOS
    expect(canonSrc).toContain('if (productLine === "2"');
    const line2Idx = canonSrc.indexOf('if (productLine === "2"');
    const line2Chunk = canonSrc.slice(line2Idx, line2Idx + 120);
    expect(line2Chunk).toContain('"CASTILLITOS"');
  });
});

// ── A. Maletas totalUnits ────────────────────────────────────────────────────

describe("A — Maletas totalUnits uses actual units", () => {
  const loaderSrc = readSrc("lib/comercial/maletas/vendor-sample-loader.ts");
  const serviceSrc = readSrc("lib/comercial/maletas/vendor-sample-service.ts");

  test("T05: Loader totalUnits sums centralAvailable, not refs.length", () => {
    expect(loaderSrc).toContain("totalUnits: refs.reduce");
    expect(loaderSrc).toContain("centralAvailable");
    // Must NOT have totalUnits: refs.length
    const matches = loaderSrc.match(/totalUnits:\s*refs\.length/g);
    expect(matches).toBeNull();
  });

  test("T06: Service totalUnits sums centralAvailable, not refs.length", () => {
    expect(serviceSrc).toContain("totalUnits: refs.reduce");
    // Must NOT have totalUnits: refs.length
    const matches = serviceSrc.match(/totalUnits:\s*refs\.length/g);
    expect(matches).toBeNull();
  });
});

// ── B. Suggestion exclusion ──────────────────────────────────────────────────

describe("B — Suggestion excludes vendor-present refs", () => {
  const loaderSrc = readSrc("lib/comercial/maletas/vendor-sample-loader.ts");

  test("T07: vendorRefSet built from all vendor refs with normalization", () => {
    expect(loaderSrc).toContain("vendorRefSet");
    // Must build the set with normalization
    expect(loaderSrc).toContain("vendorRefSet = new Set(refs.map((r) => r.reference.trim().toUpperCase())");
  });

  test("T08: Replacement candidates exclude vendorRefSet members (normalized)", () => {
    expect(loaderSrc).toContain("!vendorRefSet.has(c.refCode.trim().toUpperCase())");
  });

  test("T09: OP candidates also exclude vendorRefSet members (normalized)", () => {
    expect(loaderSrc).toContain("!vendorRefSet.has(o.reference.trim().toUpperCase())");
  });

  test("T09b: vendorRefSet uses normalized keys (trim + uppercase)", () => {
    expect(loaderSrc).toContain("r.reference.trim().toUpperCase()");
  });
});

// ── C. Derrotero / plan de surtido structure ─────────────────────────────────

describe("C — Derrotero structure and semantics", () => {
  test("T15: Derrotero semantics define STORE=UNITS, SALES_PORTFOLIO=REFERENCES", () => {
    const src = readSrc("lib/comercial/derrotero-semantics.ts");
    expect(src).toContain('STORE: "UNITS"');
    expect(src).toContain('SALES_PORTFOLIO: "REFERENCES"');
  });

  test("T16: Assortment catalog evaluator exists for maletas", () => {
    const src = readSrc("lib/comercial/maletas/assortment-catalog/mallet-assortment-evaluator.ts");
    expect(src).toContain("evaluateMalletAssortment");
  });

  test("T17: Loader includes assortmentEvaluations in output", () => {
    const src = readSrc("lib/comercial/maletas/vendor-sample-loader.ts");
    expect(src).toContain("assortmentEvaluations");
  });
});

// ── D. Auto-activation from presence data ────────────────────────────────────

describe("D — Vendor bag activation from SAG presence", () => {
  test("T18: Vendor presence engine queries SAG movimientos_traslados", () => {
    const src = readSrc("lib/comercial/maletas/vendor-sample-presence-engine.ts");
    expect(src).toContain("movimientos_traslados");
    expect(src).toContain("net_qty");
  });

  test("T19: Presence items are trimmed from SAG ref codes", () => {
    const src = readSrc("lib/comercial/maletas/vendor-sample-presence-engine.ts");
    // Reference codes from SAG are trimmed
    expect(src).toContain('.trim()');
  });

  test("T20: Vendor bodegas are correctly mapped", () => {
    const src = readSrc("lib/comercial/maletas/vendor-sample-presence-engine.ts");
    // Orlando=45, Carlos Leon=46, Luis=47, Nestor=48, Carlos Villa=49, Fredy=50
    expect(src).toContain("45");
    expect(src).toContain("48");
    expect(src).toContain("50");
  });
});

// ── F. Special articles exclusion ────────────────────────────────────────────

describe("F — Special articles (CD-*) exclusion architecture", () => {
  const src = readSrc("lib/comercial/commercial-exclusions.ts");

  test("T21: CD- prefix defined as special collection", () => {
    expect(src).toContain('"CD-"');
    expect(src).toContain('"CD "');
  });

  test("T22: isExcludedFromAutomaticPricing delegates to isSpecialCollectionReference", () => {
    expect(src).toContain("isSpecialCollectionReference");
    expect(src).toContain("isExcludedFromAutomaticPricing");
  });

  test("T23: Six governed surfaces documented", () => {
    expect(src).toContain("DESCUENTOS_TIENDA");
    expect(src).toContain("MARKDOWN_AUTOMATICO");
    expect(src).toContain("BAJA_ROTACION_TIENDA");
    expect(src).toContain("DEADSTOCK_MALETAS");
    expect(src).toContain("VAULT_DORMIDAS");
    expect(src).toContain("OUTLET");
  });

  test("T24: Reference normalization in exclusion check (trim + uppercase)", () => {
    expect(src).toContain("trim().toUpperCase()");
  });
});

// ── G. Discount line scoping ─────────────────────────────────────────────────

describe("G — Discounts scoped to Castillitos line only", () => {
  const discountSrc = readSrc("lib/comercial/tiendas/store-discount-service.ts");

  test("T10: resolveDiscountLine classifies items by line", () => {
    expect(discountSrc).toContain("resolveDiscountLine");
    expect(discountSrc).toContain('"LATIN_KIDS"');
    expect(discountSrc).toContain('"ACCESORIOS"');
    expect(discountSrc).toContain('"CASTILLITOS"');
  });

  test("T11: Non-Castillitos lines are skipped in discount evaluation", () => {
    // The loop should check discountLine !== "CASTILLITOS" and continue
    expect(discountSrc).toContain('discountLine !== "CASTILLITOS"');
    // After the check, there should be a continue
    const checkIdx = discountSrc.indexOf('discountLine !== "CASTILLITOS"');
    const afterCheck = discountSrc.slice(checkIdx, checkIdx + 200);
    expect(afterCheck).toContain("continue");
  });

  test("T12: Special collection (CD-*) excluded from discounts", () => {
    expect(discountSrc).toContain("isExcludedFromAutomaticPricing");
    expect(discountSrc).toContain("excludedSpecialCollection");
  });
});

// ── E. Classification consistency ────────────────────────────────────────────

describe("E — Classification canonical consistency", () => {
  test("T13: SAG overrides file confirms line 1 = LATIN KIDS", () => {
    const overrides = readSrc("lib/sag/master-data/castillitos-overrides.ts");
    // CASTILLITOS_LINEAS labels should have "1": "LATIN KIDS"
    const lineasIdx = overrides.indexOf("CASTILLITOS_LINEAS");
    const chunk = overrides.slice(lineasIdx, lineasIdx + 300);
    expect(chunk).toContain('"1": "LATIN KIDS"');
    expect(chunk).toContain('"2": "CASTILLITOS"');
  });

  test("T14: Three business lines defined (castillitos, latin_kids, accesorios)", () => {
    const src = readSrc("lib/comercial/tiendas/store-business-lines.ts");
    expect(src).toContain('"castillitos"');
    expect(src).toContain('"latin_kids"');
    expect(src).toContain('"accesorios_importacion"');
  });
});
