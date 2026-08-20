/**
 * app/api/orgs/[orgSlug]/marketing-studio/biblioteca/ensure-product/route.ts
 *
 * MARKETING-LIBRARY-ACTIVE-ASSET-INGESTION-02A-R4 — Ensure Product Entity
 *
 * POST — Given a normalized refCode, finds or creates a ProductEntity
 *        so that assets can be linked to this reference.
 *
 * Body:
 *   { refCode: string, description?: string }
 *
 * Returns:
 *   { ok: true, productId: string, created: boolean }
 *
 * SECURITY:
 *   - requireOrgAccess enforces tenant membership.
 *   - organizationId always from server session.
 *   - Idempotent: same refCode = same ProductEntity.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { canAccessMarketingStudio }  from "@/lib/auth/module-access";
import { prisma }                    from "@/lib/prisma";

type RouteContext = { params: Promise<{ orgSlug: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const { orgSlug }                  = await ctx.params;
    const { membership, organization } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "ACCESS_DENIED" }, { status: 403 });
    }

    const orgId = organization.id;
    const body  = await req.json();

    const refCode = (typeof body.refCode === "string" ? body.refCode : "")
      .trim().toUpperCase().replace(/\s{2,}/g, " ");

    if (!refCode) {
      return NextResponse.json({ error: "refCode is required" }, { status: 400 });
    }

    // Try to find existing ProductEntity by SKU match
    const existing = await prisma.productEntity.findFirst({
      where: { organizationId: orgId, sku: refCode },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json({ ok: true, productId: existing.id, created: false });
    }

    // Create a new ProductEntity for this reference
    const description = typeof body.description === "string"
      ? body.description.trim()
      : refCode;

    const product = await prisma.productEntity.create({
      data: {
        organizationId: orgId,
        name:           description || refCode,
        sku:            refCode,
        status:         "pending",
        commercialStatus: "active",
        usagePermission:  "commercial",
        currency:         "COP",
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, productId: product.id, created: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: msg }, { status: 403 });
    console.error("[ensure-product] error:", msg);
    return NextResponse.json({ error: "Error asegurando producto" }, { status: 500 });
  }
}
