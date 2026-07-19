/**
 * lib/comercial/maletas/__tests__/maletas-sag-sources.smoke.ts
 *
 * Smoke test for SAG source mapping rules and availability calculation.
 * Validates the three core business rules confirmed by Castillitos administration.
 *
 * Run: npx ts-node --transpile-only lib/comercial/maletas/__tests__/maletas-sag-sources.smoke.ts
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-SAG-SOURCES-PATCH-01
 */

import { computeCoverageStatus, computeOperationalScore } from "../maletas-coverage";
import { normalizeSaleRecordToHint, normalizeOperationalAvailability, SAG_SOURCE_SEMANTICS } from "../maletas-sag-adapter";
import { normalizeAvailabilityRecord, buildPendingOrdersMap } from "../maletas-normalizer";

// ─── Assertion helpers ────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAILED: ${label}`);
    failed++;
  }
}

function assertEqual<T>(label: string, actual: T, expected: T): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✓ ${label}: ${JSON.stringify(actual)}`);
    passed++;
  } else {
    console.error(`  ✗ FAILED: ${label}`);
    console.error(`      expected: ${JSON.stringify(expected)}`);
    console.error(`      actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ─── Test case 1: Disponible operativo = bodega inicial - reservas ────────────

console.log("\n[Case 1] availableForCases = initialWarehouseQty - reservedQty");

const avail = normalizeOperationalAvailability({
  reference:           "L-TEST-01",
  initialWarehouseQty: 10,
  reservedQty:         7,
  source:              "SAG",
});

assertEqual("availableForCases = 10 - 7 = 3", avail.availableForCases, 3);
assertEqual("initialWarehouseQty preserved", avail.initialWarehouseQty, 10);
assertEqual("reservedQty preserved", avail.reservedQty, 7);

// ─── Test case 2: PD > 0 + availableForCases = 0 → sin_stock + high priority ─

console.log("\n[Case 2] PD > 0 + availableForCases = 0 → sin_stock, high score");

const { status: s2, coverageDays: cd2 } = computeCoverageStatus(0, null);
assertEqual("status = sin_stock", s2, "sin_stock");
assertEqual("coverageDays = 0", cd2, 0);

const scoreNoPD    = computeOperationalScore("sin_stock", 0, 2, "activa", undefined);
const scoreWithPD  = computeOperationalScore("sin_stock", 0, 2, "activa", 5);
assert("sin_stock + PD > score than without PD", scoreWithPD > scoreNoPD);
assert("sin_stock + PD score >= 90", scoreWithPD >= 90);

console.log(`    score without PD: ${scoreNoPD}, score with PD(5): ${scoreWithPD}`);

// ─── Test case 3: mínimo = 5, disponible = 3 → bajo_minimo / cobertura_baja ──

console.log("\n[Case 3] bodega=10, reservas=7 → disponible=3, mínimo=5 → bajo mínimo");

const rawRecord = normalizeAvailabilityRecord({
  refCode:     "L-TEST-02",
  description: "Pijama niña bebé",
  inventario:  10,
  pedidos:     7,
  disponible:  3,
});

assertEqual("inventario preserved", rawRecord.inventario, 10);
assertEqual("pedidos preserved",   rawRecord.pedidos, 7);
assertEqual("disponible = 3",      rawRecord.disponible, 3);

// Available (3) < minimum (5) → coverage status depends on velocity
// With velocity: 3 units at 1u/day = 3 days → ruptura_inminente
const { status: s3, coverageDays: cd3 } = computeCoverageStatus(3, 1);
assertEqual("3u at 1u/day → ruptura_inminente", s3, "ruptura_inminente");
assertEqual("coverageDays = 3", cd3, 3);

// Without velocity: sin_datos_velocidad (can't compute coverage)
const { status: s3b } = computeCoverageStatus(3, null);
assertEqual("3u, no velocity → sin_datos_velocidad", s3b, "sin_datos_velocidad");

// ─── Test case 4: AP source → excluded from all calculations ─────────────────

console.log("\n[Case 4] AP source (limpieza de pedidos) → excluded from all hints");

const apRecord = normalizeSaleRecordToHint({
  productCode:   "L-TEST-03",
  sellerName:    "NESTOR FERNANDO ALZATE JIMENEZ",
  saleDate:      new Date("2025-05-01"),
  amount:        50000,
  units:         5,
  sagSourceType: "AP",
});

assertEqual("AP → returns null (excluded)", apRecord, null);
assert("AP excludeFromAll = true", SAG_SOURCE_SEMANTICS.AP.excludeFromAll === true);
assert("AP isSale = false",        SAG_SOURCE_SEMANTICS.AP.isSale === false);
assert("AP affectsDemand = false", SAG_SOURCE_SEMANTICS.AP.affectsDemand === false);

// ─── Test case 5: PD source semantics ────────────────────────────────────────

console.log("\n[Case 5] PD source (pedidos) → demand signal, NOT velocity");

assert("PD isSale = false",               SAG_SOURCE_SEMANTICS.PD.isSale === false);
assert("PD affectsDemand = true",         SAG_SOURCE_SEMANTICS.PD.affectsDemand === true);
assert("PD affectsSalesVelocity = false", SAG_SOURCE_SEMANTICS.PD.affectsSalesVelocity === false);
assert("PD excludeFromAll = false",       SAG_SOURCE_SEMANTICS.PD.excludeFromAll === false);

// PD record as sale hint (included as pressure signal, not velocity)
const pdHint = normalizeSaleRecordToHint({
  productCode:   "L-TEST-04",
  sellerName:    "NESTOR FERNANDO ALZATE JIMENEZ",
  saleDate:      new Date("2025-05-01"),
  amount:        50000,
  units:         3,
  sagSourceType: "PD",
});

assert("PD → included in hints (non-null)", pdHint !== null);
if (pdHint) {
  assertEqual("PD hint sourceType = PD", pdHint.sourceType, "PD");
}

// ─── Test case 6: buildPendingOrdersMap extracts pedidos ────────────────────

console.log("\n[Case 6] buildPendingOrdersMap extracts PD pressure from availability");

const availMap = new Map([
  ["L-2407", normalizeAvailabilityRecord({ refCode: "L-2407", inventario: 20, pedidos: 5 })],
  ["L-2408", normalizeAvailabilityRecord({ refCode: "L-2408", inventario: 10, pedidos: 0 })],
  ["L-2409", normalizeAvailabilityRecord({ refCode: "L-2409", inventario: 8,  pedidos: 8 })],
]);

const pendingMap = buildPendingOrdersMap(availMap);

assertEqual("L-2407 has 5 pending",       pendingMap.get("L-2407"), 5);
assert("L-2408 not in map (pedidos=0)",    !pendingMap.has("L-2408"));
assertEqual("L-2409 has 8 pending",       pendingMap.get("L-2409"), 8);

// L-2409: pedidos=8, inventario=8 → disponible=0 → sin_stock + PD pressure
const r2409 = availMap.get("L-2409")!;
const { status: s6 } = computeCoverageStatus(r2409.disponible, null);
assertEqual("L-2409 disponible=0 → sin_stock", s6, "sin_stock");

const score2409WithPD    = computeOperationalScore("sin_stock", 0, 1, "sin_rotacion_conocida", pendingMap.get("L-2409"));
const score2409WithoutPD = computeOperationalScore("sin_stock", 0, 1, "sin_rotacion_conocida", undefined);
assert("PD pressure elevates score on stockout", score2409WithPD > score2409WithoutPD);

// ─── Test case 7: OFICIAL + REMISION → included in velocity ──────────────────

console.log("\n[Case 7] OFICIAL and REMISION → valid sale hints");

for (const sourceType of ["OFICIAL", "REMISION"] as const) {
  const hint = normalizeSaleRecordToHint({
    productCode:   "L-TEST-05",
    sellerName:    "NESTOR FERNANDO ALZATE JIMENEZ",
    saleDate:      new Date("2025-05-01"),
    amount:        80000,
    units:         10,
    sagSourceType: sourceType,
  });
  assert(`${sourceType} → non-null hint`, hint !== null);
  if (hint) {
    assertEqual(`${sourceType} hint sourceType`, hint.sourceType, sourceType);
  }
  assert(`${sourceType} isSale = true`,               SAG_SOURCE_SEMANTICS[sourceType].isSale === true);
  assert(`${sourceType} affectsSalesVelocity = true`, SAG_SOURCE_SEMANTICS[sourceType].affectsSalesVelocity === true);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`  Smoke test results`);
console.log(`  ✓ Passed: ${passed}`);
if (failed > 0) {
  console.error(`  ✗ Failed: ${failed}`);
  process.exit(1);
} else {
  console.log(`  All assertions passed.`);
}
