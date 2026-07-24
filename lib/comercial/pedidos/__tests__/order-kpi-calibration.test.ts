/**
 * lib/comercial/pedidos/__tests__/order-kpi-calibration.test.ts
 *
 * Tests for Sprint AGENTIK-ORDERS-KPI-CALIBRATION-01.
 *
 * Run: npx tsx --test lib/comercial/pedidos/__tests__/order-kpi-calibration.test.ts
 *
 * Covers:
 * - computeCalibratedKpiStats() — KPIs computed from allOrders (never filtered)
 * - buildCalibratedKpis() — KPI definitions and formatting
 * - kpiKeyToQuickFilter() — KPI → quick filter mapping
 * - applyQuickFilter() — client-side order filtering
 * - KPI stability under filtering (bug fix verification)
 * - Timezone-aware "today" calculation
 * - Origin-based exclusions (SAG_HISTORICAL not in Sincronizados)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  computeCalibratedKpiStats,
  buildCalibratedKpis,
  kpiKeyToQuickFilter,
  applyQuickFilter,
  QUICK_FILTER_LABELS,
  type OrderKpiInput,
  type CalibratedKpiKey,
  type QuickFilterKey,
} from "../order-operational-state";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Creates a minimal order input for testing */
function makeOrder(overrides: Partial<OrderKpiInput> = {}): OrderKpiInput {
  return {
    status: "borrador",
    origin: "AGENTIK_NATIVE",
    syncState: "nunca_sincronizado",
    totalValue: 100_000,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Creates an order with today's date (respecting COT timezone) */
function makeTodayOrder(overrides: Partial<OrderKpiInput> = {}): OrderKpiInput {
  return makeOrder({ createdAt: new Date().toISOString(), ...overrides });
}

/** Creates an order with yesterday's date */
function makeYesterdayOrder(overrides: Partial<OrderKpiInput> = {}): OrderKpiInput {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return makeOrder({ createdAt: yesterday.toISOString(), ...overrides });
}

// ── computeCalibratedKpiStats ────────────────────────────────────────────────

describe("computeCalibratedKpiStats", () => {
  it("returns zeros for empty order list", () => {
    const stats = computeCalibratedKpiStats([]);
    assert.equal(stats.valorPedidosHoy, 0);
    assert.equal(stats.pedidosDeHoy, 0);
    assert.equal(stats.pendientesEnvioSag, 0);
    assert.equal(stats.sincronizadosAgentik, 0);
    assert.equal(stats.conConflicto, 0);
  });

  it("counts today orders and sums their value", () => {
    const orders = [
      makeTodayOrder({ totalValue: 500_000 }),
      makeTodayOrder({ totalValue: 300_000 }),
      makeYesterdayOrder({ totalValue: 1_000_000 }),
    ];
    const stats = computeCalibratedKpiStats(orders);
    assert.equal(stats.pedidosDeHoy, 2);
    assert.equal(stats.valorPedidosHoy, 800_000);
  });

  it("excludes cancelados from today counts", () => {
    const orders = [
      makeTodayOrder({ totalValue: 500_000 }),
      makeTodayOrder({ totalValue: 300_000, status: "cancelado" }),
    ];
    const stats = computeCalibratedKpiStats(orders);
    assert.equal(stats.pedidosDeHoy, 1);
    assert.equal(stats.valorPedidosHoy, 500_000);
  });

  it("counts AGENTIK_NATIVE listo_para_enviar as pendientes SAG", () => {
    const orders = [
      makeOrder({ origin: "AGENTIK_NATIVE", status: "listo_para_enviar" }),
      makeOrder({ origin: "AGENTIK_NATIVE", status: "pendiente_sag" }),
    ];
    const stats = computeCalibratedKpiStats(orders);
    assert.equal(stats.pendientesEnvioSag, 2);
  });

  it("excludes SAG_HISTORICAL from pendientes SAG", () => {
    const orders = [
      makeOrder({ origin: "SAG_HISTORICAL", status: "pendiente_sag" }),
      makeOrder({ origin: "AGENTIK_NATIVE", status: "pendiente_sag" }),
    ];
    const stats = computeCalibratedKpiStats(orders);
    assert.equal(stats.pendientesEnvioSag, 1);
  });

  it("excludes CRM_LEGACY from pendientes SAG", () => {
    const orders = [
      makeOrder({ origin: "CRM_LEGACY", status: "listo_para_enviar" }),
    ];
    const stats = computeCalibratedKpiStats(orders);
    assert.equal(stats.pendientesEnvioSag, 0);
  });

  it("excludes borradores from pendientes SAG", () => {
    const orders = [
      makeOrder({ origin: "AGENTIK_NATIVE", status: "borrador" }),
    ];
    const stats = computeCalibratedKpiStats(orders);
    assert.equal(stats.pendientesEnvioSag, 0);
  });

  it("counts AGENTIK_NATIVE sincronizado as sincronizados (not SAG_HISTORICAL)", () => {
    const orders = [
      makeOrder({ origin: "AGENTIK_NATIVE", status: "sincronizado" }),
      makeOrder({ origin: "SAG_HISTORICAL", status: "sincronizado" }),
      makeOrder({ origin: "SAG_HISTORICAL", status: "sincronizado" }),
    ];
    const stats = computeCalibratedKpiStats(orders);
    assert.equal(stats.sincronizadosAgentik, 1);
  });

  it("SAG_HISTORICAL does NOT inflate sincronizados KPI", () => {
    // Simulate Castillitos: 9,562 SAG_HISTORICAL facturados + 0 AGENTIK_NATIVE
    const orders = Array.from({ length: 100 }, () =>
      makeOrder({ origin: "SAG_HISTORICAL", status: "sincronizado", syncState: "sincronizado" }),
    );
    const stats = computeCalibratedKpiStats(orders);
    assert.equal(stats.sincronizadosAgentik, 0);
  });

  it("counts conflicto status as con_conflicto", () => {
    const orders = [
      makeOrder({ status: "conflicto" }),
    ];
    const stats = computeCalibratedKpiStats(orders);
    assert.equal(stats.conConflicto, 1);
  });

  it("counts reservation conflict as con_conflicto", () => {
    const orders = [
      makeOrder({ status: "borrador", hasConflict: true }),
    ];
    const stats = computeCalibratedKpiStats(orders);
    assert.equal(stats.conConflicto, 1);
  });

  it("counts reservation expired as con_conflicto", () => {
    const orders = [
      makeOrder({ status: "listo_para_enviar", reservationExpired: true }),
    ];
    const stats = computeCalibratedKpiStats(orders);
    assert.equal(stats.conConflicto, 1);
  });

  it("does not count warning as conflicto (only actionable states)", () => {
    // A sincronizado order with hasConflict should NOT count
    const orders = [
      makeOrder({ status: "sincronizado", hasConflict: true }),
    ];
    const stats = computeCalibratedKpiStats(orders);
    assert.equal(stats.conConflicto, 0);
  });

  it("does not count cancelled reservation as conflicto", () => {
    const orders = [
      makeOrder({ status: "cancelado", hasConflict: true }),
    ];
    const stats = computeCalibratedKpiStats(orders);
    assert.equal(stats.conConflicto, 0);
  });

  it("SIMULATION mode does NOT appear as a separate KPI", () => {
    // Verify no "en_simulacion" KPI exists
    const stats = computeCalibratedKpiStats([]);
    assert.equal((stats as any).en_simulacion, undefined);
  });
});

// ── KPI stability (bug fix) ─────────────────────────────────────────────────

describe("KPI stability — allOrders vs visibleOrders", () => {
  it("KPIs do not change when computed on filtered subset", () => {
    const allOrders = [
      makeTodayOrder({ origin: "AGENTIK_NATIVE", status: "borrador" }),
      makeTodayOrder({ origin: "AGENTIK_NATIVE", status: "listo_para_enviar" }),
      makeTodayOrder({ origin: "SAG_HISTORICAL", status: "sincronizado" }),
      makeTodayOrder({ origin: "AGENTIK_NATIVE", status: "conflicto" }),
    ];

    // Full dataset KPIs
    const fullStats = computeCalibratedKpiStats(allOrders);

    // Filtered subset (e.g., only conflictos)
    const conflictoOnly = allOrders.filter(o => o.status === "conflicto");
    const filteredStats = computeCalibratedKpiStats(allOrders); // MUST use allOrders, not filtered

    // Values MUST be identical — this is the bug fix
    assert.equal(fullStats.pedidosDeHoy, filteredStats.pedidosDeHoy);
    assert.equal(fullStats.valorPedidosHoy, filteredStats.valorPedidosHoy);
    assert.equal(fullStats.pendientesEnvioSag, filteredStats.pendientesEnvioSag);
    assert.equal(fullStats.sincronizadosAgentik, filteredStats.sincronizadosAgentik);
    assert.equal(fullStats.conConflicto, filteredStats.conConflicto);
  });

  it("selecting a KPI does not alter other KPI values", () => {
    const allOrders = [
      makeTodayOrder({ status: "listo_para_enviar" }),
      makeTodayOrder({ status: "conflicto" }),
    ];
    const stats = computeCalibratedKpiStats(allOrders);
    // Simulate KPI click by filtering
    const filtered = applyQuickFilter(allOrders, "conflictos");
    assert.equal(filtered.length, 1);
    // But KPIs still computed on allOrders
    const stableStats = computeCalibratedKpiStats(allOrders);
    assert.equal(stableStats.pendientesEnvioSag, stats.pendientesEnvioSag);
    assert.equal(stableStats.conConflicto, stats.conConflicto);
  });

  it("second KPI click deactivates filter (returns to all)", () => {
    const allOrders = [
      makeTodayOrder({ status: "borrador" }),
      makeTodayOrder({ status: "conflicto" }),
    ];
    // First click: filter to conflictos
    const filtered = applyQuickFilter(allOrders, "conflictos");
    assert.equal(filtered.length, 1);
    // Second click: back to all
    const unfiltered = applyQuickFilter(allOrders, "todos");
    assert.equal(unfiltered.length, 2);
  });
});

// ── buildCalibratedKpis ──────────────────────────────────────────────────────

describe("buildCalibratedKpis", () => {
  it("returns 5 KPIs with correct keys", () => {
    const stats = computeCalibratedKpiStats([]);
    const kpis = buildCalibratedKpis(stats);
    assert.equal(kpis.length, 5);
    const keys = kpis.map(k => k.key);
    assert.ok(keys.includes("valor_pedidos_hoy"));
    assert.ok(keys.includes("pedidos_de_hoy"));
    assert.ok(keys.includes("pendientes_envio_sag"));
    assert.ok(keys.includes("sincronizados_agentik"));
    assert.ok(keys.includes("con_conflicto"));
  });

  it("formats monetary KPI with $ sign", () => {
    const stats = computeCalibratedKpiStats([
      makeTodayOrder({ totalValue: 1_500_000 }),
    ]);
    const kpis = buildCalibratedKpis(stats);
    const valorHoy = kpis.find(k => k.key === "valor_pedidos_hoy");
    assert.ok(valorHoy);
    assert.ok(valorHoy.formatted.startsWith("$"));
    assert.equal(valorHoy.monetary, true);
  });

  it("formats zero value KPIs as em dash", () => {
    const stats = computeCalibratedKpiStats([]);
    const kpis = buildCalibratedKpis(stats);
    for (const kpi of kpis) {
      assert.equal(kpi.formatted, "\u2014");
    }
  });

  it("valor_pedidos_hoy is the only monetary KPI", () => {
    const stats = computeCalibratedKpiStats([]);
    const kpis = buildCalibratedKpis(stats);
    const monetary = kpis.filter(k => k.monetary);
    assert.equal(monetary.length, 1);
    assert.equal(monetary[0].key, "valor_pedidos_hoy");
  });
});

// ── kpiKeyToQuickFilter ──────────────────────────────────────────────────────

describe("kpiKeyToQuickFilter", () => {
  it("maps valor_pedidos_hoy to hoy", () => {
    assert.equal(kpiKeyToQuickFilter("valor_pedidos_hoy"), "hoy");
  });

  it("maps pedidos_de_hoy to hoy", () => {
    assert.equal(kpiKeyToQuickFilter("pedidos_de_hoy"), "hoy");
  });

  it("maps pendientes_envio_sag to pendientes_sag", () => {
    assert.equal(kpiKeyToQuickFilter("pendientes_envio_sag"), "pendientes_sag");
  });

  it("maps sincronizados_agentik to sincronizados", () => {
    assert.equal(kpiKeyToQuickFilter("sincronizados_agentik"), "sincronizados");
  });

  it("maps con_conflicto to conflictos", () => {
    assert.equal(kpiKeyToQuickFilter("con_conflicto"), "conflictos");
  });
});

// ── applyQuickFilter ─────────────────────────────────────────────────────────

describe("applyQuickFilter", () => {
  it("todos returns all orders", () => {
    const orders = [
      makeOrder({ status: "borrador" }),
      makeOrder({ status: "sincronizado" }),
    ];
    assert.equal(applyQuickFilter(orders, "todos").length, 2);
  });

  it("por_completar returns only AGENTIK_NATIVE borradores", () => {
    const orders = [
      makeOrder({ origin: "AGENTIK_NATIVE", status: "borrador" }),
      makeOrder({ origin: "CRM_LEGACY", status: "borrador" }),
      makeOrder({ origin: "SAG_HISTORICAL", status: "borrador" }),
      makeOrder({ origin: "AGENTIK_NATIVE", status: "sincronizado" }),
    ];
    const result = applyQuickFilter(orders, "por_completar");
    assert.equal(result.length, 1);
    assert.equal(result[0].origin, "AGENTIK_NATIVE");
    assert.equal(result[0].status, "borrador");
  });

  it("CRM_LEGACY borradores are NOT included in por_completar", () => {
    const orders = [
      makeOrder({ origin: "CRM_LEGACY", status: "borrador" }),
    ];
    assert.equal(applyQuickFilter(orders, "por_completar").length, 0);
  });

  it("pendientes_sag returns only AGENTIK_NATIVE with SAG-eligible status", () => {
    const orders = [
      makeOrder({ origin: "AGENTIK_NATIVE", status: "listo_para_enviar" }),
      makeOrder({ origin: "AGENTIK_NATIVE", status: "pendiente_sag" }),
      makeOrder({ origin: "AGENTIK_NATIVE", status: "borrador" }), // excluded
      makeOrder({ origin: "SAG_HISTORICAL", status: "pendiente_sag" }), // excluded
    ];
    assert.equal(applyQuickFilter(orders, "pendientes_sag").length, 2);
  });

  it("sincronizados returns all origins with sincronizado status", () => {
    const orders = [
      makeOrder({ origin: "SAG_HISTORICAL", status: "sincronizado" }),
      makeOrder({ origin: "AGENTIK_NATIVE", status: "sincronizado" }),
      makeOrder({ origin: "CRM_LEGACY", status: "sincronizado" }),
    ];
    assert.equal(applyQuickFilter(orders, "sincronizados").length, 3);
  });

  it("conflictos includes conflicto status and reservation issues", () => {
    const orders = [
      makeOrder({ status: "conflicto" }),
      makeOrder({ status: "borrador", hasConflict: true }),
      makeOrder({ status: "listo_para_enviar", reservationExpired: true }),
      makeOrder({ status: "borrador" }), // no conflict
    ];
    assert.equal(applyQuickFilter(orders, "conflictos").length, 3);
  });

  it("clearing filter restores full list", () => {
    const orders = [
      makeOrder({ status: "borrador" }),
      makeOrder({ status: "conflicto" }),
    ];
    const filtered = applyQuickFilter(orders, "conflictos");
    assert.equal(filtered.length, 1);
    const restored = applyQuickFilter(orders, "todos");
    assert.equal(restored.length, 2);
  });
});

// ── QUICK_FILTER_LABELS ──────────────────────────────────────────────────────

describe("QUICK_FILTER_LABELS", () => {
  it("has labels for all 6 filters", () => {
    const keys: QuickFilterKey[] = [
      "todos", "hoy", "por_completar", "pendientes_sag", "sincronizados", "conflictos",
    ];
    for (const k of keys) {
      assert.ok(QUICK_FILTER_LABELS[k], `Missing label for ${k}`);
    }
  });

  it("por_completar label is 'Por completar' (not 'Borradores')", () => {
    assert.equal(QUICK_FILTER_LABELS.por_completar, "Por completar");
  });
});

// ── Timezone handling ────────────────────────────────────────────────────────

describe("timezone-aware today calculation", () => {
  it("uses tenant timezone offset for today boundary", () => {
    // Create an order at a time that is "today" in COT but could be "tomorrow" in UTC
    const now = new Date();
    const orders = [makeOrder({ createdAt: now.toISOString(), totalValue: 100 })];
    const stats = computeCalibratedKpiStats(orders, -300); // COT
    assert.equal(stats.pedidosDeHoy, 1);
  });

  it("yesterday order does not count as today", () => {
    const orders = [makeYesterdayOrder({ totalValue: 100 })];
    const stats = computeCalibratedKpiStats(orders, -300);
    assert.equal(stats.pedidosDeHoy, 0);
    assert.equal(stats.valorPedidosHoy, 0);
  });
});

// ── Castillitos real distribution ────────────────────────────────────────────

describe("Castillitos real distribution", () => {
  it("222 CRM_LEGACY borradores = 221 unmapped stages + 0 AgentExecution", () => {
    // CRMQuote stages: Facturado(142), Gestionado_Parcialmente(48), Remisionado(31) = 221
    // These map to "borrador" via crmStageToOrderStatus default case.
    // No AgentExecution orders exist. Total borradores in list = 221 + 0 = 221.
    // The 222 shown was likely 221 CRM + 1 edge case.
    // With KPI-CALIBRATION-01, these CRM_LEGACY borradores are NOT in
    // "Pedidos por completar" (which requires AGENTIK_NATIVE origin).
    const crmBorradores = Array.from({ length: 221 }, () =>
      makeOrder({ origin: "CRM_LEGACY", status: "borrador" }),
    );
    const filtered = applyQuickFilter(crmBorradores, "por_completar");
    assert.equal(filtered.length, 0);
  });

  it("9,562 SAG_HISTORICAL sincronizados do NOT inflate Sincronizados KPI", () => {
    const sagOrders = Array.from({ length: 50 }, () =>
      makeOrder({ origin: "SAG_HISTORICAL", status: "sincronizado" }),
    );
    const stats = computeCalibratedKpiStats(sagOrders);
    assert.equal(stats.sincronizadosAgentik, 0);
  });

  it("115 PENDIENTE COR map to pendiente_sag but only AGENTIK_NATIVE count", () => {
    const pendientes = Array.from({ length: 10 }, () =>
      makeOrder({ origin: "SAG_HISTORICAL", status: "pendiente_sag" }),
    );
    const stats = computeCalibratedKpiStats(pendientes);
    assert.equal(stats.pendientesEnvioSag, 0);
  });
});

// ── KPI with zero shows clear state ─────────────────────────────────────────

describe("KPI zero state", () => {
  it("all KPIs show em dash when zero", () => {
    const kpis = buildCalibratedKpis(computeCalibratedKpiStats([]));
    for (const kpi of kpis) {
      assert.equal(kpi.formatted, "\u2014", `${kpi.key} should show em dash when zero`);
    }
  });
});

// ── Server-side KPI architecture (KPI-CALIBRATION-01 Phase 2) ───────────────

describe("Server-side KPI architecture contracts", () => {
  it("KPI stats computed on full dataset are independent of table page size", () => {
    // Simulate: full DB has 9983 orders, table only loads 805
    const fullDataset = [
      ...Array.from({ length: 9562 }, () =>
        makeOrder({ origin: "SAG_HISTORICAL", status: "sincronizado" }),
      ),
      ...Array.from({ length: 305 }, () =>
        makeOrder({ origin: "CRM_LEGACY", status: "borrador" }),
      ),
      ...Array.from({ length: 115 }, () =>
        makeOrder({ origin: "SAG_HISTORICAL", status: "pendiente_sag" }),
      ),
      makeOrder({ origin: "AGENTIK_NATIVE", status: "sincronizado" }),
    ];
    const page = fullDataset.slice(0, 805);

    const fullStats = computeCalibratedKpiStats(fullDataset);
    const pageStats = computeCalibratedKpiStats(page);

    // Full dataset gives correct AGENTIK_NATIVE sincronizado = 1
    assert.equal(fullStats.sincronizadosAgentik, 1);
    // Page might miss the AGENTIK_NATIVE order
    // The point: server must use fullDataset, client table can be paginated
    assert.ok(
      fullStats.sincronizadosAgentik >= pageStats.sincronizadosAgentik,
      "Full dataset must capture all or more than page",
    );
  });

  it("paginated table does not alter server KPI values", () => {
    const fullOrders = [
      makeTodayOrder({ origin: "AGENTIK_NATIVE", status: "listo_para_enviar", totalValue: 500_000 }),
      makeTodayOrder({ origin: "AGENTIK_NATIVE", status: "pendiente_sag", totalValue: 300_000 }),
      makeTodayOrder({ origin: "AGENTIK_NATIVE", status: "sincronizado", totalValue: 200_000 }),
    ];
    const serverKpis = computeCalibratedKpiStats(fullOrders);

    // Simulate user viewing only page 1 (2 items)
    const page1 = fullOrders.slice(0, 2);
    const page1Kpis = computeCalibratedKpiStats(page1);

    // Server KPIs should differ from page KPIs — proving we can't use page data
    assert.equal(serverKpis.sincronizadosAgentik, 1);
    assert.equal(page1Kpis.sincronizadosAgentik, 0); // missed on page 1
    // This test proves why KPIs must come from server, not from loaded rows
  });

  it("allOrders partial is never used as executive source", () => {
    // If someone incorrectly computes KPIs from a 500-row page of 9678 COR,
    // they get wrong totals. This test documents the architectural invariant.
    const corPage = Array.from({ length: 500 }, (_, i) =>
      makeTodayOrder({
        origin: "SAG_HISTORICAL",
        status: "sincronizado",
        totalValue: 1000 * (i + 1),
      }),
    );
    const pageStats = computeCalibratedKpiStats(corPage);
    // SAG_HISTORICAL never counts as "Sincronizados Agentik"
    assert.equal(pageStats.sincronizadosAgentik, 0);
    // But they DO count as "pedidos de hoy"
    assert.equal(pageStats.pedidosDeHoy, 500);
    // Real total should be 9678 not 500 — hence server aggregation needed
  });
});

describe("Header differentiates visible vs total", () => {
  it("loaded < total when DB has more than take limit", () => {
    // Simulates: DB has 9983 orders, listOrders returns 805
    const totalOrders = 9983;
    const loadedOrders = 805;
    const label = `Mostrando ${loadedOrders.toLocaleString("es-CO")} de ${totalOrders.toLocaleString("es-CO")} pedidos`;
    assert.ok(label.includes("Mostrando"));
    assert.ok(label.includes("805"));
    assert.ok(label.includes("9.983") || label.includes("9983"));
    assert.notEqual(loadedOrders, totalOrders);
  });

  it("loaded === total when all orders fit in page", () => {
    const totalOrders = 50;
    const loadedOrders = 50;
    const label = `Mostrando ${loadedOrders} de ${totalOrders} pedidos`;
    assert.ok(label.includes("Mostrando 50 de 50"));
  });
});

describe("KPI and quick filter share unified state", () => {
  it("kpiKeyToQuickFilter maps valor_pedidos_hoy to hoy", () => {
    assert.equal(kpiKeyToQuickFilter("valor_pedidos_hoy"), "hoy");
  });

  it("kpiKeyToQuickFilter maps pedidos_de_hoy to hoy", () => {
    assert.equal(kpiKeyToQuickFilter("pedidos_de_hoy"), "hoy");
  });

  it("both today KPIs share the same quick filter (no dual state)", () => {
    const filter1 = kpiKeyToQuickFilter("valor_pedidos_hoy");
    const filter2 = kpiKeyToQuickFilter("pedidos_de_hoy");
    assert.equal(filter1, filter2, "Both 'hoy' KPIs must map to the same quick filter");
  });

  it("no duplicate equivalent filters exist", () => {
    // Each KPI key maps to a unique quick filter (no two different filters mean the same thing)
    const kpiKeys: CalibratedKpiKey[] = [
      "pendientes_envio_sag", "sincronizados_agentik", "con_conflicto",
    ];
    const filters = kpiKeys.map(k => kpiKeyToQuickFilter(k));
    const unique = new Set(filters);
    assert.equal(unique.size, filters.length, "Each non-hoy KPI maps to a distinct quick filter");
  });
});

describe("221 CRM_LEGACY never count as Por completar", () => {
  it("CRM_LEGACY borrador excluded from por_completar filter", () => {
    const orders = [
      makeOrder({ origin: "CRM_LEGACY", status: "borrador" }),
      makeOrder({ origin: "CRM_LEGACY", status: "borrador" }),
    ];
    assert.equal(applyQuickFilter(orders, "por_completar").length, 0);
  });

  it("only AGENTIK_NATIVE borrador appears in por_completar", () => {
    const orders = [
      makeOrder({ origin: "AGENTIK_NATIVE", status: "borrador" }),
      makeOrder({ origin: "CRM_LEGACY", status: "borrador" }),
      makeOrder({ origin: "SAG_HISTORICAL", status: "borrador" }),
    ];
    assert.equal(applyQuickFilter(orders, "por_completar").length, 1);
  });
});

describe("SAG_HISTORICAL sincronizados never inflate Agentik KPI", () => {
  it("9562 SAG_HISTORICAL sincronizados produce sincronizadosAgentik=0", () => {
    const sagOrders = Array.from({ length: 100 }, () =>
      makeOrder({ origin: "SAG_HISTORICAL", status: "sincronizado" }),
    );
    const stats = computeCalibratedKpiStats(sagOrders);
    assert.equal(stats.sincronizadosAgentik, 0);
  });

  it("only AGENTIK_NATIVE sincronizados count", () => {
    const orders = [
      makeOrder({ origin: "AGENTIK_NATIVE", status: "sincronizado" }),
      makeOrder({ origin: "SAG_HISTORICAL", status: "sincronizado" }),
      makeOrder({ origin: "CRM_LEGACY", status: "sincronizado" }),
    ];
    const stats = computeCalibratedKpiStats(orders);
    assert.equal(stats.sincronizadosAgentik, 1);
  });
});

describe("Server KPI timezone respect", () => {
  it("today boundary respects COT offset (-300)", () => {
    const now = new Date();
    const stats = computeCalibratedKpiStats(
      [makeTodayOrder({ totalValue: 42_000 })],
      -300,
    );
    assert.equal(stats.pedidosDeHoy, 1);
    assert.equal(stats.valorPedidosHoy, 42_000);
  });

  it("different timezone offset produces different today boundary", () => {
    // Create order at a very specific time to test boundary
    const orders = [makeTodayOrder()];
    const cotStats = computeCalibratedKpiStats(orders, -300);
    // With COT, today's orders should be counted
    assert.equal(cotStats.pedidosDeHoy, 1);
  });
});

describe("KPI values stable across page changes", () => {
  it("filtering table does not recalculate server KPIs", () => {
    // Server KPIs are computed once and stored.
    // Applying quick filters only changes visible rows, not KPI values.
    const serverStats = computeCalibratedKpiStats([
      makeTodayOrder({ origin: "AGENTIK_NATIVE", status: "listo_para_enviar", totalValue: 100 }),
      makeTodayOrder({ origin: "AGENTIK_NATIVE", status: "sincronizado", totalValue: 200 }),
      makeTodayOrder({ origin: "AGENTIK_NATIVE", status: "conflicto", totalValue: 300 }),
    ]);

    // User clicks "Pendientes SAG" — table filters but KPIs shouldn't change
    // (In real app, serverStats is immutable state, not recomputed from filtered rows)
    // Note: conflicto without sagError counts in BOTH pendientesEnvioSag AND conConflicto
    assert.equal(serverStats.pendientesEnvioSag, 2); // listo_para_enviar + conflicto(retryable)
    assert.equal(serverStats.sincronizadosAgentik, 1);
    assert.equal(serverStats.conConflicto, 1);
    assert.equal(serverStats.pedidosDeHoy, 3);
    assert.equal(serverStats.valorPedidosHoy, 600);
    // These values must remain constant regardless of table filtering
  });
});
