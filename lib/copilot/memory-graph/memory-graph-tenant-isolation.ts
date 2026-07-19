/**
 * lib/copilot/memory-graph/memory-graph-tenant-isolation.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — Tenant Isolation Engine
 *
 * Validates that no cross-tenant edges or nodes exist.
 * CRITICAL-level enforcement. Fail-closed.
 */

import type { GraphNode, GraphEdge } from "./memory-graph-types";
import { listNodes, listEdges } from "./graph-registry";

// ── Isolation report ───────────────────────────────────────────────────────────

export type IsolationSeverity = "CLEAN" | "WARNING" | "CRITICAL";

export interface TenantIsolationViolation {
  type:      "CROSS_TENANT_NODE" | "CROSS_TENANT_EDGE" | "MIXED_ORG_EDGE";
  severity:  "CRITICAL";
  nodeId?:   string;
  edgeId?:   string;
  details:   string;
}

export interface TenantIsolationReport {
  orgSlug:    string;
  severity:   IsolationSeverity;
  violations: TenantIsolationViolation[];
  nodeCount:  number;
  edgeCount:  number;
  clean:      boolean;
  checkedAt:  string;
}

// ── Core isolation check ───────────────────────────────────────────────────────

/**
 * checkTenantIsolation — verify that all nodes and edges belong to the given org.
 * Any cross-tenant data is a CRITICAL violation.
 * Never throws.
 */
export function checkTenantIsolation(orgSlug: string): TenantIsolationReport {
  const violations: TenantIsolationViolation[] = [];

  try {
    const nodes = listNodes(orgSlug);
    const edges = listEdges(orgSlug);

    // Check all nodes belong to this org
    for (const node of nodes) {
      if (node.orgSlug !== orgSlug) {
        violations.push({
          type:    "CROSS_TENANT_NODE",
          severity: "CRITICAL",
          nodeId:  node.id,
          details: `Node ${node.id} belongs to org "${node.orgSlug}", not "${orgSlug}"`,
        });
      }
    }

    // Build node ID → org map for edge checking
    const nodeOrgMap = new Map<string, string>(nodes.map(n => [n.id, n.orgSlug]));

    // Check all edges belong to this org and connect same-org nodes
    for (const edge of edges) {
      if (edge.orgSlug !== orgSlug) {
        violations.push({
          type:    "CROSS_TENANT_EDGE",
          severity: "CRITICAL",
          edgeId:  edge.id,
          details: `Edge ${edge.id} belongs to org "${edge.orgSlug}", not "${orgSlug}"`,
        });
        continue;
      }

      const srcOrg = nodeOrgMap.get(edge.sourceNodeId);
      const tgtOrg = nodeOrgMap.get(edge.targetNodeId);

      if (srcOrg && srcOrg !== orgSlug) {
        violations.push({
          type:    "MIXED_ORG_EDGE",
          severity: "CRITICAL",
          edgeId:  edge.id,
          details: `Edge ${edge.id} source node "${edge.sourceNodeId}" belongs to org "${srcOrg}"`,
        });
      }

      if (tgtOrg && tgtOrg !== orgSlug) {
        violations.push({
          type:    "MIXED_ORG_EDGE",
          severity: "CRITICAL",
          edgeId:  edge.id,
          details: `Edge ${edge.id} target node "${edge.targetNodeId}" belongs to org "${tgtOrg}"`,
        });
      }
    }

    const severity: IsolationSeverity = violations.length === 0 ? "CLEAN" : "CRITICAL";

    return {
      orgSlug,
      severity,
      violations,
      nodeCount:  nodes.length,
      edgeCount:  edges.length,
      clean:      violations.length === 0,
      checkedAt:  new Date().toISOString(),
    };
  } catch {
    return {
      orgSlug,
      severity:   "CRITICAL",
      violations: [{
        type:    "CROSS_TENANT_EDGE",
        severity: "CRITICAL",
        details: "Isolation check failed — treating as CRITICAL",
      }],
      nodeCount:  0,
      edgeCount:  0,
      clean:      false,
      checkedAt:  new Date().toISOString(),
    };
  }
}

/**
 * assertTenantIsolation — throw if any cross-tenant violation is found.
 * Use at boundary entry points.
 */
export function assertTenantIsolation(orgSlug: string): void {
  const report = checkTenantIsolation(orgSlug);
  if (!report.clean) {
    throw new Error(
      `Tenant isolation violated for org "${orgSlug}": ${report.violations.length} violation(s)`,
    );
  }
}

/**
 * isCrossTenantNode — quick check if a node belongs to a different org.
 */
export function isCrossTenantNode(node: GraphNode, expectedOrgSlug: string): boolean {
  return node.orgSlug !== expectedOrgSlug;
}

/**
 * isCrossTenantEdge — quick check if an edge or its nodes cross tenant boundaries.
 */
export function isCrossTenantEdge(edge: GraphEdge, expectedOrgSlug: string): boolean {
  return edge.orgSlug !== expectedOrgSlug;
}

/**
 * filterToOrg — remove any nodes/edges that don't belong to this org.
 * Safe cleanup utility.
 */
export function filterToOrg(
  orgSlug: string,
  nodes:   GraphNode[],
  edges:   GraphEdge[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const validNodes = nodes.filter(n => n.orgSlug === orgSlug);
  const validIds   = new Set(validNodes.map(n => n.id));
  const validEdges = edges.filter(
    e => e.orgSlug === orgSlug && validIds.has(e.sourceNodeId) && validIds.has(e.targetNodeId),
  );
  return { nodes: validNodes, edges: validEdges };
}
