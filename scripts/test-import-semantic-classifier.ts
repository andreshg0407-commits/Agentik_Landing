/**
 * scripts/test-import-semantic-classifier.ts
 *
 * Unit-level tests for the import semantic classifier.
 *
 * Run:
 *   npx tsx scripts/test-import-semantic-classifier.ts
 *
 * Sprint: IMPORT-SEMANTIC-MAPPING-SPECIFICITY-01
 */

import { classifyImportDocument } from "../lib/comercial/semantic/imports/import-semantic-classifier";
import { CASTILLITOS_IMPORT_CONFIG } from "../lib/comercial/semantic/imports/import-semantic-mapping";
import type { ImportDocumentInput } from "../lib/comercial/semantic/imports/import-semantic-types";

// ── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}`);
  }
}

function makeInput(overrides: Partial<ImportDocumentInput> = {}): ImportDocumentInput {
  return {
    tenantId: "castillitos",
    erp: "SAG",
    sourceId: "182",
    sourceCode: "FI",
    sourceName: "FACTURA DE IMPORTACION NACIONAL",
    documentNumber: "TEST-001",
    documentDate: "2026-07-10",
    quantity: 100,
    warehouseId: "36",
    providerId: "",
    providerName: "",
    cancelled: false,
    metadata: {},
    ...overrides,
  };
}

function nameOnly(name: string): Partial<ImportDocumentInput> {
  return { sourceId: "9999", sourceCode: "XX", sourceName: name };
}

// ── Tests ────────────────────────────────────────────────────────────────────

console.log("\n=== IMPORT SEMANTIC CLASSIFIER TESTS (SPECIFICITY-01) ===\n");

// ── TC-01: FI(182) → IMPORT_INVOICE ──────────────────────────────────────
console.log("TC-01: FI(182) → IMPORT_INVOICE");
{
  const r = classifyImportDocument(makeInput(), CASTILLITOS_IMPORT_CONFIG);
  assert(r.documentSemanticType === "IMPORT_INVOICE", "docType = IMPORT_INVOICE");
  assert(r.movementSemanticType === "IMPORT", "movType = IMPORT");
  assert(r.confidence >= 0.9, `confidence >= 0.9 (got ${r.confidence.toFixed(2)})`);
  assert(r.shouldCountAsImportReceipt === true, "countAsImportReceipt = true");
  assert(r.shouldCountAsRepurchase === true, "countAsRepurchase = true");
  assert(r.shouldCountInTotalImported === true, "countInTotalImported = true");
  assert(r.inventoryEffect === "INCREASE", "inventoryEffect = INCREASE");
  assert(r.evidence.length > 0, "evidence is non-empty");
}

// ── TC-02: PX(184) → IMPORT_PROVISION ────────────────────────────────────
console.log("\nTC-02: PX(184) → IMPORT_PROVISION");
{
  const r = classifyImportDocument(
    makeInput({ sourceId: "184", sourceCode: "PX", sourceName: "PROVISION IMPORTACION 2", warehouseId: "37" }),
    CASTILLITOS_IMPORT_CONFIG,
  );
  assert(r.documentSemanticType === "IMPORT_PROVISION", "docType = IMPORT_PROVISION");
  assert(r.movementSemanticType === "PROVISION", "movType = PROVISION");
  assert(r.shouldCountAsImportReceipt === false, "countAsImportReceipt = false (provision, not receipt)");
  assert(r.shouldCountInTotalImported === false, "countInTotalImported = false");
}

// ── TC-03: FT(189) → IMPORT_INVOICE ─────────────────────────────────────
console.log("\nTC-03: FT(189) → IMPORT_INVOICE");
{
  const r = classifyImportDocument(
    makeInput({ sourceId: "189", sourceCode: "FT", sourceName: "FACTURA COMPRA CHINA DIF MER2", warehouseId: "41" }),
    CASTILLITOS_IMPORT_CONFIG,
  );
  assert(r.documentSemanticType === "IMPORT_INVOICE", "docType = IMPORT_INVOICE");
  assert(r.shouldCountAsImportReceipt === true, "countAsImportReceipt = true");
  assert(r.confidence >= 0.8, `confidence >= 0.8 (got ${r.confidence.toFixed(2)})`);
}

// ── TC-04: Cancelled document → all counting disabled ────────────────────
console.log("\nTC-04: Cancelled FI → counting disabled");
{
  const r = classifyImportDocument(makeInput({ cancelled: true }), CASTILLITOS_IMPORT_CONFIG);
  assert(r.documentSemanticType === "IMPORT_INVOICE", "docType still IMPORT_INVOICE");
  assert(r.shouldCountAsImportReceipt === false, "countAsImportReceipt = false (cancelled)");
  assert(r.shouldCountAsRepurchase === false, "countAsRepurchase = false (cancelled)");
  assert(r.shouldCountInTotalImported === false, "countInTotalImported = false (cancelled)");
  assert(r.shouldAffectCommercialStock === false, "affectsStock = false (cancelled)");
  assert(r.confidence < 0.5, `confidence reduced (got ${r.confidence.toFixed(2)})`);
}

// ── TC-05: Negative quantity on IMPORT_INVOICE ───────────────────────────
console.log("\nTC-05: Negative qty on IMPORT_INVOICE");
{
  const r = classifyImportDocument(makeInput({ quantity: -50 }), CASTILLITOS_IMPORT_CONFIG);
  assert(r.shouldCountAsImportReceipt === false, "countAsImportReceipt = false (negative qty)");
  assert(r.shouldCountInTotalImported === false, "countInTotalImported = false (negative qty)");
  assert(r.inventoryEffect === "DECREASE", "inventoryEffect flipped to DECREASE");
  assert(r.unresolvedReasons.length > 0, "has unresolved reasons");
}

// ── TC-06: Zero quantity ─────────────────────────────────────────────────
console.log("\nTC-06: Zero quantity");
{
  const r = classifyImportDocument(makeInput({ quantity: 0 }), CASTILLITOS_IMPORT_CONFIG);
  assert(r.inventoryEffect === "NONE", "inventoryEffect = NONE (zero qty)");
  assert(r.shouldCountInTotalImported === false, "countInTotalImported = false (zero qty)");
}

// ── TC-07: Unknown fuente → UNKNOWN ──────────────────────────────────────
console.log("\nTC-07: Unknown fuente → UNKNOWN");
{
  const r = classifyImportDocument(
    makeInput({ sourceId: "999", sourceCode: "ZZ", sourceName: "SOMETHING RANDOM" }),
    CASTILLITOS_IMPORT_CONFIG,
  );
  assert(r.documentSemanticType === "UNKNOWN", "docType = UNKNOWN");
  assert(r.movementSemanticType === "UNKNOWN", "movType = UNKNOWN");
  assert(r.confidence === 0, "confidence = 0");
  assert(r.shouldCountAsImportReceipt === false, "no receipt");
  assert(r.shouldCountInTotalImported === false, "no total");
  assert(r.purchaseEffect === false, "no purchase effect");
  assert(r.importEffect === false, "no import effect");
}

// ── TC-08: Different tenant (no config) → safe UNKNOWN ───────────────────
console.log("\nTC-08: Different tenant (no config)");
{
  const r = classifyImportDocument(makeInput({ tenantId: "unknown-tenant" }));
  assert(r.documentSemanticType === "UNKNOWN", "docType = UNKNOWN");
  assert(r.confidence === 0, "confidence = 0");
  assert(r.evidence.some(e => e.description.includes("No semantic config")), "evidence mentions missing config");
}

// ══════════════════════════════════════════════════════════════════════════
// MANDATORY SPECIFICITY CASES (Fase 4)
// ══════════════════════════════════════════════════════════════════════════

// ── MC-01: DEVOLUCION IMPORTACION → IMPORT_RETURN (was the original bug) ─
console.log("\nMC-01: DEVOLUCION IMPORTACION → IMPORT_RETURN");
{
  const r = classifyImportDocument(
    makeInput(nameOnly("DEVOLUCION IMPORTACION ESPECIAL")),
    CASTILLITOS_IMPORT_CONFIG,
  );
  assert(r.documentSemanticType === "IMPORT_RETURN", "docType = IMPORT_RETURN (NOT IMPORT_INVOICE)");
  assert(r.evidence.some(e => e.source === "MAPPING_NAME"), "evidence includes MAPPING_NAME");
  assert(r.shouldCountAsImportReceipt === false, "return NEVER countAsImportReceipt");
  assert(r.shouldCountAsRepurchase === false, "return NEVER countAsRepurchase");
  assert(r.shouldCountInTotalImported === false, "return NEVER countInTotalImported");
  // Should record the competing pattern
  assert(
    r.evidence.some(e => e.description.includes("Competing pattern")),
    "evidence records competing 'IMPORTACION' pattern",
  );
  assert(r.unresolvedReasons.length > 0, "conflict documented in unresolvedReasons");
}

// ── MC-02: FACTURA DE IMPORTACION → IMPORT_INVOICE ───────────────────────
console.log("\nMC-02: FACTURA DE IMPORTACION → IMPORT_INVOICE");
{
  const r = classifyImportDocument(
    makeInput(nameOnly("FACTURA DE IMPORTACION NUEVA")),
    CASTILLITOS_IMPORT_CONFIG,
  );
  assert(r.documentSemanticType === "IMPORT_INVOICE", "docType = IMPORT_INVOICE");
}

// ── MC-03: PROVISION IMPORTACION → IMPORT_PROVISION ──────────────────────
console.log("\nMC-03: PROVISION IMPORTACION → IMPORT_PROVISION");
{
  const r = classifyImportDocument(
    makeInput(nameOnly("PROVISION IMPORTACION 3")),
    CASTILLITOS_IMPORT_CONFIG,
  );
  assert(r.documentSemanticType === "IMPORT_PROVISION", "docType = IMPORT_PROVISION");
}

// ── MC-04: GASTO DE IMPORTACION → IMPORT_EXPENSE ────────────────────────
console.log("\nMC-04: GASTO DE IMPORTACION → IMPORT_EXPENSE");
{
  const r = classifyImportDocument(
    makeInput(nameOnly("GASTO DE IMPORTACION ADICIONAL")),
    CASTILLITOS_IMPORT_CONFIG,
  );
  assert(r.documentSemanticType === "IMPORT_EXPENSE", "docType = IMPORT_EXPENSE");
}

// ── MC-05: LIQUIDACION IMPORTACION → IMPORT_LIQUIDATION ─────────────────
console.log("\nMC-05: LIQUIDACION IMPORTACION → IMPORT_LIQUIDATION");
{
  const r = classifyImportDocument(
    makeInput(nameOnly("LIQUIDACION IMPORTACION FINAL")),
    CASTILLITOS_IMPORT_CONFIG,
  );
  assert(r.documentSemanticType === "IMPORT_LIQUIDATION", "docType = IMPORT_LIQUIDATION");
}

// ── MC-06: Generic IMPORTACION → UNKNOWN (never IMPORT_INVOICE) ─────────
console.log("\nMC-06: Generic IMPORTACION → UNKNOWN");
{
  const r = classifyImportDocument(
    makeInput(nameOnly("IMPORTACION NUEVA SIN CONTEXTO")),
    CASTILLITOS_IMPORT_CONFIG,
  );
  assert(r.documentSemanticType === "UNKNOWN", "docType = UNKNOWN (generic IMPORTACION never auto-IMPORT_INVOICE)");
  assert(r.confidence === 0, "confidence = 0 for UNKNOWN");
}

// ── MC-07: ID exacto gana sobre nombre contradictorio ───────────────────
console.log("\nMC-07: Exact ID wins over contradictory name");
{
  // FI(182) by ID but name says "DEVOLUCION"
  const r = classifyImportDocument(
    makeInput({ sourceId: "182", sourceCode: "FI", sourceName: "DEVOLUCION RARA" }),
    CASTILLITOS_IMPORT_CONFIG,
  );
  assert(r.documentSemanticType === "IMPORT_INVOICE", "docType = IMPORT_INVOICE (ID wins over name)");
  assert(r.evidence.some(e => e.source === "MAPPING_ID"), "resolved by MAPPING_ID");
}

// ── MC-08: Exact code wins over name pattern ────────────────────────────
console.log("\nMC-08: Exact code wins over name pattern");
{
  // PX code matches IMPORT_PROVISION, but name says "FACTURA"
  const r = classifyImportDocument(
    makeInput({ sourceId: "9999", sourceCode: "PX", sourceName: "FACTURA IMPORTACION FANTASMA" }),
    CASTILLITOS_IMPORT_CONFIG,
  );
  assert(r.documentSemanticType === "IMPORT_PROVISION", "docType = IMPORT_PROVISION (code wins over name)");
}

// ── MC-09: Cancelled document never counts as receipt ───────────────────
console.log("\nMC-09: Cancelled document never counts as receipt");
{
  const r = classifyImportDocument(
    makeInput({ cancelled: true }),
    CASTILLITOS_IMPORT_CONFIG,
  );
  assert(r.shouldCountAsImportReceipt === false, "cancelled → no receipt");
  assert(r.shouldCountAsRepurchase === false, "cancelled → no repurchase");
  assert(r.shouldCountInTotalImported === false, "cancelled → no total");
}

// ── MC-10: IMPORT_RETURN never counts (even via ID match) ───────────────
console.log("\nMC-10: IMPORT_RETURN never counts as receipt/repurchase/total");
{
  // DI(187) = DEVOLUCION IMPORTACION
  const r = classifyImportDocument(
    makeInput({ sourceId: "187", sourceCode: "DI", sourceName: "DEVOLUCION IMPORTACION", quantity: 50 }),
    CASTILLITOS_IMPORT_CONFIG,
  );
  assert(r.documentSemanticType === "IMPORT_RETURN", "docType = IMPORT_RETURN");
  assert(r.shouldCountAsImportReceipt === false, "return NEVER countAsImportReceipt");
  assert(r.shouldCountAsRepurchase === false, "return NEVER countAsRepurchase");
  assert(r.shouldCountInTotalImported === false, "return NEVER countInTotalImported");
  assert(r.importEffect === true, "return is still an import-related document");
}

// ── TC-10: Warehouse boost ──────────────────────────────────────────────
console.log("\nTC-10: Import warehouse boosts confidence");
{
  const noWh = classifyImportDocument(makeInput({ warehouseId: "10" }), CASTILLITOS_IMPORT_CONFIG);
  const withWh = classifyImportDocument(makeInput({ warehouseId: "36" }), CASTILLITOS_IMPORT_CONFIG);
  assert(withWh.confidence >= noWh.confidence, `import warehouse confidence (${withWh.confidence.toFixed(2)}) >= non-import (${noWh.confidence.toFixed(2)})`);
  assert(withWh.evidence.some(e => e.source === "WAREHOUSE"), "evidence includes WAREHOUSE boost");
}

// ── TC-11: C1(1) → DOMESTIC_PURCHASE_INVOICE ────────────────────────────
console.log("\nTC-11: C1(1) → DOMESTIC_PURCHASE_INVOICE");
{
  const r = classifyImportDocument(
    makeInput({ sourceId: "1", sourceCode: "C1", sourceName: "FACTURA DE COMPRA", warehouseId: "10" }),
    CASTILLITOS_IMPORT_CONFIG,
  );
  assert(r.documentSemanticType === "DOMESTIC_PURCHASE_INVOICE", "docType = DOMESTIC_PURCHASE_INVOICE");
  assert(r.shouldCountAsImportReceipt === false, "NOT an import receipt");
  assert(r.purchaseEffect === true, "DOMESTIC_PURCHASE_INVOICE has purchaseEffect");
}

// ── TC-12: DS(157) → GOODS_BREAKDOWN ────────────────────────────────────
console.log("\nTC-12: DS(157) → GOODS_BREAKDOWN");
{
  const r = classifyImportDocument(
    makeInput({ sourceId: "157", sourceCode: "DS", sourceName: "DESGLOSE DE MERCANCIA", quantity: -20, warehouseId: "33" }),
    CASTILLITOS_IMPORT_CONFIG,
  );
  assert(r.documentSemanticType === "GOODS_BREAKDOWN", "docType = GOODS_BREAKDOWN");
  assert(r.shouldCountAsImportReceipt === false, "NOT an import receipt");
  assert(r.inventoryEffect === "TRANSFORM", "TRANSFORM stays TRANSFORM even with negative qty");
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(50)}`);
console.log(`TOTAL: ${passed + failed} assertions`);
console.log(`PASS: ${passed}`);
console.log(`FAIL: ${failed}`);
console.log(`${"=".repeat(50)}\n`);

if (failed > 0) {
  process.exit(1);
}
