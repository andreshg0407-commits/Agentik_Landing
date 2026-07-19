// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 1: Domain Type Contracts
// Multi-tenant, fail-closed, auditable, explicable. Never executes. Never approves automatically.

// ─── Enumerations ─────────────────────────────────────────────────────────────

export type GovernanceConfidence =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "VERY_HIGH";

export type GovernanceStatus =
  | "COMPLIANT"
  | "PARTIALLY_COMPLIANT"
  | "NON_COMPLIANT"
  | "UNDER_REVIEW";

export type GovernancePriorityLevel =
  | "CRITICAL"
  | "HIGH"
  | "MEDIUM"
  | "LOW";

export type GovernanceDomain =
  | "FINANCIAL"
  | "OPERATIONAL"
  | "STRATEGIC"
  | "REGULATORY"
  | "TECHNOLOGY"
  | "TALENT"
  | "LEGAL"
  | "RISK"
  | "COMMERCIAL"
  | "CROSS_DOMAIN";

export type GovernanceAuthorityLevel =
  | "CEO"
  | "BOARD"
  | "EXECUTIVE"
  | "DIRECTOR"
  | "MANAGER"
  | "SUPERVISOR";

export type GovernancePolicyType =
  | "FINANCIAL_THRESHOLD"
  | "APPROVAL_GATE"
  | "AUTHORITY_LIMIT"
  | "CONFLICT_OF_INTEREST"
  | "REGULATORY_COMPLIANCE"
  | "RISK_TOLERANCE"
  | "DATA_GOVERNANCE"
  | "VENDOR_MANAGEMENT"
  | "INVESTMENT_POLICY"
  | "DISCLOSURE_POLICY";

export type GovernanceRuleType =
  | "MANDATORY"
  | "CONDITIONAL"
  | "ADVISORY"
  | "PROHIBITIVE"
  | "ESCALATION_TRIGGER";

export type GovernanceDecisionType =
  | "INVESTMENT"
  | "STRATEGIC_CHANGE"
  | "VENDOR_APPROVAL"
  | "HIRING"
  | "BUDGET_INCREASE"
  | "EXPANSION"
  | "ACQUISITION"
  | "AUTOMATION"
  | "POLICY_CHANGE"
  | "EXCEPTION_GRANT";

export type GovernanceExceptionType =
  | "THRESHOLD_BREACH"
  | "AUTHORITY_OVERRIDE"
  | "POLICY_WAIVER"
  | "TIMING_EXCEPTION"
  | "SCOPE_EXCEPTION"
  | "REGULATORY_EXCEPTION";

export type GovernanceEscalationType =
  | "AUTHORITY_INSUFFICIENT"
  | "POLICY_CONFLICT"
  | "UNRESOLVED_EXCEPTION"
  | "VIOLATION_DETECTED"
  | "RISK_THRESHOLD_EXCEEDED"
  | "BOARD_REQUIRED";

export type GovernanceViolationType =
  | "POLICY_VIOLATION"
  | "AUTHORITY_VIOLATION"
  | "THRESHOLD_VIOLATION"
  | "DISCLOSURE_VIOLATION"
  | "PROCESS_VIOLATION";

export type GovernanceRiskType =
  | "CONCENTRATION_RISK"
  | "COMPLIANCE_RISK"
  | "AUTHORITY_RISK"
  | "REPUTATIONAL_RISK"
  | "OPERATIONAL_RISK"
  | "STRATEGIC_RISK";

export type GovernanceControlType =
  | "PREVENTIVE"
  | "DETECTIVE"
  | "CORRECTIVE"
  | "COMPENSATING";

export type GovernanceHealth =
  | "HEALTHY"
  | "DEGRADED"
  | "CRITICAL"
  | "EMPTY";

export type GovernanceDigestPeriod =
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "ANNUAL";

export type GovernanceBriefingType =
  | "CEO"
  | "BOARD"
  | "EXECUTIVE"
  | "COMPLIANCE"
  | "RISK";

// ─── Core Domain Objects ──────────────────────────────────────────────────────

export interface GovernanceSession {
  readonly id:          string;
  readonly orgSlug:     string;
  readonly sessionId:   string;
  readonly horizon?:    string;
  readonly domain?:     GovernanceDomain;
  readonly metadata:    Record<string, unknown>;
  readonly createdAt:   string;
}

export interface GovernancePolicy {
  readonly id:              string;
  readonly orgSlug:         string;
  readonly title:           string;
  readonly description:     string;
  readonly type:            GovernancePolicyType;
  readonly domain:          GovernanceDomain;
  readonly priority:        GovernancePriorityLevel;
  readonly isMandatory:     boolean;
  readonly version:         string;
  readonly threshold?:      number;
  readonly authorityLevel:  GovernanceAuthorityLevel;
  readonly evidenceIds:     string[];
  readonly limitations:     string[];
  readonly isActive:        boolean;
  readonly createdAt:       string;
}

export interface GovernanceRule {
  readonly id:           string;
  readonly orgSlug:      string;
  readonly policyId:     string;
  readonly title:        string;
  readonly description:  string;
  readonly type:         GovernanceRuleType;
  readonly domain:       GovernanceDomain;
  readonly condition:    string;
  readonly consequence:  string;
  readonly priority:     GovernancePriorityLevel;
  readonly isActive:     boolean;
  readonly evidenceIds:  string[];
  readonly createdAt:    string;
}

export interface GovernanceConstraint {
  readonly id:          string;
  readonly orgSlug:     string;
  readonly ruleId:      string;
  readonly label:       string;
  readonly value:       string | number | boolean;
  readonly type:        "THRESHOLD" | "BOOLEAN" | "ENUM" | "RANGE";
  readonly createdAt:   string;
}

export interface GovernanceDecision {
  readonly id:            string;
  readonly orgSlug:       string;
  readonly sessionId:     string;
  readonly title:         string;
  readonly description:   string;
  readonly type:          GovernanceDecisionType;
  readonly domain:        GovernanceDomain;
  readonly requestedBy:   string;
  readonly financialImpact?: number;
  readonly policyIds:     string[];
  readonly ruleIds:       string[];
  readonly status:        "PENDING" | "APPROVED" | "REJECTED" | "ESCALATED" | "DEFERRED";
  readonly createdAt:     string;
}

export interface GovernanceDecisionCandidate {
  readonly id:             string;
  readonly orgSlug:        string;
  readonly sessionId:      string;
  readonly title:          string;
  readonly description:    string;
  readonly type:           GovernanceDecisionType;
  readonly domain:         GovernanceDomain;
  readonly financialImpact?: number;
  readonly requiredAuthority: GovernanceAuthorityLevel;
  readonly riskScore:      number; // 0–1
  readonly limitations:    string[];
  readonly suggestedOnly:  true;
  readonly createdAt:      string;
}

export interface GovernanceApproval {
  readonly id:                string;
  readonly orgSlug:           string;
  readonly sessionId:         string;
  readonly decisionId?:       string;
  readonly title:             string;
  readonly requiredAuthority: GovernanceAuthorityLevel;
  readonly domain:            GovernanceDomain;
  readonly urgency:           GovernancePriorityLevel;
  readonly justification:     string;
  readonly policyIds:         string[];
  readonly isBlocking:        boolean;
  readonly estimatedRisk:     number; // 0–1
  readonly createdAt:         string;
}

export interface GovernanceException {
  readonly id:              string;
  readonly orgSlug:         string;
  readonly sessionId:       string;
  readonly title:           string;
  readonly description:     string;
  readonly type:            GovernanceExceptionType;
  readonly domain:          GovernanceDomain;
  readonly severity:        GovernancePriorityLevel;
  readonly policyId?:       string;
  readonly ruleId?:         string;
  readonly justification:   string;
  readonly isJustifiable:   boolean;
  readonly requiresApproval: boolean;
  readonly evidenceIds:     string[];
  readonly createdAt:       string;
}

export interface GovernanceEscalation {
  readonly id:                string;
  readonly orgSlug:           string;
  readonly sessionId:         string;
  readonly title:             string;
  readonly description:       string;
  readonly type:              GovernanceEscalationType;
  readonly domain:            GovernanceDomain;
  readonly severity:          GovernancePriorityLevel;
  readonly targetAuthority:   GovernanceAuthorityLevel;
  readonly escalationScore:   number; // 0–1
  readonly isBlocking:        boolean;
  readonly justification:     string;
  readonly policyIds:         string[];
  readonly exceptionIds:      string[];
  readonly createdAt:         string;
}

export interface GovernanceAuthority {
  readonly id:            string;
  readonly orgSlug:       string;
  readonly level:         GovernanceAuthorityLevel;
  readonly title:         string;
  readonly description:   string;
  readonly maxThreshold:  number | null; // financial limit
  readonly canDelegate:   boolean;
  readonly domains:       GovernanceDomain[];
  readonly policyIds:     string[];
  readonly createdAt:     string;
}

export interface GovernanceRole {
  readonly id:            string;
  readonly orgSlug:       string;
  readonly name:          string;
  readonly level:         GovernanceAuthorityLevel;
  readonly domain:        GovernanceDomain;
  readonly permissions:   string[];
  readonly restrictions:  string[];
  readonly createdAt:     string;
}

export interface GovernanceFinding {
  readonly id:          string;
  readonly orgSlug:     string;
  readonly sessionId:   string;
  readonly title:       string;
  readonly description: string;
  readonly domain:      GovernanceDomain;
  readonly severity:    GovernancePriorityLevel;
  readonly policyId?:   string;
  readonly ruleId?:     string;
  readonly evidence:    string[];
  readonly createdAt:   string;
}

export interface GovernanceViolation {
  readonly id:              string;
  readonly orgSlug:         string;
  readonly sessionId:       string;
  readonly title:           string;
  readonly description:     string;
  readonly type:            GovernanceViolationType;
  readonly domain:          GovernanceDomain;
  readonly severity:        GovernancePriorityLevel;
  readonly violationScore:  number; // 0–1
  readonly policyId?:       string;
  readonly ruleId?:         string;
  readonly isSystemic:      boolean;
  readonly evidenceIds:     string[];
  readonly createdAt:       string;
}

export interface GovernanceRisk {
  readonly id:              string;
  readonly orgSlug:         string;
  readonly sessionId:       string;
  readonly title:           string;
  readonly description:     string;
  readonly type:            GovernanceRiskType;
  readonly domain:          GovernanceDomain;
  readonly severity:        GovernancePriorityLevel;
  readonly riskScore:       number; // 0–1
  readonly likelihood:      number; // 0–1
  readonly impact:          number; // 0–1
  readonly isSystemic:      boolean;
  readonly evidenceIds:     string[];
  readonly createdAt:       string;
}

export interface GovernanceControl {
  readonly id:              string;
  readonly orgSlug:         string;
  readonly sessionId:       string;
  readonly title:           string;
  readonly description:     string;
  readonly type:            GovernanceControlType;
  readonly domain:          GovernanceDomain;
  readonly effectiveness:   number; // 0–1
  readonly isAutomated:     boolean;
  readonly policyIds:       string[];
  readonly createdAt:       string;
}

export interface GovernanceRecommendation {
  readonly id:            string;
  readonly orgSlug:       string;
  readonly sessionId:     string;
  readonly title:         string;
  readonly rationale:     string;
  readonly domain:        GovernanceDomain;
  readonly priority:      GovernancePriorityLevel;
  readonly confidence:    GovernanceConfidence;
  readonly evidenceIds:   string[];
  readonly limitations:   string[];
  readonly suggestedOnly: true;
  readonly createdAt:     string;
}

// ─── Assessment & Report ──────────────────────────────────────────────────────

export interface GovernanceAssessment {
  readonly id:                string;
  readonly orgSlug:           string;
  readonly sessionId:         string;
  readonly status:            GovernanceStatus;
  readonly complianceScore:   number; // 0–1
  readonly governanceScore:   number; // 0–1
  readonly riskScore:         number; // 0–1
  readonly findingCount:      number;
  readonly violationCount:    number;
  readonly exceptionCount:    number;
  readonly escalationCount:   number;
  readonly confidence:        GovernanceConfidence;
  readonly findings:          GovernanceFinding[];
  readonly violations:        GovernanceViolation[];
  readonly gaps:              string[];
  readonly strengths:         string[];
  readonly createdAt:         string;
}

export interface GovernanceNarrative {
  readonly compliance:     string;
  readonly policies:       string;
  readonly exceptions:     string;
  readonly escalations:    string;
  readonly violations:     string;
  readonly risks:          string;
  readonly controls:       string;
  readonly recommendations: string;
  readonly executive:      string;
  readonly limitations:    string;
}

export interface GovernanceDigest {
  readonly id:                string;
  readonly orgSlug:           string;
  readonly sessionId:         string;
  readonly period:            GovernanceDigestPeriod;
  readonly headline:          string;
  readonly highlights:        string[];
  readonly complianceScore:   number;
  readonly topViolations:     string[];
  readonly pendingApprovals:  string[];
  readonly activeEscalations: string[];
  readonly confidence:        GovernanceConfidence;
  readonly limitations:       string[];
  readonly createdAt:         string;
}

export interface GovernanceBriefing {
  readonly id:                 string;
  readonly orgSlug:            string;
  readonly sessionId:          string;
  readonly type:               GovernanceBriefingType;
  readonly title:              string;
  readonly summary:            string;
  readonly complianceStatus:   GovernanceStatus;
  readonly keyFindings:        string[];
  readonly pendingApprovals:   string[];
  readonly criticalViolations: string[];
  readonly activeEscalations:  string[];
  readonly topRecommendations: string[];
  readonly confidence:         GovernanceConfidence;
  readonly limitations:        string[];
  readonly createdAt:          string;
}

export interface GovernanceScore {
  readonly orgSlug:           string;
  readonly overallScore:      number; // 0–1
  readonly complianceScore:   number;
  readonly governanceScore:   number;
  readonly riskScore:         number;
  readonly policyScore:       number;
  readonly controlScore:      number;
  readonly violationPenalty:  number;
  readonly exceptionPenalty:  number;
  readonly confidence:        GovernanceConfidence;
}

export interface GovernanceReport {
  readonly id:              string;
  readonly orgSlug:         string;
  readonly sessionId:       string;
  readonly title:           string;
  readonly status:          GovernanceStatus;
  readonly policies:        GovernancePolicy[];
  readonly rules:           GovernanceRule[];
  readonly approvals:       GovernanceApproval[];
  readonly exceptions:      GovernanceException[];
  readonly escalations:     GovernanceEscalation[];
  readonly violations:      GovernanceViolation[];
  readonly risks:           GovernanceRisk[];
  readonly controls:        GovernanceControl[];
  readonly assessment:      GovernanceAssessment;
  readonly recommendations: GovernanceRecommendation[];
  readonly score:           GovernanceScore;
  readonly narrative:       GovernanceNarrative;
  readonly digest:          GovernanceDigest | null;
  readonly briefing:        GovernanceBriefing | null;
  readonly limitations:     string[];
  readonly createdAt:       string;
}

// ─── Pipeline I/O ─────────────────────────────────────────────────────────────

export interface ExecutiveGovernanceInput {
  readonly orgSlug:    string;
  readonly sessionId:  string;
  readonly horizon?:   string;
  readonly domain?:    GovernanceDomain;
  readonly metadata?:  Record<string, unknown>;
}

export interface ExecutiveGovernanceResult {
  readonly orgSlug:    string;
  readonly sessionId:  string;
  readonly report:     GovernanceReport;
  readonly score:      GovernanceScore;
  readonly status:     "SUCCESS" | "PARTIAL" | "FAILED";
  readonly limitations: string[];
  readonly errors:     string[];
  readonly createdAt:  string;
}
