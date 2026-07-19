/**
 * lib/marketing-studio/video-editor/subtitles/video-subtitle-types.ts
 *
 * MARKETING-VIDEO-SUBTITLES-01 — Subtitle Domain Types
 *
 * Formal types for the automatic subtitle system.
 * Server and client safe — no server-only imports.
 *
 * ARCHITECTURE:
 *   Each subtitle track is stored as an AgentExecution row
 *   (module: marketing_studio, operation: VIDEO_SUBTITLE).
 *   Segments are persisted in metadataJson.segments.
 *   This avoids a DB migration while keeping full audit trail.
 *
 * LIFECYCLE:
 *   Editor user clicks "Generar subtítulos"
 *     → POST /subtitles  (creates execution, triggers transcription)
 *     → status: pending → processing → ready | failed
 *     → User edits segments → PATCH /subtitles
 *     → Render job includes subtitleTrackId → FFmpeg burns subtitles into MP4
 */

// ── Status ─────────────────────────────────────────────────────────────────────

/** Lifecycle status of a subtitle track. */
export type VideoSubtitleStatus =
  | "pending"     // registered, transcription not yet started
  | "processing"  // transcription in progress (async)
  | "ready"       // segments ready, user can edit
  | "failed";     // transcription failed

/** Whether the status is still in progress. */
export function isActiveSubtitleStatus(status: VideoSubtitleStatus): boolean {
  return status === "pending" || status === "processing";
}

/** Human-readable LATAM labels. */
export const SUBTITLE_STATUS_LABEL: Record<VideoSubtitleStatus, string> = {
  pending:    "Preparando subtítulos",
  processing: "Generando subtítulos",
  ready:      "Subtítulos listos",
  failed:     "No pudimos generar subtítulos",
};

// ── Segment ────────────────────────────────────────────────────────────────────

/**
 * A single timed subtitle segment.
 * Stored as part of the track's metadataJson.
 */
export interface VideoSubtitleSegment {
  /** Start time in seconds. */
  start:       number;
  /** End time in seconds. */
  end:         number;
  /** Subtitle text (after any manual edits). */
  text:        string;
  /** Transcription confidence score (0–1). Null if manually entered. */
  confidence?: number | null;
  /** True if the user has manually edited this segment. */
  edited:      boolean;
}

// ── Track ──────────────────────────────────────────────────────────────────────

/**
 * A complete subtitle track associated with a video asset.
 * id = AgentExecution.id.
 */
export interface VideoSubtitleTrack {
  /** AgentExecution ID — the track's stable identifier. */
  id:              string;
  /** Tenant isolation. */
  organizationId:  string;
  /** ID of the Biblioteca asset this track belongs to (null for unregistered videos). */
  assetId:         string | null;
  /** ID of the source video asset (may differ from assetId for derived versions). */
  assetOriginalId: string | null;
  /** URL of the video that was transcribed. */
  videoUrl:        string;
  /** Transcription language code (es, en, pt, etc.). */
  language:        string;
  /** Processing status. */
  status:          VideoSubtitleStatus;
  /** Transcription source: auto (AI) or manual. */
  source:          "auto" | "manual";
  /** Product SKU linked to this track (for trazabilidad). */
  referenceSku:    string | null;
  /** Commercial product name (for trazabilidad). */
  referenceName:   string | null;
  /** User who requested the track. */
  createdBy:       string;
  /** ISO 8601 creation timestamp. */
  createdAt:       string;
  /** ISO 8601 last-updated timestamp. */
  updatedAt:       string;
  /** Transcribed and/or manually edited segments. Empty until ready. */
  segments:        VideoSubtitleSegment[];
  /** User-facing error message (null unless failed). */
  errorMessage:    string | null;
}

// ── Subtitle style ─────────────────────────────────────────────────────────────

/** V1 burn-in style options. Keep it simple — no advanced styling yet. */
export interface VideoSubtitleStyle {
  /** Font size as a percentage of video height (default 5). */
  fontSizePct: number;
  /** Color of subtitle text (default: white). */
  color:       "white" | "yellow";
  /** Whether to use a semi-transparent background behind the text. */
  background:  boolean;
}

export const DEFAULT_SUBTITLE_STYLE: VideoSubtitleStyle = {
  fontSizePct: 5,
  color:       "white",
  background:  true,
};

// ── Request & result ────────────────────────────────────────────────────────────

/** Input to createSubtitleTrack(). */
export interface VideoSubtitleRequest {
  /** Tenant ID — from server session. */
  organizationId:  string;
  /** User display name — from server session. */
  createdBy:       string;
  /** Biblioteca asset ID (null for non-registered videos). */
  assetId:         string | null;
  /** Top ancestor in version chain. */
  assetOriginalId: string | null;
  /** URL of the video to transcribe. */
  videoUrl:        string;
  /** BCP 47 language code (es, en, pt). Default: es. */
  language:        string;
  /** Product SKU for trazabilidad. */
  referenceSku:    string | null;
  /** Product name for trazabilidad. */
  referenceName:   string | null;
}

/** Result returned by createSubtitleTrack(). */
export interface VideoSubtitleResult {
  success:      boolean;
  track:        VideoSubtitleTrack | null;
  errorMessage: string | null;
}

// ── Language options ────────────────────────────────────────────────────────────

export interface LanguageOption {
  code:  string;
  label: string;
}

export const SUBTITLE_LANGUAGES: LanguageOption[] = [
  { code: "es", label: "Español" },
  { code: "en", label: "Inglés" },
  { code: "pt", label: "Portugués" },
  { code: "fr", label: "Francés" },
];
