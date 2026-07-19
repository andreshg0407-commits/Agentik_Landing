/**
 * app/api/orgs/[orgSlug]/copilot/executions/[executionId]/route.ts
 *
 * AGENTIK-EXECUTION-PERSISTENCE-01 — Execution detail API.
 * SERVER ONLY.
 *
 * GET /api/orgs/:orgSlug/copilot/executions/:executionId
 *
 * Returns the full execution snapshot: record + steps + events + approvals.
 * Enables audit replay and Copilot history views.
 */
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { getExecutionDetail }         from "@/lib/copilot/execution-store/execution-store-queries";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string; executionId: string }> },
) {
  const { orgSlug, executionId } = await params;

  try { await requireOrgAccess(orgSlug); }
  catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  if (!executionId) {
    return NextResponse.json({ error: "executionId is required" }, { status: 400 });
  }

  try {
    const snapshot = await getExecutionDetail(orgSlug, executionId);

    if (!snapshot) {
      return NextResponse.json(
        { error: `Execution "${executionId}" not found for tenant "${orgSlug}"` },
        { status: 404 },
      );
    }

    return NextResponse.json(snapshot);
  } catch (err) {
    console.error(`[copilot/executions/${executionId}] GET error:`, err);
    return NextResponse.json({ error: "Failed to load execution detail" }, { status: 500 });
  }
}
