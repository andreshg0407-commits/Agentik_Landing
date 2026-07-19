/**
 * GET /api/orgs/[orgSlug]/executive-intelligence
 *
 * INFORMES-EJECUTIVOS-CASTILLITOS-03
 * Returns the assembled Executive Intelligence Report.
 *
 * This is the single API endpoint for the Executive Dashboard.
 * The dashboard calls this instead of querying modules directly.
 */

import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { assembleExecutiveIntelligence } from "@/lib/executive-intelligence/executive-pipeline";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);

  const report = await assembleExecutiveIntelligence(organization.id, orgSlug);

  return NextResponse.json(report);
}
