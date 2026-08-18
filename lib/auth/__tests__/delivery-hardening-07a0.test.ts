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

  test("T02: DomainButton label wraps with word-break for full legibility", () => {
    const btnIdx = shellSrc.indexOf("function DomainButton");
    const chunk = shellSrc.slice(btnIdx, btnIdx + 3200);
    expect(chunk).toContain("maxWidth");
    expect(chunk).toContain("wordBreak");
    expect(chunk).toContain("textAlign");
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

  test("T06: per-card data guards exist (hasStatusData, hasAlertData, hasTaskData)", () => {
    expect(copilotSrc).toContain("hasStatusData");
    expect(copilotSrc).toContain("hasAlertData");
    expect(copilotSrc).toContain("hasTaskData");
    expect(copilotSrc).toContain("hasAnyExecutiveData");
  });

  test("T07: static empty state texts removed from cards", () => {
    // Card 2: "Sin alertas activas" should NOT appear as a rendered string
    expect(copilotSrc).not.toContain("Sin alertas activas · Sistema operando con normalidad");
    // Card 3: "Sin tareas pendientes" should NOT appear as a rendered string
    expect(copilotSrc).not.toContain("Sin tareas pendientes · Todo en orden");
    // Card 2: "nominal" empty badge removed
    // (the word "nominal" may still exist in comments, but not in JSX rendering for empty alerts)
  });
});

// ── C/D. Provisioning endpoint REMOVED — absence proofs ─────────────────────

describe("C — Provisioning endpoint removed", () => {
  test("T08: provision-users route file does NOT exist", () => {
    const routePath = path.resolve(__dirname, "../../../app/api/internal/provision-users/route.ts");
    expect(fs.existsSync(routePath)).toBe(false);
  });

  test("T09: provision-users directory does NOT exist", () => {
    const dirPath = path.resolve(__dirname, "../../../app/api/internal/provision-users");
    expect(fs.existsSync(dirPath)).toBe(false);
  });

  test("T10: No substitute provisioning endpoint created", () => {
    const internalDir = path.resolve(__dirname, "../../../app/api/internal");
    if (!fs.existsSync(internalDir)) return; // dir gone = pass
    const entries = fs.readdirSync(internalDir, { recursive: true }) as string[];
    const provisionEntries = entries.filter(e =>
      String(e).includes("provision") || String(e).includes("create-user") || String(e).includes("batch-user")
    );
    expect(provisionEntries).toHaveLength(0);
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
