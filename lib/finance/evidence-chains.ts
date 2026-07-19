/**
 * lib/finance/evidence-chains.ts
 *
 * FASE 5 — Evidence Chains
 *
 * Builds a traceable evidence chain for any financial node.
 * An evidence chain is the ordered sequence of real data sources
 * that substantiate a node's existence, health, and relationships.
 *
 * Used by Diego to produce causal, evidence-backed language.
 *
 * Sprint: AGENTIK-FINANCIAL-RELATIONSHIP-GRAPH-01
 */

import type { FinancialRelationshipGraph, FinancialNode, FinancialEdge } from "./relationship-graph";
import { traceUpstream, traceDownstream } from "./graph-traversal";

// ── Result types ───────────────────────────────────────────────────────────────

export interface EvidenceLink {
  /** Source Prisma model */
  sourceModel:  string;
  /** Human label for this piece of evidence */
  label:        string;
  /** Original node/record ID in Prisma */
  sourceId?:    string;
  /** Confidence 0-1 */
  confidence:   number;
  /** Why this evidence matters for the chain */
  role:         "origin" | "upstream_cause" | "downstream_effect" | "relationship_proof";
}

export interface EvidenceChain {
  nodeId:       string;
  node:         FinancialNode;
  links:        EvidenceLink[];
  /** Edge-based proof: which relationships anchor this node */
  edgeProofs:   Array<{ edge: FinancialEdge; direction: "upstream" | "downstream" }>;
  /** Aggregated confidence across all links (weighted average) */
  chainConfidence: number;
  /** Plain-language summary of the evidence */
  narrative:    string;
}

// ── Evidence link builders ─────────────────────────────────────────────────────

function nodeToLink(node: FinancialNode, role: EvidenceLink["role"]): EvidenceLink {
  return {
    sourceModel: node.sourceModel ?? "unknown",
    label:       node.label,
    sourceId:    (node.metadata?.sourceId as string | undefined),
    confidence:  node.confidence ?? 0.5,
    role,
  };
}

// ── Narrative generator ────────────────────────────────────────────────────────

function buildNarrative(
  node:      FinancialNode,
  upCount:   number,
  downCount: number,
  conf:      number,
): string {
  const confPct = Math.round(conf * 100);
  const confStr = confPct >= 80 ? "alta confianza" : confPct >= 50 ? "confianza media" : "baja confianza";

  if (upCount === 0 && downCount === 0) {
    return `${node.label} · sin relaciones trazadas · ${confStr} (${confPct}%)`;
  }

  const parts: string[] = [node.label];
  if (upCount > 0) parts.push(`${upCount} causa${upCount !== 1 ? "s" : ""} upstream`);
  if (downCount > 0) parts.push(`${downCount} efecto${downCount !== 1 ? "s" : ""} downstream`);
  parts.push(`${confStr} (${confPct}%)`);

  return parts.join(" · ");
}

// ── Main function ──────────────────────────────────────────────────────────────

export function buildEvidenceChain(
  graph:  FinancialRelationshipGraph,
  nodeId: string,
): EvidenceChain | null {
  const node = graph.nodes.get(nodeId);
  if (!node) return null;

  const links:      EvidenceLink[] = [];
  const edgeProofs: EvidenceChain["edgeProofs"] = [];

  // Origin link
  links.push(nodeToLink(node, "origin"));

  // Upstream nodes → upstream_cause
  const upPath = traceUpstream(graph, nodeId, 3); // max 3 hops for evidence
  for (const upId of upPath.nodeIds.slice(0, 5)) { // max 5 upstream links
    const upNode = graph.nodes.get(upId);
    if (upNode) links.push(nodeToLink(upNode, "upstream_cause"));
  }
  for (const edge of upPath.edges.slice(0, 5)) {
    edgeProofs.push({ edge, direction: "upstream" });
  }

  // Downstream nodes → downstream_effect
  const downPath = traceDownstream(graph, nodeId, 2); // max 2 hops
  for (const downId of downPath.nodeIds.slice(0, 5)) {
    const downNode = graph.nodes.get(downId);
    if (downNode) links.push(nodeToLink(downNode, "downstream_effect"));
  }
  for (const edge of downPath.edges.slice(0, 5)) {
    edgeProofs.push({ edge, direction: "downstream" });
  }

  // Edge relationship proof
  const directEdges = [
    ...(graph.outgoing.get(nodeId) ?? []),
    ...(graph.incoming.get(nodeId) ?? []),
  ];
  for (const edge of directEdges) {
    // Add a relationship_proof link for each direct edge endpoint
    const otherId = edge.from === nodeId ? edge.to : edge.from;
    const other   = graph.nodes.get(otherId);
    if (other) {
      links.push({
        sourceModel: other.sourceModel ?? "unknown",
        label:       `${edge.relationship} → ${other.label}`,
        sourceId:    (other.metadata?.sourceId as string | undefined),
        confidence:  edge.confidence,
        role:        "relationship_proof",
      });
    }
  }

  // Weighted average confidence
  const totalWeight  = links.reduce((s, l) => s + l.confidence, 0);
  const chainConfidence = links.length > 0 ? totalWeight / links.length : 0;

  return {
    nodeId,
    node,
    links,
    edgeProofs,
    chainConfidence,
    narrative: buildNarrative(node, upPath.nodeIds.length, downPath.nodeIds.length, chainConfidence),
  };
}

// ── Batch: build chains for a list of node IDs ────────────────────────────────

export function buildEvidenceChains(
  graph:   FinancialRelationshipGraph,
  nodeIds: string[],
): Map<string, EvidenceChain> {
  const result = new Map<string, EvidenceChain>();
  for (const id of nodeIds) {
    const chain = buildEvidenceChain(graph, id);
    if (chain) result.set(id, chain);
  }
  return result;
}
