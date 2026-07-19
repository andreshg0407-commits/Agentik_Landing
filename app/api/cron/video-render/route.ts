/**
 * GET /api/cron/video-render
 *
 * MARKETING-VIDEO-RENDER-WORKER-01 — Video Render Cron
 *
 * Vercel Cron endpoint — processes one pending video render job per invocation.
 * Protected by INTERNAL_CRON_SECRET (header: x-internal-cron-secret or ?secret=).
 *
 * Schedule: every 2 minutes — registered in vercel.json.
 * maxDuration: 300s (5 min) to allow FFmpeg transcode + R2 upload.
 *
 * Design: single-job-per-run to keep responses predictable.
 * For higher throughput, invoke multiple cron schedules with staggered offsets.
 *
 * Response (safe — no secrets, no URLs beyond render status):
 *   { ok, result: { status, executionId, message } }
 */

import { NextRequest, NextResponse }  from "next/server";
import { runVideoRenderWorker }       from "@/lib/marketing-studio/video-editor/render/video-render-worker";

export const runtime     = "nodejs";
export const maxDuration = 300; // 5 min — enough for download + FFmpeg + R2 upload

// ── Auth ───────────────────────────────────────────────────────────────────────

const CRON_SECRET = process.env.INTERNAL_CRON_SECRET ?? "";
const VERCEL_CRON_SECRET = process.env.CRON_SECRET ?? "";

function isAuthorized(req: NextRequest): boolean {
  const header = req.headers.get("x-internal-cron-secret") ?? "";
  if (CRON_SECRET && header === CRON_SECRET) return true;

  const query = new URL(req.url).searchParams.get("secret") ?? "";
  if (CRON_SECRET && query === CRON_SECRET) return true;

  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (CRON_SECRET && token === CRON_SECRET) return true;
    if (VERCEL_CRON_SECRET && token === VERCEL_CRON_SECRET) return true;
  }

  return false;
}

// ── Handler ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const startMs = Date.now();

  try {
    const result = await runVideoRenderWorker();

    return NextResponse.json({
      ok: true,
      result: {
        status:      result.status,
        executionId: result.executionId,
        message:     result.message,
        durationMs:  Date.now() - startMs,
      },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[cron/video-render] Unhandled error:", message);
    return NextResponse.json(
      { ok: false, error: "Worker error", durationMs: Date.now() - startMs },
      { status: 500 },
    );
  }
}
