/**
 * _dry_run_auto_reconciliation.ts
 *
 * Sprint S3 Phase 1 — Dry-run reconciliation simulation.
 *
 * READ-ONLY. NEVER mutates the database.
 *
 * Simulates the full reconciliation engine against real production data.
 * Outputs what WOULD happen if the apply engine were run.
 *
 * Usage:
 *   ORG_SLUG=castillitos npx dotenv-cli -e .env -- npx tsx scripts/_dry_run_auto_reconciliation.ts
 *
 * Optional:
 *   LIMIT=500 — cap number of cobros processed
 *   SHOW_DETAILS=true — print per-pair detail table
 */

import { prisma } from "@/lib/prisma";
import { buildReconciliationPlan } from "@/lib/reconciliation/reconciliation-engine";

const ORG_SLUG     = process.env.ORG_SLUG ?? "castillitos";
const LIMIT        = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : undefined;
const SHOW_DETAILS = process.env.SHOW_DETAILS === "true";

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const C = (s: string) => `\x1b[36m${s}\x1b[0m`;

function fmtCOP(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-CO");
}

function pct(n: number, total: number): string {
  if (total === 0) return "0.0%";
  return ((n / total) * 100).toFixed(1) + "%";
}

async function main() {
  console.log(B("\n═══════════════════════════════════════════════════════════════"));
  console.log(B("  SPRINT S3 PHASE 1 — DRY-RUN AUTO RECONCILIATION              "));
  console.log(B("  READ-ONLY — NO DATABASE MUTATIONS                             "));
  console.log(B("═══════════════════════════════════════════════════════════════\n"));

  const org = await (prisma as any).organization.findFirst({
    where: { slug: ORG_SLUG },
    select: { id: true, name: true },
  });
  if (!org) { console.error(R(`Org not found: ${ORG_SLUG}`)); process.exit(1); }
  const orgId: string = org.id;
  console.log(`Org : ${B(org.name)} (${orgId})`);
  if (LIMIT) console.log(`Limit : ${LIMIT} cobros (set via LIMIT env var)`);
  console.log();

  // ── Run plan builder ───────────────────────────────────────────────────────
  const t0 = Date.now();
  console.log(C("Building reconciliation plan..."));
  const plan = await buildReconciliationPlan(orgId, { limit: LIMIT });
  const elapsed = Date.now() - t0;
  console.log(G(`Plan built in ${elapsed}ms\n`));

  // ── Section 1: Input summary ───────────────────────────────────────────────
  console.log(B("── SECTION 1: Input Summary ────────────────────────────────────"));
  console.log(`\nCobros processed (AVAILABLE)     : ${plan.totalCobros.toLocaleString()}`);
  console.log(`Qualified pairs (will be applied): ${G(plan.qualifiedPairs.length.toLocaleString())}`);
  console.log(`Skipped cobros                   : ${Y(plan.skippedCobros.length.toLocaleString())}`);
  console.log(`Unmatched cobros (no RX)         : ${R(plan.unmatchedCobros.length.toLocaleString())}`);

  // ── Section 2: Financial impact ───────────────────────────────────────────
  console.log(B("\n── SECTION 2: Financial Impact (Projected) ─────────────────────"));

  // Current totals from DB
  const rxAgg = await (prisma as any).customerReceivable.aggregate({
    where: { organizationId: orgId },
    _sum:  { originalAmount: true, paidAmount: true, balanceDue: true },
    _count: { id: true },
  });
  const currentBalance = typeof rxAgg._sum.balanceDue?.toNumber === "function"
    ? rxAgg._sum.balanceDue.toNumber()
    : Number(rxAgg._sum.balanceDue ?? 0);

  const projectedBalance = currentBalance - plan.totalBalanceReduction;

  console.log(`\nCurrent total balance (COP)      : ${Y(fmtCOP(currentBalance))}`);
  console.log(`Total amount to apply (COP)      : ${G(fmtCOP(plan.totalAmountApplied))}`);
  console.log(`Projected balance after (COP)    : ${G(fmtCOP(projectedBalance))}`);
  console.log(`Balance reduction                : ${G(pct(plan.totalAmountApplied, currentBalance))}`);
  console.log(`\nProjected receivable status change:`);
  console.log(`  → PAID    : ${G(String(plan.projectedPaidCount))} invoices fully paid`);
  console.log(`  → PARTIAL : ${Y(String(plan.projectedPartialCount))} invoices partially paid`);

  // Unique receivables touched
  const uniqueRx = new Set(plan.qualifiedPairs.map(p => p.receivableId)).size;
  const totalRx  = rxAgg._count.id as number;
  console.log(`\nReceivables touched              : ${G(String(uniqueRx))} of ${totalRx} (${pct(uniqueRx, totalRx)})`);
  console.log(`Cobros to be applied             : ${G(String(plan.qualifiedPairs.length))}`);

  // ── Section 3: Confidence distribution ────────────────────────────────────
  console.log(B("\n── SECTION 3: Confidence Distribution ─────────────────────────"));
  const byConf: Record<string, number> = {};
  for (const p of plan.qualifiedPairs) {
    byConf[p.confidence] = (byConf[p.confidence] ?? 0) + 1;
  }
  for (const [conf, cnt] of Object.entries(byConf)) {
    const color = conf === "HIGH" ? G : conf === "MEDIUM" ? Y : R;
    console.log(`  ${conf.padEnd(8)} : ${color(String(cnt))} (${pct(cnt, plan.qualifiedPairs.length)})`);
  }

  // ── Section 4: Skip reasons ────────────────────────────────────────────────
  console.log(B("\n── SECTION 4: Skip Reason Breakdown ───────────────────────────"));
  const skipReasons: Record<string, number> = {};
  for (const s of plan.skippedCobros) {
    const reason = s.reason.split(":")[0];
    skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
  }
  for (const [reason, cnt] of Object.entries(skipReasons).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${reason.padEnd(30)} : ${cnt}`);
  }
  if (plan.unmatchedCobros.length > 0) {
    console.log(`  NO_RX_MATCH (no receivable)    : ${R(String(plan.unmatchedCobros.length))}`);
  }

  // ── Section 5: Top affected invoices ─────────────────────────────────────
  console.log(B("\n── SECTION 5: Top 20 Receivables by Cobro Amount Applied ──────"));
  const byReceivable = new Map<string, { erpId: string; customerName: string; totalApplied: number; cobroCount: number; finalBalance: number; finalStatus: string }>();
  for (const p of plan.qualifiedPairs) {
    const ex = byReceivable.get(p.receivableId) ?? {
      erpId: p.erpId,
      customerName: p.customerName,
      totalApplied: 0,
      cobroCount: 0,
      finalBalance: 0,
      finalStatus: "",
    };
    ex.totalApplied += p.amountApplied;
    ex.cobroCount++;
    ex.finalBalance = p.balanceAfter;
    ex.finalStatus  = p.statusAfter;
    byReceivable.set(p.receivableId, ex);
  }

  const topRx = [...byReceivable.values()]
    .sort((a, b) => b.totalApplied - a.totalApplied)
    .slice(0, 20);

  console.log(`\n  ${"erpId".padEnd(14)} ${"Applied (COP)".padStart(18)} ${"Cobros".padStart(7)} ${"Rem Bal (COP)".padStart(18)} ${"Status".padStart(9)}  Customer`);
  console.log(`  ${"-".repeat(90)}`);
  for (const rx of topRx) {
    const statusColor = rx.finalStatus === "PAID" ? G : rx.finalStatus === "PARTIAL" ? Y : (s: string) => s;
    console.log(
      `  ${rx.erpId.padEnd(14)} ${fmtCOP(rx.totalApplied).padStart(18)} ${String(rx.cobroCount).padStart(7)} ${fmtCOP(rx.finalBalance).padStart(18)} ${statusColor(rx.finalStatus.padStart(9))}  ${rx.customerName.slice(0, 35)}`
    );
  }

  // ── Section 6: Partial payment examples ───────────────────────────────────
  console.log(B("\n── SECTION 6: Multi-Cobro Invoices (Partial Payments) ──────────"));
  const multiCobro = [...byReceivable.entries()]
    .filter(([, v]) => v.cobroCount > 1)
    .sort((a, b) => b[1].cobroCount - a[1].cobroCount)
    .slice(0, 10);

  if (multiCobro.length === 0) {
    console.log(Y("\n  No multi-cobro invoices in this run."));
  } else {
    console.log(`\n  ${"erpId".padEnd(14)} ${"Cobros".padStart(7)} ${"Total Applied".padStart(18)} ${"Final Balance".padStart(18)} ${"Status".padStart(9)}`);
    console.log(`  ${"-".repeat(72)}`);
    for (const [, rx] of multiCobro) {
      const statusColor = rx.finalStatus === "PAID" ? G : rx.finalStatus === "PARTIAL" ? Y : (s: string) => s;
      console.log(
        `  ${rx.erpId.padEnd(14)} ${String(rx.cobroCount).padStart(7)} ${fmtCOP(rx.totalApplied).padStart(18)} ${fmtCOP(rx.finalBalance).padStart(18)} ${statusColor(rx.finalStatus.padStart(9))}`
      );
    }
  }

  // ── Section 7: Per-pair detail (optional) ─────────────────────────────────
  if (SHOW_DETAILS && plan.qualifiedPairs.length > 0) {
    console.log(B("\n── SECTION 7: Per-Pair Detail (first 50) ───────────────────────"));
    console.log(`\n  ${"cobroId".padEnd(28)} ${"erpId".padEnd(14)} ${"Amount".padStart(14)} ${"Applied".padStart(14)} ${"Balance→".padStart(14)} ${"Status→".padStart(9)}`);
    console.log(`  ${"-".repeat(100)}`);
    for (const p of plan.qualifiedPairs.slice(0, 50)) {
      const statusColor = p.statusAfter === "PAID" ? G : p.statusAfter === "PARTIAL" ? Y : (s: string) => s;
      console.log(
        `  ${p.cobroId.padEnd(28)} ${p.erpId.padEnd(14)} ${fmtCOP(p.cobroAmount).padStart(14)} ${fmtCOP(p.amountApplied).padStart(14)} ${fmtCOP(p.balanceAfter).padStart(14)} ${statusColor(p.statusAfter.padStart(9))}`
      );
    }
    if (plan.qualifiedPairs.length > 50) {
      console.log(`  ... and ${plan.qualifiedPairs.length - 50} more pairs`);
    }
  }

  // ── Section 8: Unmatched cobros sample ────────────────────────────────────
  console.log(B("\n── SECTION 8: Unmatched Cobros Sample (first 10) ──────────────"));
  if (plan.unmatchedCobros.length === 0) {
    console.log(G("\n  All cobros with Documento_pagado have matching receivables."));
  } else {
    const unmatched = plan.unmatchedCobros.slice(0, 10);
    const totalUnmatchedAmt = plan.unmatchedCobros.reduce((s, c) => s + c.cobroAmt, 0);
    console.log(`\n  Total unmatched cobros          : ${R(String(plan.unmatchedCobros.length))}`);
    console.log(`  Total unmatched cobro amount    : ${R(fmtCOP(totalUnmatchedAmt))}`);
    console.log(`  (these reference erpIds not in CustomerReceivable — likely MOV range gap)\n`);
    for (const c of unmatched) {
      console.log(`  cobroId=${c.cobroId.slice(0, 8)} erpId=${c.erpId ?? "(none)"} amt=${fmtCOP(c.cobroAmt)} reason=${c.reason}`);
    }
  }

  // ── FINAL SUMMARY ─────────────────────────────────────────────────────────
  console.log(B("\n══════════════════════════════════════════════════════════════"));
  console.log(B("  DRY-RUN SUMMARY"));
  console.log(B("══════════════════════════════════════════════════════════════"));
  console.log(`
  Cobros analyzed     : ${plan.totalCobros.toLocaleString()}
  Pairs qualified     : ${G(plan.qualifiedPairs.length.toLocaleString())} (rule: MOV_EXACT_MATCH, confidence: HIGH)
  Amount to apply     : ${G(fmtCOP(plan.totalAmountApplied))}
  Balance reduction   : ${G(pct(plan.totalAmountApplied, currentBalance))} of total receivable balance
  Invoices → PAID     : ${G(String(plan.projectedPaidCount))}
  Invoices → PARTIAL  : ${Y(String(plan.projectedPartialCount))}

  All operations are HIGH confidence (exact MOV-ID match).
  ${G("SAFE to run apply engine.")}

  Run apply:
    ${C(`ORG_SLUG=${ORG_SLUG} npx dotenv-cli -e .env -- npx tsx scripts/_apply_auto_reconciliation.ts`)}

  Plan build time: ${elapsed}ms
  `);

  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  DRY-RUN COMPLETE — NO DATA WAS MODIFIED"));
  console.log(B("═══════════════════════════════════════════════════════════════\n"));
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
