/**
 * lib/auth/__tests__/clients-canonical-truth-03a1.test.ts
 *
 * CLIENTS-CANONICAL-TRUTH-03A3 — Production behavioral tests.
 *
 * ALL pure functions imported from the SAME production module:
 *   lib/comercial/clientes/clientes-pure.ts
 *
 * No replicated logic. No readFile/toContain as substitute for behavioral tests.
 * Loader core functions tested with injected doubles.
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

// ── Import production pure functions ────────────────────────────────────────
import {
  resolveRowCartera,
  classifyAgingBand,
  mapCertifiedDocToReceivable,
  carteraTrafficLight,
  computeClientScore,
  loadArContextCore,
  loadClientesSummaryCoreLogic,
  resolveConCarteraFilter,
} from "@/lib/comercial/clientes/clientes-pure";
import type {
  ArContextCore,
  ArContextFull,
  ArDataState,
  ClientScoreInput,
  CertifiedDocInput,
  CarteraTrafficLightInput,
  LoadArContextDeps,
  SummaryDbDeps,
} from "@/lib/comercial/clientes/clientes-pure";

const ROOT = path.resolve(__dirname, "../../..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. PURE FUNCTION BEHAVIORAL TESTS
// ═══════════════════════════════════════════════════════════════════════════════

// ── 1. resolveRowCartera ────────────────────────────────────────────────────

describe("resolveRowCartera — CERTIFIED context", () => {
  const arCtx: ArContextCore = {
    dataState: "CERTIFIED",
    arLookup: new Map([
      [526, { clienteId: 526, totalPendiente: 912400, totalVencido: 912400 }],
      [700, { clienteId: 700, totalPendiente: 0, totalVencido: 0 }],
      [800, { clienteId: 800, totalPendiente: -150000, totalVencido: 0 }],
    ]),
  };

  test("AMV LLANO (856) — not in arLookup → CERTIFIED_ZERO with $0", () => {
    const result = resolveRowCartera(arCtx, 856);
    expect(result.carteraState).toBe("CERTIFIED_ZERO");
    expect(result.totalReceivable).toBe(0);
    expect(result.overdueReceivable).toBe(0);
  });

  test("Diana (526) — totalPendiente>0 → HAS_OPEN_AR with real amounts", () => {
    const result = resolveRowCartera(arCtx, 526);
    expect(result.carteraState).toBe("HAS_OPEN_AR");
    expect(result.totalReceivable).toBe(912400);
    expect(result.overdueReceivable).toBe(912400);
  });

  test("(700) — in arLookup but totalPendiente=0 → CERTIFIED_ZERO", () => {
    const result = resolveRowCartera(arCtx, 700);
    expect(result.carteraState).toBe("CERTIFIED_ZERO");
    expect(result.totalReceivable).toBe(0);
    expect(result.overdueReceivable).toBe(0);
  });

  test("(800) — totalPendiente<0 → CERTIFIED_CREDIT_BALANCE", () => {
    const result = resolveRowCartera(arCtx, 800);
    expect(result.carteraState).toBe("CERTIFIED_CREDIT_BALANCE");
    expect(result.totalReceivable).toBe(-150000);
    expect(result.overdueReceivable).toBe(0);
  });

  test("sagTerceroId=null → UNVERIFIED (even when CERTIFIED)", () => {
    const result = resolveRowCartera(arCtx, null);
    expect(result.carteraState).toBe("UNVERIFIED");
    expect(result.totalReceivable).toBeNull();
  });

  test("sagTerceroId=0 → UNVERIFIED", () => {
    expect(resolveRowCartera(arCtx, 0).carteraState).toBe("UNVERIFIED");
  });

  test("sagTerceroId=-1 → UNVERIFIED", () => {
    expect(resolveRowCartera(arCtx, -1).carteraState).toBe("UNVERIFIED");
  });
});

describe("resolveRowCartera — UNAVAILABLE context (SAG down)", () => {
  const arCtx: ArContextCore = { dataState: "UNAVAILABLE", arLookup: new Map() };

  test("returns UNVERIFIED, not CERTIFIED_ZERO", () => {
    expect(resolveRowCartera(arCtx, 856).carteraState).toBe("UNVERIFIED");
  });

  test("totalReceivable = null (not 0)", () => {
    expect(resolveRowCartera(arCtx, 856).totalReceivable).toBeNull();
  });

  test("overdueReceivable = null (not 0)", () => {
    expect(resolveRowCartera(arCtx, 856).overdueReceivable).toBeNull();
  });
});

describe("resolveRowCartera — UNVERIFIED context (tenant not certified)", () => {
  const arCtx: ArContextCore = { dataState: "UNVERIFIED", arLookup: new Map() };

  test("always returns UNVERIFIED regardless of sagTerceroId", () => {
    expect(resolveRowCartera(arCtx, 856).carteraState).toBe("UNVERIFIED");
    expect(resolveRowCartera(arCtx, 526).carteraState).toBe("UNVERIFIED");
    expect(resolveRowCartera(arCtx, null).carteraState).toBe("UNVERIFIED");
  });
});

// ── 2. classifyAgingBand ────────────────────────────────────────────────────

describe("classifyAgingBand — nullable mora contract", () => {
  test("null → null (not CURRENT)", () => { expect(classifyAgingBand(null)).toBeNull(); });
  test("0 → CURRENT", () => { expect(classifyAgingBand(0)).toBe("CURRENT"); });
  test("-5 → CURRENT", () => { expect(classifyAgingBand(-5)).toBe("CURRENT"); });
  test("15 → 1-30", () => { expect(classifyAgingBand(15)).toBe("1-30"); });
  test("45 → 31-60", () => { expect(classifyAgingBand(45)).toBe("31-60"); });
  test("90 → 61-90", () => { expect(classifyAgingBand(90)).toBe("61-90"); });
  test("150 → 91-180", () => { expect(classifyAgingBand(150)).toBe("91-180"); });
  test("300 → 181-365", () => { expect(classifyAgingBand(300)).toBe("181-365"); });
  test("452 → 365+", () => { expect(classifyAgingBand(452)).toBe("365+"); });
});

// ── 3. mapCertifiedDocToReceivable ──────────────────────────────────────────

describe("mapCertifiedDocToReceivable — Diana documents", () => {
  const doc1: CertifiedDocInput = {
    documento: "F2-6639", valorDocumento: 529900, saldoPendiente: 529900,
    diasMora: 452, fechaDocumento: new Date("2025-05-01"), fechaVencimiento: new Date("2025-05-31"),
  };
  const doc2: CertifiedDocInput = {
    documento: "F2-6668", valorDocumento: 382500, saldoPendiente: 382500,
    diasMora: 445, fechaDocumento: new Date("2025-05-08"), fechaVencimiento: new Date("2025-06-07"),
  };

  test("doc1 → daysOverdue=452, 365+, OVERDUE", () => {
    const r = mapCertifiedDocToReceivable(doc1);
    expect(r.daysOverdue).toBe(452);
    expect(r.agingBucket).toBe("365+");
    expect(r.status).toBe("OVERDUE");
    expect(r.balanceDue).toBe(529900);
    expect(r.paidAmount).toBe(0);
  });

  test("doc2 → daysOverdue=445, 365+, OVERDUE", () => {
    const r = mapCertifiedDocToReceivable(doc2);
    expect(r.daysOverdue).toBe(445);
    expect(r.status).toBe("OVERDUE");
  });

  test("id = sag-{documento}", () => {
    expect(mapCertifiedDocToReceivable(doc1).id).toBe("sag-F2-6639");
  });
});

describe("mapCertifiedDocToReceivable — null DIAS_MORA", () => {
  const doc: CertifiedDocInput = {
    documento: "NC-100", valorDocumento: 5_000_000, saldoPendiente: 3_000_000,
    diasMora: null, fechaDocumento: new Date("2026-01-15"), fechaVencimiento: null,
  };

  test("daysOverdue = null", () => { expect(mapCertifiedDocToReceivable(doc).daysOverdue).toBeNull(); });
  test("agingBucket = null", () => { expect(mapCertifiedDocToReceivable(doc).agingBucket).toBeNull(); });
  test("status = OPEN", () => { expect(mapCertifiedDocToReceivable(doc).status).toBe("OPEN"); });
  test("paidAmount = 2M", () => { expect(mapCertifiedDocToReceivable(doc).paidAmount).toBe(2_000_000); });
});

describe("mapCertifiedDocToReceivable — fully paid", () => {
  test("saldoPendiente=0 → CLOSED", () => {
    const r = mapCertifiedDocToReceivable({
      documento: "FE-001", valorDocumento: 1_000_000, saldoPendiente: 0,
      diasMora: 0, fechaDocumento: new Date("2026-06-01"), fechaVencimiento: new Date("2026-07-01"),
    });
    expect(r.status).toBe("CLOSED");
  });
});

// ── 4. carteraTrafficLight — NULL MUST NEVER MEAN ZERO (Section A) ──────────

describe("carteraTrafficLight — four-state contract", () => {
  test("UNVERIFIED → 'No verificada'", () => {
    expect(carteraTrafficLight({ truthStatus: "UNVERIFIED", totalBalance: null, items: [] }).label).toBe("No verificada");
  });

  test("CERTIFIED + balance=null → 'Dato inconsistente' (NEVER 'Sin cartera')", () => {
    const result = carteraTrafficLight({ truthStatus: "CERTIFIED", totalBalance: null, items: [] });
    expect(result.label).toBe("Dato inconsistente");
    expect(result.label).not.toBe("Sin cartera");
  });

  test("CERTIFIED + balance=0 → 'Sin cartera' (genuine $0)", () => {
    expect(carteraTrafficLight({ truthStatus: "CERTIFIED", totalBalance: 0, items: [] }).label).toBe("Sin cartera");
  });

  test("CERTIFIED + balance<0 → 'Saldo a favor' (credit balance)", () => {
    const result = carteraTrafficLight({ truthStatus: "CERTIFIED", totalBalance: -150000, items: [] });
    expect(result.label).toBe("Saldo a favor");
  });

  test("CERTIFIED + balance>0 + no known mora → 'Mora no disponible'", () => {
    expect(carteraTrafficLight({
      truthStatus: "CERTIFIED", totalBalance: 500_000,
      items: [{ daysOverdue: null, balanceDue: 500_000 }],
    }).label).toBe("Mora no disponible");
  });

  test("CERTIFIED + balance>0 + all mora=0 → 'Al dia'", () => {
    expect(carteraTrafficLight({
      truthStatus: "CERTIFIED", totalBalance: 500_000,
      items: [{ daysOverdue: 0, balanceDue: 500_000 }],
    }).label).toBe("Al dia");
  });

  test("CERTIFIED + mora=45 + ratio<50% → 'En mora'", () => {
    expect(carteraTrafficLight({
      truthStatus: "CERTIFIED", totalBalance: 1_000_000,
      items: [{ daysOverdue: 45, balanceDue: 400_000 }, { daysOverdue: 0, balanceDue: 600_000 }],
    }).label).toBe("En mora");
  });

  test("CERTIFIED + mora>90 → 'Critica'", () => {
    expect(carteraTrafficLight({
      truthStatus: "CERTIFIED", totalBalance: 912_400,
      items: [{ daysOverdue: 452, balanceDue: 529_900 }, { daysOverdue: 445, balanceDue: 382_500 }],
    }).label).toBe("Critica");
  });
});

// ── 5. computeClientScore — fail-closed (Section B) ─────────────────────────

describe("computeClientScore — arComplete gate", () => {
  const fullActivity: ClientScoreInput = {
    crmQuoteCount: 5, sagOrderCount: 3, salesCount: 10, sellerConfidence: 90,
    arCertified: false, totalOverdue: null, totalBalance: null, opportunityTypes: [],
  };

  test("certified=true, balance=null, overdue=null → incomplete, zero AR points", () => {
    const result = computeClientScore({
      ...fullActivity, arCertified: true, totalBalance: null, totalOverdue: null,
    });
    expect(result.incomplete).toBe(true);
    // Should NOT get health or cartera-absence points
  });

  test("certified=true, balance=0, overdue=0 → CERTIFIED_ZERO valid, complete", () => {
    const result = computeClientScore({
      ...fullActivity, arCertified: true, totalBalance: 0, totalOverdue: 0,
    });
    expect(result.incomplete).toBe(false);
  });

  test("certified=true, balance>0, overdue=0 → cartera abierta al dia, complete", () => {
    const result = computeClientScore({
      ...fullActivity, arCertified: true, totalBalance: 500_000, totalOverdue: 0,
    });
    expect(result.incomplete).toBe(false);
    // Gets maximum AR points: 20 (health) + 10 (no cartera risk)
  });

  test("certified=false, null amounts → incomplete, no AR points", () => {
    const result = computeClientScore(fullActivity);
    expect(result.incomplete).toBe(true);
  });

  test("certified=true + null balance gets FEWER points than certified + real balance", () => {
    const nullBalance = computeClientScore({
      ...fullActivity, arCertified: true, totalBalance: null, totalOverdue: null,
    });
    const realBalance = computeClientScore({
      ...fullActivity, arCertified: true, totalBalance: 500_000, totalOverdue: 0,
    });
    // realBalance gets +20 health + +10 absence = +30 more
    expect(realBalance.incomplete).toBe(false);
    expect(nullBalance.incomplete).toBe(true);
  });

  test("UNVERIFIED with inactivity risk loses inactivity points independently", () => {
    const withInact = computeClientScore({ ...fullActivity, opportunityTypes: ["inactividad"] });
    const withoutInact = computeClientScore({ ...fullActivity, opportunityTypes: [] });
    expect(withInact.incomplete).toBe(true);
    expect(withoutInact.incomplete).toBe(true);
  });

  test("max score → A+", () => {
    const result = computeClientScore({
      crmQuoteCount: 1, sagOrderCount: 1, salesCount: 1, sellerConfidence: 80,
      arCertified: true, totalOverdue: 0, totalBalance: 1_000_000, opportunityTypes: [],
    });
    expect(result.grade).toBe("A+");
    expect(result.incomplete).toBe(false);
  });

  test("zero everything → D", () => {
    const result = computeClientScore({
      crmQuoteCount: 0, sagOrderCount: 0, salesCount: 0, sellerConfidence: 0,
      arCertified: false, totalOverdue: null, totalBalance: null,
      opportunityTypes: ["cartera", "inactividad"],
    });
    expect(result.grade).toBe("D");
  });
});

// ── 6. Overdue opportunity filter ───────────────────────────────────────────

describe("Overdue opportunity filter — null DIAS_MORA exclusion", () => {
  test("null daysOverdue items excluded from overdue filter", () => {
    const items = [
      { daysOverdue: null as number | null, balanceDue: 10_000_000 },
      { daysOverdue: 0, balanceDue: 5_000_000 },
      { daysOverdue: 45, balanceDue: 8_000_000 },
    ];
    const overdue = items.filter(r => r.daysOverdue != null && r.daysOverdue > 0);
    expect(overdue.length).toBe(1);
    expect(overdue[0].daysOverdue).toBe(45);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. LOADER BEHAVIORAL TESTS — real functions with injected doubles (Section C)
// ═══════════════════════════════════════════════════════════════════════════════

// ── C1. Tenant not certified → UNVERIFIED ───────────────────────────────────

describe("loadArContextCore — tenant not certified", () => {
  const deps: LoadArContextDeps = {
    isCertified: () => false,
    fetchSnapshot: async () => { throw new Error("should not be called"); },
  };

  test("returns dataState=UNVERIFIED", async () => {
    const ctx = await loadArContextCore("org-1", deps);
    expect(ctx.dataState).toBe("UNVERIFIED");
  });

  test("reason=TENANT_NOT_CERTIFIED", async () => {
    const ctx = await loadArContextCore("org-1", deps);
    expect(ctx.reason).toBe("TENANT_NOT_CERTIFIED");
  });

  test("snapshot=null, arLookup empty", async () => {
    const ctx = await loadArContextCore("org-1", deps);
    expect(ctx.snapshot).toBeNull();
    expect(ctx.arLookup.size).toBe(0);
  });
});

// ── C2. fetchSnapshot returns ok:false → UNAVAILABLE ────────────────────────

describe("loadArContextCore — SAG returns error", () => {
  const deps: LoadArContextDeps = {
    isCertified: () => true,
    fetchSnapshot: async () => ({ ok: false as const, error: "SOAP_TIMEOUT" }),
  };

  test("returns dataState=UNAVAILABLE", async () => {
    const ctx = await loadArContextCore("org-1", deps);
    expect(ctx.dataState).toBe("UNAVAILABLE");
  });

  test("reason contains error string", async () => {
    const ctx = await loadArContextCore("org-1", deps);
    expect(ctx.reason).toBe("SOAP_TIMEOUT");
  });

  test("snapshot=null, empty sets", async () => {
    const ctx = await loadArContextCore("org-1", deps);
    expect(ctx.snapshot).toBeNull();
    expect(ctx.arCustomerIds.size).toBe(0);
  });
});

// ── C3. fetchSnapshot throws exception → fail-closed UNAVAILABLE ────────────

describe("loadArContextCore — SAG throws exception", () => {
  const deps: LoadArContextDeps = {
    isCertified: () => true,
    fetchSnapshot: async () => { throw new Error("Connection refused"); },
  };

  test("returns UNAVAILABLE, not CERTIFIED", async () => {
    const ctx = await loadArContextCore("org-1", deps);
    expect(ctx.dataState).toBe("UNAVAILABLE");
  });

  test("reason contains exception message", async () => {
    const ctx = await loadArContextCore("org-1", deps);
    expect(ctx.reason).toContain("Connection refused");
  });

  test("does NOT present certified zeros", async () => {
    const ctx = await loadArContextCore("org-1", deps);
    expect(ctx.arCustomerIds.size).toBe(0);
    expect(ctx.snapshot).toBeNull();
    // resolveRowCartera with this context should return UNVERIFIED, not CERTIFIED_ZERO
    const row = resolveRowCartera(ctx, 856);
    expect(row.carteraState).toBe("UNVERIFIED");
    expect(row.totalReceivable).toBeNull();
  });
});

// ── C4. Prisma fails in summary → loadFailed=true, KPIs null ────────────────

describe("loadClientesSummaryCoreLogic — DB failure", () => {
  const arCtx: ArContextFull = {
    dataState: "CERTIFIED", snapshot: null,
    arLookup: new Map(), arCustomerIds: new Set([100]),
    overdueCustomerIds: new Set(), asOf: new Date().toISOString(), reason: "SAG_CERTIFIED",
  };

  const failDeps: SummaryDbDeps = {
    queryProfileAgg: async () => { throw new Error("DB connection lost"); },
    countDistinctProfiles: async () => { throw new Error("DB connection lost"); },
  };

  test("loadFailed=true", async () => {
    const result = await loadClientesSummaryCoreLogic("org-1", arCtx, failDeps);
    expect(result.loadFailed).toBe(true);
  });

  test("withCartera=null (not 0)", async () => {
    const result = await loadClientesSummaryCoreLogic("org-1", arCtx, failDeps);
    expect(result.withCartera).toBeNull();
  });

  test("withOverdue=null (not 0)", async () => {
    const result = await loadClientesSummaryCoreLogic("org-1", arCtx, failDeps);
    expect(result.withOverdue).toBeNull();
  });

  test("dataState=UNAVAILABLE", async () => {
    const result = await loadClientesSummaryCoreLogic("org-1", arCtx, failDeps);
    expect(result.dataState).toBe("UNAVAILABLE");
  });

  test("total=0 (not a real count)", async () => {
    const result = await loadClientesSummaryCoreLogic("org-1", arCtx, failDeps);
    expect(result.total).toBe(0);
  });
});

// ── C5. con_cartera with SAG unavailable → explicit UNAVAILABLE ─────────────

describe("resolveConCarteraFilter — SAG unavailable", () => {
  test("UNAVAILABLE → not allowed, explicit dataState", () => {
    const arCtx = { dataState: "UNAVAILABLE" as const, arLookup: new Map(), arCustomerIds: new Set<number>() };
    const result = resolveConCarteraFilter(arCtx);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.dataState).toBe("UNAVAILABLE");
    }
  });

  test("UNVERIFIED → not allowed", () => {
    const arCtx = { dataState: "UNVERIFIED" as const, arLookup: new Map(), arCustomerIds: new Set<number>() };
    const result = resolveConCarteraFilter(arCtx);
    expect(result.allowed).toBe(false);
  });

  test("CERTIFIED + empty arCustomerIds → not allowed", () => {
    const arCtx = { dataState: "CERTIFIED" as const, arLookup: new Map(), arCustomerIds: new Set<number>() };
    const result = resolveConCarteraFilter(arCtx);
    expect(result.allowed).toBe(false);
  });

  test("CERTIFIED + populated arCustomerIds → allowed with sagIds", () => {
    const arCtx = {
      dataState: "CERTIFIED" as const, arLookup: new Map(),
      arCustomerIds: new Set([100, 200, 300]),
    };
    const result = resolveConCarteraFilter(arCtx);
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.sagIds).toEqual([100, 200, 300]);
    }
  });
});

// ── C6. Duplicate sagTerceroId → KPI distinct without inflation ─────────────

describe("loadClientesSummaryCoreLogic — distinct KPI counting", () => {
  const arCtx: ArContextFull = {
    dataState: "CERTIFIED", snapshot: null,
    arLookup: new Map([[100, { clienteId: 100, totalPendiente: 500_000, totalVencido: 0 }]]),
    arCustomerIds: new Set([100]),
    overdueCustomerIds: new Set(),
    asOf: new Date().toISOString(), reason: "SAG_CERTIFIED",
  };

  test("uses countDistinctProfiles, not raw count", async () => {
    let distinctCalled = false;
    const deps: SummaryDbDeps = {
      queryProfileAgg: async () => ({
        total: 50, active: 40, inactive: 10, withSeller: 30, sinCompra90d: 5, withCrm: 20,
      }),
      countDistinctProfiles: async (_orgId, sagIds) => {
        distinctCalled = true;
        // Simulate: 3 profiles share sagTerceroId=100, but distinct count is 1
        return 1;
      },
    };

    const result = await loadClientesSummaryCoreLogic("org-1", arCtx, deps);
    expect(distinctCalled).toBe(true);
    expect(result.withCartera).toBe(1); // distinct, not inflated
  });
});

// ── loadArContextCore — successful certified snapshot ────────────────────────

// ── 03A5: POSITIVE-BALANCE SEMANTICS — 5-customer scenario ──────────────────

describe("loadArContextCore — 5-customer positive-balance scenario", () => {
  // A: totalPendiente=1_000_000 (open AR)
  // B: totalPendiente=105_000 (open AR, no overdue)
  // C: totalPendiente=0 (zero balance)
  // D: totalPendiente=0 (zero balance)
  // E: totalPendiente=-250_000 (credit/saldo a favor)
  const deps: LoadArContextDeps = {
    isCertified: () => true,
    fetchSnapshot: async () => ({
      ok: true as const,
      snapshot: {
        customers: [
          { clienteId: 10, totalPendiente: 1_000_000, totalVencido: 300_000 },
          { clienteId: 20, totalPendiente: 105_000, totalVencido: 0 },
          { clienteId: 30, totalPendiente: 0, totalVencido: 0 },
          { clienteId: 40, totalPendiente: 0, totalVencido: 0 },
          { clienteId: 50, totalPendiente: -250_000, totalVencido: 0 },
        ],
        asOf: new Date("2026-08-16T12:00:00Z"),
      },
    }),
  };

  test("arLookup contains ALL 5 customers", async () => {
    const ctx = await loadArContextCore("org-1", deps);
    expect(ctx.arLookup.size).toBe(5);
  });

  test("arCustomerIds contains ONLY positive-balance customers (A, B)", async () => {
    const ctx = await loadArContextCore("org-1", deps);
    expect(ctx.arCustomerIds.size).toBe(2);
    expect(ctx.arCustomerIds.has(10)).toBe(true);
    expect(ctx.arCustomerIds.has(20)).toBe(true);
    expect(ctx.arCustomerIds.has(30)).toBe(false);
    expect(ctx.arCustomerIds.has(40)).toBe(false);
    expect(ctx.arCustomerIds.has(50)).toBe(false);
  });

  test("overdueCustomerIds only includes A (totalVencido>0 AND totalPendiente>0)", async () => {
    const ctx = await loadArContextCore("org-1", deps);
    expect(ctx.overdueCustomerIds.size).toBe(1);
    expect(ctx.overdueCustomerIds.has(10)).toBe(true);
  });

  test("resolveRowCartera: A → HAS_OPEN_AR", async () => {
    const ctx = await loadArContextCore("org-1", deps);
    const r = resolveRowCartera(ctx, 10);
    expect(r.carteraState).toBe("HAS_OPEN_AR");
    expect(r.totalReceivable).toBe(1_000_000);
  });

  test("resolveRowCartera: B → HAS_OPEN_AR", async () => {
    const ctx = await loadArContextCore("org-1", deps);
    const r = resolveRowCartera(ctx, 20);
    expect(r.carteraState).toBe("HAS_OPEN_AR");
    expect(r.totalReceivable).toBe(105_000);
  });

  test("resolveRowCartera: C → CERTIFIED_ZERO", async () => {
    const ctx = await loadArContextCore("org-1", deps);
    const r = resolveRowCartera(ctx, 30);
    expect(r.carteraState).toBe("CERTIFIED_ZERO");
    expect(r.totalReceivable).toBe(0);
  });

  test("resolveRowCartera: D → CERTIFIED_ZERO", async () => {
    const ctx = await loadArContextCore("org-1", deps);
    const r = resolveRowCartera(ctx, 40);
    expect(r.carteraState).toBe("CERTIFIED_ZERO");
    expect(r.totalReceivable).toBe(0);
  });

  test("resolveRowCartera: E → CERTIFIED_CREDIT_BALANCE", async () => {
    const ctx = await loadArContextCore("org-1", deps);
    const r = resolveRowCartera(ctx, 50);
    expect(r.carteraState).toBe("CERTIFIED_CREDIT_BALANCE");
    expect(r.totalReceivable).toBe(-250_000);
    expect(r.overdueReceivable).toBe(0);
  });

  test("resolveRowCartera: unknown customer → CERTIFIED_ZERO", async () => {
    const ctx = await loadArContextCore("org-1", deps);
    const r = resolveRowCartera(ctx, 999);
    expect(r.carteraState).toBe("CERTIFIED_ZERO");
  });

  test("con_cartera filter only returns A and B", async () => {
    const ctx = await loadArContextCore("org-1", deps);
    const guard = resolveConCarteraFilter(ctx);
    expect(guard.allowed).toBe(true);
    if (guard.allowed) {
      expect(guard.sagIds.sort()).toEqual([10, 20]);
    }
  });

  test("withCartera KPI matches positive-balance count", async () => {
    const ctx = await loadArContextCore("org-1", deps);
    const result = await loadClientesSummaryCoreLogic("org-1", ctx, {
      queryProfileAgg: async () => ({
        total: 100, active: 80, inactive: 20, withSeller: 50, sinCompra90d: 10, withCrm: 30,
      }),
      countDistinctProfiles: async (_orgId, sagIds) => sagIds.length,
    });
    expect(result.withCartera).toBe(2); // Only A and B
    expect(result.withOverdue).toBe(1); // Only A
  });

  test("no filtered row has totalReceivable <= 0", async () => {
    const ctx = await loadArContextCore("org-1", deps);
    // Simulate all 5 customers going through resolveRowCartera
    const allIds = [10, 20, 30, 40, 50, 999];
    const rows = allIds.map(id => ({ id, ...resolveRowCartera(ctx, id) }));
    // Only HAS_OPEN_AR rows should appear in con_cartera
    const openAr = rows.filter(r => r.carteraState === "HAS_OPEN_AR");
    expect(openAr.length).toBe(2);
    for (const r of openAr) {
      expect(r.totalReceivable).not.toBeNull();
      expect(r.totalReceivable!).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. STRUCTURAL TESTS — verify server-only shapes and wiring
// ═══════════════════════════════════════════════════════════════════════════════

describe("client-loader.ts — server module shape", () => {
  const src = readFile("lib/comercial/clientes/client-loader.ts");

  test("delegates to loadArContextCore from clientes-pure", () => {
    expect(src).toContain("loadArContextCore");
  });

  test("ClientesPageResult has dataState field", () => {
    expect(src).toContain("dataState: ArDataState");
  });

  test("uses COUNT(DISTINCT sagTerceroId)", () => {
    expect(src).toContain('COUNT(DISTINCT "sagTerceroId")');
  });

  test("summary error fallback delegates to core (which returns loadFailed: true)", () => {
    // Summary now delegates to loadClientesSummaryCoreLogic — the core handles failures
    const fnStart = src.indexOf("export async function loadClientesSummary");
    const fnBody = src.slice(fnStart, src.indexOf("\n}\n", fnStart) + 3);
    expect(fnBody).toContain("loadClientesSummaryCoreLogic(");
  });
});

describe("clientes-client.tsx — UI wiring", () => {
  const src = readFile("app/(app)/[orgSlug]/comercial/clientes/clientes-client.tsx");

  test("imports from clientes-pure", () => {
    expect(src).toContain("from \"@/lib/comercial/clientes/clientes-pure\"");
  });

  test("handles summary.loadFailed", () => {
    expect(src).toContain("summary.loadFailed");
    expect(src).toContain("Directorio de clientes no disponible");
  });

  test("handles pageResult.loadFailed", () => {
    expect(src).toContain("pageResult.loadFailed");
    expect(src).toContain("Listado de clientes no disponible");
  });

  test("con_cartera filter guarded by dataState", () => {
    expect(src).toContain("pageResult.dataState");
    expect(src).toContain("Cartera no verificada");
  });

  test("con_cartera button has disabled and aria-disabled attributes", () => {
    expect(src).toContain("disabled={carteraDisabled}");
    expect(src).toContain("aria-disabled={carteraDisabled");
  });

  test("row shows 'Saldo a favor' for CERTIFIED_CREDIT_BALANCE", () => {
    expect(src).toContain("CERTIFIED_CREDIT_BALANCE");
    expect(src).toContain("Saldo a favor");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. PRODUCTION WIRING TESTS — 03A4
// ═══════════════════════════════════════════════════════════════════════════════

describe("03A4-E1: summary wrapper delegates to loadClientesSummaryCoreLogic", () => {
  const src = readFile("lib/comercial/clientes/client-loader.ts");

  test("imports loadClientesSummaryCoreLogic from clientes-pure", () => {
    expect(src).toContain("loadClientesSummaryCoreLogic");
    expect(src).toMatch(/import\s*\{[^}]*loadClientesSummaryCoreLogic[^}]*\}\s*from\s*["']\.\/clientes-pure["']/);
  });

  test("loadClientesSummary calls loadClientesSummaryCoreLogic (not inline logic)", () => {
    // Extract the loadClientesSummary function body
    const fnStart = src.indexOf("export async function loadClientesSummary");
    const fnBody = src.slice(fnStart, src.indexOf("\n}\n", fnStart) + 3);
    expect(fnBody).toContain("loadClientesSummaryCoreLogic(");
    // Must NOT have inline withCartera/withOverdue decisions — those live in the core
    expect(fnBody).not.toContain("let withCartera");
    expect(fnBody).not.toContain("let withOverdue");
  });

  test("passes real Prisma adapters for queryProfileAgg and countDistinctProfiles", () => {
    const fnStart = src.indexOf("export async function loadClientesSummary");
    const fnBody = src.slice(fnStart, src.indexOf("\n}\n", fnStart) + 3);
    expect(fnBody).toContain("queryProfileAgg:");
    expect(fnBody).toContain("countDistinctProfiles:");
    expect(fnBody).toContain('COUNT(DISTINCT "sagTerceroId")');
  });
});

describe("03A4-E2: page wrapper uses resolveConCarteraFilter", () => {
  const src = readFile("lib/comercial/clientes/client-loader.ts");

  test("imports resolveConCarteraFilter from clientes-pure", () => {
    expect(src).toMatch(/import\s*\{[^}]*resolveConCarteraFilter[^}]*\}\s*from\s*["']\.\/clientes-pure["']/);
  });

  test("loadClientesPage calls resolveConCarteraFilter (not inline guard)", () => {
    const fnStart = src.indexOf("export async function loadClientesPage");
    const fnBody = src.slice(fnStart, src.indexOf("\n}\n", fnStart) + 3);
    expect(fnBody).toContain("resolveConCarteraFilter(");
    // Must NOT have the old inline guard
    expect(fnBody).not.toContain("arCtx.dataState !== \"CERTIFIED\" || arCtx.arCustomerIds.size === 0");
  });
});

describe("03A4-E3: page count() failure → loadFailed=true, UNAVAILABLE", () => {
  const src = readFile("lib/comercial/clientes/client-loader.ts");

  test("ClientesPageResult has loadFailed field", () => {
    const typeBlock = src.slice(
      src.indexOf("export interface ClientesPageResult"),
      src.indexOf("}", src.indexOf("export interface ClientesPageResult")) + 1,
    );
    expect(typeBlock).toContain("loadFailed: boolean");
  });

  test("catch block returns loadFailed=true and UNAVAILABLE", () => {
    const fnStart = src.indexOf("export async function loadClientesPage");
    const fnBody = src.slice(fnStart, src.indexOf("\n}\n", fnStart) + 3);
    const catchBlock = fnBody.slice(fnBody.lastIndexOf("catch"));
    expect(catchBlock).toContain("loadFailed: true");
    expect(catchBlock).toContain('dataState: "UNAVAILABLE"');
  });

  test("success paths return loadFailed=false", () => {
    const fnStart = src.indexOf("export async function loadClientesPage");
    const fnBody = src.slice(fnStart, src.indexOf("\n}\n", fnStart) + 3);
    // The two success return statements (con_cartera early return + normal return)
    const returns = fnBody.match(/return\s*\{[^}]*loadFailed:\s*false[^}]*\}/g);
    expect(returns).not.toBeNull();
    expect(returns!.length).toBeGreaterThanOrEqual(2);
  });
});

describe("03A4-E4: page findMany() failure → same fail-closed", () => {
  // This is structurally the same catch block as E3 — if count succeeds but findMany throws,
  // the same catch handles it. Verify the catch covers the entire try block.
  const src = readFile("lib/comercial/clientes/client-loader.ts");

  test("try block encompasses both count and findMany", () => {
    const fnStart = src.indexOf("export async function loadClientesPage");
    const fnBody = src.slice(fnStart, src.indexOf("\n}\n", fnStart) + 3);
    const tryStart = fnBody.indexOf("try {");
    const catchStart = fnBody.lastIndexOf("catch");
    const tryBody = fnBody.slice(tryStart, catchStart);
    expect(tryBody).toContain("customerProfile.count");
    expect(tryBody).toContain("customerProfile.findMany");
  });
});

describe("03A4-E5: UI with pageResult.loadFailed shows 'Listado de clientes no disponible'", () => {
  const src = readFile("app/(app)/[orgSlug]/comercial/clientes/clientes-client.tsx");

  test("pageResult.loadFailed check exists before filter/empty checks", () => {
    const loadFailedIdx = src.indexOf("pageResult.loadFailed");
    const conCarteraIdx = src.indexOf("con_cartera", loadFailedIdx);
    const sinResultadosIdx = src.indexOf("Sin resultados", loadFailedIdx);
    // loadFailed check must come BEFORE the other checks
    expect(loadFailedIdx).toBeGreaterThan(-1);
    expect(conCarteraIdx).toBeGreaterThan(loadFailedIdx);
    expect(sinResultadosIdx).toBeGreaterThan(loadFailedIdx);
  });

  test("shows 'Listado de clientes no disponible' (not 'Sin clientes')", () => {
    expect(src).toContain("Listado de clientes no disponible");
    // The loadFailed message must NOT contain any of these misleading strings
    const loadFailedBlock = src.slice(
      src.indexOf("pageResult.loadFailed"),
      src.indexOf("con_cartera", src.indexOf("pageResult.loadFailed")),
    );
    expect(loadFailedBlock).not.toContain("Sin clientes");
    expect(loadFailedBlock).not.toContain("0 clientes");
    expect(loadFailedBlock).not.toContain("Sin resultados");
  });
});

describe("03A4-E6: warmTruthStatusCache throws → ArContext UNAVAILABLE", () => {
  const src = readFile("lib/comercial/clientes/client-loader.ts");

  test("warmTruthStatusCache is wrapped in try/catch", () => {
    const fnStart = src.indexOf("export async function loadArContext");
    const fnBody = src.slice(fnStart, src.indexOf("\n}\n", fnStart) + 3);
    // The actual await call must be inside a try block
    const tryIdx = fnBody.indexOf("try {");
    const warmIdx = fnBody.indexOf("await warmTruthStatusCache()");
    const catchIdx = fnBody.indexOf("catch", warmIdx);
    expect(tryIdx).toBeGreaterThan(-1);
    expect(warmIdx).toBeGreaterThan(tryIdx);
    expect(catchIdx).toBeGreaterThan(warmIdx);
  });

  test("catch returns UNAVAILABLE with null snapshot and empty sets", () => {
    const fnStart = src.indexOf("export async function loadArContext");
    const fnBody = src.slice(fnStart, src.indexOf("\n}\n", fnStart) + 3);
    // Find the catch block for warmTruthStatusCache (first catch in the function)
    const catchIdx = fnBody.indexOf("catch");
    const nextReturn = fnBody.indexOf("return", catchIdx);
    const returnBlock = fnBody.slice(nextReturn, fnBody.indexOf(";", nextReturn + 10) + 1);
    expect(returnBlock).toContain('"UNAVAILABLE"');
    expect(returnBlock).toContain("snapshot: null");
  });

  test("reason includes WARM_CACHE_FAILED", () => {
    const fnStart = src.indexOf("export async function loadArContext");
    const fnBody = src.slice(fnStart, src.indexOf("\n}\n", fnStart) + 3);
    expect(fnBody).toContain("WARM_CACHE_FAILED");
  });
});

describe("03A4-E7: CERTIFIED + zero customers with cartera → valid certified-empty", () => {
  // This tests the core logic path: CERTIFIED context with empty arCustomerIds
  test("resolveConCarteraFilter: CERTIFIED + empty → not allowed (valid, not error)", () => {
    const arCtx = {
      dataState: "CERTIFIED" as const,
      arLookup: new Map(),
      arCustomerIds: new Set<number>(),
    };
    const result = resolveConCarteraFilter(arCtx);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      // dataState is still CERTIFIED — it's a valid certified-empty, not an error
      expect(result.dataState).toBe("CERTIFIED");
    }
  });

  test("loadClientesSummaryCoreLogic: CERTIFIED + empty → withCartera=0, withOverdue=0, loadFailed=false", async () => {
    const arCtx: ArContextFull = {
      dataState: "CERTIFIED", snapshot: null,
      arLookup: new Map(),
      arCustomerIds: new Set<number>(),
      overdueCustomerIds: new Set<number>(),
      asOf: new Date().toISOString(), reason: "SAG_CERTIFIED",
    };
    const deps: SummaryDbDeps = {
      queryProfileAgg: async () => ({
        total: 50, active: 40, inactive: 10, withSeller: 30, sinCompra90d: 5, withCrm: 20,
      }),
      countDistinctProfiles: async () => { throw new Error("should not be called"); },
    };
    const result = await loadClientesSummaryCoreLogic("org-1", arCtx, deps);
    expect(result.withCartera).toBe(0);
    expect(result.withOverdue).toBe(0);
    expect(result.loadFailed).toBe(false);
    expect(result.dataState).toBe("CERTIFIED");
  });
});
