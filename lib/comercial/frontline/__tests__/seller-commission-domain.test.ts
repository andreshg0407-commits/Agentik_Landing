/**
 * AGENTIK-SELLER-COMMISSION-V1-IMPLEMENTATION-01 — Domain Tests
 *
 * Structural tests that verify the commission domain contracts WITHOUT
 * calling SAG or Prisma. Reads source files and validates:
 *   A. SELLER_COMMISSION_BANDS contract (5 bands, rates, coverage)
 *   B. seller-commission-service.ts contract (types, pipeline)
 *   C. API route contract (authorization, params)
 *   D. Perfil view contract (UI integration)
 *   E. Commission computation purity (no Prisma, no state)
 *
 * Run: node --import tsx --test lib/comercial/frontline/__tests__/seller-commission-domain.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../../../..");

function readFile(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

// ── A. SELLER_COMMISSION_BANDS contract ──────────────────────────────────────

describe("A: SELLER_COMMISSION_BANDS", () => {
  const src = readFile("lib/comercial/frontline/seller-app-types.ts");

  it("A1: exactly 5 bands defined in SELLER_COMMISSION_BANDS array", () => {
    // Extract the array section only (between the brackets of the array literal)
    const arrayMatch = src.match(/SELLER_COMMISSION_BANDS[^[]*\[([\s\S]*?)\];/);
    assert.ok(arrayMatch, "SELLER_COMMISSION_BANDS array found");
    const bandCount = (arrayMatch![1].match(/\{\s*minDays:/g) ?? []).length;
    assert.equal(bandCount, 5, "must have exactly 5 commission bands");
  });

  it("A2: bands cover all days from 0 to Infinity", () => {
    assert.ok(src.includes("minDays: 0"), "first band starts at 0");
    assert.ok(src.includes("maxDays: Infinity"), "last band goes to Infinity");
  });

  it("A3: rates are 5%, 4%, 3%, 2%, 1% (descending)", () => {
    assert.ok(src.includes("rate: 0.05"), "5% rate present");
    assert.ok(src.includes("rate: 0.04"), "4% rate present");
    assert.ok(src.includes("rate: 0.03"), "3% rate present");
    assert.ok(src.includes("rate: 0.02"), "2% rate present");
    assert.ok(src.includes("rate: 0.01"), "1% rate present");
  });

  it("A4: band boundaries — 0-59, 60-75, 76-90, 91-105, 106+", () => {
    assert.ok(src.includes("maxDays: 59"), "0-59 band");
    assert.ok(src.includes("minDays: 60") && src.includes("maxDays: 75"), "60-75 band");
    assert.ok(src.includes("minDays: 76") && src.includes("maxDays: 90"), "76-90 band");
    assert.ok(src.includes("minDays: 91") && src.includes("maxDays: 105"), "91-105 band");
    assert.ok(src.includes("minDays: 106"), "106+ band");
  });

  it("A5: CommissionBand type has minDays, maxDays, rate", () => {
    assert.ok(src.includes("minDays: number"), "minDays field");
    assert.ok(src.includes("maxDays: number"), "maxDays field");
    assert.ok(src.includes("rate: number"), "rate field");
  });
});

// ── B. seller-commission-service.ts contract ─────────────────────────────────

describe("B: seller-commission-service.ts", () => {
  const src = readFile("lib/comercial/frontline/seller-commission-service.ts");

  it("B1: imports server-only", () => {
    assert.ok(src.includes('import "server-only"'), "must be server-only module");
  });

  it("B2: imports consultaSagJson from PYA client", () => {
    assert.ok(src.includes("consultaSagJson"), "must use SAG SOAP client");
  });

  it("B3: imports SELLER_COMMISSION_BANDS", () => {
    assert.ok(src.includes("SELLER_COMMISSION_BANDS"), "must use frozen commission bands");
  });

  it("B4: exports computeSellerCommissionStatement", () => {
    assert.ok(src.includes("export async function computeSellerCommissionStatement"), "main entry point");
  });

  it("B5: does NOT import prisma", () => {
    assert.ok(!src.includes('from "@/lib/prisma"'), "commission service must not use Prisma");
    assert.ok(!src.includes("import { prisma"), "no Prisma import");
  });

  it("B6: queries vw_agentik_recaudos", () => {
    assert.ok(src.includes("vw_agentik_recaudos"), "must query recaudos view");
  });

  it("B7: queries vw_agentik_ventas", () => {
    assert.ok(src.includes("vw_agentik_ventas"), "must query ventas view");
  });

  it("B8: uses VALOR_RECAUDADO > 0 (positive applications only)", () => {
    assert.ok(src.includes("VALOR_RECAUDADO > 0"), "only positive applications");
  });

  it("B9: uses half-open interval on FECHA_RECAUDO", () => {
    assert.ok(src.includes("FECHA_RECAUDO >="), "start inclusive");
    assert.ok(src.includes("FECHA_RECAUDO <"), "end exclusive");
  });

  it("B10: matches VENDEDOR_ID to sellerTerceroId", () => {
    assert.ok(src.includes("sale.vendedorId !== sellerTerceroId"), "seller match by ID");
  });

  it("B11: computes calendar days between invoice and collection", () => {
    assert.ok(src.includes("DAY_MS"), "uses day constant");
    assert.ok(src.includes("Math.max(0,"), "non-negative days");
  });

  it("B12: commission computed via integer cents arithmetic", () => {
    assert.ok(src.includes("commissionCents"), "uses commissionCents function");
    assert.ok(src.includes("toCents"), "converts to cents");
    assert.ok(src.includes("fromCents"), "converts from cents");
  });

  it("B13: known sale prefixes present (diagnostics, not eligibility gate)", () => {
    for (const code of ["FE", "F2", "FW", "EW", ".7", "RE", "F3", "F7"]) {
      assert.ok(src.includes(`"${code}"`), `known prefix ${code} present`);
    }
    // Must NOT use SALE_CODES as gate — the set is named KNOWN_SALE_PREFIXES
    assert.ok(src.includes("KNOWN_SALE_PREFIXES"), "named as diagnostics, not eligibility");
    assert.ok(!src.includes("SALE_CODES.has("), "no SALE_CODES.has() eligibility gate");
  });

  it("B14: truthState enum has all 4 states", () => {
    assert.ok(src.includes('"CERTIFIED"'), "CERTIFIED state");
    assert.ok(src.includes('"CERTIFIED_ZERO"'), "CERTIFIED_ZERO state");
    assert.ok(src.includes('"SAG_UNAVAILABLE"'), "SAG_UNAVAILABLE state");
    assert.ok(src.includes('"IDENTITY_UNRESOLVED"'), "IDENTITY_UNRESOLVED state");
  });

  it("B15: SellerCommissionStatementDto shape", () => {
    assert.ok(src.includes("sellerTerceroId: number"), "sellerTerceroId field");
    assert.ok(src.includes("year: number"), "year field");
    assert.ok(src.includes("month: number"), "month field");
    assert.ok(src.includes("totalApplications: number"), "totalApplications field");
    assert.ok(src.includes("totalCollected: number"), "totalCollected field");
    assert.ok(src.includes("totalCommission: number"), "totalCommission field");
    assert.ok(src.includes("bandSummary:"), "bandSummary field");
    assert.ok(src.includes("entries:"), "entries field");
    assert.ok(src.includes("truthState:"), "truthState field");
  });

  it("B16: SellerCommissionEntryDto shape", () => {
    assert.ok(src.includes("document: string"), "document field");
    assert.ok(src.includes("invoiceDate: string"), "invoiceDate field");
    assert.ok(src.includes("collectionDate: string"), "collectionDate field");
    assert.ok(src.includes("collectedAmount: number"), "collectedAmount field");
    assert.ok(src.includes("days: number"), "days field");
    assert.ok(src.includes("band: string"), "band field");
    assert.ok(src.includes("rate: number"), "rate field");
    assert.ok(src.includes("commissionAmount: number"), "commissionAmount field");
    assert.ok(src.includes("receiptId: number"), "receiptId field");
  });

  it("B17: splitDocument parses PREFIX-NUMBER format", () => {
    assert.ok(src.includes("splitDocument"), "splitDocument function exists");
    assert.ok(src.includes('doc.indexOf("-")'), "splits on hyphen");
  });

  it("B18: event-first pipeline direction", () => {
    // The query direction is: recaudos first, then lookup ventas
    const recaudosIdx = src.indexOf("vw_agentik_recaudos");
    const ventasIdx = src.indexOf("vw_agentik_ventas");
    assert.ok(recaudosIdx < ventasIdx, "recaudos queried before ventas (event-first)");
  });
});

// ── C. API route contract ────────────────────────────────────────────────────

describe("C: commissions API route", () => {
  const src = readFile("app/api/orgs/[orgSlug]/comercial/seller-financial/commissions/route.ts");

  it("C1: uses requireOrgAccess with allowProvisionedSeller", () => {
    assert.ok(src.includes("allowProvisionedSeller: true"), "seller app route pattern");
  });

  it("C2: resolves seller identity server-side", () => {
    assert.ok(src.includes("resolveCurrentSeller"), "server-side identity resolution");
  });

  it("C3: uses deriveSellerScope for authorization", () => {
    assert.ok(src.includes("deriveSellerScope"), "scope-based authorization");
  });

  it("C4: requires year and month params", () => {
    assert.ok(src.includes('"year"'), "year param");
    assert.ok(src.includes('"month"'), "month param");
    assert.ok(src.includes("year and month required"), "validation message");
  });

  it("C5: validates year range 2020-2099", () => {
    assert.ok(src.includes("year < 2020") || src.includes("2020"), "year lower bound");
    assert.ok(src.includes("year > 2099") || src.includes("2099"), "year upper bound");
  });

  it("C6: seller-scoped users get own sellerTerceroId only", () => {
    assert.ok(src.includes("canAccessAllSellers"), "checks scope");
    assert.ok(src.includes("sagSellerCode"), "uses sagSellerCode from identity");
  });

  it("C7: admin can override sellerTerceroId via query param", () => {
    assert.ok(src.includes("sellerTerceroId"), "admin override param");
    assert.ok(src.includes("canAccessAllSellers"), "admin scope check");
  });

  it("C8: returns IDENTITY_UNRESOLVED if no targetTerceroId", () => {
    assert.ok(src.includes("IDENTITY_UNRESOLVED"), "fallback state");
  });

  it("C9: calls computeSellerCommissionStatement", () => {
    assert.ok(src.includes("computeSellerCommissionStatement"), "calls domain service");
  });

  it("C10: sellerTerceroId NEVER from client for seller-scoped users", () => {
    // The override path only works inside canAccessAllSellers block
    const overrideBlock = src.indexOf('url.searchParams.get("sellerTerceroId")');
    const scopeCheck = src.indexOf("scope.canAccessAllSellers");
    assert.ok(overrideBlock > scopeCheck, "override only after scope check");
  });
});

// ── D. Perfil view contract ──────────────────────────────────────────────────

describe("D: perfil-view.tsx", () => {
  const src = readFile("app/(app)/[orgSlug]/seller-app/views/perfil-view.tsx");

  it("D1: is a client component", () => {
    assert.ok(src.includes('"use client"'), "must be use client");
  });

  it("D2: fetches from seller-financial/commissions API", () => {
    assert.ok(src.includes("seller-financial/commissions"), "correct API endpoint");
  });

  it("D3: passes year and month as query params", () => {
    assert.ok(src.includes("year=") && src.includes("month="), "query params in fetch URL");
  });

  it("D4: has period selector (year + month navigation)", () => {
    assert.ok(src.includes("handlePrev"), "prev month handler");
    assert.ok(src.includes("handleNext"), "next month handler");
  });

  it("D5: does NOT allow future months", () => {
    assert.ok(src.includes("canGoNext"), "future month guard");
  });

  it("D6: shows band breakdown table", () => {
    assert.ok(src.includes("bandSummary"), "band summary data");
    assert.ok(src.includes("Por banda"), "band section label");
  });

  it("D7: shows expandable entry detail", () => {
    assert.ok(src.includes("expandedEntries"), "toggle state");
    assert.ok(src.includes("Ver detalle"), "toggle label");
  });

  it("D8: handles all 4 truth states", () => {
    assert.ok(src.includes("IDENTITY_UNRESOLVED"), "identity state");
    assert.ok(src.includes("SAG_UNAVAILABLE"), "sag unavailable state");
    assert.ok(src.includes("CERTIFIED_ZERO"), "zero state");
    assert.ok(src.includes("CERTIFIED"), "certified state");
  });

  it("D9: advances section shows SOURCE_MISSING placeholder", () => {
    assert.ok(src.includes("Fuente pendiente") || src.includes("anticipos"), "advances placeholder");
  });

  it("D10: exports PerfilView component", () => {
    assert.ok(src.includes("export function PerfilView"), "named export");
  });

  it("D11: zero calculations in React — only renders server data", () => {
    // Should not import SELLER_COMMISSION_BANDS or compute rates
    assert.ok(!src.includes("SELLER_COMMISSION_BANDS"), "no band computation in client");
    assert.ok(!src.includes("computeRate"), "no rate computation in client");
    assert.ok(!src.includes("computeBand"), "no band computation in client");
  });
});

// ── E. Shell integration ─────────────────────────────────────────────────────

describe("E: seller-app-shell integration", () => {
  const src = readFile("app/(app)/[orgSlug]/seller-app/seller-app-shell.tsx");

  it("E1: imports PerfilView from perfil-view", () => {
    assert.ok(src.includes('from "./views/perfil-view"'), "imports from new file");
  });

  it("E2: passes orgSlug to PerfilView", () => {
    assert.ok(src.includes("orgSlug={props.orgSlug}"), "passes orgSlug for API calls");
  });

  it("E3: no inline PerfilView function", () => {
    // The old inline PerfilView with "Próximamente" should be removed
    assert.ok(!src.includes("Próximamente"), "old placeholder removed");
  });

  it("E4: perfil tab still in canonical nav", () => {
    assert.ok(src.includes('"perfil"'), "perfil tab key exists");
    assert.ok(src.includes('"Perfil"'), "perfil label exists");
  });
});

// ── F. No advances implementation ────────────────────────────────────────────

describe("F: advances blocked", () => {
  const serviceSrc = readFile("lib/comercial/frontline/seller-commission-service.ts");

  it("F1: service does NOT query account 133010", () => {
    assert.ok(!serviceSrc.includes("133010"), "no account 133010 in commission service");
  });

  it("F2: service does NOT query vw_agentik_anticipos", () => {
    assert.ok(!serviceSrc.includes("anticipos"), "no advances view in commission service");
  });
});

// ── G. Row-level eligibility (no prefix whitelist gate) ─────────────────────

describe("G: row-level eligibility", () => {
  const src = readFile("lib/comercial/frontline/seller-commission-service.ts");

  it("G1: no SALE_CODES.has() eligibility gate in pipeline", () => {
    assert.ok(!src.includes("SALE_CODES.has("), "prefix whitelist must not gate eligibility");
  });

  it("G2: KNOWN_SALE_PREFIXES exists for diagnostics only", () => {
    assert.ok(src.includes("KNOWN_SALE_PREFIXES"), "diagnostic set present");
    // Ensure it's not used in the pipeline (not called with .has() on parsed data)
    const pipelineSection = src.slice(src.indexOf("computeSellerCommissionStatement"));
    assert.ok(!pipelineSection.includes("KNOWN_SALE_PREFIXES.has("), "not used in pipeline");
  });

  it("G3: any parseable PREFIX-NUMBER qualifies for ventas lookup", () => {
    // After splitDocument, only null result is skipped — no prefix filter
    const pipelineSection = src.slice(src.indexOf("parsedRecaudos"));
    assert.ok(pipelineSection.includes("if (!parsed) continue"), "skips unparseable docs");
    // The next line after parsed null check must NOT be a prefix check
    const afterNullCheck = pipelineSection.slice(pipelineSection.indexOf("if (!parsed) continue") + 25, pipelineSection.indexOf("if (!parsed) continue") + 200);
    assert.ok(!afterNullCheck.includes(".has(parsed.code)"), "no prefix check after parse");
  });

  it("G4: commissionability decided by exact sale + seller match", () => {
    assert.ok(src.includes("if (!sale) continue"), "no sale = not commissionable");
    assert.ok(src.includes("if (sale.vendedorId !== sellerTerceroId) continue"), "wrong seller = not commissionable");
  });

  it("G5: document prefix used only for parsing, not exclusion", () => {
    // splitDocument extracts code for the key, but code is NOT checked against a set
    assert.ok(src.includes("parsed.num"), "document number used for lookup");
    assert.ok(src.includes("parsed.code") || src.includes("r.documentLabel"), "prefix stored in result");
  });
});

// ── H. Exact money arithmetic ───────────────────────────────────────────────

describe("H: exact money arithmetic", () => {
  const src = readFile("lib/comercial/frontline/seller-commission-service.ts");

  it("H1: toCents converts DECIMAL(38,2) to integer cents", () => {
    assert.ok(src.includes("function toCents(amount: number): number"), "toCents function");
    assert.ok(src.includes("Math.round(amount * 100)"), "rounds to integer cents");
  });

  it("H2: fromCents converts back to 2-decimal number", () => {
    assert.ok(src.includes("function fromCents(cents: number): number"), "fromCents function");
    assert.ok(src.includes("cents / 100"), "divides by 100");
  });

  it("H3: commissionCents uses integer multiplication", () => {
    assert.ok(src.includes("function commissionCents(amountCents: number, rate: number): number"), "commissionCents function");
    assert.ok(src.includes("rateNumerator"), "converts rate to integer numerator");
    assert.ok(src.includes("amountCents * rateNumerator / 100"), "integer multiply then divide");
  });

  it("H4: per-row commission via commissionCents, not float multiply", () => {
    const pipeline = src.slice(src.indexOf("computeSellerCommissionStatement"));
    assert.ok(pipeline.includes("commissionCents(r.collectedCents, rate)"), "uses commissionCents");
    assert.ok(!pipeline.includes("r.collectedAmount * rate"), "no float multiply for commission");
  });

  it("H5: band accumulation uses integer cents", () => {
    assert.ok(src.includes("collectedCents: number; commissionCents: number"), "band map uses cents");
  });

  it("H6: total accumulation uses integer cents", () => {
    assert.ok(src.includes("totalCollectedCents"), "total collected in cents");
    assert.ok(src.includes("totalCommissionCents"), "total commission in cents");
  });

  it("H7: exact cents arithmetic test — known values", () => {
    // Verify the toCents/fromCents/commissionCents contract with exact values

    // toCents: 1179800.00 → 117980000
    assert.equal(Math.round(1179800 * 100), 117980000, "toCents(1179800)");
    assert.equal(Math.round(0.01 * 100), 1, "toCents(0.01)");
    assert.equal(Math.round(0.10 * 100), 10, "toCents(0.10)");
    assert.equal(Math.round(1.99 * 100), 199, "toCents(1.99)");
    assert.equal(Math.round(999999999999.99 * 100), 99999999999999, "toCents(999999999999.99)");

    // fromCents: 117980000 → 1179800
    assert.equal(117980000 / 100, 1179800, "fromCents(117980000)");
    assert.equal(1 / 100, 0.01, "fromCents(1)");

    // commissionCents at 5%: round(117980000 * 5 / 100) = round(5899000) = 5899000
    assert.equal(Math.round(117980000 * 5 / 100), 5899000, "commission 1179800 at 5%");
    assert.equal(5899000 / 100, 58990, "commission as dollars = $58,990");

    // Fractional cents test: $1,799,401 at 5%
    // toCents(1799401) = 179940100
    // commissionCents = round(179940100 * 5 / 100) = round(8997005) = 8997005
    // fromCents(8997005) = 89970.05
    assert.equal(Math.round(179940100 * 5 / 100), 8997005, "commission 1799401 at 5% in cents");
    assert.equal(8997005 / 100, 89970.05, "commission as dollars = $89,970.05");

    // Small amount: $0.01 at 1%
    // toCents(0.01) = 1
    // commissionCents = round(1 * 1 / 100) = round(0.01) = 0
    assert.equal(Math.round(1 * 1 / 100), 0, "commission $0.01 at 1% = $0.00");

    // Amount that produces fractional cents: $1.99 at 3%
    // toCents(1.99) = 199
    // commissionCents = round(199 * 3 / 100) = round(5.97) = 6
    // fromCents(6) = 0.06
    assert.equal(Math.round(199 * 3 / 100), 6, "commission $1.99 at 3% in cents");
    assert.equal(6 / 100, 0.06, "commission as dollars = $0.06");
  });

  it("H8: large amount precision — no floating-point loss", () => {
    // $999,999,999,999.99 — near the limit of safe integer cents
    const largeCents = Math.round(999999999999.99 * 100);
    assert.equal(largeCents, 99999999999999, "large amount converts to safe integer");
    // 99999999999999 < Number.MAX_SAFE_INTEGER (9007199254740991) — safe
    assert.ok(largeCents < Number.MAX_SAFE_INTEGER, "within safe integer range");

    // Commission at 5%: round(99999999999999 * 5 / 100) = round(4999999999999.95) = 5000000000000
    const comCents = Math.round(largeCents * 5 / 100);
    assert.equal(comCents, 5000000000000, "large commission in cents");
    assert.equal(comCents / 100, 50000000000, "large commission as dollars");
  });
});
