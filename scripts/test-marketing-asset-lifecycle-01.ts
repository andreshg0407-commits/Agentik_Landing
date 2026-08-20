/**
 * MARKETING-ASSET-LIFECYCLE-01 — Integration Test Harness
 *
 * Tests the REAL production functions from lib/marketing-studio/asset-service.ts
 * via dependency injection (optional `db` parameter). Zero business logic
 * duplication — every assertion exercises production code paths.
 *
 * Strategy A: injectable PrismaClient. The test creates its own PrismaClient
 * from a non-production DATABASE_URL and passes it to the production functions.
 *
 * Run: npx tsx scripts/test-marketing-asset-lifecycle-01.ts
 *
 * Requires DATABASE_URL in .env or .env.local.
 * If DATABASE_URL is not configured, exits with code 1 and BLOCKED status.
 */

import path from "node:path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

// ── DB bootstrap — MUST happen before importing asset-service ─────────────────
// asset-service.ts imports lib/prisma.ts which throws if DATABASE_URL is missing.
// We check here first and exit gracefully with BLOCKED instead of a crash.

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.log("BLOCKED: DATABASE_URL not configured. Cannot run integration tests.");
  console.log("Set DATABASE_URL in .env to a non-production database to run.");
  console.log("\n  PASSED: 0   FAILED: 0   BLOCKED: ALL\n");
  process.exit(1);
}

// Safety: refuse known production URLs
const lower = connectionString.toLowerCase();
if (lower.includes("neon.tech") && lower.includes("main") && !lower.includes("test")) {
  console.log("BLOCKED: DATABASE_URL appears to be a production database. Refusing to run.");
  process.exit(1);
}

import { PrismaClient, StudioSessionDbStatus, AssetGenerationStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool    = new Pool({ connectionString, query_timeout: 30_000, connectionTimeoutMillis: 10_000 });
const adapter = new PrismaPg(pool);
const prisma  = new PrismaClient({ adapter } as never);

// ── Test helpers ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const errors: string[] = [];

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    errors.push(label);
    console.log(`  ✗ FAIL: ${label}`);
  }
}

function section(name: string) {
  console.log(`\n── ${name} ${"─".repeat(Math.max(2, 60 - name.length))}`);
}

// ── Fixture helpers (setup only — no business logic) ─────────────────────────

const TS = Date.now();
const TEST_ASSET_URL = "https://r2.example.com/test-lifecycle-asset.png";

async function createOrg(suffix: string) {
  return prisma.organization.create({
    data: { id: `test-lc-${suffix}-${TS}`, name: `Test LC ${suffix}`, slug: `test-lc-${suffix}-${TS}` },
  });
}

async function createSession(id: string, organizationId: string) {
  return prisma.studioSession.create({
    data: { id, organizationId, tenantId: "castillitos", step: "upload_product", status: StudioSessionDbStatus.IDLE },
  });
}

async function createAsset(sessionId: string, assetType: string, url?: string) {
  return prisma.generatedAsset.create({
    data: {
      sessionId, assetType,
      generationStatus: url ? AssetGenerationStatus.READY : AssetGenerationStatus.PENDING,
      assetUrl: url ?? null,
    },
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("MARKETING-ASSET-LIFECYCLE-01 — Integration Test Harness");
  console.log("Strategy: A (injectable PrismaClient → real production functions)");
  console.log("========================================================\n");

  // Dynamic import: asset-service.ts imports lib/prisma.ts which requires
  // DATABASE_URL at module level. By using dynamic import(), the module loads
  // only after dotenv has populated process.env.DATABASE_URL above.
  const {
    updateAssetsReviewStatusForSession,
    listOrgApprovedAssets,
  } = await import("../lib/marketing-studio/asset-service");
  type AssetServiceDb = import("../lib/marketing-studio/asset-service").AssetServiceDb;

  // Cast to the injectable type the production functions accept
  const db = prisma as unknown as AssetServiceDb;

  // Setup fixtures
  const orgA = await createOrg("a");
  const orgB = await createOrg("b");
  const sessA = `sess-lca-${TS}`;
  const sessB = `sess-lcb-${TS}`;
  await createSession(sessA, orgA.id);
  await createSession(sessB, orgB.id);

  const asset1 = await createAsset(sessA, "product_photo", TEST_ASSET_URL);
  const asset2 = await createAsset(sessA, "social_image", `${TEST_ASSET_URL}?n=2`);
  const asset3 = await createAsset(sessA, "product_photo", `${TEST_ASSET_URL}?n=3`);
  const assetNoUrl = await createAsset(sessA, "product_photo"); // no URL
  const assetForeign = await createAsset(sessB, "product_photo", `${TEST_ASSET_URL}?foreign`);

  try {

    // ── T01: Approve updates GeneratedAsset.reviewStatus ───────────────────
    section("T01: Approve updates reviewStatus");
    const r1 = await updateAssetsReviewStatusForSession(sessA, orgA.id, [asset1.id], "approved", db);
    assert(r1.updated === 1, "Production function returns updated=1");
    const db1 = await prisma.generatedAsset.findUnique({ where: { id: asset1.id } });
    assert(db1?.reviewStatus === "approved", "DB reviewStatus is 'approved'");

    // ── T02: Re-query Biblioteca returns the approved asset ────────────────
    section("T02: Biblioteca returns approved asset");
    const lib2 = await listOrgApprovedAssets(orgA.id, 50, 0, db);
    const found2 = lib2.find(a => a.id === asset1.id);
    assert(found2 !== undefined, "Approved asset in Biblioteca result");
    assert(found2?.assetUrl === TEST_ASSET_URL, "URL matches");
    assert(found2?.reviewStatus === "approved", "reviewStatus matches");

    // ── T03: Approve again — idempotent, no duplicate rows ─────────────────
    section("T03: Idempotent approval");
    const r3 = await updateAssetsReviewStatusForSession(sessA, orgA.id, [asset1.id], "approved", db);
    assert(r3.updated === 1, "Second approve returns updated=1");
    const lib3 = await listOrgApprovedAssets(orgA.id, 50, 0, db);
    assert(lib3.filter(a => a.id === asset1.id).length === 1, "Exactly one entry (no duplicate)");

    // ── T04: Repeated callback — no duplicate ──────────────────────────────
    section("T04: Repeated callback");
    await updateAssetsReviewStatusForSession(sessA, orgA.id, [asset1.id], "approved", db);
    await updateAssetsReviewStatusForSession(sessA, orgA.id, [asset1.id], "approved", db);
    const lib4 = await listOrgApprovedAssets(orgA.id, 50, 0, db);
    assert(lib4.filter(a => a.id === asset1.id).length === 1, "4x approve: still exactly one entry");

    // ── T05: Reject persists rejected status ───────────────────────────────
    section("T05: Reject persists");
    await updateAssetsReviewStatusForSession(sessA, orgA.id, [asset2.id], "rejected", db);
    const db5 = await prisma.generatedAsset.findUnique({ where: { id: asset2.id } });
    assert(db5?.reviewStatus === "rejected", "DB reviewStatus is 'rejected'");

    // ── T06: Rejected asset NOT in Biblioteca ──────────────────────────────
    section("T06: Rejected not in Biblioteca");
    const lib6 = await listOrgApprovedAssets(orgA.id, 50, 0, db);
    assert(!lib6.some(a => a.id === asset2.id), "Rejected asset absent from Biblioteca");

    // ── T07: Session from another org blocked (SESSION_NOT_FOUND) ──────────
    section("T07: Cross-org session blocked");
    let err7 = "";
    try { await updateAssetsReviewStatusForSession(sessB, orgA.id, [assetForeign.id], "approved", db); }
    catch (e: unknown) { err7 = (e instanceof Error) ? e.message : ""; }
    assert(err7 === "SESSION_NOT_FOUND", "Org A using org B session → SESSION_NOT_FOUND");

    // ── T08: Asset from another session blocked (ASSET_NOT_OWNED) ──────────
    section("T08: Cross-session asset blocked");
    let err8 = "";
    try { await updateAssetsReviewStatusForSession(sessA, orgA.id, [assetForeign.id], "approved", db); }
    catch (e: unknown) { err8 = (e instanceof Error) ? e.message : ""; }
    assert(err8 === "ASSET_NOT_OWNED", "Foreign asset in own session → ASSET_NOT_OWNED");

    // ── T09: Mixed valid+invalid list fails closed, no partial update ──────
    section("T09: Mixed list fails closed");
    const db9before = await prisma.generatedAsset.findUnique({ where: { id: asset3.id } });
    const prevStatus = db9before?.reviewStatus;
    let err9 = "";
    try { await updateAssetsReviewStatusForSession(sessA, orgA.id, [asset3.id, assetForeign.id], "approved", db); }
    catch (e: unknown) { err9 = (e instanceof Error) ? e.message : ""; }
    assert(err9 === "ASSET_NOT_OWNED", "Mixed list → ASSET_NOT_OWNED");
    const db9after = await prisma.generatedAsset.findUnique({ where: { id: asset3.id } });
    assert(db9after?.reviewStatus === prevStatus, "Valid asset in mixed list NOT partially updated");

    // ── T10: Product link preserved (no duplicate) ─────────────────────────
    section("T10: Product link preserved");
    const product = await prisma.productEntity.create({
      data: { organizationId: orgA.id, name: "Test Product LC", status: "active" },
    });
    await prisma.productAssetLink.create({
      data: {
        productId: product.id, organizationId: orgA.id, assetId: asset1.id,
        role: "hero", sourceType: "ai_generated", sourceProvider: "foto_estudio",
      },
    });
    await updateAssetsReviewStatusForSession(sessA, orgA.id, [asset1.id], "approved", db);
    const linkCount = await prisma.productAssetLink.count({ where: { productId: product.id, assetId: asset1.id } });
    assert(linkCount === 1, "ProductAssetLink not duplicated after re-approve");

    // ── T11: Unlinked asset visible in Biblioteca ──────────────────────────
    section("T11: Unlinked asset visible");
    await updateAssetsReviewStatusForSession(sessA, orgA.id, [asset3.id], "approved", db);
    const unlinkCount = await prisma.productAssetLink.count({ where: { assetId: asset3.id } });
    assert(unlinkCount === 0, "Asset has zero ProductAssetLinks");
    const lib11 = await listOrgApprovedAssets(orgA.id, 50, 0, db);
    assert(lib11.some(a => a.id === asset3.id), "Unlinked approved asset visible in Biblioteca");

    // ── T12: Metadata, URL, sessionId, org preserved ───────────────────────
    section("T12: Metadata preserved");
    const full = await prisma.generatedAsset.findUnique({
      where: { id: asset1.id },
      include: { session: { select: { organizationId: true, tenantId: true, id: true } } },
    });
    assert(full?.assetUrl === TEST_ASSET_URL, "assetUrl preserved");
    assert(full?.sessionId === sessA, "sessionId preserved");
    assert(full?.session?.organizationId === orgA.id, "organizationId via session");
    assert(full?.session?.tenantId === "castillitos", "tenantId via session");
    assert(full?.reviewStatus === "approved", "reviewStatus preserved");
    assert(full?.assetType === "product_photo", "assetType preserved");
    assert(full?.createdAt instanceof Date, "createdAt is Date");

    // ── T13: Empty array — contract check ──────────────────────────────────
    section("T13: Empty array");
    const r13 = await updateAssetsReviewStatusForSession(sessA, orgA.id, [], "approved", db);
    assert(r13.updated === 0, "Empty array returns updated=0 (not rejected)");

    // ── T14: Duplicate IDs — no inconsistency ──────────────────────────────
    section("T14: Duplicate IDs");
    const r14 = await updateAssetsReviewStatusForSession(sessA, orgA.id, [asset1.id, asset1.id], "approved", db);
    assert(r14.updated >= 1, "Duplicate IDs do not error");
    const lib14 = await listOrgApprovedAssets(orgA.id, 50, 0, db);
    assert(lib14.filter(a => a.id === asset1.id).length === 1, "Still exactly one entry after dup IDs");

    // ── T15: Non-existent ID blocked ───────────────────────────────────────
    section("T15: Non-existent ID");
    let err15 = "";
    try { await updateAssetsReviewStatusForSession(sessA, orgA.id, ["nonexistent-id-xyz"], "approved", db); }
    catch (e: unknown) { err15 = (e instanceof Error) ? e.message : ""; }
    assert(err15 === "ASSET_NOT_OWNED", "Non-existent ID → ASSET_NOT_OWNED");

    // ── T16: Biblioteca query is org-scoped ────────────────────────────────
    section("T16: Org-scoped Biblioteca");
    await updateAssetsReviewStatusForSession(sessB, orgB.id, [assetForeign.id], "approved", db);
    const libA = await listOrgApprovedAssets(orgA.id, 50, 0, db);
    const libB = await listOrgApprovedAssets(orgB.id, 50, 0, db);
    assert(!libA.some(a => a.id === assetForeign.id), "Org B asset NOT in Org A Biblioteca");
    assert(libB.some(a => a.id === assetForeign.id), "Org B asset IS in Org B Biblioteca");
    assert(!libB.some(a => a.id === asset1.id), "Org A asset NOT in Org B Biblioteca");

    // ── T17: Asset without URL excluded from Biblioteca ────────────────────
    section("T17: No-URL asset excluded");
    await updateAssetsReviewStatusForSession(sessA, orgA.id, [assetNoUrl.id], "approved", db);
    const lib17 = await listOrgApprovedAssets(orgA.id, 50, 0, db);
    assert(!lib17.some(a => a.id === assetNoUrl.id), "Approved but URL-less asset excluded from Biblioteca");

    // ── T18: Reject then re-approve ────────────────────────────────────────
    section("T18: Reject then re-approve");
    await updateAssetsReviewStatusForSession(sessA, orgA.id, [asset2.id], "approved", db);
    const lib18 = await listOrgApprovedAssets(orgA.id, 50, 0, db);
    assert(lib18.some(a => a.id === asset2.id), "Re-approved after rejection visible in Biblioteca");

  } finally {
    // ── Cleanup — only test fixtures ─────────────────────────────────────────
    section("Cleanup");
    await prisma.productAssetLink.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
    await prisma.productEntity.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
    await prisma.generatedAsset.deleteMany({ where: { sessionId: { in: [sessA, sessB] } } });
    await prisma.studioSession.deleteMany({ where: { id: { in: [sessA, sessB] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });
    console.log("  Fixtures cleaned (test-scoped IDs only).");
  }

  // ── Report ─────────────────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════");
  console.log(`  PASSED: ${passed}   FAILED: ${failed}   SKIP: 0   TOTAL: ${passed + failed}`);
  if (errors.length > 0) {
    console.log("\n  FAILURES:");
    for (const e of errors) console.log(`    ✗ ${e}`);
  }
  console.log("════════════════════════════════════════════════════════════\n");

  if (failed > 0) process.exit(1);
}

main()
  .catch(err => { console.error("FATAL:", err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); pool.end(); });
