/**
 * lib/security/compliance/integrations/compliance-rbac.ts
 *
 * AGENTIK-SECURITY-COMPLIANCE-01
 * Compliance Integration — RBAC
 *
 * Converts RBAC data into ComplianceEvidence for CTRL_ACCESS_CONTROL.
 *
 * No server-only. Pure domain adapter.
 */

import type { ComplianceEvidence } from "../compliance-types";
import { buildRbacEvidence } from "../evidence-engine";
import { CTRL_ACCESS_CONTROL } from "../control-catalog";

// ── RbacComplianceInput ───────────────────────────────────────────────────────

export interface RbacComplianceInput {
  orgSlug:           string;
  roleCount:         number;
  assignmentCount:   number;
  /** True if every assignment maps to a specific role (no wildcard grants). */
  hasLeastPrivilege: boolean;
  /** True if all admin roles require explicit assignment (no auto-grant). */
  hasExplicitAdminGrants: boolean;
  /** Number of DENY decisions in the last evaluation window. */
  denyCount?:        number;
}

// ── rbacToComplianceEvidence ──────────────────────────────────────────────────

/**
 * rbacToComplianceEvidence — convert RBAC metrics into compliance evidence.
 */
export function rbacToComplianceEvidence(
  input: RbacComplianceInput,
): ComplianceEvidence[] {
  try {
    const evidence = buildRbacEvidence({
      orgSlug:           input.orgSlug,
      controlId:         CTRL_ACCESS_CONTROL,
      roleCount:         input.roleCount,
      assignmentCount:   input.assignmentCount,
      hasLeastPrivilege: input.hasLeastPrivilege,
    });
    return [evidence];
  } catch {
    return [];
  }
}

// ── hasRbacCoverage ───────────────────────────────────────────────────────────

/**
 * hasRbacCoverage — quick check: is RBAC active for the org?
 */
export function hasRbacCoverage(input: RbacComplianceInput): boolean {
  return input.roleCount > 0 && input.hasLeastPrivilege;
}
