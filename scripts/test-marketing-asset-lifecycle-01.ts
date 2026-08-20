/**
 * MARKETING-ASSET-LIFECYCLE-01 — Integration Test Harness
 *
 * Validates the Foto Estudio → Biblioteca lifecycle.
 *
 * Uses the same dotenv + standalone PrismaClient pattern as
 * test-foto-estudio-e2e.ts so it works with the project DB connection.
 *
 * Run: npx tsx scripts/test-marketing-asset-lifecycle-01.ts
 *
 * Requires DATABASE_URL in .env or .env.local.
 * If DATABASE_URL is not configured, the script exits cleanly with a skip notice.
 */

import path from "node:path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

import { PrismaClient, StudioSessionDbStatus, AssetGenerationStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// ── DB bootstrap (same pattern as test-foto-estudio-e2e.ts) ──────────────────

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.log("SKIP: DATABASE_URL not configured. Set it in .env to run integration tests.");
  process.exit(0);
}

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

// ── Inline service functions (avoid importing lib/prisma singleton) ──────────

async function createSession(id: string, organizationId: string, tenantId: string) {
  return prisma.studioSession.create({
    data: { id, organizationId, tenantId, step: "upload_product", status: StudioSessionDbStatus.IDLE },
  });
}

async function createAsset(sessionId: string, assetType: string) {
  return prisma.generatedAsset.create({
    data: { sessionId, assetType, generationStatus: AssetGenerationStatus.PENDING },
  });
}

async function markAssetReady(assetId: string, url: string) {
  return prisma.generatedAsset.update({
    where: { id: assetId },
    data: { generationStatus: AssetGenerationStatus.READY, assetUrl: url },
  });
}

/**
 * Tenant-validated batch approval/rejection — mirrors the function in asset-service.ts.
 * Duplicated here to avoid importing the lib/prisma singleton.
 */
async function updateAssetsReviewStatusForSession(
  sessionId: string, organizationId: string, assetIds: string[], reviewStatus: "approved" | "rejected",
): Promise<{ updated: number }> {
  if (assetIds.length === 0) return { updated: 0 };

  const session = await prisma.studioSession.findUnique({
    where: { id: sessionId }, select: { organizationId: true },
  });
  if (!session || session.organizationId !== organizationId) {
    throw new Error("SESSION_NOT_FOUND");
  }

  const ownedAssets = await prisma.generatedAsset.findMany({
    where: { id: { in: assetIds }, sessionId }, select: { id: true },
  });
  const ownedIds = new Set(ownedAssets.map(a => a.id));
  const foreignIds = assetIds.filter(id => !ownedIds.has(id));
  if (foreignIds.length > 0) throw new Error("ASSET_NOT_OWNED");

  const result = await prisma.generatedAsset.updateMany({
    where: { id: { in: assetIds }, sessionId }, data: { reviewStatus },
  });
  return { updated: result.count };
}

async function listOrgApprovedAssets(organizationId: string) {
  return prisma.generatedAsset.findMany({
    where: {
      reviewStatus: "approved",
      assetUrl: { not: null },
      session: { organizationId },
    },
    include: { session: { select: { id: true, tenantId: true, productSku: true, objective: true } } },
    orderBy: { createdAt: "desc" },
  });
}

// ── Test data ────────────────────────────────────────────────────────────────

const TS                = Date.now();
const TEST_ORG_ID_A     = `test-lifecycle-a-${TS}`;
const TEST_ORG_ID_B     = `test-lifecycle-b-${TS}`;
const TEST_TENANT       = "castillitos";
const TEST_ASSET_URL    = "https://r2.example.com/test-asset.png";

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("MARKETING-ASSET-LIFECYCLE-01 — Integration Test Harness");
  console.log("========================================================\n");

  // ── Setup ────────────────────────────────────────────────────────────────

  const orgA = await prisma.organization.create({
    data: { id: TEST_ORG_ID_A, name: "Test Org Lifecycle A", slug: `test-lca-${TS}` },
  });
  const orgB = await prisma.organization.create({
    data: { id: TEST_ORG_ID_B, name: "Test Org Lifecycle B", slug: `test-lcb-${TS}` },
  });

  const sessA = `sess-lca-${TS}`;
  const sessB = `sess-lcb-${TS}`;
  await createSession(sessA, orgA.id, TEST_TENANT);
  await createSession(sessB, orgB.id, TEST_TENANT);

  const assetApprove   = await createAsset(sessA, "product_photo");
  const assetReject    = await createAsset(sessA, "social_image");
  const assetIdempotent = await createAsset(sessA, "product_photo");
  const assetForeign   = await createAsset(sessB, "product_photo");

  await markAssetReady(assetApprove.id,    TEST_ASSET_URL);
  await markAssetReady(assetReject.id,     `${TEST_ASSET_URL}?r=1`);
  await markAssetReady(assetIdempotent.id, `${TEST_ASSET_URL}?i=1`);
  await markAssetReady(assetForeign.id,    `${TEST_ASSET_URL}?f=1`);

  try {

    // ── T01: Approval creates Biblioteca asset ─────────────────────────────
    section("T01: Approval creates Biblioteca asset");
    const t01 = await updateAssetsReviewStatusForSession(sessA, orgA.id, [assetApprove.id], "approved");
    assert(t01.updated === 1, "Batch approve returns updated=1");
    const lib01 = await listOrgApprovedAssets(orgA.id);
    assert(lib01.some(a => a.id === assetApprove.id), "Approved asset appears in Biblioteca");

    // ── T02: Asset persists after re-query ─────────────────────────────────
    section("T02: Persistence after re-query");
    const lib02 = await listOrgApprovedAssets(orgA.id);
    const found02 = lib02.find(a => a.id === assetApprove.id);
    assert(found02 !== undefined, "Asset still present on second query");
    assert(found02?.assetUrl === TEST_ASSET_URL, "URL preserved");

    // ── T03: Second approval is idempotent ─────────────────────────────────
    section("T03: Idempotent approval");
    await updateAssetsReviewStatusForSession(sessA, orgA.id, [assetIdempotent.id], "approved");
    await updateAssetsReviewStatusForSession(sessA, orgA.id, [assetIdempotent.id], "approved");
    const lib03 = await listOrgApprovedAssets(orgA.id);
    assert(lib03.filter(a => a.id === assetIdempotent.id).length === 1, "No duplicate after double approval");

    // ── T04: Triple callback no duplicate ──────────────────────────────────
    section("T04: Repeated callback no duplicate");
    await updateAssetsReviewStatusForSession(sessA, orgA.id, [assetApprove.id], "approved");
    const lib04 = await listOrgApprovedAssets(orgA.id);
    assert(lib04.filter(a => a.id === assetApprove.id).length === 1, "Triple approve: exactly once");

    // ── T05: Rejection blocks Biblioteca ───────────────────────────────────
    section("T05: Rejection blocks Biblioteca");
    await updateAssetsReviewStatusForSession(sessA, orgA.id, [assetReject.id], "rejected");
    const lib05 = await listOrgApprovedAssets(orgA.id);
    assert(!lib05.some(a => a.id === assetReject.id), "Rejected asset NOT in Biblioteca");
    const db05 = await prisma.generatedAsset.findUnique({ where: { id: assetReject.id }, select: { reviewStatus: true } });
    assert(db05?.reviewStatus === "rejected", "DB reviewStatus is 'rejected'");

    // ── T06: Cross-org asset blocked ───────────────────────────────────────
    section("T06: Cross-org isolation");
    let blocked06a = false;
    try { await updateAssetsReviewStatusForSession(sessA, orgA.id, [assetForeign.id], "approved"); }
    catch (e: unknown) { blocked06a = (e instanceof Error && e.message === "ASSET_NOT_OWNED"); }
    assert(blocked06a, "Foreign asset blocked with ASSET_NOT_OWNED");

    let blocked06b = false;
    try { await updateAssetsReviewStatusForSession(sessB, orgA.id, [assetForeign.id], "approved"); }
    catch (e: unknown) { blocked06b = (e instanceof Error && e.message === "SESSION_NOT_FOUND"); }
    assert(blocked06b, "Org A using org B session blocked with SESSION_NOT_FOUND");

    // ── T07: Product link preserved ────────────────────────────────────────
    section("T07: Product link without duplication");
    const product = await prisma.productEntity.create({
      data: { organizationId: orgA.id, name: "Test Product LC", status: "active" },
    });
    const link = await prisma.productAssetLink.create({
      data: {
        productId: product.id, organizationId: orgA.id, assetId: assetApprove.id,
        role: "hero", sourceType: "ai_generated", sourceProvider: "foto_estudio",
      },
    });
    await updateAssetsReviewStatusForSession(sessA, orgA.id, [assetApprove.id], "approved");
    const linkAfter = await prisma.productAssetLink.findUnique({ where: { id: link.id } });
    assert(linkAfter !== null, "Link preserved after re-approval");
    assert(linkAfter?.productId === product.id, "Link still points to same product");
    const linkCount = await prisma.productAssetLink.count({ where: { productId: product.id, assetId: assetApprove.id } });
    assert(linkCount === 1, "No duplicate ProductAssetLink");

    // ── T08: Unlinked asset stays as approved ──────────────────────────────
    section("T08: Unlinked asset stays as approved asset");
    const unlinkCount = await prisma.productAssetLink.count({ where: { assetId: assetIdempotent.id } });
    assert(unlinkCount === 0, "Unlinked asset has zero ProductAssetLinks");
    const lib08 = await listOrgApprovedAssets(orgA.id);
    assert(lib08.some(a => a.id === assetIdempotent.id), "Unlinked approved asset visible in Biblioteca");

    // ── T09: Metadata preserved ────────────────────────────────────────────
    section("T09: Metadata preservation");
    const full = await prisma.generatedAsset.findUnique({
      where: { id: assetApprove.id },
      include: { session: { select: { organizationId: true, tenantId: true } } },
    });
    assert(full?.assetUrl === TEST_ASSET_URL, "assetUrl preserved");
    assert(full?.sessionId === sessA, "sessionId preserved");
    assert(full?.session?.organizationId === orgA.id, "organizationId via session");
    assert(full?.session?.tenantId === TEST_TENANT, "tenantId via session");
    assert(full?.reviewStatus === "approved", "reviewStatus preserved");
    assert(full?.createdAt instanceof Date, "createdAt is Date");
    assert(full?.assetType === "product_photo", "assetType preserved");

    // ── T10: Edge cases ────────────────────────────────────────────────────
    section("T10: Edge cases");
    const empty = await updateAssetsReviewStatusForSession(sessA, orgA.id, [], "approved");
    assert(empty.updated === 0, "Empty itemIds returns updated=0");

    let blocked10 = false;
    try { await updateAssetsReviewStatusForSession(sessA, orgA.id, ["non-existent"], "approved"); }
    catch (e: unknown) { blocked10 = (e instanceof Error && e.message === "ASSET_NOT_OWNED"); }
    assert(blocked10, "Non-existent asset ID blocked");

    // ── T11: Org-scoped Biblioteca ─────────────────────────────────────────
    section("T11: Org-scoped Biblioteca queries");
    await updateAssetsReviewStatusForSession(sessB, orgB.id, [assetForeign.id], "approved");
    const libA = await listOrgApprovedAssets(orgA.id);
    const libB = await listOrgApprovedAssets(orgB.id);
    assert(!libA.some(a => a.id === assetForeign.id), "Org B asset NOT in Org A Biblioteca");
    assert(libB.some(a => a.id === assetForeign.id), "Org B asset IS in Org B Biblioteca");
    assert(!libB.some(a => a.id === assetApprove.id), "Org A asset NOT in Org B Biblioteca");

    // ── T12: Reject then re-approve ────────────────────────────────────────
    section("T12: Reject then re-approve");
    await updateAssetsReviewStatusForSession(sessA, orgA.id, [assetReject.id], "approved");
    const lib12 = await listOrgApprovedAssets(orgA.id);
    const reApproved = lib12.find(a => a.id === assetReject.id);
    assert(reApproved !== undefined, "Previously rejected asset can be re-approved");
    assert(reApproved?.reviewStatus === "approved", "Status is 'approved' after re-approval");

  } finally {
    // ── Cleanup ──────────────────────────────────────────────────────────────
    section("Cleanup");
    await prisma.productAssetLink.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
    await prisma.productEntity.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
    await prisma.generatedAsset.deleteMany({ where: { sessionId: { in: [sessA, sessB] } } });
    await prisma.studioSession.deleteMany({ where: { id: { in: [sessA, sessB] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });
    console.log("  Test data cleaned up.");
  }

  // ── Report ─────────────────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════");
  console.log(`  PASSED: ${passed}   FAILED: ${failed}   TOTAL: ${passed + failed}`);
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
