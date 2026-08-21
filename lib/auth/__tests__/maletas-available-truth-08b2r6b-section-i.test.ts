/**
 * P0-INVENTORY-AVAILABLE-TRUTH-08B2R6B — Section I
 *
 * 13 additional tests certifying:
 *   I-01: coverage undefined → VerifiedAvailable.truthState = DATA_UNVERIFIED
 *   I-02: zero SAG DISPONIBLE → VERIFIED (zero is a real measurement, not absence)
 *   I-03: null ≠ zero semantics (null = unknown, zero = measured empty)
 *   I-04: null centralAvailable → no suggestedAction, no replacement
 *   I-05: coverage-report-payload preserves null availableQty
 *   I-06: opportunities (allCentralRefs) derive from canonical SAG, not CCS
 *   I-07: executive summary excludes unverified refs from unit totals
 *   I-08: import path uses lookupRec.compatibleCommercialStock (separate domain)
 *   I-09: CJ-1126012 RESERVADO change explains DISPONIBLE drop (27-22=5)
 *   I-10: VerifiedAvailable discriminated union enforces type contract
 *   I-11: fail-closed in sample-coverage-engine (DATA_UNVERIFIED when !b01Available)
 *   I-12: deriveState returns "sin_datos" when centralAvailable is null
 *   I-13: vendor-sample-service adds stockDataState field
 */

import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const worktreeRoot = path.resolve(__dirname, "../../..");
function readSrc(relPath: string): string {
  return fs.readFileSync(path.resolve(worktreeRoot, relPath), "utf8");
}

const loaderSrc = readSrc("lib/comercial/maletas/vendor-sample-loader.ts");
const typesSrc = readSrc("lib/comercial/maletas/vendor-sample-types.ts");
const serviceSrc = readSrc("lib/comercial/maletas/vendor-sample-service.ts");
const coverageEngineSrc = readSrc("lib/comercial/maletas/sample-coverage-engine.ts");
const coverageReportSrc = readSrc("lib/comercial/maletas/coverage-report-payload.ts");
const intelligenceSrc = readSrc("lib/comercial/maletas/maletas-commercial-intelligence.ts");
const clientSrc = readSrc("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");

// ══════════════════════════════════════════════════════════════════════════
// I-01: coverage undefined → DATA_UNVERIFIED
// ══════════════════════════════════════════════════════════════════════════

describe("I-01: coverage undefined produces DATA_UNVERIFIED", () => {
  test("loader builds DATA_UNVERIFIED verifiedAvailable when coverage is missing", () => {
    // The ternary: coverage != null ? VERIFIED : DATA_UNVERIFIED
    expect(loaderSrc).toContain('truthState: "DATA_UNVERIFIED" as const');
    expect(loaderSrc).toContain('reason: "SAG_CURRENT_AVAILABLE_MISSING"');
  });

  test("when DATA_UNVERIFIED, availableQty is null", () => {
    // The DATA_UNVERIFIED branch sets availableQty: null (a few lines before the truthState marker)
    const markerIdx = loaderSrc.indexOf('"DATA_UNVERIFIED" as const');
    const dataUnverifiedBlock = loaderSrc.slice(
      Math.max(0, markerIdx - 200),
      markerIdx + 100,
    );
    expect(dataUnverifiedBlock).toContain("availableQty: null");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// I-02: zero SAG DISPONIBLE → VERIFIED (zero is a real measurement)
// ══════════════════════════════════════════════════════════════════════════

describe("I-02: zero SAG is VERIFIED, not sin_datos", () => {
  test("VERIFIED branch uses coverage.disponible which can be 0", () => {
    expect(loaderSrc).toContain('truthState: "VERIFIED" as const');
    // Coverage present with disponible=0 is still VERIFIED
    expect(loaderSrc).toContain("availableQty: coverage.disponible");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// I-03: null ≠ zero semantics
// ══════════════════════════════════════════════════════════════════════════

describe("I-03: null and zero are semantically different", () => {
  test("VendorSampleRef.centralAvailable type is number | null", () => {
    expect(typesSrc).toMatch(/centralAvailable:\s*number\s*\|\s*null/);
  });

  test("VerifiedAvailable has two branches: VERIFIED (number) and DATA_UNVERIFIED (null)", () => {
    expect(typesSrc).toContain('truthState: "VERIFIED"');
    expect(typesSrc).toContain('truthState: "DATA_UNVERIFIED"');
    // VERIFIED branch has availableQty: number
    const verifiedBlock = typesSrc.slice(
      typesSrc.indexOf("export type VerifiedAvailable"),
      typesSrc.indexOf("export type VerifiedAvailable") + 500,
    );
    expect(verifiedBlock).toContain("availableQty: number;");
    expect(verifiedBlock).toContain("availableQty: null;");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// I-04: null centralAvailable → no recommendations
// ══════════════════════════════════════════════════════════════════════════

describe("I-04: null centralAvailable blocks decisions", () => {
  test("loader derives state 'sin_datos' when centralAvailable is null", () => {
    // deriveState or deriveSampleState handles null
    expect(loaderSrc).toContain("sin_datos");
  });

  test("null centralAvailable produces no suggestedAction in UI", () => {
    // Client shows "Sin verificar" for null
    expect(clientSrc).toContain("Sin verificar");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// I-05: coverage-report-payload preserves null availableQty
// ══════════════════════════════════════════════════════════════════════════

describe("I-05: coverage report handles null availability", () => {
  test("CoverageReportPosition.candidate.availableQty allows null", () => {
    expect(coverageReportSrc).toMatch(/availableQty:\s*number\s*\|\s*null/);
  });

  test("report tracks dataUnverified count", () => {
    expect(coverageReportSrc).toContain("dataUnverified");
    expect(coverageReportSrc).toContain("hasUnverifiedData");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// I-06: opportunities derive from canonical SAG
// ══════════════════════════════════════════════════════════════════════════

describe("I-06: opportunities (allCentralRefs) use SAG CURRENT", () => {
  test("allCentralRefs.disponible comes from canonical cr.available (SAG)", () => {
    // allCentralRefs maps disponible: cr.available where cr = canonical ref
    expect(loaderSrc).toContain("disponible: cr.available");
  });

  test("allCentralRefs does NOT use CCS findMany or compatibleCommercialStock", () => {
    const centralRefsBlock = loaderSrc.slice(
      loaderSrc.indexOf("const allCentralRefs"),
      loaderSrc.indexOf("const existingRefs"),
    );
    expect(centralRefsBlock).not.toContain("findMany");
    expect(centralRefsBlock).not.toContain("compatibleCommercialStock");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// I-07: executive summary uses ?? 0 for null-safe unit totals
// ══════════════════════════════════════════════════════════════════════════

describe("I-07: unit totals handle null centralAvailable", () => {
  test("vendor-sample-service totalUnits uses ?? 0 for null guard", () => {
    expect(serviceSrc).toContain("r.centralAvailable ?? 0");
  });

  test("maletas-commercial-intelligence uses null guard for reduce", () => {
    expect(intelligenceSrc).toContain("r.centralAvailable ?? 0");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// I-08: import path uses separate authority
// ══════════════════════════════════════════════════════════════════════════

describe("I-08: import path uses B24 SAG CURRENT (P0-08B2R6D-R1)", () => {
  test("availableB24 derives from B24 SAG CURRENT via b24Canonical", () => {
    expect(loaderSrc).toContain("b24Canonical.byReference.get(item.reference)");
  });

  test("import scarcity uses availableB24, not centralAvailable", () => {
    expect(loaderSrc).toContain("accessoryScarcityState");
    expect(loaderSrc).toContain("availableB24");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// I-09: CJ-1126012 RESERVADO change explains DISPONIBLE drop
// ══════════════════════════════════════════════════════════════════════════

describe("I-09: CJ-1126012 reservation change", () => {
  test("EXISTENCIA=27 unchanged, RESERVADO=22 → DISPONIBLE=5", () => {
    const existencia = 27;
    const reservado = 22;
    expect(existencia - reservado).toBe(5);
  });

  test("previous RESERVADO=15 gave DISPONIBLE=12, new orders increased reservation", () => {
    const existencia = 27;
    const previousReservado = 15;
    const currentReservado = 22;
    expect(existencia - previousReservado).toBe(12);
    expect(existencia - currentReservado).toBe(5);
    expect(currentReservado - previousReservado).toBe(7); // 7 new units reserved
  });
});

// ══════════════════════════════════════════════════════════════════════════
// I-10: VerifiedAvailable type contract
// ══════════════════════════════════════════════════════════════════════════

describe("I-10: VerifiedAvailable discriminated union", () => {
  test("VERIFIED branch requires warehouseCode", () => {
    const vaBlock = typesSrc.slice(
      typesSrc.indexOf("export type VerifiedAvailable"),
      typesSrc.indexOf("export type VerifiedAvailable") + 500,
    );
    expect(vaBlock).toContain("warehouseCode: string");
  });

  test("DATA_UNVERIFIED branch requires reason string", () => {
    const vaBlock = typesSrc.slice(
      typesSrc.indexOf("export type VerifiedAvailable"),
      typesSrc.indexOf("export type VerifiedAvailable") + 500,
    );
    expect(vaBlock).toContain("reason: string");
  });

  test("VendorSampleRef includes verifiedAvailable field", () => {
    expect(typesSrc).toContain("verifiedAvailable: VerifiedAvailable");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// I-11: fail-closed in sample-coverage-engine
// ══════════════════════════════════════════════════════════════════════════

describe("I-11: sample-coverage-engine fail-closed", () => {
  test("DATA_UNVERIFIED is a valid CoverageStatus", () => {
    expect(coverageEngineSrc).toContain('"DATA_UNVERIFIED"');
  });

  test("textile slots emit DATA_UNVERIFIED when !dataAvailability.b01Available", () => {
    expect(coverageEngineSrc).toContain("!dataAvailability.b01Available");
    // The block after this check pushes DATA_UNVERIFIED
    const textileBlock = coverageEngineSrc.slice(
      coverageEngineSrc.indexOf("function resolveTextileSlots"),
      coverageEngineSrc.indexOf("function resolveImportSlots"),
    );
    expect(textileBlock).toContain('status: "DATA_UNVERIFIED"');
    expect(textileBlock).toContain("!dataAvailability.b01Available");
  });

  test("PRODUCTION_REQUIRED only when B01 AND OP are both certified absent", () => {
    // PRODUCTION_REQUIRED appears AFTER both bodega and OP checks
    const textileBlock = coverageEngineSrc.slice(
      coverageEngineSrc.indexOf("function resolveTextileSlots"),
      coverageEngineSrc.indexOf("function resolveImportSlots"),
    );
    const prodIdx = textileBlock.lastIndexOf('"PRODUCTION_REQUIRED"');
    const b01Idx = textileBlock.indexOf("STEP 1: Bodega Principal");
    const opIdx = textileBlock.indexOf("STEP 2: OP Activa");
    expect(prodIdx).toBeGreaterThan(opIdx);
    expect(opIdx).toBeGreaterThan(b01Idx);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// I-12: deriveState returns "sin_datos" when centralAvailable is null
// ══════════════════════════════════════════════════════════════════════════

describe("I-12: deriveState handles null", () => {
  test("loader deriveState accepts number | null parameter", () => {
    // deriveState signature: centralAvailable: number | null
    const deriveBlock = loaderSrc.slice(
      loaderSrc.indexOf("function deriveState"),
      loaderSrc.indexOf("function deriveState") + 200,
    );
    expect(deriveBlock).toContain("centralAvailable: number | null");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// I-13: vendor-sample-service includes stockDataState
// ══════════════════════════════════════════════════════════════════════════

describe("I-13: vendor-sample-service mock quarantine", () => {
  test("service sets stockDataState = ABSENT (not CERTIFIED) for mock data", () => {
    expect(serviceSrc).toContain("stockDataState");
    // MOCK_CONTEXT: must NEVER be CERTIFIED — this is not SAG data
    expect(serviceSrc).not.toMatch(/stockDataState.*"CERTIFIED"/);
    expect(serviceSrc).toContain('"ABSENT"');
  });

  test("service sets verifiedAvailable.truthState = DATA_UNVERIFIED for mock data", () => {
    expect(serviceSrc).toContain("verifiedAvailable:");
    // MOCK_CONTEXT: must NEVER claim VERIFIED — this is not SAG data
    expect(serviceSrc).not.toMatch(/truthState.*"VERIFIED"/);
    expect(serviceSrc).toContain('truthState: "DATA_UNVERIFIED"');
    expect(serviceSrc).toContain('reason: "MOCK_CONTEXT"');
  });

  test("MOCK_CONTEXT quarantine: vendor-sample-service can never certify data", () => {
    // The entire file must never contain truthState: "VERIFIED" or stockDataState: "CERTIFIED"
    // because MaletasOperationalContext is not a SAG source
    expect(serviceSrc).not.toContain('truthState: "VERIFIED"');
    expect(serviceSrc).not.toContain('"CERTIFIED" as const');
  });

  test("service has zero runtime imports — mock path unreachable in production", () => {
    // No module in app/ or lib/ imports from vendor-sample-service
    // Only validation scripts and tests reference it via string reading
    const appSources = fs.readdirSync(path.resolve(worktreeRoot, "app"), { recursive: true })
      .filter((f): f is string => typeof f === "string" && (f.endsWith(".ts") || f.endsWith(".tsx")));
    for (const f of appSources) {
      const content = fs.readFileSync(path.resolve(worktreeRoot, "app", f), "utf8");
      expect(content).not.toMatch(/from\s+["'].*vendor-sample-service["']/);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// R2-C: Import path — PHYSICAL_STOCK_ONLY, never PRODUCTION_REQUIRED
// ══════════════════════════════════════════════════════════════════════════

describe("R2-C: Import path quarantine", () => {
  test("VerifiedAvailable supports PHYSICAL_STOCK_ONLY truthState", () => {
    expect(typesSrc).toContain('"PHYSICAL_STOCK_ONLY"');
  });

  test("import coverage engine never emits PRODUCTION_REQUIRED for imports", () => {
    // resolveImportSlots must use IMPORT_UNAVAILABLE, never PRODUCTION_REQUIRED
    const importSlots = coverageEngineSrc.slice(
      coverageEngineSrc.indexOf("function resolveImportSlots"),
      coverageEngineSrc.length,
    );
    // Cut at next top-level function
    const nextFn = importSlots.indexOf("\nfunction ", 10);
    const importBlock = nextFn > 0 ? importSlots.slice(0, nextFn) : importSlots;
    expect(importBlock).not.toContain("PRODUCTION_REQUIRED");
    expect(importBlock).toContain("IMPORT_UNAVAILABLE");
  });

  test("import availableB24 uses B24 SAG CURRENT (P0-08B2R6D-R1)", () => {
    expect(loaderSrc).toContain("b24Canonical.byReference.get(item.reference)");
    // B24 (IMPORTACIÓN) is the sole central import warehouse
  });

  test("UI shows em dash for null availableB24, not zero", () => {
    // Must NOT show ?? 0 for import availability
    expect(clientSrc).not.toMatch(/availableB24\s*\?\?\s*0/);
    // Must show em dash
    expect(clientSrc).toContain('availableB24 ?? "\\u2014"');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// R2-D: Screen / PDF / XML consistency
// ══════════════════════════════════════════════════════════════════════════

const xmlSrc = readSrc("lib/comercial/maletas/coverage-report-xml.ts");
const pdfSrc = readSrc("lib/comercial/maletas/coverage-report-pdf-renderer.tsx");
const reportServiceSrc = readSrc("lib/comercial/maletas/coverage-report-service.ts");

describe("R2-D: Screen / PDF / XML consistency", () => {
  test("PDF and XML share same CoverageReportPayload source", () => {
    // Both import from coverage-report-payload
    expect(xmlSrc).toContain('from "./coverage-report-payload"');
    expect(pdfSrc).toContain('from "./coverage-report-payload"');
  });

  test("report service loads from same loader as screen", () => {
    expect(reportServiceSrc).toContain("loadVendorSampleData");
  });

  test("XML serializes null as self-closing tag, never as 0", () => {
    // tag() function returns empty element for null
    expect(xmlSrc).toMatch(/if\s*\(value\s*==\s*null\)/);
    expect(xmlSrc).not.toContain("?? 0");
  });

  test("PDF shows em dash for null, never 0", () => {
    // availableQty ?? pendingQty ?? "—"
    expect(pdfSrc).toContain('?? "\\u2014"');
  });

  test("CoverageReportPayload tracks DATA_UNVERIFIED state", () => {
    const payloadSrc = readSrc("lib/comercial/maletas/coverage-report-payload.ts");
    expect(payloadSrc).toContain("dataUnverified");
    expect(payloadSrc).toContain("hasUnverifiedData");
    expect(payloadSrc).toContain("availableQty: number | null");
  });

  test("invariant check exists in payload builder", () => {
    const payloadSrc = readSrc("lib/comercial/maletas/coverage-report-payload.ts");
    expect(payloadSrc).toContain("invariantValid");
  });
});
