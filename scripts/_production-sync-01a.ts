/**
 * _production-sync-01a.ts
 *
 * PRODUCTION-SYNC-01A — Full sync + validation script.
 * Phase 5: Dry run → real sync
 * Phase 6: Validation (20 sample OPs)
 * Phase 7: Catalog cross-reference
 * Phase 10: Final metrics
 *
 * Usage: npx tsx scripts/_production-sync-01a.ts
 */

import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { loadSagTestEnv } from "@/lib/sag/env";
import { syncProductionOrders } from "@/lib/connectors/adapters/sag-pya-soap/production/sag-production-sync";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";

const CASTILLITOS_ORG_SLUG = "castillitos";

async function main() {
  console.log("=".repeat(80));
  console.log("PRODUCTION-SYNC-01A — OP Snapshot Sync");
  console.log("=".repeat(80));
  console.log(`Date: ${new Date().toISOString()}`);

  // ── Setup ───────────────────────────────────────────────────────────────────
  const sagEnv = loadSagTestEnv();
  const sagConfig: PyaApiConfig = {
    endpointUrl: sagEnv.endpointUrl,
    token: sagEnv.token,
    database: sagEnv.database,
  };

  const org = await (prisma as any).organization.findUnique({
    where: { slug: CASTILLITOS_ORG_SLUG },
    select: { id: true, name: true },
  });
  if (!org) {
    console.error("ERROR: Castillitos org not found");
    process.exit(1);
  }
  console.log(`\nOrg: ${org.name} (${org.id})`);

  // ── Phase 5a: Dry Run ───────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 5a: DRY RUN");
  console.log("=".repeat(80));

  const dryResult = await syncProductionOrders({
    organizationId: org.id,
    sagConfig,
    sagDatabase: sagEnv.database,
    dryRun: true,
  });

  console.log(`\n  Orders read:    ${dryResult.metrics.ordersRead}`);
  console.log(`  Lines read:     ${dryResult.metrics.linesRead}`);
  console.log(`  Would create:   ${dryResult.metrics.ordersCreated} orders, ${dryResult.metrics.linesCreated} lines`);
  console.log(`  Duration:       ${dryResult.metrics.durationMs}ms`);
  console.log(`  Errors:         ${dryResult.metrics.errors.length}`);

  if (dryResult.metrics.errors.length > 0) {
    for (const e of dryResult.metrics.errors.slice(0, 10)) {
      console.log(`    ERROR: ${e.message}`);
    }
  }

  // ── Phase 5b: Real Sync ─────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 5b: REAL SYNC");
  console.log("=".repeat(80));

  const syncResult = await syncProductionOrders({
    organizationId: org.id,
    sagConfig,
    sagDatabase: sagEnv.database,
    dryRun: false,
  });

  console.log(`\n  Orders read:    ${syncResult.metrics.ordersRead}`);
  console.log(`  Orders created: ${syncResult.metrics.ordersCreated}`);
  console.log(`  Orders updated: ${syncResult.metrics.ordersUpdated}`);
  console.log(`  Lines read:     ${syncResult.metrics.linesRead}`);
  console.log(`  Lines created:  ${syncResult.metrics.linesCreated}`);
  console.log(`  Lines updated:  ${syncResult.metrics.linesUpdated}`);
  console.log(`  Duration:       ${syncResult.metrics.durationMs}ms`);
  console.log(`  Errors:         ${syncResult.metrics.errors.length}`);

  if (syncResult.metrics.errors.length > 0) {
    console.log("\n  First 20 errors:");
    for (const e of syncResult.metrics.errors.slice(0, 20)) {
      console.log(`    OP ${e.erpMovId ?? e.erpItemId ?? "?"} | ${e.message}`);
    }
  }

  // ── Phase 6: Validation (20 sample OPs) ─────────────────────────────────────
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 6: VALIDATION — 20 Sample OPs");
  console.log("=".repeat(80));

  const db = prisma as any;
  const sampleOrders = await db.productionOrder.findMany({
    where: { organizationId: org.id },
    include: { lines: true },
    orderBy: { documentDate: "desc" },
    take: 20,
  });

  for (const order of sampleOrders) {
    const lineCount = order.lines?.length ?? 0;
    const totalQty = order.lines?.reduce((s: number, l: any) => s + (l.quantityOrdered ?? 0), 0) ?? 0;
    const refs = [...new Set(order.lines?.map((l: any) => l.referenceCode) ?? [])];
    console.log(
      `  OP #${order.documentNumber.padEnd(6)} | ${order.documentDate.toISOString().split("T")[0]} | ` +
      `${order.status.padEnd(7)} | ${lineCount} lines | qty: ${totalQty} | refs: ${refs.join(", ")}`
    );
    // Show first 3 lines
    for (const line of (order.lines || []).slice(0, 3)) {
      console.log(
        `    → ${line.referenceCode.padEnd(12)} | talla: ${(line.size ?? "—").padEnd(6)} | ` +
        `color: ${(line.color ?? "—").padEnd(6)} | qty: ${line.quantityOrdered}`
      );
    }
    if (lineCount > 3) console.log(`    ... +${lineCount - 3} more lines`);
  }

  // ── Phase 7: Catalog Cross-Reference ────────────────────────────────────────
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 7: CATALOG CROSS-REFERENCE");
  console.log("=".repeat(80));

  // Get unique references from production
  const prodRefs = await db.productionOrderLine.findMany({
    where: { organizationId: org.id },
    distinct: ["referenceCode"],
    select: { referenceCode: true },
  });
  const prodRefSet = new Set(prodRefs.map((r: any) => r.referenceCode));

  // Get ProductEntity references
  const entities = await db.productEntity.findMany({
    where: { organizationId: org.id },
    select: { id: true, sku: true, name: true },
  });
  const entitySkus = new Set(entities.map((e: any) => e.sku).filter(Boolean));

  // Get ProductVariant references
  const variants = await db.productVariant.findMany({
    where: { organizationId: org.id },
    select: { id: true, sku: true, name: true },
  });
  const variantSkus = new Set(variants.map((v: any) => v.sku).filter(Boolean));

  // Match
  let entityMatch = 0;
  let variantMatch = 0;
  const unmatchedRefs: string[] = [];

  for (const ref of prodRefSet) {
    const matchesEntity = entitySkus.has(ref);
    const matchesVariant = variantSkus.has(ref);
    if (matchesEntity) entityMatch++;
    if (matchesVariant) variantMatch++;
    if (!matchesEntity && !matchesVariant) unmatchedRefs.push(ref as string);
  }

  const totalRefs = prodRefSet.size;
  console.log(`\n  Production unique references: ${totalRefs}`);
  console.log(`  ProductEntity matches:        ${entityMatch} (${totalRefs > 0 ? ((entityMatch / totalRefs) * 100).toFixed(1) : 0}%)`);
  console.log(`  ProductVariant matches:        ${variantMatch} (${totalRefs > 0 ? ((variantMatch / totalRefs) * 100).toFixed(1) : 0}%)`);
  console.log(`  Unmatched references:          ${unmatchedRefs.length}`);

  if (unmatchedRefs.length > 0) {
    console.log(`\n  First 30 unmatched refs:`);
    for (const ref of unmatchedRefs.slice(0, 30)) {
      console.log(`    ${ref}`);
    }
  }

  // ── Phase 10: Final Metrics ─────────────────────────────────────────────────
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 10: FINAL METRICS");
  console.log("=".repeat(80));

  const totalOrders = await db.productionOrder.count({ where: { organizationId: org.id } });
  const openOrders = await db.productionOrder.count({ where: { organizationId: org.id, status: "open" } });
  const closedOrders = await db.productionOrder.count({ where: { organizationId: org.id, status: "closed" } });
  const totalLines = await db.productionOrderLine.count({ where: { organizationId: org.id } });

  console.log(`
  OP LEIDAS:              ${syncResult.metrics.ordersRead}
  OP SINCRONIZADAS:       ${totalOrders}
  LINEAS OP LEIDAS:       ${syncResult.metrics.linesRead}
  LINEAS OP SINCRONIZADAS: ${totalLines}
  OP ABIERTAS:            ${openOrders}
  OP CERRADAS:            ${closedOrders}
  REFERENCIAS UNICAS:    ${totalRefs}
  MATCH PRODUCTENTITY:    ${totalRefs > 0 ? ((entityMatch / totalRefs) * 100).toFixed(1) : 0}%
  MATCH PRODUCTVARIANT:   ${totalRefs > 0 ? ((variantMatch / totalRefs) * 100).toFixed(1) : 0}%
  ERRORES:                ${syncResult.metrics.errors.length}
  DURACION SYNC:          ${syncResult.metrics.durationMs}ms
  `);

  // ── Idempotency test ────────────────────────────────────────────────────────
  console.log("=".repeat(80));
  console.log("IDEMPOTENCY TEST — Re-running sync");
  console.log("=".repeat(80));

  const reSync = await syncProductionOrders({
    organizationId: org.id,
    sagConfig,
    sagDatabase: sagEnv.database,
    dryRun: false,
  });

  console.log(`\n  Orders created: ${reSync.metrics.ordersCreated} (should be 0)`);
  console.log(`  Orders updated: ${reSync.metrics.ordersUpdated} (should equal total)`);
  console.log(`  Lines created:  ${reSync.metrics.linesCreated} (should be 0)`);
  console.log(`  Lines updated:  ${reSync.metrics.linesUpdated} (should equal total)`);
  console.log(`  Errors:         ${reSync.metrics.errors.length}`);
  console.log(`  Duration:       ${reSync.metrics.durationMs}ms`);

  const idempotent = reSync.metrics.ordersCreated === 0 && reSync.metrics.linesCreated === 0;
  console.log(`\n  IDEMPOTENT: ${idempotent ? "YES" : "NO"}`);

  console.log("\n" + "=".repeat(80));
  console.log("PRODUCTION-SYNC-01A COMPLETE");
  console.log("=".repeat(80));

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
