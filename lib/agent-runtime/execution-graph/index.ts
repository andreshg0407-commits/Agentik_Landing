/**
 * lib/agent-runtime/execution-graph/index.ts
 *
 * Agentik Execution Graph — Public API
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-EXECUTION-GRAPH-01
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type {
  NodeType,
  RelationType,
  ExecutionGraphNode,
  ExecutionGraphEdge,
  ExecutionGraphSummary,
  ExecutionGraph,
  ExecutionGraphIssue,
  GraphIssueType,
  GraphIssueSeverity,
  GraphBuildOptions,
} from "./execution-graph-types";

export { nodeId, edgeId, issueId } from "./execution-graph-types";

// ── Builder ───────────────────────────────────────────────────────────────────

export type { GraphSources } from "./execution-graph-builder";

export {
  buildExecutionGraph,
  buildActionNodes,
  buildExecutionNodes,
  buildAttemptNodes,
  buildDelegationNodes,
  buildPlanNodes,
  buildEventNodes,
  buildMemoryNodes,
  buildEdgesFromSessions,
  buildEdgesFromAttempts,
  buildEdgesFromDelegations,
  buildEdgesFromPlans,
  buildEdgesFromEvents,
  buildEdgesFromMemory,
  buildEdgesFromCorrelation,
  buildEdgesFromCausation,
} from "./execution-graph-builder";

// ── Query ─────────────────────────────────────────────────────────────────────

export {
  getNodeByRef,
  getNodeById,
  getOutgoingEdges,
  getIncomingEdges,
  getChildren,
  getParents,
  getAncestors,
  getDescendants,
  getExecutionChain,
  getDelegationChain,
  getPlanChain,
  getFailedChain,
  getBlockedChain,
  getRootCauses,
  getTerminalNodes,
  getOrphanNodes,
  getConnectedSubgraph,
} from "./execution-graph-query";

// ── Consistency ───────────────────────────────────────────────────────────────

export {
  validateExecutionGraph,
  detectOrphanExecutions,
  detectOrphanAttempts,
  detectOrphanDelegations,
  detectMissingExecutionForApprovedAction,
  detectDelegationWithoutParentAction,
  detectPlanWithoutSteps,
  detectDanglingEdges,
  detectDuplicateExecutions,
  detectUnresolvedBlocks,
  detectGraphCycles,
  detectMissingCorrelationMetadata,
  summarizeIssues,
} from "./execution-graph-consistency";

// ── Explainer ─────────────────────────────────────────────────────────────────

export type { GraphExplanation } from "./execution-graph-explainer";

export {
  explainExecutionChain,
  explainFailureChain,
  explainBlockedChain,
  explainDelegationChain,
  explainPlanLineage,
  explainRootCause,
} from "./execution-graph-explainer";

// ── Store ─────────────────────────────────────────────────────────────────────

export type {
  ExecutionGraphResult,
  ExecutionGraphDiagnostics,
} from "./execution-graph-store";

export {
  getExecutionGraphForOrg,
  getExecutionGraphForAction,
  getExecutionGraphForCorrelation,
  getExecutionGraphDiagnostics,
} from "./execution-graph-store";
