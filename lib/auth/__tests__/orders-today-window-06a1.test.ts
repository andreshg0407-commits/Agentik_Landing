/**
 * ORDERS-TODAY-WINDOW-06A1
 *
 * Verifies the tenant timezone today-window utility:
 *   T1: 04:59:59Z falls in the PREVIOUS day (Aug 17 COT)
 *   T2: 05:00:00Z enters TODAY (Aug 18 COT)
 *   T3: 04:59:59Z next day falls in TODAY (still Aug 18 COT)
 *   T4: 05:00:00Z next day is OUTSIDE today (Aug 19 COT)
 *   T5: todayStart is always 05:00:00Z for COT
 *   T6: tomorrowStart is exactly 24h after todayStart
 *   T7: computeServerKpiStats uses computeTodayWindow
 *   T8: computeCalibratedKpiStats uses computeTodayWindow
 *   T9: applyQuickFilter uses computeTodayWindow
 *
 * Sprint: ORDERS-RUNTIME-CORRECTION-06A1
 */

import { describe, test, expect } from "bun:test";
import { computeTodayWindow } from "../../comercial/pedidos/tenant-today-window";
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

// ══════════════════════════════════════════════════════════════════════════════
// A: Boundary tests — August 18, 2026 COT
// ══════════════════════════════════════════════════════════════════════════════

describe("06A1 — Today window boundaries (COT)", () => {
  // For 2026-08-18 COT, the UTC window is [05:00:00Z, next day 05:00:00Z)
  const aug18Noon = new Date("2026-08-18T12:00:00Z"); // 07:00 COT — clearly Aug 18
  const { todayStart, tomorrowStart } = computeTodayWindow(aug18Noon, "America/Bogota");

  test("T1: 04:59:59Z on Aug 18 falls in PREVIOUS day (Aug 17 COT = 23:59:59)", () => {
    const beforeMidnight = new Date("2026-08-18T04:59:59.999Z");
    expect(beforeMidnight >= todayStart && beforeMidnight < tomorrowStart).toBe(false);
    expect(beforeMidnight < todayStart).toBe(true);
  });

  test("T2: 05:00:00Z on Aug 18 enters TODAY (midnight COT)", () => {
    const atMidnight = new Date("2026-08-18T05:00:00.000Z");
    expect(atMidnight >= todayStart && atMidnight < tomorrowStart).toBe(true);
    expect(atMidnight.getTime()).toBe(todayStart.getTime());
  });

  test("T3: 04:59:59Z on Aug 19 still falls in TODAY (23:59:59 COT Aug 18)", () => {
    const endOfDay = new Date("2026-08-19T04:59:59.999Z");
    expect(endOfDay >= todayStart && endOfDay < tomorrowStart).toBe(true);
  });

  test("T4: 05:00:00Z on Aug 19 is OUTSIDE today (midnight COT Aug 19)", () => {
    const nextDayStart = new Date("2026-08-19T05:00:00.000Z");
    expect(nextDayStart >= todayStart && nextDayStart < tomorrowStart).toBe(false);
    expect(nextDayStart.getTime()).toBe(tomorrowStart.getTime());
  });

  test("T5: todayStart is 2026-08-18T05:00:00.000Z", () => {
    expect(todayStart.toISOString()).toBe("2026-08-18T05:00:00.000Z");
  });

  test("T6: tomorrowStart is exactly 24h after todayStart", () => {
    const diff = tomorrowStart.getTime() - todayStart.getTime();
    expect(diff).toBe(24 * 60 * 60 * 1000);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// B: Edge cases
// ══════════════════════════════════════════════════════════════════════════════

describe("06A1 — Edge cases", () => {
  test("T7: midnight UTC (00:00 Aug 18) maps to previous day in COT (19:00 Aug 17)", () => {
    const midnightUtc = new Date("2026-08-18T00:00:00Z");
    const { todayStart, tomorrowStart } = computeTodayWindow(midnightUtc, "America/Bogota");
    // At 00:00 UTC it's still Aug 17 in COT (19:00)
    expect(todayStart.toISOString()).toBe("2026-08-17T05:00:00.000Z");
    expect(tomorrowStart.toISOString()).toBe("2026-08-18T05:00:00.000Z");
  });

  test("T8: 04:59 UTC maps to previous day in COT (23:59 Aug 17)", () => {
    const earlyUtc = new Date("2026-08-18T04:59:00Z");
    const { todayStart } = computeTodayWindow(earlyUtc, "America/Bogota");
    expect(todayStart.toISOString()).toBe("2026-08-17T05:00:00.000Z");
  });

  test("T9: 05:00 UTC maps to current day in COT (00:00 Aug 18)", () => {
    const exactMidnight = new Date("2026-08-18T05:00:00Z");
    const { todayStart } = computeTodayWindow(exactMidnight, "America/Bogota");
    expect(todayStart.toISOString()).toBe("2026-08-18T05:00:00.000Z");
  });

  test("T10: 23:59 UTC maps to current day in COT (18:59 Aug 18)", () => {
    const lateUtc = new Date("2026-08-18T23:59:00Z");
    const { todayStart } = computeTodayWindow(lateUtc, "America/Bogota");
    expect(todayStart.toISOString()).toBe("2026-08-18T05:00:00.000Z");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// C: Consumer adoption
// ══════════════════════════════════════════════════════════════════════════════

describe("06A1 — Consumer adoption", () => {
  test("T11: computeServerKpiStats imports computeTodayWindow", () => {
    expect(orderServiceSrc).toContain("computeTodayWindow");
    expect(orderServiceSrc).toContain("tenant-today-window");
  });

  test("T12: computeServerKpiStats does NOT manually compute tenantMs", () => {
    // The old buggy pattern used getTimezoneOffset() and manual offset math
    const kpiSection = orderServiceSrc.slice(
      orderServiceSrc.indexOf("export async function computeServerKpiStats"),
      orderServiceSrc.indexOf("export async function computeServerKpiStats") + 400
    );
    expect(kpiSection).not.toContain("getTimezoneOffset");
    expect(kpiSection).not.toContain("tenantMs");
  });

  test("T13: order-operational-state imports computeTodayWindow", () => {
    expect(opStateSrc).toContain("computeTodayWindow");
    expect(opStateSrc).toContain("tenant-today-window");
  });

  test("T14: order-operational-state does NOT manually compute tenantMs", () => {
    expect(opStateSrc).not.toContain("getTimezoneOffset");
    expect(opStateSrc).not.toContain("tenantMs");
  });
});
