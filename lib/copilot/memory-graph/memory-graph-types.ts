/**
 * lib/copilot/memory-graph/memory-graph-types.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — Core Domain Types
 *
 * Pure TypeScript domain types.
 * No Prisma. No React. No Next. No server-only.
 * All serializable. All auditable.
 */

// ── Node Types ─────────────────────────────────────────────────────────────────

/**
 * GraphNodeType — the kind of entity a node represents.
 */
export type GraphNodeType =
  | "MEMORY"
  | "CLIENT"
  | "PRODUCT"
  | "ORDER"
  | "CAMPAIGN"
  | "INSIGHT"
  | "PLAYBOOK"
  | "TASK"
  | "EVENT"
  | "ALERT"
  | "ANOMALY"
  | "DECISION"
  | "AGENT"
  | "USER"
  | "DOCUMENT"
  | "REPORT";

/**
 * GraphEdgeType — the kind of relationship between two nodes.
 */
export type GraphEdgeType =
  | "RELATED_TO"
  | "GENERATED_BY"
  | "REFERENCES"
  | "CAUSED"
  | "AFFECTS"
  | "BELONGS_TO"
  | "LINKED_TO"
  | "CREATED_FROM"
  | "RESOLVES"
  | "TRIGGERS"
  | "SUPPORTS"
  | "CONTRADICTS";

// ── Core Structures ────────────────────────────────────────────────────────────

/**
 * GraphNode — a typed, org-scoped entity node.
 * source is REQUIRED: every node must have provenance.
 */
export interface GraphNode {
  id:          string;
  orgSlug:     string;
  type:        GraphNodeType;
  label:       string;
  /** Arbitrary serializable metadata about this entity. */
  metadata:    Record<string, unknown>;
  /** Provenance — which system/operation created this node. */
  source:      string;
  tags:        string[];
  createdAt:   string;            // ISO 8601
  updatedAt?:  string;            // ISO 8601 — set on update
  /** Semantic weight 0–1. Higher = more important. */
  weight:      number;
}

/**
 * GraphEdge — a directed, typed, org-scoped relationship.
 * Both source and target must be in the same org.
 */
export interface GraphEdge {
  id:           string;
  orgSlug:      string;
  type:         GraphEdgeType;
  sourceNodeId: string;
  targetNodeId: string;
  /** Relationship strength 0–1. */
  weight:       number;
  label?:       string;
  metadata:     Record<string, unknown>;
  /** Provenance — which operation created this edge. */
  source:       string;
  /** Reasoning behind this relationship. */
  reasoning?:   string;
  createdAt:    string;           // ISO 8601
}

/**
 * GraphPath — an ordered sequence of nodes and edges.
 */
export interface GraphPath {
  orgSlug:    string;
  nodes:      GraphNode[];
  edges:      GraphEdge[];
  /** Number of hops (edges.length). */
  length:     number;
  /** True if a valid path exists (length >= 0). */
  exists:     boolean;
}

/**
 * GraphTraversal — a breadth-first or depth-first traversal record.
 */
export interface GraphTraversal {
  orgSlug:      string;
  startNodeId:  string;
  visited:      string[];         // node IDs in visitation order
  path:         GraphPath;
  maxDepth:     number;
  traversedAt:  string;           // ISO 8601
}

/**
 * GraphSubgraph — a bounded view of the full graph.
 * Always org-scoped.
 */
export interface GraphSubgraph {
  orgSlug:      string;
  nodes:        GraphNode[];
  edges:        GraphEdge[];
  rootNodeId?:  string;
  queryId?:     string;
  createdAt:    string;           // ISO 8601
}

// ── Validation ─────────────────────────────────────────────────────────────────

export interface GraphValidationError {
  code:     string;
  message:  string;
  nodeId?:  string;
  edgeId?:  string;
}

export interface GraphValidationResult {
  valid:    boolean;
  errors:   GraphValidationError[];
  warnings: string[];
}

// ── Query ──────────────────────────────────────────────────────────────────────

export interface GraphQuery {
  orgSlug:      string;
  nodeType?:    GraphNodeType;
  edgeType?:    GraphEdgeType;
  tags?:        string[];
  label?:       string;
  minWeight?:   number;
  limit?:       number;
  queryId:      string;
}

export interface GraphQueryResult {
  orgSlug:    string;
  queryId:    string;
  nodes:      GraphNode[];
  edges:      GraphEdge[];
  totalNodes: number;
  totalEdges: number;
  executedAt: string;
}

// ── Search ─────────────────────────────────────────────────────────────────────

export interface GraphSearchQuery {
  orgSlug:  string;
  term:     string;
  nodeType?: GraphNodeType;
  limit?:   number;
}

export interface GraphSearchResult {
  orgSlug:  string;
  term:     string;
  matches:  GraphNode[];
  total:    number;
}

// ── Timeline ───────────────────────────────────────────────────────────────────

export interface TimelineEntry {
  nodeId:     string;
  node:       GraphNode;
  timestamp:  string;
  eventType:  string;
}

export interface MemoryTimeline {
  orgSlug:    string;
  entries:    TimelineEntry[];
  startAt?:   string;
  endAt?:     string;
  createdAt:  string;
}

// ── Snapshot ───────────────────────────────────────────────────────────────────

export interface GraphSnapshot {
  id:         string;
  orgSlug:    string;
  nodes:      GraphNode[];
  edges:      GraphEdge[];
  nodeCount:  number;
  edgeCount:  number;
  capturedAt: string;
  label?:     string;
}

export interface SnapshotDiff {
  addedNodes:   GraphNode[];
  removedNodes: GraphNode[];
  addedEdges:   GraphEdge[];
  removedEdges: GraphEdge[];
  unchanged:    number;
}

// ── Scoring ────────────────────────────────────────────────────────────────────

export interface GraphNodeScore {
  nodeId:              string;
  orgSlug:             string;
  importance:          number;     // 0–1
  centrality:          number;     // 0–1 degree centrality
  connectionCount:     number;
  inboundCount:        number;
  outboundCount:       number;
  averageEdgeWeight:   number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

export const GRAPH_NODE_TYPES: GraphNodeType[] = [
  "MEMORY", "CLIENT", "PRODUCT", "ORDER", "CAMPAIGN", "INSIGHT",
  "PLAYBOOK", "TASK", "EVENT", "ALERT", "ANOMALY", "DECISION",
  "AGENT", "USER", "DOCUMENT", "REPORT",
];

export const GRAPH_EDGE_TYPES: GraphEdgeType[] = [
  "RELATED_TO", "GENERATED_BY", "REFERENCES", "CAUSED", "AFFECTS",
  "BELONGS_TO", "LINKED_TO", "CREATED_FROM", "RESOLVES", "TRIGGERS",
  "SUPPORTS", "CONTRADICTS",
];

export const GRAPH_DEFAULT_WEIGHT = 0.5;
export const GRAPH_MAX_DEPTH      = 6;
export const GRAPH_MAX_NODES      = 10_000;
export const GRAPH_MAX_EDGES      = 50_000;
