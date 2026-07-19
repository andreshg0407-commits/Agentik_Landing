/**
 * lib/finance/graph/graph-runtime.ts
 *
 * AGENTIK-FINANCIAL-GRAPH-01 — Graph Runtime Orchestrator.
 *
 * The single entry point for building the FinancialGraph for an organization.
 *
 * Execution order:
 *   1. Fetch nodes from all resolvers (parallel)
 *   2. De-duplicate nodes by id
 *   3. Enforce org isolation (filter stray orgIds)
 *   4. Build edges via relation engine
 *   5. Run integrity checks
 *   6. Compute stats
 *   7. Return FinancialGraph
 *
 * Multi-tenant isolation: every step validates orgId.
 * No data crosses tenant boundaries at any layer.
 */

import type {
  FinancialGraph,
  FinancialNode,
  FinancialEdge,
  FinancialGraphStats,
  GraphBuildOptions,
  NodeResolutionStatus,
  FinancialDocumentType,
} from "./graph-types";
import { aggregateNodeStatus } from "./graph-status";
import { buildAllRelations } from "./graph-relations";
import { runIntegrityChecks } from "./graph-integrity/integrity-engine";
import { resolveSaleRecordNodes } from "./graph-resolvers/sale-resolver";
import { resolveCollectionNodes } from "./graph-resolvers/collection-resolver";
import { resolveReceivableNodes } from "./graph-resolvers/receivable-resolver";
import { resolveDocumentNodes } from "./graph-resolvers/document-resolver";
import { resolveBankNodes } from "./graph-resolvers/bank-resolver";

// ─────────────────────────────────────────────────────────────────────────────
// TENANT ISOLATION GUARD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enforce that every node belongs to the requested orgId.
 * Any stray node from another tenant is silently dropped and counted.
 */
function enforceOrgIsolation(nodes: FinancialNode[], orgId: string): {
  clean: FinancialNode[];
  violationCount: number;
} {
  const clean: FinancialNode[] = [];
  let violationCount = 0;
  for (const n of nodes) {
    if (n.orgId !== orgId) {
      violationCount++;
      continue;
    }
    clean.push(n);
  }
  if (violationCount > 0) {
    console.error(
      `[FinancialGraph] TENANT ISOLATION VIOLATION: ${violationCount} nodes from wrong orgId filtered out.`,
    );
  }
  return { clean, violationCount };
}

// ─────────────────────────────────────────────────────────────────────────────
// NODE DE-DUPLICATION
// ─────────────────────────────────────────────────────────────────────────────

function deduplicateNodes(nodes: FinancialNode[]): FinancialNode[] {
  const seen = new Set<string>();
  const result: FinancialNode[] = [];
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    result.push(n);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// STATS COMPUTATION
// ─────────────────────────────────────────────────────────────────────────────

function computeStats(
  nodes: FinancialNode[],
  edges: FinancialEdge[],
): FinancialGraphStats {
  const byStatus = aggregateNodeStatus(nodes);

  const byDocType: Partial<Record<FinancialDocumentType, number>> = {};
  for (const n of nodes) {
    byDocType[n.docType] = (byDocType[n.docType] ?? 0) + 1;
  }

  return {
    totalNodes:       nodes.length,
    totalEdges:       edges.length,
    byStatus,
    byDocType,
    orphanCount:      byStatus.ORPHAN,
    unresolvedCount:  byStatus.UNRESOLVED,
    syncPendingCount: byStatus.SYNC_PENDING,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN RUNTIME
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the complete FinancialGraph for an organization.
 *
 * This is a read-only operation — no Prisma writes, no side effects.
 * All data is org-scoped. Multi-tenant isolation enforced at every layer.
 */
export async function buildFinancialGraph(
  opts: GraphBuildOptions,
): Promise<FinancialGraph & { integrityIssues: ReturnType<typeof runIntegrityChecks>; violationCount: number }> {
  const { orgId, fromDate, toDate, include = {}, skipIntegrity = false } = opts;

  const {
    saleRecords       = true,
    collectionRecords = true,
    receivables       = true,
    documents         = true,
  } = include;

  // ── Phase 1: Fetch nodes from all sources in parallel ──────────────────────
  const [saleNodes, collectionNodes, receivableNodes, documentNodes, bankNodes] =
    await Promise.all([
      saleRecords
        ? resolveSaleRecordNodes({ orgId, fromDate, toDate }).catch(() => [])
        : Promise.resolve([]),
      collectionRecords
        ? resolveCollectionNodes({ orgId, fromDate, toDate }).catch(() => [])
        : Promise.resolve([]),
      receivables
        ? resolveReceivableNodes({ orgId }).catch(() => [])
        : Promise.resolve([]),
      documents
        ? resolveDocumentNodes({ orgId, fromDate, toDate }).catch(() => [])
        : Promise.resolve([]),
      collectionRecords
        ? resolveBankNodes({ orgId, fromDate, toDate }).catch(() => [])
        : Promise.resolve([]),
    ]);

  const allRaw = [
    ...saleNodes,
    ...collectionNodes,
    ...receivableNodes,
    ...documentNodes,
    ...bankNodes,
  ];

  // ── Phase 2: Dedup ─────────────────────────────────────────────────────────
  const deduped = deduplicateNodes(allRaw);

  // ── Phase 3: Tenant isolation enforcement ─────────────────────────────────
  const { clean: nodes, violationCount } = enforceOrgIsolation(deduped, orgId);

  // ── Phase 4: Build edges (relation engine) ─────────────────────────────────
  const edges = buildAllRelations(nodes);

  // ── Phase 5: Integrity checks ──────────────────────────────────────────────
  const integrityIssues = skipIntegrity ? [] : runIntegrityChecks(nodes, edges);

  // ── Phase 6: Stats ─────────────────────────────────────────────────────────
  const stats = computeStats(nodes, edges);

  return {
    orgId,
    builtAt: new Date(),
    nodes,
    edges,
    stats,
    integrityIssues,
    violationCount,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LIGHTWEIGHT PARTIAL BUILDS (module-specific)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build only collection + receivable nodes (for Tesorería / Conciliación modules).
 * Faster than full graph — skips DIAN documents and bank nodes.
 */
export async function buildTreasuryGraph(orgId: string, fromDate?: Date): Promise<{
  nodes: FinancialNode[];
  edges: FinancialEdge[];
}> {
  const graph = await buildFinancialGraph({
    orgId,
    fromDate,
    include: {
      saleRecords:       true,
      collectionRecords: true,
      receivables:       true,
      documents:         false,
    },
    skipIntegrity: true,
  });
  return { nodes: graph.nodes, edges: graph.edges };
}

/**
 * Build only receivable nodes (for Cierre / Cartera modules).
 */
export async function buildCarteraGraph(orgId: string): Promise<{
  nodes: FinancialNode[];
  edges: FinancialEdge[];
}> {
  const graph = await buildFinancialGraph({
    orgId,
    include: {
      saleRecords:       false,
      collectionRecords: true,
      receivables:       true,
      documents:         false,
    },
    skipIntegrity: true,
  });
  return { nodes: graph.nodes, edges: graph.edges };
}
