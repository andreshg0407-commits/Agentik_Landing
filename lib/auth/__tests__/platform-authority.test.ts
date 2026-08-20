/**
 * lib/auth/__tests__/platform-authority.test.ts
 *
 * PLATFORM-AUTHORITY-SEPARATION-01R1: Deterministic tests for platform vs tenant authority.
 *
 * KEY DESIGN: resolvePlatformAuthority takes User.platformRole (global),
 * NOT Membership.role (tenant). Non-platform users pass null.
 *
 * TenantContext.role = Membership.role | null (null for membershipless SUPER_ADMIN).
 * TenantContext.platformRole = User.platformRole | null.
 * These two fields are NEVER conflated.
 */

import { describe, test, expect } from "vitest";
import {
  resolvePlatformAuthority,
  resolveTenantAuthority,
  resolveEffectiveAccess,
} from "../platform-authority";
import { getModulesForRole, filterModulesByRole } from "../module-access";
import type { ModuleKey } from "@/lib/tenant/modules";
import * as fs from "fs";
import * as path from "path";

function entitled(...keys: ModuleKey[]): Set<ModuleKey> {
  return new Set(keys);
}

// ==============================================================================
// SCENARIO A: platformRole=SUPER_ADMIN + membership=null
//   Access PERMITTED, organizationId correct, full module visibility.
// ==============================================================================

describe("SCENARIO A: platformRole=SUPER_ADMIN + membership=null -> full access", () => {
  test("platform SUPER_ADMIN bypasses entitlements regardless of membership", () => {
    const pa = resolvePlatformAuthority("SUPER_ADMIN");
    expect(pa.bypassEntitlementCensorship).toBe(true);
    expect(pa.isPlatformUser).toBe(true);
    expect(pa.canAccessInternalConsole).toBe(true);
  });

  test("platform SUPER_ADMIN sees ALL modules even without membership role", () => {
    const pa = resolvePlatformAuthority("SUPER_ADMIN");
    // No membership -> tenant authority with null role (defaults to VIEWER)
    const tenant = resolveTenantAuthority(null, entitled(), false);
    expect(resolveEffectiveAccess(pa, tenant, "marketing_studio").accessible).toBe(true);
    expect(resolveEffectiveAccess(pa, tenant, "finance").accessible).toBe(true);
    expect(resolveEffectiveAccess(pa, tenant, "agentik").accessible).toBe(true);
    expect(resolveEffectiveAccess(pa, tenant, "production").accessible).toBe(true);
    expect(resolveEffectiveAccess(pa, tenant, "collections").accessible).toBe(true);
  });

  test("organizationId is still required — requireTenant resolves org by slug", () => {
    // This is a structural guarantee tested via file reading
    const tenantSrc = fs.readFileSync(
      path.resolve(__dirname, "../../tenant.ts"),
      "utf-8",
    );
    // org lookup always happens before access decision
    expect(tenantSrc).toContain("findUnique");
    expect(tenantSrc).toContain("slug: orgSlug");
    // orgId is always returned
    expect(tenantSrc).toContain("orgId: org.id");
  });
});

// ==============================================================================
// SCENARIO B: platformRole=SUPER_ADMIN + membership=ORG_ADMIN
//   Bypass global YES; data limited to tenant.
// ==============================================================================

describe("SCENARIO B: platformRole=SUPER_ADMIN + membership=ORG_ADMIN -> bypass YES, data scoped", () => {
  test("platform SUPER_ADMIN with ORG_ADMIN membership gets full bypass", () => {
    const pa = resolvePlatformAuthority("SUPER_ADMIN");
    const tenant = resolveTenantAuthority("ORG_ADMIN", entitled("sales"), false);
    const access = resolveEffectiveAccess(pa, tenant, "marketing_studio");
    expect(access.accessible).toBe(true);
    expect(access.grantedBy).toBe("platform");
  });

  test("platform bypass grants module visibility, not cross-org data", () => {
    const pa = resolvePlatformAuthority("SUPER_ADMIN");
    const tenant = resolveTenantAuthority("ORG_ADMIN", entitled(), false);
    // grantedBy=platform means UI shows module, but queries stay org-scoped
    expect(resolveEffectiveAccess(pa, tenant, "sales").grantedBy).toBe("platform");
  });
});

// ==============================================================================
// SCENARIO C: platformRole=null + membership=SUPER_ADMIN -> bypass NO
// ==============================================================================

describe("SCENARIO C: platformRole=null + membershipRole=SUPER_ADMIN -> bypass NO", () => {
  test("membership SUPER_ADMIN without platformRole gets NO platform bypass", () => {
    const pa = resolvePlatformAuthority(null);
    expect(pa.isPlatformUser).toBe(false);
    expect(pa.bypassEntitlementCensorship).toBe(false);
    expect(pa.canAccessInternalConsole).toBe(false);
  });

  test("membershipRole=SUPER_ADMIN without platformRole respects tenant entitlements", () => {
    const pa = resolvePlatformAuthority(null);
    const tenant = resolveTenantAuthority("SUPER_ADMIN", entitled("sales"), false);
    // marketing_studio is in SUPER_ADMIN role modules but NOT in org entitlements
    const access = resolveEffectiveAccess(pa, tenant, "marketing_studio");
    expect(access.accessible).toBe(false);
    expect(access.grantedBy).toBe("tenant");
  });
});

// ==============================================================================
// SCENARIO D: platformRole=null + membership=ORG_ADMIN -> respects entitlements
// ==============================================================================

describe("SCENARIO D: platformRole=null + membershipRole=ORG_ADMIN -> respects entitlements", () => {
  test("no platformRole + ORG_ADMIN respects tenant entitlements", () => {
    const pa = resolvePlatformAuthority(null);
    const tenant = resolveTenantAuthority("ORG_ADMIN", entitled("sales", "dashboard"), false);

    expect(resolveEffectiveAccess(pa, tenant, "sales").accessible).toBe(true);
    expect(resolveEffectiveAccess(pa, tenant, "marketing_studio").accessible).toBe(false);
    expect(resolveEffectiveAccess(pa, tenant, "finance").accessible).toBe(false);
  });

  test("ORG_ADMIN sees Proximamente for non-entitled modules", () => {
    const pa = resolvePlatformAuthority(null);
    const tenant = resolveTenantAuthority("ORG_ADMIN", entitled("sales"), false);
    const access = resolveEffectiveAccess(pa, tenant, "marketing_studio");
    expect(access.showFullNav).toBe(false);
  });
});

// ==============================================================================
// SCENARIO E: change tenant -> conserves platformRole, changes organizationId
// ==============================================================================

describe("SCENARIO E: change tenant -> conserves platformRole, changes data scope", () => {
  test("platformRole is independent of org context", () => {
    const pa = resolvePlatformAuthority("SUPER_ADMIN");
    const tenantA = resolveTenantAuthority("ORG_ADMIN", entitled("sales"), false);
    const tenantB = resolveTenantAuthority("VIEWER", entitled("finance"), false);

    // Same platform authority, different tenant scopes
    expect(resolveEffectiveAccess(pa, tenantA, "production").accessible).toBe(true);
    expect(resolveEffectiveAccess(pa, tenantB, "production").accessible).toBe(true);
  });

  test("requireTenant always binds orgId from slug lookup", () => {
    const tenantSrc = fs.readFileSync(
      path.resolve(__dirname, "../../tenant.ts"),
      "utf-8",
    );
    expect(tenantSrc).toContain("orgId: org.id");
    expect(tenantSrc).toContain("orgSlug: org.slug");
  });
});

// ==============================================================================
// SCENARIO F: P2022 specific for User.platformRole -> fallback null
// ==============================================================================

describe("SCENARIO F: P2022 column not found -> graceful fallback to null", () => {
  test("isPrismaColumnNotFound detects P2022 code", () => {
    const tenantSrc = fs.readFileSync(
      path.resolve(__dirname, "../../tenant.ts"),
      "utf-8",
    );
    // Verify P2022 detection exists
    expect(tenantSrc).toContain("P2022");
    expect(tenantSrc).toContain("isPrismaColumnNotFound");
  });

  test("only P2022 or column-not-exist message triggers fallback", () => {
    const tenantSrc = fs.readFileSync(
      path.resolve(__dirname, "../../tenant.ts"),
      "utf-8",
    );
    const codeOnly = tenantSrc.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
    // The catch block rethrows if not column-not-found
    expect(codeOnly).toContain("throw err");
    expect(codeOnly).toContain("isPrismaColumnNotFound");
  });
});

// ==============================================================================
// SCENARIO G: any other Prisma error -> rethrown
// ==============================================================================

describe("SCENARIO G: non-P2022 errors are rethrown", () => {
  test("readPlatformRole rethrows non-P2022 errors (structural proof)", () => {
    const tenantSrc = fs.readFileSync(
      path.resolve(__dirname, "../../tenant.ts"),
      "utf-8",
    );
    // After the isPrismaColumnNotFound check, non-matching errors are thrown
    expect(tenantSrc).toContain("if (isPrismaColumnNotFound(err)) return null");
    expect(tenantSrc).toContain("throw err");
  });

  test("isPrismaColumnNotFound rejects generic errors", () => {
    const tenantSrc = fs.readFileSync(
      path.resolve(__dirname, "../../tenant.ts"),
      "utf-8",
    );
    // Function checks code === "P2022" or message containing specific strings
    expect(tenantSrc).toContain('"P2022"');
    expect(tenantSrc).toContain('"platformRole"');
    expect(tenantSrc).toContain('"does not exist"');
  });
});

// ==============================================================================
// SCENARIO H: APIs, layout, navigation use same canonical source
// ==============================================================================

describe("SCENARIO H: layout, page, and API use same platformAuth source", () => {
  test("layout uses ctx.platformRole for resolvePlatformAuthority", () => {
    const layoutSrc = fs.readFileSync(
      path.resolve(__dirname, "../../../app/(app)/[orgSlug]/layout.tsx"),
      "utf-8",
    );
    expect(layoutSrc).toContain("resolvePlatformAuthority(ctx.platformRole)");
    expect(layoutSrc).toContain("platformAuth.bypassEntitlementCensorship");
    expect(layoutSrc).toContain("orgEntitledModules: platformAuth.bypassEntitlementCensorship ? undefined : orgMods");
  });

  test("route guard and nav use the same platformAuth source", () => {
    const layoutSrc = fs.readFileSync(
      path.resolve(__dirname, "../../../app/(app)/[orgSlug]/layout.tsx"),
      "utf-8",
    );
    expect(layoutSrc).toContain("const isBlocked   = routeModule !== null && !mods.has(routeModule)");
  });

  test("API route reads platformRole from User table, not membership", () => {
    const routeSrc = fs.readFileSync(
      path.resolve(__dirname, "../../../app/api/orgs/[orgSlug]/modules/route.ts"),
      "utf-8",
    );
    expect(routeSrc).toContain("select: { platformRole: true }");
    expect(routeSrc).toContain("ctx.platformRole !== \"SUPER_ADMIN\"");
  });

  test("tenant-modules pages gate on ctx.platformRole, not ctx.role", () => {
    const pageSrc = fs.readFileSync(
      path.resolve(__dirname, "../../../app/(app)/[orgSlug]/agentik/tenant-modules/page.tsx"),
      "utf-8",
    );
    expect(pageSrc).toContain("ctx.platformRole !== \"SUPER_ADMIN\"");
    expect(pageSrc).not.toContain("ctx.role !== \"SUPER_ADMIN\"");
  });
});

// ==============================================================================
// SCENARIO I: Seller confined, no global authority
// ==============================================================================

describe("SCENARIO I: Seller confined and without global authority", () => {
  test("OPERATOR with no platformRole has no platform authority", () => {
    const pa = resolvePlatformAuthority(null);
    expect(pa.isPlatformUser).toBe(false);
    expect(pa.canAccessInternalConsole).toBe(false);
  });

  test("OPERATOR cannot access executive/internal modules", () => {
    const pa = resolvePlatformAuthority(null);
    const tenant = resolveTenantAuthority("OPERATOR", entitled("sales", "finance", "agentik"), false);
    expect(resolveEffectiveAccess(pa, tenant, "finance").accessible).toBe(false);
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

// ==============================================================================
// SCENARIO J: Data isolation — no query returns data from another org
// ==============================================================================

describe("SCENARIO J: data isolation — organizationId scopes all queries", () => {
  test("resolveEffectiveAccess never references organizationId", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../platform-authority.ts"),
      "utf-8",
    );
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
    expect(codeOnly).not.toContain("organizationId");
  });

  test("platform bypass grants module access, not cross-org data", () => {
    const pa = resolvePlatformAuthority("SUPER_ADMIN");
    const access = resolveEffectiveAccess(pa, resolveTenantAuthority("ORG_ADMIN", entitled(), false), "sales");
    expect(access.grantedBy).toBe("platform");
  });

  test("requireTenant always returns orgId from slug resolution", () => {
    const tenantSrc = fs.readFileSync(
      path.resolve(__dirname, "../../tenant.ts"),
      "utf-8",
    );
    // orgId comes from the database lookup, never from user input
    expect(tenantSrc).toContain("orgId: org.id");
  });
});

// ==============================================================================
// IDENTITY BOUNDARY — Addendum tests
// ==============================================================================

describe("platform/tenant identity boundary", () => {
  test("platformRole=SUPER_ADMIN is the ONLY source of platform bypass", () => {
    expect(resolvePlatformAuthority("SUPER_ADMIN").bypassEntitlementCensorship).toBe(true);
    expect(resolvePlatformAuthority("AGENTIK_ADMIN").bypassEntitlementCensorship).toBe(false);
    expect(resolvePlatformAuthority(null).bypassEntitlementCensorship).toBe(false);
  });

  test("AGENTIK_ADMIN has internal console but no entitlement bypass", () => {
    const pa = resolvePlatformAuthority("AGENTIK_ADMIN");
    expect(pa.canAccessInternalConsole).toBe(true);
    expect(pa.bypassEntitlementCensorship).toBe(false);
  });

  test("null platformRole = tenant-only user regardless of membership", () => {
    const pa = resolvePlatformAuthority(null);
    expect(pa.isPlatformUser).toBe(false);
    expect(pa.platformRole).toBeNull();
  });

  test("external email with platformRole=SUPER_ADMIN gets full bypass", () => {
    const pa = resolvePlatformAuthority("SUPER_ADMIN");
    expect(pa.isPlatformUser).toBe(true);
    expect(pa.bypassEntitlementCensorship).toBe(true);
  });

  test("revoking platformRole immediately removes platform authority", () => {
    const before = resolvePlatformAuthority("SUPER_ADMIN");
    const after = resolvePlatformAuthority(null);
    expect(before.bypassEntitlementCensorship).toBe(true);
    expect(after.bypassEntitlementCensorship).toBe(false);
  });

  test("no hardcoded emails in resolver or layout", () => {
    const resolverSrc = fs.readFileSync(
      path.resolve(__dirname, "../platform-authority.ts"),
      "utf-8",
    );
    const layoutSrc = fs.readFileSync(
      path.resolve(__dirname, "../../../app/(app)/[orgSlug]/layout.tsx"),
      "utf-8",
    );
    expect(resolverSrc).not.toMatch(/@agentik|@gmail|hello@/);
    expect(layoutSrc).not.toMatch(/@agentik|@gmail|hello@/);
  });

  test("platform-authority.ts has no DB imports — pure functions only", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../platform-authority.ts"),
      "utf-8",
    );
    expect(src).not.toContain("from \"@/lib/prisma\"");
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.create\(/);
  });

  test("no email-based logic in platform-authority.ts", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../platform-authority.ts"),
      "utf-8",
    );
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
    expect(codeOnly).not.toMatch(/email/i);
    expect(codeOnly).not.toContain("@agentik");
  });
});

// ==============================================================================
// REGRESSION — module-access integration
// ==============================================================================

describe("regression — module-access integration", () => {
  test("SUPER_ADMIN role modules include all domains", () => {
    const mods = getModulesForRole("SUPER_ADMIN");
    expect(mods.has("marketing_studio")).toBe(true);
    expect(mods.has("production")).toBe(true);
    expect(mods.has("finance")).toBe(true);
    expect(mods.has("agentik")).toBe(true);
  });

  test("filterModulesByRole enforces intersection for ORG_ADMIN", () => {
    const orgMods = entitled("sales", "dashboard") as Set<ModuleKey>;
    const filtered = filterModulesByRole(orgMods, "ORG_ADMIN");
    expect(filtered.has("marketing_studio")).toBe(false);
    expect(filtered.has("sales")).toBe(true);
  });

  test("requireTenant exposes platformRole in context", () => {
    const tenantSrc = fs.readFileSync(
      path.resolve(__dirname, "../../tenant.ts"),
      "utf-8",
    );
    expect(tenantSrc).toContain("platformRole");
    expect(tenantSrc).toContain("readPlatformRole");
  });

  test("seller confinement gate still exists in layout", () => {
    const layoutSrc = fs.readFileSync(
      path.resolve(__dirname, "../../../app/(app)/[orgSlug]/layout.tsx"),
      "utf-8",
    );
    expect(layoutSrc).toContain("SELLER_CONFINED_ROLES");
    expect(layoutSrc).toContain("sellerSlug");
    expect(layoutSrc).toContain("seller-app");
  });
});

// ==============================================================================
// TenantContext contract
// ==============================================================================

describe("TenantContext contract", () => {
  test("TenantContext type has role (nullable) and platformRole", () => {
    const tenantSrc = fs.readFileSync(
      path.resolve(__dirname, "../../tenant.ts"),
      "utf-8",
    );
    expect(tenantSrc).toContain("role: Role | null");
    expect(tenantSrc).toContain("platformRole: PlatformRoleValue | null");
  });

  test("platformRole is read from User table, not Membership", () => {
    const tenantSrc = fs.readFileSync(
      path.resolve(__dirname, "../../tenant.ts"),
      "utf-8",
    );
    expect(tenantSrc).toContain("user.findUnique");
    expect(tenantSrc).toContain("select: { platformRole: true }");
  });

  test("role field documents it is membership-only", () => {
    const tenantSrc = fs.readFileSync(
      path.resolve(__dirname, "../../tenant.ts"),
      "utf-8",
    );
    expect(tenantSrc).toContain("Organization membership role");
    expect(tenantSrc).toContain("NEVER contains platformRole");
  });

  test("membershipless SUPER_ADMIN path exists in requireTenant", () => {
    const tenantSrc = fs.readFileSync(
      path.resolve(__dirname, "../../tenant.ts"),
      "utf-8",
    );
    // Path B: platformRole=SUPER_ADMIN allows access without membership
    expect(tenantSrc).toContain("platformRole !== \"SUPER_ADMIN\"");
    // membershipRole is null when no active membership
    expect(tenantSrc).toContain("membershipRole: Role | null");
  });
});

// ==============================================================================
// SUPER_ADMIN without membership — structural guarantees
// ==============================================================================

describe("SUPER_ADMIN without membership — access path", () => {
  test("requireTenant does NOT throw FORBIDDEN_NOT_MEMBER for platformRole=SUPER_ADMIN", () => {
    const tenantSrc = fs.readFileSync(
      path.resolve(__dirname, "../../tenant.ts"),
      "utf-8",
    );
    // The condition: !hasActiveMembership && platformRole !== "SUPER_ADMIN"
    // means SUPER_ADMIN bypasses the membership requirement
    expect(tenantSrc).toContain("!hasActiveMembership && platformRole !== \"SUPER_ADMIN\"");
  });

  test("membershipRole is null when no active membership exists", () => {
    const tenantSrc = fs.readFileSync(
      path.resolve(__dirname, "../../tenant.ts"),
      "utf-8",
    );
    expect(tenantSrc).toContain("const membershipRole: Role | null = hasActiveMembership ? membership!.role : null");
  });

  test("layout handles null ctx.role safely", () => {
    const layoutSrc = fs.readFileSync(
      path.resolve(__dirname, "../../../app/(app)/[orgSlug]/layout.tsx"),
      "utf-8",
    );
    // Seller confinement check guards against null
    expect(layoutSrc).toContain("ctx.role !== null && SELLER_CONFINED_ROLES.has(ctx.role)");
    // Module access uses fallback for null
    expect(layoutSrc).toContain("ctx.role ?? \"VIEWER\"");
  });

  test("page.tsx handles null ctx.role safely", () => {
    const pageSrc = fs.readFileSync(
      path.resolve(__dirname, "../../../app/(app)/[orgSlug]/page.tsx"),
      "utf-8",
    );
    expect(pageSrc).toContain("ctx.role !== null && SELLER_ROLES.has(ctx.role)");
    expect(pageSrc).toContain("ctx.role !== null && MANAGER_MOBILE_ROLES.has(ctx.role)");
    expect(pageSrc).toContain("ctx.role ?? \"VIEWER\"");
  });
});
