/**
 * lib/security/compliance/integrations/compliance-zero-trust.ts
 *
 * AGENTIK-SECURITY-COMPLIANCE-01
 * Compliance Integration — Zero Trust
 *
 * Converts Zero Trust evaluation data into ComplianceEvidence for
 * CTRL_ZERO_TRUST and CTRL_ACCESS_CONTROL.
 *
 * No server-only. Pure domain adapter.
 */

import type { ComplianceEvidence } from "../compliance-types";
import { buildZeroTrustEvidence } from "../evidence-engine";
import { CTRL_ZERO_TRUST, CTRL_ACCESS_CONTROL } from "../control-catalog";

// ── ZeroTrustComplianceInput ──────────────────────────────────────────────────

export interface ZeroTrustComplianceInput {
  orgSlug:          string;
  policiesActive:   number;
  recentDenials:    number;   // DENY decisions in last 30 days
  hasStepUp:        boolean;  // step-up (MFA challenge) is supported
  /** Number of access decisions evaluated in last 30 days. */
  totalDecisions?:  number;
  /** True if continuous trust re-evaluation is active. */
  hasContinuousEval?: boolean;
}

// ── zeroTrustToComplianceEvidence ─────────────────────────────────────────────

/**
 * zeroTrustToComplianceEvidence — convert Zero Trust stats to compliance evidence.
 * Returns evidence for CTRL_ZERO_TRUST and CTRL_ACCESS_CONTROL.
 */
export function zeroTrustToComplianceEvidence(
  input: ZeroTrustComplianceInput,
): ComplianceEvidence[] {
  try {
    const ztEvidence = buildZeroTrustEvidence({
      orgSlug:        input.orgSlug,
      controlId:      CTRL_ZERO_TRUST,
      policiesActive: input.policiesActive,
      lastDenied:     input.recentDenials,
      hasStepUp:      input.hasStepUp,
    });

    const accessEvidence: ComplianceEvidence = {
      id:           `cev_zt_ac_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      orgSlug:      input.orgSlug,
      controlId:    CTRL_ACCESS_CONTROL,
      source:       "ZERO_TRUST",
      isSupporting: input.policiesActive > 0,
      summary:      input.policiesActive > 0
        ? `Zero Trust enforces access control: ${input.totalDecisions ?? 0} decisions evaluated, ${input.recentDenials} denials`
        : `Zero Trust gap: access control may rely on implicit trust — ${input.policiesActive} active policies`,
      data: {
        policiesActive:    input.policiesActive,
        recentDenials:     input.recentDenials,
        totalDecisions:    input.totalDecisions ?? 0,
        hasContinuousEval: input.hasContinuousEval ?? false,
      },
      collectedAt:  new Date().toISOString(),
      expiresAt:    new Date(Date.now() + 30 * 86_400_000).toISOString(),
    };

    return [ztEvidence, accessEvidence];
  } catch {
    return [];
  }
}

// ── isZeroTrustCompliant ──────────────────────────────────────────────────────

/**
 * isZeroTrustCompliant — quick check: ZT policies are active with step-up support.
 */
export function isZeroTrustCompliant(input: ZeroTrustComplianceInput): boolean {
  return input.policiesActive > 0 && input.hasStepUp;
}
