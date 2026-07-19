/**
 * POST /api/orgs/[orgSlug]/comercial/pedidos/sync-lines
 *
 * Triggers quote line synchronization from CRM → CRMQuoteLine.
 *
 * Body (optional):
 *   { forceResync?: boolean, maxQuotes?: number }
 *
 * Sprint: SAG-ORDER-LINES-SYNC-01
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  syncQuoteLines,
  getCrmConnectorConfig,
} from "@/lib/comercial/pedidos/quote-lines-sync";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;

  // Resolve org
  const org = await prisma.organization.findFirst({
    where: { slug: orgSlug },
    select: { id: true },
  });
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  // Get CRM connector config
  const config = await getCrmConnectorConfig(org.id);
  if (!config) {
    return NextResponse.json(
      { error: "No CRM connector configured for this organization" },
      { status: 404 },
    );
  }

  // Parse options
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine
  }

  const forceResync = body.forceResync === true;
  const maxQuotes   = typeof body.maxQuotes === "number" ? body.maxQuotes : undefined;

  // Run sync
  const { metrics, results } = await syncQuoteLines(org.id, config, {
    forceResync,
    maxQuotes,
  });

  return NextResponse.json({ metrics, results });
}
