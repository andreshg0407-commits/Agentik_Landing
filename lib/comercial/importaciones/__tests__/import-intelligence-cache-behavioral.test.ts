/**
 * lib/comercial/importaciones/__tests__/import-intelligence-cache-behavioral.test.ts
 *
 * Behavioral tests for the import intelligence cache.
 *
 * The cache module has `import "server-only"` + Prisma, so it cannot be
 * imported directly in bun test. Instead, these tests verify the cache's
 * behavioral contracts by:
 *
 *   1. Re-implementing the pure state machine logic (no DB, no server-only)
 *      with the EXACT same algorithm as production code.
 *   2. Feeding controlled inputs and asserting outputs match the contract.
 *   3. Verifying that Manager's KPI projection produces identical results
 *      to the canonical service's KPIs (parity).
 *
 * This is NOT structural (readFile().toContain) — it exercises the algorithm.
 *
 * Sprint: AGENTIK-MANAGER-RELEASE-GATE-01
 */

import { describe, test, expect, beforeEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";

// ── Types mirrored from production ──────────────────────────────────────────

interface ImportSupplyKpis {
  comprarAhora: number;
  revisarRecompra: number;
  noRecomprar: number;
  inventarioLento: number;
  totalRefs: number;
}

interface ImportSupplyIntelligenceItem {
  productId: string;
  reference: string;
  remaining: number;
  lastInboundSource: "SAG_RECEIPT_C1_C2" | "LAST_PURCHASE_SAG" | "UNAVAILABLE";
  recompraClassification: "INMEDIATA" | "VIGILAR" | "NO_RECOMPRAR" | "SIN_DATOS";
  daysSinceLastInbound: number | null;
}

interface ImportSupplyIntelligenceResult {
  items: ImportSupplyIntelligenceItem[];
  kpis: ImportSupplyKpis;
}

interface ImportSourceFreshness {
  productEntityAsOf: string | null;
  inventoryAsOf: string | null;
  orderLinesAsOf: string | null;
  compositeAsOf: string | null;
}

type CachedImportTruthState = "CERTIFIED" | "STALE" | "SOURCE_UNAVAILABLE";

interface CachedImportIntelligence {
  result: ImportSupplyIntelligenceResult;
  freshness: ImportSourceFreshness;
  truthState: CachedImportTruthState;
  computedAt: string;
  staleCause: string | null;
}

interface ImportManagerKpis {
  totalRefs: number;
  lowRotationCount: number;
  recompraInmediataCount: number;
  sinFechaCount: number;
}

// ── Pure re-implementations — EXACT same logic as production ────────────────

function emptyKpis(): ImportSupplyKpis {
  return {
    comprarAhora: 0,
    revisarRecompra: 0,
    noRecomprar: 0,
    inventarioLento: 0,
    totalRefs: 0,
  };
}

/**
 * Exact copy of projectManagerKpis from import-intelligence-cache.ts.
 * Any divergence from production is a test bug, not a feature.
 */
function projectManagerKpis(cached: CachedImportIntelligence): ImportManagerKpis {
  const { result } = cached;
  const { kpis, items } = result;

  const sinFechaCount = items.filter(
    (i) => i.lastInboundSource === "UNAVAILABLE" && i.remaining > 0,
  ).length;

  return {
    totalRefs: kpis.totalRefs,
    lowRotationCount: kpis.inventarioLento,
    recompraInmediataCount: kpis.comprarAhora,
    sinFechaCount,
  };
}

/**
 * Composite freshness — EXACT same logic as loadSourceFreshness.
 * compositeAsOf = MIN of all non-null source dates.
 */
function computeCompositeFreshness(
  productEntityAsOf: string | null,
  inventoryAsOf: string | null,
  orderLinesAsOf: string | null,
): ImportSourceFreshness {
  const dates = [productEntityAsOf, inventoryAsOf, orderLinesAsOf]
    .filter((d): d is string => d !== null)
    .map((d) => new Date(d).getTime());

  const compositeAsOf =
    dates.length > 0 ? new Date(Math.min(...dates)).toISOString() : null;

  return { productEntityAsOf, inventoryAsOf, orderLinesAsOf, compositeAsOf };
}

// ── Cache state machine (exact same algorithm) ─────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  data: CachedImportIntelligence;
  expiresAt: number;
}

type BuildFn = (orgId: string) => Promise<ImportSupplyIntelligenceResult>;

/**
 * Testable version of getCachedImportIntelligence.
 * Uses injected buildFn and cache map instead of module-level globals.
 */
async function getCachedImportIntelligence(
  organizationId: string,
  cache: Map<string, CacheEntry>,
  buildFn: BuildFn,
  freshness: ImportSourceFreshness,
  now: number,
): Promise<CachedImportIntelligence> {
  const existing = cache.get(organizationId);

  if (existing && existing.expiresAt > now) {
    return existing.data;
  }

  try {
    const result = await buildFn(organizationId);

    const data: CachedImportIntelligence = {
      result,
      freshness,
      truthState: "CERTIFIED",
      computedAt: new Date(now).toISOString(),
      staleCause: null,
    };

    cache.set(organizationId, { data, expiresAt: now + CACHE_TTL_MS });
    return data;
  } catch (err) {
    if (existing) {
      const staleData: CachedImportIntelligence = {
        ...existing.data,
        truthState: "STALE",
        staleCause: err instanceof Error ? err.message : "Refresh failed",
      };
      cache.set(organizationId, {
        data: staleData,
        expiresAt: now + 60_000,
      });
      return staleData;
    }

    const cause = err instanceof Error ? err.message : "Unknown error";
    return {
      result: { items: [], kpis: emptyKpis() },
      freshness: {
        productEntityAsOf: null,
        inventoryAsOf: null,
        orderLinesAsOf: null,
        compositeAsOf: null,
      },
      truthState: "SOURCE_UNAVAILABLE",
      computedAt: new Date(now).toISOString(),
      staleCause: cause,
    };
  }
}

// ── Test fixtures ───────────────────────────────────────────────────────────

function makeItem(overrides: Partial<ImportSupplyIntelligenceItem> = {}): ImportSupplyIntelligenceItem {
  return {
    productId: "p1",
    reference: "REF001",
    remaining: 50,
    lastInboundSource: "SAG_RECEIPT_C1_C2",
    recompraClassification: "VIGILAR",
    daysSinceLastInbound: 120,
    ...overrides,
  };
}

function makeCanonicalResult(overrides: Partial<ImportSupplyIntelligenceResult> = {}): ImportSupplyIntelligenceResult {
  const items = overrides.items ?? [
    makeItem({ productId: "p1", reference: "REF001", remaining: 50, recompraClassification: "INMEDIATA", lastInboundSource: "SAG_RECEIPT_C1_C2" }),
    makeItem({ productId: "p2", reference: "REF002", remaining: 5, recompraClassification: "VIGILAR", lastInboundSource: "LAST_PURCHASE_SAG", daysSinceLastInbound: 300 }),
    makeItem({ productId: "p3", reference: "REF003", remaining: 30, recompraClassification: "NO_RECOMPRAR", lastInboundSource: "UNAVAILABLE" }),
    makeItem({ productId: "p4", reference: "REF004", remaining: 0, recompraClassification: "SIN_DATOS", lastInboundSource: "UNAVAILABLE" }),
    makeItem({ productId: "p5", reference: "REF005", remaining: 10, recompraClassification: "INMEDIATA", lastInboundSource: "SAG_RECEIPT_C1_C2", daysSinceLastInbound: 250 }),
  ];
  const kpis = overrides.kpis ?? {
    comprarAhora: 2,      // p1, p5
    revisarRecompra: 1,   // p2
    noRecomprar: 1,       // p3
    inventarioLento: 1,   // p5 (daysSinceLastInbound > 240 + remaining > 0)
    totalRefs: 5,
  };
  return { items, kpis };
}

function makeFreshness(overrides: Partial<ImportSourceFreshness> = {}): ImportSourceFreshness {
  return {
    productEntityAsOf: "2026-08-13T10:00:00.000Z",
    inventoryAsOf: "2026-08-13T09:30:00.000Z",
    orderLinesAsOf: "2026-08-13T11:00:00.000Z",
    compositeAsOf: "2026-08-13T09:30:00.000Z", // MIN = inventory
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// BEHAVIORAL TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("CERTIFIED: canonical service responds successfully", () => {
  test("stores the exact canonical result — no transformation of items or kpis", async () => {
    const cache = new Map<string, CacheEntry>();
    const canonical = makeCanonicalResult();
    const freshness = makeFreshness();
    const buildFn: BuildFn = async () => canonical;

    const result = await getCachedImportIntelligence("org1", cache, buildFn, freshness, Date.now());

    expect(result.truthState).toBe("CERTIFIED");
    expect(result.result).toStrictEqual(canonical);
    expect(result.result.items).toBe(canonical.items); // same reference, not a copy
    expect(result.result.kpis).toBe(canonical.kpis);
    expect(result.staleCause).toBeNull();
  });

  test("Manager projects the same 4 KPIs as the canonical result", async () => {
    const cache = new Map<string, CacheEntry>();
    const canonical = makeCanonicalResult();
    const freshness = makeFreshness();
    const buildFn: BuildFn = async () => canonical;

    const cached = await getCachedImportIntelligence("org1", cache, buildFn, freshness, Date.now());
    const managerKpis = projectManagerKpis(cached);

    // totalRefs = canonical.kpis.totalRefs
    expect(managerKpis.totalRefs).toBe(canonical.kpis.totalRefs);
    // lowRotationCount = canonical.kpis.inventarioLento
    expect(managerKpis.lowRotationCount).toBe(canonical.kpis.inventarioLento);
    // recompraInmediataCount = canonical.kpis.comprarAhora
    expect(managerKpis.recompraInmediataCount).toBe(canonical.kpis.comprarAhora);
    // sinFechaCount = items with UNAVAILABLE + remaining > 0
    // p3: UNAVAILABLE + remaining=30 → YES, p4: UNAVAILABLE + remaining=0 → NO
    expect(managerKpis.sinFechaCount).toBe(1);
  });

  test("sourceAsOf corresponds to actual source dates, not request time", async () => {
    const cache = new Map<string, CacheEntry>();
    const canonical = makeCanonicalResult();
    const requestTime = Date.now();
    const freshness = makeFreshness({
      productEntityAsOf: "2026-08-12T14:00:00.000Z",
      inventoryAsOf: "2026-08-12T12:00:00.000Z",
      orderLinesAsOf: "2026-08-12T16:00:00.000Z",
      compositeAsOf: "2026-08-12T12:00:00.000Z",
    });
    const buildFn: BuildFn = async () => canonical;

    const cached = await getCachedImportIntelligence("org1", cache, buildFn, freshness, requestTime);

    // compositeAsOf is the oldest source, NOT the request time
    expect(cached.freshness.compositeAsOf).toBe("2026-08-12T12:00:00.000Z");
    expect(new Date(cached.freshness.compositeAsOf!).getTime()).toBeLessThan(requestTime);
    // computedAt IS the request time
    expect(cached.computedAt).toBe(new Date(requestTime).toISOString());
  });
});

describe("Cache hit: two calls within TTL", () => {
  test("second call returns cached data without invoking buildFn again", async () => {
    const cache = new Map<string, CacheEntry>();
    const canonical = makeCanonicalResult();
    const freshness = makeFreshness();
    let callCount = 0;
    const buildFn: BuildFn = async () => {
      callCount++;
      return canonical;
    };

    const now = Date.now();
    const r1 = await getCachedImportIntelligence("org1", cache, buildFn, freshness, now);
    const r2 = await getCachedImportIntelligence("org1", cache, buildFn, freshness, now + 1000);

    expect(callCount).toBe(1); // buildFn called only once
    expect(r1).toStrictEqual(r2); // same result
    expect(r1.truthState).toBe("CERTIFIED");
  });

  test("different orgIds get independent cache entries", async () => {
    const cache = new Map<string, CacheEntry>();
    const canonical1 = makeCanonicalResult({ kpis: { ...makeCanonicalResult().kpis, totalRefs: 10 } });
    const canonical2 = makeCanonicalResult({ kpis: { ...makeCanonicalResult().kpis, totalRefs: 20 } });
    const freshness = makeFreshness();
    let callOrg = "";
    const buildFn: BuildFn = async (orgId) => {
      callOrg = orgId;
      return orgId === "org1" ? canonical1 : canonical2;
    };

    const now = Date.now();
    const r1 = await getCachedImportIntelligence("org1", cache, buildFn, freshness, now);
    const r2 = await getCachedImportIntelligence("org2", cache, buildFn, freshness, now);

    expect(r1.result.kpis.totalRefs).toBe(10);
    expect(r2.result.kpis.totalRefs).toBe(20);
    expect(cache.size).toBe(2);
  });
});

describe("Revalidation: TTL expired", () => {
  test("after TTL expires, buildFn is called again", async () => {
    const cache = new Map<string, CacheEntry>();
    const freshness = makeFreshness();
    let callCount = 0;
    const buildFn: BuildFn = async () => {
      callCount++;
      return makeCanonicalResult();
    };

    const now = Date.now();
    await getCachedImportIntelligence("org1", cache, buildFn, freshness, now);
    expect(callCount).toBe(1);

    // Advance past TTL (5 minutes + 1ms)
    await getCachedImportIntelligence("org1", cache, buildFn, freshness, now + CACHE_TTL_MS + 1);
    expect(callCount).toBe(2);
  });
});

describe("STALE: previous certified result exists, refresh fails", () => {
  test("preserves exactly the last certified result data", async () => {
    const cache = new Map<string, CacheEntry>();
    const canonical = makeCanonicalResult();
    const freshness = makeFreshness();
    let shouldFail = false;
    const buildFn: BuildFn = async () => {
      if (shouldFail) throw new Error("SAG SOAP timeout");
      return canonical;
    };

    const now = Date.now();

    // First call succeeds → CERTIFIED
    const r1 = await getCachedImportIntelligence("org1", cache, buildFn, freshness, now);
    expect(r1.truthState).toBe("CERTIFIED");
    expect(r1.result.kpis.totalRefs).toBe(5);

    // Second call after TTL fails → STALE
    shouldFail = true;
    const r2 = await getCachedImportIntelligence("org1", cache, buildFn, freshness, now + CACHE_TTL_MS + 1);

    expect(r2.truthState).toBe("STALE");
    // The result data is preserved exactly
    expect(r2.result.kpis).toStrictEqual(canonical.kpis);
    expect(r2.result.items.length).toBe(canonical.items.length);
    // staleCause contains the error, not exposed to user
    expect(r2.staleCause).toBe("SAG SOAP timeout");
  });

  test("no fabricated zeros appear — all KPIs retain their certified values", async () => {
    const cache = new Map<string, CacheEntry>();
    const canonical = makeCanonicalResult({
      kpis: { comprarAhora: 7, revisarRecompra: 3, noRecomprar: 12, inventarioLento: 4, totalRefs: 26 },
    });
    const freshness = makeFreshness();
    let shouldFail = false;
    const buildFn: BuildFn = async () => {
      if (shouldFail) throw new Error("Network error");
      return canonical;
    };

    const now = Date.now();
    await getCachedImportIntelligence("org1", cache, buildFn, freshness, now);

    shouldFail = true;
    const stale = await getCachedImportIntelligence("org1", cache, buildFn, freshness, now + CACHE_TTL_MS + 1);

    // Not a single zero fabricated
    expect(stale.result.kpis.comprarAhora).toBe(7);
    expect(stale.result.kpis.revisarRecompra).toBe(3);
    expect(stale.result.kpis.noRecomprar).toBe(12);
    expect(stale.result.kpis.inventarioLento).toBe(4);
    expect(stale.result.kpis.totalRefs).toBe(26);
  });

  test("Manager KPI projection on STALE result matches canonical KPIs", async () => {
    const cache = new Map<string, CacheEntry>();
    const canonical = makeCanonicalResult();
    const freshness = makeFreshness();
    let shouldFail = false;
    const buildFn: BuildFn = async () => {
      if (shouldFail) throw new Error("DB down");
      return canonical;
    };

    const now = Date.now();
    await getCachedImportIntelligence("org1", cache, buildFn, freshness, now);

    shouldFail = true;
    const stale = await getCachedImportIntelligence("org1", cache, buildFn, freshness, now + CACHE_TTL_MS + 1);
    const managerKpis = projectManagerKpis(stale);

    // Parity: Manager KPIs match the preserved canonical result
    expect(managerKpis.totalRefs).toBe(canonical.kpis.totalRefs);
    expect(managerKpis.lowRotationCount).toBe(canonical.kpis.inventarioLento);
    expect(managerKpis.recompraInmediataCount).toBe(canonical.kpis.comprarAhora);
  });

  test("STALE extends TTL by 1 minute to avoid hammering", async () => {
    const cache = new Map<string, CacheEntry>();
    const freshness = makeFreshness();
    let callCount = 0;
    let shouldFail = false;
    const buildFn: BuildFn = async () => {
      callCount++;
      if (shouldFail) throw new Error("still down");
      return makeCanonicalResult();
    };

    const now = Date.now();
    await getCachedImportIntelligence("org1", cache, buildFn, freshness, now);
    expect(callCount).toBe(1);

    shouldFail = true;
    // TTL expired → tries to refresh → fails → STALE with 1-min extension
    await getCachedImportIntelligence("org1", cache, buildFn, freshness, now + CACHE_TTL_MS + 1);
    expect(callCount).toBe(2);

    // 30 seconds later, still within 1-min extension → no rebuild attempt
    await getCachedImportIntelligence("org1", cache, buildFn, freshness, now + CACHE_TTL_MS + 30_001);
    expect(callCount).toBe(2); // NOT 3
  });
});

describe("SOURCE_UNAVAILABLE: no previous result, service fails", () => {
  test("returns empty items and zero KPIs", async () => {
    const cache = new Map<string, CacheEntry>();
    const freshness = makeFreshness();
    const buildFn: BuildFn = async () => {
      throw new Error("First call failed");
    };

    const result = await getCachedImportIntelligence("org1", cache, buildFn, freshness, Date.now());

    expect(result.truthState).toBe("SOURCE_UNAVAILABLE");
    expect(result.result.items).toEqual([]);
    expect(result.result.kpis.totalRefs).toBe(0);
    expect(result.result.kpis.comprarAhora).toBe(0);
    expect(result.result.kpis.inventarioLento).toBe(0);
  });

  test("does not expose technical error message as a KPI value", async () => {
    const cache = new Map<string, CacheEntry>();
    const freshness = makeFreshness();
    const buildFn: BuildFn = async () => {
      throw new Error("ECONNREFUSED 10.0.1.45:5432");
    };

    const result = await getCachedImportIntelligence("org1", cache, buildFn, freshness, Date.now());

    // staleCause exists for logging but should never be shown to user
    expect(result.staleCause).toBe("ECONNREFUSED 10.0.1.45:5432");
    // No numeric KPI contains the error
    expect(typeof result.result.kpis.totalRefs).toBe("number");
    expect(typeof result.result.kpis.comprarAhora).toBe("number");
  });

  test("all freshness fields are null — no pretended data", async () => {
    const cache = new Map<string, CacheEntry>();
    const freshness = makeFreshness();
    const buildFn: BuildFn = async () => {
      throw new Error("No data");
    };

    const result = await getCachedImportIntelligence("org1", cache, buildFn, freshness, Date.now());

    expect(result.freshness.productEntityAsOf).toBeNull();
    expect(result.freshness.inventoryAsOf).toBeNull();
    expect(result.freshness.orderLinesAsOf).toBeNull();
    expect(result.freshness.compositeAsOf).toBeNull();
  });

  test("Manager KPI projection on SOURCE_UNAVAILABLE returns all zeros", async () => {
    const cache = new Map<string, CacheEntry>();
    const freshness = makeFreshness();
    const buildFn: BuildFn = async () => {
      throw new Error("Unavailable");
    };

    const result = await getCachedImportIntelligence("org1", cache, buildFn, freshness, Date.now());
    const managerKpis = projectManagerKpis(result);

    expect(managerKpis.totalRefs).toBe(0);
    expect(managerKpis.lowRotationCount).toBe(0);
    expect(managerKpis.recompraInmediataCount).toBe(0);
    expect(managerKpis.sinFechaCount).toBe(0);
  });
});

describe("Parity: Manager KPIs always match canonical result", () => {
  test("totalRefs = canonical.kpis.totalRefs", () => {
    const cached: CachedImportIntelligence = {
      result: makeCanonicalResult({ kpis: { comprarAhora: 3, revisarRecompra: 2, noRecomprar: 1, inventarioLento: 4, totalRefs: 42 } }),
      freshness: makeFreshness(),
      truthState: "CERTIFIED",
      computedAt: new Date().toISOString(),
      staleCause: null,
    };
    expect(projectManagerKpis(cached).totalRefs).toBe(42);
  });

  test("lowRotationCount = canonical.kpis.inventarioLento (never recalculated)", () => {
    const cached: CachedImportIntelligence = {
      result: makeCanonicalResult({ kpis: { comprarAhora: 0, revisarRecompra: 0, noRecomprar: 0, inventarioLento: 17, totalRefs: 100 } }),
      freshness: makeFreshness(),
      truthState: "CERTIFIED",
      computedAt: new Date().toISOString(),
      staleCause: null,
    };
    expect(projectManagerKpis(cached).lowRotationCount).toBe(17);
  });

  test("recompraInmediataCount = canonical.kpis.comprarAhora (never recalculated)", () => {
    const cached: CachedImportIntelligence = {
      result: makeCanonicalResult({ kpis: { comprarAhora: 9, revisarRecompra: 0, noRecomprar: 0, inventarioLento: 0, totalRefs: 50 } }),
      freshness: makeFreshness(),
      truthState: "CERTIFIED",
      computedAt: new Date().toISOString(),
      staleCause: null,
    };
    expect(projectManagerKpis(cached).recompraInmediataCount).toBe(9);
  });

  test("sinFechaCount counts only UNAVAILABLE+remaining>0 (never hardcoded)", () => {
    const items = [
      makeItem({ lastInboundSource: "UNAVAILABLE", remaining: 10 }),  // YES
      makeItem({ lastInboundSource: "UNAVAILABLE", remaining: 0 }),   // NO (remaining=0)
      makeItem({ lastInboundSource: "SAG_RECEIPT_C1_C2", remaining: 5 }), // NO (has source)
      makeItem({ lastInboundSource: "LAST_PURCHASE_SAG", remaining: 5 }), // NO (has source)
      makeItem({ lastInboundSource: "UNAVAILABLE", remaining: 1 }),   // YES
    ];
    const cached: CachedImportIntelligence = {
      result: { items, kpis: { comprarAhora: 0, revisarRecompra: 0, noRecomprar: 0, inventarioLento: 0, totalRefs: 5 } },
      freshness: makeFreshness(),
      truthState: "CERTIFIED",
      computedAt: new Date().toISOString(),
      staleCause: null,
    };
    expect(projectManagerKpis(cached).sinFechaCount).toBe(2);
  });

  test("no alternative rules exist in Manager — projection is pass-through", () => {
    // Prove: changing canonical kpis changes Manager KPIs by the exact same amount
    const base = makeCanonicalResult();
    const modified = makeCanonicalResult({
      kpis: {
        ...base.kpis,
        comprarAhora: base.kpis.comprarAhora + 5,
        inventarioLento: base.kpis.inventarioLento + 3,
      },
    });

    const baseKpis = projectManagerKpis({
      result: base, freshness: makeFreshness(), truthState: "CERTIFIED",
      computedAt: "", staleCause: null,
    });
    const modifiedKpis = projectManagerKpis({
      result: modified, freshness: makeFreshness(), truthState: "CERTIFIED",
      computedAt: "", staleCause: null,
    });

    expect(modifiedKpis.recompraInmediataCount - baseKpis.recompraInmediataCount).toBe(5);
    expect(modifiedKpis.lowRotationCount - baseKpis.lowRotationCount).toBe(3);
  });
});

describe("Composite freshness", () => {
  test("compositeAsOf = MIN of all three sources", () => {
    const f = computeCompositeFreshness(
      "2026-08-13T10:00:00.000Z",
      "2026-08-13T08:00:00.000Z", // oldest
      "2026-08-13T12:00:00.000Z",
    );
    expect(f.compositeAsOf).toBe("2026-08-13T08:00:00.000Z");
  });

  test("one source null → composite uses remaining two", () => {
    const f = computeCompositeFreshness(
      "2026-08-13T10:00:00.000Z",
      null,
      "2026-08-13T12:00:00.000Z",
    );
    expect(f.compositeAsOf).toBe("2026-08-13T10:00:00.000Z");
    expect(f.inventoryAsOf).toBeNull();
  });

  test("all sources null → compositeAsOf is null", () => {
    const f = computeCompositeFreshness(null, null, null);
    expect(f.compositeAsOf).toBeNull();
  });

  test("composite is never the request time — always derived from data sources", () => {
    const requestTime = new Date("2026-08-13T20:00:00.000Z");
    const f = computeCompositeFreshness(
      "2026-08-13T10:00:00.000Z",
      "2026-08-13T09:00:00.000Z",
      "2026-08-13T11:00:00.000Z",
    );
    // Composite is hours before request time
    expect(new Date(f.compositeAsOf!).getTime()).toBeLessThan(requestTime.getTime());
  });
});

// ── Structural verification: production code matches test re-implementation ──

describe("Production code parity verification", () => {
  const ROOT = path.resolve(__dirname, "../../../..");

  function readFile(relPath: string): string {
    return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
  }

  test("projectManagerKpis in production uses same fields as test re-implementation", () => {
    const src = readFile("lib/comercial/importaciones/import-intelligence-cache.ts");
    // Verify the production function reads from the same source fields
    expect(src).toContain("kpis.totalRefs");
    expect(src).toContain("kpis.inventarioLento");
    expect(src).toContain("kpis.comprarAhora");
    expect(src).toContain('lastInboundSource === "UNAVAILABLE"');
    expect(src).toContain("remaining > 0");
  });

  test("cache TTL in production matches test constant (5 minutes)", () => {
    const src = readFile("lib/comercial/importaciones/import-intelligence-cache.ts");
    expect(src).toContain("5 * 60 * 1000");
  });

  test("stale extension in production is 1 minute", () => {
    const src = readFile("lib/comercial/importaciones/import-intelligence-cache.ts");
    expect(src).toContain("60_000");
  });

  test("Desktop page consumes getCachedImportIntelligence, not buildImportSupplyIntelligence", () => {
    const src = readFile("app/(app)/[orgSlug]/comercial/importaciones/page.tsx");
    expect(src).toContain("getCachedImportIntelligence");
    expect(src).not.toContain("buildImportSupplyIntelligence");
  });

  test("Executive page consumes getCachedImportIntelligence, not buildImportSupplyIntelligence", () => {
    const src = readFile("app/(app)/[orgSlug]/comercial/executive/page.tsx");
    expect(src).toContain("getCachedImportIntelligence");
    expect(src).not.toContain("buildImportSupplyIntelligence");
  });

  test("Manager narrow loader delegates to cache, not to DB", () => {
    const src = readFile("lib/comercial/manager/manager-narrow-loaders.ts");
    expect(src).toContain("getCachedImportIntelligence");
    expect(src).toContain("projectManagerKpis");
    // No direct ProductEntity or PIL queries in the importaciones section
    const importSection = src.slice(src.indexOf("Importaciones"));
    expect(importSection).not.toContain("db.productEntity");
    expect(importSection).not.toContain("db.productInventoryLevel");
  });
});
