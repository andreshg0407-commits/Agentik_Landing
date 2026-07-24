/**
 * lib/comercial/pedidos/__tests__/order-operations-refinement.test.ts
 *
 * Tests for Sprint AGENTIK-ORDERS-OPERATIONS-REFINEMENT-01.
 *
 * Run: npx tsx --test lib/comercial/pedidos/__tests__/order-operations-refinement.test.ts
 *
 * Covers:
 * - resolveOperationalState() — composite state derivation
 * - resolveSellerDisplayText() — origin-aware seller display
 * - computeOperationalStats() — KPI computation
 * - buildOperationalKpis() — KPI definitions
 * - kpiKeyToStatusFilter() — KPI -> status mapping
 * - emptyOrderExplanation() — EMPTY_CONFIRMED display
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  resolveOperationalState,
  resolveSellerDisplayText,
  computeOperationalStats,
  buildOperationalKpis,
  kpiKeyToStatusFilter,
  emptyOrderExplanation,
  OPERATIONAL_STATE_LABEL,
  OPERATIONAL_STATE_COLOR,
  type OperationalStateInput,
} from "../order-operational-state";

// ── resolveOperationalState ────────────────────────────────────────────────

describe("resolveOperationalState", () => {
  const base: OperationalStateInput = {
    status: "borrador",
    origin: "AGENTIK_NATIVE",
    syncState: "nunca_sincronizado",
    sagOrderId: null,
    sagError: null,
    fulfillmentStatus: "sin_factura",
  };

  it("returns borrador for draft orders", () => {
    assert.equal(resolveOperationalState(base), "borrador");
  });

  it("returns cancelado for cancelled orders (terminal)", () => {
    assert.equal(resolveOperationalState({ ...base, status: "cancelado" }), "cancelado");
  });

  it("returns rechazado for conflicto with SAG error", () => {
    assert.equal(resolveOperationalState({
      ...base, status: "conflicto", sagError: "XML validation failed",
    }), "rechazado");
  });

  it("returns conflicto_inventario for conflicto without SAG error", () => {
    assert.equal(resolveOperationalState({ ...base, status: "conflicto" }), "conflicto_inventario");
  });

  it("returns reserva_expirada when reservation expired", () => {
    assert.equal(resolveOperationalState({
      ...base, status: "borrador", reservationExpired: true,
    }), "reserva_expirada");
  });

  it("does NOT return reserva_expirada for sincronizado orders", () => {
    assert.equal(resolveOperationalState({
      ...base, status: "sincronizado", syncState: "sincronizado",
      reservationExpired: true,
    }), "sincronizado");
  });

  it("returns conflicto_inventario when hasConflict and not synced", () => {
    assert.equal(resolveOperationalState({
      ...base, status: "borrador", hasConflict: true,
    }), "conflicto_inventario");
  });

  it("returns sincronizado for synced orders without fulfillment", () => {
    assert.equal(resolveOperationalState({
      ...base, status: "sincronizado", syncState: "sincronizado",
    }), "sincronizado");
  });

  it("returns facturado for synced orders with facturado_completo", () => {
    assert.equal(resolveOperationalState({
      ...base, status: "sincronizado", syncState: "sincronizado",
      fulfillmentStatus: "facturado_completo",
    }), "facturado");
  });

  it("returns facturado for synced orders with facturado_parcial", () => {
    assert.equal(resolveOperationalState({
      ...base, status: "sincronizado", syncState: "sincronizado",
      fulfillmentStatus: "facturado_parcial",
    }), "facturado");
  });

  it("returns despachado for SAG historical dispatched orders", () => {
    assert.equal(resolveOperationalState({
      ...base, status: "sincronizado", syncState: "sincronizado",
      origin: "SAG_HISTORICAL", fulfillmentStatus: "despachado",
    }), "despachado");
  });

  it("returns en_simulacion for pending_sag in SIMULATION mode", () => {
    assert.equal(resolveOperationalState({
      ...base, status: "pendiente_sag", sagWriteMode: "SIMULATION",
    }), "en_simulacion");
  });

  it("returns enviando for pending_sag with sagOrderId", () => {
    assert.equal(resolveOperationalState({
      ...base, status: "pendiente_sag", sagOrderId: "SAG-123",
    }), "enviando");
  });

  it("returns en_cola for pending_sag without sagOrderId", () => {
    assert.equal(resolveOperationalState({ ...base, status: "pendiente_sag" }), "en_cola");
  });

  it("returns listo_para_sag for listo_para_enviar", () => {
    assert.equal(resolveOperationalState({ ...base, status: "listo_para_enviar" }), "listo_para_sag");
  });

  it("returns reservado for draft with active reservation", () => {
    assert.equal(resolveOperationalState({
      ...base, status: "borrador", hasReservation: true,
    }), "reservado");
  });

  it("cancelado takes priority over reservation expired", () => {
    assert.equal(resolveOperationalState({
      ...base, status: "cancelado", reservationExpired: true,
    }), "cancelado");
  });
});

// ── resolveSellerDisplayText ───────────────────────────────────────────────

describe("resolveSellerDisplayText", () => {
  it("returns SAG-confirmed seller for SAG_HISTORICAL with high confidence", () => {
    const result = resolveSellerDisplayText(
      "SAG_HISTORICAL", "Juan Perez", "sag_movimientos", "high",
    );
    assert.equal(result.text, "Juan Perez");
    assert.equal(result.secondary, null);
    assert.equal(result.status, "SAG_CONFIRMED");
  });

  it("returns CRM-inferred seller with 'Inferido' secondary", () => {
    const result = resolveSellerDisplayText(
      "SAG_HISTORICAL", "Maria Lopez", "crm_quote_history", "medium",
    );
    assert.equal(result.text, "Maria Lopez");
    assert.equal(result.secondary, "Inferido");
    assert.equal(result.status, "CRM_INFERRED");
  });

  it("returns 'No informado por SAG' for SAG_HISTORICAL without seller", () => {
    const result = resolveSellerDisplayText("SAG_HISTORICAL", null, null, null);
    assert.equal(result.text, "No informado por SAG");
    assert.equal(result.status, "UNAVAILABLE");
  });

  it("returns 'Sin vendedor asignado' for AGENTIK_NATIVE without seller", () => {
    const result = resolveSellerDisplayText("AGENTIK_NATIVE", null, null, null);
    assert.equal(result.text, "Sin vendedor asignado");
    assert.equal(result.status, "UNAVAILABLE");
  });

  it("returns 'Sin vendedor asignado' for legacy agentik origin", () => {
    const result = resolveSellerDisplayText("agentik", "", null, null);
    assert.equal(result.text, "Sin vendedor asignado");
    assert.equal(result.status, "UNAVAILABLE");
  });

  it("returns seller name for sag_customer_order with name", () => {
    const result = resolveSellerDisplayText("sag_customer_order", "Carlos", "sag_movimientos", "high");
    assert.equal(result.text, "Carlos");
    assert.equal(result.status, "SAG_CONFIRMED");
  });
});

// ── computeOperationalStats ────────────────────────────────────────────────

describe("computeOperationalStats", () => {
  const orders = [
    { status: "borrador" as const, origin: "AGENTIK_NATIVE" as const },
    { status: "borrador" as const, origin: "AGENTIK_NATIVE" as const },
    { status: "listo_para_enviar" as const, origin: "AGENTIK_NATIVE" as const },
    { status: "pendiente_sag" as const, origin: "AGENTIK_NATIVE" as const },
    { status: "sincronizado" as const, origin: "SAG_HISTORICAL" as const },
    { status: "sincronizado" as const, origin: "SAG_HISTORICAL" as const },
    { status: "sincronizado" as const, origin: "SAG_HISTORICAL" as const },
    { status: "conflicto" as const, origin: "AGENTIK_NATIVE" as const },
    { status: "cancelado" as const, origin: "SAG_HISTORICAL" as const },
  ];

  it("computes correct counts", () => {
    const stats = computeOperationalStats(orders);
    assert.equal(stats.borradores, 2);
    assert.equal(stats.listos_para_sag, 1);
    assert.equal(stats.en_simulacion, 1);
    assert.equal(stats.sincronizados, 3);
    assert.equal(stats.con_conflicto, 1);
    assert.equal(stats.total, 9);
  });

  it("returns zeros for empty array", () => {
    const stats = computeOperationalStats([]);
    assert.equal(stats.total, 0);
    assert.equal(stats.borradores, 0);
  });
});

// ── buildOperationalKpis ───────────────────────────────────────────────────

describe("buildOperationalKpis", () => {
  it("returns 5 KPIs with correct keys", () => {
    const stats = {
      borradores: 2, listos_para_sag: 1, en_simulacion: 0,
      sincronizados: 10, con_conflicto: 0, total: 13,
    };
    const kpis = buildOperationalKpis(stats);
    assert.equal(kpis.length, 5);
    assert.deepEqual(kpis.map(k => k.key), [
      "borradores", "listos_para_sag", "en_simulacion", "sincronizados", "con_conflicto",
    ]);
    assert.equal(kpis[0].count, 2);
    assert.equal(kpis[3].count, 10);
  });
});

// ── kpiKeyToStatusFilter ───────────────────────────────────────────────────

describe("kpiKeyToStatusFilter", () => {
  it("maps borradores to borrador", () => {
    assert.equal(kpiKeyToStatusFilter("borradores"), "borrador");
  });

  it("maps listos_para_sag to listo_para_enviar", () => {
    assert.equal(kpiKeyToStatusFilter("listos_para_sag"), "listo_para_enviar");
  });

  it("maps en_simulacion to pendiente_sag", () => {
    assert.equal(kpiKeyToStatusFilter("en_simulacion"), "pendiente_sag");
  });

  it("maps sincronizados to sincronizado", () => {
    assert.equal(kpiKeyToStatusFilter("sincronizados"), "sincronizado");
  });

  it("maps con_conflicto to conflicto", () => {
    assert.equal(kpiKeyToStatusFilter("con_conflicto"), "conflicto");
  });
});

// ── emptyOrderExplanation ──────────────────────────────────────────────────

describe("emptyOrderExplanation", () => {
  it("returns null for orders with lines", () => {
    assert.equal(emptyOrderExplanation(5, "SAG_HISTORICAL", "sincronizado"), null);
  });

  it("returns null for non-historical orders with no lines", () => {
    assert.equal(emptyOrderExplanation(0, "AGENTIK_NATIVE", "borrador"), null);
  });

  it("returns cancelled explanation for SAG_HISTORICAL cancelled", () => {
    const result = emptyOrderExplanation(0, "SAG_HISTORICAL", "cancelado");
    assert.ok(result !== null);
    assert.ok(result.toLowerCase().includes("cancelado"));
  });

  it("returns historical explanation for SAG_HISTORICAL with no lines", () => {
    const result = emptyOrderExplanation(0, "SAG_HISTORICAL", "sincronizado");
    assert.ok(result !== null);
    assert.ok(result.toLowerCase().includes("historico"));
  });

  it("returns historical explanation for sag_customer_order with no lines", () => {
    const result = emptyOrderExplanation(0, "sag_customer_order", "sincronizado");
    assert.ok(result !== null);
    assert.ok(result.toLowerCase().includes("historico"));
  });
});

// ── OPERATIONAL_STATE_LABEL / OPERATIONAL_STATE_COLOR ───────────────────────

describe("OPERATIONAL_STATE_LABEL", () => {
  it("has a label for every state", () => {
    const states = [
      "borrador", "sin_reserva", "reservado", "conflicto_inventario",
      "reserva_expirada", "listo_para_sag", "en_simulacion", "en_cola",
      "enviando", "sincronizado", "rechazado", "cancelado",
      "facturado", "despachado",
    ] as const;
    for (const s of states) {
      assert.ok(OPERATIONAL_STATE_LABEL[s], `Missing label for ${s}`);
      assert.ok(OPERATIONAL_STATE_COLOR[s], `Missing color for ${s}`);
      assert.ok(OPERATIONAL_STATE_COLOR[s].bg, `Missing bg for ${s}`);
      assert.ok(OPERATIONAL_STATE_COLOR[s].text, `Missing text for ${s}`);
    }
  });
});

// ── Extended coverage (OPERATIONS-REFINEMENT-01 validation) ─────────────────

describe("resolveOperationalState — edge cases", () => {
  const base: OperationalStateInput = {
    status: "borrador",
    origin: "AGENTIK_NATIVE",
    syncState: "nunca_sincronizado",
    sagOrderId: null,
    sagError: null,
    fulfillmentStatus: "sin_factura",
  };

  it("borrador without reservation returns borrador (not sin_reserva)", () => {
    assert.equal(resolveOperationalState({ ...base, status: "borrador" }), "borrador");
  });

  it("facturado_con_diferencias maps to sincronizado (not facturado)", () => {
    assert.equal(resolveOperationalState({
      ...base, status: "sincronizado", syncState: "sincronizado",
      fulfillmentStatus: "facturado_con_diferencias",
    }), "sincronizado");
  });

  it("pendiente_sag with LIVE mode and no sagOrderId returns en_cola", () => {
    assert.equal(resolveOperationalState({
      ...base, status: "pendiente_sag", sagWriteMode: "LIVE",
    }), "en_cola");
  });

  it("pendiente_sag with LIVE mode and sagOrderId returns enviando", () => {
    assert.equal(resolveOperationalState({
      ...base, status: "pendiente_sag", sagWriteMode: "LIVE", sagOrderId: "SAG-456",
    }), "enviando");
  });

  it("conflicto with sagError takes priority over hasConflict", () => {
    assert.equal(resolveOperationalState({
      ...base, status: "conflicto", sagError: "timeout", hasConflict: true,
    }), "rechazado");
  });

  it("listo_para_enviar + hasReservation returns listo_para_sag (not reservado)", () => {
    assert.equal(resolveOperationalState({
      ...base, status: "listo_para_enviar", hasReservation: true,
    }), "listo_para_sag");
  });
});

describe("resolveSellerDisplayText — edge cases", () => {
  it("empty string seller name treated as unavailable for AGENTIK_NATIVE", () => {
    const result = resolveSellerDisplayText("AGENTIK_NATIVE", "", null, null);
    assert.equal(result.text, "Sin vendedor asignado");
    assert.equal(result.status, "UNAVAILABLE");
  });

  it("whitespace-only seller name treated as unavailable", () => {
    const result = resolveSellerDisplayText("SAG_HISTORICAL", "   ", null, null);
    assert.equal(result.text, "No informado por SAG");
    assert.equal(result.status, "UNAVAILABLE");
  });

  it("CRM_LEGACY origin without seller returns SAG-style unavailable text", () => {
    const result = resolveSellerDisplayText("CRM_LEGACY", null, null, null);
    assert.equal(result.text, "No informado por SAG");
    assert.equal(result.status, "UNAVAILABLE");
  });
});

describe("computeOperationalStats — Castillitos real distribution", () => {
  it("maps FACTURADO->sincronizado, PENDIENTE->pendiente_sag, CANCELADO->cancelado correctly", () => {
    const mapped = [
      ...Array(9562).fill({ status: "sincronizado" as const, origin: "SAG_HISTORICAL" as const }),
      ...Array(115).fill({ status: "pendiente_sag" as const, origin: "SAG_HISTORICAL" as const }),
      { status: "cancelado" as const, origin: "SAG_HISTORICAL" as const },
    ];
    const stats = computeOperationalStats(mapped);
    assert.equal(stats.sincronizados, 9562);
    assert.equal(stats.en_simulacion, 115);
    assert.equal(stats.con_conflicto, 0);
    assert.equal(stats.borradores, 0);
    assert.equal(stats.listos_para_sag, 0);
    assert.equal(stats.total, 9678);
  });
});

describe("kpiKeyToStatusFilter — exhaustive", () => {
  it("returns null for unknown key", () => {
    assert.equal(kpiKeyToStatusFilter("unknown" as any), null);
  });

  it("all 5 keys map to valid OrderStatus values", () => {
    const keys = [
      "borradores", "listos_para_sag", "en_simulacion", "sincronizados", "con_conflicto",
    ] as const;
    const validStatuses = ["borrador", "listo_para_enviar", "pendiente_sag", "sincronizado", "conflicto"];
    for (const k of keys) {
      const result = kpiKeyToStatusFilter(k);
      assert.ok(result !== null, `${k} should not map to null`);
      assert.ok(validStatuses.includes(result!), `${k} mapped to invalid status: ${result}`);
    }
  });
});

describe("emptyOrderExplanation — edge cases", () => {
  it("returns null for AGENTIK_NATIVE with no lines (not historical)", () => {
    assert.equal(emptyOrderExplanation(0, "AGENTIK_NATIVE", "sincronizado"), null);
  });

  it("returns null for CRM_LEGACY with no lines (not historical)", () => {
    assert.equal(emptyOrderExplanation(0, "CRM_LEGACY", "sincronizado"), null);
  });

  it("cancelled SAG historical contains 'cancelado'", () => {
    const result = emptyOrderExplanation(0, "SAG_HISTORICAL", "cancelado");
    assert.ok(result !== null);
    assert.ok(result!.toLowerCase().includes("cancelado"));
  });

  it("non-cancelled SAG historical contains 'historico'", () => {
    const result = emptyOrderExplanation(0, "sag_customer_order", "sincronizado");
    assert.ok(result !== null);
    assert.ok(result!.toLowerCase().includes("historico"));
  });
});
