/**
 * lib/auth/__tests__/member-admin-ui.test.ts
 *
 * Sprint: AGENTIK-TENANT-USER-ADMIN-02
 *
 * Contract tests for the user admin UI surface and post-login routing.
 * Tests A-K: access control, create flow, seller separation, routing audit.
 *
 * Source-level contract tests (no DB, no browser).
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

import { isInternalRole, getModulesForRole } from "../module-access";
import { getRoleHome } from "../role-home";

// ── A: SUPER_ADMIN can open /castillitos/agentik/users ──────────────────────

describe("A — SUPER_ADMIN can open users admin", () => {
  test("users page exists at agentik/users", () => {
    const src = readFile("app/(app)/[orgSlug]/agentik/users/page.tsx");
    expect(src).toContain("UsersAdminClient");
    expect(src).toContain("requireOrgAccess");
  });

  test("page gates on hasPlatformConsoleAccess", () => {
    const src = readFile("app/(app)/[orgSlug]/agentik/users/page.tsx");
    expect(src).toContain("hasPlatformConsoleAccess");
  });

  test("SUPER_ADMIN passes internal role check", () => {
    expect(isInternalRole("SUPER_ADMIN")).toBe(true);
  });

  test("AGENTIK_ADMIN passes internal role check", () => {
    expect(isInternalRole("AGENTIK_ADMIN")).toBe(true);
  });
});

// ── B: ORG_ADMIN cannot access internal user admin ──────────────────────────

describe("B — ORG_ADMIN cannot access user admin", () => {
  test("ORG_ADMIN is NOT internal role", () => {
    expect(isInternalRole("ORG_ADMIN")).toBe(false);
  });

  test("page redirects non-internal roles", () => {
    const src = readFile("app/(app)/[orgSlug]/agentik/users/page.tsx");
    expect(src).toContain("redirect(`/${orgSlug}`)");
  });

  test("ORG_ADMIN has no agentik module", () => {
    expect(getModulesForRole("ORG_ADMIN").has("agentik")).toBe(false);
  });
});

// ── C: member list loads Castillitos memberships ────────────────────────────

describe("C — Member list loads org memberships", () => {
  test("page calls listOrgMembers with org ID", () => {
    const src = readFile("app/(app)/[orgSlug]/agentik/users/page.tsx");
    expect(src).toContain("listOrgMembers(organization.id");
  });

  test("client receives serialized members", () => {
    const src = readFile("app/(app)/[orgSlug]/agentik/users/users-admin-client.tsx");
    expect(src).toContain("initialMembers");
    expect(src).toContain("SerializedMember");
  });
});

// ── D: create ORG_ADMIN works ────────────────────────────────────────────────

describe("D — Create ORG_ADMIN works", () => {
  test("client has create form with role selector", () => {
    const src = readFile("app/(app)/[orgSlug]/agentik/users/users-admin-client.tsx");
    expect(src).toContain("CreateMemberForm");
    expect(src).toContain("ORG_ADMIN");
    expect(src).toContain("POST");
  });

  test("create form POSTs to members API", () => {
    const src = readFile("app/(app)/[orgSlug]/agentik/users/users-admin-client.tsx");
    expect(src).toContain("`/api/orgs/${orgSlug}/members`");
    expect(src).toContain("method: \"POST\"");
  });

  test("API route exists for POST", () => {
    const src = readFile("app/api/orgs/[orgSlug]/members/route.ts");
    expect(src).toContain("export async function POST");
  });
});

// ── E: seller fields absent ──────────────────────────────────────────────────

describe("E — Seller fields absent from admin UI", () => {
  test("create form has no sellerSlug input", () => {
    const src = readFile("app/(app)/[orgSlug]/agentik/users/users-admin-client.tsx");
    // The form fields should not include seller identity
    expect(src).not.toContain("sellerTerceroId");
    expect(src).not.toContain("sellerSlug");
  });
});

// ── F: role escalation still denied server-side ─────────────────────────────

describe("F — Role escalation denied", () => {
  test("member-admin service blocks internal role grants for non-SUPER_ADMIN", () => {
    const src = readFile("lib/auth/member-admin.ts");
    expect(src).toContain("CANNOT_GRANT_INTERNAL_ROLE");
    expect(src).toContain("CANNOT_GRANT_HIGHER_ROLE");
  });

  test("API routes enforce platform authority gate", () => {
    const routeSrc = readFile("app/api/orgs/[orgSlug]/members/route.ts");
    expect(routeSrc).toContain("hasPlatformConsoleAccess(platformRole)");
    const patchSrc = readFile("app/api/orgs/[orgSlug]/members/[memberId]/route.ts");
    expect(patchSrc).toContain("hasPlatformConsoleAccess(platformRole)");
  });

  test("client UI only shows client-facing roles in selector", () => {
    const src = readFile("app/(app)/[orgSlug]/agentik/users/users-admin-client.tsx");
    expect(src).toContain("ASSIGNABLE_ROLES");
    // ASSIGNABLE_ROLES should NOT include SUPER_ADMIN or AGENTIK_ADMIN
    const block = src.substring(
      src.indexOf("const ASSIGNABLE_ROLES"),
      src.indexOf("];", src.indexOf("const ASSIGNABLE_ROLES")) + 2,
    );
    expect(block).not.toContain('"SUPER_ADMIN"');
    expect(block).not.toContain('"AGENTIK_ADMIN"');
    expect(block).toContain('"ORG_ADMIN"');
  });
});

// ── G: disable/reactivate respects canonical status lifecycle ──────────────

describe("G — Disable/reactivate membership lifecycle", () => {
  test("client has disable action", () => {
    const src = readFile("app/(app)/[orgSlug]/agentik/users/users-admin-client.tsx");
    expect(src).toContain("handleDisable");
    expect(src).toContain("Deshabilitar");
  });

  test("client has reactivate action", () => {
    const src = readFile("app/(app)/[orgSlug]/agentik/users/users-admin-client.tsx");
    expect(src).toContain("handleReactivate");
    expect(src).toContain("Reactivar");
  });

  test("disable sends DISABLED status via PATCH", () => {
    const src = readFile("app/(app)/[orgSlug]/agentik/users/users-admin-client.tsx");
    expect(src).toContain('{ status: "DISABLED" }');
  });

  test("reactivate sends ACTIVE status via PATCH", () => {
    const src = readFile("app/(app)/[orgSlug]/agentik/users/users-admin-client.tsx");
    expect(src).toContain('{ status: "ACTIVE" }');
  });

  test("member-admin service sets disabledAt on disable", () => {
    const src = readFile("lib/auth/member-admin.ts");
    expect(src).toContain('updateData.disabledAt = new Date()');
  });
});

// ── H: passwords never returned by list/create API ──────────────────────────

describe("H — Password never returned", () => {
  test("MemberListItem has no password field", () => {
    const src = readFile("lib/auth/member-admin.ts");
    const listType = src.substring(
      src.indexOf("export interface MemberListItem"),
      src.indexOf("}", src.indexOf("export interface MemberListItem")) + 1,
    );
    expect(listType).not.toContain("password");
    expect(listType).not.toContain("passwordHash");
  });

  test("list query does not select password", () => {
    const src = readFile("lib/auth/member-admin.ts");
    // The findMany select should not include passwordCredential
    expect(src).not.toContain("passwordCredential: { select");
  });
});

// ── I: ORG_ADMIN login resolves to canonical /castillitos ───────────────────

describe("I — ORG_ADMIN login routes to org root", () => {
  test("post-login resolver routes single-org non-seller to /{orgSlug}", () => {
    const src = readFile("lib/auth/post-login-destination.ts");
    // Single-org default returns `/${orgSlug}` not `/${orgSlug}/executive`
    expect(src).toContain('destination: `/${orgSlug}`');
    expect(src).toContain('reason: "single_org_default"');
  });

  test("org root page does NOT auto-redirect to /executive", () => {
    const src = readFile("app/(app)/[orgSlug]/page.tsx");
    // Page renders EnterpriseLauncherClient, not a redirect to /executive
    expect(src).toContain("EnterpriseLauncherClient");
    expect(src).not.toContain('redirect(`/${orgSlug}/executive`)');
  });
});

// ── J: Seller login still resolves /castillitos/seller-app ──────────────────

describe("J — Seller login routes to seller-app", () => {
  test("post-login resolver routes seller to /seller-app", () => {
    const src = readFile("lib/auth/post-login-destination.ts");
    expect(src).toContain("seller-app");
    expect(src).toContain('reason: "seller_default"');
  });

  test("org root page redirects sellers to /seller-app", () => {
    const src = readFile("app/(app)/[orgSlug]/page.tsx");
    expect(src).toContain('redirect(`/${orgSlug}/seller-app`)');
    expect(src).toContain("sellerSlug");
  });
});

// ── K: SUPER_ADMIN multi-org still resolves /select-org ─────────────────────

describe("K — SUPER_ADMIN multi-org routes to /select-org", () => {
  test("post-login resolver routes multi-org to /select-org", () => {
    const src = readFile("lib/auth/post-login-destination.ts");
    expect(src).toContain('destination: "/select-org"');
    expect(src).toContain('reason: "multi_org_selector"');
  });
});
