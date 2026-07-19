/**
 * lib/finance/graph/graph-builders/collection-record-builder.ts
 *
 * AGENTIK-FINANCIAL-GRAPH-01
 *
 * Converts a CollectionRecord Prisma result into a FinancialNode.
 * CollectionRecord = cash receipts from v_pagosnew (R1, R2, A1, A2, etc.)
 */

import type { FinancialNode } from "../graph-types";
import { resolveDocType } from "../graph-types";
import { computeNodeStatus } from "../graph-status";

/** Minimal CollectionRecord shape needed by the builder. */
export interface CollectionRecordInput {
  id:              string;
  organizationId:  string;
  comprobanteCode: string;
  documentNumber:  string | null;
  collectionDate:  Date;
  customerNit:     string | null;
  customerName:    string | null;
  amount:          { toNumber(): number } | number;
  currency:        string;
  bankReference:   string | null;
  appliedStatus:   string; // "AVAILABLE" | "APPLIED" | "PARTIAL"
  appliedFacts:    unknown; // Json
  erpMovId:        number | null;
}

function toNumber(v: { toNumber(): number } | number): number {
  return typeof v === "number" ? v : v.toNumber();
}

export function buildNodeFromCollectionRecord(r: CollectionRecordInput): FinancialNode {
  const amount       = toNumber(r.amount);
  const docType      = resolveDocType(r.comprobanteCode);
  const isBankRelated = !!r.bankReference;

  const status = computeNodeStatus({
    hasAmount:     amount > 0,
    hasDate:       true,
    hasEntityId:   !!r.customerNit,
    hasReference:  !!r.documentNumber,
    isBankRelated,
  });

  const period = {
    year:  r.collectionDate.getFullYear(),
    month: r.collectionDate.getMonth() + 1,
  };

  return {
    id:           `CR:${r.id}`,
    orgId:        r.organizationId,
    docType,
    sourceSystem: "SAG",
    sourceId:     r.id,
    referenceCode: r.documentNumber ?? undefined,
    entityNit:    r.customerNit ?? undefined,
    entityName:   r.customerName ?? undefined,
    amount,
    currency:     r.currency,
    date:         r.collectionDate,
    period,
    status,
    metadata: {
      comprobanteCode: r.comprobanteCode,
      bankReference:   r.bankReference,
      appliedStatus:   r.appliedStatus,
      hasAppliedFacts: !!r.appliedFacts,
      erpMovId:        r.erpMovId,
    },
    inEdgeIds:  [],
    outEdgeIds: [],
  };
}
