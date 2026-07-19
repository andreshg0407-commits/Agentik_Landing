// AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01
// Client-safe barrel — no server-only imports

// Core types
export type {
  LearningEventType,
  LearningSource,
  LearningConfidence,
  LearningDomain,
  LearningPatternStatus,
  LearningOutcomeResult,
  LearningAdjustmentDirection,
  LearningSignalStrength,
  LearningEvent,
  LearningPattern,
  LearningOutcome,
  LearningSignal,
  LearningAdjustment,
  LearningContext,
  LearningApplicationContext,
  AgentLearningProfile,
  TenantLearningProfile,
  LearningResult,
} from "./learning-types";

export {
  LEARNING_EVENT_TYPES,
  LEARNING_SOURCES,
  LEARNING_CONFIDENCE_LEVELS,
  LEARNING_DOMAINS,
  LEARNING_PATTERN_STATUSES,
} from "./learning-types";

// Identity
export {
  generateLearningEventId,
  generateLearningPatternId,
  generateLearningSignalId,
  generateLearningAdjustmentId,
  generateLearningOutcomeId,
  generateLearningResultId,
} from "./learning-identity";

// Event builder
export type { LearningEventInput } from "./learning-event-builder";
export {
  buildLearningEvent,
  buildFeedbackEvent,
  buildOutcomeEvent,
  buildHypothesisEvent,
  buildRecommendationEvent,
} from "./learning-event-builder";

// Pattern engine
export {
  createPattern,
  reinforcePattern,
  weakenPattern,
  mergePatterns,
  isPatternActive,
  isPatternDeprecated,
  sortPatternsByConfidence,
  filterActivePatterns,
} from "./learning-pattern-engine";

// Signal engine
export {
  eventToLearningSignal,
  eventsToSignals,
  filterPositiveSignals,
  filterNegativeSignals,
  scoreSignalSet,
} from "./learning-signal-engine";

// Feedback processor
export type { FeedbackClassification, RawFeedback, NormalizedFeedback } from "./feedback-processor";
export {
  classifyFeedback,
  normalizeFeedback,
  processFeedback,
} from "./feedback-processor";

// Outcome tracker
export {
  trackOutcome,
  evaluateOutcome,
  compareOutcomes,
  aggregateOutcomes,
} from "./outcome-tracker";

// Confidence adjustment engine
export {
  suggestConfidenceAdjustment,
  suggestBulkAdjustments,
  applyAdjustment,
  rankAdjustments,
  filterAdjustmentsByDomain,
  computeNetConfidenceShift,
} from "./confidence-adjustment-engine";

// Agent learning profile
export {
  createAgentLearningProfile,
  updateAgentProfile,
  getAgentDomains,
  isAgentDomainCompatible,
  listKnownAgentIds,
  computeAgentSuccessRate,
} from "./agent-learning-profile";

// Tenant learning profile
export {
  createTenantLearningProfile,
  updateTenantProfile,
  getConfidenceMultiplier,
  isProfileMature,
} from "./tenant-learning-profile";

// Application engine
export type {
  HypothesisWithLearning,
  RecommendationWithLearning,
} from "./learning-application-engine";
export {
  getLearningContext,
  applyLearningToHypothesis,
  applyLearningToRecommendation,
} from "./learning-application-engine";

// Guardrails
export type { GuardrailViolation, GuardrailResult } from "./learning-guardrails";
export {
  validateLearningEvent,
  validatePatternCreation,
  validateAdjustmentApplication,
  validateCrossTenantIsolation,
  filterTenantEvents,
  filterTenantPatterns,
  assertTenantIsolation,
} from "./learning-guardrails";

// Reversal
export type { ReversalRecord } from "./learning-reversal";
export {
  revertEvent,
  revertPattern,
  revertAdjustment,
} from "./learning-reversal";

// Query layer
export {
  getEventsByType,
  getEventsByDomain,
  getEventsByAgent,
  getRecentEvents,
  countPositiveEvents,
  countNegativeEvents,
  getPatternsByDomain,
  getPatternsByStatus,
  getTopPatterns,
  getPatternByAgent,
  getPositiveOutcomes,
  getNegativeOutcomes,
  getOutcomesByDomain,
  computeOutcomeSuccessRate,
  getPendingAdjustments,
  getAppliedAdjustments,
  getAdjustmentsByDomain,
} from "./learning-query";

// Repository
export type { LearningRepository } from "./learning-repository";
export { InMemoryLearningRepository } from "./learning-repository";

// Dashboard contract
export type {
  LearningDomainSummary,
  LearningDashboardPayload,
} from "./learning-dashboard-contract";
export { buildLearningDashboard } from "./learning-dashboard-contract";

// Readiness
export type { LearningReadinessLevel, LearningReadinessCheck, LearningReadinessReport } from "./learning-readiness";
export {
  LEARNING_READINESS_THRESHOLDS,
  evaluateLearningReadiness,
} from "./learning-readiness";

// Future compatibility
export {
  LEARNING_FUTURE_CAPABILITIES,
  REINFORCEMENT_LEARNING_ENGINE,
  HITL_TRAINING,
  MODEL_FINE_TUNING,
  CROSS_DOMAIN_TRANSFER,
  FEDERATED_LEARNING,
  TEMPORAL_DECAY_ENGINE,
  CAUSAL_LEARNING_GRAPH,
} from "./future-compatibility";

// Integration adapters
export {
  memoryEntryToLearningEvent,
  memoryEntriesToLearningEvents,
  createPatternFromMemory,
} from "./integrations/learning-memory";

export {
  graphNodeToLearningEvent,
  graphEdgeToLearningEvent,
  buildGraphLearningEvents,
} from "./integrations/learning-memory-graph";

export {
  hypothesisOutcomeToLearningEvent,
  recommendationOutcomeToLearningEvent,
  reasoningResultToLearningEvents,
} from "./integrations/learning-cross-module-reasoning";

export {
  executiveSignalToLearningEvent,
  executiveInsightToLearningEvent,
  buildExecutiveLearningEvents,
} from "./integrations/learning-executive-brain";

export {
  playbookToLearningEvent,
  buildPlaybookLearningEvents,
  detectObsoletePlaybooks,
} from "./integrations/learning-playbooks";

export type { CopilotLearningHint, CopilotLearningPromptContext } from "./integrations/learning-copilot";
export {
  buildCopilotLearningHint,
  buildCopilotLearningPromptContext,
  formatLearningForCopilotPrompt,
} from "./integrations/learning-copilot";

export type {
  LearningComplianceStatus,
  LearningComplianceSignal,
  LearningComplianceReport,
} from "./integrations/learning-compliance";
export {
  eventToComplianceSignal,
  patternToComplianceSignal,
  buildComplianceLearningReport,
  evaluateLearningComplianceGate,
} from "./integrations/learning-compliance";

export type { LearningAuditEventType, LearningAuditRecord } from "./integrations/learning-audit";
export {
  auditLearningEvent,
  auditPatternCreated,
  auditPatternUpdated,
  auditAdjustmentSuggested,
  auditLearningCycle,
  buildLearningAuditLog,
} from "./integrations/learning-audit";
