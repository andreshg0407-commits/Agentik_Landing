/**
 * lib/storage/r2-config.ts
 *
 * MARKETING-ASSET-STORAGE-R2-HARDENING-03B — R2 Configuration
 *
 * Single source of truth for R2 connection configuration.
 * Server-only — never import from client components.
 *
 * Environment separation:
 *   VERCEL_ENV = production | preview | development
 *   Local dev  = development (fallback)
 *
 * All object keys are prefixed with the resolved environment.
 */

import "server-only";

// ── Environment resolution ────────────────────────────────────────────────────

export type StorageEnvironment = "production" | "preview" | "development";

/**
 * Resolves the current storage environment server-side.
 * Never accepts environment from client input.
 */
export function resolveStorageEnvironment(): StorageEnvironment {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === "production") return "production";
  if (vercelEnv === "preview") return "preview";
  return "development";
}

// ── R2 credentials ────────────────────────────────────────────────────────────

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
  environment: StorageEnvironment;
}

/**
 * Loads R2 configuration from environment variables.
 * Returns null if any required credential is missing (dev/no-R2 mode).
 */
export function loadR2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID ?? "";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? "";
  const bucket = process.env.R2_BUCKET ?? "";
  const publicBaseUrl = (process.env.R2_PUBLIC_BASE_URL ?? "").replace(
    /\/+$/,
    "",
  );

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    return null;
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl,
    environment: resolveStorageEnvironment(),
  };
}

/**
 * Loads R2 configuration or throws a descriptive error.
 * Use in routes that REQUIRE R2 to be configured.
 */
export function requireR2Config(): R2Config {
  const config = loadR2Config();
  if (!config) {
    throw new Error(
      "R2 storage not configured. Required: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, " +
      "R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL",
    );
  }
  return config;
}

// ── Upload limits ─────────────────────────────────────────────────────────────

export function getMaxUploadBytes(): number {
  return Number(process.env.MAX_UPLOAD_MB ?? 20) * 1024 * 1024;
}
