/**
 * GET /api/orgs/[orgSlug]/comercial/customer-context?customerId=xxx
 *
 * AGENTIK-SELLER-APP-UI-01 — On-demand customer commercial context for Seller App.
 * Reuses getCustomerCommercialContext() from frontline domain.
 *
 * Authorization: requireOrgAccess + seller scope enforcement.
 * Seller-scoped users can only access customers assigned to their sellerSlug.
 * Managers/admins can access all customers in the org.
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { resolveCurrentSeller, deriveSellerScope } from "@/lib/comercial/frontline/seller-user-mapping";
import { getCustomerCommercialContext } from "@/lib/comercial/frontline/customer-commercial-context";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const db = prisma as any;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;
  const { user, organization } = await requireOrgAccess(orgSlug, { allowProvisionedSeller: true });

  const url = new URL(req.url);
  const customerId = url.searchParams.get("customerId");

  if (!customerId) {
    return NextResponse.json({ error: "customerId required" }, { status: 400 });
  }

  // Seller scope enforcement: verify caller can access this customer
  const sellerIdentity = await resolveCurrentSeller({
    organizationId: organization.id,
    userId: user.id,
  });
  const scope = deriveSellerScope(sellerIdentity);

  if (!scope.canAccessAllCustomers && scope.sellerSlug) {
    const customer = await db.customerProfile.findFirst({
      where: {
        id: customerId,
        organizationId: organization.id,
        sellerSlug: scope.sellerSlug,
      },
      select: { id: true },
    });

    if (!customer) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const data = await getCustomerCommercialContext(organization.id, customerId);
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
