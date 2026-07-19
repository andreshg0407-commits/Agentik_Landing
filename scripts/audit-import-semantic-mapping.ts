/**
 * audit-import-semantic-mapping.ts
 *
 * Runs the import semantic classifier against the SAG-IMPORT-RESEARCH-01
 * findings and prints a classification report.
 *
 * RESEARCH ONLY — does NOT modify any product code.
 *
 * Run:
 *   export DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
 *   npx tsx scripts/audit-import-semantic-mapping.ts
 *
 * Sprint: IMPORT-SEMANTIC-MAPPING-01
 */

import { classifyImportDocument } from "../lib/comercial/semantic/imports/import-semantic-classifier";
import { CASTILLITOS_IMPORT_CONFIG } from "../lib/comercial/semantic/imports/import-semantic-mapping";
import type { ImportDocumentInput, ImportSemanticClassificationResult } from "../lib/comercial/semantic/imports/import-semantic-types";

// ── Sample data from SAG-IMPORT-RESEARCH-01 ────────────────────────────────
// These are the document types discovered in the research across 12 references.

interface ResearchRow {
  fuenteId: string;
  fuenteCode: string;
  fuenteName: string;
  totalRows: number;
  positiveQty: number;
  negativeQty: number;
  warehouses: string[];
}

const researchData: ResearchRow[] = [
  { fuenteId: "40", fuenteCode: "PD", fuenteName: "PEDIDOS CLIENTES", totalRows: 1074, positiveQty: 9107, negativeQty: 0, warehouses: ["10", "33", "36"] },
  { fuenteId: "101", fuenteCode: "FE", fuenteName: "FACTURA ELECTRONICA DE VENTA", totalRows: 767, positiveQty: 6654, negativeQty: 0, warehouses: ["10", "30", "33", "52"] },
  { fuenteId: "175", fuenteCode: "FD", fuenteName: "FACTURACIÓN ELECTRÓNICA SANDIE", totalRows: 701, positiveQty: 810, negativeQty: 0, warehouses: ["11", "32", "39"] },
  { fuenteId: "194", fuenteCode: "FA", fuenteName: "FACTURA ELECTRÓNICA CALDAS", totalRows: 695, positiveQty: 792, negativeQty: 0, warehouses: ["39"] },
  { fuenteId: "177", fuenteCode: "FG", fuenteName: "FACTURACIÓN ELECTRÓNICA GRAN P", totalRows: 597, positiveQty: 652, negativeQty: 0, warehouses: ["11", "32", "39"] },
  { fuenteId: "65", fuenteCode: "IF", fuenteName: "INV. FISICO", totalRows: 556, positiveQty: 37596, negativeQty: 498, warehouses: ["11", "30", "31", "32", "33", "39"] },
  { fuenteId: "176", fuenteCode: "FC", fuenteName: "FACTURA ELECTRÓNICA CENTRO", totalRows: 530, positiveQty: 839, negativeQty: 0, warehouses: ["11", "31"] },
  { fuenteId: "2", fuenteCode: "F2", fuenteName: "REMISION", totalRows: 495, positiveQty: 3274, negativeQty: 0, warehouses: ["30", "33"] },
  { fuenteId: "76", fuenteCode: "AI", fuenteName: "AJUSTE DE INVENTARIO", totalRows: 415, positiveQty: 7023, negativeQty: 7105, warehouses: ["10", "11", "30", "31", "32", "33", "39"] },
  { fuenteId: "207", fuenteCode: "FW", fuenteName: "FACTURA ELECTRÓNICA WEB", totalRows: 149, positiveQty: 213, negativeQty: 0, warehouses: ["11", "33"] },
  { fuenteId: "43", fuenteCode: "AC", fuenteName: "AJUSTE AL COSTO", totalRows: 58, positiveQty: 1021, negativeQty: 0, warehouses: ["11", "30", "31", "32", "33"] },
  { fuenteId: "41", fuenteCode: "AP", fuenteName: "AJUSTE PEDIDOS", totalRows: 57, positiveQty: 583, negativeQty: 0, warehouses: ["10", "33", "36"] },
  { fuenteId: "184", fuenteCode: "PX", fuenteName: "PROVISION IMPORTACION 2", totalRows: 40, positiveQty: 40104, negativeQty: 0, warehouses: ["36", "37", "41"] },
  { fuenteId: "98", fuenteCode: "D2", fuenteName: "DEVOLUCIÓN VENTAS 2", totalRows: 40, positiveQty: 165, negativeQty: 0, warehouses: ["10", "33"] },
  { fuenteId: "171", fuenteCode: "NF", fuenteName: "NOTA CREDITO ELECTRONICA", totalRows: 29, positiveQty: 432, negativeQty: 0, warehouses: ["30", "33"] },
  { fuenteId: "103", fuenteCode: "V2", fuenteName: "FACTURA DE VETAS POS SD", totalRows: 25, positiveQty: 26, negativeQty: 0, warehouses: ["11"] },
  { fuenteId: "179", fuenteCode: "V5", fuenteName: "FACTURA VENTA POS GRAN PLAZA", totalRows: 16, positiveQty: 17, negativeQty: 0, warehouses: ["32"] },
  { fuenteId: "182", fuenteCode: "FI", fuenteName: "FACTURA DE IMPORTACION NACIONA", totalRows: 13, positiveQty: 11368, negativeQty: 0, warehouses: ["36", "37", "41"] },
  { fuenteId: "173", fuenteCode: "V4", fuenteName: "FACTURA DE VENTA POS CENTRO", totalRows: 12, positiveQty: 12, negativeQty: 0, warehouses: ["31"] },
  { fuenteId: "157", fuenteCode: "DS", fuenteName: "DESGLOSE DE MERCANCIA", totalRows: 7, positiveQty: 0, negativeQty: 20, warehouses: ["33"] },
  { fuenteId: "139", fuenteCode: "NC", fuenteName: "NOTA CREDITO ELECTRONICA", totalRows: 5, positiveQty: 22, negativeQty: 0, warehouses: ["10", "33"] },
  { fuenteId: "193", fuenteCode: "V6", fuenteName: "FACTURA VENTA POS CALDAS", totalRows: 5, positiveQty: 5, negativeQty: 0, warehouses: ["39"] },
  { fuenteId: "189", fuenteCode: "FT", fuenteName: "FACTURA COMPRA CHINA DIF MER2", totalRows: 2, positiveQty: 3000, negativeQty: 0, warehouses: ["41"] },
  { fuenteId: "202", fuenteCode: "NT", fuenteName: "NOTA CREDITO ELECTRÓNICA CENTR", totalRows: 3, positiveQty: 3, negativeQty: 0, warehouses: ["31"] },
  { fuenteId: "200", fuenteCode: "NS", fuenteName: "NOTA CREDITO ELECTRÓNICA SANDI", totalRows: 3, positiveQty: 3, negativeQty: 0, warehouses: ["11"] },
  { fuenteId: "208", fuenteCode: "NW", fuenteName: "NOTA CREDITO ELECTRONICA PAGNA", totalRows: 3, positiveQty: 4, negativeQty: 0, warehouses: ["33"] },
  { fuenteId: "197", fuenteCode: "NG", fuenteName: "NOTA CRÉDITO ELECTRÓNICA G PLA", totalRows: 2, positiveQty: 3, negativeQty: 0, warehouses: ["32"] },
  { fuenteId: "196", fuenteCode: "NA", fuenteName: "NOTA CRÉDITO ELECTRÓNICA CALDA", totalRows: 1, positiveQty: 1, negativeQty: 0, warehouses: ["39"] },
];

// ── Run audit ───────────────────────────────────────────────────────────────

console.log("\n=== IMPORT SEMANTIC MAPPING AUDIT ===\n");
console.log(`Tenant: ${CASTILLITOS_IMPORT_CONFIG.tenantId}`);
console.log(`ERP: ${CASTILLITOS_IMPORT_CONFIG.erp}`);
console.log(`Version: ${CASTILLITOS_IMPORT_CONFIG.version}`);
console.log(`Document mappings: ${CASTILLITOS_IMPORT_CONFIG.documentMappings.length}`);
console.log(`Warehouse mappings: ${CASTILLITOS_IMPORT_CONFIG.warehouseMappings.length}`);
console.log(`Price mappings: ${CASTILLITOS_IMPORT_CONFIG.priceMappings.length}`);
console.log();

// Classify each research row with positive quantity
const results: { row: ResearchRow; result: ImportSemanticClassificationResult }[] = [];

for (const row of researchData) {
  const input: ImportDocumentInput = {
    tenantId: "castillitos",
    erp: "SAG",
    sourceId: row.fuenteId,
    sourceCode: row.fuenteCode,
    sourceName: row.fuenteName,
    documentNumber: "AUDIT",
    documentDate: "2026-07-10",
    quantity: row.positiveQty,
    warehouseId: row.warehouses[0] ?? "",
    providerId: "",
    providerName: "",
    cancelled: false,
    metadata: {},
  };

  const result = classifyImportDocument(input, CASTILLITOS_IMPORT_CONFIG);
  results.push({ row, result });
}

// ── Print per-document classification ───────────────────────────────────
console.log("=== PER-DOCUMENT CLASSIFICATION ===\n");
console.log(
  "Fuente".padEnd(8) +
  "Code".padEnd(6) +
  "Name".padEnd(40) +
  "Rows".padStart(6) +
  "Qty+".padStart(8) +
  "Doc Type".padEnd(30) +
  "Mvt Type".padEnd(16) +
  "Conf".padStart(6) +
  "Receipt".padStart(8) +
  "Repurch".padStart(8) +
  "Total".padStart(8) +
  "InvEff".padEnd(10),
);
console.log("-".repeat(174));

for (const { row, result } of results) {
  console.log(
    row.fuenteId.padEnd(8) +
    row.fuenteCode.padEnd(6) +
    row.fuenteName.slice(0, 38).padEnd(40) +
    String(row.totalRows).padStart(6) +
    String(row.positiveQty).padStart(8) +
    result.documentSemanticType.padEnd(30) +
    result.movementSemanticType.padEnd(16) +
    result.confidence.toFixed(2).padStart(6) +
    (result.shouldCountAsImportReceipt ? "YES" : "no").padStart(8) +
    (result.shouldCountAsRepurchase ? "YES" : "no").padStart(8) +
    (result.shouldCountInTotalImported ? "YES" : "no").padStart(8) +
    result.inventoryEffect.padEnd(10),
  );
}

// ── Group by semantic type ──────────────────────────────────────────────
console.log("\n=== BY SEMANTIC TYPE ===\n");

const byType = new Map<string, { docs: number; qty: number; refs: string[] }>();
for (const { row, result } of results) {
  const key = result.documentSemanticType;
  const e = byType.get(key) ?? { docs: 0, qty: 0, refs: [] };
  e.docs += row.totalRows;
  e.qty += row.positiveQty;
  e.refs.push(row.fuenteCode);
  byType.set(key, e);
}

for (const [type, data] of [...byType.entries()].sort()) {
  console.log(`  ${type.padEnd(30)} docs=${String(data.docs).padStart(5)} qty=${String(data.qty).padStart(8)}  fuentes: ${data.refs.join(", ")}`);
}

// ── Unknown/ambiguous fuentes ───────────────────────────────────────────
console.log("\n=== UNKNOWN / AMBIGUOUS ===\n");
const unknowns = results.filter(r => r.result.documentSemanticType === "UNKNOWN");
const ambiguous = results.filter(r => r.result.unresolvedReasons.length > 0 && r.result.documentSemanticType !== "UNKNOWN");

if (unknowns.length === 0 && ambiguous.length === 0) {
  console.log("  None — all fuentes classified.");
} else {
  for (const { row, result } of unknowns) {
    console.log(`  UNKNOWN: ${row.fuenteCode}(${row.fuenteId}) — ${row.fuenteName}`);
    for (const r of result.unresolvedReasons) console.log(`    reason: ${r}`);
  }
  for (const { row, result } of ambiguous) {
    console.log(`  AMBIGUOUS: ${row.fuenteCode}(${row.fuenteId}) — ${result.documentSemanticType} (conf=${result.confidence.toFixed(2)})`);
    for (const r of result.unresolvedReasons) console.log(`    reason: ${r}`);
  }
}

// ── Import receipt summary ──────────────────────────────────────────────
console.log("\n=== IMPORT RECEIPT SUMMARY ===\n");
const receipts = results.filter(r => r.result.shouldCountAsImportReceipt);
const totalImported = receipts.reduce((s, r) => s + r.row.positiveQty, 0);
console.log(`  Fuentes counting as import receipts: ${receipts.map(r => `${r.row.fuenteCode}(${r.row.fuenteId})`).join(", ") || "NONE"}`);
console.log(`  Observed volume (semantically classified): ${totalImported} units`);
console.log();
console.log("  DOUBLE-COUNTING WARNING:");
console.log("    FI(182), FT(189), and PX(184) may belong to the same import event.");
console.log("    FI = import invoice, FT = China purchase invoice, PX = provision.");
console.log("    These documents can overlap for the same goods shipment.");
console.log("    Do NOT assert '14,368 units imported confirmed' until a deduplication");
console.log("    or document-precedence rule resolves potential double-counting.");
console.log("    Correct statement: '14,368 units = observed semantically classified volume.'");

console.log("\n=== AUDIT COMPLETE ===\n");
