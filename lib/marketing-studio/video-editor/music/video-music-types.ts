/**
 * lib/marketing-studio/video-editor/music/video-music-types.ts
 *
 * MARKETING-VIDEO-MUSIC-01 — Music Domain Types
 *
 * Server and client safe — no server-only imports.
 *
 * Music tracks are stored as fotoEstudioAsset rows with assetType="music_track".
 * Audio file is hosted in R2 under music-tracks/{tenantId}/{yyyy}/{mm}/{id}.ext
 * Metadata (duration, MIME, size) lives in metadataJson.
 */

// ── Status ────────────────────────────────────────────────────────────────────

export type MusicTrackStatus = "ready" | "processing" | "failed";

// ── Core entity ───────────────────────────────────────────────────────────────

/**
 * A music track in the tenant's library.
 * Maps directly to a fotoEstudioAsset row with assetType="music_track".
 */
export interface MusicTrack {
  id:              string;
  organizationId:  string;
  /** Display name shown in the UI. */
  nombre:          string;
  /** Public R2 URL for the audio file (null in dev/no-R2 mode). */
  assetUrl:        string | null;
  /** Duration in seconds (null if unknown). */
  durationSeconds: number | null;
  /** Audio MIME type (e.g. "audio/mpeg"). */
  mimeType:        string;
  /** File size in bytes. */
  sizeBytes:       number;
  /** ISO 8601 upload timestamp. */
  uploadedAt:      string;
  /** Display name of the user who uploaded this track. */
  uploadedBy:      string;
  /** Product SKU linked to this track (for trazabilidad). */
  referenceSku:    string | null;
  /** Product commercial name linked to this track. */
  referenceName:   string | null;
  /** Processing status. */
  status:          MusicTrackStatus;
}

// ── Upload result ─────────────────────────────────────────────────────────────

export interface MusicUploadResult {
  success:      boolean;
  track?:       MusicTrack;
  errorMessage?: string;
}

// ── Copilot signal ────────────────────────────────────────────────────────────

/** A contextual recommendation from the Copilot layer (display only). */
export interface MusicCopilotSignal {
  level:   "info" | "warning" | "suggestion";
  message: string;
}

// ── Labels ────────────────────────────────────────────────────────────────────

export const MUSIC_STATUS_LABEL: Record<MusicTrackStatus, string> = {
  ready:      "Lista",
  processing: "Procesando",
  failed:     "Error al procesar",
};

// ── File constraints ──────────────────────────────────────────────────────────

/** Accepted MIME types for the file picker (shown to user). */
export const MUSIC_MIME_ACCEPT = "audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/aac,audio/*";

/** Maximum allowed upload size in MB. */
export const MUSIC_MAX_SIZE_MB = 10;

/** Human-readable accept label for the drop zone. */
export const MUSIC_FORMAT_LABEL = "MP3, M4A, WAV, OGG · máx 10 MB";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format seconds as mm:ss for display. */
export function formatMusicDuration(seconds: number): string {
  const m   = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/** Format bytes as MB string. */
export function formatMusicSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
