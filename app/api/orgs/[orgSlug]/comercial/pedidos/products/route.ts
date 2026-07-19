/**
 * POST /api/orgs/[orgSlug]/comercial/pedidos/products
 *
 * Actions: search, variants, availability
 *
 * Sprint: COMERCIAL-PEDIDOS-POS-02
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import {
  searchOrderProducts,
  getProductVariants,
  getVariantAvailability,
} from "@/lib/comercial/pedidos/order-product-search";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId = organization.id;

  const body = await req.json();
  const action = body.action as string;

  switch (action) {
    case "search": {
      const products = await searchOrderProducts(orgId, body.query ?? "", body.limit);
      return NextResponse.json({ products });
    }

    case "variants": {
      const variants = await getProductVariants(orgId, body.referenceCode);
      return NextResponse.json({ variants });
    }

    case "availability": {
      const availability = await getVariantAvailability(
        orgId, body.referenceCode, body.size, body.color,
      );
      return NextResponse.json({ availability });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
