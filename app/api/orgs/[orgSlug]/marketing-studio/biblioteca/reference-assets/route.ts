/**
 * app/api/orgs/[orgSlug]/marketing-studio/biblioteca/reference-assets/route.ts
 *
 * MARKETING-LIBRARY-FOLDER-DRAWER-02A-R3 — Reference Folder Assets
 *
 * GET — Lazy-loads assets linked to a specific inventory reference.
 *
 * Query params:
 *   refCode    — normalized reference code (required)
 *   productId  — ProductEntity.id (optional, used when known)
 *
 * Returns:
 *   { ok: true, assets: ReferenceAsset[], productId: string | null }
 *
 * SECURITY:
 *   - requireOrgAccess enforces tenant membership.
 *   - organizationId always from server session.
 *   - Only assets belonging to the tenant's ProductEntity are returned.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { canAccessMarketingStudio }  from "@/lib/auth/module-access";
import { prisma }                    from "@/lib/prisma";

type RouteContext = { params: Promise<{ orgSlug: string }> };

export interface ReferenceAsset {
  id:           string;
  assetUrl:     string | null;
  assetType:    string;
  role:         string;
  reviewStatus: string;
  sourceType:   string | null;
  createdAt:    string;
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    const { orgSlug }                  = await ctx.params;
    const { membership, organization } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "ACCESS_DENIED" }, { status: 403 });
    }

    const orgId   = organization.id;
    const url     = new URL(req.url);
    const refCode = (url.searchParams.get("refCode") ?? "").trim().toUpperCase();

    if (!refCode) {
      return NextResponse.json({ error: "refCode is required" }, { status: 400 });
    }

    // Resolve ProductEntity by normalized SKU match
    let productId = url.searchParams.get("productId") ?? null;

    if (!productId) {
      const product = await prisma.productEntity.findFirst({
        where: { organizationId: orgId, sku: refCode },
        select: { id: true },
      });
      productId = product?.id ?? null;
    }

    if (!productId) {
      // No ProductEntity linked — folder is empty
      return NextResponse.json({ ok: true, assets: [], productId: null });
    }

    // Verify the product belongs to this org
    const product = await prisma.productEntity.findFirst({
      where: { id: productId, organizationId: orgId },
      select: { id: true },
    });

    if (!product) {
      return NextResponse.json({ ok: true, assets: [], productId: null });
    }

    // Load all asset links for this product
    const links = await prisma.productAssetLink.findMany({
      where: { productId: product.id, organizationId: orgId },
      select: {
        assetId:    true,
        role:       true,
        sourceType: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    if (links.length === 0) {
      return NextResponse.json({ ok: true, assets: [], productId: product.id });
    }

    // Load the actual GeneratedAsset records
    const assetIds = links.map(l => l.assetId);
    const assets = await prisma.generatedAsset.findMany({
      where: { id: { in: assetIds } },
      select: {
        id:           true,
        assetUrl:     true,
        assetType:    true,
        reviewStatus: true,
        createdAt:    true,
      },
    });

    const assetMap = new Map(assets.map(a => [a.id, a]));

    const result: ReferenceAsset[] = [];
    for (const link of links) {
      const asset = assetMap.get(link.assetId);
      if (!asset) continue;
      result.push({
        id:           asset.id,
        assetUrl:     asset.assetUrl,
        assetType:    asset.assetType,
        role:         link.role,
        reviewStatus: asset.reviewStatus,
        sourceType:   link.sourceType,
        createdAt:    asset.createdAt.toISOString(),
      });
    }

    return NextResponse.json({ ok: true, assets: result, productId: product.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: msg }, { status: 403 });
    console.error("[reference-assets] error:", msg);
    return NextResponse.json({ error: "Error cargando assets de referencia" }, { status: 500 });
  }
}
