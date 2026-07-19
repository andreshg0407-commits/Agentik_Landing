/**
 * lib/copilot/memory-graph/integrations/memory-graph-playbooks.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — Playbook Integration Adapter
 *
 * Converts Playbook / PlaybookContext into GraphNode[].
 * No DB. No server-only. Pure transformation.
 */

import type { GraphNode, GraphEdge } from "../memory-graph-types";
import type { PlaybookContext, Playbook } from "@/lib/copilot/playbooks/playbook-types";
import { buildPlaybookNode } from "../node-builder";
import { buildLinkedToEdge } from "../edge-builder";

// ── Playbook → Node ────────────────────────────────────────────────────────────

/**
 * playbookToNode — convert a Playbook to a GraphNode.
 */
export function playbookToNode(orgSlug: string, playbook: Playbook): GraphNode {
  return buildPlaybookNode(orgSlug, {
    id:       playbook.id,
    title:    playbook.title,
    category: playbook.category,
    priority: playbook.priority,
    status:   playbook.status,
    tags:     playbook.tags ?? [],
  });
}

/**
 * playbooksToNodes — convert an array of Playbook to GraphNode[].
 */
export function playbooksToNodes(orgSlug: string, playbooks: Playbook[]): GraphNode[] {
  return playbooks.map(p => playbookToNode(orgSlug, p));
}

/**
 * playbookContextToNodes — convert a PlaybookContext to GraphNode[].
 */
export function playbookContextToNodes(ctx: PlaybookContext): GraphNode[] {
  return playbooksToNodes(ctx.orgSlug, ctx.playbooks);
}

// ── Playbook relationships ─────────────────────────────────────────────────────

/**
 * buildPlaybookLinkedEdges — link playbooks of the same category.
 * Uses LINKED_TO (weak association).
 */
export function buildPlaybookLinkedEdges(
  orgSlug: string,
  nodes:   GraphNode[],
): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const playbookNodes = nodes.filter(n => n.type === "PLAYBOOK" && n.orgSlug === orgSlug);

  // Group by category
  const byCategory = new Map<string, GraphNode[]>();
  for (const n of playbookNodes) {
    const cat = String(n.metadata.category ?? "UNKNOWN");
    const group = byCategory.get(cat) ?? [];
    group.push(n);
    byCategory.set(cat, group);
  }

  // Link within same category
  for (const [category, group] of byCategory) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        try {
          edges.push(buildLinkedToEdge(
            orgSlug, a.id, b.id,
            `Both playbooks belong to category ${category}`,
            "memory-graph-playbooks",
            0.4,
          ));
        } catch { /* skip */ }
      }
    }
  }

  return edges;
}

// ── Summary ────────────────────────────────────────────────────────────────────

export interface PlaybookIntegrationSummary {
  orgSlug:           string;
  playbookCount:     number;
  byCategory:        Record<string, number>;
  byPriority:        Record<string, number>;
}

export function summarizePlaybookIntegration(
  orgSlug: string,
  nodes:   GraphNode[],
): PlaybookIntegrationSummary {
  const byCategory: Record<string, number> = {};
  const byPriority: Record<string, number> = {};

  for (const n of nodes.filter(x => x.type === "PLAYBOOK")) {
    const cat = String(n.metadata.category ?? "UNKNOWN");
    const pri = String(n.metadata.priority ?? "UNKNOWN");
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    byPriority[pri] = (byPriority[pri] ?? 0) + 1;
  }

  return { orgSlug, playbookCount: nodes.filter(n => n.type === "PLAYBOOK").length, byCategory, byPriority };
}
