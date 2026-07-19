/**
 * lib/copilot/memory-graph/integrations/memory-graph-compliance.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — Compliance Integration Adapter
 *
 * Audit and trace graph relationships.
 * Validate that all edges have provenance and reasoning.
 * No DB. No server-only.
 */

import type { GraphNode, GraphEdge } from "../memory-graph-types";
import { listNodes, listEdges } from "../graph-registry";

// ── Compliance types ───────────────────────────────────────────────────────────

export interface GraphRelationshipTrace {
  edgeId:       string;
  orgSlug:      string;
  edgeType:     string;
  sourceNodeId: string;
  targetNodeId: string;
  source:       string;         // provenance
  reasoning:    string | undefined;
  weight:       number;
  createdAt:    string;
}

export interface GraphComplianceReport {
  orgSlug:           string;
  totalEdges:        number;
  traced:            number;       // edges with full provenance
  untraced:          number;       // edges missing reasoning or source
  violations:        string[];     // edge IDs missing required fields
  compliant:         boolean;
  checkedAt:         string;
}

// ── Compliance functions ───────────────────────────────────────────────────────

/**
 * buildGraphRelationshipTrace — generate a compliance trace for all edges.
 * Every edge must have source and reasoning for full traceability.
 */
export function buildGraphRelationshipTrace(orgSlug: string): GraphRelationshipTrace[] {
  return listEdges(orgSlug).map(edge => ({
    edgeId:       edge.id,
    orgSlug:      edge.orgSlug,
    edgeType:     edge.type,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    source:       edge.source,
    reasoning:    edge.reasoning,
    weight:       edge.weight,
    createdAt:    edge.createdAt,
  }));
}

/**
 * validateGraphCompliance — verify all edges have required provenance fields.
 */
export function validateGraphCompliance(orgSlug: string): GraphComplianceReport {
  const edges      = listEdges(orgSlug);
  const violations: string[] = [];

  for (const edge of edges) {
    if (!edge.source) violations.push(edge.id);
    else if (!edge.reasoning) violations.push(edge.id);
  }

  const traced   = edges.length - violations.length;
  const untraced = violations.length;

  return {
    orgSlug,
    totalEdges: edges.length,
    traced,
    untraced,
    violations,
    compliant:  violations.length === 0,
    checkedAt:  new Date().toISOString(),
  };
}

/**
 * getUntracedEdges — return edges missing provenance.
 */
export function getUntracedEdges(orgSlug: string): GraphEdge[] {
  return listEdges(orgSlug).filter(e => !e.source || !e.reasoning);
}

/**
 * getUntracedNodes — return nodes missing provenance.
 */
export function getUntracedNodes(orgSlug: string): GraphNode[] {
  return listNodes(orgSlug).filter(n => !n.source);
}
