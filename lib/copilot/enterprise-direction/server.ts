// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 42: Server-Only Barrel
import "server-only";

// ─── Core engines ─────────────────────────────────────────────────────────────
export { buildNorthStar, evaluateNorthStar, refreshNorthStar, buildDefaultNorthStar, scoreNorthStarAlignment } from "./north-star-engine";
export { buildStrategicTheme, identifyStrategicThemes, rankStrategicThemes, getEmergentThemes, groupThemesByDomain, scoreStrategicTheme } from "./strategic-theme-engine";
export { buildStrategicPillar, buildStrategicPillars, rankStrategicPillars, getWeakPillars, buildDefaultPillars, calculateWeightedPillarScore } from "./strategic-pillar-engine";
export { buildDirectionObjective, buildDirectionObjectives, scoreObjective, scoreObjectives, rankObjectives, getCriticalObjectives } from "./direction-objective-engine";
export { buildDirectionPriority, identifyPriorities, rankPriorities, scorePriority, getCriticalPriorities, getTopPriorities } from "./direction-priority-engine";
export { buildDirectionInitiative, identifyInitiatives, rankInitiatives, scoreInitiativeAlignment, getActiveInitiatives, getMisalignedInitiatives } from "./direction-initiative-engine";
export { calculateAlignmentScore, evaluateAlignment, rankAlignment } from "./direction-alignment-engine";
export { buildDeviation, detectDeviations, rankDeviations, scoreDeviation, getSystemicDeviations, getCriticalDeviations, getDeviationsByType, calculateDeviationPenalty } from "./direction-deviation-engine";
export { buildConflict, detectConflicts, rankConflicts, groupConflicts, scoreConflict, getBlockingConflicts, getUnresolvedConflicts, calculateConflictPenalty } from "./direction-conflict-engine";
export { buildDirectionSignal, identifyDirectionSignals, rankDirectionSignals, getOpportunitySignals, getThreatSignals, getEnablerSignals, getHighIntensitySignals, groupSignalsByDomain } from "./direction-signal-engine";
export { buildRecommendation, buildRecommendations, rankRecommendations, getCriticalRecommendations, buildRecommendationsFromDeviations, buildRecommendationsFromConflicts, buildRecommendationsFromSignals } from "./direction-recommendation-engine";
export { buildDirectionNarrative, buildEmptyNarrative } from "./direction-narrative-engine";
export { buildDirectionDigest } from "./direction-digest-engine";
export { buildDirectionBriefing } from "./direction-briefing-engine";

// ─── Main pipeline ────────────────────────────────────────────────────────────
export { runEnterpriseDirection, computeDirectionScore, buildFailedDirectionResult } from "./enterprise-direction-engine";
export type { EnterpriseDirectionContext } from "./enterprise-direction-engine";

// ─── Data layer ───────────────────────────────────────────────────────────────
export {
  getDirectionStats as getEnterpriseDirectionStats,
  getDirectionRecords as getEnterpriseDirectionRecords,
  getLatestDirectionRecord,
  getNorthStarRecords,
  getDirectionReportRecords,
} from "./enterprise-direction-query";
export { InMemoryEnterpriseDirectionRepository, inMemoryDirectionRepository } from "./enterprise-direction-repository";
export { PrismaEnterpriseDirectionRepository, prismaDirectionRepository } from "./persistence/prisma-enterprise-direction-repository";

// ─── Ops layer ────────────────────────────────────────────────────────────────
export { checkDirectionHealth, buildDefaultDirectionHealthInputs } from "./enterprise-direction-health";
export { checkDirectionReadiness } from "./enterprise-direction-readiness";

// ─── Advanced engines ─────────────────────────────────────────────────────────
export { calculateEnterpriseAlignment, calculateDepartmentAlignment, calculateInitiativeAlignment } from "./enterprise-alignment-engine";
export { detectStrategicDrift, scoreStrategicDrift, forecastStrategicDrift } from "./strategic-drift-engine";

// ─── Integrations ─────────────────────────────────────────────────────────────
export { buildDirectionMemoryContext, getMemoryPatternHints, computeMemoryBoost } from "./integrations/direction-strategic-memory";
export { buildDirectionLearningContext, getDirectionPatternNames, hasRelevantLearning } from "./integrations/direction-learning";
export { buildDirectionBrainContext } from "./integrations/direction-executive-brain";
export { buildDirectionAdvisorContext, hasAdvisorSignals } from "./integrations/direction-advisor";
export { buildDirectionSimulationSummary } from "./integrations/direction-simulations";
export { buildDirectionPlanningContext } from "./integrations/direction-planning";
export { buildDirectionCouncilContext, getCouncilDirectionSignal } from "./integrations/direction-executive-council";
export { buildDirectionBoardContext } from "./integrations/direction-board-intelligence";
export { buildDirectionForecastContext } from "./integrations/direction-forecasting";
export { buildDirectionGraphContext, countDirectionEdges } from "./integrations/direction-memory-graph";
export { buildDirectionCrossModuleContext, extractDirectionRecommendationTitles, extractDirectionRiskTitles } from "./integrations/direction-cross-module";
export { getDirectionTenantProfile, isDirectionEscalationRequired } from "./integrations/direction-tenant-profile";
export { buildDirectionPlaybookContext, getDirectionPlaybookTitles } from "./integrations/direction-playbooks";
export { runDirectionComplianceChecks, assertDirectionTenantIsolation } from "./integrations/direction-compliance";
export { auditDirectionGenerated, auditNorthStarBuilt, auditAlignmentEvaluated, auditDeviationsDetected, auditRecommendationsRanked } from "./integrations/direction-audit";
