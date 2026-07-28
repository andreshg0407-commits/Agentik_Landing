/**
 * lib/inventory/__tests__/sag-inventory-balance-types.test.ts
 *
 * AGENTIK-INVENTORY-SAG-VIEW-CERTIFICATION-AND-SHADOW-INTEGRATION-01
 *
 * Pure unit tests for all canonical inventory balance functions.
 * No DB, no SAG, no network. 100% deterministic.
 */

import { describe, it, expect } from "vitest";
import {
  parseViewBodega,
  mapViewRowToBalance,
  buildReferenceTotals,
  computeComparisonVerdict,
  type SagInventoryViewRow,
  type CanonicalWarehouseBalance,
} from "../sag-inventory-balance-types";
import {
  buildShadowComparison,
  type PilRecord,
} from "../sag-inventory-balance-adapter";

// ── Helpers ─────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<SagInventoryViewRow> = {}): SagInventoryViewRow {
  return {
    CODIGO_PRODUCTO: "L-1234",
    PRODUCTO: "PIJAMA NIÑA KIDS",
    LINEA: "LATIN KIDS",
    CATEGORIA: "LT NINA KIDS",
    MARCA: "LATIN KIDS",
    SUCURSAL: null,
    BODEGA: "01 - BODEGA PRINCIPAL",
    EXISTENCIA: 100,
    RESERVADO: 15,
    TRANSITO: null,
    DISPONIBLE: 85,
    COSTO_PROMEDIO: 12000,
    FECHA_ULTIMO_MOVIMIENTO: "2026-07-15",
    ...overrides,
  };
}

function makeBalance(overrides: Partial<CanonicalWarehouseBalance> = {}): CanonicalWarehouseBalance {
  return {
    referenceCode: "L-1234",
    warehouseCode: "01",
    warehousePk: "10",
    warehouseName: "BODEGA PRINCIPAL",
    existencia: 100,
    reservado: 15,
    disponible: 85,
    costoPromedio: 12000,
    lastMovementAt: new Date("2026-07-15"),
    productName: "PIJAMA NIÑA KIDS",
    line: "LATIN KIDS",
    category: "LT NINA KIDS",
    ...overrides,
  };
}

// ── parseViewBodega ─────────────────────────────────────────────────────

describe("parseViewBodega", () => {
  it("parses standard format", () => {
    expect(parseViewBodega("01 - BODEGA PRINCIPAL")).toEqual({
      code: "01",
      name: "BODEGA PRINCIPAL",
    });
  });

  it("parses two-digit code", () => {
    expect(parseViewBodega("24 - IMPORTACIÓN")).toEqual({
      code: "24",
      name: "IMPORTACIÓN",
    });
  });

  it("parses code with leading zero", () => {
    expect(parseViewBodega("00 - BODEGA CENTRO")).toEqual({
      code: "00",
      name: "BODEGA CENTRO",
    });
  });

  it("handles name with hyphens", () => {
    expect(parseViewBodega("31 - IMPO CONTENEDOR 2-1")).toEqual({
      code: "31",
      name: "IMPO CONTENEDOR 2-1",
    });
  });

  it("returns null for empty string", () => {
    expect(parseViewBodega("")).toBeNull();
  });

  it("returns null for missing separator", () => {
    expect(parseViewBodega("01 BODEGA PRINCIPAL")).toBeNull();
  });

  it("trims whitespace", () => {
    const result = parseViewBodega("  02  -  BODEGA SANDIEGO  ");
    expect(result?.code).toBe("02");
    expect(result?.name).toBe("BODEGA SANDIEGO");
  });
});

// ── mapViewRowToBalance ─────────────────────────────────────────────────

describe("mapViewRowToBalance", () => {
  const resolver = (code: string) => {
    const map: Record<string, string> = { "01": "10", "24": "33", "00": "31" };
    return map[code] ?? null;
  };

  it("maps all fields correctly", () => {
    const row = makeRow();
    const balance = mapViewRowToBalance(row, resolver);
    expect(balance).not.toBeNull();
    expect(balance!.referenceCode).toBe("L-1234");
    expect(balance!.warehouseCode).toBe("01");
    expect(balance!.warehousePk).toBe("10");
    expect(balance!.warehouseName).toBe("BODEGA PRINCIPAL");
    expect(balance!.existencia).toBe(100);
    expect(balance!.reservado).toBe(15);
    expect(balance!.disponible).toBe(85);
    expect(balance!.costoPromedio).toBe(12000);
    expect(balance!.lastMovementAt).toEqual(new Date("2026-07-15"));
    expect(balance!.productName).toBe("PIJAMA NIÑA KIDS");
    expect(balance!.line).toBe("LATIN KIDS");
    expect(balance!.category).toBe("LT NINA KIDS");
  });

  it("handles null fields", () => {
    const row = makeRow({
      PRODUCTO: null,
      LINEA: null,
      CATEGORIA: null,
      FECHA_ULTIMO_MOVIMIENTO: null,
    });
    const balance = mapViewRowToBalance(row, resolver);
    expect(balance!.productName).toBeNull();
    expect(balance!.line).toBeNull();
    expect(balance!.category).toBeNull();
    expect(balance!.lastMovementAt).toBeNull();
  });

  it("returns null for invalid BODEGA format", () => {
    const row = makeRow({ BODEGA: "INVALID" });
    expect(mapViewRowToBalance(row, resolver)).toBeNull();
  });

  it("resolves warehousePk to null for unknown code", () => {
    const row = makeRow({ BODEGA: "99 - UNKNOWN BODEGA" });
    const balance = mapViewRowToBalance(row, resolver);
    expect(balance!.warehousePk).toBeNull();
  });

  it("handles zero quantities", () => {
    const row = makeRow({ EXISTENCIA: 0, RESERVADO: 0, DISPONIBLE: 0 });
    const balance = mapViewRowToBalance(row, resolver);
    expect(balance!.existencia).toBe(0);
    expect(balance!.reservado).toBe(0);
    expect(balance!.disponible).toBe(0);
  });

  it("handles negative DISPONIBLE", () => {
    const row = makeRow({ EXISTENCIA: 5, RESERVADO: 10, DISPONIBLE: -5 });
    const balance = mapViewRowToBalance(row, resolver);
    expect(balance!.disponible).toBe(-5);
  });
});

// ── buildReferenceTotals ────────────────────────────────────────────────

describe("buildReferenceTotals", () => {
  it("groups by referenceCode", () => {
    const balances = [
      makeBalance({ referenceCode: "L-1234", warehouseCode: "01", existencia: 100, reservado: 10, disponible: 90 }),
      makeBalance({ referenceCode: "L-1234", warehouseCode: "24", existencia: 50, reservado: 5, disponible: 45 }),
      makeBalance({ referenceCode: "C-5678", warehouseCode: "01", existencia: 200, reservado: 0, disponible: 200 }),
    ];
    const totals = buildReferenceTotals(balances);
    expect(totals).toHaveLength(2);

    const l1234 = totals.find(t => t.referenceCode === "L-1234")!;
    expect(l1234.totalExistencia).toBe(150);
    expect(l1234.totalReservado).toBe(15);
    expect(l1234.totalDisponible).toBe(135);
    expect(l1234.warehouseCount).toBe(2);

    const c5678 = totals.find(t => t.referenceCode === "C-5678")!;
    expect(c5678.totalExistencia).toBe(200);
    expect(c5678.warehouseCount).toBe(1);
  });

  it("returns empty for empty input", () => {
    expect(buildReferenceTotals([])).toEqual([]);
  });

  it("preserves warehouse breakdown", () => {
    const balances = [
      makeBalance({ referenceCode: "X-1", warehouseCode: "01" }),
      makeBalance({ referenceCode: "X-1", warehouseCode: "02" }),
    ];
    const totals = buildReferenceTotals(balances);
    expect(totals[0].warehouses).toHaveLength(2);
  });
});

// ── computeComparisonVerdict ────────────────────────────────────────────

describe("computeComparisonVerdict", () => {
  it("returns MATCH for equal values", () => {
    expect(computeComparisonVerdict(100, 100)).toBe("MATCH");
  });

  it("returns MATCH within tolerance", () => {
    expect(computeComparisonVerdict(100, 100.005)).toBe("MATCH");
  });

  it("returns MISMATCH_QUANTITY for different values", () => {
    expect(computeComparisonVerdict(100, 50)).toBe("MISMATCH_QUANTITY");
  });

  it("returns VIEW_ONLY when PIL is zero", () => {
    expect(computeComparisonVerdict(100, 0)).toBe("VIEW_ONLY");
  });

  it("returns PIL_ONLY when view is zero", () => {
    expect(computeComparisonVerdict(0, 50)).toBe("PIL_ONLY");
  });

  it("returns BOTH_ZERO when both are zero", () => {
    expect(computeComparisonVerdict(0, 0)).toBe("BOTH_ZERO");
  });

  it("respects custom tolerance", () => {
    expect(computeComparisonVerdict(100, 101, 2)).toBe("MATCH");
    expect(computeComparisonVerdict(100, 103, 2)).toBe("MISMATCH_QUANTITY");
  });
});

// ── buildShadowComparison ───────────────────────────────────────────────

describe("buildShadowComparison", () => {
  const orgId = "org-test-123";

  it("builds comparison for matching records", () => {
    const viewBalances: CanonicalWarehouseBalance[] = [
      makeBalance({ referenceCode: "L-1", warehousePk: "10", existencia: 100, reservado: 10, disponible: 90 }),
    ];
    const pilRecords: PilRecord[] = [
      { referenceCode: "L-1", warehousePk: "10", positiveOnly: 100, net: 80 },
    ];
    const result = buildShadowComparison(viewBalances, pilRecords, orgId, "202607");
    expect(result.stats.totalRecords).toBe(1);
    expect(result.stats.matches).toBe(1);
    expect(result.records[0].verdict).toBe("MATCH");
    expect(result.records[0].diffExistencia).toBe(0);
    expect(result.viewPeriod).toBe("202607");
  });

  it("detects mismatches", () => {
    const viewBalances: CanonicalWarehouseBalance[] = [
      makeBalance({ referenceCode: "L-1", warehousePk: "10", existencia: 100 }),
    ];
    const pilRecords: PilRecord[] = [
      { referenceCode: "L-1", warehousePk: "10", positiveOnly: 50, net: 30 },
    ];
    const result = buildShadowComparison(viewBalances, pilRecords, orgId);
    expect(result.stats.mismatches).toBe(1);
    expect(result.records[0].diffExistencia).toBe(50);
  });

  it("detects VIEW_ONLY entries", () => {
    const viewBalances: CanonicalWarehouseBalance[] = [
      makeBalance({ referenceCode: "L-1", warehousePk: "10", existencia: 100 }),
    ];
    const result = buildShadowComparison(viewBalances, [], orgId);
    expect(result.stats.viewOnly).toBe(1);
  });

  it("detects PIL_ONLY entries", () => {
    const pilRecords: PilRecord[] = [
      { referenceCode: "L-1", warehousePk: "10", positiveOnly: 50, net: 50 },
    ];
    const result = buildShadowComparison([], pilRecords, orgId);
    expect(result.stats.pilOnly).toBe(1);
  });

  it("handles empty inputs", () => {
    const result = buildShadowComparison([], [], orgId);
    expect(result.stats.totalRecords).toBe(0);
  });

  it("skips view records without warehousePk", () => {
    const viewBalances: CanonicalWarehouseBalance[] = [
      makeBalance({ referenceCode: "L-1", warehousePk: null, existencia: 100 }),
    ];
    const result = buildShadowComparison(viewBalances, [], orgId);
    // warehousePk null means it won't be indexed
    expect(result.stats.totalRecords).toBe(0);
  });

  it("sets organizationId and computedAt", () => {
    const result = buildShadowComparison([], [], orgId);
    expect(result.organizationId).toBe(orgId);
    expect(result.computedAt).toBeTruthy();
  });
});
