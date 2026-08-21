/**
 * app/api/orgs/[orgSlug]/marketing-studio/drive/route.ts
 *
 * MARKETING-DRIVE-BULK-ASSET-INGESTION-04A — Drive proxy: status + structure + dry-run
 *
 * GET ?action=status
 *   Returns { connected: boolean, tenantRootConfigured: boolean }
 *
 * GET ?action=structure&folderId=FOLDER_ID_OR_URL
 *   Reads the Drive folder structure recursively.
 *   Requires tenant root. Validates folder is descendant of root.
 *   Returns { structure, folderName, ignoredCount, permissionErrors }
 *
 * GET ?action=dry-run&folderId=FOLDER_ID_OR_URL
 *   ZERO WRITES. Scans Drive folder, matches files against tenant catalog.
 *   Returns full DryRunResult with 14 status codes per file.
 *   Requires tenant root. Validates folder ancestry.
 *
 * SECURITY:
 * - requireOrgAccess: verifies auth + org membership.
 * - canAccessMarketingStudio: verifies module access.
 * - Tokens are fetched server-side — NEVER returned to the client.
 * - Tenant-isolated: organizationId from server session scopes all queries.
 * - Tenant root: folderId must be descendant of configured root (ancestry walk).
 * - Fail closed: if ancestry cannot be verified, request is rejected.
 */

import { NextRequest, NextResponse }      from "next/server";
import { requireOrgAccess }               from "@/lib/auth/org-access";
import { canAccessMarketingStudio }       from "@/lib/auth/module-access";
import {
  getDriveConnection,
  getDriveAccessToken,
  buildDriveStructure,
  parseDriveFolderUrl,
  isDescendantOfRoot,
  scanDriveFolder,
}                                         from "@/lib/marketing-studio/drive/drive-api-client";
import { getTenantDriveRoot }             from "@/lib/marketing-studio/drive/drive-tenant-root";
import { runDryRun }                      from "@/lib/marketing-studio/bulk-import/drive-dry-run-engine";
import {
  buildProductMapsForDryRun,
  getImportedDriveFileIds,
}                                         from "@/lib/marketing-studio/products/product-asset-map-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ orgSlug: string }> };

export async function GET(
  req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  try {
    const { membership, organization } = await requireOrgAccess(orgSlug);
    const organizationId   = organization.id;

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "ACCESS_DENIED" }, { status: 403 });
    }

    const action = req.nextUrl.searchParams.get("action") ?? "status";

    // ── Status ────────────────────────────────────────────────────────────────
    if (action === "status") {
      const conn = await getDriveConnection(organizationId);
      const root = await getTenantDriveRoot(organizationId);
      return NextResponse.json({
        connected:             conn !== null,
        tenantRootConfigured:  root !== null,
        tenantRootFolderName:  root?.folderName ?? null,
      });
    }

    // ── Common gate: resolve connection and tenant root ───────────────────
    if (action === "structure" || action === "dry-run") {
      const rawInput = req.nextUrl.searchParams.get("folderId") ?? "";
      const folderId = parseDriveFolderUrl(rawInput) ?? rawInput;

      if (!folderId || folderId.length < 10) {
        return NextResponse.json(
          { error: "URL de carpeta de Google Drive invalida" },
          { status: 400 },
        );
      }

      // Resolve Drive connection
      const conn = await getDriveConnection(organizationId);
      if (!conn) {
        return NextResponse.json({ error: "DRIVE_NOT_CONNECTED" }, { status: 403 });
      }

      // Resolve tenant root — REQUIRED
      const tenantRoot = await getTenantDriveRoot(organizationId);
      if (!tenantRoot) {
        return NextResponse.json(
          {
            error:   "DRIVE_TENANT_ROOT_NOT_CONFIGURED",
            message: "Drive import blocked — tenant root folder not registered. " +
                     "An admin must select the root folder before scanning.",
          },
          { status: 503 },
        );
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

      // Validate folder is descendant of tenant root (fail closed)
      const isDescendant = await isDescendantOfRoot(folderId, tenantRoot.folderId, accessToken);
      if (!isDescendant) {
        return NextResponse.json(
          {
            error:   "OUTSIDE_TENANT_ROOT",
            message: "La carpeta seleccionada no pertenece al root configurado del tenant.",
          },
          { status: 403 },
        );
      }

      // ── Structure ──────────────────────────────────────────────────────────
      if (action === "structure") {
        const result = await buildDriveStructure(folderId, accessToken);

        return NextResponse.json({
          structure:        result.structure,
          folderName:       result.folderName,
          ignoredCount:     result.ignoredCount,
          permissionErrors: result.permissionErrors,
        });
      }

      // ── Dry-run (04A Section F) ────────────────────────────────────────────
      // ZERO WRITES. Read-only scan + analysis.
      if (action === "dry-run") {
        // 1. Scan Drive folder recursively
        const scanResult = await scanDriveFolder(folderId, accessToken);

        // 2. Build product maps for matching
        const productMaps = await buildProductMapsForDryRun(organizationId);
        const importedDriveIds = await getImportedDriveFileIds(organizationId);

        // 3. Build active product IDs set (products with SKU that exist)
        const activeProductIds = new Set(productMaps.skuToProduct.values());

        // 4. Run dry-run analysis
        const dryRunResult = runDryRun(
          scanResult.files,
          scanResult.totalFolders,
          scanResult.permissionErrors,
          {
            organizationId,
            tenantRootId:     tenantRoot.folderId,
            tenantRootName:   tenantRoot.folderName,
            skuToProduct:     productMaps.skuToProduct,
            skuCounts:        productMaps.skuCounts,
            productsWithHero: productMaps.productsWithHero,
            importedDriveIds,
            activeProductIds,
          },
        );

        return NextResponse.json(dryRunResult);
      }
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
