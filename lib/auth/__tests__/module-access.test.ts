/**
 * lib/auth/__tests__/module-access.test.ts
 *
 * Access matrix tests for RBAC module visibility.
 *
 * Run: node --import tsx/esm --test lib/auth/__tests__/module-access.test.ts
 * Or:  npx tsx --test lib/auth/__tests__/module-access.test.ts
 *
 * Uses Node.js built-in test runner (node:test) — no external test framework needed.
 *
 * Test coverage:
 *   - Every role sees exactly its expected modules
 *   - isInternalRole() returns true only for SUPER_ADMIN and AGENTIK_ADMIN
 *   - isClientFacingRole() returns false only for AGENTIK_ADMIN
 *   - canManageCampaigns() matrix
 *   - canRecordOutcomes() matrix
 *   - canApproveAlerts() matrix
 *   - canViewExecutive() matrix
 *   - roleRank() ordering is correct
 *   - hasMinRole() comparisons
 *   - AGENTIK_ADMIN has ZERO overlap with client data modules
 *   - ORG_ADMIN has ZERO overlap with internal console modules
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  getModulesForRole,
  filterModulesByRole,
  isInternalRole,
  isClientFacingRole,
  canManageCampaigns,
  canRecordOutcomes,
  canApproveAlerts,
  canViewExecutive,
  ROLE_HIERARCHY,
  roleRank,
  hasMinRole,
} from "../module-access";

import type { ModuleKey } from "../../tenant/modules";

// ── Constants ──────────────────────────────────────────────────────────────────

/** Internal console modules — only SUPER_ADMIN and AGENTIK_ADMIN should see these */
const INTERNAL_MODULES: ModuleKey[] = ["agentik", "agents", "runs", "events", "integrations", "settings"];

/** Client business data modules — AGENTIK_ADMIN must NEVER see these */
const CLIENT_DATA_MODULES: ModuleKey[] = ["dashboard", "sales", "collections", "finance", "workforce", "alerts", "torre_control"];

/** All modules for building a universal org-enabled set */
const ALL_MODULES = new Set<ModuleKey>([
  "dashboard", "torre_control", "agentik", "finance",
  "sales", "collections", "workforce", "runs", "events",
  "alerts", "documents", "knowledge", "agents", "integrations",
  "settings", "whatsapp",
]);

// ── Helpers ────────────────────────────────────────────────────────────────────

function visibleModules(role: Parameters<typeof getModulesForRole>[0]): Set<ModuleKey> {
  return filterModulesByRole(ALL_MODULES, role);
}

function canSee(role: Parameters<typeof getModulesForRole>[0], mod: ModuleKey): boolean {
  return visibleModules(role).has(mod);
}

// ── SUPER_ADMIN ────────────────────────────────────────────────────────────────

describe("SUPER_ADMIN", () => {
  test("sees all modules", () => {
    const mods = visibleModules("SUPER_ADMIN");
    for (const m of ALL_MODULES) {
      assert.ok(mods.has(m), `SUPER_ADMIN should see ${m}`);
    }
  });

  test("sees internal console", () => {
    for (const m of INTERNAL_MODULES) {
      assert.ok(canSee("SUPER_ADMIN", m), `SUPER_ADMIN should see internal module ${m}`);
    }
  });

  test("sees client data", () => {
    for (const m of CLIENT_DATA_MODULES) {
      assert.ok(canSee("SUPER_ADMIN", m), `SUPER_ADMIN should see client module ${m}`);
    }
  });
});

// ── AGENTIK_ADMIN ──────────────────────────────────────────────────────────────

describe("AGENTIK_ADMIN", () => {
  test("sees all internal console modules", () => {
    for (const m of INTERNAL_MODULES) {
      assert.ok(canSee("AGENTIK_ADMIN", m), `AGENTIK_ADMIN should see ${m}`);
    }
  });

  test("has ZERO access to client business data", () => {
    for (const m of CLIENT_DATA_MODULES) {
      assert.ok(!canSee("AGENTIK_ADMIN", m), `AGENTIK_ADMIN must NOT see client module ${m}`);
    }
  });

  test("cannot see sales", ()       => assert.ok(!canSee("AGENTIK_ADMIN", "sales")));
  test("cannot see collections", () => assert.ok(!canSee("AGENTIK_ADMIN", "collections")));
  test("cannot see finance", ()     => assert.ok(!canSee("AGENTIK_ADMIN", "finance")));
  test("cannot see dashboard", ()   => assert.ok(!canSee("AGENTIK_ADMIN", "dashboard")));
  test("cannot see customer torre_control", () => assert.ok(!canSee("AGENTIK_ADMIN", "torre_control")));

  test("can see agentik", ()       => assert.ok(canSee("AGENTIK_ADMIN", "agentik")));
  test("can see runs", ()          => assert.ok(canSee("AGENTIK_ADMIN", "runs")));
  test("can see events", ()        => assert.ok(canSee("AGENTIK_ADMIN", "events")));
  test("can see integrations", ()  => assert.ok(canSee("AGENTIK_ADMIN", "integrations")));
  test("can see settings", ()      => assert.ok(canSee("AGENTIK_ADMIN", "settings")));
  test("can see agents", ()        => assert.ok(canSee("AGENTIK_ADMIN", "agents")));
});

// ── ORG_ADMIN ──────────────────────────────────────────────────────────────────

describe("ORG_ADMIN", () => {
  test("cannot see internal console modules", () => {
    for (const m of INTERNAL_MODULES) {
      assert.ok(!canSee("ORG_ADMIN", m), `ORG_ADMIN must NOT see internal module ${m}`);
    }
  });

  test("cannot see agentik", ()       => assert.ok(!canSee("ORG_ADMIN", "agentik")));
  test("cannot see runs", ()          => assert.ok(!canSee("ORG_ADMIN", "runs")));
  test("cannot see events", ()        => assert.ok(!canSee("ORG_ADMIN", "events")));
  test("cannot see integrations", ()  => assert.ok(!canSee("ORG_ADMIN", "integrations")));
  test("cannot see settings", ()      => assert.ok(!canSee("ORG_ADMIN", "settings")));
  test("cannot see agents", ()        => assert.ok(!canSee("ORG_ADMIN", "agents")));

  test("can see dashboard", ()     => assert.ok(canSee("ORG_ADMIN", "dashboard")));
  test("can see torre_control", () => assert.ok(canSee("ORG_ADMIN", "torre_control")));
  test("can see finance", ()       => assert.ok(canSee("ORG_ADMIN", "finance")));
  test("can see sales", ()         => assert.ok(canSee("ORG_ADMIN", "sales")));
  test("can see collections", ()   => assert.ok(canSee("ORG_ADMIN", "collections")));
  test("can see workforce", ()     => assert.ok(canSee("ORG_ADMIN", "workforce")));
});

// ── MANAGER ────────────────────────────────────────────────────────────────────

describe("MANAGER", () => {
  test("cannot see internal console", () => {
    for (const m of INTERNAL_MODULES) {
      assert.ok(!canSee("MANAGER", m), `MANAGER must NOT see ${m}`);
    }
  });

  test("can see dashboard", ()     => assert.ok(canSee("MANAGER", "dashboard")));
  test("can see torre_control", () => assert.ok(canSee("MANAGER", "torre_control")));
  test("can see finance", ()       => assert.ok(canSee("MANAGER", "finance")));
  test("can see collections", ()   => assert.ok(canSee("MANAGER", "collections")));
  test("can see sales", ()         => assert.ok(canSee("MANAGER", "sales")));
});

// ── OPERATOR ───────────────────────────────────────────────────────────────────

describe("OPERATOR", () => {
  test("cannot see internal console", () => {
    for (const m of INTERNAL_MODULES) {
      assert.ok(!canSee("OPERATOR", m), `OPERATOR must NOT see ${m}`);
    }
  });

  test("cannot see torre_control", () => assert.ok(!canSee("OPERATOR", "torre_control")));
  test("cannot see finance", ()       => assert.ok(!canSee("OPERATOR", "finance")));

  test("can see dashboard", ()   => assert.ok(canSee("OPERATOR", "dashboard")));
  test("can see collections", () => assert.ok(canSee("OPERATOR", "collections")));
  test("can see sales", ()       => assert.ok(canSee("OPERATOR", "sales")));
  test("can see workforce", ()   => assert.ok(canSee("OPERATOR", "workforce")));
  test("can see alerts", ()      => assert.ok(canSee("OPERATOR", "alerts")));
});

// ── BILLING ────────────────────────────────────────────────────────────────────

describe("BILLING", () => {
  test("cannot see internal console", () => {
    for (const m of INTERNAL_MODULES) {
      assert.ok(!canSee("BILLING", m), `BILLING must NOT see ${m}`);
    }
  });

  test("cannot see collections", () => assert.ok(!canSee("BILLING", "collections")));
  test("cannot see sales", ()       => assert.ok(!canSee("BILLING", "sales")));
  test("cannot see agentik", ()     => assert.ok(!canSee("BILLING", "agentik")));

  test("can see finance", ()    => assert.ok(canSee("BILLING", "finance")));
  test("can see documents", ()  => assert.ok(canSee("BILLING", "documents")));
});

// ── VIEWER ─────────────────────────────────────────────────────────────────────

describe("VIEWER", () => {
  test("cannot see internal console", () => {
    for (const m of INTERNAL_MODULES) {
      assert.ok(!canSee("VIEWER", m), `VIEWER must NOT see ${m}`);
    }
  });

  test("cannot see collections", () => assert.ok(!canSee("VIEWER", "collections")));
  test("cannot see finance", ()     => assert.ok(!canSee("VIEWER", "finance")));
  test("cannot see dashboard", ()   => assert.ok(!canSee("VIEWER", "dashboard")));

  test("can see sales", ()     => assert.ok(canSee("VIEWER", "sales")));
  test("can see documents", () => assert.ok(canSee("VIEWER", "documents")));
  test("can see knowledge", () => assert.ok(canSee("VIEWER", "knowledge")));
});

// ── isInternalRole() ──────────────────────────────────────────────────────────

describe("isInternalRole()", () => {
  test("true for SUPER_ADMIN",   () => assert.ok(isInternalRole("SUPER_ADMIN")));
  test("true for AGENTIK_ADMIN", () => assert.ok(isInternalRole("AGENTIK_ADMIN")));

  // Hardened: ORG_ADMIN is NOT internal
  test("false for ORG_ADMIN",  () => assert.ok(!isInternalRole("ORG_ADMIN")));
  test("false for MANAGER",    () => assert.ok(!isInternalRole("MANAGER")));
  test("false for OPERATOR",   () => assert.ok(!isInternalRole("OPERATOR")));
  test("false for BILLING",    () => assert.ok(!isInternalRole("BILLING")));
  test("false for VIEWER",     () => assert.ok(!isInternalRole("VIEWER")));
});

// ── isClientFacingRole() ──────────────────────────────────────────────────────

describe("isClientFacingRole()", () => {
  // AGENTIK_ADMIN is the only role that is NOT client-facing
  test("false for AGENTIK_ADMIN", () => assert.ok(!isClientFacingRole("AGENTIK_ADMIN")));

  test("true for SUPER_ADMIN", () => assert.ok(isClientFacingRole("SUPER_ADMIN")));
  test("true for ORG_ADMIN",   () => assert.ok(isClientFacingRole("ORG_ADMIN")));
  test("true for MANAGER",     () => assert.ok(isClientFacingRole("MANAGER")));
  test("true for OPERATOR",    () => assert.ok(isClientFacingRole("OPERATOR")));
  test("true for BILLING",     () => assert.ok(isClientFacingRole("BILLING")));
  test("true for VIEWER",      () => assert.ok(isClientFacingRole("VIEWER")));
});

// ── canManageCampaigns() ──────────────────────────────────────────────────────

describe("canManageCampaigns()", () => {
  test("true for SUPER_ADMIN", () => assert.ok(canManageCampaigns("SUPER_ADMIN")));
  test("true for ORG_ADMIN",   () => assert.ok(canManageCampaigns("ORG_ADMIN")));
  test("true for MANAGER",     () => assert.ok(canManageCampaigns("MANAGER")));

  // AGENTIK_ADMIN is internal — does not manage client campaigns
  test("false for AGENTIK_ADMIN", () => assert.ok(!canManageCampaigns("AGENTIK_ADMIN")));
  test("false for OPERATOR",      () => assert.ok(!canManageCampaigns("OPERATOR")));
  test("false for BILLING",       () => assert.ok(!canManageCampaigns("BILLING")));
  test("false for VIEWER",        () => assert.ok(!canManageCampaigns("VIEWER")));
});

// ── canRecordOutcomes() ───────────────────────────────────────────────────────

describe("canRecordOutcomes()", () => {
  test("true for SUPER_ADMIN", () => assert.ok(canRecordOutcomes("SUPER_ADMIN")));
  test("true for ORG_ADMIN",   () => assert.ok(canRecordOutcomes("ORG_ADMIN")));
  test("true for MANAGER",     () => assert.ok(canRecordOutcomes("MANAGER")));
  test("true for OPERATOR",    () => assert.ok(canRecordOutcomes("OPERATOR")));

  test("false for AGENTIK_ADMIN", () => assert.ok(!canRecordOutcomes("AGENTIK_ADMIN")));
  test("false for BILLING",       () => assert.ok(!canRecordOutcomes("BILLING")));
  test("false for VIEWER",        () => assert.ok(!canRecordOutcomes("VIEWER")));
});

// ── canApproveAlerts() ────────────────────────────────────────────────────────

describe("canApproveAlerts()", () => {
  test("true for SUPER_ADMIN", () => assert.ok(canApproveAlerts("SUPER_ADMIN")));
  test("true for ORG_ADMIN",   () => assert.ok(canApproveAlerts("ORG_ADMIN")));
  test("true for MANAGER",     () => assert.ok(canApproveAlerts("MANAGER")));

  test("false for AGENTIK_ADMIN", () => assert.ok(!canApproveAlerts("AGENTIK_ADMIN")));
  test("false for OPERATOR",      () => assert.ok(!canApproveAlerts("OPERATOR")));
  test("false for BILLING",       () => assert.ok(!canApproveAlerts("BILLING")));
  test("false for VIEWER",        () => assert.ok(!canApproveAlerts("VIEWER")));
});

// ── canViewExecutive() ────────────────────────────────────────────────────────

describe("canViewExecutive()", () => {
  test("true for SUPER_ADMIN", () => assert.ok(canViewExecutive("SUPER_ADMIN")));
  test("true for ORG_ADMIN",   () => assert.ok(canViewExecutive("ORG_ADMIN")));
  test("true for MANAGER",     () => assert.ok(canViewExecutive("MANAGER")));

  test("false for AGENTIK_ADMIN", () => assert.ok(!canViewExecutive("AGENTIK_ADMIN")));
  test("false for OPERATOR",      () => assert.ok(!canViewExecutive("OPERATOR")));
  test("false for BILLING",       () => assert.ok(!canViewExecutive("BILLING")));
  test("false for VIEWER",        () => assert.ok(!canViewExecutive("VIEWER")));
});

// ── Role hierarchy + roleRank() ───────────────────────────────────────────────

describe("ROLE_HIERARCHY", () => {
  test("contains all 7 roles", () => {
    assert.equal(ROLE_HIERARCHY.length, 7);
  });

  test("SUPER_ADMIN has highest rank", () => {
    const superRank = roleRank("SUPER_ADMIN");
    for (const role of ROLE_HIERARCHY) {
      if (role !== "SUPER_ADMIN") {
        assert.ok(superRank > roleRank(role), `SUPER_ADMIN must outrank ${role}`);
      }
    }
  });

  test("VIEWER has lowest rank", () => {
    assert.equal(roleRank("VIEWER"), 0);
  });

  test("AGENTIK_ADMIN ranks above ORG_ADMIN", () => {
    assert.ok(roleRank("AGENTIK_ADMIN") > roleRank("ORG_ADMIN"));
  });

  test("AGENTIK_ADMIN ranks below SUPER_ADMIN", () => {
    assert.ok(roleRank("AGENTIK_ADMIN") < roleRank("SUPER_ADMIN"));
  });

  test("unknown role returns -1", () => {
    assert.equal(roleRank("UNKNOWN_ROLE" as any), -1);
  });
});

// ── hasMinRole() ──────────────────────────────────────────────────────────────

describe("hasMinRole()", () => {
  test("SUPER_ADMIN passes any minRole", () => {
    for (const r of ROLE_HIERARCHY) {
      assert.ok(hasMinRole("SUPER_ADMIN", r), `SUPER_ADMIN should satisfy minRole ${r}`);
    }
  });

  test("VIEWER fails OPERATOR minRole", () => {
    assert.ok(!hasMinRole("VIEWER", "OPERATOR"));
  });

  test("MANAGER passes OPERATOR minRole", () => {
    assert.ok(hasMinRole("MANAGER", "OPERATOR"));
  });

  test("ORG_ADMIN fails AGENTIK_ADMIN minRole", () => {
    assert.ok(!hasMinRole("ORG_ADMIN", "AGENTIK_ADMIN"));
  });

  test("AGENTIK_ADMIN passes ORG_ADMIN minRole", () => {
    assert.ok(hasMinRole("AGENTIK_ADMIN", "ORG_ADMIN"));
  });

  test("same role always passes itself", () => {
    for (const r of ROLE_HIERARCHY) {
      assert.ok(hasMinRole(r, r), `${r} should satisfy itself as minRole`);
    }
  });
});

// ── Separation guarantee ──────────────────────────────────────────────────────

describe("Separation guarantee: AGENTIK_ADMIN ∩ client modules = ∅", () => {
  test("no overlap between AGENTIK_ADMIN modules and client data modules", () => {
    const agentikMods = getModulesForRole("AGENTIK_ADMIN");
    for (const m of CLIENT_DATA_MODULES) {
      assert.ok(
        !agentikMods.has(m),
        `SEPARATION VIOLATION: AGENTIK_ADMIN must not have access to client module "${m}"`,
      );
    }
  });
});

describe("Separation guarantee: ORG_ADMIN ∩ internal modules = ∅", () => {
  test("no overlap between ORG_ADMIN modules and internal console modules", () => {
    const orgAdminMods = getModulesForRole("ORG_ADMIN");
    for (const m of INTERNAL_MODULES) {
      assert.ok(
        !orgAdminMods.has(m),
        `SEPARATION VIOLATION: ORG_ADMIN must not have access to internal module "${m}"`,
      );
    }
  });
});
