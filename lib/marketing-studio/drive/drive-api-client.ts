/**
 * lib/marketing-studio/drive/drive-api-client.ts
 *
 * MARKETING-STUDIO-DRIVE-IMPORT-01 — Server-side Google Drive API client
 *
 * Responsibilities:
 *   - Retrieve and refresh OAuth tokens from vault (transparent to callers)
 *   - Validate Drive folder accessibility
 *   - Read folder structure recursively → ParsedImportStructure
 *   - Download individual files (called by the file proxy route)
 *   - Parse Drive folder URLs to extract folder IDs
 *
 * SECURITY:
 * - SERVER ONLY — never import from client components.
 * - Tokens are fetched from vault and used exclusively server-side.
 * - No token values are logged or returned to callers.
 * - Tenant-isolated: organizationId required on all operations.
 * - Rate-limit mitigation: caps at DRIVE_MAX_TOTAL_FILES.
 */

import { prisma }                    from "@/lib/prisma";
import {
  getIntegrationSecret,
  storeIntegrationSecret,
}                                    from "@/lib/integrations/vault/vault-service";
import {
  refreshGoogleAccessToken,
  getGoogleCredentials,
  DRIVE_MAX_FILES_PER_FOLDER,
  DRIVE_MAX_TOTAL_FILES,
}                                    from "@/lib/integrations/oauth/providers/google-drive-oauth";
import {
  classifyAssetRole,
  isImportableFile,
  mimeFromExtension,
}                                    from "@/lib/marketing-studio/bulk-import/asset-role-mapper";
import type {
  ParsedImportStructure,
  ParsedCategory,
  ParsedReference,
  ParsedFile,
}                                    from "@/lib/marketing-studio/bulk-import/import-types";

// ── Constants ──────────────────────────────────────────────────────────────────

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";

/** Google Workspace native types — not downloadable as binary, skip silently */
const GOOGLE_NATIVE_MIME_SKIP = new Set([
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
  "application/vnd.google-apps.form",
  "application/vnd.google-apps.drawing",
  "application/vnd.google-apps.site",
  "application/vnd.google-apps.script",
  "application/vnd.google-apps.shortcut",
]);

// ── Connection handle ─────────────────────────────────────────────────────────

export interface DriveConnection {
  connectionId:   string;
  organizationId: string;
}

/**
 * Returns the active Google Drive connection for an org, or null if not connected.
 */
export async function getDriveConnection(
  organizationId: string,
): Promise<DriveConnection | null> {
  const conn = await prisma.integrationConnection.findFirst({
    where: {
      organizationId,
      provider: "google_drive",
      status:   "connected",
    },
    select:  { id: true },
    orderBy: { connectedAt: "desc" },
  });
  return conn ? { connectionId: conn.id, organizationId } : null;
}

// ── Token management ──────────────────────────────────────────────────────────

/**
 * Returns a valid access token, refreshing it automatically if expired.
 * SERVER ONLY — the returned token must never be sent to the client.
 */
export async function getDriveAccessToken(conn: DriveConnection): Promise<string> {
  const secret = await getIntegrationSecret({
    organizationId: conn.organizationId,
    connectionId:   conn.connectionId,
    secretType:     "access_token",
  });

  if (secret && !secret.isExpired) {
    return secret.plainValue;  // ⚠ server-only
  }

  // Token absent or expired — attempt refresh
  const refreshSecret = await getIntegrationSecret({
    organizationId: conn.organizationId,
    connectionId:   conn.connectionId,
    secretType:     "refresh_token",
  });

  if (!refreshSecret) {
    throw new Error("DRIVE_TOKEN_EXPIRED: no refresh token available — user must reconnect Google Drive");
  }

  let creds;
  try {
    creds = getGoogleCredentials();
  } catch {
    throw new Error("DRIVE_TOKEN_EXPIRED: Google credentials not configured");
  }

  const refreshed = await refreshGoogleAccessToken({
    refreshToken: refreshSecret.plainValue,  // ⚠ server-only
    clientId:     creds.clientId,
    clientSecret: creds.clientSecret,        // ⚠ server-only
  });

  // Persist new access token
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
  await storeIntegrationSecret({
    organizationId: conn.organizationId,
    connectionId:   conn.connectionId,
    secretType:     "access_token",
    plainValue:     refreshed.access_token,  // ⚠ encrypted at rest
    expiresAt,
  });

  return refreshed.access_token;  // ⚠ server-only
}

// ── Drive API helpers ─────────────────────────────────────────────────────────

interface DriveFile {
  id:       string;
  name:     string;
  mimeType: string;
  size?:    string;
}

interface DriveFileListResponse {
  files:          DriveFile[];
  nextPageToken?: string;
}

async function listFolderContents(
  folderId:    string,
  accessToken: string,
): Promise<DriveFile[]> {
  const results: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${DRIVE_API_BASE}/files`);
    url.searchParams.set("q",          `'${folderId}' in parents and trashed = false`);
    url.searchParams.set("fields",     "files(id,name,mimeType,size),nextPageToken");
    url.searchParams.set("pageSize",   String(DRIVE_MAX_FILES_PER_FOLDER));
    url.searchParams.set("supportsAllDrives",          "true");
    url.searchParams.set("includeItemsFromAllDrives",  "true");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },  // ⚠ server-only
    });

    if (res.status === 401 || res.status === 403) throw new Error("DRIVE_PERMISSION_DENIED");
    if (res.status === 404)                       throw new Error("DRIVE_FOLDER_NOT_FOUND");
    if (!res.ok)                                  throw new Error(`Drive API error: ${res.status}`);

    const data = await res.json() as DriveFileListResponse;
    results.push(...(data.files ?? []));
    pageToken = data.nextPageToken;

  } while (pageToken && results.length < DRIVE_MAX_FILES_PER_FOLDER);

  return results;
}

// ── Folder validation ─────────────────────────────────────────────────────────

/**
 * Validates that a folder ID is accessible and is actually a folder.
 * Returns folder name on success, throws a typed error on failure.
 */
export async function validateDriveFolder(
  folderId:    string,
  accessToken: string,
): Promise<{ id: string; name: string }> {
  const url = new URL(`${DRIVE_API_BASE}/files/${encodeURIComponent(folderId)}`);
  url.searchParams.set("fields",           "id,name,mimeType");
  url.searchParams.set("supportsAllDrives", "true");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 404) throw new Error("DRIVE_FOLDER_NOT_FOUND");
  if (res.status === 403) throw new Error("DRIVE_PERMISSION_DENIED");
  if (!res.ok)            throw new Error(`Drive folder validation failed: ${res.status}`);

  const data = await res.json() as { id: string; name: string; mimeType: string };
  if (!data.mimeType.includes("folder")) {
    throw new Error("DRIVE_NOT_A_FOLDER");
  }
  return { id: data.id, name: data.name };
}

// ── Structure builder ─────────────────────────────────────────────────────────

export interface DriveStructureResult {
  structure:        ParsedImportStructure;
  folderName:       string;
  ignoredCount:     number;
  permissionErrors: string[];
}

/**
 * Reads a Drive folder recursively (3 levels) and builds a ParsedImportStructure.
 *
 * Expected layout:
 *   Level 0: root (selected folder — stripped)
 *   Level 1: categories  (e.g. "Niño", "Niña", "Bebé")
 *   Level 2: references  (e.g. "REF-001 Pijama Estrellas")
 *   Level 3: asset files (e.g. "frontal.jpg", "trasera.jpg")
 *
 * ParsedFile.file is null — files are downloaded lazily at execution time.
 * ParsedFile.driveFileId holds the Drive file ID for later download.
 */
export async function buildDriveStructure(
  folderId:    string,
  accessToken: string,
): Promise<DriveStructureResult> {
  const rootFolder = await validateDriveFolder(folderId, accessToken);

  const categoryMap     = new Map<string, Map<string, ParsedFile[]>>();
  const permissionErrors: string[] = [];
  let   ignoredCount    = 0;
  let   totalFiles      = 0;
  let   totalImages     = 0;
  let   hitLimit        = false;

  // Level 1: categories
  const level1 = await listFolderContents(folderId, accessToken);

  for (const catItem of level1) {
    if (hitLimit) break;
    if (!catItem.mimeType.includes("folder")) { ignoredCount++; continue; }

    const catName = catItem.name.trim();

    // Level 2: references
    let level2: DriveFile[] = [];
    try {
      level2 = await listFolderContents(catItem.id, accessToken);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("PERMISSION")) {
        permissionErrors.push(`Sin acceso a categoría: ${catName}`);
      } else { throw err; }
      continue;
    }

    for (const refItem of level2) {
      if (hitLimit) break;
      if (!refItem.mimeType.includes("folder")) { ignoredCount++; continue; }

      const refName = refItem.name.trim();

      // Level 3: asset files
      let level3: DriveFile[] = [];
      try {
        level3 = await listFolderContents(refItem.id, accessToken);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("PERMISSION")) {
          permissionErrors.push(`Sin acceso a referencia: ${catName}/${refName}`);
        } else { throw err; }
        continue;
      }

      for (const assetItem of level3) {
        if (hitLimit) break;

        // Skip folders deeper than level 3
        if (assetItem.mimeType.includes("folder"))      { ignoredCount++; continue; }
        // Skip Google Workspace native types
        if (GOOGLE_NATIVE_MIME_SKIP.has(assetItem.mimeType)) { ignoredCount++; continue; }
        // Skip hidden files (macOS .DS_Store, Thumbs.db, etc.)
        if (assetItem.name.startsWith("."))             { ignoredCount++; continue; }
        // Skip non-importable extensions
        if (!isImportableFile(assetItem.name))          { ignoredCount++; continue; }

        totalFiles++;
        const mime  = assetItem.mimeType || mimeFromExtension(assetItem.name);
        const role  = classifyAssetRole(assetItem.name);
        if (mime.startsWith("image/")) totalImages++;

        const parsedFile: ParsedFile = {
          name:        assetItem.name,
          path:        `${catName}/${refName}/${assetItem.name}`,
          file:        null,           // Drive: lazy download at execution
          mimeType:    mime,
          role,
          driveFileId: assetItem.id,  // used by resolveDriveFile()
        };

        if (!categoryMap.has(catName)) categoryMap.set(catName, new Map());
        const refMap = categoryMap.get(catName)!;
        if (!refMap.has(refName)) refMap.set(refName, []);
        refMap.get(refName)!.push(parsedFile);

        if (totalFiles >= DRIVE_MAX_TOTAL_FILES) {
          permissionErrors.push(
            `Límite de ${DRIVE_MAX_TOTAL_FILES} archivos alcanzado. Solo se procesaron los primeros.`,
          );
          hitLimit = true;
        }
      }
    }
  }

  // Assemble categories
  const categories: ParsedCategory[] = [];
  for (const [catName, refMap] of categoryMap) {
    const references: ParsedReference[] = [];
    for (const [refName, files] of refMap) {
      references.push({ name: refName, sku: tryExtractSku(refName), files });
    }
    references.sort((a, b) => a.name.localeCompare(b.name, "es"));
    categories.push({ name: catName, references });
  }
  categories.sort((a, b) => a.name.localeCompare(b.name, "es"));

  return {
    structure: {
      source:       "google_drive",
      categories,
      unknownFiles: [],
      totalFiles,
      totalImages,
    },
    folderName:     rootFolder.name,
    ignoredCount,
    permissionErrors,
  };
}

// ── File download ─────────────────────────────────────────────────────────────

/**
 * Downloads a Drive file by ID and returns its raw bytes.
 * SERVER ONLY — access token never returned to client.
 */
export async function downloadDriveFile(
  fileId:      string,
  accessToken: string,
): Promise<ArrayBuffer> {
  const url = new URL(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set("alt",               "media");
  url.searchParams.set("supportsAllDrives", "true");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },  // ⚠ server-only
  });

  if (res.status === 403) throw new Error("DRIVE_PERMISSION_DENIED");
  if (res.status === 404) throw new Error("DRIVE_FILE_NOT_FOUND");
  if (!res.ok)            throw new Error(`Drive download failed: ${res.status}`);

  return res.arrayBuffer();
}

// ── Folder URL parser ─────────────────────────────────────────────────────────

/**
 * Extracts a Google Drive folder ID from a URL or raw ID.
 *
 * Supported patterns:
 *   https://drive.google.com/drive/folders/FOLDER_ID
 *   https://drive.google.com/drive/u/0/folders/FOLDER_ID
 *   https://drive.google.com/open?id=FOLDER_ID
 *   Raw folder ID (25–44 alphanumeric chars)
 */
export function parseDriveFolderUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // /folders/FOLDER_ID
  const foldersMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]{20,})/);
  if (foldersMatch) return foldersMatch[1];

  // ?id=FOLDER_ID or &id=FOLDER_ID
  const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (idMatch) return idMatch[1];

  // Raw Drive ID (25–44 base64url chars)
  if (/^[a-zA-Z0-9_-]{25,44}$/.test(trimmed)) return trimmed;

  return null;
}

// ── SKU extraction (mirrors structure-parser) ─────────────────────────────────

function tryExtractSku(name: string): string | undefined {
  const startMatch = name.match(/^([A-Za-z]{2,5}-\d{3,6})\s/);
  if (startMatch) return startMatch[1].toUpperCase();
  const bracketMatch = name.match(/\[([A-Za-z0-9-]+)\]/);
  if (bracketMatch) return bracketMatch[1].toUpperCase();
  return undefined;
}
