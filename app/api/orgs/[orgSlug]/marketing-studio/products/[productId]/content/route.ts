/**
 * app/api/orgs/[orgSlug]/marketing-studio/products/[productId]/content/route.ts
 *
 * MARKETING-STUDIO-PRODUCT-CONTENT-01
 *
 * GET  /api/orgs/{orgSlug}/marketing-studio/products/{productId}/content
 *   → { content: ProductContentRecord | null; readiness: ProductContentReadiness }
 *
 * PUT  /api/orgs/{orgSlug}/marketing-studio/products/{productId}/content
 *   body: ProductContentUpsertInput (partial — only fields to update)
 *   → { content: ProductContentRecord; readiness: ProductContentReadiness }
 *
 * Status codes:
 *   200 — success
 *   400 — invalid input (missing productId or org boundary violation)
 *   401 — not authenticated / not authorized for this org
 *   500 — server error
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   requireOrgAccess validates the session before any read/write.
 *   The org boundary is double-checked in saveProductContent.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import {
  getProductContentWithReadiness,
  saveProductContent,
} from "@/lib/marketing-studio/products/product-content-service";
import type { ProductContentUpsertInput } from "@/lib/marketing-studio/products/product-content-types";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ orgSlug: string; productId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgSlug, productId } = await params;
    const { organization }       = await requireOrgAccess(orgSlug);

    const result = await getProductContentWithReadiness(organization.id, productId);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[product content GET]", err);
    if (msg === "unauthorized" || msg === "not_found") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to load product content" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgSlug, productId } = await params;
    const { organization }       = await requireOrgAccess(orgSlug);

    const body = await req.json() as Partial<ProductContentUpsertInput>;

    const input: ProductContentUpsertInput = {
      ...body,
      productId,
      organizationId: organization.id,
    };

    const result = await saveProductContent(organization.id, input);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[product content PUT]", err);
    if (msg === "org_boundary_violation") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 400 });
    }
    if (msg === "unauthorized" || msg === "not_found") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to save product content" }, { status: 500 });
  }
}
