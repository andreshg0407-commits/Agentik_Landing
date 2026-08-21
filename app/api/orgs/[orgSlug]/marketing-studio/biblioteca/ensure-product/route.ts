/**
 * app/api/orgs/[orgSlug]/marketing-studio/biblioteca/ensure-product/route.ts
 *
 * MARKETING-LIBRARY-ACTIVE-ASSET-INGESTION-02A-R4A — Ensure Product Entity
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
 *   - refCode verified against CCS/PIL inventory — arbitrary refs rejected.
 *   - R2 storage gate: STORAGE_VERIFICATION_REQUIRED (503) if R2 not configured.
 *   - Best-effort idempotent: findFirst → create → catch → re-query.
 *     NOTE: No @@unique(organizationId, sku) constraint exists.
 *     True idempotency requires migration — see MIGRATION_PROPOSAL below.
 *   - Race-condition mitigated: catch on create failure + re-query.
 *
 * MIGRATION_PROPOSAL (not applied):
 *   ALTER TABLE "ProductEntity"
 *     ADD CONSTRAINT "ProductEntity_organizationId_sku_unique"
 *     UNIQUE ("organizationId", "sku")
 *     WHERE "sku" IS NOT NULL;
 *   This would guarantee true idempotency. Requires duplicate audit first.
 *
 * WRITE BOUNDARY:
 *   This route MUST only be called when the user has confirmed a valid upload.
 *   The UI must NOT call this on modal open — only on upload confirmation.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { canAccessMarketingStudio }  from "@/lib/auth/module-access";
import { prisma }                    from "@/lib/prisma";
import { loadR2Config }              from "@/lib/storage/r2-config";

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

    // SERVER-SIDE STORAGE GATE: R2 must be configured before any write.
    // A disabled UI button is NOT a gate. This is the real gate.
    const r2 = loadR2Config();
    if (!r2) {
      return NextResponse.json(
        { error: "STORAGE_VERIFICATION_REQUIRED", message: "R2 storage not configured — uploads blocked server-side" },
        { status: 503 },
      );
    }

    // organizationId exclusively from server session
    const orgId = organization.id;
    const body  = await req.json();

    const rawRefCode = typeof body.refCode === "string" ? body.refCode : "";
    const refCode = normalizeRefCode(rawRefCode);

    if (!refCode || refCode.length < 2) {
      return NextResponse.json({ error: "refCode is required (min 2 chars)" }, { status: 400 });
    }

    const description = typeof body.description === "string"
      ? body.description.trim()
      : refCode;

    // R4A Section D: Verify refCode exists in tenant's inventory (CCS or PIL)
    // before allowing ProductEntity creation. Prevents orphan entities from
    // arbitrary refCodes that don't correspond to real inventory.
    const ccsMatch = await prisma.commercialCoverageSnapshot.findFirst({
      where: { organizationId: orgId, refCode },
      select: { id: true },
    });
    const pilMatch = !ccsMatch
      ? await prisma.productEntity.findFirst({
          where: { organizationId: orgId, sku: refCode, productLine: "5" },
          select: { id: true },
        })
      : null;

    if (!ccsMatch && !pilMatch) {
      // Also check if there's already a ProductEntity (non-PIL) with this SKU
      // This handles the case where a ProductEntity was created by a prior import
      const existingProduct = await prisma.productEntity.findFirst({
        where: { organizationId: orgId, sku: refCode },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (existingProduct) {
        return NextResponse.json({ ok: true, productId: existingProduct.id, created: false });
      }
      return NextResponse.json(
        { error: "REF_NOT_IN_INVENTORY", message: `${refCode} no existe en el inventario de esta organizacion` },
        { status: 404 },
      );
    }

    // Best-effort idempotent find-or-create.
    // No @@unique on (organizationId, sku) — see MIGRATION_PROPOSAL in header.
    // findFirst ordered by createdAt ASC to always return the oldest in case of duplicates.
    const existing = await prisma.productEntity.findFirst({
      where: { organizationId: orgId, sku: refCode },
      orderBy: { createdAt: "asc" },
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
        orderBy: { createdAt: "asc" },
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
