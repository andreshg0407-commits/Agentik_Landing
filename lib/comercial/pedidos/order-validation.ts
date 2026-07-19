/**
 * lib/comercial/pedidos/order-validation.ts
 *
 * Pure domain validation for the Pedidos module.
 * No Prisma, no server-only imports — runs on client and server.
 *
 * Sprint: COMERCIAL-PEDIDOS-CREATOR-01
 * Sprint: ORDER-CREATION-POLISH-01
 */

import type {
  OrderDraft,
  OrderHeader,
  OrderLine,
  OrderSummary,
  OrderValidationIssue,
  DiscountType,
  OrderValidationResult,
  OrderCopilotSignal,
} from "./order-types";
import {
  evaluateOrderFulfillment,
  buildFulfillmentDavidMessage,
} from "./order-fulfillment";

// ---------------------------------------------------------------------------
// Header validation
// ---------------------------------------------------------------------------

export function validateHeader(header: OrderHeader): OrderValidationIssue[] {
  const issues: OrderValidationIssue[] = [];

  if (!header.customerName?.trim()) {
    issues.push({
      field: "customerName",
      message: "El nombre del cliente es obligatorio.",
      severity: "error",
    });
  }

  if (!header.customerCode?.trim()) {
    issues.push({
      field: "customerCode",
      message: "El código de cliente es obligatorio para enviar a SAG.",
      severity: "error",
    });
  }

  if (!header.sellerName?.trim()) {
    issues.push({
      field: "sellerName",
      message: "El vendedor es obligatorio.",
      severity: "error",
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Lines validation
// ---------------------------------------------------------------------------

export function validateLines(lines: OrderLine[]): OrderValidationIssue[] {
  const issues: OrderValidationIssue[] = [];

  const activeLines = lines.filter((l) => !l.removed);

  if (activeLines.length === 0) {
    issues.push({
      field: "lines",
      message: "El pedido debe tener al menos una línea activa.",
      severity: "error",
    });
    // No further per-line checks needed when there are no active lines.
    return issues;
  }

  let hasUnsyncedInventory = false;

  for (const line of activeLines) {
    if (!line.referenceCode?.trim()) {
      issues.push({
        field: `line.${line.id}.referenceCode`,
        message: `Una línea no tiene referencia asignada.`,
        severity: "error",
      });
    }

    if (!line.size?.trim()) {
      issues.push({
        field: `line.${line.id}.size`,
        message: `La línea "${line.referenceCode || line.id}" no tiene talla asignada.`,
        severity: "error",
      });
    }

    if (!line.color?.trim()) {
      issues.push({
        field: `line.${line.id}.color`,
        message: `La línea "${line.referenceCode || line.id}" no tiene color asignado.`,
        severity: "error",
      });
    }

    if (!line.quantity || line.quantity <= 0) {
      issues.push({
        field: `line.${line.id}.quantity`,
        message: `La línea "${line.referenceCode || line.id}" debe tener una cantidad mayor a 0.`,
        severity: "error",
      });
    }

    if (line.availableUnits === null) {
      hasUnsyncedInventory = true;
    } else if (line.quantity > line.availableUnits) {
      issues.push({
        field: `line.${line.id}.quantity`,
        message: `La línea "${line.referenceCode || line.id}" supera el inventario disponible (${line.availableUnits} uds).`,
        severity: "warning",
      });
    }
  }

  if (hasUnsyncedInventory) {
    issues.push({
      field: "lines.inventory",
      message:
        "Algunas lineas no tienen disponibilidad validada. Las cantidades pueden no ser exactas.",
      severity: "warning",
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Totals validation
// ---------------------------------------------------------------------------

export function validateTotals(summary: OrderSummary): OrderValidationIssue[] {
  const issues: OrderValidationIssue[] = [];

  if (summary.totalValue <= 0) {
    issues.push({
      field: "summary.totalValue",
      message: "El valor total del pedido debe ser mayor a 0.",
      severity: "error",
    });
  }

  if (summary.totalUnits <= 0) {
    issues.push({
      field: "summary.totalUnits",
      message: "El total de unidades del pedido debe ser mayor a 0.",
      severity: "error",
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Summary computation
// ---------------------------------------------------------------------------

export function computeOrderSummary(
  lines: OrderLine[],
  discount?: { type?: DiscountType; value?: number },
): OrderSummary {
  const activeLines = lines.filter((l) => !l.removed);

  const totalUnits = activeLines.reduce((acc, l) => acc + (l.quantity ?? 0), 0);
  const totalValue = activeLines.reduce((acc, l) => acc + (l.lineTotal ?? 0), 0);

  const uniqueReferences = new Set(
    activeLines.map((l) => l.referenceCode).filter(Boolean)
  ).size;

  // Discount calculation (ORDER-CREATION-POLISH-01)
  let discountAmount = 0;
  if (discount?.value && discount.value > 0) {
    if (discount.type === "percentage") {
      discountAmount = Math.round(totalValue * (discount.value / 100));
    } else if (discount.type === "fixed") {
      discountAmount = Math.round(discount.value);
    }
  }
  // Never allow negative total
  const totalFinal = Math.max(0, totalValue - discountAmount);

  return {
    totalLines: lines.length,
    activeLines: activeLines.length,
    totalUnits,
    totalValue,
    uniqueReferences,
    discountAmount,
    totalFinal,
  };
}

// ---------------------------------------------------------------------------
// Root validation
// ---------------------------------------------------------------------------

export function validateOrder(draft: OrderDraft): OrderValidationResult {
  const headerIssues = validateHeader(draft.header);
  const lineIssues = validateLines(draft.lines);
  const summary = computeOrderSummary(draft.lines);
  const totalIssues = validateTotals(summary);

  const issues: OrderValidationIssue[] = [
    ...headerIssues,
    ...lineIssues,
    ...totalIssues,
  ];

  const hasErrors = issues.some((i) => i.severity === "error");

  return {
    valid: !hasErrors,
    issues,
    canSubmit: !hasErrors,
  };
}

// ---------------------------------------------------------------------------
// Copilot signals (David)
// ---------------------------------------------------------------------------

export function buildOrderDavidSignals(draft: OrderDraft): OrderCopilotSignal[] {
  const signals: OrderCopilotSignal[] = [];

  const fulfillment = evaluateOrderFulfillment(draft);

  // Primary signal: fulfillment status
  signals.push({
    message: buildFulfillmentDavidMessage(fulfillment),
    type: fulfillment.status === "ready" ? "validation_ok"
        : fulfillment.status === "blocked" ? "inventory_warning"
        : "general",
    priority: 1,
  });

  // Secondary: low stock warning
  if (fulfillment.lowStockLines > 0) {
    signals.push({
      message: `${fulfillment.lowStockLines} ${fulfillment.lowStockLines === 1 ? "referencia con ultimas unidades" : "referencias con ultimas unidades"}.`,
      type: "general",
      priority: 2,
    });
  }

  // SAG import positive note
  if (draft.origin === "sag" && fulfillment.totalLines > 0 && fulfillment.status === "ready") {
    signals.push({
      message: "Pedido importado con lineas completas.",
      type: "validation_ok",
      priority: 3,
    });
  }

  return signals.sort((a, b) => a.priority - b.priority).slice(0, 3);
}
