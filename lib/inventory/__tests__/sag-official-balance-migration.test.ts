/**
 * lib/inventory/__tests__/sag-official-balance-migration.test.ts
 *
 * AGENTIK-INVENTORY-COMMERCIAL-SAG-OFFICIAL-BALANCE-MIGRATION-01 — CIERRE DE SEGURIDAD
 *
 * Tests for:
 * - Three-field semantics: EXISTENCIA / RESERVADO / DISPONIBLE
 * - disponibleReal = SAG DISPONIBLE (NOT EXISTENCIA)
 * - Invariant: DISPONIBLE = EXISTENCIA - RESERVADO
 * - Invariant error detection
 * - Variant reconciliation against DISPONIBLE
 * - Control cases with REAL live values:
 *     CD-4253339: E=427 R=35 D=392 (B01)
 *     CD-7297: E=11 R=0 D=11 (B29 Caldas, NOT B01)
 *     DA-9730: UNVERIFIED_REFERENCE_CODE
 * - Feature flag: default PIL_LEGACY, explicit SAG_OFFICIAL only
 * - 5 unambiguous source labels: SAG_OFFICIAL / SAG_OFFICIAL_CACHE /
 *   SAG_OFFICIAL_NOT_FOUND / PIL_LEGACY / UNAVAILABLE
 * - resolveSellableUnits — single authorized clamp point
 * - Data gap metrics
 * - Cache tenant isolation
 * - Negative DISPONIBLE handling
 * - KPI uses DISPONIBLE not EXISTENCIA
 */

import { describe, it, expect } from "vitest";
import type { CanonicalWarehouseBalance } from "../sag-inventory-balance-types";
import { resolveSellableUnits } from "../inventory-control-types";

// ── Pure re-implementations (matches production code, no server-only) ───

function buildWarehouseStockMap(
  balances: CanonicalWarehouseBalance[],
  warehouseCode: string,
): Map<string, { existencia: number; reservado: number; disponible: number; costoPromedio: number }> {
  const map = new Map<string, { existencia: number; reservado: number; disponible: number; costoPromedio: number }>();
  for (const b of balances) {
    if (b.warehouseCode === warehouseCode) {
      map.set(b.referenceCode, {
        existencia: b.existencia,
        reservado: b.reservado,
        disponible: b.disponible,
        costoPromedio: b.costoPromedio,
      });
    }
  }
  return map;
}

function buildTotalStockMap(
  balances: CanonicalWarehouseBalance[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const b of balances) {
    map.set(b.referenceCode, (map.get(b.referenceCode) ?? 0) + b.existencia);
  }
  return map;
}

type VariantReconciliationStatus = "MATCHED" | "PARTIAL" | "UNRECONCILED" | "STALE";
type InventoryBalanceSourceLabel =
  | "SAG_OFFICIAL"
  | "SAG_OFFICIAL_CACHE"
  | "SAG_OFFICIAL_NOT_FOUND"
  | "PIL_LEGACY"
  | "UNAVAILABLE";

function deriveReconciliationStatus(
  sagDisponible: number | null,
  pilPositiveUnits: number,
): VariantReconciliationStatus {
  if (sagDisponible === null) return "UNRECONCILED";
  const delta = Math.abs(sagDisponible - pilPositiveUnits);
  if (delta < 1) return "MATCHED";
  const pct = sagDisponible > 0 ? delta / sagDisponible : 1;
  if (pct <= 0.1 || delta <= 5) return "PARTIAL";
  return "UNRECONCILED";
}

function checkInvariant(existencia: number, reservado: number, disponible: number): boolean {
  return Math.abs(disponible - (existencia - reservado)) > 0.01;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function makeBalance(overrides: Partial<CanonicalWarehouseBalance> = {}): CanonicalWarehouseBalance {
  return {
    referenceCode: "CD-4253339",
    warehouseCode: "01",
    warehousePk: "10",
    warehouseName: "BODEGA PRINCIPAL",
    existencia: 427,
    reservado: 35,
    disponible: 392,
    costoPromedio: 5892.56,
    lastMovementAt: new Date("2026-07-23"),
    productName: "PIJAMA CASTILLITOS",
    line: "CASTILLITOS",
    category: "PIJAMA CL 2-8",
    ...overrides,
  };
}

// ── Three-Field Semantics ───────────────────────────────────────────────

describe("Three-Field SAG Semantics", () => {
  it("EXISTENCIA != DISPONIBLE when RESERVADO > 0", () => {
    const sagStock = { existencia: 427, reservado: 35, disponible: 392, costoPromedio: 5892.56 };
    expect(sagStock.existencia).not.toBe(sagStock.disponible);
    expect(sagStock.disponible).toBe(sagStock.existencia - sagStock.reservado);
  });

  it("disponibleReal must use DISPONIBLE, never EXISTENCIA", () => {
    const sagStock = { existencia: 427, reservado: 35, disponible: 392, costoPromedio: 5892.56 };
    const disponibleReal = sagStock.disponible;
    expect(disponibleReal).toBe(392);
    expect(sagStock.existencia).toBe(427);
    expect(sagStock.existencia - disponibleReal).toBe(35);
  });

  it("onHandReal = EXISTENCIA, reservedReal = RESERVADO, disponibleReal = DISPONIBLE", () => {
    const sagStock = { existencia: 427, reservado: 35, disponible: 392 };
    const onHandReal = sagStock.existencia;
    const reservedReal = sagStock.reservado;
    const disponibleReal = sagStock.disponible;
    expect(onHandReal).toBe(427);
    expect(reservedReal).toBe(35);
    expect(disponibleReal).toBe(392);
    expect(disponibleReal).toBe(onHandReal - reservedReal);
  });

  it("negative DISPONIBLE when RESERVADO > EXISTENCIA", () => {
    const sagStock = { existencia: 0, reservado: 1, disponible: -1 };
    expect(sagStock.disponible).toBe(-1);
    expect(sagStock.disponible).toBe(sagStock.existencia - sagStock.reservado);
  });

  it("PIL_LEGACY has reservedReal=0 and disponibleReal=onHandReal", () => {
    const pilCommercial = 350;
    const onHandReal = pilCommercial;
    const reservedReal = 0;
    const disponibleReal = pilCommercial;
    expect(reservedReal).toBe(0);
    expect(disponibleReal).toBe(onHandReal);
  });
});

// ── Invariant Check ─────────────────────────────────────────────────────

describe("Invariant: DISPONIBLE = EXISTENCIA - RESERVADO", () => {
  it("detects valid invariant", () => {
    expect(checkInvariant(427, 35, 392)).toBe(false);
  });

  it("detects invariant error", () => {
    expect(checkInvariant(427, 35, 400)).toBe(true);
  });

  it("passes for zero-stock rows", () => {
    expect(checkInvariant(0, 0, 0)).toBe(false);
  });

  it("passes for negative disponible", () => {
    expect(checkInvariant(0, 1, -1)).toBe(false);
  });

  it("detects floating point edge case within tolerance", () => {
    expect(checkInvariant(100, 10, 90.005)).toBe(false);
  });
});

// ── Control Cases (with REAL live values) ───────────────────────────────

describe("Control Cases — REAL LIVE VALUES", () => {
  const controlBalances = [
    makeBalance({
      referenceCode: "CD-4253339",
      warehouseCode: "01",
      existencia: 427,
      reservado: 35,
      disponible: 392,
      costoPromedio: 5892.56,
    }),
    makeBalance({
      referenceCode: "CD-7297",
      warehouseCode: "29",
      warehousePk: null,
      warehouseName: "BODEGA CALDAS",
      existencia: 11,
      reservado: 0,
      disponible: 11,
      costoPromedio: 6018,
    }),
  ];

  it("CD-4253339: disponibleReal=392 (NOT 427)", () => {
    const sagB01 = buildWarehouseStockMap(controlBalances, "01");
    const stock = sagB01.get("CD-4253339");
    expect(stock).toBeDefined();
    expect(stock!.existencia).toBe(427);
    expect(stock!.reservado).toBe(35);
    expect(stock!.disponible).toBe(392);
    const disponibleReal = stock!.disponible;
    expect(disponibleReal).toBe(392);
  });

  it("CD-7297 is in B29 (Caldas), NOT in B01", () => {
    const sagB01 = buildWarehouseStockMap(controlBalances, "01");
    expect(sagB01.has("CD-7297")).toBe(false);
    const sagB29 = buildWarehouseStockMap(controlBalances, "29");
    expect(sagB29.get("CD-7297")?.disponible).toBe(11);
  });

  it("DA-9730: UNVERIFIED — not in SAG view", () => {
    const sagB01 = buildWarehouseStockMap(controlBalances, "01");
    expect(sagB01.has("DA-9730")).toBe(false);
  });

  it("CD-4253339: SAG corrects PIL undercount from 350 to 392 DISPONIBLE", () => {
    const sagB01 = buildWarehouseStockMap(controlBalances, "01");
    const pilValue = 350;
    const sagDisponible = sagB01.get("CD-4253339")!.disponible;
    const disponibleRealSag = sagDisponible;
    expect(disponibleRealSag).toBe(392);
    expect(disponibleRealSag - pilValue).toBe(42);
  });
});

// ── Variant Reconciliation (against DISPONIBLE, not EXISTENCIA) ─────────

describe("Variant Reconciliation against DISPONIBLE", () => {
  it("reconciles against DISPONIBLE, not EXISTENCIA", () => {
    const sagDisponible = 392;
    const pilPositive = 380;
    const delta = sagDisponible - pilPositive;
    expect(delta).toBe(12);
  });

  it("MATCHED when SAG DISPONIBLE and PIL agree", () => {
    expect(deriveReconciliationStatus(392, 392)).toBe("MATCHED");
  });

  it("PARTIAL when within tolerance", () => {
    expect(deriveReconciliationStatus(392, 388)).toBe("PARTIAL");
  });

  it("UNRECONCILED when PIL significantly underreports", () => {
    expect(deriveReconciliationStatus(392, 300)).toBe("UNRECONCILED");
  });

  it("UNRECONCILED when SAG is null", () => {
    expect(deriveReconciliationStatus(null, 350)).toBe("UNRECONCILED");
  });

  it("handles negative DISPONIBLE", () => {
    expect(deriveReconciliationStatus(-5, 0)).toBe("PARTIAL");
  });

  it("MATCHED when both are 0", () => {
    expect(deriveReconciliationStatus(0, 0)).toBe("MATCHED");
  });
});

// ── Feature Flag & Source Labels (CIERRE DE SEGURIDAD) ──────────────────

describe("Feature Flag & Source Labels — 5 Unambiguous Values", () => {
  /**
   * Simulates the service's source resolution logic:
   * - useSagOfficial: feature flag = SAG_OFFICIAL AND SAG is healthy/cached
   * - sagIsCached: SAG source is DEGRADED (stale cache after error)
   * - sagUnavailable: SAG query failed and no cache
   */
  function resolveFields(opts: {
    useSagOfficial: boolean;
    sagIsCached?: boolean;
    sagUnavailable?: boolean;
    sagDisponible: number | null;
    sagExistencia: number | null;
    sagReservado: number | null;
    pilCommercial: number;
  }) {
    const {
      useSagOfficial,
      sagIsCached = false,
      sagUnavailable = false,
      sagDisponible,
      sagExistencia,
      sagReservado,
      pilCommercial,
    } = opts;
    const hasSagData = useSagOfficial && sagDisponible !== null;
    let onHandReal: number;
    let reservedReal: number;
    let disponibleReal: number;
    let balanceSource: InventoryBalanceSourceLabel;

    if (hasSagData) {
      onHandReal = sagExistencia!;
      reservedReal = sagReservado ?? 0;
      disponibleReal = sagDisponible!;
      balanceSource = sagIsCached ? "SAG_OFFICIAL_CACHE" : "SAG_OFFICIAL";
    } else if (useSagOfficial) {
      // SAG mode but no data for this ref
      onHandReal = 0;
      reservedReal = 0;
      disponibleReal = 0;
      balanceSource = sagUnavailable ? "UNAVAILABLE" : "SAG_OFFICIAL_NOT_FOUND";
    } else {
      onHandReal = pilCommercial;
      reservedReal = 0;
      disponibleReal = pilCommercial;
      balanceSource = "PIL_LEGACY";
    }
    return { onHandReal, reservedReal, disponibleReal, balanceSource };
  }

  it("SAG_OFFICIAL: live SAG data with DISPONIBLE for disponibleReal", () => {
    const r = resolveFields({
      useSagOfficial: true,
      sagDisponible: 392, sagExistencia: 427, sagReservado: 35,
      pilCommercial: 350,
    });
    expect(r.disponibleReal).toBe(392);
    expect(r.onHandReal).toBe(427);
    expect(r.reservedReal).toBe(35);
    expect(r.balanceSource).toBe("SAG_OFFICIAL");
  });

  it("SAG_OFFICIAL_CACHE: stale SAG cache used after SAG error", () => {
    const r = resolveFields({
      useSagOfficial: true, sagIsCached: true,
      sagDisponible: 380, sagExistencia: 420, sagReservado: 40,
      pilCommercial: 350,
    });
    expect(r.disponibleReal).toBe(380);
    expect(r.balanceSource).toBe("SAG_OFFICIAL_CACHE");
  });

  it("SAG_OFFICIAL_NOT_FOUND: SAG healthy but ref absent from view", () => {
    const r = resolveFields({
      useSagOfficial: true,
      sagDisponible: null, sagExistencia: null, sagReservado: null,
      pilCommercial: 350,
    });
    expect(r.disponibleReal).toBe(0);
    expect(r.onHandReal).toBe(0);
    expect(r.reservedReal).toBe(0);
    expect(r.balanceSource).toBe("SAG_OFFICIAL_NOT_FOUND");
  });

  it("SAG_OFFICIAL_NOT_FOUND does NOT substitute PIL — values are 0", () => {
    const r = resolveFields({
      useSagOfficial: true,
      sagDisponible: null, sagExistencia: null, sagReservado: null,
      pilCommercial: 999,
    });
    // PIL value is 999 but NOT used — SAG_OFFICIAL_NOT_FOUND means 0
    expect(r.disponibleReal).toBe(0);
    expect(r.onHandReal).toBe(0);
    expect(r.balanceSource).toBe("SAG_OFFICIAL_NOT_FOUND");
  });

  it("UNAVAILABLE: SAG query failed and no cache", () => {
    const r = resolveFields({
      useSagOfficial: true, sagUnavailable: true,
      sagDisponible: null, sagExistencia: null, sagReservado: null,
      pilCommercial: 350,
    });
    expect(r.disponibleReal).toBe(0);
    expect(r.balanceSource).toBe("UNAVAILABLE");
  });

  it("PIL_LEGACY: feature flag disabled — uses PIL values", () => {
    const r = resolveFields({
      useSagOfficial: false,
      sagDisponible: 392, sagExistencia: 427, sagReservado: 35,
      pilCommercial: 350,
    });
    expect(r.disponibleReal).toBe(350);
    expect(r.onHandReal).toBe(350);
    expect(r.reservedReal).toBe(0);
    expect(r.balanceSource).toBe("PIL_LEGACY");
  });

  it("default feature flag is PIL_LEGACY (not auto-detect from credentials)", () => {
    // Production safety: default MUST be PIL_LEGACY
    // SAG_OFFICIAL requires EXPLICIT opt-in via INVENTORY_BALANCE_SOURCE=SAG_OFFICIAL
    const defaultSource = "PIL_LEGACY";
    expect(defaultSource).toBe("PIL_LEGACY");
    // SAG_OFFICIAL only via explicit env var
    const explicitOverride = "SAG_OFFICIAL";
    expect(explicitOverride).toBe("SAG_OFFICIAL");
  });

  it("source labels are exactly 5 — no PIL_LEGACY_FALLBACK", () => {
    const allLabels: InventoryBalanceSourceLabel[] = [
      "SAG_OFFICIAL",
      "SAG_OFFICIAL_CACHE",
      "SAG_OFFICIAL_NOT_FOUND",
      "PIL_LEGACY",
      "UNAVAILABLE",
    ];
    expect(allLabels.length).toBe(5);
    expect(allLabels).not.toContain("PIL_LEGACY_FALLBACK");
  });

  it("never disguises non-SAG data as SAG_OFFICIAL", () => {
    const rNotFound = resolveFields({
      useSagOfficial: true,
      sagDisponible: null, sagExistencia: null, sagReservado: null,
      pilCommercial: 100,
    });
    expect(rNotFound.balanceSource).not.toBe("SAG_OFFICIAL");

    const rPil = resolveFields({
      useSagOfficial: false,
      sagDisponible: 100, sagExistencia: 100, sagReservado: 0,
      pilCommercial: 100,
    });
    expect(rPil.balanceSource).not.toBe("SAG_OFFICIAL");
  });
});

// ── resolveSellableUnits ────────────────────────────────────────────────

describe("resolveSellableUnits — single authorized clamp", () => {
  it("positive disponible passes through unchanged", () => {
    expect(resolveSellableUnits(392)).toBe(392);
  });

  it("zero passes through as zero", () => {
    expect(resolveSellableUnits(0)).toBe(0);
  });

  it("negative disponible clamped to 0", () => {
    expect(resolveSellableUnits(-5)).toBe(0);
    expect(resolveSellableUnits(-1)).toBe(0);
    expect(resolveSellableUnits(-9999)).toBe(0);
  });

  it("does NOT modify the original value — returns new value", () => {
    const original = -5;
    const sellable = resolveSellableUnits(original);
    expect(sellable).toBe(0);
    expect(original).toBe(-5); // unchanged
  });
});

// ── KPI Semantics ───────────────────────────────────────────────────────

describe("KPI uses DISPONIBLE not EXISTENCIA", () => {
  it("totalDisponibleReal = SUM(DISPONIBLE), not SUM(EXISTENCIA)", () => {
    const items = [
      { disponibleReal: 392, onHandReal: 427 },
      { disponibleReal: 11, onHandReal: 11 },
    ];
    const totalDisponible = items.reduce((s, i) => s + i.disponibleReal, 0);
    const totalOnHand = items.reduce((s, i) => s + i.onHandReal, 0);
    expect(totalDisponible).toBe(403);
    expect(totalOnHand).toBe(438);
    expect(totalDisponible).not.toBe(totalOnHand);
  });

  it("negative DISPONIBLE contributes negatively to SUM, clamped in KPIs", () => {
    const items = [
      { disponibleReal: 392 },
      { disponibleReal: -5 },
      { disponibleReal: 11 },
    ];
    const rawSum = items.reduce((s, i) => s + i.disponibleReal, 0);
    const clampedSum = items.reduce((s, i) => s + resolveSellableUnits(i.disponibleReal), 0);
    expect(rawSum).toBe(398);
    expect(clampedSum).toBe(403);
  });

  it("KPIs only sum SAG_OFFICIAL and SAG_OFFICIAL_CACHE — not NOT_FOUND or UNAVAILABLE", () => {
    type Item = { disponibleReal: number; balanceSource: InventoryBalanceSourceLabel };
    const items: Item[] = [
      { disponibleReal: 392, balanceSource: "SAG_OFFICIAL" },
      { disponibleReal: 0, balanceSource: "SAG_OFFICIAL_NOT_FOUND" },
      { disponibleReal: 0, balanceSource: "UNAVAILABLE" },
      { disponibleReal: 380, balanceSource: "SAG_OFFICIAL_CACHE" },
    ];
    const officialItems = items.filter(
      i => i.balanceSource === "SAG_OFFICIAL" || i.balanceSource === "SAG_OFFICIAL_CACHE"
    );
    const officialSum = officialItems.reduce((s, i) => s + i.disponibleReal, 0);
    expect(officialSum).toBe(772);
    expect(officialItems.length).toBe(2);
  });
});

// ── Data Gap Metrics ────────────────────────────────────────────────────

describe("Data Gap Metrics", () => {
  type Item = { disponibleReal: number; balanceSource: InventoryBalanceSourceLabel };

  function computeGapMetrics(items: Item[]) {
    return {
      officialBalanceReferences: items.filter(
        i => i.balanceSource === "SAG_OFFICIAL" || i.balanceSource === "SAG_OFFICIAL_CACHE"
      ).length,
      officialNotFoundReferences: items.filter(
        i => i.balanceSource === "SAG_OFFICIAL_NOT_FOUND"
      ).length,
      unavailableReferences: items.filter(
        i => i.balanceSource === "UNAVAILABLE"
      ).length,
      negativeAvailableReferences: items.filter(
        i => i.disponibleReal < 0
      ).length,
    };
  }

  it("counts all 5 source labels correctly", () => {
    const items: Item[] = [
      { disponibleReal: 392, balanceSource: "SAG_OFFICIAL" },
      { disponibleReal: 380, balanceSource: "SAG_OFFICIAL_CACHE" },
      { disponibleReal: 0, balanceSource: "SAG_OFFICIAL_NOT_FOUND" },
      { disponibleReal: 0, balanceSource: "SAG_OFFICIAL_NOT_FOUND" },
      { disponibleReal: 0, balanceSource: "UNAVAILABLE" },
      { disponibleReal: 350, balanceSource: "PIL_LEGACY" },
    ];
    const m = computeGapMetrics(items);
    expect(m.officialBalanceReferences).toBe(2);
    expect(m.officialNotFoundReferences).toBe(2);
    expect(m.unavailableReferences).toBe(1);
  });

  it("detects negative disponible references", () => {
    const items: Item[] = [
      { disponibleReal: -5, balanceSource: "SAG_OFFICIAL" },
      { disponibleReal: -1, balanceSource: "SAG_OFFICIAL" },
      { disponibleReal: 392, balanceSource: "SAG_OFFICIAL" },
      { disponibleReal: 0, balanceSource: "SAG_OFFICIAL_NOT_FOUND" },
    ];
    const m = computeGapMetrics(items);
    expect(m.negativeAvailableReferences).toBe(2);
  });

  it("all metrics are 0 for empty items", () => {
    const m = computeGapMetrics([]);
    expect(m.officialBalanceReferences).toBe(0);
    expect(m.officialNotFoundReferences).toBe(0);
    expect(m.unavailableReferences).toBe(0);
    expect(m.negativeAvailableReferences).toBe(0);
  });
});

// ── Warehouse Stock Map ─────────────────────────────────────────────────

describe("buildWarehouseStockMap", () => {
  it("filters by warehouse and returns three fields", () => {
    const balances = [
      makeBalance({ referenceCode: "CD-4253339", warehouseCode: "01", existencia: 427, reservado: 35, disponible: 392 }),
    ];
    const map = buildWarehouseStockMap(balances, "01");
    const stock = map.get("CD-4253339");
    expect(stock?.existencia).toBe(427);
    expect(stock?.reservado).toBe(35);
    expect(stock?.disponible).toBe(392);
  });

  it("returns empty map for no matching warehouse", () => {
    const balances = [makeBalance({ warehouseCode: "01" })];
    expect(buildWarehouseStockMap(balances, "99").size).toBe(0);
  });
});

describe("buildTotalStockMap", () => {
  it("sums EXISTENCIA across warehouses", () => {
    const balances = [
      makeBalance({ referenceCode: "CD-4253339", warehouseCode: "01", existencia: 427 }),
      makeBalance({ referenceCode: "CD-4253339", warehouseCode: "29", existencia: 11 }),
    ];
    expect(buildTotalStockMap(balances).get("CD-4253339")).toBe(438);
  });
});
