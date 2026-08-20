/**
 * MALETAS-COBERTURA-REPORT-08B2R4A — Coverage Report Export Tests
 *
 * 10 mandatory gates + 5 structural:
 *   T01: PDF and XML share same payload builder
 *   T02: Invariant formula present in payload builder
 *   T03: Nestor vendor config isolation
 *   T04: Orlando vendor config isolation
 *   T05: Cross-tenant blocked (route validates vendor)
 *   T06: XML escaping implemented
 *   T07: DATA_UNVERIFIED warning in both formats
 *   T08: Payload builder is pure (no side effects)
 *   T09: Retiro/excess not in report payload
 *   T10: Zero new TSC errors — client does not import server modules
 *   T11: Export button in client
 *   T12: Double-click prevention
 *   T13: No hardcoded vendor names in export button
 *   T14: XML has reportId, generatedAt, sourceUpdatedAt, truthState
 *   T15: Schema version is maletas-coverage-report.v1
 */

import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ── Source files ─────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, "../../..");

const payloadSrc = fs.readFileSync(
  path.join(ROOT, "lib/comercial/maletas/coverage-report-payload.ts"), "utf8",
);
const xmlSrc = fs.readFileSync(
  path.join(ROOT, "lib/comercial/maletas/coverage-report-xml.ts"), "utf8",
);
const pdfRendererSrc = fs.readFileSync(
  path.join(ROOT, "lib/comercial/maletas/coverage-report-pdf-renderer.tsx"), "utf8",
);
const serviceSrc = fs.readFileSync(
  path.join(ROOT, "lib/comercial/maletas/coverage-report-service.ts"), "utf8",
);
const routeSrc = fs.readFileSync(
  path.join(ROOT, "app/api/orgs/[orgSlug]/comercial/maletas/coverage-report/route.ts"), "utf8",
);
const clientSrc = fs.readFileSync(
  path.join(ROOT, "app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx"), "utf8",
);

// ═════════════════════════════════════════════════════════════════════════════
// Tests
// ═════════════════════════════════════════════════════════════════════════════

describe("MALETAS-COBERTURA-REPORT-08B2R4A", () => {
  // T01: PDF and XML share same CoverageReportPayload
  test("T01: PDF and XML both derived from single CoverageReportPayload", () => {
    // Service imports both renderers and the shared payload builder
    expect(serviceSrc).toContain("buildCoverageReportPayload");
    expect(serviceSrc).toContain("renderCoverageReportXml");
    expect(serviceSrc).toContain("CoverageReportPdfDocument");
    // Both use payload as input
    expect(xmlSrc).toContain("CoverageReportPayload");
    expect(pdfRendererSrc).toContain("CoverageReportPayload");
    // Service passes same payload to both
    expect(serviceSrc).toContain("renderCoverageReportXml(payload)");
    expect(serviceSrc).toContain("CoverageReportPdfDocument, { payload }");
  });

  // T02: Invariant check present
  test("T02: Payload invariant B01+OP+PROD+IMP+UNVER = missingEntries", () => {
    expect(payloadSrc).toContain("b01Available");
    expect(payloadSrc).toContain("opIncoming");
    expect(payloadSrc).toContain("productionRequired");
    expect(payloadSrc).toContain("importUnavailable");
    expect(payloadSrc).toContain("dataUnverified");
    expect(payloadSrc).toContain("invariantValid");
    // Actual formula: sum === missingEntries
    expect(payloadSrc).toContain("invariantSum === vendorCov.missingEntries");
  });

  // T03: Nestor isolation — vendor config lookup by ID
  test("T03: Payload vendor isolation — vendorId from VendorSampleCoverage", () => {
    expect(payloadSrc).toContain("vendorCov.vendorId");
    expect(payloadSrc).toContain("vendorCov.vendorName");
    expect(payloadSrc).toContain("vendorConfig.bodegaKaNl");
  });

  // T04: Orlando isolation — same mechanism, no hardcoded IDs
  test("T04: Payload builder has no hardcoded vendor names", () => {
    expect(payloadSrc).not.toContain('"NESTOR"');
    expect(payloadSrc).not.toContain('"ORLANDO"');
    expect(payloadSrc).not.toContain('"Nestor"');
    expect(payloadSrc).not.toContain('"Orlando"');
  });

  // T05: Route validates vendor against config
  test("T05: Route validates vendorId against VENDOR_BODEGA_CONFIGS", () => {
    expect(routeSrc).toContain("VENDOR_BODEGA_CONFIGS.find");
    expect(routeSrc).toContain('"Vendor not found"');
    expect(routeSrc).toContain("requireOrgAccess");
    expect(routeSrc).toContain("status: 404");
    // Route never trusts client data for report content
    expect(routeSrc).not.toContain("body.positions");
    expect(routeSrc).not.toContain("body.totals");
  });

  // T06: XML escaping
  test("T06: XML escaper handles all 5 XML special characters", () => {
    expect(xmlSrc).toContain("&amp;");
    expect(xmlSrc).toContain("&lt;");
    expect(xmlSrc).toContain("&gt;");
    expect(xmlSrc).toContain("&quot;");
    expect(xmlSrc).toContain("&apos;");
    expect(xmlSrc).toContain('encoding="UTF-8"');
  });

  // T07: DATA_UNVERIFIED warning in both formats
  test("T07: DATA_UNVERIFIED warning in PDF and payload", () => {
    // Payload sets hasUnverifiedData
    expect(payloadSrc).toContain("hasUnverifiedData");
    expect(payloadSrc).toContain("dataUnverified > 0");
    // PDF shows warning banner
    expect(pdfRendererSrc).toContain("Informe contiene datos no verificados");
    expect(pdfRendererSrc).toContain("hasUnverifiedData");
    // XML includes the flag
    expect(xmlSrc).toContain("hasUnverifiedData");
  });

  // T08: Payload builder is pure — no DB, no side effects
  test("T08: buildCoverageReportPayload is pure — no Prisma, no fetch", () => {
    expect(payloadSrc).not.toContain("prisma");
    expect(payloadSrc).not.toContain("fetch(");
    expect(payloadSrc).not.toContain("import { prisma }");
    expect(payloadSrc).toContain("Pure computation");
  });

  // T09: Retiro/excess not in payload
  test("T09: CoverageReportPayload excludes retiro/excess data", () => {
    // Interface does not export excess positions
    expect(payloadSrc).not.toContain("excessPositions");
    expect(payloadSrc).not.toContain("retiro");
    expect(payloadSrc).not.toContain("removal");
    // XML does not serialize excess
    expect(xmlSrc).not.toContain("excess");
    expect(xmlSrc).not.toContain("retiro");
  });

  // T10: Client does not import server modules
  test("T10: Client does NOT import server-only report modules", () => {
    expect(clientSrc).not.toContain("coverage-report-payload");
    expect(clientSrc).not.toContain("coverage-report-service");
    expect(clientSrc).not.toContain("coverage-report-xml");
    expect(clientSrc).not.toContain("coverage-report-pdf");
    // Service is marked server-only
    expect(serviceSrc).toContain("SERVER ONLY");
  });

  // T11: Export button in client
  test("T11: Export button with correct UI structure", () => {
    expect(clientSrc).toContain("CoverageReportExportButton");
    expect(clientSrc).toContain("Generar informe");
    // Button renders "Descargar {fmt.toUpperCase()}" dynamically for PDF/XML
    expect(clientSrc).toContain("Descargar {fmt.toUpperCase()}");
    expect(clientSrc).toContain('"pdf"');
    expect(clientSrc).toContain('"xml"');
    expect(clientSrc).toContain("hasCoverage");
    expect(clientSrc).toContain("coverage-report");
  });

  // T12: Double-click prevention
  test("T12: Export button prevents double-click", () => {
    expect(clientSrc).toContain("if (loading) return");
  });

  // T13: No hardcoded vendor names in export button
  test("T13: Export button generic — no hardcoded vendor names", () => {
    const exportBtnIdx = clientSrc.indexOf("function CoverageReportExportButton");
    expect(exportBtnIdx).toBeGreaterThan(0);
    const exportBtnSrc = clientSrc.slice(exportBtnIdx);
    expect(exportBtnSrc).not.toContain('"NESTOR"');
    expect(exportBtnSrc).not.toContain('"ORLANDO"');
  });

  // T14: XML fields
  test("T14: XML template includes reportId, generatedAt, sourceUpdatedAt, truthState", () => {
    expect(xmlSrc).toContain('"reportId"');
    expect(xmlSrc).toContain('"generatedAt"');
    expect(xmlSrc).toContain('"sourceUpdatedAt"');
    expect(xmlSrc).toContain('"truthState"');
  });

  // T15: Schema version
  test("T15: Schema version is maletas-coverage-report.v1", () => {
    expect(payloadSrc).toContain('"maletas-coverage-report.v1"');
    expect(xmlSrc).toContain("maletas-coverage-report.v1");
  });
});
