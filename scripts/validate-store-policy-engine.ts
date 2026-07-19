/**
 * scripts/validate-store-policy-engine.ts
 *
 * Validation for TIENDAS-POLICY-SCOPE-CORRECTION-01.
 * Tests the corrected policy engine: line/subgroup flow, import/sizeClass flow,
 * variant_override as exception only.
 *
 * Usage: npx tsx scripts/validate-store-policy-engine.ts
 */

import {
  resolveStorePolicyForVariant,
  calculateStoreReplenishmentNeed,
  calculateReplenishmentDecision,
  getDefaultThresholds,
} from "../lib/comercial/tiendas/store-policy-engine";

import type {
  StorePolicyRule,
  PolicyResolutionInput,
  ReplenishmentNeedInput,
} from "../lib/comercial/tiendas/store-policy-types";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { pass++; console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`); }
  else    { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`); }
}

// ── Test data ─────────────────────────────────────────────────────────────────

const STORE = "bodega-sandiego";

const rules: StorePolicyRule[] = [
  // Latin Kids / Camisetas: min 2 per talla/color
  {
    id: "r-lk-cam", storeId: STORE, scope: "line_subgroup", productClass: "textile",
    line: "Latin Kids", subgroup: "Camisetas",
    minQty: 2, idealQty: 2, maxQty: 3,
    allowReplacement: false, allowProductionSignal: false, allowMainWarehouseTransfer: true,
    priority: 1, active: true,
  },
  // Castillitos / Conjuntos: min 1 per talla/color
  {
    id: "r-ca-con", storeId: STORE, scope: "line_subgroup", productClass: "textile",
    line: "Castillitos", subgroup: "Conjuntos",
    minQty: 1, idealQty: 1, maxQty: 2,
    allowReplacement: false, allowProductionSignal: false, allowMainWarehouseTransfer: true,
    priority: 1, active: true,
  },
  // Subgroup only: Pantalones (any line)
  {
    id: "r-sg-pan", storeId: STORE, scope: "subgroup", productClass: "textile",
    subgroup: "Pantalones",
    minQty: 1, idealQty: 2, maxQty: 3,
    allowReplacement: false, allowProductionSignal: false, allowMainWarehouseTransfer: true,
    priority: 2, active: true,
  },
  // Line only: Latin Kids (any subgroup)
  {
    id: "r-ln-lk", storeId: STORE, scope: "line", productClass: "textile",
    line: "Latin Kids",
    minQty: 1, idealQty: 1, maxQty: 2,
    allowReplacement: false, allowProductionSignal: false, allowMainWarehouseTransfer: true,
    priority: 3, active: true,
  },
  // Import large: bulky + large sizeClass
  {
    id: "r-imp-lg", storeId: STORE, scope: "class_size", productClass: "bulky",
    sizeClass: "large",
    minQty: 1, idealQty: 1, maxQty: 1,
    allowReplacement: true, allowProductionSignal: false, allowMainWarehouseTransfer: true,
    priority: 2, active: true,
  },
  // Import small accessories
  {
    id: "r-imp-sm", storeId: STORE, scope: "class_size", productClass: "accessory",
    sizeClass: "small",
    minQty: 2, idealQty: 3, maxQty: 6,
    allowReplacement: false, allowProductionSignal: false, allowMainWarehouseTransfer: true,
    priority: 2, active: true,
  },
  // ProductClass fallback: textile
  {
    id: "r-pc-tx", storeId: STORE, scope: "productClass", productClass: "textile",
    minQty: 1, idealQty: 1, maxQty: 2,
    allowReplacement: false, allowProductionSignal: false, allowMainWarehouseTransfer: true,
    priority: 4, active: true,
  },
  // Store-wide default
  {
    id: "r-store", storeId: STORE, scope: "store", productClass: "other",
    minQty: 1, idealQty: 1, maxQty: 2,
    allowReplacement: false, allowProductionSignal: false, allowMainWarehouseTransfer: true,
    priority: 5, active: true,
  },
  // Variant override (exception)
  {
    id: "r-vo", storeId: STORE, scope: "variant_override", productClass: "textile",
    referenceCode: "CJ-57673", size: "10-12", color: "ROJO",
    minQty: 3, idealQty: 4, maxQty: 5,
    allowReplacement: true, allowProductionSignal: true, allowMainWarehouseTransfer: true,
    priority: 0, active: true,
  },
  // Reference override
  {
    id: "r-ref", storeId: STORE, scope: "reference", productClass: "textile",
    referenceCode: "CJ-SPECIAL",
    minQty: 5, idealQty: 5, maxQty: 8,
    allowReplacement: false, allowProductionSignal: false, allowMainWarehouseTransfer: true,
    priority: 1, active: true,
  },
];

function main() {
  console.log("\n=== TIENDAS-POLICY-SCOPE-CORRECTION-01 VALIDATION ===\n");

  // ── 1. Resolution: Latin Kids / Camisetas ──────────────────────────────────
  console.log("--- 1. Latin Kids Camisetas (line_subgroup) ---");
  const lkCam: PolicyResolutionInput = {
    storeId: STORE, referenceCode: "CJ-57673", size: "10-12", color: "ROJO",
    line: "Latin Kids", subgroup: "Camisetas", category: "Ropa", productClass: "textile",
  };
  // Variant override should win over line_subgroup
  const r1 = resolveStorePolicyForVariant(lkCam, rules);
  check("Variant override wins over line_subgroup", r1?.id === "r-vo", `resolved: ${r1?.id}`);

  // Same product, different size — should fall to line_subgroup
  const lkCam2: PolicyResolutionInput = {
    ...lkCam, size: "8", color: "AZUL",
  };
  const r2 = resolveStorePolicyForVariant(lkCam2, rules);
  check("line_subgroup wins for other variants", r2?.id === "r-lk-cam",
    `resolved: ${r2?.id}, min=${r2?.minQty}, ideal=${r2?.idealQty}, max=${r2?.maxQty}`);
  check("Latin Kids Camisetas: min=2, ideal=2, max=3",
    r2?.minQty === 2 && r2?.idealQty === 2 && r2?.maxQty === 3, "thresholds correct");

  // ── 2. Resolution: Castillitos / Conjuntos ─────────────────────────────────
  console.log("\n--- 2. Castillitos Conjuntos (line_subgroup) ---");
  const caCon: PolicyResolutionInput = {
    storeId: STORE, referenceCode: "CJ-8821", size: "6", color: "AZUL",
    line: "Castillitos", subgroup: "Conjuntos", category: "Ropa", productClass: "textile",
  };
  const r3 = resolveStorePolicyForVariant(caCon, rules);
  check("Castillitos Conjuntos resolves to line_subgroup", r3?.id === "r-ca-con", `resolved: ${r3?.id}`);
  check("Castillitos: min=1, ideal=1, max=2",
    r3?.minQty === 1 && r3?.idealQty === 1 && r3?.maxQty === 2, "thresholds correct");

  // ── 3. Resolution: subgroup only ───────────────────────────────────────────
  console.log("\n--- 3. Subgroup Only (Pantalones, unknown line) ---");
  const pan: PolicyResolutionInput = {
    storeId: STORE, referenceCode: "PT-001", size: "M", color: "NEGRO",
    line: "Otra Marca", subgroup: "Pantalones", category: "Ropa", productClass: "textile",
  };
  const r4 = resolveStorePolicyForVariant(pan, rules);
  check("Subgroup match when no line_subgroup match", r4?.id === "r-sg-pan", `resolved: ${r4?.id}`);

  // ── 4. Resolution: line only ───────────────────────────────────────────────
  console.log("\n--- 4. Line Only (Latin Kids, unknown subgroup) ---");
  const lkOther: PolicyResolutionInput = {
    storeId: STORE, referenceCode: "LK-001", size: "S", color: "BLANCO",
    line: "Latin Kids", subgroup: "Sudaderas", category: "Ropa", productClass: "textile",
  };
  const r5 = resolveStorePolicyForVariant(lkOther, rules);
  check("Line match when no line_subgroup or subgroup match", r5?.id === "r-ln-lk", `resolved: ${r5?.id}`);

  // ── 5. Resolution: import large (class_size) ──────────────────────────────
  console.log("\n--- 5. Import Large (class_size: bulky + large) ---");
  const cuna: PolicyResolutionInput = {
    storeId: STORE, referenceCode: "CUNA-001", size: "", color: "",
    line: "", subgroup: "Cunas", category: "Muebles", productClass: "bulky", sizeClass: "large",
  };
  const r6 = resolveStorePolicyForVariant(cuna, rules);
  check("class_size match for bulky+large", r6?.id === "r-imp-lg", `resolved: ${r6?.id}`);
  check("Import large: min=1, ideal=1, max=1",
    r6?.minQty === 1 && r6?.idealQty === 1 && r6?.maxQty === 1, "thresholds correct");

  // ── 6. Resolution: productClass fallback ───────────────────────────────────
  console.log("\n--- 6. ProductClass Fallback ---");
  const unknown: PolicyResolutionInput = {
    storeId: STORE, referenceCode: "XX-001", size: "L", color: "GRIS",
    line: "Desconocida", subgroup: "Desconocido", category: "Otra", productClass: "textile",
  };
  const r7 = resolveStorePolicyForVariant(unknown, rules);
  check("productClass fallback for textile", r7?.id === "r-pc-tx", `resolved: ${r7?.id}`);

  // ── 7. Resolution: store default ───────────────────────────────────────────
  console.log("\n--- 7. Store Default ---");
  const other: PolicyResolutionInput = {
    storeId: STORE, referenceCode: "OT-001", size: "", color: "",
    line: "", subgroup: "", category: "", productClass: "other",
  };
  const r8 = resolveStorePolicyForVariant(other, rules);
  check("Store default when nothing else matches", r8?.id === "r-store", `resolved: ${r8?.id}`);

  // ── 8. Variant override overrides everything ───────────────────────────────
  console.log("\n--- 8. Variant Override ---");
  check("Variant override overrides line_subgroup (confirmed in test 1)", true);

  // ── 9. Replenishment: textile per talla/color ──────────────────────────────
  console.log("\n--- 9. Textile Replenishment (per talla/color) ---");
  const textileNeed: ReplenishmentNeedInput = {
    storeId: STORE, referenceCode: "CJ-57673", productName: "Camiseta Roja LK",
    size: "8", color: "AZUL", line: "Latin Kids", subgroup: "Camisetas",
    category: "Ropa", productClass: "textile", currentQty: 0,
  };
  const need1 = calculateStoreReplenishmentNeed(textileNeed, rules);
  check("Textile: resolves via line_subgroup", need1.resolvedBy === "line_subgroup", `resolvedBy=${need1.resolvedBy}`);
  check("Textile: idealQty=2 (from Latin Kids Camisetas)", need1.idealQty === 2, `ideal=${need1.idealQty}`);
  check("Textile: neededQty=2 when out", need1.neededQty === 2, `needed=${need1.neededQty}`);
  check("Textile: status=out", need1.status === "out");

  // ── 10. Replenishment: import per reference ────────────────────────────────
  console.log("\n--- 10. Import Replenishment (per reference, sizeClass) ---");
  const importNeed: ReplenishmentNeedInput = {
    storeId: STORE, referenceCode: "CUNA-001", productName: "Cuna Grande",
    size: "", color: "", line: "", subgroup: "Cunas",
    category: "Muebles", productClass: "bulky", sizeClass: "large", currentQty: 0,
  };
  const need2 = calculateStoreReplenishmentNeed(importNeed, rules);
  check("Import: resolves via class_size", need2.resolvedBy === "class_size", `resolvedBy=${need2.resolvedBy}`);
  check("Import: idealQty=1", need2.idealQty === 1);
  check("Import: maxQty=1", need2.maxQty === 1);

  // Overstock for import
  const importOver: ReplenishmentNeedInput = { ...importNeed, currentQty: 4 };
  const need3 = calculateStoreReplenishmentNeed(importOver, rules);
  check("Import overstock: status=overstock when qty=4, max=1", need3.status === "overstock");

  // ── 11. Decision: transfer from main ───────────────────────────────────────
  console.log("\n--- 11. Transfer Decision ---");
  const d1 = calculateReplenishmentDecision({ need: need1, mainWarehouseQty: 8, rule: rules[0] });
  check("Transfer 2 from main for textile", d1.transferFromMainWarehouse && d1.transferQty === 2,
    `transfer=${d1.transferQty}`);

  // Partial transfer
  const d2 = calculateReplenishmentDecision({ need: need1, mainWarehouseQty: 1, rule: rules[0] });
  check("Partial transfer when main has less", d2.transferQty === 1, `transfer=${d2.transferQty}`);

  // No stock, replacement allowed (bulky large rule)
  const d3 = calculateReplenishmentDecision({ need: need2, mainWarehouseQty: 0, rule: rules[4] });
  check("Replacement flag when bulky + no stock", d3.replacementNeeded === true);

  // ── 12. Production not active by default ───────────────────────────────────
  console.log("\n--- 12. Production Signal Default ---");
  const d4 = calculateReplenishmentDecision({ need: need1, mainWarehouseQty: 0, rule: rules[0] });
  check("Production NOT active by default", d4.productionSignalAllowed === false);

  // ── 13. Global defaults ────────────────────────────────────────────────────
  console.log("\n--- 13. Global Defaults ---");
  const defNeed = calculateStoreReplenishmentNeed({
    storeId: "otra-tienda", referenceCode: "XX", productName: "Otro",
    size: "M", color: "NEGRO", line: "", subgroup: "", category: "",
    productClass: "textile", currentQty: 0,
  }, rules);
  check("Falls back to global default when no store rules", defNeed.resolvedBy === "default");
  check("Global default textile: min=1, ideal=1, max=2",
    defNeed.minQty === 1 && defNeed.idealQty === 1 && defNeed.maxQty === 2);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(60)}`);
  console.log(`RESULT: ${pass} PASS / ${fail} FAIL (total ${pass + fail})`);
  console.log(`${"=".repeat(60)}`);

  process.exit(fail > 0 ? 1 : 0);
}

main();
