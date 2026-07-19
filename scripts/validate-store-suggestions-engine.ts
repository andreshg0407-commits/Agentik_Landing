/**
 * scripts/validate-store-suggestions-engine.ts
 *
 * FASE 14 — Validation for TIENDAS-REPLENISHMENT-SUGGESTIONS-01.
 * Tests the store suggestions engine — pure logic, no DB.
 *
 * Usage: npx tsx scripts/validate-store-suggestions-engine.ts
 */

import {
  buildStoreReplenishmentSuggestions,
  rankReplacementCandidates,
  groupSuggestionsByStore,
  groupSuggestionsByAction,
  getTopSuggestions,
  filterSuggestions,
} from "../lib/comercial/tiendas/store-suggestions-engine";

import type { StoreNeed, MainWarehouseStock } from "../lib/comercial/tiendas/store-needs-types";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { pass++; console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`); }
  else    { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`); }
}

// ── Test data ─────────────────────────────────────────────────────────────────

function makeNeed(overrides: Partial<StoreNeed>): StoreNeed {
  return {
    storeId: "bodega-sandiego", storeName: "BODEGA SANDIEGO",
    warehouseId: "11", warehouseName: "BODEGA SANDIEGO",
    productId: "p1", referenceCode: "CJ-57673", productName: "Camiseta Roja LK",
    line: "Latin Kids", subgroup: "Camisetas", productClass: "textile",
    size: "10-12", color: "ROJO",
    currentStoreQty: 0, minQty: 2, idealQty: 2, maxQty: 3,
    neededQty: 2, mainWarehouseQty: 8,
    status: "out", priorityScore: 130, policySource: "line_subgroup",
    ...overrides,
  };
}

const mainStock: MainWarehouseStock[] = [
  { referenceCode: "CJ-57673", size: "10-12", color: "ROJO",   availableQty: 8 },
  { referenceCode: "CJ-57673", size: "8",     color: "AZUL",   availableQty: 3 },
  { referenceCode: "CJ-57673", size: "6",     color: "NEGRO",  availableQty: 0 },
  { referenceCode: "CJ-99999", size: "10-12", color: "VERDE",  availableQty: 5 },
  { referenceCode: "CUNA-001", size: "",       color: "",       availableQty: 2 },
];

function main() {
  console.log("\n=== TIENDAS-REPLENISHMENT-SUGGESTIONS-01 VALIDATION ===\n");

  // ── 1. transfer_full: OUT with enough main stock ────────────────────────────
  console.log("--- 1. transfer_full ---");
  const needs1 = [makeNeed({ status: "out", neededQty: 2, mainWarehouseQty: 8 })];
  const sug1 = buildStoreReplenishmentSuggestions(needs1, mainStock);
  check("OUT + enough stock → transfer_full", sug1[0]?.suggestedAction === "transfer_full",
    `got ${sug1[0]?.suggestedAction}`);
  check("transferQty = neededQty (2)", sug1[0]?.transferQty === 2, `got ${sug1[0]?.transferQty}`);

  // ── 2. transfer_partial: OUT with partial main stock ────────────────────────
  console.log("\n--- 2. transfer_partial ---");
  const needs2 = [makeNeed({ status: "out", neededQty: 5, mainWarehouseQty: 3 })];
  const sug2 = buildStoreReplenishmentSuggestions(needs2, mainStock);
  check("OUT + partial stock → transfer_partial", sug2[0]?.suggestedAction === "transfer_partial",
    `got ${sug2[0]?.suggestedAction}`);
  check("transferQty = mainWarehouseQty (3)", sug2[0]?.transferQty === 3, `got ${sug2[0]?.transferQty}`);
  check("Warning about deficit", sug2[0]?.warnings.length > 0);

  // ── 3. find_replacement: OUT with no main stock ────────────────────────────
  console.log("\n--- 3. find_replacement ---");
  const needs3 = [makeNeed({ status: "out", neededQty: 2, mainWarehouseQty: 0,
    size: "6", color: "NEGRO" })];
  const sug3 = buildStoreReplenishmentSuggestions(needs3, mainStock);
  check("OUT + no stock → find_replacement", sug3[0]?.suggestedAction === "find_replacement",
    `got ${sug3[0]?.suggestedAction}`);
  check("transferQty = 0", sug3[0]?.transferQty === 0);

  // ── 4. no_action: HEALTHY ──────────────────────────────────────────────────
  console.log("\n--- 4. no_action ---");
  const needs4 = [makeNeed({ status: "healthy", neededQty: 0, currentStoreQty: 2, priorityScore: 0 })];
  const sug4 = buildStoreReplenishmentSuggestions(needs4, mainStock);
  check("HEALTHY → no_action", sug4[0]?.suggestedAction === "no_action", `got ${sug4[0]?.suggestedAction}`);

  // ── 5. overstock_review: OVERSTOCK ─────────────────────────────────────────
  console.log("\n--- 5. overstock_review ---");
  const needs5 = [makeNeed({ status: "overstock", neededQty: 0, currentStoreQty: 8, maxQty: 3, priorityScore: -10 })];
  const sug5 = buildStoreReplenishmentSuggestions(needs5, mainStock);
  check("OVERSTOCK → overstock_review", sug5[0]?.suggestedAction === "overstock_review",
    `got ${sug5[0]?.suggestedAction}`);
  check("excessQty = 5", sug5[0]?.excessQty === 5, `got ${sug5[0]?.excessQty}`);

  // ── 6. Confidence: HIGH for high priority transfer_full ─────────────────────
  console.log("\n--- 6. Confidence levels ---");
  check("transfer_full priority>=100 → high confidence",
    sug1[0]?.confidence === "high", `got ${sug1[0]?.confidence}`);
  const lowPriNeed = makeNeed({ status: "low", neededQty: 1, mainWarehouseQty: 8, priorityScore: 70 });
  const sugLow = buildStoreReplenishmentSuggestions([lowPriNeed], mainStock);
  check("transfer_full priority<100 → medium confidence",
    sugLow[0]?.confidence === "medium", `got ${sugLow[0]?.confidence}`);

  // ── 7. Replacement ranking ────────────────────────────────────────────────
  console.log("\n--- 7. Replacement ranking ---");
  const replNeed = makeNeed({ referenceCode: "CJ-57673", size: "6", color: "NEGRO", mainWarehouseQty: 0 });
  const candidates = rankReplacementCandidates(replNeed, mainStock);
  check("Candidates found", candidates.length > 0, `got ${candidates.length}`);
  // Same-reference candidates should score highest
  const sameRefCandidates = candidates.filter(c => c.referenceCode === "CJ-57673");
  check("Same-reference candidates ranked first",
    sameRefCandidates.length > 0 && candidates[0].referenceCode === "CJ-57673");

  // ── 8. Group by store ─────────────────────────────────────────────────────
  console.log("\n--- 8. Group by store ---");
  const multiNeeds = [
    makeNeed({ storeId: "s1", storeName: "Tienda A", status: "out", neededQty: 2, mainWarehouseQty: 8 }),
    makeNeed({ storeId: "s2", storeName: "Tienda B", status: "out", neededQty: 2, mainWarehouseQty: 0 }),
  ];
  const multiSugs = buildStoreReplenishmentSuggestions(multiNeeds, mainStock);
  const storeSummaries = groupSuggestionsByStore(multiSugs);
  check("Group by store: 2 stores", storeSummaries.length === 2, `got ${storeSummaries.length}`);

  // ── 9. Group by action ────────────────────────────────────────────────────
  console.log("\n--- 9. Group by action ---");
  const actionSummaries = groupSuggestionsByAction(multiSugs);
  check("Group by action: at least 1", actionSummaries.length >= 1, `got ${actionSummaries.length}`);

  // ── 10. Top suggestions ───────────────────────────────────────────────────
  console.log("\n--- 10. Top suggestions ---");
  const allNeeds = [
    makeNeed({ status: "out", neededQty: 2, mainWarehouseQty: 8, priorityScore: 130 }),
    makeNeed({ status: "healthy", neededQty: 0, priorityScore: 0, size: "8", color: "AZUL" }),
  ];
  const allSugs = buildStoreReplenishmentSuggestions(allNeeds, mainStock);
  const topSugs = getTopSuggestions(allSugs, 5);
  check("Top suggestions excludes no_action", topSugs.every(s => s.suggestedAction !== "no_action"));

  // ── 11. Filter suggestions ───────────────────────────────────────────────
  console.log("\n--- 11. Filter suggestions ---");
  const filteredByAction = filterSuggestions(allSugs, { action: "transfer_full" });
  check("Filter by action", filteredByAction.every(s => s.suggestedAction === "transfer_full"));

  // ── 12. Operational text ──────────────────────────────────────────────────
  console.log("\n--- 12. Operational text ---");
  check("transfer_full has reason text", sug1[0]?.reason.length > 0);
  check("Reason contains product name", sug1[0]?.reason.includes("Camiseta"));

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(60)}`);
  console.log(`RESULT: ${pass} PASS / ${fail} FAIL (total ${pass + fail})`);
  console.log(`${"=".repeat(60)}`);

  process.exit(fail > 0 ? 1 : 0);
}

main();
