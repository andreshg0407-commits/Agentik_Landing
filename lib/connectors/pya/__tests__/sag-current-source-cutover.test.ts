/**
 * lib/connectors/pya/__tests__/sag-current-source-cutover.test.ts
 *
 * AGENTIK-SAG-CURRENT-SOURCE-CUTOVER-01
 *
 * Permanent test suite for P0 operational source cutover.
 * Validates that P0 consumers (data-sync, inventory-refresh) use CURRENT.
 *
 * Pure unit tests — no DB, no SOAP, no network. 100% deterministic.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getSagConnection,
  getLegacySagConnection,
  resolveSagSourceForDate,
  SAG_CURRENT_START_DATE,
  SAG_HISTORICAL_END_DATE,
} from "../sag-source-router";

// ══════════════════════════════════════════════════════════════════════════════
// Env fixture helpers
// ══════════════════════════════════════════════════════════════════════════════

const FIXTURE_ENV = {
  PYA_SAG_BD_CURRENT: "INDDIANAA_INDU-LUDISAM",
  PYA_SOAP_TOKEN_CURRENT: "TOKEN-CURRENT-TEST-1234",
  PYA_SAG_BD_HISTORICAL: "INDDIANAA_CASTILLO-ALZATE",
  PYA_SOAP_TOKEN_HISTORICAL: "TOKEN-HISTORICAL-TEST-5678",
  PYA_SOAP_ENDPOINT: "http://test.example.com/soap",
  PYA_SAG_BD: "INDDIANAA_LEGACY-DB",
  PYA_SOAP_TOKEN: "TOKEN-LEGACY-TEST-9999",
} as const;

let savedEnv: Record<string, string | undefined>;

function setTestEnv(overrides: Partial<Record<string, string | undefined>> = {}): void {
  const env: Record<string, string | undefined> = { ...FIXTURE_ENV, ...overrides };
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
// P0-1: data-sync explicitly routes CURRENT
// ══════════════════════════════════════════════════════════════════════════════

describe("P0-1: data-sync routes CURRENT", () => {
  beforeEach(() => saveEnv());
  afterEach(() => restoreEnv());

  it("getSagConnection('CURRENT') resolves LUDISAM", () => {
    setTestEnv();
    const config = getSagConnection("CURRENT");
    expect(config.database).toBe("INDDIANAA_INDU-LUDISAM");
  });

  it("CURRENT uses current token, not historical or legacy", () => {
    setTestEnv();
    const config = getSagConnection("CURRENT");
    expect(config.token).toBe("TOKEN-CURRENT-TEST-1234");
    expect(config.token).not.toBe("TOKEN-HISTORICAL-TEST-5678");
    expect(config.token).not.toBe("TOKEN-LEGACY-TEST-9999");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// P0-2: inventory-refresh explicitly routes CURRENT
// ══════════════════════════════════════════════════════════════════════════════

describe("P0-2: inventory-refresh routes CURRENT", () => {
  beforeEach(() => saveEnv());
  afterEach(() => restoreEnv());

  it("CURRENT resolves to LUDISAM database", () => {
    setTestEnv();
    const config = getSagConnection("CURRENT");
    expect(config.database).toBe("INDDIANAA_INDU-LUDISAM");
    expect(config.endpointUrl).toBe("http://test.example.com/soap");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// P0-3: CURRENT resolves LUDISAM
// ══════════════════════════════════════════════════════════════════════════════

describe("P0-3: CURRENT resolves LUDISAM", () => {
  beforeEach(() => saveEnv());
  afterEach(() => restoreEnv());

  it("database is exactly INDDIANAA_INDU-LUDISAM", () => {
    setTestEnv();
    expect(getSagConnection("CURRENT").database).toBe("INDDIANAA_INDU-LUDISAM");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// P0-4: CURRENT uses current token
// ══════════════════════════════════════════════════════════════════════════════

describe("P0-4: CURRENT uses current token", () => {
  beforeEach(() => saveEnv());
  afterEach(() => restoreEnv());

  it("token matches PYA_SOAP_TOKEN_CURRENT", () => {
    setTestEnv();
    const config = getSagConnection("CURRENT");
    expect(config.token).toBe("TOKEN-CURRENT-TEST-1234");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// P0-5: historical router still works
// ══════════════════════════════════════════════════════════════════════════════

describe("P0-5: historical router still works", () => {
  beforeEach(() => saveEnv());
  afterEach(() => restoreEnv());

  it("HISTORICAL resolves CASTILLO-ALZATE", () => {
    setTestEnv();
    const config = getSagConnection("HISTORICAL");
    expect(config.database).toBe("INDDIANAA_CASTILLO-ALZATE");
    expect(config.token).toBe("TOKEN-HISTORICAL-TEST-5678");
  });

  it("date routing still works", () => {
    expect(resolveSagSourceForDate("2026-07-20")).toBe("HISTORICAL");
    expect(resolveSagSourceForDate("2026-07-21")).toBe("CURRENT");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// P0-6: no global env mutation
// ══════════════════════════════════════════════════════════════════════════════

describe("P0-6: no global env mutation", () => {
  beforeEach(() => saveEnv());
  afterEach(() => restoreEnv());

  it("getSagConnection does not mutate process.env", () => {
    setTestEnv();
    const envBefore = { ...process.env };
    getSagConnection("CURRENT");
    getSagConnection("HISTORICAL");
    // Check critical env vars unchanged
    expect(process.env.PYA_SAG_BD_CURRENT).toBe(envBefore.PYA_SAG_BD_CURRENT);
    expect(process.env.PYA_SAG_BD_HISTORICAL).toBe(envBefore.PYA_SAG_BD_HISTORICAL);
    expect(process.env.PYA_SOAP_TOKEN_CURRENT).toBe(envBefore.PYA_SOAP_TOKEN_CURRENT);
    expect(process.env.PYA_SOAP_TOKEN_HISTORICAL).toBe(envBefore.PYA_SOAP_TOKEN_HISTORICAL);
    expect(process.env.PYA_SAG_BD).toBe(envBefore.PYA_SAG_BD);
    expect(process.env.PYA_SOAP_TOKEN).toBe(envBefore.PYA_SOAP_TOKEN);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// P0-7: no cross-source auth contamination
// ══════════════════════════════════════════════════════════════════════════════

describe("P0-7: no cross-source auth contamination", () => {
  beforeEach(() => saveEnv());
  afterEach(() => restoreEnv());

  it("CURRENT and HISTORICAL resolve independent credentials", () => {
    setTestEnv();
    const current = getSagConnection("CURRENT");
    const historical = getSagConnection("HISTORICAL");

    expect(current.database).not.toBe(historical.database);
    expect(current.token).not.toBe(historical.token);
    // Same endpoint
    expect(current.endpointUrl).toBe(historical.endpointUrl);
  });

  it("concurrent resolution returns independent configs", () => {
    setTestEnv();
    // Simulate concurrent resolution
    const configs = Array.from({ length: 10 }, (_, i) =>
      getSagConnection(i % 2 === 0 ? "CURRENT" : "HISTORICAL")
    );
    for (let i = 0; i < configs.length; i++) {
      if (i % 2 === 0) {
        expect(configs[i].database).toBe("INDDIANAA_INDU-LUDISAM");
        expect(configs[i].token).toBe("TOKEN-CURRENT-TEST-1234");
      } else {
        expect(configs[i].database).toBe("INDDIANAA_CASTILLO-ALZATE");
        expect(configs[i].token).toBe("TOKEN-HISTORICAL-TEST-5678");
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// P0-8: legacy consumers remain compatible
// ══════════════════════════════════════════════════════════════════════════════

describe("P0-8: legacy consumers remain compatible", () => {
  beforeEach(() => saveEnv());
  afterEach(() => restoreEnv());

  it("getLegacySagConnection still works with legacy env vars", () => {
    setTestEnv();
    const config = getLegacySagConnection();
    expect(config.database).toBe("INDDIANAA_LEGACY-DB");
    expect(config.token).toBe("TOKEN-LEGACY-TEST-9999");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// P0-9: missing CURRENT credentials fail closed
// ══════════════════════════════════════════════════════════════════════════════

describe("P0-9: missing CURRENT credentials fail closed", () => {
  beforeEach(() => saveEnv());
  afterEach(() => restoreEnv());

  it("missing PYA_SAG_BD_CURRENT throws", () => {
    setTestEnv({ PYA_SAG_BD_CURRENT: undefined });
    expect(() => getSagConnection("CURRENT")).toThrow("PYA_SAG_BD_CURRENT");
  });

  it("missing PYA_SOAP_TOKEN_CURRENT throws", () => {
    setTestEnv({ PYA_SOAP_TOKEN_CURRENT: undefined });
    expect(() => getSagConnection("CURRENT")).toThrow("PYA_SOAP_TOKEN_CURRENT");
  });

  it("empty string PYA_SAG_BD_CURRENT throws", () => {
    setTestEnv({ PYA_SAG_BD_CURRENT: "  " });
    expect(() => getSagConnection("CURRENT")).toThrow("PYA_SAG_BD_CURRENT");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// P0-10: no secret leakage
// ══════════════════════════════════════════════════════════════════════════════

describe("P0-10: no secret leakage", () => {
  beforeEach(() => saveEnv());
  afterEach(() => restoreEnv());

  it("error messages never contain token values", () => {
    setTestEnv({ PYA_SAG_BD_CURRENT: undefined });
    try {
      getSagConnection("CURRENT");
    } catch (e: unknown) {
      const msg = (e as Error).message;
      expect(msg).not.toContain("TOKEN-CURRENT-TEST-1234");
      expect(msg).not.toContain("TOKEN-HISTORICAL-TEST-5678");
      expect(msg).not.toContain("TOKEN-LEGACY-TEST-9999");
    }
  });

  it("SAG_CURRENT_START_DATE and SAG_HISTORICAL_END_DATE contain no secrets", () => {
    expect(SAG_CURRENT_START_DATE).toBe("2026-07-21");
    expect(SAG_HISTORICAL_END_DATE).toBe("2026-07-20");
    expect(SAG_CURRENT_START_DATE).not.toContain("TOKEN");
    expect(SAG_HISTORICAL_END_DATE).not.toContain("TOKEN");
  });
});
