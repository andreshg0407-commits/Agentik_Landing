/**
 * lib/marketing-studio/bulk-import/import-types.ts
 *
 * MARKETING-STUDIO-BULK-IMPORT-01
 *
 * Central type contract for the bulk import layer.
 * All providers (LocalFolder, LocalZip, future GoogleDrive) share these types.
 *
 * ── Invariant ─────────────────────────────────────────────────────────────────
 *   Every import MUST result in a valid:
 *     Category → ProductEntity → GeneratedAsset + ProductAssetLink
 *
 *   No asset may exist without a reference (ProductEntity).
 *   This invariant is enforced by the planner and executor.
 */

// ── Source types ───────────────────────────────────────────────────────────────

export type ImportSource = "local_folder" | "local_zip" | "google_drive";

export const IMPORT_SOURCE_LABELS: Record<ImportSource, string> = {
  local_folder:  "Carpeta local",
  local_zip:     "Archivo ZIP",
  google_drive:  "Google Drive",
};

// ── Parsed structure (output of structure-parser) ─────────────────────────────

/**
 * A single file extracted from the source.
 * `role` is assigned by asset-role-mapper from the filename.
 *
 * Drive imports: `file` is null, `driveFileId` is set.
 * Files are downloaded lazily at execution time via the Drive file proxy.
 */
export interface ParsedFile {
  name:        string;
  path:        string;          // full relative path within source
  file:        File | null;     // null for Drive (lazy download at execution)
  mimeType:    string;
  role:        string;          // "hero" | "raw_back" | "raw_detail" | "gallery" | "video" | "document"
  driveFileId?: string;         // Google Drive file ID (Drive provider only)
}

export interface ParsedReference {
  name:  string;
  sku?:  string;          // auto-derived from folder name if parseable
  files: ParsedFile[];
}

export interface ParsedCategory {
  name:       string;
  references: ParsedReference[];
}

export interface ParsedImportStructure {
  source:        ImportSource;
  categories:    ParsedCategory[];
  unknownFiles:  ParsedFile[];   // files not fitting cat/ref structure
  totalFiles:    number;
  totalImages:   number;
}

// ── Conflict types ─────────────────────────────────────────────────────────────

export type ConflictResolution = "update" | "skip" | "duplicate";

export interface ImportConflict {
  type:           "sku_exists" | "name_similar";
  referenceName:  string;
  sku?:           string;
  existingId?:    string;
  resolution:     ConflictResolution;
}

// ── Import plan (output of import-planner / dry run) ─────────────────────────

export interface ImportPlanReference {
  name:      string;
  sku?:      string;
  category:  string;
  files:     ParsedFile[];
  conflict?: ImportConflict;
}

export interface ImportPlanCategory {
  name:           string;
  referenceCount: number;
  assetCount:     number;
  references:     ImportPlanReference[];
}

export interface ImportPlan {
  source:          ImportSource;
  categories:      ImportPlanCategory[];
  totalCategories: number;
  totalReferences: number;
  totalAssets:     number;
  skippedFiles:    number;
  conflicts:       ImportConflict[];
}

// ── Execution ─────────────────────────────────────────────────────────────────

export interface ImportProgressEvent {
  type:           "product_creating" | "product_created" | "asset_uploading" | "asset_uploaded" | "error" | "rollback_start" | "rollback_done";
  referenceName?: string;
  assetName?:     string;
  message?:       string;
  /** 0–100 */
  progress:       number;
}

export type ImportProgressCallback = (event: ImportProgressEvent) => void;

export interface ImportAuditRecord {
  id:                 string;
  startedAt:          string;   // ISO
  completedAt?:       string;   // ISO
  source:             ImportSource;
  orgSlug:            string;
  organizationId:     string;
  totalCategories:    number;
  referencesCreated:  number;
  assetsImported:     number;
  conflictsDetected:  number;
  errors:             string[];
  status:             "success" | "partial" | "failed" | "rolled_back";
  // Drive-specific fields (only populated for source = "google_drive")
  driveFolderId?:     string;
  driveFolderName?:   string;
  driveFileCount?:    number;
  ignoredFileCount?:  number;
  permissionErrors?:  string[];
}

export interface ImportError {
  referenceName: string;
  assetName?:    string;
  message:       string;
}

export interface ImportResult {
  success:           boolean;
  categoriesCreated: number;
  referencesCreated: number;
  assetsImported:    number;
  errors:            ImportError[];
  rolledBack:        boolean;
  audit:             ImportAuditRecord;
}

// ── Provider abstraction ───────────────────────────────────────────────────────

/**
 * ImportProvider — abstract source interface.
 *
 * All import sources must implement `parse()` to produce a ParsedImportStructure.
 * Sources not yet implemented set `parse` to null (stub, shown as "Próximamente").
 *
 * Future providers to implement:
 *   - MARKETING-STUDIO-DRIVE-IMPORT-01: GoogleDriveProvider
 *   - MARKETING-STUDIO-URL-IMPORT-01: UrlListProvider
 *   - MARKETING-STUDIO-SHOPIFY-IMPORT-01: ShopifyProvider
 */
export interface ImportProvider {
  id:          ImportSource;
  label:       string;
  description: string;
  icon:        string;   // lucide icon name
  /** null = not yet implemented → shows "Próximamente" badge */
  parse:       ((files: FileList | File) => Promise<ParsedImportStructure>) | null;
  /**
   * URL-based sources (e.g. Google Drive folder URL).
   * When set, the wizard shows a URL input instead of a file picker.
   * The function receives the folder URL and orgSlug.
   * null = not yet implemented.
   */
  parseFromUrl?: ((folderUrl: string, orgSlug: string) => Promise<ParsedImportStructure>) | null;
}
