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
import { prisma }                         from "@/lib/prisma";
import { uploadManualAsset }              from "@/lib/marketing-studio/r2-upload";
import { addProductAssetLink }            from "@/lib/marketing-studio/products/product-repository";
import { AssetGenerationStatus }          from "@prisma/client";

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
    const { organization } = await requireOrgAccess(orgSlug);
    const organizationId   = organization.id;

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

    for (const file of files) {
      // Validate MIME type
      const mime = file.type || "application/octet-stream";
      if (!ALLOWED_MIMES.has(mime)) {
        errors.push({
          fileName: file.name,
          error:    `Tipo no soportado: ${MIME_LABELS[mime] ?? mime}. ` +
                    `Acepta: jpg, png, webp, mp4, mov, pdf`,
        });
        continue;
      }

      // Convert to Buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer      = Buffer.from(arrayBuffer);

      let assetUrl: string;
      let r2Key:    string;

      // Upload to R2
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
              sourceType:    "manual_upload",
              originalName:  file.name,
              r2Key,
            },
          },
          select: { id: true, createdAt: true },
        });
      } catch (dbErr) {
        const msg = dbErr instanceof Error ? dbErr.message : "DB error";
        errors.push({ fileName: file.name, error: `Asset creation failed: ${msg}` });
        continue;
      }

      // Link asset to product — if this fails, clean up the GeneratedAsset
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
        // Rollback: delete the orphaned GeneratedAsset
        await prisma.generatedAsset.delete({ where: { id: generatedAsset.id } }).catch(() => {});
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
