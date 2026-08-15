/**
 * cliente-cartera-truth.test.ts
 *
 * Sprint: MANAGER-PRODUCTION-TRUTH-GATE
 * Section 1: COMM-AR-TRUTH-01
 *
 * Verifies that the 360 loader uses canonical AR service (SAG vw_agentik_cartera)
 * for certified receivable totals, and does NOT fall back to Prisma saldo when
 * SAG is unavailable (because CustomerReceivable.paidAmount is always 0).
 *
 * Key proof:
 *   - CustomerReceivable.paidAmount is ALWAYS 0 in Castillitos (legacy bug)
 *   - balanceDue = originalAmount (never reduced by payments)
 *   - SAG vw_agentik_cartera.SALDO_PENDIENTE is pre-computed and includes all collections
 *   - The 360 loader MUST prefer canonical AR when sagTerceroId is available
 *   - When SAG unavailable: totals are null + UNVERIFIED (NOT Prisma saldo)
 *   - Manager shows UNVERIFIED_RECEIVABLE_LABEL, never uncertified financial figures
 *   - Manager suppresses overdue attention when truth != CERTIFIED
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "../../../..");

function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf-8");
}

describe("COMM-AR-TRUTH-01 — cartera truth certification", () => {
  const loaderCode = readFile("lib/comercial/clientes/cliente-360-loader.ts");
  const adapterCode = readFile("lib/comercial/manager/manager-commercial-adapter.ts");
  const certificationCode = readFile("lib/comercial/frontline/canonical-ar-certification.ts");
  const truthStatusCode = readFile("lib/comercial/frontline/receivable-truth-status.ts");
  const arServiceCode = readFile("lib/comercial/frontline/canonical-ar-service.ts");
  const contextCode = readFile("lib/comercial/frontline/customer-commercial-context.ts");
  const typesCode = readFile("lib/comercial/manager/manager-commercial-types.ts");

  // ── 1. Legacy pipeline data quality proof ────────────────────────────────

  test("canonical-ar-certification documents that CustomerReceivable.paidAmount is always 0", () => {
    expect(certificationCode).toContain("paidAmount always 0");
    // AMV LLANO proof: legacy showed $542M but SAG shows fully paid
    expect(certificationCode).toContain("LEGACY_VALUE: ~542M overdue (from CustomerReceivable where paidAmount=0)");
    expect(certificationCode).toContain("Legacy pipeline never applied any collections");
  });

  test("receivable-truth-status marks Castillitos as CERTIFIED", () => {
    expect(truthStatusCode).toContain("DEFAULT_TRUTH_STATUS: ReceivableTruthStatus = \"UNVERIFIED\"");
    expect(truthStatusCode).toContain('castillitos: "CERTIFIED"');
  });

  // ── 2. Canonical AR service authority ────────────────────────────────────

  test("canonical-ar-service queries vw_agentik_cartera (certified authority)", () => {
    expect(arServiceCode).toContain("SELECT * FROM vw_agentik_cartera");
    expect(arServiceCode).toContain("SALDO_PENDIENTE is pre-computed by SAG");
  });

  test("canonical-ar-service supports per-customer query by CLIENTE_ID", () => {
    expect(arServiceCode).toContain("fetchCustomerArWithStatus");
    expect(arServiceCode).toContain("CLIENTE_ID = ");
  });

  test("canonical-ar-service distinguishes CERTIFIED_ZERO from IDENTITY_UNKNOWN", () => {
    expect(arServiceCode).toContain("CERTIFIED_ZERO");
    expect(arServiceCode).toContain("IDENTITY_UNKNOWN");
    // Verifies TERCEROS existence before certifying zero
    expect(arServiceCode).toContain("SELECT ka_nl_tercero FROM TERCEROS");
  });

  // ── 3. 360 loader canonical AR integration ──────────────────────────────

  test("360 loader imports fetchCustomerArWithStatus from canonical-ar-service", () => {
    expect(loaderCode).toContain('import { fetchCustomerArWithStatus } from "@/lib/comercial/frontline/canonical-ar-service"');
  });

  test("360 loader imports ReceivableTruthStatus", () => {
    expect(loaderCode).toContain('import type { ReceivableTruthStatus }');
  });

  test("360 loader imports UNVERIFIED_RECEIVABLE_LABEL", () => {
    expect(loaderCode).toContain('import { UNVERIFIED_RECEIVABLE_LABEL }');
  });

  test("360 loader calls canonical AR when sagTerceroId exists", () => {
    expect(loaderCode).toContain("p.sagTerceroId != null && p.sagTerceroId > 0");
    expect(loaderCode).toContain("fetchCustomerArWithStatus(p.sagTerceroId)");
  });

  test("360 loader uses certified totals from canonical AR (not Prisma)", () => {
    // When HAS_OPEN_AR: use snapshot totals
    expect(loaderCode).toContain("arResult.snapshot.totalPendiente");
    expect(loaderCode).toContain("arResult.snapshot.totalVencido");
    expect(loaderCode).toContain("arResult.snapshot.documentCount");
  });

  test("360 loader sets truthStatus = CERTIFIED when canonical AR succeeds", () => {
    expect(loaderCode).toContain('receivableTruthStatus = "CERTIFIED"');
  });

  // ── 4. SAG unavailability — NEVER fall back to Prisma saldo ──────────────

  test("360 loader does NOT fall back to Prisma saldo when SAG unavailable", () => {
    // The old code had: "totalBalance = receivableItems.reduce(...)"
    // The new code sets: "totalBalance = null"
    expect(loaderCode).not.toContain("fall back to Prisma (UNVERIFIED)");
    expect(loaderCode).toContain("do NOT show Prisma saldo");
  });

  test("360 loader sets totals to null when SAG unavailable", () => {
    expect(loaderCode).toContain("totalBalance = null");
    expect(loaderCode).toContain("totalOverdue = null");
    expect(loaderCode).toContain("openCount = null");
  });

  test("360 loader sets totals to null when no sagTerceroId", () => {
    // No SAG identity — cannot certify
    expect(loaderCode).toContain("No SAG identity — cannot certify cartera");
  });

  test("Cliente360Data.receivables type allows null totals", () => {
    expect(loaderCode).toContain("totalBalance: number | null");
    expect(loaderCode).toContain("totalOverdue: number | null");
    expect(loaderCode).toContain("openCount: number | null");
  });

  test("360 loader defaults to UNVERIFIED when no sagTerceroId", () => {
    expect(loaderCode).toContain('let receivableTruthStatus: ReceivableTruthStatus = "UNVERIFIED"');
  });

  test("Cliente360Data.receivables includes truthStatus field", () => {
    expect(loaderCode).toContain("truthStatus: receivableTruthStatus");
  });

  // ── 5. Manager adapter truth-aware presentation ─────────────────────────

  test("Manager adapter imports UNVERIFIED_RECEIVABLE_LABEL", () => {
    expect(adapterCode).toContain('import { UNVERIFIED_RECEIVABLE_LABEL }');
  });

  test("Manager shows UNVERIFIED_RECEIVABLE_LABEL when not certified (not Prisma saldo)", () => {
    // When CERTIFIED: show financial figures
    expect(adapterCode).toContain('r.truthStatus === "CERTIFIED" && r.totalBalance !== null');
    // When UNVERIFIED: show label, not numbers
    expect(adapterCode).toContain("UNVERIFIED_RECEIVABLE_LABEL");
  });

  test("Manager suppresses overdue attention when truthStatus != CERTIFIED", () => {
    // attentionStatus requires CERTIFIED truth + non-null totalOverdue
    expect(adapterCode).toContain('r.truthStatus === "CERTIFIED" && r.totalOverdue !== null');
  });

  test("ManagerTruthState includes UNVERIFIED variant", () => {
    expect(typesCode).toContain('"UNVERIFIED"');
  });

  // ── 6. Customer-commercial-context already wired ────────────────────────

  test("customer-commercial-context imports fetchCustomerArWithStatus", () => {
    expect(contextCode).toContain('import { fetchCustomerArWithStatus } from "./canonical-ar-service"');
  });

  test("customer-commercial-context tries canonical AR before legacy Prisma", () => {
    expect(contextCode).toContain("tryCanonicalAr(sagTerceroId)");
    expect(contextCode).toContain("// Path 1: Canonical AR from SAG (CERTIFIED)");
    expect(contextCode).toContain("// Path 2: Legacy Prisma (UNVERIFIED)");
  });

  // ── 7. Org-level alerts gate cartera behind certification ───────────────

  test("org-alerts checks isReceivableDataCertified before generating cartera alerts", () => {
    const alertsCode = readFile("lib/alerts/org-alerts.ts");
    expect(alertsCode).toContain("isReceivableDataCertified");
  });

  // ── 8. Vendedor display uses safe label ─────────────────────────────────

  test("Manager adapter shows 'Sin vendedor asignado' for absent vendedor", () => {
    expect(adapterCode).toContain('data.seller.sellerName ?? "Sin vendedor asignado"');
  });

  // ── 9. Order assistant does NOT treat unknown cartera as $0 ────────────

  test("order-assistant credit types allow null (not ?? 0 for unknown)", () => {
    const assistantCode = readFile("lib/comercial/pedidos/order-assistant-service.ts");
    // Must NOT use ?? 0 — null means "unknown", not "zero debt"
    expect(assistantCode).not.toContain("totalBalance ?? 0");
    expect(assistantCode).not.toContain("totalOverdue ?? 0");
    // Must pass null-preserving values
    expect(assistantCode).toContain("receivables.totalBalance");
    expect(assistantCode).toContain("receivables.totalOverdue");
    expect(assistantCode).toContain("truthStatus: receivables.truthStatus");
  });

  test("order-decision-types.ts CustomerCreditResult allows null receivable values", () => {
    const decisionTypes = readFile("lib/comercial/pedidos/order-decision-types.ts");
    expect(decisionTypes).toContain("totalReceivable: number | null");
    expect(decisionTypes).toContain("overdueReceivable: number | null");
  });
});
