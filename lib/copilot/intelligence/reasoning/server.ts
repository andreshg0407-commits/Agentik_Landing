/**
 * lib/copilot/intelligence/reasoning/server.ts
 *
 * AGENTIK-COPILOT-INTELLIGENCE-02
 * Server-Only Barrel — Reasoning Engine
 *
 * Import from here in server components, API routes, and server actions.
 * NEVER import from here in client components.
 *
 * Exports all server-side reasoning functionality.
 * For client-safe imports (types + pure domain only), use index.ts instead.
 */

import "server-only";

// ── Core Types ─────────────────────────────────────────────────────────────────
export type {
  ReasoningConfidence,
  ReasoningCategory,
  ExecutiveImpactLevel,
  InsightType,
  HypothesisStatus,
  ContradictionSeverity,
  SignalDirection,
  ReasoningSignal,
  ReasoningEvidence,
  ReasoningHypothesis,
  ReasoningInsight,
  ReasoningConclusion,
  ContradictionRecord,
  ReasoningError,
} from "./reasoning-types";
export type { ReasoningResult } from "./reasoning-types";

export {
  REASONING_CONFIDENCE_THRESHOLDS,
  REASONING_CATEGORIES,
  EXECUTIVE_IMPACT_RANK,
  scoreToConfidence,
  emptyConclusion,
  reasoningError,
} from "./reasoning-types";

// ── Cross-Domain Context ───────────────────────────────────────────────────────
export type {
  CrossDomainContext,
  DomainSignalSet,
  MemoryContextSummary,
  PlaybookContextSummary,
  ExecutiveBrainContextSummary,
} from "./cross-domain-context";
export {
  buildContext,
  mergeContexts,
  validateContext,
  getSignalsForDomain,
  getAllSignals,
} from "./cross-domain-context";

// ── Evidence Builder ───────────────────────────────────────────────────────────
export {
  buildEvidence,
  buildFinancialEvidence,
  buildCommercialEvidence,
  buildMarketingEvidence,
  buildCollectionsEvidence,
  buildOperationsEvidence,
  buildMemoryEvidence,
  buildPlaybookEvidence,
  buildExecutiveBrainEvidence,
  buildEvidenceFromContext,
  getSupportingEvidence,
  getContradictingEvidence,
  getEvidenceForCategory,
  getEvidenceAboveThreshold,
} from "./evidence-builder";

// ── Hypothesis Engine ──────────────────────────────────────────────────────────
export type { HypothesisPattern } from "./hypothesis-engine";
export {
  HYPOTHESIS_PATTERNS,
  generateHypotheses,
  getViableHypotheses,
  getRefutedHypotheses,
  rankHypotheses,
  getHypothesesForDomain,
  getMultiDomainHypotheses,
} from "./hypothesis-engine";

// ── Insight Engine ─────────────────────────────────────────────────────────────
export {
  generateInsights,
  rankInsights,
  filterActionableInsights,
  filterInsightsByConfidence,
  filterInsightsByImpact,
  getCriticalInsights,
  getInsightsForDomain,
  getMultiDomainInsights,
} from "./insight-engine";

// ── Confidence Engine ──────────────────────────────────────────────────────────
export type { ConfidenceSummary } from "./confidence-engine";
export {
  calculateEvidenceConfidence,
  calculateHypothesisConfidence,
  calculateInsightConfidence,
  calculateOverallConfidence,
  getConfidenceSummary,
} from "./confidence-engine";

// ── Contradiction Detector ────────────────────────────────────────────────────
export {
  detectEvidenceContradictions,
  detectHypothesisContradictions,
  detectSignalContradictions,
  detectAllContradictions,
  getSevereContradictions,
  getUnresolvedContradictions,
  hasBlockingContradictions,
} from "./contradiction-detector";

// ── Executive Impact ───────────────────────────────────────────────────────────
export type { ExecutiveImpactSummary } from "./executive-impact";
export {
  classifyInsightImpact,
  classifyConclusionImpact,
  getImpactSummary,
  filterInsightsByMinImpact,
} from "./executive-impact";

// ── Reasoning Pipeline ────────────────────────────────────────────────────────
export type {
  ReasoningPipelineOptions,
  ReasoningPipelineResult,
} from "./reasoning-pipeline";
export { runReasoningPipeline } from "./reasoning-pipeline";

// ── Multi-Domain Resolver ─────────────────────────────────────────────────────
export type { DomainResolutionPlan } from "./multi-domain-resolver";
export {
  resolveDomains,
  resolveMultiDomainQuery,
  getDomainCoverage,
  getActiveDomains,
} from "./multi-domain-resolver";

// ── Integration Adapters ──────────────────────────────────────────────────────
export type { MemoryIntegrationInput } from "./integrations/reasoning-memory";
export {
  memoryToReasoningSignals,
  memoryToContextSummary,
  getMemoryRelevance,
} from "./integrations/reasoning-memory";

export type { PlaybookIntegrationInput } from "./integrations/reasoning-playbooks";
export {
  playbookToReasoningSignals,
  playbookToContextSummary,
  getRelevantPlaybooks,
} from "./integrations/reasoning-playbooks";

export type {
  ExecutiveBrainIntegrationInput,
  ExecutiveBrainFeedback,
} from "./integrations/reasoning-executive-brain";
export {
  executiveBrainToReasoningSignals,
  executiveBrainToContextSummary,
  buildExecutiveFeedback,
} from "./integrations/reasoning-executive-brain";

export type {
  ReasoningTraceRecord,
  ReasoningEvidenceTrace,
} from "./integrations/reasoning-compliance";
export {
  buildReasoningTraceRecord,
  getEvidenceTraces,
  validateReasoningCompliance,
} from "./integrations/reasoning-compliance";

export type {
  ReasoningAuditEventType,
  ReasoningAuditEvent,
  ReasoningAuditLog,
} from "./integrations/reasoning-audit";
export {
  createReasoningAuditLog,
  auditReasoningStarted,
  auditReasoningCompleted,
  auditReasoningFailed,
  auditInsightGenerated,
  auditHypothesisGenerated,
  auditContradictionDetected,
  getAuditSummary,
} from "./integrations/reasoning-audit";

// ── Query Helpers ─────────────────────────────────────────────────────────────
export {
  getInsights,
  getHypotheses,
  getEvidence,
  getConfidence,
  getContradictions,
  getCoveredDomains,
  isMultiDomainConclusion,
  getConclusionSummary,
} from "./reasoning-query";

// ── Report Builder ────────────────────────────────────────────────────────────
export type {
  ExecutiveInsightReport,
  MultiDomainAnalysis,
  ReasoningTraceReport,
  HypothesisReport,
} from "./reasoning-report-builder";
export {
  buildExecutiveInsightReport,
  buildMultiDomainAnalysis,
  buildReasoningTraceReport,
  buildHypothesisReport,
} from "./reasoning-report-builder";

// ── Health ────────────────────────────────────────────────────────────────────
export type {
  ReasoningHealthStatus,
  ReasoningSubsystemHealth,
  ReasoningHealthReport,
} from "./reasoning-health";
export { evaluateReasoningHealth } from "./reasoning-health";

// ── Readiness ─────────────────────────────────────────────────────────────────
export type {
  ReasoningReadinessStatus,
  ReasoningSubsystemCheck,
  ReasoningReadinessReport,
} from "./reasoning-readiness";
export { scanReasoningReadiness } from "./reasoning-readiness";

// ── Dashboard Contract ────────────────────────────────────────────────────────
export type {
  ReasoningDashboardPayload,
  DomainCoverageMetric,
  InsightMetric,
} from "./reasoning-dashboard-contract";
export {
  buildReasoningDashboard,
  buildEmptyReasoningDashboard,
} from "./reasoning-dashboard-contract";

// ── Future Compatibility ──────────────────────────────────────────────────────
export type {
  MemoryGraphNode,
  MemoryGraphEdge,
  CausalModel,
  PredictiveReasoningModel,
} from "./future-compatibility";
export {
  MEMORY_GRAPH_PLAN,
  CAUSAL_ANALYSIS_PLAN,
  PREDICTIVE_REASONING_PLAN,
  AUTONOMOUS_PLANNING_PLAN,
  REASONING_FUTURE_PLANS,
  getFutureRoadmapSummary,
} from "./future-compatibility";
