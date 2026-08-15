/**
 * POST /api/orgs/[orgSlug]/comercial/importaciones/prewarm
 *
 * Prewarm the import intelligence cache for the organization.
 * Computes fresh intelligence FIRST, then atomically writes to L1 + L2.
 * On failure, the prior snapshot is preserved (stalePreserved=true).
 *
 * Auth modes (mutually exclusive):
 *   1. Vercel Cron / deploy hook: Authorization: Bearer $CRON_SECRET
 *   2. Authenticated user: requireCommercialAccess (admin roles only)
 *
 * A normal commercial user CANNOT force recomputation — requireCommercialAccess
 * verifies org membership but the route further requires CRON_SECRET or admin role.
 *
 * Sprint: IMPORT-CACHE-PROD-01
 */

import { requireCommercialAccess } from "@/lib/auth/org-access";
import { NextResponse } from "next/server";
import { prewarmImportCache } from "@/lib/comercial/importaciones/import-intelligence-cache";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;

  // Auth mode 1: Vercel Cron / deploy hook with CRON_SECRET
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  let orgId: string;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    // Cron-authenticated — resolve org from slug
    const org = await (prisma as any).organization.findFirst({
      where: { slug: orgSlug },
      select: { id: true },
    });
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    orgId = org.id;
  } else {
    // Auth mode 2: User session — require admin role
    const { organization, membership } = await requireCommercialAccess(orgSlug);
    // Only ADMIN / ORG_ADMIN / AGENTIK_ADMIN can force recomputation
    const adminRoles = ["ADMIN", "ORG_ADMIN", "AGENTIK_ADMIN", "SUPER_ADMIN"];
    if (!adminRoles.includes(membership.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions — admin role required for cache prewarm" },
        { status: 403 },
      );
    }
    orgId = organization.id;
  }

  const t0 = performance.now();
  const result = await prewarmImportCache(orgId);
  const elapsed = Math.round(performance.now() - t0);

  return NextResponse.json({
    ok: result.ok,
    stalePreserved: result.stalePreserved,
    error: result.error,
    orgSlug,
    elapsedMs: elapsed,
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /api/orgs/[orgSlug]/comercial/importaciones/prewarm
 *
 * Protected GET for Vercel Cron (vercel.json cron config requires GET).
 * Only accepts CRON_SECRET — no user session auth.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const org = await (prisma as any).organization.findFirst({
    where: { slug: orgSlug },
    select: { id: true },
  });
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const t0 = performance.now();
  const result = await prewarmImportCache(org.id);
  const elapsed = Math.round(performance.now() - t0);

  return NextResponse.json({
    ok: result.ok,
    stalePreserved: result.stalePreserved,
    error: result.error,
    orgSlug,
    elapsedMs: elapsed,
    timestamp: new Date().toISOString(),
  });
}
