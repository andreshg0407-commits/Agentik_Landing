/**
 * ORDERS-TEST-DATA-CLEANUP-06A1A
 *
 * Structural verification tests for the test data cleanup task:
 *   A. cancelOrder() flow sets status="cancelado" + releases reservations
 *   B. KPI engine excludes cancelled orders from pendientes count
 *   C. Cleanup endpoint REMOVED — route must not exist
 *   D. deleteDraftOrder checks for active SagWriteOperations
 *
 * Sprint: ORDERS-TEST-DATA-CLEANUP-06A1A
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const ORDER_SERVICE_PATH = path.resolve(
  __dirname,
  "../../comercial/pedidos/order-service.ts",
);
const orderServiceSrc = fs.readFileSync(ORDER_SERVICE_PATH, "utf-8");

const RESERVATION_ADAPTER_PATH = path.resolve(
  __dirname,
  "../../comercial/pedidos/order-reservation-adapter.ts",
);
const reservationAdapterSrc = fs.readFileSync(RESERVATION_ADAPTER_PATH, "utf-8");

const CLEANUP_ROUTE_PATH = path.resolve(
  __dirname,
  "../../../app/api/internal/test-data-cleanup/route.ts",
);

const CLEANUP_DIR_PATH = path.resolve(
  __dirname,
  "../../../app/api/internal/test-data-cleanup",
);

// ══════════════════════════════════════════════════════════════════════════════
// A: cancelOrder() flow — status + reservations
// ══════════════════════════════════════════════════════════════════════════════

describe("06A1A-A — cancelOrder domain flow", () => {
  test("T1: cancelOrder exists and is exported", () => {
    expect(orderServiceSrc).toContain("export async function cancelOrder(");
  });

  test("T2: cancelOrder sets status to 'cancelado'", () => {
    const fnStart = orderServiceSrc.indexOf("export async function cancelOrder(");
    const fnBody = orderServiceSrc.slice(fnStart, fnStart + 500);
    expect(fnBody).toContain('status: "cancelado"');
  });

  test("T3: cancelOrder calls releaseReservationsForOrder", () => {
    const fnStart = orderServiceSrc.indexOf("export async function cancelOrder(");
    const fnBody = orderServiceSrc.slice(fnStart, fnStart + 500);
    expect(fnBody).toContain("releaseReservationsForOrder(result)");
  });

  test("T4: releaseReservationsForOrder creates cancelled OperationalOrder with empty lines", () => {
    expect(reservationAdapterSrc).toContain('status:         "cancelled"');
    expect(reservationAdapterSrc).toContain("lines:          []");
  });

  test("T5: releaseReservationsForOrder returns RELEASED status", () => {
    expect(reservationAdapterSrc).toContain('status: "RELEASED"');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// B: KPI engine — cancelled orders excluded
// ══════════════════════════════════════════════════════════════════════════════

describe("06A1A-B — KPI exclusion of cancelled orders", () => {
  test("T6: computeServerKpiStats checks for cancelled status", () => {
    const kpiStart = orderServiceSrc.indexOf("export async function computeServerKpiStats");
    const kpiBody = orderServiceSrc.slice(kpiStart, kpiStart + 4000);
    expect(kpiBody).toContain('const cancelled = status === "cancelado"');
  });

  test("T7: today KPIs skip cancelled orders", () => {
    const kpiStart = orderServiceSrc.indexOf("export async function computeServerKpiStats");
    const kpiBody = orderServiceSrc.slice(kpiStart, kpiStart + 4000);
    expect(kpiBody).toContain("if (!cancelled && createdAt >= todayStart");
  });

  test("T8: pendientesEnvioSag skips cancelled orders", () => {
    const kpiStart = orderServiceSrc.indexOf("export async function computeServerKpiStats");
    const kpiBody = orderServiceSrc.slice(kpiStart, kpiStart + 4000);
    expect(kpiBody).toContain("if (isNative && !cancelled)");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// C: Cleanup endpoint REMOVED — security precondition
// ══════════════════════════════════════════════════════════════════════════════

describe("06A1A-C — Cleanup endpoint removed (security)", () => {
  test("T9: route.ts file does NOT exist", () => {
    expect(fs.existsSync(CLEANUP_ROUTE_PATH)).toBe(false);
  });

  test("T10: directory does NOT exist", () => {
    expect(fs.existsSync(CLEANUP_DIR_PATH)).toBe(false);
  });

  test("T11: no executable route under app/api/internal/test-data-cleanup", () => {
    const internalDir = path.resolve(__dirname, "../../../app/api/internal");
    const entries = fs.readdirSync(internalDir);
    expect(entries).not.toContain("test-data-cleanup");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// D: SAG write safety — deleteDraftOrder guard
// ══════════════════════════════════════════════════════════════════════════════

describe("06A1A-D — SAG write safety", () => {
  test("T12: deleteDraftOrder checks for active SagWriteOperations", () => {
    const delStart = orderServiceSrc.indexOf("export async function deleteDraftOrder");
    const delBody = orderServiceSrc.slice(delStart, delStart + 2000);
    expect(delBody).toContain("sagWriteOperation.findFirst");
    expect(delBody).toContain("operacion SAG activa");
  });
});
