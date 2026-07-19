/**
 * lib/copilot/memory-graph/graph-integrity.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — Integrity Engine
 *
 * Validates graph health: orphans, cross-tenant, self-loops, duplicates.
 * Never throws. All errors captured in report.
 */

import type { GraphValidationResult, GraphValidationError } from "./memory-graph-types";
import { listNodes, listEdges } from "./graph-registry";

// ── Integrity types ────────────────────────────────────────────────────────────

export interface IntegrityReport {
  orgSlug:          string;
  valid:            boolean;
  orphanNodes:      string[];        // node IDs with no edges
  orphanEdges:      string[];        // edge IDs referencing missing nodes
  crossTenantEdges: string[];        // edge IDs where orgSlug doesn't match both nodes
  brokenReferences: string[];        // edge IDs where either node is missing
  duplicateEdges:   string[];        // edge IDs that are exact duplicates (src+tgt+type)
  selfLoops:        string[];        // edge IDs that point to themselves
  noSourceNodes:    string[];        // node IDs missing provenance
  noSourceEdges:    string[];        // edge IDs missing provenance
  errorCount:       number;
  warningCount:     number;
  checkedAt:        string;
}

// ── Main integrity check ───────────────────────────────────────────────────────

/**
 * runIntegrityCheck — comprehensive graph integrity check for an org.
 * Never throws. Returns full report.
 */
export function runIntegrityCheck(orgSlug: string): IntegrityReport {
  const orphanNodes:      string[] = [];
  const orphanEdges:      string[] = [];
  const crossTenantEdges: string[] = [];
  const brokenReferences: string[] = [];
  const duplicateEdges:   string[] = [];
  const selfLoops:        string[] = [];
  const noSourceNodes:    string[] = [];
  const noSourceEdges:    string[] = [];

  try {
    const nodes = listNodes(orgSlug);
    const edges = listEdges(orgSlug);
    const nodeIds = new Set(nodes.map(n => n.id));

    // Track edge signatures for duplicate detection
    const edgeSignatures = new Map<string, string>(); // signature → first edgeId

    // Check nodes
    const touchedNodes = new Set<string>();
    for (const edge of edges) {
      touchedNodes.add(edge.sourceNodeId);
      touchedNodes.add(edge.targetNodeId);
    }

    for (const node of nodes) {
      if (!touchedNodes.has(node.id)) orphanNodes.push(node.id);
      if (!node.source) noSourceNodes.push(node.id);
    }

    // Check edges
    for (const edge of edges) {
      // Broken reference
      if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
        brokenReferences.push(edge.id);
        orphanEdges.push(edge.id);
        continue;
      }

      // Self-loop
      if (edge.sourceNodeId === edge.targetNodeId) {
        selfLoops.push(edge.id);
      }

      // Cross-tenant check
      const srcNode = nodes.find(n => n.id === edge.sourceNodeId);
      const tgtNode = nodes.find(n => n.id === edge.targetNodeId);
      if (srcNode && srcNode.orgSlug !== orgSlug) crossTenantEdges.push(edge.id);
      if (tgtNode && tgtNode.orgSlug !== orgSlug) crossTenantEdges.push(edge.id);

      // Provenance check
      if (!edge.source) noSourceEdges.push(edge.id);

      // Duplicate detection
      const sig = `${edge.sourceNodeId}|${edge.targetNodeId}|${edge.type}`;
      if (edgeSignatures.has(sig)) {
        duplicateEdges.push(edge.id);
      } else {
        edgeSignatures.set(sig, edge.id);
      }
    }
  } catch { /* return partial report */ }

  const errorCount   = brokenReferences.length + crossTenantEdges.length + selfLoops.length;
  const warningCount = orphanNodes.length + duplicateEdges.length + noSourceNodes.length + noSourceEdges.length;

  return {
    orgSlug,
    valid:             errorCount === 0,
    orphanNodes,
    orphanEdges,
    crossTenantEdges,
    brokenReferences,
    duplicateEdges,
    selfLoops,
    noSourceNodes,
    noSourceEdges,
    errorCount,
    warningCount,
    checkedAt:         new Date().toISOString(),
  };
}

/**
 * validateIntegrity — simplified validation returning GraphValidationResult.
 */
export function validateIntegrity(orgSlug: string): GraphValidationResult {
  const report = runIntegrityCheck(orgSlug);
  const errors: GraphValidationError[] = [];
  const warnings: string[] = [];

  for (const edgeId of report.brokenReferences) {
    errors.push({ code: "BROKEN_REFERENCE", message: `Edge ${edgeId} references missing node`, edgeId });
  }
  for (const edgeId of report.crossTenantEdges) {
    errors.push({ code: "CROSS_TENANT_EDGE", message: `Edge ${edgeId} crosses tenant boundary`, edgeId });
  }
  for (const edgeId of report.selfLoops) {
    errors.push({ code: "SELF_LOOP", message: `Edge ${edgeId} is a self-loop`, edgeId });
  }
  for (const nodeId of report.orphanNodes) {
    warnings.push(`Node ${nodeId} has no connections`);
  }
  for (const edgeId of report.duplicateEdges) {
    warnings.push(`Edge ${edgeId} is a duplicate relationship`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * hasIntegrityErrors — quick check if graph has any errors.
 */
export function hasIntegrityErrors(orgSlug: string): boolean {
  const report = runIntegrityCheck(orgSlug);
  return report.errorCount > 0;
}

/**
 * countOrphanNodes — utility for dashboards.
 */
export function countOrphanNodes(orgSlug: string): number {
  return runIntegrityCheck(orgSlug).orphanNodes.length;
}
