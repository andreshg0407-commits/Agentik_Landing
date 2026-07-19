/**
 * GET /api/orgs/[orgSlug]/comercial/vendedores/[sellerSlug]
 *
 * VENDEDORES-360-01
 * Returns full Vendedor 360 data for drawer rendering.
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { loadVendedor360 } from "@/lib/comercial/vendors/vendedor-360-loader";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgSlug: string; sellerSlug: string }> },
) {
  const { orgSlug, sellerSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);

  const data = await loadVendedor360(organization.id, sellerSlug);

  if (!data) {
    return NextResponse.json(
      { error: "Vendedor no encontrado" },
      { status: 404 },
    );
  }

  return NextResponse.json(data);
}
