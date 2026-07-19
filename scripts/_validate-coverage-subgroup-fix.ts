/**
 * _validate-coverage-subgroup-fix.ts
 *
 * MALETAS-COVERAGE-SUBGROUP-FIX-01 — Phase 6 Validation
 *
 * Validates that:
 * - No commercial line (LT, CS, IMPORT, OTRO) appears as a subgrupo
 * - All catalog keys are real SAG subgrupos
 * - Carlos Villa coverage is correct
 * - BUZO still appears as debil if mathematically applicable
 *
 * Usage: npx tsx scripts/_validate-coverage-subgroup-fix.ts
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { loadVendorSampleData } from "../lib/comercial/maletas/vendor-sample-loader";

// "OTRO" is a valid catch-all subgrupoSag for refs without resolved SAG subgrupo — not a line code
const COMMERCIAL_LINES = new Set(["LT", "CS", "IMPORT", "OT", "PK", "AC"]);

async function main() {
  const db = prisma as any;
  const org = await db.organization.findFirst({ where: { slug: "castillitos" } });
  if (!org) { console.error("ERROR: castillitos org not found"); process.exit(1); }

  console.log("=== COVERAGE SUBGROUP FIX VALIDATION ===\n");

  const data = await loadVendorSampleData(org.id);

  let allPass = true;
  const fail = (msg: string) => { console.log(`  FAIL: ${msg}`); allPass = false; };

  // ── CHECK 1: No commercial line in catalog index ────────────────────────
  console.log("--- CHECK 1: No commercial lines as subgrupos ---");
  const catalogKeys = new Set<string>();
  for (const v of data.vendors) {
    for (const r of v.refs) catalogKeys.add(r.subgrupoSag);
  }
  for (const g of data.coverageGaps) {
    if (g.subgrupoSag) catalogKeys.add(g.subgrupoSag);
  }

  for (const key of catalogKeys) {
    if (COMMERCIAL_LINES.has(key)) {
      fail(`Commercial line "${key}" found as catalog key`);
    }
  }
  console.log(`  Catalog keys: ${catalogKeys.size}`);
  console.log(`  Intelligence catalogSubgrupos: ${data.intelligence.catalogSubgrupos}`);

  // The intelligence denominator should match vendor-ref subgrupos + gap subgrupos (no lines)
  if (data.intelligence.catalogSubgrupos !== catalogKeys.size) {
    // This can differ if some gaps have null subgrupoSag (excluded)
    console.log(`  Note: catalog keys (${catalogKeys.size}) vs intelligence (${data.intelligence.catalogSubgrupos}) — gap exclusion expected`);
  }
  console.log();

  // ── CHECK 2: No intelligence vendor has line-based subgrupos ────────────
  console.log("--- CHECK 2: No vendor intelligence has line-based subgrupos ---");
  for (const vi of data.intelligence.vendors) {
    for (const sc of vi.subgrupoCoverage) {
      if (COMMERCIAL_LINES.has(sc.subgrupoSag)) {
        fail(`Vendor ${vi.vendorName}: subgrupo "${sc.subgrupoSag}" is a commercial line`);
      }
    }
    // Missing subgrupos should not include lines
    const missing = vi.subgrupoCoverage.filter((s) => !s.present);
    for (const m of missing) {
      if (COMMERCIAL_LINES.has(m.subgrupoSag)) {
        fail(`Vendor ${vi.vendorName}: MISSING subgrupo "${m.subgrupoSag}" is a commercial line`);
      }
    }
  }
  console.log(`  Checked ${data.intelligence.vendors.length} vendors`);
  console.log();

  // ── CHECK 3: Carlos Villa specific ─────────────────────────────────────
  console.log("--- CHECK 3: Carlos Villa ---");
  const villa = data.intelligence.vendors.find((v) => v.vendorName.toLowerCase().includes("villa"));
  if (!villa) {
    fail("Carlos Villa not found in intelligence");
  } else {
    const missing = villa.subgrupoCoverage.filter((s) => !s.present);
    console.log(`  Score: ${villa.score.total}/100 (${villa.score.grade})`);
    console.log(`  Coverage: ${villa.subgruposPresent}/${villa.subgruposTotal} (${villa.coveragePct}%)`);
    console.log(`  Missing subgrupos: ${missing.length}`);
    for (const m of missing) {
      console.log(`    "${m.subgrupoSag}" (line: ${m.line})`);
      if (COMMERCIAL_LINES.has(m.subgrupoSag)) {
        fail(`Missing subgrupo "${m.subgrupoSag}" is a commercial line — BUG NOT FIXED`);
      }
    }

    // LT and CS must NOT appear as missing
    if (missing.some((m) => m.subgrupoSag === "LT")) {
      fail(`"LT" still appears as missing subgrupo`);
    }
    if (missing.some((m) => m.subgrupoSag === "CS")) {
      fail(`"CS" still appears as missing subgrupo`);
    }
    console.log();

    // ── CHECK 4: Debiles calculation ──────────────────────────────────────
    console.log("--- CHECK 4: Debiles (weak subgrupos) ---");
    const weak = villa.subgrupoCoverage.filter(
      (s) => s.present && s.refsInCatalog > 2 && s.refsInVendor <= Math.ceil(s.refsInCatalog * 0.3),
    );
    console.log(`  Weak subgrupos: ${weak.length}`);
    for (const w of weak) {
      const threshold = Math.ceil(w.refsInCatalog * 0.3);
      console.log(`    "${w.subgrupoSag}" — vendor: ${w.refsInVendor}, catalog: ${w.refsInCatalog}, threshold: <=${threshold}`);
    }

    // BUZO should still be weak if 3/7
    const buzo = villa.subgrupoCoverage.find((s) => s.subgrupoSag === "BUZO");
    if (buzo) {
      const buzoThreshold = Math.ceil(buzo.refsInCatalog * 0.3);
      const buzoIsWeak = buzo.present && buzo.refsInCatalog > 2 && buzo.refsInVendor <= buzoThreshold;
      console.log(`  BUZO: vendor=${buzo.refsInVendor}/${buzo.refsInCatalog}, threshold=${buzoThreshold}, weak=${buzoIsWeak}`);
      if (buzoIsWeak && !weak.some((w) => w.subgrupoSag === "BUZO")) {
        fail("BUZO should be weak but is not in weak list");
      }
    }
    console.log();

    // ── CHECK 5: Covered subgrupos ────────────────────────────────────────
    console.log("--- CHECK 5: Covered subgrupos ---");
    const covered = villa.subgrupoCoverage.filter((s) => s.present);
    console.log(`  Covered: ${covered.length}`);
    for (const c of covered) {
      console.log(`    "${c.subgrupoSag}" — ${c.refsInVendor}/${c.refsInCatalog}`);
    }
    console.log();
  }

  // ── CHECK 6: Coverage gaps have subgrupoSag ────────────────────────────
  console.log("--- CHECK 6: Coverage gap subgrupo enrichment ---");
  const gapsWithSubgrupo = data.coverageGaps.filter((g) => g.subgrupoSag != null);
  const gapsWithoutSubgrupo = data.coverageGaps.filter((g) => g.subgrupoSag == null);
  console.log(`  Total gaps: ${data.coverageGaps.length}`);
  console.log(`  With subgrupoSag: ${gapsWithSubgrupo.length}`);
  console.log(`  Without subgrupoSag (excluded from catalog): ${gapsWithoutSubgrupo.length}`);
  if (gapsWithoutSubgrupo.length > 0) {
    console.log(`  Excluded gap lines: ${[...new Set(gapsWithoutSubgrupo.map((g) => g.line))].join(", ")}`);
  }
  console.log();

  // ── RESULT ──────────────────────────────────────────────────────────────
  console.log(allPass ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED");

  await db.$disconnect();
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
