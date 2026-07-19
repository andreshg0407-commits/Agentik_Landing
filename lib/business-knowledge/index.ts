/**
 * lib/business-knowledge/index.ts
 *
 * BUSINESS-KNOWLEDGE-GRAPH-01
 * Barrel export for the Business Knowledge Graph.
 *
 * Client-safe: no Prisma, no server-only, no React.
 * Import from "@/lib/business-knowledge" for all knowledge graph contracts.
 */

// -- Core Types -----------------------------------------------------------
export type {
  KnowledgeRelationType,
  KnowledgeEdgeDirection,
  ConfidenceTier,
  ImpactType,
  GraphSnapshotStatus,
} from "./knowledge-types";
export { confidenceTier } from "./knowledge-types";

// -- Node -----------------------------------------------------------------
export type { KnowledgeNode } from "./knowledge-node";
export { buildNode, nextNodeId } from "./knowledge-node";

// -- Edge -----------------------------------------------------------------
export type { KnowledgeEdge } from "./knowledge-edge";
export { buildEdge, nextEdgeId } from "./knowledge-edge";

// -- Query ----------------------------------------------------------------
export type {
  KnowledgeQuery,
  KnowledgeQueryResult,
} from "./knowledge-query";
export {
  relatedToQuery,
  dependenciesOfQuery,
  affectedByQuery,
  entitiesByTypeQuery,
  subgraphQuery,
} from "./knowledge-query";

// -- Path -----------------------------------------------------------------
export type { KnowledgePath } from "./knowledge-path";
export {
  buildPath,
  nextPathId,
  computePathConfidence,
  describePathSteps,
  pathStart,
  pathEnd,
} from "./knowledge-path";

// -- Impact ---------------------------------------------------------------
export type {
  AffectedEntity,
  KnowledgeImpact,
  ImpactAction,
} from "./knowledge-impact";
export {
  buildImpact,
  buildImpactAction,
} from "./knowledge-impact";

// -- Context --------------------------------------------------------------
export type {
  ContextAlert,
  ContextRecommendation,
  ContextFact,
  KnowledgeContext,
} from "./knowledge-context";
export { buildContext } from "./knowledge-context";

// -- Resolver -------------------------------------------------------------
export type {
  KnowledgeResolverResult,
  IKnowledgeResolver,
  IKnowledgeResolverRegistry,
} from "./knowledge-resolver";

// -- Graph ----------------------------------------------------------------
export type {
  KnowledgeGraphSnapshot,
  IKnowledgeGraph,
} from "./knowledge-graph";
export { InMemoryKnowledgeGraph } from "./knowledge-graph";

// -- Utils ----------------------------------------------------------------
export {
  normalizeNodeId,
  createEdgeId,
  snapshotToNode,
  entityToNode,
  relationToEdge,
  filterByConfidence,
  filterByWeight,
  filterNodesByType,
  deduplicateNodes,
  deduplicateEdges,
  sortImpactsBySeverity,
} from "./knowledge-utils";
