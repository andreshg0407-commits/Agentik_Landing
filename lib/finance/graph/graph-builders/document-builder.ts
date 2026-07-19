/**
 * lib/finance/graph/graph-builders/document-builder.ts
 *
 * AGENTIK-FINANCIAL-GRAPH-01
 *
 * Converts a Document Prisma result into a FinancialNode.
 * Document = DIAN-validated / uploaded financial documents (facturas, notas, etc.)
 */

import type { FinancialNode, FinancialDocumentType } from "../graph-types";
import { computeNodeStatus } from "../graph-status";

/** DocumentType enum values relevant to finance graph. */
const FINANCIAL_DOC_TYPES = new Set([
  "FACTURA_VENTA", "FACTURA_COMPRA", "NOTA_CREDITO", "NOTA_DEBITO",
  "RECIBO_CAJA", "COMPROBANTE_EGRESO", "EXTRACTO_BANCARIO", "ESTADO_CUENTA",
]);

/** Map Document.type → FinancialDocumentType. */
function mapDocumentType(docType: string): FinancialDocumentType {
  switch (docType) {
    case "FACTURA_VENTA":
    case "FACTURA_COMPRA":   return "FACTURA";
    case "NOTA_CREDITO":     return "NOTA_CREDITO";
    case "NOTA_DEBITO":      return "NOTA_DEBITO";
    case "RECIBO_CAJA":      return "RECIBO_CAJA";
    case "COMPROBANTE_EGRESO": return "EGRESO";
    case "EXTRACTO_BANCARIO":
    case "ESTADO_CUENTA":    return "CONSIGNACION";
    default:                 return "DESCONOCIDO";
  }
}

/** Minimal Document shape needed by the builder. */
export interface DocumentInput {
  id:            string;
  organizationId: string;
  type:          string;
  status:        string; // DocumentStatus
  issuerName:    string | null;
  issuerId:      string | null;  // NIT
  receiverName:  string | null;
  amount:        { toNumber(): number } | number | null;
  currency:      string | null;
  documentDate:  Date | null;
}

function toNumber(v: { toNumber(): number } | number | null): number {
  if (v === null) return 0;
  return typeof v === "number" ? v : v.toNumber();
}

export function buildNodeFromDocument(r: DocumentInput): FinancialNode | null {
  // Only include financial document types in the graph
  if (!FINANCIAL_DOC_TYPES.has(r.type)) return null;

  const amount   = toNumber(r.amount);
  const docType  = mapDocumentType(r.type);
  const date     = r.documentDate ?? new Date();

  const status = computeNodeStatus({
    hasAmount:     amount > 0,
    hasDate:       !!r.documentDate,
    hasEntityId:   !!r.issuerId,
    hasReference:  false,
    isBankRelated: docType === "CONSIGNACION",
  });

  const period = {
    year:  date.getFullYear(),
    month: date.getMonth() + 1,
  };

  return {
    id:           `DOC:${r.id}`,
    orgId:        r.organizationId,
    docType,
    sourceSystem: "DIAN",
    sourceId:     r.id,
    referenceCode: undefined,
    entityNit:    r.issuerId ?? undefined,
    entityName:   r.issuerName ?? r.receiverName ?? undefined,
    amount,
    currency:     r.currency ?? "COP",
    date,
    period,
    status,
    metadata: {
      documentType:   r.type,
      documentStatus: r.status,
      issuerName:     r.issuerName,
      receiverName:   r.receiverName,
    },
    inEdgeIds:  [],
    outEdgeIds: [],
  };
}
