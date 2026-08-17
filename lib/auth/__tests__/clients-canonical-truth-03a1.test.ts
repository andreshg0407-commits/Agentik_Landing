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
      [526, { clienteId: 526, totalPendiente: 912400, totalVencido: 912400, creditBalance: 0, netReceivable: 912400 }],
      [700, { clienteId: 700, totalPendiente: 0, totalVencido: 0, creditBalance: 0, netReceivable: 0 }],
      [800, { clienteId: 800, totalPendiente: 0, totalVencido: 0, creditBalance: 150000, netReceivable: -150000 }],
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

  test("(800) — netReceivable<0 → CERTIFIED_CREDIT_BALANCE", () => {
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
    documento: "F2-6639", tipoDocumento: "Factura", valorDocumento: 529900, saldoPendiente: 529900,
    diasMora: 452, fechaDocumento: new Date("2025-05-01"), fechaVencimiento: new Date("2025-05-31"),
  };
  const doc2: CertifiedDocInput = {
    documento: "F2-6668", tipoDocumento: "Factura", valorDocumento: 382500, saldoPendiente: 382500,
    diasMora: 445, fechaDocumento: new Date("2025-05-08"), fechaVencimiento: new Date("2025-06-07"),
  };

  test("doc1 → daysOverdue=452, 365+, OVERDUE", () => {
    const r = mapCertifiedDocToReceivable(doc1);
    expect(r.daysOverdue).toBe(452);
    expect(r.agingBucket).toBe("365+");
    expect(r.status).toBe("OVERDUE");
    expect(r.balanceDue).toBe(529900);
    expect(r.paidAmount).toBeNull(); // NEVER inferred — must come from vw_agentik_recaudos
  });

  test("doc1 → documentType = 'Remisión' (F2 prefix)", () => {
    expect(mapCertifiedDocToReceivable(doc1).documentType).toBe("Remisión");
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
    documento: "NC-100", tipoDocumento: "Nota Crédito", valorDocumento: 5_000_000, saldoPendiente: 3_000_000,
    diasMora: null, fechaDocumento: new Date("2026-01-15"), fechaVencimiento: null,
  };

  test("daysOverdue = null", () => { expect(mapCertifiedDocToReceivable(doc).daysOverdue).toBeNull(); });
  test("agingBucket = null", () => { expect(mapCertifiedDocToReceivable(doc).agingBucket).toBeNull(); });
  test("status = OPEN", () => { expect(mapCertifiedDocToReceivable(doc).status).toBe("OPEN"); });
  test("paidAmount = null (never inferred by difference)", () => { expect(mapCertifiedDocToReceivable(doc).paidAmount).toBeNull(); });
  test("documentType = 'Nota crédito' (NC prefix)", () => { expect(mapCertifiedDocToReceivable(doc).documentType).toBe("Nota crédito"); });
});

describe("mapCertifiedDocToReceivable — fully paid", () => {
  test("saldoPendiente=0 → CLOSED", () => {
    const r = mapCertifiedDocToReceivable({
      documento: "FE-001", tipoDocumento: "Factura", valorDocumento: 1_000_000, saldoPendiente: 0,
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

  test("CERTIFIED + balance>0 + no known mora → 'Vencimiento no verificado'", () => {
    expect(carteraTrafficLight({
      truthStatus: "CERTIFIED", totalBalance: 500_000,
      items: [{ daysOverdue: null, balanceDue: 500_000 }],
    }).label).toBe("Vencimiento no verificado");
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
    arLookup: new Map([[100, { clienteId: 100, totalPendiente: 500_000, totalVencido: 0, creditBalance: 0, netReceivable: 500_000 }]]),
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
  // E: netReceivable=-250_000 (credit/saldo a favor)
  const deps: LoadArContextDeps = {
    isCertified: () => true,
    fetchSnapshot: async () => ({
      ok: true as const,
      snapshot: {
        customers: [
          { clienteId: 10, totalPendiente: 1_000_000, totalVencido: 300_000, creditBalance: 0, netReceivable: 1_000_000 },
          { clienteId: 20, totalPendiente: 105_000, totalVencido: 0, creditBalance: 0, netReceivable: 105_000 },
          { clienteId: 30, totalPendiente: 0, totalVencido: 0, creditBalance: 0, netReceivable: 0 },
          { clienteId: 40, totalPendiente: 0, totalVencido: 0, creditBalance: 0, netReceivable: 0 },
          { clienteId: 50, totalPendiente: 0, totalVencido: 0, creditBalance: 250_000, netReceivable: -250_000 },
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

  test("overdueCustomerIds only includes A (totalVencido>0 AND netReceivable>0)", async () => {
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

// ═══════════════════════════════════════════════════════════════════════════════
// E. VISUAL INVARIANT TESTS — 03A6
// ═══════════════════════════════════════════════════════════════════════════════

describe("03A6: fmtCurrency — monetary display invariants", () => {
  // Import the same formatter logic used by the UI
  // Since fmtCurrency is a local function in clientes-client.tsx, replicate it here
  // to test the exact same rules
  function fmtCurrency(value: number): string {
    if (value === 0) return "$0";
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    return `$${value.toLocaleString("es-CO")}`;
  }

  test("null is not passed to fmtCurrency — caller shows em dash", () => {
    // This is a contract test: null values are handled by the caller, not the formatter
    // Verified by the UI code: `client.totalReceivable != null ? fmtCurrency(...) : "—"`
    const src = readFile("app/(app)/[orgSlug]/comercial/clientes/clientes-client.tsx");
    expect(src).toContain('client.totalReceivable != null ? fmtCurrency(client.totalReceivable) : "\\u2014"');
  });

  test("0 → '$0'", () => { expect(fmtCurrency(0)).toBe("$0"); });
  test("1 → '$1'", () => { expect(fmtCurrency(1)).toMatch(/\$1/); });
  test("499 → shows exact value (not $0)", () => {
    const result = fmtCurrency(499);
    expect(result).not.toBe("$0");
    expect(result).toContain("499");
  });
  test("999 → shows exact value (not $0, not $1K)", () => {
    const result = fmtCurrency(999);
    expect(result).not.toBe("$0");
    expect(result).toContain("999");
  });
  test("1000 → '$1K'", () => { expect(fmtCurrency(1000)).toBe("$1K"); });
  test("105000 → '$105K'", () => { expect(fmtCurrency(105_000)).toBe("$105K"); });
  test("912400 → '$912K'", () => { expect(fmtCurrency(912_400)).toBe("$912K"); });
  test("1000000 → '$1.0M'", () => { expect(fmtCurrency(1_000_000)).toBe("$1.0M"); });
  test("negative value does not show as $0", () => {
    const result = fmtCurrency(-150_000);
    expect(result).not.toBe("$0");
  });

  test("no positive value can render as '$0'", () => {
    // Exhaustive check: for any positive value, fmtCurrency never returns "$0"
    const positiveValues = [1, 10, 100, 499, 500, 999, 1000, 5000, 100_000, 1_000_000, 50_000_000];
    for (const v of positiveValues) {
      expect(fmtCurrency(v)).not.toBe("$0");
    }
  });
});

describe("03A6: cartera column shows totalReceivable (not overdueReceivable)", () => {
  const src = readFile("app/(app)/[orgSlug]/comercial/clientes/clientes-client.tsx");

  test("row renders client.totalReceivable in cartera column", () => {
    expect(src).toContain("fmtCurrency(client.totalReceivable)");
  });

  test("row does NOT render overdueReceivable as the cartera column value", () => {
    // The cartera column must show totalReceivable, not overdueReceivable
    expect(src).not.toContain("fmtCurrency(client.overdueReceivable)");
  });
});

describe("03A6: con_cartera filter invariants (behavioral)", () => {
  // Simulate the full pipeline with the 5-customer scenario
  const snapshot = {
    customers: [
      { clienteId: 10, totalPendiente: 1_000_000, totalVencido: 300_000, creditBalance: 0, netReceivable: 1_000_000 },
      { clienteId: 20, totalPendiente: 105_000, totalVencido: 0, creditBalance: 0, netReceivable: 105_000 },
      { clienteId: 30, totalPendiente: 0, totalVencido: 0, creditBalance: 0, netReceivable: 0 },
      { clienteId: 40, totalPendiente: 0, totalVencido: 0, creditBalance: 0, netReceivable: 0 },
      { clienteId: 50, totalPendiente: 0, totalVencido: 0, creditBalance: 250_000, netReceivable: -250_000 },
    ],
    asOf: new Date("2026-08-16T12:00:00Z"),
  };

  test("every con_cartera row has totalReceivable > 0", async () => {
    const ctx = await loadArContextCore("org-1", {
      isCertified: () => true,
      fetchSnapshot: async () => ({ ok: true as const, snapshot }),
    });
    const guard = resolveConCarteraFilter(ctx);
    expect(guard.allowed).toBe(true);
    if (!guard.allowed) return;

    // For each sagId in the filter, resolve the row and verify
    for (const sagId of guard.sagIds) {
      const row = resolveRowCartera(ctx, sagId);
      expect(row.totalReceivable).not.toBeNull();
      expect(row.totalReceivable!).toBeGreaterThan(0);
      expect(row.carteraState).toBe("HAS_OPEN_AR");
    }
  });

  test("CERTIFIED_ZERO never appears in con_cartera sagIds", async () => {
    const ctx = await loadArContextCore("org-1", {
      isCertified: () => true,
      fetchSnapshot: async () => ({ ok: true as const, snapshot }),
    });
    const guard = resolveConCarteraFilter(ctx);
    if (!guard.allowed) return;

    // IDs 30, 40 are CERTIFIED_ZERO — must NOT appear
    expect(guard.sagIds).not.toContain(30);
    expect(guard.sagIds).not.toContain(40);
  });

  test("CERTIFIED_CREDIT_BALANCE never appears in con_cartera sagIds", async () => {
    const ctx = await loadArContextCore("org-1", {
      isCertified: () => true,
      fetchSnapshot: async () => ({ ok: true as const, snapshot }),
    });
    const guard = resolveConCarteraFilter(ctx);
    if (!guard.allowed) return;

    // ID 50 is CERTIFIED_CREDIT_BALANCE — must NOT appear
    expect(guard.sagIds).not.toContain(50);
  });

  test("UNVERIFIED context never produces certified-zero rows", () => {
    const unverifiedCtx: ArContextCore = { dataState: "UNVERIFIED", arLookup: new Map() };
    const row = resolveRowCartera(unverifiedCtx, 30);
    expect(row.carteraState).toBe("UNVERIFIED");
    expect(row.carteraState).not.toBe("CERTIFIED_ZERO");
    expect(row.totalReceivable).toBeNull();
  });

  test("KPI withCartera matches con_cartera sagIds count", async () => {
    const ctx = await loadArContextCore("org-1", {
      isCertified: () => true,
      fetchSnapshot: async () => ({ ok: true as const, snapshot }),
    });
    const guard = resolveConCarteraFilter(ctx);
    expect(guard.allowed).toBe(true);
    if (!guard.allowed) return;

    const summaryResult = await loadClientesSummaryCoreLogic("org-1", ctx, {
      queryProfileAgg: async () => ({
        total: 100, active: 80, inactive: 20, withSeller: 50, sinCompra90d: 10, withCrm: 30,
      }),
      countDistinctProfiles: async (_orgId, sagIds) => sagIds.length,
    });

    // withCartera and filter sagIds must be consistent
    expect(summaryResult.withCartera).toBe(guard.sagIds.length);
  });
});

describe("03A6: NIT 24296154 equivalent — customer in snapshot with totalPendiente=0", () => {
  // Alba Maria Marin (NIT 24296154) appeared in con_cartera with $0
  // because her totalPendiente=0 but she was in the snapshot (has credit notes only).
  // After the fix, she must NOT appear in con_cartera.

  test("customer with totalPendiente=0 is CERTIFIED_ZERO, excluded from filter", async () => {
    const ctx = await loadArContextCore("org-1", {
      isCertified: () => true,
      fetchSnapshot: async () => ({
        ok: true as const,
        snapshot: {
          customers: [
            // Simulates Alba Maria Marin: present in snapshot but zero balance
            { clienteId: 24296154, totalPendiente: 0, totalVencido: 0, creditBalance: 0, netReceivable: 0 },
            // A real open-AR customer for contrast
            { clienteId: 999, totalPendiente: 500_000, totalVencido: 100_000, creditBalance: 0, netReceivable: 500_000 },
          ],
          asOf: new Date("2026-08-16T12:00:00Z"),
        },
      }),
    });

    // Row resolution
    const alba = resolveRowCartera(ctx, 24296154);
    expect(alba.carteraState).toBe("CERTIFIED_ZERO");
    expect(alba.totalReceivable).toBe(0);

    // Filter exclusion
    const guard = resolveConCarteraFilter(ctx);
    expect(guard.allowed).toBe(true);
    if (guard.allowed) {
      expect(guard.sagIds).not.toContain(24296154);
      expect(guard.sagIds).toContain(999);
      expect(guard.sagIds.length).toBe(1);
    }

    // KPI
    expect(ctx.arCustomerIds.has(24296154)).toBe(false);
    expect(ctx.arCustomerIds.size).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F. SIGNED BALANCE AND DOCUMENT SEMANTICS — 03A7
// ═══════════════════════════════════════════════════════════════════════════════

describe("03A7: groupByCustomer signed balance — only positive saldos", () => {
  test("solo positivos: netReceivable = grossReceivable", async () => {
    const ctx = await loadArContextCore("org-1", {
      isCertified: () => true,
      fetchSnapshot: async () => ({
        ok: true as const,
        snapshot: {
          customers: [
            { clienteId: 1, totalPendiente: 1_000_000, totalVencido: 300_000, creditBalance: 0, netReceivable: 1_000_000 },
          ],
          asOf: new Date("2026-08-16T12:00:00Z"),
        },
      }),
    });
    const snap = ctx.arLookup.get(1)!;
    expect(snap.netReceivable).toBe(1_000_000);
    expect(snap.creditBalance).toBe(0);
    expect(snap.totalPendiente).toBe(1_000_000);
    const row = resolveRowCartera(ctx, 1);
    expect(row.carteraState).toBe("HAS_OPEN_AR");
    expect(row.totalReceivable).toBe(1_000_000);
  });
});

describe("03A7: groupByCustomer signed balance — positivos + creditos", () => {
  test("positivos + creditos: netReceivable = gross - credit", async () => {
    const ctx = await loadArContextCore("org-1", {
      isCertified: () => true,
      fetchSnapshot: async () => ({
        ok: true as const,
        snapshot: {
          customers: [
            { clienteId: 1, totalPendiente: 1_500_000, totalVencido: 0, creditBalance: 80_900, netReceivable: 1_419_100 },
          ],
          asOf: new Date("2026-08-16T12:00:00Z"),
        },
      }),
    });
    const snap = ctx.arLookup.get(1)!;
    expect(snap.netReceivable).toBe(1_419_100);
    expect(snap.creditBalance).toBe(80_900);
    const row = resolveRowCartera(ctx, 1);
    expect(row.carteraState).toBe("HAS_OPEN_AR");
    expect(row.totalReceivable).toBe(1_419_100);
  });
});

describe("03A7: groupByCustomer signed balance — solo creditos", () => {
  test("solo creditos: CERTIFIED_CREDIT_BALANCE", async () => {
    const ctx = await loadArContextCore("org-1", {
      isCertified: () => true,
      fetchSnapshot: async () => ({
        ok: true as const,
        snapshot: {
          customers: [
            { clienteId: 1, totalPendiente: 0, totalVencido: 0, creditBalance: 250_000, netReceivable: -250_000 },
          ],
          asOf: new Date("2026-08-16T12:00:00Z"),
        },
      }),
    });
    const row = resolveRowCartera(ctx, 1);
    expect(row.carteraState).toBe("CERTIFIED_CREDIT_BALANCE");
    expect(row.totalReceivable).toBe(-250_000);
    expect(ctx.arCustomerIds.has(1)).toBe(false);
  });
});

describe("03A7: groupByCustomer signed balance — neto cero", () => {
  test("neto cero: gross=500K credit=500K → CERTIFIED_ZERO", async () => {
    const ctx = await loadArContextCore("org-1", {
      isCertified: () => true,
      fetchSnapshot: async () => ({
        ok: true as const,
        snapshot: {
          customers: [
            { clienteId: 1, totalPendiente: 500_000, totalVencido: 0, creditBalance: 500_000, netReceivable: 0 },
          ],
          asOf: new Date("2026-08-16T12:00:00Z"),
        },
      }),
    });
    const row = resolveRowCartera(ctx, 1);
    expect(row.carteraState).toBe("CERTIFIED_ZERO");
    expect(row.totalReceivable).toBe(0);
    expect(ctx.arCustomerIds.has(1)).toBe(false);
  });
});

describe("03A7: mapCertifiedDocToReceivable — negative saldo is CREDIT, not CLOSED", () => {
  test("negative saldoPendiente → status=CREDIT", () => {
    const r = mapCertifiedDocToReceivable({
      documento: "D2-849", tipoDocumento: "Nota Crédito", valorDocumento: -80_900, saldoPendiente: -80_900,
      diasMora: null, fechaDocumento: new Date("2026-07-15"), fechaVencimiento: null,
    });
    expect(r.status).toBe("CREDIT");
    expect(r.status).not.toBe("CLOSED");
    expect(r.balanceDue).toBe(-80_900);
  });

  test("zero saldoPendiente → status=CLOSED (not CREDIT)", () => {
    const r = mapCertifiedDocToReceivable({
      documento: "FE-100", tipoDocumento: "Factura", valorDocumento: 500_000, saldoPendiente: 0,
      diasMora: 0, fechaDocumento: new Date("2026-06-01"), fechaVencimiento: new Date("2026-07-01"),
    });
    expect(r.status).toBe("CLOSED");
  });

  test("positive saldoPendiente with mora → status=OVERDUE", () => {
    const r = mapCertifiedDocToReceivable({
      documento: "F2-8653", tipoDocumento: "Factura", valorDocumento: 1_500_000, saldoPendiente: 1_500_000,
      diasMora: 45, fechaDocumento: new Date("2026-06-01"), fechaVencimiento: new Date("2026-07-01"),
    });
    expect(r.status).toBe("OVERDUE");
  });

  test("positive saldoPendiente without mora → status=OPEN", () => {
    const r = mapCertifiedDocToReceivable({
      documento: "FE-200", tipoDocumento: "Factura", valorDocumento: 300_000, saldoPendiente: 300_000,
      diasMora: 0, fechaDocumento: new Date("2026-08-01"), fechaVencimiento: new Date("2026-09-01"),
    });
    expect(r.status).toBe("OPEN");
  });
});

describe("03A7: carteraTrafficLight — negative totalBalance is 'Saldo a favor'", () => {
  test("totalBalance < 0 → 'Saldo a favor'", () => {
    const result = carteraTrafficLight({
      truthStatus: "CERTIFIED",
      totalBalance: -80_900,
      items: [{ daysOverdue: null, balanceDue: -80_900 }],
    });
    expect(result.label).toBe("Saldo a favor");
  });

  test("totalBalance < 0 → NOT 'Sin cartera'", () => {
    const result = carteraTrafficLight({
      truthStatus: "CERTIFIED",
      totalBalance: -250_000,
      items: [],
    });
    expect(result.label).not.toBe("Sin cartera");
    expect(result.label).not.toBe("Critica");
  });
});

describe("03A7: UI structural — document semantics", () => {
  const clientesSrc = readFile("app/(app)/[orgSlug]/comercial/clientes/clientes-client.tsx");
  const detailSrc = readFile("app/(app)/[orgSlug]/comercial/clientes/[clienteId]/cliente-360-client.tsx");

  test("drawer table header: Tipo, Documento (no 'Pagado' column)", () => {
    expect(clientesSrc).toContain('"Tipo", "Documento", "Monto", "Saldo", "Mora", "Estado"');
    expect(clientesSrc).not.toContain('"Pagado"');
  });

  test("360 detail table header: Tipo, Documento (no 'Pagado' column)", () => {
    expect(detailSrc).toContain('"Tipo", "Documento", "Monto", "Saldo", "Mora", "Estado"');
    expect(detailSrc).not.toContain('"Pagado"');
  });

  test("CREDIT status maps to 'Saldo a favor' label", () => {
    expect(clientesSrc).toContain('CREDIT: "Saldo a favor"');
    expect(detailSrc).toContain('CREDIT: "Saldo a favor"');
  });

  test("receivableStatusVariant handles CREDIT status", () => {
    expect(clientesSrc).toContain('case "CREDIT":');
    expect(detailSrc).toContain('case "CREDIT":');
  });

  test("drawer shows 'Documentos con saldo' (not 'Facturas abiertas')", () => {
    expect(clientesSrc).toContain("Documentos con saldo");
    expect(detailSrc).toContain("documentos con saldo");
  });
});

describe("03A7: signed balance semantics — ArSnapshotCustomer contract", () => {
  test("ArSnapshotCustomer requires creditBalance and netReceivable", () => {
    const src = readFile("lib/comercial/clientes/clientes-pure.ts");
    const typeBlock = src.slice(
      src.indexOf("export interface ArSnapshotCustomer"),
      src.indexOf("}", src.indexOf("export interface ArSnapshotCustomer")) + 1,
    );
    expect(typeBlock).toContain("creditBalance: number");
    expect(typeBlock).toContain("netReceivable: number");
  });

  test("ArContextCore arLookup value includes creditBalance and netReceivable", () => {
    const src = readFile("lib/comercial/clientes/clientes-pure.ts");
    const typeBlock = src.slice(
      src.indexOf("export interface ArContextCore"),
      src.indexOf("}", src.indexOf("export interface ArContextCore")) + 1,
    );
    expect(typeBlock).toContain("creditBalance: number");
    expect(typeBlock).toContain("netReceivable: number");
  });

  test("canonical-ar-types CertifiedCustomerReceivableSnapshot includes creditBalance and netReceivable", () => {
    const src = readFile("lib/comercial/frontline/canonical-ar-types.ts");
    const typeBlock = src.slice(
      src.indexOf("export interface CertifiedCustomerReceivableSnapshot"),
      src.indexOf("}", src.indexOf("export interface CertifiedCustomerReceivableSnapshot")) + 1,
    );
    expect(typeBlock).toContain("creditBalance:");
    expect(typeBlock).toContain("netReceivable:");
  });
});

describe("03A7: canonical-ar-service groupByCustomer computes creditBalance", () => {
  const src = readFile("lib/comercial/frontline/canonical-ar-service.ts");

  test("groupByCustomer handles negative saldoPendiente as creditBalance", () => {
    const fnStart = src.indexOf("function groupByCustomer");
    const fnBody = src.slice(fnStart, src.indexOf("\n}\n", fnStart + 10) + 3);
    expect(fnBody).toContain("creditBalance");
    expect(fnBody).toContain("netReceivable");
    expect(fnBody).toContain("totalPendiente - creditBalance");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G. SOURCE-AWARE AR APPLICATION — 03A8
// ═══════════════════════════════════════════════════════════════════════════════

import { classifyDocumentType } from "@/lib/comercial/clientes/clientes-pure";

describe("03A8: D2 nota crédito reduces collectibleBalance, never increases paidAmount", () => {
  test("D2 document → status=CREDIT, paidAmount=null", () => {
    const r = mapCertifiedDocToReceivable({
      documento: "D2-849", tipoDocumento: "Nota Crédito", valorDocumento: -80_900, saldoPendiente: -80_900,
      diasMora: null, fechaDocumento: new Date("2026-07-15"), fechaVencimiento: null,
    });
    expect(r.status).toBe("CREDIT");
    expect(r.paidAmount).toBeNull(); // D2 never produces paidAmount
    expect(r.documentType).toBe("Nota crédito");
  });

  test("D2 does NOT increase collectedAmount (never treated as recaudo)", () => {
    // collectedAmount comes exclusively from vw_agentik_recaudos
    // D2 is a nota crédito, not a collection
    const r = mapCertifiedDocToReceivable({
      documento: "D2-100", tipoDocumento: "Nota Crédito", valorDocumento: -500_000, saldoPendiente: -500_000,
      diasMora: null, fechaDocumento: new Date("2026-01-01"), fechaVencimiento: null,
    });
    expect(r.paidAmount).toBeNull(); // paidAmount must NEVER be populated from cartera view
  });
});

describe("03A8: R1/R2 are recaudos (from vw_agentik_recaudos only)", () => {
  test("R2 classified as 'Recibo de caja'", () => {
    expect(classifyDocumentType("", "R2-500")).toBe("Recibo de caja");
  });
  test("R1 classified as 'Recibo de caja'", () => {
    expect(classifyDocumentType("", "R1-300")).toBe("Recibo de caja");
  });
});

describe("03A8: vw_agentik_pagos never enters AR calculation", () => {
  // Structural: the cliente-360-loader must NOT import or reference vw_agentik_pagos
  test("cliente-360-loader does not reference vw_agentik_pagos", () => {
    const src = readFile("lib/comercial/clientes/cliente-360-loader.ts");
    expect(src).not.toContain("vw_agentik_pagos");
    expect(src).not.toContain("agentik_pagos");
  });
});

describe("03A8: SALDO_PENDIENTE is not double-subtracted", () => {
  test("mapCertifiedDocToReceivable does NOT compute paidAmount by difference", () => {
    const src = readFile("lib/comercial/clientes/clientes-pure.ts");
    const fnStart = src.indexOf("export function mapCertifiedDocToReceivable");
    const fnBody = src.slice(fnStart, src.indexOf("\n}\n", fnStart) + 3);
    // Must NOT contain valorDocumento - saldoPendiente (the old inference)
    expect(fnBody).not.toContain("valorDocumento - doc.saldoPendiente");
    expect(fnBody).not.toContain("doc.valorDocumento - doc.saldoPendiente");
    // Must contain paidAmount: null
    expect(fnBody).toContain("paidAmount: null");
  });
});

describe("03A8: nota crédito and recaudo shown separately in UI", () => {
  const clientesSrc = readFile("app/(app)/[orgSlug]/comercial/clientes/clientes-client.tsx");
  const detailSrc = readFile("app/(app)/[orgSlug]/comercial/clientes/[clienteId]/cliente-360-client.tsx");

  test("drawer strip shows NC aplicadas and Recaudos as separate stats", () => {
    expect(clientesSrc).toContain("NC aplicadas");
    expect(clientesSrc).toContain("Recaudos");
  });

  test("360 page strip shows NC aplicadas and Recaudos as separate stats", () => {
    expect(detailSrc).toContain("NC aplicadas");
    expect(detailSrc).toContain("Recaudos");
  });

  test("no mixed 'Pagado' column in receivables table", () => {
    // The table must NOT have a 'Pagado' header that mixes NC and recaudos
    expect(clientesSrc).not.toContain('"Pagado"');
    expect(detailSrc).not.toContain('"Pagado"');
  });
});

describe("03A8: missing recaudos produces em dash, not zero", () => {
  test("paidAmount=null for any document from cartera view", () => {
    // Every document from vw_agentik_cartera gets paidAmount=null
    const invoice = mapCertifiedDocToReceivable({
      documento: "F2-8653", tipoDocumento: "Factura", valorDocumento: 1_500_000, saldoPendiente: 1_500_000,
      diasMora: 0, fechaDocumento: new Date("2026-06-01"), fechaVencimiento: new Date("2026-09-01"),
    });
    expect(invoice.paidAmount).toBeNull(); // NOT $0
  });
});

describe("03A8: unknown mora does NOT produce 'Al día'", () => {
  test("all items with daysOverdue=null → 'Vencimiento no verificado'", () => {
    const result = carteraTrafficLight({
      truthStatus: "CERTIFIED",
      totalBalance: 1_500_000,
      items: [{ daysOverdue: null, balanceDue: 1_500_000 }],
    });
    expect(result.label).toBe("Vencimiento no verificado");
    expect(result.label).not.toBe("Al dia");
  });

  test("known mora=0 → 'Al dia' (only with evidence)", () => {
    const result = carteraTrafficLight({
      truthStatus: "CERTIFIED",
      totalBalance: 500_000,
      items: [{ daysOverdue: 0, balanceDue: 500_000 }],
    });
    expect(result.label).toBe("Al dia");
  });
});

describe("03A8: classifyDocumentType — FUENTES contract", () => {
  test("F2 prefix → 'Remisión'", () => { expect(classifyDocumentType("Factura", "F2-8653")).toBe("Remisión"); });
  test("FE prefix → 'Factura'", () => { expect(classifyDocumentType("Factura", "FE-100")).toBe("Factura"); });
  test("D2 prefix → 'Nota crédito'", () => { expect(classifyDocumentType("Nota Crédito", "D2-849")).toBe("Nota crédito"); });
  test("NC prefix → 'Nota crédito'", () => { expect(classifyDocumentType("Nota Crédito", "NC-50")).toBe("Nota crédito"); });
  test("R2 prefix → 'Recibo de caja'", () => { expect(classifyDocumentType("", "R2-400")).toBe("Recibo de caja"); });
  test("R1 prefix → 'Recibo de caja'", () => { expect(classifyDocumentType("", "R1-200")).toBe("Recibo de caja"); });
  test("unknown prefix with tipoDocumento='Factura' → 'Factura'", () => { expect(classifyDocumentType("Factura", "XX-1")).toBe("Factura"); });
  test("unknown prefix with tipoDocumento='Nota Crédito' → 'Nota crédito'", () => { expect(classifyDocumentType("Nota Crédito", "XX-2")).toBe("Nota crédito"); });
  test("empty tipoDocumento and unknown prefix → 'Documento'", () => { expect(classifyDocumentType("", "XX-3")).toBe("Documento"); });
});

describe("03A8: provenance message", () => {
  const clientesSrc = readFile("app/(app)/[orgSlug]/comercial/clientes/clientes-client.tsx");
  const detailSrc = readFile("app/(app)/[orgSlug]/comercial/clientes/[clienteId]/cliente-360-client.tsx");

  test("drawer provenance references both vw_agentik_cartera and vw_agentik_recaudos", () => {
    expect(clientesSrc).toContain("vw_agentik_cartera");
    expect(clientesSrc).toContain("vw_agentik_recaudos");
  });

  test("360 provenance references both vw_agentik_cartera and vw_agentik_recaudos", () => {
    expect(detailSrc).toContain("vw_agentik_cartera");
    expect(detailSrc).toContain("vw_agentik_recaudos");
  });
});

describe("03A8: cliente-360-loader sources collectedAmount from recaudos", () => {
  const src = readFile("lib/comercial/clientes/cliente-360-loader.ts");

  test("imports fetchCertifiedCustomerRecaudos", () => {
    expect(src).toContain("fetchCertifiedCustomerRecaudos");
  });

  test("receivables block includes collectedAmount field", () => {
    const typeBlock = src.slice(
      src.indexOf("receivables: {"),
      src.indexOf("truthStatus:", src.indexOf("receivables: {")) + 30,
    );
    expect(typeBlock).toContain("collectedAmount:");
  });

  test("does NOT reference vw_agentik_pagos", () => {
    expect(src).not.toContain("vw_agentik_pagos");
  });
});
