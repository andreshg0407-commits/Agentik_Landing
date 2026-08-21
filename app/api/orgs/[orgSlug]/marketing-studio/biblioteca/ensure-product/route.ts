/**
 * app/api/orgs/[orgSlug]/marketing-studio/biblioteca/ensure-product/route.ts
 *
 * MARKETING-R4A-SECURITY-CLOSEOUT-R1 — Ensure Product Entity
 *
 * POST — Given a normalized refCode, resolves an EXISTING ProductEntity.
 *
 * Body:
 *   { refCode: string, description?: string }
 *
 * Returns:
 *   { ok: true, productId: string, created: false }
 *
 * SECURITY GATES (fail-closed, in order):
 *   1. requireOrgAccess — tenant membership
 *   2. canAccessMarketingStudio — module access
 *   3. getStorageVerificationStatus — 3-state R2 gate:
 *      NOT_CONFIGURED           → 503
 *      CONFIGURED_NOT_VERIFIED  → 503
 *      CANARY_VERIFIED          → proceed
 *   4. refCode normalized + validated server-side
 *   5. refCode verified against ACTIVE inventory (CCS disponible>0 or PIL qty>0)
 *   6. ProductEntity lookup — find-only, NEVER create
 *
 * CREATION BLOCKED:
 *   No @@unique(organizationId, sku) constraint exists.
 *   Until uniqueness authority is established (migration applied),
 *   this route returns PRODUCT_IDENTITY_UNIQUENESS_REQUIRED
 *   instead of creating. Zero writes.
 *
 * MIGRATION_PROPOSAL (not applied):
 *   CREATE UNIQUE INDEX "ProductEntity_organizationId_sku_unique"
 *     ON "ProductEntity" ("organizationId", "sku")
 *     WHERE "sku" IS NOT NULL;
 *   Requires duplicate audit first — see /biblioteca/duplicate-audit route.
 *
 * WRITE BOUNDARY:
 *   This route performs ZERO writes until uniqueness migration is applied.
 *   organizationId exclusively from server session — never from client.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { canAccessMarketingStudio }  from "@/lib/auth/module-access";
import { prisma }                    from "@/lib/prisma";
import { getStorageVerificationStatus } from "@/lib/storage/storage-verification-status";

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

    // ── GATE 1: 3-state storage verification ──
    const storage = getStorageVerificationStatus();
    if (!storage.uploadsAllowed) {
      return NextResponse.json(
        {
          error:   storage.state === "NOT_CONFIGURED"
                     ? "STORAGE_NOT_CONFIGURED"
                     : "STORAGE_CONFIGURED_NOT_VERIFIED",
          message: storage.reason,
        },
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

    // ── GATE 2: Verify refCode is ACTIVE in inventory ──
    // CCS: disponible > 0 (post-reservation, certified)
    const ccsActive = await prisma.commercialCoverageSnapshot.findFirst({
      where: { organizationId: orgId, refCode, disponible: { gt: 0 } },
      orderBy: { snapshotAt: "desc" },
      select: { id: true, disponible: true },
    });

    // PIL: SUM(quantity) > 0 for productLine="5" (physical stock, not reservation-adjusted)
    let pilActive: { id: string } | null = null;
    if (!ccsActive) {
      const pilProduct = await prisma.productEntity.findFirst({
        where: { organizationId: orgId, sku: refCode, productLine: "5" },
        select: {
          id: true,
          inventoryLevels: { select: { quantity: true } },
        },
      });
      if (pilProduct) {
        const totalQty = pilProduct.inventoryLevels.reduce((s, l) => s + l.quantity, 0);
        if (totalQty > 0) {
          pilActive = { id: pilProduct.id };
        }
      }
    }

    // Check for inactive reference (exists but no active stock)
    if (!ccsActive && !pilActive) {
      // Check if ref exists at all (inactive)
      const ccsExists = await prisma.commercialCoverageSnapshot.findFirst({
        where: { organizationId: orgId, refCode },
        select: { id: true },
      });
      const pilExists = !ccsExists
        ? await prisma.productEntity.findFirst({
            where: { organizationId: orgId, sku: refCode, productLine: "5" },
            select: { id: true },
          })
        : null;

      if (ccsExists || pilExists) {
        return NextResponse.json(
          { error: "REF_NOT_ACTIVE_IN_INVENTORY", message: `${refCode} existe pero no tiene stock activo` },
          { status: 409 },
        );
      }

      // Also check if there's an existing ProductEntity (non-PIL) — return it without creating
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

    // ── GATE 3: Find existing ProductEntity — NEVER create ──
    const existing = await prisma.productEntity.findFirst({
      where: { organizationId: orgId, sku: refCode },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json({ ok: true, productId: existing.id, created: false });
    }

    // ── CREATION BLOCKED — uniqueness authority required ──
    // No @@unique(organizationId, sku) constraint exists.
    // Until migration is applied and duplicate audit is clean,
    // ProductEntity creation is blocked server-side.
    return NextResponse.json(
      {
        error:   "PRODUCT_IDENTITY_UNIQUENESS_REQUIRED",
        message: "ProductEntity creation blocked — @@unique(organizationId, sku) constraint pending. " +
                 "Run duplicate audit and apply migration first.",
        refCode,
      },
      { status: 503 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: msg }, { status: 403 });
    console.error("[ensure-product] error:", msg);
    return NextResponse.json({ error: "Error asegurando producto" }, { status: 500 });
  }
}
