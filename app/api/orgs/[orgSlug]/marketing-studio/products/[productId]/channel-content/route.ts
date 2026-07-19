/**
 * app/api/orgs/[orgSlug]/marketing-studio/products/[productId]/channel-content/route.ts
 *
 * MARKETING-STUDIO-PRODUCT-CHANNEL-CONTENT-01
 *
 * GET  /api/orgs/{orgSlug}/marketing-studio/products/{productId}/channel-content
 *   Query: ?channel=shopify (optional — returns all channels if omitted)
 *   → { resolved: ResolvedChannelContent; readiness: ChannelReadinessResult }
 *     or
 *   → { channels: ResolvedChannelContent[]; readiness: ProductChannelReadiness }
 *
 * PUT  /api/orgs/{orgSlug}/marketing-studio/products/{productId}/channel-content
 *   body: { channel: ChannelType; content: ChannelPayload; status?: ChannelContentStatus }
 *   → { resolved: ResolvedChannelContent; readiness: ChannelReadinessResult }
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   requireOrgAccess validates the session before any read/write.
 *   Org boundary is double-checked in saveChannelContent.
 */

import { NextRequest, NextResponse }    from "next/server";
import { requireOrgAccess }             from "@/lib/auth/org-access";
import {
  getChannelContentWithReadiness,
  resolveAllChannels,
  computeChannelReadiness,
  saveChannelContent,
} from "@/lib/marketing-studio/products/product-channel-content-service";
import type {
  ChannelType,
  ChannelPayload,
  ChannelContentStatus,
} from "@/lib/marketing-studio/products/product-channel-content-types";
import { ALL_CHANNELS } from "@/lib/marketing-studio/products/product-channel-content-types";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ orgSlug: string; productId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgSlug, productId } = await params;
    const { organization }       = await requireOrgAccess(orgSlug);

    const channelParam = req.nextUrl.searchParams.get("channel");

    if (channelParam) {
      if (!ALL_CHANNELS.includes(channelParam as ChannelType)) {
        return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
      }
      const result = await getChannelContentWithReadiness(
        organization.id,
        productId,
        channelParam as ChannelType,
      );
      return NextResponse.json(result);
    }

    // No channel specified → return all channels
    const [channels, readiness] = await Promise.all([
      resolveAllChannels(organization.id, productId),
      computeChannelReadiness(organization.id, productId),
    ]);
    return NextResponse.json({ channels, readiness });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[channel content GET]", err);
    if (msg === "unauthorized" || msg === "not_found") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to load channel content" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgSlug, productId } = await params;
    const { organization }       = await requireOrgAccess(orgSlug);

    const body = await req.json() as {
      channel: ChannelType;
      content: ChannelPayload;
      status?: ChannelContentStatus;
    };

    if (!body.channel || !ALL_CHANNELS.includes(body.channel)) {
      return NextResponse.json({ error: "Invalid or missing channel" }, { status: 400 });
    }

    const result = await saveChannelContent(organization.id, {
      productId,
      organizationId: organization.id,
      channel:  body.channel,
      content:  body.content,
      status:   body.status,
    });

    const readiness = (await computeChannelReadiness(organization.id, productId))
      .channels.find(c => c.channel === body.channel);

    return NextResponse.json({ resolved: result, readiness });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[channel content PUT]", err);
    if (msg === "org_boundary_violation") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 400 });
    }
    if (msg === "unauthorized" || msg === "not_found") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to save channel content" }, { status: 500 });
  }
}
