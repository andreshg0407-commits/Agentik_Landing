// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Client-safe barrel — NO "server-only" import
// Do NOT export runStrategicMemoryEngine (server-only)

export type {
  StrategicMemoryType,
  StrategicMemoryPriority,
  StrategicMemoryStatus,
  StrategicMemoryConfidence,
  StrategicMemoryDomain,
  StrategicRelationType,
  StrategicMemorySource,
  StrategicMemoryEntry,
  StrategicMemoryRelation,
  StrategicMemoryEvidence,
  StrategicMemorySignal,
  StrategicMemoryContext,
  StrategicMemoryQuery,
  StrategicMemorySnapshot,
  StrategicMemoryResult,
} from "./strategic-memory-types";

export {
  generateStrategicMemoryId,
  generateStrategicRelationId,
  generateStrategicSnapshotId,
  generateStrategicEvidenceId,
  generateStrategicSignalId,
  generateStrategicResultId,
  validateStrategicMemoryId,
  validateStrategicRelationId,
  validateStrategicSnapshotId,
  isStrategicMemoryId,
} from "./strategic-memory-identity";

export type { StrategicMemoryInput } from "./strategic-memory-builder";
export {
  buildStrategicMemory,
  buildStrategicGoal,
  buildStrategicRisk,
  buildStrategicOpportunity,
  buildStrategicDecision,
  buildStrategicLesson,
  buildStrategicCommitment,
  buildStrategicPolicy,
  updateStrategicMemoryStatus,
  updateStrategicMemoryPriority,
} from "./strategic-memory-builder";

export {
  classifyStrategicImportance,
  isStrategicCandidate,
  computeStrategicScore,
  rankStrategicItems,
  filterStrategicItems,
  getStrategicImportanceLabel,
} from "./strategic-classification-engine";

export {
  createStrategicRelation,
  linkGoalToRisk,
  linkGoalToOpportunity,
  linkDecisionToOutcome,
  linkLessonToDecision,
  linkPolicyToConstraint,
  removeStrategicRelation,
  findRelationsForEntry,
  findRelationsByType,
  validateRelationIntegrity,
} from "./strategic-relationship-engine";

export {
  computeCurrentRelevance,
  computeBusinessImpact,
  rankByImportance,
  isStillRelevant,
  filterRelevantItems,
  identifyStaleItems,
} from "./strategic-relevance-engine";

export {
  buildTimeline,
  getRecentStrategicEvents,
  getStrategicEvolution,
  comparePeriods,
  groupByDomain,
} from "./strategic-timeline-engine";

export {
  buildSnapshot,
  buildExecutiveSnapshot,
  buildQuarterSnapshot,
  buildYearSnapshot,
} from "./strategic-snapshot-engine";

export {
  findStrategicMemory,
  findGoals,
  findRisks,
  findDecisions,
  findLessons,
  findPolicies,
  findCommitments,
  findByPriority,
  findByStatus,
  findByDomain,
  findActiveStrategicItems,
  findCriticalItems,
  textSearch,
} from "./strategic-search-engine";

export type { StrategicGuardrailViolation, StrategicGuardrailResult } from "./strategic-guardrails";
export {
  validateStrategicMemoryInput,
  validateStrategicRelation,
  validateCrossTenantIsolation,
  filterTenantEntries,
  filterTenantRelations,
  assertStrategicTenantIsolation,
} from "./strategic-guardrails";

export {
  findStrategicMemory as findStrategicMemoryQuery,
  findByGoal,
  findByRisk,
  findByDecision,
  findByPriority as findByPriorityQuery,
  findActiveStrategicItems as findActiveStrategicItemsQuery,
  findStrategicRelations,
  findStrategicSnapshots,
  countByType,
  countByStatus,
  getTopStrategicItems,
} from "./strategic-memory-query";

export type { StrategicMemoryRepository } from "./strategic-memory-repository";
export { InMemoryStrategicMemoryRepository } from "./strategic-memory-repository";

export type { StrategicNarrative } from "./strategic-narrative-engine";
export {
  buildGoalNarrative,
  buildRiskNarrative,
  buildOpportunityNarrative,
  buildStrategicSummary,
  buildExecutiveNarrative,
} from "./strategic-narrative-engine";

export type { StrategicDomainSummary, StrategicDashboardPayload } from "./strategic-dashboard-contract";
export { buildStrategicDashboard } from "./strategic-dashboard-contract";

export type { StrategicMemoryEngineOutput, StrategicMemoryBatchOutput } from "./strategic-memory-engine";
export { runStrategicMemoryBatch } from "./strategic-memory-engine";

export type { StrategicReadinessLevel, StrategicMemoryReadinessResult } from "./strategic-memory-readiness";
export {
  evaluateStrategicMemoryReadiness,
  isStrategicMemoryReady,
  STRATEGIC_READINESS_THRESHOLDS,
} from "./strategic-memory-readiness";

export {
  STRATEGIC_FUTURE_CAPABILITIES,
  isStrategicCapabilityPlanned,
  getStrategicCapabilityDescriptor,
} from "./future-compatibility";
export type { StrategicFutureCapability } from "./future-compatibility";
