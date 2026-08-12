/**
 * lib/auth/__tests__/manager-app-foundation.test.ts
 *
 * Sprint: AGENTIK-MANAGER-APP-FOUNDATION-01
 *
 * Contract tests for Manager App architecture.
 * Tests A-O: routing, authorization, module cards, commercial reuse,
 * executive detail, copilot persistence, confinement.
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

// ── A: ORG_ADMIN mobile → Manager App ───────────────────────────────────────

describe("A — ORG_ADMIN mobile → Manager App", () => {
  test("org root page redirects mobile ORG_ADMIN to /manager", () => {
    const src = readFile("app/(app)/[orgSlug]/page.tsx");
    expect(src).toContain("MANAGER_MOBILE_ROLES");
    expect(src).toContain('"ORG_ADMIN"');
    expect(src).toContain("MOBILE_TABLET_RE");
    expect(src).toContain('redirect(`/${orgSlug}/manager`)');
  });

  test("manager layout authorizes ORG_ADMIN", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/layout.tsx");
    expect(src).toContain("MANAGER_ROLES");
    expect(src).toContain('"ORG_ADMIN"');
    expect(src).toContain("requireOrgAccess");
  });
});

// ── B: MANAGER mobile → Manager App ────────────────────────────────────────

describe("B — MANAGER mobile → Manager App", () => {
  test("MANAGER included in mobile redirect roles", () => {
    const src = readFile("app/(app)/[orgSlug]/page.tsx");
    const block = src.substring(
      src.indexOf("MANAGER_MOBILE_ROLES"),
      src.indexOf(";", src.indexOf("MANAGER_MOBILE_ROLES")) + 1,
    );
    expect(block).toContain('"MANAGER"');
  });

  test("MANAGER included in manager layout authorized roles", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/layout.tsx");
    const block = src.substring(
      src.indexOf("MANAGER_ROLES"),
      src.indexOf(";", src.indexOf("MANAGER_ROLES")) + 1,
    );
    expect(block).toContain('"MANAGER"');
  });
});

// ── C: Seller → Seller App, never Manager App ──────────────────────────────

describe("C — Seller confined to Seller App", () => {
  test("seller redirect happens before manager redirect in org root", () => {
    const src = readFile("app/(app)/[orgSlug]/page.tsx");
    const sellerPos = src.indexOf("seller-app");
    const managerPos = src.indexOf("MANAGER_MOBILE_ROLES");
    expect(sellerPos).toBeLessThan(managerPos);
  });

  test("OPERATOR/VIEWER not in MANAGER_MOBILE_ROLES", () => {
    const src = readFile("app/(app)/[orgSlug]/page.tsx");
    const block = src.substring(
      src.indexOf("MANAGER_MOBILE_ROLES"),
      src.indexOf(";", src.indexOf("MANAGER_MOBILE_ROLES")) + 1,
    );
    expect(block).not.toContain('"OPERATOR"');
    expect(block).not.toContain('"VIEWER"');
  });

  test("manager layout denies non-MANAGER_ROLES", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/layout.tsx");
    expect(src).toContain('redirect(`/${orgSlug}`)');
  });
});

// ── D: Desktop ORG_ADMIN → existing Enterprise ─────────────────────────────

describe("D — Desktop ORG_ADMIN → Enterprise", () => {
  test("mobile redirect only fires on mobile user-agent", () => {
    const src = readFile("app/(app)/[orgSlug]/page.tsx");
    expect(src).toContain("MOBILE_TABLET_RE.test(ua)");
    // Desktop UA won't match → falls through to EnterpriseLauncherClient
    expect(src).toContain("EnterpriseLauncherClient");
  });
});

// ── E: Manager Home renders one card per entitled module ────────────────────

describe("E — Manager Home module cards", () => {
  test("manager page uses getEnabledModules + filterModulesByRole", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/page.tsx");
    expect(src).toContain("getEnabledModules");
    expect(src).toContain("filterModulesByRole");
  });

  test("MODULE_DEFS defines top-level modules with descriptions", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/page.tsx");
    expect(src).toContain("MODULE_DEFS");
    expect(src).toContain("moduleKey");
    expect(src).toContain("description");
  });

  test("cards filtered by enabled modules", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/page.tsx");
    expect(src).toContain("mods.has(def.moduleKey as");
  });

  test("home client renders module cards not menu rows", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/manager-home-client.tsx");
    expect(src).toContain("ManagerModuleCard");
    expect(src).toContain("modules.map");
    expect(src).toContain("mod.description");
  });
});

// ── F: Disabled module absent ───────────────────────────────────────────────

describe("F — Disabled module absent", () => {
  test("only modules passing mods.has() are included", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/page.tsx");
    expect(src).toContain(".filter(def => mods.has(def.moduleKey as");
  });

  test("empty state shown when no modules", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/manager-home-client.tsx");
    expect(src).toContain("modules.length === 0");
    expect(src).toContain("No hay modulos habilitados");
  });
});

// ── G: Commercial card → /manager/comercial ─────────────────────────────────

describe("G — Commercial card routes to /manager/comercial", () => {
  test("commercial module def has routeSlug 'comercial' (canonical source)", () => {
    // routeSlug now lives in MANAGER_MODULE_DEFS (adapter), consumed by page.tsx
    const src = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    expect(src).toContain('routeSlug:   "comercial"');
  });

  test("card href built as /orgSlug/manager/routeSlug", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/page.tsx");
    expect(src).toContain("`/${orgSlug}/manager/${def.routeSlug}`");
  });
});

// ── H: /manager/comercial consumes assembler ────────────────────────────────

describe("H — Manager Commercial reuses assembler", () => {
  test("manager comercial page imports assembleCommercialExecutivePA", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/comercial/page.tsx");
    expect(src).toContain("assembleCommercialExecutivePA");
  });

  test("manager comercial page imports CommercialHubClient (canonical integration)", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/comercial/page.tsx");
    expect(src).toContain("CommercialHubClient");
  });

  test("same data loading as /comercial/executive", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/comercial/page.tsx");
    expect(src).toContain("loadControlComercial");
    expect(src).toContain("buildImportSupplyIntelligence");
  });
});

// ── I: Manager Commercial does not expose operational navigation ────────────

describe("I — No operational submodule navigation in Manager", () => {
  test("manager comercial does not import/link to Maletas", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/comercial/page.tsx");
    expect(src).not.toContain("/maletas");
    expect(src).not.toContain("MaletasClient");
  });

  test("manager comercial does not link to Inventario", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/comercial/page.tsx");
    expect(src).not.toContain("/inventario");
  });

  test("manager comercial does not link to Importaciones route", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/comercial/page.tsx");
    // Import paths to lib/ are fine — we check no ROUTE navigation exists
    expect(src).not.toContain("href");
    expect(src).not.toContain("Link");
    expect(src).not.toContain("router.push");
  });

  test("CommercialExecutiveClient itself has no operational nav links", () => {
    const src = readFile("app/(app)/[orgSlug]/comercial/executive/executive-client.tsx");
    expect(src).not.toContain("/maletas");
    expect(src).not.toContain("/inventario");
    expect(src).not.toContain("/importaciones");
    expect(src).not.toContain("/pedidos");
    expect(src).not.toContain("/tiendas");
    expect(src).not.toContain("/clientes");
    expect(src).not.toContain("/vendedores");
  });
});

// ── J: Executive detail pattern exists ──────────────────────────────────────

describe("J — Executive detail pattern", () => {
  test("executive detail component exists", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/executive-detail-client.tsx");
    expect(src).toContain("ExecutiveDetailClient");
  });

  test("executive detail has evidence, entities, next steps, copilot", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/executive-detail-client.tsx");
    expect(src).toContain("evidence");
    expect(src).toContain("entities");
    expect(src).toContain("nextSteps");
    expect(src).toContain("Copilot");
  });

  test("executive detail does NOT navigate to operational pages", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/executive-detail-client.tsx");
    expect(src).not.toContain("/importaciones");
    expect(src).not.toContain("/maletas");
    expect(src).not.toContain("/inventario");
    expect(src).toContain("No operational mutations");
  });
});

// ── K: Copilot orb persists across Manager routes ───────────────────────────

describe("K — Copilot orb persistence", () => {
  test("copilot orb is in the shell, not in individual pages", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/manager-app-shell.tsx");
    expect(src).toContain("ManagerCopilotOrb");
    expect(src).toContain("Copilot");
  });

  test("copilot orb is fixed position", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/manager-app-shell.tsx");
    expect(src).toContain('"fixed"');
    expect(src).toContain("bottom:");
    expect(src).toContain("zIndex:");
  });

  test("shell wraps children, so orb appears on all manager routes", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/layout.tsx");
    expect(src).toContain("ManagerAppShell");
    expect(src).toContain("{children}");
  });
});

// ── L: No fake attention badge ──────────────────────────────────────────────

describe("L — No fake attention badge", () => {
  test("manager home has no fake badge or count", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/manager-home-client.tsx");
    expect(src).not.toContain("attentionCount");
    expect(src).not.toContain("badge");
    expect(src).toContain("No fake content");
  });
});

// ── M: No business math in React ────────────────────────────────────────────

describe("M — No business math in React", () => {
  test("manager home client has no Prisma or business calculations", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/manager-home-client.tsx");
    expect(src).not.toContain("prisma");
    expect(src).not.toContain("import { prisma");
    expect(src).toContain('"use client"');
  });

  test("manager shell has no Prisma or business calculations", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/manager-app-shell.tsx");
    expect(src).not.toContain("prisma");
    expect(src).toContain("No authorization logic");
  });
});

// ── N: Existing Commercial Executive tests green ────────────────────────────

describe("N — Commercial Executive not broken", () => {
  test("/comercial/executive page still imports assembler", () => {
    const src = readFile("app/(app)/[orgSlug]/comercial/executive/page.tsx");
    expect(src).toContain("assembleCommercialExecutivePA");
    expect(src).toContain("CommercialExecutiveClient");
  });

  test("executive client still has three tabs", () => {
    const src = readFile("app/(app)/[orgSlug]/comercial/executive/executive-client.tsx");
    expect(src).toContain('"resumen"');
    expect(src).toContain('"inteligencia"');
    expect(src).toContain('"informes"');
  });
});

// ── O: Operational Desktop Commercial regressions green ─────────────────────

describe("O — Desktop Commercial unchanged", () => {
  test("desktop comercial entry page still exists with UA routing", () => {
    const src = readFile("app/(app)/[orgSlug]/comercial/page.tsx");
    expect(src).toContain("MOBILE_TABLET_RE");
    expect(src).toContain("comercial/executive");
    expect(src).toContain("comercial/control");
  });

  test("parent layout still renders WorkspaceShellClient for desktop", () => {
    const src = readFile("app/(app)/[orgSlug]/layout.tsx");
    expect(src).toContain("WorkspaceShellClient");
    expect(src).toContain("RightOpsRail");
  });

  test("manager bypass happens AFTER seller bypass in layout", () => {
    const src = readFile("app/(app)/[orgSlug]/layout.tsx");
    const sellerPos = src.indexOf("isSellerApp");
    const managerPos = src.indexOf("isManagerApp");
    expect(sellerPos).toBeLessThan(managerPos);
  });
});
