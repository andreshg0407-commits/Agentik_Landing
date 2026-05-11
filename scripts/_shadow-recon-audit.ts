/**
 * _shadow-recon-audit.ts
 *
 * Phase D — Shadow reconciliation audit.
 * Runs shadow reconciliation on DIANA ALZATE + 3 additional customers.
 *
 * READ-ONLY. No mutations.
 *
 * Usage:
 *   ORG_SLUG=castillitos npx dotenv-cli -e .env -- npx tsx scripts/_shadow-recon-audit.ts
 */

import { prisma } from "@/lib/prisma";
import {
  shadowReconcileCustomer,
  shadowReconcileOrg,
  type ShadowReconciliationResult,
} from "@/lib/reconciliation/shadow-reconciliation";

const ORG_SLUG = process.env.ORG_SLUG ?? "castillitos";

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

function printCustomerAudit(
  name: string,
  results: ShadowReconciliationResult[],
) {
  console.log(B(`\n══ Customer: ${name} ══════════════════════════════════════`));

  if (results.length === 0) {
    console.log(Y("  No CustomerReceivable rows found for this customer."));
    return;
  }

  const totalOrig    = results.reduce((s, r) => s + r.originalAmount, 0);
  const totalCurrent = results.reduce((s, r) => s + r.currentBalance, 0);
  const totalInferred = results.reduce((s, r) => s + r.inferredPaid, 0);
  const totalTheor   = results.reduce((s, r) => s + r.theoreticalBalance, 0);
  const totalVar     = results.reduce((s, r) => s + r.variance, 0);
  const totalCobros  = results.reduce((s, r) => s + r.cobroCount, 0);

  console.log(`  Receivable rows      : ${results.length}`);
  console.log(`  Total original amt   : ${fmtCOP(totalOrig)}`);
  console.log(`  Current balance      : ${fmtCOP(totalCurrent)} (Agentik's stale value)`);
  console.log(`  Inferred paid        : ${G(fmtCOP(totalInferred))} (from CollectionRecord cobros)`);
  console.log(`  Theoretical balance  : ${fmtCOP(totalTheor)}`);
  console.log(`  Variance             : ${totalVar > 0 ? Y(fmtCOP(totalVar)) : G(fmtCOP(totalVar))} (Agentik overstates by this)`);
  console.log(`  Total cobros found   : ${totalCobros}`);

  const high = results.filter(r => r.confidence === "HIGH").length;
  const mid  = results.filter(r => r.confidence === "MEDIUM").length;
  const low  = results.filter(r => r.confidence === "LOW").length;
  console.log(`  Confidence: HIGH=${high} MEDIUM=${mid} LOW=${low}`);

  const paid    = results.filter(r => r.theoreticalStatus === "PAID").length;
  const partial = results.filter(r => r.theoreticalStatus === "PARTIAL").length;
  const open    = results.filter(r => r.theoreticalStatus === "OPEN").length;
  const overpaid = results.filter(r => r.theoreticalStatus === "OVERPAID").length;
  console.log(`  Theoretical status: PAID=${paid} PARTIAL=${partial} OPEN=${open} OVERPAID=${overpaid}`);

  console.log("\n  Per-receivable detail:");
  console.log(`  ${"erpId".padEnd(14)} ${"orig".padStart(12)} ${"currentBal".padStart(12)} ${"infPaid".padStart(12)} ${"theorBal".padStart(12)} ${"variance".padStart(12)} cobros status`);
  console.log(`  ${"-".repeat(90)}`);

  const sorted = [...results].sort((a, b) => b.originalAmount - a.originalAmount);
  for (const r of sorted.slice(0, 20)) {
    const varStr = r.variance > 0 ? Y(fmtCOP(r.variance).padStart(12)) : G(fmtCOP(r.variance).padStart(12));
    const erpStr = (r.erpId ?? "NO-ERP").padEnd(14);
    console.log(
      `  ${erpStr} ${fmtCOP(r.originalAmount).padStart(12)} ${fmtCOP(r.currentBalance).padStart(12)} ${fmtCOP(r.inferredPaid).padStart(12)} ${fmtCOP(r.theoreticalBalance).padStart(12)} ${varStr} ${String(r.cobroCount).padStart(6)} ${r.theoreticalStatus}`
    );
    if (r.note) console.log(`    ${Y("→")} ${r.note}`);
  }

  if (results.length > 20) {
    console.log(`  ... and ${results.length - 20} more rows`);
  }
}

async function main() {
  console.log(B("\n═══════════════════════════════════════════════════════════════"));
  console.log(B("  PHASE D — SHADOW RECONCILIATION AUDIT                         "));
  console.log(B("═══════════════════════════════════════════════════════════════\n"));

  const org = await (prisma as any).organization.findFirst({
    where: { slug: ORG_SLUG },
    select: { id: true, name: true },
  });
  if (!org) { console.error(R(`Org not found: ${ORG_SLUG}`)); process.exit(1); }
  const orgId: string = org.id;
  console.log(`Org: ${B(org.name)} (${orgId})\n`);

  // ── Find DIANA ALZATE ──────────────────────────────────────────────────────
  const dianaProfile = await (prisma as any).customerProfile.findFirst({
    where: {
      organizationId: orgId,
      name: { contains: "DIANA", mode: "insensitive" },
    },
    select: { id: true, name: true, nit: true, nitNormalized: true, sagTerceroId: true, totalReceivable: true },
    orderBy: { totalReceivable: "desc" },
  });

  if (!dianaProfile) {
    console.log(Y("DIANA ALZATE not found — searching for DIANA in CustomerProfile..."));
    const dianas = await (prisma as any).customerProfile.findMany({
      where: { organizationId: orgId, name: { contains: "DIANA", mode: "insensitive" } },
      select: { name: true, nit: true, sagTerceroId: true, totalReceivable: true },
      take: 5,
    });
    console.log("Found:");
    for (const d of dianas) console.log(`  ${d.name}  nit=${d.nit}  sagTerceroId=${d.sagTerceroId}  balance=${d.totalReceivable}`);
  } else {
    const dianaResults = await shadowReconcileCustomer(orgId, { customerId: dianaProfile.id });
    printCustomerAudit(`${dianaProfile.name} (nit=${dianaProfile.nit})`, dianaResults);
  }

  // ── Find 3 additional customers with diverse aging profiles ───────────────
  // Customer A: Highest open balance (most critical for reconciliation)
  const highBalance = await (prisma as any).customerProfile.findFirst({
    where: { organizationId: orgId, totalReceivable: { gt: 0 }, sagTerceroId: { not: null } },
    select: { id: true, name: true, nit: true, sagTerceroId: true, totalReceivable: true },
    orderBy: { totalReceivable: "desc" },
  });

  // Customer B: Customer with known partial payments (multiple cobros on same invoice)
  // Pick a customer who appears multiple times in CollectionRecord
  const frecuentPayer = await (prisma as any).collectionRecord.groupBy({
    by: ["customerName"],
    where: { organizationId: orgId, customerName: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 1,
  });

  // Customer C: Old aging — find customer with oldest overdue
  const oldestOverdue = await (prisma as any).customerReceivable.findFirst({
    where: { organizationId: orgId, status: "OPEN", daysOverdue: { gt: 180 } },
    select: { customerId: true, customerNit: true, customerName: true },
    orderBy: { daysOverdue: "desc" },
  });

  // Run audits for customers A, B, C
  if (highBalance) {
    const results = await shadowReconcileCustomer(orgId, { customerId: highBalance.id });
    printCustomerAudit(`HIGHEST BALANCE: ${highBalance.name} (nit=${highBalance.nit})`, results);
  }

  if (frecuentPayer[0]) {
    const name = frecuentPayer[0].customerName;
    const cnt  = frecuentPayer[0]._count;
    const profile = await (prisma as any).customerProfile.findFirst({
      where: { organizationId: orgId, name: { contains: name.slice(0, 15), mode: "insensitive" } },
      select: { id: true, name: true, nit: true, sagTerceroId: true },
    });
    if (profile) {
      const results = await shadowReconcileCustomer(orgId, { customerId: profile.id });
      printCustomerAudit(`MOST COBROS (${cnt} records): ${profile.name}`, results);
    }
  }

  if (oldestOverdue?.customerId) {
    const results = await shadowReconcileCustomer(orgId, { customerId: oldestOverdue.customerId });
    printCustomerAudit(`OLDEST OVERDUE: ${oldestOverdue.customerName}`, results);
  } else if (oldestOverdue?.customerNit) {
    const results = await shadowReconcileCustomer(orgId, { nit: oldestOverdue.customerNit });
    printCustomerAudit(`OLDEST OVERDUE: ${oldestOverdue.customerName}`, results);
  }

  // ── Org-wide summary (limited sample) ─────────────────────────────────────
  console.log(B("\n══ ORG-WIDE SHADOW RECONCILIATION (sample: 2000 receivables) ══════"));
  const { results: orgResults, summary } = await shadowReconcileOrg(orgId, { limit: 2000 });

  console.log(`\nOrg: ${B(org.name)}`);
  console.log(`Receivables sampled       : ${summary.totalReceivables}`);
  console.log(`Fully explained           : ${G(String(summary.fullyExplained))} (${pct(summary.fullyExplained, summary.totalReceivables)})`);
  console.log(`Partially explained       : ${Y(String(summary.partiallyExplained))} (${pct(summary.partiallyExplained, summary.totalReceivables)})`);
  console.log(`Unexplained               : ${R(String(summary.unexplained))} (${pct(summary.unexplained, summary.totalReceivables)})`);
  console.log(`Explainability rate       : ${B(summary.explainabilityRate.toFixed(1) + "%")}`);
  console.log();
  console.log(`Confidence HIGH           : ${G(String(summary.highConfidence))} (${pct(summary.highConfidence, summary.totalReceivables)})`);
  console.log(`Confidence MEDIUM         : ${Y(String(summary.mediumConfidence))} (${pct(summary.mediumConfidence, summary.totalReceivables)})`);
  console.log(`Confidence LOW            : ${R(String(summary.lowConfidence))} (${pct(summary.lowConfidence, summary.totalReceivables)})`);
  console.log();
  console.log(`Total original amount     : ${fmtCOP(summary.totalOriginalAmount)}`);
  console.log(`Total current balance     : ${fmtCOP(summary.totalCurrentBalance)} (Agentik stale)`);
  console.log(`Total inferred paid       : ${G(fmtCOP(summary.totalInferredPaid))} (SAG cobros)`);
  console.log(`Total theoretical balance : ${fmtCOP(summary.totalTheoreticalBalance)}`);
  console.log(`Total variance            : ${Y(fmtCOP(summary.totalVariance))} (Agentik overstatement)`);

  // Theoretical status distribution
  const paid    = orgResults.filter(r => r.theoreticalStatus === "PAID").length;
  const partial = orgResults.filter(r => r.theoreticalStatus === "PARTIAL").length;
  const open    = orgResults.filter(r => r.theoreticalStatus === "OPEN").length;
  const over    = orgResults.filter(r => r.theoreticalStatus === "OVERPAID").length;
  console.log(`\nTheoretical status distribution:`);
  console.log(`  PAID     : ${G(String(paid))} (${pct(paid, orgResults.length)})`);
  console.log(`  PARTIAL  : ${Y(String(partial))} (${pct(partial, orgResults.length)})`);
  console.log(`  OPEN     : ${String(open)} (${pct(open, orgResults.length)})`);
  console.log(`  OVERPAID : ${R(String(over))} (${pct(over, orgResults.length)})`);

  // ND contribution (zero for now)
  console.log(`\nND (nota débito) contribution: $0 — not captured in CollectionRecord`);

  console.log("\n" + B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  AUDIT COMPLETE"));
  console.log(B("═══════════════════════════════════════════════════════════════\n"));
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
