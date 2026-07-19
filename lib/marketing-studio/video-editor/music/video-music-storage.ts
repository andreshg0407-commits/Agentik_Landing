/**
 * lib/marketing-studio/video-editor/music/video-music-storage.ts
 *
 * MARKETING-VIDEO-MUSIC-01 — Music R2 Storage Adapter
 *
 * Uploads audio files to the Agentik R2 bucket under the music-tracks prefix.
 * Returns null in dev/no-R2 mode so the caller can store a placeholder URL.
 *
 * Key pattern:
 *   music-tracks/{tenantId}/{yyyy}/{mm}/{trackId}.{ext}
 *
 * Server-only — never import from client components.
 */

import "server-only";

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// ── MIME to extension map ──────────────────────────────────────────────────────

const AUDIO_MIME_TO_EXT: Record<string, string> = {
  "audio/mpeg":       "mp3",
  "audio/mp3":        "mp3",
  "audio/mp4":        "m4a",
  "audio/x-m4a":     "m4a",
  "audio/wav":        "wav",
  "audio/x-wav":     "wav",
  "audio/wave":       "wav",
  "audio/ogg":        "ogg",
  "audio/aac":        "aac",
  "audio/x-aac":     "aac",
  "audio/flac":       "flac",
  "audio/x-flac":    "flac",
};

function extFromMime(mime: string): string {
  return AUDIO_MIME_TO_EXT[mime.toLowerCase()] ?? "mp3";
}

// ── Env ───────────────────────────────────────────────────────────────────────

function getEnv() {
  const accountId       = process.env.R2_ACCOUNT_ID        ?? "";
  const accessKeyId     = process.env.R2_ACCESS_KEY_ID     ?? "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? "";
  const bucket          = process.env.R2_BUCKET            ?? "";
  const publicBaseUrl   = (process.env.R2_PUBLIC_BASE_URL  ?? "").replace(/\/+$/, "");
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
}

function isR2Configured(env: ReturnType<typeof getEnv>): boolean {
  return !!(env.accountId && env.accessKeyId && env.secretAccessKey && env.bucket && env.publicBaseUrl);
}

// ── Upload ────────────────────────────────────────────────────────────────────

export interface MusicUploadInput {
  buffer:   Buffer;
  mimeType: string;
  tenantId: string;
  trackId:  string;
}

export interface MusicUploadOutput {
  url: string;
  key: string;
}

/**
 * Uploads an audio buffer to R2 under the music-tracks prefix.
 * Returns null if R2 credentials are not configured (dev mode).
 * @throws if R2 is configured but the upload fails.
 */
export async function uploadMusicTrackToR2(
  input: MusicUploadInput,
): Promise<MusicUploadOutput | null> {
  const env = getEnv();
  if (!isR2Configured(env)) return null;

  const s3      = new S3Client({
    region:   "auto",
    endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
  });

  const now     = new Date();
  const yyyy    = String(now.getUTCFullYear());
  const mm      = String(now.getUTCMonth() + 1).padStart(2, "0");
  const ext     = extFromMime(input.mimeType);
  const safeTid = input.tenantId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeTrk = input.trackId.replace(/[^a-zA-Z0-9_-]/g, "_");

  const key = `music-tracks/${safeTid}/${yyyy}/${mm}/${safeTrk}.${ext}`;

  await s3.send(new PutObjectCommand({
    Bucket:       env.bucket,
    Key:          key,
    Body:         input.buffer,
    ContentType:  input.mimeType,
    CacheControl: "public, max-age=31536000, immutable",
  }));

  return {
    url: `${env.publicBaseUrl}/${key}`,
    key,
  };
}

/**
 * Downloads an audio file from a URL to a Buffer.
 * Used by the render worker to download a music track before FFmpeg mixing.
 * @throws user-facing Spanish message on failure.
 */
export async function downloadMusicTrack(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) {
    throw new Error(`No pudimos descargar la pista de música (${res.status}).`);
  }
  const ab = await res.arrayBuffer();
  if (ab.byteLength === 0) {
    throw new Error("La pista de música está vacía.");
  }
  return Buffer.from(ab);
}
