/**
 * lib/connectors/pya/__tests__/sag-future-date-guard.test.ts
 *
 * AGENTIK-SAG-CURSOR-RESET-01
 *
 * Permanent tests for the future-date guard in movements ingestion.
 * Validates that:
 *   1. Future-dated documents are excluded from the movement cache
 *   2. Future-dated documents cannot advance the cursor
 *
 * Pure unit tests — no DB, no SOAP, no network. 100% deterministic.
 */

import { describe, it, expect } from "vitest";

// ══════════════════════════════════════════════════════════════════════════════
// The future-date guard logic (extracted from SagPyaSoapAdapter.pullMovements):
//
//   const cursorCeiling = new Date();
//   if (rec.saleDate > cursorCeiling) { futureSkipped++; continue; }
//   mapped.push(rec);
//   if (rec.saleDate.getTime() > 0 && (!latestDate || rec.saleDate > latestDate))
//     latestDate = rec.saleDate;
//
// We test the equivalent logic as a pure function.
// ══════════════════════════════════════════════════════════════════════════════

interface MockMovement {
  saleDate: Date;
  label: string;
}

/**
 * Simulates the cache-fill loop from pullMovements with future-date guard.
 */
function applyFutureDateGuard(
  records: MockMovement[],
  asOfDate: Date,
): { eligible: MockMovement[]; futureSkipped: number; latestDate: Date | null } {
  let latestDate: Date | null = null;
  const eligible: MockMovement[] = [];
  let futureSkipped = 0;

  for (const rec of records) {
    if (rec.saleDate > asOfDate) {
      futureSkipped++;
      continue;
    }
    eligible.push(rec);
    if (rec.saleDate.getTime() > 0 && (!latestDate || rec.saleDate > latestDate)) {
      latestDate = rec.saleDate;
    }
  }

  return { eligible, futureSkipped, latestDate };
}

// ══════════════════════════════════════════════════════════════════════════════
// FDG-1: Future-dated documents excluded from eligible set
// ══════════════════════════════════════════════════════════════════════════════

describe("FDG-1: future-dated documents excluded from eligible set", () => {
  const asOf = new Date("2026-08-04T20:00:00.000Z");

  it("document dated 2026-08-31 is excluded", () => {
    const records: MockMovement[] = [
      { saleDate: new Date("2026-08-01"), label: "valid" },
      { saleDate: new Date("2026-08-31"), label: "future" },
      { saleDate: new Date("2026-07-23"), label: "valid-old" },
    ];
    const result = applyFutureDateGuard(records, asOf);
    expect(result.eligible).toHaveLength(2);
    expect(result.futureSkipped).toBe(1);
    expect(result.eligible.map(r => r.label)).toEqual(["valid", "valid-old"]);
  });

  it("all valid documents pass through", () => {
    const records: MockMovement[] = [
      { saleDate: new Date("2026-07-21"), label: "a" },
      { saleDate: new Date("2026-08-04"), label: "b" },
      { saleDate: new Date("2020-01-01"), label: "c" },
    ];
    const result = applyFutureDateGuard(records, asOf);
    expect(result.eligible).toHaveLength(3);
    expect(result.futureSkipped).toBe(0);
  });

  it("multiple future-dated documents all excluded", () => {
    const records: MockMovement[] = [
      { saleDate: new Date("2026-09-01"), label: "future1" },
      { saleDate: new Date("2027-01-15"), label: "future2" },
      { saleDate: new Date("2026-08-04"), label: "valid" },
    ];
    const result = applyFutureDateGuard(records, asOf);
    expect(result.eligible).toHaveLength(1);
    expect(result.futureSkipped).toBe(2);
    expect(result.eligible[0].label).toBe("valid");
  });

  it("empty input yields empty output", () => {
    const result = applyFutureDateGuard([], asOf);
    expect(result.eligible).toHaveLength(0);
    expect(result.futureSkipped).toBe(0);
    expect(result.latestDate).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FDG-2: Future-dated documents cannot advance cursor
// ══════════════════════════════════════════════════════════════════════════════

describe("FDG-2: future-dated documents cannot advance cursor", () => {
  const asOf = new Date("2026-08-04T20:00:00.000Z");

  it("latestDate is capped to valid documents only", () => {
    const records: MockMovement[] = [
      { saleDate: new Date("2026-08-04"), label: "valid-latest" },
      { saleDate: new Date("2026-08-31"), label: "future" },
      { saleDate: new Date("2026-07-23"), label: "valid-old" },
    ];
    const result = applyFutureDateGuard(records, asOf);
    expect(result.latestDate).toEqual(new Date("2026-08-04"));
  });

  it("latestDate is null when all documents are future-dated", () => {
    const records: MockMovement[] = [
      { saleDate: new Date("2026-09-01"), label: "future1" },
      { saleDate: new Date("2027-06-15"), label: "future2" },
    ];
    const result = applyFutureDateGuard(records, asOf);
    expect(result.latestDate).toBeNull();
    expect(result.eligible).toHaveLength(0);
  });

  it("latestDate tracks the most recent valid date", () => {
    const records: MockMovement[] = [
      { saleDate: new Date("2026-07-01"), label: "a" },
      { saleDate: new Date("2026-08-03"), label: "b" },
      { saleDate: new Date("2026-08-04"), label: "c" },
      { saleDate: new Date("2026-08-05"), label: "future" },
    ];
    const result = applyFutureDateGuard(records, asOf);
    expect(result.latestDate).toEqual(new Date("2026-08-04"));
    expect(result.futureSkipped).toBe(1);
  });

  it("single valid document sets latestDate correctly", () => {
    const records: MockMovement[] = [
      { saleDate: new Date("2026-07-21"), label: "only-valid" },
      { saleDate: new Date("2026-12-31"), label: "future" },
    ];
    const result = applyFutureDateGuard(records, asOf);
    expect(result.latestDate).toEqual(new Date("2026-07-21"));
    expect(result.eligible).toHaveLength(1);
    expect(result.futureSkipped).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FDG-3: Edge cases at ceiling boundary
// ══════════════════════════════════════════════════════════════════════════════

describe("FDG-3: edge cases at ceiling boundary", () => {
  it("document exactly at ceiling time is eligible", () => {
    const asOf = new Date("2026-08-04T20:00:00.000Z");
    const records: MockMovement[] = [
      { saleDate: new Date("2026-08-04T20:00:00.000Z"), label: "at-ceiling" },
    ];
    const result = applyFutureDateGuard(records, asOf);
    // saleDate > asOf is false when equal — document is eligible
    expect(result.eligible).toHaveLength(1);
    expect(result.futureSkipped).toBe(0);
  });

  it("document 1ms after ceiling is excluded", () => {
    const asOf = new Date("2026-08-04T20:00:00.000Z");
    const records: MockMovement[] = [
      { saleDate: new Date("2026-08-04T20:00:00.001Z"), label: "just-after" },
    ];
    const result = applyFutureDateGuard(records, asOf);
    expect(result.eligible).toHaveLength(0);
    expect(result.futureSkipped).toBe(1);
  });
});
