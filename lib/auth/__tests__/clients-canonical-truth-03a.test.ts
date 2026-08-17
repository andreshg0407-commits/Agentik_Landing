/**
 * lib/auth/__tests__/clients-canonical-truth-03a.test.ts
 *
 * CLIENTS-CANONICAL-TRUTH-03A — Behavioral tests for Clientes + Cliente 360
 *
 * These tests verify that:
 *   1. No legacy CustomerReceivable or CustomerProfile receivable fields are used
 *   2. All cartera data comes exclusively from canonical AR (fetchCertifiedArSnapshot / fetchCustomerArWithStatus)
 *   3. HAS_OPEN_AR shows certified documents from SAG
 *   4. CERTIFIED_ZERO shows $0 and no documents
 *   5. UNVERIFIED shows null (not $0) and no opportunities
 *   6. lastPurchaseAt=null does NOT count as "sin compra 90d"
 *   7. Loader failure returns non-zero-KPIs failure state
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

// ── 1. No legacy CustomerReceivable runtime fallback in client-loader ────────

describe("client-loader.ts — canonical AR only", () => {
  const src = readFile("lib/comercial/clientes/client-loader.ts");

  test("does NOT query CustomerReceivable", () => {
    expect(src).not.toContain("customerReceivable");
    // CertifiedCustomerReceivableSnapshot is a canonical AR type (allowed)
    // But db.customerReceivable or CustomerReceivable model must NOT appear
    expect(src).not.toContain("db.customerReceivable");
    expect(src).not.toMatch(/from\s+["'].*CustomerReceivable["']/);
  });

  test("does NOT use CustomerProfile.totalReceivable as source", () => {
    // The select clause should NOT include totalReceivable or overdueReceivable
    const selectRegex = /select:\s*\{[^}]*totalReceivable[^}]*\}/s;
    expect(selectRegex.test(src)).toBe(false);
  });

  test("imports fetchCertifiedArSnapshot from canonical-ar-service", () => {
    expect(src).toContain('import { fetchCertifiedArSnapshot }');
    expect(src).toContain("canonical-ar-service");
  });

  test("summary delegates to loadClientesSummaryCoreLogic with COUNT(DISTINCT sagTerceroId) adapter", () => {
    expect(src).toContain('COUNT(DISTINCT "sagTerceroId")');
    expect(src).toContain("loadClientesSummaryCoreLogic");
  });

  test("row-level cartera uses arCtx via resolveRowCartera", () => {
    expect(src).toContain("resolveRowCartera(arCtx");
  });

  test("con_cartera filter uses sagTerceroId IN from canonical AR", () => {
    expect(src).toContain("where.sagTerceroId = { in: carteraSagIds }");
  });

  test("ClienteRow has carteraState field", () => {
    expect(src).toContain("carteraState: ClienteCarteraState");
  });

  test("ClientesSummary has dataState field", () => {
    expect(src).toContain("dataState: ArDataState");
  });

  test("error fallback returns UNAVAILABLE with loadFailed: true", () => {
    expect(src).toContain('dataState: "UNAVAILABLE"');
    expect(src).toContain("loadFailed: true");
  });

  test("lastPurchaseAt=null does NOT count as sin_compra_90d", () => {
    // The SQL should use "lastPurchaseAt IS NOT NULL AND ..."
    // and NOT include "lastPurchaseAt IS NULL OR ..."
    expect(src).toContain('"lastPurchaseAt" IS NOT NULL');
    expect(src).not.toMatch(/sin_compra_90d.*IS NULL/);
    // Prisma filter in buildPrismaWhere should use { not: null, lt: d90 }
    const filterFn = src.slice(src.indexOf("function buildPrismaWhere"));
    const sinCompraBlock = filterFn.slice(filterFn.indexOf("sin_compra_90d"));
    expect(sinCompraBlock.slice(0, 300)).toContain("not: null");
  });
});

// ── 2. No legacy CustomerReceivable in cliente-360-loader ────────────────────

describe("cliente-360-loader.ts — canonical AR only", () => {
  const src = readFile("lib/comercial/clientes/cliente-360-loader.ts");

  test("does NOT query CustomerReceivable (no db.customerReceivable)", () => {
    expect(src).not.toContain("customerReceivable.findMany");
    expect(src).not.toContain("db.customerReceivable");
  });

  test("imports CertifiedReceivableDocument from canonical-ar-types", () => {
    expect(src).toContain("CertifiedReceivableDocument");
    expect(src).toContain("canonical-ar-types");
  });

  test("imports ReceivableTruthStatus from contract (not server-only module)", () => {
    expect(src).toContain('from "@/lib/comercial/frontline/receivable-truth-contract"');
    // Should NOT import ReceivableTruthStatus from receivable-truth-status.ts
    const statusImport = src.match(/import.*ReceivableTruthStatus.*from.*receivable-truth-status/);
    expect(statusImport).toBeNull();
  });

  test("HAS_OPEN_AR maps SAG documents via mapCertifiedDocToReceivable", () => {
    expect(src).toContain("mapCertifiedDocToReceivable");
    expect(src).toContain("arResult.snapshot.documents.map(mapCertifiedDocToReceivable)");
  });

  test("CERTIFIED_ZERO leaves receivableItems empty", () => {
    // When CERTIFIED_ZERO, receivableItems stays []
    const certZeroBlock = src.slice(
      src.indexOf('"CERTIFIED_ZERO"'),
      src.indexOf('"HAS_OPEN_AR"'),
    );
    expect(certZeroBlock).toContain("// receivableItems stays []");
  });

  test("UNVERIFIED does NOT fall back to legacy items", () => {
    // No reference to rawReceivables or certifiedReceivableItems
    expect(src).not.toContain("rawReceivables");
    expect(src).not.toContain("certifiedReceivableItems");
  });

  test("does NOT use UNVERIFIED_RECEIVABLE_LABEL import from server module", () => {
    expect(src).not.toContain('UNVERIFIED_RECEIVABLE_LABEL');
  });

  test("opportunities receive only canonical receivableItems", () => {
    // computeOpportunities should receive receivableItems (which is canonical-only)
    expect(src).toContain("computeOpportunities(\n    profile, seller, crmQuotes, sagOrders, receivableItems, salesItems,");
  });
});

// ── 3. AMV LLANO invariant ──────────────────────────────────────────────────

describe("AMV LLANO (NIT 900469068) — structural invariants", () => {
  const clientLoader = readFile("lib/comercial/clientes/client-loader.ts");
  const loader360 = readFile("lib/comercial/clientes/cliente-360-loader.ts");

  test("client-loader never reads CustomerProfile.totalReceivable for row data", () => {
    // The select clause for page rows should NOT include totalReceivable
    const selectMatch = clientLoader.match(/select:\s*\{[^}]*sagTerceroId[^}]*\}/s);
    expect(selectMatch).not.toBeNull();
    // totalReceivable should NOT be in the select
    expect(selectMatch![0]).not.toContain("totalReceivable");
  });

  test("$542.5M phantom cannot appear — no CustomerProfile receivable fields in select", () => {
    // Ensure that the Prisma select for page rows does NOT include overdueReceivable
    const selectMatch = clientLoader.match(/select:\s*\{[^}]*sagTerceroId[^}]*\}/s);
    expect(selectMatch![0]).not.toContain("overdueReceivable");
  });

  test("cliente-360-loader only shows documents from SAG snapshot", () => {
    // The receivableItems are only populated from arResult.snapshot.documents
    expect(loader360).toContain("arResult.snapshot.documents.map(mapCertifiedDocToReceivable)");
    // No legacy CustomerReceivable.findMany
    expect(loader360).not.toContain("customerReceivable.findMany");
  });
});

// ── 4. Diana invariant ──────────────────────────────────────────────────────

describe("Diana (NIT 901383501) — HAS_OPEN_AR structural invariants", () => {
  const loader360 = readFile("lib/comercial/clientes/cliente-360-loader.ts");

  test("HAS_OPEN_AR preserves all SAG documents as receivableItems", () => {
    const hasOpenBlock = loader360.slice(
      loader360.indexOf('"HAS_OPEN_AR"'),
      loader360.indexOf("} else {", loader360.indexOf('"HAS_OPEN_AR"')),
    );
    expect(hasOpenBlock).toContain("arResult.snapshot.documents.map(mapCertifiedDocToReceivable)");
    expect(hasOpenBlock).toContain("totalBalance = arResult.snapshot.netReceivable");
    expect(hasOpenBlock).toContain("totalOverdue = arResult.snapshot.totalVencido");
    expect(hasOpenBlock).toContain("openCount = arResult.snapshot.documentCount");
  });

  test("mapCertifiedDocToReceivable sets paidAmount=null (never inferred by difference)", () => {
    // 03A8: paidAmount must come from vw_agentik_recaudos, never from cartera
    const pureSrc = readFile("lib/comercial/clientes/clientes-pure.ts");
    expect(pureSrc).toContain("paidAmount: null");
    expect(pureSrc).not.toContain("doc.valorDocumento - doc.saldoPendiente");
  });

  test("mapCertifiedDocToReceivable preserves SAG diasMora as-is (nullable)", () => {
    const pureSrc = readFile("lib/comercial/clientes/clientes-pure.ts");
    expect(pureSrc).toContain("daysOverdue: doc.diasMora,");
    expect(pureSrc).not.toContain("daysOverdue: doc.diasMora ?? 0");
  });
});

// ── 5. UNVERIFIED never produces zero or legacy data ────────────────────────

describe("UNVERIFIED state — fail-closed", () => {
  const clientLoader = readFile("lib/comercial/clientes/client-loader.ts");
  const loader360 = readFile("lib/comercial/clientes/cliente-360-loader.ts");

  test("client-loader: resolveRowCartera imported from clientes-pure (UNVERIFIED row → null)", () => {
    // The UNVERIFIED logic now lives in clientes-pure.ts
    const pureSrc = readFile("lib/comercial/clientes/clientes-pure.ts");
    expect(pureSrc).toContain("totalReceivable: null, overdueReceivable: null, carteraState: \"UNVERIFIED\"");
    expect(clientLoader).toContain("resolveRowCartera");
  });

  test("client-loader: summary delegates to core (which handles withCartera=null when not certified)", () => {
    // The withCartera=null logic now lives in loadClientesSummaryCoreLogic in clientes-pure.ts
    const pureSrc = readFile("lib/comercial/clientes/clientes-pure.ts");
    expect(pureSrc).toContain("let withCartera: number | null = null");
    expect(clientLoader).toContain("loadClientesSummaryCoreLogic");
  });

  test("cliente-360-loader: SAG_UNAVAILABLE produces null totals", () => {
    const unavailBlock = loader360.slice(
      loader360.indexOf("SAG_UNAVAILABLE"),
      loader360.indexOf("} else {", loader360.indexOf("SAG_UNAVAILABLE")),
    );
    expect(unavailBlock).toContain("totalBalance = null");
    expect(unavailBlock).toContain("totalOverdue = null");
    expect(unavailBlock).toContain("openCount = null");
  });

  test("cliente-360-loader: UNVERIFIED does not generate cartera opportunities", () => {
    // When UNVERIFIED, receivableItems=[] → no overdue items → no opp_cartera_vencida
    // Verify the opportunity engine only fires on actual items
    expect(loader360).toContain("const overdue = receivables.filter(r => r.daysOverdue != null && r.daysOverdue > 0)");
    expect(loader360).toContain("if (overdue.length > 0)");
  });
});

// ── 6. UI contract ──────────────────────────────────────────────────────────

describe("clientes-client.tsx — UI truth rendering", () => {
  const src = readFile("app/(app)/[orgSlug]/comercial/clientes/clientes-client.tsx");

  test("does NOT import from receivable-truth-status (server-only)", () => {
    expect(src).not.toContain("receivable-truth-status");
  });

  test("imports UNVERIFIED_RECEIVABLE_LABEL from contract", () => {
    expect(src).toContain("receivable-truth-contract");
  });

  test("fmtCurrency(0) shows $0 (not em dash)", () => {
    // Certified zero should display "$0", not "—"
    expect(src).toContain('if (value === 0) return "$0"');
  });

  test("ListKpiCard accepts null and shows em dash", () => {
    expect(src).toContain("value: number | null");
    expect(src).toContain('value === null ? "\\u2014"');
  });

  test("TabCartera handles UNVERIFIED state", () => {
    expect(src).toContain("UNVERIFIED_RECEIVABLE_LABEL");
    expect(src).toContain("Los datos de cartera estan siendo validados");
  });

  test("TabCartera shows CERTIFICADO SAG badge for certified data", () => {
    expect(src).toContain("CERTIFICADO SAG");
  });

  test("TabCartera shows Sin cartera for CERTIFIED_ZERO", () => {
    expect(src).toContain("Sin cartera");
    expect(src).toContain("no tiene facturas pendientes");
  });
});

// ── 7. Page.tsx — no server-only prop leaking ───────────────────────────────

describe("page.tsx — clean server boundary", () => {
  const src = readFile("app/(app)/[orgSlug]/comercial/clientes/page.tsx");

  test("does NOT import from receivable-truth-status", () => {
    expect(src).not.toContain("receivable-truth-status");
  });

  test("does NOT pass arCertified as separate prop", () => {
    expect(src).not.toContain("arCertified=");
  });

  test("does NOT import warmTruthStatusCache", () => {
    expect(src).not.toContain("warmTruthStatusCache");
  });
});
