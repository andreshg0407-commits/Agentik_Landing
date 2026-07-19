/**
 * POST /api/orgs/[orgSlug]/marketing-studio/video-editor/export
 *
 * MARKETING-VIDEO-EDITOR-01 / MARKETING-ASSET-HUB-01 — Video Export API
 *
 * Creates a new versioned asset in Biblioteca from an edited video.
 * Never overwrites originals — always creates a derived version.
 *
 * SECURITY:
 * - requireOrgAccess enforces tenant membership.
 * - organizationId always comes from server session — never from client payload.
 */

import { type NextRequest, NextResponse }  from "next/server";
import { requireOrgAccess }               from "@/lib/auth/org-access";
import { canAccessMarketingStudio }        from "@/lib/auth/module-access";
import { exportVideoToLibrary }            from "@/lib/marketing-studio/video-editor/video-editor-service";
import type { VideoExportPayload }         from "@/lib/marketing-studio/video-editor/video-editor-types";
import { DESTINO_TO_FORMATO }              from "@/lib/marketing-studio/video-editor/video-editor-types";

type RouteContext = { params: Promise<{ orgSlug: string }> };

export async function POST(
  req:     NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  try {
    const { membership, organization, user } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Acceso no autorizado" }, { status: 403 });
    }

    const body = await req.json() as Omit<VideoExportPayload, "organizationId" | "exportedAt" | "creadoPor">;

    if (!body.videoOriginalUrl || !body.versionName) {
      return NextResponse.json(
        { error: "Se requiere videoOriginalUrl y versionName" },
        { status: 400 },
      );
    }

    const destino = body.destino ?? "reel_tiktok";

    const result = await exportVideoToLibrary({
      organizationId:    organization.id,
      assetPadreId:      body.assetPadreId ?? null,
      assetOriginalId:   body.assetOriginalId ?? body.assetPadreId ?? null,
      videoOriginalUrl:  body.videoOriginalUrl,
      versionName:       body.versionName.slice(0, 120),
      version:           body.version ?? 1,
      origen:            body.origen ?? "video_editor",
      destino,
      formato:           DESTINO_TO_FORMATO[destino],
      duracion:          body.duracion ?? null,
      resolucion:        body.resolucion ?? null,
      subtitulosActivos: body.subtitulosActivos ?? false,
      musicaActiva:      body.musicaActiva ?? false,
      musicaTrackId:     body.musicaTrackId ?? null,
      textoActivo:       body.textoActivo ?? false,
      logoActivo:        body.logoActivo ?? false,
      referenceSku:      body.referenceSku ?? null,
      referenceName:     body.referenceName ?? null,
      exportedAt:        new Date().toISOString(),
      creadoPor:         user.name ?? user.id ?? "unknown",
      pendingRender:     true,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.errorMessage ?? "Error al exportar" },
        { status: 500 },
      );
    }

    return NextResponse.json(result, { status: 201 });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
