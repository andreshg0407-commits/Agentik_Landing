/**
 * lib/comercial/demand/order-invoice-conversion.ts
 *
 * Order → Invoice conversion engine.
 *
 * Measures what percentage of PD (pending orders) got converted to real invoices
 * (OFICIAL or REMISION source types).
 *
 * Matching strategy (deterministic — no AI):
 *   1. EXACT: match by ref + same 7-day window (exact doc number in V2)
 *   2. PROBABLE: match by ref within a ±7-day date window
 *   3. UNRESOLVED: PD has no matching invoice in the window
 *
 * In V1 (availability snapshot only):
 *   PD qty = RawAvailabilityRecord.pedidos
 *   Invoiced qty = sum of SagSaleHint.units for OFICIAL+REMISION hints (same ref)
 *   Confidence = "probable" (no document-level match available)
 *
 * Server-only — no Prisma directly. Receives pre-loaded data.
 *
 * Sprint: AGENTIK-SAG-PD-DEMAND-LAYER-01
 */

import type {
  OrderInvoiceConversionSummary,
  OrderInvoiceConversionByRef,
  ConversionStatus,
  ConversionConfidence,
} from "./demand-types";
import type { CommercialCaseLine } from "../maletas/maletas-types";
import type { SagSaleHint } from "../maletas/maletas-intelligence-types";
import type { RawAvailabilityRecord } from "../maletas/maletas-types";

// ─── Per-ref input ─────────────────────────────────────────────────────────────

interface RefConversionInput {
  reference:   string;
  productName: string;
  line:        CommercialCaseLine;
  pedidoQty:   number;             // from RawAvailabilityRecord.pedidos
  saleHints:   SagSaleHint[];      // OFICIAL + REMISION hints for this ref
}

// ─── Matching helpers ─────────────────────────────────────────────────────────

function computeConversionStatus(
  pedidoQty: number,
  facturadoQty: number,
): ConversionStatus {
  if (pedidoQty <= 0)        return "unknown";
  if (facturadoQty <= 0)     return "pending";
  if (facturadoQty >= pedidoQty) return "invoiced";
  return "partially_invoiced";
}

function computeConversionConfidence(
  pedidoQty: number,
  facturadoQty: number,
  hasSaleData: boolean,
): ConversionConfidence {
  if (!hasSaleData) return "unresolved";
  if (pedidoQty > 0 && facturadoQty >= pedidoQty) return "probable"; // V1: no document match
  if (facturadoQty > 0) return "probable";
  return "unresolved";
}

// ─── Per-ref conversion ────────────────────────────────────────────────────────

function computeRefConversion(input: RefConversionInput): OrderInvoiceConversionByRef {
  const { reference, productName, line, pedidoQty } = input;

  // Sum invoiced units from OFICIAL + REMISION hints (exclude PD)
  const invoiceHints = input.saleHints.filter(
    (h) => h.sourceType === "OFICIAL" || h.sourceType === "REMISION",
  );
  const facturadoQty = invoiceHints.reduce((acc, h) => acc + (h.units ?? 0), 0);

  const conversionPct =
    pedidoQty > 0 ? Math.min(100, Math.round((facturadoQty / pedidoQty) * 100)) : 0;

  const pendingQty = Math.max(0, pedidoQty - facturadoQty);

  return {
    reference,
    productName,
    line,
    pedidoQty,
    facturadoQty,
    conversionPct,
    pendingQty,
    conversionStatus:    computeConversionStatus(pedidoQty, facturadoQty),
    conversionConfidence: computeConversionConfidence(pedidoQty, facturadoQty, invoiceHints.length > 0),
  };
}

// ─── Main conversion engine ────────────────────────────────────────────────────

/**
 * Compute the full order → invoice conversion summary.
 *
 * @param orgId         — organization scope
 * @param availability  — availability map (source of PD / pedidos quantities)
 * @param saleHints     — SAG sale hints (OFICIAL + REMISION + PD); PD filtered internally
 * @param catalogueRefs — which refs are in the maleta (with line and description)
 * @param windowDays    — analysis window (default: 30 days)
 */
export function computeOrderInvoiceConversion(
  orgId: string,
  availability: Map<string, RawAvailabilityRecord>,
  saleHints: SagSaleHint[],
  catalogueRefs: Map<string, { name: string; line: CommercialCaseLine }>,
  windowDays = 30,
): OrderInvoiceConversionSummary {
  const computedAt = new Date().toISOString();

  // Group sale hints by refCode
  const hintsByRef = new Map<string, SagSaleHint[]>();
  for (const hint of saleHints) {
    const key = hint.refCode.toUpperCase();
    if (!hintsByRef.has(key)) hintsByRef.set(key, []);
    hintsByRef.get(key)!.push(hint);
  }

  const byReference: OrderInvoiceConversionByRef[] = [];

  // Track refs that have invoices but no PD (invoice_without_order)
  const invoicedRefs = new Set<string>();
  for (const hint of saleHints) {
    if (hint.sourceType === "OFICIAL" || hint.sourceType === "REMISION") {
      invoicedRefs.add(hint.refCode.toUpperCase());
    }
  }

  for (const [refUpper, meta] of catalogueRefs) {
    const avail    = availability.get(refUpper);
    const pedidoQty = avail?.pedidos ?? 0;

    // Only include refs that have pending orders OR invoices in window
    const hints = hintsByRef.get(refUpper) ?? [];
    if (pedidoQty === 0 && hints.length === 0) continue;

    byReference.push(
      computeRefConversion({
        reference:   refUpper,
        productName: meta.name,
        line:        meta.line,
        pedidoQty,
        saleHints:   hints,
      }),
    );

    // If ref has invoices, remove from "no PD" tracking
    invoicedRefs.delete(refUpper);
  }

  // Global totals
  const totalPedidoQty       = byReference.reduce((a, r) => a + r.pedidoQty, 0);
  const totalFacturadoQty    = byReference.reduce((a, r) => a + r.facturadoQty, 0);
  const conversionPct        =
    totalPedidoQty > 0
      ? Math.min(100, Math.round((totalFacturadoQty / totalPedidoQty) * 100))
      : 0;
  const pendingQty           = byReference.reduce((a, r) => a + r.pendingQty, 0);
  const unconvertedQty       = byReference
    .filter((r) => r.conversionStatus === "pending")
    .reduce((a, r) => a + r.pendingQty, 0);
  const partiallyInvoicedQty = byReference
    .filter((r) => r.conversionStatus === "partially_invoiced")
    .reduce((a, r) => a + r.pendingQty, 0);

  // By line
  const ltRefs = byReference.filter((r) => r.line === "LT");
  const csRefs = byReference.filter((r) => r.line === "CS");

  const ltPedido    = ltRefs.reduce((a, r) => a + r.pedidoQty, 0);
  const ltFacturado = ltRefs.reduce((a, r) => a + r.facturadoQty, 0);
  const csPedido    = csRefs.reduce((a, r) => a + r.pedidoQty, 0);
  const csFacturado = csRefs.reduce((a, r) => a + r.facturadoQty, 0);

  const byLine: OrderInvoiceConversionSummary["byLine"] = {
    LT: {
      pedidoQty:    ltPedido,
      facturadoQty: ltFacturado,
      conversionPct: ltPedido > 0 ? Math.round((ltFacturado / ltPedido) * 100) : 0,
    },
    CS: {
      pedidoQty:    csPedido,
      facturadoQty: csFacturado,
      conversionPct: csPedido > 0 ? Math.round((csFacturado / csPedido) * 100) : 0,
    },
  };

  return {
    organizationId:       orgId,
    computedAt,
    windowDays,
    totalPedidoQty,
    totalFacturadoQty,
    conversionPct,
    pendingQty,
    unconvertedQty,
    partiallyInvoicedQty,
    byReference:          byReference.sort((a, b) => b.pedidoQty - a.pedidoQty),
    bySalesRep:           [], // V2: populate from SagSaleHint.sellerSagName → salesRep mapping
    byLine,
    invoicesWithoutOrder: [...invoicedRefs],
  };
}

// ─── Quick pending map from conversion ───────────────────────────────────────

/**
 * Extract a ref → pendingQty map from a conversion summary.
 * Useful for wiring into coverage / production pressure engines.
 */
export function buildPendingQtyFromConversion(
  summary: OrderInvoiceConversionSummary,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of summary.byReference) {
    if (row.pendingQty > 0) {
      map.set(row.reference.toUpperCase(), row.pendingQty);
    }
  }
  return map;
}
