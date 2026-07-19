/**
 * lib/comercial/maletas/__tests__/production-alert.smoke.ts
 *
 * Smoke tests for Production Alert Engine + Sales Rep Case Status Engine.
 *
 * Run with: npx tsx lib/comercial/maletas/__tests__/production-alert.smoke.ts
 *
 * Validates Phase 11 cases from AGENTIK-COMERCIAL-MALETAS-FUNCTIONAL-REALIGNMENT-01:
 *
 * Case 1: disponible 4, mínimo regla 12 → alerta producir (shortage = 8)
 * Case 2: disponible 15, mínimo 12, PD pendiente 8 → alerta preventiva (neto = 7 < 12)
 * Case 3: AP exists → no alert (AP excluded at normalizer, never triggers production)
 * Case 4: Vendedor Orlando, 2 depleted → maleta incompleta, reponer o pausar
 * Case 5: No disponible, no stock → vendedor debe pausar esa línea
 */

import { buildProductionAlertsFromRules } from "../production-alert-engine";
import { buildSalesRepCaseStatus }         from "../case-status-engine";
import type { SagInventoryItem }           from "../sag-inventory-adapter";
import type { CommercialCoverageRule }     from "../coverage-rule-types";
import type { CommercialCaseAssignment }   from "../case-assignment-types";
import type { SalesRep }                   from "../maletas-types";

// ─── Test helpers ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

function section(name: string): void {
  console.log(`\n── ${name} ──`);
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_ID = "castillitos_test";

function makeInventoryItem(
  reference: string,
  description: string,
  line: "LT" | "CS",
  availableForCases: number,
  pendingPDQty: number,
  apCleanupQty = 0,
): SagInventoryItem {
  const reservedQty = pendingPDQty;
  return {
    reference,
    description,
    line,
    category: "NIÑA BEBE",
    productType: "PIJAMA",
    initialWarehouseQty: availableForCases + reservedQty,
    reservedQty,
    availableForCases,
    pendingPDQty,
    apCleanupQty,
  };
}

function makeRule(
  id: string,
  line: "LT" | "CS",
  minWarehouseQty: number,
  suggestedQty: number,
  reference?: string,
): CommercialCoverageRule {
  const now = new Date().toISOString();
  return {
    id,
    organizationId:         ORG_ID,
    line,
    category:               "NIÑA BEBE",
    productType:            "PIJAMA",
    reference,
    minWarehouseQty,
    idealWarehouseQty:      suggestedQty,
    suggestedProductionQty: suggestedQty,
    priority:               1,
    appliesToProduction:    true,
    appliesToCases:         true,
    appliesToStores:        false,
    active:                 true,
    source:                 "default",
    createdAt:              now,
    updatedAt:              now,
  };
}

function makeAssignment(
  repId: string,
  reference: string,
  currentQty: number,
  availableToReplenish: number,
  productionInProcess = false,
  line: "LT" | "CS" = "LT",
): CommercialCaseAssignment {
  return {
    id:                    `${repId}_${line}_${reference}`,
    organizationId:        ORG_ID,
    salesRepId:            repId,
    reference,
    description:           `Pijama ${reference}`,
    line,
    initialQty:            1,
    currentQty,
    minimumCaseQty:        1,
    availableToReplenish,
    status:                currentQty <= 0 ? "depleted" : "active",
    productionInProcess,
    productionBatchLabel:  productionInProcess ? "MAYO 20 EN PROCESO" : null,
    lastUpdatedAt:         new Date().toISOString(),
  };
}

const ORLANDO: SalesRep = { id: "ORLANDO", name: "ORLANDO", sagName: "LUIS ORLANDO NARANJO", active: true };
const NESTOR:  SalesRep = { id: "NESTOR",  name: "NESTOR",  sagName: "NESTOR ALZATE",         active: true };
const SALES_REPS = [ORLANDO, NESTOR];

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 1: disponible 4, mínimo 12 → alerta directa, shortage = 8
// ═══════════════════════════════════════════════════════════════════════════════

section("CASE 1: disponible < mínimo → alerta directa (shortage = 8)");
{
  const inventory = [makeInventoryItem("L-001", "Pijama niña bebé CL", "LT", 4, 0)];
  const rules     = [makeRule("rule_lt_pijama", "LT", 12, 24, "L-001")];

  const alerts = buildProductionAlertsFromRules(inventory, rules);

  assert(alerts.length === 1, "exactamente 1 alerta generada");

  const alert = alerts[0];
  assert(alert !== undefined, "alerta existe");
  assert(alert!.reference === "L-001", "alerta referencia = L-001");
  assert(alert!.operationalShortage === 8, `operationalShortage = 8 (got ${alert!.operationalShortage})`);
  assert(alert!.severity === "normal", `severity = normal (got ${alert!.severity})`);
  assert(alert!.suggestedProductionQty === 24, `suggestedProductionQty = 24 (got ${alert!.suggestedProductionQty})`);
  assert(alert!.reason.includes("disponible 4"), "reason menciona disponible 4");
  assert(alert!.reason.includes("mínimo 12"), "reason menciona mínimo 12");
  assert(alert!.reason.includes("faltante operativo 8"), "reason menciona faltante operativo 8");
  assert(alert!.reason.startsWith("Producir 24"), "reason inicia con 'Producir 24'");
}

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 2: disponible 15, mínimo 12, PD pendiente 8 → alerta preventiva (neto = 7)
// ═══════════════════════════════════════════════════════════════════════════════

section("CASE 2: disponible > mínimo pero PD consume → alerta preventiva");
{
  const inventory = [makeInventoryItem("L-002", "Pijama niña bebé LL", "LT", 15, 8)];
  const rules     = [makeRule("rule_lt_pijama_ll", "LT", 12, 24, "L-002")];

  const alerts = buildProductionAlertsFromRules(inventory, rules);

  assert(alerts.length === 1, "exactamente 1 alerta generada");

  const alert = alerts[0];
  assert(alert !== undefined, "alerta preventiva existe");
  assert(alert!.severity === "preventiva", `severity = preventiva (got ${alert!.severity})`);
  assert(alert!.netAvailableAfterPD === 7, `netAvailableAfterPD = 7 (got ${alert!.netAvailableAfterPD})`);
  assert(alert!.reason.includes("PD pendiente 8"), "reason menciona PD pendiente 8");
  assert(alert!.reason.includes("disponible neto post-PD 7"), "reason menciona neto post-PD");
}

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 3: AP existe → NO genera alerta (AP excluido, no afecta producción)
// ═══════════════════════════════════════════════════════════════════════════════

section("CASE 3: AP (limpieza de pedidos) no genera alerta de producción");
{
  // AP cleanup qty is tracked for audit but NEVER affects availableForCases
  // or triggers production. The SagInventoryItem.apCleanupQty is always excluded
  // from all calculations.
  const inventory = [makeInventoryItem("L-003", "Pijama niña bebé CL 2-8", "LT", 20, 0, 15)];
  const rules     = [makeRule("rule_lt_003", "LT", 12, 24, "L-003")];

  const alerts = buildProductionAlertsFromRules(inventory, rules);

  assert(alerts.length === 0, "sin alertas — AP no afecta producción (disponible 20 > mínimo 12)");

  // Verify the inventory item correctly excludes AP from available
  const item = inventory[0]!;
  assert(item.availableForCases === 20, `availableForCases = 20 (AP no resta, got ${item.availableForCases})`);
  assert(item.apCleanupQty === 15, "apCleanupQty registrado para auditoría únicamente");
}

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 4: Vendedor Orlando tiene 2 muestras agotadas → maleta incompleta
// ═══════════════════════════════════════════════════════════════════════════════

section("CASE 4: Orlando 2 referencias agotadas — reponer o pausar");
{
  const inventory = [
    makeInventoryItem("L-010", "Pijama ref 010", "LT", 0, 0),  // agotado, sin stock en bodega
    makeInventoryItem("L-011", "Pijama ref 011", "LT", 5, 0),  // agotado en maleta pero bodega tiene
    makeInventoryItem("L-012", "Pijama ref 012", "LT", 3, 0),  // OK
  ];

  const assignments: CommercialCaseAssignment[] = [
    makeAssignment("ORLANDO", "L-010", 0, 0),   // depleted, no warehouse stock, no rule → pausar
    makeAssignment("ORLANDO", "L-011", 0, 5),   // depleted in case, warehouse has stock → reponer
    makeAssignment("ORLANDO", "L-012", 3, 3),   // active
  ];

  // No production rules — tests pure pausar vs reponer logic without production path
  const prodAlerts = buildProductionAlertsFromRules(inventory, []);
  const statuses = buildSalesRepCaseStatus(assignments, inventory, prodAlerts, SALES_REPS);

  const orlandoLT = statuses.find(s => s.salesRepId === "ORLANDO" && s.line === "LT");
  assert(orlandoLT !== undefined, "Orlando LT status existe");
  assert(orlandoLT!.depletedAssignments === 2, `depletedAssignments = 2 (got ${orlandoLT!.depletedAssignments})`);
  assert(orlandoLT!.alerts.length === 2, `2 alertas para Orlando (got ${orlandoLT!.alerts.length})`);

  const alert010 = orlandoLT!.alerts.find(a => a.reference === "L-010");
  assert(alert010?.action === "pausar", `L-010 action = pausar (got ${alert010?.action})`);

  const alert011 = orlandoLT!.alerts.find(a => a.reference === "L-011");
  assert(alert011?.action === "reponer", `L-011 action = reponer (got ${alert011?.action})`);

  assert(orlandoLT!.canReplenishNow.includes("L-011"), "L-011 en canReplenishNow");
}

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 5: Sin disponible ni producción → pausar línea completa
// ═══════════════════════════════════════════════════════════════════════════════

section("CASE 5: sin stock y sin producción → línea bloqueada para vendedor");
{
  const inventory = [
    makeInventoryItem("L-020", "Pijama CS 020", "CS", 0, 0),
    makeInventoryItem("L-021", "Pijama CS 021", "CS", 0, 0),
  ];

  const assignments: CommercialCaseAssignment[] = [
    makeAssignment("NESTOR", "L-020", 0, 0, false, "CS"), // no batch, no stock → pausar
    makeAssignment("NESTOR", "L-021", 0, 0, false, "CS"), // no batch, no stock → pausar
  ];

  // No rules registered yet — no production path → vendor must pause
  const prodAlerts = buildProductionAlertsFromRules(inventory, []);

  const statuses = buildSalesRepCaseStatus(assignments, inventory, prodAlerts, SALES_REPS);
  const nestorCS = statuses.find(s => s.salesRepId === "NESTOR" && s.line === "CS");

  assert(nestorCS !== undefined, "Néstor CS status existe");
  assert(nestorCS!.pausedAssignments === 2, `pausedAssignments = 2 (got ${nestorCS!.pausedAssignments})`);
  assert(nestorCS!.blockedLines.includes("CS"), "línea CS bloqueada para Néstor");
  assert(nestorCS!.pressureScore === 100, `pressureScore = 100 (got ${nestorCS!.pressureScore})`);
  assert(nestorCS!.alerts.every(a => a.action === "pausar"), "todas las alertas = pausar");
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(60)}`);
console.log(`PRODUCTION ALERT SMOKE — ${passed} passed / ${failed} failed / ${passed + failed} total`);
if (failed > 0) {
  process.exit(1);
}
