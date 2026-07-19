// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 32 — Server-Only Barrel
import "server-only";

// Re-export everything from client-safe barrel
export * from "./index";

// Server-only additions
export { runExecutiveBrainV2 } from "./executive-brain-v2-engine";
export type { ExecutiveBrainV2EngineInput } from "./executive-brain-v2-engine";

export { checkExecutiveBrainHealth } from "./executive-brain-health";
export type { ExecutiveBrainHealth, ExecutiveBrainHealthStatus } from "./executive-brain-health";

export { PrismaExecutiveBrainRepository } from "./persistence/prisma-executive-brain-repository";
export type { ExecutiveBrainRepository } from "./executive-brain-repository";

export {
  buildStrategicContext,
  getActiveGoals,
  getCriticalRisks,
  getStrategicPriorities,
  getActiveDecisions,
  getActiveCommitments,
  getActivePolicies,
  getRecentLessons,
} from "./strategic-context-engine";
export type { StrategicExecutiveContext } from "./strategic-context-engine";

export {
  buildLearningContext,
  getConfirmedPatterns,
  getRejectedPatterns,
  getEffectivePlaybooks,
  getHistoricalOutcomes,
} from "./learning-context-engine";
export type { LearningExecutiveContext } from "./learning-context-engine";

export { buildExecutiveSituation } from "./executive-situation-engine";
export type { SituationEngineInput } from "./executive-situation-engine";

export {
  computeExecutivePriorities,
  getTop3,
  getTop5,
  getTop10,
  computePriorityScore,
  derivePriorityLevel,
} from "./executive-priority-engine";

export {
  detectExecutiveConflicts,
  detectObjectiveConflicts,
  detectPriorityConflicts,
} from "./executive-conflict-engine";

export {
  detectExecutiveOpportunities,
  findIgnoredOpportunities,
  findRepeatedStrengths,
} from "./executive-opportunity-engine";

export {
  detectExecutiveRisks,
  getTopRisks,
  getRisksByLevel,
  computeRiskExposureScore,
} from "./executive-risk-engine";
export type { RiskEngineInput } from "./executive-risk-engine";

export {
  computeFocusAreas,
  getTop3FocusAreas,
  getTop5FocusAreas,
  getTop10FocusAreas,
} from "./executive-focus-engine";

export {
  buildExecutiveNarratives,
  buildNarrativeForPriority,
} from "./executive-narrative-engine-v2";

export {
  buildExecutiveDigest,
  buildDailyDigest,
  buildWeeklyDigest,
  buildMonthlyDigest,
  buildQuarterlyDigest,
} from "./executive-digest-builder";

export {
  buildExecutiveBriefing,
  buildCEOBriefing,
  buildFinanceBriefing,
  buildCommercialBriefing,
  buildOperationsBriefing,
  buildCustomBriefing,
} from "./executive-briefing-builder";

export {
  buildExecutiveAgenda,
  buildTop5Agenda,
} from "./executive-agenda-builder";

export {
  getPriorities,
  getRisks,
  getOpportunities,
  getConflicts,
  getNarratives,
  getBriefings,
  getDigests,
  getFocusAreas,
} from "./executive-brain-query";

// Integrations
export {
  extractExecutiveObjectivesFromMemory,
  extractExecutiveConcernsFromMemory,
  getStrategicAlignmentScore,
  extractStrategicDecisions,
  extractStrategicCommitments,
  extractStrategicPolicies,
} from "./integrations/executive-strategic-memory";

export {
  buildLearningExecSummary,
  getConfirmedPatternPriorities,
  extractHistoricalOutcomeContext,
} from "./integrations/executive-learning";

export {
  buildGraphExecContext,
  extractThemesFromGraph,
  getStrategicRelationships,
} from "./integrations/executive-memory-graph";

export {
  buildCrossModuleExecContext,
  extractRisksFromReasoningSignals,
  getHighSeveritySignalCount,
} from "./integrations/executive-cross-module";

export {
  getExecutiveTenantProfile,
  alignBriefingToTenant,
  alignDigestToTenant,
  applyConfidenceMultiplier,
} from "./integrations/executive-tenant-profile";

export {
  buildPlaybookExecSummary,
  extractRecommendationsFromPlaybooks,
  findRelatedPlaybooks,
} from "./integrations/executive-playbooks";

export {
  evaluateExecutiveComplianceGate,
  buildComplianceRisk,
  enforceExecutiveTenantBoundary,
} from "./integrations/executive-compliance";

export {
  auditExecutiveContextCreated,
  auditExecutivePriorityComputed,
  auditExecutiveBriefingCreated,
  auditExecutiveDigestCreated,
  auditExecutiveAgendaCreated,
  auditExecutiveConflictDetected,
  auditExecutiveBrainRun,
  auditExecutiveGuardrailViolation,
} from "./integrations/executive-audit";
