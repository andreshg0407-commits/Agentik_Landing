// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Integration: Strategic Memory ↔ Memory Graph

import type { StrategicMemoryEntry, StrategicMemoryRelation } from "../strategic-memory-types";

// Minimal graph interfaces to avoid circular deps
export interface MemoryGraphNode {
  readonly id: string;
  readonly orgSlug: string;
  readonly label: string;
  readonly type?: string;
  readonly weight?: number;
  readonly metadata?: Record<string, unknown>;
}

export interface MemoryGraphEdge {
  readonly id: string;
  readonly orgSlug: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly label?: string;
  readonly weight?: number;
}

// ── Adapters ──────────────────────────────────────────────────────────────────

export function strategicEntryToGraphNode(entry: StrategicMemoryEntry): MemoryGraphNode {
  return {
    id: entry.id,
    orgSlug: entry.orgSlug,
    label: `[${entry.type}] ${entry.title}`,
    type: "STRATEGIC_MEMORY",
    weight: entry.strategicScore,
    metadata: {
      priority: entry.priority,
      status: entry.status,
      domain: entry.domain,
      strategicScore: entry.strategicScore,
    },
  };
}

export function strategicRelationToGraphEdge(relation: StrategicMemoryRelation): MemoryGraphEdge {
  return {
    id: relation.id,
    orgSlug: relation.orgSlug,
    sourceId: relation.sourceId,
    targetId: relation.targetId,
    label: relation.type,
    weight: relation.strength,
  };
}

export function graphNodeToStrategicHint(
  node: MemoryGraphNode,
  orgSlug: string
): { id: string; label: string; weight: number } | null {
  if (node.orgSlug !== orgSlug) return null;
  if (node.type !== "STRATEGIC_MEMORY") return null;
  return {
    id: node.id,
    label: node.label,
    weight: node.weight ?? 0.5,
  };
}

export function buildGraphFromStrategicMemory(
  entries: StrategicMemoryEntry[],
  relations: StrategicMemoryRelation[],
  orgSlug: string
): { nodes: MemoryGraphNode[]; edges: MemoryGraphEdge[] } {
  const nodes = entries
    .filter((e) => e.orgSlug === orgSlug && e.status === "ACTIVE")
    .map(strategicEntryToGraphNode);

  const edges = relations
    .filter((r) => r.orgSlug === orgSlug)
    .map(strategicRelationToGraphEdge);

  return { nodes, edges };
}

export function findHighWeightStrategicNodes(
  nodes: MemoryGraphNode[],
  orgSlug: string,
  threshold = 0.7
): MemoryGraphNode[] {
  return nodes.filter(
    (n) => n.orgSlug === orgSlug && n.type === "STRATEGIC_MEMORY" && (n.weight ?? 0) >= threshold
  );
}
