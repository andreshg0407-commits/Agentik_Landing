/**
 * lib/marketing-studio/video-editor/render/video-render-worker.ts
 *
 * MARKETING-VIDEO-RENDER-WORKER-01 — Render Worker
 *
 * Picks up one pending render job per invocation (single-claim pattern).
 * Called by the cron endpoint at /api/cron/video-render.
 *
 * Pipeline per job:
 *   1. findNextPendingRenderJob()  — atomic claim (pending → processing)
 *   2. isFfmpegAvailable()        — bail early if render env not ready
 *   3. renderVideoWithFfmpeg()    — download + transcode to /tmp
 *   4. uploadRenderedVideo()      — push rendered MP4 to R2
 *   5. markVideoRenderCompleted() — update execution + fotoEstudioAsset
 *   6. cleanupRenderTempFile()    — delete /tmp output
 *
 * On any error:
 *   - markVideoRenderFailed() with user-facing Spanish message
 *   - cleanupRenderTempFile() (best-effort)
 *
 * Server-only — never import from client components.
 */

import "server-only";

import {
  isFfmpegAvailable,
  renderVideoWithFfmpeg,
  cleanupRenderTempFile,
}                            from "./ffmpeg-render-adapter";
import { uploadRenderedVideo } from "./video-storage-adapter";
import {
  findNextPendingRenderJob,
  findSubtitleSegmentsForJob,
  markVideoRenderCompleted,
  markVideoRenderFailed,
}                            from "./video-render-service";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface RenderWorkerResult {
  /** Whether a job was found and processed. */
  jobProcessed:    boolean;
  /** Execution ID of the processed job (null if no job found). */
  executionId:     string | null;
  /** Final status of the job. */
  status:          "completed" | "failed" | "no_job" | "ffmpeg_unavailable";
  /** User-facing message (Spanish). */
  message:         string;
  /** Rendered video URL (only set on success). */
  renderedUrl:     string | null;
}

// ── Worker ────────────────────────────────────────────────────────────────────

/**
 * Processes the next queued render job.
 *
 * Safe to call concurrently — the atomic claim step ensures only
 * one worker instance processes each job.
 *
 * Returns a result summary suitable for cron logging.
 */
export async function runVideoRenderWorker(): Promise<RenderWorkerResult> {
  // ── Step 1: Claim next pending job ──────────────────────────────────────────
  const job = await findNextPendingRenderJob();

  if (!job) {
    return {
      jobProcessed: false,
      executionId:  null,
      status:       "no_job",
      message:      "No hay videos pendientes de procesamiento.",
      renderedUrl:  null,
    };
  }

  const executionId = job.id;
  const tenantId    = job.organizationId;

  console.log(`[render-worker] Claimed job ${executionId} for tenant ${tenantId}`);

  // ── Step 2: Verify FFmpeg availability ───────────────────────────────────────
  const ffmpegOk = await isFfmpegAvailable();
  if (!ffmpegOk) {
    await markVideoRenderFailed(
      executionId,
      tenantId,
      "No pudimos procesar el video en este entorno. El motor de render no está disponible.",
    );
    return {
      jobProcessed: true,
      executionId,
      status:       "ffmpeg_unavailable",
      message:      "FFmpeg no disponible en el entorno de ejecución.",
      renderedUrl:  null,
    };
  }

  // ── Steps 3–6: Render + upload + complete ───────────────────────────────────
  let outputPath: string | null = null;

  try {
    // Step 2b: Resolve subtitle segments (if track linked)
    const subtitleSegments = await findSubtitleSegmentsForJob(job);
    if (subtitleSegments?.length) {
      console.log(`[render-worker] Subtitle segments: ${subtitleSegments.length} for job ${executionId}`);
    }

    // Step 3: Run FFmpeg
    const renderResult = await renderVideoWithFfmpeg({
      sourceUrl:           job.videoOriginalUrl,
      recorteInicio:       0,   // V1: no trim config stored — full video
      recorteFin:          null,
      jobId:               executionId,
      subtitleSegments:    subtitleSegments ?? null,
      musicTrackUrl:       job.musicaActiva ? (job.musicTrackUrl ?? null) : null,
      musicVolume:         job.musicVolumen,
      originalAudioVolume: job.audioOriginalVolumen,
      musicFadeIn:         job.musicaFadeIn,
      musicFadeOut:        job.musicaFadeOut,
    });

    outputPath = renderResult.outputPath;

    // Step 4: Upload to R2
    const uploadResult = await uploadRenderedVideo({
      localPath:   outputPath,
      tenantId,
      executionId,
    });

    // Determine final URL (R2 URL or fallback to original if R2 not configured)
    const renderedUrl = uploadResult?.url ?? job.videoOriginalUrl;

    // Step 5: Mark completed
    await markVideoRenderCompleted(executionId, tenantId, renderedUrl);

    console.log(`[render-worker] Job ${executionId} completed → ${renderedUrl}`);

    return {
      jobProcessed: true,
      executionId,
      status:       "completed",
      message:      `Video procesado correctamente. ${uploadResult ? "Subido a almacenamiento." : "Sin almacenamiento configurado."}`,
      renderedUrl,
    };

  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);

    // Classify error for user-facing message
    let userMessage: string;
    if (raw.startsWith("No pudimos") || raw.startsWith("El video") || raw.startsWith("El archivo")) {
      userMessage = raw;
    } else {
      console.error(`[render-worker] Job ${executionId} failed:`, raw.slice(0, 500));
      userMessage = "No pudimos procesar el video. Intenta exportarlo de nuevo.";
    }

    try {
      await markVideoRenderFailed(executionId, tenantId, userMessage);
    } catch {
      /* non-fatal */
    }

    return {
      jobProcessed: true,
      executionId,
      status:       "failed",
      message:      userMessage,
      renderedUrl:  null,
    };

  } finally {
    // Step 6: Always clean up temp file
    if (outputPath) {
      cleanupRenderTempFile(outputPath);
    }
  }
}
