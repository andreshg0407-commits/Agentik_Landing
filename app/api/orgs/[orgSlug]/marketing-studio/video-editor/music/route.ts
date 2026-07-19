/**
 * app/api/orgs/[orgSlug]/marketing-studio/video-editor/music/route.ts
 *
 * MARKETING-VIDEO-MUSIC-01 — Music Tracks API
 *
 * GET    /music              — list music tracks for this tenant
 * POST   /music              — upload + register a new music track (multipart/form-data)
 * DELETE /music?trackId=xxx  — delete a music track
 *
 * Upload flow:
 *   1. Client sends multipart form-data with: file (audio), nombre, durationSeconds?
 *   2. Route validates and reads buffer
 *   3. Calls createMusicTrack() → uploads to R2, registers in DB
 *   4. Returns { ok, track }
 *
 * SECURITY:
 *   - requireOrgAccess enforces tenant membership.
 *   - organizationId always comes from server session — never from client.
 *   - Tenant boundary enforced in service (organizationId from session only).
 */

export const runtime    = "nodejs";
export const maxDuration = 60;  // allow time for R2 upload

import { type NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }               from "@/lib/auth/org-access";
import { canAccessMarketingStudio }       from "@/lib/auth/module-access";
import {
  createMusicTrack,
  listMusicTracks,
  deleteMusicTrack,
}                                         from "@/lib/marketing-studio/video-editor/music/video-music-service";
import { MUSIC_MAX_SIZE_MB }              from "@/lib/marketing-studio/video-editor/music/video-music-types";

type RouteContext = { params: Promise<{ orgSlug: string }> };

// ── GET — list tracks ──────────────────────────────────────────────────────────

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

    const url          = new URL(req.url);
    const limit        = Math.min(Number(url.searchParams.get("limit") ?? "30"), 50);
    const referenceSku = url.searchParams.get("referenceSku") ?? undefined;

    const tracks = await listMusicTracks(organization.id, { limit, referenceSku });

    return NextResponse.json({ tracks });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "UNAUTHENTICATED") return NextResponse.json({ error: message }, { status: 401 });
    if (message === "ACCESS_DENIED")   return NextResponse.json({ error: message }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── POST — upload music track ──────────────────────────────────────────────────

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

    // Parse multipart form-data
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: "Formato de solicitud inválido." }, { status: 400 });
    }

    const file   = formData.get("file") as File | null;
    const nombre = (formData.get("nombre") as string | null)?.trim();

    if (!file) {
      return NextResponse.json({ error: "Se requiere un archivo de audio." }, { status: 400 });
    }
    if (!nombre) {
      return NextResponse.json({ error: "Se requiere un nombre para la pista." }, { status: 400 });
    }

    // Validate MIME type
    const mimeType = file.type || "audio/mpeg";
    if (!mimeType.startsWith("audio/")) {
      return NextResponse.json(
        { error: "Solo se aceptan archivos de audio (MP3, WAV, M4A, etc.)." },
        { status: 400 },
      );
    }

    // Validate file size (10MB limit)
    const maxBytes = MUSIC_MAX_SIZE_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: `El archivo es muy grande. El límite es ${MUSIC_MAX_SIZE_MB} MB.` },
        { status: 400 },
      );
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "El archivo de audio está vacío." }, { status: 400 });
    }

    // Optional fields
    const durationSeconds = formData.has("durationSeconds")
      ? Number(formData.get("durationSeconds")) || null
      : null;
    const referenceSku  = (formData.get("referenceSku")  as string | null) ?? null;
    const referenceName = (formData.get("referenceName") as string | null) ?? null;

    // Read buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await createMusicTrack({
      buffer,
      mimeType,
      sizeBytes:       buffer.byteLength,
      nombre,
      organizationId:  organization.id,
      uploadedBy:      user.name ?? user.id ?? "usuario",
      durationSeconds,
      referenceSku,
      referenceName,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.errorMessage ?? "No pudimos subir la pista." },
        { status: 500 },
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

// ── DELETE — remove music track ────────────────────────────────────────────────

export async function DELETE(
  req:    NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  try {
    const { membership, organization } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Acceso no autorizado" }, { status: 403 });
    }

    const trackId = new URL(req.url).searchParams.get("trackId");
    if (!trackId) {
      return NextResponse.json({ error: "Se requiere trackId." }, { status: 400 });
    }

    const deleted = await deleteMusicTrack(trackId, organization.id);
    if (!deleted) {
      return NextResponse.json({ error: "Pista no encontrada." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "UNAUTHENTICATED") return NextResponse.json({ error: message }, { status: 401 });
    if (message === "ACCESS_DENIED")   return NextResponse.json({ error: message }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
