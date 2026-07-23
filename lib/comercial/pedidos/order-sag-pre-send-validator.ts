/**
 * lib/comercial/pedidos/order-sag-pre-send-validator.ts
 *
 * Comprehensive pre-send validation before XML generation and queue entry.
 * Runs BEFORE the bridge maps OrderDraft → SagDocumentInput.
 *
 * Returns blocking errors and non-blocking warnings.
 * A single failing blocker prevents the order from reaching the SAG queue.
 *
 * Sprint: AGENTIK-ORDERS-SAG-WRITE-ADAPTER-01
 */

import type { OrderDraft } from "./order-types";
import type { SagDateValidationConfig } from "./order-policy-pack-config";
import { CASTILLITOS_ORDER_POLICY_PACK_CONFIG } from "./order-policy-pack-config";

// ── Types ────────────────────────────────────────────────────────────────────

export type PreSendSeverity = "blocker" | "warning";

export interface PreSendIssue {
  code: string;
  field: string;
  message: string;
  severity: PreSendSeverity;
}

export interface PreSendValidationResult {
  canSend: boolean;
  issues: PreSendIssue[];
  blockerCount: number;
  warningCount: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function blocker(code: string, field: string, message: string): PreSendIssue {
  return { code, field, message, severity: "blocker" };
}

function warning(code: string, field: string, message: string): PreSendIssue {
  return { code, field, message, severity: "warning" };
}

function parseDate(s: string | undefined | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// ── Validator ────────────────────────────────────────────────────────────────

export function validatePreSend(
  order: OrderDraft,
  opts?: {
    dateConfig?: SagDateValidationConfig;
    connectorAvailable?: boolean;
    writeMode?: "DISABLED" | "SIMULATION" | "LIVE";
  },
): PreSendValidationResult {
  const issues: PreSendIssue[] = [];
  const dateConfig = opts?.dateConfig ?? CASTILLITOS_ORDER_POLICY_PACK_CONFIG.sagDateValidation;

  // ── 1. Order status ────────────────────────────────────────────────────
  if (order.status === "cancelado") {
    issues.push(blocker("CANCELLED_ORDER", "status", "El pedido está cancelado."));
  } else if (order.status !== "listo_para_enviar") {
    issues.push(blocker("NOT_READY", "status", "El pedido debe estar en estado 'Listo para enviar'."));
  }

  // ── 2. Customer identity ───────────────────────────────────────────────
  if (!order.header.customerCode?.trim()) {
    issues.push(blocker("MISSING_CUSTOMER_NIT", "header.customerCode", "El NIT del cliente es obligatorio para SAG."));
  } else if (!/^\d{9}$/.test(order.header.customerCode.trim())) {
    issues.push(blocker("INVALID_CUSTOMER_NIT", "header.customerCode",
      `NIT debe ser 9 dígitos sin puntos ni guión. Recibido: "${order.header.customerCode}".`));
  }

  if (!order.header.customerName?.trim()) {
    issues.push(blocker("MISSING_CUSTOMER_NAME", "header.customerName", "El nombre del cliente es obligatorio."));
  }

  // ── 3. Sync key ────────────────────────────────────────────────────────
  if (!order.externalSyncKey) {
    issues.push(blocker("MISSING_SYNC_KEY", "externalSyncKey", "El pedido no tiene clave de sincronización."));
  }

  // ── 4. Lines ───────────────────────────────────────────────────────────
  const activeLines = order.lines.filter(l => !l.removed);
  if (activeLines.length === 0) {
    issues.push(blocker("NO_ACTIVE_LINES", "lines", "El pedido debe tener al menos una línea activa."));
  } else {
    for (const line of activeLines) {
      if (!line.referenceCode?.trim()) {
        issues.push(blocker("MISSING_REFERENCE", `lines.${line.id}.referenceCode`,
          `Línea sin referencia SAG asignada.`));
      }
      if (!line.quantity || line.quantity <= 0) {
        issues.push(blocker("INVALID_QUANTITY", `lines.${line.id}.quantity`,
          `Línea "${line.referenceCode || line.id}": cantidad debe ser > 0.`));
      }
      if (!line.unitPrice || line.unitPrice <= 0) {
        issues.push(blocker("INVALID_PRICE", `lines.${line.id}.unitPrice`,
          `Línea "${line.referenceCode || line.id}": precio unitario inválido.`));
      }
    }
  }

  // ── 5. Date validation ─────────────────────────────────────────────────
  const orderDateStr = order.header.orderDate ?? order.createdAt;
  const orderDate = parseDate(orderDateStr);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (!orderDate) {
    issues.push(blocker("INVALID_DATE", "header.orderDate", "Fecha del pedido inválida."));
  } else {
    const orderDayStart = new Date(orderDate.getFullYear(), orderDate.getMonth(), orderDate.getDate());

    if (orderDayStart > todayStart) {
      issues.push(blocker("FUTURE_DATE", "header.orderDate", "La fecha del pedido no puede ser futura."));
    }

    const maxPastMs = dateConfig.maxDaysInPast * 24 * 60 * 60 * 1000;
    const cutoff = new Date(todayStart.getTime() - maxPastMs);
    if (orderDayStart < cutoff) {
      issues.push(blocker("DATE_TOO_OLD", "header.orderDate",
        `Fecha fuera del rango permitido (máximo ${dateConfig.maxDaysInPast} días en el pasado).`));
    }
  }

  // ── 6. LIVE mode infrastructure ────────────────────────────────────────
  if (opts?.writeMode === "LIVE") {
    if (opts?.connectorAvailable === false) {
      issues.push(blocker("CONFIGURATION_INCOMPLETE", "connector",
        "Conector SAG no configurado para esta organización."));
    }
  }

  // ── 7. Seller (warning only) ───────────────────────────────────────────
  if (!order.header.sellerName?.trim()) {
    issues.push(warning("MISSING_SELLER", "header.sellerName",
      "Vendedor no asignado. El pedido puede enviarse sin vendedor."));
  }

  // ── 8. Address (warning only) ──────────────────────────────────────────
  if (!order.header.customerAddress?.trim()) {
    issues.push(warning("MISSING_ADDRESS", "header.customerAddress",
      "Dirección de entrega no disponible."));
  }
  if (!order.header.customerCity?.trim()) {
    issues.push(warning("MISSING_CITY", "header.customerCity",
      "Ciudad de entrega no disponible."));
  }

  // ── Result ─────────────────────────────────────────────────────────────
  const blockerCount = issues.filter(i => i.severity === "blocker").length;
  const warningCount = issues.filter(i => i.severity === "warning").length;

  return {
    canSend: blockerCount === 0,
    issues,
    blockerCount,
    warningCount,
  };
}
