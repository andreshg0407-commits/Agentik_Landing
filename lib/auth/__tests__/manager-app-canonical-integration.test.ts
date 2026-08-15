/**
 * lib/auth/__tests__/manager-app-canonical-integration.test.ts
 *
 * Sprint: AGENTIK-MANAGER-APP-CANONICAL-INTEGRATION-01
 *
 * 26 contract tests for canonical integration.
 * Source-level (no DB, no browser, no runtime).
 *
 * Tests 1-26 verify:
 *   Authorization, canonical reuse, hub structure, surface contracts,
 *   truth states, identity resolution, copilot context, hamburger menu,
 *   visual integration, no-business-math, no-demo-data.
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");
const MGR = "app/(app)/[orgSlug]/manager";
const COM = `${MGR}/comercial`;

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.join(ROOT, relPath));
}

// ── 1: Authorization — only ORG_ADMIN and MANAGER ─────────────────────────

describe("1 — Authorization: ORG_ADMIN + MANAGER only", () => {
  test("layout has MANAGER_ROLES with ORG_ADMIN and MANAGER", () => {
    const src = readFile(`${MGR}/layout.tsx`);
    expect(src).toContain("MANAGER_ROLES");
    expect(src).toContain('"ORG_ADMIN"');
    expect(src).toContain('"MANAGER"');
    expect(src).toContain("requireOrgAccess");
  });

  test("non-authorized roles redirect to org root", () => {
    const src = readFile(`${MGR}/layout.tsx`);
    expect(src).toContain('redirect(`/${orgSlug}`)');
  });

  test("OPERATOR and VIEWER not in MANAGER_ROLES", () => {
    const src = readFile(`${MGR}/layout.tsx`);
    const rolesBlock = src.substring(
      src.indexOf("MANAGER_ROLES"),
      src.indexOf(";", src.indexOf("MANAGER_ROLES")) + 1,
    );
    expect(rolesBlock).not.toContain('"OPERATOR"');
    expect(rolesBlock).not.toContain('"VIEWER"');
  });
});

// ── 2: Manager Home consumes canonical sources ────────────────────────────

describe("2 — Manager Home canonical sources", () => {
  test("home page loads from canonical loaders", () => {
    const src = readFile(`${MGR}/page.tsx`);
    // loadControlComercial is NOT called on home (performance: 120–600s DB payload).
    // Home uses listBusinessAlerts + assembleGlobalAttention for attention items only.
    expect(src).toContain("listBusinessAlerts");
    expect(src).toContain("assembleGlobalAttention");
  });

  test("home page uses module entitlement", () => {
    const src = readFile(`${MGR}/page.tsx`);
    expect(src).toContain("getEnabledModules");
    expect(src).toContain("filterModulesByRole");
  });
});

// ── 3: Manager Home executive state from real evidence ────────────────────

describe("3 — Executive state is deterministic", () => {
  test("adapter computes executive state from source evidence", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    expect(src).toContain("REQUIRES_ATTENTION");
    expect(src).toContain("STABLE");
    expect(src).toContain("DATA_INCOMPLETE");
  });

  test("executive state depends on real attention items", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    expect(src).toContain("unresolvedCount");
    expect(src).toContain("certifiedCount");
  });

  test("home client renders attention items from real data", () => {
    const src = readFile(`${MGR}/manager-home-client.tsx`);
    // Home client renders attention cards driven by real alertsResult items.
    // State rendering uses attentionCount derived from homePA.attention.length.
    expect(src).toContain("attentionCount");
    expect(src).toContain("homePA.attention");
  });
});

// ── 4: No fake attention badges or demo data ──────────────────────────────

describe("4 — No fake content or demo data", () => {
  test("home client has no fake content", () => {
    const src = readFile(`${MGR}/manager-home-client.tsx`);
    // attentionCount is a legitimate local derived from homePA.attention.length — NOT a fake badge.
    // The guard is: no hardcoded numeric constant (e.g. attentionCount = 3) and no DEMO/MOCK data.
    expect(src).toContain("No fake content");
    expect(src).not.toContain("attentionCount = 3");
    expect(src).not.toContain("DEMO_");
    expect(src).not.toContain("MOCK_");
  });

  test("adapter filters resolved/acknowledged alerts", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    expect(src).toContain('"resolved"');
    expect(src).toContain('"acknowledged"');
  });
});

// ── 5: Hamburger menu structure ───────────────────────────────────────────

describe("5 — Hamburger menu", () => {
  test("shell has FableDrawer component", () => {
    const src = readFile(`${MGR}/manager-app-shell.tsx`);
    // Renamed from HamburgerDrawer → FableDrawer in Fable redesign.
    expect(src).toContain("FableDrawer");
    expect(src).toContain("menuOpen");
  });

  test("hamburger has 3 sections: modules, daily tools, config", () => {
    const src = readFile(`${MGR}/manager-app-shell.tsx`);
    // Fable redesign renamed sections: Módulos / Tu día / Configuración
    expect(src).toContain("Módulos");
    expect(src).toContain("Tu día");
    expect(src).toContain("Configuración");
  });

  test("hamburger has logout via signOut", () => {
    const src = readFile(`${MGR}/manager-app-shell.tsx`);
    expect(src).toContain("signOut");
    expect(src).toContain("next-auth/react");
    // Fable redesign uses proper accent: "Cerrar sesión"
    expect(src).toContain("Cerrar sesión");
  });

  test("executive tools: Alertas, Tareas, Informes", () => {
    const src = readFile(`${MGR}/manager-app-shell.tsx`);
    expect(src).toContain("Alertas");
    expect(src).toContain("Tareas");
    expect(src).toContain("Informes");
  });
});

// ── 6: Commercial Hub — exactly 7 surfaces ────────────────────────────────

describe("6 — Commercial Hub with 7 surfaces", () => {
  test("hub page imports assembleCommercialHubPA", () => {
    const src = readFile(`${COM}/page.tsx`);
    expect(src).toContain("assembleCommercialHubPA");
    expect(src).toContain("CommercialHubClient");
  });

  test("adapter defines exactly 7 surfaces", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    // Verify all 7 surface IDs
    expect(src).toContain('"ventas"');
    expect(src).toContain('"clientes"');
    expect(src).toContain('"vendedores"');
    expect(src).toContain('"pedidos"');
    expect(src).toContain('"tiendas"');
    expect(src).toContain('"inventario"');
    expect(src).toContain('"importaciones"');
  });

  test("hub client renders surfaces with navigation", () => {
    const src = readFile(`${COM}/commercial-hub-client.tsx`);
    expect(src).toContain("hubPA.surfaces.map");
    // Fable redesign renamed SurfaceCard → SurfaceTile (app-icon grid layout)
    expect(src).toContain("SurfaceTile");
    expect(src).toContain("router.push(surface.href)");
  });
});

// ── 7: All 7 surface routes exist ─────────────────────────────────────────

describe("7 — Surface route files exist", () => {
  const surfaces = ["ventas", "clientes", "vendedores", "pedidos", "tiendas", "inventario", "importaciones"];

  for (const surface of surfaces) {
    test(`${surface} page.tsx exists`, () => {
      expect(fileExists(`${COM}/${surface}/page.tsx`)).toBe(true);
    });

    test(`${surface} client.tsx exists`, () => {
      // Client file naming varies
      const candidates = [
        `${COM}/${surface}/${surface}-client.tsx`,
        `${COM}/${surface}/${surface.replace(/es$/, "")}-client.tsx`,
      ];
      const exists = candidates.some(c => fileExists(c));
      expect(exists).toBe(true);
    });
  }
});

// ── 8: Ventas surface consumes canonical ventas PA ────────────────────────

describe("8 — Ventas surface canonical reuse", () => {
  test("ventas page imports assembleVentasPA", () => {
    const src = readFile(`${COM}/ventas/page.tsx`);
    expect(src).toContain("assembleVentasPA");
    expect(src).toContain("loadControlComercial");
  });

  test("ventas client renders through ManagerSurfaceClient", () => {
    const src = readFile(`${COM}/ventas/ventas-client.tsx`);
    expect(src).toContain("ManagerSurfaceClient");
  });
});

// ── 9: Pedidos surface — ORDER_SYNC is data health, not attention ─────────

describe("9 — Pedidos: sync state as data health", () => {
  test("pedidos client shows sync state as informational note", () => {
    const src = readFile(`${COM}/pedidos/pedidos-client.tsx`);
    expect(src).toContain("syncState");
    expect(src).toContain("ManagerSurfaceClient");
  });

  test("pedidos types define syncState as data health enum", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-types.ts");
    expect(src).toContain("SYNCED");
    expect(src).toContain("SYNC_PENDING");
    expect(src).toContain("SYNC_FAILED");
  });
});

// ── 10: Importaciones — SIN_FECHA preserved as separate truth state ──────

describe("10 — Importaciones: SIN_FECHA truth state", () => {
  test("importaciones client renders sinFechaCount warning", () => {
    const src = readFile(`${COM}/importaciones/importaciones-client.tsx`);
    expect(src).toContain("sinFechaCount");
    // String uses proper accent: "sin fecha de actividad de importación"
    // The constant SIN_FECHA_DE_ACTIVIDAD_IMPORTACION is in the adapter, not the client.
    expect(src).toContain("sin fecha de actividad de importación");
  });

  test("adapter extracts sinFechaCount from canonical rotation status", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    expect(src).toContain("SIN_FECHA_DE_ACTIVIDAD_IMPORTACION");
  });
});

// ── 11: Tiendas — two-level hierarchy (network → store detail) ────────────

describe("11 — Tiendas: two-level hierarchy", () => {
  test("tiendas list page exists", () => {
    expect(fileExists(`${COM}/tiendas/page.tsx`)).toBe(true);
  });

  test("store detail page exists with storeId param", () => {
    expect(fileExists(`${COM}/tiendas/[storeId]/page.tsx`)).toBe(true);
  });

  test("store detail uses canonical storeId (warehouse PK)", () => {
    const src = readFile(`${COM}/tiendas/[storeId]/page.tsx`);
    expect(src).toContain("storeId");
    expect(src).toContain("assembleStoreDetailPA");
    expect(src).toContain("buildStoreNetworkSnapshot");
  });

  test("store detail redirects to list if not found", () => {
    const src = readFile(`${COM}/tiendas/[storeId]/page.tsx`);
    expect(src).toContain("redirect(");
    expect(src).toContain("/tiendas");
  });

  test("store detail client shows source status", () => {
    const src = readFile(`${COM}/tiendas/[storeId]/store-detail-client.tsx`);
    expect(src).toContain("sourceStatus");
    expect(src).toContain("FRESH");
    expect(src).toContain("AGING");
  });
});

// ── 12: Vendedores — two-level hierarchy (team → seller detail) ───────────

describe("12 — Vendedores: two-level hierarchy", () => {
  test("vendedores list page exists", () => {
    expect(fileExists(`${COM}/vendedores/page.tsx`)).toBe(true);
  });

  test("seller detail page exists with sellerId param", () => {
    expect(fileExists(`${COM}/vendedores/[sellerId]/page.tsx`)).toBe(true);
  });

  test("seller detail uses canonical sellerId (no fuzzy match)", () => {
    const src = readFile(`${COM}/vendedores/[sellerId]/page.tsx`);
    expect(src).toContain("getSellerBySlug");
    expect(src).toContain("sellerId");
    // Uses exact ID resolution, not name-based search
    expect(src).not.toContain(".includes(");
    expect(src).not.toContain("LIKE");
  });

  test("seller detail redirects to list if not found", () => {
    const src = readFile(`${COM}/vendedores/[sellerId]/page.tsx`);
    expect(src).toContain("redirect(");
    expect(src).toContain("/vendedores");
  });
});

// ── 13: Commission shows IDENTITY_UNRESOLVED ──────────────────────────────

describe("13 — Commission truth state: IDENTITY_UNRESOLVED", () => {
  test("adapter sets commissionTruthState based on terceroId", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    expect(src).toContain("IDENTITY_UNRESOLVED");
    expect(src).toContain("commissionTruthState");
  });

  test("seller detail client displays commission truth state label", () => {
    const src = readFile(`${COM}/vendedores/[sellerId]/seller-detail-client.tsx`);
    expect(src).toContain("commissionTruthState");
    expect(src).toContain("IDENTITY_UNRESOLVED");
    expect(src).toContain("Identidad no resuelta");
  });

  test("commission never shows zero — shows truth state instead", () => {
    const src = readFile(`${COM}/vendedores/[sellerId]/page.tsx`);
    // Should not have a numeric zero commission value
    expect(src).not.toContain('commission: 0');
    expect(src).not.toContain('commission: "0"');
  });
});

// ── 14: Maletas nested inside seller detail, NOT standalone ───────────────

describe("14 — Maletas position: nested in seller detail only", () => {
  test("maleta section type defined in seller detail PA", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-types.ts");
    expect(src).toContain("ManagerMaletaSection");
    expect(src).toContain("maletaSection");
  });

  test("seller detail client renders maleta section when present", () => {
    const src = readFile(`${COM}/vendedores/[sellerId]/seller-detail-client.tsx`);
    expect(src).toContain("maletaSection");
    expect(src).toContain("Maleta");
  });

  test("commercial hub does NOT have maletas as standalone surface", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    // Look for the surfaces array — no 'maletas' entry
    const hubFn = src.substring(src.indexOf("assembleCommercialHubPA"), src.indexOf("// ── Ventas PA"));
    expect(hubFn).not.toContain('"maletas"');
  });
});

// ── 15: Copilot context envelope ──────────────────────────────────────────

describe("15 — Copilot context envelope", () => {
  test("shell builds ManagerCopilotContext with full envelope", () => {
    const src = readFile(`${MGR}/manager-app-shell.tsx`);
    expect(src).toContain("copilotContext");
    expect(src).toContain("ManagerCopilotContext");
    expect(src).toContain("orgSlug");
    expect(src).toContain("moduleKey");
    expect(src).toContain("submoduleKey");
    expect(src).toContain("entityType");
    expect(src).toContain("entityId");
    expect(src).toContain("truthState");
    expect(src).toContain("freshness");
  });

  test("copilot context type has all required fields", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-types.ts");
    expect(src).toContain("ManagerCopilotContext");
    expect(src).toContain("orgSlug: string");
    expect(src).toContain("role: string");
    expect(src).toContain("moduleKey: string | null");
    expect(src).toContain("submoduleKey: string | null");
    expect(src).toContain("route: string");
    expect(src).toContain("entityType: string | null");
    expect(src).toContain("entityId: string | null");
    expect(src).toContain("truthState: ManagerTruthState | null");
    expect(src).toContain("freshness: string | null");
  });
});

// ── 16: Copilot orb persists across all Manager routes ────────────────────

describe("16 — Copilot orb persistence", () => {
  test("copilot orb is in shell, not individual pages", () => {
    const src = readFile(`${MGR}/manager-app-shell.tsx`);
    // Fable redesign: ManagerCopilotOrb replaced by shared CopilotSphere primitive.
    expect(src).toContain("CopilotSphere");
  });

  test("copilot orb has fixed positioning", () => {
    const src = readFile(`${MGR}/manager-app-shell.tsx`);
    expect(src).toContain('"fixed"');
    expect(src).toContain("bottom:");
    expect(src).toContain("zIndex:");
  });

  test("shell wraps all children", () => {
    const src = readFile(`${MGR}/layout.tsx`);
    expect(src).toContain("ManagerAppShell");
    expect(src).toContain("{children}");
  });
});

// ── 17: Shared ManagerSurfaceClient used by all surfaces ──────────────────

describe("17 — Shared ManagerSurfaceClient", () => {
  test("manager-surface-client.tsx exists", () => {
    expect(fileExists(`${COM}/manager-surface-client.tsx`)).toBe(true);
  });

  test("exports ManagerSurfaceClient with standard grammar", () => {
    const src = readFile(`${COM}/manager-surface-client.tsx`);
    expect(src).toContain("ManagerSurfaceClient");
    expect(src).toContain("SurfaceFact");
    expect(src).toContain("facts");
    expect(src).toContain("attentionStatus");
    expect(src).toContain("freshness");
  });

  test("facts capped at 4", () => {
    const src = readFile(`${COM}/manager-surface-client.tsx`);
    expect(src).toContain("facts.slice(0, 4)");
  });

  // Verify each surface client imports ManagerSurfaceClient
  const surfaceClients = [
    "ventas/ventas-client.tsx",
    "inventario/inventario-client.tsx",
    "importaciones/importaciones-client.tsx",
  ];

  for (const client of surfaceClients) {
    test(`${client} uses ManagerSurfaceClient`, () => {
      const src = readFile(`${COM}/${client}`);
      expect(src).toContain("ManagerSurfaceClient");
    });
  }
});

// ── 18: No business math in React ─────────────────────────────────────────

describe("18 — No business math in React", () => {
  const clientFiles = [
    `${MGR}/manager-home-client.tsx`,
    `${MGR}/manager-app-shell.tsx`,
    `${COM}/commercial-hub-client.tsx`,
    `${COM}/manager-surface-client.tsx`,
    `${COM}/ventas/ventas-client.tsx`,
    `${COM}/importaciones/importaciones-client.tsx`,
    `${COM}/tiendas/[storeId]/store-detail-client.tsx`,
    `${COM}/vendedores/[sellerId]/seller-detail-client.tsx`,
  ];

  for (const file of clientFiles) {
    test(`${file.split("/").pop()} has no prisma import`, () => {
      const src = readFile(file);
      expect(src).toContain('"use client"');
      expect(src).not.toContain("import { prisma");
      expect(src).not.toContain("from \"@prisma/client\"");
    });
  }
});

// ── 19: No business logic duplication ─────────────────────────────────────

describe("19 — No business logic duplication", () => {
  test("adapter imports server-only", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    expect(src).toContain('import "server-only"');
  });

  test("adapter imports canonical types, does not redefine", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    expect(src).toContain("ControlComercialSnapshot");
    expect(src).toContain("CommercialExecutivePA");
    expect(src).toContain("StoreNetworkSnapshot");
  });

  test("adapter has no prisma.* calls (code, not comments)", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    // Strip comments before checking — JSDoc may reference prisma for documentation
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
    expect(codeOnly).not.toContain("prisma.");
    expect(codeOnly).not.toContain("@prisma/client");
  });
});

// ── 20: Back navigation ──────────────────────────────────────────────────

describe("20 — Back navigation", () => {
  test("shell has back navigation for non-root routes", () => {
    const src = readFile(`${MGR}/manager-app-shell.tsx`);
    expect(src).toContain("backHref");
    expect(src).toContain("Volver");
  });

  test("submodule navigates back to module hub", () => {
    const src = readFile(`${MGR}/manager-app-shell.tsx`);
    // submodule → module hub
    expect(src).toContain("`${rootPath}/${moduleSlug}`");
  });
});

// ── 21: Types layer is pure domain (no React, no server-only) ─────────────

describe("21 — Types layer purity", () => {
  test("types file has no React or server-only imports", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-types.ts");
    expect(src).not.toContain("import React");
    expect(src).not.toContain('import "server-only"');
    expect(src).not.toContain("@prisma");
  });

  test("types define all required PA interfaces", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-types.ts");
    const required = [
      "ManagerHomePA",
      "ManagerCommercialHubPA",
      "ManagerVentasPA",
      "ManagerClientesPA",
      "ManagerVendedoresPA",
      "ManagerPedidosPA",
      "ManagerTiendasPA",
      "ManagerStoreDetailPA",
      "ManagerInventarioPA",
      "ManagerImportacionesPA",
      "ManagerSellerDetailPA",
      "ManagerCopilotContext",
    ];
    for (const name of required) {
      expect(src).toContain(`interface ${name}`);
    }
  });
});

// ── 22: Truth states defined correctly ────────────────────────────────────

describe("22 — Truth states", () => {
  test("ManagerTruthState has 4 values", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-types.ts");
    expect(src).toContain('"CERTIFIED"');
    expect(src).toContain('"PARTIAL"');
    expect(src).toContain('"IDENTITY_UNRESOLVED"');
    expect(src).toContain('"SOURCE_UNAVAILABLE"');
  });

  test("ManagerAttentionStatus has NONE and HAS_ITEMS", () => {
    const src = readFile("lib/comercial/manager/manager-commercial-types.ts");
    expect(src).toContain('"NONE"');
    expect(src).toContain('"HAS_ITEMS"');
  });
});

// ── 23: Desktop Enterprise not broken ─────────────────────────────────────

describe("23 — Desktop Enterprise unchanged", () => {
  test("desktop comercial entry page still exists", () => {
    const src = readFile("app/(app)/[orgSlug]/comercial/page.tsx");
    expect(src).toContain("MOBILE_TABLET_RE");
  });

  test("/comercial/executive still works", () => {
    const src = readFile("app/(app)/[orgSlug]/comercial/executive/page.tsx");
    expect(src).toContain("assembleCommercialExecutivePA");
    expect(src).toContain("CommercialExecutiveClient");
  });

  test("parent layout still renders WorkspaceShellClient for desktop", () => {
    const src = readFile("app/(app)/[orgSlug]/layout.tsx");
    expect(src).toContain("WorkspaceShellClient");
    expect(src).toContain("RightOpsRail");
  });
});

// ── 24: Visual integration — design tokens ────────────────────────────────

describe("24 — Visual integration: design tokens", () => {
  const clientFiles = [
    `${MGR}/manager-home-client.tsx`,
    `${MGR}/manager-app-shell.tsx`,
    `${COM}/commercial-hub-client.tsx`,
    `${COM}/manager-surface-client.tsx`,
  ];

  for (const file of clientFiles) {
    test(`${file.split("/").pop()} imports design tokens`, () => {
      const src = readFile(file);
      // manager-home-client and manager-app-shell use local Fable F tokens (no @/lib/ui/tokens import).
      // commercial-hub-client and manager-surface-client import from @/lib/ui/tokens.
      const usesFableTokens = file.includes("manager-home-client") || file.includes("manager-app-shell");
      if (usesFableTokens) {
        // Local F token object — brand blue is F.brand = "#004AAD"
        expect(src).toContain('brand:       "#004AAD"');
      } else {
        expect(src).toContain("@/lib/ui/tokens");
      }
    });
  }

  test("shell uses F.brand (#004AAD) for brand actions", () => {
    const src = readFile(`${MGR}/manager-app-shell.tsx`);
    // Fable redesign uses local F tokens. F.brand = "#004AAD" = C.blueDark.
    expect(src).toContain('brand:       "#004AAD"');
  });

  test("hub uses #004AAD for surface icons", () => {
    const src = readFile(`${COM}/commercial-hub-client.tsx`);
    // Hub uses inline hex #004AAD (= C.blueDark) for icon color.
    expect(src).toContain('"#004AAD"');
  });
});

// ── 25: No demo constants ─────────────────────────────────────────────────

describe("25 — No demo constants", () => {
  const allFiles = [
    "lib/comercial/manager/manager-commercial-adapter.ts",
    "lib/comercial/manager/manager-commercial-types.ts",
    `${COM}/page.tsx`,
    `${COM}/commercial-hub-client.tsx`,
    `${MGR}/page.tsx`,
    `${MGR}/manager-home-client.tsx`,
    `${MGR}/manager-app-shell.tsx`,
  ];

  for (const file of allFiles) {
    test(`${file.split("/").pop()} has no DEMO_ or MOCK_ or PLACEHOLDER_ constants`, () => {
      const src = readFile(file);
      expect(src).not.toContain("DEMO_");
      expect(src).not.toContain("MOCK_");
      expect(src).not.toContain("PLACEHOLDER_");
      expect(src).not.toContain("TODO_REPLACE");
    });
  }
});

// ── 26: Route inventory complete ──────────────────────────────────────────

describe("26 — Route inventory", () => {
  const expectedRoutes = [
    `${MGR}/page.tsx`,                                     // Home
    `${MGR}/layout.tsx`,                                   // Layout
    `${MGR}/manager-app-shell.tsx`,                        // Shell
    `${MGR}/manager-home-client.tsx`,                      // Home client
    `${COM}/page.tsx`,                                     // Hub
    `${COM}/commercial-hub-client.tsx`,                    // Hub client
    `${COM}/manager-surface-client.tsx`,                   // Shared surface
    `${COM}/ventas/page.tsx`,                              // Ventas
    `${COM}/clientes/page.tsx`,                            // Clientes
    `${COM}/vendedores/page.tsx`,                          // Vendedores list
    `${COM}/vendedores/[sellerId]/page.tsx`,             // Seller detail
    `${COM}/pedidos/page.tsx`,                             // Pedidos
    `${COM}/tiendas/page.tsx`,                             // Tiendas list
    `${COM}/tiendas/[storeId]/page.tsx`,                   // Store detail
    `${COM}/inventario/page.tsx`,                          // Inventario
    `${COM}/importaciones/page.tsx`,                       // Importaciones
  ];

  for (const route of expectedRoutes) {
    test(`${route.replace(`${MGR}/`, "")} exists`, () => {
      expect(fileExists(route)).toBe(true);
    });
  }
});
