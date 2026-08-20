/**
 * lib/auth/__tests__/platform-authority.test.ts
 *
 * PLATFORM-REVIEW-PERSONAS-01: Deterministic tests for platform vs tenant authority.
 *
 * Tests cover the critical scenarios A–L as specified in the sprint gate.
 *
 * ARCHITECTURE NOTE:
 *   The current schema has NO globalRole field on User. Platform authority is
 *   expressed SOLELY via Membership.role = SUPER_ADMIN in the specific org.
 *   Scenarios involving "globalRole + orgRole" as separate fields are IMPOSSIBLE
 *   in the current model — documented below with architectural explanation.
 */

import { describe, test, expect } from "vitest";
import {
  resolvePlatformAuthority,
  resolveTenantAuthority,
  resolveEffectiveAccess,
} from "../platform-authority";
import { getModulesForRole, isInternalRole, filterModulesByRole } from "../module-access";
import type { ModuleKey } from "@/lib/tenant/modules";
import * as fs from "fs";
import * as path from "path";

// ── Helper: build a tenant entitlement set ────────────────────────────────────

function entitled(...keys: ModuleKey[]): Set<ModuleKey> {
  return new Set(keys);
}

// ══════════════════════════════════════════════════════════════════════════════════
// CRITICAL SCENARIOS A–L
// ══════════════════════════════════════════════════════════════════════════════════

describe("SCENARIO A: membershipRole=SUPER_ADMIN → entitlement bypass YES", () => {
  // In the current model, there is no separate globalRole.
  // SUPER_ADMIN as membership role IS the platform authority.
  // The scenario "globalRole=SUPER_ADMIN + orgRole=OPERATOR" is IMPOSSIBLE
  // because there is only ONE role per membership.
  //
  // Adapted: membershipRole=SUPER_ADMIN → bypass=YES.
  test("SUPER_ADMIN membership bypasses entitlements", () => {
    const pa = resolvePlatformAuthority("SUPER_ADMIN");
    expect(pa.bypassEntitlementCensorship).toBe(true);

    const tenant = resolveTenantAuthority("SUPER_ADMIN", entitled(), false);
    const access = resolveEffectiveAccess(pa, tenant, "marketing_studio");
    expect(access.accessible).toBe(true);
    expect(access.showFullNav).toBe(true);
  });
});

describe("SCENARIO B: SUPER_ADMIN without membership → blocked at requireTenant", () => {
  // ARCHITECTURAL IMPOSSIBILITY: requireTenant (lib/tenant.ts:42) throws
  // FORBIDDEN_NOT_MEMBER when no active membership exists.
  // Without membership, the user CANNOT reach the layout at all.
  // The bypass is moot — there's no org context to bypass into.
  //
  // This test documents the architectural constraint.
  test("requireTenant blocks access without membership (documented constraint)", () => {
    // Reading the source to verify the gate exists
    const tenantSrc = fs.readFileSync(
      path.resolve(__dirname, "../../tenant.ts"),
      "utf-8",
    );
    expect(tenantSrc).toContain("FORBIDDEN_NOT_MEMBER");
    expect(tenantSrc).toContain("membership.status !== \"ACTIVE\"");
  });

  test("if membership existed, platform bypass would still apply", () => {
    // Demonstrates that the resolver is role-based, not membership-existence-based
    const pa = resolvePlatformAuthority("SUPER_ADMIN");
    expect(pa.bypassEntitlementCensorship).toBe(true);
  });
});

describe("SCENARIO C: membershipRole=SUPER_ADMIN (no separate globalRole) → bypass YES", () => {
  // In the current model, "globalRole=None + orgRole=SUPER_ADMIN" IS the only
  // way to express platform authority. There is no globalRole field.
  // SUPER_ADMIN as membership role = platform authority.
  test("SUPER_ADMIN membership IS the platform authority source", () => {
    const pa = resolvePlatformAuthority("SUPER_ADMIN");
    expect(pa.isPlatformUser).toBe(true);
    expect(pa.bypassEntitlementCensorship).toBe(true);
    expect(pa.canAccessInternalConsole).toBe(true);
  });
});

describe("SCENARIO D: membershipRole=ORG_ADMIN → bypass NO", () => {
  test("ORG_ADMIN has no platform bypass", () => {
    const pa = resolvePlatformAuthority("ORG_ADMIN");
    expect(pa.isPlatformUser).toBe(false);
    expect(pa.bypassEntitlementCensorship).toBe(false);
    expect(pa.canAccessInternalConsole).toBe(false);
  });

  test("ORG_ADMIN respects tenant entitlements", () => {
    const pa = resolvePlatformAuthority("ORG_ADMIN");
    const tenant = resolveTenantAuthority("ORG_ADMIN", entitled("sales"), false);
    const access = resolveEffectiveAccess(pa, tenant, "marketing_studio");
    expect(access.accessible).toBe(false);
    expect(access.showFullNav).toBe(false);
  });
});

describe("SCENARIO E: membership in tenant 'Agentik' → NOT platform user", () => {
  // The org being "agentik" is IRRELEVANT. Only the membership role matters.
  test("ORG_ADMIN in Agentik org is NOT platform user", () => {
    const pa = resolvePlatformAuthority("ORG_ADMIN");
    expect(pa.isPlatformUser).toBe(false);
  });

  test("OPERATOR in Agentik org is NOT platform user", () => {
    const pa = resolvePlatformAuthority("OPERATOR");
    expect(pa.isPlatformUser).toBe(false);
  });

  test("VIEWER in Agentik org is NOT platform user", () => {
    const pa = resolvePlatformAuthority("VIEWER");
    expect(pa.isPlatformUser).toBe(false);
  });
});

describe("SCENARIO F: email @agentik without SUPER_ADMIN role → bypass NO", () => {
  // The resolver takes Role, not email. Email is NEVER consulted.
  test("resolvePlatformAuthority does NOT accept email — only Role", () => {
    // TypeScript enforcement: the function signature only accepts Role
    // Any non-SUPER_ADMIN/AGENTIK_ADMIN role → no platform authority
    const pa = resolvePlatformAuthority("ORG_ADMIN");
    expect(pa.isPlatformUser).toBe(false);
    expect(pa.bypassEntitlementCensorship).toBe(false);
  });

  test("no email-based logic exists in platform-authority.ts", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../platform-authority.ts"),
      "utf-8",
    );
    // No email parameters in function signatures (strip comments first)
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
    expect(codeOnly).not.toMatch(/email/i);
    expect(codeOnly).not.toContain("@agentik");
    expect(codeOnly).not.toContain("agentik.com");
  });
});

describe("SCENARIO G: external email with SUPER_ADMIN membership → bypass YES", () => {
  // Any account with SUPER_ADMIN membership = platform user, regardless of email
  test("platform authority depends ONLY on role, not email domain", () => {
    const pa = resolvePlatformAuthority("SUPER_ADMIN");
    expect(pa.isPlatformUser).toBe(true);
    expect(pa.bypassEntitlementCensorship).toBe(true);
  });
});

describe("SCENARIO H: changing tenant preserves platform authority", () => {
  // Platform authority is resolved per-request from membership.role.
  // Switching org → different membership → but if role=SUPER_ADMIN in new org, same result.
  test("platform authority is stable across org contexts if role is preserved", () => {
    const inOrgA = resolvePlatformAuthority("SUPER_ADMIN");
    const inOrgB = resolvePlatformAuthority("SUPER_ADMIN");
    expect(inOrgA.isPlatformUser).toBe(true);
    expect(inOrgB.isPlatformUser).toBe(true);
    expect(inOrgA.bypassEntitlementCensorship).toBe(true);
    expect(inOrgB.bypassEntitlementCensorship).toBe(true);
  });

  test("data scope changes but authority does not", () => {
    // Different entitled modules per org, but platform bypass is the same
    const pa = resolvePlatformAuthority("SUPER_ADMIN");
    const tenantA = resolveTenantAuthority("SUPER_ADMIN", entitled("sales"), false);
    const tenantB = resolveTenantAuthority("SUPER_ADMIN", entitled("finance"), false);

    const accessA = resolveEffectiveAccess(pa, tenantA, "production");
    const accessB = resolveEffectiveAccess(pa, tenantB, "production");
    expect(accessA.accessible).toBe(true);
    expect(accessB.accessible).toBe(true);
  });
});

describe("SCENARIO I: UI and route guard use the same authority source", () => {
  test("layout uses platformAuth for both mods and orgEntitledModules", () => {
    const layoutSrc = fs.readFileSync(
      path.resolve(__dirname, "../../../app/(app)/[orgSlug]/layout.tsx"),
      "utf-8",
    );
    // The layout imports and uses resolvePlatformAuthority
    expect(layoutSrc).toContain("resolvePlatformAuthority");
    // Both mods (route guard source) and orgEntitledModules (nav source) use platformAuth
    expect(layoutSrc).toContain("platformAuth.bypassEntitlementCensorship");
    // Route guard: isBlocked uses `mods` which is derived from platformAuth bypass
    expect(layoutSrc).toContain("const isBlocked   = routeModule !== null && !mods.has(routeModule)");
    // Nav: orgEntitledModules uses same platformAuth
    expect(layoutSrc).toContain("orgEntitledModules: platformAuth.bypassEntitlementCensorship ? undefined : orgMods");
  });
});

describe("SCENARIO J: SUPER_ADMIN sees Marketing navigable", () => {
  test("Marketing Studio accessible with empty tenant entitlements", () => {
    const pa = resolvePlatformAuthority("SUPER_ADMIN");
    const tenant = resolveTenantAuthority("SUPER_ADMIN", entitled(), false);
    const access = resolveEffectiveAccess(pa, tenant, "marketing_studio");
    expect(access.accessible).toBe(true);
    expect(access.showFullNav).toBe(true);
    expect(access.grantedBy).toBe("platform");
  });

  test("getModulesForRole(SUPER_ADMIN) includes marketing_studio", () => {
    const mods = getModulesForRole("SUPER_ADMIN");
    expect(mods.has("marketing_studio")).toBe(true);
  });
});

describe("SCENARIO K: ORG_ADMIN sees 'Próximamente' when tenant not entitled", () => {
  test("ORG_ADMIN without marketing_studio entitlement → not accessible", () => {
    const pa = resolvePlatformAuthority("ORG_ADMIN");
    const tenant = resolveTenantAuthority("ORG_ADMIN", entitled("sales", "dashboard"), false);
    const access = resolveEffectiveAccess(pa, tenant, "marketing_studio");
    expect(access.accessible).toBe(false);
    expect(access.showFullNav).toBe(false);
  });

  test("ORG_ADMIN with marketing_studio entitlement → accessible", () => {
    const pa = resolvePlatformAuthority("ORG_ADMIN");
    const tenant = resolveTenantAuthority("ORG_ADMIN", entitled("sales", "marketing_studio"), false);
    const access = resolveEffectiveAccess(pa, tenant, "marketing_studio");
    expect(access.accessible).toBe(true);
    expect(access.showFullNav).toBe(true);
  });

  test("filterModulesByRole enforces intersection for ORG_ADMIN", () => {
    const orgMods = entitled("sales", "dashboard") as Set<ModuleKey>;
    const filtered = filterModulesByRole(orgMods, "ORG_ADMIN");
    expect(filtered.has("marketing_studio")).toBe(false);
    expect(filtered.has("sales")).toBe(true);
  });
});

describe("SCENARIO L: Seller continues confined", () => {
  test("OPERATOR has no platform authority", () => {
    const pa = resolvePlatformAuthority("OPERATOR");
    expect(pa.isPlatformUser).toBe(false);
    expect(pa.bypassEntitlementCensorship).toBe(false);
    expect(pa.canAccessInternalConsole).toBe(false);
  });

  test("OPERATOR cannot access executive/finance modules", () => {
    const pa = resolvePlatformAuthority("OPERATOR");
    const tenant = resolveTenantAuthority("OPERATOR", entitled("finance", "torre_control", "agentik"), false);
    expect(resolveEffectiveAccess(pa, tenant, "finance").accessible).toBe(false);
    expect(resolveEffectiveAccess(pa, tenant, "torre_control").accessible).toBe(false);
    expect(resolveEffectiveAccess(pa, tenant, "agentik").accessible).toBe(false);
  });

  test("seller confinement gate exists in layout", () => {
    const layoutSrc = fs.readFileSync(
      path.resolve(__dirname, "../../../app/(app)/[orgSlug]/layout.tsx"),
      "utf-8",
    );
    expect(layoutSrc).toContain("SELLER_CONFINED_ROLES");
    expect(layoutSrc).toContain("sellerSlug");
    expect(layoutSrc).toContain("seller-app");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════
// IDENTITY BOUNDARY TESTS (Addendum)
// ══════════════════════════════════════════════════════════════════════════════════

describe("platform/tenant identity boundary — addendum tests", () => {
  test("1. SUPER_ADMIN membership = platform authority (no separate globalRole)", () => {
    const pa = resolvePlatformAuthority("SUPER_ADMIN");
    expect(pa.isPlatformUser).toBe(true);
  });

  test("2. SUPER_ADMIN with tenant selected conserves authority", () => {
    const pa = resolvePlatformAuthority("SUPER_ADMIN");
    expect(pa.bypassEntitlementCensorship).toBe(true);
  });

  test("4. ORG_ADMIN of tenant Agentik ≠ platform user", () => {
    const pa = resolvePlatformAuthority("ORG_ADMIN");
    expect(pa.isPlatformUser).toBe(false);
  });

  test("5. Seller (OPERATOR) of tenant Agentik ≠ platform user", () => {
    const pa = resolvePlatformAuthority("OPERATOR");
    expect(pa.isPlatformUser).toBe(false);
  });

  test("6. @agentik email without platform role → no bypass", () => {
    // Email is never a factor — only Role
    const pa = resolvePlatformAuthority("VIEWER");
    expect(pa.isPlatformUser).toBe(false);
  });

  test("7. External email with SUPER_ADMIN → platform authority", () => {
    const pa = resolvePlatformAuthority("SUPER_ADMIN");
    expect(pa.isPlatformUser).toBe(true);
  });

  test("10. platform-authority.ts only classifies SUPER_ADMIN and AGENTIK_ADMIN as platform", () => {
    const nonPlatform = ["ORG_ADMIN", "MANAGER", "OPERATOR", "VIEWER", "BILLING"] as const;
    for (const role of nonPlatform) {
      const pa = resolvePlatformAuthority(role);
      expect(pa.isPlatformUser).toBe(false);
    }
  });

  test("11. data filtered by tenant — grantedBy always identifies source", () => {
    const pa = resolvePlatformAuthority("SUPER_ADMIN");
    const tenant = resolveTenantAuthority("SUPER_ADMIN", entitled("finance"), false);
    const access = resolveEffectiveAccess(pa, tenant, "finance");
    expect(access.grantedBy).toBe("platform");
  });

  test("12. no email hardcoded in resolver or layout", () => {
    const resolverSrc = fs.readFileSync(
      path.resolve(__dirname, "../platform-authority.ts"),
      "utf-8",
    );
    const layoutSrc = fs.readFileSync(
      path.resolve(__dirname, "../../../app/(app)/[orgSlug]/layout.tsx"),
      "utf-8",
    );
    // No hardcoded emails for authorization
    expect(resolverSrc).not.toMatch(/@agentik|@gmail|hello@/);
    expect(layoutSrc).not.toMatch(/@agentik|@gmail|hello@/);
  });

  test("13. changing tenant does not modify stored roles", () => {
    // resolvePlatformAuthority is pure — reads role, never writes
    const src = fs.readFileSync(
      path.resolve(__dirname, "../platform-authority.ts"),
      "utf-8",
    );
    // No database imports — function is pure
    expect(src).not.toContain("from \"@/lib/prisma\"");
    expect(src).not.toContain("import { prisma }");
    // No mutation functions
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.create\(/);
    expect(src).not.toMatch(/\.delete\(/);
  });

  test("15. revoking platform role removes authority on next resolution", () => {
    const before = resolvePlatformAuthority("SUPER_ADMIN");
    const after = resolvePlatformAuthority("ORG_ADMIN");
    expect(before.bypassEntitlementCensorship).toBe(true);
    expect(after.bypassEntitlementCensorship).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════
// REGRESSION — existing module-access behavior preserved
// ══════════════════════════════════════════════════════════════════════════════════

describe("regression — module-access integration", () => {
  test("isInternalRole matches platformAuth.canAccessInternalConsole", () => {
    expect(isInternalRole("SUPER_ADMIN")).toBe(resolvePlatformAuthority("SUPER_ADMIN").canAccessInternalConsole);
    expect(isInternalRole("AGENTIK_ADMIN")).toBe(resolvePlatformAuthority("AGENTIK_ADMIN").canAccessInternalConsole);
    expect(isInternalRole("ORG_ADMIN")).toBe(resolvePlatformAuthority("ORG_ADMIN").canAccessInternalConsole);
    expect(isInternalRole("MANAGER")).toBe(resolvePlatformAuthority("MANAGER").canAccessInternalConsole);
  });

  test("SUPER_ADMIN getModulesForRole includes all domains", () => {
    const mods = getModulesForRole("SUPER_ADMIN");
    expect(mods.has("marketing_studio")).toBe(true);
    expect(mods.has("production")).toBe(true);
    expect(mods.has("finance")).toBe(true);
    expect(mods.has("agentik")).toBe(true);
    expect(mods.has("sales")).toBe(true);
    expect(mods.has("collections")).toBe(true);
  });
});
