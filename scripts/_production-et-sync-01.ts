/**
 * _production-et-sync-01.ts
 *
 * PRODUCTION-ET-SYNC-01 — ET sync + validation + forensics script.
 *
 * Syncs SAG ET documents (fuente 116 = Entrada Producto Terminado)
 * into the universal ProductionEvent model.
 *
 * Phases:
 *   1. Dry run — read from SAG, report what would happen
 *   2. Real sync — upsert into ProductionEvent + ProductionEventLine
 *   3. Validation — inspect sample events
 *   4. Forensics — analyze ET data (headers with/without lines, dates, quantities)
 *   5. Cross-reference — compare ET references against ProductionOrder
 *   6. Idempotency test — re-run sync, verify no duplicates
 *   7. Final metrics
 *
 * Usage: npx tsx scripts/_production-et-sync-01.ts
 */

import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { loadSagTestEnv } from "@/lib/sag/env";
import { syncETToProductionEvents } from "@/lib/connectors/adapters/sag-pya-soap/production/sag-et-sync";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";

const CASTILLITOS_ORG_SLUG = "castillitos";

async function main() {
  console.log("=".repeat(80));
  console.log("PRODUCTION-ET-SYNC-01 — ET → ProductionEvent Sync");
  console.log("=".repeat(80));
  console.log(`Date: ${new Date().toISOString()}`);

  // ── Setup ───────────────────────────────────────────────────────────────────
  const sagEnv = loadSagTestEnv();
  const sagConfig: PyaApiConfig = {
    endpointUrl: sagEnv.endpointUrl,
    token: sagEnv.token,
    database: sagEnv.database,
  };

  const db = prisma as any;
  const org = await db.organization.findUnique({
    where: { slug: CASTILLITOS_ORG_SLUG },
    select: { id: true, name: true },
  });
  if (!org) {
    console.error("ERROR: Castillitos org not found");
    process.exit(1);
  }
  console.log(`\nOrg: ${org.name} (${org.id})`);

  // ── Phase 1: Dry Run ──────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 1: DRY RUN");
  console.log("=".repeat(80));

  const dryResult = await syncETToProductionEvents({
    organizationId: org.id,
    sagConfig,
    sagDatabase: sagEnv.database,
    dryRun: true,
  });

  console.log(`\n  Headers read:        ${dryResult.metrics.headersRead}`);
  console.log(`  Items read:          ${dryResult.metrics.itemsRead}`);
  console.log(`  With lines:          ${dryResult.metrics.headersWithLines}`);
  console.log(`  Without lines:       ${dryResult.metrics.headersWithoutLines}`);
  console.log(`  Would create events: ${dryResult.metrics.eventsCreated}`);
  console.log(`  Would create lines:  ${dryResult.metrics.linesCreated}`);
  console.log(`  Duration:            ${dryResult.metrics.durationMs}ms`);
  console.log(`  Errors:              ${dryResult.metrics.errors.length}`);

  if (dryResult.metrics.errors.length > 0) {
    for (const e of dryResult.metrics.errors.slice(0, 10)) {
      console.log(`    ERROR: ${e.message}`);
    }
  }

  // ── Phase 2: Real Sync ────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 2: REAL SYNC");
  console.log("=".repeat(80));

  const syncResult = await syncETToProductionEvents({
    organizationId: org.id,
    sagConfig,
    sagDatabase: sagEnv.database,
    dryRun: false,
  });

  console.log(`\n  Headers read:      ${syncResult.metrics.headersRead}`);
  console.log(`  Items read:        ${syncResult.metrics.itemsRead}`);
  console.log(`  Events created:    ${syncResult.metrics.eventsCreated}`);
  console.log(`  Events updated:    ${syncResult.metrics.eventsUpdated}`);
  console.log(`  Lines created:     ${syncResult.metrics.linesCreated}`);
  console.log(`  Lines updated:     ${syncResult.metrics.linesUpdated}`);
  console.log(`  With lines:        ${syncResult.metrics.headersWithLines}`);
  console.log(`  Without lines:     ${syncResult.metrics.headersWithoutLines}`);
  console.log(`  Duration:          ${syncResult.metrics.durationMs}ms`);
  console.log(`  Errors:            ${syncResult.metrics.errors.length}`);

  if (syncResult.metrics.errors.length > 0) {
    console.log("\n  First 20 errors:");
    for (const e of syncResult.metrics.errors.slice(0, 20)) {
      console.log(`    ET ${e.sourceDocumentId ?? "?"} | ${e.message}`);
    }
  }

  // ── Phase 3: Validation (20 sample events) ────────────────────────────────
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 3: VALIDATION — 20 Sample ET Events");
  console.log("=".repeat(80));

  const sampleEvents = await db.productionEvent.findMany({
    where: {
      organizationId: org.id,
      sourceDocumentType: "ET",
    },
    include: { lines: true },
    orderBy: { eventDate: "desc" },
    take: 20,
  });

  for (const evt of sampleEvents) {
    const lineCount = evt.lines?.length ?? 0;
    const totalQty = evt.lines?.reduce((s: number, l: any) => s + (l.quantity ?? 0), 0) ?? evt.quantity;
    const eventDateStr = evt.eventDate instanceof Date
      ? evt.eventDate.toISOString().split("T")[0]
      : String(evt.eventDate).split("T")[0];
    console.log(
      `  ET #${evt.sourceDocumentNumber.padEnd(6)} | ${eventDateStr} | ` +
      `${evt.eventType.padEnd(24)} | ${lineCount} lines | qty: ${totalQty} | ` +
      `ref: ${evt.referenceCode ?? "—"} | conf: ${evt.confidence}`
    );
    for (const line of (evt.lines || []).slice(0, 3)) {
      console.log(
        `    → ${(line.referenceCode ?? "—").padEnd(12)} | talla: ${(line.size ?? "—").padEnd(6)} | ` +
        `color: ${(line.color ?? "—").padEnd(6)} | qty: ${line.quantity}`
      );
    }
    if (lineCount > 3) console.log(`    ... +${lineCount - 3} more lines`);
  }

  // ── Phase 4: Forensics ────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 4: FORENSICS — ET Data Analysis");
  console.log("=".repeat(80));

  const totalETEvents = await db.productionEvent.count({
    where: { organizationId: org.id, sourceDocumentType: "ET" },
  });
  const etWithLines = await db.productionEvent.count({
    where: {
      organizationId: org.id,
      sourceDocumentType: "ET",
      lineCount: { gt: 0 },
    },
  });
  const etWithoutLines = await db.productionEvent.count({
    where: {
      organizationId: org.id,
      sourceDocumentType: "ET",
      lineCount: 0,
    },
  });
  const totalETLines = await db.productionEventLine.count({
    where: {
      organizationId: org.id,
      productionEvent: { sourceDocumentType: "ET" },
    },
  });

  // Date range
  const earliestET = await db.productionEvent.findFirst({
    where: { organizationId: org.id, sourceDocumentType: "ET" },
    orderBy: { eventDate: "asc" },
    select: { eventDate: true, sourceDocumentNumber: true },
  });
  const latestET = await db.productionEvent.findFirst({
    where: { organizationId: org.id, sourceDocumentType: "ET" },
    orderBy: { eventDate: "desc" },
    select: { eventDate: true, sourceDocumentNumber: true },
  });

  console.log(`
  Total ET events:       ${totalETEvents}
  ET with lines:         ${etWithLines}
  ET without lines:      ${etWithoutLines}
  Total ET lines:        ${totalETLines}
  Earliest ET:           ${earliestET ? `#${earliestET.sourceDocumentNumber} — ${earliestET.eventDate.toISOString().split("T")[0]}` : "N/A"}
  Latest ET:             ${latestET ? `#${latestET.sourceDocumentNumber} — ${latestET.eventDate.toISOString().split("T")[0]}` : "N/A"}
  Lines per ET (avg):    ${totalETEvents > 0 ? (totalETLines / totalETEvents).toFixed(1) : "N/A"}
  `);

  // ── Phase 5: Cross-Reference with ProductionOrder ─────────────────────────
  console.log("=".repeat(80));
  console.log("PHASE 5: CROSS-REFERENCE — ET vs ProductionOrder");
  console.log("=".repeat(80));

  // Get unique references from ET lines
  const etLineRefs = await db.productionEventLine.findMany({
    where: {
      organizationId: org.id,
      productionEvent: { sourceDocumentType: "ET" },
    },
    distinct: ["referenceCode"],
    select: { referenceCode: true },
  });
  const etRefSet = new Set(etLineRefs.map((r: any) => r.referenceCode));

  // Get unique references from ProductionOrder lines
  const opLineRefs = await db.productionOrderLine.findMany({
    where: { organizationId: org.id },
    distinct: ["referenceCode"],
    select: { referenceCode: true },
  });
  const opRefSet = new Set(opLineRefs.map((r: any) => r.referenceCode));

  // Compute overlap
  let overlap = 0;
  let etOnly = 0;
  for (const ref of etRefSet) {
    if (opRefSet.has(ref)) overlap++;
    else etOnly++;
  }
  const opOnly = opRefSet.size - overlap;

  console.log(`
  ET unique references:  ${etRefSet.size}
  OP unique references:  ${opRefSet.size}
  Overlap (in both):     ${overlap}
  ET-only references:    ${etOnly}
  OP-only references:    ${opOnly}
  Overlap %:             ${etRefSet.size > 0 ? ((overlap / etRefSet.size) * 100).toFixed(1) : "N/A"}%
  `);

  if (etOnly > 0) {
    const etOnlyRefs: string[] = [];
    for (const ref of etRefSet) {
      if (!opRefSet.has(ref)) etOnlyRefs.push(ref as string);
    }
    console.log(`  First 20 ET-only references (in ET but not in OP):`);
    for (const ref of etOnlyRefs.slice(0, 20)) {
      console.log(`    ${ref}`);
    }
  }

  // ── Phase 6: Idempotency Test ─────────────────────────────────────────────
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 6: IDEMPOTENCY TEST — Re-running sync");
  console.log("=".repeat(80));

  const reSync = await syncETToProductionEvents({
    organizationId: org.id,
    sagConfig,
    sagDatabase: sagEnv.database,
    dryRun: false,
  });

  console.log(`\n  Events created: ${reSync.metrics.eventsCreated} (should be 0)`);
  console.log(`  Events updated: ${reSync.metrics.eventsUpdated} (should equal total)`);
  console.log(`  Lines created:  ${reSync.metrics.linesCreated} (should be 0)`);
  console.log(`  Lines updated:  ${reSync.metrics.linesUpdated} (should equal total)`);
  console.log(`  Errors:         ${reSync.metrics.errors.length}`);
  console.log(`  Duration:       ${reSync.metrics.durationMs}ms`);

  const idempotent = reSync.metrics.eventsCreated === 0 && reSync.metrics.linesCreated === 0;
  console.log(`\n  IDEMPOTENT: ${idempotent ? "YES" : "NO"}`);

  // ── Phase 7: Final Metrics ────────────────────────────────────────────────
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 7: FINAL METRICS");
  console.log("=".repeat(80));

  const finalEventCount = await db.productionEvent.count({
    where: { organizationId: org.id, sourceDocumentType: "ET" },
  });
  const finalLineCount = await db.productionEventLine.count({
    where: {
      organizationId: org.id,
      productionEvent: { sourceDocumentType: "ET" },
    },
  });

  console.log(`
  ET HEADERS LEIDAS:              ${syncResult.metrics.headersRead}
  ET ITEMS LEIDOS:                ${syncResult.metrics.itemsRead}
  ET EVENTS SINCRONIZADOS:        ${finalEventCount}
  ET LINES SINCRONIZADAS:         ${finalLineCount}
  ET CON LINEAS:                  ${syncResult.metrics.headersWithLines}
  ET SIN LINEAS:                  ${syncResult.metrics.headersWithoutLines}
  REFERENCIAS ET UNICAS:          ${etRefSet.size}
  OVERLAP CON OP:                 ${etRefSet.size > 0 ? ((overlap / etRefSet.size) * 100).toFixed(1) : "N/A"}%
  ERRORES:                        ${syncResult.metrics.errors.length}
  IDEMPOTENTE:                    ${idempotent ? "SI" : "NO"}
  DURACION SYNC:                  ${syncResult.metrics.durationMs}ms
  `);

  console.log("=".repeat(80));
  console.log("PRODUCTION-ET-SYNC-01 COMPLETE");
  console.log("=".repeat(80));

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
