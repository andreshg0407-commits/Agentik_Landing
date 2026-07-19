/**
 * _production-cn-sync-01.ts
 *
 * PRODUCTION-CN-SYNC-01 — CN sync + validation + timeline + quality script.
 *
 * Syncs SAG CN documents (fuente 80 = Consumos Insumos y Materias Primas)
 * into the universal ProductionEvent model.
 *
 * Phases:
 *   1. Dry run — read from SAG, report what would happen
 *   2. Real sync — upsert into ProductionEvent + ProductionEventLine
 *   3. Validation — inspect sample events + lines
 *   4. OP Linkage — measure ss_remision coverage
 *   5. Timeline Validation — reconstruct OP → CN → ET for sample OPs
 *   6. Data Quality — completeness, cost coverage, orphan analysis
 *   7. Idempotency test — re-run sync, verify no duplicates
 *   8. Final metrics
 *
 * Usage: npx tsx scripts/_production-cn-sync-01.ts
 */

import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { loadSagTestEnv } from "@/lib/sag/env";
import { syncCNToProductionEvents } from "@/lib/connectors/adapters/sag-pya-soap/production/sag-cn-sync";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";

const CASTILLITOS_ORG_SLUG = "castillitos";

async function main() {
  console.log("=".repeat(80));
  console.log("PRODUCTION-CN-SYNC-01 — CN → ProductionEvent Sync");
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

  const dryResult = await syncCNToProductionEvents({
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

  // ── Phase 2: Real Sync ────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 2: REAL SYNC");
  console.log("=".repeat(80));

  const syncResult = await syncCNToProductionEvents({
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
      console.log(`    CN ${e.sourceDocumentId ?? "?"} | ${e.message}`);
    }
  }

  // ── Phase 3: Validation (20 sample events with lines) ────────────────────
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 3: VALIDATION — 20 Sample CN Events");
  console.log("=".repeat(80));

  const sampleEvents = await db.productionEvent.findMany({
    where: {
      organizationId: org.id,
      sourceDocumentType: "CN",
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
    const meta = evt.metadata as any;
    const totalCost = meta?.totalCost ?? 0;
    console.log(
      `  CN #${String(evt.sourceDocumentNumber).padEnd(6)} | ${eventDateStr} | ` +
      `${evt.eventType.padEnd(20)} | ${lineCount} lines | qty: ${totalQty.toFixed(0)} | ` +
      `cost: ${totalCost.toFixed(0)} | ref: ${evt.referenceCode ?? "—"} | ` +
      `op: ${evt.productionOrderRef ?? "—"} | conf: ${evt.confidence}`
    );
    for (const line of (evt.lines || []).slice(0, 3)) {
      const lm = line.lineMetadata as any;
      console.log(
        `    → ${(line.referenceCode ?? "—").padEnd(20)} | qty: ${line.quantity.toFixed(1).padStart(8)} | ` +
        `cost: ${(lm?.cost ?? 0).toFixed(0).padStart(8)} | bodega: ${lm?.warehouseCode ?? "?"} | ` +
        `${(line.description ?? "").substring(0, 40)}`
      );
    }
    if (lineCount > 3) console.log(`    ... +${lineCount - 3} more lines`);
  }

  // ── Phase 4: OP Linkage ─────────────────────────────────────────────────
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 4: OP LINKAGE — ss_remision Coverage");
  console.log("=".repeat(80));

  const totalCNEvents = await db.productionEvent.count({
    where: { organizationId: org.id, sourceDocumentType: "CN" },
  });
  const cnWithOpRef = await db.productionEvent.count({
    where: {
      organizationId: org.id,
      sourceDocumentType: "CN",
      productionOrderRef: { not: null },
    },
  });
  const cnWithoutOpRef = totalCNEvents - cnWithOpRef;

  // Get unique OP numbers from CN events
  const cnOpRefs = await db.productionEvent.findMany({
    where: {
      organizationId: org.id,
      sourceDocumentType: "CN",
      productionOrderRef: { not: null },
    },
    distinct: ["productionOrderRef"],
    select: { productionOrderRef: true },
  });
  const cnOpNumbers = new Set<string>(
    cnOpRefs.map((r: any) => {
      const ref = String(r.productionOrderRef);
      return ref.includes("-") ? ref.split("-")[0] : ref;
    })
  );

  // Get OP numbers from ProductionOrder
  const opDocNumbers = await db.productionOrder.findMany({
    where: { organizationId: org.id },
    distinct: ["documentNumber"],
    select: { documentNumber: true },
  });
  const opSet = new Set(opDocNumbers.map((r: any) => String(r.documentNumber)));

  // Compute overlap
  let opLinkageCount = 0;
  for (const opNum of cnOpNumbers) {
    if (opSet.has(opNum)) opLinkageCount++;
  }

  console.log(`
  Total CN events:                ${totalCNEvents}
  CN with productionOrderRef:     ${cnWithOpRef} (${((cnWithOpRef / totalCNEvents) * 100).toFixed(1)}%)
  CN without productionOrderRef:  ${cnWithoutOpRef}
  Unique OP numbers in CN:        ${cnOpNumbers.size}
  OP numbers in ProductionOrder:  ${opSet.size}
  CN→OP linkage (matched):        ${opLinkageCount} / ${cnOpNumbers.size} (${((opLinkageCount / cnOpNumbers.size) * 100).toFixed(1)}%)
  `);

  // ── Phase 5: Timeline Validation — OP → CN → ET ──────────────────────────
  console.log("=".repeat(80));
  console.log("PHASE 5: TIMELINE VALIDATION — OP → CN → ET");
  console.log("=".repeat(80));

  // Pick 5 recent OP numbers that appear in both CN and ET
  const etOpRefs = await db.productionEvent.findMany({
    where: {
      organizationId: org.id,
      sourceDocumentType: "ET",
      productionOrderRef: { not: null },
    },
    distinct: ["productionOrderRef"],
    select: { productionOrderRef: true },
    orderBy: { eventDate: "desc" },
    take: 200,
  });
  const etOpNumbers = new Set(
    etOpRefs.map((r: any) => {
      const ref = String(r.productionOrderRef);
      return ref.includes("-") ? ref.split("-")[0] : ref;
    })
  );

  // Find OPs that appear in both CN and ET
  const sharedOps: string[] = [];
  for (const opNum of cnOpNumbers) {
    if (etOpNumbers.has(opNum) && sharedOps.length < 5) {
      sharedOps.push(opNum);
    }
  }

  for (const opNum of sharedOps) {
    console.log(`\n  --- OP #${opNum} ---`);

    // OP record
    const op = await db.productionOrder.findFirst({
      where: { organizationId: org.id, documentNumber: opNum },
      select: { documentNumber: true, documentDate: true, status: true },
    });
    if (op) {
      const opDate = op.documentDate instanceof Date
        ? op.documentDate.toISOString().split("T")[0]
        : String(op.documentDate).split("T")[0];
      console.log(`    OP:  #${op.documentNumber} | ${opDate} | ${op.status}`);
    } else {
      console.log(`    OP:  not found in ProductionOrder`);
    }

    // CN events for this OP
    const cnEvents = await db.productionEvent.findMany({
      where: {
        organizationId: org.id,
        sourceDocumentType: "CN",
        productionOrderRef: { startsWith: `${opNum}-` },
      },
      include: { lines: { take: 3 } },
      orderBy: { eventDate: "asc" },
    });
    console.log(`    CN:  ${cnEvents.length} events`);
    for (const cn of cnEvents.slice(0, 3)) {
      const cnDate = cn.eventDate instanceof Date
        ? cn.eventDate.toISOString().split("T")[0]
        : String(cn.eventDate).split("T")[0];
      const meta = cn.metadata as any;
      console.log(`         #${cn.sourceDocumentNumber} | ${cnDate} | ${cn.lineCount} lines | qty: ${cn.quantity.toFixed(0)} | cost: ${(meta?.totalCost ?? 0).toFixed(0)} | ref: ${cn.referenceCode ?? "—"}`);
    }
    if (cnEvents.length > 3) console.log(`         ... +${cnEvents.length - 3} more`);

    // ET events for this OP
    const etEvents = await db.productionEvent.findMany({
      where: {
        organizationId: org.id,
        sourceDocumentType: "ET",
        productionOrderRef: { startsWith: `${opNum}-` },
      },
      orderBy: { eventDate: "asc" },
    });
    console.log(`    ET:  ${etEvents.length} events`);
    for (const et of etEvents.slice(0, 3)) {
      const etDate = et.eventDate instanceof Date
        ? et.eventDate.toISOString().split("T")[0]
        : String(et.eventDate).split("T")[0];
      console.log(`         #${et.sourceDocumentNumber} | ${etDate} | PRODUCTION_COMPLETED`);
    }

    // Timeline order check
    if (cnEvents.length > 0 && etEvents.length > 0) {
      const cnFirst = new Date(cnEvents[0].eventDate);
      const etLast = new Date(etEvents[etEvents.length - 1].eventDate);
      const ordered = cnFirst <= etLast;
      console.log(`    Timeline: CN first=${cnFirst.toISOString().split("T")[0]}, ET last=${etLast.toISOString().split("T")[0]} → ${ordered ? "CORRECT (CN ≤ ET)" : "ANOMALY (CN > ET)"}`);
    }
  }

  // ── Phase 6: Data Quality ───────────────────────────────────────────────
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 6: DATA QUALITY");
  console.log("=".repeat(80));

  const totalCNLines = await db.productionEventLine.count({
    where: {
      organizationId: org.id,
      productionEvent: { sourceDocumentType: "CN" },
    },
  });

  // Lines with cost data
  const linesWithCost = await db.$queryRawUnsafe(`
    SELECT COUNT(*) as cnt FROM "ProductionEventLine" pel
    JOIN "ProductionEvent" pe ON pe.id = pel."productionEventId"
    WHERE pe."organizationId" = $1
      AND pe."sourceDocumentType" = 'CN'
      AND (pel."lineMetadata"->>'cost')::float > 0
  `, org.id);
  const costCount = Number((linesWithCost as any)[0]?.cnt ?? 0);

  // Lines with referenceCode
  const linesWithRef = await db.productionEventLine.count({
    where: {
      organizationId: org.id,
      productionEvent: { sourceDocumentType: "CN" },
      referenceCode: { not: "" },
    },
  });

  // Events with referenceCode (sv_observaciones)
  const eventsWithRef = await db.productionEvent.count({
    where: {
      organizationId: org.id,
      sourceDocumentType: "CN",
      referenceCode: { not: null },
    },
  });

  // Date range
  const earliestCN = await db.productionEvent.findFirst({
    where: { organizationId: org.id, sourceDocumentType: "CN" },
    orderBy: { eventDate: "asc" },
    select: { eventDate: true, sourceDocumentNumber: true },
  });
  const latestCN = await db.productionEvent.findFirst({
    where: { organizationId: org.id, sourceDocumentType: "CN" },
    orderBy: { eventDate: "desc" },
    select: { eventDate: true, sourceDocumentNumber: true },
  });

  console.log(`
  Total CN events:         ${totalCNEvents}
  Total CN lines:          ${totalCNLines}
  Lines per event (avg):   ${(totalCNLines / totalCNEvents).toFixed(1)}
  Lines with cost > 0:     ${costCount} / ${totalCNLines} (${((costCount / totalCNLines) * 100).toFixed(1)}%)
  Lines with referenceCode: ${linesWithRef} / ${totalCNLines} (${((linesWithRef / totalCNLines) * 100).toFixed(1)}%)
  Events with referenceCode: ${eventsWithRef} / ${totalCNEvents} (${((eventsWithRef / totalCNEvents) * 100).toFixed(1)}%)
  OP linkage:              ${cnWithOpRef} / ${totalCNEvents} (${((cnWithOpRef / totalCNEvents) * 100).toFixed(1)}%)
  Earliest CN:             ${earliestCN ? `#${earliestCN.sourceDocumentNumber} — ${earliestCN.eventDate.toISOString().split("T")[0]}` : "N/A"}
  Latest CN:               ${latestCN ? `#${latestCN.sourceDocumentNumber} — ${latestCN.eventDate.toISOString().split("T")[0]}` : "N/A"}

  QUALITY SCORE:
    Cost completeness:      ${costCount >= totalCNLines * 0.99 ? "HIGH" : costCount >= totalCNLines * 0.9 ? "MEDIUM" : "LOW"}
    Reference completeness: ${linesWithRef >= totalCNLines * 0.99 ? "HIGH" : linesWithRef >= totalCNLines * 0.9 ? "MEDIUM" : "LOW"}
    OP linkage:             ${cnWithOpRef >= totalCNEvents * 0.99 ? "HIGH" : cnWithOpRef >= totalCNEvents * 0.9 ? "MEDIUM" : "LOW"}
  `);

  // ── Phase 7: Idempotency Test ───────────────────────────────────────────
  console.log("=".repeat(80));
  console.log("PHASE 7: IDEMPOTENCY TEST — Re-running sync");
  console.log("=".repeat(80));

  const reSync = await syncCNToProductionEvents({
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

  // ── Phase 8: Final Metrics ──────────────────────────────────────────────
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 8: FINAL METRICS");
  console.log("=".repeat(80));

  const finalEventCount = await db.productionEvent.count({
    where: { organizationId: org.id, sourceDocumentType: "CN" },
  });
  const finalLineCount = await db.productionEventLine.count({
    where: {
      organizationId: org.id,
      productionEvent: { sourceDocumentType: "CN" },
    },
  });

  // Total across all document types
  const totalEvents = await db.productionEvent.count({
    where: { organizationId: org.id },
  });
  const totalLines = await db.productionEventLine.count({
    where: { organizationId: org.id },
  });
  const etCount = await db.productionEvent.count({
    where: { organizationId: org.id, sourceDocumentType: "ET" },
  });
  const opCount = await db.productionOrder.count({
    where: { organizationId: org.id },
  });

  console.log(`
  CN HEADERS LEIDAS:              ${syncResult.metrics.headersRead}
  CN ITEMS LEIDOS:                ${syncResult.metrics.itemsRead}
  CN EVENTS SINCRONIZADOS:        ${finalEventCount}
  CN LINES SINCRONIZADAS:         ${finalLineCount}
  CN CON LINEAS:                  ${syncResult.metrics.headersWithLines}
  CN SIN LINEAS:                  ${syncResult.metrics.headersWithoutLines}
  CN CON OP LINKAGE:              ${cnWithOpRef} (${((cnWithOpRef / totalCNEvents) * 100).toFixed(1)}%)
  ERRORES:                        ${syncResult.metrics.errors.length}
  IDEMPOTENTE:                    ${idempotent ? "SI" : "NO"}
  DURACION SYNC:                  ${syncResult.metrics.durationMs}ms

  --- PRODUCTION EVENT UNIVERSE ---
  ProductionOrder (OP):           ${opCount}
  ProductionEvent (ET):           ${etCount}
  ProductionEvent (CN):           ${finalEventCount}
  ProductionEvent (TOTAL):        ${totalEvents}
  ProductionEventLine (TOTAL):    ${totalLines}
  `);

  console.log("=".repeat(80));
  console.log("PRODUCTION-CN-SYNC-01 COMPLETE");
  console.log("=".repeat(80));

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
