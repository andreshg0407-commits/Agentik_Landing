/**
 * lib/auth/__tests__/executive-mobile-shell.test.ts
 *
 * Sprint: AGENTIK-EXECUTIVE-MOBILE-SHELL-01
 *
 * Contract tests for executive mobile shell architecture.
 * Tests A-L: responsive chrome, entitlement source, routing, confinement.
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

// ── A: Mobile ORG_ADMIN org root does not render desktop rail ───────────────

describe("A — Mobile ORG_ADMIN: no desktop rail", () => {
  test("layout passes mobileShell for ORG_ADMIN", () => {
    const src = readFile("app/(app)/[orgSlug]/layout.tsx");
    expect(src).toContain("EXECUTIVE_MOBILE_ROLES");
    expect(src).toContain('"ORG_ADMIN"');
    expect(src).toContain("enableMobileShell");
    expect(src).toContain("mobileShell={mobileShell}");
  });

  test("shell applies ag-has-mobile class when mobileShell set", () => {
    const src = readFile("components/shell/workspace-shell-client.tsx");
    expect(src).toContain("ag-has-mobile");
    expect(src).toContain("ag-desktop-only");
  });

  test("CSS hides desktop chrome at <=1024px for ag-has-mobile", () => {
    const src = readFile("app/(app)/[orgSlug]/layout.tsx");
    expect(src).toContain("ag-has-mobile .ag-desktop-only { display: none");
  });
});

// ── B: Mobile MANAGER org root does not render desktop rail ─────────────────

describe("B — Mobile MANAGER: no desktop rail", () => {
  test("MANAGER included in EXECUTIVE_MOBILE_ROLES", () => {
    const src = readFile("app/(app)/[orgSlug]/layout.tsx");
    expect(src).toContain('"MANAGER"');
    const block = src.substring(
      src.indexOf("EXECUTIVE_MOBILE_ROLES"),
      src.indexOf(";", src.indexOf("EXECUTIVE_MOBILE_ROLES")) + 1,
    );
    expect(block).toContain('"MANAGER"');
  });
});

// ── C: Entitled module cards derive from TenantModule ───────────────────────

describe("C — Module cards from TenantModule entitlements", () => {
  test("org root page uses getEnabledModules", () => {
    const src = readFile("app/(app)/[orgSlug]/page.tsx");
    expect(src).toContain("getEnabledModules");
    expect(src).toContain("filterModulesByRole");
  });

  test("org root passes domains to EnterpriseLauncherClient", () => {
    const src = readFile("app/(app)/[orgSlug]/page.tsx");
    expect(src).toContain("domains={launcherDomains}");
  });

  test("launcher renders only passed domains", () => {
    const src = readFile("app/(app)/[orgSlug]/enterprise-launcher-client.tsx");
    expect(src).toContain("domains.map");
    expect(src).not.toContain("hardcoded");
  });
});

// ── D: Disabled module absent ───────────────────────────────────────────────

describe("D — Disabled module absent", () => {
  test("launcher filters by non-empty items", () => {
    const src = readFile("app/(app)/[orgSlug]/page.tsx");
    expect(src).toContain("d.items.length > 0");
  });

  test("disabled items filtered from launcher", () => {
    const src = readFile("app/(app)/[orgSlug]/page.tsx");
    expect(src).toContain("!item.disabled");
  });
});

// ── E: Commercial card routes to /[orgSlug]/comercial ───────────────────────

describe("E — Commercial entry routes correctly", () => {
  test("comercial page exists and redirects mobile to /executive", () => {
    const src = readFile("app/(app)/[orgSlug]/comercial/page.tsx");
    expect(src).toContain("comercial/executive");
    expect(src).toContain("MOBILE_TABLET_RE");
  });

  test("commercial executive client exists and is mobile-first", () => {
    const src = readFile("app/(app)/[orgSlug]/comercial/executive/executive-client.tsx");
    expect(src).toContain("390px");
    expect(src).toContain("maxWidth: 640");
  });
});

// ── F: Commercial Executive B01/B02 regressions green ───────────────────────

describe("F — Commercial Executive not broken", () => {
  test("executive page still imports CommercialExecutiveClient", () => {
    const src = readFile("app/(app)/[orgSlug]/comercial/executive/page.tsx");
    expect(src).toContain("CommercialExecutiveClient");
  });

  test("executive client has three tabs", () => {
    const src = readFile("app/(app)/[orgSlug]/comercial/executive/executive-client.tsx");
    expect(src).toContain('"resumen"');
    expect(src).toContain('"inteligencia"');
    expect(src).toContain('"informes"');
  });
});

// ── G: Seller App unchanged ─────────────────────────────────────────────────

describe("G — Seller App unchanged", () => {
  test("seller-app bypass still exists in layout", () => {
    const src = readFile("app/(app)/[orgSlug]/layout.tsx");
    expect(src).toContain("isSellerApp");
    expect(src).toContain("return <>{children}</>");
  });

  test("seller bypass happens before mobile shell logic", () => {
    const src = readFile("app/(app)/[orgSlug]/layout.tsx");
    const sellerBypassPos = src.indexOf("if (isSellerApp)");
    const mobileShellPos = src.indexOf("EXECUTIVE_MOBILE_ROLES");
    expect(sellerBypassPos).toBeLessThan(mobileShellPos);
  });
});

// ── H: Seller cannot enter Executive Mobile ─────────────────────────────────

describe("H — Seller confinement preserved", () => {
  test("seller confinement gate before mobile shell", () => {
    const src = readFile("app/(app)/[orgSlug]/layout.tsx");
    expect(src).toContain("SELLER_CONFINED_ROLES");
    expect(src).toContain("sellerSlug");
  });

  test("OPERATOR/VIEWER not in EXECUTIVE_MOBILE_ROLES", () => {
    const src = readFile("app/(app)/[orgSlug]/layout.tsx");
    const block = src.substring(
      src.indexOf("EXECUTIVE_MOBILE_ROLES"),
      src.indexOf(";", src.indexOf("EXECUTIVE_MOBILE_ROLES")) + 1,
    );
    expect(block).not.toContain('"OPERATOR"');
    expect(block).not.toContain('"VIEWER"');
  });
});

// ── I: Viewport does not authorize anything ─────────────────────────────────

describe("I — Viewport does not authorize", () => {
  test("layout authorizes via requireTenant before any viewport logic", () => {
    const src = readFile("app/(app)/[orgSlug]/layout.tsx");
    const authPos = src.indexOf("requireTenant");
    const mobilePos = src.indexOf("EXECUTIVE_MOBILE_ROLES");
    expect(authPos).toBeLessThan(mobilePos);
  });

  test("mobile chrome component has no authorization logic", () => {
    const src = readFile("components/shell/executive-mobile-chrome.tsx");
    expect(src).not.toContain("requireTenant");
    expect(src).not.toContain("requireOrgAccess");
    expect(src).not.toContain("prisma");
    expect(src).toContain("Presentation only");
  });
});

// ── J: Desktop Enterprise shell unchanged ───────────────────────────────────

describe("J — Desktop shell unchanged", () => {
  test("WorkspaceShellClient still renders PrimaryRail", () => {
    const src = readFile("components/shell/workspace-shell-client.tsx");
    expect(src).toContain("<PrimaryRail");
    expect(src).toContain("ContextPanel");
  });

  test("SUPER_ADMIN does NOT get mobile shell", () => {
    const src = readFile("app/(app)/[orgSlug]/layout.tsx");
    const block = src.substring(
      src.indexOf("EXECUTIVE_MOBILE_ROLES"),
      src.indexOf(";", src.indexOf("EXECUTIVE_MOBILE_ROLES")) + 1,
    );
    expect(block).not.toContain('"SUPER_ADMIN"');
    expect(block).not.toContain('"AGENTIK_ADMIN"');
  });

  test("desktop elements visible when mobileShell not set", () => {
    const src = readFile("components/shell/workspace-shell-client.tsx");
    // When hasMobile is false, className is undefined (no ag-desktop-only)
    expect(src).toContain('className={hasMobile ? "ag-desktop-only" : undefined}');
  });
});

// ── K: Tablet receives Executive presentation ───────────────────────────────

describe("K — Tablet gets executive shell", () => {
  test("breakpoint is 1024px covering tablets", () => {
    const src = readFile("app/(app)/[orgSlug]/layout.tsx");
    expect(src).toContain("max-width: 1024px");
    expect(src).toContain("ag-has-mobile .ag-desktop-only");
  });

  test("mobile header renders for tablet too", () => {
    const src = readFile("components/shell/workspace-shell-client.tsx");
    expect(src).toContain("ExecutiveMobileHeader");
    // No separate tablet-only logic — same mobile chrome for phone and tablet
  });
});

// ── L: 390px no structural horizontal overflow ──────────────────────────────

describe("L — 390px compatibility", () => {
  test("mobile header uses flex layout with overflow control", () => {
    const src = readFile("components/shell/executive-mobile-chrome.tsx");
    expect(src).toContain("textOverflow");
    expect(src).toContain("whiteSpace");
    expect(src).toContain('overflow:      "hidden"');
  });

  test("canvas padding removed on mobile", () => {
    const src = readFile("app/(app)/[orgSlug]/layout.tsx");
    expect(src).toContain("ag-shell-canvas");
    expect(src).toContain("padding: 0 !important");
  });

  test("copilot sphere is fixed position, not in flow", () => {
    const src = readFile("components/shell/executive-mobile-chrome.tsx");
    expect(src).toContain('"fixed"');
    expect(src).toContain("bottom:");
    expect(src).toContain("right:");
    expect(src).toContain("zIndex:");
  });

  test("EnterpriseLauncherClient uses responsive grid", () => {
    const src = readFile("app/(app)/[orgSlug]/enterprise-launcher-client.tsx");
    expect(src).toContain("repeat(auto-fill, minmax(280px, 1fr))");
    expect(src).toContain("clamp(");
  });
});
