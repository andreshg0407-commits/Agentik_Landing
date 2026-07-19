/**
 * app/api/orgs/[orgSlug]/marketing-studio/products/[productId]/route.ts
 *
 * MARKETING-STUDIO-REFERENCE-DETAIL-01
 *
 * GET — returns full product detail (attributes + activityEvents) for the
 * ProductDetailDrawer. Called lazily when a reference card is clicked.
 *
 * ── Security ──────────────────────────────────────────────────────────────────
 *   Requires authenticated user with org membership.
 *   All queries scoped to organizationId.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { getProductConsoleDetail }   from "@/lib/marketing-studio/products/product-query-service";
import { prisma }                    from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string; productId: string }> },
): Promise<NextResponse> {
  try {
    const { orgSlug, productId } = await params;
    const { organization }       = await requireOrgAccess(orgSlug);

    const detail = await getProductConsoleDetail(organization.id, productId);
    if (!detail) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── PATCH — update product status ─────────────────────────────────────────────

const VALID_STATUSES = ["approved", "pending", "rejected"] as const;
type ValidStatus = typeof VALID_STATUSES[number];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string; productId: string }> },
): Promise<NextResponse> {
  try {
    const { orgSlug, productId } = await params;
    const { organization }       = await requireOrgAccess(orgSlug);
    const body                   = await req.json() as { status?: string };

    if (!body.status || !VALID_STATUSES.includes(body.status as ValidStatus)) {
      return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
    }

    await prisma.productEntity.update({
      where: { id: productId, organizationId: organization.id },
      data:  { status: body.status },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
