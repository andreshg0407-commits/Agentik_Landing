/**
 * sag-reset-db.ts
 *
 * Reset CustomerProfile and CustomerReceivable for the Castillitos org
 * to the clean pre-sync state (CRM rows only, no ERP data polluted by
 * bad-slug syncs). Also deletes orphan rows with neither crmId nor erpId.
 *
 * What this does:
 *   1. Delete ALL CustomerReceivable rows for the org (from bad syncs)
 *   2. Clear erpId/erpSyncedAt/rawErpJson on all CustomerProfile rows
 *      (SAG sync will repopulate these correctly after the slug fix)
 *   3. Delete orphan CustomerProfile rows (no crmId, no erpId after clear)
 *      These are SAG-only customers that were created with wrong slugs.
 *      After the fix, the next sync will recreate them with correct slugs.
 *
 * Dry-run by default. Pass --apply to commit.
 */
import * as path   from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

const APPLY = process.argv.includes("--apply");
const orgId = "cmmpwstuf000dp5y58kj1daaj";

async function main() {
  const { prisma } = await import("../lib/prisma");

  console.log(`\n── DB Reset for Castillitos (${orgId}) ──`);
  console.log(APPLY ? "MODE: APPLY (writes to DB)" : "MODE: DRY-RUN");

  // Current state
  const totalProfiles  = await prisma.customerProfile.count({ where: { organizationId: orgId } });
  const withErp        = await prisma.customerProfile.count({ where: { organizationId: orgId, erpId: { not: null } } });
  const withCrm        = await prisma.customerProfile.count({ where: { organizationId: orgId, crmId: { not: null } } });
  const orphans        = await prisma.customerProfile.count({ where: { organizationId: orgId, erpId: null, crmId: null } });
  const totalReceivables = await prisma.customerReceivable.count({ where: { organizationId: orgId } });

  console.log(`\nCustomerProfile total      : ${totalProfiles}`);
  console.log(`  with erpId               : ${withErp}`);
  console.log(`  with crmId               : ${withCrm}`);
  console.log(`  orphans (no erpId/crmId) : ${orphans}`);
  console.log(`CustomerReceivable total   : ${totalReceivables}`);

  if (!APPLY) {
    console.log("\nDRY-RUN: would do:");
    console.log(`  1. Delete ${totalReceivables} CustomerReceivable rows`);
    console.log(`  2. Clear erpId/erpSyncedAt/rawErpJson on ${withErp} CustomerProfile rows`);
    console.log(`  3. Delete ${orphans} orphan CustomerProfile rows`);
    console.log(`  4. Expected final: ${totalProfiles - orphans} profiles (CRM rows only) | 0 receivables`);
    console.log(`\nRe-run with --apply to commit.`);
    await prisma.$disconnect();
    process.exit(0);
  }

  // Step 1: Delete receivables
  const { count: delRec } = await prisma.customerReceivable.deleteMany({ where: { organizationId: orgId } });
  console.log(`\n✓ Deleted ${delRec} CustomerReceivable rows`);

  // Step 2: Clear ERP fields on profiles
  const { count: clearedErp } = await prisma.customerProfile.updateMany({
    where: { organizationId: orgId, erpId: { not: null } },
    data: { erpId: null, erpSyncedAt: null, rawErpJson: { set: {} } },
  });
  console.log(`✓ Cleared erpId on ${clearedErp} CustomerProfile rows`);

  // Step 3: Delete orphans (rows with no crmId and no erpId — SAG-only wrong-slug rows)
  const { count: delOrph } = await prisma.customerProfile.deleteMany({
    where: { organizationId: orgId, erpId: null, crmId: null },
  });
  console.log(`✓ Deleted ${delOrph} orphan CustomerProfile rows`);

  // Final state
  const finalTotal   = await prisma.customerProfile.count({ where: { organizationId: orgId } });
  const finalWithCrm = await prisma.customerProfile.count({ where: { organizationId: orgId, crmId: { not: null } } });
  const finalWithErp = await prisma.customerProfile.count({ where: { organizationId: orgId, erpId: { not: null } } });
  const finalRec     = await prisma.customerReceivable.count({ where: { organizationId: orgId } });

  console.log(`\nFinal CustomerProfile total: ${finalTotal}`);
  console.log(`  with crmId: ${finalWithCrm}`);
  console.log(`  with erpId: ${finalWithErp}`);
  console.log(`Final CustomerReceivable   : ${finalRec}`);
  console.log(`\n✓ Reset complete. Run sag-production-sync.ts to repopulate ERP data.`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
