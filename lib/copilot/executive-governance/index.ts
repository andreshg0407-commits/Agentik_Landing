// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 44: Client-Safe Barrel
// No restricted imports. Types, pure domain helpers, dashboard contract only.

// Types
export type {
  GovernanceConfidence,
  GovernanceStatus,
  GovernancePriorityLevel,
  GovernanceDomain,
  GovernanceAuthorityLevel,
  GovernancePolicyType,
  GovernanceRuleType,
  GovernanceDecisionType,
  GovernanceExceptionType,
  GovernanceEscalationType,
  GovernanceViolationType,
  GovernanceRiskType,
  GovernanceControlType,
  GovernanceHealth,
  GovernanceDigestPeriod,
  GovernanceBriefingType,
  GovernanceSession,
  GovernancePolicy,
  GovernanceRule,
  GovernanceConstraint,
  GovernanceDecision,
  GovernanceDecisionCandidate,
  GovernanceApproval,
  GovernanceException,
  GovernanceEscalation,
  GovernanceAuthority,
  GovernanceRole,
  GovernanceFinding,
  GovernanceViolation,
  GovernanceRisk,
  GovernanceControl,
  GovernanceRecommendation,
  GovernanceAssessment,
  GovernanceNarrative,
  GovernanceDigest,
  GovernanceBriefing,
  GovernanceScore,
  GovernanceReport,
  ExecutiveGovernanceInput,
  ExecutiveGovernanceResult,
} from "./executive-governance-types";

// Identity (client-safe)
export {
  validateGovernanceId,
  getGovernanceIdPrefix,
} from "./executive-governance-identity";

// Dashboard contract (pure domain, no restricted imports)
export {
  buildGovernanceDashboard,
  buildEmptyGovernanceDashboard,
  type GovernanceDashboard,
  type GovernanceDashboardKpi,
  type GovernanceDashboardItem,
} from "./executive-governance-dashboard-contract";

// Health types
export type {
  GovernanceHealthReport,
  GovernanceHealthCheck,
  GovernanceHealthInputs,
} from "./executive-governance-health";

// Readiness types
export type {
  GovernanceReadinessReport,
  GovernanceReadinessLevel,
} from "./executive-governance-readiness";

// Integration context types (client-safe)
export type { GovernanceMemoryContext } from "./integrations/governance-strategic-memory";
export type { GovernanceLearningContext } from "./integrations/governance-learning";
export type { GovernanceBrainContext } from "./integrations/governance-executive-brain";
export type { GovernanceGraphContext } from "./integrations/governance-memory-graph";
export type { GovernanceCrossModuleContext } from "./integrations/governance-cross-module";
export type { GovernanceTenantProfile } from "./integrations/governance-tenant-profile";
export type { GovernanceComplianceReport } from "./integrations/governance-compliance-check";
export type { GovernanceAuditEvent, GovernanceAuditEventType } from "./integrations/governance-audit";

// Canonical types
export type { GovernanceCanonicalCase } from "./executive-governance-canonical";
export type { GovernanceCanonicalScenario } from "./executive-governance-scenarios";
