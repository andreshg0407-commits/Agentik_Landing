/**
 * lib/marketing-studio/video-editor/render/video-storage-adapter.ts
 *
 * MARKETING-VIDEO-RENDER-WORKER-01 — Video Storage Adapter
 *
 * Uploads a locally rendered video file (from /tmp) to Cloudflare R2
 * and returns the permanent public CDN URL.
 *
 * Key pattern:
 *   video-renders/{tenantId}/{yyyy}/{mm}/{executionId}.mp4
 *
 * Reuses the same R2 bucket and credentials as Foto Estudio.
 * Server-only — never import from client components.
 *
 * Dev / no-R2 mode:
 *   If any required credential env var is missing, returns null so the
 *   caller can fail gracefully without throwing a credential error.
 */

import "server-only";

import fs              from "fs";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface VideoStorageUploadInput {
  /** Absolute path to the rendered MP4 on the local filesystem. */
  localPath:   string;
  /** Tenant/org ID — used as the storage prefix. */
  tenantId:    string;
  /** Execution ID used to generate a stable object key. */
  executionId: string;
}

export interface VideoStorageUploadResult {
  /** Public CDN URL. */
  url:     string;
  /** R2 object key (for audit or deletion). */
  key:     string;
  /** File size in bytes. */
  bytes:   number;
}

// ── Env helpers ────────────────────────────────────────────────────────────────

function getEnv() {
  return {
    accountId:       process.env.R2_ACCOUNT_ID        ?? "",
    accessKeyId:     process.env.R2_ACCESS_KEY_ID     ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    bucket:          process.env.R2_BUCKET            ?? "",
    publicBaseUrl:  (process.env.R2_PUBLIC_BASE_URL   ?? "").replace(/\/+$/, ""),
  };
}

function isR2Configured(env: ReturnType<typeof getEnv>): boolean {
  return !!(env.accountId && env.accessKeyId && env.secretAccessKey && env.bucket && env.publicBaseUrl);
}

function buildClient(env: ReturnType<typeof getEnv>): S3Client {
  return new S3Client({
    region:   "auto",
    endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
  });
}

// ── Object key ────────────────────────────────────────────────────────────────

function buildKey(tenantId: string, executionId: string): string {
  const now        = new Date();
  const yyyy       = String(now.getUTCFullYear());
  const mm         = String(now.getUTCMonth() + 1).padStart(2, "0");
  const safeTid    = tenantId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeExecId = executionId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 36);
  return `video-renders/${safeTid}/${yyyy}/${mm}/${safeExecId}.mp4`;
}

// ── Upload ────────────────────────────────────────────────────────────────────

/**
 * Uploads a rendered video file from /tmp to R2.
 *
 * Returns null when R2 credentials are not configured (local dev).
 * Throws on any upload failure.
 *
 * The caller is responsible for deleting the local temp file after
 * this function returns (success or failure).
 */
export async function uploadRenderedVideo(
  input: VideoStorageUploadInput,
): Promise<VideoStorageUploadResult | null> {
  const env = getEnv();

  if (!isR2Configured(env)) {
    console.warn("[video-storage] R2 not configured — skipping upload.");
    return null;
  }

  if (!fs.existsSync(input.localPath)) {
    throw new Error(`Archivo renderizado no encontrado: ${input.localPath}`);
  }

  const buffer = fs.readFileSync(input.localPath);
  const bytes  = buffer.byteLength;

  if (bytes === 0) {
    throw new Error("El archivo renderizado está vacío.");
  }

  const key    = buildKey(input.tenantId, input.executionId);
  const client = buildClient(env);

  await client.send(new PutObjectCommand({
    Bucket:       env.bucket,
    Key:          key,
    Body:         buffer,
    ContentType:  "video/mp4",
    CacheControl: "public, max-age=31536000, immutable",
  }));

  const url = `${env.publicBaseUrl}/${key}`;

  console.log(`[video-storage] Uploaded rendered video → ${url} (${bytes} bytes)`);

  return { url, key, bytes };
}
