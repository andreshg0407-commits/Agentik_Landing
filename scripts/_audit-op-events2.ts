/**
 * _audit-op-events2.ts — OP-to-ET linkage using prefix match on productionOrderRef
 */
import { prisma } from "@/lib/prisma";

const db = prisma as any;
const OPS = ["2949","2948","2616","2597","2559","2893","2891","2781","2703","2534"];

async function main() {
  const org = await db.organization.findFirst({ where: { slug: "castillitos" } });
  if (org == null) { console.log("FAIL"); return; }

  // productionOrderRef = "2949-1" vs documentNumber = "2949"
  // Need LIKE match: productionOrderRef LIKE '2949-%'
  console.log("=== OP-TO-ET LINKAGE (prefix match) ===\n");

  for (const opNum of OPS) {
    const po = await db.productionOrder.findFirst({
      where: { organizationId: org.id, documentNumber: opNum },
      select: { id: true, documentDate: true },
    });
    if (po == null) { console.log(`OP ${opNum}: NOT FOUND`); continue; }

    const lines = await db.productionOrderLine.findMany({
      where: { productionOrderId: po.id },
      select: { quantityOrdered: true, referenceCode: true },
    });
    const totalOrdered = lines.reduce((s: number, l: any) => s + (Number(l.quantityOrdered) || 0), 0);
    const uniqueRefs = [...new Set(lines.map((l: any) => l.referenceCode))];

    // Find ET events via prefix match
    const pattern = `${opNum}-%`;
    const events: any[] = await db.$queryRawUnsafe(`
      SELECT "eventType", "sourceDocumentNumber", "eventDate", "productionOrderRef",
             "referenceCode", quantity, "stageTo", "locationTo"
      FROM "ProductionEvent"
      WHERE "organizationId" = $1
        AND "productionOrderRef" LIKE $2
      ORDER BY "eventDate" DESC
    `, org.id, pattern);

    const completed = events.filter((e) => e.eventType === "PRODUCTION_COMPLETED");
    const materials = events.filter((e) => e.eventType === "MATERIAL_CONSUMED");
    const totalCompletedQty = completed.reduce((s, e) => s + (e.quantity || 0), 0);
    const completionPct = totalOrdered > 0 ? Math.round(totalCompletedQty / totalOrdered * 100) : 0;

    const age = Math.round((Date.now() - new Date(po.documentDate).getTime()) / 86400000);

    // Last event date
    const lastEvent = events[0];
    const lastEventAge = lastEvent
      ? Math.round((Date.now() - new Date(lastEvent.eventDate).getTime()) / 86400000)
      : null;

    // Days without movement
    const daysSinceLastEvent = lastEventAge ?? age;

    // Has finished product entry? (ET with locationTo = B01 or stageTo indicating PT)
    const ptEntries = completed.filter((e) =>
      e.locationTo === "B01" || e.locationTo === "10" ||
      (e.stageTo && (e.stageTo.includes("TERMINADO") || e.stageTo.includes("PT")))
    );

    // Verdict
    let shouldBeActive = true;
    const reasons: string[] = [];

    if (completionPct >= 90) {
      shouldBeActive = false;
      reasons.push(`${completionPct}% completed — effectively done`);
    }
    if (age > 365 && daysSinceLastEvent > 90) {
      shouldBeActive = false;
      reasons.push(`${age}d old, ${daysSinceLastEvent}d since last event`);
    }
    if (age > 540) {
      shouldBeActive = false;
      reasons.push(`>18 months old`);
    }

    console.log(`OP ${opNum} (age=${age}d, ordered=${totalOrdered}):`);
    console.log(`  Events: ${events.length} total (${completed.length} ET, ${materials.length} CN)`);
    console.log(`  Completed qty: ${totalCompletedQty} (${completionPct}%)`);
    console.log(`  Last event: ${lastEvent ? `${lastEvent.eventType} date=${lastEvent.eventDate?.toISOString?.().slice(0,10)} (${lastEventAge}d ago)` : "NONE"}`);
    console.log(`  PT entries: ${ptEntries.length}`);
    console.log(`  Days without movement: ${daysSinceLastEvent}`);
    console.log(`  Refs: ${uniqueRefs.join(", ")}`);
    console.log(`  Should be active: ${shouldBeActive ? "YES" : "NO"} ${reasons.length > 0 ? "— " + reasons.join("; ") : ""}`);
    console.log();
  }

  // Global stats with prefix match
  console.log("=== GLOBAL: Open OPs completion via ET (prefix match) ===\n");

  const globalStats: any[] = await db.$queryRawUnsafe(`
    WITH op_summary AS (
      SELECT po."documentNumber",
        SUM(pol."quantityOrdered")::float as total_ordered,
        po."documentDate"
      FROM "ProductionOrder" po
      JOIN "ProductionOrderLine" pol ON pol."productionOrderId" = po.id
      WHERE po."organizationId" = $1 AND po.status = 'open' AND po."isClosed" = false
      GROUP BY po."documentNumber", po."documentDate"
    ),
    et_summary AS (
      SELECT SPLIT_PART("productionOrderRef", '-', 1) as op_num,
        SUM(quantity)::float as total_completed,
        MAX("eventDate") as last_event
      FROM "ProductionEvent"
      WHERE "organizationId" = $1 AND "eventType" = 'PRODUCTION_COMPLETED'
      GROUP BY SPLIT_PART("productionOrderRef", '-', 1)
    )
    SELECT
      COUNT(*) FILTER (WHERE es.total_completed IS NOT NULL)::int as ops_with_et,
      COUNT(*) FILTER (WHERE es.total_completed >= os.total_ordered * 0.9)::int as effectively_complete,
      COUNT(*) FILTER (WHERE es.total_completed >= os.total_ordered)::int as fully_complete,
      COUNT(*) FILTER (WHERE os."documentDate" < NOW() - INTERVAL '12 months')::int as older_than_12m,
      COUNT(*) FILTER (WHERE os."documentDate" < NOW() - INTERVAL '12 months' AND es.last_event < NOW() - INTERVAL '3 months')::int as old_and_stale,
      COUNT(*)::int as total
    FROM op_summary os
    LEFT JOIN et_summary es ON es.op_num = os."documentNumber"
  `, org.id);

  const g = globalStats[0];
  console.log(`  Total open OPs: ${g.total}`);
  console.log(`  With ET events: ${g.ops_with_et}`);
  console.log(`  Effectively complete (>=90%): ${g.effectively_complete}`);
  console.log(`  Fully complete (>=100%): ${g.fully_complete}`);
  console.log(`  Older than 12 months: ${g.older_than_12m}`);
  console.log(`  Old (>12m) + stale (>3m no event): ${g.old_and_stale}`);
  console.log(`\n  Would be filtered by "12m + has ET activity" rule: ${g.old_and_stale}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
