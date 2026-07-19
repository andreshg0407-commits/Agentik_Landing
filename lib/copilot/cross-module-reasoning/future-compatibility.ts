/**
 * lib/copilot/cross-module-reasoning/future-compatibility.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Future Compatibility — Planned capabilities.
 */

export interface CrossModuleFuturePlan {
  id:          string;
  name:        string;
  description: string;
  status:      "PLANNED";
  targetSprint: string;
}

export const CROSS_MODULE_FUTURE_PLANS: CrossModuleFuturePlan[] = [
  {
    id:           "CMR-FUTURE-01",
    name:         "Causal Reasoning Engine",
    description:  "Full temporal causal inference from graph traversal and signal history.",
    status:       "PLANNED",
    targetSprint: "AGENTIK-MEMORY-GRAPH-CAUSALITY-01",
  },
  {
    id:           "CMR-FUTURE-02",
    name:         "Agent Planning Integration",
    description:  "Cross-module reasoning output feeds agent planning for autonomous execution proposals.",
    status:       "PLANNED",
    targetSprint: "AGENTIK-AGENT-PLANNING-02",
  },
  {
    id:           "CMR-FUTURE-03",
    name:         "Autonomous Workflow Triggers",
    description:  "High-confidence reasoning results trigger autonomous workflow proposals for approval.",
    status:       "PLANNED",
    targetSprint: "AGENTIK-AUTONOMOUS-WORKFLOWS-01",
  },
  {
    id:           "CMR-FUTURE-04",
    name:         "Multi-Agent Reasoning",
    description:  "Multiple specialized agents collaborating on cross-module reasoning tasks.",
    status:       "PLANNED",
    targetSprint: "AGENTIK-MULTI-AGENT-01",
  },
  {
    id:           "CMR-FUTURE-05",
    name:         "Graph Embeddings for Reasoning",
    description:  "Vector embeddings of memory graph nodes to improve reasoning accuracy.",
    status:       "PLANNED",
    targetSprint: "AGENTIK-GRAPH-EMBEDDINGS-01",
  },
  {
    id:           "CMR-FUTURE-06",
    name:         "Knowledge Reasoning Layer",
    description:  "Structured knowledge base integration for domain-specific reasoning rules.",
    status:       "PLANNED",
    targetSprint: "AGENTIK-KNOWLEDGE-REASONING-01",
  },
];

export function getFutureReasoningRoadmapSummary(): string {
  const names = CROSS_MODULE_FUTURE_PLANS.map(p => p.name);
  return `Cross-module reasoning roadmap: ${names.join(", ")}. All ${CROSS_MODULE_FUTURE_PLANS.length} plans are PLANNED.`;
}

// ── External reasoning provider contracts (future) ───────────────────────────

export interface ExternalReasoningProvider {
  id:       string;
  name:     string;
  endpoint?: string;
  status:   "PLANNED";
}

export interface ReasoningEmbeddingConfig {
  provider: "PLANNED";
  model:    string;
  status:   "PLANNED";
}
