/**
 * GET /api/orgs/[orgSlug]/marketing-studio/video-editor/references
 *
 * MARKETING-VIDEO-UPLOAD-TO-ASSET-HUB-02A — Reference Search
 *
 * Returns ProductEntity references matching a search query.
 * Used by the Video Editor's reference selector when a local file is uploaded.
 *
 * ?q=xxx  — search term (matches name or SKU, case-insensitive)
 * ?limit= — max results (default 8, max 20)
 *
 * SECURITY:
 *   - requireOrgAccess enforces tenant membership.
 *   - organizationId always comes from server session.
 */

import { type NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }              from "@/lib/auth/org-access";
import { canAccessMarketingStudio }      from "@/lib/auth/module-access";
import { prisma }                        from "@/lib/prisma";

export interface VideoEditorReferenceOption {
  id:       string;
  sku:      string | null;
  name:     string;
  category: string | null;
}

type RouteContext = { params: Promise<{ orgSlug: string }> };

export async function GET(
  req:    NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  try {
    const { membership, organization } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Acceso no autorizado" }, { status: 403 });
    }

    const url   = new URL(req.url);
    const q     = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "8"), 20);

    const where: Record<string, unknown> = {
      organizationId: organization.id,
      commercialStatus: { not: "archived" },
    };

    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { sku:  { contains: q, mode: "insensitive" } },
      ];
    }

    const rows = await prisma.productEntity.findMany({
      where,
      select: { id: true, sku: true, name: true, category: true },
      orderBy: { name: "asc" },
      take: limit,
    });

    const references: VideoEditorReferenceOption[] = rows.map(r => ({
      id:       r.id,
      sku:      r.sku    ?? null,
      name:     r.name,
      category: r.category ?? null,
    }));

    return NextResponse.json({ references });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "UNAUTHENTICATED") return NextResponse.json({ error: message }, { status: 401 });
    if (message === "ACCESS_DENIED")   return NextResponse.json({ error: message }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
