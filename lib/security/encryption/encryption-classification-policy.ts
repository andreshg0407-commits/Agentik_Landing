/**
 * lib/security/encryption/encryption-classification-policy.ts
 *
 * AGENTIK-SECURITY-ENCRYPTION-01
 * Encryption Foundation — Classification Policy
 *
 * Deterministic rules for deciding whether data requires encryption.
 * No AI. No heuristics. Pure policy functions.
 *
 * Classification levels:
 *   PUBLIC       → false  (public data, no encryption needed)
 *   INTERNAL     → false  (internal operational data, no encryption needed)
 *   CONFIDENTIAL → true   (sensitive business data, encryption required)
 *   RESTRICTED   → true   (highly sensitive data, encryption required)
 *
 * No Prisma. No server-only. Pure domain logic.
 */

import type { EncryptionClassification } from "./encryption-types";

// ── Classification Levels ─────────────────────────────────────────────────────

/**
 * Full data classification spectrum (extends EncryptionClassification with
 * non-encrypting levels for completeness).
 */
export type DataClassification = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";

// ── Policy Functions ──────────────────────────────────────────────────────────

/**
 * requiresEncryption — determine if data at this classification must be encrypted.
 *
 * PUBLIC       → false  (no encryption needed)
 * INTERNAL     → false  (no encryption needed)
 * CONFIDENTIAL → true   (encryption required)
 * RESTRICTED   → true   (encryption required)
 *
 * Deterministic. No side effects. No AI.
 */
export function requiresEncryption(classification: DataClassification): boolean {
  switch (classification) {
    case "PUBLIC":       return false;
    case "INTERNAL":     return false;
    case "CONFIDENTIAL": return true;
    case "RESTRICTED":   return true;
    default:
      // Unknown classification → fail closed (require encryption)
      return true;
  }
}

/**
 * toEncryptionClassification — convert a DataClassification that requires
 * encryption into an EncryptionClassification.
 *
 * Returns null for classifications that do not require encryption.
 */
export function toEncryptionClassification(
  classification: DataClassification,
): EncryptionClassification | null {
  switch (classification) {
    case "CONFIDENTIAL": return "CONFIDENTIAL";
    case "RESTRICTED":   return "RESTRICTED";
    default:             return null;
  }
}

/**
 * classificationRank — numeric rank for comparison.
 * Higher rank = more sensitive.
 */
export function classificationRank(classification: DataClassification): number {
  const ranks: Record<DataClassification, number> = {
    PUBLIC:       0,
    INTERNAL:     1,
    CONFIDENTIAL: 2,
    RESTRICTED:   3,
  };
  return ranks[classification] ?? 0;
}

/**
 * isMoreSensitiveThan — compare two classifications.
 */
export function isMoreSensitiveThan(
  a: DataClassification,
  b: DataClassification,
): boolean {
  return classificationRank(a) > classificationRank(b);
}

/**
 * elevateClassification — return the more sensitive of two classifications.
 * Used when combining data from multiple sources.
 */
export function elevateClassification(
  a: DataClassification,
  b: DataClassification,
): DataClassification {
  return classificationRank(a) >= classificationRank(b) ? a : b;
}

// ── Asset Classification Map ──────────────────────────────────────────────────

/**
 * Default classification for each registered asset type.
 * Drives automatic policy enforcement.
 */
export const ASSET_CLASSIFICATION_MAP: ReadonlyMap<string, DataClassification> = new Map([
  ["COPILOT_MEMORY",        "CONFIDENTIAL"],
  ["PLAYBOOK",              "CONFIDENTIAL"],
  ["EXECUTIVE_CONTEXT",     "CONFIDENTIAL"],
  ["FINANCIAL_RECORD",      "CONFIDENTIAL"],
  ["CUSTOMER_RECORD",       "CONFIDENTIAL"],
  ["EMPLOYEE_RECORD",       "RESTRICTED"],
  ["AGENT_CONFIGURATION",   "CONFIDENTIAL"],
  // Non-encrypting assets
  ["PUBLIC_CONTENT",        "PUBLIC"],
  ["OPERATIONAL_LOG",       "INTERNAL"],
]);

/**
 * getAssetClassification — get the default classification for an asset type.
 * Returns INTERNAL for unknown types (conservative but not encrypted).
 */
export function getAssetClassification(assetType: string): DataClassification {
  return ASSET_CLASSIFICATION_MAP.get(assetType) ?? "INTERNAL";
}

/**
 * assetRequiresEncryption — convenience wrapper.
 * Returns true if the asset type's default classification requires encryption.
 */
export function assetRequiresEncryption(assetType: string): boolean {
  return requiresEncryption(getAssetClassification(assetType));
}

/**
 * getAllEncryptionRequiredAssets — return all asset types that require encryption.
 */
export function getAllEncryptionRequiredAssets(): string[] {
  const result: string[] = [];
  for (const [assetType, classification] of ASSET_CLASSIFICATION_MAP) {
    if (requiresEncryption(classification)) result.push(assetType);
  }
  return result;
}
