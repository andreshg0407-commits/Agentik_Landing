/**
 * Checks actual Neon DB schema for CustomerProfile and CustomerReceivable.
 * Also runs a direct upsert test to verify write path works.
 */
import * as path   from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

async function main() {
  const { prisma } = await import("../lib/prisma");

  // 1) Column check — CustomerProfile
  const cpCols = await prisma.$queryRaw<{column_name: string; data_type: string}[]>`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'CustomerProfile'
    ORDER BY ordinal_position
  `;
  console.log("\n── CustomerProfile columns in Neon DB ──");
  for (const c of cpCols) console.log(`  ${c.column_name.padEnd(24)} ${c.data_type}`);

  // 2) Column check — CustomerReceivable
  const crCols = await prisma.$queryRaw<{column_name: string; data_type: string}[]>`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'CustomerReceivable'
    ORDER BY ordinal_position
  `;
  console.log("\n── CustomerReceivable columns in Neon DB ──");
  for (const c of crCols) console.log(`  ${c.column_name.padEnd(24)} ${c.data_type}`);

  // 3) Check if migration includes erpId
  const hasErpId = cpCols.some(c => c.column_name === "erpId");
  const hasErpSyncedAt = cpCols.some(c => c.column_name === "erpSyncedAt");
  console.log(`\n  erpId column present      : ${hasErpId}`);
  console.log(`  erpSyncedAt column present: ${hasErpSyncedAt}`);

  // 4) Check migration status
  const migrations = await prisma.$queryRaw<{migration_name: string; finished_at: Date | null}[]>`
    SELECT migration_name, finished_at
    FROM _prisma_migrations
    ORDER BY finished_at DESC
    LIMIT 10
  `;
  console.log("\n── Last 10 Prisma migrations ──");
  for (const m of migrations) console.log(`  ${m.migration_name}  →  ${m.finished_at?.toISOString() ?? "PENDING"}`);

  // 5) Test direct upsert — use a known existing slug
  const orgId = "cmmpwstuf000dp5y58kj1daaj";
  const testSlug = "29774696"; // known existing row

  console.log(`\n── Direct upsert test (slug="${testSlug}") ──`);
  const before = await prisma.customerProfile.findFirst({
    where: { organizationId: orgId, slug: testSlug },
    select: { id: true, slug: true, erpId: true, erpSyncedAt: true },
  });
  console.log("  Before:", before);

  // Write a sentinel erpId
  await prisma.customerProfile.upsert({
    where: { organizationId_slug: { organizationId: orgId, slug: testSlug } },
    create: {
      organizationId: orgId,
      slug: testSlug,
      erpId: "TEST-ERP-ID",
      name: "test",
      erpSyncedAt: new Date(),
      rawErpJson: {},
    },
    update: {
      erpId: "TEST-ERP-ID",
      erpSyncedAt: new Date(),
    },
  });

  const after = await prisma.customerProfile.findFirst({
    where: { organizationId: orgId, slug: testSlug },
    select: { id: true, slug: true, erpId: true, erpSyncedAt: true },
  });
  console.log("  After :", after);

  if (after?.erpId === "TEST-ERP-ID") {
    console.log("  ✓ Direct upsert works — erpId written correctly");
    // Restore
    await prisma.customerProfile.update({
      where: { id: after.id },
      data: { erpId: null, erpSyncedAt: null },
    });
    console.log("  ✓ Restored erpId=null");
  } else {
    console.log("  ✗ Direct upsert FAILED — erpId not written");
  }

  // 6) Check ConnectorRun records from last sync
  const runs = await prisma.connectorRun.findMany({
    where: { connectorId: "cmnhu4hky0000n4y50jlhkfib" },
    orderBy: { startedAt: "desc" },
    take: 4,
    select: {
      id: true,
      module: true,
      status: true,
      rowsRead: true,
      rowsImported: true,
      rowsErrored: true,
      startedAt: true,
      finishedAt: true,
      error: true,
    },
  });
  console.log("\n── Recent ConnectorRuns ──");
  for (const r of runs) {
    console.log(`  [${r.module.padEnd(12)}] ${r.status.padEnd(8)} read=${String(r.rowsRead).padStart(6)} imported=${String(r.rowsImported).padStart(6)} errored=${r.rowsErrored}  ${r.startedAt.toISOString()}  ${r.error ?? ""}`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
