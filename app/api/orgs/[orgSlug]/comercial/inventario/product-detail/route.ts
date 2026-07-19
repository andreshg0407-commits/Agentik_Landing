/**
 * /api/orgs/[orgSlug]/comercial/inventario/product-detail
 *
 * GET — Fetch enriched product detail for CommercialProductDrawer.
 *
 * Query params:
 *   reference (required) — SAG product reference code
 *
 * Returns:
 *   - categoria (ProductEntity.category — Prisma)
 *   - precioDetal (SAG v_articulos.nd_precio3)
 *   - precioMayorista (SAG v_articulos.nd_precio4)
 *
 * Sprint: COMMERCIAL-PRODUCT-DRAWER-DATA-01
 */

import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { loadProductDetail } from "@/lib/inventory/product-detail-loader";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const { searchParams } = new URL(req.url);
    const reference = searchParams.get("reference");

    if (!reference) {
      return NextResponse.json(
        { ok: false, error: "Missing reference parameter" },
        { status: 400 },
      );
    }

    const detail = await loadProductDetail(organization.id, reference);
    return NextResponse.json({ ok: true, detail });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ORG_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
