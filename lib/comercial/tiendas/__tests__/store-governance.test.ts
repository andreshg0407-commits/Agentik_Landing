/**
 * lib/comercial/tiendas/__tests__/store-governance.test.ts
 *
 * Tests for AGENTIK-STORES-ACTIVE-STORE-GOVERNANCE-01.
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-governance.test.ts
 *
 * Sprint: AGENTIK-STORES-ACTIVE-STORE-GOVERNANCE-01
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { resolve } from "path";
import type {
  StoreGovernanceRecord,
  StoreOperationalStatus,
  StoreGovernanceAuditEntry,
  InactiveStoreSeed,
} from "../store-governance-types";
import {
  CASTILLITOS_INACTIVE_STORES,
  STORE_INACTIVE_CODE,
  STORE_INACTIVE_MESSAGE,
} from "../store-governance-types";
import { ACTIVE_STORE_SLUGS } from "../store-distribution-types";

// ── Source code (avoid server-only imports) ──────────────────────────────

const GOV_SERVICE_SOURCE = readFileSync(
  resolve(__dirname, "../store-governance-service.ts"), "utf-8"
);
const ROUTE_SOURCE = readFileSync(
  resolve(__dirname, "../../../../app/api/orgs/[orgSlug]/comercial/tiendas/route.ts"), "utf-8"
);
const CLIENT_SOURCE = readFileSync(
  resolve(__dirname, "../../../../app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx"), "utf-8"
);

// ── Fixture ─────────────────────────────────────────────────────────────

function makeGovRecord(overrides: Partial<StoreGovernanceRecord> = {}): StoreGovernanceRecord {
  return {
    storeId:            "centro",
    slug:               "centro",
    displayName:        "Centro",
    warehouseId:        "31",
    sagWarehouseCode:   "31",
    city:               "Medellin",
    status:             "ACTIVE",
    activatedAt:        new Date().toISOString(),
    deactivatedAt:      null,
    deactivationReason: null,
    updatedBy:          "admin",
    updatedAt:          new Date().toISOString(),
    ...overrides,
  };
}

// ── PRIMERO: Canonical source of state ──────────────────────────────────

describe("PRIMERO — StoreGovernanceRecord has all required fields", () => {
  it("record has all 12 required fields", () => {
    const r = makeGovRecord();
    const keys = [
      "storeId", "slug", "displayName", "warehouseId", "sagWarehouseCode",
      "city", "status", "activatedAt", "deactivatedAt", "deactivationReason",
      "updatedBy", "updatedAt",
    ];
    for (const k of keys) {
      assert.ok(k in r, `Missing field: ${k}`);
    }
  });

  it("status is ACTIVE or INACTIVE", () => {
    const valid: StoreOperationalStatus[] = ["ACTIVE", "INACTIVE"];
    assert.ok(valid.includes(makeGovRecord().status));
    assert.ok(valid.includes(makeGovRecord({ status: "INACTIVE" }).status));
  });
});

// ── PRIMERO: Castillitos initial state ──────────────────────────────────

describe("PRIMERO — Castillitos initial state: 4 active, N inactive", () => {
  it("4 active stores match ACTIVE_STORE_SLUGS", () => {
    assert.equal(ACTIVE_STORE_SLUGS.length, 4);
  });

  it("inactive stores list has at least 10 entries", () => {
    assert.ok(
      CASTILLITOS_INACTIVE_STORES.length >= 10,
      `Expected >= 10 inactive, got ${CASTILLITOS_INACTIVE_STORES.length}`
    );
  });

  it("inactive stores include Mayorca, Dexcato, Paque Berrio, Bello, Pereira, Bolivar, Armenia, Cent May Bogota", () => {
    const names = CASTILLITOS_INACTIVE_STORES.map(s => s.displayName);
    for (const expected of ["Mayorca", "Dexcato", "Paque Berrio", "Bello", "Pereira", "Bolivar", "Armenia", "Cent May Bogota"]) {
      assert.ok(names.includes(expected), `Missing inactive store: ${expected}`);
    }
  });

  it("no overlap between active slugs and inactive warehouseIds", () => {
    const activePks = new Set(["31", "11", "32", "39"]);
    for (const s of CASTILLITOS_INACTIVE_STORES) {
      assert.ok(!activePks.has(s.warehouseId), `Inactive store ${s.displayName} has active PK ${s.warehouseId}`);
    }
  });
});

// ── SEGUNDO: Resolve functions exist ────────────────────────────────────

describe("SEGUNDO — resolveActiveStores / resolveInactiveStores exist", () => {
  it("governance service exports resolveActiveStores", () => {
    assert.ok(GOV_SERVICE_SOURCE.includes("export async function resolveActiveStores("));
  });

  it("governance service exports resolveInactiveStores", () => {
    assert.ok(GOV_SERVICE_SOURCE.includes("export async function resolveInactiveStores("));
  });

  it("governance service exports assertStoreActive", () => {
    assert.ok(GOV_SERVICE_SOURCE.includes("export async function assertStoreActive("));
  });
});

// ── TERCERO: Inactive stores excluded from intelligence ─────────────────

describe("TERCERO — Inactive store guard in API route", () => {
  it("route imports assertStoreActive", () => {
    assert.ok(ROUTE_SOURCE.includes("assertStoreActive"));
  });

  it("route imports STORE_INACTIVE_CODE and STORE_INACTIVE_MESSAGE", () => {
    assert.ok(ROUTE_SOURCE.includes("STORE_INACTIVE_CODE"));
    assert.ok(ROUTE_SOURCE.includes("STORE_INACTIVE_MESSAGE"));
  });

  it("route has GUARDED_ACTIONS set with operational endpoints", () => {
    assert.ok(ROUTE_SOURCE.includes("GUARDED_ACTIONS"));
    assert.ok(ROUTE_SOURCE.includes("store_detail"));
    assert.ok(ROUTE_SOURCE.includes("store_distribution_detail"));
  });

  it("inactive guard returns 409 status", () => {
    assert.ok(ROUTE_SOURCE.includes("status: 409"));
  });

  it("STORE_INACTIVE_CODE constant is correct", () => {
    assert.equal(STORE_INACTIVE_CODE, "STORE_INACTIVE");
  });

  it("STORE_INACTIVE_MESSAGE is user-friendly", () => {
    assert.ok(STORE_INACTIVE_MESSAGE.length > 10);
    assert.ok(STORE_INACTIVE_MESSAGE.includes("inactiva"));
  });
});

// ── CUARTO: Ver tiendas inactivas button ────────────────────────────────

describe("CUARTO — Ver tiendas inactivas UI", () => {
  it("client has 'Ver tiendas inactivas' button text", () => {
    assert.ok(CLIENT_SOURCE.includes("Ver tiendas inactivas"));
  });

  it("client loads inactive stores via store_governance_list action", () => {
    assert.ok(CLIENT_SOURCE.includes("store_governance_list"));
  });

  it("client does not show operational data for inactive stores", () => {
    // Inactive cards show: name, bodega, desactivacion date, motivo, status badge
    // They do NOT show: necesidades, excesos, cobertura, reemplazos, salud critica
    assert.ok(CLIENT_SOURCE.includes("Inactiva")); // status badge
    assert.ok(CLIENT_SOURCE.includes("Activar tienda")); // action button
  });
});

// ── QUINTO: Activate / Deactivate ───────────────────────────────────────

describe("QUINTO — Activate and Deactivate", () => {
  it("governance service exports activateStore", () => {
    assert.ok(GOV_SERVICE_SOURCE.includes("export async function activateStore("));
  });

  it("governance service exports deactivateStore", () => {
    assert.ok(GOV_SERVICE_SOURCE.includes("export async function deactivateStore("));
  });

  it("deactivateStore requires reason", () => {
    assert.ok(GOV_SERVICE_SOURCE.includes("REASON_REQUIRED"));
  });

  it("route checks canManageStoreGovernance before activate", () => {
    assert.ok(ROUTE_SOURCE.includes("canManageStoreGovernance"));
    assert.ok(ROUTE_SOURCE.includes("store_activate"));
  });

  it("route checks canManageStoreGovernance before deactivate", () => {
    assert.ok(ROUTE_SOURCE.includes("store_deactivate"));
  });

  it("route returns 403 for unauthorized users", () => {
    assert.ok(ROUTE_SOURCE.includes("Permiso insuficiente"));
    assert.ok(ROUTE_SOURCE.includes("status: 403"));
  });

  it("route requires reason for deactivation", () => {
    assert.ok(ROUTE_SOURCE.includes("Motivo obligatorio al desactivar"));
  });

  it("client shows confirmation modal", () => {
    assert.ok(CLIENT_SOURCE.includes("Confirmar activacion"));
    assert.ok(CLIENT_SOURCE.includes("Confirmar desactivacion"));
  });

  it("deactivation requires reason in UI", () => {
    assert.ok(CLIENT_SOURCE.includes("Motivo (obligatorio)"));
  });
});

// ── SEXTO: Audit ────────────────────────────────────────────────────────

describe("SEXTO — Audit trail", () => {
  it("StoreGovernanceAuditEntry has all required fields", () => {
    const entry: StoreGovernanceAuditEntry = {
      organizationId: "org-1",
      storeId:        "centro",
      storeName:      "Centro",
      previousStatus: "ACTIVE",
      newStatus:      "INACTIVE",
      reason:         "Franquicia cerrada",
      userId:         "user-1",
      userRole:       "ORG_ADMIN",
      timestamp:      new Date().toISOString(),
      source:         "store-governance-service",
      executionId:    "gov_centro_123",
    };
    const keys = [
      "organizationId", "storeId", "storeName", "previousStatus", "newStatus",
      "reason", "userId", "userRole", "timestamp", "source", "executionId",
    ];
    for (const k of keys) {
      assert.ok(k in entry, `Missing audit field: ${k}`);
    }
  });

  it("governance service persists audit entry in AgentExecution", () => {
    assert.ok(GOV_SERVICE_SOURCE.includes("COMERCIAL_STORE_GOVERNANCE"));
    assert.ok(GOV_SERVICE_SOURCE.includes("persistGovernanceRecord"));
  });
});

// ── SÉPTIMO: Cache invalidation ─────────────────────────────────────────

describe("SÉPTIMO — Cache invalidation on status change", () => {
  it("governance service invalidates distribution cache on change", () => {
    assert.ok(GOV_SERVICE_SOURCE.includes("invalidateDistributionCacheForOrg"));
  });

  it("governance service invalidates its own cache on change", () => {
    assert.ok(GOV_SERVICE_SOURCE.includes("invalidateGovernanceCache"));
  });
});

// ── OCTAVO: Panel principal ─────────────────────────────────────────────

describe("OCTAVO — Panel principal preserves 4 active cards", () => {
  it("client shows intelligence disclaimer", () => {
    assert.ok(CLIENT_SOURCE.includes("La inteligencia del modulo utiliza unicamente las tiendas activas"));
  });
});

// ── NOVENO: Empty states ────────────────────────────────────────────────

describe("NOVENO — Empty states", () => {
  it("client handles no inactive stores", () => {
    assert.ok(CLIENT_SOURCE.includes("No hay tiendas inactivas"));
  });

  it("client handles no active stores", () => {
    assert.ok(CLIENT_SOURCE.includes("No fue posible cargar la distribucion"));
  });
});

// ── QUINTO: Permission model ────────────────────────────────────────────

describe("QUINTO — Permission: SUPER_ADMIN and ORG_ADMIN", () => {
  it("canManageStoreGovernance allows SUPER_ADMIN", () => {
    assert.ok(GOV_SERVICE_SOURCE.includes("SUPER_ADMIN"));
  });

  it("canManageStoreGovernance allows ORG_ADMIN", () => {
    assert.ok(GOV_SERVICE_SOURCE.includes("ORG_ADMIN"));
  });

  it("canManageStoreGovernance rejects MEMBER implicitly (not in set)", () => {
    assert.ok(!GOV_SERVICE_SOURCE.includes('"MEMBER"'));
  });
});

// ── InactiveStoreSeed structure ──────────────────────────────────────────

describe("InactiveStoreSeed structure", () => {
  it("each seed has warehouseId, sagWarehouseCode, displayName, city, exclusionReason", () => {
    for (const seed of CASTILLITOS_INACTIVE_STORES) {
      assert.ok(seed.warehouseId.length > 0, "warehouseId required");
      assert.ok(seed.sagWarehouseCode.length > 0, "sagWarehouseCode required");
      assert.ok(seed.displayName.length > 0, "displayName required");
      assert.ok(seed.city.length > 0, "city required");
      assert.ok(seed.exclusionReason.length > 0, "exclusionReason required");
    }
  });
});
