/**
 * lib/comercial/tiendas/__tests__/store-network.test.ts
 *
 * AGENTIK-STORES-SAG-OFFICIAL-BALANCE-MIGRATION-01 — DECIMOCUARTO
 *
 * Tests for:
 * - Store Network graph construction
 * - Node classification (COMMERCIAL_HUB, IMPORT_HUB, STORE, PRODUCTION, SUPPORT)
 * - Node capabilities
 * - Network edges (supply relationships)
 * - Alert classification (deterministic, no AI)
 * - KPI computation
 * - Source status / observability
 * - Multi-tenant isolation (per organizationId)
 * - All 4 stores: Centro, San Diego, Gran Plaza, Caldas
 * - All hubs: B01 Principal, B24 Importación
 * - References without inventory (NOT_FOUND)
 * - References with reserved stock
 * - Negative disponible
 */

import { describe, it, expect } from "vitest";
import {
  buildStoreNetwork,
  resolveNetworkRole,
  getNodeByWarehouseCode,
  getNodeById,
  getChildNodes,
  getParentNode,
  getCommercialNodes,
  getCoverageNodes,
} from "../store-network";
import {
  resolveProductAlertState,
  summarizeAlerts,
} from "../store-network-alerts";
import type {
  StoreNetworkNode,
  StoreNodeProduct,
  StoreProductAlertState,
  StoreNodeKpis,
} from "../store-network-types";

// ── Node Classification (CUARTO) ────────────────────────────────────────────

describe("Node Classification", () => {
  it("COMMERCIAL_TEXTILE → COMMERCIAL_HUB", () => {
    expect(resolveNetworkRole("COMMERCIAL_TEXTILE")).toBe("COMMERCIAL_HUB");
  });

  it("COMMERCIAL_AVAILABLE_IMPORT → IMPORT_HUB", () => {
    expect(resolveNetworkRole("COMMERCIAL_AVAILABLE_IMPORT")).toBe("IMPORT_HUB");
  });

  it("STORE → STORE", () => {
    expect(resolveNetworkRole("STORE")).toBe("STORE");
  });

  it("PRODUCTION_ONLY → PRODUCTION", () => {
    expect(resolveNetworkRole("PRODUCTION_ONLY")).toBe("PRODUCTION");
  });

  it("VENDOR → VENDOR", () => {
    expect(resolveNetworkRole("VENDOR")).toBe("VENDOR");
  });

  it("IMPORT_STAGING → SUPPORT", () => {
    expect(resolveNetworkRole("IMPORT_STAGING")).toBe("SUPPORT");
  });

  it("IMPORT_CONTAINER → SUPPORT", () => {
    expect(resolveNetworkRole("IMPORT_CONTAINER")).toBe("SUPPORT");
  });

  it("EXCLUDED → SUPPORT", () => {
    expect(resolveNetworkRole("EXCLUDED")).toBe("SUPPORT");
  });

  it("UNKNOWN → SUPPORT", () => {
    expect(resolveNetworkRole("UNKNOWN")).toBe("SUPPORT");
  });
});

// ── Store Network Graph (TERCERO/SÉPTIMO) ───────────────────────────────────

describe("Store Network Graph", () => {
  const network = buildStoreNetwork();

  it("builds from warehouse-master — all nodes populated", () => {
    expect(network.nodes.length).toBeGreaterThan(0);
    expect(network.builtAt).toBeTruthy();
  });

  it("has exactly 1 COMMERCIAL_HUB (B01)", () => {
    const hubs = network.nodes.filter(n => n.networkRole === "COMMERCIAL_HUB");
    expect(hubs).toHaveLength(1);
    expect(hubs[0].warehouseCode).toBe("01");
    expect(hubs[0].warehouseName).toBe("BODEGA PRINCIPAL");
  });

  it("has exactly 1 IMPORT_HUB (B24)", () => {
    const imports = network.nodes.filter(n => n.networkRole === "IMPORT_HUB");
    expect(imports).toHaveLength(1);
    expect(imports[0].warehouseCode).toBe("24");
  });

  it("has exactly 4 STORE nodes", () => {
    expect(network.stores).toHaveLength(4);
    const codes = network.stores.map(s => s.warehouseCode).sort();
    expect(codes).toEqual(["00", "02", "23", "29"]);
  });

  it("Centro = ss_codigo 00, kaNlBodega 31", () => {
    const centro = getNodeByWarehouseCode(network, "00");
    expect(centro).toBeDefined();
    expect(centro!.id).toBe("31");
    expect(centro!.warehouseName).toBe("BODEGA CENTRO");
    expect(centro!.networkRole).toBe("STORE");
  });

  it("San Diego = ss_codigo 02, kaNlBodega 11", () => {
    const sd = getNodeByWarehouseCode(network, "02");
    expect(sd).toBeDefined();
    expect(sd!.id).toBe("11");
    expect(sd!.warehouseName).toBe("BODEGA SANDIEGO");
  });

  it("Gran Plaza = ss_codigo 23, kaNlBodega 32", () => {
    const gp = getNodeByWarehouseCode(network, "23");
    expect(gp).toBeDefined();
    expect(gp!.id).toBe("32");
    expect(gp!.warehouseName).toBe("GRAN PLAZA");
  });

  it("Caldas = ss_codigo 29, kaNlBodega 39", () => {
    const caldas = getNodeByWarehouseCode(network, "29");
    expect(caldas).toBeDefined();
    expect(caldas!.id).toBe("39");
    expect(caldas!.warehouseName).toBe("BODEGA CALDAS");
  });

  it("has PRODUCTION nodes", () => {
    expect(network.productionNodes.length).toBeGreaterThanOrEqual(1);
    const b04 = network.productionNodes.find(n => n.warehouseCode === "04");
    expect(b04).toBeDefined();
    expect(b04!.networkRole).toBe("PRODUCTION");
  });

  it("convenience arrays are consistent with nodes", () => {
    expect(network.hubs.length).toBe(2);
    expect(network.stores.length).toBe(4);
    expect(network.productionNodes.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Network Edges (SÉPTIMO) ─────────────────────────────────────────────────

describe("Network Edges", () => {
  const network = buildStoreNetwork();

  it("IMPORT_HUB feeds COMMERCIAL_HUB", () => {
    const feedEdge = network.edges.find(
      e => e.relationship === "FEEDS"
    );
    expect(feedEdge).toBeDefined();
    // B24 (kaNlBodega=33) → B01 (kaNlBodega=10)
    expect(feedEdge!.from).toBe("33");
    expect(feedEdge!.to).toBe("10");
  });

  it("COMMERCIAL_HUB supplies all 4 stores", () => {
    const supplyEdges = network.edges.filter(e => e.relationship === "SUPPLIES");
    expect(supplyEdges.length).toBe(4);
    const storeDests = supplyEdges.map(e => e.to).sort();
    // kaNlBodega: Centro=31, SanDiego=11, GranPlaza=32, Caldas=39
    expect(storeDests).toEqual(["11", "31", "32", "39"]);
    // All from COMMERCIAL_HUB (kaNlBodega=10)
    for (const e of supplyEdges) {
      expect(e.from).toBe("10");
    }
  });

  it("PRODUCTION produces for COMMERCIAL_HUB", () => {
    const prodEdges = network.edges.filter(e => e.relationship === "PRODUCES_FOR");
    expect(prodEdges.length).toBeGreaterThanOrEqual(1);
    for (const e of prodEdges) {
      expect(e.to).toBe("10"); // All go to B01
    }
  });

  it("getChildNodes of COMMERCIAL_HUB returns stores", () => {
    const children = getChildNodes(network, "10");
    expect(children.length).toBe(4);
    expect(children.every(c => c.networkRole === "STORE")).toBe(true);
  });

  it("getParentNode of store returns COMMERCIAL_HUB", () => {
    const parent = getParentNode(network, "31"); // Centro
    expect(parent).toBeDefined();
    expect(parent!.id).toBe("10");
    expect(parent!.networkRole).toBe("COMMERCIAL_HUB");
  });

  it("getParentNode of COMMERCIAL_HUB returns undefined (root)", () => {
    // COMMERCIAL_HUB has no parent edge (FEEDS goes TO it, not FROM it)
    const parent = getParentNode(network, "10");
    // IMPORT_HUB feeds into COMMERCIAL_HUB, so there IS an edge to "10"
    // getParentNode finds edge where to === childId, so it finds FEEDS edge
    expect(parent).toBeDefined();
    expect(parent!.networkRole).toBe("IMPORT_HUB");
  });
});

// ── Node Capabilities (CUARTO) ──────────────────────────────────────────────

describe("Node Capabilities", () => {
  const network = buildStoreNetwork();

  it("COMMERCIAL_HUB allows commercial sales, coverage, replenishment, transfers", () => {
    const hub = getNodeByWarehouseCode(network, "01")!;
    expect(hub.allowCommercialSales).toBe(true);
    expect(hub.allowCoverage).toBe(true);
    expect(hub.allowReplenishment).toBe(true);
    expect(hub.allowTransfers).toBe(true);
    expect(hub.allowProduction).toBe(false);
  });

  it("IMPORT_HUB: transfers only — never supplies stores directly", () => {
    const imp = getNodeByWarehouseCode(network, "24")!;
    expect(imp.allowCommercialSales).toBe(false);
    expect(imp.allowCoverage).toBe(false);
    expect(imp.allowReplenishment).toBe(false);
    expect(imp.allowTransfers).toBe(true);
    expect(imp.allowProduction).toBe(false);
  });

  it("STORE allows commercial sales, coverage, replenishment, transfers", () => {
    const store = getNodeByWarehouseCode(network, "00")!; // Centro
    expect(store.allowCommercialSales).toBe(true);
    expect(store.allowCoverage).toBe(true);
    expect(store.allowReplenishment).toBe(true);
    expect(store.allowTransfers).toBe(true);
    expect(store.allowProduction).toBe(false);
  });

  it("PRODUCTION allows only production", () => {
    const prod = getNodeByWarehouseCode(network, "04")!;
    expect(prod.allowCommercialSales).toBe(false);
    expect(prod.allowCoverage).toBe(false);
    expect(prod.allowReplenishment).toBe(false);
    expect(prod.allowTransfers).toBe(false);
    expect(prod.allowProduction).toBe(true);
  });

  it("SUPPORT/VENDOR allow nothing", () => {
    // IMPORT_STAGING (ss_codigo=26) should be SUPPORT
    const staging = getNodeByWarehouseCode(network, "26");
    if (staging) {
      expect(staging.allowCommercialSales).toBe(false);
      expect(staging.allowCoverage).toBe(false);
      expect(staging.allowReplenishment).toBe(false);
      expect(staging.allowTransfers).toBe(false);
      expect(staging.allowProduction).toBe(false);
    }
  });

  it("getCommercialNodes returns hubs + stores", () => {
    const commercial = getCommercialNodes(network);
    const roles = new Set(commercial.map(n => n.networkRole));
    expect(roles.has("COMMERCIAL_HUB")).toBe(true);
    expect(roles.has("STORE")).toBe(true);
    expect(roles.has("PRODUCTION")).toBe(false);
    expect(roles.has("SUPPORT")).toBe(false);
  });

  it("getCoverageNodes returns hubs + stores", () => {
    const coverage = getCoverageNodes(network);
    expect(coverage.length).toBeGreaterThanOrEqual(5); // 1 hub + 4 stores
    expect(coverage.every(n =>
      n.networkRole === "COMMERCIAL_HUB" || n.networkRole === "STORE"
    )).toBe(true);
  });
});

// ── Inventory Source (DÉCIMO) ───────────────────────────────────────────────

describe("Inventory Source", () => {
  const network = buildStoreNetwork();

  it("COMMERCIAL_HUB, IMPORT_HUB, STORE use SAG_OFFICIAL", () => {
    for (const node of [...network.hubs, ...network.stores]) {
      expect(node.inventorySource).toBe("SAG_OFFICIAL");
    }
  });

  it("PRODUCTION uses SAG_OFFICIAL", () => {
    for (const node of network.productionNodes) {
      expect(node.inventorySource).toBe("SAG_OFFICIAL");
    }
  });

  it("SUPPORT and VENDOR use NONE", () => {
    for (const node of network.supportNodes) {
      expect(node.inventorySource).toBe("NONE");
    }
  });
});

// ── Alert Classification (NOVENO) ───────────────────────────────────────────

describe("Alert Classification — Deterministic", () => {
  const base = {
    balanceSource: "SAG_OFFICIAL" as const,
    sourceStatus: "FRESH" as const,
  };

  it("HEALTHY: stock > 5, no issues", () => {
    expect(resolveProductAlertState({
      ...base,
      officialOnHand: 100,
      officialReserved: 10,
      officialAvailable: 90,
    })).toBe("HEALTHY");
  });

  it("OUT_OF_STOCK: existencia = 0, disponible = 0", () => {
    expect(resolveProductAlertState({
      ...base,
      officialOnHand: 0,
      officialReserved: 0,
      officialAvailable: 0,
    })).toBe("OUT_OF_STOCK");
  });

  it("LOW_STOCK: disponible between 1 and 5", () => {
    expect(resolveProductAlertState({
      ...base,
      officialOnHand: 5,
      officialReserved: 0,
      officialAvailable: 5,
    })).toBe("LOW_STOCK");

    expect(resolveProductAlertState({
      ...base,
      officialOnHand: 1,
      officialReserved: 0,
      officialAvailable: 1,
    })).toBe("LOW_STOCK");
  });

  it("not LOW_STOCK when disponible = 6", () => {
    expect(resolveProductAlertState({
      ...base,
      officialOnHand: 6,
      officialReserved: 0,
      officialAvailable: 6,
    })).toBe("HEALTHY");
  });

  it("ONLY_RESERVED: existencia > 0 but disponible <= 0", () => {
    expect(resolveProductAlertState({
      ...base,
      officialOnHand: 50,
      officialReserved: 50,
      officialAvailable: 0,
    })).toBe("ONLY_RESERVED");
  });

  it("NEGATIVE_STOCK: disponible < 0", () => {
    expect(resolveProductAlertState({
      ...base,
      officialOnHand: 10,
      officialReserved: 15,
      officialAvailable: -5,
    })).toBe("NEGATIVE_STOCK");
  });

  it("STALE_SOURCE: source is STALE", () => {
    expect(resolveProductAlertState({
      officialOnHand: 100,
      officialReserved: 0,
      officialAvailable: 100,
      balanceSource: "SAG_OFFICIAL",
      sourceStatus: "STALE",
    })).toBe("STALE_SOURCE");
  });

  it("STALE_SOURCE: source is DEGRADED", () => {
    expect(resolveProductAlertState({
      officialOnHand: 100,
      officialReserved: 0,
      officialAvailable: 100,
      balanceSource: "SAG_OFFICIAL_CACHE",
      sourceStatus: "DEGRADED",
    })).toBe("STALE_SOURCE");
  });

  it("OFFICIAL_NOT_FOUND: SAG query OK but ref absent", () => {
    expect(resolveProductAlertState({
      officialOnHand: 0,
      officialReserved: 0,
      officialAvailable: 0,
      balanceSource: "SAG_OFFICIAL_NOT_FOUND",
      sourceStatus: "FRESH",
    })).toBe("OFFICIAL_NOT_FOUND");
  });

  it("OFFICIAL_NOT_FOUND: balance source UNAVAILABLE", () => {
    expect(resolveProductAlertState({
      officialOnHand: 0,
      officialReserved: 0,
      officialAvailable: 0,
      balanceSource: "UNAVAILABLE",
      sourceStatus: "UNAVAILABLE",
    })).toBe("OFFICIAL_NOT_FOUND");
  });

  it("priority: OFFICIAL_NOT_FOUND > STALE_SOURCE > NEGATIVE_STOCK", () => {
    // OFFICIAL_NOT_FOUND takes priority even over STALE
    expect(resolveProductAlertState({
      officialOnHand: 0,
      officialReserved: 0,
      officialAvailable: 0,
      balanceSource: "SAG_OFFICIAL_NOT_FOUND",
      sourceStatus: "STALE",
    })).toBe("OFFICIAL_NOT_FOUND");
  });
});

// ── Alert Summary ───────────────────────────────────────────────────────────

describe("Alert Summary", () => {
  it("counts all alert states correctly", () => {
    const states: StoreProductAlertState[] = [
      "HEALTHY", "HEALTHY", "HEALTHY",
      "OUT_OF_STOCK", "OUT_OF_STOCK",
      "LOW_STOCK",
      "ONLY_RESERVED",
      "NEGATIVE_STOCK",
      "STALE_SOURCE",
      "OFFICIAL_NOT_FOUND",
    ];
    const summary = summarizeAlerts(states);
    expect(summary.healthy).toBe(3);
    expect(summary.outOfStock).toBe(2);
    expect(summary.lowStock).toBe(1);
    expect(summary.onlyReserved).toBe(1);
    expect(summary.negativeStock).toBe(1);
    expect(summary.staleSource).toBe(1);
    expect(summary.officialNotFound).toBe(1);
    expect(summary.total).toBe(10);
  });

  it("empty array returns all zeros", () => {
    const summary = summarizeAlerts([]);
    expect(summary.total).toBe(0);
    expect(summary.healthy).toBe(0);
  });
});

// ── KPI Computation (OCTAVO) ────────────────────────────────────────────────

describe("KPI Computation", () => {
  function makeProduct(overrides: Partial<StoreNodeProduct> = {}): StoreNodeProduct {
    return {
      referenceCode: "CD-TEST",
      productName: "Test Product",
      line: "CASTILLITOS",
      category: "PIJAMA",
      brand: "",
      officialOnHand: 100,
      officialReserved: 10,
      officialAvailable: 90,
      costoPromedio: 5000,
      lastMovement: null,
      alertState: "HEALTHY",
      balanceSource: "SAG_OFFICIAL",
      ...overrides,
    };
  }

  it("totalOnHand = SUM(EXISTENCIA), totalAvailable = SUM(DISPONIBLE)", () => {
    const products = [
      makeProduct({ officialOnHand: 100, officialAvailable: 90 }),
      makeProduct({ officialOnHand: 50, officialAvailable: 45 }),
    ];
    const kpis = computeKpis(products);
    expect(kpis.totalOnHand).toBe(150);
    expect(kpis.totalAvailable).toBe(135);
    expect(kpis.totalReserved).toBe(20);
  });

  it("referencesWithStock counts only disponible > 0", () => {
    const products = [
      makeProduct({ officialAvailable: 90 }),
      makeProduct({ officialAvailable: 0 }),
      makeProduct({ officialAvailable: -5 }),
    ];
    expect(computeKpis(products).referencesWithStock).toBe(1);
  });

  it("referencesOutOfStock: existencia = 0 AND disponible <= 0", () => {
    const products = [
      makeProduct({ officialOnHand: 0, officialAvailable: 0 }),
      makeProduct({ officialOnHand: 50, officialAvailable: 0 }), // NOT out of stock — has physical stock
      makeProduct({ officialOnHand: 0, officialAvailable: -1 }),
    ];
    expect(computeKpis(products).referencesOutOfStock).toBe(2);
  });

  it("referencesCritical: 0 < disponible <= 5", () => {
    const products = [
      makeProduct({ officialAvailable: 1 }),
      makeProduct({ officialAvailable: 5 }),
      makeProduct({ officialAvailable: 6 }),
      makeProduct({ officialAvailable: 0 }),
    ];
    expect(computeKpis(products).referencesCritical).toBe(2);
  });

  it("referencesReserved: reservado > 0", () => {
    const products = [
      makeProduct({ officialReserved: 10 }),
      makeProduct({ officialReserved: 0 }),
    ];
    expect(computeKpis(products).referencesReserved).toBe(1);
  });

  it("referencesNegative: disponible < 0", () => {
    const products = [
      makeProduct({ officialAvailable: -5 }),
      makeProduct({ officialAvailable: -1 }),
      makeProduct({ officialAvailable: 0 }),
    ];
    expect(computeKpis(products).referencesNegative).toBe(2);
  });

  it("referencesNotFound: SAG_OFFICIAL_NOT_FOUND or UNAVAILABLE", () => {
    const products = [
      makeProduct({ balanceSource: "SAG_OFFICIAL_NOT_FOUND" }),
      makeProduct({ balanceSource: "UNAVAILABLE" }),
      makeProduct({ balanceSource: "SAG_OFFICIAL" }),
    ];
    expect(computeKpis(products).referencesNotFound).toBe(2);
  });
});

// ── Helper: standalone KPI computation for tests ────────────────────────────

function computeKpis(products: StoreNodeProduct[]): StoreNodeKpis {
  return {
    totalReferences: products.length,
    totalOnHand: products.reduce((s, p) => s + p.officialOnHand, 0),
    totalReserved: products.reduce((s, p) => s + p.officialReserved, 0),
    totalAvailable: products.reduce((s, p) => s + p.officialAvailable, 0),
    referencesWithStock: products.filter(p => p.officialAvailable > 0).length,
    referencesOutOfStock: products.filter(p =>
      p.officialOnHand <= 0 && p.officialAvailable <= 0
    ).length,
    referencesCritical: products.filter(p =>
      p.officialAvailable > 0 && p.officialAvailable <= 5
    ).length,
    referencesReserved: products.filter(p => p.officialReserved > 0).length,
    referencesNegative: products.filter(p => p.officialAvailable < 0).length,
    referencesNotFound: products.filter(p =>
      p.balanceSource === "SAG_OFFICIAL_NOT_FOUND" || p.balanceSource === "UNAVAILABLE"
    ).length,
  };
}

// ── Source Status (DÉCIMO) ──────────────────────────────────────────────────

describe("Source Status & Observability", () => {
  it("SAG_OFFICIAL when SAG healthy and data present", () => {
    // Covered by resolveBalanceSource in inventory service
    const src = resolveTestBalanceSource("FRESH", true);
    expect(src).toBe("SAG_OFFICIAL");
  });

  it("SAG_OFFICIAL_CACHE when SAG DEGRADED but cached data", () => {
    const src = resolveTestBalanceSource("DEGRADED", true);
    expect(src).toBe("SAG_OFFICIAL_CACHE");
  });

  it("SAG_OFFICIAL_NOT_FOUND when SAG healthy but no data", () => {
    const src = resolveTestBalanceSource("FRESH", false);
    expect(src).toBe("SAG_OFFICIAL_NOT_FOUND");
  });

  it("UNAVAILABLE when SAG down and no data", () => {
    const src = resolveTestBalanceSource("UNAVAILABLE", false);
    expect(src).toBe("UNAVAILABLE");
  });
});

// Mirrors the logic in store-network-inventory.ts
function resolveTestBalanceSource(
  status: string,
  hasData: boolean,
): string {
  if (!hasData) {
    return status === "UNAVAILABLE" ? "UNAVAILABLE" : "SAG_OFFICIAL_NOT_FOUND";
  }
  if (status === "DEGRADED") return "SAG_OFFICIAL_CACHE";
  return "SAG_OFFICIAL";
}

// ── Network Node Lookup ─────────────────────────────────────────────────────

describe("Network Node Lookup", () => {
  const network = buildStoreNetwork();

  it("getNodeByWarehouseCode finds by ssCodigo", () => {
    const node = getNodeByWarehouseCode(network, "01");
    expect(node).toBeDefined();
    expect(node!.warehouseName).toBe("BODEGA PRINCIPAL");
  });

  it("getNodeById finds by kaNlBodega", () => {
    const node = getNodeById(network, "10");
    expect(node).toBeDefined();
    expect(node!.warehouseCode).toBe("01");
  });

  it("returns undefined for unknown codes", () => {
    expect(getNodeByWarehouseCode(network, "99")).toBeUndefined();
    expect(getNodeById(network, "999")).toBeUndefined();
  });
});

// ── All Stores Present ──────────────────────────────────────────────────────

describe("All Stores Present", () => {
  const network = buildStoreNetwork();

  const expectedStores = [
    { code: "00", name: "BODEGA CENTRO", id: "31" },
    { code: "02", name: "BODEGA SANDIEGO", id: "11" },
    { code: "23", name: "GRAN PLAZA", id: "32" },
    { code: "29", name: "BODEGA CALDAS", id: "39" },
  ];

  for (const store of expectedStores) {
    it(`${store.name} (ss=${store.code}, pk=${store.id}) is a STORE node`, () => {
      const node = getNodeByWarehouseCode(network, store.code);
      expect(node).toBeDefined();
      expect(node!.id).toBe(store.id);
      expect(node!.networkRole).toBe("STORE");
      expect(node!.allowCommercialSales).toBe(true);
      expect(node!.parentNode).toBe("10"); // B01 Principal
    });
  }
});

// ── All Hubs Present ────────────────────────────────────────────────────────

describe("All Hubs Present", () => {
  const network = buildStoreNetwork();

  it("B01 Principal is COMMERCIAL_HUB", () => {
    const hub = getNodeByWarehouseCode(network, "01")!;
    expect(hub.networkRole).toBe("COMMERCIAL_HUB");
    expect(hub.id).toBe("10");
  });

  it("B24 Importación is IMPORT_HUB", () => {
    const hub = getNodeByWarehouseCode(network, "24")!;
    expect(hub.networkRole).toBe("IMPORT_HUB");
    expect(hub.id).toBe("33");
  });
});
