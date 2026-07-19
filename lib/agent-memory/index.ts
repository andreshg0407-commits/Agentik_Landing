/**
 * lib/agent-memory/index.ts
 *
 * Agentik Agent Runtime — Operational Memory Graph
 *
 * Public barrel export for the agent memory subsystem.
 *
 * Sprint: AGENTIK-AGENT-CONTEXT-MEMORY-GRAPH-01
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type {
  RuntimeMemoryNodeType,
  EdgeRelationType,
  MemoryNodeSeverity,
  RuntimeMemoryNode,
  RuntimeMemoryEdge,
  AgentObservation,
  ActionContextNode,
  MemoryQueryResult,
  MemoryDiagnostics,
} from "./runtime-memory-types";

// ── Store ─────────────────────────────────────────────────────────────────────

export {
  memNodeId,
  memEdgeId,
  memObsId,
  appendMemory,
  appendMemoryEdge,
  appendObservation,
  getMemoryNode,
  queryMemory,
  queryByAction,
  queryByAgent,
  queryByModule,
  queryRelatedActions,
  queryObservations,
  getMemoryDiagnostics,
  setMemoryStoreAdapter,
} from "./runtime-memory-store";

export type {
  MemoryStoreAdapter,
  MemoryNodeFilter,
  MemoryEdgeFilter,
  ObservationFilter,
} from "./runtime-memory-store";

// ── Edges ─────────────────────────────────────────────────────────────────────

export {
  buildEdge,
  causedBy,
  dependsOn,
  approvedBy,
  rejectedBy,
  generatedBy,
  affectsModule,
  follows,
  escalatedFrom,
  delegatedTo,
  buildFollowsChain,
  edgeSummary,
} from "./context-edges";

// ── Action context ────────────────────────────────────────────────────────────

export {
  buildActionContextNode,
  recordApprovalDecision,
  recordRejectionDecision,
} from "./action-context";

// ── Observation log ───────────────────────────────────────────────────────────

export {
  recordObservation,
  recordCriticalObservation,
  recordHighObservation,
  recordInfoObservation,
  getRecentObservations,
  getModuleObservations,
  getObservationsSince,
  summarizeObservations,
  formatObservation,
  formatObservationList,
} from "./agent-observation-log";

export type { ObservationInput, ObservationSummary } from "./agent-observation-log";

// ── Memory queries ────────────────────────────────────────────────────────────

export {
  getRecentOperationalContext,
  getModuleOperationalHistory,
  getRelatedActionChain,
  getAgentDecisionTrail,
  getMultiAgentOperationalView,
  queryToResult,
} from "./memory-query";

export type {
  OperationalContext,
  ModuleOperationalHistory,
  ActionChain,
  AgentDecisionTrail,
  MultiAgentOperationalView,
} from "./memory-query";
