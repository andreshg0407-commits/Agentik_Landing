/**
 * app/api/orgs/[orgSlug]/marketing-studio/products/[productId]/assets/[assetId]/route.ts
 *
 * Asset-link management for a specific product + asset pair.
 *
 * DELETE — Unlinks the asset from the product (ProductAssetLink deleted).
 *          The GeneratedAsset is preserved — the asset may be used elsewhere.
 *
 * PATCH  — Updates the asset's role on this product.
 *          Body: { role: string }
 *          When role = "hero", all other hero links are demoted to "gallery".
 *
 * ── Security ──────────────────────────────────────────────────────────────────
 *   requireOrgAccess on every request.
 *   organizationId always derived from the authenticated session.
 *   removeProductAssetLink / updateProductAssetRole verify productId ownership.
 */

import { NextRequest, NextResponse }          from "next/server";
import { requireOrgAccess }                  from "@/lib/auth/org-access";
import {
  removeProductAssetLink,
  updateProductAssetRole,
}                                            from "@/lib/marketing-studio/products/product-repository";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ orgSlug: string; productId: string; assetId: string }>;
};

// ── DELETE — unlink asset from product ────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  try {
    const { orgSlug, productId, assetId } = await params;
    const { organization } = await requireOrgAccess(orgSlug);

    const removed = await removeProductAssetLink(
      organization.id,
      productId,
      assetId,
    );

    // null = link was already gone; still return ok (idempotent)
    return NextResponse.json({
      ok:              true,
      wasHero:         removed !== null && removed.role === "hero",
      promotedAssetId: removed?.promotedAssetId ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: msg }, { status: 403 });
    if (msg === "Product not found or access denied")
      return NextResponse.json({ error: msg }, { status: 404 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── PATCH — update asset role (e.g. promote to hero) ─────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  try {
    const { orgSlug, productId, assetId } = await params;
    const { organization } = await requireOrgAccess(orgSlug);

    const body = await req.json() as { role?: string };
    if (!body.role || typeof body.role !== "string") {
      return NextResponse.json({ error: "role is required" }, { status: 400 });
    }

    await updateProductAssetRole(
      organization.id,
      productId,
      assetId,
      body.role,
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: msg }, { status: 403 });
    if (msg.includes("not found")) return NextResponse.json({ error: msg }, { status: 404 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
