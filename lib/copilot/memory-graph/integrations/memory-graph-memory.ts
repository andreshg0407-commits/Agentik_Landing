/**
 * lib/copilot/memory-graph/integrations/memory-graph-memory.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — Memory Integration Adapter
 *
 * Converts MemoryEntry / MemoryContext into GraphNode[].
 * No DB. No server-only. Pure transformation.
 */

import type { GraphNode, GraphEdge } from "../memory-graph-types";
import type { MemoryContext, MemoryEntry } from "@/lib/copilot/memory/memory-types";
import { buildMemoryNode } from "../node-builder";
import { buildRelatedToEdge } from "../edge-builder";

// ── Memory → Node ──────────────────────────────────────────────────────────────

/**
 * memoryEntryToNode — convert a single MemoryEntry into a GraphNode.
 */
export function memoryEntryToNode(entry: MemoryEntry): GraphNode {
  return buildMemoryNode(entry.orgSlug, {
    id:         entry.id,
    title:      entry.title,
    type:       entry.type,
    importance: entry.importance,
    tags:       entry.tags,
    source:     entry.source,
    content:    entry.content,
  });
}

/**
 * memoriesToGraphNodes — convert an array of MemoryEntry to GraphNode[].
 */
export function memoriesToGraphNodes(entries: MemoryEntry[]): GraphNode[] {
  return entries.map(memoryEntryToNode);
}

/**
 * memoryContextToNodes — convert a MemoryContext to GraphNode[].
 */
export function memoryContextToNodes(ctx: MemoryContext): GraphNode[] {
  return ctx.entries.map(memoryEntryToNode);
}

// ── Memory relationships ───────────────────────────────────────────────────────

/**
 * buildMemoryRelatedEdges — create RELATED_TO edges between memory nodes
 * that share tags.
 * Never creates cross-tenant edges. Never invents relationships.
 */
export function buildMemoryRelatedEdges(
  orgSlug: string,
  nodes:   GraphNode[],
): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const memoryNodes = nodes.filter(n => n.type === "MEMORY" && n.orgSlug === orgSlug);

  for (let i = 0; i < memoryNodes.length; i++) {
    for (let j = i + 1; j < memoryNodes.length; j++) {
      const a = memoryNodes[i];
      const b = memoryNodes[j];
      if (a.id === b.id) continue;

      // Share at least one tag
      const sharedTags = a.tags.filter(t => b.tags.includes(t));
      if (sharedTags.length > 0) {
        try {
          const edge = buildRelatedToEdge(
            orgSlug, a.id, b.id,
            `Both memories share tags: ${sharedTags.join(", ")}`,
            "memory-graph-memory",
            0.4 + sharedTags.length * 0.1,
          );
          edges.push(edge);
        } catch { /* skip invalid edges */ }
      }
    }
  }

  return edges;
}

// ── Summary ────────────────────────────────────────────────────────────────────

export interface MemoryIntegrationSummary {
  orgSlug:       string;
  nodeCount:     number;
  edgeCount:     number;
  importanceBreakdown: Record<string, number>;
}

export function summarizeMemoryIntegration(
  orgSlug: string,
  nodes:   GraphNode[],
  edges:   GraphEdge[],
): MemoryIntegrationSummary {
  const breakdown: Record<string, number> = {};
  for (const n of nodes.filter(x => x.type === "MEMORY")) {
    const imp = String(n.metadata.importance ?? "UNKNOWN");
    breakdown[imp] = (breakdown[imp] ?? 0) + 1;
  }
  return { orgSlug, nodeCount: nodes.length, edgeCount: edges.length, importanceBreakdown: breakdown };
}
