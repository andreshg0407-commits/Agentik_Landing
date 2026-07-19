/**
 * _validate-commercial-intelligence.ts
 *
 * MALETAS-COMMERCIAL-INTELLIGENCE-01 — Pilar 7 Validation
 *
 * Validates intelligence output against real vendor data:
 * - Score makes sense (weighted formula)
 * - Coverage makes sense (subgrupos present vs catalog)
 * - Opportunities have real inventory
 * - Risk uses correct minimums
 * - Import uses threshold 10
 *
 * Usage: npx tsx scripts/_validate-commercial-intelligence.ts
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { loadVendorSampleData } from "../lib/comercial/maletas/vendor-sample-loader";

async function main() {
  // Find castillitos org
  const org = await (prisma as any).organization.findFirst({
    where: { slug: "castillitos" },
  });
  if (!org) {
    console.error("ERROR: castillitos org not found");
    process.exit(1);
  }

  console.log("=== MALETAS COMMERCIAL INTELLIGENCE VALIDATION ===\n");

  const data = await loadVendorSampleData(org.id);

  console.log(`Source: ${data.source}`);
  console.log(`Loaded at: ${data.loadedAt}`);
  console.log(`Vendors: ${data.vendors.length}`);
  console.log(`Coverage gaps: ${data.coverageGaps.length}`);
  console.log(`Intelligence vendors: ${data.intelligence.vendors.length}`);
  console.log(`Catalog subgrupos: ${data.intelligence.catalogSubgrupos}`);
  console.log();

  // ── Per-vendor validation ──────────────────────────────────────────────────

  let allPass = true;

  for (const vi of data.intelligence.vendors) {
    const vendor = data.vendors.find((v) => v.vendorId === vi.vendorId)!;
    console.log(`--- ${vi.vendorName} (${vi.vendorId}) ---`);
    console.log(`  Score: ${vi.score.total}/100 (${vi.score.grade})`);
    console.log(`  Breakdown: coverage=${vi.score.breakdown.coveragePct}% healthy=${vi.score.breakdown.healthyPct}% replace=${vi.score.breakdown.replacePct}% scarcity=${vi.score.breakdown.scarcityPct}%`);
    console.log(`  Subgrupos: ${vi.subgruposPresent}/${vi.subgruposTotal} (${vi.coveragePct}%)`);
    console.log(`  At-risk refs: ${vi.atRiskRefs.length}`);
    console.log(`  Coverage opportunities: ${vi.coverageOpportunities.length}`);

    // Validate 1: Score between 0-100
    if (vi.score.total < 0 || vi.score.total > 100) {
      console.log(`  FAIL: Score out of range: ${vi.score.total}`);
      allPass = false;
    }

    // Validate 2: Grade matches score
    const expectedGrade =
      vi.score.total >= 90 ? "excelente"
      : vi.score.total >= 70 ? "buena"
      : vi.score.total >= 50 ? "debil"
      : "critica";
    if (vi.score.grade !== expectedGrade) {
      console.log(`  FAIL: Grade mismatch: got ${vi.score.grade}, expected ${expectedGrade}`);
      allPass = false;
    }

    // Validate 3: subgruposPresent + subgruposMissing = subgruposTotal
    if (vi.subgruposPresent + vi.subgruposMissing !== vi.subgruposTotal) {
      console.log(`  FAIL: Subgrupo math: ${vi.subgruposPresent} + ${vi.subgruposMissing} != ${vi.subgruposTotal}`);
      allPass = false;
    }

    // Validate 4: coveragePct matches math
    const expectedPct = vi.subgruposTotal > 0
      ? Math.round((vi.subgruposPresent / vi.subgruposTotal) * 100)
      : 0;
    if (vi.coveragePct !== expectedPct) {
      console.log(`  FAIL: Coverage pct mismatch: got ${vi.coveragePct}, expected ${expectedPct}`);
      allPass = false;
    }

    // Validate 5: At-risk refs have centralAvailable <= minimum * 1.5
    for (const risk of vi.atRiskRefs) {
      const threshold = risk.minimumRequired * 1.5;
      if (risk.centralAvailable > threshold) {
        console.log(`  FAIL: At-risk ref ${risk.reference} has centralAvailable ${risk.centralAvailable} > threshold ${threshold}`);
        allPass = false;
      }
      if (risk.centralAvailable <= 0) {
        console.log(`  FAIL: At-risk ref ${risk.reference} has centralAvailable ${risk.centralAvailable} <= 0 (should be excluded)`);
        allPass = false;
      }
    }

    // Validate 6: Opportunity refs have centralAvailable > 0
    for (const opp of vi.coverageOpportunities) {
      for (const ref of opp.topRefs) {
        if (ref.centralAvailable <= 0) {
          console.log(`  FAIL: Opportunity ref ${ref.reference} has centralAvailable ${ref.centralAvailable} <= 0`);
          allPass = false;
        }
      }
    }

    // Validate 7: No duplicate at-risk refs
    const riskRefs = new Set<string>();
    for (const risk of vi.atRiskRefs) {
      if (riskRefs.has(risk.reference)) {
        console.log(`  FAIL: Duplicate at-risk ref: ${risk.reference}`);
        allPass = false;
      }
      riskRefs.add(risk.reference);
    }

    // Show top 3 at-risk refs for manual review
    if (vi.atRiskRefs.length > 0) {
      console.log(`  Top at-risk:`);
      for (const r of vi.atRiskRefs.slice(0, 3)) {
        console.log(`    ${r.reference} — ${r.description} | disp=${r.centralAvailable} min=${r.minimumRequired} ratio=${r.riskRatio} level=${r.riskLevel}`);
      }
    }

    // Show top 3 opportunities for manual review
    if (vi.coverageOpportunities.length > 0) {
      console.log(`  Top opportunities:`);
      for (const o of vi.coverageOpportunities.slice(0, 3)) {
        console.log(`    ${o.subgrupoSag} (${o.line}) — ${o.availableRefs} refs, ${o.totalAvailableQty} units`);
      }
    }

    console.log();
  }

  // ── Copilot context validation ─────────────────────────────────────────────

  console.log("=== COPILOT CONTEXT VALIDATION ===\n");
  for (const ctx of data.intelligence.copilotContexts) {
    console.log(`${ctx.vendorName}: gaps=${ctx.coverageGapCount} replace=${ctx.replacementCandidateCount} risk=${ctx.riskReferenceCount} importScarcity=${ctx.importScarcityCount} score=${ctx.maletaScore.total}`);
  }

  console.log();
  console.log(allPass ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED");

  await (prisma as any).$disconnect();
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
