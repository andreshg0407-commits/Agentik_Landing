/**
 * POST /api/internal/dian/sync
 *
 * AGENTIK-DIAN-SYNC-01
 * DIAN Integration Layer — Internal Fiscal Sync Endpoint
 *
 * Triggers a DIAN fiscal sync operation for one organization.
 * Designed for Vercel Cron or internal service invocation.
 *
 * Authentication: INTERNAL_CRON_SECRET env var
 *   header:  x-internal-cron-secret
 *   OR query: ?secret=<value>
 *
 * Method: POST
 * Content-Type: application/json
 *
 * Body:
 *   {
 *     organizationId: string;           // required
 *     environment:    "habilitacion" | "produccion";  // required
 *     operation:      DianSyncOperation;  // required, e.g. "GetAcquirer"
 *     payload:        unknown;            // operation-specific input
 *     traceId?:       string;
 *   }
 *
 * Response (all cases — never throws):
 *   {
 *     success:    boolean;
 *     syncJobId?: string;
 *     status:     DianSyncStatus;
 *     durationMs?: number;
 *     error?:     string;  // summary only — no signed XML, no secrets
 *   }
 *
 * Security:
 *   - Never returns signed XML, private keys, WS-Security tokens
 *   - Per-org failure isolation: one org failure does not abort others
 *   - Cron secret validated before any processing
 *   - organizationId validated as non-empty string
 *
 * IMPORTANT: Backend-only. Never expose this route publicly.
 */

import { NextRequest, NextResponse } from "next/server";
import { runDianSync }               from "@/lib/integrations/dian/sync/dian-sync-orchestrator";
import type { DianSyncRequest }      from "@/lib/integrations/dian/sync/dian-sync-types";
import { DIAN_LIVE_OPERATIONS }      from "@/lib/integrations/dian/sync/dian-sync-types";
import type { DianEnvironment }      from "@/lib/integrations/dian/types/dian-types";

export const runtime     = "nodejs";
export const maxDuration = 60;  // 60s Vercel function timeout

const CRON_SECRET = process.env.INTERNAL_CRON_SECRET ?? "";

// ── Auth guard ────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  if (!CRON_SECRET) return false;
  const headerSecret = req.headers.get("x-internal-cron-secret") ?? "";
  const url          = new URL(req.url);
  const querySecret  = url.searchParams.get("secret") ?? "";
  return headerSecret === CRON_SECRET || querySecret === CRON_SECRET;
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  // ── Validate required fields ───────────────────────────────────────────────
  const organizationId = body["organizationId"];
  const environment    = body["environment"];
  const operation      = body["operation"];
  const payload        = body["payload"];
  const traceId        = typeof body["traceId"] === "string" ? body["traceId"] : undefined;

  if (!organizationId || typeof organizationId !== "string") {
    return NextResponse.json(
      { error: "organizationId is required and must be a string" },
      { status: 400 },
    );
  }

  if (environment !== "habilitacion" && environment !== "produccion") {
    return NextResponse.json(
      { error: "environment must be 'habilitacion' or 'produccion'" },
      { status: 400 },
    );
  }

  if (!operation || !DIAN_LIVE_OPERATIONS.includes(operation as never)) {
    return NextResponse.json(
      { error: `operation must be one of: ${DIAN_LIVE_OPERATIONS.join(", ")}` },
      { status: 400 },
    );
  }

  // ── Dispatch to orchestrator ───────────────────────────────────────────────
  const syncRequest: DianSyncRequest = {
    organizationId,
    environment: environment as DianEnvironment,
    operation:   operation as DianSyncRequest["operation"],
    payload,
    traceId,
    triggeredBy: "api",
  };

  const outcome = await runDianSync(syncRequest);

  // Map internal status to HTTP status code
  // skipped → 200 (not an error, just a concurrent lock)
  // failed  → 200 (caller should read .success to determine outcome)
  // Both 200 — failures are application-level, not transport-level
  return NextResponse.json(outcome, { status: 200 });
}

// Support Vercel Cron compatibility (GET = POST)
export { POST as GET };
