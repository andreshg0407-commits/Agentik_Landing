/**
 * lib/security/compliance/integrations/compliance-mfa.ts
 *
 * AGENTIK-SECURITY-COMPLIANCE-01
 * Compliance Integration — MFA
 *
 * Converts MFA enrollment/enforcement data into ComplianceEvidence for CTRL_MFA.
 *
 * No server-only. Pure domain adapter.
 */

import type { ComplianceEvidence } from "../compliance-types";
import { buildMfaEvidence } from "../evidence-engine";
import { CTRL_MFA } from "../control-catalog";

// ── MfaComplianceInput ────────────────────────────────────────────────────────

export interface MfaComplianceInput {
  orgSlug:            string;
  enrolledCount:      number;
  totalUsers:         number;
  enforcedForAdmins:  boolean;
  /** Number of MFA failures in the last 30-day window. */
  recentFailures?:    number;
  /** Methods available: TOTP, PASSKEY, RECOVERY_CODE. */
  availableMethods?:  string[];
}

// ── mfaToComplianceEvidence ───────────────────────────────────────────────────

/**
 * mfaToComplianceEvidence — convert MFA metrics into compliance evidence.
 */
export function mfaToComplianceEvidence(
  input: MfaComplianceInput,
): ComplianceEvidence[] {
  try {
    const evidence = buildMfaEvidence({
      orgSlug:           input.orgSlug,
      controlId:         CTRL_MFA,
      enrolledCount:     input.enrolledCount,
      totalUsers:        input.totalUsers,
      enforcedForAdmins: input.enforcedForAdmins,
    });
    return [evidence];
  } catch {
    return [];
  }
}

// ── getMfaCoveragePercent ─────────────────────────────────────────────────────

/**
 * getMfaCoveragePercent — compute MFA enrollment coverage as 0–100.
 */
export function getMfaCoveragePercent(input: MfaComplianceInput): number {
  if (input.totalUsers <= 0) return 0;
  return Math.round((input.enrolledCount / input.totalUsers) * 100);
}

// ── isMfaCompliant ────────────────────────────────────────────────────────────

/**
 * isMfaCompliant — quick check for SOC2/ISO27001 MFA compliance.
 * Requirements: ≥80% coverage + admin enforcement.
 */
export function isMfaCompliant(input: MfaComplianceInput): boolean {
  return getMfaCoveragePercent(input) >= 80 && input.enforcedForAdmins;
}
