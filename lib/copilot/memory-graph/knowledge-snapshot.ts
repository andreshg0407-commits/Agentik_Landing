/**
 * lib/copilot/memory-graph/knowledge-snapshot.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — Knowledge Snapshot
 *
 * Capture, restore, and compare graph state.
 * In-memory only. No DB. Serializable.
 */

import type { GraphNode, GraphEdge, GraphSnapshot, SnapshotDiff } from "./memory-graph-types";
import { listNodes, listEdges, clearRegistry, registerNode, registerEdge } from "./graph-registry";
import { generateSnapshotId } from "./graph-identity";

// ── Snapshot store (in-memory) ─────────────────────────────────────────────────

const _snapshots = new Map<string, GraphSnapshot>();

// ── Core snapshot operations ───────────────────────────────────────────────────

/**
 * createSnapshot — capture the current state of an org's graph.
 */
export function createSnapshot(orgSlug: string, label?: string): GraphSnapshot {
  const nodes = listNodes(orgSlug);
  const edges = listEdges(orgSlug);

  const snapshot: GraphSnapshot = {
    id:         generateSnapshotId(),
    orgSlug,
    nodes:      structuredClone(nodes),   // deep copy
    edges:      structuredClone(edges),
    nodeCount:  nodes.length,
    edgeCount:  edges.length,
    capturedAt: new Date().toISOString(),
    label,
  };

  _snapshots.set(snapshot.id, snapshot);
  return snapshot;
}

/**
 * getSnapshot — retrieve a previously captured snapshot.
 */
export function getSnapshot(snapshotId: string): GraphSnapshot | undefined {
  return _snapshots.get(snapshotId);
}

/**
 * listSnapshots — list all snapshots for an org.
 */
export function listSnapshots(orgSlug: string): GraphSnapshot[] {
  return Array.from(_snapshots.values())
    .filter(s => s.orgSlug === orgSlug)
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));   // newest first
}

/**
 * restoreSnapshot — restore graph to a previously captured state.
 * DESTRUCTIVE: clears all current nodes and edges for the org.
 */
export function restoreSnapshot(snapshotId: string): boolean {
  const snapshot = _snapshots.get(snapshotId);
  if (!snapshot) return false;

  try {
    clearRegistry(snapshot.orgSlug);
    // Restore nodes first (edges depend on them)
    for (const node of snapshot.nodes) registerNode(node);
    for (const edge of snapshot.edges) registerEdge(edge);
    return true;
  } catch {
    return false;
  }
}

/**
 * deleteSnapshot — remove a snapshot from the store.
 */
export function deleteSnapshot(snapshotId: string): void {
  _snapshots.delete(snapshotId);
}

// ── Diff comparison ────────────────────────────────────────────────────────────

/**
 * compareSnapshots — diff between two snapshots.
 * Returns what was added and removed.
 */
export function compareSnapshots(snapshotAId: string, snapshotBId: string): SnapshotDiff | null {
  const a = _snapshots.get(snapshotAId);
  const b = _snapshots.get(snapshotBId);
  if (!a || !b || a.orgSlug !== b.orgSlug) return null;

  const aNodeIds = new Set(a.nodes.map(n => n.id));
  const bNodeIds = new Set(b.nodes.map(n => n.id));
  const aEdgeIds = new Set(a.edges.map(e => e.id));
  const bEdgeIds = new Set(b.edges.map(e => e.id));

  const addedNodes   = b.nodes.filter(n => !aNodeIds.has(n.id));
  const removedNodes = a.nodes.filter(n => !bNodeIds.has(n.id));
  const addedEdges   = b.edges.filter(e => !aEdgeIds.has(e.id));
  const removedEdges = a.edges.filter(e => !bEdgeIds.has(e.id));

  const unchanged = a.nodes.filter(n => bNodeIds.has(n.id)).length;

  return { addedNodes, removedNodes, addedEdges, removedEdges, unchanged };
}

/**
 * snapshotDiff — compare current graph state against a snapshot.
 */
export function snapshotDiff(orgSlug: string, snapshotId: string): SnapshotDiff | null {
  const baseline = _snapshots.get(snapshotId);
  if (!baseline || baseline.orgSlug !== orgSlug) return null;

  const currentNodes = listNodes(orgSlug);
  const currentEdges = listEdges(orgSlug);

  const baseNodeIds = new Set(baseline.nodes.map(n => n.id));
  const baseEdgeIds = new Set(baseline.edges.map(e => e.id));
  const currNodeIds = new Set(currentNodes.map(n => n.id));
  const currEdgeIds = new Set(currentEdges.map(e => e.id));

  return {
    addedNodes:   currentNodes.filter(n => !baseNodeIds.has(n.id)),
    removedNodes: baseline.nodes.filter(n => !currNodeIds.has(n.id)),
    addedEdges:   currentEdges.filter(e => !baseEdgeIds.has(e.id)),
    removedEdges: baseline.edges.filter(e => !currEdgeIds.has(e.id)),
    unchanged:    currentNodes.filter(n => baseNodeIds.has(n.id)).length,
  };
}
