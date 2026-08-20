/**
 * app/api/orgs/[orgSlug]/marketing-studio/products/[productId]/assets/route.ts
 *
 * MARKETING-STUDIO-ASSET-UPLOAD-01
 *
 * POST — Uploads one or more files and links them to a ProductEntity.
 *
 * ── Flow per file ──────────────────────────────────────────────────────────────
 *   1. Validate MIME type + size
 *   2. Upload to Cloudflare R2 (same bucket as Foto Estudio)
 *   3. Create GeneratedAsset (status=READY, reviewStatus=approved)
 *   4. Create ProductAssetLink (productId + assetId + role)
 *   5. On ProductAssetLink failure: delete GeneratedAsset (no orphans)
 *
 * ── Multipart form fields ──────────────────────────────────────────────────────
 *   files   File[]  — one or many
 *   role    string  — hero | gallery | video | document (applied to all files)
 *
 * ── Security ───────────────────────────────────────────────────────────────────
 *   requireOrgAccess verifies auth + org membership.
 *   addProductAssetLink verifies productId belongs to organizationId.
 *   No cross-tenant writes possible.
 *
 * ── Guardrails ─────────────────────────────────────────────────────────────────
 *   No Foto Estudio changes.
 *   No AI generation.
 *   No new Prisma models.
 *   Reuses existing R2 bucket + GeneratedAsset + ProductAssetLink models.
 */

import { NextRequest, NextResponse }       from "next/server";
import { requireOrgAccess }               from "@/lib/auth/org-access";
import { canAccessMarketingStudio }      from "@/lib/auth/module-access";
import { prisma }                         from "@/lib/prisma";
import { uploadManualAsset }              from "@/lib/marketing-studio/r2-upload";
import { addProductAssetLink }            from "@/lib/marketing-studio/products/product-repository";
import { AssetGenerationStatus }          from "@prisma/client";
import {
  loadR2Config,
  getMaxUploadBytes,
  r2Put,
  r2Delete,
  buildManualUploadKey,
  buildStorageIdentity,
  validateFileBuffer,
  sanitizeFilename,
  MIME_TO_EXT,
} from "@/lib/storage/server";

export const runtime = "nodejs";

// ── Accepted MIME types ────────────────────────────────────────────────────────

const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "application/pdf",
]);

const MIME_LABELS: Record<string, string> = {
  "image/jpeg":       "jpg",
  "image/jpg":        "jpg",
  "image/png":        "png",
  "image/webp":       "webp",
  "video/mp4":        "mp4",
  "video/quicktime":  "mov",
  "application/pdf":  "pdf",
};

// ── Valid roles ────────────────────────────────────────────────────────────────

const VALID_ROLES = new Set(["hero", "gallery", "video", "document", "swatch"]);

// ── Route ──────────────────────────────────────────────────────────────────────

type RouteContext = { params: Promise<{ orgSlug: string; productId: string }> };

export async function POST(
  req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug, productId } = await params;

  try {
    const { membership, organization } = await requireOrgAccess(orgSlug);
    const organizationId   = organization.id;

    // Verify Marketing Studio access
    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Marketing Studio access required" }, { status: 403 });
    }

    // Parse FormData
    const formData = await req.formData();
    const files    = formData.getAll("files") as File[];
    const role     = (formData.get("role") as string | null) ?? "gallery";

    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    if (!VALID_ROLES.has(role)) {
      return NextResponse.json(
        { error: `Invalid role "${role}". Valid: ${[...VALID_ROLES].join(", ")}` },
        { status: 400 },
      );
    }

    // Verify product ownership before doing any work
    const product = await prisma.productEntity.findFirst({
      where:  { id: productId, organizationId },
      select: { id: true, sku: true },
    });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Create one synthetic StudioSession for the entire upload batch.
    // GeneratedAsset requires sessionId — this is the minimal bridge.
    const batchSessionId = `ss_manual_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    await prisma.studioSession.create({
      data: {
        id:             batchSessionId,
        organizationId,
        tenantId:       orgSlug,
        step:           "upload_product",
        objective:      "manual_upload",
        productSku:     product.sku,
      },
    });

    const uploadedAssets: {
      id:        string;
      assetUrl:  string;
      role:      string;
      createdAt: string;
    }[] = [];

    const errors: { fileName: string; error: string }[] = [];

    // Resolve R2 config (shared module)
    const r2Config = loadR2Config();

    for (const file of files) {
      // Validate MIME type (client claim)
      const claimedMime = file.type || "application/octet-stream";
      if (!ALLOWED_MIMES.has(claimedMime)) {
        errors.push({
          fileName: file.name,
          error:    `Tipo no soportado: ${MIME_LABELS[claimedMime] ?? claimedMime}. ` +
                    `Acepta: jpg, png, webp, mp4, mov, pdf`,
        });
        continue;
      }

      // Convert to Buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer      = Buffer.from(arrayBuffer);

      // Server-side magic bytes validation (03B)
      const validation = validateFileBuffer(buffer, claimedMime);
      if (!validation.valid) {
        errors.push({
          fileName: file.name,
          error:    validation.error ?? "File type validation failed",
        });
        continue;
      }

      const mime = validation.detectedMime ?? claimedMime;

      let assetUrl: string;
      let r2Key:    string;
      let checksum: string | undefined;

      // Upload to R2 — prefer shared module, fallback to legacy
      if (r2Config) {
        try {
          const uuid = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
          const ext = validation.detectedExt ?? MIME_TO_EXT[mime] ?? "bin";
          const objectKey = buildManualUploadKey(
            { environment: r2Config.environment, organizationId },
            productId,
            uuid,
            ext,
          );
          const putResult = await r2Put({
            config: r2Config,
            objectKey,
            body: buffer,
            contentType: mime,
          });
          assetUrl = putResult.publicUrl;
          r2Key = putResult.objectKey;
          checksum = putResult.checksum;
        } catch (uploadErr) {
          const msg = uploadErr instanceof Error ? uploadErr.message : "Upload failed";
          errors.push({ fileName: file.name, error: msg });
          continue;
        }
      } else {
        // Legacy fallback when R2 not configured
        try {
          const result = await uploadManualAsset({
            buffer,
            mimeType:  mime,
            tenantId:  orgSlug,
            productId,
            fileName:  file.name,
          });
          assetUrl = result.url;
          r2Key    = result.key;
        } catch (uploadErr) {
          const msg = uploadErr instanceof Error ? uploadErr.message : "Upload failed";
          errors.push({ fileName: file.name, error: msg });
          continue;
        }
      }

      // Create GeneratedAsset — already READY (no generation step)
      let generatedAsset: { id: string; createdAt: Date };
      try {
        generatedAsset = await prisma.generatedAsset.create({
          data: {
            sessionId:        batchSessionId,
            assetType:        _mimeToAssetType(mime),
            generationStatus: AssetGenerationStatus.READY,
            assetUrl,
            reviewStatus:     "approved",
            providerMeta:     {
              provider:      "cloudflare_r2",
              environment:   r2Config?.environment ?? "unknown",
              sourceType:    "manual_upload",
              originalName:  sanitizeFilename(file.name),
              objectKey:     r2Key,
              checksum:      checksum ?? null,
              mimeType:      mime,
              size:          buffer.byteLength,
            },
          },
          select: { id: true, createdAt: true },
        });
      } catch (dbErr) {
        // R2 object uploaded but DB failed — mark as orphan candidate
        // Do NOT delete legacy objects. Only delete objects we just created.
        if (r2Config && r2Key) {
          await r2Delete({
            config: r2Config,
            objectKey: r2Key,
            reason: "DB_ROLLBACK: GeneratedAsset creation failed",
            requestedBy: "system:asset-upload-route",
            organizationId,
          }).catch(() => {});
        }
        const msg = dbErr instanceof Error ? dbErr.message : "DB error";
        errors.push({ fileName: file.name, error: `Asset creation failed: ${msg}` });
        continue;
      }

      // Link asset to product — if this fails, clean up
      try {
        await addProductAssetLink({
          organizationId,
          productId,
          assetId:        generatedAsset.id,
          role,
          sourceType:     "manual_upload",
          sourceProvider: "biblioteca",
        });
      } catch (linkErr) {
        // Rollback: delete the orphaned GeneratedAsset and R2 object
        await prisma.generatedAsset.delete({ where: { id: generatedAsset.id } }).catch(() => {});
        if (r2Config && r2Key) {
          await r2Delete({
            config: r2Config,
            objectKey: r2Key,
            reason: "DB_ROLLBACK: ProductAssetLink creation failed",
            requestedBy: "system:asset-upload-route",
            organizationId,
          }).catch(() => {});
        }
        const msg = linkErr instanceof Error ? linkErr.message : "Link failed";
        errors.push({ fileName: file.name, error: `Asset link failed: ${msg}` });
        continue;
      }

      uploadedAssets.push({
        id:        generatedAsset.id,
        assetUrl,
        role,
        createdAt: generatedAsset.createdAt.toISOString(),
      });
    }

    return NextResponse.json({
      ok:     true,
      assets: uploadedAssets,
      errors,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: msg }, { status: 403 });
    console.error("[asset-upload]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _mimeToAssetType(mime: string): string {
  if (mime.startsWith("image/"))    return "product_photo";
  if (mime.startsWith("video/"))    return "social_video";
  if (mime === "application/pdf")   return "document";
  return "product_photo";
}
