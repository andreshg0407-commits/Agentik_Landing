/**
 * lib/security/mfa/mfa-policy.ts
 *
 * AGENTIK-SECURITY-MFA-01
 * MFA Policy Domain — Resource-Level MFA Requirements
 *
 * No server-only. No Prisma. Pure domain contracts.
 * Defines which resources require MFA and which methods are acceptable.
 *
 * Policy evaluation is fail-closed: if policy lookup fails, MFA is REQUIRED.
 */

import type { MfaMethod, MfaRiskLevel } from "./mfa-types";

// ── MFA Policy ────────────────────────────────────────────────────────────────

/**
 * MfaPolicy — defines whether a resource/action requires MFA.
 */
export interface MfaPolicy {
  /** Resource identifier (matches ZeroTrustResourceType or custom domain). */
  resource:        string;
  /** Human-readable name for audit/display. */
  name:            string;
  /** Whether MFA is required for this resource. */
  required:        boolean;
  /** Risk level that determines the urgency of the MFA requirement. */
  riskLevel:       MfaRiskLevel;
  /** Accepted MFA methods (empty = all methods accepted). */
  allowedMethods:  MfaMethod[];
  /** Whether RECOVERY_CODE is acceptable for this policy. */
  allowRecovery:   boolean;
  /** Optional reason shown to the user when MFA is challenged. */
  reason?:         string;
}

// ── MFA Policy Registry ────────────────────────────────────────────────────────

/**
 * MFA_POLICIES — static policy definitions for all Agentik resources.
 *
 * Evaluated by mfa-zero-trust.ts and mfa-verification.ts.
 * Add new entries as new sensitive resources are added to the platform.
 */
export const MFA_POLICIES: MfaPolicy[] = [
  // ── Vault ──────────────────────────────────────────────────────────────────
  {
    resource:       "VAULT",
    name:           "Vault Access",
    required:       true,
    riskLevel:      "CRITICAL",
    allowedMethods: ["TOTP", "PASSKEY", "WEBAUTHN"],
    allowRecovery:  false,
    reason:         "Access to secret vault requires strong MFA",
  },

  // ── KMS ────────────────────────────────────────────────────────────────────
  {
    resource:       "ENCRYPTION_KEY",
    name:           "KMS Admin",
    required:       true,
    riskLevel:      "CRITICAL",
    allowedMethods: ["TOTP", "PASSKEY", "WEBAUTHN"],
    allowRecovery:  false,
    reason:         "Key management operations require strong MFA",
  },

  // ── Secret Rotation ────────────────────────────────────────────────────────
  {
    resource:       "SECRET_ROTATION",
    name:           "Secret Rotation",
    required:       true,
    riskLevel:      "CRITICAL",
    allowedMethods: ["TOTP", "PASSKEY", "WEBAUTHN"],
    allowRecovery:  false,
    reason:         "Secret rotation requires strong MFA",
  },

  // ── User Identity / Admin ──────────────────────────────────────────────────
  {
    resource:       "USER_IDENTITY",
    name:           "Identity Management",
    required:       true,
    riskLevel:      "HIGH",
    allowedMethods: ["TOTP", "EMAIL", "PASSKEY", "WEBAUTHN", "RECOVERY_CODE"],
    allowRecovery:  true,
    reason:         "Identity operations require MFA",
  },

  // ── Tenant Admin ──────────────────────────────────────────────────────────
  {
    resource:       "TENANT_SETTINGS",
    name:           "Tenant Administration",
    required:       true,
    riskLevel:      "HIGH",
    allowedMethods: ["TOTP", "EMAIL", "PASSKEY", "WEBAUTHN", "RECOVERY_CODE"],
    allowRecovery:  true,
    reason:         "Tenant settings require MFA",
  },

  // ── Executive Brain ────────────────────────────────────────────────────────
  {
    resource:       "AI_EXECUTIVE_BRAIN",
    name:           "Executive Brain Admin",
    required:       true,
    riskLevel:      "HIGH",
    allowedMethods: ["TOTP", "EMAIL", "PASSKEY", "WEBAUTHN", "RECOVERY_CODE"],
    allowRecovery:  true,
    reason:         "Executive intelligence access requires MFA",
  },

  // ── Audit Logs ─────────────────────────────────────────────────────────────
  {
    resource:       "AUDIT_LOG",
    name:           "Audit Log Access",
    required:       true,
    riskLevel:      "HIGH",
    allowedMethods: ["TOTP", "EMAIL", "PASSKEY", "WEBAUTHN", "RECOVERY_CODE"],
    allowRecovery:  true,
    reason:         "Audit log access requires MFA",
  },

  // ── Financial Data ─────────────────────────────────────────────────────────
  {
    resource:       "FINANCIAL_DATA",
    name:           "Financial Data",
    required:       false,
    riskLevel:      "MEDIUM",
    allowedMethods: ["TOTP", "EMAIL", "PASSKEY", "WEBAUTHN", "RECOVERY_CODE"],
    allowRecovery:  true,
    reason:         "Financial data access may require MFA based on context",
  },

  // ── Marketing ─────────────────────────────────────────────────────────────
  {
    resource:       "MARKETING_DATA",
    name:           "Marketing View",
    required:       false,
    riskLevel:      "LOW",
    allowedMethods: ["TOTP", "EMAIL", "SMS", "PASSKEY", "WEBAUTHN", "RECOVERY_CODE"],
    allowRecovery:  true,
  },

  // ── AI Memory ─────────────────────────────────────────────────────────────
  {
    resource:       "AI_MEMORY",
    name:           "AI Memory Access",
    required:       false,
    riskLevel:      "MEDIUM",
    allowedMethods: ["TOTP", "EMAIL", "PASSKEY", "WEBAUTHN", "RECOVERY_CODE"],
    allowRecovery:  true,
  },
];

// ── Policy Lookup ──────────────────────────────────────────────────────────────

/**
 * getMfaPolicy — retrieve the MFA policy for a resource.
 * Returns undefined if no policy is registered.
 */
export function getMfaPolicy(resource: string): MfaPolicy | undefined {
  return MFA_POLICIES.find(p => p.resource === resource);
}

/**
 * isMfaRequired — determine if MFA is required for a given resource.
 * Fail-closed: if policy not found, returns false (caller must decide on context).
 */
export function isMfaRequired(resource: string): boolean {
  const policy = getMfaPolicy(resource);
  return policy?.required ?? false;
}

/**
 * getMfaRiskLevel — get the risk level for a resource policy.
 * Returns MEDIUM as a conservative default.
 */
export function getMfaRiskLevel(resource: string): MfaRiskLevel {
  return getMfaPolicy(resource)?.riskLevel ?? "MEDIUM";
}

/**
 * isMethodAllowed — check if a method is allowed by the resource policy.
 * Returns true if no policy exists (permissive for unregistered resources).
 */
export function isMethodAllowed(resource: string, method: MfaMethod): boolean {
  const policy = getMfaPolicy(resource);
  if (!policy) return true;
  if (policy.allowedMethods.length === 0) return true;
  return policy.allowedMethods.includes(method);
}

/**
 * getRequiredResources — list all resources that mandate MFA.
 */
export function getRequiredResources(): MfaPolicy[] {
  return MFA_POLICIES.filter(p => p.required);
}

/**
 * getOptionalResources — list all resources where MFA is optional.
 */
export function getOptionalResources(): MfaPolicy[] {
  return MFA_POLICIES.filter(p => !p.required);
}
