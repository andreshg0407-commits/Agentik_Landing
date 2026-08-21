/**
 * app/api/orgs/[orgSlug]/marketing-studio/drive/route.ts
 *
 * MARKETING-DRIVE-BULK-ASSET-INGESTION-04A/04A-F-R1 — Drive proxy
 *
 * GET ?action=status
 *   Returns { connected, tenantRootConfigured, tenantRootFolderName, tenantRootFolderId, accountEmail (masked) }
 *
 * GET ?action=admin-browse&folderId=ID&mode=my-drive|shared-drives
 *   04A-F-R1: Admin-only folder picker BEFORE tenantRoot exists.
 *   Browses My Drive or Shared Drives. No tenantRoot requirement.
 *
 * GET ?action=browse&folderId=FOLDER_ID&pageToken=TOKEN
 *   04A-F: Folder picker navigation within tenant root.
 *   Returns folders, breadcrumb, fileCount. Ancestry-validated.
 *
 * GET ?action=validate-ancestry&folderIds=ID1,ID2,...
 *   04A-F-R1: Batch ancestry validation for multi-select.
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
import { prisma }                         from "@/lib/prisma";
import {
  getDriveConnection,
  getDriveAccessToken,
  buildDriveStructure,
  parseDriveFolderUrl,
  isDescendantOfRoot,
  scanDriveFolder,
  listFolderPage,
  validateDriveFolder,
}                                         from "@/lib/marketing-studio/drive/drive-api-client";
import type { DriveScannedFile }          from "@/lib/marketing-studio/drive/drive-api-client";
import { getTenantDriveRoot }             from "@/lib/marketing-studio/drive/drive-tenant-root";
import { disconnectConnectionById }      from "@/lib/integrations/integration-repository";
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
    const { membership, organization, platformRole } = await requireOrgAccess(orgSlug);
    const organizationId = organization.id;

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "ACCESS_DENIED" }, { status: 403 });
    }

    const action = req.nextUrl.searchParams.get("action") ?? "status";

    // ── Status (04A-F-R2: live Drive probe, reauth detection) ──────────────
    if (action === "status") {
      const conn = await getDriveConnection(organizationId);
      const root = await getTenantDriveRoot(organizationId);

      let accountEmail: string | null = null;
      if (conn) {
        const connRecord = await prisma.integrationConnection.findUnique({
          where: { id: conn.connectionId },
          select: { externalAccountName: true },
        });
        accountEmail = connRecord?.externalAccountName ?? null;
      }

      // If no connection in DB, short-circuit — no probe needed
      if (!conn) {
        return NextResponse.json({
          connected:             false,
          tenantRootConfigured:  root !== null,
          tenantRootFolderName:  root?.folderName ?? null,
          tenantRootFolderId:    root?.folderId ?? null,
          accountEmail:          null,
          reauthRequired:        false,
          reauthReason:          null,
        }, { headers: NO_CACHE_HEADERS });
      }

      // Live probe: attempt token + Drive API call to verify connection is real
      let reauthRequired = false;
      let reauthReason: string | null = null;
      try {
        const accessToken = await getDriveAccessToken(conn);
        // Lightweight probe — Drive about endpoint (no file listing)
        const probeRes = await fetch(
          "https://www.googleapis.com/drive/v3/about?fields=user",
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (probeRes.status === 401 || probeRes.status === 403) {
          reauthRequired = true;
          const probeBody = await probeRes.json().catch(() => ({})) as { error?: { errors?: Array<{ reason?: string }> } };
          const reason = probeBody?.error?.errors?.[0]?.reason;
          if (reason === "insufficientPermissions" || reason === "forbidden") {
            reauthReason = "DRIVE_SCOPE_MISSING";
          } else if (reason === "domainPolicy") {
            reauthReason = "WORKSPACE_ADMIN_BLOCKED";
          } else if (reason === "accessNotConfigured") {
            reauthReason = "DRIVE_API_DISABLED";
          } else {
            reauthReason = "TOKEN_REVOKED";
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        reauthRequired = true;
        if (msg.includes("DRIVE_TOKEN_EXPIRED")) {
          // Refresh token invalid — revoked or expired
          reauthReason = msg.includes("revoked") ? "TOKEN_REVOKED" : "TOKEN_EXPIRED";
        } else {
          reauthReason = "TOKEN_REVOKED";
        }
      }

      return NextResponse.json({
        connected:             !reauthRequired,
        tenantRootConfigured:  root !== null,
        tenantRootFolderName:  root?.folderName ?? null,
        tenantRootFolderId:    root?.folderId ?? null,
        accountEmail:          maskEmail(accountEmail),
        reauthRequired,
        reauthReason,
      }, { headers: NO_CACHE_HEADERS });
    }

    // ── Disconnect (04A-F-R2: tenant-scoped, no asset/product deletion) ────
    if (action === "disconnect") {
      const isAdmin =
        platformRole === "SUPER_ADMIN" ||
        platformRole === "AGENTIK_ADMIN" ||
        membership.role === "ORG_ADMIN";
      if (!isAdmin) {
        return NextResponse.json({ error: "ADMIN_DISCONNECT_DENIED" }, { status: 403 });
      }

      const conn = await getDriveConnection(organizationId);
      if (!conn) {
        return NextResponse.json({ disconnected: true }, { headers: NO_CACHE_HEADERS });
      }

      // Mark connection as NOT_CONNECTED — does NOT delete assets/products/files
      await disconnectConnectionById(conn.connectionId, organizationId);

      return NextResponse.json({ disconnected: true }, { headers: NO_CACHE_HEADERS });
    }

    // ── Admin-browse (04A-F-R1: initial root selection — NO tenantRoot required) ─
    if (action === "admin-browse") {
      // Admin-only gate: same as set-root
      const isAdmin =
        platformRole === "SUPER_ADMIN" ||
        platformRole === "AGENTIK_ADMIN" ||
        membership.role === "ORG_ADMIN";
      if (!isAdmin) {
        return NextResponse.json({ error: "ADMIN_BROWSE_DENIED" }, { status: 403 });
      }

      // Resolve connection + token (but NOT tenantRoot)
      const conn = await getDriveConnection(organizationId);
      if (!conn) throw new Error("DRIVE_NOT_CONNECTED");
      let accessToken: string;
      try { accessToken = await getDriveAccessToken(conn); }
      catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("DRIVE_TOKEN_EXPIRED")) throw new Error("DRIVE_TOKEN_EXPIRED");
        throw err;
      }

      const rawFolderId = req.nextUrl.searchParams.get("folderId") ?? "";
      const folderId    = rawFolderId ? (parseDriveFolderUrl(rawFolderId) ?? rawFolderId) : null;
      const pageToken   = req.nextUrl.searchParams.get("pageToken") ?? undefined;
      const browseMode  = req.nextUrl.searchParams.get("mode") ?? "my-drive";

      // List Shared Drives if requested
      if (browseMode === "shared-drives" && !folderId) {
        const sdUrl = new URL("https://www.googleapis.com/drive/v3/drives");
        sdUrl.searchParams.set("pageSize", "100");
        if (pageToken) sdUrl.searchParams.set("pageToken", pageToken);
        const sdRes = await fetch(sdUrl.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!sdRes.ok) {
          return NextResponse.json({ error: "SHARED_DRIVES_UNAVAILABLE" }, { status: 502 });
        }
        const sdData = await sdRes.json() as {
          drives?: { id: string; name: string }[];
          nextPageToken?: string;
        };
        return NextResponse.json({
          folderId:      null,
          folderName:    "Shared Drives",
          folders:       (sdData.drives ?? []).map(d => ({ id: d.id, name: d.name })),
          fileCount:     0,
          nextPageToken: sdData.nextPageToken ?? null,
          breadcrumb:    [{ id: "shared-drives", name: "Shared Drives" }],
          mode:          "shared-drives",
        }, { headers: NO_CACHE_HEADERS });
      }

      // Browse a specific folder (My Drive root or any folder the user can access)
      const browseFolderId = folderId || "root";
      let page;
      try {
        page = await listFolderPage(browseFolderId, accessToken, pageToken);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error";
        return NextResponse.json({ error: msg }, { status: 403 });
      }

      // Build breadcrumb for admin browse (walk up to Drive root)
      const breadcrumb: { id: string; name: string }[] = [];
      if (browseFolderId !== "root") {
        let crumbId = browseFolderId;
        for (let i = 0; i < 15; i++) {
          const meta = await validateDriveFolder(crumbId, accessToken);
          breadcrumb.unshift({ id: meta.id, name: meta.name });
          const pUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(crumbId)}`);
          pUrl.searchParams.set("fields", "parents");
          pUrl.searchParams.set("supportsAllDrives", "true");
          const pRes = await fetch(pUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
          if (!pRes.ok) break;
          const pData = await pRes.json() as { parents?: string[] };
          if (!pData.parents?.[0]) break;
          crumbId = pData.parents[0];
        }
      }
      breadcrumb.unshift({ id: "root", name: "Mi Drive" });

      return NextResponse.json({
        folderId:      browseFolderId,
        folderName:    breadcrumb[breadcrumb.length - 1]?.name ?? "Mi Drive",
        folders:       page.childFolders,
        fileCount:     page.files.length,
        nextPageToken: page.nextPageToken,
        breadcrumb,
        mode:          browseMode,
      }, { headers: NO_CACHE_HEADERS });
    }

    // ── Browse (04A-F: folder picker within tenant root) ──────────────────
    if (action === "browse") {
      const rawFolderId = req.nextUrl.searchParams.get("folderId") ?? "";
      const folderId    = rawFolderId ? (parseDriveFolderUrl(rawFolderId) ?? rawFolderId) : null;

      const { tenantRoot, accessToken } = await resolveGate(organizationId);
      const browseFolderId = folderId || tenantRoot.folderId;

      if (browseFolderId !== tenantRoot.folderId) {
        const isDesc = await isDescendantOfRoot(browseFolderId, tenantRoot.folderId, accessToken);
        if (!isDesc) {
          return NextResponse.json({ error: "OUTSIDE_TENANT_ROOT" }, { status: 403 });
        }
      }

      const pageToken = req.nextUrl.searchParams.get("pageToken") ?? undefined;
      const page = await listFolderPage(browseFolderId, accessToken, pageToken);

      const breadcrumb: { id: string; name: string }[] = [];
      if (browseFolderId !== tenantRoot.folderId) {
        let crumbId = browseFolderId;
        for (let i = 0; i < 15 && crumbId !== tenantRoot.folderId; i++) {
          const meta = await validateDriveFolder(crumbId, accessToken);
          breadcrumb.unshift({ id: meta.id, name: meta.name });
          const pUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(crumbId)}`);
          pUrl.searchParams.set("fields", "parents");
          pUrl.searchParams.set("supportsAllDrives", "true");
          const pRes = await fetch(pUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
          if (!pRes.ok) break;
          const pData = await pRes.json() as { parents?: string[] };
          if (!pData.parents?.[0]) break;
          crumbId = pData.parents[0];
        }
      }
      breadcrumb.unshift({ id: tenantRoot.folderId, name: tenantRoot.folderName });

      return NextResponse.json({
        folderId:      browseFolderId,
        folderName:    breadcrumb[breadcrumb.length - 1]?.name ?? "—",
        folders:       page.childFolders,
        fileCount:     page.files.length,
        nextPageToken: page.nextPageToken,
        breadcrumb,
      }, { headers: NO_CACHE_HEADERS });
    }

    // ── Validate-ancestry (04A-F-R1: batch validation for multi-select) ───
    if (action === "validate-ancestry") {
      const folderIdsRaw = req.nextUrl.searchParams.get("folderIds") ?? "";
      const folderIds = folderIdsRaw.split(",").filter(Boolean);
      if (folderIds.length === 0) {
        return NextResponse.json({ error: "folderIds required" }, { status: 400 });
      }
      if (folderIds.length > 20) {
        return NextResponse.json({ error: "Max 20 folders per validation" }, { status: 400 });
      }

      const { tenantRoot, accessToken } = await resolveGate(organizationId);
      const results: { folderId: string; valid: boolean; ancestors: string[] }[] = [];
      for (const fid of folderIds) {
        if (fid === tenantRoot.folderId) {
          results.push({ folderId: fid, valid: true, ancestors: [fid] });
          continue;
        }
        // Walk parent chain to collect ancestors up to tenant root
        const ancestors: string[] = [fid];
        let currentId = fid;
        let valid = false;
        for (let depth = 0; depth < 20; depth++) {
          const metaUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(currentId)}`);
          metaUrl.searchParams.set("fields", "id,parents,shortcutDetails");
          metaUrl.searchParams.set("supportsAllDrives", "true");
          const metaRes = await fetch(metaUrl.toString(), {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!metaRes.ok) break;
          const metaData = await metaRes.json() as {
            parents?: string[];
            shortcutDetails?: { targetId: string };
          };
          if (metaData.shortcutDetails) {
            currentId = metaData.shortcutDetails.targetId;
            ancestors.push(currentId);
            continue;
          }
          if (!metaData.parents?.[0]) break;
          const parentId = metaData.parents[0];
          ancestors.push(parentId);
          if (parentId === tenantRoot.folderId) { valid = true; break; }
          currentId = parentId;
        }
        results.push({ folderId: fid, valid, ancestors });
      }

      return NextResponse.json({ results }, { headers: NO_CACHE_HEADERS });
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
          id:           item.id,
          name:         item.name,
          mimeType:     item.mimeType || mimeFromExtension(item.name),
          size:         parseInt(item.size ?? "0", 10),
          path:         folderPath ? `${folderPath}/${item.name}` : item.name,
          parentId:     folderId,
          parentName:   folderName,
          modifiedTime: item.modifiedTime,
          version:      item.version,
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
    if (msg === "DRIVE_TOKEN_EXPIRED")            return NextResponse.json({ error: msg, reauthRequired: true, reauthReason: "TOKEN_EXPIRED" }, { status: 401 });
    if (msg === "DRIVE_SCOPE_MISSING")           return NextResponse.json({ error: msg, reauthRequired: true, reauthReason: "DRIVE_SCOPE_MISSING" }, { status: 403 });
    if (msg === "WORKSPACE_ADMIN_BLOCKED")       return NextResponse.json({ error: msg, reauthRequired: true, reauthReason: "WORKSPACE_ADMIN_BLOCKED" }, { status: 403 });
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

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Masks an email for display: a***@e***.com — never expose full email to client */
function maskEmail(email: string | null): string | null {
  if (!email || !email.includes("@")) return email;
  const [local, domain] = email.split("@");
  const [domainName, ...tld] = domain.split(".");
  const maskedLocal = local[0] + "***";
  const maskedDomain = domainName[0] + "***";
  return `${maskedLocal}@${maskedDomain}.${tld.join(".")}`;
}
