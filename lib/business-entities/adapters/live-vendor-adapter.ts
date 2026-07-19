/**
 * live-vendor-adapter.ts
 *
 * BUSINESS-ENTITIES-CORE-01
 * Converts an existing LiveVendor into a BusinessEntitySnapshot.
 *
 * This adapter bridges COMERCIAL-VENDEDORES-LIVE-01 with the new
 * Business Entities Core without modifying LiveVendor.
 *
 * No Prisma. No React. Pure domain transformation.
 */

import type { LiveVendor } from "@/lib/comercial/vendors/vendor-types";
import type {
  BusinessEntity,
  BusinessEntitySnapshot,
  BusinessEntityAlert,
  BusinessEntityRecommendation,
  BusinessEntityMetric,
  BusinessEntityHealth,
  BusinessEntityState,
  BusinessEntityAIContext,
} from "../core";
import {
  buildDimension,
  unavailableDimension,
  computeOverallHealth,
  buildMetric,
  buildSnapshot,
  buildAIContext,
  buildStateFromSignals,
  evaluateFreshness,
} from "../core";
import type { BusinessEntitySignal } from "../core";

// ── Adapter ──────────────────────────────────────────────────────────────────

/**
 * Convert a LiveVendor into a BusinessEntitySnapshot.
 *
 * This is a read-only conversion — the original LiveVendor is not modified.
 * Used when Business Entity consumers need a uniform interface.
 */
export function liveVendorToSnapshot(vendor: LiveVendor): BusinessEntitySnapshot {
  const entity = liveVendorToEntity(vendor);
  return buildSnapshot({ entity, source: "live-vendor-adapter" });
}

/** Convert a LiveVendor into a BusinessEntity. */
export function liveVendorToEntity(vendor: LiveVendor): BusinessEntity {
  return {
    entityId: vendor.identity.id,
    organizationId: "", // LiveVendor doesn't carry orgId at identity level
    entityType: "vendor",
    displayName: vendor.identity.name,
    status: vendor.identity.active ? "active" : "inactive",
    state: adaptState(vendor),
    health: adaptHealth(vendor),
    metrics: adaptMetrics(vendor),
    alerts: adaptAlerts(vendor),
    recommendations: adaptRecommendations(vendor),
    timeline: [], // LiveVendor V1 does not track timeline
    relations: [], // LiveVendor V1 does not track relations
    aiContext: adaptAIContext(vendor),
    dataFreshness: evaluateFreshness(
      vendor.activeCase.lastSyncedAt,
      3600, // expect refresh every hour
      "vendor-engine",
    ),
    lastSyncAt: vendor.activeCase.lastSyncedAt,
    updatedAt: vendor.assembledAt,
    metadata: {
      sagName: vendor.identity.sagName,
      slug: vendor.identity.slug,
      zone: vendor.identity.zone,
    },
  };
}

// ── State Adaptation ─────────────────────────────────────────────────────────

function adaptState(vendor: LiveVendor): BusinessEntityState {
  const signals: BusinessEntitySignal[] = [];

  if (vendor.activeCase.depletedReferences > 0) {
    signals.push({
      code: "depleted_references",
      message: `${vendor.activeCase.depletedReferences} referencia(s) agotada(s)`,
      severity: vendor.activeCase.depletedReferences >= 5 ? "critical" : "high",
      source: "vendor-engine",
      detectedAt: vendor.assembledAt,
    });
  }

  if (vendor.orders.ordersBlocked > 0) {
    signals.push({
      code: "blocked_orders",
      message: `${vendor.orders.ordersBlocked} pedido(s) bloqueado(s)`,
      severity: "high",
      source: "vendor-engine",
      detectedAt: vendor.assembledAt,
    });
  }

  if (vendor.fulfillment.fulfillmentRate < 60 && vendor.fulfillment.totalOrders >= 5) {
    signals.push({
      code: "low_fulfillment",
      message: `Cumplimiento ${vendor.fulfillment.fulfillmentRate}%`,
      severity: vendor.fulfillment.fulfillmentRate < 40 ? "critical" : "medium",
      source: "vendor-engine",
      detectedAt: vendor.assembledAt,
    });
  }

  return buildStateFromSignals(signals, "live-vendor-adapter");
}

// ── Health Adaptation ────────────────────────────────────────────────────────

function adaptHealth(vendor: LiveVendor): BusinessEntityHealth {
  const caseHealth = vendor.activeCase.health;
  const commercialDim = buildDimension(
    vendor.commercial.ordersToday > 0 ? "healthy" : "degraded",
    vendor.commercial.ordersToday > 0
      ? `${vendor.commercial.ordersToday} pedidos hoy`
      : "Sin pedidos hoy",
  );
  const inventoryDim = buildDimension(
    caseHealth === "critical" ? "critical"
    : caseHealth === "warning" ? "degraded"
    : caseHealth === "empty" ? "unavailable"
    : "healthy",
    caseHealth === "empty" ? null
    : `${vendor.activeCase.depletedReferences}/${vendor.activeCase.totalReferences} agotadas`,
  );
  const operationalDim = buildDimension(
    vendor.operationalState.health === "critical" ? "critical"
    : vendor.operationalState.health === "warning" ? "degraded"
    : "healthy",
  );
  const syncDim = buildDimension(
    vendor.activeCase.lastSyncedAt ? "healthy" : "unknown",
    vendor.activeCase.lastSyncedAt
      ? `Sincronizado ${vendor.activeCase.lastSyncedAt.slice(0, 10)}`
      : "Sin sincronizacion",
  );

  const overall = computeOverallHealth([commercialDim, inventoryDim, operationalDim, syncDim]);

  return {
    overall: buildDimension(overall),
    commercial: commercialDim,
    inventory: inventoryDim,
    production: unavailableDimension(),
    financial: unavailableDimension(),
    operational: operationalDim,
    sync: syncDim,
    ai: unavailableDimension(),
  };
}

// ── Metrics Adaptation ───────────────────────────────────────────────────────

function adaptMetrics(vendor: LiveVendor): BusinessEntityMetric[] {
  const c = vendor.commercial;
  return [
    buildMetric({ key: "sales_today", label: "Ventas hoy", value: c.salesToday, unit: "currency", period: "today", source: "CRM" }),
    buildMetric({ key: "sales_week", label: "Ventas semana", value: c.salesWeek, unit: "currency", period: "week", source: "CRM" }),
    buildMetric({ key: "sales_month", label: "Ventas mes", value: c.salesMonth, unit: "currency", period: "month", source: "CRM" }),
    buildMetric({ key: "orders_today", label: "Pedidos hoy", value: c.ordersToday, unit: "count", period: "today", source: "CRM" }),
    buildMetric({ key: "orders_month", label: "Pedidos mes", value: c.ordersMonth, unit: "count", period: "month", source: "CRM" }),
    buildMetric({ key: "customers_today", label: "Clientes hoy", value: c.customersToday, unit: "count", period: "today", source: "CRM" }),
    buildMetric({ key: "ticket_promedio", label: "Ticket promedio", value: c.ticketPromedio, unit: "currency", period: "month", source: "CRM" }),
    buildMetric({ key: "fulfillment_rate", label: "Cumplimiento", value: vendor.fulfillment.fulfillmentRate, unit: "percent", period: "all_time", source: "pedidos" }),
    buildMetric({ key: "depleted_refs", label: "Refs agotadas", value: vendor.activeCase.depletedReferences, unit: "count", period: "today", source: "maletas" }),
    buildMetric({ key: "active_customers", label: "Clientes activos", value: vendor.customers.activeCustomers, unit: "count", period: "all_time", source: "CRM" }),
  ];
}

// ── Alerts Adaptation ────────────────────────────────────────────────────────

function adaptAlerts(vendor: LiveVendor): BusinessEntityAlert[] {
  return vendor.alerts.map(a => ({
    id: a.id,
    entityId: vendor.identity.id,
    entityType: "vendor" as const,
    category: alertTypeToCategory(a.type),
    severity: a.severity,
    title: a.title,
    description: a.description,
    source: "vendor-alerts",
    priority: severityToPriority(a.severity),
    action: null,
    relatedEntityIds: a.entityId ? [a.entityId] : [],
    createdAt: a.createdAt,
    expiresAt: null,
    acknowledged: false,
    metadata: { metric: a.metric },
  }));
}

function alertTypeToCategory(type: string): "vendor" | "commercial" | "inventory" | "order" | "system" {
  if (type.includes("reference") || type.includes("case")) return "inventory";
  if (type.includes("order")) return "order";
  if (type.includes("customer") || type.includes("fulfillment") || type.includes("goal")) return "commercial";
  return "vendor";
}

function severityToPriority(s: string): number {
  switch (s) {
    case "critical": return 1;
    case "high":     return 2;
    case "medium":   return 3;
    case "low":      return 4;
    default:         return 5;
  }
}

// ── Recommendations Adaptation ───────────────────────────────────────────────

function adaptRecommendations(vendor: LiveVendor): BusinessEntityRecommendation[] {
  return vendor.recommendations.map(r => ({
    id: r.id,
    entityId: vendor.identity.id,
    entityType: "vendor" as const,
    priority: r.priority,
    severity: "medium" as const,
    title: r.title,
    description: r.description,
    recommendedAction: r.type,
    source: "vendor-recommendations",
    confidence: 70,
    suggestedOnly: true as const,
    relatedEntityIds: r.entityId ? [r.entityId] : [],
    createdAt: new Date().toISOString(),
    metadata: {},
  }));
}

// ── AI Context Adaptation ────────────────────────────────────────────────────

function adaptAIContext(vendor: LiveVendor): BusinessEntityAIContext {
  const c = vendor.commercial;
  const ac = vendor.activeCase;

  const keyFacts: string[] = [];
  if (c.salesToday > 0) keyFacts.push(`Ventas hoy: $${c.salesToday.toLocaleString()}`);
  if (c.ordersToday > 0) keyFacts.push(`${c.ordersToday} pedidos hoy`);
  if (c.salesMonth > 0) keyFacts.push(`Ventas mes: $${c.salesMonth.toLocaleString()}`);
  if (ac.totalReferences > 0) keyFacts.push(`Maleta: ${ac.totalReferences} refs (${ac.depletedReferences} agotadas)`);
  if (vendor.customers.activeCustomers > 0) keyFacts.push(`${vendor.customers.activeCustomers} clientes activos`);

  const risks = vendor.alerts.map(a => a.title);
  const opportunities = vendor.recommendations.map(r => r.title);

  return buildAIContext({
    summary: `${vendor.identity.name}: ${c.ordersToday} pedidos hoy, ${vendor.fulfillment.fulfillmentRate}% cumplimiento, ${ac.depletedReferences} refs agotadas.`,
    keyFacts,
    risks,
    opportunities,
    recommendedQuestions: [
      `Como va ${vendor.identity.name} este mes?`,
      `Que clientes necesitan atencion?`,
      `Debe actualizarse la maleta?`,
    ],
  });
}
