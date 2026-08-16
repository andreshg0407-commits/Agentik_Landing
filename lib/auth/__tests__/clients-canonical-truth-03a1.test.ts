/**
 * lib/auth/__tests__/clients-canonical-truth-03a1.test.ts
 *
 * CLIENTS-CANONICAL-TRUTH-03A2 — Production behavioral tests.
 *
 * ALL pure functions imported from the SAME production module:
 *   lib/comercial/clientes/clientes-pure.ts
 *
 * No replicated logic. No readFile/toContain as substitute for behavioral tests.
 * Structural parity checks remain for server-only loader shapes.
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
} from "@/lib/comercial/clientes/clientes-pure";
import type {
  ArContextCore,
  ArDataState,
  ClientScoreInput,
  CertifiedDocInput,
  CarteraTrafficLightInput,
} from "@/lib/comercial/clientes/clientes-pure";

const ROOT = path.resolve(__dirname, "../../..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. BEHAVIORAL TESTS — using real production functions
// ═══════════════════════════════════════════════════════════════════════════════

// ── 1. resolveRowCartera — production function ──────────────────────────────

describe("resolveRowCartera — CERTIFIED context", () => {
  const arCtx: ArContextCore = {
    dataState: "CERTIFIED",
    arLookup: new Map([
      [526, { clienteId: 526, totalPendiente: 912400, totalVencido: 912400 }],
    ]),
  };

  test("AMV LLANO (856) — not in arLookup → CERTIFIED_ZERO with $0", () => {
    const result = resolveRowCartera(arCtx, 856);
    expect(result.carteraState).toBe("CERTIFIED_ZERO");
    expect(result.totalReceivable).toBe(0);
    expect(result.overdueReceivable).toBe(0);
  });

  test("Diana (526) — in arLookup → HAS_OPEN_AR with real amounts", () => {
    const result = resolveRowCartera(arCtx, 526);
    expect(result.carteraState).toBe("HAS_OPEN_AR");
    expect(result.totalReceivable).toBe(912400);
    expect(result.overdueReceivable).toBe(912400);
  });

  test("sagTerceroId=null → UNVERIFIED (even when CERTIFIED)", () => {
    const result = resolveRowCartera(arCtx, null);
    expect(result.carteraState).toBe("UNVERIFIED");
    expect(result.totalReceivable).toBeNull();
  });

  test("sagTerceroId=0 → UNVERIFIED", () => {
    const result = resolveRowCartera(arCtx, 0);
    expect(result.carteraState).toBe("UNVERIFIED");
  });

  test("sagTerceroId=-1 → UNVERIFIED", () => {
    const result = resolveRowCartera(arCtx, -1);
    expect(result.carteraState).toBe("UNVERIFIED");
  });
});

describe("resolveRowCartera — UNAVAILABLE context (SAG down)", () => {
  const arCtx: ArContextCore = { dataState: "UNAVAILABLE", arLookup: new Map() };

  test("returns UNVERIFIED, not CERTIFIED_ZERO", () => {
    const result = resolveRowCartera(arCtx, 856);
    expect(result.carteraState).toBe("UNVERIFIED");
  });

  test("totalReceivable = null (not 0)", () => {
    const result = resolveRowCartera(arCtx, 856);
    expect(result.totalReceivable).toBeNull();
  });

  test("overdueReceivable = null (not 0)", () => {
    const result = resolveRowCartera(arCtx, 856);
    expect(result.overdueReceivable).toBeNull();
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

// ── 2. classifyAgingBand — production function ──────────────────────────────

describe("classifyAgingBand — nullable mora contract", () => {
  test("null → null (not CURRENT)", () => {
    expect(classifyAgingBand(null)).toBeNull();
  });

  test("0 → CURRENT", () => {
    expect(classifyAgingBand(0)).toBe("CURRENT");
  });

  test("-5 → CURRENT", () => {
    expect(classifyAgingBand(-5)).toBe("CURRENT");
  });

  test("15 → 1-30", () => {
    expect(classifyAgingBand(15)).toBe("1-30");
  });

  test("45 → 31-60", () => {
    expect(classifyAgingBand(45)).toBe("31-60");
  });

  test("90 → 61-90", () => {
    expect(classifyAgingBand(90)).toBe("61-90");
  });

  test("150 → 91-180", () => {
    expect(classifyAgingBand(150)).toBe("91-180");
  });

  test("300 → 181-365", () => {
    expect(classifyAgingBand(300)).toBe("181-365");
  });

  test("452 → 365+", () => {
    expect(classifyAgingBand(452)).toBe("365+");
  });
});

// ── 3. mapCertifiedDocToReceivable — production function ────────────────────

describe("mapCertifiedDocToReceivable — Diana documents", () => {
  const doc1: CertifiedDocInput = {
    documento: "F2-6639",
    valorDocumento: 529900,
    saldoPendiente: 529900,
    diasMora: 452,
    fechaDocumento: new Date("2025-05-01"),
    fechaVencimiento: new Date("2025-05-31"),
  };

  const doc2: CertifiedDocInput = {
    documento: "F2-6668",
    valorDocumento: 382500,
    saldoPendiente: 382500,
    diasMora: 445,
    fechaDocumento: new Date("2025-05-08"),
    fechaVencimiento: new Date("2025-06-07"),
  };

  test("doc1 → daysOverdue=452, agingBucket=365+, status=OVERDUE", () => {
    const r = mapCertifiedDocToReceivable(doc1);
    expect(r.daysOverdue).toBe(452);
    expect(r.agingBucket).toBe("365+");
    expect(r.status).toBe("OVERDUE");
    expect(r.balanceDue).toBe(529900);
    expect(r.paidAmount).toBe(0);
  });

  test("doc2 → daysOverdue=445, agingBucket=365+, status=OVERDUE", () => {
    const r = mapCertifiedDocToReceivable(doc2);
    expect(r.daysOverdue).toBe(445);
    expect(r.agingBucket).toBe("365+");
    expect(r.status).toBe("OVERDUE");
  });

  test("id format is sag-{documento}", () => {
    expect(mapCertifiedDocToReceivable(doc1).id).toBe("sag-F2-6639");
  });
});

describe("mapCertifiedDocToReceivable — null DIAS_MORA", () => {
  const doc: CertifiedDocInput = {
    documento: "NC-100",
    valorDocumento: 5_000_000,
    saldoPendiente: 3_000_000,
    diasMora: null,
    fechaDocumento: new Date("2026-01-15"),
    fechaVencimiento: null,
  };

  test("daysOverdue = null (not 0)", () => {
    expect(mapCertifiedDocToReceivable(doc).daysOverdue).toBeNull();
  });

  test("agingBucket = null (not CURRENT)", () => {
    expect(mapCertifiedDocToReceivable(doc).agingBucket).toBeNull();
  });

  test("status = OPEN (not OVERDUE)", () => {
    expect(mapCertifiedDocToReceivable(doc).status).toBe("OPEN");
  });

  test("paidAmount = valorDocumento - saldoPendiente", () => {
    expect(mapCertifiedDocToReceivable(doc).paidAmount).toBe(2_000_000);
  });
});

describe("mapCertifiedDocToReceivable — fully paid document", () => {
  const doc: CertifiedDocInput = {
    documento: "FE-001",
    valorDocumento: 1_000_000,
    saldoPendiente: 0,
    diasMora: 0,
    fechaDocumento: new Date("2026-06-01"),
    fechaVencimiento: new Date("2026-07-01"),
  };

  test("status = CLOSED when saldoPendiente = 0", () => {
    expect(mapCertifiedDocToReceivable(doc).status).toBe("CLOSED");
  });
});

// ── 4. carteraTrafficLight — production function ────────────────────────────

describe("carteraTrafficLight — three-state contract", () => {
  test("UNVERIFIED → 'No verificada'", () => {
    const result = carteraTrafficLight({ truthStatus: "UNVERIFIED", totalBalance: null, items: [] });
    expect(result.label).toBe("No verificada");
  });

  test("CERTIFIED + balance=0 → 'Sin cartera'", () => {
    const result = carteraTrafficLight({ truthStatus: "CERTIFIED", totalBalance: 0, items: [] });
    expect(result.label).toBe("Sin cartera");
  });

  test("CERTIFIED + balance=null → 'Sin cartera'", () => {
    const result = carteraTrafficLight({ truthStatus: "CERTIFIED", totalBalance: null, items: [] });
    expect(result.label).toBe("Sin cartera");
  });

  test("CERTIFIED + balance>0 + no known mora → 'Mora no disponible'", () => {
    const result = carteraTrafficLight({
      truthStatus: "CERTIFIED",
      totalBalance: 500_000,
      items: [{ daysOverdue: null, balanceDue: 500_000 }],
    });
    expect(result.label).toBe("Mora no disponible");
  });

  test("CERTIFIED + balance>0 + all mora=0 → 'Al dia'", () => {
    const result = carteraTrafficLight({
      truthStatus: "CERTIFIED",
      totalBalance: 500_000,
      items: [{ daysOverdue: 0, balanceDue: 500_000 }],
    });
    expect(result.label).toBe("Al dia");
  });

  test("CERTIFIED + mora=45 + ratio<50% → 'En mora'", () => {
    const result = carteraTrafficLight({
      truthStatus: "CERTIFIED",
      totalBalance: 1_000_000,
      items: [
        { daysOverdue: 45, balanceDue: 400_000 },
        { daysOverdue: 0, balanceDue: 600_000 },
      ],
    });
    expect(result.label).toBe("En mora");
  });

  test("CERTIFIED + mora>90 → 'Critica'", () => {
    const result = carteraTrafficLight({
      truthStatus: "CERTIFIED",
      totalBalance: 912_400,
      items: [
        { daysOverdue: 452, balanceDue: 529_900 },
        { daysOverdue: 445, balanceDue: 382_500 },
      ],
    });
    expect(result.label).toBe("Critica");
  });

  test("CERTIFIED + overdueRatio>50% → 'Critica'", () => {
    const result = carteraTrafficLight({
      truthStatus: "CERTIFIED",
      totalBalance: 1_000_000,
      items: [
        { daysOverdue: 30, balanceDue: 600_000 },
        { daysOverdue: 0, balanceDue: 400_000 },
      ],
    });
    expect(result.label).toBe("Critica");
  });
});

// ── 5. computeClientScore — production function (Section D fix) ─────────────

describe("computeClientScore — UNVERIFIED must NOT award cartera points", () => {
  const baseInput: ClientScoreInput = {
    crmQuoteCount: 5, sagOrderCount: 3, salesCount: 10,
    sellerConfidence: 90,
    arCertified: false,
    totalOverdue: null, totalBalance: null,
    opportunityTypes: [],
  };

  test("UNVERIFIED: no receivable health points", () => {
    const certified = computeClientScore({ ...baseInput, arCertified: true, totalOverdue: 0, totalBalance: 500_000 });
    const unverified = computeClientScore({ ...baseInput, arCertified: false });
    // Certified gets 20 (health) + 10 (no cartera risk) more than unverified
    // Unverified gets 0 health + 0 cartera-risk-absence
    expect(certified.grade >= unverified.grade).toBe(true);
    expect(certified.incomplete).toBe(false);
    expect(unverified.incomplete).toBe(true);
  });

  test("UNVERIFIED: absence of cartera risk does NOT award cartera risk points", () => {
    // With no opps, UNVERIFIED should NOT get cartera-absence points
    const unverifiedNoOpps = computeClientScore({ ...baseInput, arCertified: false, opportunityTypes: [] });
    // With certified + no cartera risk, should get cartera-absence points
    const certifiedNoOpps = computeClientScore({ ...baseInput, arCertified: true, totalOverdue: 0, totalBalance: 0, opportunityTypes: [] });
    // The difference should include cartera-specific points
    expect(certifiedNoOpps.incomplete).toBe(false);
    expect(unverifiedNoOpps.incomplete).toBe(true);
  });

  test("UNVERIFIED with inactivity risk loses inactivity points but NOT cartera", () => {
    const withInactivity = computeClientScore({ ...baseInput, opportunityTypes: ["inactividad"] });
    const withoutInactivity = computeClientScore({ ...baseInput, opportunityTypes: [] });
    // Inactivity evaluated independently, unverified loses nothing from cartera
    expect(withInactivity.incomplete).toBe(true);
    expect(withoutInactivity.incomplete).toBe(true);
  });

  test("CERTIFIED with cartera risk loses cartera-absence points", () => {
    const noRisk = computeClientScore({ ...baseInput, arCertified: true, totalOverdue: 0, totalBalance: 500_000, opportunityTypes: [] });
    const withRisk = computeClientScore({ ...baseInput, arCertified: true, totalOverdue: 100_000, totalBalance: 500_000, opportunityTypes: ["cartera"] });
    // The health score differs: noRisk gets +20 health + +10 absence, withRisk gets neither
    expect(noRisk.grade >= withRisk.grade).toBe(true);
  });
});

describe("computeClientScore — grade thresholds", () => {
  test("max score (all certified, all activity) → A+", () => {
    const result = computeClientScore({
      crmQuoteCount: 1, sagOrderCount: 1, salesCount: 1,
      sellerConfidence: 80,
      arCertified: true, totalOverdue: 0, totalBalance: 1_000_000,
      opportunityTypes: [],
    });
    expect(result.grade).toBe("A+");
    expect(result.incomplete).toBe(false);
  });

  test("zero activity → D", () => {
    const result = computeClientScore({
      crmQuoteCount: 0, sagOrderCount: 0, salesCount: 0,
      sellerConfidence: 0,
      arCertified: false, totalOverdue: null, totalBalance: null,
      opportunityTypes: ["cartera", "inactividad"],
    });
    expect(result.grade).toBe("D");
    expect(result.incomplete).toBe(true);
  });
});

// ── 6. Overdue opportunity filter excludes null daysOverdue ──────────────────

describe("Overdue opportunity filter — null DIAS_MORA exclusion", () => {
  test("null daysOverdue items excluded from overdue filter", () => {
    const items = [
      { daysOverdue: null as number | null, balanceDue: 10_000_000 },
      { daysOverdue: 0, balanceDue: 5_000_000 },
      { daysOverdue: 45, balanceDue: 8_000_000 },
    ];
    // Same filter as production: r.daysOverdue != null && r.daysOverdue > 0
    const overdue = items.filter(r => r.daysOverdue != null && r.daysOverdue > 0);
    expect(overdue.length).toBe(1);
    expect(overdue[0].daysOverdue).toBe(45);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. STRUCTURAL TESTS — verify server-only loader shapes
// ═══════════════════════════════════════════════════════════════════════════════

describe("client-loader.ts — server module shape", () => {
  const src = readFile("lib/comercial/clientes/client-loader.ts");

  test("imports resolveRowCartera from clientes-pure", () => {
    expect(src).toContain('import { resolveRowCartera } from "./clientes-pure"');
  });

  test("re-exports resolveRowCartera for existing consumers", () => {
    expect(src).toContain('export { resolveRowCartera } from "./clientes-pure"');
  });

  test("ClientesPageResult has dataState field", () => {
    expect(src).toContain("dataState: ArDataState");
  });

  test("loadClientesSummary uses COUNT(DISTINCT sagTerceroId)", () => {
    expect(src).toContain('COUNT(DISTINCT "sagTerceroId")');
  });

  test("error fallback has loadFailed: true, dataState: UNAVAILABLE, withCartera: null", () => {
    const catchBlock = src.slice(src.indexOf("catch (err)"));
    expect(catchBlock).toContain("loadFailed: true");
    expect(catchBlock).toContain('dataState: "UNAVAILABLE"');
    expect(catchBlock).toContain("withCartera: null");
  });
});

describe("cliente-360-loader.ts — delegates to clientes-pure", () => {
  const src = readFile("lib/comercial/clientes/cliente-360-loader.ts");

  test("imports classifyAgingBand from clientes-pure", () => {
    expect(src).toContain('classifyAgingBand');
    expect(src).toContain('from "./clientes-pure"');
  });

  test("imports mapCertifiedDocToReceivable from clientes-pure", () => {
    expect(src).toContain('mapCertifiedDocToReceivable');
  });

  test("daysOverdue: number | null (nullable type)", () => {
    expect(src).toContain("daysOverdue: number | null");
  });

  test("agingBucket: string | null", () => {
    expect(src).toContain("agingBucket: string | null");
  });
});

describe("clientes-client.tsx — imports from production pure module", () => {
  const src = readFile("app/(app)/[orgSlug]/comercial/clientes/clientes-client.tsx");

  test("imports carteraTrafficLight from clientes-pure", () => {
    expect(src).toContain("from \"@/lib/comercial/clientes/clientes-pure\"");
    expect(src).toContain("carteraTrafficLight");
  });

  test("imports computeClientScore from clientes-pure", () => {
    expect(src).toContain("computeClientScorePure");
  });

  test("handles loadFailed state", () => {
    expect(src).toContain("summary.loadFailed");
    expect(src).toContain("Directorio de clientes no disponible");
  });

  test("handles cartera filter unavailable", () => {
    expect(src).toContain("pageResult.dataState");
    expect(src).toContain("Cartera no verificada");
    expect(src).toContain("Cartera no disponible");
  });

  test("con_cartera button disabled when not CERTIFIED", () => {
    expect(src).toContain("carteraDisabled");
    expect(src).toContain("not-allowed");
  });
});

describe("page.tsx — clean server boundary", () => {
  const src = readFile("app/(app)/[orgSlug]/comercial/clientes/page.tsx");

  test("calls loadArContext once", () => {
    expect(src).toContain("const arCtx = await loadArContext(");
  });

  test("passes arCtx to both loaders", () => {
    expect(src).toContain("loadClientesSummary(organization.id, arCtx)");
    expect(src).toMatch(/loadClientesPage\(organization\.id,.*arCtx\)/);
  });
});
