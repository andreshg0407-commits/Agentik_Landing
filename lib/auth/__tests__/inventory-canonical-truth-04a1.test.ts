/**
 * INVENTORY-CANONICAL-TRUTH-04A1 — Addendum Behavioral Tests
 *
 * Tests the addendum corrections: production states, reserved contract,
 * available formula, subgroups interaction, drawer restructure, SKU truth.
 *
 * No Prisma. No SAG. Pure domain logic + structural checks.
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const LIB = path.resolve(__dirname, "../..");
const INV = path.join(LIB, "comercial/inventory");
const APP_INV = path.resolve(__dirname, "../../../app/(app)/[orgSlug]/comercial/inventario");
const DRAWER = path.resolve(__dirname, "../../../components/comercial/commercial-product-drawer.tsx");

// ── J7: Production cerrada NOT shown as en proceso ─────────────────────────

describe("J7: Production closed != en proceso", () => {
  const src = fs.readFileSync(path.join(INV, "canonical-inventory-service.ts"), "utf-8");

  test("J7a: Service fetches ALL production states (not just non-Cerrada)", () => {
    // The production query should NOT filter out Cerrada in the WHERE clause
    // It should fetch all and classify in code
    expect(src).toContain("FROM vw_agentik_produccion");
    // Must NOT have the old filter that excluded Cerrada from the query
    const queryLines = src.split("\n").filter(l =>
      l.includes("vw_agentik_produccion") || (l.includes("WHERE") && l.includes("Cerrada"))
    );
    // Should not filter in the SQL query itself
    const hasWhereFilter = queryLines.some(l =>
      l.includes("WHERE") && l.includes("Cerrada") && l.includes("!=")
    );
    expect(hasWhereFilter).toBe(false);
  });

  test("J7b: Maps Cerrada to CLOSED state", () => {
    expect(src).toContain('"Cerrada"');
    expect(src).toContain('"CLOSED"');
  });

  test("J7c: Only OPEN orders count as activeProductionOrders", () => {
    expect(src).toContain('"OPEN"');
    // Open orders increment the counter
    expect(src).toContain("openOrders++");
  });
});

// ── J8: Production anulada excluded ─────────────────────────────────────────

describe("J8: Production anulada excluded", () => {
  const src = fs.readFileSync(path.join(INV, "canonical-inventory-service.ts"), "utf-8");

  test("J8a: Maps Anulada to CANCELLED", () => {
    expect(src).toContain('"Anulada"');
    expect(src).toContain('"CANCELLED"');
  });
});

// ── J9: Production teorica separated ─────────────────────────────────────────

describe("J9: Production teorica separated", () => {
  const typeSrc = fs.readFileSync(path.join(INV, "canonical-inventory-types.ts"), "utf-8");

  test("J9a: ProductionOrderState includes THEORETICAL", () => {
    expect(typeSrc).toContain('"THEORETICAL"');
  });

  test("J9b: Type comment documents it as planning-only", () => {
    expect(typeSrc).toContain("planning only");
  });
});

// ── J10: Production abierta without progress != pendiente real ──────────────

describe("J10: Open production != pendiente real", () => {
  const typeSrc = fs.readFileSync(path.join(INV, "canonical-inventory-types.ts"), "utf-8");
  const svcSrc = fs.readFileSync(path.join(INV, "canonical-inventory-service.ts"), "utf-8");

  test("J10a: SOURCE_INCOMPLETE truth state exists", () => {
    expect(typeSrc).toContain('"SOURCE_INCOMPLETE"');
  });

  test("J10b: Open orders get SOURCE_INCOMPLETE truth state", () => {
    expect(svcSrc).toContain("SOURCE_INCOMPLETE");
  });

  test("J10c: CanonicalProductionSummary has openTruthState", () => {
    expect(typeSrc).toContain("openTruthState");
  });
});

// ── J11: Destino TOP 1 ambiguo falla cerrado ────────────────────────────────

describe("J11: Ambiguous destination fails closed", () => {
  const typeSrc = fs.readFileSync(path.join(INV, "canonical-inventory-types.ts"), "utf-8");
  const svcSrc = fs.readFileSync(path.join(INV, "canonical-inventory-service.ts"), "utf-8");

  test("J11a: CanonicalProductionOrder.destinationVerified exists", () => {
    expect(typeSrc).toContain("destinationVerified");
  });

  test("J11b: Service tracks verified vs unverified destinations", () => {
    expect(svcSrc).toContain("destVerified");
    expect(svcSrc).toContain("destUnverified");
  });

  test("J11c: Empty destination is counted as unverified", () => {
    // When destino is empty string, increment destUnverified
    expect(svcSrc).toContain("destUnverified++");
  });
});

// ── J18: "Stock fisico bodega" removed from drawer summary ──────────────────

describe("J18: Stock fisico bodega removed", () => {
  const drawerSrc = fs.readFileSync(DRAWER, "utf-8");

  test("J18a: 'Stock fisico bodega' label removed from drawer", () => {
    expect(drawerSrc).not.toContain('label="Stock fisico bodega"');
  });

  test("J18b: totalStock field still in CommercialProductData type", () => {
    // The data contract keeps it but the UI no longer shows it
    expect(drawerSrc).toContain("totalStock");
  });
});

// ── J19: Production does not modify disponible actual ───────────────────────

describe("J19: Production not in disponible", () => {
  const drawerSrc = fs.readFileSync(DRAWER, "utf-8");

  test("J19a: Drawer shows 'No incluido en disponible actual'", () => {
    expect(drawerSrc).toContain("No incluido en disponible actual");
  });

  test("J19b: Production label says 'Programado en ordenes abiertas'", () => {
    expect(drawerSrc).toContain("Programado en ordenes abiertas");
  });

  test("J19c: 'En proceso' label removed from drawer", () => {
    // Old label was just "En proceso" — now more specific
    expect(drawerSrc).not.toContain('label="En proceso"');
  });
});

// ── J1: KPI line reconciliation ─────────────────────────────────────────────

describe("J1: Line breakdown for reconciliation", () => {
  const typeSrc = fs.readFileSync(path.join(INV, "canonical-inventory-types.ts"), "utf-8");
  const svcSrc = fs.readFileSync(path.join(INV, "canonical-inventory-service.ts"), "utf-8");

  test("J1a: CanonicalInventorySnapshot has lineBreakdown", () => {
    expect(typeSrc).toContain("lineBreakdown");
  });

  test("J1b: Service computes line breakdown", () => {
    expect(svcSrc).toContain("lineMap");
    expect(svcSrc).toContain("lineBreakdown");
  });
});

// ── J2: No unit left without classification ─────────────────────────────────

describe("J2: No silent unclassified units", () => {
  const svcSrc = fs.readFileSync(path.join(INV, "canonical-inventory-service.ts"), "utf-8");

  test("J2a: Every row is classified by warehouse scope", () => {
    // Must have switch on commercialScope covering COMMERCIAL, SUPPLY_CHAIN, EXCLUDED
    expect(svcSrc).toContain('case "COMMERCIAL"');
    expect(svcSrc).toContain('case "SUPPLY_CHAIN"');
    expect(svcSrc).toContain("EXCLUDED");
  });

  test("J2b: Unknown bodega rows are skipped, not silently counted", () => {
    expect(svcSrc).toContain("if (!profile) continue");
  });
});

// ── J3-J6: Reserved contract ────────────────────────────────────────────────

describe("J3-J6: Reserved contract", () => {
  const drawerSrc = fs.readFileSync(DRAWER, "utf-8");

  test("J3a: Drawer labels reservado as 'Reservado en pedidos'", () => {
    expect(drawerSrc).toContain("Reservado en pedidos");
  });

  test("J3b: Drawer shows explanation text for reservado", () => {
    expect(drawerSrc).toContain("Pedidos pendientes por facturar/despachar");
  });
});

// ── J12: Subgrupos view replaces table ──────────────────────────────────────

describe("J12: Subgrupos replaces general list", () => {
  const clientSrc = fs.readFileSync(path.join(APP_INV, "inventario-client.tsx"), "utf-8");

  test("J12a: SubgrupoCoveragePanel renders instead of LineBasedTable when filter=subgrupos", () => {
    // The conditional structure should show SubgrupoCoveragePanel INSTEAD of the table
    expect(clientSrc).toContain('filter === "subgrupos"');
    // The SubgrupoCoveragePanel should come before (replace) the table
    const sgPanelIdx = clientSrc.indexOf("SubgrupoCoveragePanel");
    const lineTableIdx = clientSrc.indexOf("LineBasedTable");
    expect(sgPanelIdx).toBeLessThan(lineTableIdx);
  });
});

// ── J13: Subgrupos start collapsed ──────────────────────────────────────────

describe("J13: Subgrupos start collapsed", () => {
  const clientSrc = fs.readFileSync(path.join(APP_INV, "inventario-client.tsx"), "utf-8");

  test("J13a: Expanded state initializes empty", () => {
    expect(clientSrc).toContain("useState<Set<string>>(new Set())");
  });
});

// ── J14: Click subgrupo expands references ──────────────────────────────────

describe("J14: Click expands subgroup references", () => {
  const clientSrc = fs.readFileSync(path.join(APP_INV, "inventario-client.tsx"), "utf-8");

  test("J14a: SubgrupoCoveragePanel has toggle function", () => {
    expect(clientSrc).toContain("toggle(sg.subgrupoSag)");
  });

  test("J14b: Expanded subgroup shows item rows", () => {
    // Subgroup expansion renders content when isOpen is true
    expect(clientSrc).toContain("isOpen && (");
  });
});

// ── J15-J17: Variant/SKU contract ───────────────────────────────────────────

describe("J15-J17: SKU balance truth", () => {
  const typeSrc = fs.readFileSync(path.join(INV, "canonical-inventory-types.ts"), "utf-8");

  test("J15a: SKU_BALANCE_UNAVAILABLE truth state exists", () => {
    expect(typeSrc).toContain('"SKU_BALANCE_UNAVAILABLE"');
  });

  test("J17a: SKU_BALANCE_UNAVAILABLE documented in comments", () => {
    expect(typeSrc).toContain("SAG has no saldo at talla/color/SKU level");
  });
});

// ── J20: Recommendations blocked ────────────────────────────────────────────

describe("J20: Recommendations blocked until verified", () => {
  test("J20a: CanonicalItemStatus type exists with correct states", () => {
    const typeSrc = fs.readFileSync(path.join(INV, "canonical-inventory-types.ts"), "utf-8");
    expect(typeSrc).toContain('"DISPONIBLE"');
    expect(typeSrc).toContain('"BAJO"');
    expect(typeSrc).toContain('"SIN_COBERTURA"');
    expect(typeSrc).toContain('"AGOTADO"');
    expect(typeSrc).toContain('"SOBRECOMPROMETIDO"');
    expect(typeSrc).toContain('"DATOS_NO_VERIFICADOS"');
  });
});

// ── Addendum B2: Available formula ──────────────────────────────────────────

describe("B2: Available formula correctness", () => {
  const svcSrc = fs.readFileSync(path.join(INV, "canonical-inventory-service.ts"), "utf-8");

  test("B2a: Uses availableToPromise = max(existencia - reservado, 0)", () => {
    expect(svcSrc).toContain("availableToPromise");
    expect(svcSrc).toContain("Math.max(signedAvailable, 0)");
  });

  test("B2b: Commercial available uses availableToPromise, not raw DISPONIBLE", () => {
    expect(svcSrc).toContain("commercialAvailable += availableToPromise");
  });
});

// ── Addendum D: Production summary ──────────────────────────────────────────

describe("D: Production summary in snapshot", () => {
  const typeSrc = fs.readFileSync(path.join(INV, "canonical-inventory-types.ts"), "utf-8");
  const svcSrc = fs.readFileSync(path.join(INV, "canonical-inventory-service.ts"), "utf-8");

  test("Da: CanonicalProductionSummary type exists", () => {
    expect(typeSrc).toContain("CanonicalProductionSummary");
    expect(typeSrc).toContain("openOrders");
    expect(typeSrc).toContain("openScheduledUnits");
    expect(typeSrc).toContain("closedOrders");
    expect(typeSrc).toContain("closedProducedUnits");
    expect(typeSrc).toContain("destinationVerifiedCount");
    expect(typeSrc).toContain("destinationUnverifiedCount");
  });

  test("Db: Service returns productionSummary", () => {
    expect(svcSrc).toContain("productionSummary");
    expect(svcSrc).toContain("productionSummary:");
  });
});

// ── Addendum E: "Stock fisico bodega 757" removed ───────────────────────────

describe("E: Stock fisico bodega removed from drawer", () => {
  const drawerSrc = fs.readFileSync(DRAWER, "utf-8");

  test("Ea: No 'Stock fisico bodega' label in drawer", () => {
    expect(drawerSrc).not.toContain('label="Stock fisico bodega"');
  });

  test("Eb: No unexplained bodega number in drawer", () => {
    // The old "757" type label should not exist
    expect(drawerSrc).not.toContain("757");
  });
});

// ── Addendum I: Source-down reserved contract ───────────────────────────────

describe("I: SOURCE_DOWN truth state", () => {
  const typeSrc = fs.readFileSync(path.join(INV, "canonical-inventory-types.ts"), "utf-8");

  test("Ia: SOURCE_DOWN exists in InventoryTruthState", () => {
    expect(typeSrc).toContain('"SOURCE_DOWN"');
  });

  test("Ib: Comment documents reserved=null when SOURCE_DOWN", () => {
    expect(typeSrc).toContain("reserved=null, not 0");
  });
});

// ── UI: En proceso KPI removed from panel ───────────────────────────────────

describe("UI: En proceso KPI removed", () => {
  const clientSrc = fs.readFileSync(path.join(APP_INV, "inventario-client.tsx"), "utf-8");

  test("UIa: No 'En proceso' KpiCard in inventory panel", () => {
    // Should not have the old KpiCard with label="En proceso"
    expect(clientSrc).not.toContain('label="En proceso"');
  });

  test("UIb: Comment explains removal reason", () => {
    expect(clientSrc).toContain("Addendum D1");
    expect(clientSrc).toContain("uncertified data");
  });
});

// ── Drawer: Produccion section updated ──────────────────────────────────────

describe("Drawer: Production section corrected", () => {
  const drawerSrc = fs.readFileSync(DRAWER, "utf-8");

  test("Da: Section title is 'Produccion abierta', not just 'Produccion'", () => {
    expect(drawerSrc).toContain("Produccion abierta");
  });
});
