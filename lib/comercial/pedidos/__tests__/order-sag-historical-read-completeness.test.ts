/**
 * lib/comercial/pedidos/__tests__/order-sag-historical-read-completeness.test.ts
 *
 * Tests for the SAG historical read completeness sprint.
 * Covers: origin classification, data authority, merge protection,
 * line data status, reconciliation, seller display, go-live cutoff.
 *
 * Run: npx tsx --test lib/comercial/pedidos/__tests__/order-sag-historical-read-completeness.test.ts
 *
 * Sprint: AGENTIK-ORDERS-SAG-HISTORICAL-READ-COMPLETENESS-01
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  classifyOrderOrigin,
  getFieldAuthority,
  shouldAllowSagOverwrite,
  classifyLineDataStatus,
  computeReconciliationStatus,
  resolveSellerDisplayStatus,
  sellerDisplayLabel,
  lineDataDisplayLabel,
  reconciliationDisplayLabel,
  AGENTIK_ORDERS_GO_LIVE_AT,
} from "../order-authority";

import type {
  OrderOrigin,
  LineDataStatus,
  SellerDisplayStatus,
} from "../order-types";

// ── Suite 1: Origin classification ──────────────────────────────────────────

describe("classifyOrderOrigin", () => {
  it("SAG_HISTORICAL preserved when already set", () => {
    const result = classifyOrderOrigin({
      currentOrigin: "SAG_HISTORICAL",
      sourceSystem: "customer_order_record",
    });
    assert.equal(result, "SAG_HISTORICAL");
  });

  it("AGENTIK_NATIVE preserved when already set", () => {
    const result = classifyOrderOrigin({
      currentOrigin: "AGENTIK_NATIVE",
      sourceSystem: "agent_execution",
    });
    assert.equal(result, "AGENTIK_NATIVE");
  });

  it("CRM_LEGACY preserved when already set", () => {
    const result = classifyOrderOrigin({
      currentOrigin: "CRM_LEGACY",
      sourceSystem: "crm_quote",
    });
    assert.equal(result, "CRM_LEGACY");
  });

  it("customer_order_record → SAG_HISTORICAL", () => {
    const result = classifyOrderOrigin({
      currentOrigin: "sag_customer_order",
      sourceSystem: "customer_order_record",
    });
    assert.equal(result, "SAG_HISTORICAL");
  });

  it("agent_execution → AGENTIK_NATIVE", () => {
    const result = classifyOrderOrigin({
      currentOrigin: "agentik",
      sourceSystem: "agent_execution",
    });
    assert.equal(result, "AGENTIK_NATIVE");
  });

  it("crm_quote → CRM_LEGACY", () => {
    const result = classifyOrderOrigin({
      currentOrigin: "sag",
      sourceSystem: "crm_quote",
    });
    assert.equal(result, "CRM_LEGACY");
  });

  it("go-live cutoff does not override explicit origin", () => {
    // Even with a date, explicit source system wins
    const result = classifyOrderOrigin({
      currentOrigin: "SAG_HISTORICAL",
      sourceSystem: "customer_order_record",
      orderDate: new Date("2030-01-01"), // far future
    });
    assert.equal(result, "SAG_HISTORICAL");
  });
});

// ── Suite 2: Data authority ─────────────────────────────────────────────────

describe("getFieldAuthority", () => {
  it("SAG_HISTORICAL header authority is SAG", () => {
    const auth = getFieldAuthority("SAG_HISTORICAL");
    assert.equal(auth.header, "SAG");
    assert.equal(auth.lines, "SAG");
    assert.equal(auth.seller, "SAG");
  });

  it("AGENTIK_NATIVE header authority is AGENTIK", () => {
    const auth = getFieldAuthority("AGENTIK_NATIVE");
    assert.equal(auth.header, "AGENTIK");
    assert.equal(auth.lines, "AGENTIK");
    assert.equal(auth.seller, "AGENTIK");
    assert.equal(auth.customer, "AGENTIK");
  });

  it("AGENTIK_NATIVE invoice authority is SAG", () => {
    const auth = getFieldAuthority("AGENTIK_NATIVE");
    assert.equal(auth.invoice, "SAG");
    assert.equal(auth.dispatch, "SAG");
  });

  it("CRM_LEGACY header authority is CRM", () => {
    const auth = getFieldAuthority("CRM_LEGACY");
    assert.equal(auth.header, "CRM");
    assert.equal(auth.seller, "CRM");
  });

  it("legacy 'agentik' treated same as AGENTIK_NATIVE", () => {
    const auth = getFieldAuthority("agentik");
    assert.equal(auth.header, "AGENTIK");
    assert.equal(auth.lines, "AGENTIK");
  });

  it("legacy 'sag_customer_order' treated same as SAG_HISTORICAL", () => {
    const auth = getFieldAuthority("sag_customer_order");
    assert.equal(auth.header, "SAG");
    assert.equal(auth.lines, "SAG");
  });
});

// ── Suite 3: Merge protection ───────────────────────────────────────────────

describe("shouldAllowSagOverwrite", () => {
  it("SAG authoritative field — always allowed", () => {
    const result = shouldAllowSagOverwrite({
      origin: "SAG_HISTORICAL",
      field: "header",
      currentValue: "old",
      sagValue: "new",
    });
    assert.equal(result.allowed, true);
    assert.equal(result.reason, "sag_authoritative");
  });

  it("AGENTIK_NATIVE — SAG cannot overwrite Agentik lines with empty", () => {
    const result = shouldAllowSagOverwrite({
      origin: "AGENTIK_NATIVE",
      field: "lines",
      currentValue: "10 lines",
      sagValue: null,
    });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, "would_degrade_agentik_data");
  });

  it("AGENTIK_NATIVE — SAG cannot remove seller", () => {
    const result = shouldAllowSagOverwrite({
      origin: "AGENTIK_NATIVE",
      field: "seller",
      currentValue: "Juan Lopez",
      sagValue: null,
    });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, "would_degrade_agentik_data");
  });

  it("AGENTIK_NATIVE — SAG cannot replace non-empty with empty string", () => {
    const result = shouldAllowSagOverwrite({
      origin: "AGENTIK_NATIVE",
      field: "seller",
      currentValue: "Juan Lopez",
      sagValue: "",
    });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, "would_degrade_agentik_data");
  });

  it("AGENTIK_NATIVE — SAG can enrich invoice (SAG authoritative)", () => {
    const result = shouldAllowSagOverwrite({
      origin: "AGENTIK_NATIVE",
      field: "invoice",
      currentValue: null,
      sagValue: "FE-12345",
    });
    assert.equal(result.allowed, true);
    // invoice is SAG-authoritative even on AGENTIK_NATIVE orders
    assert.equal(result.reason, "sag_authoritative");
  });

  it("AGENTIK_NATIVE — inconsistency detected when both have values", () => {
    const result = shouldAllowSagOverwrite({
      origin: "AGENTIK_NATIVE",
      field: "seller",
      currentValue: "Juan Lopez",
      sagValue: "Pedro Garcia",
    });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, "inconsistency_detected");
  });

  it("SAG can reconcile invoice on AGENTIK_NATIVE (SAG authoritative)", () => {
    const result = shouldAllowSagOverwrite({
      origin: "AGENTIK_NATIVE",
      field: "invoice",
      currentValue: "FE-111",
      sagValue: "FE-222",
    });
    assert.equal(result.allowed, true);
    assert.equal(result.reason, "sag_authoritative");
  });

  it("no change detected", () => {
    const result = shouldAllowSagOverwrite({
      origin: "AGENTIK_NATIVE",
      field: "seller",
      currentValue: "Juan",
      sagValue: "Juan",
    });
    assert.equal(result.allowed, true);
    assert.equal(result.reason, "no_change");
  });
});

// ── Suite 4: Line data status ───────────────────────────────────────────────

describe("classifyLineDataStatus", () => {
  it("COMPLETE when lines present", () => {
    const status = classifyLineDataStatus({
      linesCount: 10,
      headerAmount: 1000,
      orderStatus: "FACTURADO",
      sagLinesExist: true,
    });
    assert.equal(status, "COMPLETE");
  });

  it("EMPTY_CONFIRMED when no lines and no amount", () => {
    const status = classifyLineDataStatus({
      linesCount: 0,
      headerAmount: 0,
      orderStatus: "FACTURADO",
      sagLinesExist: false,
    });
    assert.equal(status, "EMPTY_CONFIRMED");
  });

  it("CANCELLED for cancelled orders", () => {
    const status = classifyLineDataStatus({
      linesCount: 0,
      headerAmount: 0,
      orderStatus: "CANCELADO",
      sagLinesExist: false,
    });
    assert.equal(status, "CANCELLED");
  });

  it("LINES_NOT_AVAILABLE when SAG has lines but local doesn't", () => {
    const status = classifyLineDataStatus({
      linesCount: 0,
      headerAmount: 5000,
      orderStatus: "PENDIENTE",
      sagLinesExist: true,
    });
    assert.equal(status, "LINES_NOT_AVAILABLE");
  });

  it("zero lines not represented as zero real", () => {
    // A SAG order with headerAmount=0 and no SAG lines is EMPTY_CONFIRMED, not COMPLETE
    const status = classifyLineDataStatus({
      linesCount: 0,
      headerAmount: 0,
      orderStatus: "FACTURADO",
      sagLinesExist: false,
    });
    assert.notEqual(status, "COMPLETE");
    assert.equal(status, "EMPTY_CONFIRMED");
  });
});

// ── Suite 5: Reconciliation ─────────────────────────────────────────────────

describe("computeReconciliationStatus", () => {
  it("MATCHED when values align", () => {
    assert.equal(
      computeReconciliationStatus({ totalHeaderSag: 1000, totalLinesComputed: 1000, linesCount: 5 }),
      "MATCHED",
    );
  });

  it("MATCHED within 1% tolerance", () => {
    assert.equal(
      computeReconciliationStatus({ totalHeaderSag: 1000, totalLinesComputed: 995, linesCount: 5 }),
      "MATCHED",
    );
  });

  it("DIFFERENCE when values differ significantly", () => {
    assert.equal(
      computeReconciliationStatus({ totalHeaderSag: 1000, totalLinesComputed: 500, linesCount: 5 }),
      "DIFFERENCE",
    );
  });

  it("NOT_APPLICABLE when no lines", () => {
    assert.equal(
      computeReconciliationStatus({ totalHeaderSag: 1000, totalLinesComputed: 0, linesCount: 0 }),
      "NOT_APPLICABLE",
    );
  });
});

// ── Suite 6: Seller display ─────────────────────────────────────────────────

describe("resolveSellerDisplayStatus", () => {
  it("SAG_CONFIRMED for sag_movimientos + high", () => {
    assert.equal(resolveSellerDisplayStatus("sag_movimientos", "high"), "SAG_CONFIRMED");
  });

  it("CRM_INFERRED for crm_quote_history", () => {
    assert.equal(resolveSellerDisplayStatus("crm_quote_history", "medium"), "CRM_INFERRED");
  });

  it("UNAVAILABLE when source is none", () => {
    assert.equal(resolveSellerDisplayStatus("none", "unknown"), "UNAVAILABLE");
  });

  it("UNAVAILABLE when source is null", () => {
    assert.equal(resolveSellerDisplayStatus(null, null), "UNAVAILABLE");
  });

  it("UNAVAILABLE when source is undefined", () => {
    assert.equal(resolveSellerDisplayStatus(undefined, undefined), "UNAVAILABLE");
  });
});

// ── Suite 7: Display labels ─────────────────────────────────────────────────

describe("display labels", () => {
  it("seller SAG confirmed label", () => {
    assert.equal(sellerDisplayLabel("SAG_CONFIRMED"), "Vendedor SAG confirmado");
  });

  it("seller CRM inferred label", () => {
    assert.equal(sellerDisplayLabel("CRM_INFERRED"), "Vendedor inferido desde CRM");
  });

  it("seller unavailable label", () => {
    assert.equal(sellerDisplayLabel("UNAVAILABLE"), "No informado por SAG");
  });

  it("line data complete label", () => {
    assert.equal(lineDataDisplayLabel("COMPLETE"), "Detalle completo");
  });

  it("line data empty confirmed label", () => {
    assert.equal(lineDataDisplayLabel("EMPTY_CONFIRMED"), "Pedido histórico sin detalle disponible");
  });

  it("reconciliation matched label", () => {
    assert.equal(reconciliationDisplayLabel("MATCHED"), "Total conciliado");
  });

  it("reconciliation difference label", () => {
    assert.equal(reconciliationDisplayLabel("DIFFERENCE"), "Total con diferencia");
  });
});

// ── Suite 8: Go-live cutoff ─────────────────────────────────────────────────

describe("AGENTIK_ORDERS_GO_LIVE_AT", () => {
  it("is null before configuration", () => {
    assert.equal(AGENTIK_ORDERS_GO_LIVE_AT, null);
  });

  it("does not modify explicit origin when set", () => {
    // Even if go-live were set, explicit origin takes precedence
    const result = classifyOrderOrigin({
      currentOrigin: "SAG_HISTORICAL",
      sourceSystem: "customer_order_record",
      orderDate: new Date("2020-01-01"),
    });
    assert.equal(result, "SAG_HISTORICAL");
  });
});

// ── Suite 9: Idempotency (from backfill) ────────────────────────────────────

describe("backfill idempotency", () => {
  it("computePayloadHash is deterministic", async () => {
    const { computePayloadHash } = await import("../order-sag-idempotency");
    const input = {
      TIPO_DOC: "PE",
      NIT: "900123456",
      FECHA: "2026-01-01",
      VENDEDOR: "100",
      BODEGA: "01",
      OBSERVACION: "test",
      LINEAS: [
        { CODIGO: "REF001", CANTIDAD: 10, PRECIO: 100, DESCUENTO: 0 },
        { CODIGO: "REF002", CANTIDAD: 5, PRECIO: 200, DESCUENTO: 0 },
      ],
    };

    const hash1 = computePayloadHash(input);
    const hash2 = computePayloadHash(input);
    assert.equal(hash1, hash2, "same payload must produce same hash");
  });

  it("line order does not affect hash", async () => {
    const { computePayloadHash } = await import("../order-sag-idempotency");
    const input1 = {
      TIPO_DOC: "PE", NIT: "900", FECHA: "2026-01-01",
      LINEAS: [
        { CODIGO: "A", CANTIDAD: 1, PRECIO: 10 },
        { CODIGO: "B", CANTIDAD: 2, PRECIO: 20 },
      ],
    };
    const input2 = {
      TIPO_DOC: "PE", NIT: "900", FECHA: "2026-01-01",
      LINEAS: [
        { CODIGO: "B", CANTIDAD: 2, PRECIO: 20 },
        { CODIGO: "A", CANTIDAD: 1, PRECIO: 10 },
      ],
    };

    assert.equal(
      computePayloadHash(input1 as any),
      computePayloadHash(input2 as any),
      "line order must not change hash",
    );
  });
});

// ── Suite 10: Edge cases ────────────────────────────────────────────────────

describe("edge cases", () => {
  it("empty SAG data does not degrade local data (lines)", () => {
    const result = shouldAllowSagOverwrite({
      origin: "AGENTIK_NATIVE",
      field: "lines",
      currentValue: [{ id: "line-1", qty: 10 }],
      sagValue: 0,
    });
    assert.equal(result.allowed, false);
  });

  it("empty SAG data does not degrade local data (seller)", () => {
    const result = shouldAllowSagOverwrite({
      origin: "AGENTIK_NATIVE",
      field: "seller",
      currentValue: "Maria Garcia",
      sagValue: "",
    });
    assert.equal(result.allowed, false);
  });

  it("SAG_HISTORICAL allows SAG to set any field", () => {
    const result = shouldAllowSagOverwrite({
      origin: "SAG_HISTORICAL",
      field: "seller",
      currentValue: "Maria Garcia",
      sagValue: null,
    });
    assert.equal(result.allowed, true);
    assert.equal(result.reason, "sag_authoritative");
  });

  it("cancelled order classified correctly for line status", () => {
    const status = classifyLineDataStatus({
      linesCount: 5,
      headerAmount: 1000,
      orderStatus: "cancelado", // lowercase
      sagLinesExist: true,
    });
    assert.equal(status, "CANCELLED");
  });
});
