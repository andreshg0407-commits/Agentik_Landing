/**
 * POST /api/orgs/[orgSlug]/comercial/clientes/sync
 *
 * Trigger SAG customer master data sync from vw_agentik_clientes.
 * Requires ORG_ADMIN or SUPER_ADMIN role.
 *
 * Sprint: AGENTIK-CUSTOMERS-SAG-MASTER-DATA-INTEGRATION-01
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { syncSagCustomerMaster } from "@/lib/comercial/clientes/sag-customer-master-sync";
import { NextResponse } from "next/server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;
  const { organization, membership } = await requireOrgAccess(orgSlug);

  // Restrict sync to ORG_ADMIN or SUPER_ADMIN
  if (membership.role !== "ORG_ADMIN" && membership.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Insufficient permissions — requires ORG_ADMIN or SUPER_ADMIN" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const dryRun = body.dryRun === true;
  const limit = typeof body.limit === "number" ? body.limit : undefined;

  const token =
    process.env.PYA_SOAP_TOKEN?.trim() ||
    process.env.SAG_TEST_TOKEN?.trim() ||
    "";

  if (!token) {
    return NextResponse.json(
      { error: "SAG token not configured" },
      { status: 500 },
    );
  }

  const report = await syncSagCustomerMaster(organization.id, {
    token,
    dryRun,
    limit,
  });

  return NextResponse.json(report);
}
