/**
 * lib/marketing-studio/video-editor/render/video-render-service.ts
 *
 * MARKETING-VIDEO-RENDER-FOUNDATION-01 — Render Service
 * SERVER ONLY — @server-only
 *
 * Native Agentik video render layer.
 * Manages the lifecycle of render jobs: creation, status transitions, and queries.
 *
 * INTEGRATION POINTS:
 *   - AgentExecution (execution-registry): every render job is an execution entry.
 *   - exportVideoToLibrary: creates the Biblioteca asset with pendingRender=true.
 *
 * V1 SCOPE:
 *   createVideoRenderJob() registers the intent and creates a Biblioteca entry.
 *   No actual video processing happens in this sprint.
 *   Worker pickup is planned for VIDEO-RENDER-02.
 *
 * STATUS MAPPING (VideoRenderStatus → ExecutionStatus):
 *   pending    → "pending"
 *   queued     → "pending"    (same — no separate queued state in execution registry)
 *   processing → "executing"
 *   completed  → "completed"
 *   failed     → "failed"
 *   cancelled  → "cancelled"
 */

import "server-only";

import { prisma }              from "@/lib/prisma";
import {
  createExecution,
  updateExecutionStatus,
  completeExecution,
  failExecution,
}                              from "@/lib/execution/execution-registry";
import { exportVideoToLibrary } from "../video-editor-service";
import { DESTINO_TO_FORMATO }   from "../video-editor-types";
import type {
  VideoRenderRequest,
  VideoRenderJob,
  VideoRenderResult,
  VideoRenderStatus,
} from "./video-render-types";
import type { VideoSubtitleSegment }  from "../subtitles/video-subtitle-types";
import { resolveMusicTrackUrl }       from "../music/video-music-service";

// ── Internal helpers ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fotoEstudioDb = () => (prisma as any).fotoEstudioAsset;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execDb = () => (prisma as any).agentExecution;

/** Map VideoRenderStatus to the execution-registry's ExecutionStatus string. */
function toExecutionStatus(renderStatus: VideoRenderStatus): string {
  switch (renderStatus) {
    case "pending":    return "pending";
    case "queued":     return "pending";
    case "processing": return "executing";
    case "completed":  return "completed";
    case "failed":     return "failed";
    case "cancelled":  return "cancelled";
  }
}

/** Map an AgentExecution row to VideoRenderStatus. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderStatusFromExecution(row: any): VideoRenderStatus {
  const meta = (row.metadataJson ?? {}) as Record<string, unknown>;
  // If the row carries an explicit renderStatus in metadata, use it.
  const explicit = meta.renderStatus as VideoRenderStatus | undefined;
  if (explicit) return explicit;

  // Otherwise infer from execution status.
  switch (row.status) {
    case "executing":  return "processing";
    case "completed":  return "completed";
    case "failed":     return "failed";
    case "cancelled":  return "cancelled";
    default:           return "queued";
  }
}

/** Build a VideoRenderJob from an AgentExecution row. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function jobFromExecutionRow(row: any): VideoRenderJob {
  const meta = (row.metadataJson ?? {}) as Record<string, unknown>;
  const destino  = (meta.destino  as string ?? "reel_tiktok") as VideoRenderJob["destino"];
  const formato  = (meta.formato  as string ?? DESTINO_TO_FORMATO[destino]) as VideoRenderJob["formato"];

  return {
    id:               row.id,
    assetId:          (meta.assetId          as string | null) ?? null,
    status:           renderStatusFromExecution(row),
    organizationId:   row.tenantId,
    assetPadreId:     (meta.assetPadreId     as string | null) ?? null,
    assetOriginalId:  (meta.assetOriginalId  as string | null) ?? null,
    videoOriginalUrl: (meta.videoOriginalUrl as string)        ?? "",
    versionName:      (meta.versionName      as string)        ?? "",
    destino,
    formato,
    subtitulosActivos:    (meta.subtitulosActivos    as boolean) ?? false,
    subtitleTrackId:      (meta.subtitleTrackId      as string | null) ?? null,
    musicaActiva:         (meta.musicaActiva          as boolean) ?? false,
    musicTrackId:         (meta.musicTrackId          as string | null) ?? null,
    musicTrackUrl:        (meta.musicTrackUrl         as string | null) ?? null,
    musicVolumen:         (meta.musicVolumen          as number) ?? 80,
    audioOriginalVolumen: (meta.audioOriginalVolumen  as number) ?? 100,
    musicaFadeIn:         (meta.musicaFadeIn          as number) ?? 0,
    musicaFadeOut:        (meta.musicaFadeOut         as number) ?? 0,
    textoActivo:          (meta.textoActivo           as boolean) ?? false,
    logoActivo:        (meta.logoActivo         as boolean) ?? false,
    referenceSku:      (meta.referenceSku   as string | null) ?? null,
    referenceName:     (meta.referenceName  as string | null) ?? null,
    pendingRender:     (meta.pendingRender   as boolean) ?? true,
    createdAt:         (row.createdAt as Date).toISOString(),
    completedAt:       row.completedAt ? (row.completedAt as Date).toISOString() : null,
    errorMessage:      (row.errorMessage as string | null) ?? null,
  };
}

// ── findSubtitleSegmentsForJob ─────────────────────────────────────────────────

/**
 * Resolves subtitle segments for a render job.
 * Fetches the linked subtitle track (by subtitleTrackId in metadata) and
 * returns its segments. Returns null if no track or track not ready.
 */
export async function findSubtitleSegmentsForJob(
  job: VideoRenderJob,
): Promise<VideoSubtitleSegment[] | null> {
  const trackId = job.subtitleTrackId;
  if (!trackId || !job.subtitulosActivos) return null;

  try {
    const row = await execDb().findFirst({
      where: {
        id:        trackId,
        tenantId:  job.organizationId,
        module:    "marketing_studio",
        operation: "VIDEO_SUBTITLE",
      },
      select: { metadataJson: true },
    });

    if (!row) return null;
    const meta     = (row.metadataJson ?? {}) as Record<string, unknown>;
    const segments = meta.segments as VideoSubtitleSegment[] | undefined;
    if (!segments?.length) return null;
    return segments;
  } catch {
    return null;
  }
}

// ── findNextPendingRenderJob ───────────────────────────────────────────────────

/**
 * Atomically claims the oldest pending VIDEO_RENDER execution for processing.
 *
 * Uses an updateMany + count check to avoid a TOCTOU race where two workers
 * could both see the same pending job:
 *   1. updateMany: status pending → executing, WHERE id = oldest pending row
 *   2. If count === 0, another worker already claimed it — return null.
 *   3. Otherwise return the job shape.
 *
 * Returns null when no pending jobs exist.
 */
export async function findNextPendingRenderJob(): Promise<VideoRenderJob | null> {
  try {
    // Find the oldest unclaimed pending job.
    const candidate = await execDb().findFirst({
      where: {
        module:    "marketing_studio",
        operation: "VIDEO_RENDER",
        status:    "pending",
      },
      orderBy: { createdAt: "asc" },
      select:  { id: true, tenantId: true },
    });

    if (!candidate) return null;

    // Atomic claim: update only if still pending.
    const claimed = await execDb().updateMany({
      where: {
        id:     candidate.id,
        status: "pending",  // guard — another worker may have taken it
      },
      data: {
        status:    "executing",
        startedAt: new Date(),
      },
    });

    if (claimed.count === 0) {
      // Race condition — another worker got it first.
      return null;
    }

    // Update renderStatus in metadata to "processing".
    try {
      const existing = await execDb().findUnique({
        where:  { id: candidate.id },
        select: { metadataJson: true },
      });
      const merged = { ...(existing?.metadataJson ?? {}), renderStatus: "processing" as VideoRenderStatus };
      await execDb().update({ where: { id: candidate.id }, data: { metadataJson: merged } });
    } catch { /* non-fatal */ }

    return getVideoRenderJob(candidate.id, candidate.tenantId);
  } catch {
    return null;
  }
}

// ── createVideoRenderJob ───────────────────────────────────────────────────────

/**
 * Register a new video render job.
 *
 * Steps:
 *   1. Validate organizationId and required fields.
 *   2. If assetPadreId provided, confirm the source asset belongs to this org.
 *   3. Register an AgentExecution (module: marketing_studio, op: VIDEO_RENDER).
 *   4. Create a Biblioteca asset entry via exportVideoToLibrary (pendingRender=true).
 *   5. Persist assetId back into execution metadata.
 *   6. Return VideoRenderJob with status "queued".
 *
 * Never throws — returns errorMessage on failure.
 */
export async function createVideoRenderJob(
  req:      VideoRenderRequest,
  tenantId: string,
): Promise<VideoRenderResult> {
  if (!tenantId) {
    return { success: false, job: null, executionId: null, errorMessage: "Identificación de organización requerida." };
  }
  if (!req.videoOriginalUrl) {
    return { success: false, job: null, executionId: null, errorMessage: "URL del video original requerida." };
  }
  if (!req.versionName) {
    return { success: false, job: null, executionId: null, errorMessage: "Nombre de versión requerido." };
  }

  const destino = req.config.destino;
  const formato = req.config.formato ?? DESTINO_TO_FORMATO[destino];

  try {
    // Step 2: Validate source asset belongs to this org.
    if (req.assetPadreId) {
      const sourceAsset = await fotoEstudioDb().findFirst({
        where:  { id: req.assetPadreId, organizationId: req.organizationId },
        select: { id: true },
      });
      if (!sourceAsset) {
        return {
          success:      false,
          job:          null,
          executionId:  null,
          errorMessage: "El video original no fue encontrado en Biblioteca.",
        };
      }
    }

    // Step 2b: Resolve music track URL (server-side — tenant-scoped).
    let musicTrackUrl: string | null = null;
    if (req.config.musica.activa && req.config.musica.trackId) {
      musicTrackUrl = await resolveMusicTrackUrl(req.config.musica.trackId, tenantId);
    }

    // Step 3: Register AgentExecution.
    const exec = await createExecution({
      tenantId,
      module:    "marketing_studio",
      provider:  "video_editor",
      operation: "VIDEO_RENDER",
      intent:    `Exportar video "${req.versionName}" a Biblioteca · ${destino}`,
      createdBy: req.createdBy,
      metadata: {
        assetPadreId:          req.assetPadreId,
        assetOriginalId:       req.assetOriginalId,
        videoOriginalUrl:      req.videoOriginalUrl,
        versionName:           req.versionName,
        destino,
        formato,
        subtitulosActivos:     req.config.subtitulos.activos,
        subtitleTrackId:       req.config.subtitulos.subtitleTrackId ?? null,
        musicaActiva:          req.config.musica.activa,
        musicTrackId:          req.config.musica.trackId ?? null,
        musicTrackUrl,
        musicVolumen:          req.config.musica.volumen,
        audioOriginalVolumen:  req.config.musica.audioOriginalVolumen,
        musicaFadeIn:          req.config.musica.fadeIn,
        musicaFadeOut:         req.config.musica.fadeOut,
        textoActivo:           req.config.overlay.textoActivo,
        logoActivo:            req.config.overlay.logoActivo,
        referenceSku:          req.referenceSku,
        referenceName:         req.referenceName,
        pendingRender:         true,
        renderStatus:          "queued" as VideoRenderStatus,
      },
    });

    // Step 4: Create Biblioteca asset (pendingRender=true — no real render yet).
    const exportResult = await exportVideoToLibrary({
      organizationId:    req.organizationId,
      assetPadreId:      req.assetPadreId,
      assetOriginalId:   req.assetOriginalId,
      videoOriginalUrl:  req.videoOriginalUrl,
      versionName:       req.versionName,
      version:           1,
      origen:            "video_editor",
      destino,
      formato,
      duracion:          null,
      resolucion:        null,
      subtitulosActivos: req.config.subtitulos.activos,
      musicaActiva:      req.config.musica.activa,
      musicaTrackId:     req.config.musica.trackId,
      textoActivo:       req.config.overlay.textoActivo,
      logoActivo:        req.config.overlay.logoActivo,
      referenceSku:      req.referenceSku,
      referenceName:     req.referenceName,
      exportedAt:        new Date().toISOString(),
      creadoPor:         req.createdBy,
      pendingRender:     true,
    });

    if (!exportResult.success) {
      // Fail execution so the registry reflects the error.
      if (exec) {
        await failExecution(exec.id, tenantId, {
          errorCode:    "EXPORT_FAILED",
          errorMessage: exportResult.errorMessage ?? "Error al registrar versión en Biblioteca.",
          metadata:     { renderStatus: "failed" as VideoRenderStatus },
        });
      }
      return {
        success:      false,
        job:          null,
        executionId:  exec?.id ?? null,
        errorMessage: exportResult.errorMessage ?? "No pudimos exportar el video.",
      };
    }

    // Step 5: Persist assetId back into execution metadata.
    if (exec && exportResult.assetId) {
      try {
        const existing = await execDb().findUnique({ where: { id: exec.id }, select: { metadataJson: true } });
        const merged   = { ...(existing?.metadataJson ?? {}), assetId: exportResult.assetId };
        await execDb().update({ where: { id: exec.id }, data: { metadataJson: merged } });
      } catch {
        // Non-fatal — assetId can be recovered from Biblioteca
      }
    }

    // Step 6: Build and return job.
    const job: VideoRenderJob = {
      id:               exec?.id ?? `local_${Date.now()}`,
      assetId:          exportResult.assetId,
      status:           "queued",
      organizationId:   req.organizationId,
      assetPadreId:     req.assetPadreId,
      assetOriginalId:  req.assetOriginalId,
      videoOriginalUrl: req.videoOriginalUrl,
      versionName:      req.versionName,
      destino,
      formato,
      subtitulosActivos: req.config.subtitulos.activos,
      subtitleTrackId:   req.config.subtitulos.subtitleTrackId ?? null,
      musicaActiva:         req.config.musica.activa,
      musicTrackId:         req.config.musica.trackId,
      musicTrackUrl:        musicTrackUrl,
      musicVolumen:         req.config.musica.volumen,
      audioOriginalVolumen: req.config.musica.audioOriginalVolumen,
      musicaFadeIn:         req.config.musica.fadeIn,
      musicaFadeOut:        req.config.musica.fadeOut,
      textoActivo:          req.config.overlay.textoActivo,
      logoActivo:        req.config.overlay.logoActivo,
      referenceSku:      req.referenceSku,
      referenceName:     req.referenceName,
      pendingRender:     true,
      createdAt:         new Date().toISOString(),
      completedAt:       null,
      errorMessage:      null,
    };

    return { success: true, job, executionId: exec?.id ?? null, errorMessage: null };

  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return {
      success:      false,
      job:          null,
      executionId:  null,
      errorMessage: `No pudimos exportar el video. Intenta de nuevo.`,
    };
  }
}

// ── getVideoRenderJob ──────────────────────────────────────────────────────────

/**
 * Fetch a render job by its execution ID, scoped to the tenant.
 * Returns null if not found, wrong tenant, or wrong operation.
 */
export async function getVideoRenderJob(
  executionId: string,
  tenantId:    string,
): Promise<VideoRenderJob | null> {
  if (!executionId || !tenantId) return null;

  try {
    const row = await execDb().findFirst({
      where: {
        id:        executionId,
        tenantId,
        module:    "marketing_studio",
        operation: "VIDEO_RENDER",
      },
    });
    if (!row) return null;
    return jobFromExecutionRow(row);
  } catch {
    return null;
  }
}

// ── listVideoRenderJobs ────────────────────────────────────────────────────────

/**
 * List recent render jobs for a tenant.
 * Optionally filter by source assetId (searches metadata).
 */
export async function listVideoRenderJobs(
  tenantId: string,
  opts:     { assetId?: string; limit?: number } = {},
): Promise<VideoRenderJob[]> {
  if (!tenantId) return [];

  try {
    const rows = await execDb().findMany({
      where: {
        tenantId,
        module:    "marketing_studio",
        operation: "VIDEO_RENDER",
      },
      orderBy: { createdAt: "desc" },
      take:    opts.limit ?? 20,
    });

    // Filter by assetId in metadata if requested (no indexed JSON query).
    let filtered = rows as unknown[];
    if (opts.assetId) {
      filtered = (rows as any[]).filter((r: any) => {
        const meta = (r.metadataJson ?? {}) as Record<string, unknown>;
        return meta.assetPadreId === opts.assetId ||
               meta.assetId      === opts.assetId ||
               meta.assetOriginalId === opts.assetId;
      });
    }

    return (filtered as any[]).map(jobFromExecutionRow);
  } catch {
    return [];
  }
}

// ── Status transition helpers ──────────────────────────────────────────────────

/**
 * Mark a render job as queued (accepted, waiting for worker).
 */
export async function markVideoRenderQueued(
  executionId: string,
  tenantId:    string,
): Promise<VideoRenderJob | null> {
  await updateRenderStatus(executionId, tenantId, "queued");
  return getVideoRenderJob(executionId, tenantId);
}

/**
 * Mark a render job as processing (worker has started).
 */
export async function markVideoRenderProcessing(
  executionId: string,
  tenantId:    string,
): Promise<VideoRenderJob | null> {
  await updateRenderStatus(executionId, tenantId, "processing");
  return getVideoRenderJob(executionId, tenantId);
}

/**
 * Mark a render job as completed and record the rendered asset URL.
 *
 * Also updates the Biblioteca fotoEstudioAsset row:
 *   - assetUrl        ← renderedUrl  (permanent CDN URL)
 *   - metadataJson.pendingRender ← false
 *
 * This makes the video immediately playable from Biblioteca.
 */
export async function markVideoRenderCompleted(
  executionId:  string,
  tenantId:     string,
  renderedUrl:  string,
): Promise<VideoRenderJob | null> {
  if (!executionId || !tenantId) return null;

  try {
    await completeExecution(executionId, tenantId, {
      summary:  "Video renderizado correctamente — disponible en Biblioteca.",
      metadata: {
        renderStatus:  "completed" as VideoRenderStatus,
        renderedUrl,
        pendingRender: false,
      },
    });
  } catch {
    /* non-fatal */
  }

  // Persist the rendered URL back to the Biblioteca asset so it is playable.
  try {
    const execRow = await execDb().findUnique({
      where:  { id: executionId },
      select: { metadataJson: true },
    });
    const meta   = (execRow?.metadataJson ?? {}) as Record<string, unknown>;
    const assetId = meta.assetId as string | undefined;

    if (assetId) {
      // Read existing asset metadataJson to merge (avoid overwriting other fields).
      const assetRow = await fotoEstudioDb().findUnique({
        where:  { id: assetId },
        select: { metadataJson: true },
      });
      const assetMeta   = (assetRow?.metadataJson ?? {}) as Record<string, unknown>;
      const mergedMeta  = { ...assetMeta, pendingRender: false, renderedUrl };

      await fotoEstudioDb().update({
        where: { id: assetId },
        data: {
          assetUrl:     renderedUrl,
          metadataJson: mergedMeta,
        },
      });
    }
  } catch {
    /* non-fatal — asset URL can be read from execution metadata as fallback */
  }

  return getVideoRenderJob(executionId, tenantId);
}

/**
 * Mark a render job as failed with a user-facing error message.
 *
 * Also flags the Biblioteca asset so it can display an error state.
 */
export async function markVideoRenderFailed(
  executionId:  string,
  tenantId:     string,
  errorMessage: string,
): Promise<VideoRenderJob | null> {
  if (!executionId || !tenantId) return null;

  try {
    await failExecution(executionId, tenantId, {
      errorCode:    "RENDER_FAILED",
      errorMessage,
      metadata:     { renderStatus: "failed" as VideoRenderStatus },
    });
  } catch {
    /* non-fatal */
  }

  // Flag the asset so Biblioteca can show a render error state.
  try {
    const execRow = await execDb().findUnique({
      where:  { id: executionId },
      select: { metadataJson: true },
    });
    const meta    = (execRow?.metadataJson ?? {}) as Record<string, unknown>;
    const assetId = meta.assetId as string | undefined;

    if (assetId) {
      const assetRow  = await fotoEstudioDb().findUnique({
        where:  { id: assetId },
        select: { metadataJson: true },
      });
      const assetMeta  = (assetRow?.metadataJson ?? {}) as Record<string, unknown>;
      const mergedMeta = { ...assetMeta, pendingRender: false, renderFailed: true };
      await fotoEstudioDb().update({
        where: { id: assetId },
        data:  { metadataJson: mergedMeta },
      });
    }
  } catch {
    /* non-fatal */
  }

  return getVideoRenderJob(executionId, tenantId);
}

/**
 * Cancel a pending or queued render job.
 */
export async function cancelVideoRenderJob(
  executionId: string,
  tenantId:    string,
): Promise<VideoRenderJob | null> {
  await updateRenderStatus(executionId, tenantId, "cancelled");
  return getVideoRenderJob(executionId, tenantId);
}

// ── Internal ───────────────────────────────────────────────────────────────────

async function updateRenderStatus(
  executionId: string,
  tenantId:    string,
  renderStatus: VideoRenderStatus,
): Promise<void> {
  if (!executionId || !tenantId) return;

  try {
    // Update the AgentExecution status.
    await updateExecutionStatus(
      executionId,
      tenantId,
      toExecutionStatus(renderStatus) as import("@/lib/execution/execution-types").ExecutionStatus,
    );

    // Persist renderStatus in metadata for precise status reconstruction.
    const existing = await execDb().findUnique({
      where:  { id: executionId },
      select: { metadataJson: true },
    });
    const merged = { ...(existing?.metadataJson ?? {}), renderStatus };
    await execDb().update({ where: { id: executionId }, data: { metadataJson: merged } });
  } catch {
    /* non-fatal */
  }
}
