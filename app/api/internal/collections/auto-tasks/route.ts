/**
 * app/api/internal/collections/auto-tasks/route.ts
 *
 * Internal cron endpoint — auto-generates collection ActionTasks for
 * high-risk debtors (+90 DPD and top 3 debtors per org).
 *
 * Authentication: INTERNAL_CRON_SECRET header (shared secret).
 * Method: POST
 *
 * Body (optional):
 *   { organizationId?: string }   — limit to a single org
 *
 * Response:
 *   { ok: true, results: Record<orgId, AutoTaskResult> }
 *
 * Invocation cadence: daily (e.g. 08:00 COT via Vercel Cron).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma }                    from "@/lib/prisma";
import { generateCollectionsTasks }  from "@/lib/collections/auto-task";

const CRON_SECRET = process.env.INTERNAL_CRON_SECRET ?? "";

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const secret = req.headers.get("x-internal-cron-secret") ?? "";
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Org scope ──────────────────────────────────────────────────────────────
  let orgIds: string[];
  try {
    const body = await req.json().catch(() => ({})) as { organizationId?: string };
    if (body.organizationId) {
      orgIds = [body.organizationId];
    } else {
      // All active orgs
      const orgs = await prisma.organization.findMany({
        where:  { deletedAt: null },
        select: { id: true },
      });
      orgIds = orgs.map(o => o.id);
    }
  } catch (err) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // ── Run per org ────────────────────────────────────────────────────────────
  const results: Record<string, { created: number; skipped: number; errors: number }> = {};

  for (const orgId of orgIds) {
    try {
      results[orgId] = await generateCollectionsTasks(orgId);
    } catch (err) {
      results[orgId] = { created: 0, skipped: 0, errors: 1 };
      console.error(`[collections/auto-tasks] org ${orgId} error:`, err);
    }
  }

  const totalCreated = Object.values(results).reduce((s, r) => s + r.created, 0);
  const totalSkipped = Object.values(results).reduce((s, r) => s + r.skipped, 0);
  const totalErrors  = Object.values(results).reduce((s, r) => s + r.errors,  0);

  console.info(
    `[collections/auto-tasks] orgs=${orgIds.length} created=${totalCreated} skipped=${totalSkipped} errors=${totalErrors}`,
  );

  return NextResponse.json({
    ok: true,
    summary: { orgs: orgIds.length, created: totalCreated, skipped: totalSkipped, errors: totalErrors },
    results,
  });
}
