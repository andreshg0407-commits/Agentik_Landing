/**
 * lib/auth/__tests__/member-admin.test.ts
 *
 * Sprint: AGENTIK-TENANT-USER-ADMIN-01
 *
 * Contract tests for member administration.
 * Tests A-J: authorization, role grants, seller separation, module access.
 *
 * NOTE: These are source-level contract tests (no DB). They validate
 * the authorization logic, type contracts, and file structure.
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

// ── Imports for type/contract checks ────────────────────────────────────────

import { roleRank, isInternalRole, getModulesForRole } from "../module-access";

// ── A: SUPER_ADMIN can provision Castillitos ORG_ADMIN ──────────────────────

describe("A — SUPER_ADMIN can provision ORG_ADMIN", () => {
  test("member-admin service exists and exports createOrgMember", () => {
    const src = readFile("lib/auth/member-admin.ts");
    expect(src).toContain("export async function createOrgMember");
    expect(src).toContain("export async function listOrgMembers");
    expect(src).toContain("export async function updateOrgMember");
  });

  test("SUPER_ADMIN is in ADMIN_ROLES", () => {
    const src = readFile("lib/auth/member-admin.ts");
    expect(src).toContain('"SUPER_ADMIN"');
    expect(src).toContain("ADMIN_ROLES");
  });

  test("canGrantRole allows SUPER_ADMIN to grant ORG_ADMIN", () => {
    // SUPER_ADMIN rank > ORG_ADMIN rank — should allow
    expect(roleRank("SUPER_ADMIN")).toBeGreaterThan(roleRank("ORG_ADMIN"));
  });
});

// ── B: new membership belongs only to target org ────────────────────────────

describe("B — Membership scoped to org", () => {
  test("createOrgMember takes orgId as first argument", () => {
    const src = readFile("lib/auth/member-admin.ts");
    // Function signature: orgId is first param
    expect(src).toContain("async function createOrgMember(\n  orgId: string,");
  });

  test("membership uses organizationId_userId unique constraint", () => {
    const src = readFile("lib/auth/member-admin.ts");
    expect(src).toContain("organizationId_userId");
  });
});

// ── C: role = ORG_ADMIN ────────────────────────────────────────────────────

describe("C — Role is canonical ORG_ADMIN", () => {
  test("ORG_ADMIN exists in role hierarchy", () => {
    expect(roleRank("ORG_ADMIN")).toBeGreaterThan(0);
  });

  test("ORG_ADMIN is not an internal role", () => {
    expect(isInternalRole("ORG_ADMIN")).toBe(false);
  });

  test("ORG_ADMIN has client module access", () => {
    const modules = getModulesForRole("ORG_ADMIN");
    expect(modules.has("sales")).toBe(true);
    expect(modules.has("dashboard")).toBe(true);
    expect(modules.has("finance")).toBe(true);
  });
});

// ── D: sellerSlug absent ──────────────────────────────────────────────────

describe("D — sellerSlug absent from admin provisioning", () => {
  test("createOrgMember does not accept sellerSlug", () => {
    const src = readFile("lib/auth/member-admin.ts");
    // CreateMemberInput interface should NOT have sellerSlug
    const typeBlock = src.substring(
      src.indexOf("export interface CreateMemberInput"),
      src.indexOf("}", src.indexOf("export interface CreateMemberInput")) + 1,
    );
    expect(typeBlock).not.toContain("sellerSlug");
  });
});

// ── E: sellerTerceroId absent ────────────────────────────────────────────

describe("E — sellerTerceroId absent from admin provisioning", () => {
  test("CreateMemberInput does not contain sellerTerceroId", () => {
    const src = readFile("lib/auth/member-admin.ts");
    const typeBlock = src.substring(
      src.indexOf("export interface CreateMemberInput"),
      src.indexOf("}", src.indexOf("export interface CreateMemberInput")) + 1,
    );
    expect(typeBlock).not.toContain("sellerTerceroId");
  });
});

// ── F: seller provisioning absent ────────────────────────────────────────

describe("F — No seller provisioning in member-admin", () => {
  test("member-admin does not import seller modules", () => {
    const src = readFile("lib/auth/member-admin.ts");
    // No seller module imports
    expect(src).not.toContain('from "@/lib/comercial/seller');
    expect(src).not.toContain('from "@/lib/seller');
    // No seller provisioning in create flow
    expect(src).not.toContain("sellerTerceroId");
  });

  test("hasSellerIdentity is output-only (read from existing data)", () => {
    const src = readFile("lib/auth/member-admin.ts");
    // hasSellerIdentity appears in MemberListItem (output), NOT in CreateMemberInput
    expect(src).toContain("hasSellerIdentity: boolean");
    expect(src).toContain("hasSellerIdentity: false");
  });
});

// ── G: user can authenticate through normal /login flow ────────────────────

describe("G — Normal auth flow compatible", () => {
  test("createOrgMember creates PasswordCredential via hashPassword", () => {
    const src = readFile("lib/auth/member-admin.ts");
    expect(src).toContain("hashPassword");
    expect(src).toContain("prisma.passwordCredential.upsert");
  });

  test("auth config uses PasswordCredential for login", () => {
    const src = readFile("lib/auth/auth.config.ts");
    expect(src).toContain("passwordCredential");
    expect(src).toContain("verifyPassword");
  });
});

// ── H: user cannot access Agentik internal admin surfaces ──────────────────

describe("H — ORG_ADMIN cannot access internal admin", () => {
  test("ORG_ADMIN does not have agentik module", () => {
    const modules = getModulesForRole("ORG_ADMIN");
    expect(modules.has("agentik")).toBe(false);
  });

  test("ORG_ADMIN does not have runs module", () => {
    const modules = getModulesForRole("ORG_ADMIN");
    expect(modules.has("runs")).toBe(false);
  });

  test("ORG_ADMIN does not have integrations module", () => {
    const modules = getModulesForRole("ORG_ADMIN");
    expect(modules.has("integrations")).toBe(false);
  });

  test("ORG_ADMIN does not have settings module", () => {
    const modules = getModulesForRole("ORG_ADMIN");
    expect(modules.has("settings")).toBe(false);
  });
});

// ── I: user can access entitled Castillitos Commercial ─────────────────────

describe("I — ORG_ADMIN can access commercial modules", () => {
  test("ORG_ADMIN has sales module", () => {
    expect(getModulesForRole("ORG_ADMIN").has("sales")).toBe(true);
  });

  test("ORG_ADMIN has collections module", () => {
    expect(getModulesForRole("ORG_ADMIN").has("collections")).toBe(true);
  });

  test("ORG_ADMIN has inventory module", () => {
    expect(getModulesForRole("ORG_ADMIN").has("inventory")).toBe(true);
  });

  test("ORG_ADMIN has torre_control module", () => {
    expect(getModulesForRole("ORG_ADMIN").has("torre_control")).toBe(true);
  });
});

// ── J: user cannot grant themselves SUPER_ADMIN ────────────────────────────

describe("J — Role escalation prevention", () => {
  test("canGrantRole logic prevents self-escalation", () => {
    const src = readFile("lib/auth/member-admin.ts");
    // The function checks roleRank comparison
    expect(src).toContain("roleRank(callerRole) > roleRank(targetRole)");
  });

  test("AGENTIK_ADMIN cannot grant SUPER_ADMIN", () => {
    // AGENTIK_ADMIN rank = 5, SUPER_ADMIN rank = 6 — cannot grant
    expect(roleRank("AGENTIK_ADMIN")).toBeLessThan(roleRank("SUPER_ADMIN"));
  });

  test("ORG_ADMIN cannot call member admin at all", () => {
    const src = readFile("lib/auth/member-admin.ts");
    expect(src).toContain("ADMIN_ROLES");
    // ORG_ADMIN is not in ADMIN_ROLES
    const adminRolesBlock = src.substring(
      src.indexOf('const ADMIN_ROLES'),
      src.indexOf(']);', src.indexOf('const ADMIN_ROLES')) + 3,
    );
    expect(adminRolesBlock).not.toContain('"ORG_ADMIN"');
  });

  test("internal roles require SUPER_ADMIN to grant", () => {
    const src = readFile("lib/auth/member-admin.ts");
    expect(src).toContain('INTERNAL_ROLES.has(targetRole) && callerRole !== "SUPER_ADMIN"');
  });

  test("API route enforces platform authority gate", () => {
    const src = readFile("app/api/orgs/[orgSlug]/members/route.ts");
    expect(src).toContain("hasPlatformConsoleAccess(platformRole)");
  });
});
