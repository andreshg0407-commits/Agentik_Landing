/**
 * scripts/validate-store-replacement-engine.ts
 *
 * FASE 11 — Validation for TIENDAS-REPLACEMENT-INTELLIGENCE-01.
 * Tests the replacement intelligence engine — pure logic, no DB.
 *
 * Usage: npx tsx scripts/validate-store-replacement-engine.ts
 */

import { findBestReplacementCandidates } from "../lib/comercial/tiendas/store-replacement-engine";
import type { CandidateProduct, ReplacementSourceContext } from "../lib/comercial/tiendas/store-replacement-types";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { pass++; console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`); }
  else    { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`); }
}

// ── Test data ─────────────────────────────────────────────────────────────────

const source: ReplacementSourceContext = {
  referenceCode: "CJ-6774",
  productName:   "Camiseta Roja Latin Kids",
  line:          "Latin Kids",
  subgroup:      "Camisetas",
  category:      "Camisetas",
  productClass:  "textile",
  price:         100000,
};

const candidates: CandidateProduct[] = [
  // Same subgroup + same line + similar price + high stock + high sales → BEST
  {
    referenceCode: "CJ-8891", productName: "Camiseta Azul Latin Kids",
    line: "Latin Kids", subgroup: "Camisetas", category: "Camisetas",
    productClass: "textile", price: 106000,
    mainWarehouseQty: 42, recentSalesQty: 35,
  },
  // Same subgroup + same line + price OK + medium stock + medium sales
  {
    referenceCode: "CJ-8844", productName: "Camiseta Verde Latin Kids",
    line: "Latin Kids", subgroup: "Camisetas", category: "Camisetas",
    productClass: "textile", price: 115000,
    mainWarehouseQty: 12, recentSalesQty: 10,
  },
  // Same line + different subgroup + similar price + high stock
  {
    referenceCode: "PJ-2200", productName: "Pantalon Latin Kids",
    line: "Latin Kids", subgroup: "Pantalones", category: "Pantalones",
    productClass: "textile", price: 98000,
    mainWarehouseQty: 30, recentSalesQty: 25,
  },
  // Same category + different line + price very different
  {
    referenceCode: "CJ-9999", productName: "Camiseta Premium Import",
    line: "Import Premium", subgroup: "Camisetas", category: "Camisetas",
    productClass: "textile", price: 250000,
    mainWarehouseQty: 5, recentSalesQty: 2,
  },
  // Different category + different line (should rank low or not appear)
  {
    referenceCode: "CUNA-500", productName: "Cuna Grande",
    line: "Muebles", subgroup: "Cunas", category: "Muebles",
    productClass: "bulky", price: 800000,
    mainWarehouseQty: 10, recentSalesQty: 1,
  },
  // Same subgroup + no stock (should not appear)
  {
    referenceCode: "CJ-0000", productName: "Camiseta Agotada",
    line: "Latin Kids", subgroup: "Camisetas", category: "Camisetas",
    productClass: "textile", price: 100000,
    mainWarehouseQty: 0, recentSalesQty: 50,
  },
  // Same reference as source (should be skipped)
  {
    referenceCode: "CJ-6774", productName: "Camiseta Roja Latin Kids",
    line: "Latin Kids", subgroup: "Camisetas", category: "Camisetas",
    productClass: "textile", price: 100000,
    mainWarehouseQty: 5, recentSalesQty: 20,
  },
  // Same subgroup + low stock + low sales (should rank lower)
  {
    referenceCode: "CJ-7788", productName: "Camiseta Blanca LK",
    line: "Latin Kids", subgroup: "Camisetas", category: "Camisetas",
    productClass: "textile", price: 95000,
    mainWarehouseQty: 2, recentSalesQty: 1,
  },
];

function main() {
  console.log("\n=== TIENDAS-REPLACEMENT-INTELLIGENCE-01 VALIDATION ===\n");

  const results = findBestReplacementCandidates(source, candidates, 5);

  // ── 1. Same subgroup wins ─────────────────────────────────────────────────
  console.log("--- 1. Same subgroup wins ---");
  check("Top candidate is same subgroup (Camisetas)",
    results[0]?.subgroup.toUpperCase() === "CAMISETAS",
    `got ${results[0]?.subgroup}`);

  // ── 2. Same line improves score ──────────────────────────────────────────
  console.log("\n--- 2. Same line improves score ---");
  const sameLineCandidates = results.filter(r => r.line.toUpperCase() === "LATIN KIDS");
  check("Same line candidates rank high", sameLineCandidates.length >= 2,
    `got ${sameLineCandidates.length}`);
  // CJ-8891 (same subgroup+line+price) should beat PJ-2200 (same line, different subgroup)
  const cj8891 = results.find(r => r.candidateReferenceCode === "CJ-8891");
  const pj2200 = results.find(r => r.candidateReferenceCode === "PJ-2200");
  check("Same subgroup+line ranks above same line only",
    (cj8891?.score ?? 0) > (pj2200?.score ?? 0),
    `${cj8891?.score} > ${pj2200?.score}`);

  // ── 3. Similar price improves score ──────────────────────────────────────
  console.log("\n--- 3. Similar price improves score ---");
  check("CJ-8891 has price delta <= 10%",
    cj8891?.priceDeltaPercent != null && cj8891.priceDeltaPercent <= 10,
    `got ${cj8891?.priceDeltaPercent}%`);
  check("CJ-8891 reasons include price",
    cj8891?.reasons.some(r => r.toLowerCase().includes("precio")) ?? false);

  // ── 4. Very different price penalizes ────────────────────────────────────
  console.log("\n--- 4. Very different price penalizes ---");
  const cj9999 = results.find(r => r.candidateReferenceCode === "CJ-9999");
  check("CJ-9999 (150% delta) scores lower than CJ-8891",
    (cj9999?.score ?? 0) < (cj8891?.score ?? 0),
    `${cj9999?.score} < ${cj8891?.score}`);

  // ── 5. High stock improves score ─────────────────────────────────────────
  console.log("\n--- 5. High stock improves score ---");
  check("CJ-8891 (42 uds) reasons include stock",
    cj8891?.reasons.some(r => r.toLowerCase().includes("stock")) ?? false);

  // ── 6. Low stock penalizes ───────────────────────────────────────────────
  console.log("\n--- 6. Low stock reduces ranking ---");
  const cj7788 = results.find(r => r.candidateReferenceCode === "CJ-7788");
  check("CJ-7788 (2 uds) ranks below CJ-8891 (42 uds)",
    (cj7788?.score ?? 0) < (cj8891?.score ?? 0),
    `${cj7788?.score} < ${cj8891?.score}`);

  // ── 7. Sales velocity improves score ─────────────────────────────────────
  console.log("\n--- 7. Sales velocity ---");
  check("CJ-8891 (35 ventas) has sales reason",
    cj8891?.reasons.some(r => r.toLowerCase().includes("rotacion")) ?? false);

  // ── 8. Confidence HIGH ───────────────────────────────────────────────────
  console.log("\n--- 8. Confidence HIGH ---");
  check("CJ-8891 confidence = high",
    cj8891?.confidence === "high", `got ${cj8891?.confidence}`);

  // ── 9. Confidence MEDIUM ─────────────────────────────────────────────────
  console.log("\n--- 9. Confidence MEDIUM ---");
  // CJ-9999: same subgroup but very different price
  check("CJ-9999 confidence = low (distant price, low stock)",
    cj9999?.confidence === "low", `got ${cj9999?.confidence}`);

  // ── 10. Confidence LOW ───────────────────────────────────────────────────
  console.log("\n--- 10. Confidence LOW ---");
  // CUNA-500: different category entirely
  const cuna = results.find(r => r.candidateReferenceCode === "CUNA-500");
  // Should not appear at all (no subgroup/line/category match)
  check("CUNA-500 (different category) excluded",
    cuna === undefined, `${cuna ? "found" : "excluded"}`);

  // ── 11. Ranking returns top correctly ─────────────────────────────────────
  console.log("\n--- 11. Ranking order ---");
  check("Results are sorted by score descending",
    results.every((r, i) => i === 0 || r.score <= results[i - 1].score));
  check("Top result is CJ-8891", results[0]?.candidateReferenceCode === "CJ-8891",
    `got ${results[0]?.candidateReferenceCode}`);

  // ── 12. Zero-stock candidates excluded ───────────────────────────────────
  console.log("\n--- 12. Zero-stock exclusion ---");
  const zeroStock = results.find(r => r.candidateReferenceCode === "CJ-0000");
  check("Zero-stock candidate excluded", zeroStock === undefined);
  const selfRef = results.find(r => r.candidateReferenceCode === "CJ-6774");
  check("Same reference as source excluded", selfRef === undefined);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(60)}`);
  console.log(`RESULT: ${pass} PASS / ${fail} FAIL (total ${pass + fail})`);
  console.log(`${"=".repeat(60)}`);

  // Print full ranking for inspection
  console.log("\n--- Full ranking ---");
  for (const r of results) {
    console.log(`  ${r.score.toString().padStart(3)} | ${r.candidateReferenceCode.padEnd(10)} | ${r.confidence.padEnd(6)} | ${r.reasons.join("; ")}`);
  }

  process.exit(fail > 0 ? 1 : 0);
}

main();
