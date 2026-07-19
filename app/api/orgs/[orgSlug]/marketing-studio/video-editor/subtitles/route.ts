/**
 * POST   /api/orgs/[orgSlug]/marketing-studio/video-editor/subtitles
 * GET    /api/orgs/[orgSlug]/marketing-studio/video-editor/subtitles?assetId=&trackId=
 * PATCH  /api/orgs/[orgSlug]/marketing-studio/video-editor/subtitles
 *
 * MARKETING-VIDEO-SUBTITLES-01 — Subtitle API
 *
 * POST: Transcribe a video and create a subtitle track.
 *   Body: { assetId?, assetOriginalId?, videoUrl, language, referenceSku?, referenceName? }
 *   Response: { ok, track }
 *
 * GET: List or fetch subtitle tracks.
 *   ?assetId=  — list tracks for a specific asset
 *   ?trackId=  — fetch a single track (polling)
 *   Response: { tracks } | { track }
 *
 * PATCH: Update subtitle segments (manual edits).
 *   Body: { trackId, segments: VideoSubtitleSegment[] }
 *   Response: { ok, track }
 *
 * SECURITY:
 *   requireOrgAccess enforces tenant membership.
 *   organizationId always from server session.
 */

import { type NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }              from "@/lib/auth/org-access";
import { canAccessMarketingStudio }      from "@/lib/auth/module-access";
import {
  createSubtitleTrack,
  getSubtitleTrack,
  listSubtitleTracks,
  updateSubtitleSegments,
}                                        from "@/lib/marketing-studio/video-editor/subtitles/video-subtitle-service";
import type { VideoSubtitleSegment }     from "@/lib/marketing-studio/video-editor/subtitles/video-subtitle-types";

type RouteContext = { params: Promise<{ orgSlug: string }> };

// ── POST — create track ────────────────────────────────────────────────────────

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
      assetId?:         string | null;
      assetOriginalId?: string | null;
      videoUrl?:        string;
      language?:        string;
      referenceSku?:    string | null;
      referenceName?:   string | null;
    };

    if (!body.videoUrl) {
      return NextResponse.json({ error: "Se requiere videoUrl" }, { status: 400 });
    }

    const result = await createSubtitleTrack(
      {
        organizationId:  organization.id,
        createdBy:       user.name ?? user.id ?? "unknown",
        assetId:         body.assetId         ?? null,
        assetOriginalId: body.assetOriginalId ?? null,
        videoUrl:        body.videoUrl,
        language:        (body.language ?? "es").slice(0, 8),
        referenceSku:    body.referenceSku    ?? null,
        referenceName:   body.referenceName   ?? null,
      },
      organization.id,
    );

    if (!result.success || !result.track) {
      return NextResponse.json(
        { error: result.errorMessage ?? "No pudimos generar subtítulos." },
        { status: result.track ? 200 : 500 },
      );
    }

    return NextResponse.json({ ok: true, track: result.track }, { status: 201 });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "UNAUTHENTICATED") return NextResponse.json({ error: message }, { status: 401 });
    if (message === "ACCESS_DENIED")   return NextResponse.json({ error: message }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── GET — list or fetch ────────────────────────────────────────────────────────

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

    const url     = new URL(req.url);
    const trackId = url.searchParams.get("trackId") ?? undefined;
    const assetId = url.searchParams.get("assetId") ?? undefined;

    // Single track polling
    if (trackId) {
      const track = await getSubtitleTrack(trackId, organization.id);
      if (!track) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
      return NextResponse.json({ track });
    }

    // List by assetId
    const tracks = await listSubtitleTracks(organization.id, { assetId, limit: 5 });
    return NextResponse.json({ tracks });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "UNAUTHENTICATED") return NextResponse.json({ error: message }, { status: 401 });
    if (message === "ACCESS_DENIED")   return NextResponse.json({ error: message }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── PATCH — update segments ────────────────────────────────────────────────────

export async function PATCH(
  req:    NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  try {
    const { membership, organization } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Acceso no autorizado" }, { status: 403 });
    }

    const body = await req.json() as {
      trackId:   string;
      segments:  VideoSubtitleSegment[];
    };

    if (!body.trackId) {
      return NextResponse.json({ error: "Se requiere trackId" }, { status: 400 });
    }
    if (!Array.isArray(body.segments)) {
      return NextResponse.json({ error: "Se requieren los segmentos" }, { status: 400 });
    }

    const track = await updateSubtitleSegments(body.trackId, organization.id, body.segments);
    if (!track) {
      return NextResponse.json({ error: "No se pudo actualizar." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, track });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "UNAUTHENTICATED") return NextResponse.json({ error: message }, { status: 401 });
    if (message === "ACCESS_DENIED")   return NextResponse.json({ error: message }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
