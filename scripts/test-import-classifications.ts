/**
 * _test-import-classifications.ts
 *
 * 12 pure-function unit tests for import classification logic.
 * Tests the classification functions from import-intelligence-service.ts
 * by extracting and testing the classification rules directly.
 *
 * Sprint: AGENTIK-IMPORTS-DATA-TRUST-CALIBRATION-01
 *
 * Usage: npx tsx scripts/_test-import-classifications.ts
 */

import type {
  ImportedReference,
  SaludComercial,
  RecompraClassification,
  EnvejecimientoClassification,
  BajaRotacionClassification,
  Prioridad,
  InventoryAgingStatusLite,
  RepurchaseStatus,
  StockDataQuality,
  EntryDateSource,
  SalesDataQuality,
} from "@/lib/comercial/importaciones/import-types";

// ── Extracted classification logic (mirrors import-intelligence-service.ts) ──

function classifySaludComercial(
  ref: Pick<ImportedReference, "stockDataQuality" | "entryDateSource" | "soldNet" | "salesTotal6m" | "daysSinceLastEntry" | "remaining" | "salesDataQuality">,
  agingStatus: InventoryAgingStatusLite,
): { saludComercial: SaludComercial; saludComercialRazon: string } {
  const hasConfirmedStock = ref.stockDataQuality === "CONFIRMED";
  const hasConfirmedDate = ref.entryDateSource === "SAG_RECEIPT";

  if (!hasConfirmedDate && ref.soldNet === 0) {
    return { saludComercial: "SIN_DATOS", saludComercialRazon: "Sin fecha de ingreso ni ventas registradas." };
  }
  if (!hasConfirmedStock && !hasConfirmedDate && ref.salesTotal6m === 0) {
    return { saludComercial: "SIN_DATOS", saludComercialRazon: "Sin datos confirmados de stock ni fecha de ingreso." };
  }

  if (hasConfirmedDate && (agingStatus === "LOW_ROTATION" || agingStatus === "OBSOLETE_CANDIDATE")) {
    const meses = Math.round(ref.daysSinceLastEntry! / 30);
    return {
      saludComercial: "CRITICA",
      saludComercialRazon: `Inventario de ${meses} meses sin reposicion${ref.salesTotal6m > 0 ? ` (${ref.salesTotal6m} und vendidas en 6M)` : ""}.`,
    };
  }
  if (hasConfirmedStock && ref.remaining === 0 && ref.salesTotal6m > 0) {
    return { saludComercial: "CRITICA", saludComercialRazon: `Stock agotado con ${ref.salesTotal6m} und vendidas en 6M.` };
  }

  if (hasConfirmedDate && agingStatus === "AGING") {
    return { saludComercial: "EN_RIESGO", saludComercialRazon: "Inventario envejeciendo (6-8 meses)." };
  }
  if (hasConfirmedStock && ref.remaining > 0 && ref.remaining <= 20 && ref.salesTotal6m > 0) {
    return { saludComercial: "EN_RIESGO", saludComercialRazon: `Stock bajo (${ref.remaining} und) con demanda activa.` };
  }

  if (hasConfirmedStock && ref.remaining > 0 && ref.salesTotal6m > 0) {
    return { saludComercial: "SANA", saludComercialRazon: "Stock confirmado con ventas activas." };
  }

  return { saludComercial: "SIN_DATOS", saludComercialRazon: "Datos insuficientes para clasificar salud comercial." };
}

function classifyEnvejecimiento(
  ref: Pick<ImportedReference, "entryDateSource" | "daysSinceLastEntry">,
): EnvejecimientoClassification {
  if (ref.entryDateSource === "NONE") return "SIN_DATOS";
  const days = ref.daysSinceLastEntry;
  if (days === null) return "SIN_DATOS";
  if (days <= 90) return "0_3M";
  if (days <= 180) return "3_6M";
  if (days <= 240) return "6_8M";
  if (days <= 365) return "8_12M";
  return "12M_PLUS";
}

function classifyBajaRotacion(
  ref: Pick<ImportedReference, "entryDateSource" | "daysSinceLastEntry" | "stockDataQuality" | "remaining" | "salesTotal6m">,
  agingStatus: InventoryAgingStatusLite,
): BajaRotacionClassification | null {
  const hasConfirmedDate = ref.entryDateSource === "SAG_RECEIPT";
  const hasConfirmedStock = ref.stockDataQuality === "CONFIRMED";
  const isOldEnough = hasConfirmedDate && ref.daysSinceLastEntry !== null && ref.daysSinceLastEntry > 240;

  if (!isOldEnough || !hasConfirmedStock || ref.remaining <= 0) return null;

  if (ref.salesTotal6m === 0) return "SIN_MOVIMIENTO";
  if (ref.remaining > 100 && ref.salesTotal6m < 10) return "SOBRESTOCK";
  if (agingStatus === "OBSOLETE_CANDIDATE") return "REVISAR_CONTINUIDAD";

  return null;
}

function classifyPrioridad(
  ref: Pick<ImportedReference, "repurchaseStatus" | "repurchaseMotivo" | "salesTotal6m" | "remaining">,
  saludComercial: SaludComercial,
): { prioridad: Prioridad; prioridadRazon: string } {
  if (ref.repurchaseStatus === "RECOMPRAR" || saludComercial === "CRITICA") {
    const razon = ref.repurchaseStatus === "RECOMPRAR"
      ? `Stock agotado; ${ref.salesTotal6m} und vendidas en 6M`
      : "Salud comercial critica";
    return { prioridad: "ALTA", prioridadRazon: razon };
  }
  if (ref.repurchaseStatus === "VIGILAR" || saludComercial === "EN_RIESGO") {
    return { prioridad: "MEDIA", prioridadRazon: "Monitorear esta semana." };
  }
  if (saludComercial === "SANA" && ref.salesTotal6m > 0) {
    return { prioridad: "BAJA", prioridadRazon: "Sin accion requerida." };
  }
  return { prioridad: "SIN_ACCION", prioridadRazon: "Verificar datos." };
}

// ── Test runner ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e: any) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${e.message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected "${expected}", got "${actual}"`);
  }
}

// ── Base reference factory ───────────────────────────────────────────────────

function makeRef(overrides: Partial<ImportedReference> = {}): ImportedReference {
  return {
    productId: "test-id",
    reference: "TEST-001",
    description: "Test reference",
    entryDate: "2025-01-15",
    entryDateQuality: "CONFIRMED",
    lastEntryDate: "2025-06-01",
    container: null,
    pricePV4: 10000,
    pricePV3: 15000,
    totalImported: 500,
    totalImportedQuality: "CONFIRMED",
    soldGross: 200,
    returns: 10,
    soldNet: 190,
    sold: 190,
    remaining: 100,
    stockDataQuality: "CONFIRMED",
    totalStock: 120,
    percentSold: 38,
    daysSinceLastEntry: 120,
    entryDateSource: "SAG_RECEIPT",
    daysInWarehouse: 120,
    repurchaseStatus: "VIGILAR",
    repurchaseMotivo: "stock_suficiente",
    salesDataQuality: "SYNCED",
    sales6mGross: 80,
    returns6m: 5,
    sales6mNet: 75,
    salesTotal6m: 75,
    salesDetal6m: 40,
    salesMayorista6m: 30,
    salesNoDet6m: 5,
    soldDetal: 100,
    soldMayorista: 80,
    soldNoDet: 10,
    channelQuality: "ESTIMATED",
    channelPending: false,
    channelConfidence: 0.85,
    batchCount: 2,
    dominantChannel: "detal",
    receiptCount: 2,
    receipts: [],
    revenueAll: 2000000,
    revenue6m: 800000,
    revenueDetal6m: 400000,
    revenueMayorista6m: 300000,
    ...overrides,
  };
}

// ── 12 Unit Tests ────────────────────────────────────────────────────────────

console.log("\nAGENTIK-IMPORTS-DATA-TRUST-CALIBRATION-01 — Classification Unit Tests\n");

// Test 1: NO_PIL_RECORD + no sales → SIN_DATOS salud
test("T01: NO_PIL_RECORD + no confirmed date + no sales → SIN_DATOS", () => {
  const ref = makeRef({
    stockDataQuality: "NO_PIL_RECORD",
    entryDateSource: "NONE",
    soldNet: 0,
    salesTotal6m: 0,
    remaining: 0,
    daysSinceLastEntry: null,
  });
  const { saludComercial } = classifySaludComercial(ref, "NORMAL");
  assertEqual(saludComercial, "SIN_DATOS", "saludComercial");
});

// Test 2: Confirmed stock depleted + active demand → CRITICA
test("T02: Confirmed stock=0 + salesTotal6m > 0 → CRITICA", () => {
  const ref = makeRef({
    stockDataQuality: "CONFIRMED",
    remaining: 0,
    salesTotal6m: 2,
    soldNet: 10,
    entryDateSource: "SAG_RECEIPT",
    daysSinceLastEntry: 120,
  });
  const { saludComercial } = classifySaludComercial(ref, "NORMAL");
  assertEqual(saludComercial, "CRITICA", "saludComercial");
});

// Test 3: NO_PIL_RECORD must NEVER be SANA
test("T03: NO_PIL_RECORD → never SANA (even with high sales)", () => {
  const ref = makeRef({
    stockDataQuality: "NO_PIL_RECORD",
    remaining: 0,
    salesTotal6m: 100,
    soldNet: 500,
    entryDateSource: "SAG_RECEIPT",
    daysSinceLastEntry: 60,
  });
  const { saludComercial } = classifySaludComercial(ref, "NEW");
  // Should NOT be SANA because hasConfirmedStock is false
  assertEqual(saludComercial !== "SANA", true, "not SANA");
});

// Test 4: Missing entry date → envejecimiento SIN_DATOS (not 12M_PLUS)
test("T04: entryDateSource=NONE → envejecimiento SIN_DATOS", () => {
  const ref = makeRef({ entryDateSource: "NONE", daysSinceLastEntry: null });
  const result = classifyEnvejecimiento(ref);
  assertEqual(result, "SIN_DATOS", "envejecimiento");
});

// Test 5: Confirmed recent entry → 0_3M
test("T05: daysSinceLastEntry=60 → envejecimiento 0_3M", () => {
  const ref = makeRef({ entryDateSource: "SAG_RECEIPT", daysSinceLastEntry: 60 });
  assertEqual(classifyEnvejecimiento(ref), "0_3M", "envejecimiento");
});

// Test 6: >365 days confirmed → 12M_PLUS
test("T06: daysSinceLastEntry=400 → envejecimiento 12M_PLUS", () => {
  const ref = makeRef({ entryDateSource: "SAG_RECEIPT", daysSinceLastEntry: 400 });
  assertEqual(classifyEnvejecimiento(ref), "12M_PLUS", "envejecimiento");
});

// Test 7: New product without sales must NOT be baja rotacion
test("T07: New product (30 days) no sales → NOT baja rotacion", () => {
  const ref = makeRef({
    entryDateSource: "SAG_RECEIPT",
    daysSinceLastEntry: 30,
    stockDataQuality: "CONFIRMED",
    remaining: 200,
    salesTotal6m: 0,
  });
  const result = classifyBajaRotacion(ref, "NEW");
  assertEqual(result, null, "bajaRotacion");
});

// Test 8: Old product (>240d) + confirmed stock + no sales → SIN_MOVIMIENTO
test("T08: >240 days + confirmed stock + zero sales → SIN_MOVIMIENTO", () => {
  const ref = makeRef({
    entryDateSource: "SAG_RECEIPT",
    daysSinceLastEntry: 300,
    stockDataQuality: "CONFIRMED",
    remaining: 50,
    salesTotal6m: 0,
  });
  const result = classifyBajaRotacion(ref, "LOW_ROTATION");
  assertEqual(result, "SIN_MOVIMIENTO", "bajaRotacion");
});

// Test 9: No confirmed date → NOT baja rotacion (even with no sales)
test("T09: No confirmed date → NOT baja rotacion", () => {
  const ref = makeRef({
    entryDateSource: "NONE",
    daysSinceLastEntry: null,
    stockDataQuality: "CONFIRMED",
    remaining: 200,
    salesTotal6m: 0,
  });
  const result = classifyBajaRotacion(ref, "NORMAL");
  assertEqual(result, null, "bajaRotacion");
});

// Test 10: SANA + ALTA prohibited (matrix alignment)
test("T10: SANA salud → prioridad NOT ALTA", () => {
  const ref = makeRef({
    stockDataQuality: "CONFIRMED",
    salesTotal6m: 50,
    remaining: 200,
    repurchaseStatus: "VIGILAR",
    repurchaseMotivo: "stock_suficiente",
  });
  const { prioridad } = classifyPrioridad(ref, "SANA");
  assertEqual(prioridad !== "ALTA", true, "not ALTA");
});

// Test 11: RECOMPRAR → prioridad ALTA
test("T11: repurchaseStatus=RECOMPRAR → prioridad ALTA", () => {
  const ref = makeRef({
    repurchaseStatus: "RECOMPRAR",
    repurchaseMotivo: "desabastecimiento",
    salesTotal6m: 80,
    remaining: 5,
  });
  const { prioridad } = classifyPrioridad(ref, "CRITICA");
  assertEqual(prioridad, "ALTA", "prioridad");
});

// Test 12: SIN_DATOS salud + SIN_DATOS repurchase → SIN_ACCION
test("T12: SIN_DATOS salud + SIN_DATOS repurchase → SIN_ACCION", () => {
  const ref = makeRef({
    repurchaseStatus: "SIN_DATOS",
    repurchaseMotivo: "sin_datos",
    salesTotal6m: 0,
    remaining: 0,
  });
  const { prioridad } = classifyPrioridad(ref, "SIN_DATOS");
  assertEqual(prioridad, "SIN_ACCION", "prioridad");
});

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(50)}`);
console.log(`  Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"=".repeat(50)}\n`);

if (failed > 0) process.exit(1);
