/**
 * lib/marketing-studio/commerce/shopify-actions/operation-actions.ts
 *
 * SHOPIFY-COPILOT-ACTIONS-01B — Operations domain actions.
 * SERVER ONLY — no React imports.
 */

import {
  listDelayedShipments,
  listFailedPayments,
  listReturns,
  findOrdersAtRisk     as _findOrdersAtRisk,
  findFailedDeliveries,
  findPendingRefunds   as _findPendingRefunds,
  listCarrierPerformance,
}                                 from "../shopify-operations-service";
import type { ShopifyActionMeta } from "./action-types";
import {
  start,
  mkOk,
  type ShopifyContext,
} from "./action-types";

// ── Registry entries ───────────────────────────────────────────────────────────

export const OPERATION_ACTION_META: Record<string, ShopifyActionMeta> = {
  findDelayedOrders: {
    id: "findDelayedOrders", category: "operations",
    displayName: "Buscar envíos retrasados",
    description: "Devuelve envíos sin actividad de transportadora por 5 o más días.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  ["minDays?: number (default: 5)", "carrier?: string"],
    expectedOutputs: ["OperationShipmentSummary[]"],
  },
  findFailedPayments: {
    id: "findFailedPayments", category: "operations",
    displayName: "Buscar pagos fallidos",
    description: "Devuelve pedidos con estado de pago fallido o revertido.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  [],
    expectedOutputs: ["OperationOrderSummary[]"],
  },
  findPendingRefunds: {
    id: "findPendingRefunds", category: "operations",
    displayName: "Buscar reembolsos pendientes",
    description: "Devuelve pedidos con reembolso solicitado pero no procesado.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  [],
    expectedOutputs: ["OperationOrderSummary[]"],
  },
  findPendingReturns: {
    id: "findPendingReturns", category: "operations",
    displayName: "Buscar devoluciones pendientes",
    description: "Devuelve pedidos con artículos devueltos no resueltos.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  [],
    expectedOutputs: ["OperationOrderSummary[]"],
  },
  findOrdersAtRisk: {
    id: "findOrdersAtRisk", category: "operations",
    displayName: "Buscar pedidos en riesgo",
    description: "Devuelve pedidos con indicadores de alto riesgo.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  [],
    expectedOutputs: ["OperationOrderSummary[]"],
  },
  reviewCarrierPerformance: {
    id: "reviewCarrierPerformance", category: "operations",
    displayName: "Revisar desempeño de transportadoras",
    description: "Agrega métricas de entrega por transportadora para el período actual.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  [],
    expectedOutputs: ["CarrierPerformanceSummary[]"],
  },
};

// ── Actions ────────────────────────────────────────────────────────────────────

async function findDelayedOrders(ctx: ShopifyContext, opts?: { minDays?: number; carrier?: string }) {
  const t0     = start();
  const result = await listDelayedShipments(ctx.organizationId, ctx.accessToken, ctx.shopDomain, opts);
  return mkOk(result, `${result.length} envío(s) retrasado(s).`, {}, t0);
}

async function findFailedPayments(ctx: ShopifyContext) {
  const t0     = start();
  const result = await listFailedPayments(ctx.organizationId, ctx.accessToken, ctx.shopDomain);
  return mkOk(result, `${result.length} pedido(s) con pago fallido.`, {}, t0);
}

async function findPendingRefunds(ctx: ShopifyContext) {
  const t0     = start();
  const result = await _findPendingRefunds(ctx.organizationId, ctx.accessToken, ctx.shopDomain);
  return mkOk(result, `${result.length} reembolso(s) pendiente(s).`, {}, t0);
}

async function findPendingReturns(ctx: ShopifyContext) {
  const t0     = start();
  const result = await listReturns(ctx.organizationId, ctx.accessToken, ctx.shopDomain);
  return mkOk(result, `${result.length} devolución(es) pendiente(s).`, {}, t0);
}

async function findOrdersAtRisk(ctx: ShopifyContext) {
  const t0     = start();
  const result = await _findOrdersAtRisk(ctx.organizationId, ctx.accessToken, ctx.shopDomain);
  return mkOk(result, `${result.length} pedido(s) en riesgo.`, {}, t0);
}

async function findCarrierIncidents(ctx: ShopifyContext) {
  const t0     = start();
  const result = await findFailedDeliveries(ctx.organizationId, ctx.accessToken, ctx.shopDomain);
  return mkOk(result, `${result.length} incidencia(s) de transportadora.`, {}, t0);
}

async function reviewCarrierPerformance(ctx: ShopifyContext) {
  const t0     = start();
  const result = await listCarrierPerformance(ctx.organizationId, ctx.accessToken, ctx.shopDomain);
  return mkOk(result, `Desempeño de ${result.length} transportadora(s).`, {}, t0);
}

// Alias — same implementation, different Copilot intent
const findShipmentDelays = findDelayedOrders;

// ── Domain object ──────────────────────────────────────────────────────────────

export const operationActions = {
  findDelayedOrders,
  findFailedPayments,
  findPendingRefunds,
  findPendingReturns,
  findOrdersAtRisk,
  findCarrierIncidents,
  findShipmentDelays,
  reviewCarrierPerformance,
} as const;
