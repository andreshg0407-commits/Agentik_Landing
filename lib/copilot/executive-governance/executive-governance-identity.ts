// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 2: Identity

const nanoid = () => Math.random().toString(36).slice(2, 11);

export const generateGovernanceSessionId  = (): string => `gov_${nanoid()}`;
export const generatePolicyId             = (): string => `policy_${nanoid()}`;
export const generateRuleId               = (): string => `rule_${nanoid()}`;
export const generateConstraintId         = (): string => `gov_constraint_${nanoid()}`;
export const generateDecisionId           = (): string => `decision_${nanoid()}`;
export const generateDecisionCandidateId  = (): string => `gov_candidate_${nanoid()}`;
export const generateApprovalId           = (): string => `gov_approval_${nanoid()}`;
export const generateExceptionId          = (): string => `exception_${nanoid()}`;
export const generateEscalationId         = (): string => `escalation_${nanoid()}`;
export const generateAuthorityId          = (): string => `gov_authority_${nanoid()}`;
export const generateRoleId               = (): string => `gov_role_${nanoid()}`;
export const generateFindingId            = (): string => `gov_finding_${nanoid()}`;
export const generateViolationId          = (): string => `gov_violation_${nanoid()}`;
export const generateGovernanceRiskId     = (): string => `gov_risk_${nanoid()}`;
export const generateControlId            = (): string => `gov_control_${nanoid()}`;
export const generateAssessmentId         = (): string => `gov_assessment_${nanoid()}`;
export const generateGovernanceRecommendationId = (): string => `gov_rec_${nanoid()}`;
export const generateGovernanceReportId   = (): string => `gov_report_${nanoid()}`;
export const generateGovernanceDigestId   = (): string => `gov_digest_${nanoid()}`;
export const generateGovernanceBriefingId = (): string => `gov_briefing_${nanoid()}`;
export const generateGovernanceAuditId    = (): string => `gov_audit_${nanoid()}`;

const VALID_PREFIXES = [
  "gov_", "policy_", "rule_", "decision_", "escalation_", "exception_",
  "gov_report_", "gov_approval_", "gov_violation_", "gov_finding_",
  "gov_risk_", "gov_control_", "gov_assessment_", "gov_authority_",
  "gov_role_", "gov_rec_", "gov_digest_", "gov_briefing_", "gov_audit_",
  "gov_constraint_", "gov_candidate_",
];

export function validateGovernanceId(id: string): boolean {
  try {
    return VALID_PREFIXES.some((prefix) => id.startsWith(prefix));
  } catch {
    return false;
  }
}

export function getGovernanceIdPrefix(id: string): string | null {
  try {
    const match = VALID_PREFIXES.find((prefix) => id.startsWith(prefix));
    return match ?? null;
  } catch {
    return null;
  }
}
