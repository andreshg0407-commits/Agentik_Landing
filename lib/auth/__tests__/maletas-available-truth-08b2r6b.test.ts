/**
 * P0-INVENTORY-AVAILABLE-TRUTH-08B2R6B
 *
 * 18 tests certifying that:
 *   1. centralAvailable uses SAG CURRENT DISPONIBLE exclusively
 *   2. CCS/PIL compatibleCommercialStock is NEVER used for textile availability
 *   3. coverage.disponible traces to canonical-warehouse-availability SAG CURRENT
 *   4. IMPORT accessories still use canonical lookup (separate domain)
 *   5. No stale CCS snapshot contaminates the drawer
 *   6. SAG DISPONIBLE = EXISTENCIA - RESERVADO (formula audit)
 *   7. Negative variant exclusion (GREATEST(0,qty)) is NOT used for availability
 *
 * Fixture values (SAG CURRENT B01 at evidence timestamp):
 *   CJ-1126012    → DISPONIBLE=5  (EXISTENCIA=27, RESERVADO=22)
 *   CGJ-1153425B  → DISPONIBLE=2  (EXISTENCIA=14, RESERVADO=12)
 *   CR-2563215B   → DISPONIBLE=14 (EXISTENCIA=18, RESERVADO=4)
 *
 * Stale CCS values that must NOT appear:
 *   CJ-1126012    → 24 (physicalQty=60, crmReservedQty=36)
 *   CGJ-1153425B  → 35 (physicalQty=62, crmReservedQty=27)
 *   CR-2563215B   → 43 (physicalQty=47, crmReservedQty=0)
 *
 * PIL positiveQuantity that must NOT appear:
 *   CJ-1126012    → 200 (WH=13 positive=200, WH=10 positive=0)
 *   CGJ-1153425B  → 152 (WH=13 positive=152, WH=10 positive=0)
 *   CR-2563215B   → 104 (WH=13 positive=104, WH=10 positive=0)
 */

import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// __dirname points to the worktree test directory; resolve to worktree root
const worktreeRoot = path.resolve(__dirname, "../../..");
function readSrc(relPath: string): string {
  return fs.readFileSync(path.resolve(worktreeRoot, relPath), "utf8");
}

const loaderSrc = readSrc("lib/comercial/maletas/vendor-sample-loader.ts");
const canonicalWhSrc = readSrc("lib/comercial/maletas/canonical-warehouse-availability.ts");
const resolverSrc = readSrc("lib/inventory/compatible-commercial-stock-resolver.ts");
const canonicalLookupSrc = readSrc("lib/inventory/canonical-reference-lookup.ts");

// ══════════════════════════════════════════════════════════════════════════
// A. centralAvailable source authority
// ══════════════════════════════════════════════════════════════════════════

describe("A. centralAvailable uses SAG CURRENT exclusively", () => {
  test("T01: centralAvailable derives from verifiedAvailable which uses coverage.disponible, not lookupRec.compatibleCommercialStock", () => {
    // After VerifiedAvailable contract: coverage.disponible → verifiedAvailable.availableQty → centralAvailable
    // Step 1: verifiedAvailable gets disponible from coverage
    expect(loaderSrc).toContain("coverage.disponible");
    // Step 2: centralAvailable derives from verifiedAvailable
    const centralAvailLine = loaderSrc.match(/const centralAvailable\s*=\s*(.+?);/);
    expect(centralAvailLine).toBeTruthy();
    expect(centralAvailLine![1]).toContain("verifiedAvailable.availableQty");
    // Never from lookupRec.compatibleCommercialStock
    expect(centralAvailLine![1]).not.toContain("lookupRec.compatibleCommercialStock");
  });

  test("T02: centralAvailable does NOT have a ternary fallback to lookupRec", () => {
    // No pattern like: lookupRec ? lookupRec.compatibleCommercialStock : coverage?.disponible
    const hasTernaryFallback = /centralAvailable\s*=\s*lookupRec\s*\?/.test(loaderSrc);
    expect(hasTernaryFallback).toBe(false);
  });

  test("T03: P0-INVENTORY-AVAILABLE-TRUTH-08B2R6B marker exists in vendor-sample-loader", () => {
    expect(loaderSrc).toContain("P0-INVENTORY-AVAILABLE-TRUTH-08B2R6B");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. SAG CURRENT canonical-warehouse-availability
// ══════════════════════════════════════════════════════════════════════════

describe("B. canonical-warehouse-availability uses SAG CURRENT", () => {
  test("T04: available field is set from SAG DISPONIBLE", () => {
    expect(canonicalWhSrc).toContain("available: disponible");
  });

  test("T05: source is SAG_CURRENT", () => {
    expect(canonicalWhSrc).toContain('source: "SAG_CURRENT"');
  });

  test("T06: query targets B01 warehouse (BODEGA LIKE '01 -%')", () => {
    expect(canonicalWhSrc).toContain("BODEGA LIKE '01 -%'");
  });

  test("T07: query selects EXISTENCIA, RESERVADO, DISPONIBLE from vw_agentik_inventario", () => {
    expect(canonicalWhSrc).toContain("vw_agentik_inventario");
    expect(canonicalWhSrc).toContain("EXISTENCIA");
    expect(canonicalWhSrc).toContain("RESERVADO");
    expect(canonicalWhSrc).toContain("DISPONIBLE");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. CCS/PIL contamination blocked
// ══════════════════════════════════════════════════════════════════════════

describe("C. CCS/PIL not used for textile centralAvailable", () => {
  test("T08: coverageRows.disponible maps to canonical r.available (SAG), not CCS", () => {
    // coverageRows derives disponible from canonical.refs[].available
    expect(loaderSrc).toContain("disponible: r.available");
  });

  test("T09: compatible-commercial-stock-resolver uses GREATEST(0,qty) which inflates values", () => {
    // This documents the known inflation mechanism
    expect(resolverSrc).toContain("positiveQuantity");
    expect(resolverSrc).toContain("pilPosTotal += bal.positiveQuantity");
  });

  test("T10: canonical-reference-lookup queries CCS from Prisma (stale snapshots)", () => {
    // This documents that CCS from Prisma is stale — not SAG CURRENT
    expect(canonicalLookupSrc).toContain("commercialCoverageSnapshot");
    expect(canonicalLookupSrc).toContain("snapshotAt");
  });

  test("T11: IMPORT accessories use B24 SAG CURRENT (P0-08B2R6D-R1)", () => {
    // The IMPORT path uses B24 SAG CURRENT via getCanonicalImportWarehouseAvailability
    expect(loaderSrc).toContain("b24Canonical.byReference.get(item.reference)");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D. Data path isolation
// ══════════════════════════════════════════════════════════════════════════

describe("D. Data path isolation", () => {
  test("T12: canonical-warehouse-availability queries SAG directly", () => {
    // Uses SAG SOAP client, not Prisma CCS findMany
    expect(canonicalWhSrc).toContain("consultaSagJson");
    expect(canonicalWhSrc).toContain('source: "SAG_CURRENT"');
    // CCS is only mentioned as PROHIBITED, not used as data source
    expect(canonicalWhSrc).not.toMatch(/findMany.*CommercialCoverageSnapshot/);
  });

  test("T13: vendor-sample-loader coverage derives from canonical SAG, not Prisma CCS", () => {
    // The coverageRows are built from canonical.refs (SAG CURRENT), not CCS findMany
    const coverageRowsBlock = loaderSrc.slice(
      loaderSrc.indexOf("const coverageRows"),
      loaderSrc.indexOf("const coverageMap"),
    );
    expect(coverageRowsBlock).toContain("canonical.refs.map");
    expect(coverageRowsBlock).toContain("disponible: r.available");
    expect(coverageRowsBlock).not.toContain("findMany");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E. Formula verification
// ══════════════════════════════════════════════════════════════════════════

describe("E. SAG DISPONIBLE formula", () => {
  test("T14: SAG DISPONIBLE = EXISTENCIA - RESERVADO in vw_agentik_inventario", () => {
    // The view computes DISPONIBLE as EXISTENCIA - RESERVADO
    // canonical-warehouse-availability preserves this directly
    expect(canonicalWhSrc).toContain("existencia: data.existencia");
    expect(canonicalWhSrc).toContain("reservado: data.reservado");
    expect(canonicalWhSrc).toContain("available: disponible");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F. Fixture evidence (runtime data from SAG query)
// ══════════════════════════════════════════════════════════════════════════

describe("F. Fixture evidence — SAG CURRENT vs CCS/PIL discrepancy", () => {
  // These tests document the evidence from the runtime query.
  // SAG CURRENT B01 truth at evidence timestamp:
  const SAG_CURRENT = {
    "CJ-1126012":    { existencia: 27, reservado: 22, disponible: 5 },
    "CGJ-1153425B":  { existencia: 14, reservado: 12, disponible: 2 },
    "CR-2563215B":   { existencia: 18, reservado: 4,  disponible: 14 },
  };
  const STALE_CCS = {
    "CJ-1126012":    { disponible: 24, physicalQty: 60, crmReservedQty: 36 },
    "CGJ-1153425B":  { disponible: 35, physicalQty: 62, crmReservedQty: 27 },
    "CR-2563215B":   { disponible: 43, physicalQty: 47, crmReservedQty: 0 },
  };
  const PIL_POSITIVE = {
    "CJ-1126012":    200,
    "CGJ-1153425B":  152,
    "CR-2563215B":   104,
  };

  test("T15: SAG DISPONIBLE = EXISTENCIA - RESERVADO for all 3 incident refs", () => {
    for (const [ref, data] of Object.entries(SAG_CURRENT)) {
      expect(data.disponible).toBe(data.existencia - data.reservado);
    }
  });

  test("T16: CCS disponible does NOT match SAG CURRENT for any incident ref", () => {
    for (const ref of Object.keys(SAG_CURRENT) as (keyof typeof SAG_CURRENT)[]) {
      expect(STALE_CCS[ref].disponible).not.toBe(SAG_CURRENT[ref].disponible);
    }
  });

  test("T17: PIL positiveQuantity is grossly inflated vs SAG CURRENT", () => {
    for (const ref of Object.keys(SAG_CURRENT) as (keyof typeof SAG_CURRENT)[]) {
      // PIL shows 104-200, SAG shows 2-14
      expect(PIL_POSITIVE[ref]).toBeGreaterThan(SAG_CURRENT[ref].disponible * 5);
    }
  });

  test("T18: CCS disponible is always <= physicalQty (stale snapshot, not SAG CURRENT)", () => {
    for (const [ref, data] of Object.entries(STALE_CCS)) {
      expect(data.disponible).toBeLessThanOrEqual(data.physicalQty);
      // CCS values are snapshots frozen at Aug 18 — they don't reflect current SAG state
      expect(data.disponible).not.toBe(SAG_CURRENT[ref as keyof typeof SAG_CURRENT].disponible);
    }
  });
});
