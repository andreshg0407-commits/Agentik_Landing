/**
 * _analyze-sync-coverage.ts
 *
 * Sprint S2.2 — Phase B (part 1)
 * Analyzes the actual sync coverage: cursor state, run history, and
 * CollectionRecord date/Documento_pagado ranges vs CustomerReceivable erpId range.
 *
 * READ-ONLY. No mutations.
 *
 * Usage:
 *   ORG_SLUG=castillitos npx dotenv-cli -e .env -- npx tsx scripts/_analyze-sync-coverage.ts
 */

import { prisma } from "@/lib/prisma";

const ORG_SLUG = process.env.ORG_SLUG ?? "castillitos";

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;

function fmtCOP(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-CO");
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "(null)";
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log(B("\n═══════════════════════════════════════════════════════════════"));
  console.log(B("  SPRINT S2.2 PHASE B — SAG SYNC COVERAGE ANALYSIS             "));
  console.log(B("═══════════════════════════════════════════════════════════════\n"));

  // ── Resolve org ────────────────────────────────────────────────────────────
  const org = await (prisma as any).organization.findFirst({
    where:  { slug: ORG_SLUG },
    select: { id: true, name: true },
  });
  if (!org) { console.error(R(`Org not found: ${ORG_SLUG}`)); process.exit(1); }
  const orgId: string = org.id;
  console.log(`Org: ${B(org.name)} (${orgId})\n`);

  // ── 1. Connector + cursor state ───────────────────────────────────────────
  console.log(B("── SECTION 1: Connector & Cursor State ─────────────────────────"));

  const connectors = await (prisma as any).connector.findMany({
    where:  { organizationId: orgId },
    select: {
      id: true, source: true, modules: true, status: true,
      cursors: {
        select: { module: true, cursor: true, updatedAt: true },
      },
    },
  });

  for (const c of connectors) {
    console.log(`\nConnector: ${B(c.source)} (${c.id})`);
    console.log(`  status: ${c.status}`);
    console.log(`  modules: ${JSON.stringify(c.modules)}`);
    if (c.cursors.length === 0) {
      console.log(`  ${Y("No cursors stored — full sync pending")}`);
    }
    for (const cur of c.cursors) {
      const curType = cur.cursor?.startsWith("page:") ? Y("MID-SYNC (page cursor)")
                    : cur.cursor?.startsWith("date:") ? G("INCREMENTAL (date cursor)")
                    : cur.cursor === null              ? R("NULL (no prior sync)")
                    : Y("UNKNOWN");
      console.log(`  cursor[${cur.module}]: ${curType}`);
      console.log(`    value     : ${cur.cursor ?? "(null)"}`);
      console.log(`    updatedAt : ${fmtDate(cur.updatedAt)}`);
    }
  }

  // ── 2. Recent sync runs ────────────────────────────────────────────────────
  console.log(B("\n── SECTION 2: Recent Connector Runs (last 20) ──────────────────"));

  const runs = await (prisma as any).connectorRun.findMany({
    where:  { connector: { organizationId: orgId } },
    select: {
      id: true, module: true, status: true,
      rowsRead: true, rowsImported: true, rowsSkipped: true, rowsErrored: true,
      cursorBefore: true, cursorAfter: true,
      startedAt: true, finishedAt: true,
      error: true,
    },
    orderBy: { startedAt: "desc" },
    take: 20,
  });

  if (runs.length === 0) {
    console.log(Y("  No sync runs found."));
  } else {
    console.log(`\n  ${"module".padEnd(15)} ${"status".padEnd(10)} ${"read".padStart(8)} ${"imported".padStart(10)} ${"skipped".padStart(8)} ${"errors".padStart(7)}  ${"started".padEnd(12)}  cursorBefore → cursorAfter`);
    console.log(`  ${"-".repeat(130)}`);
    for (const r of runs) {
      const status = r.status === "COMPLETED" ? G(r.status.padEnd(10))
                   : r.status === "FAILED"    ? R(r.status.padEnd(10))
                   : Y(r.status.padEnd(10));
      const date = r.startedAt ? fmtDate(r.startedAt) : "(null)";
      const before = (r.cursorBefore ?? "(null)").slice(0, 25);
      const after  = (r.cursorAfter  ?? "(null)").slice(0, 25);
      console.log(
        `  ${(r.module ?? "?").padEnd(15)} ${status} ${String(r.rowsRead ?? 0).padStart(8)} ${String(r.rowsImported ?? 0).padStart(10)} ${String(r.rowsSkipped ?? 0).padStart(8)} ${String(r.rowsErrored ?? 0).padStart(7)}  ${date.padEnd(12)}  ${before} → ${after}`
      );
      if (r.error) console.log(`    ${R("ERROR:")} ${r.error.slice(0, 120)}`);
    }
  }

  // ── 3. CollectionRecord coverage stats ────────────────────────────────────
  console.log(B("\n── SECTION 3: CollectionRecord Coverage ───────────────────────"));

  const colCount = await (prisma as any).collectionRecord.count({ where: { organizationId: orgId } });
  console.log(`\nTotal CollectionRecord rows : ${B(String(colCount))}`);

  if (colCount > 0) {
    // Date range
    const minDate = await (prisma as any).collectionRecord.findFirst({
      where:  { organizationId: orgId },
      select: { collectionDate: true },
      orderBy: { collectionDate: "asc" },
    });
    const maxDate = await (prisma as any).collectionRecord.findFirst({
      where:  { organizationId: orgId },
      select: { collectionDate: true },
      orderBy: { collectionDate: "desc" },
    });
    console.log(`Date range (collectionDate) : ${fmtDate(minDate?.collectionDate)} → ${fmtDate(maxDate?.collectionDate)}`);

    // Total value
    const totalAmt = await (prisma as any).collectionRecord.aggregate({
      where:  { organizationId: orgId },
      _sum:   { amount: true },
    });
    const sum = typeof totalAmt._sum.amount?.toNumber === "function"
      ? totalAmt._sum.amount.toNumber()
      : Number(totalAmt._sum.amount ?? 0);
    console.log(`Total cobro amount (COP)    : ${G(fmtCOP(sum))}`);

    // Documento_pagado range — extracted from rawJson
    // rawJson is a JSON field; Documento_pagado is in rawJson.raw.Documento_pagado
    // We'll pull a sample and compute range from comprobanteCode + rawJson
    const sampleRaw = await (prisma as any).collectionRecord.findMany({
      where:  { organizationId: orgId },
      select: { rawJson: true },
      take: 500,
      orderBy: { collectionDate: "asc" },
    });

    const docPagadoVals: number[] = [];
    for (const row of sampleRaw) {
      const rj = row.rawJson as any;
      const dp = rj?.raw?.Documento_pagado ?? rj?.raw?.documento_pagado;
      if (dp && typeof dp === "number" && dp > 0) docPagadoVals.push(dp);
    }

    if (docPagadoVals.length > 0) {
      const minDP = Math.min(...docPagadoVals);
      const maxDP = Math.max(...docPagadoVals);
      console.log(`Documento_pagado range      : ${minDP} → ${maxDP} (sample of ${docPagadoVals.length} from earliest 500)`);
    } else {
      console.log(Y(`Documento_pagado range      : Could not extract from rawJson sample`));
    }

    // Also check from latest 500
    const sampleRawLate = await (prisma as any).collectionRecord.findMany({
      where:  { organizationId: orgId },
      select: { rawJson: true },
      take: 500,
      orderBy: { collectionDate: "desc" },
    });
    const docPagadoLate: number[] = [];
    for (const row of sampleRawLate) {
      const rj = row.rawJson as any;
      const dp = rj?.raw?.Documento_pagado ?? rj?.raw?.documento_pagado;
      if (dp && typeof dp === "number" && dp > 0) docPagadoLate.push(dp);
    }
    if (docPagadoLate.length > 0) {
      const minDP = Math.min(...docPagadoLate);
      const maxDP = Math.max(...docPagadoLate);
      console.log(`Documento_pagado range      : ${minDP} → ${maxDP} (sample of ${docPagadoLate.length} from latest 500)`);
    }

    // Source code distribution
    const byCode = await (prisma as any).collectionRecord.groupBy({
      by: ["comprobanteCode"],
      where:  { organizationId: orgId },
      _count: { id: true },
      _sum:   { amount: true },
      orderBy: { _count: { id: "desc" } },
    });
    console.log(`\nBy comprobante code:`);
    for (const g of byCode) {
      const s = typeof g._sum.amount?.toNumber === "function"
        ? g._sum.amount.toNumber()
        : Number(g._sum.amount ?? 0);
      console.log(`  ${(g.comprobanteCode ?? "?").padEnd(5)} : ${String(g._count.id).padStart(7)} records  ${fmtCOP(s)}`);
    }
  }

  // ── 4. CustomerReceivable erpId range ─────────────────────────────────────
  console.log(B("\n── SECTION 4: CustomerReceivable erpId Range ───────────────────"));

  const rxCount = await (prisma as any).customerReceivable.count({ where: { organizationId: orgId } });
  console.log(`\nTotal CustomerReceivable rows : ${B(String(rxCount))}`);

  if (rxCount > 0) {
    // Min erpId MOV number
    const minErp = await (prisma as any).customerReceivable.findFirst({
      where:   { organizationId: orgId, erpId: { startsWith: "MOV-" } },
      select:  { erpId: true },
      orderBy: { erpId: "asc" },
    });
    const maxErp = await (prisma as any).customerReceivable.findFirst({
      where:   { organizationId: orgId, erpId: { startsWith: "MOV-" } },
      select:  { erpId: true },
      orderBy: { erpId: "desc" },
    });
    // Note: orderBy erpId lexicographic — use numeric sort via raw if needed
    console.log(`erpId range (lexicographic) : ${minErp?.erpId ?? "(null)"} → ${maxErp?.erpId ?? "(null)"}`);
    console.log(Y(`  Note: lexicographic sort; "MOV-9" > "MOV-264351" — see Phase B part 2 for numeric sort`));

    // Status breakdown
    const byStatus = await (prisma as any).customerReceivable.groupBy({
      by: ["status"],
      where:  { organizationId: orgId },
      _count: { id: true },
      _sum:   { balanceDue: true },
    });
    console.log(`\nBy status:`);
    for (const g of byStatus) {
      const s = typeof g._sum.balanceDue?.toNumber === "function"
        ? g._sum.balanceDue.toNumber()
        : Number(g._sum.balanceDue ?? 0);
      console.log(`  ${(g.status ?? "?").padEnd(10)} : ${String(g._count.id).padStart(8)} rows  ${fmtCOP(s)}`);
    }

    // Total balance
    const totalBal = await (prisma as any).customerReceivable.aggregate({
      where: { organizationId: orgId },
      _sum:  { balanceDue: true, originalAmount: true },
    });
    const bal = typeof totalBal._sum.balanceDue?.toNumber === "function"
      ? totalBal._sum.balanceDue.toNumber()
      : Number(totalBal._sum.balanceDue ?? 0);
    const orig = typeof totalBal._sum.originalAmount?.toNumber === "function"
      ? totalBal._sum.originalAmount.toNumber()
      : Number(totalBal._sum.originalAmount ?? 0);
    console.log(`\nTotal original amount (COP) : ${G(fmtCOP(orig))}`);
    console.log(`Total balance due (COP)     : ${G(fmtCOP(bal))}`);
  }

  // ── 5. Gap summary ────────────────────────────────────────────────────────
  console.log(B("\n── SECTION 5: Coverage Gap Summary ────────────────────────────"));

  const cobrosInJoinRange = await (prisma as any).collectionRecord.count({
    where: { organizationId: orgId },
  });

  // How many CustomerReceivable rows have at least one matching CollectionRecord?
  // Proxy: count distinct Documento_pagado references and join to erpId
  // We'll do a quick check: receivables with erpId that COULD match a cobro
  // (erpId = "MOV-" + Documento_pagado, Documento_pagado in [~140, ~10800])
  const lowRangeRx = await (prisma as any).customerReceivable.count({
    where: {
      organizationId: orgId,
      erpId: { startsWith: "MOV-" },
      // erpId numbers in the cobro coverage range: MOV-1 to MOV-10999
      // We filter by erpId lexicographic (imperfect but indicative for small numbers)
      AND: [
        { erpId: { gte: "MOV-1" } },
        { erpId: { lte: "MOV-10999" } },
      ],
    },
  });

  console.log(`\nCollectionRecord rows          : ${cobrosInJoinRange}`);
  console.log(`CustomerReceivable total       : ${rxCount}`);
  console.log(`CustomerReceivable in likely   `);
  console.log(`  cobro coverage (MOV-1..10999): ~${lowRangeRx} (lexicographic estimate — see _movement-range-audit.ts for exact count)`);
  console.log(`\nEstimated uncovered receivables: ~${rxCount - lowRangeRx} (${((rxCount - lowRangeRx) / rxCount * 100).toFixed(1)}% of total)`);
  console.log(Y(`\nFundamental gap: CollectionRecord covers Documento_pagado ≈ 140..10800`));
  console.log(Y(`                 CustomerReceivable covers erpId MOV-7..MOV-264351+`));
  console.log(Y(`                 ≈${((rxCount - lowRangeRx) / rxCount * 100).toFixed(0)}% of receivables have no accessible cobro data`));

  console.log("\n" + B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  ANALYSIS COMPLETE"));
  console.log(B("═══════════════════════════════════════════════════════════════\n"));
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
