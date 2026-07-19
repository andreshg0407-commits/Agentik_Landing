/**
 * lib/marketing-studio/video-editor/music/video-music-service.ts
 *
 * MARKETING-VIDEO-MUSIC-01 — Music Service
 *
 * CRUD for tenant music tracks.
 * Music tracks are stored as fotoEstudioAsset rows:
 *   assetType:    "music_track"
 *   nombre:       display name
 *   assetUrl:     R2 public URL (or null in dev)
 *   metadataJson: { durationSeconds, mimeType, sizeBytes, uploadedBy, source }
 *
 * Server-only — never import from client components.
 */

import "server-only";

import { prisma }                    from "@/lib/prisma";
import { uploadMusicTrackToR2 }      from "./video-music-storage";
import type { MusicTrack, MusicUploadResult } from "./video-music-types";

// ── DB helper ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => (prisma as any).fotoEstudioAsset;

// ── Row → MusicTrack ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToTrack(row: any): MusicTrack {
  const meta = (row.metadataJson ?? {}) as Record<string, unknown>;
  return {
    id:              row.id,
    organizationId:  row.organizationId,
    nombre:          row.nombre ?? "Pista de música",
    assetUrl:        row.assetUrl ?? null,
    durationSeconds: (meta.durationSeconds as number | null) ?? null,
    mimeType:        (meta.mimeType as string) ?? "audio/mpeg",
    sizeBytes:       (meta.sizeBytes  as number) ?? 0,
    uploadedAt:      row.createdAt instanceof Date
                       ? row.createdAt.toISOString()
                       : String(row.createdAt),
    uploadedBy:      (meta.uploadedBy as string) ?? "usuario",
    referenceSku:    (meta.referenceSku  as string | null) ?? null,
    referenceName:   (meta.referenceName as string | null) ?? null,
    status:          (meta.status as "ready" | "processing" | "failed") ?? "ready",
  };
}

// ── createMusicTrack ──────────────────────────────────────────────────────────

export interface MusicCreateInput {
  buffer:          Buffer;
  mimeType:        string;
  sizeBytes:       number;
  nombre:          string;
  organizationId:  string;
  uploadedBy:      string;
  durationSeconds: number | null;
  referenceSku:    string | null;
  referenceName:   string | null;
}

/**
 * Uploads an audio file to R2 and registers a music track in Biblioteca.
 * In dev/no-R2 mode, assetUrl is set to null and the track is still registered.
 */
export async function createMusicTrack(
  input: MusicCreateInput,
): Promise<MusicUploadResult> {
  try {
    // Create the DB row first to get a stable ID for the R2 key.
    const row = await db().create({
      data: {
        organizationId: input.organizationId,
        nombre:         input.nombre.slice(0, 120),
        assetType:      "music_track",
        assetUrl:       null,        // updated below after R2 upload
        status:         "approved",  // tracks are immediately available
        metadataJson: {
          durationSeconds: input.durationSeconds,
          mimeType:        input.mimeType,
          sizeBytes:       input.sizeBytes,
          uploadedBy:      input.uploadedBy,
          referenceSku:    input.referenceSku,
          referenceName:   input.referenceName,
          source:          "upload",
          status:          "ready",
        },
      },
    });

    // Upload to R2 (null if R2 not configured).
    const uploaded = await uploadMusicTrackToR2({
      buffer:   input.buffer,
      mimeType: input.mimeType,
      tenantId: input.organizationId,
      trackId:  row.id,
    });

    // Update assetUrl if R2 upload succeeded.
    const finalRow = uploaded
      ? await db().update({
          where: { id: row.id },
          data:  { assetUrl: uploaded.url },
        })
      : row;

    return { success: true, track: rowToTrack(finalRow) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al subir la pista.";
    return { success: false, errorMessage: message };
  }
}

// ── getMusicTrack ─────────────────────────────────────────────────────────────

/** Fetch a single music track by ID, scoped to the tenant. */
export async function getMusicTrack(
  id:       string,
  tenantId: string,
): Promise<MusicTrack | null> {
  try {
    const row = await db().findFirst({
      where: { id, organizationId: tenantId, assetType: "music_track" },
    });
    return row ? rowToTrack(row) : null;
  } catch {
    return null;
  }
}

// ── listMusicTracks ───────────────────────────────────────────────────────────

export interface MusicListOptions {
  limit?:        number;
  referenceSku?: string;
}

/**
 * Lists music tracks for the tenant, newest first.
 * Optionally filtered by referenceSku for Copilot suggestions.
 */
export async function listMusicTracks(
  tenantId: string,
  opts:     MusicListOptions = {},
): Promise<MusicTrack[]> {
  try {
    const limit = Math.min(opts.limit ?? 30, 50);
    const rows  = await db().findMany({
      where: {
        organizationId: tenantId,
        assetType:      "music_track",
      },
      orderBy: { createdAt: "desc" },
      take:    limit,
    });

    const tracks = (rows as unknown[]).map(r => rowToTrack(r));

    // If referenceSku filter, apply client-side (metadata is JSON, no DB index).
    if (opts.referenceSku) {
      const sku = opts.referenceSku;
      return tracks.filter(t => t.referenceSku === sku);
    }

    return tracks;
  } catch {
    return [];
  }
}

// ── deleteMusicTrack ──────────────────────────────────────────────────────────

/**
 * Hard-deletes a music track from the DB.
 * R2 file is NOT deleted (requires separate cleanup job or lifecycle rule).
 * Returns true if the row existed and was deleted.
 */
export async function deleteMusicTrack(
  id:       string,
  tenantId: string,
): Promise<boolean> {
  try {
    const existing = await db().findFirst({
      where:  { id, organizationId: tenantId, assetType: "music_track" },
      select: { id: true },
    });
    if (!existing) return false;

    await db().delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

// ── resolveMusicTrackUrl ──────────────────────────────────────────────────────

/**
 * Returns the public assetUrl for a music track.
 * Used by the render worker to download the audio for FFmpeg mixing.
 * Returns null if the track doesn't exist, belongs to a different tenant,
 * or has no URL (dev mode).
 */
export async function resolveMusicTrackUrl(
  trackId:  string,
  tenantId: string,
): Promise<string | null> {
  const track = await getMusicTrack(trackId, tenantId);
  return track?.assetUrl ?? null;
}
