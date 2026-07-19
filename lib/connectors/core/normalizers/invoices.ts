/**
 * Invoice normalizer — helpers for building UnifiedInvoice records.
 */

import type { InvoiceLineItem, InvoiceStatus, UnifiedInvoice } from "../types";

// ── Status mapping ────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, InvoiceStatus> = {
  // English
  draft:     "draft",
  issued:    "issued",
  sent:      "sent",
  open:      "issued",
  paid:      "paid",
  partial:   "partial",
  overdue:   "overdue",
  past_due:  "overdue",
  cancelled: "cancelled",
  canceled:  "cancelled",
  voided:    "voided",
  void:      "voided",
  // Spanish
  borrador:  "draft",
  emitida:   "issued",
  enviada:   "sent",
  pagada:    "paid",
  parcial:   "partial",
  vencida:   "overdue",
  anulada:   "cancelled",
};

export function normalizeInvoiceStatus(raw: string | null | undefined): InvoiceStatus {
  if (!raw) return "draft";
  return STATUS_MAP[raw.trim().toLowerCase()] ?? "draft";
}

// ── Line item builder ─────────────────────────────────────────────────────────

export function buildInvoiceLineItem(
  input: Required<Pick<InvoiceLineItem, "description" | "quantity" | "unitPrice" | "total">>
       & Partial<Omit<InvoiceLineItem, "description" | "quantity" | "unitPrice" | "total">>
): InvoiceLineItem {
  return {
    description:  input.description,
    productCode:  input.productCode,
    quantity:     input.quantity,
    unitPrice:    input.unitPrice,
    discount:     input.discount ?? 0,
    taxRate:      input.taxRate,
    taxAmount:    input.taxAmount,
    total:        input.total,
  };
}

// ── Invoice builder ───────────────────────────────────────────────────────────

type InvoiceInput =
  Omit<UnifiedInvoice, "subtotal" | "taxTotal" | "discountTotal">
  & { subtotal?: number; taxTotal?: number; discountTotal?: number };

export function buildInvoice(input: InvoiceInput): UnifiedInvoice {
  const items        = input.lineItems     ?? [];
  const subtotal     = input.subtotal      ?? items.reduce((s, l) => s + l.total,             0);
  const taxTotal     = input.taxTotal      ?? items.reduce((s, l) => s + (l.taxAmount  ?? 0), 0);
  const discountTotal = input.discountTotal ?? items.reduce((s, l) => s + (l.discount   ?? 0), 0);

  return { ...input, lineItems: items, subtotal, taxTotal, discountTotal };
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface InvoiceValidation {
  valid:    boolean;
  warnings: string[];
}

export function validateInvoice(inv: UnifiedInvoice): InvoiceValidation {
  const w: string[] = [];
  if (!inv.sourceId)      w.push("missing sourceId");
  if (!inv.invoiceNumber) w.push("missing invoiceNumber");
  if (!inv.customerName)  w.push("missing customerName");
  if (!inv.issueDate)     w.push("missing issueDate");
  if (inv.total < 0)      w.push(`negative total: ${inv.total}`);
  return { valid: w.length === 0, warnings: w };
}
