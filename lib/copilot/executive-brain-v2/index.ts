// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 33 — Client-Safe Barrel
// Types only — no services, no server-only

export type {
  ExecutiveConfidence,
  ExecutivePriorityLevel,
  ExecutiveDomain,
  ExecutiveThemeType,
  ExecutiveConflictType,
  ExecutiveRiskLevel,
  ExecutiveOpportunityMagnitude,
  ExecutiveDigestPeriod,
  ExecutiveBriefingType,
  ExecutiveScenarioType,
  ExecutiveTheme,
  ExecutiveObjective,
  ExecutiveConcern,
  ExecutiveConflict,
  ExecutiveFocusArea,
  ExecutiveNarrative,
  ExecutiveRecommendation,
  ExecutivePriority,
  ExecutiveBriefing,
  ExecutiveAgendaItem,
  ExecutiveAgenda,
  ExecutiveOpportunity,
  ExecutiveRisk,
  ExecutiveSituation,
  ExecutiveContext,
  ExecutiveSnapshot,
  ExecutiveDigest,
  ExecutiveBrainV2Input,
  ExecutiveBrainV2Query,
  ExecutiveBrainV2Result,
  ExecutiveScenarioOutput,
} from "./executive-brain-types";

export {
  EXECUTIVE_CONFIDENCE_LEVELS,
  EXECUTIVE_CONFIDENCE_SCORE,
  EXECUTIVE_PRIORITY_LEVELS,
  EXECUTIVE_PRIORITY_RANK,
  EXECUTIVE_DOMAINS,
  EXECUTIVE_THEME_TYPES,
  EXECUTIVE_CONFLICT_TYPES,
  EXECUTIVE_RISK_LEVELS,
  EXECUTIVE_RISK_RANK,
  EXECUTIVE_OPPORTUNITY_MAGNITUDES,
  EXECUTIVE_DIGEST_PERIODS,
  EXECUTIVE_BRIEFING_TYPES,
  EXECUTIVE_SCENARIO_TYPES,
  confidenceFromScore,
  riskLevelFromScore,
  opportunityMagnitudeFromScore,
  sortByPriorityLevel,
  sortByPriorityScore,
  sortByCompositeScore,
  sortByCompositeRisk,
  sortByCaptureScore,
  generateEbv2Id,
} from "./executive-brain-types";

export type {
  ExecutiveDashboardMetrics,
  ExecutivePriorityRow,
  ExecutiveRiskRow,
  ExecutiveOpportunityRow,
  ExecutiveFocusAreaRow,
  ExecutiveConflictRow,
  ExecutiveDashboardContract,
} from "./executive-dashboard-contract";

export {
  buildExecutiveDashboardContract,
  buildEmptyDashboardContract,
} from "./executive-dashboard-contract";

export type {
  ExecutiveBrainReadiness,
  ExecutiveBrainReadinessLevel,
} from "./executive-brain-readiness";

export {
  isExecutiveBrainReady,
  evaluateExecutiveBrainReadiness,
} from "./executive-brain-readiness";

export type {
  ExecutiveBrainFutureCapability,
  FutureCapabilitySpec,
} from "./future-compatibility";

export {
  EXECUTIVE_BRAIN_FUTURE_CAPABILITIES,
  FUTURE_CAPABILITY_REGISTRY,
  getFutureCapability,
} from "./future-compatibility";

export type {
  ExecutiveBrainAuditEventType,
  ExecutiveBrainAuditEvent,
} from "./integrations/executive-audit";

export {
  EXECUTIVE_BRAIN_AUDIT_EVENT_TYPES,
  buildExecutiveAuditLog,
} from "./integrations/executive-audit";

export type { ExecutiveScenarioType as _ScenarioType } from "./executive-brain-types";

export { buildScenario, buildAllScenarios } from "./executive-scenarios";
