/**
 * scripts/_test-order-assistant-01.ts
 *
 * QA Tests for ORDER-ASSISTANT-01.
 *
 * Run: npx tsx scripts/_test-order-assistant-01.ts
 *
 * Tests the pure engine (assembleOrderAssistant) with various
 * customer scenarios. Does NOT test the server-only loader.
 *
 * Sprint: ORDER-ASSISTANT-01
 */

import { assembleOrderAssistant } from "../lib/comercial/pedidos/order-assistant-engine";
import type { PreOrderData } from "../lib/comercial/pedidos/order-assistant-engine";
import { CASTILLITOS_ORDER_POLICY_PACK_CONFIG } from "../lib/comercial/pedidos/order-policy-pack-config";
import type { CustomerBranchInfo } from "../lib/comercial/pedidos/order-decision-types";

// ── Test helpers ────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function check(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

function section(title: string): void {
  const pad = Math.max(0, 60 - title.length);
  console.log(`\n── ${title} ${"─".repeat(pad)}`);
}

// ── Test data builders ──────────────────────────────────────────────────────

function makeCustomer(overrides?: Partial<PreOrderData["customer"]>): PreOrderData["customer"] {
  return {
    customerId: "C-001",
    customerName: "Comercializadora XYZ",
    customerCode: "900123456",
    nit: "900123456-1",
    city: "Medellin",
    status: "ACTIVE",
    segment: "Mayorista",
    sagCode: "T-001",
    sellerName: "Carlos Lopez",
    sellerConfidence: 85,
    ...overrides,
  };
}

function makeBranch(code: string, name: string, isMain: boolean = false): CustomerBranchInfo {
  return { branchCode: code, name, address: `Calle ${code}`, city: "Medellin", isMain, active: true };
}

function makeRecentOrder(daysAgo: number, value: number): PreOrderData["recentOrders"][0] {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return {
    id: `ORD-${daysAgo}`,
    consecutivo: 100 + daysAgo,
    totalReferences: 5,
    totalUnits: 30,
    totalValue: value,
    status: "confirmado",
    origin: "agentik",
    createdAt: d.toISOString(),
    daysSinceOrder: daysAgo,
  };
}

function makeData(overrides?: Partial<PreOrderData>): PreOrderData {
  return {
    customer: makeCustomer(),
    branches: [makeBranch("SUC-001", "Sede Principal", true)],
    credit: { totalReceivable: 0, overdueReceivable: 0, maxDaysPastDue: 0 },
    recentOrders: [],
    hasInventory: true,
    ...overrides,
  };
}

const config = CASTILLITOS_ORDER_POLICY_PACK_CONFIG;

// ── Tests ───────────────────────────────────────────────────────────────────

console.log("═══════════════════════════════════════════════════════════════");
console.log("  ORDER-ASSISTANT-01 — QA Tests");
console.log("═══════════════════════════════════════════════════════════════");

// ── Scenario 1: Ideal customer ──────────────────────────────────────────────

section("Scenario 1: Ideal customer (no issues)");
{
  const result = assembleOrderAssistant(makeData(), config);

  check(result.tenantId === "castillitos", "Tenant = castillitos");
  check(result.customer.customerName === "Comercializadora XYZ", "Customer name correct");
  check(result.customer.nit === "900123456-1", "Customer NIT present");
  check(result.customer.city === "Medellin", "Customer city present");
  check(result.customer.sellerName === "Carlos Lopez", "Seller name present");
  check(result.customer.sellerConfidence === 85, "Seller confidence present");
  check(result.branches.selectionMode === "auto_single", "Single branch auto-selected");
  check(result.branches.selectedBranch !== null, "Branch selected");
  check(result.credit.creditStatus === "approved", "Credit approved");
  check(result.credit.maxDaysPastDue === 0, "No days past due");
  check(result.status === "recommended", "Status = recommended");
  check(result.confidence >= 0.9, `Confidence high (${result.confidence})`);
  check(result.alerts.length === 0, "No alerts");
  check(result.autoSurtido.available === true, "Auto surtido available");
  check(result.evidence.length >= 3, `Evidence items (${result.evidence.length})`);
}

// ── Scenario 2: Customer with cartera vencida (warning) ─────────────────────

section("Scenario 2: Cartera warning (42 days)");
{
  const result = assembleOrderAssistant(
    makeData({ credit: { totalReceivable: 5_000_000, overdueReceivable: 3_280_000, maxDaysPastDue: 42 } }),
    config,
  );

  check(result.credit.creditStatus === "warning", "Credit = warning");
  check(result.credit.maxDaysPastDue === 42, "42 days past due");
  check(result.credit.overdueReceivable === 3_280_000, "Overdue = 3.28M");
  check(result.credit.alerts.length === 1, "1 credit alert");
  check(result.status === "caution", "Status = caution");
  check(result.confidence < 0.95, `Confidence reduced (${result.confidence})`);
  check(result.alerts.some(a => a.dimension === "Cartera"), "Cartera alert present");
  check(result.recommendedActions.some(a => a.action.includes("cartera")), "Cartera action recommended");
}

// ── Scenario 3: Customer with cartera critica (60+ days) ────────────────────

section("Scenario 3: Cartera critical (75 days)");
{
  const result = assembleOrderAssistant(
    makeData({ credit: { totalReceivable: 8_000_000, overdueReceivable: 6_500_000, maxDaysPastDue: 75 } }),
    config,
  );

  check(result.credit.creditStatus === "blocked", "Credit = blocked");
  check(result.credit.alerts[0].severity === "critical", "Alert severity = critical");
  check(result.alerts.some(a => a.severity === "critical"), "Critical alert present");
  check(result.recommendedActions.some(a => a.action.includes("Revisar cartera")), "Review cartera action");
}

// ── Scenario 4: Multiple branches ───────────────────────────────────────────

section("Scenario 4: Multiple branches (requires selection)");
{
  const result = assembleOrderAssistant(
    makeData({
      branches: [
        makeBranch("SUC-001", "Sede Principal", true),
        makeBranch("SUC-002", "Bodega Norte", false),
        makeBranch("SUC-003", "Tienda Sur", false),
        makeBranch("SUC-004", "Punto Oriente", false),
      ],
    }),
    config,
  );

  check(result.branches.selectionMode === "requires_selection", "Requires selection");
  check(result.branches.availableBranches.length === 4, "4 branches available");
  check(result.branches.selectedBranch === null, "No branch pre-selected");
  check(result.alerts.some(a => a.dimension === "Sucursal"), "Branch alert present");
  check(result.recommendedActions.some(a => a.action.includes("sucursales")), "Branch selection action");
}

// ── Scenario 5: No branches ─────────────────────────────────────────────────

section("Scenario 5: No branches");
{
  const result = assembleOrderAssistant(
    makeData({ branches: [] }),
    config,
  );

  check(result.branches.selectionMode === "no_branches", "No branches");
  check(result.alerts.some(a => a.dimension === "Sucursal" && a.severity === "warning"), "Branch warning");
  check(result.recommendedActions.some(a => a.action.includes("Registrar sucursal")), "Register branch action");
}

// ── Scenario 6: Recent order (potential duplicate) ──────────────────────────

section("Scenario 6: Very recent order (3 days ago)");
{
  const result = assembleOrderAssistant(
    makeData({ recentOrders: [makeRecentOrder(3, 2_500_000)] }),
    config,
  );

  check(result.recentOrders.length === 1, "1 recent order");
  check(result.recentOrders[0].daysSinceOrder === 3, "3 days ago");
  check(result.recommendedActions.some(a => a.action.includes("pedido reciente")), "Duplicate warning action");
}

// ── Scenario 7: No recent orders ────────────────────────────────────────────

section("Scenario 7: No recent orders");
{
  const result = assembleOrderAssistant(
    makeData({ recentOrders: [makeRecentOrder(45, 1_000_000)] }),
    config,
  );

  check(result.recentOrders.length === 1, "1 order in history");
  check(!result.recommendedActions.some(a => a.action.includes("pedido reciente")), "No duplicate warning (>7 days)");
}

// ── Scenario 8: No inventory sync ───────────────────────────────────────────

section("Scenario 8: No inventory data");
{
  const result = assembleOrderAssistant(
    makeData({ hasInventory: false }),
    config,
  );

  check(result.autoSurtido.available === false, "Auto surtido NOT available");
  check(result.autoSurtido.reason.includes("Sin datos"), "Reason explains missing inventory");
}

// ── Scenario 9: Incomplete customer data ────────────────────────────────────

section("Scenario 9: Incomplete customer (no NIT, no city, no seller)");
{
  const result = assembleOrderAssistant(
    makeData({
      customer: makeCustomer({
        nit: null,
        city: null,
        sellerName: null,
        sellerConfidence: 0,
      }),
    }),
    config,
  );

  check(result.customer.nit === null, "NIT missing");
  check(result.customer.city === null, "City missing");
  check(result.customer.sellerName === null, "Seller missing");
  check(result.confidence < 0.9, `Confidence reduced for incomplete data (${result.confidence})`);
  // But should still be recommended if no credit issues
  check(result.status === "recommended" || result.status === "caution", "Status not blocked");
}

// ── Scenario 10: Combined worst case ────────────────────────────────────────

section("Scenario 10: Worst case (critical cartera + no branches + no inventory)");
{
  const result = assembleOrderAssistant(
    makeData({
      branches: [],
      credit: { totalReceivable: 10_000_000, overdueReceivable: 8_000_000, maxDaysPastDue: 90 },
      hasInventory: false,
      customer: makeCustomer({ nit: null, sellerName: null, sellerConfidence: 0 }),
    }),
    config,
  );

  check(result.credit.creditStatus === "blocked", "Credit blocked");
  check(result.branches.selectionMode === "no_branches", "No branches");
  check(result.autoSurtido.available === false, "No auto surtido");
  check(result.alerts.length >= 2, `Multiple alerts (${result.alerts.length})`);
  check(result.recommendedActions.length >= 2, `Multiple actions (${result.recommendedActions.length})`);
  check(result.confidence <= 0.5, `Very low confidence (${result.confidence})`);
}

// ── Evidence contract ───────────────────────────────────────────────────────

section("Evidence: Three-question contract");
{
  const result = assembleOrderAssistant(makeData(), config);

  for (const ev of result.evidence) {
    check(ev.activationReason.length > 10, `${ev.policyType}: activationReason descriptive`);
    check(Object.keys(ev.dataUsed).length > 0, `${ev.policyType}: dataUsed populated`);
    check(ev.recommendedAction.length > 5, `${ev.policyType}: recommendedAction descriptive`);
    check(ev.actionRationale.length > 5, `${ev.policyType}: actionRationale descriptive`);
    check(ev.confidence >= 0 && ev.confidence <= 1, `${ev.policyType}: confidence 0-1`);
    check(ev.evaluatedAt.length > 10, `${ev.policyType}: timestamp present`);
  }
}

// ── Policy results passthrough ──────────────────────────────────────────────

section("Policy results: raw passthrough available");
{
  const result = assembleOrderAssistant(makeData(), config);

  check(result.policyResults.branch !== undefined, "Branch policy result available");
  check(result.policyResults.credit !== undefined, "Credit policy result available");
  check(result.policyResults.readiness !== undefined, "Readiness policy result available");
  check(result.policyResults.branch.evidence !== undefined, "Branch evidence in raw result");
  check(result.policyResults.credit.evidence !== undefined, "Credit evidence in raw result");
  check(result.policyResults.readiness.evidence !== undefined, "Readiness evidence in raw result");
}

// ── Immutability: assistant never modifies ──────────────────────────────────

section("Immutability: read-only contract");
{
  const data = makeData();
  const originalBranches = [...data.branches];
  const originalCredit = { ...data.credit };

  assembleOrderAssistant(data, config);

  check(data.branches.length === originalBranches.length, "Input branches not mutated");
  check(data.credit.maxDaysPastDue === originalCredit.maxDaysPastDue, "Input credit not mutated");
}

// ── Actions sorted by priority ──────────────────────────────────────────────

section("Actions: sorted by priority descending");
{
  const result = assembleOrderAssistant(
    makeData({
      branches: [],
      credit: { totalReceivable: 5_000_000, overdueReceivable: 3_000_000, maxDaysPastDue: 42 },
      recentOrders: [makeRecentOrder(2, 1_500_000)],
    }),
    config,
  );

  check(result.recommendedActions.length >= 3, `At least 3 actions (${result.recommendedActions.length})`);

  let sorted = true;
  for (let i = 1; i < result.recommendedActions.length; i++) {
    if (result.recommendedActions[i].priority > result.recommendedActions[i - 1].priority) {
      sorted = false;
      break;
    }
  }
  check(sorted, "Actions sorted by priority descending");
}

// ── Results ─────────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(60)}`);
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(60)}`);

if (failed > 0) {
  process.exit(1);
}
