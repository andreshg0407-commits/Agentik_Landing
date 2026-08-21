/**
 * lib/storage/asset-ingestion-gate.ts
 *
 * MARKETING-R4A-SECURITY-CLOSEOUT-R1 — Conjunctive Asset Ingestion Gate
 *
 * Asset ingestion is allowed ONLY when ALL conditions are true:
 *   1. storageCanaryVerified     — R2 canary passed (STORAGE_CANARY_VERIFIED=true)
 *   2. productIdentityUniqueness — @@unique(organizationId, sku) migration applied
 *
 * If EITHER is false: assetIngestionAllowed = false.
 *
 * This is a SERVER-SIDE gate. Disabling UI buttons is NOT sufficient.
 * Every write path (upload, bulk-import, Drive import) MUST check this gate.
 *
 * PRODUCT_IDENTITY_UNIQUENESS_CERTIFIED requires:
 *   1. Duplicate audit shows zero duplicates
 *   2. @@unique migration applied to ProductEntity
 *   3. Operator sets PRODUCT_IDENTITY_UNIQUENESS_CERTIFIED=true in env
 */

import "server-only";

import { getStorageVerificationStatus } from "./storage-verification-status";

export interface AssetIngestionGateResult {
  assetIngestionAllowed:              boolean;
  storageCanaryVerified:              boolean;
  productIdentityUniquenessCertified: boolean;
  reason:                             string;
}

/**
 * Server-side conjunctive gate for asset ingestion.
 * Both conditions must be true for ingestion to proceed.
 */
export function evaluateAssetIngestionGate(): AssetIngestionGateResult {
  const storage = getStorageVerificationStatus();
  const storageCanaryVerified = storage.uploadsAllowed;

  const productIdentityUniquenessCertified =
    process.env.PRODUCT_IDENTITY_UNIQUENESS_CERTIFIED === "true";

  const assetIngestionAllowed =
    storageCanaryVerified && productIdentityUniquenessCertified;

  let reason: string;
  if (assetIngestionAllowed) {
    reason = "All ingestion gates passed";
  } else if (!storageCanaryVerified && !productIdentityUniquenessCertified) {
    reason = "Storage canary not verified AND product identity uniqueness not certified";
  } else if (!storageCanaryVerified) {
    reason = "Storage canary not verified — " + storage.reason;
  } else {
    reason = "Product identity uniqueness not certified — @@unique(organizationId, sku) migration pending";
  }

  return {
    assetIngestionAllowed,
    storageCanaryVerified,
    productIdentityUniquenessCertified,
    reason,
  };
}
