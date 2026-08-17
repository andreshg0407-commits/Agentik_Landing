/**
 * lib/auth/__tests__/clients-canonical-truth-03a8d.test.ts
 *
 * CLIENTS-CANONICAL-TRUTH-03A8D — Header KPI source closure.
 *
 * Behavioral tests proving:
 *   1. SAG orders KPI uses sagTerceroId (not NIT)
 *   2. Invoice KPI counts only SALES_INVOICE canonical kind
 *   3. Both KPIs have truthState, reason, windowLabel, sourceAsOf
 *   4. Fail-closed: 0 only when query succeeded + identity resolved + no records
 *   5. Remissions, credit notes, receipts excluded from invoice count
 *   6. Source down → "No disponible"
 *   7. Missing identity → "Cliente no vinculado con SAG"
 *   8. UI renders explicit reasons, not ambiguous em dashes
 *   9. Loaders produce the metadata fields
 *  10. sourceProfileId controls document classification
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

// ── 1. resolveSagOrdersKpi ──────────────────────────────────────────────────

describe("resolveSagOrdersKpi", () => {
  const { resolveSagOrdersKpi } = require("../../comercial/clientes/clientes-pure");

  test("client with SAG orders → CERTIFIED", () => {
    const meta = resolveSagOrdersKpi(12345, true, 7, new Date("2026-08-16"));
    expect(meta.truthState).toBe("CERTIFIED");
    expect(meta.count).toBe(7);
    expect(meta.windowLabel).toContain("7 pedidos SAG");
    expect(meta.reason).toContain("sagTerceroId=12345");
    expect(meta.sourceAsOf).not.toBeNull();
  });

  test("client with 1 SAG order → singular label", () => {
    const meta = resolveSagOrdersKpi(12345, true, 1, new Date());
    expect(meta.windowLabel).toBe("1 pedido SAG");
  });

  test("certified zero — query OK, 0 records → EMPTY_CERTIFIED", () => {
    const meta = resolveSagOrdersKpi(12345, true, 0, new Date());
    expect(meta.truthState).toBe("EMPTY_CERTIFIED");
    expect(meta.count).toBe(0);
    expect(meta.windowLabel).toBe("Sin pedidos SAG");
    expect(meta.reason).toContain("0 registros");
  });

  test("source down → SOURCE_DOWN", () => {
    const meta = resolveSagOrdersKpi(12345, false, 0, null);
    expect(meta.truthState).toBe("SOURCE_DOWN");
    expect(meta.count).toBeNull();
    expect(meta.sourceAsOf).toBeNull();
  });

  test("no sagTerceroId → IDENTITY_MISSING", () => {
    const meta = resolveSagOrdersKpi(null, false, 0, null);
    expect(meta.truthState).toBe("IDENTITY_MISSING");
    expect(meta.count).toBeNull();
    expect(meta.reason).toContain("sin sagTerceroId");
  });

  test("sagTerceroId=0 → IDENTITY_MISSING", () => {
    const meta = resolveSagOrdersKpi(0, false, 0, null);
    expect(meta.truthState).toBe("IDENTITY_MISSING");
  });
});

// ── 2. resolveInvoiceKpi ────────────────────────────────────────────────────

describe("resolveInvoiceKpi", () => {
  const { resolveInvoiceKpi } = require("../../comercial/clientes/clientes-pure");

  test("invoices found → CERTIFIED", () => {
    const meta = resolveInvoiceKpi("900469068", true, 5, 8, ["Remisión", "Nota crédito"], new Date());
    expect(meta.truthState).toBe("CERTIFIED");
    expect(meta.count).toBe(5);
    expect(meta.windowLabel).toContain("5 facturas");
    expect(meta.reason).toContain("5 facturas de 8 registros");
    expect(meta.reason).toContain("Remisión");
    expect(meta.reason).toContain("Nota crédito");
  });

  test("0 invoices from 3 sales → EMPTY_CERTIFIED with Facturación no disponible", () => {
    const meta = resolveInvoiceKpi("900469068", true, 0, 3, ["Remisión"], new Date());
    expect(meta.truthState).toBe("EMPTY_CERTIFIED");
    expect(meta.count).toBe(0);
    expect(meta.windowLabel).toBe("Facturación no disponible");
  });

  test("0 invoices from 0 sales → EMPTY_CERTIFIED", () => {
    const meta = resolveInvoiceKpi("900469068", true, 0, 0, [], new Date());
    expect(meta.truthState).toBe("EMPTY_CERTIFIED");
    expect(meta.count).toBe(0);
  });

  test("source down → SOURCE_DOWN", () => {
    const meta = resolveInvoiceKpi("900469068", false, 0, 0, [], null);
    expect(meta.truthState).toBe("SOURCE_DOWN");
    expect(meta.count).toBeNull();
  });

  test("no NIT → IDENTITY_MISSING", () => {
    const meta = resolveInvoiceKpi(null, false, 0, 0, [], null);
    expect(meta.truthState).toBe("IDENTITY_MISSING");
    expect(meta.count).toBeNull();
    expect(meta.reason).toContain("sin NIT");
  });

  test("1 invoice → singular label", () => {
    const meta = resolveInvoiceKpi("12345", true, 1, 1, [], new Date());
    expect(meta.windowLabel).toBe("1 factura");
  });
});

// ── 3. kpiDisplayValue ──────────────────────────────────────────────────────

describe("kpiDisplayValue", () => {
  const { kpiDisplayValue } = require("../../comercial/clientes/clientes-pure");

  test("CERTIFIED → shows count", () => {
    expect(kpiDisplayValue({ truthState: "CERTIFIED", count: 7 })).toBe("7");
  });

  test("EMPTY_CERTIFIED → shows '0'", () => {
    expect(kpiDisplayValue({ truthState: "EMPTY_CERTIFIED", count: 0 })).toBe("0");
  });

  test("SOURCE_DOWN → 'No disponible'", () => {
    expect(kpiDisplayValue({ truthState: "SOURCE_DOWN", count: null })).toBe("No disponible");
  });

  test("IDENTITY_MISSING → 'Cliente no vinculado con SAG'", () => {
    expect(kpiDisplayValue({ truthState: "IDENTITY_MISSING", count: null })).toBe("Cliente no vinculado con SAG");
  });

  test("PENDING_VALIDATION → 'Pendiente de validación'", () => {
    expect(kpiDisplayValue({ truthState: "PENDING_VALIDATION", count: null })).toBe("Pendiente de validación");
  });
});

// ── 4. Canonical document kind filtering (SALES_INVOICE only) ───────────────

describe("canonical invoice counting — document kind isolation", () => {
  const { resolveCanonicalDocumentKind } = require("../../comercial/clientes/document-source-profiles");

  test("FE prefix → SALES_INVOICE (included)", () => {
    const r = resolveCanonicalDocumentKind("castillitos", { documento: "FE-1234", tipoDocumento: "" });
    expect(r.kind).toBe("SALES_INVOICE");
  });

  test("F2 prefix → SALES_REMISSION (excluded)", () => {
    const r = resolveCanonicalDocumentKind("castillitos", { documento: "F2-5678", tipoDocumento: "" });
    expect(r.kind).toBe("SALES_REMISSION");
  });

  test("D2 prefix → SALES_CREDIT_NOTE (excluded)", () => {
    const r = resolveCanonicalDocumentKind("castillitos", { documento: "D2-849", tipoDocumento: "" });
    expect(r.kind).toBe("SALES_CREDIT_NOTE");
  });

  test("R1 prefix → CUSTOMER_RECEIPT (excluded)", () => {
    const r = resolveCanonicalDocumentKind("castillitos", { documento: "R1-100", tipoDocumento: "" });
    expect(r.kind).toBe("CUSTOMER_RECEIPT");
  });

  test("AN prefix → CUSTOMER_ADVANCE (excluded)", () => {
    const r = resolveCanonicalDocumentKind("castillitos", { documento: "AN-50", tipoDocumento: "" });
    expect(r.kind).toBe("CUSTOMER_ADVANCE");
  });

  test("XX prefix → UNKNOWN_DOCUMENT (excluded)", () => {
    const r = resolveCanonicalDocumentKind("castillitos", { documento: "XX-999", tipoDocumento: "" });
    expect(r.kind).toBe("UNKNOWN_DOCUMENT");
  });

  // Ludisam isolation
  test("F7 prefix (Ludisam) → SALES_INVOICE", () => {
    const r = resolveCanonicalDocumentKind("ludisam", { documento: "F7-1234", tipoDocumento: "" });
    expect(r.kind).toBe("SALES_INVOICE");
  });

  test("RE prefix (Ludisam) → SALES_REMISSION (excluded)", () => {
    const r = resolveCanonicalDocumentKind("ludisam", { documento: "RE-1234", tipoDocumento: "" });
    expect(r.kind).toBe("SALES_REMISSION");
  });
});

// ── 5. Structural: loader computes and emits metadata ───────────────────────

describe("cliente-360-loader.ts — KPI metadata fields", () => {
  const src = readFile("lib/comercial/clientes/cliente-360-loader.ts");

  test("Cliente360Data has sagOrdersMeta field", () => {
    expect(src).toContain("sagOrdersMeta: KpiSourceMeta");
  });

  test("Cliente360Data has invoicesMeta field", () => {
    expect(src).toContain("invoicesMeta: KpiSourceMeta");
  });

  test("SAG orders query uses sagTerceroId (not p.nit)", () => {
    const sagOrderBlock = src.slice(
      src.indexOf("SAG Orders (via sagTerceroId"),
      src.indexOf("timing.sagOrders"),
    );
    expect(sagOrderBlock).toContain("String(p.sagTerceroId)");
    expect(sagOrderBlock).not.toContain("customerNit: p.nit");
  });

  test("SAG orders query is wrapped in try/catch for fail-closed", () => {
    const sagOrderBlock = src.slice(
      src.indexOf("SAG Orders (via sagTerceroId"),
      src.indexOf("timing.sagOrders"),
    );
    expect(sagOrderBlock).toContain("try {");
    expect(sagOrderBlock).toContain("queryOk = true");
    expect(sagOrderBlock).toContain("queryOk = false");
  });

  test("invoice count uses resolveCanonicalDocumentKind", () => {
    expect(src).toContain("resolveCanonicalDocumentKind(sourceProfileId");
    expect(src).toContain('kind.kind === "SALES_INVOICE"');
  });

  test("result object includes sagOrdersMeta", () => {
    expect(src).toContain("sagOrdersMeta,");
  });

  test("result object includes invoicesMeta", () => {
    expect(src).toContain("invoicesMeta,");
  });

  test("imports resolveSagOrdersKpi from clientes-pure", () => {
    expect(src).toContain("resolveSagOrdersKpi");
  });

  test("imports resolveInvoiceKpi from clientes-pure", () => {
    expect(src).toContain("resolveInvoiceKpi");
  });

  test("imports resolveCanonicalDocumentKind from document-source-profiles", () => {
    expect(src).toContain('from "./document-source-profiles"');
  });
});

// ── 6. Structural: UI uses kpiDisplayValue ──────────────────────────────────

describe("cliente-360-client.tsx — KPI display", () => {
  const src = readFile("app/(app)/[orgSlug]/comercial/clientes/[clienteId]/cliente-360-client.tsx");

  test("imports kpiDisplayValue from clientes-pure", () => {
    expect(src).toContain("kpiDisplayValue");
    expect(src).toContain("clientes-pure");
  });

  test("Pedidos SAG uses kpiDisplayValue", () => {
    expect(src).toContain("kpiDisplayValue(data.sagOrdersMeta)");
  });

  test("Facturas uses kpiDisplayValue", () => {
    expect(src).toContain("kpiDisplayValue(data.invoicesMeta)");
  });

  test("does NOT use sagOrders.items.length for KPI display", () => {
    // The KPI card should NOT use raw count — metadata handles display
    const kpiBlock = src.slice(src.indexOf("KPI Strip"), src.indexOf("Cartera vencida"));
    expect(kpiBlock).not.toContain("sagOrders.items.length");
  });

  test("does NOT use sagSourceType filter for KPI display", () => {
    const kpiBlock = src.slice(src.indexOf("KPI Strip"), src.indexOf("Cartera vencida"));
    expect(kpiBlock).not.toContain("sagSourceType");
  });
});

describe("clientes-client.tsx — drawer KPI display", () => {
  const src = readFile("app/(app)/[orgSlug]/comercial/clientes/clientes-client.tsx");

  test("imports kpiDisplayValue from clientes-pure", () => {
    expect(src).toContain("kpiDisplayValue");
  });

  test("drawer Pedidos SAG uses kpiDisplayValue", () => {
    expect(src).toContain("kpiDisplayValue(data.sagOrdersMeta)");
  });

  test("drawer Facturas uses kpiDisplayValue", () => {
    expect(src).toContain("kpiDisplayValue(data.invoicesMeta)");
  });

  test("Inteligencia tab uses kpiDisplayValue for Pedidos SAG", () => {
    const intelBlock = src.slice(src.indexOf("Comportamiento"), src.indexOf("Preferencias"));
    expect(intelBlock).toContain("kpiDisplayValue(data.sagOrdersMeta)");
  });

  test("Inteligencia tab uses kpiDisplayValue for Facturas", () => {
    const intelBlock = src.slice(src.indexOf("Comportamiento"), src.indexOf("Preferencias"));
    expect(intelBlock).toContain("kpiDisplayValue(data.invoicesMeta)");
  });
});

// ── 7. 0 certified is distinct from null ────────────────────────────────────

describe("certified zero vs null — KPI separation", () => {
  const { resolveSagOrdersKpi, resolveInvoiceKpi, kpiDisplayValue } = require("../../comercial/clientes/clientes-pure");

  test("SAG orders: certified 0 → display '0', not em dash", () => {
    const meta = resolveSagOrdersKpi(12345, true, 0, new Date());
    expect(kpiDisplayValue(meta)).toBe("0");
    expect(meta.count).toBe(0);
    expect(meta.truthState).toBe("EMPTY_CERTIFIED");
  });

  test("SAG orders: null (identity missing) → display message, count is null", () => {
    const meta = resolveSagOrdersKpi(null, false, 0, null);
    expect(kpiDisplayValue(meta)).toBe("Cliente no vinculado con SAG");
    expect(meta.count).toBeNull();
  });

  test("invoices: certified 0 → display '0'", () => {
    const meta = resolveInvoiceKpi("900469068", true, 0, 0, [], new Date());
    expect(kpiDisplayValue(meta)).toBe("0");
    expect(meta.count).toBe(0);
  });

  test("invoices: null (source down) → display 'No disponible'", () => {
    const meta = resolveInvoiceKpi("900469068", false, 0, 0, [], null);
    expect(kpiDisplayValue(meta)).toBe("No disponible");
    expect(meta.count).toBeNull();
  });
});

// ── 8. Multitenancy: no global document codes ───────────────────────────────

describe("multitenancy — sourceProfileId controls classification", () => {
  const loaderSrc = readFile("lib/comercial/clientes/cliente-360-loader.ts");

  test("invoice classification uses sourceProfileId variable", () => {
    expect(loaderSrc).toContain("resolveCanonicalDocumentKind(sourceProfileId");
  });

  test("sourceProfileId resolved server-side from resolveOrgSourceProfileId", () => {
    expect(loaderSrc).toContain("resolveOrgSourceProfileId(resolvedOrgSlug)");
  });

  test("no hardcoded 'castillitos' in invoice classification", () => {
    // The resolveCanonicalDocumentKind call should NOT use a literal "castillitos"
    const invoiceBlock = loaderSrc.slice(
      loaderSrc.indexOf("Invoice KPI"),
      loaderSrc.indexOf("resolveInvoiceKpi"),
    );
    expect(invoiceBlock).not.toContain('"castillitos"');
  });
});

// ── 9. Pure module purity ───────────────────────────────────────────────────

describe("clientes-pure.ts — KPI purity", () => {
  const src = readFile("lib/comercial/clientes/clientes-pure.ts");

  test("exports KpiTruthState type", () => {
    expect(src).toContain("export type KpiTruthState");
  });

  test("exports KpiSourceMeta interface", () => {
    expect(src).toContain("export interface KpiSourceMeta");
  });

  test("exports kpiDisplayValue function", () => {
    expect(src).toContain("export function kpiDisplayValue");
  });

  test("exports resolveSagOrdersKpi function", () => {
    expect(src).toContain("export function resolveSagOrdersKpi");
  });

  test("exports resolveInvoiceKpi function", () => {
    expect(src).toContain("export function resolveInvoiceKpi");
  });

  test("KpiSourceMeta has all required fields", () => {
    expect(src).toContain("count: number | null");
    expect(src).toContain("source: string");
    expect(src).toContain("sourceAsOf: string | null");
    expect(src).toContain("windowLabel: string");
    expect(src).toContain("truthState: KpiTruthState");
    expect(src).toContain("reason: string");
  });
});
