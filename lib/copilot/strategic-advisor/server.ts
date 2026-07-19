// AGENTIK-STRATEGIC-ADVISOR-01 — Phase 33: Server Barrel
// Server-only barrel — safe to import from API routes and Server Components
import "server-only";

// ── Core Engine ───────────────────────────────────────────────────────────────
export { runStrategicAdvisor } from "./strategic-advisor-engine";

// ── Context Builder ───────────────────────────────────────────────────────────
export {
  buildContext,
  validateContext,
  scoreContext,
} from "./strategic-context-builder";

// ── Domain Engines ────────────────────────────────────────────────────────────
export {
  identifyConcerns,
  rankConcerns,
  groupConcerns,
} from "./strategic-concern-engine";

export {
  identifyOpportunities,
  rankOpportunities,
} from "./strategic-opportunity-engine";

export {
  generateRecommendations,
} from "./strategic-recommendation-engine";

export {
  generateQuestions,
  prioritizeQuestions,
} from "./strategic-question-engine";

export {
  buildScenarios,
} from "./strategic-scenario-engine";

export {
  evaluateAlignment,
  detectMisalignment,
} from "./strategic-alignment-engine";

export {
  identifyChallenges,
} from "./strategic-challenge-engine";

export {
  computeFocusAreas,
  getTop3FocusAreas,
  getTop5FocusAreas,
  getTop10FocusAreas,
} from "./strategic-focus-engine";

export {
  buildAdvisoryNarratives,
  buildNarrativeForAdvice,
} from "./strategic-narrative-engine";

export {
  buildStrategicBriefing,
  buildCEOBriefing,
  buildBoardBriefing,
  buildGrowthBriefing,
  buildFinanceBriefing,
  buildOperationsBriefing,
  buildCustomBriefing,
} from "./strategic-briefing-builder";

export {
  buildStrategicDigest,
  buildDailyDigest,
  buildWeeklyDigest,
  buildMonthlyDigest,
  buildQuarterlyDigest,
} from "./strategic-digest-builder";

// ── Query Layer ───────────────────────────────────────────────────────────────
export {
  getAdvice,
  getConcerns,
  getOpportunities,
  getQuestions,
  getRecommendations,
  getFocusAreas,
  getBriefings,
  getDigests,
} from "./strategic-advisor-query";

// ── Repository ────────────────────────────────────────────────────────────────
export type { StrategicAdvisorRepository } from "./strategic-advisor-repository";
export { PrismaStrategicAdvisorRepository } from "./persistence/prisma-strategic-advisor-repository";

// ── Health & Readiness ────────────────────────────────────────────────────────
export {
  checkStrategicAdvisorHealth,
} from "./strategic-advisor-health";

export {
  evaluateStrategicAdvisorReadiness,
  isStrategicAdvisorReady,
} from "./strategic-advisor-readiness";

// ── Dashboard Contract ────────────────────────────────────────────────────────
export {
  buildStrategicDashboardContract,
  buildEmptyStrategicDashboard,
} from "./strategic-advisor-dashboard-contract";

// ── Scenarios ─────────────────────────────────────────────────────────────────
export {
  buildAllStrategicScenarios,
  getScenarioByType,
  buildScenarioSummary,
} from "./strategic-advisor-scenarios";

// ── Integrations (server-only) ────────────────────────────────────────────────
export {
  extractConcernsFromExecutiveBrain,
  extractPrioritiesFromExecutiveBrain,
  getExecutiveBrainFocusContext,
} from "./integrations/advisor-executive-brain";

export {
  extractAdvisorMemoryContext,
  getStrategicAdvisorAlignmentScore,
  extractStrategicLessons,
} from "./integrations/advisor-strategic-memory";

export {
  buildAdvisorLearningContext,
  getConfirmedAdvisorPatterns,
  extractHistoricalAdvisorContext,
} from "./integrations/advisor-learning";

export {
  buildAdvisorGraphContext,
  getStrategicAdvisorRelationships,
} from "./integrations/advisor-memory-graph";

export {
  buildAdvisorCrossModuleContext,
  extractAdvisorRisksFromSignals,
  getAdvisorHighSeverityCount,
} from "./integrations/advisor-cross-module";

export {
  getAdvisorTenantProfile,
  alignBriefingToTenant,
  alignDigestToTenant,
  applyAdvisorConfidenceMultiplier,
} from "./integrations/advisor-tenant-profile";

export {
  buildPlaybookAdvisorSummary,
  extractAdvisorRecommendationsFromPlaybooks,
  findAdvisorRelatedPlaybooks,
} from "./integrations/advisor-playbooks";

export {
  evaluateAdvisorComplianceGate,
  enforceAdvisorTenantBoundary,
  buildAdvisorComplianceRisk,
} from "./integrations/advisor-compliance";

export {
  buildAdvisorAuditLog,
  auditAdvisorRun,
  auditConcernIdentified,
  auditRecommendationCreated,
  auditBriefingCreated,
  auditAdvisoryGenerated,
  auditDigestCreated,
} from "./integrations/advisor-audit";
