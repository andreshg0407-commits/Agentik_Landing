/**
 * GET /api/orgs/[orgSlug]/marketing-studio/video-editor/assets
 *
 * MARKETING-ASSET-HUB-01 — Video Assets for Library Selector
 *
 * Returns Biblioteca video assets available for loading in the Editor de Video.
 * Used by the "Abrir desde Biblioteca" selector in video-editor-client.
 *
 * SECURITY:
 * - requireOrgAccess enforces tenant membership.
 * - organizationId always comes from server session.
 */

import { type NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }              from "@/lib/auth/org-access";
import { canAccessMarketingStudio }       from "@/lib/auth/module-access";
import { prisma }                         from "@/lib/prisma";
import type { BibliotecaVideoAsset }      from "@/lib/marketing-studio/video-editor/video-editor-types";

type RouteContext = { params: Promise<{ orgSlug: string }> };

export async function GET(
  _req:    NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  try {
    const { membership, organization } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Acceso no autorizado" }, { status: 403 });
    }

    // List approved video assets from Biblioteca
    const assets = await (prisma as any).fotoEstudioAsset.findMany({
      where: {
        organizationId: organization.id,
        assetType:      "short_video",
        status:         { in: ["approved", "completed"] },
      },
      orderBy: { createdAt: "desc" },
      take:    50,
      include: { session: { select: { productSku: true, sessionType: true, metadataJson: true } } },
    });

    const result: BibliotecaVideoAsset[] = assets.map((a: any) => {
      const meta    = a.session?.metadataJson as Record<string, unknown> | null;
      const isEditor = a.session?.sessionType === "video_edit" || meta?.videoEditorV1 === true;

      return {
        id:            a.id,
        nombre:        (meta?.versionName as string | undefined)
          ?? a.session?.productSku
          ?? a.assetType.replace(/_/g, " "),
        assetUrl:      a.assetUrl,
        assetType:     a.assetType,
        origen:        isEditor ? "video_editor" : a.session?.sessionType === "foto_estudio" ? "ai" : "manual",
        version:       typeof meta?.version === "number" ? meta.version : null,
        parentAssetId: (meta?.assetPadreId as string | null) ?? null,
        sku:           a.session?.productSku ?? (meta?.referenceSku as string | null) ?? null,
        productName:   (meta?.referenceName as string | null) ?? null,
        createdAt:     a.createdAt instanceof Date
          ? a.createdAt.toISOString()
          : String(a.createdAt),
      };
    });

    return NextResponse.json({ assets: result });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
