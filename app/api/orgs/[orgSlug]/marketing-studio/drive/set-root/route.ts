/**
 * app/api/orgs/[orgSlug]/marketing-studio/drive/set-root/route.ts
 *
 * MARKETING-DRIVE-BULK-ASSET-INGESTION-04A — Set Tenant Drive Root
 *
 * POST { folderId: string }
 *   Sets the tenant's authorized Drive root folder.
 *   Admin-only (AGENTIK_ADMIN or ORG_ADMIN).
 *   Validates folder is accessible and is actually a folder.
 *   Stores in IntegrationResource (no migration needed).
 *
 * GET
 *   Returns the current tenant root configuration.
 *
 * SECURITY:
 * - Admin gate: platformRole SUPER_ADMIN/AGENTIK_ADMIN OR membership.role ORG_ADMIN
 * - Explicitly denied: MANAGER, OPERATOR, VIEWER, BILLING, null, unknown
 * - organizationId from requireOrgAccess() server session (never from client)
 * - No role, platformRole, organizationId, or orgSlug accepted from body/query
 * - folderId validated via Drive API before storage
 * - connectionId resolved server-side from org's Drive connection
 */

import { NextRequest, NextResponse }      from "next/server";
import { requireOrgAccess }               from "@/lib/auth/org-access";
import { canAccessMarketingStudio }              from "@/lib/auth/module-access";
import {
  getDriveConnection,
  getDriveAccessToken,
  validateDriveFolder,
  parseDriveFolderUrl,
}                                         from "@/lib/marketing-studio/drive/drive-api-client";
import {
  getTenantDriveRoot,
  setTenantDriveRoot,
}                                         from "@/lib/marketing-studio/drive/drive-tenant-root";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ orgSlug: string }> };

// ── GET: Current root config ────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  try {
    const { membership, organization } = await requireOrgAccess(orgSlug);
    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "ACCESS_DENIED" }, { status: 403 });
    }

    const root = await getTenantDriveRoot(organization.id);

    return NextResponse.json({
      configured: root !== null,
      folderId:   root?.folderId ?? null,
      folderName: root?.folderName ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: msg }, { status: 403 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── POST: Set root folder ───────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  try {
    const { membership, organization, platformRole } = await requireOrgAccess(orgSlug);
    const organizationId = organization.id;

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "ACCESS_DENIED" }, { status: 403 });
    }

    // ── Admin gate (04A-D-R1) ─────────────────────────────────────────────
    // Authorize ONLY when:
    //   platformRole === "SUPER_ADMIN"
    //   OR platformRole === "AGENTIK_ADMIN"
    //   OR membership.role === "ORG_ADMIN"
    // Explicitly denied: MANAGER, OPERATOR, VIEWER, BILLING, null, unknown.
    // organizationId comes from requireOrgAccess() — never from body/query.
    const isSetRootAuthorized =
      platformRole === "SUPER_ADMIN" ||
      platformRole === "AGENTIK_ADMIN" ||
      membership.role === "ORG_ADMIN";

    if (!isSetRootAuthorized) {
      return NextResponse.json(
        { error: "SET_ROOT_DENIED", message: "Admin access required to set Drive root folder" },
        { status: 403 },
      );
    }

    // Parse body
    const body = await req.json() as { folderId?: string };
    const rawFolderId = body.folderId;
    if (!rawFolderId || typeof rawFolderId !== "string") {
      return NextResponse.json({ error: "folderId is required" }, { status: 400 });
    }

    const folderId = parseDriveFolderUrl(rawFolderId) ?? rawFolderId.trim();
    if (!folderId || folderId.length < 10) {
      return NextResponse.json({ error: "Invalid folder ID" }, { status: 400 });
    }

    // Resolve Drive connection
    const conn = await getDriveConnection(organizationId);
    if (!conn) {
      return NextResponse.json({ error: "DRIVE_NOT_CONNECTED" }, { status: 403 });
    }

    // Acquire access token
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

    // Validate folder exists and is accessible
    const folder = await validateDriveFolder(folderId, accessToken);

    // Store tenant root
    const root = await setTenantDriveRoot({
      organizationId,
      connectionId: conn.connectionId,
      folderId:     folder.id,
      folderName:   folder.name,
    });

    return NextResponse.json({
      ok:         true,
      folderId:   root.folderId,
      folderName: root.folderName,
      resourceId: root.resourceId,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    if (msg === "UNAUTHENTICATED")         return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")           return NextResponse.json({ error: msg }, { status: 403 });
    if (msg === "DRIVE_PERMISSION_DENIED") return NextResponse.json({ error: "Sin permisos para acceder a esta carpeta" }, { status: 403 });
    if (msg === "DRIVE_FOLDER_NOT_FOUND")  return NextResponse.json({ error: "Carpeta no encontrada en Google Drive" }, { status: 404 });
    if (msg === "DRIVE_NOT_A_FOLDER")      return NextResponse.json({ error: "El ID no corresponde a una carpeta" }, { status: 400 });
    console.error("[marketing-studio/drive/set-root POST]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
