/**
 * lib/finance/graph/graph-resolvers/bank-resolver.ts
 *
 * AGENTIK-FINANCIAL-GRAPH-01 — Phase 8: Banking preparation.
 *
 * BankAccount and BankMovement Prisma models do not exist yet.
 * This resolver returns SYNC_PENDING placeholder nodes derived from
 * CollectionRecord rows that have a bankReference (consignaciones).
 *
 * When BankAccount/BankMovement models are created, this resolver
 * will be updated to query them directly.
 *
 * NEVER returns fake bank balances.
 */

import { prisma } from "@/lib/prisma";
import type { FinancialNode } from "../graph-types";

export interface BankResolverOptions {
  orgId:     string;
  fromDate?: Date;
  toDate?:   Date;
}

/**
 * Returns SYNC_PENDING nodes for consignaciones (CollectionRecord with bankReference).
 * These represent expected bank deposit entries awaiting direct bank confirmation.
 *
 * When BankAccount model is available: replace with direct bank query.
 */
export async function resolveBankNodes(
  opts: BankResolverOptions,
): Promise<FinancialNode[]> {
  const { orgId, fromDate, toDate } = opts;

  // Consignaciones = CollectionRecord with a bankReference
  const consignaciones = await prisma.collectionRecord.findMany({
    where: {
      organizationId: orgId,
      bankReference:  { not: null },
      ...(fromDate || toDate ? {
        collectionDate: {
          ...(fromDate ? { gte: fromDate } : {}),
          ...(toDate   ? { lte: toDate   } : {}),
        },
      } : {}),
    },
    select: {
      id:             true,
      organizationId: true,
      collectionDate: true,
      amount:         true,
      currency:       true,
      bankReference:  true,
      customerNit:    true,
      customerName:   true,
    },
    take: 500,
  });

  return consignaciones.map(r => {
    const amount = typeof r.amount === "number" ? r.amount : r.amount.toNumber();
    const period = {
      year:  r.collectionDate.getFullYear(),
      month: r.collectionDate.getMonth() + 1,
    };
    return {
      id:           `BANK_PENDING:${r.id}`,
      orgId:        r.organizationId,
      docType:      "CONSIGNACION" as const,
      sourceSystem: "BANK" as const,
      sourceId:     r.id,
      referenceCode: r.bankReference ?? undefined,
      entityNit:    r.customerNit ?? undefined,
      entityName:   r.customerName ?? undefined,
      amount,
      currency:     r.currency,
      date:         r.collectionDate,
      period,
      // SYNC_PENDING: bank statement not yet integrated — no direct confirmation
      status:       "SYNC_PENDING" as const,
      metadata: {
        note:          "BankAccount model not yet created. Derived from CollectionRecord.bankReference.",
        bankReference: r.bankReference,
        sourceRecordId: r.id,
      },
      inEdgeIds:  [],
      outEdgeIds: [],
    };
  });
}
