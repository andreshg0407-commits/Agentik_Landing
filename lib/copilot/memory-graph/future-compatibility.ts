/**
 * lib/copilot/memory-graph/future-compatibility.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — Future Compatibility
 *
 * Contracts and stubs for planned graph capabilities.
 * All items marked PLANNED. None implemented.
 */

// ── External graph database adapters (PLANNED) ────────────────────────────────

export type ExternalGraphProvider =
  | "NEO4J"
  | "MEMGRAPH"
  | "AMAZON_NEPTUNE"
  | "TIGERGRAPH"
  | "IN_MEMORY";     // current

export interface ExternalGraphConfig {
  provider:  ExternalGraphProvider;
  endpoint?: string;
  authToken?: string;
  orgSlug:   string;
}

export interface ExternalGraphAdapter {
  provider:  ExternalGraphProvider;
  connect():    Promise<void>;
  disconnect(): Promise<void>;
  isHealthy():  Promise<boolean>;
  /** PLANNED — not implemented. */
  status: "PLANNED";
}

// ── Graph Embeddings (PLANNED) ─────────────────────────────────────────────────

export interface GraphEmbeddingConfig {
  dimensions:    number;
  model:         string;
  /** PLANNED — no embedding computation yet. */
  status:        "PLANNED";
}

export interface NodeEmbedding {
  nodeId:    string;
  orgSlug:   string;
  vector:    number[];
  model:     string;
  computedAt: string;
}

// ── Causal Reasoning (PLANNED) ────────────────────────────────────────────────

export interface CausalReasoningConfig {
  maxChainLength:   number;
  minConfidence:    number;
  /** PLANNED for AGENTIK-MEMORY-GRAPH-CAUSALITY-01. */
  status:           "PLANNED";
}

// ── Autonomous Planning (PLANNED) ─────────────────────────────────────────────

export interface AutonomousPlanningConfig {
  maxActions:       number;
  requiresApproval: true;          // always true — safety constraint
  humanInLoop:      true;          // always true — safety constraint
  /** PLANNED for AGENTIK-AUTONOMOUS-PLANNING-01. */
  status:           "PLANNED";
}

// ── Knowledge Graph AI (PLANNED) ──────────────────────────────────────────────

export interface KnowledgeGraphAIConfig {
  enableInference:  boolean;
  inferenceModel:   string;
  /** PLANNED — no AI inference in current sprint. */
  status:           "PLANNED";
}

// ── Roadmap ────────────────────────────────────────────────────────────────────

export const MEMORY_GRAPH_FUTURE_PLANS = [
  {
    id:          "NEO4J_ADAPTER",
    name:        "Neo4j External Graph Adapter",
    sprint:      "AGENTIK-MEMORY-GRAPH-NEO4J-01",
    status:      "PLANNED" as const,
    description: "Plug in Neo4j as an optional graph persistence layer",
  },
  {
    id:          "GRAPH_EMBEDDINGS",
    name:        "Graph Embedding Layer",
    sprint:      "AGENTIK-MEMORY-GRAPH-EMBEDDINGS-01",
    status:      "PLANNED" as const,
    description: "Vector embeddings for nodes enabling semantic similarity search",
  },
  {
    id:          "CAUSAL_ENGINE",
    name:        "Causal Reasoning Engine",
    sprint:      "AGENTIK-MEMORY-GRAPH-CAUSALITY-01",
    status:      "PLANNED" as const,
    description: "Automated causal chain inference and root cause analysis",
  },
  {
    id:          "AUTONOMOUS_PLANNING",
    name:        "Autonomous Planning Integration",
    sprint:      "AGENTIK-AUTONOMOUS-PLANNING-01",
    status:      "PLANNED" as const,
    description: "Agent-driven graph traversal for planning (always human-in-loop)",
  },
  {
    id:          "KNOWLEDGE_GRAPH_AI",
    name:        "Knowledge Graph AI",
    sprint:      "AGENTIK-KNOWLEDGE-AI-01",
    status:      "PLANNED" as const,
    description: "AI-powered relationship inference (requires explicit evidence)",
  },
];

export function getFutureGraphRoadmapSummary(): string {
  const planned = MEMORY_GRAPH_FUTURE_PLANS.filter(p => p.status === "PLANNED");
  return `${planned.length} planned capabilities for the Memory Graph. Current: IN_MEMORY provider. Next: ${planned[0]?.sprint ?? "TBD"}.`;
}
