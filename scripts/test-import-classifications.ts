/**
 * test-import-classifications.ts
 *
 * Unit tests for import classification and simplification logic.
 * Tests classification functions + new resolveLastInbound / resolveSizeClass logic.
 *
 * Sprint: AGENTIK-IMPORTS-SIMPLIFICATION-01
 *
 * Usage: npx tsx scripts/test-import-classifications.ts
 */

import type {
  ImportedReference,
  SaludComercial,
  RecompraClassification,
  EnvejecimientoClassification,
  BajaRotacionClassification,
  Prioridad,
  InventoryAgingStatusLite,
  ImportLastInboundSource,
  ImportSizeClass,
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

// ── New: resolveLastInbound (mirrors import-intelligence-service.ts) ──────

function resolveLastInbound(
  ref: Pick<ImportedReference, "entryDateSource" | "lastEntryDate" | "daysSinceLastEntry">,
  lastPurchaseSag: string | null,
): { lastInboundDate: string | null; lastInboundSource: ImportLastInboundSource; daysSinceLastInbound: number | null } {
  if (ref.entryDateSource === "SAG_RECEIPT" && ref.lastEntryDate) {
    return {
      lastInboundDate: ref.lastEntryDate,
      lastInboundSource: "SAG_RECEIPT_C1_C2",
      daysSinceLastInbound: ref.daysSinceLastEntry,
    };
  }
  if (lastPurchaseSag) {
    const purchaseDate = new Date(lastPurchaseSag);
    const days = Math.floor((Date.now() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24));
    return {
      lastInboundDate: purchaseDate.toISOString().split("T")[0],
      lastInboundSource: "LAST_PURCHASE_SAG",
      daysSinceLastInbound: days,
    };
  }
  return { lastInboundDate: null, lastInboundSource: "UNAVAILABLE", daysSinceLastInbound: null };
}

// ── New: resolveSizeClass (mirrors import-intelligence-service.ts) ────────

const CANONICAL_SIZE_CLASSES = new Set<string>(["PEQUENO", "MEDIANO", "GRANDE"]);

function resolveSizeClass(handlingUnit: string | null): ImportSizeClass | null {
  if (handlingUnit && CANONICAL_SIZE_CLASSES.has(handlingUnit)) {
    return handlingUnit as ImportSizeClass;
  }
  return null;
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

// ══════════════════════════════════════════════════════════════════════════════
// ORIGINAL 12 TESTS (from DATA-TRUST-CALIBRATION-01)
// ══════════════════════════════════════════════════════════════════════════════

console.log("\nAGENTIK-IMPORTS-SIMPLIFICATION-01 — Unit Tests\n");
console.log("── Original classification tests ──\n");

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
  assertEqual(saludComercial !== "SANA", true, "not SANA");
});

test("T04: entryDateSource=NONE → envejecimiento SIN_DATOS", () => {
  const ref = makeRef({ entryDateSource: "NONE", daysSinceLastEntry: null });
  const result = classifyEnvejecimiento(ref);
  assertEqual(result, "SIN_DATOS", "envejecimiento");
});

test("T05: daysSinceLastEntry=60 → envejecimiento 0_3M", () => {
  const ref = makeRef({ entryDateSource: "SAG_RECEIPT", daysSinceLastEntry: 60 });
  assertEqual(classifyEnvejecimiento(ref), "0_3M", "envejecimiento");
});

test("T06: daysSinceLastEntry=400 → envejecimiento 12M_PLUS", () => {
  const ref = makeRef({ entryDateSource: "SAG_RECEIPT", daysSinceLastEntry: 400 });
  assertEqual(classifyEnvejecimiento(ref), "12M_PLUS", "envejecimiento");
});

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

// ══════════════════════════════════════════════════════════════════════════════
// NEW TESTS (SIMPLIFICATION-01)
// ══════════════════════════════════════════════════════════════════════════════

console.log("\n── resolveLastInbound tests ──\n");

test("T13: C1/C2 receipt → SAG_RECEIPT_C1_C2 (highest priority)", () => {
  const ref = makeRef({ entryDateSource: "SAG_RECEIPT", lastEntryDate: "2025-06-01", daysSinceLastEntry: 120 });
  const result = resolveLastInbound(ref, "2025-05-15");
  assertEqual(result.lastInboundSource, "SAG_RECEIPT_C1_C2", "source");
  assertEqual(result.lastInboundDate, "2025-06-01", "date");
  assertEqual(result.daysSinceLastInbound, 120, "days");
});

test("T14: No C1/C2 + lastPurchaseSag → LAST_PURCHASE_SAG fallback", () => {
  const ref = makeRef({ entryDateSource: "NONE", lastEntryDate: null, daysSinceLastEntry: null });
  const result = resolveLastInbound(ref, "2025-01-15");
  assertEqual(result.lastInboundSource, "LAST_PURCHASE_SAG", "source");
  assertEqual(result.lastInboundDate !== null, true, "has date");
  assertEqual(result.daysSinceLastInbound !== null, true, "has days");
  assertEqual(result.daysSinceLastInbound! > 0, true, "days > 0");
});

test("T15: No C1/C2 + no lastPurchaseSag → UNAVAILABLE", () => {
  const ref = makeRef({ entryDateSource: "NONE", lastEntryDate: null, daysSinceLastEntry: null });
  const result = resolveLastInbound(ref, null);
  assertEqual(result.lastInboundSource, "UNAVAILABLE", "source");
  assertEqual(result.lastInboundDate, null, "date");
  assertEqual(result.daysSinceLastInbound, null, "days");
});

test("T16: C1/C2 always wins even when lastPurchaseSag is newer", () => {
  const ref = makeRef({ entryDateSource: "SAG_RECEIPT", lastEntryDate: "2024-01-01", daysSinceLastEntry: 500 });
  const result = resolveLastInbound(ref, "2025-06-01"); // newer
  assertEqual(result.lastInboundSource, "SAG_RECEIPT_C1_C2", "source");
  assertEqual(result.lastInboundDate, "2024-01-01", "date from C1/C2");
});

console.log("\n── resolveSizeClass tests ──\n");

test("T17: PEQUENO → valid sizeClass", () => {
  assertEqual(resolveSizeClass("PEQUENO"), "PEQUENO", "sizeClass");
});

test("T18: MEDIANO → valid sizeClass", () => {
  assertEqual(resolveSizeClass("MEDIANO"), "MEDIANO", "sizeClass");
});

test("T19: GRANDE → valid sizeClass", () => {
  assertEqual(resolveSizeClass("GRANDE"), "GRANDE", "sizeClass");
});

test("T20: Unknown handlingUnit → null", () => {
  assertEqual(resolveSizeClass("CAJA"), null, "sizeClass");
});

test("T21: null handlingUnit → null", () => {
  assertEqual(resolveSizeClass(null), null, "sizeClass");
});

test("T22: Empty string → null", () => {
  assertEqual(resolveSizeClass(""), null, "sizeClass");
});

console.log("\n── Inventario lento classification tests ──\n");

test("T23: daysSinceLastInbound > 240 + remaining > 0 → inventario lento", () => {
  // This tests the KPI filter logic used in computeKpis
  const daysThreshold = 240;
  const item = { daysSinceLastInbound: 300, remaining: 50 };
  const isLento = item.daysSinceLastInbound > daysThreshold && item.remaining > 0;
  assertEqual(isLento, true, "isLento");
});

test("T24: daysSinceLastInbound = 200 → NOT inventario lento", () => {
  const item = { daysSinceLastInbound: 200, remaining: 50 };
  const isLento = item.daysSinceLastInbound > 240 && item.remaining > 0;
  assertEqual(isLento, false, "isLento");
});

test("T25: daysSinceLastInbound > 240 but remaining = 0 → NOT inventario lento", () => {
  const item = { daysSinceLastInbound: 300, remaining: 0 };
  const isLento = item.daysSinceLastInbound > 240 && item.remaining > 0;
  assertEqual(isLento, false, "isLento");
});

test("T26: daysSinceLastInbound null → NOT inventario lento", () => {
  const item = { daysSinceLastInbound: null as number | null, remaining: 50 };
  const isLento = item.daysSinceLastInbound !== null && item.daysSinceLastInbound > 240 && item.remaining > 0;
  assertEqual(isLento, false, "isLento");
});

console.log("\n── Inventario lento sub-classification tests ──\n");

test("T27: >240d + remaining>0 + salesTotal6m=0 → sin movimiento", () => {
  const item = { daysSinceLastInbound: 300, remaining: 50, salesTotal6m: 0 };
  const isLento = item.daysSinceLastInbound > 240 && item.remaining > 0;
  const isSinMov = isLento && item.salesTotal6m === 0;
  assertEqual(isSinMov, true, "sinMovimiento");
});

test("T28: >240d + remaining>100 + salesTotal6m<10 → sobrestock", () => {
  const item = { daysSinceLastInbound: 300, remaining: 150, salesTotal6m: 5 };
  const isLento = item.daysSinceLastInbound > 240 && item.remaining > 0;
  const isSobrestock = isLento && item.remaining > 100 && item.salesTotal6m > 0 && item.salesTotal6m < 10;
  assertEqual(isSobrestock, true, "sobrestock");
});

// ══════════════════════════════════════════════════════════════════════════════
// REVIEW TESTS (SIMPLIFICATION-01 final review)
// ══════════════════════════════════════════════════════════════════════════════

console.log("\n── Cobertura guard tests (HC0213049 fix) ──\n");

// Mirrors computeRepurchaseDecision() logic with cobertura guard
function computeRepurchaseDecision(input: {
  percentSold: number | null;
  remaining: number;
  totalStock: number;
  sold: number;
  salesTotal6m: number;
  batchCount: number;
  stockDataQuality: StockDataQuality;
}): { status: RepurchaseStatus; motivo: string } {
  const { percentSold, remaining, totalStock, sold, salesTotal6m, batchCount, stockDataQuality } = input;

  if (sold === 0) return { status: "SIN_DATOS", motivo: "sin_datos" };

  if (stockDataQuality === "CONFIRMED" && remaining <= 20 && salesTotal6m > 0) {
    const coberturaDias = remaining / (salesTotal6m / 180);
    if (coberturaDias > 180) {
      return { status: "VIGILAR", motivo: "stock_suficiente" };
    }
    return { status: "RECOMPRAR", motivo: "desabastecimiento" };
  }

  if (stockDataQuality === "CONFIRMED" && percentSold !== null && percentSold >= 70 && salesTotal6m > 10 && remaining <= 50) {
    return { status: "RECOMPRAR", motivo: "alta_rotacion" };
  }

  if (percentSold !== null && sold >= 200 && percentSold >= 80) {
    if (stockDataQuality === "CONFIRMED" && remaining <= 50 && salesTotal6m > 0) {
      return { status: "RECOMPRAR", motivo: "exito_historico" };
    }
    return { status: "VIGILAR", motivo: "exito_historico" };
  }

  if (batchCount > 1 && percentSold !== null && percentSold >= 60) {
    if (stockDataQuality === "CONFIRMED" && remaining <= 50 && salesTotal6m > 0) {
      return { status: "RECOMPRAR", motivo: "recompra_recurrente" };
    }
    return { status: "VIGILAR", motivo: "recompra_recurrente" };
  }

  if (salesTotal6m > 0 && (remaining > 50 || totalStock > 50)) {
    return { status: "VIGILAR", motivo: "stock_suficiente" };
  }

  if (percentSold !== null && percentSold >= 40) {
    return { status: "VIGILAR", motivo: "stock_suficiente" };
  }

  return { status: "NO_RECOMPRAR", motivo: "baja_rotacion" };
}

test("T29: HC0213049 pattern (stock=14, sales6m=13, cobertura=194d) → VIGILAR not RECOMPRAR", () => {
  const result = computeRepurchaseDecision({
    percentSold: null,
    remaining: 14,
    totalStock: 14,
    sold: 50,
    salesTotal6m: 13,
    batchCount: 1,
    stockDataQuality: "CONFIRMED",
  });
  assertEqual(result.status, "VIGILAR", "status");
  assertEqual(result.motivo, "stock_suficiente", "motivo");
});

test("T30: True desabastecimiento (stock=5, sales6m=80, cobertura=11d) → RECOMPRAR", () => {
  const result = computeRepurchaseDecision({
    percentSold: null,
    remaining: 5,
    totalStock: 5,
    sold: 200,
    salesTotal6m: 80,
    batchCount: 1,
    stockDataQuality: "CONFIRMED",
  });
  assertEqual(result.status, "RECOMPRAR", "status");
  assertEqual(result.motivo, "desabastecimiento", "motivo");
});

test("T31: Edge case — stock=0, sales6m>0, cobertura=0d → RECOMPRAR", () => {
  const result = computeRepurchaseDecision({
    percentSold: null,
    remaining: 0,
    totalStock: 0,
    sold: 100,
    salesTotal6m: 50,
    batchCount: 1,
    stockDataQuality: "CONFIRMED",
  });
  assertEqual(result.status, "RECOMPRAR", "status");
});

test("T32: Borderline — stock=20, sales6m=20, cobertura=180d → RECOMPRAR (not >180)", () => {
  const result = computeRepurchaseDecision({
    percentSold: null,
    remaining: 20,
    totalStock: 20,
    sold: 100,
    salesTotal6m: 20,
    batchCount: 1,
    stockDataQuality: "CONFIRMED",
  });
  assertEqual(result.status, "RECOMPRAR", "status");
});

console.log("\n── Size filter verification tests ──\n");

test("T33: Sin clasificar filter captures null sizeClass refs", () => {
  // Simulates the Rotacion size filter logic
  type TestItem = { soldNet: number; salesTotal6m: number; sizeClass: string | null };
  const items: TestItem[] = [
    { soldNet: 100, salesTotal6m: 50, sizeClass: "PEQUENO" },
    { soldNet: 80, salesTotal6m: 30, sizeClass: null },
    { soldNet: 60, salesTotal6m: 20, sizeClass: "GRANDE" },
    { soldNet: 40, salesTotal6m: 10, sizeClass: null },
    { soldNet: 0, salesTotal6m: 0, sizeClass: null }, // no sales — excluded from Rotacion
  ];
  const withSales = items.filter(i => i.soldNet > 0 || i.salesTotal6m > 0);
  const sinClasificar = withSales.filter(i => i.sizeClass === null);
  assertEqual(sinClasificar.length, 2, "sinClasificar count");
  // Verify sum: TODOS = PEQUENO + GRANDE + SIN_CLASIFICAR
  const pequeno = withSales.filter(i => i.sizeClass === "PEQUENO").length;
  const grande = withSales.filter(i => i.sizeClass === "GRANDE").length;
  assertEqual(withSales.length, pequeno + grande + sinClasificar.length, "sum matches TODOS");
});

// ══════════════════════════════════════════════════════════════════════════════
// CALIBRATION TESTS (REORDER-CALIBRATION-01)
// ══════════════════════════════════════════════════════════════════════════════

console.log("\n── Size-aware recompra calibration tests ──\n");

// Mirrors calibrateRecompra() from import-intelligence-service.ts
type CalibrationInput = {
  sizeClass: ImportSizeClass | null;
  salesTotal6m: number;
  soldNet: number;
  remaining: number;
  stockDataQuality: StockDataQuality;
  salesDataQuality: SalesDataQuality;
  coberturaPromedioDias: number | null;
};

const SIZE_REORDER_THRESHOLDS: Record<string, number> = { PEQUENO: 100, MEDIANO: 50, GRANDE: 10 };
const LOW_COVERAGE_DAYS = 60;
const MIN_SALES_SIN_CLASIFICAR = 5;

function calibrateRecompra(input: CalibrationInput): { classification: RecompraClassification; reason: string } {
  const { sizeClass, salesTotal6m, soldNet, remaining, stockDataQuality, salesDataQuality, coberturaPromedioDias } = input;

  if (soldNet === 0) return { classification: "SIN_DATOS", reason: "Sin historial de ventas." };
  if (salesDataQuality !== "SYNCED") return { classification: "SIN_DATOS", reason: "Datos de ventas no disponibles." };

  const stockConfirmed = stockDataQuality === "CONFIRMED";
  const isDepleted = stockConfirmed && remaining === 0;
  const isLowCoverage = coberturaPromedioDias !== null && coberturaPromedioDias <= LOW_COVERAGE_DAYS;
  const needsStock = isDepleted || isLowCoverage;

  if (sizeClass !== null) {
    const threshold = SIZE_REORDER_THRESHOLDS[sizeClass];
    const vigilarFloor = Math.max(Math.ceil(threshold * 0.2), 3);

    if (salesTotal6m > threshold) {
      if (!stockConfirmed) return { classification: "VIGILAR", reason: "Sin dato stock." };
      if (needsStock) return { classification: "INMEDIATA", reason: isDepleted ? "Agotado con demanda." : "Cobertura baja." };
      return { classification: "VIGILAR", reason: "Stock suficiente." };
    }
    if (salesTotal6m >= vigilarFloor) return { classification: "VIGILAR", reason: "Bajo umbral." };
    if (salesTotal6m > 0 && stockConfirmed && remaining > 0) return { classification: "VIGILAR", reason: "Stock con demanda." };
    if (salesTotal6m > 0) return { classification: "NO_RECOMPRAR", reason: "Ventas insuficientes." };
    if (isDepleted) return { classification: "NO_RECOMPRAR", reason: "Agotado sin ventas." };
    return { classification: "NO_RECOMPRAR", reason: "Sin ventas recientes." };
  }

  if (salesTotal6m >= MIN_SALES_SIN_CLASIFICAR) return { classification: "VIGILAR", reason: "Sin tamano." };
  if (salesTotal6m > 0) return { classification: "NO_RECOMPRAR", reason: "Pocas ventas, sin tamano." };
  return { classification: "NO_RECOMPRAR", reason: "Sin ventas recientes." };
}

function cal(overrides: Partial<CalibrationInput>): CalibrationInput {
  return {
    sizeClass: null,
    salesTotal6m: 0,
    soldNet: 100,
    remaining: 0,
    stockDataQuality: "CONFIRMED",
    salesDataQuality: "SYNCED",
    coberturaPromedioDias: null,
    ...overrides,
  };
}

// ── Required test cases ──

test("T34: PEQUENO 101 sales stock=0 → INMEDIATA", () => {
  const r = calibrateRecompra(cal({ sizeClass: "PEQUENO", salesTotal6m: 101, remaining: 0 }));
  assertEqual(r.classification, "INMEDIATA", "classification");
});

test("T35: PEQUENO 100 sales stock=0 → NOT INMEDIATA", () => {
  const r = calibrateRecompra(cal({ sizeClass: "PEQUENO", salesTotal6m: 100, remaining: 0 }));
  assertEqual(r.classification !== "INMEDIATA", true, "not INMEDIATA");
  assertEqual(r.classification, "VIGILAR", "is VIGILAR");
});

test("T36: PEQUENO 1 sale stock=0 → NO_RECOMPRAR", () => {
  const r = calibrateRecompra(cal({ sizeClass: "PEQUENO", salesTotal6m: 1, remaining: 0 }));
  assertEqual(r.classification, "NO_RECOMPRAR", "classification");
});

test("T37: MEDIANO 51 sales stock=0 → INMEDIATA", () => {
  const r = calibrateRecompra(cal({ sizeClass: "MEDIANO", salesTotal6m: 51, remaining: 0 }));
  assertEqual(r.classification, "INMEDIATA", "classification");
});

test("T38: MEDIANO 50 sales stock=0 → NOT INMEDIATA", () => {
  const r = calibrateRecompra(cal({ sizeClass: "MEDIANO", salesTotal6m: 50, remaining: 0 }));
  assertEqual(r.classification !== "INMEDIATA", true, "not INMEDIATA");
});

test("T39: GRANDE 11 sales stock=0 → INMEDIATA", () => {
  const r = calibrateRecompra(cal({ sizeClass: "GRANDE", salesTotal6m: 11, remaining: 0 }));
  assertEqual(r.classification, "INMEDIATA", "classification");
});

test("T40: GRANDE 10 sales stock=0 → NOT INMEDIATA", () => {
  const r = calibrateRecompra(cal({ sizeClass: "GRANDE", salesTotal6m: 10, remaining: 0 }));
  assertEqual(r.classification !== "INMEDIATA", true, "not INMEDIATA");
});

test("T41: HC0213049 (PEQUENO, stock=14, sales6m=13, cobertura=194d) → VIGILAR", () => {
  // HC0213049 is PEQUENO. 13 < vigilarFloor(20) for PEQUENO, but has stock + demand → VIGILAR
  const r = calibrateRecompra(cal({ sizeClass: "PEQUENO", salesTotal6m: 13, remaining: 14, coberturaPromedioDias: 194 }));
  assertEqual(r.classification, "VIGILAR", "classification");
});

test("T42: Sin tamano + alta venta → VIGILAR, never INMEDIATA", () => {
  const r = calibrateRecompra(cal({ sizeClass: null, salesTotal6m: 200, remaining: 0 }));
  assertEqual(r.classification !== "INMEDIATA", true, "never INMEDIATA without size");
  assertEqual(r.classification, "VIGILAR", "is VIGILAR");
});

test("T43: Stock positivo + cobertura alta → VIGILAR", () => {
  const r = calibrateRecompra(cal({ sizeClass: "MEDIANO", salesTotal6m: 60, remaining: 100, coberturaPromedioDias: 300 }));
  assertEqual(r.classification, "VIGILAR", "classification");
});

test("T44: Stock positivo + cobertura baja + ventas > umbral → INMEDIATA", () => {
  const r = calibrateRecompra(cal({ sizeClass: "MEDIANO", salesTotal6m: 60, remaining: 10, coberturaPromedioDias: 30 }));
  assertEqual(r.classification, "INMEDIATA", "classification");
});

test("T45: Stock=0, ventas=0, soldNet>0 → NO_RECOMPRAR", () => {
  const r = calibrateRecompra(cal({ sizeClass: "PEQUENO", salesTotal6m: 0, soldNet: 50, remaining: 0 }));
  assertEqual(r.classification, "NO_RECOMPRAR", "classification");
});

test("T46: soldNet=0 (never sold) → SIN_DATOS", () => {
  const r = calibrateRecompra(cal({ sizeClass: "GRANDE", salesTotal6m: 0, soldNet: 0 }));
  assertEqual(r.classification, "SIN_DATOS", "classification");
});

test("T47: PEQUENO stock=0 sales6m=4 → NO_RECOMPRAR (user example)", () => {
  const r = calibrateRecompra(cal({ sizeClass: "PEQUENO", salesTotal6m: 4, remaining: 0 }));
  assertEqual(r.classification, "NO_RECOMPRAR", "classification");
});

test("T48: GRANDE stock=0 sales6m=12 → INMEDIATA (user example)", () => {
  const r = calibrateRecompra(cal({ sizeClass: "GRANDE", salesTotal6m: 12, remaining: 0 }));
  assertEqual(r.classification, "INMEDIATA", "classification");
});

test("T49: Sin tamano + sales=3 → NO_RECOMPRAR (below MIN_SALES_SIN_CLASIFICAR)", () => {
  const r = calibrateRecompra(cal({ sizeClass: null, salesTotal6m: 3, remaining: 0 }));
  assertEqual(r.classification, "NO_RECOMPRAR", "classification");
});

test("T50: Sin tamano + sales=5 → VIGILAR (meets MIN_SALES_SIN_CLASIFICAR)", () => {
  const r = calibrateRecompra(cal({ sizeClass: null, salesTotal6m: 5, remaining: 0 }));
  assertEqual(r.classification, "VIGILAR", "classification");
});

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(50)}`);
console.log(`  Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"=".repeat(50)}\n`);

if (failed > 0) process.exit(1);
