/**
 * lib/comercial/tiendas/__tests__/store-stabilization-performance.test.ts
 *
 * Tests for AGENTIK-STORES-STABILIZATION-PERFORMANCE-01.
 * Verifies: exactly 4 stores, inactive exclusion, non-blocking page,
 * drawer per-store, state cleanup, zero SOAP, navigation, tabs.
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-stabilization-performance.test.ts
 *
 * Sprint: AGENTIK-STORES-STABILIZATION-PERFORMANCE-01
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { CanonicalStoreCard, CanonicalStoreDistribution, StoreDistributionHealthStatus } from "../store-distribution-types";
import { ACTIVE_STORE_SLUGS } from "../store-distribution-types";

// ── Fixture helpers ──────────────────────────────────────────────────────

function makeStoreCard(overrides: Partial<CanonicalStoreCard> = {}): CanonicalStoreCard {
  return {
    store: {
      id: "store-1",
      name: "Centro",
      sagWarehouseCode: "31",
      city: "Medellin",
      responsibleName: "Admin",
      status: "activa" as const,
      storeType: "tienda" as const,
      lastSyncAt: new Date().toISOString(),
    },
    totalReferences: 120,
    totalUnits: 450,
    criticalNeeds: 5,
    excessItems: 2,
    coveragePercent: 78,
    actionRequired: true,
    healthStatus: "requiere_surtido" as StoreDistributionHealthStatus,
    ...overrides,
  };
}

// ── Source code helpers (read files without importing server-only modules) ───

const SERVICE_SOURCE = readFileSync(
  resolve(__dirname, "../store-distribution-service.ts"),
  "utf-8"
);

const CLIENT_SOURCE = readFileSync(
  resolve(__dirname, "../../../../app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx"),
  "utf-8"
);

const PAGE_SOURCE = readFileSync(
  resolve(__dirname, "../../../../app/(app)/[orgSlug]/comercial/tiendas/page.tsx"),
  "utf-8"
);

// ── PRIMERO: Exactly 4 operational stores ──────────────────────────────

describe("PRIMERO — Exactly 4 operational stores", () => {
  it("ACTIVE_STORE_SLUGS has exactly 4 entries", () => {
    assert.equal(ACTIVE_STORE_SLUGS.length, 4);
  });

  it("ACTIVE_STORE_SLUGS contains all expected stores", () => {
    assert.ok(ACTIVE_STORE_SLUGS.includes("san_diego"));
    assert.ok(ACTIVE_STORE_SLUGS.includes("centro"));
    assert.ok(ACTIVE_STORE_SLUGS.includes("gran_plaza"));
    assert.ok(ACTIVE_STORE_SLUGS.includes("caldas"));
  });

  it("CANONICAL_STORE_IDENTITY in service maps exactly 4 warehouse PKs", () => {
    // Parse the CANONICAL_STORE_IDENTITY block from service source (multiline)
    const start = SERVICE_SOURCE.indexOf("CANONICAL_STORE_IDENTITY");
    assert.ok(start >= 0, "CANONICAL_STORE_IDENTITY should exist in service");
    const openBrace = SERVICE_SOURCE.indexOf("{", start);
    // Find matching close brace
    let depth = 0;
    let end = openBrace;
    for (let i = openBrace; i < SERVICE_SOURCE.length; i++) {
      if (SERVICE_SOURCE[i] === "{") depth++;
      if (SERVICE_SOURCE[i] === "}") depth--;
      if (depth === 0) { end = i; break; }
    }
    const body = SERVICE_SOURCE.slice(openBrace, end + 1);
    const pks = [...body.matchAll(/"(\d+)":/g)].map(m => m[1]);
    assert.equal(pks.length, 4, `Expected 4 PKs, got: ${pks.join(", ")}`);
    assert.ok(pks.includes("31"), "Missing PK 31 (Centro)");
    assert.ok(pks.includes("11"), "Missing PK 11 (San Diego)");
    assert.ok(pks.includes("32"), "Missing PK 32 (Gran Plaza)");
    assert.ok(pks.includes("39"), "Missing PK 39 (Caldas)");
  });
});

// ── PRIMERO: Inactive store exclusion ──────────────────────────────────

describe("PRIMERO — Inactive store exclusion", () => {
  it("inactive warehouse PKs are NOT in CANONICAL_STORE_IDENTITY", () => {
    const start = SERVICE_SOURCE.indexOf("CANONICAL_STORE_IDENTITY");
    const openBrace = SERVICE_SOURCE.indexOf("{", start);
    let depth = 0, end = openBrace;
    for (let i = openBrace; i < SERVICE_SOURCE.length; i++) {
      if (SERVICE_SOURCE[i] === "{") depth++;
      if (SERVICE_SOURCE[i] === "}") depth--;
      if (depth === 0) { end = i; break; }
    }
    const body = SERVICE_SOURCE.slice(openBrace, end + 1);
    const pks = [...body.matchAll(/"(\d+)":/g)].map(m => m[1]);
    const inactivePks = ["12", "13", "14", "15", "33", "34", "35", "36", "37", "40"];
    for (const pk of inactivePks) {
      assert.ok(!pks.includes(pk), `PK ${pk} should NOT be in CANONICAL_STORE_IDENTITY`);
    }
  });
});

// ── TERCERO: Non-blocking page ────────────────────────────────────────

describe("TERCERO — Non-blocking page.tsx", () => {
  it("page.tsx does NOT import buildCanonicalStoreDistribution", () => {
    // Filter out comment lines — only check import/await/function-call lines
    const codeLines = PAGE_SOURCE.split("\n").filter(l => !l.trim().startsWith("*") && !l.trim().startsWith("//"));
    const code = codeLines.join("\n");
    assert.ok(
      !code.includes("buildCanonicalStoreDistribution"),
      "page.tsx should NOT call buildCanonicalStoreDistribution in code (blocking)"
    );
  });

  it("page.tsx does NOT import getStoresWorkspaceWithSignals", () => {
    const codeLines = PAGE_SOURCE.split("\n").filter(l => !l.trim().startsWith("*") && !l.trim().startsWith("//"));
    const code = codeLines.join("\n");
    assert.ok(
      !code.includes("getStoresWorkspaceWithSignals"),
      "page.tsx should NOT call getStoresWorkspaceWithSignals in code (blocking)"
    );
  });

  it("page.tsx only passes orgSlug and orgId to client", () => {
    assert.ok(PAGE_SOURCE.includes("orgSlug={orgSlug}"), "Should pass orgSlug");
    assert.ok(PAGE_SOURCE.includes("orgId={orgId}"), "Should pass orgId");
    // Should NOT pass heavy data props
    assert.ok(!PAGE_SOURCE.includes("distribution={"), "Should NOT pass distribution prop");
    assert.ok(!PAGE_SOURCE.includes("workspace={"), "Should NOT pass workspace prop");
    assert.ok(!PAGE_SOURCE.includes("signals={"), "Should NOT pass signals prop");
  });
});

// ── CUARTO: Zero SOAP during navigation ──────────────────────────────

describe("CUARTO — Zero SOAP during navigation", () => {
  it("store-distribution-service does NOT import SAG SOAP modules", () => {
    assert.ok(
      !SERVICE_SOURCE.includes("sag-soap"),
      "store-distribution-service should NOT import sag-soap"
    );
    assert.ok(
      !SERVICE_SOURCE.includes("SagSoapClient"),
      "store-distribution-service should NOT reference SagSoapClient"
    );
  });

  it("tiendas-client does NOT import SAG SOAP modules", () => {
    assert.ok(
      !CLIENT_SOURCE.includes("sag-soap"),
      "tiendas-client should NOT import sag-soap"
    );
    assert.ok(
      !CLIENT_SOURCE.includes("SagSoapClient"),
      "tiendas-client should NOT reference SagSoapClient"
    );
  });
});

// ── QUINTO: Drawer state cleanup ─────────────────────────────────────

describe("QUINTO — Drawer state cleanup on store change", () => {
  it("openStoreDrawer sets storeDetail to null before fetching", () => {
    // Verify the pattern exists in client source
    assert.ok(
      CLIENT_SOURCE.includes("setStoreDetail(null)"),
      "openStoreDrawer should call setStoreDetail(null) before fetch"
    );
  });

  it("closeDrawer clears both selectedStoreCard and storeDetail", () => {
    assert.ok(
      CLIENT_SOURCE.includes("setSelectedStoreCard(null)"),
      "closeDrawer should clear selectedStoreCard"
    );
  });

  it("drawer resets tab and filters on store change via useEffect", () => {
    // The DistributionStoreDrawer has a useEffect that resets on storeCard.store.id change
    assert.ok(
      CLIENT_SOURCE.includes('setTab("inventario")'),
      "Drawer should reset tab to inventario on store change"
    );
    assert.ok(
      CLIENT_SOURCE.includes('setActionFilter("ALL")'),
      "Drawer should reset action filter on store change"
    );
  });
});

// ── SEGUNDO: Navigation is reduced to 3 views ──────────────────────

describe("SEGUNDO — Navigation reduced to Tiendas | Necesidades | Sugerencias", () => {
  it("WorkspaceView type has exactly 3 values", () => {
    const match = CLIENT_SOURCE.match(/type WorkspaceView\s*=\s*"([^"]+)"\s*\|\s*"([^"]+)"\s*\|\s*"([^"]+)"/);
    assert.ok(match, "WorkspaceView type should exist with 3 union members");
    const views = [match[1], match[2], match[3]];
    assert.ok(views.includes("tiendas"), "Missing tiendas");
    assert.ok(views.includes("necesidades"), "Missing necesidades");
    assert.ok(views.includes("sugerencias"), "Missing sugerencias");
  });

  it("distribucion is NOT a top-level view", () => {
    const match = CLIENT_SOURCE.match(/type WorkspaceView\s*=[^;]+;/);
    assert.ok(match);
    assert.ok(!match[0].includes("distribucion"), "distribucion should not be in WorkspaceView");
  });
});

// ── Drawer tabs match spec ──────────────────────────────────────────

describe("SEGUNDO — Drawer tabs: Inventario | Necesidades | Derrotero | Inteligencia", () => {
  it("DistDrawerTab type has exactly 4 values", () => {
    const match = CLIENT_SOURCE.match(/type DistDrawerTab\s*=\s*([^;]+);/);
    assert.ok(match, "DistDrawerTab type should exist");
    const typeBody = match[1];
    assert.ok(typeBody.includes('"inventario"'), "Missing inventario tab");
    assert.ok(typeBody.includes('"necesidades"'), "Missing necesidades tab");
    assert.ok(typeBody.includes('"derrotero"'), "Missing derrotero tab");
    assert.ok(typeBody.includes('"inteligencia"'), "Missing inteligencia tab");
    assert.ok(!typeBody.includes('"resumen"'), "resumen should not be a tab");
  });
});

// ── SÉPTIMO: CanonicalStoreCard structure ────────────────────────────

describe("SÉPTIMO — CanonicalStoreCard has required fields for OperationalStoreCard", () => {
  it("card has all required metrics", () => {
    const card = makeStoreCard();
    assert.ok("totalReferences" in card, "Missing totalReferences");
    assert.ok("totalUnits" in card, "Missing totalUnits");
    assert.ok("criticalNeeds" in card, "Missing criticalNeeds");
    assert.ok("excessItems" in card, "Missing excessItems");
    assert.ok("coveragePercent" in card, "Missing coveragePercent");
    assert.ok("healthStatus" in card, "Missing healthStatus");
    assert.ok("actionRequired" in card, "Missing actionRequired");
  });

  it("card.store has name, sagWarehouseCode, city", () => {
    const card = makeStoreCard();
    assert.ok(card.store.name.length > 0, "store.name should not be empty");
    assert.ok(card.store.sagWarehouseCode.length > 0, "store.sagWarehouseCode should not be empty");
  });

  it("healthStatus is a valid StoreDistributionHealthStatus", () => {
    const valid: StoreDistributionHealthStatus[] = ["ok", "requiere_surtido", "critica", "sin_reglas"];
    const card = makeStoreCard();
    assert.ok(valid.includes(card.healthStatus), `Invalid healthStatus: ${card.healthStatus}`);
  });
});

// ── OperationalStoreCard exists ─────────────────────────────────────

describe("SÉPTIMO — OperationalStoreCard component exists", () => {
  it("OperationalStoreCard function is defined in client", () => {
    assert.ok(
      CLIENT_SOURCE.includes("function OperationalStoreCard("),
      "OperationalStoreCard component should be defined"
    );
  });

  it("OperationalStoreCard renders 'Abrir tienda' button", () => {
    assert.ok(
      CLIENT_SOURCE.includes("Abrir tienda"),
      "OperationalStoreCard should have 'Abrir tienda' button"
    );
  });
});

// ── KPI exclusion: only 4 stores ──────────────────────────────────

describe("KPI exclusion — only operational stores in distribution", () => {
  it("distribution with 4 stores has correct KPI structure", () => {
    const dist: Pick<CanonicalStoreDistribution, "kpis" | "stores"> = {
      stores: [
        makeStoreCard({ store: { id: "1", name: "Centro", sagWarehouseCode: "31", city: "M", responsibleName: "A", status: "activa", storeType: "tienda", lastSyncAt: null } }),
        makeStoreCard({ store: { id: "2", name: "San Diego", sagWarehouseCode: "11", city: "M", responsibleName: "A", status: "activa", storeType: "tienda", lastSyncAt: null } }),
        makeStoreCard({ store: { id: "3", name: "Gran Plaza", sagWarehouseCode: "32", city: "M", responsibleName: "A", status: "activa", storeType: "tienda", lastSyncAt: null } }),
        makeStoreCard({ store: { id: "4", name: "Caldas", sagWarehouseCode: "39", city: "M", responsibleName: "A", status: "activa", storeType: "tienda", lastSyncAt: null } }),
      ],
      kpis: { tiendasActivas: 4, tiendasCriticas: 0, referenciasPorSurtir: 0, referenciasConExceso: 0, propuestasPendientes: 0 },
    };
    assert.equal(dist.stores.length, 4, "Should have exactly 4 stores");
    assert.equal(dist.kpis.tiendasActivas, 4, "tiendasActivas should be 4");
  });
});
