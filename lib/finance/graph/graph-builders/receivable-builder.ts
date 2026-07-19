/**
 * lib/finance/graph/graph-builders/receivable-builder.ts
 *
 * AGENTIK-FINANCIAL-GRAPH-01
 *
 * Converts a CustomerReceivable Prisma result into a FinancialNode.
 * CustomerReceivable = open/partial/paid invoice balances from PYA/ERP.
 */

import type { FinancialNode } from "../graph-types";
import { computeNodeStatus } from "../graph-status";

/** Minimal CustomerReceivable shape needed by the builder. */
export interface ReceivableInput {
  id:             string;
  organizationId: string;
  erpId:          string | null;
  invoiceNumber:  string | null;
  customerNit:    string | null;
  customerName:   string;
  originalAmount: { toNumber(): number } | number;
  paidAmount:     { toNumber(): number } | number;
  balanceDue:     { toNumber(): number } | number;
  currency:       string;
  invoiceDate:    Date;
  dueDate:        Date;
  status:         string; // "OPEN" | "PARTIAL" | "PAID" | "WRITTEN_OFF"
  daysOverdue:    number;
  agingBucket:    string;
}

function toNumber(v: { toNumber(): number } | number): number {
  return typeof v === "number" ? v : v.toNumber();
}

export function buildNodeFromReceivable(r: ReceivableInput): FinancialNode {
  const originalAmount = toNumber(r.originalAmount);
  const balanceDue     = toNumber(r.balanceDue);

  // Use balance due as the operative amount (what's still outstanding)
  const amount = balanceDue;

  const nodeStatus = computeNodeStatus({
    hasAmount:     originalAmount > 0,
    hasDate:       true,
    hasEntityId:   !!r.customerNit,
    hasReference:  !!r.invoiceNumber,
    isBankRelated: false,
  });

  // Override status if receivable is paid
  const resolvedStatus = r.status === "PAID" ? "REAL" : nodeStatus;

  const period = {
    year:  r.invoiceDate.getFullYear(),
    month: r.invoiceDate.getMonth() + 1,
  };

  return {
    id:           `RCV:${r.id}`,
    orgId:        r.organizationId,
    docType:      "FACTURA",
    sourceSystem: "PYA",
    sourceId:     r.id,
    referenceCode: r.invoiceNumber ?? r.erpId ?? undefined,
    entityNit:    r.customerNit ?? undefined,
    entityName:   r.customerName,
    amount,
    currency:     r.currency,
    date:         r.invoiceDate,
    period,
    status:       resolvedStatus,
    metadata: {
      erpId:           r.erpId,
      originalAmount,
      paidAmount:      toNumber(r.paidAmount),
      balanceDue,
      receivableStatus: r.status,
      daysOverdue:     r.daysOverdue,
      agingBucket:     r.agingBucket,
      dueDate:         r.dueDate,
    },
    inEdgeIds:  [],
    outEdgeIds: [],
  };
}
