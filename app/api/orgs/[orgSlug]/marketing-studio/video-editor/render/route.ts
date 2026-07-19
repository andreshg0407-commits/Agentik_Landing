/**
 * POST /api/orgs/[orgSlug]/marketing-studio/video-editor/render
 * GET  /api/orgs/[orgSlug]/marketing-studio/video-editor/render?assetId=xxx
 *
 * MARKETING-VIDEO-RENDER-FOUNDATION-01 — Render Job API
 *
 * POST: Creates a new video render job.
 *   - Registers an AgentExecution (module: marketing_studio, op: VIDEO_RENDER).
 *   - Creates a Biblioteca asset with pendingRender=true.
 *   - Returns { ok, job, executionId }.
 *
 * GET: Lists recent render jobs for the tenant.
 *   - Optional ?assetId=xxx to scope to a specific source asset.
 *   - Returns { jobs }.
 *
 * SECURITY:
 *   - requireOrgAccess enforces tenant membership.
 *   - organizationId always comes from server session — never from client payload.
 *   - tenant boundary enforced in render service (never trusts client orgId).
 */

import { type NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }              from "@/lib/auth/org-access";
import { canAccessMarketingStudio }      from "@/lib/auth/module-access";
import { DESTINO_TO_FORMATO }            from "@/lib/marketing-studio/video-editor/video-editor-types";
import type { VideoDestino }             from "@/lib/marketing-studio/video-editor/video-editor-types";
import {
  createVideoRenderJob,
  listVideoRenderJobs,
  getVideoRenderJob,
}                                        from "@/lib/marketing-studio/video-editor/render/video-render-service";
import type { VideoRenderConfig }        from "@/lib/marketing-studio/video-editor/render/video-render-types";

type RouteContext = { params: Promise<{ orgSlug: string }> };

// ── POST — create render job ───────────────────────────────────────────────────

export async function POST(
  req:    NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  try {
    const { membership, organization, user } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Acceso no autorizado" }, { status: 403 });
    }

    const body = await req.json() as {
      assetPadreId?:     string | null;
      assetOriginalId?:  string | null;
      videoOriginalUrl?: string;
      destino?:          VideoDestino;
      versionName?:      string;
      subtitulosActivos?: boolean;
      subtitleTrackId?:  string | null;
      musicaActiva?:          boolean;
      musicaTrackId?:         string | null;
      musicaVolumen?:         number;
      audioOriginalVolumen?:  number;
      musicaFadeIn?:          number;
      musicaFadeOut?:         number;
      textoActivo?:      boolean;
      textoOverlay?:     string;
      logoActivo?:       boolean;
      logoUrl?:          string | null;
      recorteInicio?:    number;
      recorteFin?:       number | null;
      referenceSku?:     string | null;
      referenceName?:    string | null;
    };

    if (!body.videoOriginalUrl) {
      return NextResponse.json({ error: "Se requiere videoOriginalUrl" }, { status: 400 });
    }
    if (!body.versionName) {
      return NextResponse.json({ error: "Se requiere versionName" }, { status: 400 });
    }

    const destino = body.destino ?? "reel_tiktok";
    const formato = DESTINO_TO_FORMATO[destino];

    const config: VideoRenderConfig = {
      destino,
      formato,
      recorteInicio: body.recorteInicio ?? 0,
      recorteFin:    body.recorteFin    ?? null,
      subtitulos: {
        activos:         body.subtitulosActivos ?? false,
        texto:           body.textoOverlay      ?? "",
        subtitleTrackId: body.subtitleTrackId   ?? null,
      },
      musica: {
        activa:               body.musicaActiva          ?? false,
        trackId:              body.musicaTrackId         ?? null,
        volumen:              body.musicaVolumen         ?? 80,
        audioOriginalVolumen: body.audioOriginalVolumen  ?? 100,
        fadeIn:               body.musicaFadeIn          ?? 0,
        fadeOut:              body.musicaFadeOut         ?? 0,
        musicTrackUrl:        null,  // resolved server-side in createVideoRenderJob
      },
      overlay: {
        textoActivo:  body.textoActivo ?? false,
        textoContent: body.textoOverlay ?? "",
        logoActivo:   body.logoActivo   ?? false,
        logoUrl:      body.logoUrl      ?? null,
      },
    };

    const result = await createVideoRenderJob(
      {
        organizationId:   organization.id,
        createdBy:        user.name ?? user.id ?? "unknown",
        assetPadreId:     body.assetPadreId    ?? null,
        assetOriginalId:  body.assetOriginalId ?? null,
        videoOriginalUrl: body.videoOriginalUrl,
        versionName:      body.versionName.slice(0, 120),
        config,
        referenceSku:     body.referenceSku  ?? null,
        referenceName:    body.referenceName ?? null,
      },
      organization.id,
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.errorMessage ?? "No pudimos crear la exportación." },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { ok: true, job: result.job, executionId: result.executionId },
      { status: 201 },
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "UNAUTHENTICATED") return NextResponse.json({ error: message }, { status: 401 });
    if (message === "ACCESS_DENIED")   return NextResponse.json({ error: message }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── GET — list render jobs ─────────────────────────────────────────────────────

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

    const url         = new URL(req.url);
    const executionId = url.searchParams.get("executionId") ?? undefined;
    const assetId     = url.searchParams.get("assetId")     ?? undefined;
    const limit       = Math.min(Number(url.searchParams.get("limit") ?? "20"), 50);

    // Single-job polling path (?executionId=xxx)
    if (executionId) {
      const job = await getVideoRenderJob(executionId, organization.id);
      if (!job) {
        return NextResponse.json({ error: "Job no encontrado" }, { status: 404 });
      }
      return NextResponse.json({ job });
    }

    const jobs = await listVideoRenderJobs(organization.id, { assetId, limit });

    return NextResponse.json({ jobs });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "UNAUTHENTICATED") return NextResponse.json({ error: message }, { status: 401 });
    if (message === "ACCESS_DENIED")   return NextResponse.json({ error: message }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
