/**
 * app/api/orgs/[orgSlug]/marketing-studio/biblioteca/assets/route.ts
 *
 * SHOPIFY-BANNERS-PRODUCTION-02 — Approved Assets API
 *
 * GET — Query approved assets from Biblioteca for selectors.
 *
 * Query params:
 *   search       — text search
 *   assetTypes   — comma-separated (banner,hero,lifestyle_photo,short_video)
 *   referenceId  — filter by reference
 *   collectionId — filter by collection
 *   campaignId   — filter by campaign
 *   limit        — max results (default 50)
 *   offset       — pagination offset
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { queryApprovedAssets }       from "@/lib/marketing-studio/commerce/shopify-banner-asset-query";

type RouteContext = { params: Promise<{ orgSlug: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    const { orgSlug }      = await ctx.params;
    const { organization } = await requireOrgAccess(orgSlug);
    const orgId            = organization.id;

    const url    = new URL(req.url);
    const search       = url.searchParams.get("search") ?? undefined;
    const assetTypes   = url.searchParams.get("assetTypes")?.split(",").filter(Boolean) ?? undefined;
    const referenceId  = url.searchParams.get("referenceId") ?? undefined;
    const collectionId = url.searchParams.get("collectionId") ?? undefined;
    const campaignId   = url.searchParams.get("campaignId") ?? undefined;
    const limit        = parseInt(url.searchParams.get("limit") ?? "50", 10);
    const offset       = parseInt(url.searchParams.get("offset") ?? "0", 10);

    const result = await queryApprovedAssets(orgId, {
      search, assetTypes, referenceId, collectionId, campaignId,
      limit: Math.min(limit, 100),
      offset: Math.max(offset, 0),
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
