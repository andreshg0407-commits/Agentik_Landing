/**
 * lib/marketing-studio/bulk-import/drive-dry-run-types.ts
 *
 * MARKETING-DRIVE-BULK-ASSET-INGESTION-04A — Dry-Run Type Contract
 *
 * Type definitions for the bulk Drive dry-run engine.
 * Zero writes. Read-only analysis. Per-file status codes.
 *
 * ── 14 Status Codes ──────────────────────────────────────────────────────────
 *   READY                    — file will be imported on execution
 *   DUPLICATE_DRIVE_FILE     — same driveFileId already imported
 *   DUPLICATE_CHECKSUM       — same SHA-256 already exists for this product
 *   UNSUPPORTED_MIME         — file type not accepted
 *   FILE_TOO_LARGE           — exceeds per-file size limit
 *   NO_REF_EXTRACTED         — no product reference found in path
 *   REF_NOT_FOUND            — reference extracted but no matching product
 *   AMBIGUOUS_REF            — reference matches multiple products
 *   PRODUCT_NOT_ACTIVE       — product exists but not in active inventory
 *   HERO_ALREADY_EXISTS      — role=hero but product already has a hero
 *   GOOGLE_NATIVE_SKIP       — Google Docs/Sheets/etc. not downloadable
 *   HIDDEN_FILE              — .DS_Store, Thumbs.db, etc.
 *   OUTSIDE_TENANT_ROOT      — file's folder is not a descendant of tenant root
 *   PERMISSION_DENIED        — Drive API returned 403 for this file's folder
 */

export type DryRunStatus =
  | "READY"
  | "DUPLICATE_DRIVE_FILE"
  | "DUPLICATE_CHECKSUM"
  | "UNSUPPORTED_MIME"
  | "FILE_TOO_LARGE"
  | "NO_REF_EXTRACTED"
  | "REF_NOT_FOUND"
  | "AMBIGUOUS_REF"
  | "PRODUCT_NOT_ACTIVE"
  | "HERO_ALREADY_EXISTS"
  | "GOOGLE_NATIVE_SKIP"
  | "HIDDEN_FILE"
  | "OUTSIDE_TENANT_ROOT"
  | "PERMISSION_DENIED";

/** Asset type classification from MIME */
export type AssetTypeClassification =
  | "FOTO"
  | "VIDEO"
  | "BANNER_PIEZA"
  | "UNSUPPORTED";

/** Suggested role for the asset */
export type SuggestedRole =
  | "HERO"
  | "FRONT"
  | "BACK"
  | "DETAIL"
  | "GALLERY"
  | "VIDEO"
  | "BANNER"
  | "DOCUMENT";

// ── Per-file dry-run detail ──────────────────────────────────────────────────

export interface DryRunFileDetail {
  /** Drive file ID */
  driveFileId:        string;
  /** Original filename */
  fileName:           string;
  /** Full path within scanned folder */
  path:               string;
  /** MIME type from Drive */
  mimeType:           string;
  /** File size in bytes */
  sizeBytes:          number;
  /** Extracted reference (normalized), null if none */
  extractedRef:       string | null;
  /** Extraction method */
  extractionMethod:   "prefix" | "bracket" | "filename_prefix" | "none";
  /** Matched ProductEntity ID, null if not matched */
  matchedProductId:   string | null;
  /** Matched SKU */
  matchedSku:         string | null;
  /** Asset type classification */
  assetType:          AssetTypeClassification;
  /** Suggested role */
  suggestedRole:      SuggestedRole;
  /** Action that would be taken */
  action:             "IMPORT" | "SKIP" | "REJECT";
  /** Status code */
  status:             DryRunStatus;
  /** Human-readable rejection/skip reason */
  reason:             string | null;
  /** Parent folder name in Drive */
  parentFolderName:   string;
}

// ── Dry-run summary ─────────────────────────────────────────────────────────

export interface DryRunSummary {
  /** Total files scanned */
  totalScanned:           number;
  /** Files that would be imported */
  readyToImport:          number;
  /** Files that would be skipped (duplicates, existing heroes) */
  skipped:                number;
  /** Files rejected (bad type, no ref, outside root, etc.) */
  rejected:               number;
  /** Breakdown by status code */
  statusBreakdown:        Record<DryRunStatus, number>;
  /** Breakdown by asset type */
  assetTypeBreakdown:     Record<AssetTypeClassification, number>;
  /** Unique references matched */
  uniqueRefsMatched:      number;
  /** Unique references NOT matched */
  uniqueRefsUnmatched:    number;
  /** Total folders scanned */
  totalFolders:           number;
  /** Permission errors encountered */
  permissionErrors:       string[];
}

// ── Full dry-run result ──────────────────────────────────────────────────────

export interface DryRunResult {
  /** Zero writes — this is a dry run */
  zeroWrites:     true;
  /** Tenant root folder used */
  tenantRootId:   string;
  tenantRootName: string;
  /** Summary statistics */
  summary:        DryRunSummary;
  /** Per-file details */
  files:          DryRunFileDetail[];
  /** Timestamp */
  analyzedAt:     string;
  /** Organization context */
  organizationId: string;
}

// ── Idempotency contract (Section G) ────────────────────────────────────────

export interface AssetIdempotencyKey {
  /** Drive file ID — primary dedup key */
  driveFileId:          string;
  /** SHA-256 of file content (computed at execution time, not dry-run) */
  contentChecksum?:     string;
  /** Normalized reference the asset is linked to */
  normalizedReference:  string;
  /** Role assigned to this asset */
  role:                 SuggestedRole;
  /** Organization ID */
  organizationId:       string;
}

/**
 * Idempotency check result.
 * On second execution with same keys → DUPLICATE status.
 */
export interface IdempotencyCheckResult {
  isDuplicate:    boolean;
  existingAssetId?: string;
  reason?:        string;
}
