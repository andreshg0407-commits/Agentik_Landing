/**
 * lib/storage/server.ts
 *
 * MARKETING-ASSET-STORAGE-R2-HARDENING-03B — Server barrel
 *
 * Server-only exports for the storage module.
 * Import this from server components and API routes.
 */

import "server-only";

// Configuration
export {
  loadR2Config,
  requireR2Config,
  resolveStorageEnvironment,
  getMaxUploadBytes,
  type R2Config,
  type StorageEnvironment,
} from "./r2-config";

// Client operations
export {
  r2Put,
  r2Head,
  r2Delete,
  resolvePublicUrl,
  extractObjectKey,
  computeChecksum,
  buildStorageIdentity,
  type R2PutInput,
  type R2PutResult,
  type R2HeadResult,
  type R2DeleteInput,
  type StorageIdentity,
} from "./r2-client";

// Key construction
export {
  buildLibraryAssetKey,
  buildStudioSessionKey,
  buildGeneratedAssetKey,
  buildManualUploadKey,
  buildVideoRenderKey,
  buildMusicTrackKey,
  buildBrandingKey,
  buildTempVideoKey,
  buildLucaKey,
  buildCanaryKey,
  type KeyBuildContext,
  type StorageNamespace,
} from "./r2-key-builder";

// File validation
export {
  validateFileBuffer,
  sanitizeFilename,
  sanitizeKeySegment,
  ALLOWED_ASSET_MIMES,
  MIME_TO_EXT,
  type FileValidationResult,
} from "./r2-file-validation";
