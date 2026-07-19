/**
 * _validate-op-active-filter.ts
 *
 * VENDOR-SAMPLE-OP-ACTIVE-FILTER-01 — Phase 6 Validation
 *
 * Shows before/after comparison of OP filter.
 * Confirms zombie OPs are excluded, recent OPs survive.
 */

import { prisma } from "@/lib/prisma";

const db = prisma as any;
const DEFAULT_OP_ACTIVE_WINDOW_MONTHS = 6;
const AUDIT_OPS = ["2949","2948","2616","2597","2559","2893","2891","2781","2703","2534"];

async function main() {
  const org = await db.organization.findFirst({ where: { slug: "castillitos" } });
  if (org == null) { console.log("FAIL: org not found"); return; }

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - DEFAULT_OP_ACTIVE_WINDOW_MONTHS);
  const cutoffIso = cutoff.toISOString();

  console.log("=== VENDOR-SAMPLE-OP-ACTIVE-FILTER-01 VALIDATION ===");
  console.log(`Window: ${DEFAULT_OP_ACTIVE_WINDOW_MONTHS} months`);
  console.log(`Cutoff: ${cutoffIso.slice(0, 10)}\n`);

  // ── BEFORE: all open OPs ──────────────────────────────────────────────
  const allOpen: any[] = await db.$queryRawUnsafe(`
    SELECT COUNT(DISTINCT po."documentNumber")::int as ops,
           COUNT(*)::int as lines
    FROM "ProductionOrderLine" pol
    JOIN "ProductionOrder" po ON po.id = pol."productionOrderId"
    WHERE po."organizationId" = $1 AND po.status = 'open' AND po."isClosed" = false
  `, org.id);

  console.log("BEFORE (no filter):");
  console.log(`  Open OPs: ${allOpen[0]?.ops}`);
  console.log(`  OP lines: ${allOpen[0]?.lines}`);

  // ── Last event date per OP ────────────────────────────────────────────
  interface LastEventRow { opDocNumber: string; lastEventDate: Date }
  const lastEvents: LastEventRow[] = await db.$queryRawUnsafe(`
    SELECT
      SPLIT_PART("productionOrderRef", '-', 1) AS "opDocNumber",
      MAX("eventDate") AS "lastEventDate"
    FROM "ProductionEvent"
    WHERE "organizationId" = $1
    GROUP BY SPLIT_PART("productionOrderRef", '-', 1)
  `, org.id);

  const lastEventMap = new Map<string, Date>();
  for (const row of lastEvents) {
    if (row.opDocNumber) lastEventMap.set(row.opDocNumber, new Date(row.lastEventDate));
  }

  // ── AFTER: filtered OPs ───────────────────────────────────────────────
  // Load all open OP lines
  interface OpLine {
    referenceCode: string;
    documentNumber: string;
    documentDate: Date;
  }
  const allLines: OpLine[] = await db.$queryRawUnsafe(`
    SELECT pol."referenceCode", po."documentNumber", po."documentDate"
    FROM "ProductionOrderLine" pol
    JOIN "ProductionOrder" po ON po.id = pol."productionOrderId"
    WHERE po."organizationId" = $1 AND po.status = 'open' AND po."isClosed" = false
  `, org.id);

  const cutoffMs = cutoff.getTime();
  const activeLines = allLines.filter((l) => {
    const docMs = new Date(l.documentDate).getTime();
    if (docMs >= cutoffMs) return true;
    const lastEv = lastEventMap.get(l.documentNumber);
    if (lastEv && lastEv.getTime() >= cutoffMs) return true;
    return false;
  });

  const activeOps = new Set(activeLines.map((l) => l.documentNumber));
  const allOps = new Set(allLines.map((l) => l.documentNumber));
  const filteredOps = new Set([...allOps].filter((op) => !activeOps.has(op)));

  console.log(`\nAFTER (${DEFAULT_OP_ACTIVE_WINDOW_MONTHS}-month filter):`);
  console.log(`  Active OPs: ${activeOps.size}`);
  console.log(`  Active lines: ${activeLines.length}`);
  console.log(`  Filtered (zombie) OPs: ${filteredOps.size}`);
  console.log(`  Reduction: ${Math.round((1 - activeOps.size / allOps.size) * 100)}%`);

  // ── Subgrupo coverage ─────────────────────────────────────────────────
  // Resolve subgrupoId for active refs
  const activeRefs = [...new Set(activeLines.map((l) => l.referenceCode))];
  const allRefs = [...new Set(allLines.map((l) => l.referenceCode))];

  const peActive = await db.productEntity.findMany({
    where: { sku: { in: activeRefs }, subgrupoId: { not: null } },
    select: { sku: true, subgrupoId: true },
  });
  const peAll = await db.productEntity.findMany({
    where: { sku: { in: allRefs }, subgrupoId: { not: null } },
    select: { sku: true, subgrupoId: true },
  });

  const subgruposBefore = new Set(peAll.map((p: any) => p.subgrupoId));
  const subgruposAfter = new Set(peActive.map((p: any) => p.subgrupoId));

  console.log(`\nSubgrupos cubiertos:`);
  console.log(`  Before: ${subgruposBefore.size}`);
  console.log(`  After: ${subgruposAfter.size}`);
  console.log(`  Lost: ${subgruposBefore.size - subgruposAfter.size}`);

  // ── REEMPLAZAR refs with OP before/after ──────────────────────────────
  interface CovRow { refCode: string; line: string; disponible: number; subgrupoId: number | null }
  const coverageRows: CovRow[] = await db.$queryRawUnsafe(`
    SELECT DISTINCT ON ("refCode") "refCode", line, disponible, "subgrupoId"
    FROM "CommercialCoverageSnapshot"
    WHERE "organizationId" = $1
    ORDER BY "refCode", "snapshotAt" DESC
  `, org.id);

  function getMin(line: string): number {
    if (line === "LT") return 30;
    if (line === "IMPORT") return 10;
    return 20;
  }

  const reemplazar = coverageRows.filter((r) => r.disponible <= getMin(r.line));

  // Build subgrupo→OP sets
  const subOpBefore = new Map<number, Set<string>>();
  for (const l of allLines) {
    const pe = peAll.find((p: any) => p.sku === l.referenceCode);
    if (pe) {
      if (!subOpBefore.has(pe.subgrupoId)) subOpBefore.set(pe.subgrupoId, new Set());
      subOpBefore.get(pe.subgrupoId)!.add(l.referenceCode);
    }
  }
  const subOpAfter = new Map<number, Set<string>>();
  for (const l of activeLines) {
    const pe = peActive.find((p: any) => p.sku === l.referenceCode);
    if (pe) {
      if (!subOpAfter.has(pe.subgrupoId)) subOpAfter.set(pe.subgrupoId, new Set());
      subOpAfter.get(pe.subgrupoId)!.add(l.referenceCode);
    }
  }

  const reemplazarWithOpBefore = reemplazar.filter((r) =>
    r.subgrupoId != null && subOpBefore.has(r.subgrupoId)
  );
  const reemplazarWithOpAfter = reemplazar.filter((r) =>
    r.subgrupoId != null && subOpAfter.has(r.subgrupoId)
  );

  console.log(`\nREEMPLAZAR refs con OP:`);
  console.log(`  Before: ${reemplazarWithOpBefore.length} / ${reemplazar.length}`);
  console.log(`  After: ${reemplazarWithOpAfter.length} / ${reemplazar.length}`);

  // ── Oldest surviving OP ───────────────────────────────────────────────
  let oldestActive: { doc: string; date: Date; reason: string } | null = null;
  for (const op of activeOps) {
    const line = activeLines.find((l) => l.documentNumber === op);
    if (!line) continue;
    const d = new Date(line.documentDate);
    if (oldestActive == null || d < oldestActive.date) {
      const isRecentDoc = d.getTime() >= cutoffMs;
      const lastEv = lastEventMap.get(op);
      const reason = isRecentDoc
        ? "documentDate within window"
        : `lastEvent=${lastEv?.toISOString().slice(0, 10) ?? "?"}`;
      oldestActive = { doc: op, date: d, reason };
    }
  }
  if (oldestActive) {
    const age = Math.round((Date.now() - oldestActive.date.getTime()) / 86400000);
    console.log(`\nOldest surviving OP: ${oldestActive.doc} — ${oldestActive.date.toISOString().slice(0, 10)} (${age}d) [${oldestActive.reason}]`);
  }

  // ── Audit OPs: confirm exclusion/inclusion ────────────────────────────
  console.log(`\n=== AUDIT OPs ===\n`);
  for (const opNum of AUDIT_OPS) {
    const po = await db.productionOrder.findFirst({
      where: { organizationId: org.id, documentNumber: opNum },
      select: { documentDate: true },
    });
    if (po == null) { console.log(`OP ${opNum}: NOT FOUND`); continue; }

    const docDate = new Date(po.documentDate);
    const age = Math.round((Date.now() - docDate.getTime()) / 86400000);
    const isRecent = docDate.getTime() >= cutoffMs;
    const lastEv = lastEventMap.get(opNum);
    const lastEvRecent = lastEv && lastEv.getTime() >= cutoffMs;
    const included = activeOps.has(opNum);

    const status = included ? "INCLUDED" : "EXCLUDED";
    const reason = isRecent
      ? "documentDate within window"
      : lastEvRecent
        ? `lastEvent=${lastEv!.toISOString().slice(0, 10)} within window`
        : `age=${age}d, lastEvent=${lastEv?.toISOString().slice(0, 10) ?? "none"} — zombie`;

    console.log(`[${status}] OP ${opNum} — date=${docDate.toISOString().slice(0, 10)} age=${age}d — ${reason}`);
  }

  // ── Age distribution of surviving OPs ─────────────────────────────────
  console.log(`\n=== AGE DISTRIBUTION (surviving) ===\n`);
  const buckets = { "0-1m": 0, "1-3m": 0, "3-6m": 0, "6-9m": 0, "9-12m": 0, "12m+": 0 };
  for (const op of activeOps) {
    const line = activeLines.find((l) => l.documentNumber === op);
    if (!line) continue;
    const age = Math.round((Date.now() - new Date(line.documentDate).getTime()) / 86400000);
    if (age <= 30) buckets["0-1m"]++;
    else if (age <= 90) buckets["1-3m"]++;
    else if (age <= 180) buckets["3-6m"]++;
    else if (age <= 270) buckets["6-9m"]++;
    else if (age <= 365) buckets["9-12m"]++;
    else buckets["12m+"]++;
  }
  for (const [bucket, count] of Object.entries(buckets)) {
    console.log(`  ${bucket}: ${count} OPs`);
  }

  console.log("\n=== VALIDATION COMPLETE ===");

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
