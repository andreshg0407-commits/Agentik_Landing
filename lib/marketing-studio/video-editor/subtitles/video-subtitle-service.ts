/**
 * lib/marketing-studio/video-editor/subtitles/video-subtitle-service.ts
 *
 * MARKETING-VIDEO-SUBTITLES-01 — Subtitle Service
 * SERVER ONLY — @server-only
 *
 * Manages subtitle tracks as AgentExecution entries.
 * Segments persisted in metadataJson.segments.
 * No new DB model required.
 *
 * EXECUTION SHAPE:
 *   module:    "marketing_studio"
 *   operation: "VIDEO_SUBTITLE"
 *   metadataJson: {
 *     subtitleStatus, assetId, assetOriginalId,
 *     videoUrl, language, source, referenceSku, referenceName,
 *     segments: VideoSubtitleSegment[],
 *   }
 */

import "server-only";

import { prisma }           from "@/lib/prisma";
import {
  createExecution,
  updateExecutionStatus,
  completeExecution,
  failExecution,
}                           from "@/lib/execution/execution-registry";
import {
  transcribeVideo,
  isTranscriptionAvailable,
}                           from "./video-subtitle-transcriber";
import type {
  VideoSubtitleRequest,
  VideoSubtitleResult,
  VideoSubtitleTrack,
  VideoSubtitleStatus,
  VideoSubtitleSegment,
}                           from "./video-subtitle-types";
import type { ExecutionStatus } from "@/lib/execution/execution-types";

// ── Internal helpers ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execDb = () => (prisma as any).agentExecution;

function toExecutionStatus(s: VideoSubtitleStatus): ExecutionStatus {
  switch (s) {
    case "pending":    return "pending";
    case "processing": return "executing";
    case "ready":      return "completed";
    case "failed":     return "failed";
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function trackFromRow(row: any): VideoSubtitleTrack {
  const meta     = (row.metadataJson ?? {}) as Record<string, unknown>;
  const rawStatus = (meta.subtitleStatus as VideoSubtitleStatus | undefined) ?? "pending";

  // Infer from execution status if not explicit
  let status: VideoSubtitleStatus = rawStatus;
  if (!meta.subtitleStatus) {
    switch (row.status) {
      case "executing":  status = "processing"; break;
      case "completed":  status = "ready";      break;
      case "failed":     status = "failed";     break;
      default:           status = "pending";
    }
  }

  return {
    id:              row.id,
    organizationId:  row.tenantId,
    assetId:         (meta.assetId         as string | null) ?? null,
    assetOriginalId: (meta.assetOriginalId as string | null) ?? null,
    videoUrl:        (meta.videoUrl        as string) ?? "",
    language:        (meta.language        as string) ?? "es",
    status,
    source:          (meta.source          as "auto" | "manual") ?? "auto",
    referenceSku:    (meta.referenceSku    as string | null) ?? null,
    referenceName:   (meta.referenceName   as string | null) ?? null,
    createdBy:       row.createdBy ?? "system",
    createdAt:       (row.createdAt as Date).toISOString(),
    updatedAt:       (row.updatedAt as Date).toISOString(),
    segments:        (meta.segments        as VideoSubtitleSegment[]) ?? [],
    errorMessage:    (row.errorMessage     as string | null) ?? null,
  };
}

async function persistMeta(
  executionId: string,
  patch:       Record<string, unknown>,
): Promise<void> {
  const row    = await execDb().findUnique({ where: { id: executionId }, select: { metadataJson: true } });
  const merged = { ...(row?.metadataJson ?? {}), ...patch };
  await execDb().update({ where: { id: executionId }, data: { metadataJson: merged } });
}

// ── createSubtitleTrack ────────────────────────────────────────────────────────

/**
 * Creates a subtitle track, runs transcription synchronously (V1),
 * and returns the completed or failed track.
 *
 * For production at scale, the transcription step should be offloaded
 * to a worker (VIDEO-SUBTITLES-02). In V1 we run it inline because
 * Whisper calls are typically fast (< 30s for short social videos).
 */
export async function createSubtitleTrack(
  req:      VideoSubtitleRequest,
  tenantId: string,
): Promise<VideoSubtitleResult> {
  if (!tenantId)        return { success: false, track: null, errorMessage: "Identificación de organización requerida." };
  if (!req.videoUrl)    return { success: false, track: null, errorMessage: "URL del video requerida." };
  if (!req.language)    return { success: false, track: null, errorMessage: "Idioma requerido." };

  // Register execution
  const exec = await createExecution({
    tenantId,
    module:    "marketing_studio",
    provider:  "video_subtitle",
    operation: "VIDEO_SUBTITLE",
    intent:    `Generar subtítulos ${req.language.toUpperCase()} para video`,
    createdBy: req.createdBy,
    metadata: {
      subtitleStatus:  "pending" as VideoSubtitleStatus,
      assetId:         req.assetId,
      assetOriginalId: req.assetOriginalId,
      videoUrl:        req.videoUrl,
      language:        req.language,
      source:          "auto",
      referenceSku:    req.referenceSku,
      referenceName:   req.referenceName,
      segments:        [] as VideoSubtitleSegment[],
    },
  });

  if (!exec) {
    return { success: false, track: null, errorMessage: "No pudimos registrar la solicitud. Intenta de nuevo." };
  }

  const executionId = exec.id;

  // Transition to processing
  try {
    await updateExecutionStatus(executionId, tenantId, "executing");
    await persistMeta(executionId, { subtitleStatus: "processing" as VideoSubtitleStatus });
  } catch { /* non-fatal */ }

  // Run transcription
  if (!isTranscriptionAvailable()) {
    await failExecution(executionId, tenantId, {
      errorCode:    "CONFIGURATION_MISSING",
      errorMessage: "No pudimos generar subtítulos en este entorno.",
      metadata:     { subtitleStatus: "failed" as VideoSubtitleStatus },
    });
    const failedTrack = await getSubtitleTrack(executionId, tenantId);
    return {
      success:      false,
      track:        failedTrack,
      errorMessage: "No pudimos generar subtítulos en este entorno.",
    };
  }

  try {
    const { segments } = await transcribeVideo({
      videoUrl: req.videoUrl,
      language: req.language,
      jobId:    executionId,
    });

    await completeExecution(executionId, tenantId, {
      summary:  `Subtítulos generados — ${segments.length} segmento(s) · ${req.language.toUpperCase()}`,
      metadata: {
        subtitleStatus: "ready" as VideoSubtitleStatus,
        segments,
      },
    });

    const completedTrack = await getSubtitleTrack(executionId, tenantId);
    return { success: true, track: completedTrack, errorMessage: null };

  } catch (err) {
    const raw = err instanceof Error ? err.message : "unknown";
    const userMessage = raw.startsWith("No pudimos") || raw.startsWith("El video")
      ? raw
      : "No pudimos generar subtítulos. Intenta de nuevo o contacta soporte.";

    await failExecution(executionId, tenantId, {
      errorCode:    "PROVIDER_API_ERROR",
      errorMessage: userMessage,
      metadata:     { subtitleStatus: "failed" as VideoSubtitleStatus },
    });

    const failedTrack = await getSubtitleTrack(executionId, tenantId);
    return { success: false, track: failedTrack, errorMessage: userMessage };
  }
}

// ── getSubtitleTrack ───────────────────────────────────────────────────────────

/**
 * Fetch a subtitle track by its execution ID, scoped to the tenant.
 * Returns null if not found.
 */
export async function getSubtitleTrack(
  executionId: string,
  tenantId:    string,
): Promise<VideoSubtitleTrack | null> {
  if (!executionId || !tenantId) return null;
  try {
    const row = await execDb().findFirst({
      where: { id: executionId, tenantId, module: "marketing_studio", operation: "VIDEO_SUBTITLE" },
    });
    return row ? trackFromRow(row) : null;
  } catch {
    return null;
  }
}

// ── listSubtitleTracks ─────────────────────────────────────────────────────────

/**
 * List subtitle tracks for a tenant, optionally filtered by assetId.
 * Returns most recent first.
 */
export async function listSubtitleTracks(
  tenantId: string,
  opts:     { assetId?: string; limit?: number } = {},
): Promise<VideoSubtitleTrack[]> {
  if (!tenantId) return [];
  try {
    const rows = await execDb().findMany({
      where:   { tenantId, module: "marketing_studio", operation: "VIDEO_SUBTITLE" },
      orderBy: { createdAt: "desc" },
      take:    opts.limit ?? 10,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let filtered = rows as any[];
    if (opts.assetId) {
      filtered = filtered.filter((r: any) => {
        const meta = (r.metadataJson ?? {}) as Record<string, unknown>;
        return meta.assetId === opts.assetId || meta.assetOriginalId === opts.assetId;
      });
    }
    return filtered.map(trackFromRow);
  } catch {
    return [];
  }
}

// ── updateSubtitleSegments ─────────────────────────────────────────────────────

/**
 * Persist user-edited subtitle segments.
 * Marks each provided segment as edited=true.
 */
export async function updateSubtitleSegments(
  executionId: string,
  tenantId:    string,
  segments:    VideoSubtitleSegment[],
): Promise<VideoSubtitleTrack | null> {
  if (!executionId || !tenantId) return null;

  const sanitized: VideoSubtitleSegment[] = segments.map(s => ({
    start:      Math.max(0, s.start),
    end:        Math.max(0, s.end),
    text:       String(s.text ?? "").slice(0, 500).trim(),
    confidence: s.confidence ?? null,
    edited:     true,
  }));

  try {
    await persistMeta(executionId, { segments: sanitized });
  } catch {
    return null;
  }

  return getSubtitleTrack(executionId, tenantId);
}

// ── Status helpers ─────────────────────────────────────────────────────────────

export async function markSubtitleProcessing(id: string, tenantId: string): Promise<void> {
  await updateExecutionStatus(id, tenantId, "executing");
  try { await persistMeta(id, { subtitleStatus: "processing" as VideoSubtitleStatus }); } catch { /* non-fatal */ }
}

export async function markSubtitleReady(
  id:       string,
  tenantId: string,
  segments: VideoSubtitleSegment[],
): Promise<void> {
  await completeExecution(id, tenantId, {
    summary:  `Subtítulos listos — ${segments.length} segmento(s)`,
    metadata: { subtitleStatus: "ready" as VideoSubtitleStatus, segments },
  });
}

export async function markSubtitleFailed(
  id:       string,
  tenantId: string,
  message:  string,
): Promise<void> {
  await failExecution(id, tenantId, {
    errorCode:    "PROVIDER_API_ERROR",
    errorMessage: message,
    metadata:     { subtitleStatus: "failed" as VideoSubtitleStatus },
  });
}
