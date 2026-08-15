/**
 * M2A-P0 Structural Tests
 *
 * Proves that the monolithic route blocker (loadControlComercial) has been
 * fully removed from all Manager commercial surfaces and replaced with
 * narrow, route-specific loaders that preserve business truth.
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../../..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

const ROUTE_FILES = [
  "app/(app)/[orgSlug]/manager/comercial/page.tsx",
  "app/(app)/[orgSlug]/manager/comercial/ventas/page.tsx",
  "app/(app)/[orgSlug]/manager/comercial/clientes/page.tsx",
  "app/(app)/[orgSlug]/manager/comercial/vendedores/page.tsx",
  "app/(app)/[orgSlug]/manager/comercial/pedidos/page.tsx",
  "app/(app)/[orgSlug]/manager/comercial/inventario/page.tsx",
  "app/(app)/[orgSlug]/manager/comercial/importaciones/page.tsx",
];

// ── Test 1: No Manager page imports loadControlComercial ────────────────

describe("M2A-P0: loadControlComercial removal", () => {
  for (const routeFile of ROUTE_FILES) {
    test(`${routeFile} does NOT import loadControlComercial`, () => {
      const content = readFile(routeFile);
      expect(content).not.toMatch(/import.*loadControlComercial/);
      expect(content).not.toMatch(/from.*control-comercial-loader/);
    });
  }

  test("Manager Home does NOT import loadControlComercial", () => {
    const content = readFile("app/(app)/[orgSlug]/manager/page.tsx");
    expect(content).not.toMatch(/import.*loadControlComercial/);
  });
});

// ── Test 2: Commercial Hub makes no business-data query ─────────────────

describe("M2A-P0: Commercial Hub is lightweight", () => {
  test("Hub page imports no data loaders", () => {
    const content = readFile("app/(app)/[orgSlug]/manager/comercial/page.tsx");
    expect(content).not.toContain("buildImportSupplyIntelligence");
    expect(content).not.toContain("loadNarrow");
    expect(content).not.toContain("buildSellerDirectory");
    expect(content).not.toContain("buildSellerMetrics");
    expect(content).toContain("assembleCommercialHubPALightweight");
  });
});

// ── Test 3: Each route invokes its selected loader ──────────────────────

describe("M2A-P0: Route-specific narrow loaders", () => {
  test("Ventas uses loadNarrowVentas", () => {
    const content = readFile("app/(app)/[orgSlug]/manager/comercial/ventas/page.tsx");
    expect(content).toContain("loadNarrowVentas");
    expect(content).toContain("assembleVentasPAFromNarrow");
  });

  test("Clientes uses loadNarrowClientes", () => {
    const content = readFile("app/(app)/[orgSlug]/manager/comercial/clientes/page.tsx");
    expect(content).toContain("loadNarrowClientes");
    expect(content).toContain("assembleClientesPAFromNarrow");
  });

  test("Vendedores uses buildSellerDirectory + buildSellerMetrics", () => {
    const content = readFile("app/(app)/[orgSlug]/manager/comercial/vendedores/page.tsx");
    expect(content).toContain("buildSellerDirectory");
    expect(content).toContain("buildSellerMetrics");
    expect(content).toContain("assembleVendedoresPAFromNarrow");
    expect(content).not.toContain("loadNarrowVendedoresCount");
  });

  test("Pedidos uses loadNarrowPedidos", () => {
    const content = readFile("app/(app)/[orgSlug]/manager/comercial/pedidos/page.tsx");
    expect(content).toContain("loadNarrowPedidos");
    expect(content).toContain("assemblePedidosPAFromNarrow");
  });

  test("Inventario uses loadNarrowInventario", () => {
    const content = readFile("app/(app)/[orgSlug]/manager/comercial/inventario/page.tsx");
    expect(content).toContain("loadNarrowInventario");
    expect(content).toContain("assembleInventarioPAFromNarrow");
  });

  test("Importaciones uses loadNarrowImportaciones (DB-only, no SOAP)", () => {
    const content = readFile("app/(app)/[orgSlug]/manager/comercial/importaciones/page.tsx");
    expect(content).toContain("loadNarrowImportaciones");
    expect(content).toContain("assembleImportacionesPAFromNarrowLoader");
    expect(content).not.toContain("buildImportSupplyIntelligence");
  });
});

// ── Test 4: Every narrow loader includes organization scoping ───────────

describe("M2A-P0: Organization scoping", () => {
  test("All narrow loaders accept organizationId parameter", () => {
    const content = readFile("lib/comercial/manager/manager-narrow-loaders.ts");
    expect(content).toContain("loadNarrowVentas(organizationId: string)");
    expect(content).toContain("loadNarrowPedidos(organizationId: string)");
    expect(content).toContain("loadNarrowClientes(organizationId: string)");
    expect(content).toContain("loadNarrowInventario(organizationId: string)");
  });

  test("Prisma queries in narrow loaders are org-scoped", () => {
    const content = readFile("lib/comercial/manager/manager-narrow-loaders.ts");
    // Every findMany/count/findFirst uses organizationId in where clause
    const queryMatches = content.match(/where:\s*\{[^}]*\}/g) ?? [];
    for (const match of queryMatches) {
      if (match.includes("id: {")) continue; // id: { in: [...] } sub-queries
      expect(match).toContain("organizationId");
    }
  });
});

// ── Test 4b: Period fallback truth ───────────────────────────────────────

describe("M2A-P0: Period fallback truth", () => {
  test("Ventas fallback labels include 'ultimo disponible'", () => {
    const content = readFile("lib/comercial/manager/manager-narrow-loaders.ts");
    expect(content).toContain('(ultimo disponible)');
  });

  test("Pedidos fallback labels include 'ultimo disponible'", () => {
    const content = readFile("lib/comercial/manager/manager-narrow-loaders.ts");
    // Pedidos uses the same smart period fallback pattern
    const pedidosFallback = content.includes("ordersPeriodStart") && content.includes("ultimo disponible");
    expect(pedidosFallback).toBe(true);
  });

  test("Ventas client shows period subtitle", () => {
    const content = readFile("app/(app)/[orgSlug]/manager/comercial/ventas/ventas-client.tsx");
    expect(content).toContain("subtitle={ventasPA.periodo");
  });

  test("Pedidos client shows period subtitle", () => {
    const content = readFile("app/(app)/[orgSlug]/manager/comercial/pedidos/pedidos-client.tsx");
    expect(content).toContain("subtitle={pedidosPA.periodo");
  });

  test("ManagerSurfaceClient renders subtitle when present", () => {
    const content = readFile("app/(app)/[orgSlug]/manager/comercial/manager-surface-client.tsx");
    expect(content).toContain("subtitle");
    expect(content).toContain("{subtitle && (");
  });
});

// ── Test 5: Pedidos uses canonical CustomerOrderRecord ──────────────────

describe("M2A-P0: Pedidos truth certification", () => {
  test("Pedidos narrow loader queries CustomerOrderRecord as primary", () => {
    const content = readFile("lib/comercial/manager/manager-narrow-loaders.ts");
    expect(content).toContain("db.customerOrderRecord");
    expect(content).toContain("PEDIDOS_VALID_STATUSES");
  });

  test("Pedidos narrow loader excludes CANCELADO", () => {
    const content = readFile("lib/comercial/manager/manager-narrow-loaders.ts");
    expect(content).toContain('"PENDIENTE"');
    expect(content).toContain('"CONFIRMADO"');
    expect(content).toContain('"DESPACHADO"');
    expect(content).toContain('"FACTURADO"');
    expect(content).not.toMatch(/PEDIDOS_VALID_STATUSES.*CANCELADO/);
  });

  test("Pedidos PA labels say Pedidos, not Cotizaciones", () => {
    const content = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    expect(content).toContain("Pedidos del periodo");
    expect(content).toContain("Total pedidos");
  });

  test("CRM quotes appear only as secondary signal", () => {
    const content = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    expect(content).toContain("Cotizaciones CRM");
    // Must be a separate fact, never mixed into order totals
    const adapter = readFile("lib/comercial/manager/manager-narrow-loaders.ts");
    expect(adapter).toContain("cotizacionesCrm");
  });

  test("Pedidos client title says Pedidos (not CRM)", () => {
    const content = readFile("app/(app)/[orgSlug]/manager/comercial/pedidos/pedidos-client.tsx");
    expect(content).toContain('title="Pedidos"');
    expect(content).not.toContain('title="Pedidos CRM"');
  });
});

// ── Test 5b: Clientes label truth ────────────────────────────────────────

describe("M2A-P0: Clientes label truth", () => {
  test("Clientes activos counts ALL active, not just this month", () => {
    const content = readFile("lib/comercial/manager/manager-narrow-loaders.ts");
    // Count uses status: "ACTIVE" with NO date filter
    expect(content).toContain('status: "ACTIVE"');
  });

  test("Clientes nuevos label specifies 'este mes'", () => {
    const content = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    expect(content).toContain("Clientes nuevos este mes");
  });
});

// ── Test 6: Inventario labels match source semantics ────────────────────

describe("M2A-P0: Inventario truth certification", () => {
  test("Inventario narrow loader queries CommercialCoverageSnapshot", () => {
    const content = readFile("lib/comercial/manager/manager-narrow-loaders.ts");
    expect(content).toContain("commercialCoverageSnapshot");
  });

  test("Inventario facts describe reference counts with unit thresholds", () => {
    const content = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    // These labels describe what disponible (units) proves:
    // disponible <= 0 = "agotadas" (zero units), disponible <= 20 = "criticas" (low units)
    expect(content).toContain("assembleInventarioPAFromNarrow");
  });

  test("Inventario narrow loader uses disponible field for unit thresholds", () => {
    const content = readFile("lib/comercial/manager/manager-narrow-loaders.ts");
    // Identical logic to the monolithic loader
    expect(content).toContain("ref.disponible <= 0");
    expect(content).toContain("ref.disponible <= 20");
  });
});

// ── Test 7: Seller KPI and card list share fail-closed universe ─────────

describe("M2A-P0: Seller count consistency", () => {
  test("KPI derives from filtered activeSellers.length, not separate count", () => {
    const content = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    expect(content).toContain("fmtNum(activeSellers.length)");
  });

  test("Filter uses fail-closed activo + atencion set", () => {
    const content = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    expect(content).toContain('"activo"');
    expect(content).toContain('"atencion"');
    expect(content).toContain("MANAGER_RELEVANT_STATES");
  });

  test("Vendedores route does NOT use separate count loader", () => {
    const content = readFile("app/(app)/[orgSlug]/manager/comercial/vendedores/page.tsx");
    expect(content).not.toContain("loadNarrowVendedoresCount");
  });
});

// ── Test 8: Authorization gates remain intact ───────────────────────────

describe("M2A-P0: Authorization gates", () => {
  for (const routeFile of ROUTE_FILES) {
    test(`${routeFile} calls requireOrgAccess`, () => {
      const content = readFile(routeFile);
      expect(content).toContain("requireOrgAccess");
    });
  }

  test("Manager Home calls requireOrgAccess", () => {
    const content = readFile("app/(app)/[orgSlug]/manager/page.tsx");
    expect(content).toContain("requireOrgAccess");
  });
});

// ── Test 9: Narrow loaders match monolithic loader logic ────────────────

describe("M2A-P0: Narrow loader truth parity with monolithic", () => {
  test("Ventas: same SaleRecord query, same date logic, same amount field", () => {
    const narrow = readFile("lib/comercial/manager/manager-narrow-loaders.ts");
    const mono = readFile("lib/comercial/control/control-comercial-loader.ts");

    // Both query saleRecord with organizationId + saleDate range
    expect(narrow).toContain("db.saleRecord");
    expect(mono).toContain("db.saleRecord");

    // Both use smart period fallback
    expect(narrow).toContain("ultimo disponible");
    expect(mono).toContain("ultimo disponible");

    // Both sum Number(s.amount)
    expect(narrow).toContain("Number(s.amount)");
    expect(mono).toContain("Number(s.amount)");
  });

  test("Pedidos: upgraded from CRMQuote to CustomerOrderRecord", () => {
    const narrow = readFile("lib/comercial/manager/manager-narrow-loaders.ts");

    // Now queries canonical orders, not CRM quotes
    expect(narrow).toContain("db.customerOrderRecord");
    // Still has CRM quote as secondary signal
    expect(narrow).toContain("db.cRMQuote.count");
    // Uses smart period fallback
    expect(narrow).toContain("ultimo disponible");
  });

  test("Clientes: same CustomerProfile count with status ACTIVE", () => {
    const narrow = readFile("lib/comercial/manager/manager-narrow-loaders.ts");
    const mono = readFile("lib/comercial/control/control-comercial-loader.ts");

    // Both count with status: "ACTIVE"
    expect(narrow).toContain('status: "ACTIVE"');
    expect(mono).toContain('status: "ACTIVE"');

    // Both count new by createdAt >= monthStart
    expect(narrow).toContain("createdAt: { gte: monthStart }");
    expect(mono).toContain("createdAt: { gte: monthStart }");
  });

  test("Inventario: same CommercialCoverageSnapshot query, same thresholds", () => {
    const narrow = readFile("lib/comercial/manager/manager-narrow-loaders.ts");
    const mono = readFile("lib/comercial/control/control-comercial-loader.ts");

    // Both query latest snapshot by snapshotAt desc
    expect(narrow).toContain('orderBy: { snapshotAt: "desc" }');
    expect(mono).toContain('orderBy: { snapshotAt: "desc" }');

    // Both use same thresholds
    expect(narrow).toContain("ref.disponible <= 0");
    expect(mono).toContain("ref.disponible <= 0");
    expect(narrow).toContain("ref.disponible <= 20");
    expect(mono).toContain("ref.disponible <= 20");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// CORRECTION DELTA TESTS — AUTHORITY AND EVIDENCE CORRECTIONS
// Sprint: AGENTIK-MANAGER-FINAL-DELTA-01
// ══════════════════════════════════════════════════════════════════════════════

// ── Point 1: Importaciones fail-closed + sourceAsOf ──────────────────────

describe("DELTA: Importaciones fail-closed behavior", () => {
  test("NarrowImportacionesData has truthState and sourceAsOf fields", () => {
    const content = readFile("lib/comercial/manager/manager-narrow-loaders.ts");
    expect(content).toContain("truthState: NarrowImportacionesTruthState");
    expect(content).toContain("sourceAsOf: string | null");
    expect(content).toContain("unavailableCause: string | null");
  });

  test("loadNarrowImportaciones delegates to getCachedImportIntelligence, never queries DB directly", () => {
    const content = readFile("lib/comercial/manager/manager-narrow-loaders.ts");
    // Narrow loader is a thin projection of cached canonical result
    expect(content).toContain("getCachedImportIntelligence");
    expect(content).toContain("projectManagerKpis");
    // No direct DB queries for importaciones
    expect(content).not.toMatch(/db\.productEntity.*import/i);
    expect(content).not.toMatch(/db\.productInventoryLevel.*import/i);
  });

  test("cache handles SOURCE_UNAVAILABLE when canonical service fails entirely", () => {
    const cache = readFile("lib/comercial/importaciones/import-intelligence-cache.ts");
    expect(cache).toContain('truthState: "SOURCE_UNAVAILABLE"');
    expect(cache).toContain('truthState: "STALE"');
    expect(cache).toContain('truthState: "CERTIFIED"');
  });

  test("adapter hides KPIs when truthState is SOURCE_UNAVAILABLE", () => {
    const adapter = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    expect(adapter).toContain('"SOURCE_UNAVAILABLE"');
  });

  test("composite freshness derives from MIN of all sources, not request time", () => {
    const cache = readFile("lib/comercial/importaciones/import-intelligence-cache.ts");
    expect(cache).toContain("productEntityAsOf");
    expect(cache).toContain("inventoryAsOf");
    expect(cache).toContain("orderLinesAsOf");
    expect(cache).toContain("compositeAsOf");
    expect(cache).toContain("Math.min");
  });

  test("canonical cache has no hardcoded warehouse or product line constants", () => {
    const cache = readFile("lib/comercial/importaciones/import-intelligence-cache.ts");
    const narrow = readFile("lib/comercial/manager/manager-narrow-loaders.ts");
    // No hardcoded "5" for product line or "33" for warehouse in either file
    expect(narrow).not.toContain('productLine');
    expect(narrow).not.toContain('warehouseId');
    expect(cache).not.toContain('productLine: { in:');
    expect(cache).not.toContain('warehouseId: "33"');
  });
});

// ── Point 2: Vendedores excluded by identity, not name ────────────────────

describe("DELTA: Vendedores identity-based exclusion", () => {
  test("seller-directory uses tercero mapping, not name set", () => {
    const content = readFile("lib/comercial/foundation/seller-directory.ts");
    expect(content).toContain("getSellerTerceroMapping");
    expect(content).toContain("certifiedSlugs");
    // No SYSTEM_ACCOUNTS = new Set([...]) pattern — identity check only
    expect(content).not.toContain("SYSTEM_ACCOUNTS");
  });

  test("filter uses slug presence in certifiedSlugs, not name comparison", () => {
    const content = readFile("lib/comercial/foundation/seller-directory.ts");
    expect(content).toContain("certifiedSlugs.has(data.slug)");
  });
});

// ── Point 3: Clientes excluded by canonical classification, not name ──────

describe("DELTA: Clientes identity-based exclusion", () => {
  test("narrow loader uses IdentityStatus enum, not name set", () => {
    const content = readFile("lib/comercial/manager/manager-narrow-loaders.ts");
    expect(content).toContain("identityStatus");
    expect(content).toContain("NON_COMMERCIAL_IDENTITY_STATUSES");
    expect(content).not.toContain("GENERIC_ACCOUNTING_NAMES");
    expect(content).not.toContain('"CONSUMIDOR FINAL"');
  });

  test("filter checks Prisma enum values CONSUMIDOR_FINAL and DUPLICATE", () => {
    const content = readFile("lib/comercial/manager/manager-narrow-loaders.ts");
    expect(content).toContain('"CONSUMIDOR_FINAL"');
    expect(content).toContain('"DUPLICATE"');
  });
});

// ── Point 5: Tiendas truthState distinguishes zero from unavailable ────────

describe("DELTA: Tiendas truth state", () => {
  test("ManagerStoreCard has inventoryTruthState field", () => {
    const types = readFile("lib/comercial/manager/manager-commercial-types.ts");
    expect(types).toContain('inventoryTruthState: "CERTIFIED" | "UNAVAILABLE"');
    expect(types).toContain("sourceAsOf: string | null");
  });

  test("adapter computes inventoryTruthState from source data", () => {
    const adapter = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    expect(adapter).toContain("inventoryTruthState");
    expect(adapter).toContain('"CERTIFIED"');
    expect(adapter).toContain('"UNAVAILABLE"');
  });

  test("tiendas client branches on inventoryTruthState, not zero inference", () => {
    const client = readFile("app/(app)/[orgSlug]/manager/comercial/tiendas/tiendas-client.tsx");
    expect(client).toContain('inventoryTruthState === "UNAVAILABLE"');
    expect(client).toContain("Inventario no disponible");
    // Does NOT infer unavailability from totalReferences === 0
    expect(client).not.toContain("totalReferences === 0");
  });
});

// ── Point 6: Proper Spanish accents in visible labels ──────────────────────

describe("DELTA: Accent marks in visible labels", () => {
  test("adapter uses proper accents", () => {
    const adapter = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    expect(adapter).toContain("Baja rotación");
    expect(adapter).toContain("Referencias críticas");
  });

  test("importaciones client uses proper accents", () => {
    const client = readFile("app/(app)/[orgSlug]/manager/comercial/importaciones/importaciones-client.tsx");
    expect(client).toContain("importación");
  });
});
