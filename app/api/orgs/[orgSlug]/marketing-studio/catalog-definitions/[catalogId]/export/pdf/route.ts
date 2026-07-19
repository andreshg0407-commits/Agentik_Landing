/**
 * app/api/orgs/[orgSlug]/marketing-studio/catalog-definitions/[catalogId]/export/pdf/route.ts
 *
 * MARKETING-STUDIO-CATALOG-EXPORTS-01
 *
 * POST /api/orgs/{orgSlug}/marketing-studio/catalog-definitions/{catalogId}/export/pdf
 *   → streams the generated PDF as application/pdf
 *
 * ── PIPELINE ─────────────────────────────────────────────────────────────────
 *   requireOrgAccess → getCatalogDefinition → resolveCatalog →
 *   CatalogPdfDocument → renderToBuffer → Response(buffer, application/pdf)
 *
 * ── PERFORMANCE ──────────────────────────────────────────────────────────────
 *   Generation is synchronous (PDF rendered in memory, then streamed).
 *   For large catalogs (hundreds of products with images), this may take
 *   several seconds. The client shows a loading indicator.
 *   Limit: 500 products (see export service).
 *
 * No PDF is stored. No snapshot is created. Generated on demand.
 */

import { NextRequest, NextResponse }   from "next/server";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import { exportCatalogPdf }           from "@/lib/marketing-studio/catalogs/catalog-pdf-export-service";

export const dynamic = "force-dynamic";

// PDF generation can be slow for large catalogs — extend timeout
export const maxDuration = 60;

interface RouteParams {
  params: Promise<{ orgSlug: string; catalogId: string }>;
}

export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgSlug, catalogId } = await params;
    const { organization } = await requireOrgAccess(orgSlug);

    const result = await exportCatalogPdf(organization.id, catalogId);

    // Use Uint8Array to satisfy BodyInit typing for binary PDF data
    return new NextResponse(new Uint8Array(result.buffer), {
      status:  200,
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="${result.fileName}"`,
        "Content-Length":      String(result.buffer.length),
        // No caching — catalog content changes as products are updated
        "Cache-Control":       "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[catalog export PDF]", err);

    if (message.includes("not found")) {
      return NextResponse.json({ error: "Catalog not found" }, { status: 404 });
    }

    return NextResponse.json({ error: "PDF generation failed" }, { status: 500 });
  }
}
