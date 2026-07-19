/**
 * app/api/orgs/[orgSlug]/marketing-studio/bulk-import/route.ts
 *
 * MARKETING-STUDIO-BULK-IMPORT-01
 *
 * ── GET  — returns existing SKU + name index for conflict detection (dry run)
 * ── DELETE — rolls back an import by deleting a list of product IDs
 *
 * ── Security ─────────────────────────────────────────────────────────────────
 *   requireOrgAccess verifies auth + org membership.
 *   DELETE verifies each productId belongs to the org before deletion.
 *   No cross-tenant writes possible.
 */

import { NextRequest, NextResponse }  from "next/server";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import { prisma }                     from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ orgSlug: string }> };

// ── GET — SKU index for conflict detection ────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  try {
    const { organization } = await requireOrgAccess(orgSlug);

    const products = await prisma.productEntity.findMany({
      where:  { organizationId: organization.id },
      select: { id: true, sku: true, name: true },
    });

    // Return SKU → id map + name → id map for conflict detection
    const bySkuMap: Record<string, string>  = {};
    const byNameMap: Record<string, string> = {};

    for (const p of products) {
      if (p.sku)  bySkuMap[p.sku.toUpperCase().trim()]   = p.id;
      if (p.name) byNameMap[p.name.toLowerCase().trim()] = p.id;
    }

    return NextResponse.json({ bySku: bySkuMap, byName: byNameMap });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: msg }, { status: 403 });
    console.error("[bulk-import/GET]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── DELETE — transactional rollback ───────────────────────────────────────────

/**
 * Body: { productIds: string[] }
 *
 * Deletes all provided productIds that belong to the org.
 * Cascade deletes: ProductAssetLink, ProductActivity, ProductSyncState,
 * ProductPublicationState, ProductVariant, ProductAttribute.
 *
 * GeneratedAsset and StudioSession are NOT deleted (owned independently).
 * R2 objects are NOT deleted (CDN references remain — acceptable for rollback).
 */
export async function DELETE(
  req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  try {
    const { organization } = await requireOrgAccess(orgSlug);
    const organizationId   = organization.id;

    let body: { productIds?: unknown };
    try {
      body = await req.json() as { productIds?: unknown };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const productIds = Array.isArray(body?.productIds)
      ? (body.productIds as unknown[]).filter((id): id is string => typeof id === "string")
      : [];

    if (productIds.length === 0) {
      return NextResponse.json({ deleted: 0 });
    }

    // Org-scoped deletion — never touches other orgs' data
    const result = await prisma.productEntity.deleteMany({
      where: {
        id:             { in: productIds },
        organizationId,
      },
    });

    return NextResponse.json({ deleted: result.count });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: msg }, { status: 403 });
    console.error("[bulk-import/DELETE]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
