/**
 * _audit-op-events.ts — Check ProductionEvent linkage for 10 OPs
 */
import { prisma } from "@/lib/prisma";

const db = prisma as any;
const OPS = ["2949","2948","2616","2597","2559","2893","2891","2781","2703","2534"];

async function main() {
  const org = await db.organization.findFirst({ where: { slug: "castillitos" } });
  if (org == null) { console.log("FAIL"); return; }

  // ET events linked to audited OPs via productionOrderRef
  const etEvents: any[] = await db.$queryRawUnsafe(`
    SELECT pe."eventType", pe."sourceDocumentNumber", pe."eventDate",
           pe."productionOrderRef", pe."referenceCode", pe.quantity,
           pe."stageTo", pe."locationTo"
    FROM "ProductionEvent" pe
    WHERE pe."organizationId" = $1
      AND pe."productionOrderRef" = ANY($2::text[])
    ORDER BY pe."eventDate" DESC
  `, org.id, OPS);

  console.log("ProductionEvents linked to audited OPs:");
  console.log(`  Found: ${etEvents.length}`);

  const byOp = new Map<string, any[]>();
  for (const ev of etEvents) {
    const key = ev.productionOrderRef;
    if (byOp.has(key)) {
      byOp.get(key)!.push(ev);
    } else {
      byOp.set(key, [ev]);
    }
  }

  for (const opNum of OPS) {
    const events = byOp.get(opNum) ?? [];
    if (events.length === 0) {
      console.log(`\n  OP ${opNum}: 0 events`);
    } else {
      const completed = events.filter((e) => e.eventType === "PRODUCTION_COMPLETED");
      const materials = events.filter((e) => e.eventType === "MATERIAL_CONSUMED");
      const totalCompletedQty = completed.reduce((s, e) => s + (e.quantity || 0), 0);
      const lastEvent = events[0];
      const lastEventAge = Math.round((Date.now() - new Date(lastEvent.eventDate).getTime()) / 86400000);

      console.log(`\n  OP ${opNum}: ${events.length} events (${completed.length} ET, ${materials.length} CN)`);
      console.log(`    Total completed qty: ${totalCompletedQty}`);
      console.log(`    Last event: ${lastEvent.eventType} date=${lastEvent.eventDate?.toISOString?.().slice(0,10)} (${lastEventAge} days ago)`);
      console.log(`    Last stageTo: ${lastEvent.stageTo} | locationTo: ${lastEvent.locationTo}`);
    }
  }

  // Global: Open OPs with PRODUCTION_COMPLETED events
  console.log("\n\n=== GLOBAL: Open OPs with PRODUCTION_COMPLETED events ===");
  const opsWithET: any[] = await db.$queryRawUnsafe(`
    SELECT COUNT(DISTINCT po."documentNumber")::int as c
    FROM "ProductionOrder" po
    JOIN "ProductionEvent" pe ON pe."organizationId" = po."organizationId"
      AND pe."productionOrderRef" = po."documentNumber"
      AND pe."eventType" = 'PRODUCTION_COMPLETED'
    WHERE po."organizationId" = $1 AND po.status = 'open' AND po."isClosed" = false
  `, org.id);
  console.log(`  Open OPs with ET events: ${opsWithET[0]?.c}`);

  // Fully produced open OPs
  const fullyProduced: any[] = await db.$queryRawUnsafe(`
    WITH op_ordered AS (
      SELECT po.id, po."documentNumber",
        SUM(pol."quantityOrdered")::float as total_ordered
      FROM "ProductionOrder" po
      JOIN "ProductionOrderLine" pol ON pol."productionOrderId" = po.id
      WHERE po."organizationId" = $1 AND po.status = 'open' AND po."isClosed" = false
      GROUP BY po.id, po."documentNumber"
    ),
    op_completed AS (
      SELECT pe."productionOrderRef" as doc_num,
        SUM(pe.quantity)::float as total_completed
      FROM "ProductionEvent" pe
      WHERE pe."organizationId" = $1 AND pe."eventType" = 'PRODUCTION_COMPLETED'
      GROUP BY pe."productionOrderRef"
    )
    SELECT COUNT(*)::int as c
    FROM op_ordered oo
    JOIN op_completed oc ON oc.doc_num = oo."documentNumber"
    WHERE oc.total_completed >= oo.total_ordered * 0.9
  `, org.id);
  console.log(`  Effectively complete (ET >= 90% ordered): ${fullyProduced[0]?.c}`);

  // For the 10 OPs: compare ordered vs completed
  console.log("\n=== PER-OP: Ordered vs Completed ===");
  for (const opNum of OPS) {
    const po = await db.productionOrder.findFirst({
      where: { organizationId: org.id, documentNumber: opNum },
      select: { id: true, documentDate: true },
    });
    if (po == null) continue;

    const lines = await db.productionOrderLine.findMany({
      where: { productionOrderId: po.id },
      select: { quantityOrdered: true },
    });
    const totalOrdered = lines.reduce((s: number, l: any) => s + (Number(l.quantityOrdered) || 0), 0);

    const events = byOp.get(opNum) ?? [];
    const completedQty = events
      .filter((e) => e.eventType === "PRODUCTION_COMPLETED")
      .reduce((s, e) => s + (e.quantity || 0), 0);

    const pct = totalOrdered > 0 ? Math.round(completedQty / totalOrdered * 100) : 0;
    const age = Math.round((Date.now() - new Date(po.documentDate).getTime()) / 86400000);

    console.log(`  OP ${opNum}: ordered=${totalOrdered} completed=${completedQty} (${pct}%) age=${age}d`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
