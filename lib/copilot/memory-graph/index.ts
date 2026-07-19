/**
 * lib/copilot/memory-graph/index.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — Client-Safe Barrel
 *
 * Import from here in client components, shared utilities, type-only imports.
 * Contains ONLY types and pure domain functions.
 *
 * NEVER exports:
 *   - evaluateGraphHealth, scanGraphReadiness (server-only)
 *   - PrismaMemoryGraphRepository (server-only)
 *   - Any integration adapters that import server-only libs
 */

// ── Core Types ────────────────────────────────────────────────────────────────
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

// ── Relationship resolver types ───────────────────────────────────────────────
export type { RelationshipResolution } from "./relationship-resolver";
export {
  resolveRelationship,
  canRelate,
  allRelationshipsFor,
  edgeTypesFrom,
  RELATIONSHIP_PATTERNS,
} from "./relationship-resolver";

// ── Causality types ───────────────────────────────────────────────────────────
export type {
  CausalStrength,
  CausalLink,
  CausalChain,
  CausalModel,
} from "./causality-preparation";
export {
  CAUSALITY_ROADMAP,
  getCausalityRoadmapSummary,
  buildEmptyCausalModel,
  prepareCausalLink,
  identifyCausalCandidates,
} from "./causality-preparation";

// ── Scoring types ─────────────────────────────────────────────────────────────
export type { GraphMetrics } from "./graph-scoring";

// ── Integrity types ───────────────────────────────────────────────────────────
export type { IntegrityReport } from "./graph-integrity";

// ── Tenant isolation types ────────────────────────────────────────────────────
export type {
  TenantIsolationReport,
  TenantIsolationViolation,
  IsolationSeverity,
} from "./memory-graph-tenant-isolation";

// ── Repository types ──────────────────────────────────────────────────────────
export type {
  MemoryGraphRepository,
  NodeFilter,
  EdgeFilter,
} from "./memory-graph-repository";

// ── Context expansion types ───────────────────────────────────────────────────
export type {
  ExpandedContext,
  ExpansionSummary,
} from "./context-expansion";

// ── Timeline types ────────────────────────────────────────────────────────────
export type { TimelineStats } from "./memory-timeline";

// ── Report types ──────────────────────────────────────────────────────────────
export type {
  GraphSummaryReport,
  RelationshipReport,
  KnowledgeReport,
  ConnectivityReport,
} from "./report-builder";

// ── Dashboard types ───────────────────────────────────────────────────────────
export type {
  MemoryGraphDashboardPayload,
  DomainNodeMetric,
} from "./memory-graph-dashboard-contract";

// ── Dashboard builder (pure domain — no server deps) ─────────────────────────
export {
  buildMemoryGraphDashboard,
  buildEmptyMemoryGraphDashboard,
} from "./memory-graph-dashboard-contract";

// ── Audit types ───────────────────────────────────────────────────────────────
export type {
  GraphAuditEventType,
  GraphAuditEvent,
  GraphAuditLog,
  GraphAuditSummary,
} from "./integrations/memory-graph-audit";

// ── Compliance types ──────────────────────────────────────────────────────────
export type {
  GraphRelationshipTrace,
  GraphComplianceReport,
} from "./integrations/memory-graph-compliance";

// ── Future compatibility ──────────────────────────────────────────────────────
export type {
  ExternalGraphProvider,
  ExternalGraphConfig,
  GraphEmbeddingConfig,
} from "./future-compatibility";

export {
  MEMORY_GRAPH_FUTURE_PLANS,
  getFutureGraphRoadmapSummary,
} from "./future-compatibility";

// ── Scoring types ─────────────────────────────────────────────────────────────
export type { RankedMatch } from "./search-engine";

// ── Health types (types only — no functions) ──────────────────────────────────
export type {
  GraphHealthStatus,
  GraphSubsystemHealth,
  GraphHealthReport,
} from "./memory-graph-health";

// ── Readiness types (types only — no functions) ───────────────────────────────
export type {
  ReadinessStatus,
  GraphSubsystemCheck,
  GraphReadinessReport,
} from "./memory-graph-readiness";
