/**
 * lib/marketing-studio/video-editor/render/video-render-types.ts
 *
 * MARKETING-VIDEO-RENDER-FOUNDATION-01 — Render Contract
 *
 * Formal domain types for the Agentik video render system.
 * Server and client safe — no server-only imports.
 *
 * ARCHITECTURE:
 *   Editor de Video
 *     → VideoRenderRequest
 *     → createVideoRenderJob()
 *     → VideoRenderJob (status: queued)
 *     → AgentExecution registered
 *     → worker picks up (VIDEO-RENDER-02)
 *     → VideoRenderJob (status: completed)
 *     → Biblioteca asset updated (pendingRender: false)
 *
 * V1 NOTE:
 *   No real video processing in this sprint.
 *   The render job is registered and the library asset is created with
 *   pendingRender=true. A future worker sprint handles actual FFmpeg processing.
 */

import type { VideoDestino, VideoFormato } from "../video-editor-types";

// ── Render status ──────────────────────────────────────────────────────────────

/** Lifecycle status of a render job (distinct from AgentExecution status). */
export type VideoRenderStatus =
  | "pending"     // registered, not yet picked up
  | "queued"      // accepted in system, waiting for worker
  | "processing"  // worker is actively rendering
  | "completed"   // render finished — assetUrl updated in Biblioteca
  | "failed"      // render failed — errorMessage populated
  | "cancelled";  // cancelled before processing

// ── Subtitle config ────────────────────────────────────────────────────────────

export interface VideoSubtitleConfig {
  /** Whether subtitles are requested. */
  activos:        boolean;
  /** Manual subtitle text (overrides auto when non-empty). */
  texto:          string;
  /** Subtitle track ID to burn into render (null = use manual text or none). */
  subtitleTrackId?: string | null;
}

// ── Music config ───────────────────────────────────────────────────────────────

export interface VideoMusicConfig {
  /** Whether background music is requested. */
  activa:               boolean;
  /** ID of selected music track from Biblioteca (null = none). */
  trackId:              string | null;
  /** Music volume 0–100. */
  volumen:              number;
  /** Original video audio volume 0–100 (100 = unchanged). */
  audioOriginalVolumen: number;
  /** Fade-in duration in seconds (0 = no fade). */
  fadeIn:               number;
  /** Fade-out duration in seconds (0 = no fade). */
  fadeOut:              number;
  /**
   * Resolved public URL of the music track audio file.
   * Populated by the render service before queueing — never from client.
   */
  musicTrackUrl:        string | null;
}

// ── Overlay config ─────────────────────────────────────────────────────────────

export interface VideoOverlayConfig {
  /** Whether text overlay is requested. */
  textoActivo:  boolean;
  /** Text overlay content. */
  textoContent: string;
  /** Whether logo/watermark is requested. */
  logoActivo:   boolean;
  /** URL of the logo/watermark image (null if none). */
  logoUrl:      string | null;
}

// ── Render config ──────────────────────────────────────────────────────────────

/** Full render configuration — all edits that the worker must apply. */
export interface VideoRenderConfig {
  /** Export destination (drives aspect ratio and platform targeting). */
  destino:       VideoDestino;
  /** Internal aspect ratio derived from destino. */
  formato:       VideoFormato;
  /** Trim start in seconds. */
  recorteInicio: number;
  /** Trim end in seconds (null = until end). */
  recorteFin:    number | null;
  subtitulos:    VideoSubtitleConfig;
  musica:        VideoMusicConfig;
  overlay:       VideoOverlayConfig;
}

// ── Render track ───────────────────────────────────────────────────────────────

/** A single processing track in the render composition. */
export interface VideoRenderTrack {
  /** Track type within the composition. */
  type:    "source" | "subtitle" | "music" | "overlay";
  /** Whether this track is active for this render. */
  enabled: boolean;
  /** Track-specific config parameters (safe, no secrets). */
  config:  Record<string, unknown>;
}

// ── Render request ─────────────────────────────────────────────────────────────

/**
 * Input to createVideoRenderJob().
 * organizationId and createdBy always come from server session — never from client payload.
 */
export interface VideoRenderRequest {
  /** Tenant ID — from server session. */
  organizationId:   string;
  /** User display name or ID — from server session. */
  createdBy:        string;
  /** ID of the source asset in Biblioteca (null if uploaded directly). */
  assetPadreId:     string | null;
  /** ID of the original ancestor in the version chain. */
  assetOriginalId:  string | null;
  /** URL of the source video to be rendered. */
  videoOriginalUrl: string;
  /** Human name for this export (shown in Biblioteca). */
  versionName:      string;
  /** Full render configuration. */
  config:           VideoRenderConfig;
  /** Product SKU linked to this asset (for trazabilidad). */
  referenceSku:     string | null;
  /** Commercial product name (for trazabilidad). */
  referenceName:    string | null;
}

// ── Render job ─────────────────────────────────────────────────────────────────

/**
 * A render job as returned by the service and API.
 * Serializable — safe to return from server actions and API routes.
 *
 * id = AgentExecution.id (links render to the global execution registry).
 */
export interface VideoRenderJob {
  /** AgentExecution ID — links this render to the execution registry. */
  id:               string;
  /** ID of the created Biblioteca asset (null until asset is created). */
  assetId:          string | null;
  /** Current render status. */
  status:           VideoRenderStatus;
  /** Tenant isolation. */
  organizationId:   string;
  /** Source asset in Biblioteca (for version chain). */
  assetPadreId:     string | null;
  /** Top ancestor in the version chain. */
  assetOriginalId:  string | null;
  /** Source video URL. */
  videoOriginalUrl: string;
  /** Human name for this version. */
  versionName:      string;
  /** Export destination. */
  destino:          VideoDestino;
  /** Internal aspect ratio. */
  formato:          VideoFormato;
  subtitulosActivos: boolean;
  /** ID of the subtitle track to burn into this render (null = no subtitles). */
  subtitleTrackId:   string | null;
  musicaActiva:          boolean;
  /** ID of the Biblioteca music track to mix (null = no music). */
  musicTrackId:          string | null;
  /** Resolved URL for the music audio file (null if not resolved). */
  musicTrackUrl:         string | null;
  /** Music volume 0–100. */
  musicVolumen:          number;
  /** Original video audio volume 0–100. */
  audioOriginalVolumen:  number;
  /** Fade-in seconds. */
  musicaFadeIn:          number;
  /** Fade-out seconds. */
  musicaFadeOut:         number;
  textoActivo:           boolean;
  logoActivo:        boolean;
  referenceSku:      string | null;
  referenceName:     string | null;
  /** True until a real render job produces the derived output URL. */
  pendingRender:     boolean;
  /** ISO 8601 creation timestamp. */
  createdAt:         string;
  /** ISO 8601 completion timestamp (null until completed or failed). */
  completedAt:       string | null;
  /** Human-readable error (null unless failed). */
  errorMessage:      string | null;
}

// ── Render result ──────────────────────────────────────────────────────────────

/** Result returned by createVideoRenderJob(). */
export interface VideoRenderResult {
  success:      boolean;
  job:          VideoRenderJob | null;
  /** AgentExecution.id for tracking (null if execution could not be registered). */
  executionId:  string | null;
  errorMessage: string | null;
}

// ── User-facing status labels ──────────────────────────────────────────────────

/** Human-readable label for each render status (LATAM Spanish). */
export const RENDER_STATUS_LABEL: Record<VideoRenderStatus, string> = {
  pending:    "Preparando exportación",
  queued:     "Video en cola",
  processing: "Procesando video",
  completed:  "Nueva versión lista",
  failed:     "No pudimos exportar el video",
  cancelled:  "Exportación cancelada",
};

/** Whether the status represents an active (non-terminal) render. */
export function isActiveRenderStatus(status: VideoRenderStatus): boolean {
  return status === "pending" || status === "queued" || status === "processing";
}
