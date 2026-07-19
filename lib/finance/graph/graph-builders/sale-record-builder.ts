/**
 * lib/finance/graph/graph-builders/sale-record-builder.ts
 *
 * AGENTIK-FINANCIAL-GRAPH-01
 *
 * Converts a SaleRecord Prisma result into a FinancialNode.
 * SaleRecord is the primary SAG movement source — maps to RECIBO_CAJA,
 * ANTICIPO, FACTURA, POS, EGRESO depending on comprobanteCode.
 */

import type { FinancialNode } from "../graph-types";
import { resolveDocType } from "../graph-types";
import { computeNodeStatus } from "../graph-status";

/** Minimal SaleRecord shape needed by the builder (subset of Prisma model). */
export interface SaleRecordInput {
  id:              string;
  organizationId:  string;
  saleDate:        Date;
  comprobanteCode: string | null;
  comprobante:     string | null;
  customerNit:     string | null;
  customerName:    string | null;
  amount:          { toNumber(): number } | number; // Decimal or number
  currency:        string;
  sagSourceType:   string; // "OFICIAL" | "REMISION"
  storeSlug:       string;
  storeName:       string;
  productLine:     string;
}

function toNumber(v: { toNumber(): number } | number): number {
  return typeof v === "number" ? v : v.toNumber();
}

export function buildNodeFromSaleRecord(r: SaleRecordInput): FinancialNode {
  const amount       = toNumber(r.amount);
  const docType      = resolveDocType(r.comprobanteCode);
  const isBankRelated = docType === "CONSIGNACION";

  const status = computeNodeStatus({
    hasAmount:     amount > 0,
    hasDate:       true,
    hasEntityId:   !!r.customerNit,
    hasReference:  !!r.comprobante,
    isBankRelated,
  });

  const period = {
    year:  r.saleDate.getFullYear(),
    month: r.saleDate.getMonth() + 1,
  };

  return {
    id:           `SAG:${r.id}`,
    orgId:        r.organizationId,
    docType,
    sourceSystem: "SAG",
    sourceId:     r.id,
    referenceCode: r.comprobante ?? undefined,
    entityNit:    r.customerNit ?? undefined,
    entityName:   r.customerName ?? undefined,
    amount,
    currency:     r.currency,
    date:         r.saleDate,
    period,
    status,
    metadata: {
      comprobanteCode: r.comprobanteCode,
      sagSourceType:   r.sagSourceType,
      storeSlug:       r.storeSlug,
      storeName:       r.storeName,
      productLine:     r.productLine,
    },
    inEdgeIds:  [],
    outEdgeIds: [],
  };
}
