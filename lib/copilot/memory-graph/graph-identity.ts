/**
 * lib/copilot/memory-graph/graph-identity.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — ID Generation + Validation
 *
 * Stable, deterministic ID generation.
 * No external deps. No server-only.
 */

// ── Prefixes ───────────────────────────────────────────────────────────────────

const NODE_PREFIX = "mgn";
const EDGE_PREFIX = "mge";

// ── ID generation ──────────────────────────────────────────────────────────────

/**
 * generateNodeId — create a unique, stable node ID.
 * Format: mgn_<timestamp>_<random>
 */
export function generateNodeId(): string {
  const ts  = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${NODE_PREFIX}_${ts}_${rnd}`;
}

/**
 * generateEdgeId — create a unique, stable edge ID.
 * Format: mge_<timestamp>_<random>
 */
export function generateEdgeId(): string {
  const ts  = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${EDGE_PREFIX}_${ts}_${rnd}`;
}

/**
 * generateSnapshotId — create a unique snapshot ID.
 */
export function generateSnapshotId(): string {
  const ts  = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 8);
  return `mgs_${ts}_${rnd}`;
}

/**
 * generateQueryId — create a unique query ID.
 */
export function generateQueryId(): string {
  const ts  = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 8);
  return `mgq_${ts}_${rnd}`;
}

// ── Validation ─────────────────────────────────────────────────────────────────

/** validateNodeId — true if this looks like a memory graph node ID. */
export function validateNodeId(id: string): boolean {
  if (!id || typeof id !== "string") return false;
  return id.startsWith(NODE_PREFIX + "_") && id.length >= 12;
}

/** validateEdgeId — true if this looks like a memory graph edge ID. */
export function validateEdgeId(id: string): boolean {
  if (!id || typeof id !== "string") return false;
  return id.startsWith(EDGE_PREFIX + "_") && id.length >= 12;
}

/**
 * isGraphId — true if the string looks like any memory-graph ID.
 * Useful for quick type-guard checks.
 */
export function isGraphId(id: string): boolean {
  if (!id || typeof id !== "string") return false;
  return (
    id.startsWith(NODE_PREFIX + "_") ||
    id.startsWith(EDGE_PREFIX + "_") ||
    id.startsWith("mgs_") ||
    id.startsWith("mgq_")
  );
}
