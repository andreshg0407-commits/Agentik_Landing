/**
 * GET /api/orgs/[orgSlug]/commercial-operational-intelligence
 *
 * COMERCIAL-OPERATIONAL-INTEGRATION-01
 * Returns the commercial operational integration pipeline results.
 *
 * This endpoint validates the full pipeline:
 *   Inventory → Signals → Events → Knowledge Graph → Reasoning
 *
 * Uses real Castillitos data. No placeholders.
 */

import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { runCommercialOperationalPipeline } from "@/lib/comercial/operational-integration/commercial-operational-pipeline";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);

  const result = await runCommercialOperationalPipeline(
    organization.id,
    orgSlug,
    { criticalThreshold: 10, maxReferences: 20 },
  );

  return NextResponse.json(result);
}
