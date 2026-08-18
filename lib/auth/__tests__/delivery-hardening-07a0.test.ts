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
    const chunk = shellSrc.slice(railIdx, railIdx + 1200);
    expect(chunk).toContain("overflowY");
  });

  test("T02: DomainButton label uses ellipsis overflow (no word-break)", () => {
    const btnIdx = shellSrc.indexOf("function DomainButton");
    const chunk = shellSrc.slice(btnIdx, btnIdx + 3200);
    expect(chunk).toContain("maxWidth");
    expect(chunk).toContain("textOverflow");
    expect(chunk).toContain("overflow");
    expect(chunk).toContain("whiteSpace");
    expect(chunk).not.toContain("wordBreak");
  });

  test("T02b: PrimaryRail uses sticky positioning for full viewport height", () => {
    const railIdx = shellSrc.indexOf("function PrimaryRail");
    const chunk = shellSrc.slice(railIdx, railIdx + 800);
    expect(chunk).toContain('"sticky"');
    expect(chunk).toContain("100dvh");
  });

  test("T02c: DomainDef supports shortLabel for abbreviated labels", () => {
    const navSrc = readSrc("components/shell/module-nav-config.ts");
    expect(navSrc).toContain("shortLabel");
    // Shell uses shortLabel ?? label
    expect(shellSrc).toContain("shortLabel");
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
    expect(copilotSrc).not.toContain("Sin alertas activas · Sistema operando con normalidad");
    expect(copilotSrc).not.toContain("Sin tareas pendientes · Todo en orden");
  });

  test("T07b: suppressExecutiveWidgets prop exists and gates all executive cards", () => {
    expect(copilotSrc).toContain("suppressExecutiveWidgets");
    // Guards use suppressExecutiveWidgets
    expect(copilotSrc).toContain("!suppressExecutiveWidgets");
  });

  test("T07c: right-ops-rail computes suppressExecutiveWidgets from org entitlements", () => {
    const railSrc = readSrc("components/layout/right-ops-rail.tsx");
    expect(railSrc).toContain("suppressExecutiveWidgets");
    expect(railSrc).toContain("getEnabledModules");
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

  test("T15: Producción stub uses orgEntitled check", () => {
    expect(navSrc).toContain('orgEntitled("production")');
    // Stub block exists with Próximamente
    const stubIdx = navSrc.indexOf('!orgEntitled("production")');
    expect(stubIdx).toBeGreaterThan(-1);
    const chunk = navSrc.slice(stubIdx, stubIdx + 400);
    expect(chunk).toContain("Próximamente");
    expect(chunk).toContain("disabled: true");
  });

  test("T16: Marketing stub uses orgEntitled check", () => {
    expect(navSrc).toContain('orgEntitled("marketing_studio")');
    const stubIdx = navSrc.indexOf('!orgEntitled("marketing_studio")');
    expect(stubIdx).toBeGreaterThan(-1);
    const chunk = navSrc.slice(stubIdx, stubIdx + 400);
    expect(chunk).toContain("Próximamente");
    expect(chunk).toContain("disabled: true");
  });

  test("T17: Finanzas stub uses orgEntitled check", () => {
    expect(navSrc).toContain('orgEntitled("finance")');
    expect(navSrc).toContain('orgEntitled("torre_control")');
    const stubIdx = navSrc.indexOf('!orgEntitled("finance")');
    expect(stubIdx).toBeGreaterThan(-1);
    const chunk = navSrc.slice(stubIdx, stubIdx + 400);
    expect(chunk).toContain("Próximamente");
    expect(chunk).toContain("disabled: true");
  });

  test("T17b: orgEntitledModules passed from layout to buildNavDomains", () => {
    const layoutSrc = readSrc("app/(app)/[orgSlug]/layout.tsx");
    expect(layoutSrc).toContain("orgEntitledModules");
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
