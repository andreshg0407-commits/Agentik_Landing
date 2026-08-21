/**
 * lib/marketing-studio/bulk-import/drive-dry-run-engine.ts
 *
 * MARKETING-DRIVE-BULK-ASSET-INGESTION-04A — Dry-Run Engine
 *
 * Analyzes scanned Drive files against the product catalog.
 * ZERO WRITES. Read-only. Deterministic.
 *
 * ── Pipeline ────────────────────────────────────────────────────────────────
 *   1. Receive DriveScannedFile[] from scanDriveFolder()
 *   2. For each file:
 *      a. Classify MIME → AssetTypeClassification
 *      b. Extract reference from path/filename
 *      c. Match reference to ProductEntity SKU (exact only)
 *      d. Check active inventory status
 *      e. Check hero duplication
 *      f. Check driveFileId idempotency
 *      g. Assign status code
 *   3. Aggregate summary
 *   4. Return DryRunResult
 *
 * ── Dependencies ────────────────────────────────────────────────────────────
 *   - reference-normalizer.ts (extractReferenceFromFile, matchReference)
 *   - asset-role-mapper.ts (classifyAssetRole, isImportableFile)
 *   - drive-dry-run-types.ts (all types)
 *   - DriveScannedFile from drive-api-client.ts
 */

import type { DriveScannedFile }         from "@/lib/marketing-studio/drive/drive-api-client";
import {
  extractReferenceFromFile,
  matchReference,
  normalizeReference,
}                                         from "./reference-normalizer";
import { classifyAssetRole }              from "./asset-role-mapper";
import type {
  DryRunResult,
  DryRunSummary,
  DryRunFileDetail,
  DryRunStatus,
  AssetTypeClassification,
  SuggestedRole,
}                                         from "./drive-dry-run-types";

// ── Constants ───────────────────────────────────────────────────────────────

/** Max file size for import: 50 MB */
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/** MIME types that are importable */
const IMPORTABLE_MIMES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp",
  "video/mp4", "video/quicktime",
  "application/pdf",
]);

/** Google Workspace native types — not downloadable */
const GOOGLE_NATIVE_MIMES = new Set([
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
  "application/vnd.google-apps.form",
  "application/vnd.google-apps.drawing",
  "application/vnd.google-apps.site",
  "application/vnd.google-apps.script",
  "application/vnd.google-apps.shortcut",
]);

// ── Input context ───────────────────────────────────────────────────────────

export interface DryRunContext {
  organizationId:   string;
  tenantRootId:     string;
  tenantRootName:   string;
  /** Map<normalizedSku, productId> — all ProductEntities in the org */
  skuToProduct:     Map<string, string>;
  /** Map<normalizedSku, count> — for detecting ambiguous SKUs */
  skuCounts:        Map<string, number>;
  /** Set<productId> — products that have an active hero asset */
  productsWithHero: Set<string>;
  /** Set<driveFileId> — Drive files already imported */
  importedDriveIds: Set<string>;
  /** Set<productId> — products in active inventory */
  activeProductIds: Set<string>;
}

// ── Engine ──────────────────────────────────────────────────────────────────

/**
 * Runs the dry-run analysis on scanned Drive files.
 * ZERO WRITES. Pure function (given context).
 */
export function runDryRun(
  scannedFiles:    DriveScannedFile[],
  totalFolders:    number,
  permissionErrors: string[],
  ctx:             DryRunContext,
): DryRunResult {
  const files: DryRunFileDetail[] = [];

  for (const sf of scannedFiles) {
    const detail = analyzeFile(sf, ctx);
    files.push(detail);
  }

  const summary = buildSummary(files, totalFolders, permissionErrors);

  return {
    zeroWrites:     true,
    tenantRootId:   ctx.tenantRootId,
    tenantRootName: ctx.tenantRootName,
    summary,
    files,
    analyzedAt:     new Date().toISOString(),
    organizationId: ctx.organizationId,
  };
}

// ── Per-file analysis ───────────────────────────────────────────────────────

function analyzeFile(
  sf:  DriveScannedFile,
  ctx: DryRunContext,
): DryRunFileDetail {
  const base: Omit<DryRunFileDetail, "status" | "action" | "reason" | "matchedProductId" | "matchedSku" | "extractedRef" | "extractionMethod" | "assetType" | "suggestedRole"> = {
    driveFileId:      sf.id,
    fileName:         sf.name,
    path:             sf.path,
    mimeType:         sf.mimeType,
    sizeBytes:        sf.size,
    parentFolderName: sf.parentName,
    driveModifiedTime: sf.modifiedTime,
    driveVersion:      sf.version,
  };

  // 1. Hidden file check
  if (sf.name.startsWith(".") || sf.name === "Thumbs.db" || sf.name === "desktop.ini") {
    return makeDetail(base, {
      status: "HIDDEN_FILE",
      action: "SKIP",
      reason: "Archivo oculto del sistema",
    });
  }

  // 2. Google native type check
  if (GOOGLE_NATIVE_MIMES.has(sf.mimeType)) {
    return makeDetail(base, {
      status: "GOOGLE_NATIVE_SKIP",
      action: "SKIP",
      reason: "Documento de Google Workspace — no descargable como binario",
    });
  }

  // 3. MIME type check
  if (!IMPORTABLE_MIMES.has(sf.mimeType)) {
    return makeDetail(base, {
      status:    "UNSUPPORTED_MIME",
      action:    "REJECT",
      reason:    `Tipo no soportado: ${sf.mimeType}`,
      assetType: "UNSUPPORTED",
    });
  }

  // 4. File size check
  if (sf.size > MAX_FILE_SIZE_BYTES) {
    return makeDetail(base, {
      status: "FILE_TOO_LARGE",
      action: "REJECT",
      reason: `Archivo excede ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB (${(sf.size / (1024 * 1024)).toFixed(1)} MB)`,
    });
  }

  // 5. Classify asset type and role
  const assetType = classifyMimeToAssetType(sf.mimeType);
  const detectedRole = classifyAssetRole(sf.name);
  const suggestedRole = mapDetectedToSuggested(detectedRole, assetType);

  // 6. Extract reference
  const extraction = extractReferenceFromFile(sf.name, sf.parentName);
  const extractedRef = extraction.reference;
  const extractionMethod = extraction.method;

  // 7. Match reference
  const match = matchReference(extractedRef, ctx.skuToProduct, ctx.skuCounts);

  if (match.status === "NO_REF_EXTRACTED") {
    return makeDetail(base, {
      status: "NO_REF_EXTRACTED",
      action: "REJECT",
      reason: "No se pudo extraer referencia del nombre de archivo o carpeta",
      assetType, suggestedRole, extractedRef, extractionMethod,
    });
  }

  if (match.status === "AMBIGUOUS_REF") {
    return makeDetail(base, {
      status: "AMBIGUOUS_REF",
      action: "REJECT",
      reason: `Referencia "${extractedRef}" coincide con múltiples productos`,
      assetType, suggestedRole, extractedRef, extractionMethod,
      matchedSku: match.matchedSku,
    });
  }

  if (match.status === "REF_NOT_FOUND") {
    return makeDetail(base, {
      status: "REF_NOT_FOUND",
      action: "REJECT",
      reason: `Referencia "${extractedRef}" no existe en el catálogo`,
      assetType, suggestedRole, extractedRef, extractionMethod,
    });
  }

  // 8. Product found — check active inventory
  const productId = match.productId!;
  const matchedSku = match.matchedSku;

  if (!ctx.activeProductIds.has(productId)) {
    return makeDetail(base, {
      status: "PRODUCT_NOT_ACTIVE",
      action: "REJECT",
      reason: `Producto "${matchedSku}" no está activo en inventario`,
      assetType, suggestedRole, extractedRef, extractionMethod,
      matchedProductId: productId, matchedSku,
    });
  }

  // 9. Idempotency — driveFileId already imported
  if (ctx.importedDriveIds.has(sf.id)) {
    return makeDetail(base, {
      status: "DUPLICATE_DRIVE_FILE",
      action: "SKIP",
      reason: "Este archivo de Drive ya fue importado previamente",
      assetType, suggestedRole, extractedRef, extractionMethod,
      matchedProductId: productId, matchedSku,
    });
  }

  // 10. Hero already exists
  if (suggestedRole === "HERO" && ctx.productsWithHero.has(productId)) {
    return makeDetail(base, {
      status: "HERO_ALREADY_EXISTS",
      action: "SKIP",
      reason: "El producto ya tiene una imagen hero — se asignará como gallery",
      assetType,
      suggestedRole: "GALLERY",
      extractedRef, extractionMethod,
      matchedProductId: productId, matchedSku,
    });
  }

  // 11. All checks passed — READY
  return makeDetail(base, {
    status: "READY",
    action: "IMPORT",
    reason: null,
    assetType, suggestedRole, extractedRef, extractionMethod,
    matchedProductId: productId, matchedSku,
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeDetail(
  base: Omit<DryRunFileDetail, "status" | "action" | "reason" | "matchedProductId" | "matchedSku" | "extractedRef" | "extractionMethod" | "assetType" | "suggestedRole">,
  overrides: Partial<DryRunFileDetail> & { status: DryRunStatus; action: DryRunFileDetail["action"] },
): DryRunFileDetail {
  return {
    ...base,
    extractedRef:     null,
    extractionMethod: "none",
    matchedProductId: null,
    matchedSku:       null,
    assetType:        "UNSUPPORTED",
    suggestedRole:    "GALLERY",
    reason:           null,
    ...overrides,
  };
}

function classifyMimeToAssetType(mime: string): AssetTypeClassification {
  if (mime.startsWith("image/"))                  return "FOTO";
  if (mime.startsWith("video/"))                  return "VIDEO";
  if (mime === "application/pdf")                 return "BANNER_PIEZA";
  return "UNSUPPORTED";
}

function mapDetectedToSuggested(
  detectedRole: string,
  assetType:    AssetTypeClassification,
): SuggestedRole {
  if (assetType === "VIDEO")        return "VIDEO";
  if (assetType === "BANNER_PIEZA") return "BANNER";

  switch (detectedRole) {
    case "hero":       return "HERO";
    case "raw_back":   return "BACK";
    case "raw_detail": return "DETAIL";
    case "video":      return "VIDEO";
    case "document":   return "DOCUMENT";
    case "gallery":
    default:           return "GALLERY";
  }
}

function buildSummary(
  files:            DryRunFileDetail[],
  totalFolders:     number,
  permissionErrors: string[],
): DryRunSummary {
  const statusBreakdown = {} as Record<DryRunStatus, number>;
  const assetTypeBreakdown = {} as Record<AssetTypeClassification, number>;
  const matchedRefs = new Set<string>();
  const unmatchedRefs = new Set<string>();
  let readyToImport = 0;
  let skipped = 0;
  let rejected = 0;

  for (const f of files) {
    // Status breakdown
    statusBreakdown[f.status] = (statusBreakdown[f.status] ?? 0) + 1;

    // Asset type breakdown
    assetTypeBreakdown[f.assetType] = (assetTypeBreakdown[f.assetType] ?? 0) + 1;

    // Action counts
    switch (f.action) {
      case "IMPORT": readyToImport++; break;
      case "SKIP":   skipped++;       break;
      case "REJECT": rejected++;      break;
    }

    // Ref tracking
    if (f.extractedRef) {
      if (f.matchedProductId) {
        matchedRefs.add(f.extractedRef);
      } else {
        unmatchedRefs.add(f.extractedRef);
      }
    }
  }

  return {
    totalScanned:       files.length,
    readyToImport,
    skipped,
    rejected,
    statusBreakdown,
    assetTypeBreakdown,
    uniqueRefsMatched:   matchedRefs.size,
    uniqueRefsUnmatched: unmatchedRefs.size,
    totalFolders,
    permissionErrors,
  };
}
