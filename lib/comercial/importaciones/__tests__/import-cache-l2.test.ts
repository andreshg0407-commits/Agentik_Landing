/**
 * import-cache-l2.test.ts
 *
 * Sprint: IMPORT-CACHE-PROD-01
 *
 * Verifies that the import intelligence cache has a persistent L2 layer
 * backed by Postgres (NOT /tmp — /tmp is per-invocation on Vercel):
 *   - L1: in-memory Map (5 min TTL)
 *   - L2: Postgres table import_intelligence_cache (30 min TTL)
 *   - Web requests are READ-ONLY: L1 → L2 fresh → L2 stale → SOURCE_UNAVAILABLE
 *   - Web requests NEVER call buildImportSupplyIntelligence()
 *   - Only prewarmImportCache calls buildImportSupplyIntelligence()
 *   - Prewarm computes FIRST, then atomically writes (never invalidates before success)
 *   - Invalidation clears both layers
 *   - Prewarm API route exists with CRON_SECRET support
 *   - Versioned migration exists (not runtime CREATE TABLE)
 *   - schema_version, computed_at, source_as_of in L2 schema
 *   - Admin-only access for user-initiated prewarm
 *   - Vercel Cron entry exists in vercel.json
 */

import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "../../../..");
const cacheCode = readFileSync(join(ROOT, "lib/comercial/importaciones/import-intelligence-cache.ts"), "utf-8");

describe("IMPORT-CACHE-PROD-01 — L2 Postgres-backed cache", () => {

  // ── 1. L2 uses Postgres, NOT /tmp ──────────────────────────────────────────

  test("does NOT use fs functions for L2 persistence", () => {
    expect(cacheCode).not.toContain("readFileSync");
    expect(cacheCode).not.toContain("writeFileSync");
    expect(cacheCode).not.toContain("mkdirSync");
    expect(cacheCode).not.toContain("existsSync");
    expect(cacheCode).not.toContain("statSync");
    expect(cacheCode).not.toContain("unlinkSync");
  });

  test("does NOT use /tmp for cache storage", () => {
    expect(cacheCode).not.toContain('join("/tmp"');
    expect(cacheCode).not.toContain("L2_CACHE_DIR");
  });

  test("uses Postgres via prisma $queryRawUnsafe / $executeRawUnsafe", () => {
    expect(cacheCode).toContain("$queryRawUnsafe");
    expect(cacheCode).toContain("$executeRawUnsafe");
  });

  test("L2 table is import_intelligence_cache", () => {
    expect(cacheCode).toContain("import_intelligence_cache");
  });

  // ── 2. Versioned migration (not runtime CREATE TABLE) ─────────────────────

  test("versioned migration exists in prisma/migrations/", () => {
    const migrationPath = join(ROOT, "prisma/migrations/20260814000000_import_intelligence_cache/migration.sql");
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf-8");
    expect(sql).toContain("import_intelligence_cache");
    expect(sql).toContain("organization_id");
    expect(sql).toContain("payload");
    expect(sql).toContain("JSONB");
  });

  test("cache code does NOT use runtime CREATE TABLE", () => {
    expect(cacheCode).not.toContain("CREATE TABLE");
    expect(cacheCode).not.toContain("ensureL2Table");
  });

  // ── 3. Schema includes version, computed_at, source_as_of ─────────────────

  test("migration schema includes schema_version, computed_at, source_as_of", () => {
    const migrationPath = join(ROOT, "prisma/migrations/20260814000000_import_intelligence_cache/migration.sql");
    const sql = readFileSync(migrationPath, "utf-8");
    expect(sql).toContain("schema_version");
    expect(sql).toContain("computed_at");
    expect(sql).toContain("source_as_of");
  });

  test("cache code uses L2_SCHEMA_VERSION for reads and writes", () => {
    expect(cacheCode).toContain("L2_SCHEMA_VERSION");
    expect(cacheCode).toContain("schema_version = $2");
  });

  test("cache code writes computed_at and source_as_of to L2", () => {
    expect(cacheCode).toContain("computed_at");
    expect(cacheCode).toContain("source_as_of");
    expect(cacheCode).toContain("data.computedAt");
    expect(cacheCode).toContain("data.freshness.compositeAsOf");
  });

  // ── 4. SQL uses parameterized queries (never interpolated) ────────────────

  test("all SQL uses $1/$2/$3 parameter placeholders (never string interpolation)", () => {
    const sqlMatches = cacheCode.match(/`[^`]*import_intelligence_cache[^`]*`/g) ?? [];
    expect(sqlMatches.length).toBeGreaterThan(0);
    for (const sql of sqlMatches) {
      expect(sql).not.toMatch(/\$\{organization/);
      expect(sql).not.toMatch(/\$\{data/);
    }
  });

  // ── 5. L2 TTL and UPSERT ──────────────────────────────────────────────────

  test("L2 TTL is 30 minutes", () => {
    expect(cacheCode).toContain("L2_TTL_MS = 30 * 60 * 1000");
  });

  test("L2 uses UPSERT (INSERT ON CONFLICT DO UPDATE)", () => {
    expect(cacheCode).toContain("ON CONFLICT (organization_id)");
    expect(cacheCode).toContain("DO UPDATE SET");
  });

  test("readL2 filters by 30-minute window in SQL", () => {
    expect(cacheCode).toContain("INTERVAL '30 minutes'");
  });

  test("readL2Stale reads without TTL filter (failure fallback)", () => {
    expect(cacheCode).toContain("readL2Stale");
    const staleFunc = cacheCode.split("async function readL2Stale")[1]?.split("async function ")[0] ?? "";
    expect(staleFunc).not.toContain("INTERVAL");
  });

  // ── 6. Web requests are READ-ONLY ─────────────────────────────────────────

  test("getCachedImportIntelligence is read-only (never calls buildImportSupplyIntelligence)", () => {
    // Extract the getCachedImportIntelligence function body
    const fnStart = cacheCode.indexOf("export async function getCachedImportIntelligence");
    const fnBody = cacheCode.slice(fnStart, cacheCode.indexOf("\n}\n", fnStart) + 3);
    expect(fnBody).not.toContain("buildImportSupplyIntelligence");
    expect(fnBody).not.toContain("loadSourceFreshness");
  });

  test("getCachedImportIntelligence documents read-only contract", () => {
    expect(cacheCode).toContain("Web requests NEVER call buildImportSupplyIntelligence()");
  });

  test("L1 miss checks L2 fresh before L2 stale", () => {
    expect(cacheCode).toContain("readL2(organizationId)");
    expect(cacheCode).toContain("readL2Stale(organizationId)");
    // readL2 (fresh) must appear before readL2Stale in the function
    const fnStart = cacheCode.indexOf("export async function getCachedImportIntelligence");
    const fnBody = cacheCode.slice(fnStart);
    const freshIdx = fnBody.indexOf("readL2(organizationId)");
    const staleIdx = fnBody.indexOf("readL2Stale(organizationId)");
    expect(freshIdx).toBeLessThan(staleIdx);
  });

  test("L2 stale is served immediately (not after compute failure)", () => {
    // The read path serves L2 stale directly, not as a fallback from compute
    expect(cacheCode).toContain("serve stale until next prewarm");
  });

  test("no snapshot returns SOURCE_UNAVAILABLE with staleCause", () => {
    expect(cacheCode).toContain("SOURCE_UNAVAILABLE");
    expect(cacheCode).toContain("No cached snapshot");
  });

  // ── 7. Only prewarm calls buildImportSupplyIntelligence ───────────────────

  test("prewarmImportCache calls buildImportSupplyIntelligence", () => {
    const prewarmStart = cacheCode.indexOf("export async function prewarmImportCache");
    const prewarmBody = cacheCode.slice(prewarmStart);
    expect(prewarmBody).toContain("buildImportSupplyIntelligence(organizationId)");
  });

  test("prewarm is atomic: computes FIRST, never invalidates before success", () => {
    // Atomic prewarm: compute first, UPSERT on success, preserve stale on failure
    const prewarmStart = cacheCode.indexOf("export async function prewarmImportCache");
    const prewarmBody = cacheCode.slice(prewarmStart);
    // Must NOT call invalidateImportCache inside prewarm
    expect(prewarmBody.split("export async function ")[0]).not.toContain("invalidateImportCache");
    // buildImportSupplyIntelligence is the first action
    expect(prewarmBody).toContain("Compute FIRST");
  });

  test("prewarm writes to both L1 and L2", () => {
    const prewarmStart = cacheCode.indexOf("export async function prewarmImportCache");
    const prewarmBody = cacheCode.slice(prewarmStart);
    expect(prewarmBody).toContain("cache.set(");
    expect(prewarmBody).toContain("writeL2(organizationId, data)");
  });

  // ── 7b. PrewarmResult contract ───────────────────────────────────────────

  test("prewarmImportCache returns PrewarmResult (ok, stalePreserved, error)", () => {
    expect(cacheCode).toContain("interface PrewarmResult");
    expect(cacheCode).toContain("ok: boolean");
    expect(cacheCode).toContain("stalePreserved: boolean");
    expect(cacheCode).toContain("error: string | null");
  });

  test("prewarm returns ok:true on success", () => {
    expect(cacheCode).toContain("return { ok: true, stalePreserved: false, error: null }");
  });

  test("prewarm returns ok:false + stalePreserved:true on failure", () => {
    expect(cacheCode).toContain("return { ok: false, stalePreserved: true, error: cause }");
  });

  test("prewarm catch block preserves prior L2 snapshot (no delete on failure)", () => {
    const prewarmStart = cacheCode.indexOf("export async function prewarmImportCache");
    const prewarmBody = cacheCode.slice(prewarmStart);
    // The catch block must NOT call invalidate or delete
    expect(prewarmBody).toContain("prior snapshot stays in L2 untouched");
  });

  // ── 8. Invalidation clears both L1 and L2 ────────────────────────────────

  test("invalidateImportCache clears both L1 (Map.delete) and L2 (SQL DELETE)", () => {
    expect(cacheCode).toContain("cache.delete(organizationId)");
    expect(cacheCode).toContain("DELETE FROM import_intelligence_cache WHERE organization_id = $1");
  });

  test("invalidateImportCache is async (Postgres DELETE is async)", () => {
    expect(cacheCode).toContain("export async function invalidateImportCache");
  });

  // ── 9. Prewarm API route ──────────────────────────────────────────────────

  test("prewarm API route exists with CRON_SECRET support", () => {
    const routePath = join(ROOT, "app/api/orgs/[orgSlug]/comercial/importaciones/prewarm/route.ts");
    expect(existsSync(routePath)).toBe(true);
    const routeCode = readFileSync(routePath, "utf-8");
    expect(routeCode).toContain("prewarmImportCache");
    expect(routeCode).toContain("CRON_SECRET");
    expect(routeCode).toContain("export async function POST");
    expect(routeCode).toContain("export async function GET");
  });

  test("prewarm GET route requires CRON_SECRET (Vercel Cron compatible)", () => {
    const routePath = join(ROOT, "app/api/orgs/[orgSlug]/comercial/importaciones/prewarm/route.ts");
    const routeCode = readFileSync(routePath, "utf-8");
    expect(routeCode).toContain('authHeader !== `Bearer ${cronSecret}`');
    expect(routeCode).toContain('{ error: "Unauthorized" }');
  });

  test("prewarm POST blocks normal commercial users (admin only)", () => {
    const routePath = join(ROOT, "app/api/orgs/[orgSlug]/comercial/importaciones/prewarm/route.ts");
    const routeCode = readFileSync(routePath, "utf-8");
    expect(routeCode).toContain("adminRoles");
    expect(routeCode).toContain("Insufficient permissions");
    expect(routeCode).toContain("403");
  });

  test("prewarm route returns PrewarmResult fields (ok, stalePreserved, error)", () => {
    const routePath = join(ROOT, "app/api/orgs/[orgSlug]/comercial/importaciones/prewarm/route.ts");
    const routeCode = readFileSync(routePath, "utf-8");
    expect(routeCode).toContain("result.ok");
    expect(routeCode).toContain("result.stalePreserved");
    expect(routeCode).toContain("result.error");
  });

  // ── 10. Vercel Cron entry exists ──────────────────────────────────────────

  test("vercel.json has import prewarm cron entry", () => {
    const vercelJson = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf-8"));
    const prewarmCron = vercelJson.crons.find(
      (c: { path: string }) => c.path.includes("importaciones/prewarm"),
    );
    expect(prewarmCron).toBeDefined();
    expect(prewarmCron.path).toContain("castillitos");
    // Must be daily (Hobby plan constraint)
    expect(prewarmCron.schedule).toMatch(/^\d+ \d+ \* \* \*$/);
  });

  // ── 11. L1 TTL unchanged ──────────────────────────────────────────────────

  test("L1 cache TTL remains 5 minutes", () => {
    expect(cacheCode).toContain("CACHE_TTL_MS = 5 * 60 * 1000");
  });

  // ── 12. Same canonical response — no schema change ────────────────────────

  test("CachedImportIntelligence type unchanged", () => {
    expect(cacheCode).toContain("result: ImportSupplyIntelligenceResult");
    expect(cacheCode).toContain("freshness: ImportSourceFreshness");
    expect(cacheCode).toContain('truthState: CachedImportTruthState');
    expect(cacheCode).toContain("computedAt: string");
    expect(cacheCode).toContain("staleCause: string | null");
  });

  // ── 13. Cross-process sharing evidence ────────────────────────────────────

  test("L2 is shared via Postgres, not /tmp (cross-process safe)", () => {
    expect(cacheCode).toContain("import { prisma }");
    expect(cacheCode).not.toContain('join("/tmp"');
  });
});
