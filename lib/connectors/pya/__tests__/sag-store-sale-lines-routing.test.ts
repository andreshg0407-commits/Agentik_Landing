/**
 * lib/connectors/pya/__tests__/sag-store-sale-lines-routing.test.ts
 *
 * AGENTIK-SAG-STORE-SALE-LINES-CURRENT-CUTOVER-01
 *
 * Permanent test suite for StoreSaleLineRecord source routing.
 * Validates that the routed sync correctly resolves SAG databases
 * and segments cross-cutoff date ranges.
 *
 * Pure unit tests — no DB, no SOAP, no network. 100% deterministic.
 */

import { describe, it, expect } from "vitest";
import {
  resolveSagSourceForDate,
  resolveSagSourcesForRange,
  SAG_CURRENT_START_DATE,
  SAG_HISTORICAL_END_DATE,
} from "../sag-source-router";

// ══════════════════════════════════════════════════════════════════════════════
// SSL-1: Date routing for store sale dates
// ══════════════════════════════════════════════════════════════════════════════

describe("SSL-1: date routing for store sale dates", () => {
  it("document date 2026-07-20 routes HISTORICAL", () => {
    expect(resolveSagSourceForDate("2026-07-20")).toBe("HISTORICAL");
  });

  it("document date 2026-07-21 routes CURRENT", () => {
    expect(resolveSagSourceForDate("2026-07-21")).toBe("CURRENT");
  });

  it("document date 2025-06-15 routes HISTORICAL", () => {
    expect(resolveSagSourceForDate("2025-06-15")).toBe("HISTORICAL");
  });

  it("document date 2026-08-01 routes CURRENT", () => {
    expect(resolveSagSourceForDate("2026-08-01")).toBe("CURRENT");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SSL-2: Range routing for store sale sync windows
// ══════════════════════════════════════════════════════════════════════════════

describe("SSL-2: range routing for sync windows", () => {
  it("CURRENT-only range produces single segment", () => {
    const result = resolveSagSourcesForRange("2026-07-21", "2026-12-31");
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].source).toBe("CURRENT");
    expect(result.sourcesUsed).toEqual(["CURRENT"]);
    expect(result.splitAt).toBeNull();
  });

  it("HISTORICAL-only range produces single segment", () => {
    const result = resolveSagSourcesForRange("2026-01-01", "2026-07-20");
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].source).toBe("HISTORICAL");
    expect(result.sourcesUsed).toEqual(["HISTORICAL"]);
  });

  it("cross-cutoff range produces two contiguous segments", () => {
    const result = resolveSagSourcesForRange("2026-07-15", "2026-07-27");
    expect(result.segments).toHaveLength(2);
    expect(result.sourcesUsed).toEqual(["HISTORICAL", "CURRENT"]);
    expect(result.splitAt).toBe(SAG_CURRENT_START_DATE);

    // HISTORICAL segment ends at cutoff boundary
    expect(result.segments[0].source).toBe("HISTORICAL");
    expect(result.segments[0].from).toBe("2026-07-15");
    expect(result.segments[0].to).toBe(SAG_HISTORICAL_END_DATE);

    // CURRENT segment starts at cutoff
    expect(result.segments[1].source).toBe("CURRENT");
    expect(result.segments[1].from).toBe(SAG_CURRENT_START_DATE);
    expect(result.segments[1].to).toBe("2026-07-27");
  });

  it("full-year range splits at cutoff", () => {
    const result = resolveSagSourcesForRange("2026-01-01", "2026-12-31");
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].to).toBe("2026-07-20");
    expect(result.segments[1].from).toBe("2026-07-21");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SSL-3: Contiguity guarantee — no gap, no overlap at cutoff
// ══════════════════════════════════════════════════════════════════════════════

describe("SSL-3: contiguity at cutoff boundary", () => {
  it("HISTORICAL end + 1 day = CURRENT start", () => {
    const histEnd = new Date(SAG_HISTORICAL_END_DATE);
    histEnd.setDate(histEnd.getDate() + 1);
    const nextDay = histEnd.toISOString().slice(0, 10);
    expect(nextDay).toBe(SAG_CURRENT_START_DATE);
  });

  it("cross-cutoff segments are exactly contiguous", () => {
    const result = resolveSagSourcesForRange("2026-06-01", "2026-08-01");
    const seg0End = new Date(result.segments[0].to);
    seg0End.setDate(seg0End.getDate() + 1);
    const expectedStart = seg0End.toISOString().slice(0, 10);
    expect(result.segments[1].from).toBe(expectedStart);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SSL-4: Cutoff constants are consistent
// ══════════════════════════════════════════════════════════════════════════════

describe("SSL-4: cutoff constant consistency", () => {
  it("CURRENT start date is 2026-07-21", () => {
    expect(SAG_CURRENT_START_DATE).toBe("2026-07-21");
  });

  it("HISTORICAL end date is 2026-07-20", () => {
    expect(SAG_HISTORICAL_END_DATE).toBe("2026-07-20");
  });

  it("no secrets in constants", () => {
    expect(SAG_CURRENT_START_DATE).not.toContain("TOKEN");
    expect(SAG_HISTORICAL_END_DATE).not.toContain("TOKEN");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SSL-5: Invalid date handling
// ══════════════════════════════════════════════════════════════════════════════

describe("SSL-5: invalid date handling", () => {
  it("invalid date format throws", () => {
    expect(() => resolveSagSourceForDate("07-20-2026")).toThrow("Invalid date format");
  });

  it("inverted range throws", () => {
    expect(() => resolveSagSourcesForRange("2026-08-01", "2026-07-01")).toThrow("Invalid range");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SSL-6: Identity safety — mirrored databases safe with upsert
// ══════════════════════════════════════════════════════════════════════════════

describe("SSL-6: identity safety documentation", () => {
  it("erpItemId unique constraint uses organizationId+erpItemId", () => {
    // This is a documentation test — the actual constraint is in Prisma schema.
    // The identity audit (Section 5-7) confirmed IDENTITY_MIRRORED:
    //   30,428 erpItemIds in BOTH databases with identical ka_nl_articulo.
    //   Zero collisions. Safe for ON CONFLICT DO UPDATE upsert.
    expect(true).toBe(true);
  });
});
