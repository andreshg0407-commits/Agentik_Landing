/**
 * Quick verification — confirm CustomerProfile and CustomerReceivable counts
 * using the connector's organizationId directly (avoids slug lookup mismatch).
 */
import * as path   from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

const CONNECTOR_ID = "cmnhu4hky0000n4y50jlhkfib";

async function main() {
  const { prisma } = await import("../lib/prisma");

  const connector = await prisma.connector.findUnique({
    where: { id: CONNECTOR_ID }, select: { organizationId: true },
  });
  if (!connector) { console.error("connector not found"); process.exit(1); }
  const orgId = connector.organizationId;
  console.log(`orgId: ${orgId}`);

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { slug: true, name: true } });
  console.log(`org: ${JSON.stringify(org)}`);

  const cpTotal   = await prisma.customerProfile.count({ where: { organizationId: orgId } });
  const cpWithErp = await prisma.customerProfile.count({ where: { organizationId: orgId, erpId: { not: null } } });
  console.log(`\nCustomerProfile — total: ${cpTotal}  with erpId: ${cpWithErp}`);

  const samples = await prisma.customerProfile.findMany({
    where: { organizationId: orgId },
    orderBy: { erpSyncedAt: "desc" },
    take: 5,
    select: { slug: true, erpId: true, nit: true, name: true, city: true, erpSyncedAt: true },
  });
  for (const s of samples) {
    console.log(`  ${s.slug?.padEnd(22)} | erpId=${s.erpId?.padEnd(15)} | nit=${s.nit?.padEnd(12)} | ${s.name?.slice(0, 35)} | ${s.city}`);
  }

  const crTotal = await prisma.customerReceivable.count({ where: { organizationId: orgId } });
  console.log(`\nCustomerReceivable — total: ${crTotal}`);

  const crSamples = await prisma.customerReceivable.findMany({
    where: { organizationId: orgId },
    orderBy: { balanceDue: "desc" },
    take: 5,
    select: { erpId: true, invoiceNumber: true, customerName: true, customerNit: true, originalAmount: true, balanceDue: true, currency: true, status: true, agingBucket: true },
  });
  for (const r of crSamples) {
    console.log(`  ${r.erpId?.padEnd(12)} | inv=${r.invoiceNumber?.padEnd(14)} | ${r.customerName?.slice(0, 28).padEnd(28)} | nit=${r.customerNit?.padEnd(12)} | original=${String(Number(r.originalAmount)).padStart(14)} | balance=${String(Number(r.balanceDue)).padStart(14)} | ${r.currency} | ${r.status} | ${r.agingBucket}`);
  }

  // Rows created/updated by THIS sync (erpSyncedAt within last 10 min)
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
  const freshCp = await prisma.customerProfile.count({
    where: { organizationId: orgId, erpSyncedAt: { gte: tenMinAgo } },
  });
  console.log(`\nCustomerProfile with erpSyncedAt in last 10 min: ${freshCp}`);

  // Newest 3 rows (by id — cuid is sortable)
  const newest = await prisma.customerProfile.findMany({
    where:   { organizationId: orgId },
    orderBy: { id: "desc" },
    take: 3,
    select:  { id: true, slug: true, erpId: true, nit: true, name: true, erpSyncedAt: true },
  });
  console.log("Newest 3 CustomerProfile rows (by id):");
  for (const r of newest) console.log(`  id=${r.id} slug=${r.slug} erpId=${r.erpId} nit=${r.nit} erpSyncedAt=${r.erpSyncedAt?.toISOString()}`);

  // Check CustomerReceivable without org filter
  const crAll = await prisma.customerReceivable.count();
  const crOrg = await prisma.customerReceivable.count({ where: { organizationId: orgId } });
  console.log(`\nCustomerReceivable global total: ${crAll}  for org: ${crOrg}`);

  // Cursor state
  const cursors = await prisma.connectorCursor.findMany({ where: { connectorId: CONNECTOR_ID } });
  console.log(`\nCursors after sync:`);
  for (const c of cursors) console.log(`  ${c.module.padEnd(14)}: ${c.cursor}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
