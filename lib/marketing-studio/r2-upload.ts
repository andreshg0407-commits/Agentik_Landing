/**
 * lib/marketing-studio/r2-upload.ts
 *
 * Thin R2 upload helper for Marketing Studio product images.
 *
 * Key structure:
 *   marketing-studio/{tenantId}/{yyyy}/{mm}/{sessionId}/front.{ext}
 *   marketing-studio/{tenantId}/{yyyy}/{mm}/{sessionId}/back.{ext}
 *
 * Reuses the same Cloudflare R2 bucket and credentials as the Luca submit route.
 * Does NOT use the R2_PREFIX (uploads/) — Marketing Studio images live at the
 * marketing-studio/ top-level prefix for clear operational separation.
 *
 * Server-side only — never import from client components.
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// ── Env ───────────────────────────────────────────────────────────────────────

function getEnv() {
  const accountId       = process.env.R2_ACCOUNT_ID        ?? "";
  const accessKeyId     = process.env.R2_ACCESS_KEY_ID     ?? "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? "";
  const bucket          = process.env.R2_BUCKET            ?? "";
  const publicBaseUrl   = (process.env.R2_PUBLIC_BASE_URL  ?? "").replace(/\/+$/, "");

  return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
}

// ── S3 client ─────────────────────────────────────────────────────────────────

function getClient(env: ReturnType<typeof getEnv>): S3Client {
  if (!env.accountId || !env.accessKeyId || !env.secretAccessKey) {
    throw new Error("Missing R2 credentials (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)");
  }
  return new S3Client({
    region:   "auto",
    endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg":  "jpg",
  "image/png":  "png",
  "image/webp": "webp",
  "image/gif":  "gif",
  "image/avif": "avif",
};

function extFromMime(mime: string): string {
  return MIME_TO_EXT[mime.toLowerCase()] ?? "jpg";
}

// ── Upload ────────────────────────────────────────────────────────────────────

export interface StudioUploadInput {
  file:       File | Blob;
  mimeType:   string;
  tenantId:   string;
  sessionId:  string;
  /** "front" | "back" | "detail1" | "detail2" — determines the filename in the key */
  angle:      "front" | "back" | "detail1" | "detail2";
}

export interface GeneratedAssetUploadInput {
  /** Remote URL to fetch and re-host (e.g. Replicate output URL) */
  sourceUrl:  string;
  tenantId:   string;
  sessionId:  string;
  assetId:    string;
  assetType:  string;
}

export interface StudioUploadResult {
  url:      string;   // public CDN URL — ready for n8n / Replicate / Shopify
  key:      string;   // R2 object key (for audit / deletion)
  bytes:    number;
  mimeType: string;
}

/**
 * Uploads a product image to the Agentik R2 bucket under the Marketing Studio prefix.
 *
 * @param input  - File, tenant/session context, and angle
 * @returns      - CDN URL + metadata
 * @throws       - If credentials are missing or the upload fails
 */
export async function uploadStudioImage(input: StudioUploadInput): Promise<StudioUploadResult> {
  const env = getEnv();

  if (!env.bucket) throw new Error("Missing R2_BUCKET");
  if (!env.publicBaseUrl) throw new Error("Missing R2_PUBLIC_BASE_URL");

  const s3 = getClient(env);

  const now     = new Date();
  const yyyy    = String(now.getUTCFullYear());
  const mm      = String(now.getUTCMonth() + 1).padStart(2, "0");
  const ext     = extFromMime(input.mimeType);
  const safeId  = input.sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeTid = input.tenantId.replace(/[^a-zA-Z0-9_-]/g, "_");

  const key   = `marketing-studio/${safeTid}/${yyyy}/${mm}/${safeId}/${input.angle}.${ext}`;
  const body  = Buffer.from(await input.file.arrayBuffer());
  const bytes = body.byteLength;

  const maxBytes = Number(process.env.MAX_UPLOAD_MB ?? 20) * 1024 * 1024;
  if (bytes > maxBytes) {
    throw new Error(`File too large: ${(bytes / 1024 / 1024).toFixed(1)} MB (max ${process.env.MAX_UPLOAD_MB ?? 20} MB)`);
  }

  await s3.send(new PutObjectCommand({
    Bucket:       env.bucket,
    Key:          key,
    Body:         body,
    ContentType:  input.mimeType,
    CacheControl: "public, max-age=31536000, immutable",
  }));

  return {
    url:      `${env.publicBaseUrl}/${key}`,
    key,
    bytes,
    mimeType: input.mimeType,
  };
}

/**
 * Fetches a provider-generated image URL (e.g. Replicate output) and
 * re-hosts it in R2 under a permanent, content-addressed key.
 *
 * Key pattern:
 *   marketing-studio/{tenantId}/{yyyy}/{mm}/{sessionId}/generated/{assetId}.{ext}
 *
 * Returns null if R2 credentials are missing (dev / no-R2 mode) so callers
 * can fall back to the original URL.
 */
export async function uploadGeneratedAssetImage(
  input: GeneratedAssetUploadInput,
): Promise<StudioUploadResult | null> {
  const env = getEnv();
  if (!env.bucket || !env.publicBaseUrl || !env.accountId || !env.accessKeyId || !env.secretAccessKey) {
    return null; // R2 not configured — caller keeps original URL
  }

  const response = await fetch(input.sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch generated asset: ${response.status} ${input.sourceUrl}`);
  }

  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const mimeType    = contentType.split(";")[0].trim();
  const blob        = await response.blob();
  const body        = Buffer.from(await blob.arrayBuffer());
  const bytes       = body.byteLength;

  const now     = new Date();
  const yyyy    = String(now.getUTCFullYear());
  const mm      = String(now.getUTCMonth() + 1).padStart(2, "0");
  const ext     = extFromMime(mimeType);
  const safeId  = input.assetId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeSid = input.sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeTid = input.tenantId.replace(/[^a-zA-Z0-9_-]/g, "_");

  const key = `marketing-studio/${safeTid}/${yyyy}/${mm}/${safeSid}/generated/${safeId}.${ext}`;

  const s3 = getClient(env);
  await s3.send(new PutObjectCommand({
    Bucket:       env.bucket,
    Key:          key,
    Body:         body,
    ContentType:  mimeType,
    CacheControl: "public, max-age=31536000, immutable",
  }));

  return {
    url:  `${env.publicBaseUrl}/${key}`,
    key,
    bytes,
    mimeType,
  };
}
