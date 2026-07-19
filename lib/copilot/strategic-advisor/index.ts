// AGENTIK-STRATEGIC-ADVISOR-01 — Phase 34: Client-safe Barrel
// Types and pure domain helpers only — safe for client components and shared modules
// DO NOT import server-only modules here

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  StrategicAdviceConfidence,
  StrategicAdvicePriority,
  StrategicBriefingType,
  StrategicDigestPeriod,
  StrategicScenarioType,
  StrategicDomain,
  StrategicAdvice,
  StrategicConcern,
  StrategicOpportunityAssessment,
  StrategicQuestion,
  StrategicRecommendation,
  StrategicFocusArea,
  StrategicAdvisorBriefing,
  StrategicAdvisorDigest,
  StrategicAdvisorReport,
  StrategicAdvisorResult,
} from "./strategic-advisor-types";

export type { StrategicAdvisorEngineInput } from "./strategic-advisor-engine";
export type { ScenarioHypothesis } from "./strategic-scenario-engine";
export type { AlignmentResult } from "./strategic-alignment-engine";
export type { StrategicChallenge } from "./strategic-challenge-engine";

// ── Pure helpers ──────────────────────────────────────────────────────────────
export {
  generateSaId,
  confidenceSaFromScore,
  prioritySaFromScore,
} from "./strategic-advisor-types";

// ── Dashboard Contract (pure domain — no server-only) ─────────────────────────
export type {
  StrategicAdvisorDashboardMetrics,
  StrategicConcernRow,
  StrategicOpportunityRow,
  StrategicRecommendationRow,
  StrategicFocusAreaRow,
  StrategicAdvisorDashboardContract,
} from "./strategic-advisor-dashboard-contract";

export {
  buildEmptyStrategicDashboard,
} from "./strategic-advisor-dashboard-contract";

// ── Readiness (pure domain — no server-only) ──────────────────────────────────
export type {
  StrategicAdvisorReadinessLevel,
  StrategicAdvisorReadiness,
} from "./strategic-advisor-readiness";

export {
  isStrategicAdvisorReady,
} from "./strategic-advisor-readiness";

// ── Health (types only — implementation is server-only) ───────────────────────
export type {
  StrategicAdvisorHealthStatus,
  StrategicAdvisorHealth,
} from "./strategic-advisor-health";

// ── Future Compatibility ──────────────────────────────────────────────────────
export type {
  PlannedStrategicCapability,
} from "./future-compatibility";

export {
  PLANNED_STRATEGIC_CAPABILITIES,
  getPlannedCapability,
  getCapabilitiesByStatus,
} from "./future-compatibility";
