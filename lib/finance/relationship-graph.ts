/**
 * lib/finance/relationship-graph.ts
 *
 * FASE 1 — Financial Relationship Graph Core
 *
 * Builds a causal relationship graph from real Prisma data.
 * Separate from lib/finance/graph/ (document integrity graph).
 * This graph models BUSINESS relationships: who pays whom, what blocks what.
 *
 * Note: Types prefixed "Rel" to avoid collision with lib/finance/graph/graph-types.ts
 * but exported under the spec's required names.
 *
 * Performance: graph is cached per orgId for 5 minutes (FASE 9).
 *
 * Sprint: AGENTIK-FINANCIAL-RELATIONSHIP-GRAPH-01
 */

import { prisma }                       from "@/lib/prisma";
import { getRecentFinancialEvents }     from "@/lib/finance/runtime-service";

// ── Node & edge types ─────────────────────────────────────────────────────────

export type FinancialNodeType =
  | "INVOICE"
  | "RECEIVABLE"
  | "PAYMENT"
  | "BANK_MOVEMENT"
  | "RECONCILIATION"
  | "CUSTOMER"
  | "BUDGET"
  | "EXECUTION"
  | "CLOSE_BLOCKER"
  | "DIAN_DOCUMENT"
  | "RUNTIME_EVENT";

export interface FinancialNode {
  id:             string;
  type:           FinancialNodeType;
  organizationId: string;
  label:          string;
  health:         "HEALTHY" | "WARNING" | "CRITICAL" | "UNRESOLVED";
  confidence?:    number;
  sourceModel?:   string;
  metadata?:      Record<string, unknown>;
}

export interface FinancialEdge {
  id:             string;
  organizationId: string;
  from:           string;
  to:             string;
  relationship:
    | "PAYS"
    | "MATCHES"
    | "BLOCKS"
    | "DEPENDS_ON"
    | "AFFECTS"
    | "GENERATED_FROM"
    | "ASSOCIATED_WITH";
  confidence:     number;
  createdAt:      Date;
}

// ── Full graph shape ──────────────────────────────────────────────────────────

export interface FinancialRelationshipGraph {
  organizationId: string;
  builtAt:        Date;
  nodes:          Map<string, FinancialNode>;
  edges:          FinancialEdge[];
  /** nodeId → outgoing edges */
  outgoing:       Map<string, FinancialEdge[]>;
  /** nodeId → incoming edges */
  incoming:       Map<string, FinancialEdge[]>;
}

// ── Module-level cache (FASE 9) ───────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  graph:   FinancialRelationshipGraph;
  builtAt: number;
}

const graphCache = new Map<string, CacheEntry>();

export function invalidateRelationshipGraph(orgId: string): void {
  graphCache.delete(orgId);
}

// ── Node ID helpers ───────────────────────────────────────────────────────────

const nodeId = {
  payment:      (id: string) => `pmt:${id}`,
  receivable:   (id: string) => `rec:${id}`,
  movement:     (id: string) => `mov:${id}`,
  customer:     (id: string) => `cus:${id}`,
  budget:       (id: string) => `bud:${id}`,
  event:        (id: string) => `evt:${id}`,
  blocker:      (key: string) => `blk:${key}`,
};

// ── Node builders ─────────────────────────────────────────────────────────────

function makeNode(
  id:         string,
  type:       FinancialNodeType,
  orgId:      string,
  label:      string,
  health:     FinancialNode["health"],
  sourceModel?: string,
  confidence?:  number,
  metadata?:    Record<string, unknown>,
): FinancialNode {
  return { id, type, organizationId: orgId, label, health, confidence, sourceModel, metadata };
}

function makeEdge(
  from:         string,
  to:           string,
  relationship: FinancialEdge["relationship"],
  orgId:        string,
  confidence:   number = 1,
): FinancialEdge {
  return {
    id:             `e:${from}:${relationship}:${to}`,
    organizationId: orgId,
    from,
    to,
    relationship,
    confidence,
    createdAt:      new Date(),
  };
}

// ── Adjacency index builder ───────────────────────────────────────────────────

function buildAdjacency(edges: FinancialEdge[]): {
  outgoing: Map<string, FinancialEdge[]>;
  incoming: Map<string, FinancialEdge[]>;
} {
  const outgoing = new Map<string, FinancialEdge[]>();
  const incoming = new Map<string, FinancialEdge[]>();

  for (const e of edges) {
    if (!outgoing.has(e.from)) outgoing.set(e.from, []);
    if (!incoming.has(e.to))   incoming.set(e.to,   []);
    outgoing.get(e.from)!.push(e);
    incoming.get(e.to)!.push(e);
  }

  return { outgoing, incoming };
}

// ── Main builder ──────────────────────────────────────────────────────────────

export async function buildFinancialRelationshipGraph(
  orgId:        string,
  forceRebuild: boolean = false,
): Promise<FinancialRelationshipGraph> {
  // Check cache
  const cached = graphCache.get(orgId);
  if (!forceRebuild && cached && Date.now() - cached.builtAt < CACHE_TTL_MS) {
    return cached.graph;
  }

  const builtAt = new Date();
  const nodes   = new Map<string, FinancialNode>();
  const edges:    FinancialEdge[] = [];

  // ── Load raw data in parallel ─────────────────────────────────────────────

  const [
    payments,
    receivables,
    movements,
    allocations,
    budgets,
    recentEvents,
  ] = await Promise.all([
    // Uncrossed payments (most important for root cause)
    prisma.collectionRecord.findMany({
      where:   { organizationId: orgId, appliedStatus: "AVAILABLE" },
      select:  { id: true, amount: true, customerId: true, customerName: true, comprobanteCode: true, collectionDate: true },
      take:    300,
      orderBy: { collectionDate: "desc" },
    }).catch(() => []),

    // Open / overdue receivables
    prisma.customerReceivable.findMany({
      where:   { organizationId: orgId, status: { in: ["OPEN", "PARTIAL"] } },
      select:  { id: true, balanceDue: true, customerId: true, customerName: true, daysOverdue: true, invoiceNumber: true },
      take:    300,
      orderBy: { balanceDue: "desc" },
    }).catch(() => []),

    // Unmatched bank movements
    prisma.bankMovement.findMany({
      where:   { organizationId: orgId, matched: false },
      select:  { id: true, amount: true, direction: true, movementDate: true, description: true, reference: true },
      take:    200,
      orderBy: { movementDate: "desc" },
    }).catch(() => []),

    // Collection allocations (PAYS edges)
    prisma.collectionAllocation.findMany({
      where:  { organizationId: orgId },
      select: { collectionRecordId: true, receivableId: true, amountApplied: true, confidence: true },
      take:   500,
    }).catch(() => []),

    // Budgets
    prisma.budget.findMany({
      where:  { organizationId: orgId, year: new Date().getFullYear() },
      select: { id: true, amount: true, category: true, dimensionLabel: true },
      take:   50,
    }).catch(() => []),

    // Runtime events (last 48h)
    getRecentFinancialEvents(orgId, 48, 20).catch(() => []),
  ]);

  // ── Build PAYMENT nodes ───────────────────────────────────────────────────

  for (const p of payments) {
    const nid = nodeId.payment(p.id);
    nodes.set(nid, makeNode(
      nid, "PAYMENT", orgId,
      `Recaudo $${Number(p.amount).toLocaleString("es-CO")} · ${p.comprobanteCode}`,
      "WARNING", // uncrossed = warning
      "CollectionRecord",
      0.8,
      { amount: Number(p.amount), customerId: p.customerId, sourceId: p.id },
    ));

    // Customer node (deduplicated)
    if (p.customerId) {
      const cid = nodeId.customer(p.customerId);
      if (!nodes.has(cid)) {
        nodes.set(cid, makeNode(
          cid, "CUSTOMER", orgId,
          p.customerName ?? `Cliente ${p.customerId.slice(-6)}`,
          "HEALTHY", "CustomerProfile", 0.9,
        ));
      }
      // PAYMENT → CUSTOMER: ASSOCIATED_WITH
      edges.push(makeEdge(nid, cid, "ASSOCIATED_WITH", orgId, 0.9));
    }
  }

  // ── Build RECEIVABLE nodes ────────────────────────────────────────────────

  for (const r of receivables) {
    const nid = nodeId.receivable(r.id);
    const health: FinancialNode["health"] =
      (r.daysOverdue ?? 0) > 60 ? "CRITICAL" :
      (r.daysOverdue ?? 0) > 0  ? "WARNING"  :
                                   "HEALTHY";

    nodes.set(nid, makeNode(
      nid, "RECEIVABLE", orgId,
      `CxC ${r.customerName} · $${Number(r.balanceDue).toLocaleString("es-CO")}`,
      health, "CustomerReceivable", 0.85,
      { balanceDue: Number(r.balanceDue), daysOverdue: r.daysOverdue ?? 0, sourceId: r.id },
    ));

    // Customer node
    if (r.customerId) {
      const cid = nodeId.customer(r.customerId);
      if (!nodes.has(cid)) {
        nodes.set(cid, makeNode(
          cid, "CUSTOMER", orgId,
          r.customerName ?? `Cliente ${r.customerId.slice(-6)}`,
          "HEALTHY", "CustomerProfile", 0.9,
        ));
      }
      edges.push(makeEdge(nid, cid, "ASSOCIATED_WITH", orgId, 0.9));
    }
  }

  // ── Build BANK_MOVEMENT nodes ─────────────────────────────────────────────

  for (const m of movements) {
    const nid = nodeId.movement(m.id);
    nodes.set(nid, makeNode(
      nid, "BANK_MOVEMENT", orgId,
      `Movimiento ${m.direction === "credit" ? "+" : "-"}$${Number(m.amount).toLocaleString("es-CO")}`,
      "UNRESOLVED", // unmatched = unresolved
      "BankMovement",
      0.7,
      { amount: Number(m.amount), direction: m.direction, sourceId: m.id },
    ));
  }

  // ── Build BUDGET nodes ────────────────────────────────────────────────────

  for (const b of budgets) {
    const nid = nodeId.budget(b.id);
    nodes.set(nid, makeNode(
      nid, "BUDGET", orgId,
      `Presupuesto ${b.category} · ${b.dimensionLabel}`,
      "HEALTHY", "Budget", 0.9,
      { amount: Number(b.amount), sourceId: b.id },
    ));
  }

  // ── Build RUNTIME_EVENT nodes ─────────────────────────────────────────────

  for (const e of recentEvents) {
    const nid = nodeId.event(e.id);
    const health: FinancialNode["health"] =
      e.severity === "critical" ? "CRITICAL" :
      e.severity === "warning"  ? "WARNING"  :
                                   "HEALTHY";
    nodes.set(nid, makeNode(
      nid, "RUNTIME_EVENT", orgId,
      e.title,
      health,
      "FinancialRuntimeEvent",
      e.confidence,
      { type: e.type, ageMinutes: e.ageMinutes, sourceId: e.id },
    ));
  }

  // ── Build EDGES from CollectionAllocation (PAYS) ──────────────────────────

  for (const alloc of allocations) {
    const fromNid = nodeId.payment(alloc.collectionRecordId);
    const toNid   = nodeId.receivable(alloc.receivableId);
    // Only add edge if both nodes exist (we may not have loaded all records)
    if (nodes.has(fromNid) || nodes.has(toNid)) {
      const conf = alloc.confidence === "HIGH" ? 0.95 : 0.7;
      edges.push(makeEdge(fromNid, toNid, "PAYS", orgId, conf));
    }
  }

  // ── Detect UNRESOLVED payments (no outgoing PAYS edge) ───────────────────
  // Mark payment nodes with no allocation as UNRESOLVED

  const paidFroms = new Set(edges.filter(e => e.relationship === "PAYS").map(e => e.from));
  for (const [nid, node] of nodes) {
    if (node.type === "PAYMENT" && !paidFroms.has(nid)) {
      nodes.set(nid, { ...node, health: "UNRESOLVED" });
    }
  }

  // ── RUNTIME_EVENT → affected domain edges (AFFECTS) ───────────────────────

  for (const e of recentEvents) {
    const evtNid = nodeId.event(e.id);
    if (!nodes.has(evtNid)) continue;

    // Map event type to affected node type
    const affectsType: Partial<Record<string, FinancialNodeType>> = {
      RECON_BREAK:    "BANK_MOVEMENT",
      BANK_UNMATCHED: "BANK_MOVEMENT",
      LOW_CONFIDENCE: "RECEIVABLE",
      LIQUIDITY_RISK: "PAYMENT",
      CLOSE_BLOCKER:  "RECONCILIATION",
    };

    const targetType = affectsType[e.type];
    if (targetType) {
      // Link to first matching node of that type
      for (const [nid, node] of nodes) {
        if (node.type === targetType) {
          edges.push(makeEdge(evtNid, nid, "AFFECTS", orgId, 0.8));
          break; // one representative edge per event
        }
      }
    }
  }

  // ── Build adjacency index ─────────────────────────────────────────────────

  const { outgoing, incoming } = buildAdjacency(edges);

  const graph: FinancialRelationshipGraph = {
    organizationId: orgId,
    builtAt,
    nodes,
    edges,
    outgoing,
    incoming,
  };

  graphCache.set(orgId, { graph, builtAt: Date.now() });
  return graph;
}
