/**
 * lib/storage/r2-key-builder.ts
 *
 * MARKETING-ASSET-STORAGE-R2-HARDENING-03B — Canonical Key Builder
 *
 * Builds R2 object keys with mandatory environment prefix and
 * certified organizationId. No client-provided tenant slugs
 * are used in key construction.
 *
 * Server-only — never import from client components.
 *
 * Key anatomy:
 *   {environment}/organizations/{organizationId}/{namespace}/{...segments}
 *
 * Namespaces:
 *   library    — Biblioteca Viva reference assets
 *   studio     — Foto Estudio session assets
 *   video      — Rendered videos
 *   music      — Music tracks
 *   branding   — Logos and brand manuals
 *   temp       — Ephemeral files (subtitle transcription)
 *   luca       — Luca/TikTok pipeline
 */

import "server-only";

import { sanitizeKeySegment } from "./r2-file-validation";
import type { StorageEnvironment } from "./r2-config";

// ── Types ─────────────────────────────────────────────────────────────────────

export type StorageNamespace =
  | "library"
  | "studio"
  | "video"
  | "music"
  | "branding"
  | "temp"
  | "luca"
  | "canary";

export interface KeyBuildContext {
  environment: StorageEnvironment;
  organizationId: string;
}

// ── Date segments ─────────────────────────────────────────────────────────────

function dateSegments(): { yyyy: string; mm: string } {
  const now = new Date();
  return {
    yyyy: String(now.getUTCFullYear()),
    mm: String(now.getUTCMonth() + 1).padStart(2, "0"),
  };
}

// ── Library asset key ─────────────────────────────────────────────────────────

/**
 * Builds a canonical key for a Biblioteca reference asset.
 *
 * Pattern:
 *   {env}/organizations/{orgId}/library/{normalizedRef}/{assetType}/{assetId}/{filename}
 */
export function buildLibraryAssetKey(
  ctx: KeyBuildContext,
  normalizedReference: string,
  assetType: string,
  assetId: string,
  filename: string,
): string {
  const safeRef = sanitizeKeySegment(normalizedReference);
  const safeType = sanitizeKeySegment(assetType);
  const safeId = sanitizeKeySegment(assetId);
  const safeFile = sanitizeKeySegment(filename);

  return `${ctx.environment}/organizations/${sanitizeKeySegment(ctx.organizationId)}/library/${safeRef}/${safeType}/${safeId}/${safeFile}`;
}

// ── Studio session asset key ──────────────────────────────────────────────────

/**
 * Builds a key for Foto Estudio session uploads.
 *
 * Pattern:
 *   {env}/organizations/{orgId}/studio/{yyyy}/{mm}/{sessionId}/{angle}.{ext}
 */
export function buildStudioSessionKey(
  ctx: KeyBuildContext,
  sessionId: string,
  angle: string,
  ext: string,
): string {
  const { yyyy, mm } = dateSegments();
  const safeSession = sanitizeKeySegment(sessionId);
  const safeAngle = sanitizeKeySegment(angle);

  return `${ctx.environment}/organizations/${sanitizeKeySegment(ctx.organizationId)}/studio/${yyyy}/${mm}/${safeSession}/${safeAngle}.${ext}`;
}

// ── Generated asset re-host key ───────────────────────────────────────────────

/**
 * Builds a key for re-hosted generated assets (from Replicate, etc).
 *
 * Pattern:
 *   {env}/organizations/{orgId}/studio/{yyyy}/{mm}/{sessionId}/generated/{assetId}.{ext}
 */
export function buildGeneratedAssetKey(
  ctx: KeyBuildContext,
  sessionId: string,
  assetId: string,
  ext: string,
): string {
  const { yyyy, mm } = dateSegments();
  return `${ctx.environment}/organizations/${sanitizeKeySegment(ctx.organizationId)}/studio/${yyyy}/${mm}/${sanitizeKeySegment(sessionId)}/generated/${sanitizeKeySegment(assetId)}.${ext}`;
}

// ── Manual upload key ─────────────────────────────────────────────────────────

/**
 * Builds a key for manually uploaded assets (via Biblioteca UI).
 *
 * Pattern:
 *   {env}/organizations/{orgId}/studio/{yyyy}/{mm}/manual/{productId}/{uuid}.{ext}
 */
export function buildManualUploadKey(
  ctx: KeyBuildContext,
  productId: string,
  uuid: string,
  ext: string,
): string {
  const { yyyy, mm } = dateSegments();
  return `${ctx.environment}/organizations/${sanitizeKeySegment(ctx.organizationId)}/studio/${yyyy}/${mm}/manual/${sanitizeKeySegment(productId)}/${sanitizeKeySegment(uuid)}.${ext}`;
}

// ── Video render key ──────────────────────────────────────────────────────────

/**
 * Pattern:
 *   {env}/organizations/{orgId}/video/{yyyy}/{mm}/{executionId}.mp4
 */
export function buildVideoRenderKey(
  ctx: KeyBuildContext,
  executionId: string,
): string {
  const { yyyy, mm } = dateSegments();
  return `${ctx.environment}/organizations/${sanitizeKeySegment(ctx.organizationId)}/video/${yyyy}/${mm}/${sanitizeKeySegment(executionId)}.mp4`;
}

// ── Music track key ───────────────────────────────────────────────────────────

/**
 * Pattern:
 *   {env}/organizations/{orgId}/music/{yyyy}/{mm}/{trackId}.{ext}
 */
export function buildMusicTrackKey(
  ctx: KeyBuildContext,
  trackId: string,
  ext: string,
): string {
  const { yyyy, mm } = dateSegments();
  return `${ctx.environment}/organizations/${sanitizeKeySegment(ctx.organizationId)}/music/${yyyy}/${mm}/${sanitizeKeySegment(trackId)}.${ext}`;
}

// ── Branding asset key ────────────────────────────────────────────────────────

/**
 * Pattern:
 *   {env}/organizations/{orgId}/branding/{yyyy}/{mm}/{role}-{uuid}.{ext}
 */
export function buildBrandingKey(
  ctx: KeyBuildContext,
  role: string,
  uuid: string,
  ext: string,
): string {
  const { yyyy, mm } = dateSegments();
  return `${ctx.environment}/organizations/${sanitizeKeySegment(ctx.organizationId)}/branding/${yyyy}/${mm}/${sanitizeKeySegment(role)}-${sanitizeKeySegment(uuid)}.${ext}`;
}

// ── Temp video key ────────────────────────────────────────────────────────────

/**
 * Pattern:
 *   {env}/organizations/{orgId}/temp/{yyyy}/{mm}/{uuid}.{ext}
 */
export function buildTempVideoKey(
  ctx: KeyBuildContext,
  uuid: string,
  ext: string,
): string {
  const { yyyy, mm } = dateSegments();
  return `${ctx.environment}/organizations/${sanitizeKeySegment(ctx.organizationId)}/temp/${yyyy}/${mm}/${sanitizeKeySegment(uuid)}.${ext}`;
}

// ── Luca pipeline key ─────────────────────────────────────────────────────────

/**
 * Pattern:
 *   {env}/organizations/{orgId}/luca/{yyyy}/{mm}/{requestId}/{filename}
 */
export function buildLucaKey(
  ctx: KeyBuildContext,
  requestId: string,
  filename: string,
): string {
  const { yyyy, mm } = dateSegments();
  return `${ctx.environment}/organizations/${sanitizeKeySegment(ctx.organizationId)}/luca/${yyyy}/${mm}/${sanitizeKeySegment(requestId)}/${sanitizeKeySegment(filename)}`;
}

// ── Canary test key ───────────────────────────────────────────────────────────

/**
 * Pattern:
 *   {env}/canary/{organizationId}/{uuid}
 */
export function buildCanaryKey(
  ctx: KeyBuildContext,
  uuid: string,
): string {
  return `${ctx.environment}/canary/${sanitizeKeySegment(ctx.organizationId)}/${sanitizeKeySegment(uuid)}`;
}
