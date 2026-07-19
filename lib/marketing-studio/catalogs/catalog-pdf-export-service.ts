/**
 * lib/marketing-studio/catalogs/catalog-pdf-export-service.ts
 *
 * MARKETING-STUDIO-CATALOG-EXPORTS-01 — PDF Export Service
 *
 * Orchestrates the full pipeline:
 *   1. Load CatalogDefinition from DB (org-scoped)
 *   2. Resolve products via resolveCatalog()
 *   3. Load org display name
 *   4. Render PDF via CatalogPdfDocument → renderToBuffer()
 *   5. Return Buffer (no persistence — generated on demand)
 *
 * SERVER ONLY — never import from client components.
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   - organizationId validated on every call
 *   - Never returns internal IDs or admin metadata in the PDF
 *   - pricingMode is always respected — without_prices → no price rendered
 */

import React                          from "react";
import { renderToBuffer }             from "@react-pdf/renderer";
import { prisma }                     from "@/lib/prisma";
import { getCatalogDefinition }       from "./catalog-definition-repository";
import { resolveCatalog }             from "./catalog-query-service";
import { CatalogPdfDocument }         from "./catalog-pdf-renderer";
import type { CatalogPdfRenderProps } from "./catalog-pdf-renderer";

// ── Result type ───────────────────────────────────────────────────────────────

export interface CatalogPdfExportResult {
  buffer:       Buffer;
  fileName:     string;
  catalogName:  string;
  productCount: number;
  generatedAt:  Date;
}

// ── Main export function ──────────────────────────────────────────────────────

/**
 * exportCatalogPdf
 *
 * Generates a PDF for a catalog definition.
 * Returns a Buffer — the caller is responsible for streaming it to the client.
 * No snapshot is stored. No PDF is persisted.
 */
export async function exportCatalogPdf(
  organizationId: string,
  catalogId:      string,
): Promise<CatalogPdfExportResult> {
  // ── 1. Load catalog definition (org-scoped) ────────────────────────────────
  const catalog = await getCatalogDefinition(organizationId, catalogId);
  if (!catalog) {
    throw new Error(`CatalogDefinition not found: ${catalogId}`);
  }

  // ── 2. Load org display name ───────────────────────────────────────────────
  const org = await prisma.organization.findUnique({
    where:  { id: organizationId },
    select: { name: true },
  });
  const orgDisplayName = org?.name ?? "";

  // ── 3. Resolve products ────────────────────────────────────────────────────
  // Limit to 500 products — covers all practical catalog sizes while
  // keeping PDF generation memory-safe.
  const resolved = await resolveCatalog(catalog, { limit: 500 });

  // ── 4. Build render props ──────────────────────────────────────────────────
  const generatedAt = new Date();

  const renderProps: CatalogPdfRenderProps = {
    catalogName:        catalog.name,
    catalogDescription: catalog.description,
    orgDisplayName,
    layout:             catalog.layout,
    pricingMode:        catalog.pricingMode,
    ctaMode:            catalog.ctaMode,
    whatsAppPhone:      catalog.whatsAppPhone,
    templateKey:        catalog.templateKey,
    layoutResult:       resolved.layoutResult,
    generatedAt,
  };

  // ── 5. Render to buffer ────────────────────────────────────────────────────
  const element = React.createElement(CatalogPdfDocument, renderProps);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer  = await renderToBuffer(element as any);

  // ── 6. Build safe filename ─────────────────────────────────────────────────
  const safeName = catalog.name
    .toLowerCase()
    .replace(/[^a-z0-9\-_]/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, 60);

  const dateStr = generatedAt.toISOString().slice(0, 10);  // YYYY-MM-DD
  const fileName = `${safeName}-${dateStr}.pdf`;

  return {
    buffer:       Buffer.from(buffer),
    fileName,
    catalogName:  catalog.name,
    productCount: resolved.totalCount,
    generatedAt,
  };
}
