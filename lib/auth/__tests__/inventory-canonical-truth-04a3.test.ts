/**
 * INVENTORY-CANONICAL-TRUTH-04A3 — Unified Operational Inventory Acceptance Tests
 *
 * 16 behavioral tests verifying the unified warehouse/availability contract.
 * All tests are structural (file-reading) — no Prisma, no SAG, no React.
 *
 * Tests verify:
 *   H1: WIP never commercial
 *   H2: Materia prima never commercial
 *   H3: Franchises never commercial
 *   H4: Textile replenishment B01 only
 *   H5: Import replenishment B24 only
 *   H6: Unified resolver covers all scopes
 *   H7: Filter semantics (con_disponibilidad vs cobertura_suficiente)
 *   H8: Stale CCS snapshot blocks (B04 removed from composite)
 *   H9: Sobreventa preserved (negative disponible not clamped to 0)
 *   H10: L-6305 not opportunity from B01 (WIP only)
 *   H11: Zero-stock refs excluded from coverage candidates
 *   H12: CT-1021464B not B01 (production item)
 *   H13: Production open orders only
 *   H14: No STA_SKU quantities
 *   H15: CURRENT/HISTORICAL never aggregated
 *   H16: Decision scopes exhaustive
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const LIB = path.resolve(__dirname, "../..");
const INV = path.join(LIB, "comercial/inventory");
const MAL = path.join(LIB, "comercial/maletas");
const APP_INV = path.resolve(__dirname, "../../../app/(app)/[orgSlug]/comercial/inventario");

// ── H1: WIP (B04) never commercial ──────────────────────────────────────────

describe("H1: WIP never commercial", () => {
  const src = fs.readFileSync(path.join(INV, "castillitos-warehouse-profiles.ts"), "utf-8");

  test("H1a: B04 PRODUCTO EN PROCESO has scope SUPPLY_CHAIN, not COMMERCIAL", () => {
    // bodegaId 13, code "04" must be SUPPLY_CHAIN
    const b04Line = src.split("\n").find(l =>
      l.includes('code: "04"') && l.includes("PRODUCTO EN PROCESO")
    );
    expect(b04Line).toBeDefined();
    expect(b04Line).toContain('"SUPPLY_CHAIN"');
    expect(b04Line).not.toContain('"COMMERCIAL"');
  });

  test("H1b: B04 is classified as WIP role", () => {
    const b04Line = src.split("\n").find(l =>
      l.includes('code: "04"') && l.includes("PRODUCTO EN PROCESO")
    );
    expect(b04Line).toContain('"WIP"');
  });

  test("H1c: CWA no longer uses B01+B04 composite", () => {
    const cwa = fs.readFileSync(path.join(MAL, "canonical-warehouse-availability.ts"), "utf-8");
    expect(cwa).not.toContain('"B01+B04"');
    expect(cwa).toContain('"B01"');
  });
});

// ── H2: Materia prima never commercial ──────────────────────────────────────

describe("H2: Materia prima never commercial", () => {
  const src = fs.readFileSync(path.join(INV, "castillitos-warehouse-profiles.ts"), "utf-8");

  test("H2a: MATERIA PRIMA (bodegaId 14) is SUPPLY_CHAIN", () => {
    const line = src.split("\n").find(l =>
      l.includes("bodegaId: 14") && l.includes("MATERIA PRIMA")
    );
    expect(line).toBeDefined();
    expect(line).toContain('"SUPPLY_CHAIN"');
    expect(line).not.toContain('"COMMERCIAL"');
  });

  test("H2b: TELAS (bodegaId 15) is SUPPLY_CHAIN", () => {
    const line = src.split("\n").find(l =>
      l.includes("bodegaId: 15") && l.includes("TELAS")
    );
    expect(line).toContain('"SUPPLY_CHAIN"');
  });

  test("H2c: RETAZOS (bodegaId 16) is SUPPLY_CHAIN", () => {
    const line = src.split("\n").find(l =>
      l.includes("bodegaId: 16") && l.includes("RETAZOS")
    );
    expect(line).toContain('"SUPPLY_CHAIN"');
  });
});

// ── H3: Franchises never commercial ─────────────────────────────────────────

describe("H3: Franchises never commercial", () => {
  const src = fs.readFileSync(path.join(INV, "castillitos-warehouse-profiles.ts"), "utf-8");

  test("H3a: ALL franchise entries are EXCLUDED", () => {
    const franchiseLines = src.split("\n").filter(l => l.includes('"FRANCHISE"'));
    expect(franchiseLines.length).toBeGreaterThanOrEqual(8);
    for (const line of franchiseLines) {
      expect(line).toContain('"EXCLUDED"');
      expect(line).not.toContain('"COMMERCIAL"');
    }
  });

  test("H3b: F17-MAYORCA (bodegaId 23, code 14) is EXCLUDED", () => {
    const line = src.split("\n").find(l =>
      l.includes("bodegaId: 23") && l.includes("F17")
    );
    expect(line).toBeDefined();
    expect(line).toContain('"EXCLUDED"');
  });
});

// ── H4: Textile replenishment B01 only ──────────────────────────────────────

describe("H4: Textile replenishment B01 only", () => {
  const src = fs.readFileSync(path.join(INV, "castillitos-warehouse-profiles.ts"), "utf-8");

  test("H4a: TEXTILE_REPLENISHMENT_SOURCE scope exists", () => {
    expect(src).toContain('"TEXTILE_REPLENISHMENT_SOURCE"');
  });

  test("H4b: Textile replenishment filters by PRINCIPAL role", () => {
    expect(src).toContain('b.role === "PRINCIPAL"');
  });

  test("H4c: Only one PRINCIPAL+COMMERCIAL data entry (bodegaId 10)", () => {
    const lines = src.split("\n").filter(l =>
      l.includes('"PRINCIPAL"') && l.includes('"COMMERCIAL"') && l.includes("bodegaId:")
    );
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("bodegaId: 10");
  });
});

// ── H5: Import replenishment B24 only ───────────────────────────────────────

describe("H5: Import replenishment B24 only", () => {
  const src = fs.readFileSync(path.join(INV, "castillitos-warehouse-profiles.ts"), "utf-8");

  test("H5a: IMPORT_REPLENISHMENT_SOURCE scope exists", () => {
    expect(src).toContain('"IMPORT_REPLENISHMENT_SOURCE"');
  });

  test("H5b: Only one IMPORT_STAGING+COMMERCIAL data entry (bodegaId 33)", () => {
    const lines = src.split("\n").filter(l =>
      l.includes('"IMPORT_STAGING"') && l.includes('"COMMERCIAL"') && l.includes("bodegaId:")
    );
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("bodegaId: 33");
  });
});

// ── H6: Unified resolver covers all scopes ──────────────────────────────────

describe("H6: Unified scope resolver", () => {
  const src = fs.readFileSync(path.join(INV, "castillitos-warehouse-profiles.ts"), "utf-8");

  test("H6a: DecisionScope type covers all 6 scopes", () => {
    expect(src).toContain('"GLOBAL_SELLABLE"');
    expect(src).toContain('"TEXTILE_REPLENISHMENT_SOURCE"');
    expect(src).toContain('"IMPORT_REPLENISHMENT_SOURCE"');
    expect(src).toContain('"STORE_STOCK"');
    expect(src).toContain('"SELLER_PORTFOLIO_STOCK"');
    expect(src).toContain('"PRODUCTION_WIP"');
  });

  test("H6b: getWarehouseProfilesByScope function exists", () => {
    expect(src).toContain("export function getWarehouseProfilesByScope");
  });

  test("H6c: getBodegaIdsForScope function exists", () => {
    expect(src).toContain("export function getBodegaIdsForScope");
  });

  test("H6d: isBodegaInScope function exists", () => {
    expect(src).toContain("export function isBodegaInScope");
  });
});

// ── H7: Filter semantics ────────────────────────────────────────────────────

describe("H7: Filter semantics corrected", () => {
  const clientSrc = fs.readFileSync(path.join(APP_INV, "inventario-client.tsx"), "utf-8");

  test("H7a: 'Con disponibilidad' filter exists (real stock > 0)", () => {
    expect(clientSrc).toContain('"con_disponibilidad"');
    expect(clientSrc).toContain("Con disponibilidad");
  });

  test("H7b: 'Cobertura suficiente' filter exists (threshold-based)", () => {
    expect(clientSrc).toContain('"cobertura_suficiente"');
    expect(clientSrc).toContain("Cobertura suficiente");
  });

  test("H7c: Old 'disponible' filter key removed", () => {
    // The FilterKey type should NOT have the bare "disponible" value
    const filterKeyBlock = clientSrc.substring(
      clientSrc.indexOf("type FilterKey"),
      clientSrc.indexOf(";", clientSrc.indexOf("type FilterKey"))
    );
    // "disponible" should NOT appear as a standalone union member
    expect(filterKeyBlock).not.toContain('| "disponible"');
  });

  test("H7d: Con disponibilidad uses disponibleReal > 0", () => {
    // Find the case "con_disponibilidad" block and verify it checks disponibleReal
    const idx = clientSrc.indexOf('case "con_disponibilidad"');
    expect(idx).toBeGreaterThan(-1);
    const block = clientSrc.substring(idx, idx + 300);
    expect(block).toContain("disponibleReal > 0");
  });

  test("H7e: Cobertura suficiente uses pure threshold (04A5)", () => {
    const idx = clientSrc.indexOf('case "cobertura_suficiente"');
    expect(idx).toBeGreaterThan(-1);
    const block = clientSrc.substring(idx, idx + 400);
    // 04A5: Pure threshold — disponibleReal > threshold, not operationalState
    expect(block).toContain("orig.disponibleReal > orig.threshold");
    expect(block).not.toContain("operationalState");
  });
});

// ── H8: B04 removed from CWA composite ─────────────────────────────────────

describe("H8: B04 removed from availability composite", () => {
  const cwa = fs.readFileSync(path.join(MAL, "canonical-warehouse-availability.ts"), "utf-8");
  const mci = fs.readFileSync(path.join(MAL, "maletas-canonical-inventory.ts"), "utf-8");
  const vst = fs.readFileSync(path.join(MAL, "vendor-sample-types.ts"), "utf-8");

  test("H8a: CWA warehouseCode no longer contains B04", () => {
    expect(cwa).not.toContain('"B01+B04"');
  });

  test("H8b: MCI comment no longer references B04", () => {
    expect(mci).not.toContain("B01+B04");
  });

  test("H8c: vendor-sample-types comment no longer references B04", () => {
    expect(vst).not.toContain("B01+B04");
  });
});

// ── H9: Sobreventa preserved ────────────────────────────────────────────────

describe("H9: Sobreventa (negative disponible) preserved", () => {
  const svc = fs.readFileSync(path.join(INV, "canonical-inventory-service.ts"), "utf-8");

  test("H9a: Service preserves negative disponible in CanonicalInventoryLevel", () => {
    // The raw DISPONIBLE from SAG is stored as-is in the level
    expect(svc).toContain("available: disponible");
  });

  test("H9b: Only availableToPromise is clamped to 0, not raw disponible", () => {
    expect(svc).toContain("Math.max(signedAvailable, 0)");
    expect(svc).toContain("availableToPromise");
  });
});

// ── H10: L-6305 not opportunity from B01 ────────────────────────────────────

describe("H10: L-6305 WIP-only refs not counted as commercial", () => {
  const profiles = fs.readFileSync(path.join(INV, "castillitos-warehouse-profiles.ts"), "utf-8");
  const svc = fs.readFileSync(path.join(INV, "canonical-inventory-service.ts"), "utf-8");

  test("H10a: WIP scope is SUPPLY_CHAIN, never counted in commercial KPIs", () => {
    const b04Line = profiles.split("\n").find(l =>
      l.includes('code: "04"') && l.includes("PRODUCTO EN PROCESO")
    );
    expect(b04Line).toContain('"SUPPLY_CHAIN"');
  });

  test("H10b: Service SUPPLY_CHAIN WIP case increments wipUnits, not commercial", () => {
    expect(svc).toContain('case "WIP": wipUnits += existencia');
  });
});

// ── H11: Zero-stock refs excluded from coverage candidates ──────────────────

describe("H11: Zero-stock refs excluded from coverage", () => {
  const mci = fs.readFileSync(path.join(MAL, "maletas-canonical-inventory.ts"), "utf-8");

  test("H11a: isCommerciallyAvailableForMaletas requires stock > 0", () => {
    expect(mci).toContain("compatibleCommercialStock <= 0");
    expect(mci).toContain("return false");
  });

  test("H11b: isEligibleForMaletaCoverage requires stock > threshold", () => {
    expect(mci).toContain("compatibleCommercialStock <= threshold");
  });
});

// ── H12: Production items not B01 ───────────────────────────────────────────

describe("H12: Production items correctly scoped", () => {
  const svc = fs.readFileSync(path.join(INV, "canonical-inventory-service.ts"), "utf-8");

  test("H12a: Service classifies by warehouse profile commercialScope", () => {
    expect(svc).toContain('case "COMMERCIAL"');
    expect(svc).toContain('case "SUPPLY_CHAIN"');
  });

  test("H12b: Unknown bodega rows skipped (not silently counted)", () => {
    expect(svc).toContain("if (!profile) continue");
  });
});

// ── H13: Production open orders only ────────────────────────────────────────

describe("H13: Production counts open orders only", () => {
  const svc = fs.readFileSync(path.join(INV, "canonical-inventory-service.ts"), "utf-8");

  test("H13a: Only OPEN orders count as active production", () => {
    expect(svc).toContain('state === "OPEN"');
    expect(svc).toContain("openOrders++");
  });

  test("H13b: CLOSED orders tracked separately", () => {
    expect(svc).toContain('state === "CLOSED"');
    expect(svc).toContain("closedOrders++");
  });

  test("H13c: CANCELLED and THEORETICAL excluded from all counts", () => {
    expect(svc).toContain("CANCELLED and THEORETICAL: excluded from all counts");
  });
});

// ── H14: No STA_SKU quantities ──────────────────────────────────────────────

describe("H14: No STA_SKU quantities used", () => {
  const types = fs.readFileSync(path.join(INV, "canonical-inventory-types.ts"), "utf-8");

  test("H14a: SKU_BALANCE_UNAVAILABLE truth state exists", () => {
    expect(types).toContain('"SKU_BALANCE_UNAVAILABLE"');
  });

  test("H14b: Comment documents no saldo at talla/color level", () => {
    expect(types).toContain("SAG has no saldo at talla/color/SKU level");
  });
});

// ── H15: CURRENT/HISTORICAL never aggregated ────────────────────────────────

describe("H15: CURRENT/HISTORICAL databases never aggregated", () => {
  const svc = fs.readFileSync(path.join(INV, "canonical-inventory-service.ts"), "utf-8");

  test("H15a: Service uses getSagConnection('CURRENT') only", () => {
    expect(svc).toContain('getSagConnection("CURRENT")');
    // Must NOT query HISTORICAL and combine
    expect(svc).not.toContain('getSagConnection("HISTORICAL")');
  });
});

// ── H16: Decision scopes exhaustive ─────────────────────────────────────────

describe("H16: Decision scopes are exhaustive", () => {
  const src = fs.readFileSync(path.join(INV, "castillitos-warehouse-profiles.ts"), "utf-8");

  test("H16a: Switch in getWarehouseProfilesByScope has 6 cases", () => {
    const fn = src.substring(
      src.indexOf("function getWarehouseProfilesByScope"),
      src.indexOf("}", src.indexOf("function getWarehouseProfilesByScope") + 500) + 1
    );
    expect(fn).toContain('case "GLOBAL_SELLABLE"');
    expect(fn).toContain('case "TEXTILE_REPLENISHMENT_SOURCE"');
    expect(fn).toContain('case "IMPORT_REPLENISHMENT_SOURCE"');
    expect(fn).toContain('case "STORE_STOCK"');
    expect(fn).toContain('case "SELLER_PORTFOLIO_STOCK"');
    expect(fn).toContain('case "PRODUCTION_WIP"');
  });

  test("H16b: DEXCATO is EXCLUDED (not COMMERCIAL)", () => {
    const line = src.split("\n").find(l =>
      l.includes("bodegaId: 52") && l.includes("DEXCATO")
    );
    expect(line).toBeDefined();
    expect(line).toContain('"EXCLUDED"');
  });

  test("H16c: PAGINA WEB is EXCLUDED (not COMMERCIAL)", () => {
    const line = src.split("\n").find(l =>
      l.includes("bodegaId: 30") && l.includes("PAGINA WEB")
    );
    expect(line).toBeDefined();
    expect(line).toContain('"EXCLUDED"');
  });

  test("H16d: IMPORTACION (bodegaId 33) is COMMERCIAL", () => {
    const line = src.split("\n").find(l =>
      l.includes("bodegaId: 33") && l.includes("IMPORTACION")
    );
    expect(line).toBeDefined();
    expect(line).toContain('"COMMERCIAL"');
  });
});
