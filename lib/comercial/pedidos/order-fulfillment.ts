/**
 * lib/comercial/pedidos/order-fulfillment.ts
 *
 * Fulfillment evaluation engine for Pedidos.
 * Pure domain logic — no Prisma, no server-only imports.
 * Runs on client and server.
 *
 * Sprint: COMERCIAL-PEDIDOS-DAVID-STOCK-03
 */

import type { OrderDraft, OrderLine } from "./order-types";
import { CASTILLITOS_STOCK_THRESHOLDS } from "./order-policy-pack-config";

// ── Types ────────────────────────────────────────────────────────────────────

export type LineFulfillmentStatus =
  | "available"
  | "low_stock"
  | "partial"
  | "out_of_stock"
  | "inventory_unknown";

export type OrderFulfillmentGrade =
  | "ready"
  | "partial"
  | "blocked"
  | "unknown";

export interface LineFulfillment {
  lineId: string;
  referenceCode: string;
  productName: string;
  size: string;
  color: string;
  status: LineFulfillmentStatus;
  requestedQty: number;
  availableQty: number | null;
  deficitQty: number;
}

export interface OrderFulfillmentSummary {
  status: OrderFulfillmentGrade;
  totalLines: number;
  availableLines: number;
  lowStockLines: number;
  partialLines: number;
  blockedLines: number;
  unknownLines: number;
  completionPercent: number;
  lines: LineFulfillment[];
}

// ── Line evaluation ──────────────────────────────────────────────────────────

function evaluateLineFulfillment(line: OrderLine): LineFulfillment {
  const base = {
    lineId: line.id,
    referenceCode: line.referenceCode,
    productName: line.productName,
    size: line.size,
    color: line.color,
    requestedQty: line.quantity,
    availableQty: line.availableUnits,
  };

  if (line.availableUnits === null) {
    return { ...base, status: "inventory_unknown", deficitQty: 0 };
  }

  if (line.availableUnits <= 0) {
    return { ...base, status: "out_of_stock", deficitQty: line.quantity };
  }

  if (line.availableUnits < line.quantity) {
    return {
      ...base,
      status: "partial",
      deficitQty: line.quantity - line.availableUnits,
    };
  }

  if (line.availableUnits <= CASTILLITOS_STOCK_THRESHOLDS.lowStockUnits) {
    return { ...base, status: "low_stock", deficitQty: 0 };
  }

  return { ...base, status: "available", deficitQty: 0 };
}

// ── Order evaluation ─────────────────────────────────────────────────────────

export function evaluateOrderFulfillment(draft: OrderDraft): OrderFulfillmentSummary {
  const activeLines = draft.lines.filter((l) => !l.removed);
  const lines = activeLines.map(evaluateLineFulfillment);

  const availableLines = lines.filter((l) => l.status === "available").length;
  const lowStockLines = lines.filter((l) => l.status === "low_stock").length;
  const partialLines = lines.filter((l) => l.status === "partial").length;
  const blockedLines = lines.filter((l) => l.status === "out_of_stock").length;
  const unknownLines = lines.filter((l) => l.status === "inventory_unknown").length;
  const totalLines = lines.length;

  // Completion: lines that can be fully dispatched / total
  const dispatchable = availableLines + lowStockLines;
  const completionPercent =
    totalLines > 0 ? Math.round((dispatchable / totalLines) * 100) : 0;

  let status: OrderFulfillmentGrade;
  if (totalLines === 0) {
    status = "unknown";
  } else if (unknownLines === totalLines) {
    status = "unknown";
  } else if (blockedLines > 0) {
    status = "blocked";
  } else if (partialLines > 0) {
    status = "partial";
  } else {
    status = "ready";
  }

  return {
    status,
    totalLines,
    availableLines,
    lowStockLines,
    partialLines,
    blockedLines,
    unknownLines,
    completionPercent,
    lines,
  };
}

// ── Sort lines by priority (blocked first) ───────────────────────────────────

const PRIORITY: Record<LineFulfillmentStatus, number> = {
  out_of_stock: 0,
  partial: 1,
  low_stock: 2,
  inventory_unknown: 3,
  available: 4,
};

export function sortFulfillmentLines(lines: LineFulfillment[]): LineFulfillment[] {
  return [...lines].sort((a, b) => PRIORITY[a.status] - PRIORITY[b.status]);
}

// ── David fulfillment signals ────────────────────────────────────────────────

export function buildFulfillmentDavidMessage(summary: OrderFulfillmentSummary): string {
  switch (summary.status) {
    case "ready":
      return `Pedido despachable al ${summary.completionPercent}%.`;
    case "partial":
      return `Pedido despachable al ${summary.completionPercent}%. ${summary.partialLines} ${summary.partialLines === 1 ? "referencia con inventario parcial" : "referencias con inventario parcial"}.`;
    case "blocked":
      return `${summary.blockedLines} ${summary.blockedLines === 1 ? "referencia agotada" : "referencias agotadas"}. Pedido despachable al ${summary.completionPercent}%.`;
    case "unknown":
      return "No hay suficiente informacion de inventario para evaluar el pedido.";
  }
}
