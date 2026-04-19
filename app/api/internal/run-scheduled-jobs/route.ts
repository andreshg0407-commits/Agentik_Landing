/**
 * POST /api/internal/run-scheduled-jobs
 *
 * Cron endpoint — triggered by an external scheduler (e.g., Vercel Cron, cURL).
 * Protected by INTERNAL_CRON_SECRET env var.
 * Runs all ScheduledReports whose nextRunAt <= now.
 *
 * Example cron.json entry:
 *   { "path": "/api/internal/run-scheduled-jobs", "schedule": "0 * * * *" }
 */

import { NextResponse } from "next/server";
import { runDueReports } from "@/lib/scheduled-reports/service";

export const runtime = "nodejs";

const CRON_SECRET = process.env.INTERNAL_CRON_SECRET;

export async function POST(req: Request) {
  // Auth guard — require secret header or query param
  const authHeader = req.headers.get("x-cron-secret");
  const url        = new URL(req.url);
  const querySecret = url.searchParams.get("secret");

  if (CRON_SECRET && authHeader !== CRON_SECRET && querySecret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDueReports();
    console.info("[run-scheduled-jobs]", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[run-scheduled-jobs]", err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

// Also support GET for Vercel Cron which uses GET
export { POST as GET };
