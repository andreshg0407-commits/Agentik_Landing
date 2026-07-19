/**
 * scripts/_test-castillitos-store-policy-pack-01.ts
 *
 * FASE 12 — QA tests for CASTILLITOS-STORE-POLICY-PACK-01.
 *
 * Run: npx tsx scripts/_test-castillitos-store-policy-pack-01.ts
 *
 * Tests:
 *   - Textile coverage: 8, 10, 12, 13
 *   - Rule 36: 35, 36, 37
 *   - Accessories: 6, 4, 1
 *   - Special products
 *   - Markdowns: 3, 6, 9, 12 months
 *   - Transfers
 *   - Rotation
 *   - Suggestions
 *   - Absolute separation: Maletas vs Tiendas
 */

import {
  evaluateTextileCoverage,
  evaluateGlobalLowStock,
  evaluateAccessoryCoverage,
  evaluateSpecialProducts,
  evaluateAutomaticMarkdowns,
  evaluateSlowRotation,
  evaluateAssortmentSuggestion,
  evaluateComparativeReport,
  evaluateStorePolicyPack,
} from "@/lib/comercial/tiendas/store-decision-engine";

import {
  CASTILLITOS_STORE_POLICY_PACK_CONFIG,
} from "@/lib/comercial/tiendas/store-policy-pack-config";

import {
  registerCastillitosStorePolicyPack,
  getCastillitosStorePolicies,
  CASTILLITOS_STORE_POLICY_COUNT,
} from "@/lib/comercial/tiendas/store-policy-pack";

import type {
  StoreInventorySnapshot,
  StoreSalesRecord,
} from "@/lib/comercial/tiendas/store-decision-types";

// ── Helpers ─────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n── ${title} ${"─".repeat(60 - title.length)}`);
}

const cfg = CASTILLITOS_STORE_POLICY_PACK_CONFIG;

// ── Test data factories ─────────────────────────────────────────────────────

function makeTextileItem(
  storeId: string,
  storeName: string,
  ref: string,
  units: number,
): StoreInventorySnapshot {
  return {
    storeId,
    storeName,
    referenceCode: ref,
    productName: `Camiseta ${ref}`,
    productClass: "textile",
    line: "castillitos",
    subgroup: "CAMISETAS",
    currentUnits: units,
  };
}

function makeAccessoryItem(
  storeId: string,
  storeName: string,
  ref: string,
  units: number,
  sizeClass: "small" | "medium" | "large",
): StoreInventorySnapshot {
  return {
    storeId,
    storeName,
    referenceCode: ref,
    productName: `Accesorio ${ref}`,
    productClass: "accessory",
    sizeClass,
    line: "accesorios",
    subgroup: "BOLSOS",
    currentUnits: units,
  };
}

function makeSpecialItem(
  storeId: string,
  storeName: string,
  ref: string,
  name: string,
  units: number,
): StoreInventorySnapshot {
  return {
    storeId,
    storeName,
    referenceCode: ref,
    productName: name,
    productClass: "bulky",
    sizeClass: "large",
    line: "importacion",
    subgroup: "CUNAS",
    currentUnits: units,
  };
}

function makeAgedItem(
  storeId: string,
  storeName: string,
  ref: string,
  units: number,
  daysInStore: number,
): StoreInventorySnapshot {
  return {
    storeId,
    storeName,
    referenceCode: ref,
    productName: `Producto ${ref}`,
    productClass: "textile",
    line: "castillitos",
    subgroup: "CAMISETAS",
    currentUnits: units,
    daysInStore,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

function testPolicyPackRegistration(): void {
  section("FASE 1: Policy Pack Registration");

  const policies = getCastillitosStorePolicies();
  assert(policies.length === CASTILLITOS_STORE_POLICY_COUNT, `Policy count = ${CASTILLITOS_STORE_POLICY_COUNT} (got ${policies.length})`);

  const result = registerCastillitosStorePolicyPack();
  assert(result.success, `Registration successful`);
  assert(result.registered === CASTILLITOS_STORE_POLICY_COUNT, `Registered ${CASTILLITOS_STORE_POLICY_COUNT} policies (got ${result.registered})`);
  assert(result.failed === 0, `No failures (got ${result.failed})`);
  assert(result.errors.length === 0 || result.errors[0] === "Already registered", `No errors`);

  // All policies are STORE-only (no maletas, no vendedores)
  for (const p of policies) {
    assert(p.tenantId === "castillitos", `Policy ${p.id} belongs to castillitos`);
    assert(
      p.tags.includes("tiendas"),
      `Policy ${p.id} tagged as "tiendas"`,
    );
    assert(
      !p.tags.includes("maletas") && !p.tags.includes("vendedores"),
      `Policy ${p.id} has NO maletas/vendedores tags`,
    );
  }
}

function testTextileCoverage(): void {
  section("FASE 2: Textile Coverage (8/10/12)");

  const inventory: StoreInventorySnapshot[] = [
    makeTextileItem("centro", "Centro", "REF-001", 5),   // below min (8)
    makeTextileItem("centro", "Centro", "REF-002", 8),   // at min — below ideal
    makeTextileItem("centro", "Centro", "REF-003", 10),  // at ideal — ok
    makeTextileItem("centro", "Centro", "REF-004", 12),  // at max — ok
    makeTextileItem("centro", "Centro", "REF-005", 13),  // above max
  ];

  const results = evaluateTextileCoverage(inventory, cfg);

  // REF-001 (5 und) → below_minimum
  const r1 = results.find(r => r.referenceCode === "REF-001");
  assert(!!r1, "REF-001 (5 und) flagged");
  assert(r1?.status === "below_minimum", "REF-001 status = below_minimum");
  assert(r1?.gap === 3, "REF-001 gap = 3 (8 - 5)");

  // REF-002 (8 und) → below_ideal
  const r2 = results.find(r => r.referenceCode === "REF-002");
  assert(!!r2, "REF-002 (8 und) flagged");
  assert(r2?.status === "below_ideal", "REF-002 status = below_ideal");
  assert(r2?.gap === 2, "REF-002 gap = 2 (10 - 8)");

  // REF-003 (10 und) → ok, not in results
  const r3 = results.find(r => r.referenceCode === "REF-003");
  assert(!r3, "REF-003 (10 und) NOT flagged — ok");

  // REF-004 (12 und) → ok, not in results
  const r4 = results.find(r => r.referenceCode === "REF-004");
  assert(!r4, "REF-004 (12 und) NOT flagged — ok");

  // REF-005 (13 und) → above_maximum
  const r5 = results.find(r => r.referenceCode === "REF-005");
  assert(!!r5, "REF-005 (13 und) flagged");
  assert(r5?.status === "above_maximum", "REF-005 status = above_maximum");
  assert(r5?.gap === 1, "REF-005 gap = 1 (13 - 12)");

  // Evidence check
  assert(!!r1?.evidence, "REF-001 has evidence");
  assert(r1?.evidence.policyType === "STORE_TEXTILE_COVERAGE", "Evidence policyType = STORE_TEXTILE_COVERAGE");
  assert(r1?.evidence.confidence === 0.95, "Evidence confidence = 0.95");
}

function testGlobalLowStock(): void {
  section("FASE 3: Global Low Stock — Rule 36 (35/36/37)");

  // Reference with 35 total (below threshold 36) — should trigger
  const inv35: StoreInventorySnapshot[] = [
    makeTextileItem("centro", "Centro", "REF-A", 10),
    makeTextileItem("caldas", "Caldas", "REF-A", 10),
    makeTextileItem("san_diego", "San Diego", "REF-A", 10),
    makeTextileItem("rionegro", "Rionegro", "REF-A", 5),
  ];

  const res35 = evaluateGlobalLowStock(inv35, cfg);
  const r35 = res35.find(r => r.referenceCode === "REF-A");
  assert(!!r35, "REF-A (35 total) triggers Rule 36");
  assert(r35?.totalUnitsAllWarehouses === 35, "Total = 35");
  assert(r35?.transferOutStores.length === 2, "2 stores should transfer out (San Diego + Rionegro)");
  assert(
    r35?.transferOutStores.every(s => !["centro", "caldas"].includes(s.storeId)) ?? false,
    "Centro and Caldas NOT in transfer-out list",
  );

  // Reference with 36 total (at threshold) — should trigger
  const inv36: StoreInventorySnapshot[] = [
    makeTextileItem("centro", "Centro", "REF-B", 10),
    makeTextileItem("caldas", "Caldas", "REF-B", 10),
    makeTextileItem("san_diego", "San Diego", "REF-B", 10),
    makeTextileItem("rionegro", "Rionegro", "REF-B", 6),
  ];

  const res36 = evaluateGlobalLowStock(inv36, cfg);
  const r36 = res36.find(r => r.referenceCode === "REF-B");
  assert(!!r36, "REF-B (36 total) triggers Rule 36 (<=)");

  // Reference with 37 total (above threshold) — should NOT trigger
  const inv37: StoreInventorySnapshot[] = [
    makeTextileItem("centro", "Centro", "REF-C", 10),
    makeTextileItem("caldas", "Caldas", "REF-C", 10),
    makeTextileItem("san_diego", "San Diego", "REF-C", 10),
    makeTextileItem("rionegro", "Rionegro", "REF-C", 7),
  ];

  const res37 = evaluateGlobalLowStock(inv37, cfg);
  const r37 = res37.find(r => r.referenceCode === "REF-C");
  assert(!r37, "REF-C (37 total) does NOT trigger Rule 36");

  // Evidence
  assert(!!r35?.evidence, "Rule 36 evidence present");
  assert(r35?.evidence.policyType === "STORE_GLOBAL_LOW_STOCK", "Evidence type = STORE_GLOBAL_LOW_STOCK");
  assert(r35?.allowedStores.includes("Centro") ?? false, "Allowed stores includes Centro");
  assert(r35?.allowedStores.includes("Caldas") ?? false, "Allowed stores includes Caldas");
}

function testAccessoryCoverage(): void {
  section("FASE 4: Accessory Coverage (6/4/1)");

  const inventory: StoreInventorySnapshot[] = [
    // Small: ideal = 6
    makeAccessoryItem("centro", "Centro", "ACC-S1", 3, "small"),   // below (gap 3)
    makeAccessoryItem("centro", "Centro", "ACC-S2", 6, "small"),   // ok
    makeAccessoryItem("centro", "Centro", "ACC-S3", 8, "small"),   // above

    // Medium: ideal = 4
    makeAccessoryItem("centro", "Centro", "ACC-M1", 2, "medium"),  // below (gap 2)
    makeAccessoryItem("centro", "Centro", "ACC-M2", 4, "medium"),  // ok

    // Large: ideal = 1
    makeAccessoryItem("centro", "Centro", "ACC-L1", 0, "large"),   // below (gap 1)
    makeAccessoryItem("centro", "Centro", "ACC-L2", 1, "large"),   // ok
    makeAccessoryItem("centro", "Centro", "ACC-L3", 3, "large"),   // above
  ];

  const results = evaluateAccessoryCoverage(inventory, cfg);

  // Small checks
  const s1 = results.find(r => r.referenceCode === "ACC-S1");
  assert(!!s1, "ACC-S1 (small, 3 und) flagged");
  assert(s1?.idealUnits === 6, "Small ideal = 6");
  assert(s1?.gap === 3, "ACC-S1 gap = 3");

  const s2 = results.find(r => r.referenceCode === "ACC-S2");
  assert(!s2, "ACC-S2 (small, 6 und) NOT flagged — ok");

  // Medium checks
  const m1 = results.find(r => r.referenceCode === "ACC-M1");
  assert(!!m1, "ACC-M1 (medium, 2 und) flagged");
  assert(m1?.idealUnits === 4, "Medium ideal = 4");
  assert(m1?.gap === 2, "ACC-M1 gap = 2");

  // Large checks
  const l1 = results.find(r => r.referenceCode === "ACC-L1");
  assert(!!l1, "ACC-L1 (large, 0 und) flagged");
  assert(l1?.idealUnits === 1, "Large ideal = 1");

  const l2 = results.find(r => r.referenceCode === "ACC-L2");
  assert(!l2, "ACC-L2 (large, 1 und) NOT flagged — ok");

  // Evidence
  assert(!!s1?.evidence, "Accessory evidence present");
  assert(s1?.evidence.policyType === "STORE_ACCESSORY_COVERAGE", "Evidence type = STORE_ACCESSORY_COVERAGE");
}

function testSpecialProducts(): void {
  section("FASE 5: Special Products (Banera, Cuna Colecho, Corral)");

  const inventory: StoreInventorySnapshot[] = [
    // San Diego: ideal = 3
    makeSpecialItem("san_diego", "San Diego", "BANERA-001", "Banera Premium", 1),  // below (gap 2)
    makeSpecialItem("san_diego", "San Diego", "CUNA_COLECHO-001", "Cuna Colecho", 3),  // ok

    // Caldas: ideal = 3
    makeSpecialItem("caldas", "Caldas", "CORRAL-001", "Corral Bebe", 5),  // above (gap 2)

    // Rionegro: ideal = 0 (not authorized)
    makeSpecialItem("rionegro", "Rionegro", "BANERA-002", "Banera Basica", 2),  // should not be here
  ];

  const results = evaluateSpecialProducts(inventory, cfg);

  const sd1 = results.find(r => r.referenceCode === "BANERA-001");
  assert(!!sd1, "BANERA-001 in San Diego flagged (below ideal)");
  assert(sd1?.idealUnits === 3, "San Diego ideal = 3");
  assert(sd1?.gap === 2, "Gap = 2");

  const sd2 = results.find(r => r.referenceCode === "CUNA_COLECHO-001");
  assert(!sd2, "CUNA_COLECHO-001 in San Diego NOT flagged — ok at 3");

  const cal = results.find(r => r.referenceCode === "CORRAL-001");
  assert(!!cal, "CORRAL-001 in Caldas flagged (above ideal)");
  assert(cal?.status === "above", "Status = above");

  const rio = results.find(r => r.referenceCode === "BANERA-002");
  assert(!!rio, "BANERA-002 in Rionegro flagged (ideal = 0)");
  assert(rio?.idealUnits === 0, "Rionegro ideal = 0 (not authorized)");
  assert(rio?.evidence.severity === "high", "Severity = high for unauthorized store");
}

function testAutomaticMarkdowns(): void {
  section("FASE 6: Automatic Markdowns (3/6/9/12 months)");

  const inventory: StoreInventorySnapshot[] = [
    // Centro: applicable
    makeAgedItem("centro", "Centro", "MD-001", 5, 80),    // ~2.6 months — no discount
    makeAgedItem("centro", "Centro", "MD-002", 3, 100),   // ~3.3 months — 10%
    makeAgedItem("centro", "Centro", "MD-003", 2, 200),   // ~6.6 months — 30%
    makeAgedItem("centro", "Centro", "MD-004", 1, 280),   // ~9.3 months — 50%
    makeAgedItem("centro", "Centro", "MD-005", 1, 370),   // ~12.3 months — 70%

    // San Diego: NOT applicable
    makeAgedItem("san_diego", "San Diego", "MD-006", 5, 200),  // should NOT trigger
  ];

  const results = evaluateAutomaticMarkdowns(inventory, cfg);

  const r1 = results.find(r => r.referenceCode === "MD-001");
  assert(!r1, "MD-001 (80 days, ~2.6 months) NOT discounted");

  const r2 = results.find(r => r.referenceCode === "MD-002");
  assert(!!r2, "MD-002 (100 days, ~3 months) discounted");
  assert(r2?.suggestedDiscountPct === 10, "MD-002 discount = 10%");

  const r3 = results.find(r => r.referenceCode === "MD-003");
  assert(!!r3, "MD-003 (200 days, ~6 months) discounted");
  assert(r3?.suggestedDiscountPct === 30, "MD-003 discount = 30%");

  const r4 = results.find(r => r.referenceCode === "MD-004");
  assert(!!r4, "MD-004 (280 days, ~9 months) discounted");
  assert(r4?.suggestedDiscountPct === 50, "MD-004 discount = 50%");

  const r5 = results.find(r => r.referenceCode === "MD-005");
  assert(!!r5, "MD-005 (370 days, ~12 months) discounted");
  assert(r5?.suggestedDiscountPct === 70, "MD-005 discount = 70%");

  // San Diego not applicable
  const r6 = results.find(r => r.referenceCode === "MD-006");
  assert(!r6, "MD-006 (San Diego) NOT discounted — store not in applicableStoreIds");

  // Markdown content
  assert(!!r2?.suggestedMarkdown, "Markdown suggestion generated");
  assert(r2?.suggestedMarkdown.includes("sugerencia") ?? false, "Markdown mentions it's a suggestion");
}

function testSlowRotation(): void {
  section("FASE 7: Slow Rotation");

  const inventory: StoreInventorySnapshot[] = [
    makeAgedItem("centro", "Centro", "SR-001", 5, 60),    // 60 days — NOT slow
    makeAgedItem("centro", "Centro", "SR-002", 3, 95),    // 95 days — slow (>=90)
    makeAgedItem("caldas", "Caldas", "SR-003", 2, 200),   // 200 days — slow
    makeAgedItem("san_diego", "San Diego", "SR-004", 0, 150),  // 0 units — NOT flagged
  ];

  const results = evaluateSlowRotation(inventory, cfg);

  const r1 = results.find(r => r.referenceCode === "SR-001");
  assert(!r1, "SR-001 (60 days) NOT flagged");

  const r2 = results.find(r => r.referenceCode === "SR-002");
  assert(!!r2, "SR-002 (95 days) flagged as slow");
  assert(r2?.daysInStore === 95, "Days = 95");
  assert(r2?.monthsInStore === 3, "Months = 3");

  const r3 = results.find(r => r.referenceCode === "SR-003");
  assert(!!r3, "SR-003 (200 days) flagged as slow");

  const r4 = results.find(r => r.referenceCode === "SR-004");
  assert(!r4, "SR-004 (0 units) NOT flagged — no inventory");
}

function testAssortmentSuggestion(): void {
  section("FASE 8: Assortment Suggestion (store-specific sales)");

  const inventory: StoreInventorySnapshot[] = [
    makeTextileItem("centro", "Centro", "AS-001", 2),  // below min
    makeTextileItem("centro", "Centro", "AS-002", 3),  // below min
    makeTextileItem("centro", "Centro", "AS-003", 10), // ok
  ];

  const salesHistory: StoreSalesRecord[] = [
    // AS-002 sold more than AS-001 in Centro
    { storeId: "centro", storeName: "Centro", referenceCode: "AS-002", productName: "Camiseta AS-002", unitsSold: 20, revenue: 400000, cost: 200000, avgDaysToSell: 10, period: "2026-Q2" },
    { storeId: "centro", storeName: "Centro", referenceCode: "AS-001", productName: "Camiseta AS-001", unitsSold: 5, revenue: 100000, cost: 50000, avgDaysToSell: 30, period: "2026-Q2" },
    // Different store sales should NOT affect Centro's priority
    { storeId: "caldas", storeName: "Caldas", referenceCode: "AS-001", productName: "Camiseta AS-001", unitsSold: 50, revenue: 1000000, cost: 500000, avgDaysToSell: 5, period: "2026-Q2" },
  ];

  const results = evaluateAssortmentSuggestion(inventory, salesHistory, cfg);

  const centro = results.find(r => r.storeId === "centro");
  assert(!!centro, "Centro has assortment suggestions");
  assert(centro!.suggestions.length === 2, "2 suggestions (AS-001 and AS-002)");

  // AS-002 should be FIRST (more sales in Centro)
  assert(centro!.suggestions[0].referenceCode === "AS-002", "AS-002 first (20 units sold in Centro)");
  assert(centro!.suggestions[1].referenceCode === "AS-001", "AS-001 second (5 units sold in Centro)");

  // Evidence
  assert(centro!.evidence.dataUsed.usedStoreSalesHistory === true, "Used store-specific sales");
  assert(centro!.evidence.dataUsed.usedGlobalSales === false, "Did NOT use global sales");
}

function testComparativeReport(): void {
  section("FASE 9: Comparative Report");

  const salesHistory: StoreSalesRecord[] = [
    { storeId: "centro", storeName: "Centro", referenceCode: "CR-001", productName: "P1", unitsSold: 50, revenue: 1000000, cost: 500000, avgDaysToSell: 10, period: "2026-Q2" },
    { storeId: "centro", storeName: "Centro", referenceCode: "CR-002", productName: "P2", unitsSold: 30, revenue: 600000, cost: 300000, avgDaysToSell: 15, period: "2026-Q2" },
    { storeId: "caldas", storeName: "Caldas", referenceCode: "CR-001", productName: "P1", unitsSold: 10, revenue: 200000, cost: 100000, avgDaysToSell: 25, period: "2026-Q2" },
    { storeId: "caldas", storeName: "Caldas", referenceCode: "CR-002", productName: "P2", unitsSold: 40, revenue: 800000, cost: 400000, avgDaysToSell: 8, period: "2026-Q2" },
    { storeId: "san_diego", storeName: "San Diego", referenceCode: "CR-001", productName: "P1", unitsSold: 5, revenue: 100000, cost: 60000, avgDaysToSell: 30, period: "2026-Q2" },
  ];

  const result = evaluateComparativeReport(salesHistory);

  assert(!!result, "Comparative report generated");
  assert(result!.topSellingStore?.storeId === "centro", "Top selling = Centro (80 total)");
  assert(result!.topRotationStore?.storeId === "centro", "Top rotation = Centro (avg 12.5 days)");
  assert(result!.topMarginStore?.storeId === "centro", "Top margin = Centro");

  // Cross-store opportunities
  assert(result!.crossStoreOpportunities.length > 0, "Cross-store opportunities found");
  const cr1 = result!.crossStoreOpportunities.find(o => o.referenceCode === "CR-001");
  assert(!!cr1, "CR-001 has cross-store opportunity");
  assert(cr1!.strongStore.storeId === "centro", "CR-001 strong in Centro");
}

function testMaletasSeparation(): void {
  section("ABSOLUTE SEPARATION: Maletas vs Tiendas");

  const policies = getCastillitosStorePolicies();

  for (const p of policies) {
    assert(!p.id.includes("maleta"), `${p.id} has no 'maleta' in ID`);
    assert(!p.name.toLowerCase().includes("maleta"), `${p.name} has no 'maleta' in name`);
    assert(!p.tags.includes("maletas"), `${p.id} has no 'maletas' tag`);
    assert(!p.tags.includes("vendedores"), `${p.id} has no 'vendedores' tag`);
    assert(!p.tags.includes("pedidos"), `${p.id} has no 'pedidos' tag`);
    assert(!p.tags.includes("produccion"), `${p.id} has no 'produccion' tag`);
  }

  // Verify config has no maleta references
  const cfgStr = JSON.stringify(CASTILLITOS_STORE_POLICY_PACK_CONFIG);
  assert(!cfgStr.toLowerCase().includes("maleta"), "Config has no 'maleta' reference");
  assert(!cfgStr.toLowerCase().includes("vendedor"), "Config has no 'vendedor' reference");
  assert(!cfgStr.toLowerCase().includes("derrotero"), "Config has no 'derrotero' reference");
}

function testEvidenceThreeQuestions(): void {
  section("EVIDENCE: Three Questions Rule");

  const inventory: StoreInventorySnapshot[] = [
    makeTextileItem("centro", "Centro", "EV-001", 5),
  ];

  const results = evaluateTextileCoverage(inventory, cfg);
  const ev = results[0]?.evidence;

  assert(!!ev, "Evidence exists");
  assert(ev.activationReason.length > 10, "Q1: WHY — activationReason is descriptive");
  assert(Object.keys(ev.dataUsed).length > 0, "Q2: WHAT DATA — dataUsed is populated");
  assert(ev.recommendedAction.length > 10, "Q3: WHAT ACTION — recommendedAction is descriptive");
  assert(ev.actionRationale.length > 10, "Q3: WHY ACTION — actionRationale is descriptive");
  assert(ev.confidence > 0 && ev.confidence <= 1, "Confidence is 0-1 range");
  assert(!!ev.evaluatedAt, "EvaluatedAt timestamp present");
}

function testFullEvaluation(): void {
  section("FULL EVALUATION: evaluateStorePolicyPack");

  const inventory: StoreInventorySnapshot[] = [
    makeTextileItem("centro", "Centro", "FULL-001", 5),
    makeTextileItem("caldas", "Caldas", "FULL-001", 3),
    makeAccessoryItem("centro", "Centro", "FULL-ACC", 1, "small"),
  ];

  const sales: StoreSalesRecord[] = [
    { storeId: "centro", storeName: "Centro", referenceCode: "FULL-001", productName: "Camiseta FULL", unitsSold: 10, revenue: 200000, cost: 100000, avgDaysToSell: 15, period: "2026-Q2" },
  ];

  const result = evaluateStorePolicyPack(cfg, inventory, sales);

  assert(result.tenantId === "castillitos", "Tenant = castillitos");
  assert(result.policyPackVersion === "1.0.0", "Version = 1.0.0");
  assert(result.textileCoverage.length > 0, "Textile coverage results present");
  assert(result.accessoryCoverage.length > 0, "Accessory coverage results present");
  assert(result.allEvidence.length > 0, "All evidence collected");
  assert(!!result.evaluatedAt, "EvaluatedAt present");
}

function testConfigDecoupling(): void {
  section("FASE 11: Configuration Decoupling");

  // All values come from config, not hardcoded
  assert(cfg.textileCoverage.minimumUnits === 8, "Textile min from config = 8");
  assert(cfg.textileCoverage.idealUnits === 10, "Textile ideal from config = 10");
  assert(cfg.textileCoverage.maximumUnits === 12, "Textile max from config = 12");
  assert(cfg.globalLowStock.threshold === 36, "Rule 36 threshold from config = 36");
  assert(cfg.accessoryCoverage.idealBySize.small === 6, "Accessory small from config = 6");
  assert(cfg.accessoryCoverage.idealBySize.medium === 4, "Accessory medium from config = 4");
  assert(cfg.accessoryCoverage.idealBySize.large === 1, "Accessory large from config = 1");
  assert(cfg.automaticMarkdown.tiers.length === 4, "4 markdown tiers from config");
  assert(cfg.slowRotation.minimumDaysThreshold === 90, "Slow rotation threshold from config = 90");
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  CASTILLITOS-STORE-POLICY-PACK-01 — QA Tests");
  console.log("═══════════════════════════════════════════════════════════════");

  testPolicyPackRegistration();
  testTextileCoverage();
  testGlobalLowStock();
  testAccessoryCoverage();
  testSpecialProducts();
  testAutomaticMarkdowns();
  testSlowRotation();
  testAssortmentSuggestion();
  testComparativeReport();
  testMaletasSeparation();
  testEvidenceThreeQuestions();
  testFullEvaluation();
  testConfigDecoupling();

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
