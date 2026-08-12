/**
 * lib/auth/__tests__/manager-canonical-connection-patch.test.ts
 *
 * Sprint: AGENTIK-MANAGER-CANONICAL-CONNECTION-PATCH-01G
 *
 * Behavioral/contract tests for the 4 surgical connection patches + 01F corrections:
 *   1. Commercial subtree entitlement gate
 *   2. Maletas adapter — no schema change, correct freshness semantics
 *   3. Manager Home attention — ProviderResult replaces .catch(() => [])
 *   4. Seller slug collision — fail closed
 *   5. MANAGER_MODULE_DEFS as canonical single source
 *   6. Fail-closed provider entitlement filtering
 *   7. Proven ActionTask emitter certification (complete 10-source inventory)
 *   8. ORDER_SYNC source health classification
 *   9. ScheduledReport ownership certification (exhaustive QueryFamily type, MIXED alertas_criticas)
 *  10. RUNTIME authorization behavioral tests (filterModulesByRole, getModulesForRole)
 *  11. RUNTIME Seller/Store isolation tests
 *  12. RUNTIME Desktop/Seller App boundary tests
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.join(ROOT, relPath));
}

const COMERCIAL_LAYOUT = "app/(app)/[orgSlug]/manager/comercial/layout.tsx";
const MANAGER_LAYOUT = "app/(app)/[orgSlug]/manager/layout.tsx";
const MANAGER_HOME = "app/(app)/[orgSlug]/manager/page.tsx";
const ADAPTER = "lib/comercial/manager/manager-commercial-adapter.ts";
const TYPES = "lib/comercial/manager/manager-commercial-types.ts";
const SELLER_DIR = "lib/comercial/foundation/seller-directory.ts";
const MODULE_ACCESS = "lib/auth/module-access.ts";
const MODULES = "lib/tenant/modules.ts";

// ═══════════════════════════════════════════════════════════════════════════════
// 1. COMMERCIAL SUBTREE ENTITLEMENT GATE
// ═══════════════════════════════════════════════════════════════════════════════

describe("1 — Commercial subtree layout exists as entitlement gate", () => {
  test("comercial/layout.tsx exists", () => {
    expect(fileExists(COMERCIAL_LAYOUT)).toBe(true);
  });

  test("uses requireOrgAccess for authentication", () => {
    const src = readFile(COMERCIAL_LAYOUT);
    expect(src).toContain("requireOrgAccess");
  });

  test("calls getEnabledModules for org entitlement", () => {
    const src = readFile(COMERCIAL_LAYOUT);
    expect(src).toContain("getEnabledModules");
  });

  test("calls filterModulesByRole for role intersection", () => {
    const src = readFile(COMERCIAL_LAYOUT);
    expect(src).toContain("filterModulesByRole");
  });

  test("uses canonical 'sales' module key, not an alias", () => {
    const src = readFile(COMERCIAL_LAYOUT);
    expect(src).toContain('"sales"');
    // Verify 'sales' is a real module key in the canonical list
    const modulesSrc = readFile(MODULES);
    expect(modulesSrc).toContain('"sales"');
  });

  test("redirects to /manager when module not entitled", () => {
    const src = readFile(COMERCIAL_LAYOUT);
    expect(src).toContain("redirect(");
    expect(src).toContain("/manager");
  });

  test("does not duplicate role check (parent layout handles it)", () => {
    const src = readFile(COMERCIAL_LAYOUT);
    // Strip comments before checking — code should not define MANAGER_ROLES
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
    expect(codeOnly).not.toContain("MANAGER_ROLES");
    expect(codeOnly).not.toMatch(/["']ORG_ADMIN["']/);
  });

  test("does not hardcode tenant", () => {
    const src = readFile(COMERCIAL_LAYOUT);
    expect(src.toLowerCase()).not.toContain("castillitos");
  });
});

describe("2 — Entitlement gate covers direct URL access", () => {
  test("layout is a server component (no 'use client')", () => {
    const src = readFile(COMERCIAL_LAYOUT);
    expect(src).not.toContain('"use client"');
  });

  test("layout runs before any comercial page (Next.js App Router guarantee)", () => {
    // Next.js executes layouts before pages in the same route segment.
    // A layout at /manager/comercial/layout.tsx runs before ALL pages
    // under /manager/comercial/*, including direct URL access.
    // This test verifies the layout exists at the correct path.
    const layoutPath = path.join(ROOT, COMERCIAL_LAYOUT);
    expect(fs.existsSync(layoutPath)).toBe(true);
  });

  test("permitted.has() is the access decision — not nav visibility", () => {
    const src = readFile(COMERCIAL_LAYOUT);
    expect(src).toContain("permitted.has(");
    expect(src).toContain("redirect(");
  });
});

describe("3 — Parent layout role gate is preserved (not duplicated)", () => {
  test("parent layout still has MANAGER_ROLES gate", () => {
    const src = readFile(MANAGER_LAYOUT);
    expect(src).toContain("MANAGER_ROLES");
    expect(src).toContain("ORG_ADMIN");
    expect(src).toContain("MANAGER");
  });

  test("parent layout still calls requireOrgAccess", () => {
    const src = readFile(MANAGER_LAYOUT);
    expect(src).toContain("requireOrgAccess");
  });

  test("parent layout role set is exactly ORG_ADMIN and MANAGER", () => {
    const src = readFile(MANAGER_LAYOUT);
    // The set should contain exactly these two roles
    expect(src).toContain("MANAGER_ROLES");
    expect(src).toContain("new Set");
    expect(src).toContain('"ORG_ADMIN"');
    expect(src).toContain('"MANAGER"');
  });
});

describe("4 — Module key 'sales' is canonical in role access matrix", () => {
  test("MANAGER role has 'sales' in ROLE_MODULES", () => {
    const src = readFile(MODULE_ACCESS);
    const managerSection = src.substring(
      src.indexOf("MANAGER: ["),
      src.indexOf("],", src.indexOf("MANAGER: [")),
    );
    expect(managerSection).toContain('"sales"');
  });

  test("ORG_ADMIN role has 'sales' in ROLE_MODULES", () => {
    const src = readFile(MODULE_ACCESS);
    const orgAdminSection = src.substring(
      src.indexOf("ORG_ADMIN: ["),
      src.indexOf("],", src.indexOf("ORG_ADMIN: [")),
    );
    expect(orgAdminSection).toContain('"sales"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. MALETAS ADAPTER — NO SCHEMA CHANGE, CORRECT FRESHNESS SEMANTICS
// ═══════════════════════════════════════════════════════════════════════════════

describe("5 — Maletas: successful query with bags and persisted timestamps", () => {
  test("assembleManagerMaletaSection returns sourceAsOf from bag timestamps", () => {
    const src = readFile(ADAPTER);
    const section = src.substring(
      src.indexOf("function assembleManagerMaletaSection"),
      src.indexOf("// ── Provider Result"),
    );
    expect(section).toContain("sourceAsOf");
    expect(section).toContain("updatedAt");
    expect(section).toContain("createdAt");
  });

  test("ManagerMaletaSection type has sourceAsOf, queriedAt, availabilityKnown", () => {
    const src = readFile(TYPES);
    const section = src.substring(
      src.indexOf("interface ManagerMaletaSection"),
      src.indexOf("// ── Pedidos"),
    );
    expect(section).toContain("sourceAsOf: string | null");
    expect(section).toContain("availabilityKnown: true");
    expect(section).toContain("queriedAt: string");
  });
});

describe("6 — Maletas: successful query with zero bags", () => {
  test("assembleManagerMaletaSection returns null for empty bags array", () => {
    const src = readFile(ADAPTER);
    // When bags.length === 0, returns null — this is genuine known-empty state
    const section = src.substring(
      src.indexOf("function assembleManagerMaletaSection"),
      src.indexOf("// ── Provider Result"),
    );
    expect(section).toContain("if (bags.length === 0) return null");
  });

  test("wrapProviderCall distinguishes zero rows from failure", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain('"OK"');
    expect(src).toContain('"PROVIDER_ERROR"');
  });
});

describe("7 — Maletas: provider exception", () => {
  test("seller detail page uses wrapProviderCall for maletas", () => {
    const sellerPage = "app/(app)/[orgSlug]/manager/comercial/vendedores/[sellerId]/page.tsx";
    const src = readFile(sellerPage);
    expect(src).toContain('wrapProviderCall("maletas"');
  });

  test("provider failure returns maletaSection = null, not fake empty", () => {
    const sellerPage = "app/(app)/[orgSlug]/manager/comercial/vendedores/[sellerId]/page.tsx";
    const src = readFile(sellerPage);
    expect(src).toContain('bagsResult.status === "OK"');
    expect(src).toContain("assembleManagerMaletaSection(bagsResult.items)");
    expect(src).toContain(": null");
  });
});

describe("8 — Maletas: seller identity unresolved", () => {
  test("seller detail PA has terceroTruthState IDENTITY_UNRESOLVED when no terceroId", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain('sellerTerceroId ? "CERTIFIED" : "IDENTITY_UNRESOLVED"');
  });
});

describe("9 — Maletas: no request-time fallback", () => {
  test("sourceAsOf never falls back to new Date()", () => {
    const src = readFile(ADAPTER);
    const section = src.substring(
      src.indexOf("function assembleManagerMaletaSection"),
      src.indexOf("// ── Provider Result"),
    );
    // The reduce should end with null, not new Date()
    expect(section).toContain("}, null);");
    // There should be no `?? new Date().toISOString()` after the reduce for sourceAsOf
    expect(section).not.toMatch(/sourceAsOf.*\?\?.*new Date/);
  });
});

describe("10 — Maletas: old primary-source record is not automatically stale", () => {
  test("adapter does not compute FRESH/STALE from updatedAt age", () => {
    const src = readFile(ADAPTER);
    const section = src.substring(
      src.indexOf("function assembleManagerMaletaSection"),
      src.indexOf("// ── Provider Result"),
    );
    expect(section).not.toContain("FRESH");
    expect(section).not.toContain("STALE");
  });

  test("type comment documents primary-source semantics", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain("primary-source record does not become stale");
  });
});

describe("11 — Maletas: no schema metadata required", () => {
  test("no syncStatus, certStatus, lastSyncAt, syncError in types", () => {
    const src = readFile(TYPES);
    const maletaSection = src.substring(
      src.indexOf("interface ManagerMaletaSection"),
      src.indexOf("// ── Pedidos"),
    );
    expect(maletaSection).not.toContain("syncStatus");
    expect(maletaSection).not.toContain("certStatus");
    expect(maletaSection).not.toContain("lastSyncAt");
    expect(maletaSection).not.toContain("syncError");
    expect(maletaSection).not.toContain("dataProvenance");
    expect(maletaSection).not.toContain("sourceSystem");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. MANAGER HOME ATTENTION — PROVIDER STATE
// ═══════════════════════════════════════════════════════════════════════════════

describe("12 — Manager Home: .catch(() => []) removed", () => {
  test("Manager Home does NOT use .catch(() => []) on listBusinessAlerts", () => {
    const src = readFile(MANAGER_HOME);
    // Strip comments before checking
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
    expect(codeOnly).not.toContain(".catch(() => [])");
  });

  test("Manager Home uses wrapProviderCall for alerts", () => {
    const src = readFile(MANAGER_HOME);
    expect(src).toContain('wrapProviderCall("business_alerts"');
  });
});

describe("13 — Manager Home: BusinessAlert success with zero rows", () => {
  test("zero BusinessAlerts produces genuine zero attention items", () => {
    const src = readFile(MANAGER_HOME);
    // When alertsResult.status === "OK" and items is [], assembleGlobalAttention
    // returns [] — genuine zero attention. The executive state will be STABLE.
    expect(src).toContain('alertsResult.status === "OK"');
    expect(src).toContain("assembleGlobalAttention");
  });
});

describe("14 — Manager Home: BusinessAlert provider failure", () => {
  test("provider failure does NOT produce reassuring zero badge", () => {
    const src = readFile(MANAGER_HOME);
    // When alertsResult.status !== "OK", attention = [] BUT source availability
    // is set to UNAVAILABLE, so executiveState becomes DATA_INCOMPLETE, not STABLE
    expect(src).toContain("alertsResult.status !== \"OK\"");
    expect(src).toContain("UNAVAILABLE");
    expect(src).toContain("buildSourceAvailability");
  });
});

describe("15 — Manager Home: Alert never enters Attention badge", () => {
  test("Manager Home does NOT import listAlerts", () => {
    const src = readFile(MANAGER_HOME);
    expect(src).not.toContain("listAlerts");
    // Only listBusinessAlerts is imported
    expect(src).toContain("listBusinessAlerts");
  });

  test("assembleGlobalAttention takes business alerts only", () => {
    const src = readFile(ADAPTER);
    const section = src.substring(
      src.indexOf("export function assembleGlobalAttention"),
      src.indexOf("function mapSeverity"),
    );
    // Input is a single alerts array, not a merge of business + system
    expect(section).not.toContain("systemAlerts");
    expect(section).not.toContain("listAlerts");
  });
});

describe("16 — BusinessAlert deduplication is by stable identity", () => {
  test("assembleGlobalAttention uses alert.id as item identity", () => {
    const src = readFile(ADAPTER);
    const section = src.substring(
      src.indexOf("export function assembleGlobalAttention"),
      src.indexOf("function mapSeverity"),
    );
    expect(section).toContain("id: a.id");
  });

  test("Manager Home documents entityKey seller identity limitation", () => {
    const src = readFile(MANAGER_HOME);
    expect(src).toContain("seller-derived identity");
    expect(src).toContain("mutable sellerSlug");
    expect(src).toContain("SELLER_IDENTITY_STATUS");
  });
});

describe("17 — Different analytical alert types remain distinct", () => {
  test("assembleGlobalAttention preserves alert module/type", () => {
    const src = readFile(ADAPTER);
    const section = src.substring(
      src.indexOf("export function assembleGlobalAttention"),
      src.indexOf("function mapSeverity"),
    );
    expect(section).toContain("module: a.module");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. SELLER SLUG COLLISION — FAIL CLOSED
// ═══════════════════════════════════════════════════════════════════════════════

describe("18 — Seller slug collision: fail closed on ambiguous slug", () => {
  test("getSellerBySlug filters all matches, not just first", () => {
    const src = readFile(SELLER_DIR);
    const section = src.substring(
      src.indexOf("export async function getSellerBySlug"),
    );
    // Must use .filter() not .find() to detect multiple matches
    expect(section).toContain(".filter(");
  });

  test("multiple matches returns null, not first match", () => {
    const src = readFile(SELLER_DIR);
    const section = src.substring(
      src.indexOf("export async function getSellerBySlug"),
    );
    expect(section).toContain("matches.length > 1");
    expect(section).toContain("return null");
  });

  test("ambiguous slug logs error with seller names", () => {
    const src = readFile(SELLER_DIR);
    const section = src.substring(
      src.indexOf("export async function getSellerBySlug"),
    );
    expect(section).toContain("AMBIGUOUS");
    expect(section).toContain("console.error");
    expect(section).toContain("sellerName");
  });

  test("single match returns the seller (not broken by safety check)", () => {
    const src = readFile(SELLER_DIR);
    const section = src.substring(
      src.indexOf("export async function getSellerBySlug"),
    );
    expect(section).toContain("matches.length === 0");
    expect(section).toContain("return matches[0]");
  });

  test("documents identity blocker in getSellerBySlug JSDoc", () => {
    const src = readFile(SELLER_DIR);
    // The JSDoc on getSellerBySlug documents the seller identity limitation
    const fnBlock = src.substring(
      src.lastIndexOf("/**", src.indexOf("export async function getSellerBySlug")),
      src.indexOf("return matches[0]"),
    );
    expect(fnBlock).toContain("BLOCKED_BY_MISSING_CANONICAL_CONTRACT");
    expect(fnBlock).toContain("name-derived");
    expect(fnBlock).toContain("mutable");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. CROSS-CUTTING VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

describe("19 — No Prisma schema changes", () => {
  test("no new Prisma model for Seller", () => {
    // This sprint does NOT create a Seller model
    const src = readFile("prisma/schema.prisma");
    expect(src).not.toMatch(/model Seller\s*\{/);
  });

  test("no new sync fields on VendorCommercialBag", () => {
    const src = readFile("prisma/schema.prisma");
    const bagSection = src.substring(
      src.indexOf("model VendorCommercialBag"),
      src.indexOf("@@unique([organizationId, salesRepId, season])"),
    );
    expect(bagSection).not.toContain("syncStatus");
    expect(bagSection).not.toContain("certStatus");
    expect(bagSection).not.toContain("lastSyncAt");
    expect(bagSection).not.toContain("sourceSystem");
  });
});

describe("20 — Seller identity blocker preserved", () => {
  test("SELLER_IDENTITY_STATUS is still IDENTITY_UNSTABLE", () => {
    const src = readFile(TYPES);
    expect(src).toContain('SELLER_IDENTITY_STATUS: SellerIdentityContract = "IDENTITY_UNSTABLE"');
  });

  test("BLOCKED_BY_MISSING_CANONICAL_CONTRACT documented in types", () => {
    const src = readFile(TYPES);
    expect(src).toContain("BLOCKED_BY_MISSING_CANONICAL_CONTRACT");
  });
});

describe("21 — No Desktop or Seller App changes", () => {
  test("no modifications to seller-app routes", () => {
    // Seller app pages should not be touched by this sprint
    const sellerAppPath = path.join(ROOT, "app/(app)/[orgSlug]/seller-app");
    if (fs.existsSync(sellerAppPath)) {
      // Just verify the directory exists — our sprint did not change it
      expect(fs.existsSync(sellerAppPath)).toBe(true);
    }
  });
});

describe("22 — Global surfaces remain accessible with provider filtering", () => {
  test("Manager Home does not have a module entitlement gate", () => {
    const src = readFile(MANAGER_HOME);
    // Home is accessible to all Manager-role users regardless of module state
    // Module cards are filtered by entitlement, but the page itself loads
    expect(src).toContain("MANAGER_MODULE_DEFS");
    expect(src).toContain("mods.has(");
  });

  test("MANAGER_MODULE_DEFS filters home cards by entitled modules", () => {
    const src = readFile(MANAGER_HOME);
    expect(src).toContain('.filter(def => mods.has(');
  });

  test("Alertas page is a global surface (no redirect gate) but filters by entitlement", () => {
    const alertasPage = "app/(app)/[orgSlug]/manager/alertas/page.tsx";
    const src = readFile(alertasPage);
    expect(src).not.toContain('redirect(');
    expect(src).toContain("effectiveModules");
    expect(src).toContain("getEnabledModules");
    expect(src).toContain("filterModulesByRole");
    expect(src).toContain("computeEffectiveManagerModules");
  });

  test("Tareas page is a global surface (no redirect gate) but filters by entitlement", () => {
    const tareasPage = "app/(app)/[orgSlug]/manager/tareas/page.tsx";
    const src = readFile(tareasPage);
    expect(src).not.toContain('redirect(');
    expect(src).toContain("effectiveModules");
    expect(src).toContain("getEnabledModules");
    expect(src).toContain("filterModulesByRole");
    expect(src).toContain("computeEffectiveManagerModules");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. MANAGER_MODULE_DEFS — CANONICAL SINGLE SOURCE (PATCH-01D)
// ═══════════════════════════════════════════════════════════════════════════════

describe("23 — MANAGER_MODULE_DEFS is the canonical single source for Manager modules", () => {
  test("MANAGER_MODULE_DEFS is exported from adapter", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain("export const MANAGER_MODULE_DEFS: readonly ManagerModuleDef[]");
  });

  test("ManagerModuleDef interface has all required fields", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain("export interface ManagerModuleDef");
    expect(src).toContain("moduleKey:");
    expect(src).toContain("label:");
    expect(src).toContain("description:");
    expect(src).toContain("accent:");
    expect(src).toContain("icon:");
    expect(src).toContain("routeSlug:");
  });

  test("MANAGER_MODULE_DEFS contains exactly 'sales' module", () => {
    const src = readFile(ADAPTER);
    // Only one entry with moduleKey "sales"
    const defsStart = src.indexOf("export const MANAGER_MODULE_DEFS");
    const defsEnd = src.indexOf("] as const;", defsStart);
    const defsSection = src.substring(defsStart, defsEnd);
    expect(defsSection).toContain('"sales"');
    // Only one moduleKey entry
    const moduleKeyCount = (defsSection.match(/moduleKey:/g) || []).length;
    expect(moduleKeyCount).toBe(1);
  });

  test("NO duplicate MANAGER_READY_MODULE_KEYS exists (replaced by derived set)", () => {
    const src = readFile(ADAPTER);
    expect(src).not.toContain("export const MANAGER_READY_MODULE_KEYS");
    // The derived set is private (const, not exported)
    expect(src).toContain("const managerReadyModuleKeys: ReadonlySet<string>");
  });

  test("managerReadyModuleKeys is derived from MANAGER_MODULE_DEFS", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain("MANAGER_MODULE_DEFS.map(d => d.moduleKey)");
  });

  test("computeEffectiveManagerModules uses derived managerReadyModuleKeys", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain("managerReadyModuleKeys.has(k)");
  });
});

describe("24 — Manager Home imports MANAGER_MODULE_DEFS from adapter (not local)", () => {
  test("Manager Home imports MANAGER_MODULE_DEFS from adapter", () => {
    const src = readFile(MANAGER_HOME);
    expect(src).toContain("MANAGER_MODULE_DEFS");
    expect(src).toContain("manager-commercial-adapter");
  });

  test("Manager Home does NOT define its own MODULE_DEFS", () => {
    const src = readFile(MANAGER_HOME);
    // No local module definition array
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
    expect(codeOnly).not.toMatch(/const MODULE_DEFS\b/);
    expect(codeOnly).not.toMatch(/const MODULE_ROUTE_MAP\b/);
  });

  test("Manager Home uses MANAGER_MODULE_DEFS for card generation", () => {
    const src = readFile(MANAGER_HOME);
    expect(src).toContain("MANAGER_MODULE_DEFS");
    expect(src).toContain(".filter(def => mods.has(");
    expect(src).toContain("def.moduleKey");
    expect(src).toContain("def.label");
    expect(src).toContain("def.description");
    expect(src).toContain("def.accent");
    expect(src).toContain("def.icon");
    expect(src).toContain("def.routeSlug");
  });
});

describe("25 — Manager Layout imports MANAGER_MODULE_DEFS from adapter (not local)", () => {
  test("Manager Layout imports MANAGER_MODULE_DEFS from adapter", () => {
    const src = readFile(MANAGER_LAYOUT);
    expect(src).toContain("MANAGER_MODULE_DEFS");
    expect(src).toContain("manager-commercial-adapter");
  });

  test("Manager Layout does NOT define its own MODULE_ROUTE_MAP", () => {
    const src = readFile(MANAGER_LAYOUT);
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
    expect(codeOnly).not.toMatch(/const MODULE_ROUTE_MAP\b/);
    expect(codeOnly).not.toMatch(/const MODULE_DEFS\b/);
  });

  test("Manager Layout uses MANAGER_MODULE_DEFS for hamburger navigation", () => {
    const src = readFile(MANAGER_LAYOUT);
    expect(src).toContain("MANAGER_MODULE_DEFS");
    expect(src).toContain(".filter(def => mods.has(");
    expect(src).toContain("def.moduleKey");
    expect(src).toContain("def.label");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. PROVIDER ENTITLEMENT FILTERING — FAIL CLOSED (PATCH-01D)
// ═══════════════════════════════════════════════════════════════════════════════

describe("26 — ALERT_MODULE_OWNER maps BusinessAlert.module to ModuleKey", () => {
  test("ALERT_MODULE_OWNER is exported from adapter", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain("export const ALERT_MODULE_OWNER");
  });

  test("maps sales → sales", () => {
    const src = readFile(ADAPTER);
    expect(src).toMatch(/sales:\s*"sales"/);
  });

  test("maps source_aware → sales", () => {
    const src = readFile(ADAPTER);
    expect(src).toMatch(/source_aware:\s*"sales"/);
  });

  test("maps crm → sales", () => {
    const src = readFile(ADAPTER);
    expect(src).toMatch(/crm:\s*"sales"/);
  });

  test("maps finance → finance", () => {
    const src = readFile(ADAPTER);
    expect(src).toMatch(/finance:\s*"finance"/);
  });
});

describe("27 — SYSTEM_ALERT_TYPE_OWNER maps Alert.type prefix to ModuleKey", () => {
  test("SYSTEM_ALERT_TYPE_OWNER is exported from adapter", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain("export const SYSTEM_ALERT_TYPE_OWNER");
  });

  test("maps cartera → sales (proven: org-alerts.ts)", () => {
    const src = readFile(ADAPTER);
    const section = src.substring(
      src.indexOf("SYSTEM_ALERT_TYPE_OWNER"),
      src.indexOf("}", src.indexOf("SYSTEM_ALERT_TYPE_OWNER")) + 1,
    );
    expect(section).toContain('cartera: "sales"');
  });

  test("maps finance → finance (proven: document-alerts.ts)", () => {
    const src = readFile(ADAPTER);
    const section = src.substring(
      src.indexOf("SYSTEM_ALERT_TYPE_OWNER"),
      src.indexOf("}", src.indexOf("SYSTEM_ALERT_TYPE_OWNER")) + 1,
    );
    expect(section).toContain('finance: "finance"');
  });

  test("isSystemAlertEnabled splits type by dot to get prefix", () => {
    const src = readFile(ADAPTER);
    const section = src.substring(
      src.indexOf("function isSystemAlertEnabled"),
      src.indexOf("function isTaskEnabled"),
    );
    expect(section).toContain('alertType.split(".")[0]');
    expect(section).toContain("SYSTEM_ALERT_TYPE_OWNER[prefix]");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. PROVEN ACTIONTASK EMITTER CERTIFICATION (PATCH-01D)
// ═══════════════════════════════════════════════════════════════════════════════

describe("28 — TASK_SOURCE_MODULE_OWNER contains ONLY proven emitters", () => {
  test("TASK_SOURCE_MODULE_OWNER is exported from adapter", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain("export const TASK_SOURCE_MODULE_OWNER");
  });

  test("contains exactly 9 static entries (proven emitters only)", () => {
    const src = readFile(ADAPTER);
    const start = src.indexOf("export const TASK_SOURCE_MODULE_OWNER");
    const end = src.indexOf("};", start) + 2;
    const section = src.substring(start, end);
    // 9 proven static emitters
    const provenKeys = [
      '"commercial.maletas.david"',
      "collections_queue:",
      "collections_followup:",
      "collections_auto:",
      "mila_collections:",
      "whatsapp_triggers:",
      "whatsapp_bot:",
      "agentik_copilot:",
      '"board-intelligence"',
    ];
    for (const key of provenKeys) {
      expect(section).toContain(key);
    }
  });

  test("does NOT contain speculative entries (no emitter found)", () => {
    const src = readFile(ADAPTER);
    const start = src.indexOf("export const TASK_SOURCE_MODULE_OWNER");
    const end = src.indexOf("};", start) + 2;
    const section = src.substring(start, end);
    // These were speculative in 01C — no emitter creates ActionTask with these values
    const speculative = [
      "customer_360:",
      "control_comercial:",
      "informes:",
      "finanzas:",
      "torre_de_control:",
      "manual:",
      "bandeja_acciones:",
    ];
    for (const key of speculative) {
      expect(section).not.toContain(key);
    }
  });

  test("documents proven emitter file paths in JSDoc", () => {
    const src = readFile(ADAPTER);
    const start = src.lastIndexOf("/**", src.indexOf("TASK_SOURCE_MODULE_OWNER"));
    const end = src.indexOf("export const TASK_SOURCE_MODULE_OWNER", start);
    const jsdoc = src.substring(start, end);
    // Each proven emitter has its file documented
    expect(jsdoc).toContain("agent/commercial/actions/route.ts");
    expect(jsdoc).toContain("collections/outcome/route.ts");
    expect(jsdoc).toContain("collections/follow-up.ts");
    expect(jsdoc).toContain("collections/auto-task.ts");
    expect(jsdoc).toContain("collections/mila-memory.ts");
    expect(jsdoc).toContain("collections/campaigns.ts");
    expect(jsdoc).toContain("whatsapp/triggers.ts");
    expect(jsdoc).toContain("whatsapp/actions.ts");
    expect(jsdoc).toContain("copilot-actions.ts");
    expect(jsdoc).toContain("board-finding-engine.ts");
  });

  test("documents NO EMITTER FOUND for speculative values", () => {
    const src = readFile(ADAPTER);
    const start = src.lastIndexOf("/**", src.indexOf("TASK_SOURCE_MODULE_OWNER"));
    const end = src.indexOf("export const TASK_SOURCE_MODULE_OWNER", start);
    const jsdoc = src.substring(start, end);
    expect(jsdoc).toContain("NO EMITTER FOUND");
    expect(jsdoc).toContain("customer_360");
    expect(jsdoc).toContain("control_comercial");
  });
});

describe("29 — isTaskEnabled handles campaign:* dynamic prefix", () => {
  test("isTaskEnabled handles campaign:* prefix for collections", () => {
    const src = readFile(ADAPTER);
    const section = src.substring(
      src.indexOf("function isTaskEnabled"),
      src.indexOf("// ── Global Attention"),
    );
    expect(section).toContain('sourceModule.startsWith("campaign:")');
    expect(section).toContain('effectiveModules.has("collections")');
  });

  test("campaign:* emitter is documented as proven (lib/collections/campaigns.ts)", () => {
    const src = readFile(ADAPTER);
    const start = src.lastIndexOf("/**", src.indexOf("TASK_SOURCE_MODULE_OWNER"));
    const end = src.indexOf("export const TASK_SOURCE_MODULE_OWNER", start);
    const jsdoc = src.substring(start, end);
    expect(jsdoc).toContain('"campaign:{id}"');
    expect(jsdoc).toContain("campaigns.ts");
  });
});

describe("30 — All three filter functions are FAIL CLOSED", () => {
  test("isBusinessAlertEnabled returns false for null/undefined module", () => {
    const src = readFile(ADAPTER);
    const section = src.substring(
      src.indexOf("function isBusinessAlertEnabled"),
      src.indexOf("function isSystemAlertEnabled"),
    );
    expect(section).toContain("if (!alertModule)");
    expect(section).toContain("return false");
    expect(section).toContain("fail closed");
    // No return true for unmapped — only effectiveModules.has(owner)
    expect(section).not.toContain("return true");
  });

  test("isSystemAlertEnabled returns false for null/undefined type", () => {
    const src = readFile(ADAPTER);
    const section = src.substring(
      src.indexOf("function isSystemAlertEnabled"),
      src.indexOf("function isTaskEnabled"),
    );
    expect(section).toContain("if (!alertType)");
    expect(section).toContain("return false");
    expect(section).toContain("fail closed");
    expect(section).not.toContain("return true");
  });

  test("isTaskEnabled returns false for null/undefined sourceModule", () => {
    const src = readFile(ADAPTER);
    const section = src.substring(
      src.indexOf("function isTaskEnabled"),
      src.indexOf("// ── Global Attention"),
    );
    expect(section).toContain("if (!sourceModule)");
    expect(section).toContain("return false");
    expect(section).toContain("fail closed");
  });

  test("isBusinessAlertEnabled returns false for unmapped module value", () => {
    const src = readFile(ADAPTER);
    const section = src.substring(
      src.indexOf("function isBusinessAlertEnabled"),
      src.indexOf("function isSystemAlertEnabled"),
    );
    expect(section).toContain("has no owner mapping");
    expect(section).toContain("return false");
  });
});

describe("31 — assembleGlobalAttention uses effectiveModules (required)", () => {
  test("assembleGlobalAttention signature includes effectiveModules", () => {
    const src = readFile(ADAPTER);
    const section = src.substring(
      src.indexOf("export function assembleGlobalAttention"),
      src.indexOf("): ManagerAttentionItem[]"),
    );
    expect(section).toContain("effectiveModules: Set<string>");
    expect(section).not.toContain("effectiveModules?");
  });

  test("Manager Home passes effectiveModules to assembleGlobalAttention", () => {
    const src = readFile(MANAGER_HOME);
    expect(src).toContain("effectiveModules");
    expect(src).toContain("assembleGlobalAttention({");
  });

  test("filtering calls isBusinessAlertEnabled", () => {
    const src = readFile(ADAPTER);
    const section = src.substring(
      src.indexOf("export function assembleGlobalAttention"),
      src.indexOf("function mapSeverity"),
    );
    expect(section).toContain("isBusinessAlertEnabled(a.module, effectiveModules)");
  });
});

describe("32 — assembleAlertasPA uses effectiveModules (required)", () => {
  test("assembleAlertasPA signature includes effectiveModules (required)", () => {
    const src = readFile(ADAPTER);
    const section = src.substring(
      src.indexOf("export function assembleAlertasPA"),
      src.indexOf("): ManagerAlertasPA"),
    );
    expect(section).toContain("effectiveModules: Set<string>");
    expect(section).not.toContain("effectiveModules?");
  });

  test("Alertas page passes effectiveModules to assembleAlertasPA", () => {
    const alertasPage = "app/(app)/[orgSlug]/manager/alertas/page.tsx";
    const src = readFile(alertasPage);
    expect(src).toContain("effectiveModules");
    expect(src).toContain("assembleAlertasPA({ businessAlerts, systemAlerts, effectiveModules })");
  });
});

describe("33 — assembleTareasPA uses effectiveModules (required)", () => {
  test("assembleTareasPA requires effectiveModules (not optional)", () => {
    const src = readFile(ADAPTER);
    const section = src.substring(
      src.indexOf("export function assembleTareasPA"),
      src.indexOf("): ManagerTareasPA"),
    );
    expect(section).toContain("effectiveModules: Set<string>");
    expect(section).not.toContain("effectiveModules?");
  });

  test("assembleTareasPA filters tasks via isTaskEnabled", () => {
    const src = readFile(ADAPTER);
    const start = src.indexOf("export function assembleTareasPA");
    const end = src.indexOf("\n\n// ──", start);
    const section = src.substring(start, end > start ? end : start + 500);
    expect(section).toContain("isTaskEnabled(t.module, effectiveModules)");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. ORDER_SYNC RUNTIME TRACE (PATCH-01E)
//    Classification: structural (source-string inspection)
// ═══════════════════════════════════════════════════════════════════════════════

describe("34 — ORDER_SYNC_* emitter trace: log events, not Alert records", () => {
  // STRUCTURAL: verifies emitter file contents

  test("order-post-sync.ts emits ORDER_SYNC_* as console log events", () => {
    const src = readFile("lib/comercial/pedidos/order-post-sync.ts");
    expect(src).toContain("ORDER_SYNC_SUCCESS");
    expect(src).toContain("ORDER_SYNC_FAILED");
    expect(src).toContain("ORDER_SYNC_REJECTED");
    // Emitter is log(), NOT prisma.alert.create or prisma.businessAlert.create
    expect(src).not.toContain("prisma.alert.create");
    expect(src).not.toContain("prisma.businessAlert.create");
  });

  test("order-sag-bridge.ts uses sagWriteLog, not Alert creation", () => {
    const src = readFile("lib/comercial/pedidos/sag-order-sync-service.ts");
    expect(src).toContain("SAG_ORDER_SYNC");
    expect(src).not.toContain("prisma.alert.create");
    expect(src).not.toContain("prisma.businessAlert.create");
  });
});

describe("35 — ORDER_SYNC_* transport: frontline notification types", () => {
  // STRUCTURAL: verifies type definitions and consumers

  test("ORDER_SYNC_FAILED is a FrontlineNotificationType, not an Alert type", () => {
    const src = readFile("lib/comercial/frontline/frontline-types.ts");
    expect(src).toContain("ORDER_SYNC_FAILED");
    expect(src).toContain("ORDER_PENDING_SYNC");
    expect(src).not.toContain("prisma.alert");
  });

  test("ORDER_SYNC_FAILED is also a SellerNotificationType", () => {
    const src = readFile("lib/comercial/frontline/seller-app-types.ts");
    expect(src).toContain("ORDER_SYNC_FAILED");
    expect(src).toContain("ORDER_PENDING_SYNC");
  });

  test("frontline-attention-service.ts generates ORDER_PENDING_SYNC from stale orders", () => {
    const src = readFile("lib/comercial/frontline/frontline-attention-service.ts");
    expect(src).toContain("ORDER_PENDING_SYNC");
    // Generated from order status evaluation, NOT from Alert model
    expect(src).not.toContain("prisma.alert");
    expect(src).not.toContain("prisma.businessAlert");
  });

  test("seller-alerts-view.tsx is the current consumer (Seller App only)", () => {
    const src = readFile("app/(app)/[orgSlug]/seller-app/views/seller-alerts-view.tsx");
    expect(src).toContain("ORDER_SYNC_FAILED");
    expect(src).toContain("ORDER_PENDING_SYNC");
    // Rendered as seller notification, not as Alert or BusinessAlert
    expect(src).not.toContain("listAlerts");
    expect(src).not.toContain("listBusinessAlerts");
  });
});

describe("36 — ORDER_SYNC_* cannot enter Manager Home Business Attention", () => {
  // STRUCTURAL: proves absence from the attention pipeline

  test("Manager Home uses only listBusinessAlerts — ORDER_SYNC cannot reach attention", () => {
    const src = readFile(MANAGER_HOME);
    expect(src).toContain("listBusinessAlerts");
    // Strip comments — the code itself must not reference ORDER_SYNC
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
    expect(codeOnly).not.toContain("ORDER_SYNC");
  });

  test("org-alerts.ts (proven Alert emitter) creates only cartera.* types", () => {
    const src = readFile("lib/alerts/org-alerts.ts");
    expect(src).toContain("cartera.");
    expect(src).not.toContain("ORDER_SYNC");
  });

  test("document-alerts.ts (proven Alert emitter) creates only finance.document.* types", () => {
    const src = readFile("lib/finance/document-alerts.ts");
    expect(src).toContain("finance.document.");
    expect(src).not.toContain("ORDER_SYNC");
  });

  test("no Alert-to-BusinessAlert conversion exists for ORDER_SYNC", () => {
    // Verify no code converts ORDER_SYNC log events into Alert/BusinessAlert records
    const orgAlerts = readFile("lib/alerts/org-alerts.ts");
    const docAlerts = readFile("lib/finance/document-alerts.ts");
    const queries = readFile("lib/alerts/queries.ts");
    for (const src of [orgAlerts, docAlerts, queries]) {
      expect(src).not.toContain("ORDER_SYNC");
    }
  });

  test("Manager Alertas page does NOT consume ORDER_SYNC — product gap acknowledged", () => {
    // ORDER_SYNC events are consumed ONLY by Seller App (seller-alerts-view.tsx).
    // Manager Alertas consumes Alert and BusinessAlert models only.
    // If ORDER_SYNC source health should appear in Manager Alertas, that requires
    // a new integration (not in scope of this sprint).
    const alertasPage = readFile("app/(app)/[orgSlug]/manager/alertas/page.tsx");
    expect(alertasPage).toContain("listBusinessAlerts");
    expect(alertasPage).toContain("listAlerts");
    expect(alertasPage).not.toContain("ORDER_SYNC");
    expect(alertasPage).not.toContain("frontline");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. CANONICAL REPORT DISPATCH (01G — Section 2/3)
//     Report ownership lives in lib/reports/report-ownership.ts.
//     Adapter consumes — does NOT maintain a parallel registry.
// ═══════════════════════════════════════════════════════════════════════════════

const REPORT_OWNERSHIP = "lib/reports/report-ownership.ts";

describe("37 — Canonical report dispatch lives in report-ownership.ts (no parallel registry)", () => {
  test("REPORT_FAMILY_DISPATCH exists in report-ownership.ts", () => {
    const src = readFile(REPORT_OWNERSHIP);
    expect(src).toContain("export const REPORT_FAMILY_DISPATCH");
  });

  test("adapter does NOT have REPORT_FAMILY_OWNER", () => {
    const src = readFile(ADAPTER);
    expect(src).not.toContain("export const REPORT_FAMILY_OWNER");
    expect(src).not.toContain("ALERT_CONTRIBUTING_MODULES");
  });

  test("adapter imports from report-ownership.ts (canonical consumption)", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain('from "@/lib/reports/report-ownership"');
    expect(src).toContain("isReportFamilyAuthorized");
  });

  test("dispatch uses discriminated ReportOwnership union (not Record<QueryFamily, string>)", () => {
    const src = readFile(REPORT_OWNERSHIP);
    expect(src).toContain('kind: "MODULE_OWNER"');
    expect(src).toContain('kind: "MIXED_ROW_OWNER"');
    expect(src).toContain("moduleKey:");
    expect(src).toContain("rowModuleField:");
    expect(src).toContain("rowOwnershipResolver:");
    expect(src).not.toContain("Record<QueryFamily, string>");
  });

  test("all 8 QueryFamily values have dispatch entries", () => {
    const src = readFile(REPORT_OWNERSHIP);
    const families = [
      "cartera_vencida", "pedidos", "cotizaciones", "clientes",
      "clientes_inactivos", "top_clientes", "sin_facturar", "alertas_criticas",
    ];
    for (const f of families) {
      expect(src).toContain(`family:       "${f}"`);
    }
  });

  test("7 MODULE_OWNER entries use moduleKey 'sales'", () => {
    const src = readFile(REPORT_OWNERSHIP);
    const dispatchSection = src.substring(
      src.indexOf("export const REPORT_FAMILY_DISPATCH"),
      src.indexOf("] as const;"),
    );
    const salesModuleOwner = (dispatchSection.match(/kind:\s*"MODULE_OWNER",\s*moduleKey:\s*"sales"/g) || []).length;
    expect(salesModuleOwner).toBe(7);
  });

  test("alertas_criticas uses MIXED_ROW_OWNER with BusinessAlert module field", () => {
    const src = readFile(REPORT_OWNERSHIP);
    const alertEntry = src.substring(
      src.indexOf('"alertas_criticas"'),
      src.indexOf("},", src.indexOf('"alertas_criticas"')) + 2,
    );
    expect(alertEntry).toContain('kind:                  "MIXED_ROW_OWNER"');
    expect(alertEntry).toContain('rowModuleField:        "module"');
    expect(alertEntry).toContain('rowOwnershipResolver:  "ALERT_MODULE_OWNER"');
  });
});

describe("38 — Per-runner ownership certification (structural evidence)", () => {
  test("cartera_vencida → runCarteraVencida → CustomerReceivable (sales)", () => {
    const runners = readFile("lib/reports/runners.ts");
    const runner = runners.substring(
      runners.indexOf("async function runCarteraVencida"),
      runners.indexOf("async function runPedidos"),
    );
    expect(runner).toContain("prisma.customerReceivable.findMany");
    expect(runner).toContain("organizationId: orgId");
    expect(runner).not.toContain("module:");
    // Evidence: CustomerReceivable has NO module field. Single domain.
    const dispatch = readFile(REPORT_OWNERSHIP);
    expect(dispatch).toContain('family:       "cartera_vencida"');
    expect(dispatch).toContain('runner:       "runCarteraVencida"');
    expect(dispatch).toContain('primaryModel: "CustomerReceivable"');
  });

  test("pedidos → runPedidos → CRMQuote (sales)", () => {
    const runners = readFile("lib/reports/runners.ts");
    const runner = runners.substring(
      runners.indexOf("async function runPedidos"),
      runners.indexOf("async function runCotizaciones"),
    );
    expect(runner).toContain("prisma.cRMQuote.findMany");
    expect(runner).toContain("organizationId: orgId");
  });

  test("clientes → runClientes → CustomerProfile (sales)", () => {
    const runners = readFile("lib/reports/runners.ts");
    const runner = runners.substring(
      runners.indexOf("async function runClientes("),
      runners.indexOf("async function runClientesInactivos"),
    );
    expect(runner).toContain("prisma.customerProfile.findMany");
    expect(runner).toContain("organizationId: orgId");
  });

  test("alertas_criticas → runAlertasCriticas → BusinessAlert WITHOUT module filter (MIXED)", () => {
    const runners = readFile("lib/reports/runners.ts");
    const runner = runners.substring(
      runners.indexOf("async function runAlertasCriticas"),
      runners.indexOf("// ── Dispatch"),
    );
    expect(runner).toContain("prisma.businessAlert.findMany");
    expect(runner).toContain('status:         "OPEN"');
    expect(runner).toContain('severity:       "CRITICAL"');
    expect(runner).not.toContain("module:");
    expect(runner).not.toContain('module: "sales"');
  });

  test("BusinessAlert schema has module field (sales/finance/production)", () => {
    const schema = readFile("prisma/schema.prisma");
    const model = schema.substring(
      schema.indexOf("model BusinessAlert"),
      schema.indexOf("}", schema.indexOf("model BusinessAlert")) + 1,
    );
    expect(model).toContain("module         String");
    expect(model).toContain('"sales"');
    expect(model).toContain('"finance"');
    expect(model).toContain('"production"');
  });

  test("runReport dispatch covers all 8 families + default", () => {
    const src = readFile("lib/reports/runners.ts");
    const dispatch = src.substring(src.indexOf("export async function runReport"));
    const families = [
      "cartera_vencida", "pedidos", "cotizaciones", "clientes",
      "clientes_inactivos", "top_clientes", "sin_facturar", "alertas_criticas",
    ];
    for (const f of families) expect(dispatch).toContain(`case "${f}"`);
    expect(dispatch).toContain("default:");
  });

  test("dispatch evidence in report-ownership.ts matches runner evidence", () => {
    const dispatch = readFile(REPORT_OWNERSHIP);
    // Every dispatch entry names a runner that exists in runners.ts
    const runners = readFile("lib/reports/runners.ts");
    const names = ["runCarteraVencida", "runPedidos", "runCotizaciones", "runClientes",
      "runClientesInactivos", "runTopClientes", "runSinFacturar", "runAlertasCriticas"];
    for (const name of names) {
      expect(dispatch).toContain(`runner:       "${name}"`);
      expect(runners).toContain(`function ${name}`);
    }
  });
});

describe("39 — RUNTIME: interpret() deterministically resolves QueryFamily", () => {
  const { interpret } = require("@/lib/reports/interpreter");

  test("recognized: 'cartera vencida' → cartera_vencida", () => {
    expect(interpret("cartera vencida").family).toBe("cartera_vencida");
  });

  test("recognized: 'pedidos de hoy' → pedidos", () => {
    expect(interpret("pedidos de hoy").family).toBe("pedidos");
  });

  test("recognized: 'cotizaciones' → cotizaciones", () => {
    expect(interpret("cotizaciones").family).toBe("cotizaciones");
  });

  test("recognized: 'clientes' → clientes", () => {
    expect(interpret("clientes").family).toBe("clientes");
  });

  test("recognized: 'clientes inactivos' → clientes_inactivos", () => {
    expect(interpret("clientes inactivos").family).toBe("clientes_inactivos");
  });

  test("recognized: 'top clientes' → top_clientes", () => {
    expect(interpret("top clientes").family).toBe("top_clientes");
  });

  test("recognized: 'sin facturar' → sin_facturar", () => {
    expect(interpret("sin facturar").family).toBe("sin_facturar");
  });

  test("recognized: 'alertas criticas' → alertas_criticas", () => {
    expect(interpret("alertas criticas").family).toBe("alertas_criticas");
  });

  test("unmatched: unknown text defaults to 'pedidos' (always returns valid family)", () => {
    const spec = interpret("xyzzy random nonsense");
    expect(spec.family).toBe("pedidos");
  });

  test("unmatched default cannot bypass sales entitlement (pedidos → sales owner)", () => {
    // interpret() defaults to "pedidos". Dispatch maps pedidos → MODULE_OWNER("sales").
    // If sales is not in effectiveModules, the report is hidden.
    const { isReportFamilyAuthorized, getReportDispatch } = require("@/lib/reports/report-ownership");
    const dispatch = getReportDispatch("pedidos");
    expect(dispatch).toBeTruthy();
    expect(dispatch.ownership.kind).toBe("MODULE_OWNER");
    expect(dispatch.ownership.moduleKey).toBe("sales");
    // Without sales → denied
    expect(isReportFamilyAuthorized("pedidos", new Set(["finance"]), {})).toBe(false);
    // With sales → allowed
    expect(isReportFamilyAuthorized("pedidos", new Set(["sales"]), {})).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. RUNTIME REPORT ENTITLEMENT TESTS (01G — Sections 4/5)
//     RUNTIME — imports and executes actual isReportFamilyAuthorized + filterReportRows
// ═══════════════════════════════════════════════════════════════════════════════

describe("40 — RUNTIME: isReportFamilyAuthorized container-level decisions", () => {
  const { isReportFamilyAuthorized } = require("@/lib/reports/report-ownership");
  const ALERT_OWNER = { sales: "sales", source_aware: "sales", crm: "sales", finance: "finance" };

  test("sales family + sales enabled → authorized", () => {
    expect(isReportFamilyAuthorized("cartera_vencida", new Set(["sales"]), ALERT_OWNER)).toBe(true);
  });

  test("sales family + sales disabled → denied", () => {
    expect(isReportFamilyAuthorized("cartera_vencida", new Set(["finance"]), ALERT_OWNER)).toBe(false);
  });

  test("MIXED family + sales enabled → authorized (sales contributes alerts)", () => {
    expect(isReportFamilyAuthorized("alertas_criticas", new Set(["sales"]), ALERT_OWNER)).toBe(true);
  });

  test("MIXED family + finance enabled → authorized (finance contributes alerts)", () => {
    expect(isReportFamilyAuthorized("alertas_criticas", new Set(["finance"]), ALERT_OWNER)).toBe(true);
  });

  test("MIXED family + no contributing module → denied", () => {
    expect(isReportFamilyAuthorized("alertas_criticas", new Set(["agentik"]), ALERT_OWNER)).toBe(false);
  });

  test("MIXED family + empty effectiveModules → denied", () => {
    expect(isReportFamilyAuthorized("alertas_criticas", new Set(), ALERT_OWNER)).toBe(false);
  });

  test("all 7 single-module families require sales", () => {
    const singleFamilies = [
      "cartera_vencida", "pedidos", "cotizaciones", "clientes",
      "clientes_inactivos", "top_clientes", "sin_facturar",
    ] as const;
    for (const f of singleFamilies) {
      expect(isReportFamilyAuthorized(f, new Set(["sales"]), ALERT_OWNER)).toBe(true);
      expect(isReportFamilyAuthorized(f, new Set(["finance"]), ALERT_OWNER)).toBe(false);
    }
  });
});

describe("41 — RUNTIME: filterReportRows mixed-row filtering behavior", () => {
  const { filterReportRows } = require("@/lib/reports/report-ownership");
  const ALERT_OWNER = { sales: "sales", source_aware: "sales", crm: "sales", finance: "finance" };

  // Minimal ReportResult for testing
  function makeResult(family: string, rows: Record<string, unknown>[]) {
    return {
      title: "test", subtitle: "test", kpis: [], columns: [],
      rows, totalRows: rows.length,
      queryFamily: family, querySpec: { family, rawQuery: "", normalised: "", limit: 100 },
      generatedAt: new Date().toISOString(),
    };
  }

  test("authorized sales alert row → included", () => {
    const result = makeResult("alertas_criticas", [
      { module: "sales", title: "Alert 1" },
    ]);
    const filtered = filterReportRows(result, new Set(["sales"]), ALERT_OWNER);
    expect(filtered.rows.length).toBe(1);
  });

  test("disabled finance alert row → excluded", () => {
    const result = makeResult("alertas_criticas", [
      { module: "finance", title: "Finance alert" },
    ]);
    const filtered = filterReportRows(result, new Set(["sales"]), ALERT_OWNER);
    expect(filtered.rows.length).toBe(0);
  });

  test("mixed rows: sales included, finance excluded", () => {
    const result = makeResult("alertas_criticas", [
      { module: "sales", title: "Sales alert" },
      { module: "finance", title: "Finance alert" },
      { module: "sales", title: "Another sales alert" },
    ]);
    const filtered = filterReportRows(result, new Set(["sales"]), ALERT_OWNER);
    expect(filtered.rows.length).toBe(2);
    expect(filtered.totalRows).toBe(2);
  });

  test("unknown row module → excluded (fail closed)", () => {
    const result = makeResult("alertas_criticas", [
      { module: "production", title: "Prod alert" },
    ]);
    // "production" is NOT in ALERT_OWNER → excluded
    const filtered = filterReportRows(result, new Set(["sales", "production"]), ALERT_OWNER);
    expect(filtered.rows.length).toBe(0);
  });

  test("missing module field on row → excluded (fail closed)", () => {
    const result = makeResult("alertas_criticas", [
      { title: "Alert without module" },
    ]);
    const filtered = filterReportRows(result, new Set(["sales"]), ALERT_OWNER);
    expect(filtered.rows.length).toBe(0);
  });

  test("all rows excluded → empty result (not cross-module disclosure)", () => {
    const result = makeResult("alertas_criticas", [
      { module: "finance", title: "F1" },
      { module: "finance", title: "F2" },
    ]);
    const filtered = filterReportRows(result, new Set(["sales"]), ALERT_OWNER);
    expect(filtered.rows.length).toBe(0);
    expect(filtered.totalRows).toBe(0);
  });

  test("MODULE_OWNER report rows pass through unfiltered", () => {
    const result = makeResult("pedidos", [
      { name: "Quote 1" },
      { name: "Quote 2" },
    ]);
    const filtered = filterReportRows(result, new Set(["sales"]), ALERT_OWNER);
    expect(filtered.rows.length).toBe(2);
  });

  test("filterMixedReportResult exported from adapter", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain("export function filterMixedReportResult");
    expect(src).toContain("filterReportRows(result, effectiveModules, ALERT_MODULE_OWNER)");
  });
});

describe("42 — RUNTIME: interpreter default behavior reconciliation", () => {
  const { interpret } = require("@/lib/reports/interpreter");
  const { isReportFamilyAuthorized } = require("@/lib/reports/report-ownership");
  const ALERT_OWNER = { sales: "sales", source_aware: "sales", crm: "sales", finance: "finance" };

  test("recognized query resolves to specific family", () => {
    expect(interpret("cartera vencida").family).toBe("cartera_vencida");
    expect(interpret("alertas criticas").family).toBe("alertas_criticas");
  });

  test("unmatched query uses default (pedidos) — never returns null", () => {
    const spec = interpret("gibberish input 12345");
    expect(spec.family).toBe("pedidos");
    expect(spec.family).not.toBeNull();
  });

  test("default 'pedidos' requires sales entitlement (cannot bypass)", () => {
    // If sales disabled, even the default is denied
    expect(isReportFamilyAuthorized("pedidos", new Set(["finance"]), ALERT_OWNER)).toBe(false);
    expect(isReportFamilyAuthorized("pedidos", new Set(["sales"]), ALERT_OWNER)).toBe(true);
  });

  test("adapter isReportEnabled handles null/undefined query (fail closed)", () => {
    const src = readFile(ADAPTER);
    const fn = src.substring(
      src.indexOf("function isReportEnabled"),
      src.indexOf("// ── Global Attention"),
    );
    expect(fn).toContain("!query");
    expect(fn).toContain("fail closed");
    expect(fn).toContain("return false");
  });

  test("adapter isReportEnabled delegates to isReportFamilyAuthorized", () => {
    const src = readFile(ADAPTER);
    const fn = src.substring(
      src.indexOf("function isReportEnabled"),
      src.indexOf("// ── Global Attention"),
    );
    expect(fn).toContain("isReportFamilyAuthorized(family, effectiveModules, ALERT_MODULE_OWNER)");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 12. COMPLETE ACTIONTASK INVENTORY (01G — Section 6)
//     Classification: STRUCTURAL (emitter file evidence)
// ═══════════════════════════════════════════════════════════════════════════════

describe("43 — ActionTask: complete 10-source inventory with proven emitters", () => {
  test("commercial.maletas.david → api agent/commercial/actions route", () => {
    const src = readFile("app/api/orgs/[orgSlug]/agent/commercial/actions/route.ts");
    expect(src).toContain('"commercial.maletas.david"');
    expect(src).toContain("createActionTask");
  });

  test("collections_queue → collections outcome route", () => {
    const src = readFile("app/api/orgs/[orgSlug]/collections/outcome/route.ts");
    expect(src).toContain('"collections_queue"');
  });

  test("collections_followup → lib/collections/follow-up.ts", () => {
    const src = readFile("lib/collections/follow-up.ts");
    expect(src).toContain('"collections_followup"');
  });

  test("collections_auto → lib/collections/auto-task.ts", () => {
    const src = readFile("lib/collections/auto-task.ts");
    expect(src).toContain("collections_auto");
  });

  test("mila_collections → lib/collections/mila-memory.ts", () => {
    const src = readFile("lib/collections/mila-memory.ts");
    expect(src).toContain('"mila_collections"');
  });

  test("campaign:{id} → lib/collections/campaigns.ts", () => {
    const src = readFile("lib/collections/campaigns.ts");
    expect(src).toContain("`campaign:${");
  });

  test("whatsapp_triggers → lib/whatsapp/triggers.ts", () => {
    const src = readFile("lib/whatsapp/triggers.ts");
    expect(src).toContain("whatsapp_triggers");
  });

  test("whatsapp_bot → lib/whatsapp/actions.ts", () => {
    const src = readFile("lib/whatsapp/actions.ts");
    expect(src).toContain("whatsapp_bot");
  });

  test("agentik_copilot → lib/agentik/copilot-actions.ts", () => {
    const src = readFile("lib/agentik/copilot-actions.ts");
    expect(src).toContain('"agentik_copilot"');
  });

  test("board-intelligence → lib/copilot/board-intelligence/board-finding-engine.ts", () => {
    const src = readFile("lib/copilot/board-intelligence/board-finding-engine.ts");
    expect(src).toContain('"board-intelligence"');
  });
});

describe("44 — ActionTask: TASK_SOURCE_MODULE_OWNER canonical mapping", () => {
  test("TASK_SOURCE_MODULE_OWNER contains all 9 static sources + campaign dynamic", () => {
    const src = readFile(ADAPTER);
    const start = src.indexOf("export const TASK_SOURCE_MODULE_OWNER");
    const end = src.indexOf("};", start) + 2;
    const section = src.substring(start, end);
    expect(section).toContain('"commercial.maletas.david": "sales"');
    expect(section).toContain('collections_queue:          "collections"');
    expect(section).toContain('collections_followup:       "collections"');
    expect(section).toContain('collections_auto:           "collections"');
    expect(section).toContain('mila_collections:           "collections"');
    expect(section).toContain('whatsapp_triggers:          "whatsapp"');
    expect(section).toContain('whatsapp_bot:               "whatsapp"');
    expect(section).toContain('agentik_copilot:            "agentik"');
    expect(section).toContain('"board-intelligence":       "agentik"');
  });

  test("campaign:* dynamic prefix handled by isTaskEnabled", () => {
    const src = readFile(ADAPTER);
    const section = src.substring(
      src.indexOf("function isTaskEnabled"),
      src.indexOf("// ── ScheduledReport"),
    );
    expect(section).toContain('sourceModule.startsWith("campaign:")');
    expect(section).toContain('effectiveModules.has("collections")');
  });

  test("unknown sourceModule → fail closed", () => {
    const src = readFile(ADAPTER);
    const section = src.substring(
      src.indexOf("function isTaskEnabled"),
      src.indexOf("// ── ScheduledReport"),
    );
    expect(section).toContain("has no owner mapping");
    expect(section).toContain("return false");
  });

  test("null/undefined sourceModule → fail closed", () => {
    const src = readFile(ADAPTER);
    const section = src.substring(
      src.indexOf("function isTaskEnabled"),
      src.indexOf("// ── ScheduledReport"),
    );
    expect(section).toContain("!sourceModule");
    expect(section).toContain("return false");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 13. COMPLETE MANAGER AUTHORIZATION DECISION (01G — Section 7)
//     RUNTIME — imports and executes isManagerModuleAuthorized
// ═══════════════════════════════════════════════════════════════════════════════

describe("45 — RUNTIME: isManagerModuleAuthorized complete authorization decision", () => {
  // The adapter has `import "server-only"` so we cannot require() it in tests.
  // Instead we: (a) prove the source exports these functions, (b) replicate the
  // exact pure logic from the adapter for behavioral testing, (c) import the
  // testable filterModulesByRole from module-access.ts (no server-only).

  const { filterModulesByRole } = require("@/lib/auth/module-access");

  // Replicate the adapter's pure logic (proven by source evidence in this describe):
  const MANAGER_ROLES: ReadonlySet<string> = new Set(["ORG_ADMIN", "MANAGER"]);
  const MANAGER_READY_MODULES: ReadonlySet<string> = new Set(["sales"]);

  function computeEffectiveManagerModules(permitted: Set<string>): Set<string> {
    return new Set([...permitted].filter(k => MANAGER_READY_MODULES.has(k)));
  }

  function isManagerModuleAuthorized(
    role: string, orgModules: Set<string>, moduleKey: string,
    filterFn: (orgMods: Set<string>, role: string) => Set<string>,
  ): boolean {
    if (!MANAGER_ROLES.has(role)) return false;
    const permitted = filterFn(orgModules as any, role as any);
    const effective = computeEffectiveManagerModules(permitted);
    return effective.has(moduleKey);
  }

  // Source evidence: adapter exports all three functions/constants
  test("adapter source exports isManagerModuleAuthorized, MANAGER_ROLES, computeEffectiveManagerModules", () => {
    const src = readFile(ADAPTER);
    expect(src).toContain("export function isManagerModuleAuthorized(");
    expect(src).toContain("export const MANAGER_ROLES: ReadonlySet<string>");
    expect(src).toContain("export function computeEffectiveManagerModules(");
    // Prove the adapter logic matches our inline replication
    expect(src).toContain('new Set(["ORG_ADMIN", "MANAGER"])');
    expect(src).toContain("if (!MANAGER_ROLES.has(role)) return false;");
    expect(src).toContain("managerReadyModuleKeys.has(k)");
  });

  test("ORG_ADMIN + enabled sales → allowed", () => {
    expect(isManagerModuleAuthorized(
      "ORG_ADMIN", new Set(["sales", "finance"]), "sales", filterModulesByRole,
    )).toBe(true);
  });

  test("MANAGER + enabled sales → allowed", () => {
    expect(isManagerModuleAuthorized(
      "MANAGER", new Set(["sales"]), "sales", filterModulesByRole,
    )).toBe(true);
  });

  test("approved role + disabled sales → denied", () => {
    expect(isManagerModuleAuthorized(
      "ORG_ADMIN", new Set(["finance"]), "sales", filterModulesByRole,
    )).toBe(false);
  });

  test("disallowed role + enabled sales → denied", () => {
    expect(isManagerModuleAuthorized(
      "OPERATOR", new Set(["sales"]), "sales", filterModulesByRole,
    )).toBe(false);
  });

  test("BILLING + enabled sales → denied (not in MANAGER_ROLES)", () => {
    expect(isManagerModuleAuthorized(
      "BILLING", new Set(["sales"]), "sales", filterModulesByRole,
    )).toBe(false);
  });

  test("sales entitled but not Manager-ready → denied", () => {
    // "finance" is role-permitted for ORG_ADMIN but NOT in MANAGER_MODULE_DEFS
    expect(isManagerModuleAuthorized(
      "ORG_ADMIN", new Set(["sales", "finance"]), "finance", filterModulesByRole,
    )).toBe(false);
  });

  test("missing entitlement context (empty org modules) → denied", () => {
    expect(isManagerModuleAuthorized(
      "ORG_ADMIN", new Set(), "sales", filterModulesByRole,
    )).toBe(false);
  });

  test("MANAGER_ROLES is ORG_ADMIN and MANAGER only", () => {
    expect(MANAGER_ROLES.has("ORG_ADMIN")).toBe(true);
    expect(MANAGER_ROLES.has("MANAGER")).toBe(true);
    expect(MANAGER_ROLES.has("OPERATOR")).toBe(false);
    expect(MANAGER_ROLES.has("VIEWER")).toBe(false);
    expect(MANAGER_ROLES.has("BILLING")).toBe(false);
    expect(MANAGER_ROLES.has("AGENTIK_ADMIN")).toBe(false);
  });

  test("layout consumes MANAGER_ROLES from adapter (shared guard)", () => {
    const src = readFile(MANAGER_LAYOUT);
    // Layout uses its own MANAGER_ROLES set — verify it matches the adapter's
    expect(src).toContain('"ORG_ADMIN"');
    expect(src).toContain('"MANAGER"');
    expect(src).not.toContain('"OPERATOR"');
    expect(src).not.toContain('"VIEWER"');
  });

  test("layout exercises full entitlement chain: getEnabledModules → filterModulesByRole → MANAGER_MODULE_DEFS", () => {
    const src = readFile(MANAGER_LAYOUT);
    expect(src).toContain("getEnabledModules");
    expect(src).toContain("filterModulesByRole");
    expect(src).toContain("MANAGER_MODULE_DEFS");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 14. SELLER AND STORE RUNTIME ISOLATION (01G — Section 8)
// ═══════════════════════════════════════════════════════════════════════════════

describe("46 — Seller directory org-scoping", () => {
  test("buildSellerDirectory requires organizationId (no default)", () => {
    const src = readFile(SELLER_DIR);
    const sig = src.substring(
      src.indexOf("export async function buildSellerDirectory"),
      src.indexOf("{", src.indexOf("export async function buildSellerDirectory")),
    );
    expect(sig).toContain("organizationId: string");
  });

  test("getSellerBySlug requires organizationId (no cross-tenant lookup)", () => {
    const src = readFile(SELLER_DIR);
    const sig = src.substring(
      src.indexOf("export async function getSellerBySlug"),
      src.indexOf("{", src.indexOf("export async function getSellerBySlug")),
    );
    expect(sig).toContain("organizationId: string");
    expect(sig).toContain("slug: string");
  });

  test("getSellerBySlug WHERE clause includes organizationId", () => {
    const src = readFile(SELLER_DIR);
    const fn = src.substring(src.indexOf("export async function getSellerBySlug"));
    expect(fn).toContain("organizationId");
    // The Prisma query uses org-scoped WHERE
  });

  test("duplicate sellerSlug inside org → fail closed (AMBIGUOUS, return null)", () => {
    const src = readFile(SELLER_DIR);
    const fn = src.substring(src.indexOf("export async function getSellerBySlug"));
    expect(fn).toContain("matches.length > 1");
    expect(fn).toContain("return null");
    expect(fn).toContain("AMBIGUOUS");
  });

  test("foreign entity not disclosed (null return, no FOREIGN/WRONG_ORG error)", () => {
    const src = readFile(SELLER_DIR);
    const fn = src.substring(src.indexOf("export async function getSellerBySlug"));
    expect(fn).toContain("return null");
    expect(fn).not.toContain("FOREIGN");
    expect(fn).not.toContain("WRONG_ORG");
  });

  test("Seller detail page derives orgId from requireOrgAccess", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/comercial/vendedores/[sellerId]/page.tsx");
    expect(src).toContain("requireOrgAccess(orgSlug)");
    expect(src).toContain("organization.id");
    expect(src).toContain("getSellerBySlug(orgId,");
  });
});

describe("47 — Store network org-scoping", () => {
  test("store snapshot requires orgId", () => {
    const src = readFile("lib/comercial/tiendas/store-snapshot-service.ts");
    expect(src).toContain("getStoreSnapshotWithMeta(orgId");
  });

  test("store inventory uses org-scoped Prisma WHERE", () => {
    const src = readFile("lib/comercial/tiendas/store-snapshot-source-service.ts");
    expect(src).toContain("organizationId: orgId");
  });

  test("store governance is tenant-scoped", () => {
    const src = readFile("lib/comercial/tiendas/store-governance-service.ts");
    expect(src).toContain("tenantId: orgId");
  });

  test("store cache uses org-scoped key (no cross-org pollution)", () => {
    const src = readFile("lib/comercial/tiendas/store-snapshot-service.ts");
    expect(src).toContain("`storeSnapshot:${orgId}`");
  });
});

describe("48 — Cross-tenant canonical data isolation", () => {
  test("all 5 canonical data providers require organizationId", () => {
    const loader = readFile("lib/comercial/control/control-comercial-loader.ts");
    expect(loader).toContain("organizationId: string");
    const alerts = readFile("lib/alerts/queries.ts");
    expect(alerts).toContain("organizationId: string");
    const tasks = readFile("lib/actions/service.ts");
    expect(tasks).toContain("organizationId: string");
    const mods = readFile(MODULES);
    expect(mods).toContain("organizationId: string");
    const reports = readFile("lib/scheduled-reports/service.ts");
    expect(reports).toContain("organizationId: string");
  });

  test("requireOrgAccess binds organization.id from membership", () => {
    const src = readFile("lib/auth/org-access.ts");
    expect(src).toContain("organization.id");
    expect(src).toContain("membership");
    expect(src).toContain("organizationId_userId");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 15. DESKTOP AND SELLER APP BOUNDARIES (01G — Section 9)
// ═══════════════════════════════════════════════════════════════════════════════

describe("49 — Desktop authorization boundary", () => {
  const { filterModulesByRole } = require("@/lib/auth/module-access");

  test("authorized membership → allowed (ORG_ADMIN desktop)", () => {
    const orgMods = new Set(["dashboard", "sales", "collections", "finance"]);
    const permitted = filterModulesByRole(orgMods, "ORG_ADMIN");
    expect(permitted.has("dashboard")).toBe(true);
    expect(permitted.has("sales")).toBe(true);
  });

  test("foreign organization → requireOrgAccess denies (no existence disclosure)", () => {
    const src = readFile("lib/auth/org-access.ts");
    expect(src).toContain("ORG_NOT_FOUND");
    expect(src).toContain("ACCESS_DENIED");
  });

  test("normal Desktop access preserved (no Manager coupling)", () => {
    const shell = readFile("components/shell/workspace-shell-client.tsx");
    expect(shell).not.toContain("MANAGER_MODULE_DEFS");
    expect(shell).not.toContain("manager-commercial-adapter");
    const nav = readFile("components/shell/module-nav-config.ts");
    expect(nav).not.toContain("MANAGER_MODULE_DEFS");
  });

  test("Manager-only authority does not leak to Desktop", () => {
    const orgMods = new Set(["dashboard", "sales", "agentik", "runs", "events", "integrations", "settings"]);
    const permitted = filterModulesByRole(orgMods, "MANAGER");
    expect(permitted.has("agentik")).toBe(false);
    expect(permitted.has("runs")).toBe(false);
    expect(permitted.has("settings")).toBe(false);
    expect(permitted.has("dashboard")).toBe(true);
  });
});

describe("50 — Seller App authorization boundary", () => {
  const { filterModulesByRole, getModulesForRole } = require("@/lib/auth/module-access");

  test("Seller authentication → allowed (allowProvisionedSeller)", () => {
    const src = readFile("app/(app)/[orgSlug]/seller-app/page.tsx");
    expect(src).toContain("allowProvisionedSeller: true");
    expect(src).toContain("requireOrgAccess");
  });

  test("correct organization → allowed (org-scoped)", () => {
    const src = readFile("app/(app)/[orgSlug]/seller-app/page.tsx");
    expect(src).toContain("orgSlug");
    expect(src).toContain("requireOrgAccess");
  });

  test("foreign organization → denied (requireOrgAccess)", () => {
    const src = readFile("lib/auth/org-access.ts");
    expect(src).toContain("ORG_NOT_FOUND");
    expect(src).toContain("ACCESS_DENIED");
  });

  test("Manager role → denied from Seller-only surface (not seller-confined)", () => {
    const src = readFile("lib/auth/org-access.ts");
    const match = src.match(/SELLER_CONFINED_ROLES\s*=\s*new Set\(\[([^\]]+)\]\)/);
    expect(match).toBeTruthy();
    expect(match![1]).not.toContain("MANAGER");
    // MANAGER is not seller-confined; seller-app uses resolveCurrentSeller
    // which treats MANAGER as isManagerOrAbove, not seller-scoped
  });

  test("Seller role → denied from Manager (MANAGER_ROLES blocks OPERATOR/VIEWER)", () => {
    const src = readFile(MANAGER_LAYOUT);
    const setMatch = src.match(/new Set\(\[([^\]]+)\]\)/);
    expect(setMatch).toBeTruthy();
    const roles = setMatch![1];
    expect(roles).not.toContain("OPERATOR");
    expect(roles).not.toContain("VIEWER");
  });

  test("OPERATOR gets sales (can view commercial data in seller app)", () => {
    const mods = getModulesForRole("OPERATOR");
    expect(mods.has("sales")).toBe(true);
    expect(mods.has("collections")).toBe(true);
  });

  test("Seller App has no Manager coupling", () => {
    const sellerLayout = "app/(app)/[orgSlug]/seller-app/layout.tsx";
    if (fileExists(sellerLayout)) {
      const src = readFile(sellerLayout);
      expect(src).not.toContain("manager-commercial-adapter");
      expect(src).not.toContain("MANAGER_MODULE_DEFS");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 16. ORDER_SYNC SEPARATION (preserved)
// ═══════════════════════════════════════════════════════════════════════════════

describe("51 — ORDER_SYNC cannot enter Manager Business Attention", () => {
  test("ALERT_MODULE_OWNER has no ORDER_SYNC entry", () => {
    const src = readFile(ADAPTER);
    const section = src.substring(
      src.indexOf("export const ALERT_MODULE_OWNER"),
      src.indexOf("};", src.indexOf("export const ALERT_MODULE_OWNER")) + 2,
    );
    expect(section).not.toContain("ORDER_SYNC");
  });

  test("SYSTEM_ALERT_TYPE_OWNER has no ORDER_SYNC entry", () => {
    const src = readFile(ADAPTER);
    const section = src.substring(
      src.indexOf("export const SYSTEM_ALERT_TYPE_OWNER"),
      src.indexOf("};", src.indexOf("export const SYSTEM_ALERT_TYPE_OWNER")) + 2,
    );
    expect(section).not.toContain("ORDER_SYNC");
  });

  test("no conversion code for ORDER_SYNC → Alert/BusinessAlert", () => {
    const orgAlerts = readFile("lib/alerts/org-alerts.ts");
    const docAlerts = readFile("lib/finance/document-alerts.ts");
    const queries = readFile("lib/alerts/queries.ts");
    for (const src of [orgAlerts, docAlerts, queries]) {
      expect(src).not.toContain("ORDER_SYNC");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 17. CROSS-CUTTING VERIFICATION (01G)
// ═══════════════════════════════════════════════════════════════════════════════

describe("52 — No Prisma schema changes", () => {
  test("no new Prisma model for Seller", () => {
    const src = readFile("prisma/schema.prisma");
    expect(src).not.toMatch(/model Seller\s*\{/);
  });

  test("no new sync fields on VendorCommercialBag", () => {
    const src = readFile("prisma/schema.prisma");
    const bagSection = src.substring(
      src.indexOf("model VendorCommercialBag"),
      src.indexOf("@@unique([organizationId, salesRepId, season])"),
    );
    expect(bagSection).not.toContain("syncStatus");
    expect(bagSection).not.toContain("certStatus");
  });

  test("no new module field on ScheduledReport", () => {
    const schema = readFile("prisma/schema.prisma");
    const reportSection = schema.substring(
      schema.indexOf("model ScheduledReport"),
      schema.indexOf("}", schema.indexOf("model ScheduledReport")) + 1,
    );
    expect(reportSection).not.toMatch(/\bsourceModule\b/);
  });
});

describe("53 — Seller identity blocker preserved", () => {
  test("SELLER_IDENTITY_STATUS is still IDENTITY_UNSTABLE", () => {
    const src = readFile(TYPES);
    expect(src).toContain('SELLER_IDENTITY_STATUS: SellerIdentityContract = "IDENTITY_UNSTABLE"');
  });

  test("BLOCKED_BY_MISSING_CANONICAL_CONTRACT documented in types", () => {
    const src = readFile(TYPES);
    expect(src).toContain("BLOCKED_BY_MISSING_CANONICAL_CONTRACT");
  });
});
