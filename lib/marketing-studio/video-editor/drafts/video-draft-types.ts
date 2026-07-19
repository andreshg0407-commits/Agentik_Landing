/**
 * lib/marketing-studio/video-editor/drafts/video-draft-types.ts
 *
 * MARKETING-VIDEO-DRAFT-WORKSPACE-01 — Draft Types
 *
 * Domain types for the Video Editor draft workspace.
 * Server and client safe — no server-only imports.
 *
 * DESIGN PRINCIPLE:
 *   A draft is a temporary work-in-progress entry.
 *   It is NOT a Biblioteca asset — it carries no approval, versioning, or
 *   publication eligibility. It exists only to preserve editing progress
 *   between sessions.
 */

import type { VideoEditorConfig, VideoDestino } from "../video-editor-types";
import type { VideoSubtitleSegment }            from "../subtitles/video-subtitle-types";

// ── Draft status ───────────────────────────────────────────────────────────────

/**
 * Lifecycle status of a video draft.
 *
 * draft           → active work-in-progress
 * ready_to_export → user flagged it as finished, pending Biblioteca export
 * exported        → associated Biblioteca asset has been created
 * abandoned       → user discarded the draft
 */
export type VideoDraftStatus =
  | "draft"
  | "ready_to_export"
  | "exported"
  | "abandoned";

// ── Draft source ───────────────────────────────────────────────────────────────

/**
 * Origin of the video material in the draft.
 *
 * local_file      → user uploaded a file from their device (blob: → tempVideoUrl)
 * biblioteca      → loaded from an existing Biblioteca asset
 */
export type VideoDraftSource = "local_file" | "biblioteca";

// ── Draft config ───────────────────────────────────────────────────────────────

/**
 * Full editor snapshot stored inside a draft.
 * Extends VideoEditorConfig with subtitle segments (for restoration).
 */
export interface VideoDraftConfig extends VideoEditorConfig {
  /** Subtitle segments (null if not yet generated or not applicable). */
  subtitleSegments: VideoSubtitleSegment[] | null;
  /** ID of the linked subtitle track (if saved to backend). */
  subtitleTrackId:  string | null;
  /** ID of the linked music track. */
  musicTrackId:     string | null;
}

// ── Draft ─────────────────────────────────────────────────────────────────────

/**
 * A video draft — temporal workspace entry.
 *
 * Not a Biblioteca asset. Not eligible for publication, ads, or Shopify.
 * Persisted in AgentExecution with operation=VIDEO_DRAFT.
 */
export interface VideoDraft {
  /** AgentExecution ID (cuid). Stable identifier for the draft. */
  id:              string;
  /** Tenant boundary. */
  organizationId:  string;
  /** Draft display name (user-editable). */
  nombre:          string;
  /** Lifecycle status. */
  status:          VideoDraftStatus;
  /** Origin of the video source material. */
  source:          VideoDraftSource;
  /**
   * Public R2 URL of the source video.
   * For local_file drafts: the temp-upload URL.
   * For biblioteca drafts: the Biblioteca asset URL.
   */
  videoUrl:        string;
  /** ID of the Biblioteca asset this draft was loaded from (null for local_file). */
  assetPadreId:    string | null;
  /**
   * Full editor config snapshot including subtitle segments.
   * Restored on "Abrir borrador".
   */
  config:          VideoDraftConfig;
  /** Product reference linked to this draft (optional). */
  referenceSku:    string | null;
  referenceName:   string | null;
  /** ISO 8601. */
  createdAt:       string;
  /** ISO 8601. Updated on every PATCH. */
  updatedAt:       string;
  /** ISO 8601. Set when status transitions to "exported". */
  exportedAt:      string | null;
  /** ID of the Biblioteca asset created on export (null until exported). */
  exportedAssetId: string | null;
  /** Display name of the user who created the draft. */
  createdBy:       string;
}

// ── Service input types ────────────────────────────────────────────────────────

export interface CreateVideoDraftInput {
  organizationId: string;
  createdBy:      string;
  nombre:         string;
  source:         VideoDraftSource;
  videoUrl:       string;
  assetPadreId:   string | null;
  config:         VideoDraftConfig;
  referenceSku:   string | null;
  referenceName:  string | null;
}

export interface UpdateVideoDraftInput {
  nombre?:       string;
  status?:       VideoDraftStatus;
  videoUrl?:     string;
  config?:       VideoDraftConfig;
  referenceSku?: string | null;
  referenceName?: string | null;
}

export interface MarkDraftExportedInput {
  exportedAssetId: string;
}
