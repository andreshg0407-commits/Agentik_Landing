/**
 * lib/copilot/memory-graph/memory-graph-readiness.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — Readiness Scanner
 *
 * Server-only. Scores graph readiness 0–100.
 * Checks: node types, edge types, patterns, integrations, tenant isolation.
 */

import "server-only";

import { GRAPH_NODE_TYPES, GRAPH_EDGE_TYPES } from "./memory-graph-types";
import { RELATIONSHIP_PATTERNS } from "./relationship-resolver";

// ── Readiness types ────────────────────────────────────────────────────────────

export type ReadinessStatus = "READY" | "PARTIAL" | "NOT_READY";

export interface GraphSubsystemCheck {
  name:     string;
  status:   ReadinessStatus;
  score:    number;        // 0–100
  message:  string;
}

export interface GraphReadinessReport {
  overallScore:  number;               // 0–100
  status:        ReadinessStatus;
  subsystems:    GraphSubsystemCheck[];
  scannedAt:     string;
}

// ── Readiness scan ─────────────────────────────────────────────────────────────

export function scanGraphReadiness(): GraphReadinessReport {
  const subsystems: GraphSubsystemCheck[] = [];

  // 1: Node types
  subsystems.push(_readinessCheck("node_types", () => {
    const count = GRAPH_NODE_TYPES.length;
    if (count >= 16) return { score: 100, message: `${count}/16 node types defined` };
    return { score: Math.floor((count / 16) * 100), message: `${count}/16 node types defined` };
  }));

  // 2: Edge types
  subsystems.push(_readinessCheck("edge_types", () => {
    const count = GRAPH_EDGE_TYPES.length;
    if (count >= 12) return { score: 100, message: `${count}/12 edge types defined` };
    return { score: Math.floor((count / 12) * 100), message: `${count}/12 edge types defined` };
  }));

  // 3: Relationship patterns
  subsystems.push(_readinessCheck("relationship_patterns", () => {
    const count = RELATIONSHIP_PATTERNS.length;
    if (count >= 20) return { score: 100, message: `${count} relationship patterns` };
    return { score: Math.floor((count / 20) * 100), message: `${count}/20 patterns` };
  }));

  // 4: Core engine
  subsystems.push(_readinessCheck("core_engine", () => {
    const { createNode } = require("./graph-engine");
    if (typeof createNode === "function") return { score: 100, message: "Core engine ready" };
    return { score: 0, message: "Core engine not found" };
  }));

  // 5: Traversal
  subsystems.push(_readinessCheck("traversal", () => {
    const { findPath } = require("./traversal-engine");
    if (typeof findPath === "function") return { score: 100, message: "Traversal engine ready" };
    return { score: 0, message: "Traversal engine not found" };
  }));

  // 6: Query engine
  subsystems.push(_readinessCheck("query_engine", () => {
    const { searchGraph } = require("./query-engine");
    if (typeof searchGraph === "function") return { score: 100, message: "Query engine ready" };
    return { score: 0, message: "Query engine not found" };
  }));

  // 7: Search engine
  subsystems.push(_readinessCheck("search_engine", () => {
    const { searchNodes } = require("./search-engine");
    if (typeof searchNodes === "function") return { score: 100, message: "Search engine ready" };
    return { score: 0, message: "Search engine not found" };
  }));

  // 8: Context expansion
  subsystems.push(_readinessCheck("context_expansion", () => {
    const { expandContext } = require("./context-expansion");
    if (typeof expandContext === "function") return { score: 100, message: "Context expansion ready" };
    return { score: 0, message: "Context expansion not found" };
  }));

  // 9: Integrity engine
  subsystems.push(_readinessCheck("integrity", () => {
    const { runIntegrityCheck } = require("./graph-integrity");
    if (typeof runIntegrityCheck === "function") return { score: 100, message: "Integrity engine ready" };
    return { score: 0, message: "Integrity engine not found" };
  }));

  // 10: Tenant isolation
  subsystems.push(_readinessCheck("tenant_isolation", () => {
    const { checkTenantIsolation } = require("./memory-graph-tenant-isolation");
    if (typeof checkTenantIsolation === "function") return { score: 100, message: "Tenant isolation ready" };
    return { score: 0, message: "Tenant isolation not found" };
  }));

  const totalScore   = subsystems.reduce((s, c) => s + c.score, 0);
  const overallScore = Math.floor(totalScore / subsystems.length);
  const status: ReadinessStatus =
    overallScore >= 90 ? "READY" :
    overallScore >= 60 ? "PARTIAL" :
    "NOT_READY";

  return {
    overallScore,
    status,
    subsystems,
    scannedAt: new Date().toISOString(),
  };
}

function _readinessCheck(
  name: string,
  fn: () => { score: number; message: string },
): GraphSubsystemCheck {
  try {
    const { score, message } = fn();
    const status: ReadinessStatus = score >= 90 ? "READY" : score >= 50 ? "PARTIAL" : "NOT_READY";
    return { name, status, score, message };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { name, status: "NOT_READY", score: 0, message: msg };
  }
}
