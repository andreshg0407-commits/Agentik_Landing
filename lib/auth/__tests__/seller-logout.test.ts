/**
 * lib/auth/__tests__/seller-logout.test.ts
 *
 * Sprint: AGENTIK-SELLER-APP-LOGOUT-01
 *
 * Tests A-E: Seller App logout presence, flow, and security invariants.
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

// ── Test A: Authenticated seller sees logout in Perfil ──────────────────────

describe("Seller Logout — perfil-view.tsx", () => {
  const src = readFile("app/(app)/[orgSlug]/seller-app/views/perfil-view.tsx");

  test("A — Perfil view contains 'Cerrar sesión' logout button", () => {
    expect(src).toContain("Cerrar sesión");
  });

  test("B — Perfil view calls signOut from next-auth/react", () => {
    expect(src).toContain('import { signOut } from "next-auth/react"');
    expect(src).toContain("signOut(");
  });

  test("C — signOut redirects to /login (not landing page)", () => {
    // callbackUrl must be /login
    expect(src).toContain('callbackUrl: "/login"');
    // Must NOT redirect to "/" or marketing landing
    const signOutCall = src.match(/signOut\(\{[^}]+\}\)/)?.[0] ?? "";
    expect(signOutCall).toContain("/login");
    expect(signOutCall).not.toContain('callbackUrl: "/"');
  });
});

// ── Test D: Protected Seller App requires auth ──────────────────────────────

describe("Seller Logout — auth protection", () => {
  const pageSrc = readFile("app/(app)/[orgSlug]/seller-app/page.tsx");

  test("D — Seller App page.tsx calls requireOrgAccess (auth gate present)", () => {
    expect(pageSrc).toContain("requireOrgAccess");
    // After logout, this gate will throw UNAUTHENTICATED → redirect to /login
  });
});

// ── Test E: Enterprise confinement unchanged ────────────────────────────────

describe("Seller Logout — confinement invariants", () => {
  const orgAccessSrc = readFile("lib/auth/org-access.ts");
  const layoutSrc = readFile("app/(app)/[orgSlug]/layout.tsx");

  test("E — Enterprise confinement gate unchanged in org-access.ts and layout.tsx", () => {
    // org-access.ts still has the confinement gate
    expect(orgAccessSrc).toContain("ACCESS_DENIED_SELLER_CONFINED");
    expect(orgAccessSrc).toContain("SELLER_CONFINED_ROLES");
    expect(orgAccessSrc).toContain("!opts?.allowProvisionedSeller");

    // layout.tsx still redirects confined sellers to /seller-app
    expect(layoutSrc).toContain("SELLER_CONFINED_ROLES");
    expect(layoutSrc).toContain("seller-app");
  });
});
