/**
 * _audit-op-staleness.ts
 *
 * Audits 10 specific OPs showing as "active" in Maletas.
 * For each: metadata, age, ET/CN events, product finished entries, staleness.
 */

import { prisma } from "@/lib/prisma";

const db = prisma as any;
const OPS = ["2949","2948","2616","2597","2559","2893","2891","2781","2703","2534"];

async function main() {
  const org = await db.organization.findFirst({ where: { slug: "castillitos" } });
  if (!org) { console.log("FAIL: org not found"); return; }

  console.log("=== OP STALENESS AUDIT ===\n");

  // Check what ProductionEvent models exist
  let hasET = false;
  let hasCN = false;
  try {
    const etCount = await db.productionEvent.count({
      where: { organizationId: org.id, eventType: "ET" },
    });
    hasET = true;
    console.log(`ProductionEvent ET records: ${etCount}`);
  } catch { console.log("ProductionEvent model: not available or no eventType field"); }

  try {
    const cnCount = await db.productionEvent.count({
      where: { organizationId: org.id, eventType: "CN" },
    });
    hasCN = true;
    console.log(`ProductionEvent CN records: ${cnCount}`);
  } catch { /* already logged */ }

  // Check for ET-like events via raw query
  let etTableExists = false;
  try {
    const etRows: any[] = await db.$queryRawUnsafe(`
      SELECT COUNT(*)::int as c FROM "ProductionEvent"
      WHERE "organizationId" = $1
    `, org.id);
    etTableExists = true;
    console.log(`ProductionEvent total: ${etRows[0]?.c ?? 0}`);
  } catch { console.log("ProductionEvent table: does not exist"); }

  console.log();

  for (const opNum of OPS) {
    const po = await db.productionOrder.findFirst({
      where: { organizationId: org.id, documentNumber: opNum },
    });
    if (!po) { console.log(`OP ${opNum}: NOT FOUND\n`); continue; }

    // Lines
    const lines = await db.productionOrderLine.findMany({
      where: { productionOrderId: po.id },
      select: { referenceCode: true, quantityOrdered: true, productName: true },
    });
    const totalOrdered = lines.reduce((s: number, l: any) => s + (Number(l.quantityOrdered) || 0), 0);
    const uniqueRefs = [...new Set(lines.map((l: any) => l.referenceCode))];

    // Age
    const docDate = new Date(po.documentDate);
    const ageDays = Math.round((Date.now() - docDate.getTime()) / 86400000);
    const updatedDays = Math.round((Date.now() - new Date(po.updatedAt).getTime()) / 86400000);

    // ET events linked to this OP (via ss_remision or documentNumber)
    let etEvents: any[] = [];
    if (etTableExists) {
      try {
        etEvents = await db.$queryRawUnsafe(`
          SELECT id, "documentNumber", "eventType", "documentDate", "referenceDocument"
          FROM "ProductionEvent"
          WHERE "organizationId" = $1
            AND ("referenceDocument" = $2 OR "documentNumber" = $2)
          ORDER BY "documentDate" DESC
          LIMIT 5
        `, org.id, opNum);
      } catch { /* ignore */ }
    }

    // Check if any line refs have "producto terminado" warehouse entries (B01)
    let b01Entries = 0;
    try {
      // Look for coverage snapshots in B01 for these refs
      const b01: any[] = await db.$queryRawUnsafe(`
        SELECT COUNT(DISTINCT "refCode")::int as c
        FROM "CommercialCoverageSnapshot"
        WHERE "organizationId" = $1
          AND "refCode" = ANY($2::text[])
          AND disponible > 0
      `, org.id, uniqueRefs);
      b01Entries = b01[0]?.c ?? 0;
    } catch { /* ignore */ }

    // Determine staleness verdict
    const isOld = ageDays > 365;
    const isVeryOld = ageDays > 540;
    const noRecentUpdate = updatedDays > 90;
    const hasEtActivity = etEvents.length > 0;

    let verdict = "ACTIVA";
    if (isVeryOld && !hasEtActivity) verdict = "COMPLETADA_O_ABANDONADA";
    else if (isOld && !hasEtActivity && noRecentUpdate) verdict = "PROBABLEMENTE_COMPLETADA";
    else if (isOld) verdict = "VIEJA_CON_ACTIVIDAD";

    console.log(`OP ${opNum}:`);
    console.log(`  documentDate:      ${po.documentDate?.toISOString?.().slice(0,10) ?? String(po.documentDate).slice(0,10)}`);
    console.log(`  age:               ${ageDays} days`);
    console.log(`  status:            ${po.status}`);
    console.log(`  isClosed:          ${po.isClosed}`);
    console.log(`  currentStage:      ${po.currentStage ?? "null"}`);
    console.log(`  currentStageLabel: ${po.currentStageLabel ?? "null"}`);
    console.log(`  totalQuantity:     ${po.totalQuantity ?? "null"}`);
    console.log(`  sumOrdered:        ${totalOrdered}`);
    console.log(`  lines:             ${lines.length} (${uniqueRefs.length} unique refs)`);
    console.log(`  warehouseCode:     ${po.warehouseCode ?? "null"}`);
    console.log(`  updatedAt:         ${po.updatedAt?.toISOString?.().slice(0,10)} (${updatedDays} days ago)`);
    console.log(`  ET/CN events:      ${etEvents.length}`);
    if (etEvents.length > 0) {
      for (const ev of etEvents.slice(0, 3)) {
        console.log(`    ${ev.eventType} ${ev.documentNumber} date=${ev.documentDate?.toISOString?.().slice(0,10)} ref=${ev.referenceDocument}`);
      }
    }
    console.log(`  refs in B01 stock: ${b01Entries}/${uniqueRefs.length}`);
    console.log(`  VERDICT:           ${verdict}`);
    console.log();
  }

  // ── Global age distribution of "open" OPs ─────────────────────────
  console.log("=== GLOBAL AGE DISTRIBUTION (open OPs) ===\n");
  const ageDist: any[] = await db.$queryRawUnsafe(`
    SELECT
      CASE
        WHEN "documentDate" >= NOW() - INTERVAL '3 months' THEN '0-3m'
        WHEN "documentDate" >= NOW() - INTERVAL '6 months' THEN '3-6m'
        WHEN "documentDate" >= NOW() - INTERVAL '12 months' THEN '6-12m'
        WHEN "documentDate" >= NOW() - INTERVAL '18 months' THEN '12-18m'
        ELSE '18m+'
      END AS bucket,
      COUNT(*)::int AS count
    FROM "ProductionOrder"
    WHERE "organizationId" = $1 AND status = 'open' AND "isClosed" = false
    GROUP BY bucket
    ORDER BY bucket
  `, org.id);

  for (const row of ageDist) {
    console.log(`  ${row.bucket}: ${row.count} OPs`);
  }

  const totalOpen: any[] = await db.$queryRawUnsafe(`
    SELECT COUNT(*)::int as c FROM "ProductionOrder"
    WHERE "organizationId" = $1 AND status = 'open' AND "isClosed" = false
  `, org.id);
  console.log(`\n  Total open: ${totalOpen[0]?.c}`);

  // Oldest open OP
  const oldest: any[] = await db.$queryRawUnsafe(`
    SELECT "documentNumber", "documentDate"
    FROM "ProductionOrder"
    WHERE "organizationId" = $1 AND status = 'open' AND "isClosed" = false
    ORDER BY "documentDate" ASC
    LIMIT 3
  `, org.id);
  console.log(`  Oldest open:`);
  for (const o of oldest) {
    const age = Math.round((Date.now() - new Date(o.documentDate).getTime()) / 86400000);
    console.log(`    OP ${o.documentNumber} — ${o.documentDate?.toISOString?.().slice(0,10)} (${age} days)`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
