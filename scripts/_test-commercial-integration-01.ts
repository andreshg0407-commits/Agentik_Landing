/**
 * scripts/_test-commercial-integration-01.ts
 *
 * QA tests for COMMERCIAL-INTEGRATION-01.
 * Run: npx tsx scripts/_test-commercial-integration-01.ts
 */

let passed = 0;
let failed = 0;
let section = 0;

function header(title: string) {
  section++;
  console.log(`\n${"─".repeat(20)} ${section}: ${title} ${"─".repeat(20)}`);
}

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// ── 1: BusinessDecision shared types ────────────────────────────────────────

header("BusinessDecision shared types");

import type {
  BusinessDecision,
  BusinessDecisionPriority,
  BusinessDecisionSeverity,
  BusinessDecisionStatus,
  BusinessDecisionEvidence,
  CommercialDomain,
  CommercialDecisionGroup,
  CommercialDecisionSummary,
} from "../lib/comercial/business-policy/business-decision-types";

// Verify all types are importable
const testDecision: BusinessDecision = {
  decisionId: "test-1",
  tenantId: "castillitos",
  domain: "MALETAS",
  engine: "MaletasPolicyPack",
  policy: "test-policy",
  severity: "medium",
  priority: "HIGH",
  title: "Test decision",
  summary: "Test summary",
  recommendedAction: "Test action",
  status: "pending",
  confidence: 0.85,
  evidence: {
    policyId: "test-policy",
    policyName: "Test Policy",
    activationReason: "Test reason",
    dataUsed: {},
    recommendedAction: "Test action",
    actionRationale: "Test rationale",
    confidence: 0.85,
    severity: "medium",
    evaluatedAt: new Date().toISOString(),
  },
  generatedAt: new Date().toISOString(),
  expiresAt: null,
};

check("BusinessDecision type constructable", testDecision.decisionId === "test-1");
check("domain field present", testDecision.domain === "MALETAS");
check("priority uses uppercase", testDecision.priority === "HIGH");
check("status is pending", testDecision.status === "pending");
check("evidence has policyId", testDecision.evidence.policyId === "test-policy");
check("expiresAt nullable", testDecision.expiresAt === null);

// ── 2: All 6 domains defined ────────────────────────────────────────────────

header("All 6 domains defined");

const allDomains: CommercialDomain[] = [
  "MALETAS", "TIENDAS", "PEDIDOS", "VENDEDORES", "IMPORTACIONES", "PRODUCCION",
];
for (const d of allDomains) {
  check(`Domain ${d} valid`, allDomains.includes(d));
}

// ── 3: Priority levels ──────────────────────────────────────────────────────

header("Priority levels");

const priorities: BusinessDecisionPriority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
for (const p of priorities) {
  check(`Priority ${p} valid`, priorities.includes(p));
}

// ── 4: Severity levels ──────────────────────────────────────────────────────

header("Severity levels");

const severities: BusinessDecisionSeverity[] = ["info", "low", "medium", "high", "critical"];
for (const s of severities) {
  check(`Severity ${s} valid`, severities.includes(s));
}

// ── 5: Status levels ────────────────────────────────────────────────────────

header("Status levels");

const statuses: BusinessDecisionStatus[] = ["pending", "accepted", "rejected", "expired", "superseded"];
for (const s of statuses) {
  check(`Status ${s} valid`, statuses.includes(s));
}

// ── 6: Aggregator ───────────────────────────────────────────────────────────

header("CommercialDecisionAggregator");

import {
  aggregateCommercialDecisions,
  aggregateByDomain,
  filterByDomain,
  filterByPriority,
  filterPending,
  sortByPriority,
} from "../lib/comercial/business-policy/commercial-decision-aggregator";

const decisions: BusinessDecision[] = [
  { ...testDecision, decisionId: "d1", domain: "MALETAS", priority: "CRITICAL" },
  { ...testDecision, decisionId: "d2", domain: "MALETAS", priority: "HIGH" },
  { ...testDecision, decisionId: "d3", domain: "TIENDAS", priority: "MEDIUM" },
  { ...testDecision, decisionId: "d4", domain: "PEDIDOS", priority: "LOW" },
  { ...testDecision, decisionId: "d5", domain: "VENDEDORES", priority: "HIGH" },
  { ...testDecision, decisionId: "d6", domain: "IMPORTACIONES", priority: "CRITICAL" },
  { ...testDecision, decisionId: "d7", domain: "PRODUCCION", priority: "MEDIUM" },
];

const summary = aggregateCommercialDecisions("castillitos", decisions);
check("aggregator: tenantId correct", summary.tenantId === "castillitos");
check("aggregator: total decisions = 7", summary.totalDecisions === 7);
check("aggregator: critical = 2", summary.criticalDecisions === 2);
check("aggregator: high = 2", summary.highDecisions === 2);
check("aggregator: 6 domains", summary.domains.length === 6);
check("aggregator: groups sorted by critical count desc", summary.groups[0].criticalCount >= summary.groups[1].criticalCount);

const byDomain = aggregateByDomain(decisions);
check("aggregateByDomain: 6 domains", byDomain.size === 6);
check("aggregateByDomain: MALETAS has 2", (byDomain.get("MALETAS") ?? []).length === 2);

const maletasOnly = filterByDomain(decisions, "MALETAS");
check("filterByDomain: MALETAS returns 2", maletasOnly.length === 2);

const highAndAbove = filterByPriority(decisions, "HIGH");
check("filterByPriority: HIGH+ returns 4", highAndAbove.length === 4);

const criticalOnly = filterByPriority(decisions, "CRITICAL");
check("filterByPriority: CRITICAL returns 2", criticalOnly.length === 2);

const pendingOnly = filterPending(decisions);
check("filterPending: all 7 pending", pendingOnly.length === 7);

const sorted = sortByPriority(decisions);
check("sortByPriority: first is CRITICAL", sorted[0].priority === "CRITICAL");
check("sortByPriority: last is LOW", sorted[sorted.length - 1].priority === "LOW");

// ── 7: Store BusinessDecision builders ──────────────────────────────────────

header("Store BusinessDecision builders");

import {
  buildTextileCoverageDecisions,
  buildGlobalLowStockDecisions,
  buildAllStoreBusinessDecisions,
} from "../lib/comercial/tiendas/store-business-decisions";

import type { TextileCoverageResult, GlobalLowStockResult, StoreDecisionEvaluationResult } from "../lib/comercial/tiendas/store-decision-types";

const mockStoreEvidence = {
  policyType: "STORE_TEXTILE_COVERAGE" as const,
  policyId: "store-textile-coverage",
  policyName: "Cobertura Textil",
  activationReason: "Below minimum",
  dataUsed: {},
  recommendedAction: "Replenish",
  actionRationale: "Below minimum threshold",
  confidence: 0.9,
  severity: "high" as const,
  evaluatedAt: new Date().toISOString(),
};

const textileResults: TextileCoverageResult[] = [
  {
    storeId: "s1", storeName: "Tienda 1", referenceCode: "R001", productName: "Producto A",
    currentUnits: 2, minimumUnits: 8, idealUnits: 10, maximumUnits: 12,
    status: "below_minimum", gap: -6, evidence: mockStoreEvidence,
  },
  {
    storeId: "s1", storeName: "Tienda 1", referenceCode: "R002", productName: "Producto B",
    currentUnits: 10, minimumUnits: 8, idealUnits: 10, maximumUnits: 12,
    status: "ok", gap: 0, evidence: mockStoreEvidence,
  },
];

const storeDecisions = buildTextileCoverageDecisions(textileResults, "castillitos");
check("textile: only below_minimum/below_ideal emitted", storeDecisions.length === 1);
check("textile: domain = TIENDAS", storeDecisions[0].domain === "TIENDAS");
check("textile: engine = StorePolicyPack", storeDecisions[0].engine === "StorePolicyPack");
check("textile: title contains product name", storeDecisions[0].title.includes("Producto A"));

const lowStockResults: GlobalLowStockResult[] = [
  {
    referenceCode: "R003", productName: "Producto C",
    totalUnitsAllWarehouses: 30, threshold: 36,
    allowedStores: ["s1"],
    transferOutStores: [{ storeId: "s2", storeName: "Tienda 2", currentUnits: 5, suggestedAction: "transfer_out" }],
    evidence: { ...mockStoreEvidence, policyType: "STORE_GLOBAL_LOW_STOCK" },
  },
];

const rule36Decisions = buildGlobalLowStockDecisions(lowStockResults, "castillitos");
check("rule36: emits for transfer-out stores", rule36Decisions.length === 1);
check("rule36: priority = HIGH", rule36Decisions[0].priority === "HIGH");
check("rule36: title contains Regla 36", rule36Decisions[0].title.includes("Regla 36"));

// ── 8: Order BusinessDecision builders ──────────────────────────────────────

header("Order BusinessDecision builders");

import {
  buildCreditDecision,
  buildDeliveryDecision,
  buildReadinessDecision,
  buildAllOrderBusinessDecisions,
} from "../lib/comercial/pedidos/order-business-decisions";

const mockOrderEvidence = {
  policyType: "ORDER_CUSTOMER_CREDIT" as const,
  policyId: "order-credit",
  policyName: "Cartera",
  activationReason: "Overdue",
  dataUsed: {},
  recommendedAction: "Review",
  actionRationale: "Past due",
  confidence: 0.95,
  severity: "high" as const,
  evaluatedAt: new Date().toISOString(),
};

const creditApproved = buildCreditDecision({
  customerId: "c1", customerName: "Cliente 1",
  totalReceivable: 100000, overdueReceivable: 0, maxDaysPastDue: 0,
  creditStatus: "approved", alerts: [], evidence: mockOrderEvidence,
}, "castillitos");
check("credit: approved returns null", creditApproved === null);

const creditBlocked = buildCreditDecision({
  customerId: "c1", customerName: "Cliente 1",
  totalReceivable: 100000, overdueReceivable: 50000, maxDaysPastDue: 90,
  creditStatus: "blocked", alerts: [], evidence: mockOrderEvidence,
}, "castillitos");
check("credit: blocked returns decision", creditBlocked !== null);
check("credit: blocked priority = CRITICAL", creditBlocked?.priority === "CRITICAL");
check("credit: domain = PEDIDOS", creditBlocked?.domain === "PEDIDOS");

// ── 9: SalesRep BusinessDecision builders ───────────────────────────────────

header("SalesRep BusinessDecision builders");

import {
  buildOutOfStockDecisions,
  buildOverdueReceivableDecisions,
  buildInactiveCustomerDecisions,
} from "../lib/comercial/sales-reps/sales-rep-business-decisions";

const mockRepEvidence = {
  policyType: "MALLET_OUT_OF_STOCK" as const,
  policyId: "rep-oos",
  policyName: "Agotado Maleta",
  activationReason: "Zero stock",
  dataUsed: {},
  recommendedAction: "Replenish",
  actionRationale: "No stock",
  confidence: 0.9,
  severity: "critical" as const,
  missingData: [] as string[],
  evaluatedAt: new Date().toISOString(),
  traceId: "t1",
};

const oosDecisions = buildOutOfStockDecisions([{
  salesRepId: "v1", malletId: "m1", productId: "p1", reference: "R001",
  productName: "Producto A", photoUrl: null, currentMalletUnits: 0,
  availableInventory: 0, reason: "Zero stock",
  recommendedAction: "Replenish", replacementSuggestions: [],
  evidence: mockRepEvidence, confidence: 0.9,
}], "castillitos");
check("salesrep oos: emits 1 decision", oosDecisions.length === 1);
check("salesrep oos: domain = VENDEDORES", oosDecisions[0].domain === "VENDEDORES");
check("salesrep oos: priority = CRITICAL (0 inventory)", oosDecisions[0].priority === "CRITICAL");

// ── 10: Import BusinessDecision builders ────────────────────────────────────

header("Import BusinessDecision builders");

import {
  buildLowRotationDecisions,
  buildRepurchaseDecisions,
  buildAgingDecisions,
} from "../lib/comercial/importaciones/import-business-decisions";

const mockImportEvidence = {
  policyType: "LOW_ROTATION" as const,
  policyId: "import-lr",
  policyName: "Baja Rotacion",
  activationReason: "No movement",
  dataUsed: {},
  recommendedAction: "Review",
  actionRationale: "No movement for 300 days",
  confidence: 0.8,
  severity: "medium" as const,
  missingData: [] as string[],
  evaluatedAt: new Date().toISOString(),
  traceId: "t2",
};

const lrDecisions = buildLowRotationDecisions([
  {
    reference: "IMP001", description: "Imported Item", group: "IMPORT",
    subgroup: null, size: null, currentInventory: 50,
    lastEntryDate: "2025-01-01", monthsSinceLastEntry: 18, daysSinceLastEntry: 540,
    isLowRotation: true, reason: "No movement",
    evidence: mockImportEvidence, confidence: 0.8,
  },
  {
    reference: "IMP002", description: "Active Item", group: "IMPORT",
    subgroup: null, size: null, currentInventory: 100,
    lastEntryDate: "2026-01-01", monthsSinceLastEntry: 6, daysSinceLastEntry: 180,
    isLowRotation: false, reason: "Active",
    evidence: mockImportEvidence, confidence: 0.9,
  },
], "castillitos");
check("import lr: only low rotation emitted", lrDecisions.length === 1);
check("import lr: domain = IMPORTACIONES", lrDecisions[0].domain === "IMPORTACIONES");

// ── 11: Maletas BusinessDecision builders ───────────────────────────────────

header("Maletas BusinessDecision builders");

import {
  bridgeMaletasDecision,
  buildAllMaletasBusinessDecisions,
} from "../lib/comercial/maletas/maletas-business-decisions";

// CommercialDecision is inline type for testing
const mockMaletasDecision = {
  id: "cd-1",
  type: "produce" as const,
  severity: "high" as const,
  title: "Producir R001",
  summary: "Falta stock para 3 vendedores",
  reference: "R001",
  affectedSalesReps: ["v1", "v2", "v3"],
  affectedCases: ["c1", "c2"],
  pendingOrdersQty: 50,
};

const maletasBd = bridgeMaletasDecision(mockMaletasDecision as any, "castillitos");
check("maletas: domain = MALETAS", maletasBd.domain === "MALETAS");
check("maletas: engine = MaletasPolicyPack", maletasBd.engine === "MaletasPolicyPack");
check("maletas: priority maps from severity", maletasBd.priority === "HIGH");
check("maletas: title preserved", maletasBd.title === "Producir R001");

const allMaletasBd = buildAllMaletasBusinessDecisions([mockMaletasDecision as any], "castillitos");
check("maletas batch: returns 1", allMaletasBd.length === 1);

// ── 12: Production BusinessDecision builders ────────────────────────────────

header("Production BusinessDecision builders");

import {
  buildProductionBusinessDecision,
  buildAllProductionBusinessDecisions,
} from "../lib/comercial/produccion/production-business-decisions";

const mockProdEvidence = {
  policyType: "TEXTILE_REORDER" as const,
  policyId: "prod-reorder",
  policyName: "Reorden Textil",
  activationReason: "Below threshold",
  dataUsed: {},
  recommendedAction: "Produce",
  actionRationale: "Below brand threshold",
  confidence: 0.9,
  severity: "high" as const,
  missingData: [] as string[],
  evaluatedAt: new Date().toISOString(),
  traceId: "t3",
};

const prodNeed = {
  subgroup: "SG001", brand: "CASTILLITOS",
  availableInventory: 50, threshold: 100, deficit: 50,
  hasActiveOP: false, activeOPCount: 0, activeOPQuantity: 0,
  decision: "PRODUCE" as const, reason: "Below threshold",
  evidence: mockProdEvidence, confidence: 0.9,
};

const prodBd = buildProductionBusinessDecision(prodNeed, "HIGH", "castillitos");
check("production: domain = PRODUCCION", prodBd.domain === "PRODUCCION");
check("production: engine = ProductionPlanningPack", prodBd.engine === "ProductionPlanningPack");
check("production: priority = HIGH", prodBd.priority === "HIGH");
check("production: title contains subgroup", prodBd.title.includes("SG001"));

const allProdBd = buildAllProductionBusinessDecisions(
  [prodNeed, { ...prodNeed, decision: "SUFFICIENT_STOCK" as const }],
  [{ subgroup: "SG001", brand: "CASTILLITOS", priority: "HIGH" as const, totalScore: 75, factors: [], availableInventory: 50, threshold: 100, deficit: 50, sales6m: 200, coverageDays: 30, pendingOrders: 5, maletas: 3, tiendas: 2, reason: "r", evidence: mockProdEvidence, confidence: 0.9 }],
  "castillitos",
);
check("production batch: only PRODUCE/WAIT emitted (1)", allProdBd.length === 1);

// ── 13: Threshold extraction — order-product-types ──────────────────────────

header("Threshold extraction — order stock config");

import { CASTILLITOS_STOCK_THRESHOLDS } from "../lib/comercial/pedidos/order-policy-pack-config";

check("stock config: lowStockUnits = 10", CASTILLITOS_STOCK_THRESHOLDS.lowStockUnits === 10);
check("stock config: lastUnitsThreshold = 10", CASTILLITOS_STOCK_THRESHOLDS.lastUnitsThreshold === 10);
check("stock config: fewVariantsThreshold = 1", CASTILLITOS_STOCK_THRESHOLDS.fewVariantsThreshold === 1);
check("stock config: LT minimum = 30", CASTILLITOS_STOCK_THRESHOLDS.lineMinimums["LT"] === 30);
check("stock config: CS minimum = 20", CASTILLITOS_STOCK_THRESHOLDS.lineMinimums["CS"] === 20);

// ── 14: getCommercialStockState uses config ─────────────────────────────────

header("getCommercialStockState uses config");

import { getCommercialStockState } from "../lib/comercial/pedidos/order-product-types";

const outState = getCommercialStockState({ availableQty: 0, variantCount: 3, lineName: "", categoryName: "", referenceCode: "R001" });
check("stock state: 0 = out", outState.state === "out");

const lastState = getCommercialStockState({ availableQty: 5, variantCount: 3, lineName: "", categoryName: "", referenceCode: "R001" });
check("stock state: 5 = last_units", lastState.state === "last_units");

const availState = getCommercialStockState({ availableQty: 100, variantCount: 3, lineName: "", categoryName: "", referenceCode: "R001" });
check("stock state: 100 = available", availState.state === "available");

const lineLowState = getCommercialStockState({ availableQty: 25, variantCount: 3, lineName: "LATIN KIDS", categoryName: "", referenceCode: "LT001" });
check("stock state: LT 25 < 30 = line_low", lineLowState.state === "line_low");

// ── 15: Cross-domain aggregation ────────────────────────────────────────────

header("Cross-domain aggregation");

const mixedDecisions: BusinessDecision[] = [
  ...storeDecisions,
  ...(creditBlocked ? [creditBlocked] : []),
  ...oosDecisions,
  ...lrDecisions,
  ...allMaletasBd,
  ...allProdBd,
];

const fullSummary = aggregateCommercialDecisions("castillitos", mixedDecisions);
check("full aggregation: tenantId = castillitos", fullSummary.tenantId === "castillitos");
check("full aggregation: totalDecisions = " + mixedDecisions.length, fullSummary.totalDecisions === mixedDecisions.length);
check("full aggregation: has groups", fullSummary.groups.length > 0);
check("full aggregation: generatedAt present", fullSummary.generatedAt.length > 0);

// ══════════════════════════════════════════════════════════════════════════

console.log(`\n${"═".repeat(60)}`);
console.log(`COMMERCIAL-INTEGRATION-01 QA: ${passed}/${passed + failed} passed`);
if (failed === 0) {
  console.log("✅ ALL PASSED");
} else {
  console.log(`❌ ${failed} FAILED`);
}
process.exit(failed > 0 ? 1 : 0);
