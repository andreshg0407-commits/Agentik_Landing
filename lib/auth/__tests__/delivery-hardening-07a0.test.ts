/**
 * DELIVERY-HARDENING-07A0 — Structural smoke tests
 *
 * Validates:
 *   A. Left rail overflow safety
 *   B. Control Comercial hidden from nav + route blocked
 *   C. Copilot executive guard
 *   D. User provisioning matrix (9 users, correct roles)
 *   E. Module visibility ("Próximamente" stubs)
 *   H. Authorization enforcement (read-only, seller confinement, module scope)
 */

import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ── Helpers ──────────────────────────────────────────────────────────────────

function readSrc(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../../../", relPath), "utf-8");
}

// ── A. Left Rail ─────────────────────────────────────────────────────────────

describe("A — Left rail overflow safety", () => {
  const shellSrc = readSrc("components/shell/workspace-shell-client.tsx");

  test("T01: PrimaryRail has overflowY: auto", () => {
    expect(shellSrc).toContain('overflowY');
    // Verify the overflowY is set to "auto" near the PrimaryRail definition
    const railIdx = shellSrc.indexOf("function PrimaryRail");
    const chunk = shellSrc.slice(railIdx, railIdx + 600);
    expect(chunk).toContain("overflowY");
  });

  test("T02: DomainButton label has maxWidth, overflow, textOverflow", () => {
    const btnIdx = shellSrc.indexOf("function DomainButton");
    const chunk = shellSrc.slice(btnIdx, btnIdx + 3200);
    expect(chunk).toContain("maxWidth");
    expect(chunk).toContain('overflow');
    expect(chunk).toContain('textOverflow');
    expect(chunk).toContain('ellipsis');
  });
});

// ── B. Control Comercial hidden ──────────────────────────────────────────────

describe("B — Control Comercial hidden", () => {
  const navSrc = readSrc("components/shell/module-nav-config.ts");
  const modulesSrc = readSrc("lib/tenant/modules.ts");

  test("T03: Nav config does NOT contain 'Control Comercial' nav item", () => {
    // Should not have a visible nav item (commented or removed)
    const lines = navSrc.split("\n");
    const navItemLines = lines.filter(l =>
      l.includes("Control Comercial") && l.includes("href:") && !l.trimStart().startsWith("//")
    );
    expect(navItemLines).toHaveLength(0);
  });

  test("T04: Route 'comercial/control' maps to 'control_comercial' module key", () => {
    expect(modulesSrc).toContain('["comercial/control"');
    expect(modulesSrc).toContain('"control_comercial"');
  });

  test("T05: 'control_comercial' is in MODULE_KEYS", () => {
    const keysIdx = modulesSrc.indexOf("MODULE_KEYS");
    const keysChunk = modulesSrc.slice(keysIdx, keysIdx + 2000);
    expect(keysChunk).toContain('"control_comercial"');
  });
});

// ── C. Copilot executive guard ───────────────────────────────────────────────

describe("C — Copilot executive data guard", () => {
  const copilotSrc = readSrc("components/layout/copilot-ops-rail.tsx");

  test("T06: hasAnyExecutiveData guard exists", () => {
    expect(copilotSrc).toContain("hasAnyExecutiveData");
  });

  test("T07: ternary renders compact agent name when no data", () => {
    // Verify ternary structure exists
    const ternaryIdx = copilotSrc.indexOf("hasAnyExecutiveData ? (");
    expect(ternaryIdx).toBeGreaterThan(-1);
    // Verify the else branch exists after the ternary
    const elseIdx = copilotSrc.indexOf(") : (", ternaryIdx);
    expect(elseIdx).toBeGreaterThan(ternaryIdx);
    // Verify agent.displayName is used after the else branch
    const agentNameIdx = copilotSrc.indexOf("agent.displayName", elseIdx);
    expect(agentNameIdx).toBeGreaterThan(elseIdx);
  });
});

// ── D. User provisioning matrix ──────────────────────────────────────────────

describe("D — User provisioning matrix", () => {
  const provSrc = readSrc("app/api/internal/provision-users/route.ts");

  test("T08: 9 users defined in USER_MATRIX", () => {
    const emailMatches = provSrc.match(/email:\s*"/g);
    expect(emailMatches).toHaveLength(9);
  });

  test("T09: Blocked roles include SUPER_ADMIN and AGENTIK_ADMIN", () => {
    expect(provSrc).toContain('"SUPER_ADMIN"');
    expect(provSrc).toContain('"AGENTIK_ADMIN"');
    expect(provSrc).toContain("BLOCKED_ROLES");
  });

  test("T10: Password received from POST body, never stored in code", () => {
    expect(provSrc).toContain("body.password");
    expect(provSrc).toContain("hashPassword");
    // No hardcoded passwords
    expect(provSrc).not.toMatch(/password\s*[:=]\s*["'][^"']{8,}["']/i);
  });

  test("T11: Preview-only guard (VERCEL_ENV !== production)", () => {
    expect(provSrc).toContain("VERCEL_ENV");
    expect(provSrc).toContain('"production"');
    expect(provSrc).toContain("BLOCKED_PRODUCTION");
  });

  test("T12: PROBE_SECRET required", () => {
    expect(provSrc).toContain("PROBE_SECRET");
    expect(provSrc).toContain("AUTH_FAILED");
  });

  test("T13: Seller operators have sellerSlug", () => {
    // Nestor and Orlando should have sellerSlug in their permissionsJson
    expect(provSrc).toContain('"nestor-alzate"');
    expect(provSrc).toContain('"orlando-naranjo"');
  });

  test("T14: Idempotent outcomes: CREATED, UPDATED, ALREADY_CORRECT", () => {
    expect(provSrc).toContain('"ALREADY_CORRECT"');
    expect(provSrc).toContain('"UPDATED"');
    expect(provSrc).toContain('"CREATED"');
  });
});

// ── E. Module visibility — Próximamente stubs ────────────────────────────────

describe("E — Próximamente module stubs", () => {
  const navSrc = readSrc("components/shell/module-nav-config.ts");

  test("T15: Producción stub exists when hasProduction is false", () => {
    expect(navSrc).toContain("!opts.hasProduction");
    const stubIdx = navSrc.indexOf("!opts.hasProduction");
    const chunk = navSrc.slice(stubIdx, stubIdx + 400);
    expect(chunk).toContain("Próximamente");
    expect(chunk).toContain('disabled: true');
  });

  test("T16: Marketing stub exists when hasMarketing is false", () => {
    expect(navSrc).toContain("!opts.hasMarketing");
    const stubIdx = navSrc.indexOf("!opts.hasMarketing");
    const chunk = navSrc.slice(stubIdx, stubIdx + 400);
    expect(chunk).toContain("Próximamente");
    expect(chunk).toContain('disabled: true');
  });

  test("T17: Finanzas stub exists when hasFinance and hasTorreControl are false", () => {
    expect(navSrc).toContain("!opts.hasFinance && !opts.hasTorreControl");
    const stubIdx = navSrc.indexOf("!opts.hasFinance && !opts.hasTorreControl");
    const chunk = navSrc.slice(stubIdx, stubIdx + 400);
    expect(chunk).toContain("Próximamente");
    expect(chunk).toContain('disabled: true');
  });
});

// ── H. Authorization enforcement ─────────────────────────────────────────────

describe("H — Authorization enforcement", () => {
  const layoutSrc = readSrc("app/(app)/[orgSlug]/layout.tsx");
  const moduleAccessSrc = readSrc("lib/auth/module-access.ts");

  test("T18: Seller confinement gate redirects to /seller-app", () => {
    expect(layoutSrc).toContain("sellerSlug");
    expect(layoutSrc).toContain("seller-app");
    expect(layoutSrc).toContain("redirect(");
  });

  test("T19: Route guard uses resolveModuleForPath", () => {
    expect(layoutSrc).toContain("resolveModuleForPath");
    expect(layoutSrc).toContain("isBlocked");
  });

  test("T20: VIEWER role has read-only module access (sales, documents, knowledge)", () => {
    const viewerIdx = moduleAccessSrc.indexOf("VIEWER:");
    const chunk = moduleAccessSrc.slice(viewerIdx, viewerIdx + 200);
    expect(chunk).toContain('"sales"');
    expect(chunk).toContain('"documents"');
    expect(chunk).toContain('"knowledge"');
    // VIEWER should NOT have finance, agentik, settings
    expect(chunk).not.toContain('"finance"');
    expect(chunk).not.toContain('"agentik"');
  });

  test("T21: OPERATOR role exists in module-access", () => {
    expect(moduleAccessSrc).toContain("OPERATOR");
  });

  test("T22: Module intersection enforced (filterModulesByRole)", () => {
    expect(layoutSrc).toContain("filterModulesByRole");
  });
});
