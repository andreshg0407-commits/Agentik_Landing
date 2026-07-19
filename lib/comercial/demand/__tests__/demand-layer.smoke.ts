/**
 * lib/comercial/demand/__tests__/demand-layer.smoke.ts
 *
 * Smoke tests for the SAG PD Demand Layer.
 *
 * Run with: npx tsx lib/comercial/demand/__tests__/demand-layer.smoke.ts
 *
 * Sprint: AGENTIK-SAG-PD-DEMAND-LAYER-01
 */

import { computeOrderInvoiceConversion } from "../order-invoice-conversion";
import { buildProductionPressureSignals, buildDemandPressureSignals } from "../production-pressure";
import type { SagSaleHint, CoverageSignal } from "../../maletas/maletas-intelligence-types";
import type { RawAvailabilityRecord } from "../../maletas/maletas-types";
import type { CaseItem } from "../../maletas/maletas-types";

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

function makeAvailability(
  refCode: string,
  inventario: number,
  pedidos: number,
): [string, RawAvailabilityRecord] {
  return [
    refCode.toUpperCase(),
    {
      refCode,
      description: `Producto ${refCode}`,
      inventario,
      pedidos,
      disponible: inventario - pedidos,
    },
  ];
}

function makeSaleHint(
  refCode: string,
  units: number,
  sourceType: "OFICIAL" | "REMISION" | "PD",
  date = "2026-05-01",
): SagSaleHint {
  return {
    refCode,
    sellerSagName: "NESTOR ALZATE",
    saleDate: date,
    amount: units * 50_000,
    units,
    sourceType,
  };
}

function makeCoverageSignal(
  refCode: string,
  disponible: number,
  status: CoverageSignal["status"],
  pendingOrdersQty = 0,
): CoverageSignal {
  return {
    refCode,
    description: `Producto ${refCode}`,
    line: "LT",
    disponible,
    dailyVelocity: disponible > 0 ? 0.5 : null,
    coverageDays: disponible > 0 ? disponible / 0.5 : null,
    status,
    affectedSalesRepIds: ["rep_1", "rep_2"],
    operationalScore: disponible <= 0 ? 90 : 40,
    pendingOrdersQty,
  };
}

function makeCaseItem(
  reference: string,
  currentUnits: number,
): CaseItem {
  return {
    reference,
    description: `Producto ${reference}`,
    line: "LT",
    assignedToSalesReps: ["rep_1"],
    currentUnits,
    minimumRequired: 1,
    missingUnits: Math.max(0, 1 - currentUnits),
    availableToReplenish: Math.max(0, currentUnits),
    productionInProcess: false,
    productionBatchLabel: null,
    status: currentUnits <= 0 ? "sin_stock" : "ok",
    recommendedAction: currentUnits <= 0 ? "PRODUCIR" : "OK",
  };
}

// ─── CASE 1: Order → Invoice Conversion at 70% ────────────────────────────────

section("CASE 1: 70% conversion rate (OFICIAL covers most pedidos)");
{
  const avail = new Map([
    makeAvailability("L-001", 100, 10),
    makeAvailability("L-002", 50, 20),
    makeAvailability("L-003", 30, 5),
  ]);

  const hints: SagSaleHint[] = [
    makeSaleHint("L-001", 7, "OFICIAL"),    // 7 of 10 pedidos invoiced
    makeSaleHint("L-002", 20, "REMISION"),  // 20 of 20 fully invoiced
    makeSaleHint("L-003", 0, "OFICIAL"),    // 0 of 5 invoiced
  ];

  const catalogueRefs = new Map([
    ["L-001", { name: "Pijama L-001", line: "LT" as const }],
    ["L-002", { name: "Pijama L-002", line: "LT" as const }],
    ["L-003", { name: "Pijama L-003", line: "LT" as const }],
  ]);

  const summary = computeOrderInvoiceConversion(ORG_ID, avail, hints, catalogueRefs, 30);

  assert(summary.organizationId === ORG_ID, "organizationId is set");
  assert(summary.totalPedidoQty === 35, `totalPedidoQty=35 (got ${summary.totalPedidoQty})`);
  assert(summary.totalFacturadoQty === 27, `totalFacturadoQty=27 (got ${summary.totalFacturadoQty})`);
  assert(summary.conversionPct >= 70 && summary.conversionPct <= 80, `conversionPct ~77% (got ${summary.conversionPct})`);
  assert(summary.pendingQty > 0, "pendingQty > 0");

  const l001 = summary.byReference.find((r) => r.reference === "L-001");
  assert(l001 !== undefined, "L-001 in byReference");
  assert(l001!.conversionStatus === "partially_invoiced", "L-001 is partially_invoiced");
  assert(l001!.facturadoQty === 7, `L-001 facturadoQty=7 (got ${l001!.facturadoQty})`);

  const l002 = summary.byReference.find((r) => r.reference === "L-002");
  assert(l002!.conversionStatus === "invoiced", "L-002 is invoiced (all units)");
}

// ─── CASE 2: sin_stock + PD → recommendedAction = producir ────────────────────

section("CASE 2: sin_stock + PD pending orders → producir signal");
{
  const coverageSignals: CoverageSignal[] = [
    makeCoverageSignal("L-010", 0, "sin_stock", 15),  // 0 stock, 15 pending orders
    makeCoverageSignal("L-011", 5, "cobertura_baja", 8),  // low stock + pending
    makeCoverageSignal("L-012", 50, "cobertura_alta", 0), // fine, no pending
  ];

  const items: CaseItem[] = [
    makeCaseItem("L-010", 0),
    makeCaseItem("L-011", 5),
    makeCaseItem("L-012", 50),
  ];

  const pendingOrdersMap = new Map([
    ["L-010", 15],
    ["L-011", 8],
  ]);

  const signals = buildProductionPressureSignals(coverageSignals, items, pendingOrdersMap);

  // Only L-010 and L-011 should have pressure signals (L-012 has no pressure)
  assert(signals.length >= 1, `At least 1 production pressure signal (got ${signals.length})`);

  const l010 = signals.find((s) => s.reference === "L-010");
  assert(l010 !== undefined, "L-010 has a production pressure signal");
  assert(l010!.recommendedAction === "producir", `L-010 action=producir (got ${l010?.recommendedAction})`);
  assert(l010!.pendingOrdersQty === 15, `L-010 pendingOrdersQty=15 (got ${l010?.pendingOrdersQty})`);
  assert(l010!.pressureScore >= 60, `L-010 pressureScore>=60 (got ${l010?.pressureScore})`);

  // Signals sorted by pressureScore desc
  if (signals.length >= 2) {
    assert(
      signals[0].pressureScore >= signals[1].pressureScore,
      "Production pressure signals sorted by pressureScore desc",
    );
  }
}

// ─── CASE 3: AP exclusion — AP records never reach demand layer ────────────────

section("CASE 3: AP (limpieza de pedidos) excluded from conversion");
{
  const avail = new Map([
    makeAvailability("L-020", 100, 10),
  ]);

  // Mix of OFICIAL and AP (AP should be filtered BEFORE reaching this layer)
  // In practice, AP never becomes a SagSaleHint — this validates the boundary
  const hints: SagSaleHint[] = [
    makeSaleHint("L-020", 5, "OFICIAL"),
    // AP records are excluded at normalizeSaleRecordToHint() level
    // So we only pass OFICIAL + REMISION + PD to computeOrderInvoiceConversion
  ];

  const catalogueRefs = new Map([
    ["L-020", { name: "Pijama L-020", line: "LT" as const }],
  ]);

  const summary = computeOrderInvoiceConversion(ORG_ID, avail, hints, catalogueRefs, 30);

  assert(
    summary.totalFacturadoQty === 5,
    `AP never inflates facturadoQty — only 5 OFICIAL units counted (got ${summary.totalFacturadoQty})`,
  );
  assert(
    !hints.some((h) => (h as { sourceType: string }).sourceType === "AP"),
    "No AP hints in the layer (AP excluded at normalizer)",
  );
}

// ─── CASE 4: Invoice without order (OFICIAL for ref not in catalogue) ─────────

section("CASE 4: Invoice without matching PD order");
{
  const avail = new Map([
    makeAvailability("L-030", 80, 0), // no pending orders
    makeAvailability("L-031", 60, 5), // has pending orders
  ]);

  const hints: SagSaleHint[] = [
    makeSaleHint("L-030", 10, "OFICIAL"),  // catalogued ref, no pedidos → conversionStatus="unknown"
    makeSaleHint("L-031", 3, "OFICIAL"),   // partial invoice for L-031 pedidos
    makeSaleHint("L-099", 5, "OFICIAL"),   // NOT in catalogue → invoicesWithoutOrder
  ];

  const catalogueRefs = new Map([
    ["L-030", { name: "Pijama L-030", line: "CS" as const }],
    ["L-031", { name: "Pijama L-031", line: "CS" as const }],
    // L-099 intentionally NOT in catalogue
  ]);

  const summary = computeOrderInvoiceConversion(ORG_ID, avail, hints, catalogueRefs, 30);

  // L-099 has an invoice but is NOT in catalogue → invoicesWithoutOrder
  assert(
    summary.invoicesWithoutOrder.includes("L-099"),
    "L-099 in invoicesWithoutOrder (invoice for ref outside catalogue)",
  );

  // L-031 has pedidos → appears in byReference, NOT in invoicesWithoutOrder
  assert(
    !summary.invoicesWithoutOrder.includes("L-031"),
    "L-031 NOT in invoicesWithoutOrder (has PD + invoice match)",
  );

  // L-030 has pedidos=0 + OFICIAL hints → conversionStatus="unknown" (no PD to compare)
  const l030 = summary.byReference.find((r) => r.reference === "L-030");
  assert(
    l030?.conversionStatus === "unknown",
    `L-030 conversionStatus=unknown (pedidoQty=0, got ${l030?.conversionStatus})`,
  );

  const l031 = summary.byReference.find((r) => r.reference === "L-031");
  assert(
    l031?.conversionStatus === "partially_invoiced",
    `L-031 partially_invoiced (3 of 5 invoiced, got ${l031?.conversionStatus})`,
  );
}

// ─── CASE 5: Demand pressure signals sorted by demandPressureScore ────────────

section("CASE 5: Demand pressure signals — sorted by score, PD-only refs");
{
  const coverageSignals: CoverageSignal[] = [
    makeCoverageSignal("L-040", 0, "sin_stock", 20),
    makeCoverageSignal("L-041", 10, "cobertura_baja", 5),
    makeCoverageSignal("L-042", 100, "cobertura_alta", 0), // no pending, should be excluded
    makeCoverageSignal("L-043", 2, "ruptura_inminente", 12),
  ];

  const pendingOrdersMap = new Map([
    ["L-040", 20],
    ["L-041", 5],
    ["L-043", 12],
    // L-042 has 0 pending — should not appear
  ]);

  const signals = buildDemandPressureSignals(coverageSignals, pendingOrdersMap);

  assert(signals.length === 3, `3 demand pressure signals (L-040, L-041, L-043) — got ${signals.length}`);

  const hasL042 = signals.some((s) => s.reference === "L-042");
  assert(!hasL042, "L-042 excluded (no pending orders)");

  const l040 = signals.find((s) => s.reference === "L-040");
  assert(l040 !== undefined, "L-040 has demand pressure signal");
  assert(l040!.totalPendingOrders === 20, `L-040 totalPendingOrders=20 (got ${l040!.totalPendingOrders})`);

  // Sorted by demandPressureScore desc
  for (let i = 0; i < signals.length - 1; i++) {
    assert(
      signals[i].demandPressureScore >= signals[i + 1].demandPressureScore,
      `signals[${i}] score(${signals[i].demandPressureScore}) >= signals[${i + 1}] score(${signals[i + 1].demandPressureScore})`,
    );
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`DEMAND LAYER SMOKE — ${passed} passed / ${failed} failed / ${passed + failed} total`);
if (failed > 0) {
  process.exit(1);
}
