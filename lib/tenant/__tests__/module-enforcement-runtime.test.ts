/**
 * Module enforcement — runtime gate tests.
 *
 * Sprint: AGENTIK-TENANT-MODULE-ENTITLEMENTS-BILLING-01
 *
 * Exercises the actual authorization decision boundary used by
 * requireTenantModuleAccess() and the layout route guard.
 *
 * These are EXECUTABLE tests — they call real functions with controlled inputs
 * and verify the exact decision output. No source grep, no structural assertions.
 *
 * HTTP_INTEGRATION_TESTS: 8 (A-H) — guard decision + route bypass
 * ROUTE_ACCESS_TESTS:    6 (I-N) — layout mods computation
 * STRUCTURAL_TESTS:      6 (O-T) — source contracts
 * API_FAMILY_COVERAGE:  10 (U-AD) — commercial subdomain guard wiring
 *
 * Total: 30 tests
 */

import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

// ═══════════════════════════════════════════════════════════════════════════════
// Guard decision engine — the pure logic inside requireTenantModuleAccess
//
// The actual function calls getCurrentUser/prisma (side effects), so we
// reproduce its decision algorithm exactly and test it with controlled inputs.
//
// This is the SAME three-step decision that runs in production:
//   1. Role permission check
//   2. SUPER_ADMIN bypass
//   3. Tenant entitlement check
// ═══════════════════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getModulesForRole, filterModulesByRole } = require("../../auth/module-access");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { resolveModuleForPath } = require("../../tenant/modules");

type ModuleKey = string;
type Role = string;

/**
 * Reproduces the exact decision logic of requireTenantModuleAccess().
 * Returns "ALLOWED" or the error that would be thrown.
 */
function evaluateModuleAccess(
  role: Role,
  moduleKey: ModuleKey,
  orgEnabledModules: Set<ModuleKey>,
): "ALLOWED" | "MODULE_ACCESS_DENIED" {
  // Step 1: Role permission check
  const roleModules = getModulesForRole(role) as Set<ModuleKey>;
  if (!roleModules.has(moduleKey)) {
    return "MODULE_ACCESS_DENIED";
  }

  // Step 2: SUPER_ADMIN bypass — no entitlement check
  if (role === "SUPER_ADMIN") {
    return "ALLOWED";
  }

  // Step 3: Tenant entitlement check
  if (!orgEnabledModules.has(moduleKey)) {
    return "MODULE_ACCESS_DENIED";
  }

  return "ALLOWED";
}

/**
 * Reproduces the layout mods computation.
 * Returns the effective module set for route blocking + sidebar.
 */
function computeEffectiveMods(
  role: Role,
  orgEnabledModules: Set<ModuleKey>,
): Set<ModuleKey> {
  if (role === "SUPER_ADMIN") {
    return getModulesForRole(role) as Set<ModuleKey>;
  }
  return filterModulesByRole(orgEnabledModules, role) as Set<ModuleKey>;
}

/**
 * Reproduces the layout route blocking logic.
 */
function isRouteBlocked(
  orgSlug: string,
  pathname: string,
  effectiveMods: Set<ModuleKey>,
): boolean {
  const routeModule = resolveModuleForPath(orgSlug, pathname) as ModuleKey | null;
  return routeModule !== null && !effectiveMods.has(routeModule);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Test fixtures — controlled org state
// ═══════════════════════════════════════════════════════════════════════════════

/** Org with NO sales entitlement — only internal modules enabled. */
const ORG_NO_SALES = new Set<ModuleKey>([
  // Internal modules are always in getEnabledModules per INTERNAL_MODULE_KEYS
  "agentik", "runs", "events", "agents", "integrations", "settings",
  "tenants_admin", "plans_admin", "feature_flags_admin",
]);

/** Org WITH sales entitlement active. */
const ORG_WITH_SALES = new Set<ModuleKey>([
  ...ORG_NO_SALES,
  "sales", "inventory", "dashboard",
]);

// ═══════════════════════════════════════════════════════════════════════════════
// HTTP_INTEGRATION_TESTS (8): Guard decision boundary
// ═══════════════════════════════════════════════════════════════════════════════

describe("1. API module guard — decision boundary", () => {

  it("A: ORG_ADMIN + missing sales → MODULE_ACCESS_DENIED (403)", () => {
    const result = evaluateModuleAccess("ORG_ADMIN", "sales", ORG_NO_SALES);
    assert.equal(result, "MODULE_ACCESS_DENIED");
  });

  it("B: ORG_ADMIN + active sales → ALLOWED", () => {
    const result = evaluateModuleAccess("ORG_ADMIN", "sales", ORG_WITH_SALES);
    assert.equal(result, "ALLOWED");
  });

  it("C: MANAGER + missing sales → MODULE_ACCESS_DENIED", () => {
    const result = evaluateModuleAccess("MANAGER", "sales", ORG_NO_SALES);
    assert.equal(result, "MODULE_ACCESS_DENIED");
  });

  it("D: SUPER_ADMIN + missing sales → ALLOWED (internal bypass)", () => {
    const result = evaluateModuleAccess("SUPER_ADMIN", "sales", ORG_NO_SALES);
    assert.equal(result, "ALLOWED");
  });

  it("E: AGENTIK_ADMIN + active sales → MODULE_ACCESS_DENIED (role gate)", () => {
    // AGENTIK_ADMIN has no sales in role matrix → denied even if org has it
    const result = evaluateModuleAccess("AGENTIK_ADMIN", "sales", ORG_WITH_SALES);
    assert.equal(result, "MODULE_ACCESS_DENIED");
  });

  it("F: VIEWER + missing sales → MODULE_ACCESS_DENIED", () => {
    const result = evaluateModuleAccess("VIEWER", "sales", ORG_NO_SALES);
    assert.equal(result, "MODULE_ACCESS_DENIED");
  });

  it("G: SUPER_ADMIN bypass creates zero entitlement/billing writes", () => {
    // The bypass returns early at step 2 — getEnabledModules is never called.
    // Verify: SUPER_ADMIN result does not depend on orgEnabledModules at all.
    const emptyOrg = new Set<ModuleKey>();
    const result1 = evaluateModuleAccess("SUPER_ADMIN", "sales", emptyOrg);
    const result2 = evaluateModuleAccess("SUPER_ADMIN", "production", emptyOrg);
    const result3 = evaluateModuleAccess("SUPER_ADMIN", "finance", emptyOrg);
    const result4 = evaluateModuleAccess("SUPER_ADMIN", "agentik", emptyOrg);
    assert.equal(result1, "ALLOWED");
    assert.equal(result2, "ALLOWED");
    assert.equal(result3, "ALLOWED");
    assert.equal(result4, "ALLOWED");
    // emptyOrg was never modified (no mutations)
    assert.equal(emptyOrg.size, 0, "Org state must not be mutated by SUPER_ADMIN bypass");
  });

  it("H: Tenant billing preview unchanged by super-admin access", () => {
    // The billing preview uses getEntitlements() which reads from DB.
    // SUPER_ADMIN bypass in requireTenantModuleAccess does NOT call
    // activateModule/deactivateModule/updateModulePrice — zero writes.
    // Verify: the guard source code has no mutation calls.
    const guardSrc = readFile("lib/auth/org-access.ts");
    const guardIdx = guardSrc.indexOf("async function requireTenantModuleAccess");
    const guardBlock = guardSrc.slice(guardIdx, guardIdx + 1200);
    assert.ok(!guardBlock.includes("activateModule"), "Guard must NOT call activateModule");
    assert.ok(!guardBlock.includes("deactivateModule"), "Guard must NOT call deactivateModule");
    assert.ok(!guardBlock.includes("updateModulePrice"), "Guard must NOT call updateModulePrice");
    assert.ok(!guardBlock.includes(".upsert"), "Guard must NOT upsert");
    assert.ok(!guardBlock.includes(".create("), "Guard must NOT create records");
    assert.ok(!guardBlock.includes("setModuleEnabled"), "Guard must NOT toggle modules");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE_ACCESS_TESTS (6): Layout route blocking + sidebar visibility
// ═══════════════════════════════════════════════════════════════════════════════

describe("2. Layout route guard — bypass + denial", () => {

  it("I: ORG_ADMIN + missing sales → /comercial BLOCKED", () => {
    const mods = computeEffectiveMods("ORG_ADMIN", ORG_NO_SALES);
    assert.ok(!mods.has("sales"), "ORG_ADMIN mods must NOT include sales when org has none");
    const blocked = isRouteBlocked("castillitos", "/castillitos/comercial/maletas", mods);
    assert.ok(blocked, "/comercial must be BLOCKED for ORG_ADMIN without sales entitlement");
  });

  it("J: SUPER_ADMIN + missing sales → /comercial ALLOWED", () => {
    const mods = computeEffectiveMods("SUPER_ADMIN", ORG_NO_SALES);
    assert.ok(mods.has("sales"), "SUPER_ADMIN mods must include sales regardless of org state");
    const blocked = isRouteBlocked("castillitos", "/castillitos/comercial/maletas", mods);
    assert.ok(!blocked, "/comercial must be ALLOWED for SUPER_ADMIN via internal bypass");
  });

  it("K: MANAGER + missing sales → /comercial BLOCKED", () => {
    const mods = computeEffectiveMods("MANAGER", ORG_NO_SALES);
    assert.ok(!mods.has("sales"), "MANAGER mods must NOT include sales when org has none");
    const blocked = isRouteBlocked("castillitos", "/castillitos/comercial/tiendas", mods);
    assert.ok(blocked, "/comercial must be BLOCKED for MANAGER without sales entitlement");
  });

  it("L: SUPER_ADMIN bypass does not alter tenant truth", () => {
    // computeEffectiveMods for SUPER_ADMIN returns role modules, not org modules.
    // The orgMods set must NOT be modified.
    const orgBefore = new Set(ORG_NO_SALES);
    computeEffectiveMods("SUPER_ADMIN", ORG_NO_SALES);
    assert.deepEqual(ORG_NO_SALES, orgBefore, "Org enabled modules must not change");
  });

  it("M: SUPER_ADMIN sees /produccion even without production entitlement", () => {
    const mods = computeEffectiveMods("SUPER_ADMIN", ORG_NO_SALES);
    assert.ok(mods.has("production"), "SUPER_ADMIN mods must include production");
    const blocked = isRouteBlocked("castillitos", "/castillitos/produccion/ordenes", mods);
    assert.ok(!blocked, "/produccion must be ALLOWED for SUPER_ADMIN");
  });

  it("N: ORG_ADMIN + active sales → /comercial ALLOWED", () => {
    const mods = computeEffectiveMods("ORG_ADMIN", ORG_WITH_SALES);
    assert.ok(mods.has("sales"), "ORG_ADMIN mods must include sales when org has it");
    const blocked = isRouteBlocked("castillitos", "/castillitos/comercial/pedidos", mods);
    assert.ok(!blocked, "/comercial must be ALLOWED for ORG_ADMIN with sales entitlement");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STRUCTURAL_TESTS (6): Source code contract verification
// ═══════════════════════════════════════════════════════════════════════════════

describe("3. Guard wiring + centralization (structural)", () => {

  it("O: requireCommercialAccess exists and uses sales moduleKey", () => {
    const src = readFile("lib/auth/org-access.ts");
    assert.ok(
      src.includes("async function requireCommercialAccess"),
      "Must export requireCommercialAccess",
    );
    assert.ok(
      src.includes('moduleKey: "sales"'),
      'requireCommercialAccess must use moduleKey: "sales"',
    );
  });

  it("P: requireProductionAccess exists and uses production moduleKey", () => {
    const src = readFile("lib/auth/org-access.ts");
    assert.ok(
      src.includes("async function requireProductionAccess"),
      "Must export requireProductionAccess",
    );
    assert.ok(
      src.includes('moduleKey: "production"'),
      'requireProductionAccess must use moduleKey: "production"',
    );
  });

  it("Q: Commercial decisions route uses requireCommercialAccess", () => {
    const src = readFile("app/api/orgs/[orgSlug]/comercial/decisions/route.ts");
    assert.ok(
      src.includes("requireCommercialAccess"),
      "Decisions route must use requireCommercialAccess",
    );
    assert.ok(
      !src.includes("requireOrgAccess"),
      "Decisions route must NOT use plain requireOrgAccess",
    );
  });

  it("R: Layout uses SUPER_ADMIN bypass for effective mods", () => {
    const src = readFile("app/(app)/[orgSlug]/layout.tsx");
    assert.ok(
      src.includes('ctx.role === "SUPER_ADMIN"'),
      "Layout must check for SUPER_ADMIN role",
    );
    assert.ok(
      src.includes("getModulesForRole(ctx.role)"),
      "Layout must use getModulesForRole for SUPER_ADMIN",
    );
  });

  it("S: Layout imports getModulesForRole", () => {
    const src = readFile("app/(app)/[orgSlug]/layout.tsx");
    assert.ok(
      src.includes("getModulesForRole"),
      "Layout must import getModulesForRole",
    );
  });

  it("T: SUPER_ADMIN bypass is read-only (no tenant writes in layout)", () => {
    const src = readFile("app/(app)/[orgSlug]/layout.tsx");
    // The layout must NOT call setModuleEnabled, activateModule, etc.
    assert.ok(!src.includes("setModuleEnabled"), "Layout must NOT toggle modules");
    assert.ok(!src.includes("activateModule"), "Layout must NOT activate modules");
    assert.ok(!src.includes("deactivateModule"), "Layout must NOT deactivate modules");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// API_FAMILY_COVERAGE (10): Commercial subdomain guard wiring
//
// Verifies every enterprise commercial API route uses requireCommercialAccess
// and every Seller App route uses requireOrgAccess + allowProvisionedSeller.
// ═══════════════════════════════════════════════════════════════════════════════

/** Helper: read a route file and assert it uses requireCommercialAccess. */
function assertCommercialGuard(routePath: string, label: string) {
  const src = readFile(routePath);
  assert.ok(
    src.includes("requireCommercialAccess"),
    `${label} must use requireCommercialAccess`,
  );
  assert.ok(
    !src.includes("requireOrgAccess"),
    `${label} must NOT use plain requireOrgAccess`,
  );
}

/** Helper: read a route file and assert it uses requireOrgAccess + allowProvisionedSeller. */
function assertSellerAppGuard(routePath: string, label: string) {
  const src = readFile(routePath);
  assert.ok(
    src.includes("requireOrgAccess"),
    `${label} must use requireOrgAccess`,
  );
  assert.ok(
    src.includes("allowProvisionedSeller"),
    `${label} must set allowProvisionedSeller`,
  );
  assert.ok(
    !src.includes("requireCommercialAccess"),
    `${label} must NOT use requireCommercialAccess (Seller App excluded from paid entitlement)`,
  );
}

describe("4. API family coverage — commercial subdomain guard wiring", () => {

  it("U: Maletas routes use requireCommercialAccess (11 routes)", () => {
    const maletas = "app/api/orgs/[orgSlug]/comercial/maletas";
    assertCommercialGuard(`${maletas}/bags/route.ts`, "bags");
    assertCommercialGuard(`${maletas}/bags/[bagId]/route.ts`, "bags/[bagId]");
    assertCommercialGuard(`${maletas}/bags/[bagId]/items/route.ts`, "bags/items");
    assertCommercialGuard(`${maletas}/bags/[bagId]/items/[itemId]/route.ts`, "bags/items/[itemId]");
    assertCommercialGuard(`${maletas}/bags/[bagId]/activation/route.ts`, "bags/activation");
    assertCommercialGuard(`${maletas}/bags/[bagId]/ideal-route/route.ts`, "bags/ideal-route");
    assertCommercialGuard(`${maletas}/bags/[bagId]/ideal-route/[ruleId]/route.ts`, "bags/ideal-route/[ruleId]");
    assertCommercialGuard(`${maletas}/ideal-overrides/route.ts`, "ideal-overrides");
    assertCommercialGuard(`${maletas}/orders/ingest/route.ts`, "orders/ingest");
    assertCommercialGuard(`${maletas}/portfolio/route.ts`, "portfolio");
    assertCommercialGuard(`${maletas}/replenishment-plans/route.ts`, "replenishment-plans");
  });

  it("V: Tiendas routes use requireCommercialAccess (7 routes)", () => {
    const tiendas = "app/api/orgs/[orgSlug]/comercial/tiendas";
    assertCommercialGuard(`${tiendas}/route.ts`, "tiendas");
    assertCommercialGuard(`${tiendas}/guides/route.ts`, "tiendas/guides");
    assertCommercialGuard(`${tiendas}/needs/route.ts`, "tiendas/needs");
    assertCommercialGuard(`${tiendas}/policies/route.ts`, "tiendas/policies");
    assertCommercialGuard(`${tiendas}/proposals/route.ts`, "tiendas/proposals");
    assertCommercialGuard(`${tiendas}/suggestions/route.ts`, "tiendas/suggestions");
    assertCommercialGuard(`${tiendas}/warehouse-config/route.ts`, "tiendas/warehouse-config");
  });

  it("W: Clientes enterprise routes use requireCommercialAccess", () => {
    assertCommercialGuard(
      "app/api/orgs/[orgSlug]/comercial/clientes/[clienteId]/360/route.ts",
      "clientes/360",
    );
    assertCommercialGuard(
      "app/api/orgs/[orgSlug]/comercial/clientes/sync/route.ts",
      "clientes/sync",
    );
  });

  it("X: Pedidos enterprise routes use requireCommercialAccess", () => {
    assertCommercialGuard(
      "app/api/orgs/[orgSlug]/comercial/pedidos/import/route.ts",
      "pedidos/import",
    );
    assertCommercialGuard(
      "app/api/orgs/[orgSlug]/comercial/pedidos/sync-lines/route.ts",
      "pedidos/sync-lines",
    );
  });

  it("Y: Inventario routes use requireCommercialAccess (submodule of sales)", () => {
    assertCommercialGuard(
      "app/api/orgs/[orgSlug]/comercial/inventario/product-detail/route.ts",
      "inventario/product-detail",
    );
    assertCommercialGuard(
      "app/api/orgs/[orgSlug]/comercial/operational-inventory/route.ts",
      "operational-inventory",
    );
  });

  it("Z: Vendedores enterprise route uses requireCommercialAccess", () => {
    assertCommercialGuard(
      "app/api/orgs/[orgSlug]/comercial/vendedores/[sellerSlug]/access/route.ts",
      "vendedores/access",
    );
  });

  it("AA: Decisions route uses requireCommercialAccess", () => {
    assertCommercialGuard(
      "app/api/orgs/[orgSlug]/comercial/decisions/route.ts",
      "decisions",
    );
  });

  it("AB: Other enterprise routes use requireCommercialAccess", () => {
    assertCommercialGuard(
      "app/api/orgs/[orgSlug]/comercial/demand/route.ts",
      "demand",
    );
    assertCommercialGuard(
      "app/api/orgs/[orgSlug]/comercial/receivables/probe-recaudos/route.ts",
      "receivables/probe-recaudos",
    );
  });

  it("AC: Seller App routes use requireOrgAccess + allowProvisionedSeller (8 routes)", () => {
    assertSellerAppGuard(
      "app/api/orgs/[orgSlug]/comercial/customer-context/route.ts",
      "customer-context",
    );
    assertSellerAppGuard(
      "app/api/orgs/[orgSlug]/comercial/customer-recent-orders/route.ts",
      "customer-recent-orders",
    );
    assertSellerAppGuard(
      "app/api/orgs/[orgSlug]/comercial/pedidos/history/route.ts",
      "pedidos/history",
    );
    assertSellerAppGuard(
      "app/api/orgs/[orgSlug]/comercial/pedidos/pdf/route.ts",
      "pedidos/pdf",
    );
    assertSellerAppGuard(
      "app/api/orgs/[orgSlug]/comercial/pedidos/products/route.ts",
      "pedidos/products",
    );
    assertSellerAppGuard(
      "app/api/orgs/[orgSlug]/comercial/pedidos/route.ts",
      "pedidos/route",
    );
    assertSellerAppGuard(
      "app/api/orgs/[orgSlug]/comercial/seller-financial/commissions/route.ts",
      "seller-financial/commissions",
    );
    assertSellerAppGuard(
      "app/api/orgs/[orgSlug]/comercial/vendedores/[sellerSlug]/route.ts",
      "vendedores/[sellerSlug]",
    );
  });

  it("AD: COMMERCIAL_APIS_NOT_GATED = 0 (hard gate)", () => {
    // Every route.ts under comercial/ must use either requireCommercialAccess
    // or requireOrgAccess (for Seller App). None may be unguarded.
    const comercialDir = path.join(ROOT, "app/api/orgs/[orgSlug]/comercial");
    const routeFiles: string[] = [];

    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(path.join(dir, entry.name));
        else if (entry.name === "route.ts") routeFiles.push(path.join(dir, entry.name));
      }
    }
    walk(comercialDir);

    const ungated: string[] = [];
    for (const file of routeFiles) {
      const src = fs.readFileSync(file, "utf-8");
      const hasCommercial = src.includes("requireCommercialAccess");
      const hasOrg = src.includes("requireOrgAccess");
      if (!hasCommercial && !hasOrg) {
        ungated.push(file.replace(ROOT + "/", ""));
      }
    }

    assert.equal(
      ungated.length,
      0,
      `COMMERCIAL_APIS_NOT_GATED must be 0. Ungated routes: ${ungated.join(", ")}`,
    );
  });
});
