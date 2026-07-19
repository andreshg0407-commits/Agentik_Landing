/**
 * scripts/_test-sales-rep-policy-pack-01.ts
 *
 * FASE 16 — 57 functional QA tests for SalesRep Policy Pack.
 * Run: npx tsx scripts/_test-sales-rep-policy-pack-01.ts
 *
 * Sprint: SALES-REP-POLICY-PACK-01
 */

import {
  evaluateMalletOutOfStock,
  evaluateMalletReplacement,
  evaluateCustomerReceivablesAlert,
  evaluateCustomerInactivity,
  evaluateCustomerPriority,
  buildSalesRepMalletState,
  buildOrderFulfillmentState,
  buildSalesRepDailyState,
} from "../lib/comercial/sales-reps/sales-rep-decision-engine";

import {
  buildOutOfStockAlert,
  buildReplacementAlert,
  buildOverdueReceivableAlert,
  buildInactiveCustomerAlert,
  buildOrderFollowUpAlert,
  buildDataQualityAlert,
  buildAllAlerts,
} from "../lib/comercial/sales-reps/sales-rep-alerts";

import { buildMobileContract, getMobileCapabilityCount } from "../lib/comercial/sales-reps/sales-rep-read-models";

import {
  bridgeToCommercialEvidence,
  summarizeDailyEvidence,
  validateEvidence,
  validateAllEvidence,
} from "../lib/comercial/sales-reps/sales-rep-evidence";

import {
  registerCastillitosRepPolicyPack,
  getCastillitosRepPolicies,
  CASTILLITOS_SALESREP_POLICY_COUNT,
} from "../lib/comercial/sales-reps/sales-rep-policy-pack";

import { CASTILLITOS_SALESREP_POLICY_PACK_CONFIG } from "../lib/comercial/sales-reps/sales-rep-policy-pack-config";

import type {
  SalesRepPolicyContext,
  MalletItemInput,
  CustomerInput,
  ReplacementCandidateInput,
  OrderInput,
  MalletStateInput,
  SalesRepProfile,
  MalletOutOfStockResult,
  SalesRepEvidenceItem,
} from "../lib/comercial/sales-reps/sales-rep-decision-types";

// ── Helpers ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let currentSection = "";

function section(title: string) {
  currentSection = title;
  const pad = Math.max(0, 60 - title.length);
  console.log(`\n${"─".repeat(pad)} ${title} ${"─".repeat(pad)}`);
}

function assert(label: string, condition: boolean) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ FAIL: ${label}`);
  }
}

// ── Test data ──────────────────────────────────────────────────────────────

const CTX: SalesRepPolicyContext = { tenantId: "castillitos", salesRepId: "SR-001", salesRepName: "David" };
const CONFIG = CASTILLITOS_SALESREP_POLICY_PACK_CONFIG;

const MALLET_ITEMS: MalletItemInput[] = [
  { reference: "REF-001", productName: "Producto A", photoUrl: null, currentMalletUnits: 5, availableInventory: 0, groupCode: "G1", subgroupCode: "SG1", sizeClass: "M", line: "L1" },
  { reference: "REF-002", productName: "Producto B", photoUrl: null, currentMalletUnits: 3, availableInventory: -2, groupCode: "G1", subgroupCode: "SG1", sizeClass: "L", line: "L1" },
  { reference: "REF-003", productName: "Producto C", photoUrl: null, currentMalletUnits: 10, availableInventory: 50, groupCode: "G2", subgroupCode: "SG2", sizeClass: "S", line: "L2" },
];

const REPLACEMENT_CANDIDATES: ReplacementCandidateInput[] = [
  { reference: "REP-001", productName: "Reemplazo A", photoUrl: null, availableUnits: 20, groupCode: "G1", subgroupCode: "SG1", sizeClass: "M", line: "L1", quality: 0.8, freshness: 0.9, salesVelocity: 5 },
  { reference: "REP-002", productName: "Reemplazo B", photoUrl: null, availableUnits: 10, groupCode: "G1", subgroupCode: "SG1", sizeClass: "L", line: "L1", quality: 0.5, freshness: 0.6, salesVelocity: 3 },
  { reference: "REP-003", productName: "Reemplazo C", photoUrl: null, availableUnits: 0, groupCode: "G1", subgroupCode: "SG1", sizeClass: "M", line: "L1", quality: 0.9, freshness: 0.9, salesVelocity: 8 },
  { reference: "REP-004", productName: "Reemplazo D", photoUrl: null, availableUnits: 5, groupCode: "G2", subgroupCode: "SG2", sizeClass: "S", line: "L2", quality: 0.1, freshness: 0.1, salesVelocity: 1 },
];

function makeCustomer(overrides: Partial<CustomerInput> = {}): CustomerInput {
  return {
    customerId: "CUST-001",
    customerName: "Cliente Test",
    assignedSalesRepId: "SR-001",
    lastPurchaseAt: new Date(Date.now() - 45 * 86400000).toISOString(),
    purchaseCount: 5,
    lifetimeSales: 3_000_000,
    receivables: {
      totalBalance: 500_000,
      overdueBalance: 100_000,
      maxDaysPastDue: 15,
      oldestOverdueDocument: "FV-001",
      oldestOverdueAmount: 50_000,
      overdueDocumentCount: 2,
      dataStatus: "AVAILABLE",
    },
    ...overrides,
  };
}

function makeOrder(overrides: Partial<OrderInput> = {}): OrderInput {
  return {
    orderId: "PED-001",
    customer: "Cliente Test",
    branch: "Sucursal 1",
    createdAt: new Date().toISOString(),
    requestedUnits: 100,
    fulfilledUnits: 50,
    invoicedUnits: 30,
    dispatchedUnits: 20,
    deliveredUnits: 10,
    status: "parcialmente_cumplido",
    blockers: [],
    lastSyncAt: new Date().toISOString(),
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════════════

section("1: Policy Pack Registration");
{
  const result = registerCastillitosRepPolicyPack();
  assert("registerCastillitosRepPolicyPack() succeeds", result.success);
  assert(`Registers ${CASTILLITOS_SALESREP_POLICY_COUNT} policies`, result.registered === CASTILLITOS_SALESREP_POLICY_COUNT);
  assert("No registration errors", result.errors.length === 0 || result.errors[0] === "Already registered");

  const policies = getCastillitosRepPolicies();
  assert("getCastillitosRepPolicies() returns 7", policies.length === 7);
  assert("All policies have tenantId=castillitos", policies.every(p => p.tenantId === "castillitos"));
  assert("All policies have ACTIVE status", policies.every(p => p.status === "ACTIVE"));
  assert("All policies have versionInfo", policies.every(p => p.versionInfo?.version === "1.0.0"));
}

section("2: Mallet Out-of-Stock Detection");
{
  const results = evaluateMalletOutOfStock(CTX, "MAL-001", MALLET_ITEMS, CONFIG);
  assert("Detects 2 out-of-stock items (REF-001 inv=0, REF-002 inv=-2)", results.length === 2);
  assert("REF-003 (inv=50) NOT flagged", !results.some(r => r.reference === "REF-003"));

  const ref001 = results.find(r => r.reference === "REF-001")!;
  assert("REF-001: reason mentions agotada", ref001.reason.includes("agotada"));
  assert("REF-001: confidence = 0.95", ref001.confidence === 0.95);

  const ref002 = results.find(r => r.reference === "REF-002")!;
  assert("REF-002: reason mentions negativo", ref002.reason.includes("negativo"));
  assert("REF-002: confidence = 0.99 (negative inventory)", ref002.confidence === 0.99);
  assert("REF-002: evidence severity = critical", ref002.evidence.severity === "critical");
}

section("3: Empty Mallet — No False Positives");
{
  const results = evaluateMalletOutOfStock(CTX, "MAL-EMPTY", [], CONFIG);
  assert("Empty mallet returns 0 results", results.length === 0);
}

section("4: All Items In Stock");
{
  const inStockItems: MalletItemInput[] = [
    { reference: "OK-1", productName: "Ok A", photoUrl: null, currentMalletUnits: 5, availableInventory: 100, groupCode: "G1", subgroupCode: "SG1", sizeClass: "M", line: "L1" },
    { reference: "OK-2", productName: "Ok B", photoUrl: null, currentMalletUnits: 3, availableInventory: 50, groupCode: "G1", subgroupCode: "SG1", sizeClass: "L", line: "L1" },
  ];
  const results = evaluateMalletOutOfStock(CTX, "MAL-OK", inStockItems, CONFIG);
  assert("All in-stock items return 0 results", results.length === 0);
}

section("5: Replacement Suggestions");
{
  const outOfStock = evaluateMalletOutOfStock(CTX, "MAL-001", MALLET_ITEMS, CONFIG);
  const ref001 = outOfStock.find(r => r.reference === "REF-001")!;

  const replacements = evaluateMalletReplacement(ref001, REPLACEMENT_CANDIDATES, CONFIG);
  assert("Finds at least 1 replacement", replacements.length >= 1);
  assert("Max 3 replacements (config)", replacements.length <= CONFIG.outOfStock.maxReplacementSuggestions);
  assert("REP-003 excluded (0 available units)", !replacements.some(r => r.suggestedReference === "REP-003"));
  assert("REP-004 excluded (quality < 0.3)", !replacements.some(r => r.suggestedReference === "REP-004"));
  assert("suggestedUnits capped to currentMalletUnits", replacements.every(r => r.suggestedUnits <= ref001.currentMalletUnits));
}

section("6: Receivable — Exactly at Threshold (30 days)");
{
  const customer = makeCustomer({
    receivables: { totalBalance: 200_000, overdueBalance: 100_000, maxDaysPastDue: 30, oldestOverdueDocument: "FV-X", oldestOverdueAmount: 50_000, overdueDocumentCount: 1, dataStatus: "AVAILABLE" },
  });
  const result = evaluateCustomerReceivablesAlert(CTX, customer, CONFIG);
  assert("30 days exactly = NO alert (STRICTLY GREATER THAN)", result.alertSeverity === "info");
  assert("30 days exactly = allowOrder true", result.allowOrder === true);
  assert("30 days exactly = requireAcknowledgement false", result.requireAcknowledgement === false);
}

section("7: Receivable — 31 Days (Just Over Threshold)");
{
  const customer = makeCustomer({
    receivables: { totalBalance: 200_000, overdueBalance: 100_000, maxDaysPastDue: 31, oldestOverdueDocument: "FV-X", oldestOverdueAmount: 50_000, overdueDocumentCount: 1, dataStatus: "AVAILABLE" },
  });
  const result = evaluateCustomerReceivablesAlert(CTX, customer, CONFIG);
  assert("31 days = WARNING severity", result.alertSeverity === "warning");
  assert("31 days = requireAcknowledgement true", result.requireAcknowledgement === true);
}

section("8: Receivable — Critical (>60 days)");
{
  const customer = makeCustomer({
    receivables: { totalBalance: 500_000, overdueBalance: 300_000, maxDaysPastDue: 75, oldestOverdueDocument: "FV-OLD", oldestOverdueAmount: 200_000, overdueDocumentCount: 5, dataStatus: "AVAILABLE" },
  });
  const result = evaluateCustomerReceivablesAlert(CTX, customer, CONFIG);
  assert("75 days = CRITICAL severity", result.alertSeverity === "critical");
}

section("9: Receivable — No Data");
{
  const customer = makeCustomer({ receivables: null });
  const result = evaluateCustomerReceivablesAlert(CTX, customer, CONFIG);
  assert("No receivables = info severity", result.alertSeverity === "info");
  assert("No receivables = low confidence (0.3)", result.confidence === 0.3);
  assert("No receivables = missing data includes receivables_data", result.evidence.missingData.includes("receivables_data"));
}

section("10: Inactive Customer — Active (45 days)");
{
  const customer = makeCustomer({ lastPurchaseAt: new Date(Date.now() - 45 * 86400000).toISOString() });
  const result = evaluateCustomerInactivity(CTX, customer, CONFIG);
  assert("45 days = ACTIVE", result.activityStatus === "ACTIVE");
  assert("45 days = LOW priority", result.priority === "LOW");
}

section("11: Inactive Customer — At Risk (65 days)");
{
  const customer = makeCustomer({ lastPurchaseAt: new Date(Date.now() - 65 * 86400000).toISOString() });
  const result = evaluateCustomerInactivity(CTX, customer, CONFIG);
  assert("65 days = AT_RISK", result.activityStatus === "AT_RISK");
  assert("65 days = MEDIUM priority", result.priority === "MEDIUM");
}

section("12: Inactive Customer — Inactive (120 days)");
{
  const customer = makeCustomer({ lastPurchaseAt: new Date(Date.now() - 120 * 86400000).toISOString() });
  const result = evaluateCustomerInactivity(CTX, customer, CONFIG);
  assert("120 days = INACTIVE", result.activityStatus === "INACTIVE");
  assert("120 days = HIGH priority", result.priority === "HIGH");
  assert("Evidence severity = high", result.evidence.severity === "high");
}

section("13: Inactive Customer — Never Purchased");
{
  const customer = makeCustomer({ lastPurchaseAt: null, purchaseCount: 0 });
  const result = evaluateCustomerInactivity(CTX, customer, CONFIG);
  assert("Never purchased = NEVER_PURCHASED", result.activityStatus === "NEVER_PURCHASED");
  assert("Reason distinguishes new client", result.recommendedAction.includes("nunca ha comprado"));
}

section("14: Inactive Customer — Insufficient Data");
{
  const customer = makeCustomer({ lastPurchaseAt: null, purchaseCount: 3 });
  const result = evaluateCustomerInactivity(CTX, customer, CONFIG);
  assert("Has purchases but no date = INSUFFICIENT_DATA", result.activityStatus === "INSUFFICIENT_DATA");
  assert("Low confidence (0.3)", result.confidence === 0.3);
}

section("15: Customer Priority — High Priority Client");
{
  const customer = makeCustomer({
    lastPurchaseAt: new Date(Date.now() - 120 * 86400000).toISOString(),
    lifetimeSales: 15_000_000,
    purchaseCount: 12,
    receivables: { totalBalance: 800_000, overdueBalance: 500_000, maxDaysPastDue: 75, oldestOverdueDocument: "FV-X", oldestOverdueAmount: 200_000, overdueDocumentCount: 3, dataStatus: "AVAILABLE" },
  });
  const inactivity = evaluateCustomerInactivity(CTX, customer, CONFIG);
  const receivable = evaluateCustomerReceivablesAlert(CTX, customer, CONFIG);
  const result = evaluateCustomerPriority(CTX, customer, inactivity, receivable, CONFIG);
  assert("High-priority client = HIGH", result.priority === "HIGH");
  assert("Total score >= 70", result.totalScore >= 70);
  assert("Has 6 factors", result.factors.length === 6);
}

section("16: Customer Priority — Low Priority Client");
{
  const customer = makeCustomer({
    lastPurchaseAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    lifetimeSales: 500_000,
    purchaseCount: 2,
    receivables: { totalBalance: 50_000, overdueBalance: 0, maxDaysPastDue: 0, oldestOverdueDocument: null, oldestOverdueAmount: 0, overdueDocumentCount: 0, dataStatus: "AVAILABLE" },
  });
  const inactivity = evaluateCustomerInactivity(CTX, customer, CONFIG);
  const receivable = evaluateCustomerReceivablesAlert(CTX, customer, CONFIG);
  const result = evaluateCustomerPriority(CTX, customer, inactivity, receivable, CONFIG);
  assert("Low-priority client = LOW", result.priority === "LOW");
  assert("Total score < 40", result.totalScore < 40);
}

section("17: Customer Priority — Unresolved (no data)");
{
  const customer = makeCustomer({ lastPurchaseAt: null, lifetimeSales: null, receivables: null, purchaseCount: 0 });
  const inactivity = evaluateCustomerInactivity(CTX, customer, CONFIG);
  const receivable = evaluateCustomerReceivablesAlert(CTX, customer, CONFIG);
  const result = evaluateCustomerPriority(CTX, customer, inactivity, receivable, CONFIG);
  assert("No data = UNRESOLVED", result.priority === "UNRESOLVED");
  assert("Low confidence (0.3)", result.confidence === 0.3);
}

section("18: Mallet State — Complete");
{
  const malletInput: MalletStateInput = { malletId: "MAL-001", completionPercentage: 100, completeGroups: 5, totalGroups: 5, missingEntries: 0, excessEntries: 0, unresolvedItems: 0 };
  const state = buildSalesRepMalletState(CTX, malletInput, [], []);
  assert("100% + 0 out-of-stock = COMPLETE", state.status === "COMPLETE");
}

section("19: Mallet State — Incomplete");
{
  const malletInput: MalletStateInput = { malletId: "MAL-002", completionPercentage: 80, completeGroups: 4, totalGroups: 5, missingEntries: 2, excessEntries: 1, unresolvedItems: 1 };
  const outOfStock = evaluateMalletOutOfStock(CTX, "MAL-002", [MALLET_ITEMS[0]], CONFIG);
  const state = buildSalesRepMalletState(CTX, malletInput, outOfStock, []);
  assert("80% + 1 out-of-stock = INCOMPLETE", state.status === "INCOMPLETE");
}

section("20: Mallet State — Critical");
{
  const malletInput: MalletStateInput = { malletId: "MAL-003", completionPercentage: 30, completeGroups: 1, totalGroups: 5, missingEntries: 10, excessEntries: 3, unresolvedItems: 5 };
  const state = buildSalesRepMalletState(CTX, malletInput, [], []);
  assert("<50% completion = CRITICAL", state.status === "CRITICAL");
}

section("21: Mallet State — No Data");
{
  const malletInput: MalletStateInput = { malletId: "MAL-EMPTY", completionPercentage: 0, completeGroups: 0, totalGroups: 0, missingEntries: 0, excessEntries: 0, unresolvedItems: 0 };
  const state = buildSalesRepMalletState(CTX, malletInput, [], []);
  assert("0% + 0 groups = NO_DATA", state.status === "NO_DATA");
}

section("22: Order Fulfillment — Partially Fulfilled");
{
  const order = makeOrder({ status: "parcialmente_cumplido" });
  const state = buildOrderFulfillmentState(order, CONFIG);
  assert("Status resolves to PARTIALLY_FULFILLED", state.currentStatus === "PARTIALLY_FULFILLED");
  assert("Has milestones", state.milestones.length > 0);
  assert("Freshness = HOY (synced just now)", state.freshness === "HOY");
}

section("23: Order Fulfillment — Unknown Status");
{
  const order = makeOrder({ status: "estado_raro_desconocido" });
  const state = buildOrderFulfillmentState(order, CONFIG);
  assert("Unknown status = UNKNOWN", state.currentStatus === "UNKNOWN");
}

section("24: Order Fulfillment — Stale Sync");
{
  const order = makeOrder({ lastSyncAt: new Date(Date.now() - 100 * 3600000).toISOString() });
  const state = buildOrderFulfillmentState(order, CONFIG);
  assert("100h ago = DESACTUALIZADO", state.freshness === "DESACTUALIZADO");
}

section("25: Order Fulfillment — No Sync");
{
  const order = makeOrder({ lastSyncAt: null });
  const state = buildOrderFulfillmentState(order, CONFIG);
  assert("No sync = SIN_DATOS", state.freshness === "SIN_DATOS");
  assert("Low confidence (0.3)", state.evidence.confidence === 0.3);
}

section("26: Alert Builder — Out of Stock");
{
  const outOfStock = evaluateMalletOutOfStock(CTX, "MAL-001", MALLET_ITEMS, CONFIG);
  const alert = buildOutOfStockAlert(CTX, outOfStock[0], CONFIG);
  assert("Alert type = MALLET_ITEM_OUT_OF_STOCK", alert.type === "MALLET_ITEM_OUT_OF_STOCK");
  assert("Alert has deduplicationKey", alert.deduplicationKey.length > 0);
  assert("Related entity type = product", alert.relatedEntity.type === "product");
}

section("27: Alert Builder — Overdue Receivable (no alert for info)");
{
  const customer = makeCustomer({ receivables: { totalBalance: 100_000, overdueBalance: 0, maxDaysPastDue: 10, oldestOverdueDocument: null, oldestOverdueAmount: 0, overdueDocumentCount: 0, dataStatus: "AVAILABLE" } });
  const result = evaluateCustomerReceivablesAlert(CTX, customer, CONFIG);
  const alert = buildOverdueReceivableAlert(CTX, result, CONFIG);
  assert("No alert for info severity (10 days)", alert === null);
}

section("28: Alert Builder — Inactive Customer Alert");
{
  const customer = makeCustomer({ lastPurchaseAt: new Date(Date.now() - 120 * 86400000).toISOString() });
  const result = evaluateCustomerInactivity(CTX, customer, CONFIG);
  const alert = buildInactiveCustomerAlert(CTX, result, CONFIG);
  assert("Alert generated for INACTIVE", alert !== null);
  assert("Alert type = CUSTOMER_INACTIVE", alert!.type === "CUSTOMER_INACTIVE");
}

section("29: Alert Builder — Active Customer = No Alert");
{
  const customer = makeCustomer({ lastPurchaseAt: new Date(Date.now() - 10 * 86400000).toISOString() });
  const result = evaluateCustomerInactivity(CTX, customer, CONFIG);
  const alert = buildInactiveCustomerAlert(CTX, result, CONFIG);
  assert("No alert for ACTIVE customer", alert === null);
}

section("30: Alert Builder — Order Blocked");
{
  const order = makeOrder({ status: "bloqueado", blockers: [{ dimension: "credit", message: "Cartera bloqueada", severity: "critical" }] });
  const state = buildOrderFulfillmentState(order, CONFIG);
  const alert = buildOrderFollowUpAlert(CTX, state, CONFIG);
  assert("Alert for blocked order", alert !== null);
  assert("Alert type = ORDER_BLOCKED", alert!.type === "ORDER_BLOCKED");
  assert("Alert severity = critical", alert!.severity === "critical");
}

section("31: Alert Builder — Order OK = No Alert");
{
  const order = makeOrder({ status: "entregado", blockers: [] });
  const state = buildOrderFulfillmentState(order, CONFIG);
  const alert = buildOrderFollowUpAlert(CTX, state, CONFIG);
  assert("No alert for delivered order", alert === null);
}

section("32: Data Quality Alert");
{
  const evidence: SalesRepEvidenceItem = {
    policyType: "CUSTOMER_INACTIVE",
    policyId: "test",
    policyName: "Test",
    activationReason: "test",
    dataUsed: { test: true },
    recommendedAction: "test",
    actionRationale: "test",
    confidence: 0.3,
    severity: "info",
    missingData: ["lastPurchaseAt", "lifetimeSales"],
    evaluatedAt: new Date().toISOString(),
    traceId: "test-001",
  };
  const alert = buildDataQualityAlert(CTX, "customer", "CUST-001", "Cliente Test", ["lastPurchaseAt", "lifetimeSales"], evidence, CONFIG);
  assert("Data quality alert generated", alert !== null);
  assert("Alert type = DATA_QUALITY_WARNING", alert!.type === "DATA_QUALITY_WARNING");
  assert("Message mentions 2 fields", alert!.message.includes("2 campo(s)"));
}

section("33: Data Quality Alert — No Missing Fields = null");
{
  const evidence: SalesRepEvidenceItem = {
    policyType: "CUSTOMER_INACTIVE",
    policyId: "test",
    policyName: "Test",
    activationReason: "test",
    dataUsed: { test: true },
    recommendedAction: "test",
    actionRationale: "test",
    confidence: 0.9,
    severity: "info",
    missingData: [],
    evaluatedAt: new Date().toISOString(),
    traceId: "test-002",
  };
  const alert = buildDataQualityAlert(CTX, "customer", "CUST-001", "Cliente Test", [], evidence, CONFIG);
  assert("No alert when no missing fields", alert === null);
}

section("34: Batch Alert Builder");
{
  const outOfStock = evaluateMalletOutOfStock(CTX, "MAL-001", MALLET_ITEMS, CONFIG);
  const replacements = new Map<string, typeof REPLACEMENT_CANDIDATES>();
  for (const item of outOfStock) {
    replacements.set(item.reference, evaluateMalletReplacement(item, REPLACEMENT_CANDIDATES, CONFIG));
  }
  const overdueCustomer = makeCustomer({ receivables: { totalBalance: 500_000, overdueBalance: 300_000, maxDaysPastDue: 45, oldestOverdueDocument: "FV-1", oldestOverdueAmount: 100_000, overdueDocumentCount: 2, dataStatus: "AVAILABLE" } });
  const overdueResults = [evaluateCustomerReceivablesAlert(CTX, overdueCustomer, CONFIG)];
  const inactiveResults = [evaluateCustomerInactivity(CTX, makeCustomer({ lastPurchaseAt: new Date(Date.now() - 120 * 86400000).toISOString() }), CONFIG)];
  const orderStates = [buildOrderFulfillmentState(makeOrder({ status: "bloqueado", blockers: [{ dimension: "credit", message: "blocked", severity: "critical" }] }), CONFIG)];

  const alerts = buildAllAlerts({ ctx: CTX, outOfStockItems: outOfStock, replacements, overdueResults, inactiveResults, orderStates, config: CONFIG });
  assert("Batch generates multiple alerts", alerts.length >= 4);
  assert("All alerts have deduplicationKey", alerts.every(a => a.deduplicationKey.length > 0));
  assert("All alerts have tenantId", alerts.every(a => a.tenantId === "castillitos"));
}

section("35: Daily State — Full Assembly");
{
  const profile: SalesRepProfile = { salesRepId: "SR-001", salesRepName: "David", zone: "Zona Norte", active: true };
  const malletInput: MalletStateInput = { malletId: "MAL-001", completionPercentage: 85, completeGroups: 4, totalGroups: 5, missingEntries: 2, excessEntries: 0, unresolvedItems: 1 };
  const outOfStock = evaluateMalletOutOfStock(CTX, "MAL-001", MALLET_ITEMS, CONFIG);
  const malletState = buildSalesRepMalletState(CTX, malletInput, outOfStock, []);
  const customer = makeCustomer({ receivables: { totalBalance: 500_000, overdueBalance: 200_000, maxDaysPastDue: 45, oldestOverdueDocument: "FV-1", oldestOverdueAmount: 100_000, overdueDocumentCount: 2, dataStatus: "AVAILABLE" } });
  const overdueAlerts = [evaluateCustomerReceivablesAlert(CTX, customer, CONFIG)];
  const inactive = [evaluateCustomerInactivity(CTX, makeCustomer({ lastPurchaseAt: new Date(Date.now() - 120 * 86400000).toISOString() }), CONFIG)];
  const orders = [buildOrderFulfillmentState(makeOrder(), CONFIG)];
  const priorities = [evaluateCustomerPriority(CTX, customer, evaluateCustomerInactivity(CTX, customer, CONFIG), overdueAlerts[0], CONFIG)];

  const daily = buildSalesRepDailyState(CTX, profile, malletState, overdueAlerts, inactive, orders, outOfStock, priorities, []);
  assert("Daily state has tenantId", daily.tenantId === "castillitos");
  assert("Daily state has salesRep profile", daily.salesRep.salesRepId === "SR-001");
  assert("Daily state has malletState", daily.malletState !== null);
  assert("Daily state filters customerAlerts (only non-info)", daily.customerAlerts.every(a => a.alertSeverity !== "info"));
  assert("Daily state has evidenceSummary", daily.evidenceSummary.totalEvidenceItems > 0);
  assert("Daily state has generatedAt", daily.generatedAt.length > 0);
}

section("36: Daily State — Deduplication");
{
  const profile: SalesRepProfile = { salesRepId: "SR-001", salesRepName: "David", zone: null, active: true };
  const outOfStock = evaluateMalletOutOfStock(CTX, "MAL-001", MALLET_ITEMS, CONFIG);
  const alert1 = buildOutOfStockAlert(CTX, outOfStock[0], CONFIG);
  // Same dedup key
  const alert2 = { ...alert1, alertId: "different-id" };
  const daily = buildSalesRepDailyState(CTX, profile, null, [], [], [], outOfStock, [], [alert1, alert2]);
  assert("Deduplicates alerts by deduplicationKey", daily.alerts.length === 1);
}

section("37: Mobile Contract Builder");
{
  const profile: SalesRepProfile = { salesRepId: "SR-001", salesRepName: "David", zone: null, active: true };
  const daily = buildSalesRepDailyState(CTX, profile, null, [], [], [], [], [], []);
  const mobile = buildMobileContract(daily);
  assert("Mobile contract has salesRepId", mobile.salesRepId === "SR-001");
  assert("Mobile contract has 6 capabilities", mobile.capabilities.length === 6);
  assert("order_creation is UNAVAILABLE", mobile.capabilities.find(c => c.id === "order_creation")?.status === "UNAVAILABLE");
  assert("customer_alerts is AVAILABLE", mobile.capabilities.find(c => c.id === "customer_alerts")?.status === "AVAILABLE");
  assert("mallet_overview is NOT_CONFIGURED (no mallet)", mobile.capabilities.find(c => c.id === "mallet_overview")?.status === "NOT_CONFIGURED");
}

section("38: Mobile Contract — With Mallet");
{
  const profile: SalesRepProfile = { salesRepId: "SR-001", salesRepName: "David", zone: null, active: true };
  const malletInput: MalletStateInput = { malletId: "MAL-001", completionPercentage: 80, completeGroups: 4, totalGroups: 5, missingEntries: 2, excessEntries: 0, unresolvedItems: 0 };
  const malletState = buildSalesRepMalletState(CTX, malletInput, [], []);
  const daily = buildSalesRepDailyState(CTX, profile, malletState, [], [], [], [], [], []);
  const mobile = buildMobileContract(daily);
  assert("mallet_overview is AVAILABLE with mallet", mobile.capabilities.find(c => c.id === "mallet_overview")?.status === "AVAILABLE");
}

section("39: getMobileCapabilityCount");
{
  assert("Returns 6", getMobileCapabilityCount() === 6);
}

section("40: Evidence Bridge");
{
  const outOfStock = evaluateMalletOutOfStock(CTX, "MAL-001", MALLET_ITEMS, CONFIG);
  const commercial = bridgeToCommercialEvidence("castillitos", outOfStock[0].evidence, "sales_rep", "SR-001");
  assert("Domain = SALES_REP", commercial.domain === "SALES_REP");
  assert("EntityType = sales_rep", commercial.entityType === "sales_rep");
  assert("Has traceId", commercial.traceId.length > 0);
  assert("Has tenantId", commercial.tenantId === "castillitos");
}

section("41: Evidence Summary");
{
  const profile: SalesRepProfile = { salesRepId: "SR-001", salesRepName: "David", zone: null, active: true };
  const overdueCustomer = makeCustomer({
    receivables: { totalBalance: 500_000, overdueBalance: 200_000, maxDaysPastDue: 45, oldestOverdueDocument: "FV-1", oldestOverdueAmount: 100_000, overdueDocumentCount: 2, dataStatus: "AVAILABLE" },
  });
  const overdueAlerts = [evaluateCustomerReceivablesAlert(CTX, overdueCustomer, CONFIG)];
  const inactiveCustomer = makeCustomer({ lastPurchaseAt: new Date(Date.now() - 120 * 86400000).toISOString() });
  const inactive = [evaluateCustomerInactivity(CTX, inactiveCustomer, CONFIG)];
  const orders = [buildOrderFulfillmentState(makeOrder(), CONFIG)];
  const daily = buildSalesRepDailyState(CTX, profile, null, overdueAlerts, inactive, orders, [], [], []);
  const summary = summarizeDailyEvidence(daily);
  assert("Summary has totalEvidence > 0", summary.totalEvidence > 0);
  assert("Summary has byDomain", Object.keys(summary.byDomain).length > 0);
}

section("42: Evidence Validation — Valid");
{
  const outOfStock = evaluateMalletOutOfStock(CTX, "MAL-001", MALLET_ITEMS, CONFIG);
  const result = validateEvidence(outOfStock[0].evidence);
  assert("Engine-produced evidence is valid", result.valid);
  assert("No issues", result.issues.length === 0);
}

section("43: Evidence Validation — Invalid");
{
  const badEvidence: SalesRepEvidenceItem = {
    policyType: "MALLET_OUT_OF_STOCK",
    policyId: "",
    policyName: "",
    activationReason: "",
    dataUsed: {},
    recommendedAction: "",
    actionRationale: "",
    confidence: 1.5,
    severity: "info",
    missingData: [],
    evaluatedAt: "",
    traceId: "",
  };
  const result = validateEvidence(badEvidence);
  assert("Bad evidence is invalid", !result.valid);
  assert("Multiple issues detected", result.issues.length >= 5);
}

section("44: Batch Evidence Validation");
{
  const outOfStock = evaluateMalletOutOfStock(CTX, "MAL-001", MALLET_ITEMS, CONFIG);
  const allEv = outOfStock.map(o => o.evidence);
  const result = validateAllEvidence(allEv);
  assert("All engine evidence is valid", result.invalidCount === 0);
  assert("Checked count matches", result.totalChecked === allEv.length);
}

section("45: Evidence Three-Question Rule");
{
  const outOfStock = evaluateMalletOutOfStock(CTX, "MAL-001", MALLET_ITEMS, CONFIG);
  const ev = outOfStock[0].evidence;
  assert("Q1: Why activated? (activationReason)", ev.activationReason.length > 0);
  assert("Q2: What data? (dataUsed)", Object.keys(ev.dataUsed).length > 0);
  assert("Q3: What action? (recommendedAction)", ev.recommendedAction.length > 0);
  assert("Q3b: Why action? (actionRationale)", ev.actionRationale.length > 0);
  assert("Q4: Confidence?", ev.confidence > 0 && ev.confidence <= 1);
  assert("Q5: Missing data? (missingData array exists)", Array.isArray(ev.missingData));
}

section("46: Multi-Tenant Isolation");
{
  const tenantA: SalesRepPolicyContext = { tenantId: "tenant_a", salesRepId: "SR-A", salesRepName: "Alice" };
  const tenantB: SalesRepPolicyContext = { tenantId: "tenant_b", salesRepId: "SR-B", salesRepName: "Bob" };
  const items: MalletItemInput[] = [
    { reference: "R1", productName: "P1", photoUrl: null, currentMalletUnits: 5, availableInventory: 0, groupCode: "G1", subgroupCode: "SG1", sizeClass: "M", line: "L1" },
  ];
  const resultA = evaluateMalletOutOfStock(tenantA, "MAL-A", items, CONFIG);
  const resultB = evaluateMalletOutOfStock(tenantB, "MAL-B", items, CONFIG);
  assert("Tenant A result has salesRepId SR-A", resultA[0].salesRepId === "SR-A");
  assert("Tenant B result has salesRepId SR-B", resultB[0].salesRepId === "SR-B");
  assert("Trace IDs are different", resultA[0].evidence.traceId !== resultB[0].evidence.traceId);
}

section("47: Config Values — Not Hardcoded");
{
  assert("outOfStockThreshold from config", CONFIG.outOfStock.outOfStockThreshold === 0);
  assert("overdueDaysThreshold from config", CONFIG.overdueReceivable.overdueDaysThreshold === 30);
  assert("inactivityThresholdDays from config", CONFIG.inactiveCustomer.inactivityThresholdDays === 90);
  assert("atRiskThresholdDays from config", CONFIG.inactiveCustomer.atRiskThresholdDays === 60);
  assert("highThreshold from config", CONFIG.customerPriority.highThreshold === 70);
  assert("mediumThreshold from config", CONFIG.customerPriority.mediumThreshold === 40);
  assert("Weights sum to ~1.0", Math.abs(Object.values(CONFIG.customerPriority.weights).reduce((s, v) => s + v, 0) - 1.0) < 0.01);
}

section("48: Immutability — Engine Does Not Mutate Inputs");
{
  const items: MalletItemInput[] = [
    { reference: "IMM-1", productName: "Immutable", photoUrl: null, currentMalletUnits: 5, availableInventory: 0, groupCode: "G1", subgroupCode: "SG1", sizeClass: "M", line: "L1" },
  ];
  const before = JSON.stringify(items);
  evaluateMalletOutOfStock(CTX, "MAL-IMM", items, CONFIG);
  const after = JSON.stringify(items);
  assert("Items not mutated by evaluateMalletOutOfStock", before === after);

  const customer = makeCustomer();
  const customerBefore = JSON.stringify(customer);
  evaluateCustomerReceivablesAlert(CTX, customer, CONFIG);
  evaluateCustomerInactivity(CTX, customer, CONFIG);
  assert("Customer not mutated by evaluators", customerBefore === JSON.stringify(customer));
}

// ══════════════════════════════════════════════════════════════════════════
// RESULTS
// ══════════════════════════════════════════════════════════════════════════

console.log(`\n${"═".repeat(60)}`);
console.log(`SALES-REP-POLICY-PACK-01 QA Results: ${passed}/${passed + failed} passed`);
if (failed > 0) {
  console.log(`❌ ${failed} FAILED`);
  process.exit(1);
} else {
  console.log(`✅ ALL PASSED`);
}
