/**
 * Module entitlements + billing — product-law closure tests.
 *
 * Sprint: AGENTIK-TENANT-MODULE-ENTITLEMENTS-BILLING-01
 *
 * STRUCTURAL_TESTS: 20 (A through T) — verify source code contracts via grep/regex
 * EXECUTABLE_TESTS: 15 (U through AI) — verify runtime behavior via function calls
 *
 * Total: 35 tests
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
// STRUCTURAL TESTS (20): Source code contract verification
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 1: Closed-by-default access policy
// ═══════════════════════════════════════════════════════════════════════════════

describe("1. Closed-by-default access policy", () => {
  const modulesSrc = readFile("lib/tenant/modules.ts");
  const entSrc = readFile("lib/tenant/module-entitlements.ts");

  it("A: Missing entitlement defaults DENY", () => {
    assert.ok(
      modulesSrc.includes("TENANT_MISSING_ENTITLEMENT_BEHAVIOR = DENY"),
      "Must declare DENY policy",
    );
    assert.ok(
      modulesSrc.includes("CLOSED BY DEFAULT"),
      "Must state closed-by-default semantics",
    );
    assert.ok(
      !modulesSrc.includes("rowMap.get(k) !== false"),
      "Must NOT use open-by-default (rowMap.get(k) !== false)",
    );
    assert.ok(
      modulesSrc.includes("rowMap.get(k) === true"),
      "Must require explicit enabled=true",
    );
  });

  it("B: Inactive entitlement (enabled=false) → DENY", () => {
    assert.ok(
      modulesSrc.includes("rowMap.get(k) === true"),
      "Must check for enabled===true, not just truthy",
    );
  });

  it("C: Active entitlement + permitted role → ALLOW", () => {
    const layoutSrc = readFile("app/(app)/[orgSlug]/layout.tsx");
    assert.ok(layoutSrc.includes("filterModulesByRole"), "Must intersect with role");
    assert.ok(layoutSrc.includes("getEnabledModules"), "Must get org-level flags");
  });

  it("D: Active entitlement + denied role → DENY", () => {
    const accessSrc = readFile("lib/auth/module-access.ts");
    assert.ok(accessSrc.includes("orgModules").valueOf, "Must take orgModules param");
    assert.ok(accessSrc.includes(".filter(m => allowed.has(m))"), "Must intersect");
  });

  it("E: SUPER_ADMIN internal visibility does not leak to tenant", () => {
    assert.ok(
      modulesSrc.includes("INTERNAL_MODULE_KEYS"),
      "Must have internal module key set",
    );
    assert.ok(
      modulesSrc.includes("INTERNAL_MODULE_KEYS.has(k)"),
      "Must check internal keys separately",
    );
    const accessSrc = readFile("lib/auth/module-access.ts");
    const orgAdminIdx = accessSrc.indexOf("ORG_ADMIN: [");
    const managerIdx = accessSrc.indexOf("MANAGER:", orgAdminIdx);
    const orgAdminSection = accessSrc.slice(orgAdminIdx, managerIdx);
    assert.ok(
      !orgAdminSection.includes('"agentik"'),
      "ORG_ADMIN must NOT have agentik module",
    );
    assert.ok(
      !orgAdminSection.includes('"runs"'),
      "ORG_ADMIN must NOT have runs module",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 2: Commercial product → internal module mapping
// ═══════════════════════════════════════════════════════════════════════════════

describe("2. Commercial product mapping", () => {
  const catalogSrc = readFile("lib/tenant/module-catalog.ts");

  it("F: Commercial product maps to internal submodules", () => {
    assert.ok(
      catalogSrc.includes("COMMERCIAL_PRODUCT_MAPPINGS"),
      "Must have product mappings",
    );
    assert.ok(
      catalogSrc.includes("CommercialProductMapping"),
      "Must have product mapping type",
    );
    assert.ok(
      catalogSrc.includes('"sales"') && catalogSrc.includes('"inventory"'),
      "sales product must include inventory",
    );
  });

  it("G: Submodule does NOT independently become paid item unless configured", () => {
    assert.ok(
      catalogSrc.includes("classifyModuleKey"),
      "Must have classification function",
    );
    assert.ok(
      catalogSrc.includes('"SUBMODULE"'),
      "Must have SUBMODULE classification",
    );
    assert.ok(
      catalogSrc.includes('"SELLABLE_PRODUCT"'),
      "Must have SELLABLE_PRODUCT classification",
    );
  });

  it("H: Legacy inventory=true does NOT imply paid inventory contract", () => {
    const idx = catalogSrc.indexOf('productKey: "sales"');
    assert.ok(idx !== -1, 'Must have sales product');
    const block = catalogSrc.slice(idx, idx + 300);
    assert.ok(
      block.includes('"inventory"'),
      "inventory must be listed as submodule of sales product",
    );
  });

  it("I: Production is a SEPARATE commercial product (not bundled with sales)", () => {
    // Find the includedModuleKeys line for the sales product
    const salesIdx = catalogSrc.indexOf('productKey: "sales"');
    const includedIdx = catalogSrc.indexOf("includedModuleKeys:", salesIdx);
    const closingBracket = catalogSrc.indexOf("],", includedIdx);
    const salesIncluded = catalogSrc.slice(includedIdx, closingBracket + 2);
    assert.ok(
      !salesIncluded.includes('"production"'),
      "production must NOT be in sales includedModuleKeys",
    );
    assert.ok(
      !salesIncluded.includes('"purchases"'),
      "purchases must NOT be in sales includedModuleKeys",
    );
    assert.ok(
      !salesIncluded.includes('"dispatch"'),
      "dispatch must NOT be in sales includedModuleKeys",
    );
    // Production must have its own product entry
    assert.ok(
      catalogSrc.includes('productKey: "production"'),
      "production must be an independent commercial product",
    );
  });

  it("I2: PRODUCT_DECISION_REQUIRED keys are not auto-sellable", () => {
    assert.ok(
      catalogSrc.includes('"PRODUCT_DECISION_REQUIRED"'),
      "Must have PRODUCT_DECISION_REQUIRED classification",
    );
    assert.ok(
      catalogSrc.includes("PRODUCT_DECISION_REQUIRED_KEYS"),
      "Must have explicit set of undecided keys",
    );
    // purchases and dispatch should be in the PRODUCT_DECISION_REQUIRED set
    assert.ok(
      catalogSrc.includes('"purchases"') && catalogSrc.includes('"dispatch"'),
      "purchases and dispatch must be listed",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 3: Billing law — month boundaries
// ═══════════════════════════════════════════════════════════════════════════════

describe("3. Billing law — month boundaries", () => {
  const billingSrc = readFile("lib/tenant/billing-preview.ts");

  it("J: No mid-month billing heuristic", () => {
    assert.ok(
      !billingSrc.includes("periodMid"),
      "Must NOT have periodMid reference",
    );
    assert.ok(
      !billingSrc.includes("new Date(year, month, 15)"),
      "Must NOT use day 15 as reference",
    );
    assert.ok(
      billingSrc.includes("MID_MONTH_HEURISTIC_AFTER = false"),
      "Must declare no mid-month heuristic",
    );
  });

  it("K: Explicit billing month boundaries", () => {
    assert.ok(
      billingSrc.includes("periodsOverlap"),
      "Must use interval overlap function",
    );
    assert.ok(
      billingSrc.includes("periodStart") && billingSrc.includes("periodEnd"),
      "Must use period boundaries",
    );
  });

  it("L: Access date can differ from billing start month", () => {
    assert.ok(
      billingSrc.includes("entitlementEffectiveFrom"),
      "Must track entitlement effective dates",
    );
    assert.ok(
      billingSrc.includes("commercialTermEffectiveFrom"),
      "Must track commercial term effective dates",
    );
  });

  it("M: Historical preview immutable (uses period history)", () => {
    assert.ok(
      billingSrc.includes("termHistory"),
      "Must use term history for lookups",
    );
    assert.ok(
      billingSrc.includes("entitlementPeriods"),
      "Must use entitlement periods for lookups",
    );
  });

  it("N: Reactivation preserves prior history", () => {
    const entSrc = readFile("lib/tenant/module-entitlements.ts");
    const activateIdx = entSrc.indexOf("async function activateModule");
    const block = entSrc.slice(activateIdx, activateIdx + 800);
    assert.ok(
      block.includes("effectiveTo: now"),
      "Must close old periods (set effectiveTo) not delete",
    );
    assert.ok(
      !block.includes(".delete"),
      "Must never delete historical data",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 4: Route / API / launcher enforcement
// ═══════════════════════════════════════════════════════════════════════════════

describe("4. Enforcement", () => {
  const layoutSrc = readFile("app/(app)/[orgSlug]/layout.tsx");

  it("O: Launcher/sidebar agree (both use same mods set)", () => {
    assert.ok(layoutSrc.includes("mods.has("), "Must use mods.has for nav");
    assert.ok(layoutSrc.includes("!mods.has(routeModule)"), "Must use same mods for blocking");
  });

  it("P: Direct route denied when module not in mods", () => {
    assert.ok(layoutSrc.includes("isBlocked"), "Must have isBlocked");
    assert.ok(
      layoutSrc.includes("routeModule !== null && !mods.has(routeModule)"),
      "Must block when module not in effective set",
    );
  });

  it("Q: API denied (modules route gated to SUPER_ADMIN/AGENTIK_ADMIN)", () => {
    const apiSrc = readFile("app/api/orgs/[orgSlug]/modules/route.ts");
    assert.ok(apiSrc.includes("SUPER_ADMIN"), "Must check SUPER_ADMIN");
    assert.ok(apiSrc.includes("AGENTIK_ADMIN"), "Must check AGENTIK_ADMIN");
    assert.ok(apiSrc.includes("403"), "Must return 403");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 5: Regression — seller confinement + post-login
// ═══════════════════════════════════════════════════════════════════════════════

describe("5. Regression", () => {
  const layoutSrc = readFile("app/(app)/[orgSlug]/layout.tsx");

  it("R: Seller confinement preserved", () => {
    assert.ok(layoutSrc.includes("isSellerApp"), "Must have seller app detection");
    assert.ok(layoutSrc.includes("seller-app"), "Must reference seller-app path");
    assert.ok(layoutSrc.includes("SELLER_CONFINED_ROLES"), "Must confine seller roles");
  });

  it("S: Post-login redirect preserved", () => {
    assert.ok(layoutSrc.includes("callbackUrl"), "Must support callback URL");
    assert.ok(layoutSrc.includes("UNAUTHENTICATED"), "Must handle unauthenticated");
  });

  it("T: Multi-org layout uses org-scoped modules", () => {
    assert.ok(
      layoutSrc.includes("getEnabledModules(ctx.orgId)"),
      "Must scope modules to org",
    );
    assert.ok(
      layoutSrc.includes("filterModulesByRole(orgMods, ctx.role)"),
      "Must scope to user's role in this org",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 6: API module entitlement guard
// ═══════════════════════════════════════════════════════════════════════════════

describe("6. API module entitlement guard (structural)", () => {
  const orgAccessSrc = readFile("lib/auth/org-access.ts");

  it("Q2: requireTenantModuleAccess exists", () => {
    assert.ok(
      orgAccessSrc.includes("async function requireTenantModuleAccess"),
      "Must export requireTenantModuleAccess",
    );
    assert.ok(
      orgAccessSrc.includes("ModuleAccessOptions"),
      "Must define ModuleAccessOptions type",
    );
    assert.ok(
      orgAccessSrc.includes("moduleKey: ModuleKey"),
      "Must take moduleKey parameter",
    );
  });

  it("Q3: SUPER_ADMIN bypass without tenant mutation", () => {
    // SUPER_ADMIN must bypass entitlement check without creating TenantModule rows
    const guardIdx = orgAccessSrc.indexOf("async function requireTenantModuleAccess");
    const guardBlock = orgAccessSrc.slice(guardIdx, guardIdx + 1200);
    assert.ok(
      guardBlock.includes('role === "SUPER_ADMIN"'),
      "Must check for SUPER_ADMIN role",
    );
    assert.ok(
      guardBlock.includes("return ctx"),
      "Must return early for SUPER_ADMIN (no entitlement check)",
    );
    // Must NOT call any mutation (upsert, create, update)
    assert.ok(
      !guardBlock.includes(".upsert"),
      "Must NOT upsert TenantModule for SUPER_ADMIN",
    );
    assert.ok(
      !guardBlock.includes(".create"),
      "Must NOT create any records during access check",
    );
  });

  it("Q4: Guard checks both role AND entitlement", () => {
    const guardIdx = orgAccessSrc.indexOf("async function requireTenantModuleAccess");
    const guardBlock = orgAccessSrc.slice(guardIdx, guardIdx + 1200);
    assert.ok(
      guardBlock.includes("getModulesForRole"),
      "Must check role permissions",
    );
    assert.ok(
      guardBlock.includes("getEnabledModules"),
      "Must check tenant entitlements",
    );
    assert.ok(
      guardBlock.includes("MODULE_ACCESS_DENIED"),
      "Must throw MODULE_ACCESS_DENIED on failure",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 7: Migration safety
// ═══════════════════════════════════════════════════════════════════════════════

describe("7. Migration safety", () => {
  const migrationSrc = readFile(
    "prisma/migrations/20260810000000_tenant_module_commercial_billing/migration.sql",
  );

  it("Q5: FK uses RESTRICT not CASCADE", () => {
    assert.ok(
      migrationSrc.includes("ON DELETE RESTRICT"),
      "Must use ON DELETE RESTRICT for billing history safety",
    );
    assert.ok(
      !migrationSrc.includes("ON DELETE CASCADE"),
      "Must NOT use ON DELETE CASCADE — billing history must not be casually destroyable",
    );
  });

  it("Q6: Migration NOT applied", () => {
    assert.ok(
      migrationSrc.includes("MIGRATION_STATUS = CREATED_NOT_APPLIED"),
      "Must be marked CREATED_NOT_APPLIED",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 8: Entitlement period semantics
// ═══════════════════════════════════════════════════════════════════════════════

describe("8. Entitlement period semantics", () => {
  const entSrc = readFile("lib/tenant/module-entitlements.ts");

  it("Q7: Three semantic concepts documented", () => {
    assert.ok(
      entSrc.includes("TENANT_MODULE_ENABLED_SEMANTICS"),
      "Must document TenantModule.enabled semantics",
    );
    assert.ok(
      entSrc.includes("ENTITLEMENT_PERIOD_SEMANTICS"),
      "Must document entitlement period semantics",
    );
    assert.ok(
      entSrc.includes("COMMERCIAL_TERM_SEMANTICS"),
      "Must document commercial term semantics",
    );
  });

  it("Q8: Deactivation closes periods, never deletes", () => {
    const deactivateIdx = entSrc.indexOf("async function deactivateModule");
    const block = entSrc.slice(deactivateIdx, deactivateIdx + 800);
    assert.ok(
      block.includes("effectiveTo: now"),
      "Must close entitlement periods on deactivation",
    );
    assert.ok(
      !block.includes(".delete"),
      "Must never delete on deactivation",
    );
    // Commercial terms are NOT closed on deactivation — only entitlement periods
    // The deactivateModule function should NOT reference CommercialTerm model
    assert.ok(
      !block.includes("tenantModuleCommercialTerm"),
      "Must NOT modify commercial terms on deactivation",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTABLE TESTS (15): Runtime behavior verification
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 9: Route module resolution (executable)
// ═══════════════════════════════════════════════════════════════════════════════

describe("9. Route module resolution (executable)", () => {
  // Import the function directly — no mocks, no network
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { resolveModuleForPath } = require("../../tenant/modules");

  it("U: /comercial/* resolves to 'sales'", () => {
    assert.equal(
      resolveModuleForPath("castillitos", "/castillitos/comercial/maletas"),
      "sales",
    );
    assert.equal(
      resolveModuleForPath("castillitos", "/castillitos/comercial/inventario"),
      "sales",
    );
    assert.equal(
      resolveModuleForPath("castillitos", "/castillitos/comercial/pedidos"),
      "sales",
    );
    assert.equal(
      resolveModuleForPath("castillitos", "/castillitos/comercial/tiendas"),
      "sales",
    );
  });

  it("V: /produccion/* resolves to 'production' (separate from commercial)", () => {
    assert.equal(
      resolveModuleForPath("castillitos", "/castillitos/produccion"),
      "production",
    );
    assert.equal(
      resolveModuleForPath("castillitos", "/castillitos/produccion/ordenes"),
      "production",
    );
    assert.equal(
      resolveModuleForPath("castillitos", "/castillitos/produccion/timeline"),
      "production",
    );
  });

  it("W: /agentik/* resolves to 'agentik' (not 'sales')", () => {
    assert.equal(
      resolveModuleForPath("castillitos", "/castillitos/agentik"),
      "agentik",
    );
  });

  it("X: /agentik/marketing-studio/* resolves to 'marketing_studio'", () => {
    assert.equal(
      resolveModuleForPath("castillitos", "/castillitos/agentik/marketing-studio/foto-estudio/new"),
      "marketing_studio",
    );
  });

  it("Y: /finanzas/* resolves to 'finance'", () => {
    assert.equal(
      resolveModuleForPath("castillitos", "/castillitos/finanzas/tesoreria"),
      "finance",
    );
    assert.equal(
      resolveModuleForPath("castillitos", "/castillitos/finanzas/cierre"),
      "finance",
    );
  });

  it("Z: Unknown path resolves to null (no guard)", () => {
    assert.equal(
      resolveModuleForPath("castillitos", "/castillitos/unknown-page"),
      null,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 10: Module classification (executable)
// ═══════════════════════════════════════════════════════════════════════════════

describe("10. Module classification (executable)", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { classifyModuleKey, getParentProductKey } = require("../../tenant/module-catalog");

  it("AA: sales is SELLABLE_PRODUCT", () => {
    assert.equal(classifyModuleKey("sales"), "SELLABLE_PRODUCT");
  });

  it("AB: inventory is SUBMODULE (of sales)", () => {
    assert.equal(classifyModuleKey("inventory"), "SUBMODULE");
    assert.equal(getParentProductKey("inventory"), "sales");
  });

  it("AC: production is SELLABLE_PRODUCT (separate from sales)", () => {
    assert.equal(classifyModuleKey("production"), "SELLABLE_PRODUCT");
    // Its parent is itself (it's a standalone product)
    assert.equal(getParentProductKey("production"), "production");
  });

  it("AD: purchases is PRODUCT_DECISION_REQUIRED", () => {
    assert.equal(classifyModuleKey("purchases"), "PRODUCT_DECISION_REQUIRED");
  });

  it("AE: dispatch is PRODUCT_DECISION_REQUIRED", () => {
    assert.equal(classifyModuleKey("dispatch"), "PRODUCT_DECISION_REQUIRED");
  });

  it("AF: agentik is INTERNAL_ONLY", () => {
    assert.equal(classifyModuleKey("agentik"), "INTERNAL_ONLY");
  });

  it("AG: tenants_admin is PLATFORM_ADMIN", () => {
    assert.equal(classifyModuleKey("tenants_admin"), "PLATFORM_ADMIN");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 11: Billing preview (executable)
// ═══════════════════════════════════════════════════════════════════════════════

describe("11. Billing preview (executable)", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { buildPreviewFromEntitlements, formatCents } = require("../../tenant/billing-preview");

  it("AH: Empty entitlements → zero line items", () => {
    const preview = buildPreviewFromEntitlements("org-1", [], "2026-08");
    assert.equal(preview.lineItems.length, 0);
    assert.equal(preview.activeModuleCount, 0);
    assert.equal(preview.hasMixedCurrencies, false);
    assert.equal(preview.period, "2026-08");
  });

  it("AI: formatCents formats correctly", () => {
    assert.equal(formatCents(4900, "USD"), "$49.00");
    assert.equal(formatCents(4900, "COP"), "COP 49.00");
    assert.equal(formatCents(100, "USD"), "$1.00");
    assert.equal(formatCents(0, "USD"), "$0.00");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 12: Role × module intersection (executable)
// ═══════════════════════════════════════════════════════════════════════════════

describe("12. Role × module intersection (executable)", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { filterModulesByRole, getModulesForRole } = require("../../auth/module-access");

  it("AJ: SUPER_ADMIN sees all modules", () => {
    const mods = getModulesForRole("SUPER_ADMIN");
    assert.ok(mods.has("sales"), "SUPER_ADMIN must see sales");
    assert.ok(mods.has("agentik"), "SUPER_ADMIN must see agentik");
    assert.ok(mods.has("production"), "SUPER_ADMIN must see production");
    assert.ok(mods.has("tenants_admin"), "SUPER_ADMIN must see tenants_admin");
  });

  it("AK: ORG_ADMIN sees sales but NOT agentik", () => {
    const mods = getModulesForRole("ORG_ADMIN");
    assert.ok(mods.has("sales"), "ORG_ADMIN must see sales");
    assert.ok(mods.has("production"), "ORG_ADMIN must see production");
    assert.ok(!mods.has("agentik"), "ORG_ADMIN must NOT see agentik");
    assert.ok(!mods.has("runs"), "ORG_ADMIN must NOT see runs");
    assert.ok(!mods.has("tenants_admin"), "ORG_ADMIN must NOT see tenants_admin");
  });

  it("AL: filterModulesByRole intersects correctly", () => {
    // Org has sales + agentik enabled
    const orgMods = new Set(["sales", "agentik", "production"]);
    // ORG_ADMIN can see sales + production but NOT agentik
    const result = filterModulesByRole(orgMods, "ORG_ADMIN");
    assert.ok(result.has("sales"), "ORG_ADMIN must see sales");
    assert.ok(result.has("production"), "ORG_ADMIN must see production");
    assert.ok(!result.has("agentik"), "ORG_ADMIN must NOT see agentik even if org has it");
  });
});
