/**
 * lib/comercial/sales-reps/sales-rep-alerts.ts
 *
 * FASE 10 — Alert builder functions.
 * Constructs SalesRepAlert instances from evaluation results.
 * Pure functions — no DB, no Prisma, no side effects.
 *
 * Sprint: SALES-REP-POLICY-PACK-01
 */

import type {
  SalesRepAlert,
  SalesRepAlertType,
  SalesRepAlertSeverity,
  SalesRepPolicyContext,
  MalletOutOfStockResult,
  MalletReplacementSuggestion,
  OverdueReceivableResult,
  InactiveCustomerResult,
  OrderFulfillmentState,
  SalesRepEvidenceItem,
} from "./sales-rep-decision-types";

import type { SalesRepPolicyPackConfig } from "./sales-rep-policy-pack-config";

// ── Alert ID generator ─────────────────────────────────────────────────────

let alertCounter = 0;

function nextAlertId(type: SalesRepAlertType): string {
  return `sra-${type.toLowerCase()}-${++alertCounter}`;
}

function deduplicationKey(type: SalesRepAlertType, entityId: string, salesRepId: string): string {
  return `${type}::${salesRepId}::${entityId}`;
}

// ── Out-of-stock alert ─────────────────────────────────────────────────────

export function buildOutOfStockAlert(
  ctx: SalesRepPolicyContext,
  item: MalletOutOfStockResult,
  config: SalesRepPolicyPackConfig,
): SalesRepAlert {
  const severity: SalesRepAlertSeverity = item.availableInventory < 0 ? "critical" : "warning";

  return {
    alertId: nextAlertId("MALLET_ITEM_OUT_OF_STOCK"),
    tenantId: ctx.tenantId,
    salesRepId: ctx.salesRepId,
    type: "MALLET_ITEM_OUT_OF_STOCK",
    severity,
    title: `Referencia agotada: ${item.reference}`,
    message: item.reason,
    relatedEntity: { type: "product", id: item.reference, name: item.productName },
    recommendedAction: item.recommendedAction,
    acknowledgementRequired: config.alertDefaults.defaultAcknowledgementRequired,
    cooldownMinutes: config.alertDefaults.defaultCooldownMinutes,
    evidence: item.evidence,
    createdAt: new Date().toISOString(),
    expiresAt: null,
    deduplicationKey: deduplicationKey("MALLET_ITEM_OUT_OF_STOCK", item.reference, ctx.salesRepId),
  };
}

// ── Replacement available alert ────────────────────────────────────────────

export function buildReplacementAlert(
  ctx: SalesRepPolicyContext,
  outOfStockItem: MalletOutOfStockResult,
  replacement: MalletReplacementSuggestion,
  config: SalesRepPolicyPackConfig,
): SalesRepAlert {
  return {
    alertId: nextAlertId("MALLET_REPLACEMENT_AVAILABLE"),
    tenantId: ctx.tenantId,
    salesRepId: ctx.salesRepId,
    type: "MALLET_REPLACEMENT_AVAILABLE",
    severity: "info",
    title: `Reemplazo disponible: ${replacement.suggestedReference}`,
    message: replacement.reason,
    relatedEntity: { type: "product", id: replacement.suggestedReference, name: replacement.productName },
    recommendedAction: `Agregar ${replacement.suggestedReference} (${replacement.suggestedUnits} und) en lugar de ${outOfStockItem.reference}`,
    acknowledgementRequired: false,
    cooldownMinutes: config.alertDefaults.defaultCooldownMinutes,
    evidence: replacement.evidence,
    createdAt: new Date().toISOString(),
    expiresAt: null,
    deduplicationKey: deduplicationKey("MALLET_REPLACEMENT_AVAILABLE", `${outOfStockItem.reference}->${replacement.suggestedReference}`, ctx.salesRepId),
  };
}

// ── Overdue receivable alert ───────────────────────────────────────────────

export function buildOverdueReceivableAlert(
  ctx: SalesRepPolicyContext,
  result: OverdueReceivableResult,
  config: SalesRepPolicyPackConfig,
): SalesRepAlert | null {
  // Only build alert when actually overdue
  if (result.alertSeverity === "info") return null;

  const severity: SalesRepAlertSeverity = result.alertSeverity;

  return {
    alertId: nextAlertId("CUSTOMER_OVERDUE_RECEIVABLE"),
    tenantId: ctx.tenantId,
    salesRepId: ctx.salesRepId,
    type: "CUSTOMER_OVERDUE_RECEIVABLE",
    severity,
    title: `Cartera vencida: ${result.customerName}`,
    message: `Cartera vencida ${result.maxDaysPastDue} dias. Monto: $${result.overdueReceivable.toLocaleString()}.`,
    relatedEntity: { type: "customer", id: result.customerId, name: result.customerName },
    recommendedAction: result.recommendedAction,
    acknowledgementRequired: result.requireAcknowledgement,
    cooldownMinutes: config.overdueReceivable.cooldownMinutes,
    evidence: result.evidence,
    createdAt: new Date().toISOString(),
    expiresAt: null,
    deduplicationKey: deduplicationKey("CUSTOMER_OVERDUE_RECEIVABLE", result.customerId, ctx.salesRepId),
  };
}

// ── Inactive customer alert ────────────────────────────────────────────────

export function buildInactiveCustomerAlert(
  ctx: SalesRepPolicyContext,
  result: InactiveCustomerResult,
  config: SalesRepPolicyPackConfig,
): SalesRepAlert | null {
  // Only alert for AT_RISK and INACTIVE
  if (result.activityStatus !== "AT_RISK" && result.activityStatus !== "INACTIVE") return null;

  const severity: SalesRepAlertSeverity = result.activityStatus === "INACTIVE" ? "warning" : "info";

  return {
    alertId: nextAlertId("CUSTOMER_INACTIVE"),
    tenantId: ctx.tenantId,
    salesRepId: ctx.salesRepId,
    type: "CUSTOMER_INACTIVE",
    severity,
    title: result.activityStatus === "INACTIVE"
      ? `Cliente inactivo: ${result.customerName}`
      : `Cliente en riesgo: ${result.customerName}`,
    message: result.activityStatus === "INACTIVE"
      ? `${result.inactiveDays} dias sin comprar.`
      : `${result.inactiveDays} dias sin comprar — acercandose al umbral de inactividad.`,
    relatedEntity: { type: "customer", id: result.customerId, name: result.customerName },
    recommendedAction: result.recommendedAction,
    acknowledgementRequired: config.alertDefaults.defaultAcknowledgementRequired,
    cooldownMinutes: config.alertDefaults.defaultCooldownMinutes,
    evidence: result.evidence,
    createdAt: new Date().toISOString(),
    expiresAt: null,
    deduplicationKey: deduplicationKey("CUSTOMER_INACTIVE", result.customerId, ctx.salesRepId),
  };
}

// ── Order follow-up alert ──────────────────────────────────────────────────

export function buildOrderFollowUpAlert(
  ctx: SalesRepPolicyContext,
  order: OrderFulfillmentState,
  config: SalesRepPolicyPackConfig,
): SalesRepAlert | null {
  const isBlocked = order.currentStatus === "BLOCKED";
  const hasBlockers = order.blockers.length > 0;
  const isStale = order.freshness === "DESACTUALIZADO" || order.freshness === "SIN_DATOS";

  // Only alert if blocked, has blockers, or stale
  if (!isBlocked && !hasBlockers && !isStale) return null;

  const type: SalesRepAlertType = isBlocked ? "ORDER_BLOCKED" : "ORDER_FOLLOW_UP_REQUIRED";
  const severity: SalesRepAlertSeverity = isBlocked ? "critical" : "warning";

  return {
    alertId: nextAlertId(type),
    tenantId: ctx.tenantId,
    salesRepId: ctx.salesRepId,
    type,
    severity,
    title: isBlocked
      ? `Pedido bloqueado: ${order.orderId}`
      : `Seguimiento requerido: ${order.orderId}`,
    message: isBlocked
      ? `Pedido ${order.orderId} bloqueado. ${order.blockers.length} bloqueo(s).`
      : hasBlockers
        ? `Pedido ${order.orderId} con ${order.blockers.length} bloqueo(s) pendientes.`
        : `Pedido ${order.orderId} sin sincronizar (${order.freshness}).`,
    relatedEntity: { type: "order", id: order.orderId, name: `Pedido ${order.orderId} — ${order.customer}` },
    recommendedAction: order.evidence.recommendedAction,
    acknowledgementRequired: isBlocked,
    cooldownMinutes: config.alertDefaults.defaultCooldownMinutes,
    evidence: order.evidence,
    createdAt: new Date().toISOString(),
    expiresAt: null,
    deduplicationKey: deduplicationKey(type, order.orderId, ctx.salesRepId),
  };
}

// ── Data quality warning ───────────────────────────────────────────────────

export function buildDataQualityAlert(
  ctx: SalesRepPolicyContext,
  entityType: "customer" | "mallet" | "order",
  entityId: string,
  entityName: string,
  missingFields: string[],
  evidence: SalesRepEvidenceItem,
  config: SalesRepPolicyPackConfig,
): SalesRepAlert | null {
  if (missingFields.length === 0) return null;

  return {
    alertId: nextAlertId("DATA_QUALITY_WARNING"),
    tenantId: ctx.tenantId,
    salesRepId: ctx.salesRepId,
    type: "DATA_QUALITY_WARNING",
    severity: config.alertDefaults.dataQualityWarningSeverity as SalesRepAlertSeverity,
    title: `Datos incompletos: ${entityName}`,
    message: `Faltan ${missingFields.length} campo(s): ${missingFields.join(", ")}.`,
    relatedEntity: { type: entityType, id: entityId, name: entityName },
    recommendedAction: `Completar informacion de ${entityName}: ${missingFields.join(", ")}`,
    acknowledgementRequired: false,
    cooldownMinutes: config.alertDefaults.defaultCooldownMinutes,
    evidence,
    createdAt: new Date().toISOString(),
    expiresAt: null,
    deduplicationKey: deduplicationKey("DATA_QUALITY_WARNING", `${entityType}:${entityId}`, ctx.salesRepId),
  };
}

// ── Batch alert builder ────────────────────────────────────────────────────

export interface AlertBatchInput {
  ctx: SalesRepPolicyContext;
  outOfStockItems: MalletOutOfStockResult[];
  replacements: Map<string, MalletReplacementSuggestion[]>;
  overdueResults: OverdueReceivableResult[];
  inactiveResults: InactiveCustomerResult[];
  orderStates: OrderFulfillmentState[];
  config: SalesRepPolicyPackConfig;
}

export function buildAllAlerts(input: AlertBatchInput): SalesRepAlert[] {
  const { ctx, outOfStockItems, replacements, overdueResults, inactiveResults, orderStates, config } = input;
  const alerts: SalesRepAlert[] = [];

  for (const item of outOfStockItems) {
    alerts.push(buildOutOfStockAlert(ctx, item, config));

    const itemReplacements = replacements.get(item.reference) ?? [];
    for (const rep of itemReplacements) {
      alerts.push(buildReplacementAlert(ctx, item, rep, config));
    }
  }

  for (const r of overdueResults) {
    const alert = buildOverdueReceivableAlert(ctx, r, config);
    if (alert) alerts.push(alert);
  }

  for (const c of inactiveResults) {
    const alert = buildInactiveCustomerAlert(ctx, c, config);
    if (alert) alerts.push(alert);
  }

  for (const o of orderStates) {
    const alert = buildOrderFollowUpAlert(ctx, o, config);
    if (alert) alerts.push(alert);
  }

  return alerts;
}
