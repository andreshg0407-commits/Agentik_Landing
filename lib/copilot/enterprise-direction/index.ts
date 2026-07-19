// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 43: Client-Safe Barrel
// NO server-only import. Types and pure domain helpers only.

// ─── All domain types ─────────────────────────────────────────────────────────
export type {
  DirectionConfidence,
  DirectionStatus,
  DirectionPriorityLevel,
  DirectionHorizon,
  DirectionDomain,
  DirectionDeviationType,
  DirectionConflictType,
  DirectionSignalType,
  DirectionInitiativeStatus,
  DirectionHealth,
  DirectionDigestPeriod,
  DirectionBriefingType,
  NorthStar,
  DirectionStatement,
  StrategicTheme,
  StrategicPillar,
  DirectionObjective,
  DirectionPriority,
  DirectionInitiative,
  DirectionAlignment,
  DirectionDeviation,
  DirectionConflict,
  DirectionSignal,
  DirectionRecommendation,
  DirectionNarrative,
  DirectionDigest,
  DirectionBriefing,
  DirectionScore,
  DirectionReport,
  EnterpriseDirection,
  EnterpriseDirectionInput,
  EnterpriseDirectionResult,
} from "./enterprise-direction-types";

// ─── Identity (pure, no DB) ───────────────────────────────────────────────────
export {
  generateDirectionId,
  generateNorthStarId,
  generateDirectionObjectiveId,
  generateDirectionPriorityId,
  generateDirectionInitiativeId,
  generateDirectionReportId,
  generateStrategicThemeId,
  generateStrategicPillarId,
  generateDirectionAlignmentId,
  generateDirectionDeviationId,
  generateDirectionConflictId,
  generateDirectionSignalId,
  generateDirectionRecommendationId,
  generateDirectionDigestId,
  generateDirectionBriefingId,
  generateDirectionAuditId,
  validateDirectionId,
  getDirectionIdPrefix,
} from "./enterprise-direction-identity";

// ─── Dashboard contract (pure domain, safe for client) ───────────────────────
export { buildEnterpriseDirectionDashboard } from "./enterprise-direction-dashboard-contract";
export type { EnterpriseDirectionDashboard } from "./enterprise-direction-dashboard-contract";

// ─── Canonical ────────────────────────────────────────────────────────────────
export { CANONICAL_DIRECTION_CASES } from "./enterprise-direction-canonical";
export { CANONICAL_DIRECTION_SCENARIOS } from "./enterprise-direction-scenarios";

// ─── Integration types ────────────────────────────────────────────────────────
export type { DirectionTenantProfile, DirectionRiskTolerance } from "./integrations/direction-tenant-profile";
export type { DirectionCouncilSignal } from "./integrations/direction-executive-council";
export type { DirectionReadinessLevel, DirectionReadinessResult } from "./enterprise-direction-readiness";
export type { DirectionHealthReport } from "./enterprise-direction-health";
