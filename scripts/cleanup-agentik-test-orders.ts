/**
 * scripts/cleanup-agentik-test-orders.ts
 *
 * Removes AGK test/draft orders that are safe to delete.
 * Dry-run by default. Pass --execute to actually delete.
 *
 * Run: npx tsx scripts/cleanup-agentik-test-orders.ts [--execute]
 *
 * Sprint: ORDER-DRAFT-DEDUP-AND-DELETE-01
 */

import { prisma } from "../lib/prisma";

const MODULE = "comercial";
const OPERATION = "COMERCIAL_ORDER_DRAFT";
const DRY_RUN = !process.argv.includes("--execute");

async function main() {
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("  Cleanup Agentik Test Orders");
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN (pass --execute to delete)" : "EXECUTE"}`);
  console.log("══════════════════════════════════════════════════════════════\n");

  const db = (prisma as any).agentExecution;

  const rows = await db.findMany({
    where: {
      module: MODULE,
      operation: OPERATION,
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`Found ${rows.length} total order drafts.\n`);

  let deletable = 0;
  let skipped = 0;
  const toDelete: string[] = [];

  for (const row of rows) {
    const meta = (row.metadataJson ?? {}) as Record<string, unknown>;
    const header = (meta.header ?? {}) as Record<string, unknown>;
    const status = meta.status as string;
    const origin = meta.origin as string;
    const sagOrderId = meta.sagOrderId as string | null;
    const customerName = (header.customerName ?? "") as string;
    const externalSyncKey = meta.externalSyncKey as string;

    // Only delete Agentik-created, draft/cancelled, no SAG sync
    const isAgentik = origin === "agentik";
    const isDeletableStatus = ["borrador", "cancelado"].includes(status);
    const noSagSync = !sagOrderId;
    const isTestClient = customerName.toUpperCase().includes("AGENTIK PRUEBA")
      || customerName.toUpperCase().includes("TEST")
      || customerName.toUpperCase().includes("PRUEBA");

    if (!isAgentik || !isDeletableStatus || !noSagSync) {
      skipped++;
      continue;
    }

    if (!isTestClient) {
      skipped++;
      continue;
    }

    // Check no active SAG write operation
    let hasSagOp = false;
    try {
      const sagOp = await prisma.sagWriteOperation.findFirst({
        where: {
          organizationId: row.tenantId,
          sourceRef: externalSyncKey,
          status: { in: ["PENDING", "APPROVED", "SENDING"] },
        },
      });
      if (sagOp) hasSagOp = true;
    } catch { /* table may not exist */ }

    if (hasSagOp) {
      console.log(`  SKIP  ${row.id} — ${customerName} — has active SAG operation`);
      skipped++;
      continue;
    }

    console.log(`  ${DRY_RUN ? "WOULD DELETE" : "DELETE"}  ${row.id} — ${customerName} — status: ${status}`);
    toDelete.push(row.id);
    deletable++;
  }

  if (!DRY_RUN && toDelete.length > 0) {
    for (const id of toDelete) {
      await db.delete({ where: { id } });
    }
    console.log(`\nDeleted ${toDelete.length} test orders.`);
  }

  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`  ${deletable} deletable, ${skipped} skipped, ${rows.length} total`);
  if (DRY_RUN && deletable > 0) {
    console.log(`  Run with --execute to delete.`);
  }
  console.log(`══════════════════════════════════════════════════════════════\n`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
