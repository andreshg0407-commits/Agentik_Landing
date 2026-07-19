/**
 * app/api/orgs/[orgSlug]/marketing-studio/drive/file/route.ts
 *
 * MARKETING-STUDIO-DRIVE-IMPORT-01 — Drive file download proxy
 *
 * GET ?fileId=...&fileName=...&mimeType=...
 *   Downloads a file from Google Drive and streams the bytes to the client.
 *   The access token is fetched server-side — never exposed to the browser.
 *
 * Called by resolveDriveFile() in drive-import-provider.ts during wizard execution.
 * Each asset file in a Drive import is downloaded on-demand at execution time.
 *
 * SECURITY:
 * - requireOrgAccess: verifies auth + org membership.
 * - Access token is fetched from vault — never returned or logged.
 * - File size capped at MAX_FILE_SIZE_BYTES to prevent memory exhaustion.
 * - Cache-Control: private, no-cache — file content must not be cached by intermediaries.
 */

import { NextRequest, NextResponse }   from "next/server";
import { requireOrgAccess }            from "@/lib/auth/org-access";
import {
  getDriveConnection,
  getDriveAccessToken,
  downloadDriveFile,
}                                      from "@/lib/marketing-studio/drive/drive-api-client";

export const runtime = "nodejs";

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

type RouteContext = { params: Promise<{ orgSlug: string }> };

export async function GET(
  req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  try {
    const { organization } = await requireOrgAccess(orgSlug);
    const organizationId   = organization.id;

    const fileId   = req.nextUrl.searchParams.get("fileId");
    const fileName = req.nextUrl.searchParams.get("fileName") ?? "file";
    const mimeType = req.nextUrl.searchParams.get("mimeType") ?? "application/octet-stream";

    if (!fileId) {
      return NextResponse.json({ error: "fileId required" }, { status: 400 });
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

    const buffer = await downloadDriveFile(fileId, accessToken);

    if (buffer.byteLength > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `Archivo demasiado grande: "${fileName}" supera el límite de 50 MB` },
        { status: 413 },
      );
    }

    return new NextResponse(buffer, {
      status:  200,
      headers: {
        "Content-Type":        mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
        "Content-Length":      String(buffer.byteLength),
        "Cache-Control":       "private, no-cache",
      },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    if (msg === "UNAUTHENTICATED")         return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")           return NextResponse.json({ error: msg }, { status: 403 });
    if (msg === "DRIVE_PERMISSION_DENIED") return NextResponse.json({ error: "Sin permisos para descargar este archivo" }, { status: 403 });
    if (msg === "DRIVE_FILE_NOT_FOUND")    return NextResponse.json({ error: "Archivo no encontrado en Drive" }, { status: 404 });
    if (msg === "DRIVE_TOKEN_EXPIRED")     return NextResponse.json({ error: msg }, { status: 401 });
    console.error("[marketing-studio/drive/file GET]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
