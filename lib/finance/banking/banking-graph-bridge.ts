/**
 * lib/finance/banking/banking-graph-bridge.ts
 *
 * AGENTIK-BANKING-FOUNDATION-01 — Financial Graph integration for banking nodes.
 *
 * Extends the Financial Graph with bank movement nodes and bank-originated edges:
 *   BANK_TO_CONSIGNACION — BankMovement (credit) ↔ CONSIGNACION node
 *   BANK_TO_RECEIPT      — BankMovement (credit) ↔ RECIBO_CAJA node
 *   BANK_TO_EGRESO       — BankMovement (debit)  ↔ EGRESO node
 *   BANK_TO_FACTURA      — BankMovement (credit) ↔ FACTURA node
 *   BANK_TO_PAYMENT      — BankMovement (credit) ↔ ANTICIPO node
 *
 * Previously these were BLOCKERS in lib/finance/graph/index.ts.
 * Once BankAccount data exists, this bridge resolves them.
 */

import type {
  FinancialNode,
  FinancialEdge,
  FinancialEdgeType,
  NodeResolutionStatus,
} from "../graph/graph-types";
import type { BankMovementRecord, BankMatchCandidate } from "./banking-types";
import { findBestMatch } from "./banking-matchers";
import { computeEdgeStatus } from "../graph/graph-status";

// ── Bank movement → FinancialNode ─────────────────────────────────────────────

/**
 * Convert a BankMovement into a FinancialNode so it participates in the graph.
 * Doc type is always CONSIGNACION for credits, EGRESO for debits (placeholder).
 */
export function bankMovementToNode(
  mv:    BankMovementRecord,
  orgId: string,
): FinancialNode {
  const docType = mv.direction === "credit" ? "CONSIGNACION" : "EGRESO";

  return {
    id:            `bank:${mv.id}`,
    orgId,
    sourceSystem:  "BANK",
    sourceId:      mv.id,
    docType,
    referenceCode: mv.reference ?? undefined,
    date:          mv.movementDate,
    amount:        mv.amount,
    currency:      "COP",
    period: {
      year:  mv.movementDate.getFullYear(),
      month: mv.movementDate.getMonth() + 1,
    },
    entityNit:     mv.sourceDocumentRef ?? undefined,
    entityName:    mv.description ?? undefined,
    status:        mv.matched ? "REAL" : "SYNC_PENDING",
    inEdgeIds:     [],
    outEdgeIds:    [],
    metadata: {
      direction:          mv.direction,
      source:             mv.source,
      bankAccountId:      mv.bankAccountId,
      sourceDocumentType: mv.sourceDocumentType,
      balanceAfter:       mv.balanceAfter,
      matchedAt:          mv.matchedAt,
    },
  };
}

// ── Edge builder ──────────────────────────────────────────────────────────────

function buildBankEdge(
  edgeType:   FinancialEdgeType,
  from:       FinancialNode,
  to:         FinancialNode,
  candidate:  BankMatchCandidate,
): FinancialEdge {
  const id = `${edgeType}:${from.id}:${to.id}`;
  from.outEdgeIds.push(id);
  to.inEdgeIds.push(id);

  const status: NodeResolutionStatus = computeEdgeStatus(candidate.confidence, candidate.matchedBy.length);

  return {
    id,
    orgId:       from.orgId,
    type:        edgeType,
    fromNodeId:  from.id,
    toNodeId:    to.id,
    confidence:  candidate.confidence,
    status,
    matchFields: candidate.matchedBy,
    metadata: {
      matchType:   candidate.matchType,
      explanation: candidate.explanation,
    },
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Augment an existing FinancialGraph with bank movement nodes and edges.
 *
 * Call after buildFinancialGraph() to add the banking layer.
 * Returns new nodes and edges to merge into the graph.
 */
export function augmentGraphWithBankMovements(
  existingNodes: FinancialNode[],
  movements:     BankMovementRecord[],
  orgId:         string,
): { nodes: FinancialNode[]; edges: FinancialEdge[] } {
  const bankNodes: FinancialNode[] = movements.map((mv) =>
    bankMovementToNode(mv, orgId),
  );

  const edges: FinancialEdge[] = [];

  for (const bankNode of bankNodes) {
    // Find the original movement record for the matcher
    const mv = movements.find((m) => `bank:${m.id}` === bankNode.id);
    if (!mv) continue;

    const candidate = findBestMatch(mv, existingNodes);
    if (!candidate || candidate.confidence < 0.6) continue;

    const targetNode = existingNodes.find((n) => n.id === candidate.graphNodeId);
    if (!targetNode) continue;

    // Map BankMatchType → FinancialEdgeType
    const edgeTypeMap: Record<string, FinancialEdgeType> = {
      BANK_TO_CONSIGNACION: "BANK_TO_CONSIGNACION",
      BANK_TO_RECEIPT:      "BANK_TO_RECEIPT",
      BANK_TO_EGRESO:       "BANK_TO_EGRESO",
      BANK_TO_FACTURA:      "BANK_TO_FACTURA",
      BANK_TO_PAYMENT:      "BANK_TO_PAYMENT",
    };

    const edgeType = edgeTypeMap[candidate.matchType];
    if (!edgeType) continue;

    edges.push(buildBankEdge(edgeType, bankNode, targetNode, candidate));
  }

  return { nodes: bankNodes, edges };
}
