/**
 * executive-pipeline.ts
 *
 * INFORMES-EJECUTIVOS-CASTILLITOS-03
 * The Executive Intelligence Pipeline.
 *
 * This is the central assembler that produces ExecutiveIntelligenceReport.
 * It queries existing services and wraps results in the Reasoning framework.
 *
 * RULE: Executive Intelligence never queries modules directly.
 * It consumes Business Entities, Knowledge Graph, and Reasoning.
 *
 * In this first implementation, we bridge existing data services into the
 * Reasoning framework. As domain resolvers mature, this pipeline will
 * delegate to IReasoningEngine.buildReasoning() instead.
 *
 * SERVER ONLY.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { getLatestPeriod } from "@/lib/sales/reports";
import { getDailyOrderKpis, getLatestOrderDate } from "@/lib/orders/queries";
import { getCarteraKpis } from "@/lib/finance/cartera-kpis";
import { getFiscalWindow } from "@/lib/finance/fiscal-window";
import { getVendorTeamDashboard } from "@/lib/comercial/vendors/vendor-dashboard";
import { getInvoiceSourceCodes } from "@/lib/castillitos/source-rules";
import { PRISMA_EXCLUIR_ARKETOPS } from "@/lib/sag/master-data/source-semantic-rules";

import {
  buildObservation,
  buildEvidenceItem,
  buildEvidence,
  buildFinding,
  buildInsight,
  buildRisk,
  buildOpportunity,
  buildDecision,
  buildRecommendation,
  buildReasoningChain,
  buildReasoningContext,
  buildConfidence,
} from "@/lib/business-reasoning";

import type {
  EntityRef,
  Observation,
  Finding,
  Insight,
  Risk,
  Opportunity,
  Recommendation,
  ReasoningContext,
} from "@/lib/business-reasoning";

import type {
  ExecutiveIntelligenceReport,
  ExecutiveKpi,
  ExecutiveAlert,
  ExecutiveRisk,
  ExecutiveOpportunity,
  ExecutiveRecommendation,
  CommercialReport,
  InventoryReport,
  ProductionReport,
  CarteraReport,
} from "./executive-types";

// -- Helpers ---------------------------------------------------------------

function fmtCurrency(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtPercent(v: number): string {
  return `${v.toFixed(1)}%`;
}

function kpi(key: string, label: string, value: number, unit: ExecutiveKpi["unit"], source: string, opts?: { delta?: number; alert?: boolean }): ExecutiveKpi {
  const trend = opts?.delta != null ? (opts.delta > 0 ? "up" : opts.delta < 0 ? "down" : "flat") : "unknown";
  const formatted = unit === "currency" ? fmtCurrency(value)
    : unit === "percent" ? fmtPercent(value)
    : unit === "days" ? `${value.toFixed(0)}d`
    : `${value}`;
  return { key, label, value, formatted, unit, delta: opts?.delta ?? null, trend, alert: opts?.alert ?? false, source };
}

const ORG_REF: EntityRef = { entityId: "castillitos", entityType: "vendor", label: "Castillitos" };

// -- Main Pipeline ---------------------------------------------------------

/**
 * Assemble the complete Executive Intelligence Report.
 *
 * This is the single entry point for the Executive Dashboard.
 * It queries data, builds reasoning, and returns a structured report.
 */
export async function assembleExecutiveIntelligence(
  orgId: string,
  orgSlug: string,
): Promise<ExecutiveIntelligenceReport> {
  const start = Date.now();
  const db = prisma as any;

  // -- Phase 1: Query existing services in parallel -----------------------

  const b1InvCodes = getInvoiceSourceCodes();
  const carteraWindow = getFiscalWindow("strict_year");

  const [
    latestPeriod,
    latestOrderDate,
    latestOpRow,
    carteraKpis,
    vendorDashboard,
    productionStats,
    inventoryAlerts,
  ] = await Promise.all([
    getLatestPeriod(orgId),
    getLatestOrderDate(orgId).catch(() => null),
    db.saleRecord.findFirst({
      where: { organizationId: orgId, comprobanteCode: { in: b1InvCodes } },
      orderBy: { saleDate: "desc" },
      select: { saleDate: true },
    }).catch(() => null) as Promise<{ saleDate: Date } | null>,
    getCarteraKpis(orgId, carteraWindow).catch(() => null),
    getVendorTeamDashboard(orgId).catch(() => null),
    // Production stats from real ProductionOrder table
    Promise.all([
      db.productionOrder.count({ where: { organizationId: orgId } }).catch(() => 0),
      db.productionOrder.count({ where: { organizationId: orgId, status: "open" } }).catch(() => 0),
      db.productionOrder.count({ where: { organizationId: orgId, isClosed: true } }).catch(() => 0),
      db.productionOrderLine.groupBy({
        by: ["referenceCode"],
        where: { organizationId: orgId, productionOrder: { status: "open" } },
        _sum: { quantityOrdered: true },
        _count: { _all: true },
        orderBy: { _sum: { quantityOrdered: "desc" } },
        take: 10,
      }).catch(() => []),
    ]),
    // Inventory: references with zero or critical stock in open orders
    db.productionOrderLine.groupBy({
      by: ["referenceCode", "productName"],
      where: { organizationId: orgId, productionOrder: { status: "open" } },
      _sum: { quantityOrdered: true },
      _count: { _all: true },
      orderBy: { _sum: { quantityOrdered: "desc" } },
      take: 20,
    }).catch(() => []),
  ]);

  // Resolve operational dates
  const latestOpDate = latestOpRow?.saleDate ?? null;
  const latestOpDayStart = latestOpDate
    ? (() => { const d = new Date(latestOpDate); d.setUTCHours(0, 0, 0, 0); return d; })()
    : null;
  const latestOpDayEnd = latestOpDayStart
    ? new Date(latestOpDayStart.getTime() + 86_400_000)
    : null;

  const latestOrderDayStart = latestOrderDate
    ? (() => { const d = new Date(latestOrderDate); d.setUTCHours(0, 0, 0, 0); return d; })()
    : null;
  const latestOrderDayEnd = latestOrderDayStart
    ? new Date(latestOrderDayStart.getTime() + 86_400_000)
    : null;

  // Daily KPIs scoped to latest operational dates
  const [salesAgg, ordersAgg, cobrosAgg] = await Promise.all([
    latestOpDayStart && latestOpDayEnd
      ? db.saleRecord.aggregate({
          where: {
            organizationId: orgId,
            saleDate: { gte: latestOpDayStart, lt: latestOpDayEnd },
            comprobanteCode: { in: b1InvCodes },
            ...PRISMA_EXCLUIR_ARKETOPS,
          },
          _sum: { amount: true },
          _count: { _all: true },
        }).catch(() => null)
      : null,
    latestOrderDayStart && latestOrderDayEnd
      ? getDailyOrderKpis(orgId, latestOrderDayStart, latestOrderDayEnd).catch(() => ({ count: 0, totalAmount: 0, latestOrderDate: null }))
      : { count: 0, totalAmount: 0, latestOrderDate: null },
    latestOpDayStart && latestOpDayEnd
      ? db.collectionRecord.aggregate({
          where: {
            organizationId: orgId,
            collectionDate: { gte: latestOpDayStart, lt: latestOpDayEnd },
          },
          _sum: { amount: true },
          _count: { _all: true },
        }).catch(() => null)
      : null,
  ]);

  const ventasHoy = Number(salesAgg?._sum?.amount ?? 0);
  const facturasHoy = salesAgg?._count?._all ?? 0;
  const pedidosHoy = ordersAgg.count;
  const pedidosMontoHoy = ordersAgg.totalAmount;
  const cobrosHoy = Number(cobrosAgg?._sum?.amount ?? 0);
  const cobrosCountHoy = cobrosAgg?._count?._all ?? 0;

  const [totalOPs, openOPs, closedOPs, refsInProduction] = productionStats;

  // Month aggregates
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [ventasMesAgg, pedidosMesAgg] = await Promise.all([
    db.saleRecord.aggregate({
      where: {
        organizationId: orgId,
        saleDate: { gte: monthStart },
        comprobanteCode: { in: b1InvCodes },
        ...PRISMA_EXCLUIR_ARKETOPS,
      },
      _sum: { amount: true },
      _count: { _all: true },
    }).catch(() => null),
    db.customerOrderRecord.aggregate({
      where: {
        organizationId: orgId,
        orderDate: { gte: monthStart },
      },
      _count: { _all: true },
      _sum: { amount: true },
    }).catch(() => null),
  ]);

  const ventasMes = Number(ventasMesAgg?._sum?.amount ?? 0);
  const facturasMes = ventasMesAgg?._count?._all ?? 0;
  const pedidosMes = pedidosMesAgg?._count?._all ?? 0;
  const pedidosMontoMes = Number(pedidosMesAgg?._sum?.amount ?? 0);
  const ticketPromedio = pedidosMes > 0 ? pedidosMontoMes / pedidosMes : 0;

  // Cartera
  const carteraTotal = Number((carteraKpis as any)?.totalOpenBalance ?? 0);
  const carteraVencida = Number((carteraKpis as any)?.overdueBalance ?? 0);
  const carteraRatio = Number((carteraKpis as any)?.overdueRatio ?? 0);
  const topDebtors = ((carteraKpis as any)?.topDebtors ?? []) as Array<{ customerName: string; balanceDue: number; daysOverdue: number }>;

  // Vendor data
  const vendors = vendorDashboard?.vendors ?? [];
  const teamKpis = vendorDashboard?.teamKpis;

  const lastOpDateStr = latestOpDate ? latestOpDate.toISOString().slice(0, 10) : null;
  const freshness = latestOpDate ? "fresh" as const : "unknown" as const;

  // -- Phase 2: Build Observations ----------------------------------------

  const observations: Observation[] = [];

  observations.push(buildObservation({
    entity: ORG_REF,
    metric: "ventas_hoy",
    value: ventasHoy,
    category: "commercial",
    source: "business_entity",
    confidence: 100,
  }));

  observations.push(buildObservation({
    entity: ORG_REF,
    metric: "pedidos_hoy",
    value: pedidosHoy,
    category: "commercial",
    source: "business_entity",
  }));

  observations.push(buildObservation({
    entity: ORG_REF,
    metric: "cobros_hoy",
    value: cobrosHoy,
    category: "financial",
    source: "business_entity",
  }));

  observations.push(buildObservation({
    entity: ORG_REF,
    metric: "cartera_vencida",
    value: carteraVencida,
    isAnomaly: carteraRatio > 30,
    category: "financial",
    source: "business_entity",
  }));

  observations.push(buildObservation({
    entity: ORG_REF,
    metric: "ops_abiertas",
    value: openOPs,
    category: "production",
    source: "business_entity",
  }));

  // Vendor-level observations
  for (const v of vendors) {
    if (v.alertCount > 0) {
      observations.push(buildObservation({
        entity: { entityId: v.id, entityType: "vendor", label: v.name },
        metric: "vendor_alerts",
        value: v.alertCount,
        isAnomaly: true,
        category: "vendor",
        source: "business_entity",
      }));
    }
  }

  // -- Phase 3: Build Findings --------------------------------------------

  const findings: Finding[] = [];
  const evidenceItems = observations.map(o =>
    buildEvidenceItem({ type: "observation", description: `${o.metric} = ${o.value}`, referenceId: o.id }),
  );
  const baseEvidence = buildEvidence({ items: evidenceItems, observationIds: observations.map(o => o.id) });

  if (ventasHoy === 0 && latestOpDate) {
    findings.push(buildFinding({
      title: "Sin ventas en el ultimo dia operativo",
      description: `No se registraron ventas el ${lastOpDateStr}`,
      severity: "high",
      category: "commercial",
      primaryEntity: ORG_REF,
      evidence: baseEvidence,
      sourceObservationIds: observations.filter(o => o.metric === "ventas_hoy").map(o => o.id),
    }));
  }

  if (carteraRatio > 30) {
    findings.push(buildFinding({
      title: `Cartera vencida al ${carteraRatio.toFixed(0)}%`,
      description: `${fmtCurrency(carteraVencida)} vencidos de ${fmtCurrency(carteraTotal)} totales`,
      severity: carteraRatio > 50 ? "critical" : "high",
      category: "financial",
      primaryEntity: ORG_REF,
      evidence: baseEvidence,
      sourceObservationIds: observations.filter(o => o.metric === "cartera_vencida").map(o => o.id),
    }));
  }

  if (openOPs > 0) {
    findings.push(buildFinding({
      title: `${openOPs} ordenes de produccion abiertas`,
      description: `De ${totalOPs} OPs totales, ${openOPs} siguen abiertas y ${closedOPs} cerradas`,
      severity: "info",
      category: "production",
      primaryEntity: ORG_REF,
      evidence: baseEvidence,
      sourceObservationIds: observations.filter(o => o.metric === "ops_abiertas").map(o => o.id),
    }));
  }

  // Vendor-level findings
  const vendorsWithAlerts = vendors.filter(v => v.alertCount > 0);
  if (vendorsWithAlerts.length > 0) {
    findings.push(buildFinding({
      title: `${vendorsWithAlerts.length} vendedor(es) con alertas activas`,
      description: vendorsWithAlerts.map(v => `${v.name}: ${v.alertCount} alerta(s)`).join(". "),
      severity: "medium",
      category: "vendor",
      primaryEntity: ORG_REF,
      affectedEntities: vendorsWithAlerts.map(v => ({ entityId: v.id, entityType: "vendor" as const, label: v.name })),
      evidence: baseEvidence,
    }));
  }

  // -- Phase 4: Build Insights (Knowledge Graph connections) ----------------

  const insights: Insight[] = [];

  // Commercial insight
  if (ventasMes > 0 && pedidosMes > 0) {
    insights.push(buildInsight({
      title: "Relacion ventas-pedidos del mes",
      description: `Ventas mes: ${fmtCurrency(ventasMes)}, Pedidos: ${pedidosMes}, Ticket promedio: ${fmtCurrency(ticketPromedio)}`,
      businessMeaning: ticketPromedio > 0
        ? `Cada pedido representa en promedio ${fmtCurrency(ticketPromedio)}`
        : "Sin datos de ticket promedio",
      severity: "info",
      category: "commercial",
      primaryEntity: ORG_REF,
      evidence: baseEvidence,
      knowledgeDependencies: ["commercial_kpis"],
    }));
  }

  // Production ↔ Orders insight
  if (openOPs > 0 && pedidosMes > 0) {
    insights.push(buildInsight({
      title: "Produccion activa puede cubrir demanda",
      description: `${openOPs} OPs abiertas con ${(refsInProduction as any[]).length} referencias en fabricacion. ${pedidosMes} pedidos este mes.`,
      businessMeaning: "La produccion en curso puede contribuir a satisfacer pedidos pendientes",
      severity: "info",
      category: "production",
      primaryEntity: ORG_REF,
      evidence: baseEvidence,
      knowledgeDependencies: ["production_orders", "customer_orders"],
    }));
  }

  // Cartera insight
  if (carteraVencida > 0 && topDebtors.length > 0) {
    const topDebtor = topDebtors[0];
    insights.push(buildInsight({
      title: "Concentracion de cartera vencida",
      description: `Principal deudor: ${topDebtor.customerName} con ${fmtCurrency(topDebtor.balanceDue)} (${topDebtor.daysOverdue} dias)`,
      businessMeaning: "La cartera vencida se concentra en pocos clientes. Gestion dirigida puede recuperar rapidamente.",
      severity: carteraRatio > 50 ? "critical" : "medium",
      category: "financial",
      primaryEntity: ORG_REF,
      affectedEntities: topDebtors.slice(0, 3).map(d => ({
        entityId: d.customerName,
        entityType: "customer" as const,
        label: d.customerName,
      })),
      evidence: baseEvidence,
      knowledgeDependencies: ["cartera_aging", "customer_profiles"],
    }));
  }

  // -- Phase 5: Build Risks -----------------------------------------------

  const risks: Risk[] = [];

  if (carteraVencida > 0) {
    risks.push(buildRisk({
      title: "Riesgo de cartera irrecuperable",
      description: `${fmtCurrency(carteraVencida)} en cartera vencida (${carteraRatio.toFixed(0)}% del total)`,
      severity: carteraRatio > 50 ? "critical" : carteraRatio > 30 ? "high" : "medium",
      category: "financial",
      probability: Math.min(carteraRatio, 90),
      impact: carteraRatio > 50 ? 9 : carteraRatio > 30 ? 7 : 4,
      urgency: carteraRatio > 50 ? "immediate" : "this_week",
      estimatedValueAtRisk: carteraVencida,
      primaryEntity: ORG_REF,
      affectedEntities: topDebtors.slice(0, 3).map(d => ({
        entityId: d.customerName, entityType: "customer" as const, label: d.customerName,
      })),
      evidence: baseEvidence,
      sourceInsightIds: insights.filter(i => i.category === "financial").map(i => i.id),
      confidenceScore: 85,
      confidenceReason: "Datos de cartera directos de SAG",
    }));
  }

  // Vendor risks
  for (const v of vendorsWithAlerts) {
    if (v.health === "critical" || v.alertCount >= 3) {
      risks.push(buildRisk({
        title: `Vendedor ${v.name} requiere atencion`,
        description: `${v.alertCount} alertas activas, salud ${v.health}`,
        severity: v.health === "critical" ? "high" : "medium",
        category: "vendor",
        probability: 70,
        impact: 5,
        urgency: "today",
        primaryEntity: { entityId: v.id, entityType: "vendor", label: v.name },
        evidence: baseEvidence,
        confidenceScore: 80,
        confidenceReason: "Datos de vendedor en tiempo real",
      }));
    }
  }

  // -- Phase 6: Build Opportunities ----------------------------------------

  const opportunities: Opportunity[] = [];

  if (openOPs > 0) {
    opportunities.push(buildOpportunity({
      title: "Produccion en curso puede desbloquear pedidos",
      description: `${openOPs} OPs abiertas con ${(refsInProduction as any[]).length} referencias en fabricacion`,
      category: "production",
      priority: 3,
      estimatedValue: pedidosMontoMes > 0 ? pedidosMontoMes * 0.3 : null,
      effort: "low",
      primaryEntity: ORG_REF,
      evidence: baseEvidence,
      confidenceScore: 65,
      confidenceReason: "Basado en OPs abiertas y pedidos del mes",
    }));
  }

  if (cobrosHoy > 0) {
    opportunities.push(buildOpportunity({
      title: "Cobros activos — oportunidad de gestion de cartera",
      description: `${fmtCurrency(cobrosHoy)} recaudados hoy (${cobrosCountHoy} pagos). Intensificar gestion puede reducir cartera vencida.`,
      category: "financial",
      priority: 4,
      estimatedValue: carteraVencida * 0.2,
      effort: "medium",
      primaryEntity: ORG_REF,
      evidence: baseEvidence,
    }));
  }

  // -- Phase 7: Build Recommendations (David Recommends) -------------------

  const recommendations: Recommendation[] = [];

  // Cartera recommendations
  for (const debtor of topDebtors.slice(0, 3)) {
    if (debtor.daysOverdue > 30) {
      recommendations.push(buildRecommendation({
        title: `Gestionar cartera de ${debtor.customerName}`,
        description: `${fmtCurrency(debtor.balanceDue)} vencidos hace ${debtor.daysOverdue} dias`,
        category: "financial",
        severity: debtor.daysOverdue > 90 ? "critical" : debtor.daysOverdue > 60 ? "high" : "medium",
        priority: debtor.daysOverdue > 90 ? 1 : debtor.daysOverdue > 60 ? 2 : 3,
        expectedBenefit: `Recuperar ${fmtCurrency(debtor.balanceDue)} en cartera vencida`,
        estimatedValue: debtor.balanceDue,
        primaryEntity: { entityId: debtor.customerName, entityType: "customer", label: debtor.customerName },
        evidence: baseEvidence,
        confidenceScore: 90,
        confidenceReason: "Datos de cartera directos de SAG con facturas reales",
      }));
    }
  }

  // Vendor recommendations
  for (const v of vendorsWithAlerts.slice(0, 3)) {
    recommendations.push(buildRecommendation({
      title: `Revisar situacion de ${v.name}`,
      description: `${v.alertCount} alertas activas. Salud: ${v.health}. Ventas mes: ${fmtCurrency(v.salesMonth)}`,
      category: "vendor",
      priority: v.health === "critical" ? 2 : 4,
      expectedBenefit: `Resolver ${v.alertCount} alertas y mejorar cumplimiento`,
      primaryEntity: { entityId: v.id, entityType: "vendor", label: v.name },
      evidence: baseEvidence,
      confidenceScore: 80,
      confidenceReason: "Datos de vendedor en tiempo real",
    }));
  }

  // Production recommendations
  if (openOPs > 50) {
    recommendations.push(buildRecommendation({
      title: "Revisar OPs abiertas sin cierre",
      description: `${openOPs} ordenes de produccion abiertas. Solo ${closedOPs} cerradas de ${totalOPs} totales.`,
      category: "production",
      priority: 5,
      expectedBenefit: "Identificar produccion detenida o completada sin cierre en SAG",
      primaryEntity: ORG_REF,
      evidence: baseEvidence,
      confidenceScore: 70,
      confidenceReason: "Basado en estadisticas reales de ProductionOrder",
      missingInformation: ["Fecha estimada de cierre de cada OP", "Linkage OP → ET no resuelto"],
    }));
  }

  // Sort recommendations by priority
  recommendations.sort((a, b) => a.priority - b.priority);

  // -- Phase 8: Assemble Reports -------------------------------------------

  const summaryKpis: ExecutiveKpi[] = [
    kpi("ventas_hoy", "Ventas del dia", ventasHoy, "currency", "SAG/SaleRecord"),
    kpi("pedidos_hoy", "Pedidos del dia", pedidosHoy, "count", "SAG/CustomerOrderRecord"),
    kpi("cobros_hoy", "Cobros del dia", cobrosHoy, "currency", "SAG/CollectionRecord"),
    kpi("facturas_hoy", "Facturas del dia", facturasHoy, "count", "SAG/SaleRecord"),
    kpi("ventas_mes", "Ventas del mes", ventasMes, "currency", "SAG/SaleRecord"),
    kpi("pedidos_mes", "Pedidos del mes", pedidosMes, "count", "SAG/CustomerOrderRecord"),
    kpi("cartera_vencida", "Cartera vencida", carteraVencida, "currency", "SAG/CustomerReceivable", { alert: carteraRatio > 30 }),
    kpi("ops_abiertas", "OPs abiertas", openOPs, "count", "SAG/ProductionOrder"),
  ];

  const commercial: CommercialReport = {
    kpis: [
      kpi("ventas_hoy", "Ventas del dia", ventasHoy, "currency", "SAG"),
      kpi("ventas_mes", "Ventas del mes", ventasMes, "currency", "SAG"),
      kpi("pedidos_hoy", "Pedidos hoy", pedidosHoy, "count", "SAG"),
      kpi("pedidos_mes", "Pedidos mes", pedidosMes, "count", "SAG"),
      kpi("ticket_promedio", "Ticket promedio", ticketPromedio, "currency", "SAG"),
      kpi("facturas_mes", "Facturas mes", facturasMes, "count", "SAG"),
    ],
    topReferences: [],
    stoppedReferences: [],
    vendorPerformance: vendors.map(v => ({
      vendorName: v.name,
      salesToday: v.salesToday,
      salesMonth: v.salesMonth,
      ordersToday: v.ordersToday,
      fulfillmentRate: v.fulfillmentRate,
      alertCount: v.alertCount,
      health: v.health,
    })),
    freshness,
    lastOperationalDate: lastOpDateStr,
  };

  const inventory: InventoryReport = {
    kpis: [
      kpi("refs_en_produccion", "Refs en produccion", (refsInProduction as any[]).length, "count", "SAG/ProductionOrder"),
      kpi("ops_abiertas", "OPs abiertas", openOPs, "count", "SAG/ProductionOrder"),
    ],
    criticalReferences: (refsInProduction as any[]).slice(0, 10).map((r: any) => ({
      reference: r.referenceCode,
      productName: null,
      currentStock: 0,
      affectedOrders: 0,
      affectedVendors: 0,
      hasProductionInProgress: true,
    })),
    freshness,
  };

  const production: ProductionReport = {
    kpis: [
      kpi("total_ops", "Total OPs", totalOPs, "count", "SAG/ProductionOrder"),
      kpi("ops_abiertas", "OPs abiertas", openOPs, "count", "SAG/ProductionOrder"),
      kpi("ops_cerradas", "OPs cerradas", closedOPs, "count", "SAG/ProductionOrder"),
      kpi("refs_fabricacion", "Refs en fabricacion", (refsInProduction as any[]).length, "count", "SAG/ProductionOrder"),
    ],
    referencesInProduction: (refsInProduction as any[]).map((r: any) => ({
      reference: r.referenceCode,
      opCount: r._count?._all ?? 0,
      totalQuantity: r._sum?.quantityOrdered ?? 0,
      oldestOpDate: null,
    })),
    freshness,
  };

  const cartera: CarteraReport = {
    kpis: [
      kpi("cartera_total", "Cartera total", carteraTotal, "currency", "SAG/CustomerReceivable"),
      kpi("cartera_vencida", "Cartera vencida", carteraVencida, "currency", "SAG/CustomerReceivable", { alert: carteraRatio > 30 }),
      kpi("tasa_vencimiento", "Tasa vencimiento", carteraRatio, "percent", "SAG/CustomerReceivable", { alert: carteraRatio > 30 }),
      kpi("cobros_hoy", "Cobros hoy", cobrosHoy, "currency", "SAG/CollectionRecord"),
    ],
    topDebtors: topDebtors.slice(0, 5).map(d => ({
      customerName: d.customerName ?? "Desconocido",
      balanceDue: Number(d.balanceDue ?? 0),
      daysOverdue: d.daysOverdue ?? 0,
    })),
    freshness,
  };

  // -- Phase 9: Convert to Executive types --------------------------------

  const criticalAlerts: ExecutiveAlert[] = [];
  for (const f of findings.filter(f => f.severity === "critical" || f.severity === "high")) {
    criticalAlerts.push({
      id: f.id,
      title: f.title,
      description: f.description,
      severity: f.severity,
      category: f.category,
      entity: f.primaryEntity,
      evidenceSummary: f.evidence.items.map(i => i.description).slice(0, 3).join("; "),
      detectedAt: f.producedAt,
    });
  }

  const execRisks: ExecutiveRisk[] = risks.map(r => ({
    id: r.id,
    title: r.title,
    description: r.description,
    severity: r.severity,
    category: r.category,
    probability: r.probability,
    impact: r.impact,
    estimatedValueAtRisk: r.estimatedValueAtRisk,
    entity: r.primaryEntity,
    affectedEntities: r.affectedEntities,
    evidenceSummary: r.evidence.items.map(i => i.description).slice(0, 3).join("; "),
    producedAt: r.producedAt,
  }));

  const execOpportunities: ExecutiveOpportunity[] = opportunities.map(o => ({
    id: o.id,
    title: o.title,
    description: o.description,
    category: o.category,
    estimatedValue: o.estimatedValue,
    effort: o.effort,
    priority: o.priority,
    entity: o.primaryEntity,
    evidenceSummary: o.evidence.items.map(i => i.description).slice(0, 3).join("; "),
    producedAt: o.producedAt,
  }));

  const execRecommendations: ExecutiveRecommendation[] = recommendations.map(r => ({
    id: r.id,
    title: r.title,
    description: r.description,
    expectedBenefit: r.expectedBenefit,
    priority: r.priority,
    severity: r.severity,
    category: r.category,
    entity: r.primaryEntity,
    evidenceSummary: r.evidence.items.map(i => i.description).slice(0, 3).join("; "),
    suggestedOnly: true as const,
    producedAt: r.producedAt,
  }));

  const overallConfidence = buildConfidence({
    score: 80,
    reason: "Datos reales de SAG (SaleRecord, CustomerOrderRecord, CollectionRecord, CustomerReceivable, ProductionOrder)",
    evidenceCount: observations.length,
    dataComplete: latestOpDate != null,
    missingInformation: [
      ...(latestOpDate ? [] : ["Sin datos de ventas SAG importados"]),
      "Linkage OP → ET no resuelto",
      "Inventario fisico no sincronizado en tiempo real",
    ],
  });

  return {
    organizationId: orgId,
    orgSlug,
    summaryKpis,
    criticalAlerts,
    commercial,
    inventory,
    production,
    cartera,
    risks: execRisks,
    opportunities: execOpportunities,
    recommendations: execRecommendations,
    confidence: overallConfidence,
    freshness,
    assembledAt: new Date().toISOString(),
    processingMs: Date.now() - start,
  };
}
