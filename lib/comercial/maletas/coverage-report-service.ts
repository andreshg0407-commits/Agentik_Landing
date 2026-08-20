/**
 * lib/comercial/maletas/coverage-report-service.ts
 *
 * Server-side orchestrator for coverage report generation (PDF + XML).
 *
 * 1. Load data from the same loader that feeds the UI
 * 2. Build CoverageReportPayload (single source of truth)
 * 3. Render to PDF buffer or XML string
 *
 * SERVER ONLY — never import from client components.
 *
 * MALETAS-COBERTURA-REPORT-08B2R4A
 */

import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { loadVendorSampleData } from "./vendor-sample-loader";
import { buildCoverageReportPayload, type CoverageReportPayload } from "./coverage-report-payload";
import { renderCoverageReportXml } from "./coverage-report-xml";
import { CoverageReportPdfDocument } from "./coverage-report-pdf-renderer";
import { VENDOR_BODEGA_CONFIGS } from "./vendor-sample-presence-engine";
import { prisma } from "@/lib/prisma";

// ── Result types ─────────────────────────────────────────────────────────────

export interface CoverageReportResult {
  payload: CoverageReportPayload;
  buffer: Buffer;
  fileName: string;
  contentType: string;
}

// ── Date helper ──────────────────────────────────────────────────────────────

function bogotaDateSlug(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bogota" });
}

// ── Main export function ─────────────────────────────────────────────────────

export async function generateCoverageReport(
  organizationId: string,
  orgSlug: string,
  vendorId: string,
  format: "pdf" | "xml",
): Promise<CoverageReportResult | null> {
  // 1. Load full vendor data (same as the page)
  const data = await loadVendorSampleData(organizationId);

  // 2. Find the vendor coverage
  const vendorCov = data.sampleCoverage.vendorCoverages.find(
    (v) => v.vendorId === vendorId,
  );
  if (!vendorCov) return null;

  // 3. Find vendor config
  const vendorConfig = VENDOR_BODEGA_CONFIGS.find((c) => c.id === vendorId);
  if (!vendorConfig) return null;

  // 4. Resolve org name
  let orgName = orgSlug;
  try {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    if (org?.name) orgName = org.name;
  } catch {
    // Fallback to slug
  }

  // 5. Build payload
  const payload = buildCoverageReportPayload(
    vendorCov,
    vendorConfig,
    { id: organizationId, name: orgName, slug: orgSlug },
    data.loadedAt,
  );

  // 6. Render
  const vendorSlug = vendorCov.vendorName.toLowerCase().replace(/\s+/g, "-");
  const dateSlug = bogotaDateSlug();

  if (format === "xml") {
    const xml = renderCoverageReportXml(payload);
    return {
      payload,
      buffer: Buffer.from(xml, "utf-8"),
      fileName: `cobertura-mostrario-${vendorSlug}-${dateSlug}.xml`,
      contentType: "application/xml; charset=utf-8",
    };
  }

  // PDF
  const element = React.createElement(CoverageReportPdfDocument, { payload });
  const buffer = await renderToBuffer(element as any);

  return {
    payload,
    buffer: Buffer.from(buffer),
    fileName: `cobertura-mostrario-${vendorSlug}-${dateSlug}.pdf`,
    contentType: "application/pdf",
  };
}
