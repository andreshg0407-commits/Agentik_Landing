/**
 * GET /api/orgs/[orgSlug]/marketing-studio/biblioteca/assets/[assetId]
 *
 * MARKETING-VIDEO-EDITOR-ASSET-LOAD-02 — Single Asset Resolver
 *
 * Returns a single Biblioteca asset by ID, scoped to the authenticated tenant.
 * Used by Editor de Video to resolve an assetId received via URL param.
 *
 * SECURITY:
 * - requireOrgAccess enforces tenant membership.
 * - organizationId always comes from server session — never from client URL.
 * - Asset is re-validated against organizationId after fetch (row-level isolation).
 *
 * ERROR CODES:
 * - 404: asset does not exist or belongs to another org
 * - 403: insufficient role
 * - 422: asset exists but is not a video type
 * - 400: missing assetId
 */

import { type NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }              from "@/lib/auth/org-access";
import { canAccessMarketingStudio }      from "@/lib/auth/module-access";
import { prisma }                        from "@/lib/prisma";
import type { BibliotecaVideoAsset }     from "@/lib/marketing-studio/video-editor/video-editor-types";

type RouteContext = { params: Promise<{ orgSlug: string; assetId: string }> };

const VIDEO_ASSET_TYPES = new Set(["short_video", "video", "reel", "story_video"]);

export async function GET(
  _req:    NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug, assetId } = await params;

  if (!assetId) {
    return NextResponse.json({ error: "Se requiere assetId" }, { status: 400 });
  }

  try {
    const { membership, organization } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "No tienes acceso a este video." }, { status: 403 });
    }

    // Fetch asset — scoped to this org (row-level isolation)
    const raw = await (prisma as any).fotoEstudioAsset.findFirst({
      where: {
        id:             assetId,
        organizationId: organization.id,
      },
      include: {
        session: {
          select: { productSku: true, sessionType: true, metadataJson: true },
        },
      },
    });

    if (!raw) {
      return NextResponse.json(
        { error: "No encontramos este video en Biblioteca." },
        { status: 404 },
      );
    }

    if (!VIDEO_ASSET_TYPES.has(raw.assetType)) {
      return NextResponse.json(
        { error: "Este recurso no es un video editable." },
        { status: 422 },
      );
    }

    if (!raw.assetUrl) {
      return NextResponse.json(
        { error: "Este video no tiene archivo disponible para vista previa." },
        { status: 422 },
      );
    }

    const meta     = (raw.metadataJson ?? {}) as Record<string, unknown>;
    const sessMeta = (raw.session?.metadataJson ?? {}) as Record<string, unknown>;
    const isEditor = raw.session?.sessionType === "video_edit" || meta.videoEditorV1 === true;

    const asset: BibliotecaVideoAsset = {
      id:            raw.id,
      nombre:
        (meta.versionName as string | undefined) ??
        (sessMeta.versionName as string | undefined) ??
        raw.session?.productSku ??
        raw.assetType.replace(/_/g, " "),
      assetUrl:      raw.assetUrl,
      assetType:     raw.assetType,
      origen:        isEditor ? "video_editor" :
                     raw.session?.sessionType === "foto_estudio" ? "ai" : "manual",
      version:       typeof meta.version === "number" ? meta.version : null,
      parentAssetId: (meta.assetPadreId as string | null) ?? null,
      sku:           raw.session?.productSku ?? (meta.referenceSku as string | null) ?? null,
      productName:   (meta.referenceName as string | null) ?? null,
      createdAt:     raw.createdAt instanceof Date
        ? raw.createdAt.toISOString()
        : String(raw.createdAt),
    };

    return NextResponse.json({ asset });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "UNAUTHENTICATED") return NextResponse.json({ error: message }, { status: 401 });
    if (message === "ACCESS_DENIED")   return NextResponse.json({ error: message }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
