/**
 * lib/marketing-studio/video-editor/video-editor-service.ts
 *
 * MARKETING-VIDEO-EDITOR-01 / MARKETING-ASSET-HUB-01 — Video Editor Service
 * SERVER ONLY — @server-only
 *
 * Handles versioned export of edited videos to the Biblioteca.
 *
 * ASSET-HUB-01 VERSIONING RULES:
 *   - Never overwrite the original asset (assetPadreId preserved).
 *   - Always create a new FotoEstudioAsset entry as a derived version.
 *   - Version number auto-incremented by counting existing derived versions.
 *   - Full trazabilidad metadata stored in metadataJson.
 *
 * V1 ARCHITECTURE:
 *   assetUrl = original video URL until real render produces derived output.
 *   pendingRender: true flags V1 exports for VIDEO-EDITOR-02 pickup.
 *
 * RENDER INTEGRATION POINT (VIDEO-EDITOR-02):
 *   1. Upload source video to R2/S3 if not already stored.
 *   2. Dispatch render job (FFmpeg / external service) with config payload.
 *   3. Await rendered URL → replace assetUrl, set pendingRender=false.
 */

import "server-only";

import { prisma }                    from "@/lib/prisma";
import type {
  VideoExportPayload,
  VideoExportResult,
  VideoVersionEntry,
  VideoDestino,
  VideoFormato,
} from "./video-editor-types";
import { DESTINO_TO_FORMATO }        from "./video-editor-types";

// ── Export to Biblioteca ───────────────────────────────────────────────────────

/**
 * Exports an edited video to the Biblioteca as a new versioned asset.
 * Never overwrites the original. Always creates a derived version entry.
 *
 * @returns VideoExportResult — never throws.
 */
export async function exportVideoToLibrary(
  payload: VideoExportPayload,
): Promise<VideoExportResult> {
  try {
    // Step 1: Determine version number
    // Count existing derived versions for the same source asset (or new source)
    let version = payload.version;
    if (payload.assetPadreId) {
      const existingVersions = await (prisma as any).fotoEstudioAsset.count({
        where: {
          organizationId: payload.organizationId,
          metadataJson:   { path: ["assetPadreId"], equals: payload.assetPadreId },
        },
      });
      // v2, v3... (parent is v1)
      version = Math.max(version, existingVersions + 2);
    }

    // Step 2: Create an editing session record
    const session = await (prisma as any).fotoEstudioSession.create({
      data: {
        organizationId: payload.organizationId,
        productSku:     payload.referenceSku ?? null,
        sessionType:    "video_edit",
        status:         "completed",
        metadataJson: {
          assetPadreId:    payload.assetPadreId,
          assetOriginalId: payload.assetOriginalId,
          versionName:     payload.versionName,
          version,
          origen:          payload.origen,
          destino:         payload.destino,
          formato:         payload.formato,
          duracion:        payload.duracion,
          resolucion:      payload.resolucion,
          // edit config
          subtitulosActivos: payload.subtitulosActivos,
          musicaActiva:      payload.musicaActiva,
          musicaTrackId:     payload.musicaTrackId,
          textoActivo:       payload.textoActivo,
          logoActivo:        payload.logoActivo,
          // commercial reference
          referenceSku:    payload.referenceSku,
          referenceName:   payload.referenceName,
          // audit
          exportedAt:      payload.exportedAt,
          creadoPor:       payload.creadoPor,
          source:          "video_editor",
        },
      },
    });

    // Step 3: Create a new Biblioteca asset (NEVER overwrites original)
    const asset = await (prisma as any).fotoEstudioAsset.create({
      data: {
        sessionId:      session.id,
        organizationId: payload.organizationId,
        // V1: original URL used until render produces derived output
        assetUrl:       payload.videoOriginalUrl,
        assetType:      "short_video",
        status:         "approved",
        metadataJson: {
          assetPadreId:    payload.assetPadreId,
          assetOriginalId: payload.assetOriginalId,
          versionName:     payload.versionName,
          version,
          origen:          payload.origen,
          destino:         payload.destino,
          formato:         payload.formato,
          duracion:        payload.duracion,
          resolucion:      payload.resolucion,
          // edit config
          subtitulosActivos: payload.subtitulosActivos,
          musicaActiva:      payload.musicaActiva,
          musicaTrackId:     payload.musicaTrackId,
          textoActivo:       payload.textoActivo,
          logoActivo:        payload.logoActivo,
          // commercial reference
          referenceSku:    payload.referenceSku,
          referenceName:   payload.referenceName,
          // audit
          creadoPor:       payload.creadoPor,
          videoEditorV1:   true,
          // VIDEO-EDITOR-02: set false once render produces derived URL
          pendingRender:   payload.pendingRender,
        },
      },
    });

    return {
      success:      true,
      assetId:      asset.id,
      assetUrl:     asset.assetUrl,
      version,
      errorMessage: null,
    };
  } catch (err) {
    return {
      success:      false,
      assetId:      null,
      assetUrl:     null,
      version:      null,
      errorMessage: err instanceof Error ? err.message : "Error al registrar en Biblioteca",
    };
  }
}

// ── Version history ────────────────────────────────────────────────────────────

/**
 * Lists versioned exports for a given source asset.
 * Returns all derived versions ordered newest first.
 */
export async function listVideoVersions(
  organizationId: string,
  assetPadreId?:  string,
): Promise<VideoVersionEntry[]> {
  try {
    const where: Record<string, unknown> = {
      organizationId,
      assetType: "short_video",
    };

    const assets = await (prisma as any).fotoEstudioAsset.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take:    20,
      include: { session: true },
    });

    return assets
      .filter((a: any) => {
        const meta = a.metadataJson as Record<string, unknown> | null;
        if (!meta?.videoEditorV1) return false;
        if (assetPadreId && meta.assetPadreId !== assetPadreId) return false;
        return true;
      })
      .map((a: any): VideoVersionEntry => {
        const meta = (a.metadataJson ?? {}) as Record<string, unknown>;
        return {
          id:          a.id,
          versionName: (meta.versionName as string | undefined) ?? "Versión sin nombre",
          version:     typeof meta.version === "number" ? meta.version : 1,
          destino:     (meta.destino as VideoDestino | undefined) ?? "reel_tiktok",
          formato:     (meta.formato as VideoFormato | undefined) ?? "9:16",
          exportedAt:  a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
          assetUrl:    a.assetUrl ?? null,
          creadoPor:   (meta.creadoPor as string | undefined) ?? "—",
        };
      });
  } catch {
    return [];
  }
}
