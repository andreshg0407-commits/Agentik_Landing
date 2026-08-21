/**
 * app/api/orgs/[orgSlug]/marketing-studio/drive/route.ts
 *
 * MARKETING-STUDIO-DRIVE-IMPORT-01 / R4A — Drive proxy: status + structure + dry-run
 *
 * GET ?action=status
 *   Returns { connected: boolean }
 *   Does NOT expose any token or account info.
 *
 * GET ?action=structure&folderId=FOLDER_ID_OR_URL
 *   Reads the Drive folder structure recursively.
 *   Returns { structure, folderName, ignoredCount, permissionErrors }
 *
 * GET ?action=dry-run&folderId=FOLDER_ID_OR_URL
 *   ZERO WRITES. Reads Drive folder, matches files against tenant inventory.
 *   Returns per-file status: MATCH | NO_INVENTORY_REF | AMBIGUOUS_REF |
 *   DUPLICATE | INVALID_MIME | PERMISSION_ERROR | UNKNOWN
 *   Includes zeroWrites:true assertion in response.
 *
 * SECURITY:
 * - requireOrgAccess: verifies auth + org membership.
 * - canAccessMarketingStudio: verifies module access.
 * - Tokens are fetched server-side — NEVER returned to the client.
 * - No Drive account info (email, ID) is returned for status check.
 * - Tenant-isolated: organizationId from server session scopes all queries.
 *
 * TENANT ROOT ENFORCEMENT (R1 — Section D):
 *   Drive isolation is OAuth-based by design. No persistent root folder
 *   is stored per tenant. The tenant boundary is the OAuth token itself:
 *   - getDriveConnection(organizationId) returns ONLY this org's connection.
 *   - organizationId comes from requireOrgAccess (server session), never client.
 *   - The OAuth token can only access folders the org's Google account has access to.
 *   - Cross-tenant folder access is impossible: org A's token cannot reach org B's folders.
 *   - If folderId is inaccessible, Drive API returns DRIVE_PERMISSION_DENIED / DRIVE_FOLDER_NOT_FOUND.
 *   - No IntegrationConnection.rootFolderId field exists — this is intentional (stateless design).
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
}                                         from "@/lib/marketing-studio/drive/drive-api-client";

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

    // ── Dry-run (R4A Section F) ────────────────────────────────────────────
    // ZERO WRITES. Read-only: reads Drive folder, matches references
    // against this tenant's inventory, returns per-file status.
    // Tenant isolation: organizationId from requireOrgAccess (server session),
    // getDriveConnection scoped by organizationId, prisma queries scoped.
    // No ProductEntity, ProductAssetLink, GeneratedAsset, or R2 writes.
    if (action === "dry-run") {
      const rawInput = req.nextUrl.searchParams.get("folderId") ?? "";
      const folderId = parseDriveFolderUrl(rawInput) ?? rawInput;

      if (!folderId || folderId.length < 10) {
        return NextResponse.json(
          { error: "URL de carpeta de Google Drive invalida" },
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

      // Load inventory refCodes for matching
      const ccsRefs = await prisma.commercialCoverageSnapshot.findMany({
        where: { organizationId },
        select: { refCode: true },
        distinct: ["refCode"],
      });
      const pilRefs = await prisma.productEntity.findMany({
        where: { organizationId, productLine: "5" },
        select: { sku: true },
      });

      // Build inventory refCode set for matching (tenant-scoped)
      const inventoryRefCodes = new Set<string>();
      for (const r of ccsRefs) inventoryRefCodes.add(r.refCode.trim().toUpperCase());
      for (const r of pilRefs) {
        if (r.sku) inventoryRefCodes.add(r.sku.trim().toUpperCase());
      }

      // Detect ambiguous refCodes (same normalized code from multiple sources)
      const refCodeOccurrences = new Map<string, number>();
      for (const r of ccsRefs) {
        const k = r.refCode.trim().toUpperCase();
        refCodeOccurrences.set(k, (refCodeOccurrences.get(k) ?? 0) + 1);
      }
      for (const r of pilRefs) {
        if (r.sku) {
          const k = r.sku.trim().toUpperCase();
          refCodeOccurrences.set(k, (refCodeOccurrences.get(k) ?? 0) + 1);
        }
      }
      const ambiguousRefs = new Set<string>();
      for (const [k, count] of refCodeOccurrences) {
        if (count > 1) ambiguousRefs.add(k);
      }

      // Load existing asset file names for duplicate detection (tenant-scoped)
      const existingAssets = await prisma.generatedAsset.findMany({
        where: { session: { organizationId } },
        select: { assetUrl: true },
      });
      const existingNames = new Set<string>();
      for (const a of existingAssets) {
        if (a.assetUrl) {
          // Extract filename from URL for comparison
          const parts = a.assetUrl.split("/");
          existingNames.add(parts[parts.length - 1].toLowerCase());
        }
      }

      // Allowed MIME types for import
      const ALLOWED_MIMES = new Set([
        "image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml",
        "video/mp4", "video/webm", "video/quicktime",
        "application/pdf",
      ]);

      // Status codes (7):
      // MATCH              — refCode found in inventory, file importable
      // NO_INVENTORY_REF   — refCode not found in CCS/PIL for this tenant
      // AMBIGUOUS_REF      — refCode matches multiple inventory entries
      // DUPLICATE          — file name already exists in org assets
      // INVALID_MIME       — file type not supported for import
      // PERMISSION_ERROR   — Drive permissions prevent reading
      // UNKNOWN            — unexpected condition

      type DryRunFileStatus = "MATCH" | "NO_INVENTORY_REF" | "AMBIGUOUS_REF" | "DUPLICATE" | "INVALID_MIME" | "PERMISSION_ERROR" | "UNKNOWN";

      interface DryRunFile {
        path:     string;
        name:     string;
        refCode:  string;
        status:   DryRunFileStatus;
        mimeType: string;
      }

      const files: DryRunFile[] = [];
      const summary = { match: 0, no_ref: 0, ambiguous: 0, duplicate: 0, invalid_mime: 0, permission: 0, unknown: 0 };

      for (const cat of result.structure.categories) {
        for (const ref of cat.references) {
          const normalizedRef = (ref.sku ?? ref.name).trim().toUpperCase().replace(/\s{2,}/g, " ");
          const refInInventory = inventoryRefCodes.has(normalizedRef);
          const refIsAmbiguous = ambiguousRefs.has(normalizedRef);

          for (const file of ref.files) {
            let status: DryRunFileStatus;

            if (!ALLOWED_MIMES.has(file.mimeType)) {
              status = "INVALID_MIME";
              summary.invalid_mime++;
            } else if (!refInInventory) {
              status = "NO_INVENTORY_REF";
              summary.no_ref++;
            } else if (refIsAmbiguous) {
              status = "AMBIGUOUS_REF";
              summary.ambiguous++;
            } else if (existingNames.has(file.name.toLowerCase())) {
              status = "DUPLICATE";
              summary.duplicate++;
            } else {
              status = "MATCH";
              summary.match++;
            }

            files.push({
              path:     file.path,
              name:     file.name,
              refCode:  normalizedRef,
              status,
              mimeType: file.mimeType,
            });
          }
        }
      }

      // Permission errors from structure scan
      for (const pe of result.permissionErrors) {
        files.push({
          path: pe, name: pe, refCode: "", status: "PERMISSION_ERROR", mimeType: "",
        });
        summary.permission++;
      }

      return NextResponse.json({
        ok:                true,
        zeroWrites:        true,  // assertion: this action performed zero DB/R2 writes
        tenantId:          organizationId,
        folderName:        result.folderName,
        totalFiles:        result.structure.totalFiles,
        ignoredCount:      result.ignoredCount,
        files,
        summary,
        inventoryRefCount: inventoryRefCodes.size,
        ambiguousRefCount: ambiguousRefs.size,
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
