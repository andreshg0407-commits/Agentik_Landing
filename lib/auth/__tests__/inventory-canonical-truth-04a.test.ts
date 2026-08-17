/**
 * INVENTORY-CANONICAL-TRUTH-04A — Behavioral Tests
 *
 * Tests the canonical inventory contract, warehouse classification,
 * and commercial vs supply chain separation.
 *
 * No Prisma. No SAG. Pure domain logic.
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const LIB = path.resolve(__dirname, "../..");
const INV = path.join(LIB, "comercial/inventory");

// ── T01: Canonical types exist ──────────────────────────────────────────────

describe("T01: Canonical inventory types", () => {
  const typesPath = path.join(INV, "canonical-inventory-types.ts");
  const src = fs.readFileSync(typesPath, "utf-8");

  test("T01a: WarehouseRole has all required roles", () => {
    const roles = ["PRINCIPAL", "STORE", "FRANCHISE", "VENDOR_SUITCASE",
      "RAW_MATERIAL", "WIP", "IMPORT_STAGING", "SPECIAL", "INACTIVE"];
    for (const role of roles) {
      expect(src).toContain(`"${role}"`);
    }
  });

  test("T01b: WarehouseCommercialScope has exactly 3 values", () => {
    expect(src).toContain('"COMMERCIAL"');
    expect(src).toContain('"SUPPLY_CHAIN"');
    expect(src).toContain('"EXCLUDED"');
  });

  test("T01c: CanonicalInventorySnapshot separates commercial from supply chain", () => {
    expect(src).toContain("commercialRefCount");
    expect(src).toContain("commercialAvailableUnits");
    expect(src).toContain("commercialReservedUnits");
    expect(src).toContain("commercialOutOfStockRefs");
    expect(src).toContain("commercialCriticalRefs");
    expect(src).toContain("rawMaterialUnits");
    expect(src).toContain("wipUnits");
    expect(src).toContain("importStagingUnits");
    expect(src).toContain("pendingProductionUnits");
  });

  test("T01d: InventoryTruthState has 4 states", () => {
    const states = ["CERTIFIED", "STALE", "DERIVED", "UNVERIFIED"];
    for (const state of states) {
      expect(src).toContain(`"${state}"`);
    }
  });

  test("T01e: WarehouseProfile has all required fields", () => {
    expect(src).toContain("bodegaId");
    expect(src).toContain("code:");
    expect(src).toContain("name:");
    expect(src).toContain("sagClase");
    expect(src).toContain("role:");
    expect(src).toContain("commercialScope");
    expect(src).toContain("active:");
  });
});

// ── T02: Warehouse profiles ─────────────────────────────────────────────────

describe("T02: Castillitos warehouse profiles", () => {
  const profilesPath = path.join(INV, "castillitos-warehouse-profiles.ts");
  const src = fs.readFileSync(profilesPath, "utf-8");

  test("T02a: Bodega Principal is classified as COMMERCIAL", () => {
    // bodegaId 10, code 01, BODEGA PRINCIPAL
    expect(src).toContain('bodegaId: 10');
    expect(src).toContain('"PRINCIPAL"');
    // The principal entry should have COMMERCIAL scope
    const principalLine = src.split("\n").find(l => l.includes("BODEGA PRINCIPAL"));
    expect(principalLine).toContain("COMMERCIAL");
  });

  test("T02b: Materia Prima is classified as SUPPLY_CHAIN", () => {
    const mpLine = src.split("\n").find(l => l.includes("MATERIA PRIMA"));
    expect(mpLine).toContain("RAW_MATERIAL");
    expect(mpLine).toContain("SUPPLY_CHAIN");
  });

  test("T02c: Producto En Proceso is classified as WIP/SUPPLY_CHAIN", () => {
    const wipLine = src.split("\n").find(l => l.includes("PRODUCTO EN PROCESO"));
    expect(wipLine).toContain("WIP");
    expect(wipLine).toContain("SUPPLY_CHAIN");
  });

  test("T02d: Retail stores are classified as COMMERCIAL", () => {
    for (const store of ["BODEGA SANDIEGO", "BODEGA CENTRO", "GRAN PLAZA", "BODEGA CALDAS"]) {
      const line = src.split("\n").find(l => l.includes(`"${store}"`));
      expect(line).toBeTruthy();
      expect(line).toContain("COMMERCIAL");
    }
  });

  test("T02e: Vendor suitcases are classified as COMMERCIAL", () => {
    for (const vend of ["VEND ORLANDO", "VEND NESTOR", "VEND LUIS"]) {
      const line = src.split("\n").find(l => l.includes(vend));
      expect(line).toBeTruthy();
      expect(line).toContain("VENDOR_SUITCASE");
      expect(line).toContain("COMMERCIAL");
    }
  });

  test("T02f: Closed import containers are EXCLUDED", () => {
    for (const container of ["IMPO CONTENEDOR 2\"", "IMPO CONTENEDOR 3", "IMPO CONTENEDOR 4"]) {
      const line = src.split("\n").find(l => l.includes(container));
      expect(line).toBeTruthy();
      expect(line).toContain("EXCLUDED");
    }
  });

  test("T02g: Active IMPORTACION is SUPPLY_CHAIN", () => {
    const line = src.split("\n").find(l =>
      l.includes('"IMPORTACION"') && l.includes("bodegaId: 33")
    );
    expect(line).toBeTruthy();
    expect(line).toContain("SUPPLY_CHAIN");
  });
});

// ── T03: Warehouse profile lookup functions ─────────────────────────────────

describe("T03: Profile lookup functions", () => {
  // Dynamic import to test actual functions
  let mod: any;
  test("T03a: Module exports all required functions", async () => {
    mod = await import("@/lib/comercial/inventory/castillitos-warehouse-profiles");
    expect(mod.getWarehouseProfile).toBeDefined();
    expect(mod.getWarehouseProfileByCode).toBeDefined();
    expect(mod.getWarehouseProfileByViewBodega).toBeDefined();
    expect(mod.getAllWarehouseProfiles).toBeDefined();
    expect(mod.getCommercialWarehouseProfiles).toBeDefined();
    expect(mod.getSupplyChainWarehouseProfiles).toBeDefined();
    expect(mod.isCommercialWarehouse).toBeDefined();
  });

  test("T03b: getWarehouseProfile returns correct profile for B01", async () => {
    const profile = mod.getWarehouseProfile(10);
    expect(profile).not.toBeNull();
    expect(profile!.code).toBe("01");
    expect(profile!.role).toBe("PRINCIPAL");
    expect(profile!.commercialScope).toBe("COMMERCIAL");
  });

  test("T03c: getWarehouseProfile returns null for unknown bodega", async () => {
    const profile = mod.getWarehouseProfile(999);
    expect(profile).toBeNull();
  });

  test("T03d: getWarehouseProfileByViewBodega resolves view format", async () => {
    const profile = mod.getWarehouseProfileByViewBodega("01 - BODEGA PRINCIPAL");
    expect(profile).not.toBeNull();
    expect(profile!.bodegaId).toBe(10);
  });

  test("T03e: isCommercialWarehouse correctly classifies", async () => {
    expect(mod.isCommercialWarehouse(10)).toBe(true);  // PRINCIPAL
    expect(mod.isCommercialWarehouse(14)).toBe(false);  // MATERIA PRIMA
    expect(mod.isCommercialWarehouse(13)).toBe(false);  // WIP
    expect(mod.isCommercialWarehouse(45)).toBe(true);   // VEND ORLANDO
  });

  test("T03f: getCommercialWarehouseProfiles excludes raw materials and WIP", async () => {
    const profiles = mod.getCommercialWarehouseProfiles();
    const roles = new Set(profiles.map((p: any) => p.role));
    expect(roles.has("RAW_MATERIAL")).toBe(false);
    expect(roles.has("WIP")).toBe(false);
    expect(roles.has("PRINCIPAL")).toBe(true);
    expect(roles.has("STORE")).toBe(true);
  });

  test("T03g: getSupplyChainWarehouseProfiles includes only supply chain", async () => {
    const profiles = mod.getSupplyChainWarehouseProfiles();
    for (const p of profiles) {
      expect(p.commercialScope).toBe("SUPPLY_CHAIN");
    }
    const roles = new Set(profiles.map((p: any) => p.role));
    expect(roles.has("PRINCIPAL")).toBe(false);
  });
});

// ── T04: Service structural checks ──────────────────────────────────────────

describe("T04: Canonical inventory service", () => {
  const servicePath = path.join(INV, "canonical-inventory-service.ts");
  const src = fs.readFileSync(servicePath, "utf-8");

  test("T04a: Uses server-only guard", () => {
    expect(src).toContain('import "server-only"');
  });

  test("T04b: Queries vw_agentik_inventario", () => {
    expect(src).toContain("vw_agentik_inventario");
  });

  test("T04c: Queries vw_agentik_produccion with inverted alias awareness", () => {
    expect(src).toContain("vw_agentik_produccion");
    // Must use PRODUCTO as code (inverted alias)
    expect(src).toContain("PRODUCTO AS codigo_producto");
  });

  test("T04d: Handles production state filter (excludes Cerrada)", () => {
    expect(src).toContain("Cerrada");
  });

  test("T04e: Classifies by warehouse commercial scope", () => {
    expect(src).toContain("commercialScope");
    expect(src).toContain("COMMERCIAL");
    expect(src).toContain("SUPPLY_CHAIN");
  });

  test("T04f: Separates raw materials, WIP, and imports", () => {
    expect(src).toContain("RAW_MATERIAL");
    expect(src).toContain("rawMaterialUnits");
    expect(src).toContain("wipUnits");
    expect(src).toContain("importStagingUnits");
  });

  test("T04g: Uses getSagConnection CURRENT for inventory", () => {
    expect(src).toContain('getSagConnection("CURRENT")');
  });

  test("T04h: Computes commercial value correctly (existencia * costoPromedio)", () => {
    expect(src).toContain("existencia * costoPromedio");
  });

  test("T04i: Tracks out-of-stock and critical refs", () => {
    expect(src).toContain("commercialOutOfStock");
    expect(src).toContain("commercialCritical");
    expect(src).toContain("disponible <= 0");
    expect(src).toContain("disponible <= 20");
  });
});

// ── T05: Audit document exists ──────────────────────────────────────────────

describe("T05: Audit documentation", () => {
  test("T05a: Phase A audit document exists", () => {
    const auditPath = path.resolve(__dirname, "../../../docs/INVENTORY-CANONICAL-TRUTH-04A-AUDIT.md");
    expect(fs.existsSync(auditPath)).toBe(true);
    const content = fs.readFileSync(auditPath, "utf-8");
    expect(content).toContain("Period Audit");
    expect(content).toContain("Grain Audit");
    expect(content).toContain("Bodega Classification");
    expect(content).toContain("Production Audit");
  });
});

// ── T06: Commercial vs Supply Chain separation correctness ──────────────────

describe("T06: Commercial/Supply chain boundary", () => {
  test("T06a: Materia prima (553K units) must NOT appear in commercial KPIs", async () => {
    // Materia Prima bodegaId=14, Telas bodegaId=15 are SUPPLY_CHAIN
    const mod = await import("@/lib/comercial/inventory/castillitos-warehouse-profiles");
    expect(mod.isCommercialWarehouse(14)).toBe(false);
    expect(mod.isCommercialWarehouse(15)).toBe(false);
  });

  test("T06b: WIP inventory must NOT appear in commercial available", async () => {
    const mod = await import("@/lib/comercial/inventory/castillitos-warehouse-profiles");
    const profile = mod.getWarehouseProfile(13); // PRODUCTO EN PROCESO
    expect(profile!.commercialScope).toBe("SUPPLY_CHAIN");
    expect(profile!.role).toBe("WIP");
  });

  test("T06c: Import staging (IMPORTACION) must be SUPPLY_CHAIN", async () => {
    const mod = await import("@/lib/comercial/inventory/castillitos-warehouse-profiles");
    const profile = mod.getWarehouseProfile(33);
    expect(profile!.role).toBe("IMPORT_STAGING");
    expect(profile!.commercialScope).toBe("SUPPLY_CHAIN");
  });

  test("T06d: Store bodegas count as commercial", async () => {
    const mod = await import("@/lib/comercial/inventory/castillitos-warehouse-profiles");
    // San Diego=11, Centro=31, Gran Plaza=32, Caldas=39
    for (const id of [11, 31, 32, 39]) {
      expect(mod.isCommercialWarehouse(id)).toBe(true);
    }
  });
});

// ── T07: Canonical contract protections ─────────────────────────────────────

describe("T07: Contract protections", () => {
  test("T07a: Types file has no Prisma or server-only import", () => {
    const src = fs.readFileSync(path.join(INV, "canonical-inventory-types.ts"), "utf-8");
    expect(src).not.toContain('import "server-only"');
    expect(src).not.toContain("from \"@/lib/prisma\"");
  });

  test("T07b: Warehouse profiles file has no Prisma import", () => {
    const src = fs.readFileSync(path.join(INV, "castillitos-warehouse-profiles.ts"), "utf-8");
    expect(src).not.toContain("prisma");
    expect(src).not.toContain("server-only");
  });

  test("T07c: Service file has server-only guard", () => {
    const src = fs.readFileSync(path.join(INV, "canonical-inventory-service.ts"), "utf-8");
    expect(src).toContain('import "server-only"');
  });

  test("T07d: TRANSITO is never used as a data source (always NULL)", () => {
    const src = fs.readFileSync(path.join(INV, "canonical-inventory-service.ts"), "utf-8");
    // Should NOT reference TRANSITO as a data field
    expect(src).not.toContain("TRANSITO");
  });
});

// ── T08: Production alias inversion awareness ───────────────────────────────

describe("T08: Production alias handling", () => {
  test("T08a: Service handles inverted PRODUCTO/CODIGO_PRODUCTO", () => {
    const src = fs.readFileSync(path.join(INV, "canonical-inventory-service.ts"), "utf-8");
    // PRODUCTO = code (must alias to codigo_producto)
    expect(src).toContain("PRODUCTO AS codigo_producto");
    // CODIGO_PRODUCTO = description (must alias to nombre_producto)
    expect(src).toContain("CODIGO_PRODUCTO AS nombre_producto");
  });
});

// ── T09: View column name awareness ─────────────────────────────────────────

describe("T09: SAG view column names", () => {
  test("T09a: Uses correct view columns (not raw table columns)", () => {
    const src = fs.readFileSync(path.join(INV, "canonical-inventory-service.ts"), "utf-8");
    // Correct view column names
    expect(src).toContain("CODIGO_PRODUCTO");
    expect(src).toContain("PRODUCTO");
    expect(src).toContain("EXISTENCIA");
    expect(src).toContain("RESERVADO");
    expect(src).toContain("DISPONIBLE");
    expect(src).toContain("COSTO_PROMEDIO");
    expect(src).toContain("BODEGA");
    // Must NOT use raw table column names as view columns
    expect(src).not.toContain("ARTICULO_ID");
    expect(src).not.toContain("BODEGA_ID");
  });
});

// ── T10: View format resolution ─────────────────────────────────────────────

describe("T10: View BODEGA format resolution", () => {
  test("T10a: Resolves 'XX - NAME' format from view", async () => {
    const mod = await import("@/lib/comercial/inventory/castillitos-warehouse-profiles");
    const tests = [
      { input: "01 - BODEGA PRINCIPAL", expectedId: 10 },
      { input: "02 - BODEGA SANDIEGO", expectedId: 11 },
      { input: "04 - PRODUCTO EN PROCESO", expectedId: 13 },
      { input: "05 - MATERIA PRIMA", expectedId: 14 },
      { input: "23 - GRAN PLAZA", expectedId: 32 },
      { input: "29 - BODEGA CALDAS", expectedId: 39 },
    ];
    for (const t of tests) {
      const profile = mod.getWarehouseProfileByViewBodega(t.input);
      expect(profile).not.toBeNull();
      expect(profile!.bodegaId).toBe(t.expectedId);
    }
  });
});
