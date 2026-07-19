/**
 * app/api/orgs/[orgSlug]/marketing-studio/operators/dispatch/route.ts
 *
 * MS-19 — Operator Dispatch: POST /api/orgs/[orgSlug]/marketing-studio/operators/dispatch
 *
 * Body: { channel, action, planId?, stageId?, entityId?, productId?, catalogId?, payload? }
 *
 * Platform-admin only.
 */

import { NextRequest, NextResponse }      from "next/server";
import { requireOrgAccess }               from "@/lib/auth/org-access";
import { isInternalRole }                 from "@/lib/auth/module-access";
import { dispatchOperatorRequest }        from "@/lib/marketing-studio/operators/operator-dispatcher";
import { isChannelSupported }             from "@/lib/marketing-studio/operators/operator-registry";
import type { OperatorChannel, OperatorAction } from "@/lib/marketing-studio/operators/operator-types";

type Body = {
  channel:    string;
  action:     string;
  planId?:    string;
  stageId?:   string;
  entityId?:  string;
  productId?: string;
  catalogId?: string;
  retryCount?: number;
  payload?:   Record<string, unknown>;
};

export async function POST(
  req:     NextRequest,
  context: { params: { orgSlug: string } },
) {
  try {
    const { orgSlug }                        = context.params;
    const { user, membership, organization } = await requireOrgAccess(orgSlug);

    if (!isInternalRole(membership.role)) {
      return NextResponse.json({ error: "Forbidden — platform-admin only" }, { status: 403 });
    }

    const body: Body = await req.json();

    if (!body.channel || !body.action) {
      return NextResponse.json({ error: "channel and action are required" }, { status: 400 });
    }

    if (!isChannelSupported(body.channel)) {
      return NextResponse.json({ error: `Unsupported channel: ${body.channel}` }, { status: 400 });
    }

    const result = await dispatchOperatorRequest({
      organizationId: organization.id,
      channel:        body.channel as OperatorChannel,
      action:         body.action  as OperatorAction,
      actorId:        user.id      ?? null,
      planId:         body.planId  ?? null,
      stageId:        body.stageId ?? null,
      entityId:       body.entityId  ?? null,
      productId:      body.productId ?? null,
      catalogId:      body.catalogId ?? null,
      retryCount:     body.retryCount ?? 0,
      payload:        body.payload ?? {},
    });

    return NextResponse.json(result, { status: result.success ? 200 : 422 });

  } catch (err) {
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
