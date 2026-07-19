/**
 * scripts/validate-store-needs-engine.ts
 *
 * FASE 10 — Validation for TIENDAS-INVENTORY-02.
 * Tests the store needs engine — pure logic, no DB.
 *
 * Usage: npx tsx scripts/validate-store-needs-engine.ts
 */

import {
  calculateStoreNeeds,
  groupNeedsByStore,
  groupNeedsByLine,
  groupNeedsBySubgroup,
  filterNeeds,
} from "../lib/comercial/tiendas/store-needs-engine";

import type {
  InventoryItem,
  MainWarehouseStock,
  StoreNeedsInput,
} from "../lib/comercial/tiendas/store-needs-types";

import type { StorePolicyRule } from "../lib/comercial/tiendas/store-policy-types";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { pass++; console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`); }
  else    { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`); }
}

// ── Test data ─────────────────────────────────────────────────────────────────

const STORE: StoreNeedsInput = {
  storeId: "bodega-sandiego", storeName: "BODEGA SANDIEGO",
  warehouseId: "11", warehouseName: "BODEGA SANDIEGO",
};

const STORE_B: StoreNeedsInput = {
  storeId: "bodega-centro", storeName: "BODEGA CENTRO",
  warehouseId: "31", warehouseName: "BODEGA CENTRO",
};

const rules: StorePolicyRule[] = [
  // Latin Kids / Camisetas: min 2, ideal 2, max 3
  {
    id: "r1", storeId: "bodega-sandiego", scope: "line_subgroup", productClass: "textile",
    line: "Latin Kids", subgroup: "Camisetas",
    minQty: 2, idealQty: 2, maxQty: 3,
    allowReplacement: false, allowProductionSignal: false, allowMainWarehouseTransfer: true,
    priority: 1, active: true,
  },
  // Bulky large
  {
    id: "r2", storeId: "bodega-sandiego", scope: "class_size", productClass: "bulky",
    sizeClass: "large",
    minQty: 1, idealQty: 1, maxQty: 1,
    allowReplacement: true, allowProductionSignal: false, allowMainWarehouseTransfer: true,
    priority: 2, active: true,
  },
];

const mainStock: MainWarehouseStock[] = [
  { referenceCode: "CJ-57673", size: "10-12", color: "ROJO",   availableQty: 8 },
  { referenceCode: "CJ-57673", size: "8",     color: "AZUL",   availableQty: 3 },
  { referenceCode: "CJ-57673", size: "6",     color: "NEGRO",  availableQty: 0 },
  { referenceCode: "CUNA-001", size: "",       color: "",       availableQty: 2 },
];

function main() {
  console.log("\n=== TIENDAS-INVENTORY-02 VALIDATION ===\n");

  // ── 1. Textile OUT ────────────────────────────────────────────────────────
  console.log("--- 1. Textile: OUT (qty=0) ---");
  const items1: InventoryItem[] = [{
    productId: "p1", referenceCode: "CJ-57673", productName: "Camiseta Roja LK",
    line: "Latin Kids", subgroup: "Camisetas", category: "Ropa", productClass: "textile",
    size: "10-12", color: "ROJO", currentQty: 0,
  }];
  const needs1 = calculateStoreNeeds(STORE, items1, mainStock, rules);
  check("Textile qty=0 → status=out", needs1[0]?.status === "out");
  check("Textile qty=0 → neededQty=2", needs1[0]?.neededQty === 2, `got ${needs1[0]?.neededQty}`);

  // ── 2. Textile LOW ────────────────────────────────────────────────────────
  console.log("\n--- 2. Textile: LOW (qty=1, min=2) ---");
  const items2: InventoryItem[] = [{
    ...items1[0], currentQty: 1,
  }];
  const needs2 = calculateStoreNeeds(STORE, items2, mainStock, rules);
  check("Textile qty=1 → status=low", needs2[0]?.status === "low");
  check("Textile qty=1 → neededQty=1", needs2[0]?.neededQty === 1, `got ${needs2[0]?.neededQty}`);

  // ── 3. Textile HEALTHY ────────────────────────────────────────────────────
  console.log("\n--- 3. Textile: HEALTHY (qty=2) ---");
  const items3: InventoryItem[] = [{
    ...items1[0], currentQty: 2,
  }];
  const needs3 = calculateStoreNeeds(STORE, items3, mainStock, rules);
  check("Textile qty=2 → status=healthy", needs3[0]?.status === "healthy");

  // ── 4. Textile OVERSTOCK ──────────────────────────────────────────────────
  console.log("\n--- 4. Textile: OVERSTOCK (qty=5, max=3) ---");
  const items4: InventoryItem[] = [{
    ...items1[0], currentQty: 5,
  }];
  const needs4 = calculateStoreNeeds(STORE, items4, mainStock, rules);
  check("Textile qty=5 → status=overstock", needs4[0]?.status === "overstock");

  // ── 5. Bulky uses reference, not talla/color ──────────────────────────────
  console.log("\n--- 5. Bulky: uses reference (no talla/color) ---");
  const bulkyItems: InventoryItem[] = [{
    productId: "p-cuna", referenceCode: "CUNA-001", productName: "Cuna Grande",
    line: "", subgroup: "Cunas", category: "Muebles", productClass: "bulky", sizeClass: "large",
    size: "", color: "", currentQty: 0,
  }];
  const bulkyNeeds = calculateStoreNeeds(STORE, bulkyItems, mainStock, rules);
  check("Bulky uses ref (no talla/color)", bulkyNeeds[0]?.status === "out");
  check("Bulky mainWarehouseQty resolved by ref", bulkyNeeds[0]?.mainWarehouseQty === 2,
    `got ${bulkyNeeds[0]?.mainWarehouseQty}`);

  // ── 6. Policy rule wins over default ──────────────────────────────────────
  console.log("\n--- 6. Policy rule wins over default ---");
  check("Policy source = line_subgroup", needs1[0]?.policySource === "line_subgroup",
    `got ${needs1[0]?.policySource}`);
  check("Bulky policy source = class_size", bulkyNeeds[0]?.policySource === "class_size",
    `got ${bulkyNeeds[0]?.policySource}`);

  // ── 7. Line/subgroup policy works ─────────────────────────────────────────
  console.log("\n--- 7. Line/subgroup policy ---");
  check("min=2 from Latin Kids/Camisetas rule", needs1[0]?.minQty === 2);
  check("ideal=2 from Latin Kids/Camisetas rule", needs1[0]?.idealQty === 2);
  check("max=3 from Latin Kids/Camisetas rule", needs1[0]?.maxQty === 3);

  // ── 8. Priority: OUT > LOW ────────────────────────────────────────────────
  console.log("\n--- 8. Priority: OUT > LOW ---");
  const mixItems: InventoryItem[] = [
    { ...items1[0], currentQty: 1, size: "8", color: "AZUL" },  // LOW
    { ...items1[0], currentQty: 0, size: "10-12", color: "ROJO" }, // OUT
  ];
  const mixNeeds = calculateStoreNeeds(STORE, mixItems, mainStock, rules);
  check("OUT sorted before LOW", mixNeeds[0]?.status === "out" && mixNeeds[1]?.status === "low");
  check("OUT priority > LOW priority", mixNeeds[0]?.priorityScore > mixNeeds[1]?.priorityScore,
    `${mixNeeds[0]?.priorityScore} > ${mixNeeds[1]?.priorityScore}`);

  // ── 9. Main warehouse affects score ───────────────────────────────────────
  console.log("\n--- 9. Main warehouse affects score ---");
  // OUT with main stock (CJ-57673 ROJO 10-12 has 8 in main)
  const withStock = mixNeeds.find(n => n.color === "ROJO");
  // OUT with no main stock (CJ-57673 NEGRO 6 has 0 in main)
  const noStockItems: InventoryItem[] = [{
    ...items1[0], size: "6", color: "NEGRO", currentQty: 0,
  }];
  const noStockNeeds = calculateStoreNeeds(STORE, noStockItems, mainStock, rules);
  const withoutStock = noStockNeeds[0];

  check("Main stock = 8 for ROJO", withStock?.mainWarehouseQty === 8, `got ${withStock?.mainWarehouseQty}`);
  check("Main stock = 0 for NEGRO", withoutStock?.mainWarehouseQty === 0, `got ${withoutStock?.mainWarehouseQty}`);
  check("Score higher with main stock than without",
    (withStock?.priorityScore ?? 0) > (withoutStock?.priorityScore ?? 0),
    `${withStock?.priorityScore} > ${withoutStock?.priorityScore}`);

  // ── 10. Group by store ────────────────────────────────────────────────────
  console.log("\n--- 10. Group by store ---");
  const multiStoreItems: InventoryItem[] = [
    { ...items1[0], currentQty: 0 },
    { ...items1[0], currentQty: 2, size: "8", color: "AZUL" },
  ];
  const storeANeeds = calculateStoreNeeds(STORE, multiStoreItems, mainStock, rules);
  const storeBItems: InventoryItem[] = [
    { ...items1[0], currentQty: 0 },
  ];
  const storeBNeeds = calculateStoreNeeds(STORE_B, storeBItems, mainStock, []);
  const allNeeds = [...storeANeeds, ...storeBNeeds];
  const storeSummaries = groupNeedsByStore(allNeeds);
  check("Group by store: 2 stores", storeSummaries.length === 2, `got ${storeSummaries.length}`);
  const sdSummary = storeSummaries.find(s => s.storeId === "bodega-sandiego");
  check("San Diego: 1 out, 1 healthy", sdSummary?.outCount === 1 && sdSummary?.healthyCount === 1,
    `out=${sdSummary?.outCount}, healthy=${sdSummary?.healthyCount}`);

  // ── 11. Group by line ─────────────────────────────────────────────────────
  console.log("\n--- 11. Group by line ---");
  const lineSummaries = groupNeedsByLine(allNeeds);
  check("Group by line: at least 1 line", lineSummaries.length >= 1);
  const lkLine = lineSummaries.find(l => l.line === "Latin Kids");
  check("Latin Kids line has needs", lkLine !== undefined && (lkLine.outCount + lkLine.lowCount + lkLine.healthyCount) > 0);

  // ── 12. Group by subgroup ─────────────────────────────────────────────────
  console.log("\n--- 12. Group by subgroup ---");
  const sgSummaries = groupNeedsBySubgroup(allNeeds);
  check("Group by subgroup: at least 1", sgSummaries.length >= 1);

  // ── 13. Filter needs ──────────────────────────────────────────────────────
  console.log("\n--- 13. Filter needs ---");
  const outOnly = filterNeeds(allNeeds, { status: "out" });
  check("Filter status=out returns only out", outOnly.every(n => n.status === "out"));
  const storeFilter = filterNeeds(allNeeds, { storeId: "bodega-sandiego" });
  check("Filter by store returns correct store", storeFilter.every(n => n.storeId === "bodega-sandiego"));

  // ── 14. Default thresholds (no policy rules) ──────────────────────────────
  console.log("\n--- 14. Default thresholds ---");
  const defNeeds = calculateStoreNeeds(STORE_B, storeBItems, mainStock, []);
  check("Global default policy source", defNeeds[0]?.policySource === "global_default",
    `got ${defNeeds[0]?.policySource}`);
  check("Default textile: min=1, ideal=1, max=2",
    defNeeds[0]?.minQty === 1 && defNeeds[0]?.idealQty === 1 && defNeeds[0]?.maxQty === 2);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(60)}`);
  console.log(`RESULT: ${pass} PASS / ${fail} FAIL (total ${pass + fail})`);
  console.log(`${"=".repeat(60)}`);

  process.exit(fail > 0 ? 1 : 0);
}

main();
