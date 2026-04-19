/**
 * app/api/internal/uploads/r2/route.ts
 *
 * POST — upload a product image to the Agentik R2 bucket.
 *
 * Used by the Marketing Studio wizard (step 1) to replace manual URL entry with
 * direct file upload. The returned CDN URL is stored in session state and passed
 * downstream to n8n / Replicate / Shopify.
 *
 * Authentication: valid NextAuth session (any authenticated user).
 * This is an internal route — production hardening should add role check if
 * the wizard becomes publicly accessible.
 *
 * FormData fields:
 *   file      — the image (required, File)
 *   tenantId  — e.g. "do-jeans" or "castillitos" (required)
 *   sessionId — the wizard session ID (required, used in the key path)
 *   angle     — "front" | "back" (required)
 *
 * Response (200):
 *   { url: string; key: string; bytes: number; mimeType: string }
 *
 * Key format:
 *   marketing-studio/{tenantId}/{yyyy}/{mm}/{sessionId}/{angle}.{ext}
 */

import { NextRequest, NextResponse }   from "next/server";
import { getCurrentUser }             from "@/lib/auth";
import { uploadStudioImage }          from "@/lib/marketing-studio/r2-upload";

export const runtime = "nodejs";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/avif",
]);

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  // ── Parse form ────────────────────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const file      = formData.get("file");
  const tenantId  = String(formData.get("tenantId")  ?? "").trim();
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  const angle     = String(formData.get("angle")     ?? "").trim();

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!tenantId)  return NextResponse.json({ error: "tenantId is required" },  { status: 400 });
  if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  const VALID_ANGLES = new Set(["front", "back", "detail1", "detail2"]);
  if (!VALID_ANGLES.has(angle)) {
    return NextResponse.json({ error: "angle must be 'front', 'back', 'detail1', or 'detail2'" }, { status: 400 });
  }

  // ── MIME check ────────────────────────────────────────────────────────────
  const mimeType = file.type || "image/jpeg";
  if (!ALLOWED_MIME.has(mimeType)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${mimeType}. Allowed: JPEG, PNG, WebP, AVIF.` },
      { status: 415 },
    );
  }

  // ── Upload ────────────────────────────────────────────────────────────────
  try {
    const result = await uploadStudioImage({
      file, mimeType, tenantId, sessionId,
      angle: angle as "front" | "back" | "detail1" | "detail2",
    });
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    console.error("[uploads/r2] upload error", { tenantId, sessionId, angle, msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
