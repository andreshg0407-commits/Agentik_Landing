/**
 * lib/copilot/memory-graph/causality-preparation.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — Causality Preparation
 *
 * Contract definitions for future causal inference.
 * Does NOT implement causality — only defines the contracts and data structures.
 * Future sprint: AGENTIK-MEMORY-GRAPH-CAUSALITY-01
 */

import type { GraphNode, GraphEdge } from "./memory-graph-types";

// ── Causality contracts ────────────────────────────────────────────────────────

export type CausalStrength = "DEFINITE" | "PROBABLE" | "POSSIBLE" | "SPECULATIVE";

export interface CausalLink {
  causeNodeId:  string;
  effectNodeId: string;
  strength:     CausalStrength;
  evidence:     string[];       // edge IDs supporting this causal claim
  reasoning:    string;
  confidence:   number;         // 0–1
  orgSlug:      string;
}

export interface CausalChain {
  orgSlug:  string;
  links:    CausalLink[];
  depth:    number;
  startId:  string;
  endId:    string;
}

export interface CausalModel {
  orgSlug:         string;
  chains:          CausalChain[];
  totalLinks:      number;
  avgConfidence:   number;
  buildAt:         string;
  /** Always PREPARED — not ACTIVE until CAUSALITY-01 sprint. */
  status:          "PREPARED";
}

// ── Causal candidate detection ─────────────────────────────────────────────────

/**
 * identifyCausalCandidates — find edges that MIGHT represent causal relationships.
 * Returns candidate edge IDs only — no causal inference performed.
 * Actual inference deferred to AGENTIK-MEMORY-GRAPH-CAUSALITY-01.
 */
export function identifyCausalCandidates(edges: GraphEdge[]): string[] {
  return edges
    .filter(e => e.type === "CAUSED" || e.type === "TRIGGERS" || e.type === "AFFECTS")
    .map(e => e.id);
}

/**
 * buildEmptyCausalModel — placeholder model until causal engine is built.
 */
export function buildEmptyCausalModel(orgSlug: string): CausalModel {
  return {
    orgSlug,
    chains:        [],
    totalLinks:    0,
    avgConfidence: 0,
    buildAt:       new Date().toISOString(),
    status:        "PREPARED",
  };
}

/**
 * prepareCausalLink — create a typed causal link structure (no inference).
 * Used to explicitly record KNOWN causal relationships.
 */
export function prepareCausalLink(
  orgSlug:      string,
  causeNodeId:  string,
  effectNodeId: string,
  strength:     CausalStrength,
  reasoning:    string,
  evidence:     string[] = [],
  confidence:   number = 0.5,
): CausalLink {
  return { orgSlug, causeNodeId, effectNodeId, strength, reasoning, evidence, confidence };
}

// ── Future compatibility ───────────────────────────────────────────────────────

export const CAUSALITY_ROADMAP = {
  currentSprint:  "AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01",
  nextSprint:     "AGENTIK-MEMORY-GRAPH-CAUSALITY-01",
  capabilities:   [
    "Automated causal chain inference from CAUSED/TRIGGERS edges",
    "Counterfactual reasoning (what-if analysis)",
    "Root cause propagation analysis",
    "Causal confidence scoring with evidence backing",
  ],
  status: "PLANNED" as const,
};

export function getCausalityRoadmapSummary(): string {
  return `Causality engine planned for ${CAUSALITY_ROADMAP.nextSprint}. ${CAUSALITY_ROADMAP.capabilities.length} capabilities queued.`;
}
