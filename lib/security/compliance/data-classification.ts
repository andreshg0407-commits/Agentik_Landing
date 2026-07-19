/**
 * lib/security/compliance/data-classification.ts
 *
 * AGENTIK-SECURITY-COMPLIANCE-01
 * Compliance & Governance — Data Classification
 *
 * Defines data classification levels and handling policies.
 * Used for GDPR, SOC2, and ISO27001 compliance evaluation.
 *
 * No server-only. No Prisma. Pure domain data.
 */

// ── DataClassificationLevel ───────────────────────────────────────────────────

/**
 * DataClassificationLevel — sensitivity classification for data assets.
 *
 * PUBLIC      — information approved for public disclosure
 * INTERNAL    — information for internal company use only
 * CONFIDENTIAL — sensitive business information; limited distribution
 * RESTRICTED  — highly sensitive; strict need-to-know access
 * SECRET      — most sensitive; cryptographic, legal, or regulatory critical
 */
export type DataClassificationLevel =
  | "PUBLIC"
  | "INTERNAL"
  | "CONFIDENTIAL"
  | "RESTRICTED"
  | "SECRET";

export const DATA_CLASSIFICATION_LEVELS: DataClassificationLevel[] = [
  "PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "SECRET",
];

export const DATA_CLASSIFICATION_RANK: Record<DataClassificationLevel, number> = {
  PUBLIC:       1,
  INTERNAL:     2,
  CONFIDENTIAL: 3,
  RESTRICTED:   4,
  SECRET:       5,
};

// ── DataClassificationPolicy ──────────────────────────────────────────────────

/**
 * DataClassificationPolicy — handling requirements for a classification level.
 */
export interface DataClassificationPolicy {
  level:              DataClassificationLevel;
  description:        string;
  /** Whether data at this level must be encrypted at rest. */
  requiresEncryption: boolean;
  /** Whether data at this level must be encrypted in transit. */
  requiresTls:        boolean;
  /** Whether access to data at this level must be audited. */
  requiresAudit:      boolean;
  /** Whether data at this level requires MFA for access. */
  requiresMfa:        boolean;
  /** Maximum retention period in days (0 = no platform limit). */
  maxRetentionDays:   number;
  /** Whether data at this level is subject to GDPR. */
  isGdprPersonalData: boolean;
  /** Permitted access roles. */
  permittedRoles:     string[];
}

// ── Classification Policies ───────────────────────────────────────────────────

export const DATA_CLASSIFICATION_POLICIES: ReadonlyArray<DataClassificationPolicy> = [
  {
    level:              "PUBLIC",
    description:        "Information explicitly approved for public release. No sensitivity restrictions.",
    requiresEncryption: false,
    requiresTls:        true,
    requiresAudit:      false,
    requiresMfa:        false,
    maxRetentionDays:   0,
    isGdprPersonalData: false,
    permittedRoles:     ["*"],
  },
  {
    level:              "INTERNAL",
    description:        "Standard business information for internal use. Not approved for external distribution.",
    requiresEncryption: false,
    requiresTls:        true,
    requiresAudit:      false,
    requiresMfa:        false,
    maxRetentionDays:   1825,   // 5 years
    isGdprPersonalData: false,
    permittedRoles:     ["OPERATOR", "MANAGER", "ORG_ADMIN", "SUPER_ADMIN", "AGENTIK_ADMIN"],
  },
  {
    level:              "CONFIDENTIAL",
    description:        "Sensitive business data including financial records, customer data, and operational metrics.",
    requiresEncryption: true,
    requiresTls:        true,
    requiresAudit:      true,
    requiresMfa:        false,
    maxRetentionDays:   2555,   // 7 years (financial records)
    isGdprPersonalData: true,
    permittedRoles:     ["MANAGER", "ORG_ADMIN", "SUPER_ADMIN", "AGENTIK_ADMIN", "AUDITOR"],
  },
  {
    level:              "RESTRICTED",
    description:        "Highly sensitive data. Includes PII, health data, legal documents, and trade secrets.",
    requiresEncryption: true,
    requiresTls:        true,
    requiresAudit:      true,
    requiresMfa:        true,
    maxRetentionDays:   3650,   // 10 years
    isGdprPersonalData: true,
    permittedRoles:     ["ORG_ADMIN", "SUPER_ADMIN", "AGENTIK_ADMIN", "SECURITY_ADMIN"],
  },
  {
    level:              "SECRET",
    description:        "Most sensitive data. Includes cryptographic keys, platform credentials, and security infrastructure.",
    requiresEncryption: true,
    requiresTls:        true,
    requiresAudit:      true,
    requiresMfa:        true,
    maxRetentionDays:   365,
    isGdprPersonalData: false,
    permittedRoles:     ["SUPER_ADMIN", "AGENTIK_ADMIN", "SECURITY_ADMIN"],
  },
];

// ── Lookup helpers ────────────────────────────────────────────────────────────

export function getClassificationPolicy(
  level: DataClassificationLevel,
): DataClassificationPolicy | undefined {
  return DATA_CLASSIFICATION_POLICIES.find(p => p.level === level);
}

export function isHigherClassification(
  a: DataClassificationLevel,
  b: DataClassificationLevel,
): boolean {
  return DATA_CLASSIFICATION_RANK[a] > DATA_CLASSIFICATION_RANK[b];
}

export function requiresEncryption(level: DataClassificationLevel): boolean {
  return getClassificationPolicy(level)?.requiresEncryption ?? true;
}

export function requiresMfaForAccess(level: DataClassificationLevel): boolean {
  return getClassificationPolicy(level)?.requiresMfa ?? true;
}

export function isGdprPersonalData(level: DataClassificationLevel): boolean {
  return getClassificationPolicy(level)?.isGdprPersonalData ?? false;
}
