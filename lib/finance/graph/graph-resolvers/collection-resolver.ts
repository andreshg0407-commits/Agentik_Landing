/**
 * lib/finance/graph/graph-resolvers/collection-resolver.ts
 *
 * AGENTIK-FINANCIAL-GRAPH-01
 *
 * Fetches CollectionRecord rows (v_pagosnew) and converts to FinancialNodes.
 */

import { prisma } from "@/lib/prisma";
import type { FinancialNode } from "../graph-types";
import {
  buildNodeFromCollectionRecord,
  type CollectionRecordInput,
} from "../graph-builders/collection-record-builder";

export interface CollectionResolverOptions {
  orgId:     string;
  fromDate?: Date;
  toDate?:   Date;
  limit?:    number;
}

/**
 * Fetch CollectionRecord nodes for the given organization.
 */
export async function resolveCollectionNodes(
  opts: CollectionResolverOptions,
): Promise<FinancialNode[]> {
  const { orgId, fromDate, toDate, limit = 2000 } = opts;

  const rows = await prisma.collectionRecord.findMany({
    where: {
      organizationId: orgId,
      ...(fromDate || toDate ? {
        collectionDate: {
          ...(fromDate ? { gte: fromDate } : {}),
          ...(toDate   ? { lte: toDate   } : {}),
        },
      } : {}),
    },
    select: {
      id:              true,
      organizationId:  true,
      comprobanteCode: true,
      documentNumber:  true,
      collectionDate:  true,
      customerNit:     true,
      customerName:    true,
      amount:          true,
      currency:        true,
      bankReference:   true,
      appliedStatus:   true,
      appliedFacts:    true,
      erpMovId:        true,
    },
    orderBy: { collectionDate: "desc" },
    take:    limit,
  });

  return rows.map(r => buildNodeFromCollectionRecord(r as CollectionRecordInput));
}
