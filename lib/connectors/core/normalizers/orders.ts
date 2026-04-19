/**
 * Order normalizer — helpers for building UnifiedOrder records.
 *
 * Adapters use these to convert raw source records into the canonical shape:
 *
 *   import { buildOrder, normalizeOrderStatus } from ".../normalizers/orders";
 *
 *   async pullOrders(cursor?) {
 *     const raw = await this.api.getOrders({ since: cursor });
 *     return {
 *       records:    raw.orders.map(r => buildOrder({ ... })),
 *       nextCursor: raw.nextPage ?? null,
 *       hasMore:    raw.hasMore,
 *       totalCount: raw.total ?? null,
 *     };
 *   }
 */

import type { OrderLineItem, OrderStatus, UnifiedOrder } from "../types";

// ── Status mapping ────────────────────────────────────────────────────────────

/** Maps known raw status strings → canonical OrderStatus. */
const STATUS_MAP: Record<string, OrderStatus> = {
  // English
  pending:    "pending",
  open:       "pending",
  confirmed:  "confirmed",
  approved:   "confirmed",
  processing: "processing",
  in_process: "processing",
  fulfilled:  "fulfilled",
  shipped:    "fulfilled",
  delivered:  "fulfilled",
  completed:  "fulfilled",
  closed:     "fulfilled",
  cancelled:  "cancelled",
  canceled:   "cancelled",
  voided:     "cancelled",
  refunded:   "refunded",
  on_hold:    "on_hold",
  hold:       "on_hold",
  // Spanish (SAG PYA, Siigo, Odoo ES)
  pendiente:       "pending",
  confirmado:      "confirmed",
  "en proceso":    "processing",
  enviado:         "fulfilled",
  entregado:       "fulfilled",
  completado:      "fulfilled",
  anulado:         "cancelled",
  cancelado:       "cancelled",
  reembolsado:     "refunded",
  "en espera":     "on_hold",
};

/**
 * Normalise an arbitrary status string to a canonical OrderStatus.
 * Unknown values fall back to "pending".
 */
export function normalizeOrderStatus(raw: string | null | undefined): OrderStatus {
  if (!raw) return "pending";
  const key = raw.trim().toLowerCase().replace(/[-\s]+/g, "_");
  return STATUS_MAP[key] ?? STATUS_MAP[raw.trim().toLowerCase()] ?? "pending";
}

// ── Line item builder ─────────────────────────────────────────────────────────

/** Construct an OrderLineItem with sane defaults. */
export function buildLineItem(
  input: Required<Pick<OrderLineItem, "productName" | "quantity" | "unitPrice" | "total">>
       & Partial<Omit<OrderLineItem,  "productName" | "quantity" | "unitPrice" | "total">>
): OrderLineItem {
  return {
    sku:         input.sku,
    productId:   input.productId,
    productName: input.productName,
    variantName: input.variantName,
    quantity:    input.quantity,
    unitPrice:   input.unitPrice,
    discount:    input.discount ?? 0,
    tax:         input.tax,
    total:       input.total,
  };
}

// ── Order builder ─────────────────────────────────────────────────────────────

type OrderInput =
  Omit<UnifiedOrder, "subtotal" | "discountTotal" | "taxTotal">
  & { subtotal?: number; discountTotal?: number; taxTotal?: number };

/**
 * Build a UnifiedOrder, computing aggregate totals from lineItems when
 * subtotal / discountTotal / taxTotal are not explicitly provided.
 */
export function buildOrder(input: OrderInput): UnifiedOrder {
  const items        = input.lineItems ?? [];
  const subtotal     = input.subtotal     ?? items.reduce((s, l) => s + l.total,          0);
  const discountTotal = input.discountTotal ?? items.reduce((s, l) => s + (l.discount ?? 0), 0);
  const taxTotal     = input.taxTotal     ?? items.reduce((s, l) => s + (l.tax     ?? 0), 0);

  return { ...input, lineItems: items, subtotal, discountTotal, taxTotal };
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface OrderValidation {
  valid:    boolean;
  warnings: string[];
}

export function validateOrder(o: UnifiedOrder): OrderValidation {
  const w: string[] = [];
  if (!o.sourceId)          w.push("missing sourceId");
  if (!o.orderNumber)       w.push("missing orderNumber");
  if (!o.orderedAt)         w.push("missing orderedAt");
  if (o.total < 0)          w.push(`negative total: ${o.total}`);
  if (o.lineItems.length === 0) w.push("no line items");
  return { valid: w.length === 0, warnings: w };
}
