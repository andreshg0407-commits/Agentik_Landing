/**
 * lib/storage/storage-verification-status.ts
 *
 * MARKETING-R4A-SECURITY-CLOSEOUT-R1 — Storage Verification Status
 *
 * Three-state model for R2 storage readiness:
 *   NOT_CONFIGURED           — R2 env vars missing entirely
 *   CONFIGURED_NOT_VERIFIED  — R2 env vars present but canary not executed
 *   CANARY_VERIFIED          — R2 configured AND canary passed (env flag)
 *
 * Canary verification is set by the operator after running the canary route
 * and confirming all 7 steps pass. Set STORAGE_CANARY_VERIFIED=true in env.
 *
 * No credentials, bucket names, or config details are exposed.
 */

import "server-only";

import { loadR2Config } from "./r2-config";

export type StorageVerificationState =
  | "NOT_CONFIGURED"
  | "CONFIGURED_NOT_VERIFIED"
  | "CANARY_VERIFIED";

export interface StorageVerificationStatus {
  state:           StorageVerificationState;
  uploadsAllowed:  boolean;  // true ONLY when CANARY_VERIFIED
  reason:          string;   // human-readable explanation (no secrets)
}

/**
 * Server-side storage readiness check.
 * A disabled UI button is NOT a gate — this is the real gate.
 *
 * CANARY_VERIFIED requires:
 *   1. All R2 env vars present (loadR2Config() !== null)
 *   2. STORAGE_CANARY_VERIFIED=true env var set by operator
 *
 * Never exposes credentials, bucket names, or config details.
 */
export function getStorageVerificationStatus(): StorageVerificationStatus {
  const config = loadR2Config();

  if (!config) {
    return {
      state:          "NOT_CONFIGURED",
      uploadsAllowed: false,
      reason:         "R2 storage not configured — upload infrastructure absent",
    };
  }

  const canaryVerified = process.env.STORAGE_CANARY_VERIFIED === "true";

  if (!canaryVerified) {
    return {
      state:          "CONFIGURED_NOT_VERIFIED",
      uploadsAllowed: false,
      reason:         "R2 configured but canary not verified — run storage-canary first",
    };
  }

  return {
    state:          "CANARY_VERIFIED",
    uploadsAllowed: true,
    reason:         "R2 configured and canary verified",
  };
}
