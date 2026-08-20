/**
 * app/api/internal/uploads/r2/route.ts
 *
 * MARKETING-ASSET-STORAGE-R2-HARDENING-03B — Secure Studio Upload
 *
 * POST — upload a product image to the Agentik R2 bucket.
 *
 * SECURITY (03B):
 *   - organizationId resolved server-side via requireOrgAccess (NOT from client).
 *   - tenantId from FormData is compared against resolved org — rejected on mismatch.
 *   - Marketing Studio access verified.
 *   - File validated with magic bytes, not just client MIME.
 *   - Object key built with certified organizationId.
 *   - Upload verified with HeadObject.
 *   - Storage identity (objectKey, checksum, etc.) returned for DB persistence.
 *
 * FormData fields:
 *   file      — the image (required, File)
 *   orgSlug   — organization slug (required — used for auth resolution)
 *   tenantId  — legacy field (optional — compared against org, never used as authority)
 *   sessionId — the wizard session ID (required)
 *   angle     — "front" | "back" | "detail1" | "detail2" (required)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { canAccessMarketingStudio } from "@/lib/auth/module-access";
import {
  requireR2Config,
  getMaxUploadBytes,
  r2Put,
  buildStudioSessionKey,
  buildStorageIdentity,
  validateFileBuffer,
  sanitizeFilename,
  MIME_TO_EXT,
} from "@/lib/storage/server";

export const runtime = "nodejs";

const VALID_ANGLES = new Set(["front", "back", "detail1", "detail2"]);

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Parse form ──────────────────────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const file = formData.get("file");
  const orgSlug = String(formData.get("orgSlug") ?? "").trim();
  const clientTenantId = String(formData.get("tenantId") ?? "").trim();
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  const angle = String(formData.get("angle") ?? "").trim();

  // ── Validate required fields ────────────────────────────────────────────────

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!orgSlug) {
    return NextResponse.json({ error: "orgSlug is required" }, { status: 400 });
  }
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }
  if (!VALID_ANGLES.has(angle)) {
    return NextResponse.json(
      { error: "angle must be 'front', 'back', 'detail1', or 'detail2'" },
      { status: 400 },
    );
  }

  // ── Auth: resolve org server-side ───────────────────────────────────────────

  let organizationId: string;
  try {
    const { membership, organization } = await requireOrgAccess(orgSlug);
    organizationId = organization.id;

    // Verify Marketing Studio access
    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json(
        { error: "Marketing Studio access required" },
        { status: 403 },
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AUTH_FAILED";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    return NextResponse.json({ error: "ACCESS_DENIED" }, { status: 403 });
  }

  // ── Tenant authority check ──────────────────────────────────────────────────
  // If client sent tenantId, compare against resolved org.
  // Never use clientTenantId for key construction.
  if (clientTenantId && clientTenantId !== orgSlug) {
    return NextResponse.json(
      { error: "TENANT_MISMATCH: tenantId does not match authenticated organization" },
      { status: 403 },
    );
  }

  // ── File size check ─────────────────────────────────────────────────────────

  const maxBytes = getMaxUploadBytes();
  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB (max ${maxBytes / 1024 / 1024} MB)` },
      { status: 413 },
    );
  }

  // ── Read file bytes ─────────────────────────────────────────────────────────

  const buffer = Buffer.from(await file.arrayBuffer());

  // ── Magic bytes validation ──────────────────────────────────────────────────

  const claimedMime = file.type || "image/jpeg";
  const validation = validateFileBuffer(buffer, claimedMime);
  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.error ?? "Invalid file type" },
      { status: 415 },
    );
  }

  const mimeType = validation.detectedMime ?? claimedMime;
  const ext = validation.detectedExt ?? MIME_TO_EXT[mimeType] ?? "jpg";

  // ── R2 configuration ────────────────────────────────────────────────────────

  let config;
  try {
    config = requireR2Config();
  } catch {
    return NextResponse.json(
      { error: "R2 storage not configured" },
      { status: 503 },
    );
  }

  // ── Build key with certified organizationId ─────────────────────────────────

  const objectKey = buildStudioSessionKey(
    { environment: config.environment, organizationId },
    sessionId,
    angle,
    ext,
  );

  // ── Upload with verification ────────────────────────────────────────────────

  try {
    const putResult = await r2Put({
      config,
      objectKey,
      body: buffer,
      contentType: mimeType,
    });

    const identity = buildStorageIdentity(config, putResult, {
      organizationId,
      mimeType,
      originalFilename: sanitizeFilename(file.name),
      source: "foto_estudio",
    });

    return NextResponse.json({
      url: putResult.publicUrl,
      key: putResult.objectKey,
      bytes: putResult.bytes,
      mimeType,
      checksum: putResult.checksum,
      storageIdentity: identity,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    console.error("[uploads/r2] upload error", { organizationId, sessionId, angle, msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
