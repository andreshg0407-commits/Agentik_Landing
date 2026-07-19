/**
 * scripts/test-sales-domain-01.ts
 *
 * Functional tests for SALES-DOMAIN-01.
 * Exercises normalization, quality, adapter, registration, and valid sale filter.
 *
 * Usage: npx tsx scripts/test-sales-domain-01.ts
 */

import {
  normalizeSalesDocument,
  evaluateSalesQuality,
  evaluateSalesFreshness,
  isValidSale,
  createSagSalesAdapter,
  registerSalesAdapter,
  deriveSalesDocumentStatus,
  SAG_SALES_ADAPTER_ID,
} from "../lib/comercial/data-layer/domains/sales";
import type { SalesDocumentRawInput, SalesNormalizationContext } from "../lib/comercial/data-layer/domains/sales";
import { createCommercialAdapterRegistry } from "../lib/comercial/data-layer/adapters/commercial-adapter-registry";
import { createCommercialDomainRegistry } from "../lib/comercial/data-layer/domains/commercial-domain-registry";
import { SALES_DOMAIN } from "../lib/comercial/data-layer/domains/commercial-domain-descriptors";

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean): void {
  if (condition) { console.log(`  PASS  ${label}`); passed++; }
  else { console.log(`  FAIL  ${label}`); failed++; }
}

console.log("\n=== FUNCTIONAL TESTS: SALES-DOMAIN-01 ===\n");

// ── Test Data ───────────────────────────────────────────────────────────────

const validInvoice: SalesDocumentRawInput = {
  tipoDocumento: "FA",
  numeroDocumento: "F-001234",
  fecha: "2026-07-10T08:00:00Z",
  nit: "900123456",
  nombreCliente: "Distribuidora Los Andes",
  codigoVendedor: "V001",
  nombreVendedor: "Carlos Perez",
  bodega: "B01",
  subtotal: 1500000,
  descuento: 75000,
  ivaTotal: 270750,
  total: 1695750,
  observaciones: "Entrega programada lunes",
  anulada: false,
  fechaModificacion: "2026-07-10T10:00:00Z",
  lineas: [
    {
      lineaNumero: 1,
      codigoArticulo: "ZAP-001",
      descripcion: "Zapato Formal Negro",
      talla: "42",
      color: "NG",
      cantidad: 10,
      precioUnitario: 85000,
      descuento: 5000,
      totalLinea: 800000,
      tarifaIva: 19,
      ivaLinea: 152000,
      bodega: "B01",
      costo: 40000,
    },
    {
      lineaNumero: 2,
      codigoArticulo: "SAN-002",
      descripcion: "Sandalia Casual",
      talla: "38",
      color: "BL",
      cantidad: 15,
      precioUnitario: 50000,
      descuento: 2500,
      totalLinea: 700000,
      tarifaIva: 19,
      ivaLinea: 118750,
      bodega: "B01",
      costo: 22000,
    },
  ],
};

const ctx: SalesNormalizationContext = {
  tenantId: "castillitos",
  sourceSystem: "SAG_PYA",
  instanceId: "castillitos",
  adapterId: "sag-sales-adapter",
  adapterVersion: "1.0.0",
  correlationId: "test-correlation-001",
  extractedAt: new Date("2026-07-12T06:00:00Z"),
};

// ── NORMALIZATION ───────────────────────────────────────────────────────────

console.log("--- Normalization ---");

// Test 1 — Valid invoice normalizes correctly
const r1 = normalizeSalesDocument(validInvoice, ctx);
assert("1. Valid invoice normalizes", r1.document !== null && !r1.skipped);
assert("1b. Document number preserved", r1.document!.documentNumber === "F-001234");
assert("1c. Document type is FACTURA", r1.document!.documentType === "FACTURA");
assert("1d. Status is ACTIVE", r1.document!.status === "ACTIVE");

// Test 2 — Customer extracted
assert("2. Customer code (NIT)", r1.document!.customerCode === "900123456");
assert("2b. Customer name", r1.document!.customerName === "Distribuidora Los Andes");

// Test 3 — Seller extracted
assert("3. Seller code", r1.document!.sellerCode === "V001");
assert("3b. Seller name", r1.document!.sellerName === "Carlos Perez");

// Test 4 — Financials
assert("4. Total", r1.document!.financials.total === 1695750);
assert("4b. Subtotal", r1.document!.financials.subtotal === 1500000);
assert("4c. IVA", r1.document!.financials.ivaTotal === 270750);
assert("4d. Discount", r1.document!.financials.discount === 75000);
assert("4e. Currency COP", r1.document!.financials.currency === "COP");

// Test 5 — Lines parsed
assert("5. Line count", r1.document!.lineCount === 2);
assert("5b. Total units", r1.document!.totalUnits === 25);
assert("5c. Lines array length", r1.lines.length === 2);

// Test 6 — Line details
assert("6. Line 1 reference code", r1.lines[0].referenceCode === "ZAP-001");
assert("6b. Line 1 quantity", r1.lines[0].quantity === 10);
assert("6c. Line 1 unit price", r1.lines[0].unitPrice === 85000);
assert("6d. Line 1 size", r1.lines[0].sizeCode === "42");
assert("6e. Line 1 color", r1.lines[0].colorCode === "NG");
assert("6f. Line 1 cost", r1.lines[0].unitCost === 40000);
assert("6g. Line 2 reference code", r1.lines[1].referenceCode === "SAN-002");

// Test 7 — Identity is tenant-scoped
assert("7. Identity tenantId", r1.document!.identity.tenantId === "castillitos");
assert("7b. Identity domain", r1.document!.identity.domain === "SALES");
assert("7c. Canonical ID contains tenant", r1.document!.identity.canonicalId.includes("castillitos"));
assert("7d. Natural key includes doc type and number", r1.document!.identity.naturalKey === "FACTURA:F-001234");

// Test 8 — Missing document number skips
const noDocNum: SalesDocumentRawInput = { ...validInvoice, numeroDocumento: null };
const r8 = normalizeSalesDocument(noDocNum, ctx);
assert("8. Missing doc number → skipped", r8.skipped === true && r8.document === null);

// Test 9 — Missing document type skips
const noType: SalesDocumentRawInput = { ...validInvoice, tipoDocumento: "" };
const r9 = normalizeSalesDocument(noType, ctx);
assert("9. Empty doc type → skipped", r9.skipped === true);

// Test 10 — Missing date skips
const noDate: SalesDocumentRawInput = { ...validInvoice, fecha: null };
const r10 = normalizeSalesDocument(noDate, ctx);
assert("10. Missing date → skipped", r10.skipped === true);

// Test 11 — Missing NIT skips
const noNit: SalesDocumentRawInput = { ...validInvoice, nit: "" };
const r11 = normalizeSalesDocument(noNit, ctx);
assert("11. Empty NIT → skipped", r11.skipped === true);

// Test 12 — Credit note type resolves
const creditNote: SalesDocumentRawInput = { ...validInvoice, tipoDocumento: "NC", total: -200000, subtotal: -200000 };
const r12 = normalizeSalesDocument(creditNote, ctx);
assert("12. NC → NOTA_CREDITO", r12.document!.documentType === "NOTA_CREDITO");

// Test 13 — Voided document
const voided: SalesDocumentRawInput = { ...validInvoice, anulada: true };
const r13 = normalizeSalesDocument(voided, ctx);
assert("13. Anulada → ANULADA status", r13.document!.status === "ANULADA");

// Test 14 — Different tenant produces different canonical ID
const otherCtx = { ...ctx, tenantId: "other-company" };
const r14 = normalizeSalesDocument(validInvoice, otherCtx);
assert("14. Different tenant → different canonical ID", r14.document!.identity.canonicalId !== r1.document!.identity.canonicalId);

// Test 15 — Document without lines still normalizes
const noLines: SalesDocumentRawInput = { ...validInvoice, lineas: [] };
const r15 = normalizeSalesDocument(noLines, ctx);
assert("15. No lines → still normalizes", r15.document !== null && r15.lines.length === 0);
assert("15b. Line count is 0", r15.document!.lineCount === 0);

// Test 16 — Line with missing reference code is skipped
const badLine: SalesDocumentRawInput = {
  ...validInvoice,
  lineas: [{ codigoArticulo: "", cantidad: 5, precioUnitario: 100, totalLinea: 500 }],
};
const r16 = normalizeSalesDocument(badLine, ctx);
assert("16. Bad line skipped", r16.lines.length === 0);
assert("16b. Warning emitted", r16.warnings.length > 0);

// Test 17 — Decimal-like total (Prisma Decimal)
const decimalTotal: SalesDocumentRawInput = {
  ...validInvoice,
  total: { toString: () => "2500000.75" } as any,
};
const r17 = normalizeSalesDocument(decimalTotal, ctx);
assert("17. Decimal-like total normalized", r17.document!.financials.total === 2500000.75);

// ── QUALITY ─────────────────────────────────────────────────────────────────

console.log("\n--- Quality ---");

// Test 18 — Fresh valid document → CONFIRMED
const q18 = evaluateSalesQuality(r1.document!, { now: new Date("2026-07-12T06:15:00Z") });
assert("18. Fresh valid document → CONFIRMED", q18.status === "CONFIRMED");
assert("18b. Score > 0.8", q18.score > 0.8);

// Test 19 — Stale document (> 30min SLA)
const q19 = evaluateSalesQuality(r1.document!, { now: new Date("2026-07-12T08:00:00Z") });
assert("19. Stale document → STALE", q19.status === "STALE");

// Test 20 — Freshness evaluation
const f20 = evaluateSalesFreshness(r1.document!, { now: new Date("2026-07-12T06:15:00Z") });
// sourceModifiedAt (2026-07-10T10:00:00Z) is 44h old → STALE for 30min SLA
assert("20. Source-based freshness is STALE (data is 44h old)", f20.isStale === true);

// ── VALID SALE FILTER ───────────────────────────────────────────────────────

console.log("\n--- Valid Sale Filter ---");

// Test 21 — Valid active invoice
const v21 = isValidSale(r1.document!);
assert("21. Active invoice with value → valid", v21.isValid === true);

// Test 22 — Voided not valid
const v22 = isValidSale(r13.document!);
assert("22. Anulada → not valid", v22.isValid === false && v22.reasons.includes("Document is voided (anulada)"));

// Test 23 — Zero total invoice not valid
const zeroTotal: SalesDocumentRawInput = { ...validInvoice, total: 0, subtotal: 0 };
const r23 = normalizeSalesDocument(zeroTotal, ctx);
const v23 = isValidSale(r23.document!);
assert("23. Zero total invoice → not valid", v23.isValid === false);

// Test 24 — No lines not valid
const v24 = isValidSale(r15.document!);
assert("24. No lines → not valid", v24.isValid === false);

// ── DOCUMENT STATUS ─────────────────────────────────────────────────────────

console.log("\n--- Document Status ---");

assert("25. Active status", deriveSalesDocumentStatus({ anulada: false, totalValue: 100 }) === "ACTIVE");
assert("26. Anulada status", deriveSalesDocumentStatus({ anulada: true, totalValue: 100 }) === "ANULADA");
assert("27. Pendiente status (zero total)", deriveSalesDocumentStatus({ anulada: false, totalValue: 0 }) === "PENDIENTE");

// ── ADAPTER ─────────────────────────────────────────────────────────────────

(async () => {
console.log("\n--- Adapter ---");

const noDocNumRow: SalesDocumentRawInput = { ...validInvoice, numeroDocumento: null };

const adapter = createSagSalesAdapter({
  fetchDocuments: async () => [validInvoice, noDocNumRow],
  countDocuments: async () => 2,
  checkHealth: async () => ({ reachable: true, latencyMs: 80 }),
});

assert("28. Adapter ID", adapter.id === SAG_SALES_ADAPTER_ID);
assert("28b. Adapter domain", adapter.domain === "SALES");

// Test 29 — Discovery
const discovery = await adapter.discover({ tenantId: "castillitos", domain: "SALES", sourceSystem: "SAG_PYA", mode: "FULL", correlationId: "test-001", startedAt: new Date(), lastSyncAt: null });
assert("29. Discovery returns count", discovery.totalRecords === 2);

// Test 30 — Validation
const validation = await adapter.validate({ tenantId: "castillitos", domain: "SALES", sourceSystem: "SAG_PYA", mode: "FULL", correlationId: "test-002", startedAt: new Date(), lastSyncAt: null });
assert("30. Validation passes", validation.valid === true);

// Test 31 — Normalization
const normResult = await adapter.normalize(validInvoice, { tenantId: "castillitos", domain: "SALES", sourceSystem: "SAG_PYA", mode: "FULL", correlationId: "test-003", startedAt: new Date(), lastSyncAt: null });
assert("31. Normalization produces document", normResult.normalized !== null);
assert("31b. Quality not rejected", normResult.quality.level !== "REJECTED");

// Test 32 — Synchronize
const syncResult = await adapter.synchronize({ tenantId: "castillitos", domain: "SALES", sourceSystem: "SAG_PYA", mode: "FULL", correlationId: "test-004", startedAt: new Date(), lastSyncAt: null });
assert("32. Sync completes", syncResult.status === "PARTIAL");
assert("32b. Stats: 1 persisted + 1 rejected", syncResult.stats.persisted === 1 && syncResult.stats.rejected === 1);

// Test 33 — Health
const health = await adapter.health();
assert("33. Health is HEALTHY", health.status === "HEALTHY");
assert("33b. Latency reported", health.latencyMs === 80);

// Test 34 — Capabilities
const caps = adapter.capabilities();
assert("34. Supports incremental", caps.supportsIncremental === true);
assert("34b. Supports discovery", caps.supportsDiscovery === true);
assert("34c. No webhook support", caps.supportsWebhook === false);

// ── REGISTRATION ────────────────────────────────────────────────────────────

console.log("\n--- Registration ---");

// Test 35 — Register in adapter registry
const adapterRegistry = createCommercialAdapterRegistry();
const reg35 = registerSalesAdapter(adapterRegistry, "castillitos");
assert("35. Registration succeeds", reg35.ok === true);

// Test 36 — Can resolve by SALES_SYNC capability
const resolved = adapterRegistry.resolve({ tenantId: "castillitos", capability: "SALES_SYNC" });
assert("36. Resolves by SALES_SYNC", resolved.ok === true && resolved.ok && resolved.value.adapterId === SAG_SALES_ADAPTER_ID);

// Test 37 — Can resolve by SALES_DISCOVERY
const resolved2 = adapterRegistry.resolve({ tenantId: "castillitos", capability: "SALES_DISCOVERY" });
assert("37. Resolves by SALES_DISCOVERY", resolved2.ok === true);

// Test 38 — Domain registry recognizes SalesDocument
const domainRegistry = createCommercialDomainRegistry();
domainRegistry.register(SALES_DOMAIN);
const owner = domainRegistry.resolveOwner("SalesDocument");
assert("38. SalesDocument → SALES domain", owner === "SALES");

// Test 39 — SaleLine ownership
const lineOwner = domainRegistry.resolveOwner("SaleLine");
assert("39. SaleLine → SALES domain", lineOwner === "SALES");

// Test 40 — SalesReturn ownership
const returnOwner = domainRegistry.resolveOwner("SalesReturn");
assert("40. SalesReturn → SALES domain", returnOwner === "SALES");

// Test 41 — Different tenant isolation
const reg41 = registerSalesAdapter(adapterRegistry, "other-company");
assert("41. Same adapter for different tenant", reg41.ok === true);
const resolvedOther = adapterRegistry.resolve({ tenantId: "other-company", capability: "SALES_SYNC" });
assert("41b. Other tenant resolves independently", resolvedOther.ok === true && resolvedOther.ok && resolvedOther.value.tenantId === "other-company");

// ── SUMMARY ─────────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} PASS / ${failed} FAIL / ${passed + failed} total ===\n`);

if (failed > 0) {
  console.log("SALES-DOMAIN-01 TESTS FAILED.\n");
  process.exit(1);
} else {
  console.log("ALL SALES-DOMAIN-01 TESTS PASSED.\n");
}
})();
