/**
 * lib/copilot/memory-graph/memory-graph-health.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — Health Monitor
 *
 * Server-only. Validates all subsystems are operational.
 * Never throws. Returns structured health report.
 */

import "server-only";

import { GRAPH_NODE_TYPES, GRAPH_EDGE_TYPES } from "./memory-graph-types";
import { RELATIONSHIP_PATTERNS } from "./relationship-resolver";

// ── Health types ───────────────────────────────────────────────────────────────

export type GraphHealthStatus = "HEALTHY" | "DEGRADED" | "UNAVAILABLE";

export interface GraphSubsystemHealth {
  name:     string;
  status:   GraphHealthStatus;
  message:  string;
  checkMs:  number;
}

export interface GraphHealthReport {
  overall:    GraphHealthStatus;
  subsystems: GraphSubsystemHealth[];
  checkedAt:  string;
  durationMs: number;
}

// ── Health evaluation ──────────────────────────────────────────────────────────

export function evaluateGraphHealth(): GraphHealthReport {
  const startedAt  = Date.now();
  const subsystems: GraphSubsystemHealth[] = [];

  // 1: Node types loaded
  subsystems.push(_check("node_types", () => {
    if (GRAPH_NODE_TYPES.length < 10) throw new Error(`Only ${GRAPH_NODE_TYPES.length} node types`);
    return `${GRAPH_NODE_TYPES.length} node types registered`;
  }));

  // 2: Edge types loaded
  subsystems.push(_check("edge_types", () => {
    if (GRAPH_EDGE_TYPES.length < 8) throw new Error(`Only ${GRAPH_EDGE_TYPES.length} edge types`);
    return `${GRAPH_EDGE_TYPES.length} edge types registered`;
  }));

  // 3: Relationship patterns loaded
  subsystems.push(_check("relationship_patterns", () => {
    if (RELATIONSHIP_PATTERNS.length < 10) throw new Error("Insufficient relationship patterns");
    return `${RELATIONSHIP_PATTERNS.length} relationship patterns defined`;
  }));

  // 4: Registry accessible
  subsystems.push(_check("registry", () => {
    const { listNodes } = require("./graph-registry");
    if (typeof listNodes !== "function") throw new Error("Registry not accessible");
    return "Graph registry accessible";
  }));

  // 5: Engine accessible
  subsystems.push(_check("engine", () => {
    const { createNode, createEdge } = require("./graph-engine");
    if (typeof createNode !== "function" || typeof createEdge !== "function") {
      throw new Error("Graph engine functions not accessible");
    }
    return "Graph engine accessible";
  }));

  // 6: Traversal engine accessible
  subsystems.push(_check("traversal", () => {
    const { findPath, bfsTraversal } = require("./traversal-engine");
    if (typeof findPath !== "function") throw new Error("Traversal engine not accessible");
    return "Traversal engine accessible";
  }));

  // 7: Query engine accessible
  subsystems.push(_check("query", () => {
    const { findNode, searchGraph } = require("./query-engine");
    if (typeof findNode !== "function") throw new Error("Query engine not accessible");
    return "Query engine accessible";
  }));

  // 8: Integrity engine accessible
  subsystems.push(_check("integrity", () => {
    const { runIntegrityCheck } = require("./graph-integrity");
    if (typeof runIntegrityCheck !== "function") throw new Error("Integrity engine not accessible");
    return "Integrity engine accessible";
  }));

  // 9: Memory integration accessible
  subsystems.push(_check("memory_integration", () => {
    const { memoriesToGraphNodes } = require("./integrations/memory-graph-memory");
    if (typeof memoriesToGraphNodes !== "function") throw new Error("Memory integration not accessible");
    return "Memory integration accessible";
  }));

  // 10: Tenant isolation accessible
  subsystems.push(_check("tenant_isolation", () => {
    const { checkTenantIsolation } = require("./memory-graph-tenant-isolation");
    if (typeof checkTenantIsolation !== "function") throw new Error("Tenant isolation not accessible");
    return "Tenant isolation engine accessible";
  }));

  const anyUnavailable = subsystems.some(s => s.status === "UNAVAILABLE");
  const anyDegraded    = subsystems.some(s => s.status === "DEGRADED");

  return {
    overall:    anyUnavailable ? "UNAVAILABLE" : anyDegraded ? "DEGRADED" : "HEALTHY",
    subsystems,
    checkedAt:  new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  };
}

function _check(name: string, fn: () => string): GraphSubsystemHealth {
  const t0 = Date.now();
  try {
    const message = fn();
    return { name, status: "HEALTHY", message, checkMs: Date.now() - t0 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { name, status: "DEGRADED", message: msg, checkMs: Date.now() - t0 };
  }
}
