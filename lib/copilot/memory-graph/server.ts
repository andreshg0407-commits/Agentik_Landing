/**
 * lib/copilot/memory-graph/server.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — Server-Only Barrel
 *
 * Import from here in Server Components, API routes, and server-side services.
 * Contains all functionality including engine, repository, integrations.
 *
 * For client-safe types only, use index.ts instead.
 */

import "server-only";

// ── Core types (re-exported from client barrel) ───────────────────────────────
export type {
  GraphNodeType,
  GraphEdgeType,
  GraphNode,
  GraphEdge,
  GraphPath,
  GraphTraversal,
  GraphSubgraph,
  GraphQuery,
  GraphQueryResult,
  GraphSearchQuery,
  GraphSearchResult,
  GraphNodeScore,
  GraphValidationResult,
  GraphValidationError,
  TimelineEntry,
  MemoryTimeline,
  GraphSnapshot,
  SnapshotDiff,
} from "./memory-graph-types";

export {
  GRAPH_NODE_TYPES,
  GRAPH_EDGE_TYPES,
  GRAPH_DEFAULT_WEIGHT,
  GRAPH_MAX_DEPTH,
  GRAPH_MAX_NODES,
  GRAPH_MAX_EDGES,
} from "./memory-graph-types";

// ── Identity ──────────────────────────────────────────────────────────────────
export {
  generateNodeId,
  generateEdgeId,
  generateSnapshotId,
  generateQueryId,
  validateNodeId,
  validateEdgeId,
  isGraphId,
} from "./graph-identity";

// ── Registry ──────────────────────────────────────────────────────────────────
export {
  registerNode,
  registerEdge,
  removeNode,
  removeEdge,
  getNode,
  getEdge,
  listNodes,
  listEdges,
  hasNode,
  hasEdge,
  edgesFrom,
  edgesTo,
  edgesForNode,
  registryStats,
  clearRegistry,
  clearAllRegistries,
} from "./graph-registry";

// ── Node builder ──────────────────────────────────────────────────────────────
export {
  buildNode,
  buildMemoryNode,
  buildPlaybookNode,
  buildInsightNode,
  buildEventNode,
  buildAlertNode,
  buildAnomalyNode,
  buildDecisionNode,
  buildClientNode,
  buildProductNode,
  buildOrderNode,
  buildCampaignNode,
  buildTaskNode,
  buildAgentNode,
  buildDocumentNode,
  buildReportNode,
} from "./node-builder";

// ── Edge builder ──────────────────────────────────────────────────────────────
export {
  buildEdge,
  buildRelatedToEdge,
  buildGeneratedByEdge,
  buildReferencesEdge,
  buildCausedEdge,
  buildAffectsEdge,
  buildBelongsToEdge,
  buildLinkedToEdge,
  buildCreatedFromEdge,
  buildResolvesEdge,
  buildTriggersEdge,
  buildSupportsEdge,
  buildContradictsEdge,
  orderBelongsToClient,
  campaignAffectsProduct,
  insightGeneratedByEvidence,
  anomalyTriggersAlert,
  playbookTriggersTask,
} from "./edge-builder";

// ── Graph engine ──────────────────────────────────────────────────────────────
export {
  createNode,
  upsertNode,
  deleteNode,
  fetchNode,
  createEdge,
  deleteEdge,
  fetchEdge,
  getAllNodes,
  getAllEdges,
  getOutboundEdges,
  getInboundEdges,
  getNeighborIds,
  addNodes,
  addEdges,
  validateGraph,
} from "./graph-engine";

// ── Traversal engine ──────────────────────────────────────────────────────────
export {
  neighbors,
  parents,
  children,
  findPath,
  findPaths,
  shortestPath,
  bfsTraversal,
  nodesWithinDepth,
} from "./traversal-engine";

// ── Relationship resolver ─────────────────────────────────────────────────────
export {
  resolveRelationship,
  canRelate,
  allRelationshipsFor,
  edgeTypesFrom,
  RELATIONSHIP_PATTERNS,
} from "./relationship-resolver";

// ── Subgraph builder ──────────────────────────────────────────────────────────
export {
  buildSubgraph,
  buildSubgraphByType,
  buildClientSubgraph,
  buildInsightSubgraph,
  buildAlertSubgraph,
  buildSubgraphByEdgeType,
  buildSubgraphByTag,
  mergeSubgraphs,
} from "./subgraph-builder";

// ── Graph integrity ───────────────────────────────────────────────────────────
export {
  runIntegrityCheck,
  validateIntegrity,
  hasIntegrityErrors,
  countOrphanNodes,
} from "./graph-integrity";

// ── Graph scoring ─────────────────────────────────────────────────────────────
export {
  scoreNode,
  scoreAllNodes,
  topNodesByImportance,
  topNodesByCentrality,
  edgeStrength,
  averageEdgeWeight,
  computeGraphMetrics,
} from "./graph-scoring";

// ── Query engine ──────────────────────────────────────────────────────────────
export {
  findNode,
  findNodesByType,
  findNodesByTag,
  findRelated,
  findConnected,
  findSubgraph,
  findEdgesByType,
  findEdgesBetween,
  searchGraph,
  getHighImportanceNodes,
  getNodeEdgeCount,
  getIsolatedNodes,
} from "./query-engine";

// ── Search engine ─────────────────────────────────────────────────────────────
export {
  searchNodes,
  searchNodesTerm,
  getRankedMatches,
  findByLabel,
  findByMetadataKey,
  findByMetadataValue,
} from "./search-engine";

// ── Context expansion ─────────────────────────────────────────────────────────
export {
  expandContext,
  expandFromNodes,
  expandByType,
  summarizeExpansion,
} from "./context-expansion";

// ── Memory timeline ───────────────────────────────────────────────────────────
export {
  buildTimeline,
  buildNodeTimeline,
  buildEventTimeline,
  analyzeTimeline,
  filterTimelineByType,
  sliceTimeline,
} from "./memory-timeline";

// ── Knowledge snapshot ────────────────────────────────────────────────────────
export {
  createSnapshot,
  getSnapshot,
  listSnapshots,
  restoreSnapshot,
  deleteSnapshot,
  compareSnapshots,
  snapshotDiff,
} from "./knowledge-snapshot";

// ── Causality preparation ─────────────────────────────────────────────────────
export {
  identifyCausalCandidates,
  buildEmptyCausalModel,
  prepareCausalLink,
  CAUSALITY_ROADMAP,
  getCausalityRoadmapSummary,
} from "./causality-preparation";

// ── Report builder ────────────────────────────────────────────────────────────
export {
  buildGraphSummary,
  buildRelationshipReport,
  buildKnowledgeReport,
  buildConnectivityReport,
} from "./report-builder";

// ── Dashboard contract ────────────────────────────────────────────────────────
export {
  buildMemoryGraphDashboard,
  buildEmptyMemoryGraphDashboard,
} from "./memory-graph-dashboard-contract";

// ── Repository ────────────────────────────────────────────────────────────────
export {
  InMemoryGraphRepository,
} from "./memory-graph-repository";
export type {
  MemoryGraphRepository,
  NodeFilter,
  EdgeFilter,
} from "./memory-graph-repository";

// ── Prisma repository ─────────────────────────────────────────────────────────
export {
  PrismaMemoryGraphRepository,
} from "./persistence/prisma-memory-graph-repository";

// ── Tenant isolation ──────────────────────────────────────────────────────────
export {
  checkTenantIsolation,
  assertTenantIsolation,
  isCrossTenantNode,
  isCrossTenantEdge,
  filterToOrg,
} from "./memory-graph-tenant-isolation";

// ── Health ────────────────────────────────────────────────────────────────────
export {
  evaluateGraphHealth,
} from "./memory-graph-health";

// ── Readiness ─────────────────────────────────────────────────────────────────
export {
  scanGraphReadiness,
} from "./memory-graph-readiness";

// ── Integration adapters ──────────────────────────────────────────────────────
export {
  memoryEntryToNode,
  memoriesToGraphNodes,
  memoryContextToNodes,
  buildMemoryRelatedEdges,
  summarizeMemoryIntegration,
} from "./integrations/memory-graph-memory";

export {
  playbookToNode,
  playbooksToNodes,
  playbookContextToNodes,
  buildPlaybookLinkedEdges,
  summarizePlaybookIntegration,
} from "./integrations/memory-graph-playbooks";

export {
  executiveSignalToNode,
  executiveInsightToNode,
  executiveContextToGraph,
} from "./integrations/memory-graph-executive-brain";

export {
  reasoningConclusionToGraph,
  subgraphToReasoningContext,
} from "./integrations/memory-graph-intelligence";

export {
  buildGraphRelationshipTrace,
  validateGraphCompliance,
  getUntracedEdges,
  getUntracedNodes,
} from "./integrations/memory-graph-compliance";

export {
  createGraphAuditLog,
  auditNodeCreated,
  auditNodeUpdated,
  auditNodeRemoved,
  auditEdgeCreated,
  auditEdgeRemoved,
  auditGraphTraversed,
  auditGraphQueryExecuted,
  auditSnapshotCreated,
  auditIntegrityChecked,
  auditTenantIsolationChecked,
  getGraphAuditSummary,
} from "./integrations/memory-graph-audit";

// ── Future compatibility ──────────────────────────────────────────────────────
export {
  MEMORY_GRAPH_FUTURE_PLANS,
  getFutureGraphRoadmapSummary,
} from "./future-compatibility";
