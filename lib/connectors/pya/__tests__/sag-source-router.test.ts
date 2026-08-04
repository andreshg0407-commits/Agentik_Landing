/**
 * lib/connectors/pya/__tests__/sag-source-router.test.ts
 *
 * AGENTIK-SAG-DUAL-DATABASE-ROUTER-01
 *
 * Comprehensive test suite for the SAG dual-database source router.
 * Pure unit tests — no DB, no SOAP, no network. 100% deterministic.
 *
 * Sections:
 *   C1–C6: Connection resolver
 *   D1–D6: Date routing
 *   R1–R7: Range routing
 *   G1:    No gap / no overlap guardian
 *   L1–L2: Legacy compatibility
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getSagConnection,
  getLegacySagConnection,
  describeSagConnection,
  resolveSagSourceForDate,
  resolveSagSourcesForRange,
  SAG_CURRENT_START_DATE,
  SAG_HISTORICAL_END_DATE,
} from "../sag-source-router";

// ══════════════════════════════════════════════════════════════════════════════
// Env fixture helpers
// ══════════════════════════════════════════════════════════════════════════════

const FIXTURE_ENV = {
  PYA_SAG_BD_CURRENT: "INDDIANAA_INDU-LUDISAM",
  PYA_SOAP_TOKEN_CURRENT: "TOKEN-CURRENT-FAKE-1234",
  PYA_SAG_BD_HISTORICAL: "INDDIANAA_CASTILLO-ALZATE",
  PYA_SOAP_TOKEN_HISTORICAL: "TOKEN-HISTORICAL-FAKE-5678",
  PYA_SOAP_ENDPOINT: "http://test.example.com/soap",
  // Legacy
  PYA_SAG_BD: "INDDIANAA_LEGACY-DB",
  PYA_SOAP_TOKEN: "TOKEN-LEGACY-FAKE-9999",
} as const;

type EnvKey = keyof typeof FIXTURE_ENV;

let savedEnv: Record<string, string | undefined>;

function setTestEnv(overrides: Partial<Record<EnvKey, string | undefined>> = {}): void {
  const env = { ...FIXTURE_ENV, ...overrides };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function saveEnv(): void {
  savedEnv = {};
  for (const key of Object.keys(FIXTURE_ENV)) {
    savedEnv[key] = process.env[key];
  }
}

function restoreEnv(): void {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// C: Connection resolver tests
// ══════════════════════════════════════════════════════════════════════════════

describe("Connection resolver", () => {
  beforeEach(() => saveEnv());
  afterEach(() => restoreEnv());

  it("C1: CURRENT uses current DB + current token", () => {
    setTestEnv();
    const config = getSagConnection("CURRENT");
    expect(config.database).toBe("INDDIANAA_INDU-LUDISAM");
    expect(config.token).toBe("TOKEN-CURRENT-FAKE-1234");
    expect(config.endpointUrl).toBe("http://test.example.com/soap");
  });

  it("C2: HISTORICAL uses historical DB + historical token", () => {
    setTestEnv();
    const config = getSagConnection("HISTORICAL");
    expect(config.database).toBe("INDDIANAA_CASTILLO-ALZATE");
    expect(config.token).toBe("TOKEN-HISTORICAL-FAKE-5678");
    expect(config.endpointUrl).toBe("http://test.example.com/soap");
  });

  it("C3: no cross-token contamination", () => {
    setTestEnv();
    const current = getSagConnection("CURRENT");
    const historical = getSagConnection("HISTORICAL");

    // CURRENT token must NOT appear in HISTORICAL config
    expect(historical.token).not.toBe(current.token);
    expect(historical.database).not.toBe(current.database);

    // Explicit cross-check
    expect(current.token).toBe("TOKEN-CURRENT-FAKE-1234");
    expect(historical.token).toBe("TOKEN-HISTORICAL-FAKE-5678");
    expect(current.database).toBe("INDDIANAA_INDU-LUDISAM");
    expect(historical.database).toBe("INDDIANAA_CASTILLO-ALZATE");
  });

  it("C4: missing current DB fails fast", () => {
    setTestEnv({ PYA_SAG_BD_CURRENT: undefined });
    expect(() => getSagConnection("CURRENT")).toThrow("PYA_SAG_BD_CURRENT");
  });

  it("C5: missing historical token fails fast", () => {
    setTestEnv({ PYA_SOAP_TOKEN_HISTORICAL: undefined });
    expect(() => getSagConnection("HISTORICAL")).toThrow("PYA_SOAP_TOKEN_HISTORICAL");
  });

  it("C6: token never appears in serialized error or diagnostic", () => {
    setTestEnv();
    const diag = describeSagConnection("CURRENT");
    const serialized = JSON.stringify(diag);
    expect(serialized).not.toContain("TOKEN-CURRENT-FAKE-1234");
    expect(serialized).not.toContain("TOKEN-HISTORICAL-FAKE-5678");
    expect(serialized).not.toContain("TOKEN-LEGACY-FAKE-9999");

    // describeSagConnection should include source + database + endpoint
    expect(diag.source).toBe("CURRENT");
    expect(diag.database).toBe("INDDIANAA_INDU-LUDISAM");
    expect(diag.endpoint).toBe("http://test.example.com/soap");
  });

  it("C6b: error message from missing env never contains a token value", () => {
    setTestEnv({ PYA_SAG_BD_CURRENT: undefined });
    try {
      getSagConnection("CURRENT");
    } catch (e: unknown) {
      const msg = (e as Error).message;
      expect(msg).not.toContain("TOKEN");
      expect(msg).toContain("PYA_SAG_BD_CURRENT");
    }
  });

  it("C7: shared endpoint across sources", () => {
    setTestEnv();
    const current = getSagConnection("CURRENT");
    const historical = getSagConnection("HISTORICAL");
    expect(current.endpointUrl).toBe(historical.endpointUrl);
  });

  it("C8: default endpoint when PYA_SOAP_ENDPOINT is unset", () => {
    setTestEnv({ PYA_SOAP_ENDPOINT: undefined } as Record<string, string | undefined>);
    const config = getSagConnection("CURRENT");
    expect(config.endpointUrl).toBe("http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// D: Date routing tests (pure — no env needed)
// ══════════════════════════════════════════════════════════════════════════════

describe("Date routing", () => {
  it("D1: 2026-07-19 → HISTORICAL", () => {
    expect(resolveSagSourceForDate("2026-07-19")).toBe("HISTORICAL");
  });

  it("D2: 2026-07-20 (boundary) → HISTORICAL", () => {
    expect(resolveSagSourceForDate("2026-07-20")).toBe("HISTORICAL");
  });

  it("D3: 2026-07-21 (boundary) → CURRENT", () => {
    expect(resolveSagSourceForDate("2026-07-21")).toBe("CURRENT");
  });

  it("D4: 2026-07-22 → CURRENT", () => {
    expect(resolveSagSourceForDate("2026-07-22")).toBe("CURRENT");
  });

  it("D5: different year historical (2020-01-15) → HISTORICAL", () => {
    expect(resolveSagSourceForDate("2020-01-15")).toBe("HISTORICAL");
  });

  it("D6: future date (2027-12-31) → CURRENT", () => {
    expect(resolveSagSourceForDate("2027-12-31")).toBe("CURRENT");
  });

  it("D7: invalid date format rejects", () => {
    expect(() => resolveSagSourceForDate("07/20/2026")).toThrow("Invalid date format");
    expect(() => resolveSagSourceForDate("2026-7-20")).toThrow("Invalid date format");
    expect(() => resolveSagSourceForDate("")).toThrow("Invalid date format");
    expect(() => resolveSagSourceForDate("not-a-date")).toThrow("Invalid date format");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// R: Range routing tests (pure — no env needed)
// ══════════════════════════════════════════════════════════════════════════════

describe("Range routing", () => {
  it("R1: 2026-01-01 → 2026-07-20 → HISTORICAL only", () => {
    const result = resolveSagSourcesForRange("2026-01-01", "2026-07-20");
    expect(result.sourcesUsed).toEqual(["HISTORICAL"]);
    expect(result.splitAt).toBeNull();
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toEqual({
      source: "HISTORICAL",
      from: "2026-01-01",
      to: "2026-07-20",
    });
  });

  it("R2: 2026-07-21 → 2026-08-04 → CURRENT only", () => {
    const result = resolveSagSourcesForRange("2026-07-21", "2026-08-04");
    expect(result.sourcesUsed).toEqual(["CURRENT"]);
    expect(result.splitAt).toBeNull();
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toEqual({
      source: "CURRENT",
      from: "2026-07-21",
      to: "2026-08-04",
    });
  });

  it("R3: 2026-07-01 → 2026-07-31 → two exact segments", () => {
    const result = resolveSagSourcesForRange("2026-07-01", "2026-07-31");
    expect(result.sourcesUsed).toEqual(["HISTORICAL", "CURRENT"]);
    expect(result.splitAt).toBe("2026-07-21");
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]).toEqual({
      source: "HISTORICAL",
      from: "2026-07-01",
      to: "2026-07-20",
    });
    expect(result.segments[1]).toEqual({
      source: "CURRENT",
      from: "2026-07-21",
      to: "2026-07-31",
    });
  });

  it("R4: single day 2026-07-20 → HISTORICAL", () => {
    const result = resolveSagSourcesForRange("2026-07-20", "2026-07-20");
    expect(result.sourcesUsed).toEqual(["HISTORICAL"]);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].source).toBe("HISTORICAL");
  });

  it("R5: single day 2026-07-21 → CURRENT", () => {
    const result = resolveSagSourcesForRange("2026-07-21", "2026-07-21");
    expect(result.sourcesUsed).toEqual(["CURRENT"]);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].source).toBe("CURRENT");
  });

  it("R6: from > to → error", () => {
    expect(() =>
      resolveSagSourcesForRange("2026-08-01", "2026-07-01")
    ).toThrow("Invalid range");
  });

  it("R7: no overlap/no missing day at cutoff", () => {
    const result = resolveSagSourcesForRange("2020-01-01", "2027-12-31");
    expect(result.segments).toHaveLength(2);

    const [hist, curr] = result.segments;

    // HISTORICAL ends at exactly 2026-07-20
    expect(hist.to).toBe("2026-07-20");

    // CURRENT starts at exactly 2026-07-21
    expect(curr.from).toBe("2026-07-21");

    // Verify contiguity: next day after hist.to === curr.from
    const histEnd = new Date(hist.to + "T00:00:00Z");
    const currStart = new Date(curr.from + "T00:00:00Z");
    const diffMs = currStart.getTime() - histEnd.getTime();
    expect(diffMs).toBe(86_400_000); // exactly 1 day
  });

  it("R8: invalid date in range rejects", () => {
    expect(() => resolveSagSourcesForRange("bad", "2026-08-01")).toThrow("Invalid date format");
    expect(() => resolveSagSourcesForRange("2026-01-01", "bad")).toThrow("Invalid date format");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// G: No gap / no overlap guardian
// ══════════════════════════════════════════════════════════════════════════════

describe("Cutoff contiguity guardian", () => {
  it("G1: HISTORICAL_END_DATE + 1 day === CURRENT_START_DATE", () => {
    const histEnd = new Date(SAG_HISTORICAL_END_DATE + "T00:00:00Z");
    const currStart = new Date(SAG_CURRENT_START_DATE + "T00:00:00Z");

    const diffMs = currStart.getTime() - histEnd.getTime();
    expect(diffMs).toBe(86_400_000); // exactly 1 day — no gap, no overlap
  });

  it("G2: constants are consistent strings", () => {
    expect(SAG_HISTORICAL_END_DATE).toBe("2026-07-20");
    expect(SAG_CURRENT_START_DATE).toBe("2026-07-21");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// L: Legacy compatibility
// ══════════════════════════════════════════════════════════════════════════════

describe("Legacy compatibility", () => {
  beforeEach(() => saveEnv());
  afterEach(() => restoreEnv());

  it("L1: getLegacySagConnection() uses legacy env vars", () => {
    setTestEnv();
    const config = getLegacySagConnection();
    expect(config.database).toBe("INDDIANAA_LEGACY-DB");
    expect(config.token).toBe("TOKEN-LEGACY-FAKE-9999");
    expect(config.endpointUrl).toBe("http://test.example.com/soap");
  });

  it("L2: getLegacySagConnection() fails when legacy DB missing", () => {
    setTestEnv({ PYA_SAG_BD: undefined } as Record<string, string | undefined>);
    expect(() => getLegacySagConnection()).toThrow("PYA_SAG_BD");
  });

  it("L3: getLegacySagConnection() fails when legacy token missing", () => {
    setTestEnv({
      PYA_SOAP_TOKEN: undefined,
      // Also clear SAG_TEST_TOKEN fallback
    } as Record<string, string | undefined>);
    // Clear SAG_TEST_TOKEN too
    delete process.env.SAG_TEST_TOKEN;
    expect(() => getLegacySagConnection()).toThrow("token");
  });
});
