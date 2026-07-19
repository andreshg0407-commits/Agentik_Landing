/**
 * app/api/orgs/[orgSlug]/marketing-studio/drive/route.ts
 *
 * MARKETING-STUDIO-DRIVE-IMPORT-01 — Drive proxy: status + structure
 *
 * GET ?action=status
 *   Returns { connected: boolean }
 *   Does NOT expose any token or account info.
 *
 * GET ?action=structure&folderId=FOLDER_ID_OR_URL
 *   Reads the Drive folder structure recursively.
 *   Returns { structure: ParsedImportStructure, folderName, ignoredCount, permissionErrors }
 *   ParsedFile.file is always null (Drive: lazy download at execution).
 *   ParsedFile.driveFileId is set for each file.
 *
 * SECURITY:
 * - requireOrgAccess: verifies auth + org membership.
 * - Tokens are fetched server-side — NEVER returned to the client.
 * - No Drive account info (email, ID) is returned for status check.
 * - Tenant-isolated: organizationId scopes all vault + connection lookups.
 */

import { NextRequest, NextResponse }      from "next/server";
import { requireOrgAccess }               from "@/lib/auth/org-access";
import {
  getDriveConnection,
  getDriveAccessToken,
  buildDriveStructure,
  parseDriveFolderUrl,
}                                         from "@/lib/marketing-studio/drive/drive-api-client";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ orgSlug: string }> };

export async function GET(
  req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  try {
    const { organization } = await requireOrgAccess(orgSlug);
    const organizationId   = organization.id;
    const action           = req.nextUrl.searchParams.get("action") ?? "status";

    // ── Status ────────────────────────────────────────────────────────────────
    if (action === "status") {
      const conn = await getDriveConnection(organizationId);
      return NextResponse.json({ connected: conn !== null });
    }

    // ── Structure ─────────────────────────────────────────────────────────────
    if (action === "structure") {
      const rawInput = req.nextUrl.searchParams.get("folderId") ?? "";
      const folderId = parseDriveFolderUrl(rawInput) ?? rawInput;

      if (!folderId || folderId.length < 10) {
        return NextResponse.json(
          { error: "URL de carpeta de Google Drive inválida" },
          { status: 400 },
        );
      }

      const conn = await getDriveConnection(organizationId);
      if (!conn) {
        return NextResponse.json({ error: "DRIVE_NOT_CONNECTED" }, { status: 403 });
      }

      let accessToken: string;
      try {
        accessToken = await getDriveAccessToken(conn);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("DRIVE_TOKEN_EXPIRED")) {
          return NextResponse.json({ error: "DRIVE_TOKEN_EXPIRED" }, { status: 401 });
        }
        throw err;
      }

      const result = await buildDriveStructure(folderId, accessToken);

      return NextResponse.json({
        structure:        result.structure,
        folderName:       result.folderName,
        ignoredCount:     result.ignoredCount,
        permissionErrors: result.permissionErrors,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    if (msg === "UNAUTHENTICATED")         return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")           return NextResponse.json({ error: msg }, { status: 403 });
    if (msg === "DRIVE_NOT_CONNECTED")     return NextResponse.json({ error: msg }, { status: 403 });
    if (msg === "DRIVE_PERMISSION_DENIED") return NextResponse.json({ error: "Sin permisos para acceder a esta carpeta" }, { status: 403 });
    if (msg === "DRIVE_FOLDER_NOT_FOUND")  return NextResponse.json({ error: "Carpeta no encontrada en Google Drive" }, { status: 404 });
    if (msg === "DRIVE_NOT_A_FOLDER")      return NextResponse.json({ error: "El ID no corresponde a una carpeta" }, { status: 400 });
    if (msg === "DRIVE_TOKEN_EXPIRED")     return NextResponse.json({ error: msg }, { status: 401 });
    console.error("[marketing-studio/drive GET]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
