/**
 * lib/finance/graph/graph-resolvers/document-resolver.ts
 *
 * AGENTIK-FINANCIAL-GRAPH-01
 *
 * Fetches Document rows (DIAN-validated / uploaded) and converts to FinancialNodes.
 * Only includes financial document types relevant to the graph.
 */

import { prisma } from "@/lib/prisma";
import type { FinancialNode } from "../graph-types";
import {
  buildNodeFromDocument,
  type DocumentInput,
} from "../graph-builders/document-builder";

/** Document types relevant to the financial graph. */
const FINANCIAL_DOCUMENT_TYPES = [
  "FACTURA_VENTA", "FACTURA_COMPRA",
  "NOTA_CREDITO", "NOTA_DEBITO",
  "RECIBO_CAJA", "COMPROBANTE_EGRESO",
  "EXTRACTO_BANCARIO", "ESTADO_CUENTA",
];

export interface DocumentResolverOptions {
  orgId:     string;
  fromDate?: Date;
  toDate?:   Date;
  limit?:    number;
}

/**
 * Fetch financial Document nodes for the given organization.
 */
export async function resolveDocumentNodes(
  opts: DocumentResolverOptions,
): Promise<FinancialNode[]> {
  const { orgId, fromDate, toDate, limit = 1000 } = opts;

  const rows = await prisma.document.findMany({
    where: {
      organizationId: orgId,
      type:           { in: FINANCIAL_DOCUMENT_TYPES as never[] },
      deletedAt:      null,
      ...(fromDate || toDate ? {
        documentDate: {
          ...(fromDate ? { gte: fromDate } : {}),
          ...(toDate   ? { lte: toDate   } : {}),
        },
      } : {}),
    },
    select: {
      id:             true,
      organizationId: true,
      type:           true,
      status:         true,
      issuerName:     true,
      issuerId:       true,
      receiverName:   true,
      amount:         true,
      currency:       true,
      documentDate:   true,
    },
    orderBy: { documentDate: "desc" },
    take:    limit,
  });

  const nodes: FinancialNode[] = [];
  for (const r of rows) {
    const node = buildNodeFromDocument(r as DocumentInput);
    if (node) nodes.push(node);
  }
  return nodes;
}
