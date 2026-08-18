/**
 * ORDERS-TEST-DATA-CLEANUP-06A1A
 *
 * Structural verification tests for the test data cleanup task:
 *   A. cancelOrder() flow sets status="cancelado" + releases reservations
 *   B. KPI engine excludes cancelled orders from pendientes count
 *   C. Cleanup endpoint guards (Preview-only, PROBE_SECRET, idempotent)
 *   D. No SagWriteOperation side effects
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

const CLEANUP_PATH = path.resolve(
  __dirname,
  "../../../app/api/internal/test-data-cleanup/route.ts",
);
const cleanupSrc = fs.readFileSync(CLEANUP_PATH, "utf-8");

const RESERVATION_ADAPTER_PATH = path.resolve(
  __dirname,
  "../../comercial/pedidos/order-reservation-adapter.ts",
);
const reservationAdapterSrc = fs.readFileSync(RESERVATION_ADAPTER_PATH, "utf-8");

// ══════════════════════════════════════════════════════════════════════════════
// A: cancelOrder() flow — status + reservations
// ══════════════════════════════════════════════════════════════════════════════

describe("06A1A-A — cancelOrder domain flow", () => {
  test("T1: cancelOrder exists and is exported", () => {
    expect(orderServiceSrc).toContain("export async function cancelOrder(");
  });

  test("T2: cancelOrder sets status to 'cancelado'", () => {
    // Find the cancelOrder function body
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
// C: Cleanup endpoint guards
// ══════════════════════════════════════════════════════════════════════════════

describe("06A1A-C — Cleanup endpoint structure", () => {
  test("T9: cleanup endpoint exists", () => {
    expect(fs.existsSync(CLEANUP_PATH)).toBe(true);
  });

  test("T10: Preview-only guard", () => {
    expect(cleanupSrc).toContain("BLOCKED_PRODUCTION");
    expect(cleanupSrc).toContain('vercelEnv === "production"');
  });

  test("T11: PROBE_SECRET guard", () => {
    expect(cleanupSrc).toContain("PROBE_SECRET");
    expect(cleanupSrc).toContain("AUTH_FAILED");
  });

  test("T12: targets exactly 2 test order IDs", () => {
    expect(cleanupSrc).toContain("cmsku43cf000004jt6imr5oqj");
    expect(cleanupSrc).toContain("cmslanbpp000004l4cjiwb1ly");
    expect(cleanupSrc).toContain("TEST_ORDER_IDS");
  });

  test("T13: idempotent — checks for already-cancelled", () => {
    expect(cleanupSrc).toContain("ALREADY_CANCELLED");
    expect(cleanupSrc).toContain('currentStatus === "cancelado"');
  });

  test("T14: uses domain cancelOrder (not raw DB update)", () => {
    expect(cleanupSrc).toContain('import { cancelOrder } from "@/lib/comercial/pedidos/order-service"');
    expect(cleanupSrc).toContain("cancelOrder(orgId, orderId)");
  });

  test("T15: captures before/after snapshot with deltas", () => {
    expect(cleanupSrc).toContain("captureSnapshot(orgId)");
    expect(cleanupSrc).toContain("pendientesEnvioSag");
    expect(cleanupSrc).toContain("activeReservations");
    expect(cleanupSrc).toContain("totalReservedQty");
    expect(cleanupSrc).toContain("deltas");
  });

  test("T16: POST method only (not GET)", () => {
    expect(cleanupSrc).toContain("export async function POST(");
    expect(cleanupSrc).not.toContain("export async function GET(");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// D: SAG write safety
// ══════════════════════════════════════════════════════════════════════════════

describe("06A1A-D — Zero SAG writes", () => {
  test("T17: cleanup endpoint does not import SAG client", () => {
    expect(cleanupSrc).not.toContain("consultaSagJson");
    expect(cleanupSrc).not.toContain("getSagConnection");
  });

  test("T18: cleanup endpoint does not import SAG bridge", () => {
    expect(cleanupSrc).not.toContain("order-sag-bridge");
    expect(cleanupSrc).not.toContain("sagWriteOperation");
  });

  test("T19: cleanup endpoint does not call enqueue", () => {
    expect(cleanupSrc).not.toContain("enqueue(");
    expect(cleanupSrc).not.toContain("enqueue (");
  });

  test("T20: deleteDraftOrder checks for active SagWriteOperations", () => {
    const delStart = orderServiceSrc.indexOf("export async function deleteDraftOrder");
    const delBody = orderServiceSrc.slice(delStart, delStart + 2000);
    expect(delBody).toContain("sagWriteOperation.findFirst");
    expect(delBody).toContain("operacion SAG activa");
  });
});
