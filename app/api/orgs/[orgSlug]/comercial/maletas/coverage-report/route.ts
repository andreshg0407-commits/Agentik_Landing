/**
 * POST /api/orgs/[orgSlug]/comercial/maletas/coverage-report
 *
 * Generates a PDF or XML coverage report for a specific vendor.
 * Returns the file as a binary stream.
 *
 * Body: { vendorId: string, format: "pdf" | "xml" }
 *
 * Security:
 *   - Tenant-scoped via requireOrgAccess
 *   - vendorId validated against VENDOR_BODEGA_CONFIGS
 *   - No client-supplied data used for report content
 *
 * MALETAS-COBERTURA-REPORT-08B2R4A
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { generateCoverageReport } from "@/lib/comercial/maletas/coverage-report-service";
import { VENDOR_BODEGA_CONFIGS } from "@/lib/comercial/maletas/vendor-sample-presence-engine";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  try {
    const { orgSlug } = await params;
    const { organization } = await requireOrgAccess(orgSlug);
    const orgId = organization.id;

    const body = await req.json();
    const vendorId = typeof body.vendorId === "string" ? body.vendorId : "";
    const format = body.format === "xml" ? "xml" : "pdf";

    if (!vendorId) {
      return NextResponse.json({ error: "vendorId is required" }, { status: 400 });
    }

    // Validate vendor belongs to the known config (not arbitrary)
    const vendorConfig = VENDOR_BODEGA_CONFIGS.find((c) => c.id === vendorId);
    if (!vendorConfig) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    const result = await generateCoverageReport(orgId, orgSlug, vendorId, format);

    if (!result) {
      return NextResponse.json({ error: "No coverage data for this vendor" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${result.fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status =
      msg === "UNAUTHENTICATED" ? 401 :
      msg === "ORG_NOT_FOUND" ? 404 :
      500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
