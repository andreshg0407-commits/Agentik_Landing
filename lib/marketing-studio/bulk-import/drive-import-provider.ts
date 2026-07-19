/**
 * lib/marketing-studio/bulk-import/drive-import-provider.ts
 *
 * MARKETING-STUDIO-DRIVE-IMPORT-01 — Google Drive ImportProvider (client side)
 *
 * This module runs in the browser and NEVER calls Google Drive APIs directly.
 * All Drive operations go through the server proxy routes:
 *   /api/orgs/{orgSlug}/marketing-studio/drive          — status + structure
 *   /api/orgs/{orgSlug}/marketing-studio/drive/file     — file download
 *
 * SECURITY:
 * - No OAuth tokens handled here — strictly client-facing interface.
 * - All sensitive operations delegated to server routes.
 */

import type { ParsedImportStructure } from "./import-types";

// ── Response types ─────────────────────────────────────────────────────────────

export interface DriveStructureApiResponse {
  structure:        ParsedImportStructure;
  folderName:       string;
  ignoredCount:     number;
  permissionErrors: string[];
}

// ── Status check ──────────────────────────────────────────────────────────────

/**
 * Returns true if Google Drive is connected for this org.
 * Calls the server proxy — no token exposure.
 * Never throws — returns false on any error.
 */
export async function checkDriveStatus(orgSlug: string): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/orgs/${orgSlug}/marketing-studio/drive?action=status`,
    );
    if (!res.ok) return false;
    const data = await res.json() as { connected?: boolean };
    return data.connected === true;
  } catch {
    return false;
  }
}

// ── Folder URL parser ─────────────────────────────────────────────────────────

/**
 * Extracts a Google Drive folder ID from a URL or raw ID.
 * Inlined here to avoid importing from server-only drive-api-client.ts.
 *
 * Supported patterns:
 *   https://drive.google.com/drive/folders/FOLDER_ID
 *   https://drive.google.com/drive/u/0/folders/FOLDER_ID
 *   https://drive.google.com/open?id=FOLDER_ID
 *   Raw folder ID (25–44 alphanumeric chars)
 */
export function parseDriveFolderUrlClient(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const foldersMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]{20,})/);
  if (foldersMatch) return foldersMatch[1];

  const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (idMatch) return idMatch[1];

  if (/^[a-zA-Z0-9_-]{25,44}$/.test(trimmed)) return trimmed;

  return null;
}

// ── Structure reader ──────────────────────────────────────────────────────────

/**
 * Reads a Google Drive folder structure via the server proxy.
 *
 * Returns ParsedImportStructure where:
 * - file = null for every ParsedFile (lazy download at execution time)
 * - driveFileId = Google Drive file ID for each asset
 *
 * The wizard executor calls resolveDriveFile() to download each file
 * right before uploading it to the assets endpoint.
 */
export async function parseDriveFolder(
  folderUrl: string,
  orgSlug:   string,
): Promise<DriveStructureApiResponse> {
  const folderId = parseDriveFolderUrlClient(folderUrl);
  if (!folderId) {
    throw new Error(
      "URL de carpeta inválida. Pega la URL completa desde Google Drive (contiene /folders/…).",
    );
  }

  const res = await fetch(
    `/api/orgs/${orgSlug}/marketing-studio/drive?action=structure&folderId=${encodeURIComponent(folderId)}`,
  );

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: "Error desconocido" })) as { error: string };
    const errMsg  = errData.error ?? "Error al leer la carpeta de Drive";

    if (errMsg === "DRIVE_NOT_CONNECTED") {
      throw new Error("Google Drive no está conectado. Usa el botón 'Conectar Google Drive' primero.");
    }
    if (errMsg === "DRIVE_TOKEN_EXPIRED") {
      throw new Error("La sesión de Google Drive expiró. Vuelve a conectar tu cuenta.");
    }
    throw new Error(errMsg);
  }

  return res.json() as Promise<DriveStructureApiResponse>;
}

// ── Lazy file resolver ────────────────────────────────────────────────────────

/**
 * Downloads a Drive file at execution time via the server proxy.
 *
 * This is called by the wizard's executeImport() for each asset
 * where parsedFile.file === null and parsedFile.driveFileId is set.
 *
 * No token handling here — the server route manages auth.
 */
export async function resolveDriveFile(params: {
  orgSlug:     string;
  driveFileId: string;
  fileName:    string;
  mimeType:    string;
}): Promise<File> {
  const url =
    `/api/orgs/${params.orgSlug}/marketing-studio/drive/file` +
    `?fileId=${encodeURIComponent(params.driveFileId)}` +
    `&fileName=${encodeURIComponent(params.fileName)}` +
    `&mimeType=${encodeURIComponent(params.mimeType)}`;

  const res = await fetch(url);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: "Download failed" })) as { error: string };
    throw new Error(errData.error ?? `Error al descargar "${params.fileName}" desde Drive`);
  }

  const blob = await res.blob();
  return new File([blob], params.fileName, { type: params.mimeType });
}
