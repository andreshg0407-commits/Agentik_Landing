/**
 * lib/copilot/cross-module-reasoning/index.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Client-safe barrel — no server-only imports, no Prisma, no AI SDK.
 *
 * Import from this barrel in client components and shared domain code.
 * For server-only features (Prisma repo, health checks), import from ./server.ts
 */

// ── Core types ────────────────────────────────────────────────────────────────
export type {
  ReasoningSourceDomain,
  ReasoningConfidence,
  ReasoningConfidenceScore,
  ReasoningSignalType,
  ReasoningEvidenceType,
  HypothesisCategory,
  RiskDomain,
  RiskSeverity,
  OpportunityType,
  RecommendationType,
  RecommendationPriority,
  ReasoningStatus,
  ReasoningSignal,
  ReasoningEvidence,
  ReasoningHypothesis,
  ReasoningRisk,
  ReasoningOpportunity,
  ReasoningRecommendation,
  ReasoningConclusion,
  ReasoningPath,
  ReasoningChain,
  ReasoningContext,
  ReasoningResult,
  CorrelationRecord,
  ContradictionRecord,
  CausalCandidate,
  CausalRelationship,
  CausalReasoningResult,
  ExecutiveScenarioType,
  ExecutiveScenario,
} from "./cross-module-types";

export {
  generateCmrId,
  REASONING_SOURCE_DOMAINS,
  REASONING_CONFIDENCE_LEVELS,
  REASONING_DEFAULT_CONFIDENCE,
  REASONING_SIGNAL_TYPES,
  REASONING_EVIDENCE_TYPES,
  HYPOTHESIS_CATEGORIES,
  RISK_DOMAINS,
  OPPORTUNITY_TYPES,
} from "./cross-module-types";

// ── Engine ────────────────────────────────────────────────────────────────────
export {
  runCrossModuleReasoning,
  runExecutiveScenario,
  runAllExecutiveScenarios,
} from "./cross-module-engine";

// ── Confidence ────────────────────────────────────────────────────────────────
export {
  CONFIDENCE_THRESHOLDS,
  scoreToConfidenceLevel,
  calculateConfidence,
  evidenceCountFactor,
} from "./confidence-engine";

// ── Signal normalizer ─────────────────────────────────────────────────────────
export {
  normalizeSignal,
  normalizeSignals,
  validateSignal,
  filterSignalsByDomain,
  filterSignalsBySeverity,
  sortSignalsByScore,
} from "./signal-normalizer";

// ── Evidence ──────────────────────────────────────────────────────────────────
export {
  signalToEvidence,
  collectEvidence,
  rankEvidence,
  filterEvidenceByDomain,
  filterEvidenceByType,
} from "./evidence-engine";

// ── Hypothesis ────────────────────────────────────────────────────────────────
export {
  generateHypotheses,
  filterSupportedHypotheses,
  filterHypothesesByCategory,
  rankHypotheses,
} from "./hypothesis-engine";

// ── Correlation ───────────────────────────────────────────────────────────────
export {
  correlateSignals,
  correlateEvidence,
  detectPatterns,
} from "./correlation-engine";

// ── Contradiction ─────────────────────────────────────────────────────────────
export {
  detectSignalContradictions,
  detectHypothesisContradictions,
  resolveContradictions,
  applyContradictions,
} from "./contradiction-engine";

// ── Risk ──────────────────────────────────────────────────────────────────────
export {
  detectRisks,
  detectRisksFromHypotheses,
  rankRisks,
} from "./risk-engine";

// ── Opportunity ───────────────────────────────────────────────────────────────
export {
  detectOpportunities,
  detectOpportunitiesFromHypotheses,
  rankOpportunities,
} from "./opportunity-engine";

// ── Recommendation ────────────────────────────────────────────────────────────
export {
  generateRecommendationsFromHypotheses,
  generateRecommendationsFromRisks,
  generateRecommendationsFromOpportunities,
  rankRecommendations,
} from "./recommendation-engine";

// ── Query ─────────────────────────────────────────────────────────────────────
export {
  findReasoning,
  findReasoningById,
  findSuccessfulReasoning,
  findHypotheses,
  findSupportedHypotheses,
  findCriticalRisks,
  findUrgentRecommendations,
  findHighUrgencyOpportunities,
  queryChainStats,
} from "./reasoning-query";

// ── Repository (in-memory only for client-safe) ───────────────────────────────
export {
  InMemoryCrossModuleReasoningRepository,
} from "./reasoning-repository";
export type {
  CrossModuleReasoningRepository,
  ReasoningResultFilter,
} from "./reasoning-repository";

// ── Dashboard contract ────────────────────────────────────────────────────────
export {
  buildCrossModuleDashboard,
  buildEmptyCrossModuleDashboard,
} from "./cross-module-dashboard-contract";
export type { CrossModuleDashboardPayload } from "./cross-module-dashboard-contract";

// ── Readiness ─────────────────────────────────────────────────────────────────
export {
  evaluateReadiness,
  getCoveredDomains,
  getMissingDomains,
  READINESS_THRESHOLDS,
} from "./cross-module-readiness";
export type { ReadinessReport, ReadinessLevel } from "./cross-module-readiness";

// ── Future compatibility ──────────────────────────────────────────────────────
export {
  CROSS_MODULE_FUTURE_PLANS,
  getFutureReasoningRoadmapSummary,
} from "./future-compatibility";

// ── Integration adapters (client-safe) ───────────────────────────────────────
export {
  graphNodeToEvidence,
  graphEdgeToEvidence,
  subgraphToEvidence,
  graphAlertNodeToSignal,
  buildGraphReasoningContext,
} from "./integrations/reasoning-memory-graph";

export {
  executiveSignalToReasoningSignal,
  executiveInsightToEvidence,
  executiveContextToReasoningInput,
} from "./integrations/reasoning-executive-brain";

export {
  memoryEntryToEvidence,
  memoryEntryToSignal,
  memoryEntriesToEvidence,
  memoryEntriesToSignals,
} from "./integrations/reasoning-memory";

export {
  playbookToEvidence,
  playbookToSignal,
  playbooksToEvidence,
  playbooksToSignals,
} from "./integrations/reasoning-playbooks";

export {
  buildTenantReasoningProfile,
  tenantProfileToEvidence,
  profileToReasoningContext,
} from "./integrations/reasoning-tenant-profile";
export type { TenantReasoningProfile } from "./integrations/reasoning-tenant-profile";

export {
  buildCopilotReasoningSummary,
  buildEmptyCopilotReasoningSummary,
  formatReasoningForCopilotPrompt,
} from "./integrations/reasoning-copilot";
export type { CopilotReasoningSummary } from "./integrations/reasoning-copilot";

export {
  buildExecutiveReasoningPayload,
} from "./integrations/reasoning-executive";
export type { ExecutiveReasoningPayload } from "./integrations/reasoning-executive";

export {
  buildIntelligenceReasoningContext,
  analyzeSignalCoverage,
  scoreChainQuality,
} from "./integrations/reasoning-intelligence";
export type { IntelligenceReasoningContext } from "./integrations/reasoning-intelligence";

export {
  buildReasoningAuditLog,
  auditReasoningStarted,
  auditReasoningCompleted,
  auditReasoningFailed,
} from "./integrations/reasoning-audit";
export type { ReasoningAuditLog, ReasoningAuditRecord } from "./integrations/reasoning-audit";

export {
  buildComplianceReasoningReport,
  evaluateComplianceGate,
} from "./integrations/reasoning-compliance";
export type { ComplianceReasoningReport } from "./integrations/reasoning-compliance";
