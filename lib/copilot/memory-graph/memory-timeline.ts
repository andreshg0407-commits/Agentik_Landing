/**
 * lib/copilot/memory-graph/memory-timeline.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — Memory Timeline
 *
 * Reconstruct temporal sequences from graph nodes.
 * Sequence: Event → Decision → Action → Result
 * No AI. Deterministic. No DB.
 */

import type { GraphNode, MemoryTimeline, TimelineEntry } from "./memory-graph-types";
import { listNodes } from "./graph-registry";
import { bfsTraversal } from "./traversal-engine";
import { generateQueryId } from "./graph-identity";

// ── Timeline builders ──────────────────────────────────────────────────────────

/**
 * buildTimeline — construct a chronological timeline from all nodes in an org.
 * Nodes are sorted by their createdAt timestamp.
 */
export function buildTimeline(
  orgSlug: string,
  startAt?: string,
  endAt?:   string,
): MemoryTimeline {
  try {
    let nodes = listNodes(orgSlug);

    // Filter by time range if provided
    if (startAt) nodes = nodes.filter(n => n.createdAt >= startAt);
    if (endAt)   nodes = nodes.filter(n => n.createdAt <= endAt);

    // Sort chronologically
    nodes.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const entries: TimelineEntry[] = nodes.map(n => ({
      nodeId:    n.id,
      node:      n,
      timestamp: n.createdAt,
      eventType: n.type,
    }));

    return {
      orgSlug,
      entries,
      startAt,
      endAt,
      createdAt: new Date().toISOString(),
    };
  } catch {
    return { orgSlug, entries: [], startAt, endAt, createdAt: new Date().toISOString() };
  }
}

/**
 * buildNodeTimeline — timeline centered on a single node and its neighborhood.
 */
export function buildNodeTimeline(orgSlug: string, nodeId: string, maxDepth = 2): MemoryTimeline {
  try {
    const traversal = bfsTraversal(orgSlug, nodeId, maxDepth);
    const nodes = traversal.path.nodes.sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt),
    );

    const entries: TimelineEntry[] = nodes.map(n => ({
      nodeId:    n.id,
      node:      n,
      timestamp: n.createdAt,
      eventType: n.type,
    }));

    return { orgSlug, entries, createdAt: new Date().toISOString() };
  } catch {
    return { orgSlug, entries: [], createdAt: new Date().toISOString() };
  }
}

/**
 * buildEventTimeline — only EVENT and DECISION nodes in chronological order.
 */
export function buildEventTimeline(orgSlug: string): MemoryTimeline {
  try {
    const nodes = listNodes(orgSlug)
      .filter(n => n.type === "EVENT" || n.type === "DECISION" || n.type === "ALERT")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const entries: TimelineEntry[] = nodes.map(n => ({
      nodeId:    n.id,
      node:      n,
      timestamp: n.createdAt,
      eventType: n.type,
    }));

    return { orgSlug, entries, createdAt: new Date().toISOString() };
  } catch {
    return { orgSlug, entries: [], createdAt: new Date().toISOString() };
  }
}

// ── Timeline analysis ──────────────────────────────────────────────────────────

export interface TimelineStats {
  orgSlug:      string;
  totalEntries: number;
  earliest?:    string;
  latest?:      string;
  typeBreakdown: Record<string, number>;
}

/**
 * analyzeTimeline — compute statistics about a timeline.
 */
export function analyzeTimeline(timeline: MemoryTimeline): TimelineStats {
  const typeBreakdown: Record<string, number> = {};

  for (const entry of timeline.entries) {
    typeBreakdown[entry.eventType] = (typeBreakdown[entry.eventType] ?? 0) + 1;
  }

  return {
    orgSlug:       timeline.orgSlug,
    totalEntries:  timeline.entries.length,
    earliest:      timeline.entries[0]?.timestamp,
    latest:        timeline.entries[timeline.entries.length - 1]?.timestamp,
    typeBreakdown,
  };
}

/**
 * filterTimelineByType — keep only entries of specific node types.
 */
export function filterTimelineByType(
  timeline: MemoryTimeline,
  types:    string[],
): MemoryTimeline {
  return {
    ...timeline,
    entries: timeline.entries.filter(e => types.includes(e.eventType)),
  };
}

/**
 * sliceTimeline — get a window of a timeline by entry index.
 */
export function sliceTimeline(timeline: MemoryTimeline, from: number, to: number): MemoryTimeline {
  return {
    ...timeline,
    entries: timeline.entries.slice(from, to),
  };
}
