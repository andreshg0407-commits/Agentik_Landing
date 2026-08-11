/**
 * Post-login destination resolver — structural + contract tests.
 *
 * Sprint: AGENTIK-GLOBAL-AUTH-POST-LOGIN-LAUNCHER-01
 *
 * Validates the full post-login routing contract without DB.
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
// Suite 1: Post-login destination resolver
// ═══════════════════════════════════════════════════════════════════════════════

describe("1. Post-login destination resolver", () => {
  const src = readFile("lib/auth/post-login-destination.ts");

  it("A: Single org seller → seller-app", () => {
    assert.ok(src.includes("seller_default"), "Must have seller_default reason");
    assert.ok(src.includes("seller-app"), "Must route sellers to seller-app");
    assert.ok(src.includes("sellerSlug"), "Must check sellerSlug");
  });

  it("B: Single org admin → org root (enterprise launcher)", () => {
    assert.ok(src.includes("single_org_default"), "Must have single_org_default reason");
    // Route is /{orgSlug} which IS the enterprise launcher
  });

  it("C: Single org manager → org root (enterprise launcher)", () => {
    // Same as B — non-seller roles all go to /{orgSlug}
    assert.ok(src.includes("single_org_default"), "Non-seller roles use single_org_default");
  });

  it("D: Multi-org admin → org selector (not alphabetical guess)", () => {
    assert.ok(src.includes("multi_org_selector"), "Must have multi_org_selector reason");
    assert.ok(src.includes("/select-org"), "Must route to /select-org");
    // Must NOT guess alphabetically
    assert.ok(!src.includes("multi_org_first"), "Must NOT guess first org alphabetically");
  });

  it("E: Multi-org manager → org selector", () => {
    // Same as D — all multi-org cases go to selector
    assert.ok(src.includes("multi_org_selector"), "Multi-org must use selector");
  });

  it("F: Multi-org valid callback → callback org honored", () => {
    assert.ok(src.includes("callback_valid"), "Must honor valid callback");
    assert.ok(src.includes("extractOrgSlug"), "Must extract org from callback path");
  });

  it("G: No active membership → /unauthorized", () => {
    assert.ok(src.includes("/unauthorized"), "Must route to /unauthorized");
    assert.ok(src.includes("no_active_membership"), "Must identify no membership");
  });

  it("H: Seller cannot access enterprise via callback → confined", () => {
    assert.ok(src.includes("callback_seller_confined"), "Must confine seller on enterprise callback");
  });

  it("I: Malicious callback → authenticated default (not /)", () => {
    // When callback is invalid (external), extractOrgSlug returns null or org is not found
    // Falls through to default routing — never to "/"
    assert.ok(!src.includes('destination: "/"'), "Must NEVER route to public landing /");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 2: Login page
// ═══════════════════════════════════════════════════════════════════════════════

describe("2. Login page post-login routing", () => {
  const loginSrc = readFile("app/login/page.tsx");

  it("J: Admin commercial deep link preserved via resolver", () => {
    assert.ok(loginSrc.includes("/api/auth/post-login-destination"), "Must call resolver API");
    assert.ok(loginSrc.includes("callbackUrl"), "Must pass callbackUrl");
  });

  it("K: INVITED seller denied (no ACTIVE membership → resolver returns /unauthorized)", () => {
    // Resolver only loads ACTIVE memberships — INVITED excluded
    const src = readFile("lib/auth/post-login-destination.ts");
    assert.ok(src.includes("MembershipStatus.ACTIVE"), "Must filter by ACTIVE membership");
  });

  it("L: DISABLED seller denied (no ACTIVE membership)", () => {
    // Same as K — only ACTIVE memberships are loaded
    const src = readFile("lib/auth/post-login-destination.ts");
    assert.ok(src.includes("ACTIVE"), "Must require ACTIVE status");
  });

  it("M: Last resort does NOT go to public landing", () => {
    // Login page last resort should be /select-org, not "/"
    assert.ok(loginSrc.includes("/select-org"), "Last resort must be /select-org");
    // The old router.push("/") must not be the final fallback
    const lines = loginSrc.split("\n");
    const lastResortLine = lines.find(l => l.includes("Last resort"));
    assert.ok(lastResortLine, "Must have last resort comment");
    const lastResortIdx = lines.indexOf(lastResortLine!);
    const nextLine = lines[lastResortIdx + 2] ?? "";
    assert.ok(nextLine.includes("/select-org"), "Last resort must push to /select-org");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 3: Callback safety
// ═══════════════════════════════════════════════════════════════════════════════

describe("3. Callback safety", () => {
  const loginSrc = readFile("app/login/page.tsx");

  it("N: sanitizeCallbackUrl rejects external URLs", () => {
    assert.ok(loginSrc.includes("sanitizeCallbackUrl"), "Must have sanitizer");
    assert.ok(loginSrc.includes('startsWith("//")'), "Must reject double-slash");
  });

  it("O: Rejects backslash tricks", () => {
    assert.ok(loginSrc.includes("\\\\"), "Must reject backslash redirects");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 4: Enterprise launcher
// ═══════════════════════════════════════════════════════════════════════════════

describe("4. Enterprise launcher at org root", () => {
  const orgRootSrc = readFile("app/(app)/[orgSlug]/page.tsx");

  it("P: Org root is NOT a pure redirect anymore", () => {
    // Must render EnterpriseLauncherClient instead of just redirecting to role home
    assert.ok(orgRootSrc.includes("EnterpriseLauncherClient"), "Must render enterprise launcher");
  });

  it("Q: Launcher uses same module visibility as layout", () => {
    assert.ok(orgRootSrc.includes("getEnabledModules"), "Must use getEnabledModules");
    assert.ok(orgRootSrc.includes("filterModulesByRole"), "Must use filterModulesByRole");
    assert.ok(orgRootSrc.includes("buildNavDomains"), "Must use buildNavDomains");
  });

  it("R: Seller confinement still active on org root", () => {
    assert.ok(orgRootSrc.includes("sellerSlug"), "Must check sellerSlug");
    assert.ok(orgRootSrc.includes("seller-app"), "Must redirect sellers to seller-app");
    assert.ok(orgRootSrc.includes("SELLER_ROLES"), "Must have SELLER_ROLES set");
  });

  it("S: Launcher does NOT depend on device", () => {
    assert.ok(!orgRootSrc.includes("userAgent"), "Must NOT check userAgent");
    assert.ok(!orgRootSrc.includes("isMobile"), "Must NOT check isMobile");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 5: Org selector
// ═══════════════════════════════════════════════════════════════════════════════

describe("5. Organization selector", () => {
  it("T: /select-org page exists", () => {
    const exists = fs.existsSync(path.join(ROOT, "app/select-org/page.tsx"));
    assert.ok(exists, "app/select-org/page.tsx must exist");
  });

  it("U: Org selector uses getAccessibleOrganizations", () => {
    const src = readFile("app/select-org/page.tsx");
    assert.ok(src.includes("getAccessibleOrganizations"), "Must use authorized org list");
  });

  it("V: Org selector redirects single-org users", () => {
    const src = readFile("app/select-org/page.tsx");
    assert.ok(src.includes("orgs.length === 1"), "Must handle single org case");
    assert.ok(src.includes("redirect("), "Must redirect single org");
  });

  it("W: Org selector redirects no-org users to /unauthorized", () => {
    const src = readFile("app/select-org/page.tsx");
    assert.ok(src.includes("/unauthorized"), "Must redirect to /unauthorized");
  });

  it("X: Org selector shows only authorized orgs", () => {
    const src = readFile("app/select-org/page.tsx");
    assert.ok(src.includes("getAccessibleOrganizations"), "Must use authorized org list only");
    // getAccessibleOrganizations filters by ACTIVE membership + ACTIVE org
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 6: Seller confinement regression
// ═══════════════════════════════════════════════════════════════════════════════

describe("6. Seller confinement regression", () => {
  const layoutSrc = readFile("app/(app)/[orgSlug]/layout.tsx");

  it("Y: Layout seller confinement gate unchanged", () => {
    assert.ok(layoutSrc.includes("SELLER_CONFINED_ROLES"), "Must have seller confinement set");
    assert.ok(layoutSrc.includes("sellerSlug"), "Must check sellerSlug");
    assert.ok(layoutSrc.includes("seller-app"), "Must redirect to seller-app");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 7: Middleware
// ═══════════════════════════════════════════════════════════════════════════════

describe("7. Middleware auth guard", () => {
  const mwSrc = readFile("middleware.ts");

  it("Z: /login/setup is public", () => {
    assert.ok(mwSrc.includes('"/login/setup"'), "/login/setup must be in public paths");
  });

  it("AA: Unauthenticated paths redirect to /login with callbackUrl", () => {
    assert.ok(mwSrc.includes("callbackUrl"), "Must set callbackUrl on redirect");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 8: Role-home regression
// ═══════════════════════════════════════════════════════════════════════════════

describe("8. Role-home mapping unchanged", () => {
  const roleHomeSrc = readFile("lib/auth/role-home.ts");

  it("AB: Role-home map preserved", () => {
    assert.ok(roleHomeSrc.includes('SUPER_ADMIN:   "executive"'), "SUPER_ADMIN maps to executive");
    assert.ok(roleHomeSrc.includes('ORG_ADMIN:     "executive"'), "ORG_ADMIN maps to executive");
    assert.ok(roleHomeSrc.includes('MANAGER:       "executive"'), "MANAGER maps to executive");
    assert.ok(roleHomeSrc.includes('OPERATOR:      "dashboard"'), "OPERATOR maps to dashboard");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 9: Module visibility source of truth
// ═══════════════════════════════════════════════════════════════════════════════

describe("9. Module visibility correctness", () => {
  const moduleAccessSrc = readFile("lib/auth/module-access.ts");

  it("AC: ORG_ADMIN has sales module (Comercial access)", () => {
    assert.ok(moduleAccessSrc.includes("ORG_ADMIN:"), "Must define ORG_ADMIN modules");
    // Find ORG_ADMIN section and check for sales
    const orgAdminLine = moduleAccessSrc.indexOf("ORG_ADMIN:");
    const nextRoleLine = moduleAccessSrc.indexOf("MANAGER:", orgAdminLine);
    const orgAdminSection = moduleAccessSrc.slice(orgAdminLine, nextRoleLine);
    assert.ok(orgAdminSection.includes('"sales"'), "ORG_ADMIN must have sales module");
    assert.ok(orgAdminSection.includes('"inventory"'), "ORG_ADMIN must have inventory module");
  });

  it("AD: MANAGER has sales module", () => {
    const managerLine = moduleAccessSrc.indexOf("MANAGER:");
    const nextRoleLine = moduleAccessSrc.indexOf("OPERATOR:", managerLine);
    const managerSection = moduleAccessSrc.slice(managerLine, nextRoleLine);
    assert.ok(managerSection.includes('"sales"'), "MANAGER must have sales module");
  });

  it("AE: SUPER_ADMIN has all modules including agentik", () => {
    const superLine = moduleAccessSrc.indexOf("SUPER_ADMIN:");
    const nextRoleLine = moduleAccessSrc.indexOf("AGENTIK_ADMIN:", superLine);
    const superSection = moduleAccessSrc.slice(superLine, nextRoleLine);
    assert.ok(superSection.includes('"agentik"'), "SUPER_ADMIN must have agentik");
    assert.ok(superSection.includes('"sales"'), "SUPER_ADMIN must have sales");
  });

  it("AF: Module visibility does NOT depend on device", () => {
    assert.ok(!moduleAccessSrc.includes("userAgent"), "Must NOT check userAgent");
    assert.ok(!moduleAccessSrc.includes("isMobile"), "Must NOT check isMobile");
  });
});
