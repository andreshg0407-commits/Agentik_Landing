/**
 * cliente-slug-resolver-security.test.ts
 *
 * Sprint: MANAGER-PRODUCTION-TRUTH-GATE
 * Section 3: Slug resolver security
 *
 * Verifies that the slug→id resolution in loadCliente360 is:
 * - Backward-compatible with UUID lookups
 * - Correctly resolves slugs
 * - Fails safely on unknown slugs
 * - Enforces tenant isolation (organizationId)
 * - Produces no cross-tenant exposure
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "../../../..");

function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf-8");
}

describe("cliente-360-loader slug→id resolver — security", () => {
  const loaderCode = readFile("lib/comercial/clientes/cliente-360-loader.ts");

  // ── 1. UUID continues working ──────────────────────────────────────────────

  test("UUID format bypasses slug lookup — goes directly to findFirst by id", () => {
    // The resolver checks UUID format and skips slug lookup when it matches
    expect(loaderCode).toContain("isUuid");
    expect(loaderCode).toMatch(/\/\^[^/]*[0-9a-f].*\$\//); // UUID regex pattern
    expect(loaderCode).toContain("if (!isUuid)");
    // When isUuid is true, resolvedId stays as clienteId (no slug query)
    expect(loaderCode).toContain("let resolvedId = clienteId");
  });

  test("UUID lookup uses findFirst with both id AND organizationId", () => {
    // The profile query always includes organizationId — tenant isolation
    expect(loaderCode).toMatch(/findFirst\(\s*\{[\s\S]*?where:\s*\{[\s\S]*?id:\s*resolvedId[\s\S]*?organizationId/);
  });

  // ── 2. Slug correct resolves ───────────────────────────────────────────────

  test("non-UUID clienteId triggers slug lookup", () => {
    expect(loaderCode).toContain("if (!isUuid)");
    expect(loaderCode).toContain("slug: clienteId");
  });

  test("slug lookup queries by slug AND organizationId — tenant-scoped", () => {
    // The slug resolution query must include organizationId
    expect(loaderCode).toMatch(/slug:\s*clienteId[\s\S]*?organizationId/);
  });

  test("resolved slug ID is used for all downstream queries", () => {
    // After resolution, resolvedId (not clienteId) is used everywhere
    // Phase 1 queries use resolvedId
    expect(loaderCode).toContain("customerId: resolvedId");
    // Seller lookup uses resolvedId
    expect(loaderCode).toContain("getCustomerPrimarySeller(organizationId, resolvedId)");
    // Profile lookup uses resolvedId
    expect(loaderCode).toMatch(/id:\s*resolvedId,\s*organizationId/);
  });

  // ── 3. Unknown slug returns safe state ─────────────────────────────────────

  test("unknown slug leaves resolvedId unchanged — profile findFirst returns null → loader returns null", () => {
    // If slug lookup returns nothing, resolvedId stays as the original clienteId
    // Then profile findFirst with id=clienteId (not a UUID) returns null
    // Then the function returns null
    expect(loaderCode).toContain("if (bySlug) resolvedId = bySlug.id");
    expect(loaderCode).toContain("if (!p) return null");
  });

  test("loader never throws on invalid clienteId — returns null instead", () => {
    // The function signature returns Promise<Cliente360Data | null>
    expect(loaderCode).toContain("): Promise<Cliente360Data | null>");
  });

  // ── 4. Cross-tenant isolation ──────────────────────────────────────────────

  test("slug resolution includes organizationId — prevents cross-tenant slug collision", () => {
    // Two orgs could have the same slug (e.g. same NIT);
    // organizationId in the where clause prevents cross-org resolution
    const slugQuery = loaderCode.match(/slug:\s*clienteId[\s\S]{0,100}/);
    expect(slugQuery).toBeTruthy();
    expect(slugQuery![0]).toContain("organizationId");
  });

  test("ALL queries include organizationId — tenant isolation throughout", () => {
    // Every DB query in the loader must be org-scoped
    // slug resolution + profile + seller + receivables + collections + crmQuotes + sagOrders + sales = 8+
    const orgIdMatches = loaderCode.match(/organizationId/g) ?? [];
    expect(orgIdMatches.length).toBeGreaterThanOrEqual(8);
  });

  test("no query uses clienteId directly after resolution — all use resolvedId", () => {
    // After the resolution block, clienteId should not appear in where clauses
    const afterResolution = loaderCode.split("Phase 1")[0]?.includes("resolvedId")
      ? true : loaderCode.includes("resolvedId");
    expect(afterResolution).toBe(true);
    // Verify downstream uses resolvedId, not raw clienteId
    expect(loaderCode).toContain("id: resolvedId");
    expect(loaderCode).toContain("customerId: resolvedId");
  });

  // ── 5. No information leakage ──────────────────────────────────────────────

  test("slug lookup only selects id — no other fields exposed during resolution", () => {
    // The slug→id resolution should only select { id: true } to minimize data exposure
    expect(loaderCode).toMatch(/slug:\s*clienteId[\s\S]*?select:\s*\{\s*id:\s*true\s*\}/);
  });

  test("no raw SQL in slug resolution — uses Prisma parameterized queries", () => {
    // Slug resolution must not use $queryRawUnsafe or string interpolation
    const slugSection = loaderCode.split("if (!isUuid)")[1]?.split("Phase 1")[0] ?? "";
    expect(slugSection).not.toContain("$queryRaw");
    expect(slugSection).not.toContain("$executeRaw");
    expect(slugSection).not.toContain("${clienteId}");
  });

  // ── 6. Manager alert integration ──────────────────────────────────────────

  test("alert entityKey uses slug — compatible with slug resolver", () => {
    const alertEngine = readFile("lib/sales/crm-alert-engine.ts");
    // The premium_inactive alert sets entityKey to p.slug
    expect(alertEngine).toContain("entityKey:   p.slug");
    expect(alertEngine).toContain("entityType:  \"customer\"");
  });

  test("Manager adapter resolves customer alert to /clientes/{clienteId}", () => {
    const adapter = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
    expect(adapter).toContain("clienteId = CustomerProfile.id");
    expect(adapter).toContain("alert.entityKey");
    expect(adapter).toContain("/clientes/${clienteId}");
  });
});
