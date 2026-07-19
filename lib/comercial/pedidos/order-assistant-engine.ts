/**
 * lib/comercial/pedidos/order-assistant-engine.ts
 *
 * Order Assistant Engine — pure functions that aggregate existing
 * policy evaluations into a single OrderAssistantResult.
 *
 * NO new engines. NO new policies. NO new rules.
 * Consumes exclusively:
 *   - Order Decision Engine (evaluateCustomerBranch, evaluateCustomerCredit, evaluateOrderReadiness)
 *   - Order Policy Pack Config
 *   - Customer Domain data (passed as input)
 *
 * Pure functions — no DB, no Prisma, no side effects, no async.
 *
 * Sprint: ORDER-ASSISTANT-01
 */

import type {
  OrderPolicyContext,
  CustomerBranchInfo,
  CustomerBranchResult,
  CustomerCreditResult,
  OrderReadinessResult,
  OrderPolicyEvidenceItem,
} from "./order-decision-types";

import type { OrderPolicyPackConfig } from "./order-policy-pack-config";

import type {
  OrderAssistantResult,
  OrderAssistantCustomer,
  OrderAssistantCredit,
  OrderAssistantBranches,
  OrderAssistantRecentOrder,
  OrderAssistantAutoSurtido,
  OrderAssistantAlert,
  OrderAssistantWarning,
  OrderAssistantAction,
  OrderAssistantStatus,
} from "./order-assistant-types";

import {
  evaluateCustomerBranch,
  evaluateCustomerCredit,
} from "./order-decision-engine";

// ── Build policy context for pre-order evaluation ───────────────────────────

export interface PreOrderData {
  customer: OrderAssistantCustomer;
  branches: CustomerBranchInfo[];
  credit: { totalReceivable: number; overdueReceivable: number; maxDaysPastDue: number };
  recentOrders: OrderAssistantRecentOrder[];
  hasInventory: boolean;
}

function buildPreOrderContext(data: PreOrderData): OrderPolicyContext {
  return {
    tenantId: "castillitos",
    orderId: "__pre_order__",
    customerId: data.customer.customerId,
    customerName: data.customer.customerName,
    customerCode: data.customer.customerCode,
    sellerId: "",
    sellerName: data.customer.sellerName ?? "",
    lines: [],
    credit: data.credit,
    branches: data.branches,
    selectedBranchCode: null,
    discount: null,
    discountOverride: null,
    totalValue: 0,
    totalUnits: 0,
  };
}

// ── Build alerts from policy results ────────────────────────────────────────

function buildAlerts(
  branchResult: CustomerBranchResult,
  creditResult: CustomerCreditResult,
  readinessResult: OrderReadinessResult,
): OrderAssistantAlert[] {
  const alerts: OrderAssistantAlert[] = [];
  let idx = 0;

  // Branch alerts
  if (branchResult.selectionMode === "no_branches") {
    alerts.push({
      id: `alert-${idx++}`,
      dimension: "Sucursal",
      message: "Cliente sin sucursales registradas. Registrar antes de continuar.",
      severity: "warning",
    });
  } else if (branchResult.selectionMode === "requires_selection") {
    alerts.push({
      id: `alert-${idx++}`,
      dimension: "Sucursal",
      message: `${branchResult.branches.length} sucursales disponibles. Seleccionar una.`,
      severity: "info",
    });
  }

  // Credit alerts
  for (const a of creditResult.alerts) {
    alerts.push({
      id: `alert-${idx++}`,
      dimension: "Cartera",
      message: a.message,
      severity: a.severity === "critical" ? "critical" : "warning",
    });
  }

  // Readiness blocked checks
  for (const c of readinessResult.checks) {
    if (c.status === "blocked") {
      alerts.push({
        id: `alert-${idx++}`,
        dimension: c.dimension,
        message: c.message,
        severity: "critical",
      });
    }
  }

  return alerts;
}

// ── Build warnings from readiness checks ────────────────────────────────────

function buildWarnings(readinessResult: OrderReadinessResult): OrderAssistantWarning[] {
  return readinessResult.checks
    .filter(c => c.status === "warning")
    .map(c => ({ dimension: c.dimension, message: c.message }));
}

// ── Build recommended actions ───────────────────────────────────────────────

function buildRecommendedActions(
  branchResult: CustomerBranchResult,
  creditResult: CustomerCreditResult,
  readinessResult: OrderReadinessResult,
  recentOrders: OrderAssistantRecentOrder[],
): OrderAssistantAction[] {
  const actions: OrderAssistantAction[] = [];

  // Branch action
  if (branchResult.selectionMode === "no_branches") {
    actions.push({
      action: "Registrar sucursal del cliente",
      rationale: "Sin sucursal no se puede determinar la direccion de entrega.",
      priority: 100,
    });
  } else if (branchResult.selectionMode === "requires_selection" && !branchResult.selectedBranch) {
    actions.push({
      action: `Seleccionar una de las ${branchResult.branches.length} sucursales`,
      rationale: "El cliente tiene multiples puntos de entrega. Se requiere seleccion explicita.",
      priority: 90,
    });
  }

  // Credit action
  if (creditResult.creditStatus === "blocked") {
    actions.push({
      action: `Revisar cartera vencida de ${creditResult.maxDaysPastDue} dias`,
      rationale: `Monto vencido: $${creditResult.overdueReceivable.toLocaleString()}. Nivel critico.`,
      priority: 95,
    });
  } else if (creditResult.creditStatus === "warning") {
    actions.push({
      action: `Informar al cliente sobre cartera vencida de ${creditResult.maxDaysPastDue} dias`,
      rationale: `Monto vencido: $${creditResult.overdueReceivable.toLocaleString()}. Alerta informativa.`,
      priority: 60,
    });
  }

  // Recent order context
  if (recentOrders.length > 0) {
    const last = recentOrders[0];
    if (last.daysSinceOrder <= 7) {
      actions.push({
        action: `Verificar pedido reciente (hace ${last.daysSinceOrder} dias, $${last.totalValue.toLocaleString()})`,
        rationale: "Pedido muy reciente. Confirmar que no es un duplicado.",
        priority: 70,
      });
    }
  }

  // Readiness blocked actions
  for (const c of readinessResult.checks) {
    if (c.status === "blocked" && c.dimension !== "Sucursal" && c.dimension !== "Cartera") {
      actions.push({
        action: `Resolver: ${c.message}`,
        rationale: `Dimension ${c.dimension} bloqueada.`,
        priority: 85,
      });
    }
  }

  // Sort by priority descending
  actions.sort((a, b) => b.priority - a.priority);

  return actions;
}

// ── Compute overall confidence ──────────────────────────────────────────────

function computeConfidence(
  branchResult: CustomerBranchResult,
  creditResult: CustomerCreditResult,
  readinessResult: OrderReadinessResult,
  customer: OrderAssistantCustomer,
): number {
  let score = 1.0;

  // Branch confidence
  if (branchResult.selectionMode === "no_branches") score -= 0.15;
  else if (branchResult.selectionMode === "requires_selection" && !branchResult.selectedBranch) score -= 0.05;

  // Credit confidence
  if (creditResult.creditStatus === "blocked") score -= 0.25;
  else if (creditResult.creditStatus === "warning") score -= 0.10;

  // Customer completeness
  if (!customer.nit) score -= 0.05;
  if (!customer.city) score -= 0.03;
  if (!customer.sellerName) score -= 0.05;
  if (customer.sellerConfidence < 60) score -= 0.05;

  // Readiness
  if (readinessResult.status === "BLOCKED") score -= 0.20;
  else if (readinessResult.status === "WARNING") score -= 0.05;

  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}

// ── Compute overall status ──────────────────────────────────────────────────

function computeStatus(
  readinessResult: OrderReadinessResult,
  creditResult: CustomerCreditResult,
  alerts: OrderAssistantAlert[],
): OrderAssistantStatus {
  const hasCritical = alerts.some(a => a.severity === "critical");
  if (readinessResult.status === "BLOCKED" || hasCritical) return "blocked";

  const hasWarning = alerts.some(a => a.severity === "warning");
  if (readinessResult.status === "WARNING" || hasWarning || creditResult.creditStatus === "warning") return "caution";

  return "recommended";
}

// ── Build auto surtido info ─────────────────────────────────────────────────

function buildAutoSurtido(hasInventory: boolean): OrderAssistantAutoSurtido {
  if (!hasInventory) {
    return { available: false, reason: "Sin datos de inventario sincronizados." };
  }
  return { available: true, reason: "Distribucion automatica por tallas disponible al agregar productos." };
}

// ── Pre-order readiness (skips line-dependent checks) ───────────────────────

function evaluatePreOrderReadiness(
  ctx: OrderPolicyContext,
  branchResult: CustomerBranchResult,
  creditResult: CustomerCreditResult,
  config: OrderPolicyPackConfig,
): OrderReadinessResult {
  const { branchRequiredForSubmission, creditBlocksSubmission } = config.orderReadiness;
  const checks: Array<{ dimension: string; status: "ok" | "warning" | "blocked"; message: string }> = [];

  // Branch check
  if (branchResult.selectionMode === "no_branches") {
    checks.push({
      dimension: "Sucursal",
      status: branchRequiredForSubmission ? "blocked" : "warning",
      message: "Cliente sin sucursales registradas.",
    });
  } else if (branchResult.selectionMode === "requires_selection" && !branchResult.selectedBranch) {
    checks.push({
      dimension: "Sucursal",
      status: branchRequiredForSubmission ? "blocked" : "warning",
      message: `${branchResult.branches.length} sucursales disponibles. Seleccionar una.`,
    });
  } else {
    checks.push({
      dimension: "Sucursal",
      status: "ok",
      message: branchResult.selectedBranch
        ? `Sucursal: ${branchResult.selectedBranch.name}`
        : "Sucursal unica seleccionada.",
    });
  }

  // Customer info
  if (!ctx.customerId || !ctx.customerName) {
    checks.push({ dimension: "Cliente", status: "blocked", message: "Cliente no seleccionado." });
  } else {
    checks.push({ dimension: "Cliente", status: "ok", message: `Cliente: ${ctx.customerName}` });
  }

  // Credit check
  if (creditResult.creditStatus === "blocked" && creditBlocksSubmission) {
    checks.push({
      dimension: "Cartera",
      status: "blocked",
      message: `Cartera vencida ${creditResult.maxDaysPastDue} dias. Bloqueado por politica.`,
    });
  } else if (creditResult.creditStatus === "warning") {
    checks.push({
      dimension: "Cartera",
      status: "warning",
      message: `Cartera vencida ${creditResult.maxDaysPastDue} dias. Alerta informativa.`,
    });
  } else if (creditResult.creditStatus === "blocked") {
    checks.push({
      dimension: "Cartera",
      status: "warning",
      message: `Cartera vencida ${creditResult.maxDaysPastDue} dias. No bloquea por politica.`,
    });
  } else {
    checks.push({ dimension: "Cartera", status: "ok", message: "Cartera al dia." });
  }

  // NOTE: Lines, inventory, sizes, value, units checks are SKIPPED
  // in pre-order evaluation — the seller hasn't added products yet.

  const hasBlocked = checks.some(c => c.status === "blocked");
  const hasWarning = checks.some(c => c.status === "warning");

  const status: "READY" | "WARNING" | "BLOCKED" =
    hasBlocked ? "BLOCKED" : hasWarning ? "WARNING" : "READY";

  return {
    orderId: ctx.orderId,
    status,
    checks,
    canSubmit: !hasBlocked,
    evidence: {
      policyType: "ORDER_READINESS",
      policyId: `or-pre-${ctx.customerId}`,
      policyName: "Evaluacion Pre-Pedido",
      activationReason: `Evaluacion previa del cliente ${ctx.customerName} antes de iniciar pedido. ${checks.length} dimensiones evaluadas.`,
      dataUsed: {
        customerId: ctx.customerId,
        customerName: ctx.customerName,
        checkSummary: checks.map(c => ({ dimension: c.dimension, status: c.status })),
      },
      recommendedAction: status === "READY"
        ? "Cliente listo para iniciar pedido"
        : status === "WARNING"
          ? "Cliente puede iniciar pedido con advertencias"
          : "Resolver bloqueos antes de iniciar pedido",
      actionRationale: `Evaluacion de ${checks.length} dimensiones pre-pedido: ${checks.filter(c => c.status === "ok").length} ok, ${checks.filter(c => c.status === "warning").length} advertencias, ${checks.filter(c => c.status === "blocked").length} bloqueos.`,
      confidence: status === "READY" ? 0.95 : status === "WARNING" ? 0.8 : 0.5,
      severity: status === "READY" ? "info" : status === "WARNING" ? "medium" : "high",
      evaluatedAt: new Date().toISOString(),
    },
  };
}

// ── Main assembly function ──────────────────────────────────────────────────

export function assembleOrderAssistant(
  data: PreOrderData,
  config: OrderPolicyPackConfig,
): OrderAssistantResult {
  const ctx = buildPreOrderContext(data);

  // Run existing policy evaluations (pure, no side effects)
  const branchResult = evaluateCustomerBranch(ctx);
  const creditResult = evaluateCustomerCredit(ctx, config);

  // Pre-order readiness: only customer-level checks (no lines/inventory/value)
  const readinessResult = evaluatePreOrderReadiness(ctx, branchResult, creditResult, config);

  // Build aggregated outputs
  const alerts = buildAlerts(branchResult, creditResult, readinessResult);
  const warnings = buildWarnings(readinessResult);
  const recommendedActions = buildRecommendedActions(branchResult, creditResult, readinessResult, data.recentOrders);
  const confidence = computeConfidence(branchResult, creditResult, readinessResult, data.customer);
  const status = computeStatus(readinessResult, creditResult, alerts);
  const autoSurtido = buildAutoSurtido(data.hasInventory);

  // Collect all evidence
  const evidence: OrderPolicyEvidenceItem[] = [
    branchResult.evidence,
    creditResult.evidence,
    readinessResult.evidence,
  ];

  return {
    tenantId: config.tenantId,
    evaluatedAt: new Date().toISOString(),
    customer: data.customer,
    branches: {
      availableBranches: branchResult.branches,
      selectedBranch: branchResult.selectedBranch,
      selectionMode: branchResult.selectionMode,
    },
    credit: {
      totalReceivable: creditResult.totalReceivable,
      overdueReceivable: creditResult.overdueReceivable,
      maxDaysPastDue: creditResult.maxDaysPastDue,
      creditStatus: creditResult.creditStatus,
      alerts: creditResult.alerts,
    },
    readiness: {
      status: readinessResult.status,
      canSubmit: readinessResult.canSubmit,
      checks: readinessResult.checks,
    },
    recentOrders: data.recentOrders,
    autoSurtido,
    alerts,
    warnings,
    recommendedActions,
    confidence,
    status,
    evidence,
    policyResults: {
      branch: branchResult,
      credit: creditResult,
      readiness: readinessResult,
    },
  };
}
