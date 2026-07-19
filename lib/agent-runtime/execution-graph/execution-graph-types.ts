/**
 * lib/agent-runtime/execution-graph/execution-graph-types.ts
 *
 * Agentik Execution Graph — Type Definitions
 *
 * Core types for the causal execution graph that connects actions,
 * executions, attempts, delegations, plans, events, and memory nodes
 * into a queryable operational lineage structure.
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-EXECUTION-GRAPH-01
 */

// ── Node types ────────────────────────────────────────────────────────────────

export type NodeType =
  | "action"             // An ActionEnvelope / ActionTask
  | "execution_session"  // An ExecutionSession
  | "execution_attempt"  // An ExecutionAttempt within a session
  | "delegation"         // An AgentDelegation
  | "plan"               // An OperationalPlan
  | "event"              // A RuntimeStoredEvent
  | "memory_node"        // A RuntimeMemoryNode
  | "tool"               // A tool invocation (synthetic)
  | "human_decision"     // A human approve/reject decision
  | "data_source";       // An external data source reference

// ── Edge relation types ────────────────────────────────────────────────────────

export type RelationType =
  | "caused_by"          // This entity was caused by the target
  | "triggers"           // This entity triggers the target
  | "depends_on"         // This entity depends on the target to proceed
  | "blocks"             // This entity is blocking the target
  | "resolves"           // This entity resolves a block on the target
  | "retries"            // This entity is a retry of the target
  | "retry_of"           // This entity is a retry_of the target attempt
  | "attempt_of"         // This attempt belongs to the target session
  | "execution_of"       // This execution session is of the target action
  | "delegated_to"       // This action/delegation was delegated to target
  | "approved_by"        // This entity was approved by target (human decision)
  | "rejected_by"        // This entity was rejected by target (human decision)
  | "belongs_to_plan"    // This entity is a step in the target plan
  | "emitted_event"      // This entity emitted the target event
  | "references_memory"  // This entity references the target memory node
  | "uses_tool"          // This execution uses the target tool
  | "produced_result"    // This execution produced the target result
  | "failed_because"     // This entity failed because of the target event/error
  | "waiting_for"        // This entity is waiting for the target
  | "follows";           // Sequential temporal relationship

// ── Graph node ────────────────────────────────────────────────────────────────

export interface ExecutionGraphNode {
  /** Stable node ID: "egn_{nodeType}_{refId}" */
  id:        string;
  orgId:     string;
  nodeType:  NodeType;
  /** ID of the original entity this node represents */
  refId:     string;
  /** Short label for the node */
  label:     string;
  /** Human-readable operational summary */
  summary:   string;
  /** Current lifecycle status (action, execution, delegation, etc.) */
  status:    string;
  agentId:   string | null;
  moduleKey: string | null;
  createdAt: string;  // ISO
  updatedAt: string;  // ISO
  metadata:  Record<string, unknown>;
}

// ── Graph edge ────────────────────────────────────────────────────────────────

export interface ExecutionGraphEdge {
  /** Stable edge ID: "ege_{seq}" (ephemeral — graph rebuilt on demand) */
  id:           string;
  orgId:        string;
  sourceNodeId: string;
  targetNodeId: string;
  relationType: RelationType;
  label:        string;
  createdAt:    string;  // ISO — time this relationship was established
  metadata:     Record<string, unknown>;
}

// ── Graph summary ─────────────────────────────────────────────────────────────

export interface ExecutionGraphSummary {
  nodeCount:        number;
  edgeCount:        number;
  actionCount:      number;
  executionCount:   number;
  attemptCount:     number;
  delegationCount:  number;
  planCount:        number;
  eventCount:       number;
  memoryNodeCount:  number;
  unresolvedBlocks: number;
  failedChains:     number;
  orphanNodes:      number;
  maxDepth:         number;
  cyclesDetected:   number;
}

// ── Execution graph ───────────────────────────────────────────────────────────

export interface ExecutionGraph {
  orgId:       string;
  /** Node IDs that have no incoming edges (root causes / chain starts) */
  rootNodeIds: string[];
  /** All nodes keyed by node ID for O(1) lookup */
  nodes:       Record<string, ExecutionGraphNode>;
  edges:       ExecutionGraphEdge[];
  generatedAt: string;  // ISO
  summary:     ExecutionGraphSummary;
}

// ── Graph issue ───────────────────────────────────────────────────────────────

export type GraphIssueType =
  | "orphan_execution"
  | "orphan_attempt"
  | "orphan_delegation"
  | "missing_execution_for_approved_action"
  | "execution_without_events"
  | "failed_without_error_event"
  | "delegation_without_parent_action"
  | "plan_without_steps"
  | "cycle_detected"
  | "dangling_edge"
  | "unresolved_block"
  | "duplicate_execution_for_action"
  | "missing_correlation_metadata";

export type GraphIssueSeverity = "critical" | "warning" | "info";

export interface ExecutionGraphIssue {
  id:                 string;
  issueType:          GraphIssueType;
  severity:           GraphIssueSeverity;
  nodeId:             string | null;   // The problematic node
  refId:              string | null;   // The problematic entity's refId
  summary:            string;
  suggestedResolution: string;
}

// ── Graph query options ───────────────────────────────────────────────────────

export interface GraphBuildOptions {
  orgId:          string;
  actionId?:      string | null;
  executionId?:   string | null;
  delegationId?:  string | null;
  planId?:        string | null;
  correlationId?: string | null;
  depth?:         number;         // Max traversal depth (default 8)
  includeEvents?: boolean;        // Include event nodes (default true)
  includeMemory?: boolean;        // Include memory nodes (default false)
}

// ── ID helpers ────────────────────────────────────────────────────────────────

let _edgeSeq = 0;

export function nodeId(nodeType: NodeType, refId: string): string {
  // Sanitize refId: keep alphanum + underscore + hyphen, max 64 chars
  const safe = refId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return `egn_${nodeType}_${safe}`;
}

export function edgeId(): string {
  return `ege_${Date.now()}_${++_edgeSeq}`;
}

export function issueId(): string {
  return `egi_${Date.now()}_${++_edgeSeq}`;
}
