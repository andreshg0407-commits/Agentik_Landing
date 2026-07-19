/**
 * lib/copilot/intelligence/reasoning/index.ts
 *
 * AGENTIK-COPILOT-INTELLIGENCE-02
 * Client-Safe Barrel — Reasoning Engine
 *
 * Import from here in client components, shared utilities, and type-only imports.
 * Safe to use in any context — contains NO server-only functions.
 *
 * For full server-side reasoning functionality (pipeline, health, report builder),
 * use server.ts instead.
 *
 * Rule: types + pure domain constants only. Never services.
 */

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
  ReasoningResult,
} from "./reasoning-types";

export {
  REASONING_CONFIDENCE_THRESHOLDS,
  REASONING_CATEGORIES,
  EXECUTIVE_IMPACT_RANK,
  scoreToConfidence,
  emptyConclusion,
  reasoningError,
} from "./reasoning-types";

// ── Cross-Domain Context Types ─────────────────────────────────────────────────
export type {
  CrossDomainContext,
  DomainSignalSet,
  MemoryContextSummary,
  PlaybookContextSummary,
  ExecutiveBrainContextSummary,
} from "./cross-domain-context";

// ── Integration Adapter Types ─────────────────────────────────────────────────
export type { MemoryIntegrationInput } from "./integrations/reasoning-memory";
export type { PlaybookIntegrationInput } from "./integrations/reasoning-playbooks";
export type {
  ExecutiveBrainIntegrationInput,
  ExecutiveBrainFeedback,
} from "./integrations/reasoning-executive-brain";
export type {
  ReasoningTraceRecord,
  ReasoningEvidenceTrace,
} from "./integrations/reasoning-compliance";
export type {
  ReasoningAuditEventType,
  ReasoningAuditEvent,
  ReasoningAuditLog,
} from "./integrations/reasoning-audit";

// ── Hypothesis Engine Types ────────────────────────────────────────────────────
export type { HypothesisPattern } from "./hypothesis-engine";

// ── Pipeline Types ─────────────────────────────────────────────────────────────
export type {
  ReasoningPipelineOptions,
  ReasoningPipelineResult,
} from "./reasoning-pipeline";

// ── Multi-Domain Resolver Types ───────────────────────────────────────────────
export type { DomainResolutionPlan } from "./multi-domain-resolver";

// ── Confidence Engine Types ────────────────────────────────────────────────────
export type { ConfidenceSummary } from "./confidence-engine";

// ── Executive Impact Types ────────────────────────────────────────────────────
export type { ExecutiveImpactSummary } from "./executive-impact";

// ── Report Builder Types ───────────────────────────────────────────────────────
export type {
  ExecutiveInsightReport,
  MultiDomainAnalysis,
  ReasoningTraceReport,
  HypothesisReport,
} from "./reasoning-report-builder";

// ── Health Types ───────────────────────────────────────────────────────────────
export type {
  ReasoningHealthStatus,
  ReasoningSubsystemHealth,
  ReasoningHealthReport,
} from "./reasoning-health";

// ── Readiness Types ────────────────────────────────────────────────────────────
export type {
  ReasoningReadinessStatus,
  ReasoningSubsystemCheck,
  ReasoningReadinessReport,
} from "./reasoning-readiness";

// ── Dashboard Contract Types ───────────────────────────────────────────────────
export type {
  ReasoningDashboardPayload,
  DomainCoverageMetric,
  InsightMetric,
} from "./reasoning-dashboard-contract";

// ── Dashboard Contract (pure domain — no server deps) ─────────────────────────
export {
  buildReasoningDashboard,
  buildEmptyReasoningDashboard,
} from "./reasoning-dashboard-contract";

// ── Future Compatibility Types ─────────────────────────────────────────────────
export type {
  MemoryGraphNode,
  MemoryGraphEdge,
  CausalModel,
  PredictiveReasoningModel,
} from "./future-compatibility";

export {
  REASONING_FUTURE_PLANS,
  getFutureRoadmapSummary,
} from "./future-compatibility";
