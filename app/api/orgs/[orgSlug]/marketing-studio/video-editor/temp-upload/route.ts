/**
 * POST /api/orgs/[orgSlug]/marketing-studio/video-editor/temp-upload
 *
 * MARKETING-VIDEO-FLOW-CORRECTION-01 — Temp Video Upload
 *
 * Uploads a local video file to R2 under a temporary prefix so the
 * server-side subtitle transcriber can fetch it via a public URL.
 *
 * This endpoint exists ONLY to unblock subtitle generation for videos
 * loaded from the user's device (blob: URLs are not accessible server-side).
 *
 * Key pattern:
 *   video-temp/{tenantId}/{yyyy}/{mm}/{uuid}.{ext}
 *
 * No DB record is created — the file is ephemeral R2 storage.
 * R2 lifecycle policies can clean up the video-temp/ prefix automatically.
 *
 * Returns:
 *   { url: string }   — public CDN URL, ready for subtitle transcription
 *   { url: null }     — R2 not configured (dev mode); caller shows fallback
 *
 * SECURITY:
 *   - requireOrgAccess enforces tenant membership.
 *   - organizationId always comes from server session.
 *   - Only video/* MIME types accepted.
 *   - 50 MB per-file limit enforced before R2 upload.
 */

export const runtime     = "nodejs";
export const maxDuration = 120;  // large video upload may take time

import { type NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }              from "@/lib/auth/org-access";
import { canAccessMarketingStudio }      from "@/lib/auth/module-access";
import { S3Client, PutObjectCommand }    from "@aws-sdk/client-s3";
import { randomUUID }                    from "crypto";

type RouteContext = { params: Promise<{ orgSlug: string }> };

const TEMP_MAX_MB   = 50;
const TEMP_MAX_BYTES = TEMP_MAX_MB * 1024 * 1024;

const VIDEO_EXT: Record<string, string> = {
  "video/mp4":       "mp4",
  "video/quicktime": "mov",
  "video/webm":      "webm",
  "video/x-msvideo": "avi",
  "video/mpeg":      "mpeg",
};

function getR2Env() {
  return {
    accountId:       process.env.R2_ACCOUNT_ID        ?? "",
    accessKeyId:     process.env.R2_ACCESS_KEY_ID     ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    bucket:          process.env.R2_BUCKET            ?? "",
    publicBaseUrl:  (process.env.R2_PUBLIC_BASE_URL   ?? "").replace(/\/+$/, ""),
  };
}

function isR2Ready(env: ReturnType<typeof getR2Env>): boolean {
  return !!(
    env.accountId && env.accessKeyId &&
    env.secretAccessKey && env.bucket && env.publicBaseUrl
  );
}

export async function POST(
  req:    NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  try {
    const { membership, organization } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Acceso no autorizado" }, { status: 403 });
    }

    // Parse multipart form-data
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: "Formato de solicitud inválido." }, { status: 400 });
    }

    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Se requiere un archivo de video." }, { status: 400 });
    }

    const mimeType = file.type || "video/mp4";
    if (!mimeType.startsWith("video/")) {
      return NextResponse.json(
        { error: "Solo se aceptan archivos de video." },
        { status: 400 },
      );
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "El archivo está vacío." }, { status: 400 });
    }

    if (file.size > TEMP_MAX_BYTES) {
      return NextResponse.json(
        { error: `El video es demasiado grande para generar subtítulos directamente (máx. ${TEMP_MAX_MB} MB). Importa el video a Biblioteca primero.` },
        { status: 413 },
      );
    }

    // Check R2 availability — return { url: null } gracefully in dev mode
    const env = getR2Env();
    if (!isR2Ready(env)) {
      return NextResponse.json({ url: null });
    }

    // Build R2 key
    const now      = new Date();
    const yyyy     = String(now.getUTCFullYear());
    const mm       = String(now.getUTCMonth() + 1).padStart(2, "0");
    const safeTid  = organization.id.replace(/[^a-zA-Z0-9_-]/g, "_");
    const ext      = VIDEO_EXT[mimeType.toLowerCase()] ?? "mp4";
    const uuid     = randomUUID().replace(/-/g, "");
    const key      = `video-temp/${safeTid}/${yyyy}/${mm}/${uuid}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload to R2
    const client = new S3Client({
      region:   "auto",
      endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId:     env.accessKeyId,
        secretAccessKey: env.secretAccessKey,
      },
    });

    await client.send(new PutObjectCommand({
      Bucket:       env.bucket,
      Key:          key,
      Body:         buffer,
      ContentType:  mimeType,
      CacheControl: "private, max-age=3600",  // short TTL — temp file
    }));

    const url = `${env.publicBaseUrl}/${key}`;

    console.log(`[temp-upload] org=${organization.id} → ${url} (${buffer.byteLength} bytes)`);

    return NextResponse.json({ url });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "UNAUTHENTICATED") return NextResponse.json({ error: message }, { status: 401 });
    if (message === "ACCESS_DENIED")   return NextResponse.json({ error: message }, { status: 403 });
    console.error("[temp-upload] error:", message);
    return NextResponse.json({ error: "No pudimos subir el video. Intenta de nuevo." }, { status: 500 });
  }
}
