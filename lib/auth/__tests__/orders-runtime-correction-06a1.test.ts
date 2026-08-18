/**
 * ORDERS-RUNTIME-CORRECTION-06A1
 *
 * Verifies all corrections from the runtime probe:
 *   A. Today window uses computeTodayWindow (not manual offset math)
 *   B. AGK order adapter reads from metadataJson.summary/header (not top-level)
 *   C. Visible set reconciliation: loadedOrders declared as subset
 *   D. Seller batch resolution at ingestion time
 *   E. Reservation expiry cron logic
 *   F. SagWriteOperation SIMULATION guard
 *
 * Sprint: ORDERS-RUNTIME-CORRECTION-06A1
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const ORDER_SERVICE_PATH = path.resolve(
  __dirname,
  "../../comercial/pedidos/order-service.ts"
);
const orderServiceSrc = fs.readFileSync(ORDER_SERVICE_PATH, "utf-8");

const OP_STATE_PATH = path.resolve(
  __dirname,
  "../../comercial/pedidos/order-operational-state.ts"
);
const opStateSrc = fs.readFileSync(OP_STATE_PATH, "utf-8");

const STORAGE_PATH = path.resolve(
  __dirname,
  "../../connectors/adapters/sag-pya-soap/storage.ts"
);
const storageSrc = fs.readFileSync(STORAGE_PATH, "utf-8");

const PROBE_PATH = path.resolve(
  __dirname,
  "../../../app/api/internal/runtime-probe/route.ts"
);
const probeSrc = fs.readFileSync(PROBE_PATH, "utf-8");

const CRON_PATH = path.resolve(
  __dirname,
  "../../../app/api/cron/reservation-expiry/route.ts"
);
const cronSrc = fs.readFileSync(CRON_PATH, "utf-8");

const BRIDGE_PATH = path.resolve(
  __dirname,
  "../../comercial/pedidos/order-sag-bridge.ts"
);

const CLIENT_PATH = path.resolve(
  __dirname,
  "../../../app/(app)/[orgSlug]/comercial/pedidos/pedidos-client.tsx"
);
const clientSrc = fs.readFileSync(CLIENT_PATH, "utf-8");

// ══════════════════════════════════════════════════════════════════════════════
// A: TODAY WINDOW — manual offset math eliminated
// ══════════════════════════════════════════════════════════════════════════════

describe("06A1-A — Today window uses computeTodayWindow", () => {
  test("T1: order-service imports computeTodayWindow", () => {
    expect(orderServiceSrc).toContain("import { computeTodayWindow }");
    expect(orderServiceSrc).toContain("tenant-today-window");
  });

  test("T2: order-service computeServerKpiStats does not use getTimezoneOffset", () => {
    const section = orderServiceSrc.slice(
      orderServiceSrc.indexOf("export async function computeServerKpiStats"),
      orderServiceSrc.indexOf("export async function computeServerKpiStats") + 400,
    );
    expect(section).not.toContain("getTimezoneOffset");
    expect(section).not.toContain("tenantMs");
  });

  test("T3: order-operational-state imports computeTodayWindow", () => {
    expect(opStateSrc).toContain("import { computeTodayWindow }");
  });

  test("T4: computeCalibratedKpiStats does not use getTimezoneOffset", () => {
    const section = opStateSrc.slice(
      opStateSrc.indexOf("export function computeCalibratedKpiStats"),
      opStateSrc.indexOf("export function computeCalibratedKpiStats") + 400,
    );
    expect(section).not.toContain("getTimezoneOffset");
    expect(section).not.toContain("tenantMs");
  });

  test("T5: applyQuickFilter does not use getTimezoneOffset", () => {
    const section = opStateSrc.slice(
      opStateSrc.indexOf("export function applyQuickFilter"),
      opStateSrc.indexOf("export function applyQuickFilter") + 400,
    );
    expect(section).not.toContain("getTimezoneOffset");
  });

  test("T6: probe uses computeTodayWindow", () => {
    expect(probeSrc).toContain("computeTodayWindow");
    expect(probeSrc).not.toContain("tenantMs");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// B: AGK ORDER ADAPTER — reads from metadataJson.summary/header
// ══════════════════════════════════════════════════════════════════════════════

describe("06A1-B — AGK order adapter uses canonical paths", () => {
  test("T7: rowToCard reads totalValue from summary", () => {
    expect(orderServiceSrc).toContain("summary.totalValue");
  });

  test("T8: rowToCard reads customerName from header", () => {
    expect(orderServiceSrc).toContain("header?.customerName");
  });

  test("T9: rowToCard reads totalUnits from summary", () => {
    expect(orderServiceSrc).toContain("summary.totalUnits");
  });

  test("T10: probe reads AGK order data from summary and header", () => {
    expect(probeSrc).toContain("summary.totalValue");
    expect(probeSrc).toContain("summary.totalUnits");
    expect(probeSrc).toContain("header.customerName");
    expect(probeSrc).toContain("header.sellerName");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// C: VISIBLE SET RECONCILIATION — "Mostrando X de Y"
// ══════════════════════════════════════════════════════════════════════════════

describe("06A1-C — Visible set reconciliation", () => {
  test("T11: UI shows 'Mostrando X de Y pedidos'", () => {
    expect(clientSrc).toContain("Mostrando");
    expect(clientSrc).toContain("loadedOrders");
    expect(clientSrc).toContain("totalOrders");
  });

  test("T12: listOrders has explicit take limits", () => {
    expect(orderServiceSrc).toContain("take:    200");
    expect(orderServiceSrc).toContain("opts?.take ?? 500");
  });

  test("T13: computeServerKpiStats uses count() without take", () => {
    const kpiSection = orderServiceSrc.slice(
      orderServiceSrc.indexOf("export async function computeServerKpiStats"),
      orderServiceSrc.indexOf("export async function computeServerKpiStats") + 4000,
    );
    expect(kpiSection).toContain(".count(");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// D: SELLER BATCH RESOLUTION AT INGESTION
// ══════════════════════════════════════════════════════════════════════════════

describe("06A1-D — Seller name resolution at ingestion", () => {
  test("T14: storage.ts imports consultaSagJson", () => {
    expect(storageSrc).toContain("consultaSagJson");
  });

  test("T15: storage.ts imports getSagConnection", () => {
    expect(storageSrc).toContain("getSagConnection");
  });

  test("T16: customerOrderStorage resolves seller names from TERCEROS", () => {
    expect(storageSrc).toContain("SELECT ka_nl_tercero, sc_nombre");
    expect(storageSrc).toContain("FROM TERCEROS");
  });

  test("T17: resolution updates sellerName, sellerSource, sellerConfidence", () => {
    expect(storageSrc).toContain('sellerName: name');
    expect(storageSrc).toContain('sellerSource: "sag_movimientos"');
    expect(storageSrc).toContain('sellerConfidence: "high"');
  });

  test("T18: resolution only updates orders with null sellerName", () => {
    expect(storageSrc).toContain("sellerName: null");
  });

  test("T19: resolution is batched (not N+1)", () => {
    // Queries TERCEROS with IN clause, not per-order
    expect(storageSrc).toContain("allTerceroIds.slice(i, i + 100)");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// E: RESERVATION EXPIRY CRON
// ══════════════════════════════════════════════════════════════════════════════

describe("06A1-E — Reservation expiry cron", () => {
  test("T20: cron expires active reservations with expiresAt <= now", () => {
    expect(cronSrc).toContain('status:    "active"');
    expect(cronSrc).toContain("expiresAt: { lte: now }");
  });

  test("T21: cron sets status to 'expired'", () => {
    expect(cronSrc).toContain('status:      "expired"');
  });

  test("T22: cron calculates qtyReleased = qtyReserved - qtyConsumed", () => {
    expect(cronSrc).toContain("qtyReleased: row.qtyReserved - row.qtyConsumed");
  });

  test("T23: cron processes in batches", () => {
    expect(cronSrc).toContain("BATCH_SIZE");
    expect(cronSrc).toContain("take: BATCH_SIZE");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// F: SAG WRITE SIMULATION GUARD
// ══════════════════════════════════════════════════════════════════════════════

describe("06A1-F — SAG write SIMULATION guard", () => {
  test("T24: order-sag-bridge.ts exists", () => {
    expect(fs.existsSync(BRIDGE_PATH)).toBe(true);
  });

  test("T25: SIMULATION guard returns early before enqueue", () => {
    const bridgeSrc = fs.readFileSync(BRIDGE_PATH, "utf-8");
    const simIdx = bridgeSrc.indexOf('"SIMULATION"');
    const enqueueIdx = bridgeSrc.indexOf("enqueue(");
    expect(simIdx).toBeGreaterThan(-1);
    expect(enqueueIdx).toBeGreaterThan(-1);
    // SIMULATION check must come before enqueue() call
    expect(simIdx).toBeLessThan(enqueueIdx);
  });

  test("T26: SIMULATION returns simulated ID (not real enqueue)", () => {
    const bridgeSrc = fs.readFileSync(BRIDGE_PATH, "utf-8");
    expect(bridgeSrc).toContain("SIM-");
    expect(bridgeSrc).toContain("ORDER_SYNC_SIMULATED");
  });
});
