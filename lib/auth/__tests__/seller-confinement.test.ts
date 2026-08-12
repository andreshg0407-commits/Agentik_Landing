/**
 * lib/auth/__tests__/seller-confinement.test.ts
 *
 * Sprint: AGENTIK-SELLER-APP-AUTH-CONFINEMENT-P0-01
 *
 * Tests A-J: Seller confinement gate in requireOrgAccess + layout + page.
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");

// ── Helpers ──────────────────────────────────────────────────────────────────

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

// ── Test A: requireOrgAccess throws ACCESS_DENIED_SELLER_CONFINED by default ─

describe("Seller Confinement — org-access.ts", () => {
  const src = readFile("lib/auth/org-access.ts");

  test("A — requireOrgAccess throws ACCESS_DENIED_SELLER_CONFINED when allowProvisionedSeller is not set", () => {
    // The gate: if !opts?.allowProvisionedSeller && SELLER_CONFINED_ROLES.has(role) && perms.sellerSlug → throw
    expect(src).toContain("ACCESS_DENIED_SELLER_CONFINED");
    expect(src).toContain("!opts?.allowProvisionedSeller");
    expect(src).toContain("SELLER_CONFINED_ROLES.has(membership.role)");
  });

  test("B — SELLER_CONFINED_ROLES includes OPERATOR and VIEWER only", () => {
    const match = src.match(/SELLER_CONFINED_ROLES\s*=\s*new Set\(\[([^\]]+)\]\)/);
    expect(match).toBeTruthy();
    const roles = match![1].replace(/"/g, "").replace(/'/g, "").split(",").map(s => s.trim());
    expect(roles).toContain("OPERATOR");
    expect(roles).toContain("VIEWER");
    // Must NOT include enterprise roles
    expect(roles).not.toContain("MANAGER");
    expect(roles).not.toContain("ORG_ADMIN");
    expect(roles).not.toContain("SUPER_ADMIN");
    expect(roles).not.toContain("AGENTIK_ADMIN");
  });

  test("C — allowProvisionedSeller option is typed in OrgAccessOptions", () => {
    expect(src).toContain("allowProvisionedSeller?: boolean");
  });

  test("D — confinement checks permissionsJson.sellerSlug before throwing", () => {
    // Must check perms?.sellerSlug — non-provisioned OPERATOR/VIEWER are unaffected
    expect(src).toContain("perms?.sellerSlug");
  });
});

// ── Test E: Seller App page.tsx uses allowProvisionedSeller: true ─────────

describe("Seller Confinement — seller-app/page.tsx", () => {
  const src = readFile("app/(app)/[orgSlug]/seller-app/page.tsx");

  test("E — Seller App page calls requireOrgAccess with allowProvisionedSeller: true", () => {
    expect(src).toContain("requireOrgAccess(orgSlug, { allowProvisionedSeller: true })");
  });

  test("F — Seller App page does NOT call requireOrgAccess without options", () => {
    // Must not have a bare requireOrgAccess(orgSlug) without the second arg
    const bareCallPattern = /requireOrgAccess\(orgSlug\)(?!\s*,)/;
    // More precise: find all requireOrgAccess calls and ensure none lack the opt-in
    const calls = src.match(/requireOrgAccess\([^)]+\)/g) ?? [];
    for (const call of calls) {
      expect(call).toContain("allowProvisionedSeller");
    }
    expect(calls.length).toBeGreaterThan(0);
  });
});

// ── Test G: Layout uses requireTenant (NOT requireOrgAccess) ─────────────

describe("Seller Confinement — layout.tsx", () => {
  const src = readFile("app/(app)/[orgSlug]/layout.tsx");

  test("G — Layout uses requireTenant, not requireOrgAccess", () => {
    // Layout must NOT use requireOrgAccess (which would throw for sellers)
    expect(src).not.toContain("requireOrgAccess");
    expect(src).toContain("requireTenant");
  });

  test("H — Layout redirects confined sellers TO /seller-app (not away from it)", () => {
    // Layout confinement: if seller is on non-seller-app path → redirect TO seller-app
    expect(src).toContain("SELLER_CONFINED_ROLES");
    expect(src).toContain("seller-app");
    // Must check isSellerApp before confining
    expect(src).toContain("isSellerApp");
    // Must redirect to seller-app
    const redirectMatch = src.match(/redirect\(`\/\$\{.*\}\/seller-app`\)/);
    expect(redirectMatch).toBeTruthy();
  });

  test("I — Layout renders children directly for /seller-app paths (no enterprise shell)", () => {
    // When isSellerApp, layout returns <>{children}</> — no WorkspaceShellClient
    expect(src).toContain("if (isSellerApp)");
    // After isSellerApp check, must return children without the shell
    const sellerAppBlock = src.slice(src.indexOf("if (isSellerApp)"));
    expect(sellerAppBlock).toContain("{children}");
  });
});

// ── Test J: Seller App API routes all use allowProvisionedSeller: true ────

describe("Seller Confinement — API routes", () => {
  test("J — All Seller App API routes use allowProvisionedSeller: true", () => {
    // Known Seller App API routes that must opt in
    const sellerApiRoutes = [
      "app/api/orgs/[orgSlug]/comercial/pedidos/route.ts",
      "app/api/orgs/[orgSlug]/comercial/pedidos/products/route.ts",
      "app/api/orgs/[orgSlug]/comercial/customer-context/route.ts",
      "app/api/orgs/[orgSlug]/comercial/customer-recent-orders/route.ts",
      "app/api/orgs/[orgSlug]/comercial/seller-financial/commissions/route.ts",
      "app/api/orgs/[orgSlug]/comercial/vendedores/[sellerSlug]/route.ts",
    ];

    for (const route of sellerApiRoutes) {
      const filePath = path.join(ROOT, route);
      if (!fs.existsSync(filePath)) continue; // skip if route doesn't exist yet
      const routeSrc = fs.readFileSync(filePath, "utf-8");
      expect(routeSrc).toContain("allowProvisionedSeller: true");
    }
  });
});
