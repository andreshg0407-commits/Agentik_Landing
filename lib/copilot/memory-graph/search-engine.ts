/**
 * lib/copilot/memory-graph/search-engine.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — Search Engine
 *
 * Metadata-based search over graph nodes. No embeddings. No AI.
 * Deterministic scoring using label, tags, and type matching.
 */

import type { GraphNode, GraphSearchQuery, GraphSearchResult } from "./memory-graph-types";
import { listNodes } from "./graph-registry";

// ── Search result ──────────────────────────────────────────────────────────────

export interface RankedMatch {
  node:    GraphNode;
  score:   number;     // 0–1 relevance score
  reasons: string[];   // why this node matched
}

// ── Core search ────────────────────────────────────────────────────────────────

/**
 * searchNodes — keyword search against node labels, tags, and metadata.
 * Returns ranked matches, most relevant first.
 * Never throws.
 */
export function searchNodes(query: GraphSearchQuery): GraphSearchResult {
  try {
    const term  = query.term.toLowerCase().trim();
    if (!term) {
      return { orgSlug: query.orgSlug, term: query.term, matches: [], total: 0 };
    }

    let candidates = listNodes(query.orgSlug);
    if (query.nodeType) candidates = candidates.filter(n => n.type === query.nodeType);

    const ranked: RankedMatch[] = [];

    for (const node of candidates) {
      const result = _scoreNode(node, term);
      if (result.score > 0) ranked.push(result);
    }

    ranked.sort((a, b) => b.score - a.score);

    const limit   = query.limit ?? 20;
    const matches = ranked.slice(0, limit).map(r => r.node);

    return {
      orgSlug:  query.orgSlug,
      term:     query.term,
      matches,
      total:    ranked.length,
    };
  } catch {
    return { orgSlug: query.orgSlug, term: query.term, matches: [], total: 0 };
  }
}

/**
 * searchNodesTerm — simplified search returning just nodes.
 */
export function searchNodesTerm(orgSlug: string, term: string, limit = 20): GraphNode[] {
  return searchNodes({ orgSlug, term, limit }).matches;
}

/**
 * getRankedMatches — full ranked search including scores and reasons.
 */
export function getRankedMatches(orgSlug: string, term: string, limit = 20): RankedMatch[] {
  try {
    const lower      = term.toLowerCase().trim();
    if (!lower) return [];

    const candidates = listNodes(orgSlug);
    const ranked: RankedMatch[] = [];

    for (const node of candidates) {
      const result = _scoreNode(node, lower);
      if (result.score > 0) ranked.push(result);
    }

    return ranked.sort((a, b) => b.score - a.score).slice(0, limit);
  } catch {
    return [];
  }
}

// ── Specialized searches ───────────────────────────────────────────────────────

/**
 * findByLabel — exact or partial label match.
 */
export function findByLabel(orgSlug: string, label: string): GraphNode[] {
  const lower = label.toLowerCase();
  return listNodes(orgSlug).filter(n => n.label.toLowerCase().includes(lower));
}

/**
 * findByMetadataKey — nodes that have a specific metadata key.
 */
export function findByMetadataKey(orgSlug: string, key: string): GraphNode[] {
  return listNodes(orgSlug).filter(n => key in n.metadata);
}

/**
 * findByMetadataValue — nodes where metadata[key] === value.
 */
export function findByMetadataValue(orgSlug: string, key: string, value: unknown): GraphNode[] {
  return listNodes(orgSlug).filter(n => n.metadata[key] === value);
}

// ── Internal scoring ───────────────────────────────────────────────────────────

function _scoreNode(node: GraphNode, term: string): RankedMatch {
  let score = 0;
  const reasons: string[] = [];

  // Label — highest signal
  const label = node.label.toLowerCase();
  if (label === term) {
    score += 1.0;
    reasons.push("exact label match");
  } else if (label.startsWith(term)) {
    score += 0.8;
    reasons.push("label prefix match");
  } else if (label.includes(term)) {
    score += 0.6;
    reasons.push("label contains term");
  }

  // Tags
  for (const tag of node.tags) {
    if (tag.toLowerCase() === term) {
      score += 0.5;
      reasons.push(`exact tag match: ${tag}`);
    } else if (tag.toLowerCase().includes(term)) {
      score += 0.3;
      reasons.push(`tag contains term: ${tag}`);
    }
  }

  // Metadata values (string matching)
  for (const [key, val] of Object.entries(node.metadata)) {
    if (typeof val === "string" && val.toLowerCase().includes(term)) {
      score += 0.2;
      reasons.push(`metadata.${key} matches`);
    }
  }

  // Node type in term
  if (term.includes(node.type.toLowerCase())) {
    score += 0.15;
    reasons.push("node type matches term");
  }

  // Boost by node weight
  score = Math.min(score * (0.8 + node.weight * 0.2), 1);

  return { node, score, reasons };
}
