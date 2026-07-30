/**
 * lib/comercial/tiendas/__tests__/store-sales-assembly.test.ts
 *
 * AGENTIK-STORES-CERTIFIED-SALES-MIGRATION-01 — certification tests.
 *
 * Certifies the business law:
 *   - Revenue por tienda = FACTURA (+) − NOTA_CREDITO, clasificado por
 *     FAMILIA DOCUMENTAL canónica, nunca por signo del monto.
 *   - RECAUDO_POS es cobro de caja: se expone por separado y NUNCA
 *     entra al revenue (evita doble conteo factura+recaudo).
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-sales-assembly.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  assembleStoreSales,
  buildStoreSalesKpis,
  type StoreSalesRawRow,
} from "../store-sales-assembly";

const YEAR = 2026;

function row(month: string, code: string, docCount: number, amount: number): StoreSalesRawRow {
  return { month, code, docCount, amount };
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Family classification — never by sign
// ═════════════════════════════════════════════════════════════════════════════

describe("document family classification", () => {
  it("FD facturas count as invoices and grossRev for San Diego", () => {
    const res = assembleStoreSales("san_diego", YEAR, [
      row("2026-04", "FD", 120, 21_100_000),
    ]);
    assert.ok(res);
    assert.equal(res.monthly.length, 1);
    assert.equal(res.monthly[0].invoices, 120);
    assert.equal(res.monthly[0].grossRev, 21_100_000);
    assert.equal(res.monthly[0].revenue, 21_100_000);
    assert.equal(res.kpis.invoiceCount, 120);
  });

  it("NS notas credito count as credits and subtract from revenue", () => {
    const res = assembleStoreSales("san_diego", YEAR, [
      row("2026-04", "FD", 100, 22_000_000),
      row("2026-04", "NS", 5, -900_000),
    ]);
    assert.ok(res);
    assert.equal(res.monthly[0].invoices, 100);
    assert.equal(res.monthly[0].credits, 5);
    assert.equal(res.monthly[0].creditRev, -900_000);
    assert.equal(res.monthly[0].revenue, 21_100_000);
  });

  it("a nota credito stored with POSITIVE amount still subtracts (sign-defensive)", () => {
    const res = assembleStoreSales("san_diego", YEAR, [
      row("2026-04", "FD", 100, 22_000_000),
      row("2026-04", "NS", 5, 900_000),   // wrong sign upstream
    ]);
    assert.ok(res);
    assert.equal(res.monthly[0].creditRev, -900_000);
    assert.equal(res.monthly[0].revenue, 21_100_000);
  });

  it("RS recaudos POS are counted separately and NEVER added to revenue", () => {
    const res = assembleStoreSales("san_diego", YEAR, [
      row("2026-04", "FD", 100, 21_100_000),
      row("2026-04", "RS", 300, 7_900_000),   // POS receipts
    ]);
    assert.ok(res);
    assert.equal(res.monthly[0].posReceiptCount, 300);
    assert.equal(res.monthly[0].posReceiptRev, 7_900_000);
    // Revenue is untouched by recaudos:
    assert.equal(res.monthly[0].revenue, 21_100_000);
    // And recaudos are NOT counted as invoices (the old sign-based bug):
    assert.equal(res.monthly[0].invoices, 100);
    assert.equal(res.kpis.invoiceCount, 100);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Store isolation — codes from other stores or unattributed codes
// ═════════════════════════════════════════════════════════════════════════════

describe("store isolation", () => {
  it("codes of a different store are ignored", () => {
    const res = assembleStoreSales("san_diego", YEAR, [
      row("2026-04", "FD", 100, 21_100_000),
      row("2026-04", "FC", 80, 15_000_000),   // Centro factura
    ]);
    assert.ok(res);
    assert.equal(res.kpis.totalRevenue, 21_100_000);
    assert.equal(res.kpis.invoiceCount, 100);
  });

  it("unattributed ALMACEN codes (VC, AN, SI) never enter store revenue", () => {
    const res = assembleStoreSales("san_diego", YEAR, [
      row("2026-04", "FD", 100, 21_100_000),
      row("2026-04", "VC", 40, 3_000_000),    // venta contado — no store attribution
      row("2026-04", "AN", 25, 2_500_000),    // Addi — no store attribution
      row("2026-04", "SI", 20, 2_400_000),    // Sistecredito — no store attribution
    ]);
    assert.ok(res);
    assert.equal(res.kpis.totalRevenue, 21_100_000);
  });

  it("unknown codes are ignored", () => {
    const res = assembleStoreSales("san_diego", YEAR, [
      row("2026-04", "FD", 100, 21_100_000),
      row("2026-04", "ZZ", 9, 999_999),
    ]);
    assert.ok(res);
    assert.equal(res.kpis.totalRevenue, 21_100_000);
  });

  it("unknown store returns null", () => {
    assert.equal(assembleStoreSales("bodega_principal", YEAR, []), null);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Monthly assembly and KPIs
// ═════════════════════════════════════════════════════════════════════════════

describe("monthly assembly", () => {
  it("months are sorted ascending with Spanish labels", () => {
    const res = assembleStoreSales("centro", YEAR, [
      row("2026-04", "FC", 10, 1_000_000),
      row("2026-01", "FC", 20, 2_000_000),
      row("2026-02", "FC", 30, 3_000_000),
    ]);
    assert.ok(res);
    assert.deepEqual(res.monthly.map(m => m.month), ["2026-01", "2026-02", "2026-04"]);
    assert.deepEqual(res.monthly.map(m => m.label), ["Ene", "Feb", "Abr"]);
  });

  it("multiple rows of the same month × family accumulate", () => {
    const res = assembleStoreSales("caldas", YEAR, [
      row("2026-03", "FA", 10, 1_000_000),
      row("2026-03", "FA", 5, 500_000),
    ]);
    assert.ok(res);
    assert.equal(res.monthly.length, 1);
    assert.equal(res.monthly[0].invoices, 15);
    assert.equal(res.monthly[0].grossRev, 1_500_000);
  });

  it("empty input yields empty certified response", () => {
    const res = assembleStoreSales("gran_plaza", YEAR, []);
    assert.ok(res);
    assert.equal(res.storeName, "Gran Plaza");
    assert.equal(res.monthly.length, 0);
    assert.equal(res.kpis.totalRevenue, 0);
    assert.equal(res.kpis.dataMonths, 0);
    assert.equal(res.kpis.avgMonthlyRevenue, 0);
    assert.equal(res.certified, true);
  });
});

describe("KPIs", () => {
  it("totals aggregate across months; avg uses months with revenue docs", () => {
    const res = assembleStoreSales("centro", YEAR, [
      row("2026-01", "FC", 10, 10_000_000),
      row("2026-02", "FC", 20, 14_000_000),
      row("2026-02", "NT", 2, -1_000_000),
      row("2026-03", "RC", 50, 5_000_000),   // POS-only month → not a revenue data month
    ]);
    assert.ok(res);
    assert.equal(res.kpis.totalGrossRev, 24_000_000);
    assert.equal(res.kpis.totalCreditRev, -1_000_000);
    assert.equal(res.kpis.totalRevenue, 23_000_000);
    assert.equal(res.kpis.invoiceCount, 30);
    assert.equal(res.kpis.creditNoteCount, 2);
    assert.equal(res.kpis.posReceiptCount, 50);
    assert.equal(res.kpis.totalPosReceiptRev, 5_000_000);
    assert.equal(res.kpis.dataMonths, 2);
    assert.equal(res.kpis.avgMonthlyRevenue, Math.round(23_000_000 / 2));
  });

  it("buildStoreSalesKpis on empty monthly is all zeros", () => {
    const kpis = buildStoreSalesKpis([]);
    assert.equal(kpis.totalRevenue, 0);
    assert.equal(kpis.dataMonths, 0);
    assert.equal(kpis.avgMonthlyRevenue, 0);
  });
});
