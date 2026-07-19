// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 43: Server Barrel
// server-only — never import in client components

import "server-only";

// Query layer
export {
  getGovernanceStats,
  getGovernanceReportRecords,
  getLatestGovernanceReport,
  getGovernanceViolationRecords,
  getGovernanceEscalationRecords,
} from "./executive-governance-query";

// Repositories
export {
  inMemoryGovernanceRepository,
  type IExecutiveGovernanceRepository,
  type GovernanceStoredEntry,
} from "./executive-governance-repository";

export {
  prismaGovernanceRepository,
  PrismaExecutiveGovernanceRepository,
} from "./persistence/prisma-executive-governance-repository";

// Main engine
export {
  runExecutiveGovernance,
  computeGovernanceScore,
  buildFailedGovernanceResult,
  type ExecutiveGovernanceContext,
} from "./executive-governance-engine";

// Core engines
export {
  buildPolicy,
  buildPolicies,
  buildDefaultPolicies,
  scorePolicy,
  rankPolicies,
  getMandatoryPolicies,
  validatePolicy,
  getPoliciesByDomain,
} from "./policy-engine";

export {
  buildRule,
  buildRules,
  evaluateRule,
  evaluateRules,
  getTriggeredRules,
  rankRules,
  validateRule,
} from "./rule-engine";

export {
  buildAuthorityModel,
  buildDefaultAuthorityModels,
  validateAuthority,
  resolveRequiredAuthority,
  rankAuthority,
  getAuthorityScore,
} from "./authority-engine";

export {
  determineApprovalRequirements,
  rankApprovals,
  evaluateApprovalRisk,
  getBlockingApprovals,
  calculateApprovalCount,
} from "./approval-engine";

export {
  buildException,
  detectExceptions,
  rankExceptions,
  scoreException,
  getUnjustifiableExceptions,
  getCriticalExceptions,
  calculateExceptionPenalty,
} from "./exception-engine";

export {
  buildEscalation,
  detectEscalations,
  rankEscalations,
  scoreEscalation,
  evaluateEscalationLevel,
  getBlockingEscalations,
  getCriticalEscalations,
  calculateEscalationPressure,
} from "./escalation-engine";

export {
  buildGovernanceRisk,
  identifyGovernanceRisks,
  rankGovernanceRisks,
  scoreGovernanceRisk,
  getCriticalRisks,
  getSystemicRisks,
  calculateAggregateRiskScore,
} from "./governance-risk-engine";

export {
  buildControl,
  buildControls,
  identifyControls,
  evaluateControl,
  evaluateControls,
  rankControls,
  buildDefaultControls,
  calculateControlCoverage,
} from "./governance-control-engine";

export {
  buildViolation,
  detectViolations,
  evaluateCompliance,
  rankViolations,
  scoreCompliance,
  getCriticalViolations,
  getSystemicViolations,
} from "./governance-compliance-engine";

export {
  buildFinding,
  buildFindings,
  buildAssessment,
  generateAssessment,
  rankFindings,
  getCriticalFindings,
  calculateFindingPenalty,
} from "./governance-assessment-engine";

export {
  buildGovernanceRecommendation,
  buildGovernanceRecommendations,
  rankGovernanceRecommendations,
  buildRecommendationsFromViolations,
  buildRecommendationsFromExceptions,
  buildRecommendationsFromEscalations,
  buildRecommendationsFromRisks,
  getCriticalGovernanceRecommendations,
} from "./governance-recommendation-engine";

export {
  buildGovernanceNarrative,
  buildEmptyGovernanceNarrative,
} from "./governance-narrative-engine";

export {
  buildGovernanceDigest,
  buildEmptyGovernanceDigest,
} from "./governance-digest-engine";

export {
  buildGovernanceBriefing,
  buildEmptyGovernanceBriefing,
} from "./governance-briefing-engine";

// Health & Readiness
export {
  checkGovernanceHealth,
  buildDefaultGovernanceHealthInputs,
  type GovernanceHealthReport,
  type GovernanceHealthInputs,
} from "./executive-governance-health";

export {
  checkGovernanceReadiness,
  type GovernanceReadinessReport,
  type GovernanceReadinessLevel,
} from "./executive-governance-readiness";

// Audit
export {
  auditGovernanceGenerated,
  auditPolicyEvaluated,
  auditViolationDetected,
  auditEscalationTriggered,
  auditAssessmentBuilt,
  auditRecommendationsRanked,
} from "./integrations/governance-audit";

// Compliance check
export {
  runGovernanceComplianceChecks,
  assertGovernanceTenantIsolation,
} from "./integrations/governance-compliance-check";
