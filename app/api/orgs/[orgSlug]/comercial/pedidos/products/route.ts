/**
 * POST /api/orgs/[orgSlug]/comercial/pedidos/products
 *
 * Actions: search, variants, availability, auto_assortment
 *
 * Sprint: COMERCIAL-PEDIDOS-POS-02
 * Sprint: AGENTIK-SELLER-APP-ORDER-AUTO-ASSORTMENT-P0-CLOSE
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import {
  searchOrderProducts,
  getProductVariants,
  getVariantAvailability,
  computeAutoAssortmentProposal,
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

    case "auto_assortment": {
      const qty = Number(body.requestedUnits);
      if (!body.referenceCode || !qty || qty <= 0) {
        return NextResponse.json({ error: "referenceCode and requestedUnits required" }, { status: 400 });
      }
      const proposal = await computeAutoAssortmentProposal(orgId, body.referenceCode, qty);
      return NextResponse.json({ proposal });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
