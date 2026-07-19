/**
 * lib/finance/graph/graph-resolvers/sale-resolver.ts
 *
 * AGENTIK-FINANCIAL-GRAPH-01
 *
 * Fetches SaleRecord rows for the graph from Prisma and converts to FinancialNodes.
 * Scoped to CASH comprobante codes — the financial movement subset of SaleRecord.
 */

import { prisma } from "@/lib/prisma";
import type { FinancialNode } from "../graph-types";
import {
  buildNodeFromSaleRecord,
  type SaleRecordInput,
} from "../graph-builders/sale-record-builder";

/** Comprobante codes that represent financial movements (not pure commercial). */
const FINANCIAL_COMPROBANTE_CODES = [
  // Recibos
  "R1", "R2", "RS", "RC", "RG", "RA",
  // Anticipos
  "A1", "A2", "AN", "SI",
  // Egresos
  "C1", "G1", "C2", "G2", "EG",
  // Consignaciones
  "CN",
  // Facturas
  "FV", "FA",
  // POS
  "PV", "NV",
  // Notas
  "NC", "ND",
  // Cruces
  "CR", "CRU",
];

export interface SaleResolverOptions {
  orgId:      string;
  fromDate?:  Date;
  toDate?:    Date;
  limit?:     number;
}

/**
 * Fetch financial SaleRecord nodes for the given organization.
 * Filters to FINANCIAL_COMPROBANTE_CODES only — excludes pure commercial rows.
 */
export async function resolveSaleRecordNodes(
  opts: SaleResolverOptions,
): Promise<FinancialNode[]> {
  const { orgId, fromDate, toDate, limit = 2000 } = opts;

  const rows = await prisma.saleRecord.findMany({
    where: {
      organizationId:  orgId,
      comprobanteCode: { in: FINANCIAL_COMPROBANTE_CODES },
      ...(fromDate || toDate ? {
        saleDate: {
          ...(fromDate ? { gte: fromDate } : {}),
          ...(toDate   ? { lte: toDate   } : {}),
        },
      } : {}),
    },
    select: {
      id:              true,
      organizationId:  true,
      saleDate:        true,
      comprobanteCode: true,
      comprobante:     true,
      customerNit:     true,
      customerName:    true,
      amount:          true,
      currency:        true,
      sagSourceType:   true,
      storeSlug:       true,
      storeName:       true,
      productLine:     true,
    },
    orderBy: { saleDate: "desc" },
    take:    limit,
  });

  return rows.map(r => buildNodeFromSaleRecord(r as SaleRecordInput));
}
