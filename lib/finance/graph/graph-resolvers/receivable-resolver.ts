/**
 * lib/finance/graph/graph-resolvers/receivable-resolver.ts
 *
 * AGENTIK-FINANCIAL-GRAPH-01
 *
 * Fetches CustomerReceivable rows (cartera) and converts to FinancialNodes.
 * Only includes OPEN and PARTIAL receivables — PAID/WRITTEN_OFF are historical.
 */

import { prisma } from "@/lib/prisma";
import type { FinancialNode } from "../graph-types";
import {
  buildNodeFromReceivable,
  type ReceivableInput,
} from "../graph-builders/receivable-builder";

export interface ReceivableResolverOptions {
  orgId:             string;
  includeStatuses?:  string[];
  limit?:            number;
}

/**
 * Fetch CustomerReceivable nodes for the given organization.
 * Defaults to OPEN + PARTIAL statuses (active cartera).
 */
export async function resolveReceivableNodes(
  opts: ReceivableResolverOptions,
): Promise<FinancialNode[]> {
  const {
    orgId,
    includeStatuses = ["OPEN", "PARTIAL"],
    limit = 2000,
  } = opts;

  const rows = await prisma.customerReceivable.findMany({
    where: {
      organizationId: orgId,
      status:         { in: includeStatuses },
    },
    select: {
      id:             true,
      organizationId: true,
      erpId:          true,
      invoiceNumber:  true,
      customerNit:    true,
      customerName:   true,
      originalAmount: true,
      paidAmount:     true,
      balanceDue:     true,
      currency:       true,
      invoiceDate:    true,
      dueDate:        true,
      status:         true,
      daysOverdue:    true,
      agingBucket:    true,
    },
    orderBy: { invoiceDate: "desc" },
    take:    limit,
  });

  return rows.map(r => buildNodeFromReceivable(r as ReceivableInput));
}
