/**
 * app/api/orgs/[orgSlug]/marketing-studio/drive/route.ts
 *
 * MARKETING-DRIVE-BULK-ASSET-INGESTION-04A/04A-D — Drive proxy
 *
 * GET ?action=status
 *   Returns { connected, tenantRootConfigured, tenantRootFolderName }
 *
 * GET ?action=structure&folderId=FOLDER_ID_OR_URL
 *   Reads the Drive folder structure recursively (3 levels).
 *
 * GET ?action=dry-run&folderId=FOLDER_ID_OR_URL
 *   ZERO WRITES. Full recursive scan + analysis in one call (legacy).
 *
 * GET ?action=scan-page&folderId=FOLDER_ID&pageToken=TOKEN&folderPath=PATH
 *   04A-D: Single-page scan of ONE folder. Server normalizes, analyzes,
 *   and classifies files against the product catalog PER PAGE.
 *   Returns DryRunFileDetail[] (not raw DriveScannedFile[]).
 *   Client accumulates server-issued analyzed rows only.
 *   Server validates ancestry on EVERY call.
 *
 * POST { action: "analyze", files: DriveScannedFile[], completeness: {...} }
 *   04A-C LEGACY: Runs dry-run analysis on pre-scanned files.
 *   04A-D: DEPRECATED — analysis now happens server-side per scan-page.
 *   Kept for backward compatibility. ZERO WRITES.
 *
 * SECURITY:
 * - requireOrgAccess: verifies auth + org membership.
 * - canAccessMarketingStudio: verifies module access.
 * - Tokens fetched server-side — NEVER returned to client.
 * - Tenant-isolated: organizationId from server session.
 * - scan-page: validates ancestry on EVERY page request.
 * - Fail closed: unverifiable ancestry → 403.
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
  listFolderPage,
}                                         from "@/lib/marketing-studio/drive/drive-api-client";
import type { DriveScannedFile }          from "@/lib/marketing-studio/drive/drive-api-client";
import { getTenantDriveRoot }             from "@/lib/marketing-studio/drive/drive-tenant-root";
import { runDryRun }                      from "@/lib/marketing-studio/bulk-import/drive-dry-run-engine";
import {
  buildProductMapsForDryRun,
  getImportedDriveFileIds,
}                                         from "@/lib/marketing-studio/products/product-asset-map-service";
import type { ScanPageResult, DryRunCompleteness }
                                          from "@/lib/marketing-studio/bulk-import/drive-dry-run-types";
import { mimeFromExtension }              from "@/lib/marketing-studio/bulk-import/asset-role-mapper";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ orgSlug: string }> };

/** Cache-Control for all Drive proxy responses — prevent stale tenant data */
const NO_CACHE_HEADERS = { "Cache-Control": "private, no-store" };

// ── Shared gate: resolve connection + tenant root + access token ────────────

async function resolveGate(organizationId: string) {
  const conn = await getDriveConnection(organizationId);
  if (!conn) throw new Error("DRIVE_NOT_CONNECTED");

  const tenantRoot = await getTenantDriveRoot(organizationId);
  if (!tenantRoot) throw new Error("DRIVE_TENANT_ROOT_NOT_CONFIGURED");

  let accessToken: string;
  try {
    accessToken = await getDriveAccessToken(conn);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("DRIVE_TOKEN_EXPIRED")) throw new Error("DRIVE_TOKEN_EXPIRED");
    throw err;
  }

  return { conn, tenantRoot, accessToken };
}

// ── GET ────────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  try {
    const { membership, organization } = await requireOrgAccess(orgSlug);
    const organizationId = organization.id;

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "ACCESS_DENIED" }, { status: 403 });
    }

    const action = req.nextUrl.searchParams.get("action") ?? "status";

    // ── Status ──────────────────────────────────────────────────────────────
    if (action === "status") {
      const conn = await getDriveConnection(organizationId);
      const root = await getTenantDriveRoot(organizationId);
      return NextResponse.json({
        connected:             conn !== null,
        tenantRootConfigured:  root !== null,
        tenantRootFolderName:  root?.folderName ?? null,
      }, { headers: NO_CACHE_HEADERS });
    }

    // ── Scan-page (04A-C) ───────────────────────────────────────────────────
    if (action === "scan-page") {
      const rawFolderId  = req.nextUrl.searchParams.get("folderId") ?? "";
      const folderId     = parseDriveFolderUrl(rawFolderId) ?? rawFolderId;
      const pageToken    = req.nextUrl.searchParams.get("pageToken") ?? undefined;
      const folderPath   = req.nextUrl.searchParams.get("folderPath") ?? "";
      const folderName   = req.nextUrl.searchParams.get("folderName") ?? "";

      if (!folderId || folderId.length < 10) {
        return NextResponse.json({ error: "Invalid folderId" }, { status: 400 });
      }

      // Resolve gate (connection + root + token) — EVERY page request
      const { tenantRoot, accessToken } = await resolveGate(organizationId);

      // Validate ancestry on EVERY page request — fail closed
      const isDescendant = await isDescendantOfRoot(folderId, tenantRoot.folderId, accessToken);
      if (!isDescendant) {
        return NextResponse.json(
          { error: "OUTSIDE_TENANT_ROOT", message: "Folder sustituido — fuera del tenant root." },
          { status: 403 },
        );
      }

      // Fetch one page from Drive API
      let pageResult;
      const errors: string[] = [];
      try {
        pageResult = await listFolderPage(folderId, accessToken, pageToken);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error";
        errors.push(`${folderPath || "(root)"}: ${msg}`);
        const result: ScanPageResult = {
          analyzedFiles:   [],
          scannedFolders:  0,
          currentFolderId: folderId,
          nextPageToken:   null,
          childFolderIds:  [],
          complete:        false,
          truncated:       true,
          errors,
          pageSize:        0,
        };
        return NextResponse.json(result, { headers: NO_CACHE_HEADERS });
      }

      // Convert DriveFile[] to DriveScannedFile[] for engine input
      const scannedFiles: DriveScannedFile[] = [];
      for (const item of pageResult.files) {
        scannedFiles.push({
          id:         item.id,
          name:       item.name,
          mimeType:   item.mimeType || mimeFromExtension(item.name),
          size:       parseInt(item.size ?? "0", 10),
          path:       folderPath ? `${folderPath}/${item.name}` : item.name,
          parentId:   folderId,
          parentName: folderName,
        });
      }

      // 04A-D: Server-side analysis per page — client receives pre-analyzed rows
      const productMaps = await buildProductMapsForDryRun(organizationId);
      const importedDriveIds = await getImportedDriveFileIds(organizationId);
      const activeProductIds = new Set(productMaps.skuToProduct.values());

      const pageAnalysis = runDryRun(scannedFiles, 1, errors, {
        organizationId,
        tenantRootId:     tenantRoot.folderId,
        tenantRootName:   tenantRoot.folderName,
        skuToProduct:     productMaps.skuToProduct,
        skuCounts:        productMaps.skuCounts,
        productsWithHero: productMaps.productsWithHero,
        importedDriveIds,
        activeProductIds,
      });

      // Child folders with paths
      const childFolderIds = pageResult.childFolders.map(cf => ({
        id:   cf.id,
        name: cf.name,
        path: folderPath ? `${folderPath}/${cf.name}` : cf.name,
      }));

      // complete=true ONLY when: no nextPageToken AND no child folders
      // (client decides global completeness based on its queue)
      const folderExhausted = pageResult.nextPageToken === null;

      const result: ScanPageResult = {
        analyzedFiles:   pageAnalysis.files,
        scannedFolders:  1,
        currentFolderId: folderId,
        nextPageToken:   pageResult.nextPageToken,
        childFolderIds,
        complete:        folderExhausted && childFolderIds.length === 0,
        truncated:       false,
        errors,
        pageSize:        pageResult.pageSize,
      };

      return NextResponse.json(result, { headers: NO_CACHE_HEADERS });
    }

    // ── Common gate for structure/dry-run ────────────────────────────────────
    if (action === "structure" || action === "dry-run") {
      const rawInput = req.nextUrl.searchParams.get("folderId") ?? "";
      const folderId = parseDriveFolderUrl(rawInput) ?? rawInput;

      if (!folderId || folderId.length < 10) {
        return NextResponse.json(
          { error: "URL de carpeta de Google Drive invalida" },
          { status: 400 },
        );
      }

      const { tenantRoot, accessToken } = await resolveGate(organizationId);

      // Validate ancestry — fail closed
      const isDescendant = await isDescendantOfRoot(folderId, tenantRoot.folderId, accessToken);
      if (!isDescendant) {
        return NextResponse.json(
          { error: "OUTSIDE_TENANT_ROOT", message: "La carpeta seleccionada no pertenece al root configurado del tenant." },
          { status: 403 },
        );
      }

      // ── Structure ────────────────────────────────────────────────────────
      if (action === "structure") {
        const result = await buildDriveStructure(folderId, accessToken);
        return NextResponse.json({
          structure:        result.structure,
          folderName:       result.folderName,
          ignoredCount:     result.ignoredCount,
          permissionErrors: result.permissionErrors,
        });
      }

      // ── Dry-run (04A legacy — full scan + analysis) ──────────────────────
      // ZERO WRITES. Read-only scan + analysis.
      if (action === "dry-run") {
        const scanResult = await scanDriveFolder(folderId, accessToken);
        const productMaps = await buildProductMapsForDryRun(organizationId);
        const importedDriveIds = await getImportedDriveFileIds(organizationId);
        const activeProductIds = new Set(productMaps.skuToProduct.values());

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
    if (msg === "UNAUTHENTICATED")                return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")                  return NextResponse.json({ error: msg }, { status: 403 });
    if (msg === "DRIVE_NOT_CONNECTED")            return NextResponse.json({ error: msg }, { status: 403 });
    if (msg === "DRIVE_TENANT_ROOT_NOT_CONFIGURED") {
      return NextResponse.json(
        { error: msg, message: "Drive import blocked — tenant root folder not registered." },
        { status: 503 },
      );
    }
    if (msg === "DRIVE_PERMISSION_DENIED")        return NextResponse.json({ error: "Sin permisos para acceder a esta carpeta" }, { status: 403 });
    if (msg === "DRIVE_FOLDER_NOT_FOUND")         return NextResponse.json({ error: "Carpeta no encontrada en Google Drive" }, { status: 404 });
    if (msg === "DRIVE_NOT_A_FOLDER")             return NextResponse.json({ error: "El ID no corresponde a una carpeta" }, { status: 400 });
    if (msg === "DRIVE_TOKEN_EXPIRED")            return NextResponse.json({ error: msg }, { status: 401 });
    console.error("[marketing-studio/drive GET]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── POST: Analyze pre-scanned files (04A-C) ─────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  try {
    const { membership, organization } = await requireOrgAccess(orgSlug);
    const organizationId = organization.id;

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "ACCESS_DENIED" }, { status: 403 });
    }

    const body = await req.json() as {
      action:        string;
      files:         DriveScannedFile[];
      completeness:  DryRunCompleteness;
    };

    if (body.action !== "analyze") {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    if (!Array.isArray(body.files)) {
      return NextResponse.json({ error: "files array is required" }, { status: 400 });
    }

    // Resolve tenant root (server authority)
    const tenantRoot = await getTenantDriveRoot(organizationId);
    if (!tenantRoot) {
      return NextResponse.json(
        { error: "DRIVE_TENANT_ROOT_NOT_CONFIGURED" },
        { status: 503 },
      );
    }

    // Build product maps — server authority (never trust client)
    const productMaps = await buildProductMapsForDryRun(organizationId);
    const importedDriveIds = await getImportedDriveFileIds(organizationId);
    const activeProductIds = new Set(productMaps.skuToProduct.values());

    // Deduplicate by driveFileId (idempotency across pages)
    const seenIds = new Set<string>();
    const dedupedFiles: DriveScannedFile[] = [];
    for (const f of body.files) {
      if (!seenIds.has(f.id)) {
        seenIds.add(f.id);
        dedupedFiles.push(f);
      }
    }

    // Run dry-run analysis — ZERO WRITES
    const dryRunResult = runDryRun(
      dedupedFiles,
      body.completeness?.scannedFolders ?? 0,
      body.completeness?.errors ?? [],
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

    // Attach completeness to result
    return NextResponse.json({
      ...dryRunResult,
      completeness: {
        complete:       body.completeness?.complete ?? false,
        truncated:      body.completeness?.truncated ?? false,
        scannedFiles:   dedupedFiles.length,
        scannedFolders: body.completeness?.scannedFolders ?? 0,
        errors:         body.completeness?.errors ?? [],
      },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: msg }, { status: 403 });
    console.error("[marketing-studio/drive POST]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
