/**
 * lib/comercial/pedidos/sag-invoice-sync-service.ts
 *
 * SAG → Agentik invoice reading and linking.
 *
 * V1: Normalization + linking logic ready.
 *     Actual SAG reads require integration connection.
 *
 * SERVER ONLY — never import from client components.
 *
 * Sprint: COMERCIAL-PEDIDOS-CORE-ARCHITECTURE-04
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import type { OrderDraft, OrderHeader } from "./order-types";
import type {
  SagNormalizedInvoice,
  SagInvoiceLine,
  InvoiceLinkResult,
} from "./sag-invoice-sync-types";

// ── Constants ─────────────────────────────────────────────────────────────────

const MODULE    = "comercial";
const OPERATION = "COMERCIAL_ORDER_DRAFT";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execDb = () => (prisma as any).agentExecution;

// ── List invoices for an order ───────────────────────────────────────────────
// V1: Searches by externalSyncKey in order metadata.
// V2: Will query SAG API.

export async function listSagInvoicesForOrder(
  _orgId:  string,
  order:   OrderDraft,
): Promise<SagNormalizedInvoice[]> {
  // V1: No SAG connection — return empty
  // When SAG is connected, this will:
  // 1. Query SAG by externalSyncKey
  // 2. Query SAG by sagOrderId
  // 3. Normalize results
  void order;
  return [];
}

// ── Find invoice by external sync key ────────────────────────────────────────

export async function findInvoiceByExternalSyncKey(
  _orgId:          string,
  _externalSyncKey: string,
): Promise<SagNormalizedInvoice | null> {
  // V1: No SAG connection
  return null;
}

// ── Find invoice by customer and date ────────────────────────────────────────

export async function findInvoiceByCustomerAndDate(
  _orgId:        string,
  _customerCode: string,
  _date:         string,
): Promise<SagNormalizedInvoice[]> {
  // V1: No SAG connection
  return [];
}

// ── Normalize raw SAG invoice data ───────────────────────────────────────────

export function normalizeSagInvoice(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any,
): SagNormalizedInvoice | null {
  if (!raw) return null;

  const lines: SagInvoiceLine[] = (raw.lines ?? raw.items ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (l: any) => ({
      referenceCode: String(l.referenceCode ?? l.reference ?? l.ref ?? ""),
      productName:   String(l.productName ?? l.description ?? ""),
      size:          String(l.size ?? l.talla ?? ""),
      color:         String(l.color ?? ""),
      quantity:      Number(l.quantity ?? l.qty ?? 0),
      unitPrice:     Number(l.unitPrice ?? l.price ?? 0),
      lineTotal:     Number(l.lineTotal ?? l.total ?? 0),
    }),
  );

  return {
    invoiceId:       String(raw.invoiceId ?? raw.id ?? ""),
    invoiceNumber:   String(raw.invoiceNumber ?? raw.number ?? ""),
    customerCode:    String(raw.customerCode ?? raw.clientCode ?? ""),
    sellerCode:      String(raw.sellerCode ?? raw.vendorCode ?? ""),
    date:            String(raw.date ?? raw.invoiceDate ?? ""),
    totalValue:      Number(raw.totalValue ?? raw.total ?? 0),
    lines,
    linkedOrderId:   raw.linkedOrderId ?? null,
    externalSyncKey: raw.externalSyncKey ?? null,
  };
}

// ── Link invoice to order ────────────────────────────────────────────────────
// Updates the order's sagInvoiceIds to include this invoice.

export async function linkInvoiceToOrder(
  orgId:     string,
  orderId:   string,
  invoiceId: string,
  method:    InvoiceLinkResult["matchMethod"],
): Promise<InvoiceLinkResult> {
  const now = new Date().toISOString();

  try {
    const row = await execDb().findFirst({
      where: {
        id:        orderId,
        tenantId:  orgId,
        module:    MODULE,
        operation: OPERATION,
      },
    });

    if (!row) {
      return { linked: false, orderId, invoiceId, matchMethod: method, linkedAt: now };
    }

    const meta = (row.metadataJson ?? {}) as Record<string, unknown>;
    const existingInvoices = (meta.sagInvoiceIds as string[]) ?? [];

    if (existingInvoices.includes(invoiceId)) {
      // Already linked
      return { linked: true, orderId, invoiceId, matchMethod: method, linkedAt: now };
    }

    const updatedInvoices = [...existingInvoices, invoiceId];

    await execDb().update({
      where: { id: orderId },
      data: {
        metadataJson: {
          ...meta,
          sagInvoiceIds: updatedInvoices,
          updatedAt:     now,
        },
      },
    });

    return { linked: true, orderId, invoiceId, matchMethod: method, linkedAt: now };
  } catch {
    return { linked: false, orderId, invoiceId, matchMethod: method, linkedAt: now };
  }
}
