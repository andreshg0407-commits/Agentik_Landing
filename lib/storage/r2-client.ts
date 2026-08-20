/**
 * lib/storage/r2-client.ts
 *
 * MARKETING-ASSET-STORAGE-R2-HARDENING-03B — Shared R2 Client
 *
 * Single shared module for all R2 operations:
 *   - Put (upload)
 *   - Head (existence/metadata check)
 *   - Get (download — URL resolver)
 *   - Delete (controlled, auditable)
 *   - Checksum (SHA-256)
 *
 * Server-only — never import from client components.
 * All operations require a certified R2Config from r2-config.ts.
 */

import "server-only";

import { createHash } from "crypto";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import type { R2Config } from "./r2-config";

// ── S3 client factory ─────────────────────────────────────────────────────────

function buildS3Client(config: R2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

// ── Checksum ──────────────────────────────────────────────────────────────────

/**
 * Computes SHA-256 hex digest for a buffer.
 */
export function computeChecksum(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

// ── Storage identity ──────────────────────────────────────────────────────────

/**
 * Full storage identity for an uploaded object.
 * This is what gets persisted in DB — not just the URL.
 */
export interface StorageIdentity {
  provider: "cloudflare_r2";
  environment: string;
  bucket: string;
  objectKey: string;
  publicUrl: string;
  organizationId: string;
  mimeType: string;
  size: number;
  checksum: string;
  originalFilename: string | null;
  source: string;
  createdAt: string;
}

// ── Put ───────────────────────────────────────────────────────────────────────

export interface R2PutInput {
  config: R2Config;
  objectKey: string;
  body: Buffer;
  contentType: string;
  cacheControl?: string;
}

export interface R2PutResult {
  objectKey: string;
  publicUrl: string;
  bytes: number;
  checksum: string;
}

/**
 * Uploads a buffer to R2 and verifies with HeadObject.
 * Returns the public URL and metadata.
 * Throws on any upload or verification failure.
 */
export async function r2Put(input: R2PutInput): Promise<R2PutResult> {
  const s3 = buildS3Client(input.config);
  const checksum = computeChecksum(input.body);

  await s3.send(
    new PutObjectCommand({
      Bucket: input.config.bucket,
      Key: input.objectKey,
      Body: input.body,
      ContentType: input.contentType,
      CacheControl: input.cacheControl ?? "public, max-age=31536000, immutable",
      Metadata: {
        "x-checksum-sha256": checksum,
      },
    }),
  );

  // Verify the upload succeeded
  try {
    const head = await s3.send(
      new HeadObjectCommand({
        Bucket: input.config.bucket,
        Key: input.objectKey,
      }),
    );
    if (!head.ContentLength || head.ContentLength === 0) {
      throw new Error("HeadObject returned zero ContentLength after upload");
    }
  } catch (err) {
    throw new Error(
      `R2 upload verification failed for key ${input.objectKey}: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }

  return {
    objectKey: input.objectKey,
    publicUrl: `${input.config.publicBaseUrl}/${input.objectKey}`,
    bytes: input.body.byteLength,
    checksum,
  };
}

// ── Head ──────────────────────────────────────────────────────────────────────

export interface R2HeadResult {
  exists: boolean;
  contentLength?: number;
  contentType?: string;
  lastModified?: Date;
}

/**
 * Checks if an object exists in R2 and returns metadata.
 * Never throws — returns { exists: false } on 404 or error.
 */
export async function r2Head(
  config: R2Config,
  objectKey: string,
): Promise<R2HeadResult> {
  const s3 = buildS3Client(config);
  try {
    const head = await s3.send(
      new HeadObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
      }),
    );
    return {
      exists: true,
      contentLength: head.ContentLength,
      contentType: head.ContentType,
      lastModified: head.LastModified,
    };
  } catch {
    return { exists: false };
  }
}

// ── URL resolver ──────────────────────────────────────────────────────────────

/**
 * Resolves an objectKey to a public delivery URL.
 * The canonical identity is objectKey — URLs are derived.
 */
export function resolvePublicUrl(config: R2Config, objectKey: string): string {
  return `${config.publicBaseUrl}/${objectKey}`;
}

/**
 * Extracts an objectKey from a full public URL, if possible.
 * Returns null if the URL doesn't match the configured base.
 */
export function extractObjectKey(
  config: R2Config,
  url: string,
): string | null {
  const base = config.publicBaseUrl + "/";
  if (url.startsWith(base)) {
    return url.slice(base.length);
  }
  return null;
}

// ── Delete (controlled) ───────────────────────────────────────────────────────

export interface R2DeleteInput {
  config: R2Config;
  objectKey: string;
  /** Required for audit trail */
  reason: string;
  /** Required for audit trail */
  requestedBy: string;
  /** Required for audit trail */
  organizationId: string;
}

/**
 * Deletes a single, exact object from R2.
 *
 * SECURITY:
 *   - Only accepts exact objectKey — no prefix/wildcard deletion.
 *   - Verifies the key contains the claimed organizationId.
 *   - Logs the deletion for audit trail.
 *   - Returns false if the object doesn't exist (idempotent).
 */
export async function r2Delete(input: R2DeleteInput): Promise<boolean> {
  // Safety: verify the key belongs to the claimed org
  const expectedOrgSegment = `/organizations/${input.organizationId}/`;
  const expectedCanarySegment = `/canary/${input.organizationId}/`;
  if (
    !input.objectKey.includes(expectedOrgSegment) &&
    !input.objectKey.includes(expectedCanarySegment)
  ) {
    console.error(
      "[r2-client] DELETE BLOCKED: objectKey does not contain organizationId",
      {
        objectKey: input.objectKey,
        organizationId: input.organizationId,
      },
    );
    return false;
  }

  // Verify object exists before deleting
  const head = await r2Head(input.config, input.objectKey);
  if (!head.exists) {
    return false; // Already gone — idempotent
  }

  const s3 = buildS3Client(input.config);
  await s3.send(
    new DeleteObjectCommand({
      Bucket: input.config.bucket,
      Key: input.objectKey,
    }),
  );

  console.info("[r2-client] DELETE", {
    objectKey: input.objectKey,
    organizationId: input.organizationId,
    reason: input.reason,
    requestedBy: input.requestedBy,
    timestamp: new Date().toISOString(),
  });

  return true;
}

// ── Build storage identity ────────────────────────────────────────────────────

/**
 * Builds a full StorageIdentity from an R2PutResult and context.
 * This is what should be persisted in the database.
 */
export function buildStorageIdentity(
  config: R2Config,
  putResult: R2PutResult,
  context: {
    organizationId: string;
    mimeType: string;
    originalFilename: string | null;
    source: string;
  },
): StorageIdentity {
  return {
    provider: "cloudflare_r2",
    environment: config.environment,
    bucket: config.bucket,
    objectKey: putResult.objectKey,
    publicUrl: putResult.publicUrl,
    organizationId: context.organizationId,
    mimeType: context.mimeType,
    size: putResult.bytes,
    checksum: putResult.checksum,
    originalFilename: context.originalFilename,
    source: context.source,
    createdAt: new Date().toISOString(),
  };
}
