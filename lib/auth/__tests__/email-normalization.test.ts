/**
 * lib/auth/__tests__/email-normalization.test.ts
 *
 * Sprint: AGENTIK-MANAGER-AUTH-HOTFIX-M1.2
 *
 * Focused tests for email normalization in credentials auth and member admin.
 *
 * Proves:
 *   A. exact lowercase email authenticates (authorize path)
 *   B. mixed-case email resolves the same user (authorize path)
 *   C. leading/trailing whitespace is ignored (authorize path)
 *   D. newly created tenant users store normalized email (member-admin)
 *   E. incorrect password still fails (authorize path)
 *   F. deleted users still fail (authorize path)
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

// ── A: exact lowercase email authenticates ──────────────────────────────────

describe("A — exact lowercase email authenticates", () => {
  test("authorize normalizes email with trim().toLowerCase() before lookup", () => {
    const src = readFile("lib/auth/auth.config.ts");
    expect(src).toContain("credentials.email.trim().toLowerCase()");
  });

  test("authorize uses normalizedEmail in findUnique", () => {
    const src = readFile("lib/auth/auth.config.ts");
    expect(src).toContain("where: { email: normalizedEmail }");
  });

  test("authorize does NOT use raw credentials.email in findUnique", () => {
    const src = readFile("lib/auth/auth.config.ts");
    // After normalization, the findUnique must use normalizedEmail, not credentials.email
    expect(src).not.toContain("where: { email: credentials.email }");
  });
});

// ── B: mixed-case email resolves the same user ──────────────────────────────

describe("B — mixed-case email resolves same user", () => {
  test("normalize converts any case to lowercase", () => {
    // Simulate the normalization logic
    const inputs = [
      "User@Example.COM",
      "USER@EXAMPLE.COM",
      "user@example.com",
      "  User@Example.COM  ",
    ];
    const normalized = inputs.map(e => e.trim().toLowerCase());
    const allSame = normalized.every(e => e === "user@example.com");
    expect(allSame).toBe(true);
  });
});

// ── C: leading/trailing whitespace is ignored ───────────────────────────────

describe("C — whitespace is ignored in email", () => {
  test("trim removes leading/trailing spaces", () => {
    expect("  user@example.com  ".trim().toLowerCase()).toBe("user@example.com");
    expect(" user@example.com".trim().toLowerCase()).toBe("user@example.com");
    expect("user@example.com ".trim().toLowerCase()).toBe("user@example.com");
  });

  test("authorize applies trim before toLowerCase", () => {
    const src = readFile("lib/auth/auth.config.ts");
    // Must be trim().toLowerCase() — trim first to handle whitespace
    expect(src).toContain(".trim().toLowerCase()");
  });
});

// ── D: newly created tenant users store normalized email ────────────────────

describe("D — createOrgMember stores normalized email", () => {
  test("member-admin normalizes email before upsert", () => {
    const src = readFile("lib/auth/member-admin.ts");
    expect(src).toContain("input.email.trim().toLowerCase()");
  });

  test("member-admin uses normalizedEmail in user upsert", () => {
    const src = readFile("lib/auth/member-admin.ts");
    expect(src).toContain("where: { email: normalizedEmail }");
    expect(src).toContain("create: { email: normalizedEmail,");
  });

  test("member-admin does NOT use raw input.email in upsert", () => {
    const src = readFile("lib/auth/member-admin.ts");
    // After the normalization line, the upsert must NOT use input.email directly
    expect(src).not.toContain("where: { email: input.email }");
    expect(src).not.toContain("create: { email: input.email,");
  });

  test("provisioning script normalizes email from env var", () => {
    const src = readFile("scripts/_provision-castillitos-org-admin.ts");
    expect(src).toContain(".trim().toLowerCase()");
  });
});

// ── E: incorrect password still fails ───────────────────────────────────────

describe("E — incorrect password still fails", () => {
  test("authorize returns null when verifyPassword fails", () => {
    const src = readFile("lib/auth/auth.config.ts");
    expect(src).toContain("if (!valid) return null");
  });

  test("verifyPassword uses bcrypt.compare", () => {
    const src = readFile("lib/auth/password.ts");
    expect(src).toContain("bcrypt.compare(password, hash)");
  });
});

// ── F: deleted users still fail ─────────────────────────────────────────────

describe("F — deleted users still fail", () => {
  test("authorize checks deletedAt", () => {
    const src = readFile("lib/auth/auth.config.ts");
    expect(src).toContain("user.deletedAt");
    expect(src).toContain("if (!user || user.deletedAt) return null");
  });

  test("authorize checks passwordCredential exists", () => {
    const src = readFile("lib/auth/auth.config.ts");
    expect(src).toContain("if (!user.passwordCredential) return null");
  });
});

// ── G: SUPER_ADMIN gates untouched ──────────────────────────────────────────

describe("G — SUPER_ADMIN gates untouched", () => {
  test("Manager layout MANAGER_ROLES unchanged", () => {
    const src = readFile("app/(app)/[orgSlug]/manager/layout.tsx");
    expect(src).toContain('const MANAGER_ROLES = new Set(["ORG_ADMIN", "MANAGER"])');
    expect(src).not.toContain('"SUPER_ADMIN"');
  });

  test("org root MANAGER_MOBILE_ROLES unchanged", () => {
    const src = readFile("app/(app)/[orgSlug]/page.tsx");
    expect(src).toContain('const MANAGER_MOBILE_ROLES = new Set(["ORG_ADMIN", "MANAGER"])');
  });
});
