/**
 * POST /api/orgs/[orgSlug]/marketing-studio/publishing/plan
 *
 * MS-17 — Create a PublishingPlan.
 *
 * Body: {
 *   destinations: string[]   (required)
 *   productId?:   string
 *   catalogId?:   string
 *   campaignId?:  string
 *   assetId?:     string
 *   priority?:    string
 *   trigger?:     string
 *   scheduledAt?: string (ISO)
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { buildPublishingPlan }       from "@/lib/marketing-studio/publishing/publishing-plan";
import { createPublishingPlan }      from "@/lib/marketing-studio/publishing/publishing-repository";
import { handlePublishingEvent }     from "@/lib/marketing-studio/publishing/publishing-events";
import { PUBLISHING_EVENT }          from "@/lib/marketing-studio/publishing/publishing-types";
import type { PublishingDestination, PublishingPriority, PublishingTrigger } from "@/lib/marketing-studio/publishing/publishing-types";

export async function POST(
  req:    NextRequest,
  ctx:    { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(ctx.params.orgSlug);
    const body             = await req.json() as {
      destinations: string[];
      productId?:   string | null;
      catalogId?:   string | null;
      campaignId?:  string | null;
      assetId?:     string | null;
      priority?:    string;
      trigger?:     string;
      scheduledAt?: string | null;
    };

    if (!Array.isArray(body.destinations) || body.destinations.length === 0) {
      return NextResponse.json({ error: "destinations required" }, { status: 400 });
    }

    const plan = buildPublishingPlan({
      organizationId: organization.id,
      destinations:   body.destinations as PublishingDestination[],
      productId:      body.productId  ?? null,
      catalogId:      body.catalogId  ?? null,
      campaignId:     body.campaignId ?? null,
      assetId:        body.assetId    ?? null,
      priority:       (body.priority  ?? "medium") as PublishingPriority,
      trigger:        (body.trigger   ?? "manual")  as PublishingTrigger,
      scheduledAt:    body.scheduledAt ?? null,
    });

    const saved = await createPublishingPlan(plan);

    await handlePublishingEvent({
      organizationId: organization.id,
      eventType:      PUBLISHING_EVENT.PLAN_CREATED,
      planId:         saved.id,
      productId:      body.productId  ?? null,
      campaignId:     body.campaignId ?? null,
      catalogId:      body.catalogId  ?? null,
    }).catch(() => void 0);

    return NextResponse.json({ plan: saved }, { status: 201 });
  } catch (err) {
    console.error("[publishing/plan]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
