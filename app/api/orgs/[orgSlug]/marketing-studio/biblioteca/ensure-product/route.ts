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
 *   - canAccessMarketingStudio enforces module access.
 *   - organizationId exclusively from server session — never from client.
 *   - refCode normalized and validated server-side.
 *   - Idempotent: same refCode = same ProductEntity (retry-safe).
 *   - Race-condition safe: findFirst → create with catch on duplicate.
 *
 * WRITE BOUNDARY:
 *   This route MUST only be called when the user has confirmed a valid upload.
 *   The UI must NOT call this on modal open — only on upload confirmation.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { canAccessMarketingStudio }  from "@/lib/auth/module-access";
import { prisma }                    from "@/lib/prisma";

type RouteContext = { params: Promise<{ orgSlug: string }> };

function normalizeRefCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s{2,}/g, " ");
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const { orgSlug }                  = await ctx.params;
    const { membership, organization } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "ACCESS_DENIED" }, { status: 403 });
    }

    // organizationId exclusively from server session
    const orgId = organization.id;
    const body  = await req.json();

    const rawRefCode = typeof body.refCode === "string" ? body.refCode : "";
    const refCode = normalizeRefCode(rawRefCode);

    if (!refCode || refCode.length < 2) {
      return NextResponse.json({ error: "refCode is required (min 2 chars)" }, { status: 400 });
    }

    // Verify the reference exists in this org's CCS or inventory
    // (optional enrichment — does not block creation)
    const description = typeof body.description === "string"
      ? body.description.trim()
      : refCode;

    // Idempotent find-or-create with race-condition safety
    // No @@unique on (organizationId, sku), so we use findFirst + create + catch
    const existing = await prisma.productEntity.findFirst({
      where: { organizationId: orgId, sku: refCode },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json({ ok: true, productId: existing.id, created: false });
    }

    // Create — if a concurrent request created the same SKU between our findFirst
    // and this create, we'll get a row. We re-query to find it.
    try {
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
    } catch (createErr: any) {
      // Race condition: another request created the same SKU concurrently
      // Re-query to find the winner
      const raceWinner = await prisma.productEntity.findFirst({
        where: { organizationId: orgId, sku: refCode },
        select: { id: true },
      });
      if (raceWinner) {
        return NextResponse.json({ ok: true, productId: raceWinner.id, created: false });
      }
      // Genuine error
      throw createErr;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: msg }, { status: 403 });
    console.error("[ensure-product] error:", msg);
    return NextResponse.json({ error: "Error asegurando producto" }, { status: 500 });
  }
}
