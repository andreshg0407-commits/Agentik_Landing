/**
 * app/api/orgs/[orgSlug]/marketing-studio/execution/dispatch/route.ts
 *
 * MS-13 — Execution Runtime: Job dispatch endpoint
 *
 * POST /api/orgs/[orgSlug]/marketing-studio/execution/dispatch
 *
 * Creates a persistent ExecutionJob with idempotency.
 * Does NOT execute the job immediately (use /run for that).
 *
 * Body:
 *   jobType        string   — e.g. "shopify.publish_draft"
 *   destination    string   — e.g. "shopify"
 *   productId?     string
 *   catalogId?     string
 *   payload?       object
 *   priority?      number   (1-10, lower = higher priority)
 *   idempotencyKey? string
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   requireOrgAccess() enforces session + membership check.
 *   organizationId always comes from server context, never from body.
 *   No tokens or secrets in response.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { dispatchExecutionJob }      from "@/lib/marketing-studio/execution/execution-dispatcher";
import { canAccessMarketingStudio }  from "@/lib/auth/module-access";

type Body = {
  jobType?:        string;
  destination?:    string;
  productId?:      string;
  catalogId?:      string;
  payload?:        Record<string, unknown>;
  priority?:       number;
  idempotencyKey?: string;
  maxRetries?:     number;
};

export async function POST(
  req:     NextRequest,
  context: { params: { orgSlug: string } },
) {
  try {
    const { orgSlug }              = context.params;
    const { membership, organization } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body: Body = await req.json();

    if (!body.jobType)     return NextResponse.json({ error: "jobType is required" },     { status: 400 });
    if (!body.destination) return NextResponse.json({ error: "destination is required" }, { status: 400 });

    const result = await dispatchExecutionJob({
      organizationId:  organization.id,
      jobType:         body.jobType,
      destination:     body.destination,
      productId:       body.productId  ?? null,
      catalogId:       body.catalogId  ?? null,
      payload:         body.payload    ?? {},
      priority:        body.priority   ?? 5,
      idempotencyKey:  body.idempotencyKey,
      maxRetries:      body.maxRetries ?? 3,
    });

    return NextResponse.json({
      jobId:      result.job.id,
      status:     result.job.status,
      wasDeduped: result.wasDeduped,
      jobType:    result.job.jobType,
      destination: result.job.destination,
      productId:  result.job.productId,
      scheduledAt: result.job.scheduledAt,
      createdAt:  result.job.createdAt,
    });

  } catch (err) {
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
