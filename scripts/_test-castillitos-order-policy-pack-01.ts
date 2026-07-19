/**
 * scripts/_test-castillitos-order-policy-pack-01.ts
 *
 * FASE 11 — QA tests for CASTILLITOS-ORDER-POLICY-PACK-01.
 *
 * Run: npx tsx scripts/_test-castillitos-order-policy-pack-01.ts
 */

import {
  evaluateCustomerBranch,
  evaluateCustomerCredit,
  evaluateAutoSizeDistribution,
  evaluatePartialDelivery,
  evaluateDiscountOverride,
  evaluateOrderReadiness,
  evaluateOrderPolicyPack,
} from "@/lib/comercial/pedidos/order-decision-engine";

import {
  CASTILLITOS_ORDER_POLICY_PACK_CONFIG,
} from "@/lib/comercial/pedidos/order-policy-pack-config";

import {
  registerCastillitosOrderPolicyPack,
  getCastillitosOrderPolicies,
  CASTILLITOS_ORDER_POLICY_COUNT,
} from "@/lib/comercial/pedidos/order-policy-pack";

import type {
  OrderPolicyContext,
  SizeInventorySnapshot,
  CustomerBranchInfo,
} from "@/lib/comercial/pedidos/order-decision-types";

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

const cfg = CASTILLITOS_ORDER_POLICY_PACK_CONFIG;

// ── Test data factories ─────────────────────────────────────────────────────

function makeCtx(overrides: Partial<OrderPolicyContext> = {}): OrderPolicyContext {
  return {
    tenantId: "castillitos",
    orderId: "ORD-001",
    customerId: "CUST-001",
    customerName: "Almacen Test",
    customerCode: "900123456",
    sellerId: "SELL-001",
    sellerName: "Juan Vendedor",
    lines: [
      { referenceCode: "REF-001", productName: "Camiseta A", size: "M", color: "AZ", quantity: 10, availableUnits: 10, unitPrice: 25000 },
      { referenceCode: "REF-002", productName: "Camiseta B", size: "L", color: "RJ", quantity: 5, availableUnits: 5, unitPrice: 30000 },
    ],
    credit: { totalReceivable: 0, overdueReceivable: 0, maxDaysPastDue: 0 },
    branches: [
      { branchCode: "SUC-001", name: "Principal", address: "Cra 10 #20-30", city: "Medellin", isMain: true, active: true },
    ],
    selectedBranchCode: null,
    discount: null,
    discountOverride: null,
    totalValue: 400000,
    totalUnits: 15,
    ...overrides,
  };
}

function makeBranch(code: string, name: string, city: string, isMain = false): CustomerBranchInfo {
  return { branchCode: code, name, address: `Dir ${name}`, city, isMain, active: true };
}

// ── Tests ───────────────────────────────────────────────────────────────────

function testPolicyPackRegistration(): void {
  section("FASE 1: Policy Pack Registration");

  const policies = getCastillitosOrderPolicies();
  assert(policies.length === CASTILLITOS_ORDER_POLICY_COUNT, `Policy count = ${CASTILLITOS_ORDER_POLICY_COUNT} (got ${policies.length})`);

  const result = registerCastillitosOrderPolicyPack();
  assert(result.success, `Registration successful (errors: ${result.errors.join(", ")})`);
  assert(result.registered === CASTILLITOS_ORDER_POLICY_COUNT, `Registered ${CASTILLITOS_ORDER_POLICY_COUNT} (got ${result.registered})`);
  assert(result.failed === 0, `No failures (got ${result.failed})`);

  for (const p of policies) {
    assert(p.tenantId === "castillitos", `${p.id} belongs to castillitos`);
    assert(p.tags.includes("pedidos"), `${p.id} tagged "pedidos"`);
    assert(!p.tags.includes("tiendas"), `${p.id} no "tiendas" tag`);
    assert(!p.tags.includes("maletas"), `${p.id} no "maletas" tag`);
  }
}

function testCustomerBranch(): void {
  section("FASE 2: Customer Branch");

  // Single branch → auto select
  const ctx1 = makeCtx({ branches: [makeBranch("SUC-001", "Principal", "Medellin", true)] });
  const r1 = evaluateCustomerBranch(ctx1);
  assert(r1.selectionMode === "auto_single", "Single branch → auto_single");
  assert(r1.selectedBranch?.branchCode === "SUC-001", "Auto-selected SUC-001");
  assert(r1.evidence.confidence === 1.0, "Confidence = 1.0 for single");

  // Multiple branches → requires selection
  const ctx2 = makeCtx({
    branches: [
      makeBranch("SUC-001", "Principal", "Medellin", true),
      makeBranch("SUC-002", "Bodega Norte", "Bogota"),
    ],
  });
  const r2 = evaluateCustomerBranch(ctx2);
  assert(r2.selectionMode === "requires_selection", "Multiple branches → requires_selection");
  assert(r2.selectedBranch === null, "No branch selected");
  assert(r2.evidence.confidence === 0.3, "Low confidence without selection");

  // Multiple with pre-selection
  const ctx3 = makeCtx({
    branches: [
      makeBranch("SUC-001", "Principal", "Medellin", true),
      makeBranch("SUC-002", "Bodega Norte", "Bogota"),
    ],
    selectedBranchCode: "SUC-002",
  });
  const r3 = evaluateCustomerBranch(ctx3);
  assert(r3.selectedBranch?.branchCode === "SUC-002", "Pre-selected SUC-002");
  assert(r3.evidence.confidence === 0.9, "High confidence with selection");

  // No branches
  const ctx4 = makeCtx({ branches: [] });
  const r4 = evaluateCustomerBranch(ctx4);
  assert(r4.selectionMode === "no_branches", "No branches → no_branches");
  assert(r4.selectedBranch === null, "No branch available");
}

function testCustomerCredit(): void {
  section("FASE 3: Customer Credit");

  // 29 days — no alert
  const ctx29 = makeCtx({ credit: { totalReceivable: 500000, overdueReceivable: 100000, maxDaysPastDue: 29 } });
  const r29 = evaluateCustomerCredit(ctx29, cfg);
  assert(r29.creditStatus === "approved", "29 days → approved");
  assert(r29.alerts.length === 0, "No alerts at 29 days");

  // 30 days — warning
  const ctx30 = makeCtx({ credit: { totalReceivable: 500000, overdueReceivable: 200000, maxDaysPastDue: 30 } });
  const r30 = evaluateCustomerCredit(ctx30, cfg);
  assert(r30.creditStatus === "warning", "30 days → warning");
  assert(r30.alerts.length === 1, "1 alert at 30 days");
  assert(r30.alerts[0].severity === "warning", "Alert severity = warning");

  // 31 days — still warning
  const ctx31 = makeCtx({ credit: { totalReceivable: 500000, overdueReceivable: 200000, maxDaysPastDue: 31 } });
  const r31 = evaluateCustomerCredit(ctx31, cfg);
  assert(r31.creditStatus === "warning", "31 days → warning");

  // 60 days — blocked
  const ctx60 = makeCtx({ credit: { totalReceivable: 800000, overdueReceivable: 500000, maxDaysPastDue: 60 } });
  const r60 = evaluateCustomerCredit(ctx60, cfg);
  assert(r60.creditStatus === "blocked", "60 days → blocked");
  assert(r60.alerts[0].severity === "critical", "Alert severity = critical");

  // 0 days — clean
  const ctx0 = makeCtx({ credit: { totalReceivable: 0, overdueReceivable: 0, maxDaysPastDue: 0 } });
  const r0 = evaluateCustomerCredit(ctx0, cfg);
  assert(r0.creditStatus === "approved", "0 days → approved");
}

function testAutoSizeDistribution(): void {
  section("FASE 4: Auto Size Distribution");

  // Complete distribution
  const inv1: SizeInventorySnapshot = {
    referenceCode: "REF-001",
    productName: "Camiseta A",
    sizes: [
      { size: "S", sizeName: "Pequena", availableUnits: 10 },
      { size: "M", sizeName: "Mediana", availableUnits: 10 },
      { size: "L", sizeName: "Grande", availableUnits: 10 },
    ],
  };
  const r1 = evaluateAutoSizeDistribution("REF-001", "Camiseta A", 30, inv1, cfg);
  assert(r1.totalAllocated === 30, "30 requested → 30 allocated");
  assert(r1.unallocated === 0, "Nothing unallocated");
  assert(r1.distribution.every(d => d.allocatedUnits === 10), "Balanced 10/10/10");
  assert(r1.balanced, "Balanced = true");

  // Partial distribution (not enough inventory)
  const inv2: SizeInventorySnapshot = {
    referenceCode: "REF-002",
    productName: "Camiseta B",
    sizes: [
      { size: "S", sizeName: "Pequena", availableUnits: 5 },
      { size: "M", sizeName: "Mediana", availableUnits: 3 },
      { size: "L", sizeName: "Grande", availableUnits: 2 },
    ],
  };
  const r2 = evaluateAutoSizeDistribution("REF-002", "Camiseta B", 30, inv2, cfg);
  assert(r2.totalAllocated === 10, "30 requested, 10 available → 10 allocated");
  assert(r2.unallocated === 20, "20 unallocated");

  // No inventory
  const inv3: SizeInventorySnapshot = {
    referenceCode: "REF-003",
    productName: "Camiseta C",
    sizes: [
      { size: "S", sizeName: "Pequena", availableUnits: 0 },
      { size: "M", sizeName: "Mediana", availableUnits: 0 },
    ],
  };
  const r3 = evaluateAutoSizeDistribution("REF-003", "Camiseta C", 10, inv3, cfg);
  assert(r3.totalAllocated === 0, "No inventory → 0 allocated");
  assert(r3.unallocated === 10, "All 10 unallocated");
  assert(r3.evidence.severity === "high", "High severity when no inventory");

  // Missing size redistributed
  const inv4: SizeInventorySnapshot = {
    referenceCode: "REF-004",
    productName: "Camiseta D",
    sizes: [
      { size: "S", sizeName: "Pequena", availableUnits: 0 },
      { size: "M", sizeName: "Mediana", availableUnits: 15 },
      { size: "L", sizeName: "Grande", availableUnits: 15 },
    ],
  };
  const r4 = evaluateAutoSizeDistribution("REF-004", "Camiseta D", 20, inv4, cfg);
  assert(r4.totalAllocated === 20, "20 allocated across M and L");
  const sAlloc = r4.distribution.find(d => d.size === "S");
  assert(sAlloc?.allocatedUnits === 0, "S (0 stock) gets 0");
  assert(r4.distribution.filter(d => d.allocatedUnits > 0).length === 2, "2 sizes got allocation");
}

function testPartialDelivery(): void {
  section("FASE 5: Partial Delivery");

  // Complete delivery
  const ctx1 = makeCtx({
    lines: [
      { referenceCode: "R1", productName: "P1", size: "M", color: "A", quantity: 5, availableUnits: 10, unitPrice: 25000 },
      { referenceCode: "R2", productName: "P2", size: "L", color: "B", quantity: 3, availableUnits: 5, unitPrice: 30000 },
    ],
  });
  const r1 = evaluatePartialDelivery(ctx1, cfg);
  assert(r1.deliveryStatus === "COMPLETE", "Full inventory → COMPLETE");

  // Partial delivery
  const ctx2 = makeCtx({
    lines: [
      { referenceCode: "R1", productName: "P1", size: "M", color: "A", quantity: 10, availableUnits: 10, unitPrice: 25000 },
      { referenceCode: "R2", productName: "P2", size: "L", color: "B", quantity: 10, availableUnits: 3, unitPrice: 30000 },
    ],
  });
  const r2 = evaluatePartialDelivery(ctx2, cfg);
  assert(r2.deliveryStatus === "PARTIAL", "Partial inventory → PARTIAL");
  assert(r2.fulfillableLines === 2, "2 lines fulfillable (1 full + 1 partial)");

  // Backorder
  const ctx3 = makeCtx({
    lines: [
      { referenceCode: "R1", productName: "P1", size: "M", color: "A", quantity: 10, availableUnits: 0, unitPrice: 25000 },
    ],
  });
  const r3 = evaluatePartialDelivery(ctx3, cfg);
  assert(r3.deliveryStatus === "BACKORDER", "No inventory → BACKORDER");
  assert(r3.backorderLines === 1, "1 backorder line");
}

function testDiscountOverride(): void {
  section("FASE 6: Discount Override");

  // No override → null
  const ctx1 = makeCtx();
  const r1 = evaluateDiscountOverride(ctx1, cfg);
  assert(r1 === null, "No override → null");

  // Valid override with reason
  const ctx2 = makeCtx({
    discount: { type: "percentage", value: 10 },
    discountOverride: { by: "admin@castillitos.com", at: "2026-07-14T10:00:00Z", reason: "Cliente preferencial" },
  });
  const r2 = evaluateDiscountOverride(ctx2, cfg);
  assert(r2 !== null, "Override present");
  assert(r2!.overrideApplied, "Override applied");
  assert(r2!.overriddenBy === "admin@castillitos.com", "User recorded");
  assert(r2!.reason === "Cliente preferencial", "Reason recorded");

  // Override without reason (required)
  const ctx3 = makeCtx({
    discount: { type: "percentage", value: 10 },
    discountOverride: { by: "user@test.com", at: "2026-07-14T10:00:00Z", reason: "" },
  });
  const r3 = evaluateDiscountOverride(ctx3, cfg);
  assert(r3 !== null, "Override attempt present");
  assert(!r3!.overrideApplied, "Override NOT applied (no reason)");
  assert(r3!.evidence.severity === "high", "High severity for invalid override");
}

function testOrderReadiness(): void {
  section("FASE 7: Order Readiness");

  // READY — everything ok
  const ctxOk = makeCtx();
  const brOk = evaluateCustomerBranch(ctxOk);
  const crOk = evaluateCustomerCredit(ctxOk, cfg);
  const dlOk = evaluatePartialDelivery(ctxOk, cfg);
  const rOk = evaluateOrderReadiness(ctxOk, brOk, crOk, dlOk, cfg);
  assert(rOk.status === "READY", "All ok → READY");
  assert(rOk.canSubmit, "Can submit");

  // WARNING — credit warning
  const ctxWarn = makeCtx({ credit: { totalReceivable: 500000, overdueReceivable: 200000, maxDaysPastDue: 35 } });
  const brWarn = evaluateCustomerBranch(ctxWarn);
  const crWarn = evaluateCustomerCredit(ctxWarn, cfg);
  const dlWarn = evaluatePartialDelivery(ctxWarn, cfg);
  const rWarn = evaluateOrderReadiness(ctxWarn, brWarn, crWarn, dlWarn, cfg);
  assert(rWarn.status === "WARNING", "Credit warning → WARNING");
  assert(rWarn.canSubmit, "Can still submit (warning only)");

  // BLOCKED — no lines
  const ctxBlocked = makeCtx({ lines: [], totalUnits: 0 });
  const brBlocked = evaluateCustomerBranch(ctxBlocked);
  const crBlocked = evaluateCustomerCredit(ctxBlocked, cfg);
  const dlBlocked = evaluatePartialDelivery(ctxBlocked, cfg);
  const rBlocked = evaluateOrderReadiness(ctxBlocked, brBlocked, crBlocked, dlBlocked, cfg);
  assert(rBlocked.status === "BLOCKED", "No lines → BLOCKED");
  assert(!rBlocked.canSubmit, "Cannot submit");
}

function testEvidenceThreeQuestions(): void {
  section("FASE 8: Evidence (Three Questions)");

  const ctx = makeCtx();
  const branch = evaluateCustomerBranch(ctx);
  const ev = branch.evidence;

  assert(ev.activationReason.length > 10, "Q1: WHY — activationReason descriptive");
  assert(Object.keys(ev.dataUsed).length > 0, "Q2: WHAT DATA — dataUsed populated");
  assert(ev.recommendedAction.length > 10, "Q3: WHAT ACTION — recommendedAction descriptive");
  assert(ev.actionRationale.length > 10, "Q3: WHY — actionRationale descriptive");
  assert(ev.confidence > 0 && ev.confidence <= 1, "Confidence 0-1");
  assert(!!ev.evaluatedAt, "Timestamp present");
}

function testFullEvaluation(): void {
  section("FULL EVALUATION: evaluateOrderPolicyPack");

  const ctx = makeCtx();
  const sizes: SizeInventorySnapshot[] = [{
    referenceCode: "REF-001",
    productName: "Camiseta A",
    sizes: [
      { size: "S", sizeName: "Pequena", availableUnits: 5 },
      { size: "M", sizeName: "Mediana", availableUnits: 5 },
    ],
  }];

  const result = evaluateOrderPolicyPack(cfg, ctx, sizes);

  assert(result.tenantId === "castillitos", "Tenant = castillitos");
  assert(result.policyPackVersion === "1.0.0", "Version = 1.0.0");
  assert(result.branch.selectionMode === "auto_single", "Branch evaluated");
  assert(result.credit.creditStatus === "approved", "Credit evaluated");
  assert(result.autoSizeDistributions.length === 1, "1 size distribution");
  assert(result.delivery.deliveryStatus === "COMPLETE", "Delivery evaluated");
  assert(result.readiness.status === "READY", "Readiness evaluated");
  assert(result.allEvidence.length >= 5, "All evidence collected");
}

function testConfigDecoupling(): void {
  section("FASE 9: Configuration Decoupling");

  assert(cfg.customerCredit.warningDaysPastDue === 30, "Credit warning = 30 from config");
  assert(cfg.customerCredit.criticalDaysPastDue === 60, "Credit critical = 60 from config");
  assert(cfg.autoSizeDistribution.maxUnitsPerSize === 50, "Max per size = 50 from config");
  assert(cfg.partialDelivery.partialDeliveryEnabled, "Partial delivery enabled from config");
  assert(cfg.discountOverride.requireReason, "Discount reason required from config");
  assert(cfg.orderReadiness.minOrderUnits === 1, "Min order units = 1 from config");
}

function testDomainSeparation(): void {
  section("SEPARATION: No Tiendas/Maletas references");

  const policies = getCastillitosOrderPolicies();
  for (const p of policies) {
    assert(!p.tags.includes("tiendas"), `${p.id}: no "tiendas" tag`);
    assert(!p.tags.includes("maletas"), `${p.id}: no "maletas" tag`);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  CASTILLITOS-ORDER-POLICY-PACK-01 — QA Tests");
  console.log("═══════════════════════════════════════════════════════════════");

  testPolicyPackRegistration();
  testCustomerBranch();
  testCustomerCredit();
  testAutoSizeDistribution();
  testPartialDelivery();
  testDiscountOverride();
  testOrderReadiness();
  testEvidenceThreeQuestions();
  testFullEvaluation();
  testConfigDecoupling();
  testDomainSeparation();

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  if (failed > 0) process.exit(1);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
