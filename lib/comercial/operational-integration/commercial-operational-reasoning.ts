/**
 * commercial-operational-reasoning.ts
 *
 * COMERCIAL-OPERATIONAL-INTEGRATION-01
 * Generates structured Reasoning from real Castillitos data.
 *
 * Pipeline: Observations → Findings → Insights → Risks → Opportunities → Recommendations
 * Every conclusion carries Evidence. No AI/LLM calls. Pure structured reasoning.
 *
 * No React. No UI. Server-side reasoning generation.
 */

import {
  buildObservation,
  buildEvidenceItem,
  buildEvidence,
  buildFinding,
  buildInsight,
  buildRisk,
  buildOpportunity,
  buildRecommendation,
  buildConfidence,
} from "@/lib/business-reasoning";

import type {
  Observation,
  Finding,
  Insight,
  Risk,
  Opportunity,
  Recommendation,
  Evidence,
  ReasoningConfidence,
} from "@/lib/business-reasoning";

import type { ReferenceInventorySnapshot } from "./commercial-operational-entities";
import type {
  AffectedOrder,
  AffectedCustomer,
  AffectedVendor,
  AffectedPortfolio,
  RelatedProduction,
  AlternativeInventory,
} from "./commercial-operational-types";
import type { ReferenceGraphSummary } from "./commercial-operational-knowledge";

// -- Full reference reasoning ------------------------------------------------

export interface ReferenceReasoning {
  observations: Observation[];
  findings: Finding[];
  insights: Insight[];
  risks: Risk[];
  opportunities: Opportunity[];
  recommendations: Recommendation[];
  confidence: ReasoningConfidence;
  missingInformation: string[];
}

/** Generate complete reasoning chain for a reference. */
export function generateReferenceReasoning(
  orgId: string,
  inv: ReferenceInventorySnapshot,
  orders: AffectedOrder[],
  customers: AffectedCustomer[],
  vendors: AffectedVendor[],
  portfolios: AffectedPortfolio[],
  production: RelatedProduction[],
  alternativeInv: AlternativeInventory[],
  graphSummary: ReferenceGraphSummary,
): ReferenceReasoning {
  const ref = inv.reference;
  const entity = { entityId: ref, entityType: "product" as const, label: inv.productName ?? ref };
  const missingInfo: string[] = [];

  if (!inv.productId) missingInfo.push("ProductEntity no encontrada en Prisma");
  if (orders.length === 0) missingInfo.push("Sin datos de pedidos por referencia (requiere referenceCode en CustomerOrderRecord)");

  // -- Observations (raw facts) ---------------------------------------------
  const observations: Observation[] = [];

  observations.push(buildObservation({
    entity,
    metric: "inventory_available",
    value: inv.totalAvailable,
    expectedValue: 10,
    isAnomaly: inv.totalAvailable === 0,
    category: "inventory",
    source: "business_entity",
    confidence: 100,
  }));

  observations.push(buildObservation({
    entity,
    metric: "affected_orders",
    value: orders.length,
    category: "commercial",
    source: "business_entity",
  }));

  observations.push(buildObservation({
    entity,
    metric: "affected_vendors",
    value: vendors.length,
    category: "vendor",
    source: "business_entity",
  }));

  observations.push(buildObservation({
    entity,
    metric: "active_portfolios",
    value: portfolios.filter(p => p.status === "activa").length,
    category: "commercial",
    source: "business_entity",
  }));

  observations.push(buildObservation({
    entity,
    metric: "open_production_orders",
    value: production.filter(p => !p.isClosed).length,
    category: "production",
    source: "business_entity",
  }));

  observations.push(buildObservation({
    entity,
    metric: "alternative_inventory",
    value: alternativeInv.reduce((s, a) => s + a.available, 0),
    category: "inventory",
    source: "business_entity",
  }));

  // -- Evidence bundle from observations ------------------------------------
  const evidenceItems = observations.map(o =>
    buildEvidenceItem({
      type: "observation",
      description: `${o.metric} = ${o.value}`,
      referenceId: o.id,
    }),
  );
  const evidence = buildEvidence({
    items: evidenceItems,
    observationIds: observations.map(o => o.id),
    entities: [entity],
  });

  // -- Findings (factual conclusions) ---------------------------------------
  const findings: Finding[] = [];

  if (inv.totalAvailable === 0) {
    findings.push(buildFinding({
      title: `Referencia ${ref} agotada`,
      description: `${inv.productName ?? ref} tiene 0 unidades disponibles en todas las bodegas`,
      severity: "critical",
      category: "inventory",
      primaryEntity: entity,
      evidence,
      sourceObservationIds: [observations[0].id],
    }));
  } else if (inv.totalAvailable <= 10) {
    findings.push(buildFinding({
      title: `Referencia ${ref} en nivel critico (${inv.totalAvailable})`,
      description: `${inv.productName ?? ref} tiene solo ${inv.totalAvailable} unidades disponibles`,
      severity: "high",
      category: "inventory",
      primaryEntity: entity,
      evidence,
      sourceObservationIds: [observations[0].id],
    }));
  }

  if (orders.length > 0 && inv.totalAvailable === 0) {
    findings.push(buildFinding({
      title: `${orders.length} pedido(s) bloqueados por falta de ${ref}`,
      description: `La referencia ${ref} esta agotada y tiene ${orders.length} pedido(s) que no pueden cumplirse`,
      severity: "high",
      category: "commercial",
      primaryEntity: entity,
      affectedEntities: orders.slice(0, 5).map(o => ({
        entityId: o.orderId, entityType: "order" as const, label: o.customerName ?? o.orderId,
      })),
      evidence,
    }));
  }

  // -- Insights (Knowledge Graph enriched understanding) --------------------
  const insights: Insight[] = [];

  if (graphSummary.totalRelations > 0) {
    insights.push(buildInsight({
      title: `Impacto transversal de ${ref}`,
      description: `${ref} conecta ${graphSummary.vendorCount} vendedor(es), ${graphSummary.portfolioCount} maleta(s), ${graphSummary.orderCount} pedido(s), ${graphSummary.customerCount} cliente(s) y ${graphSummary.productionCount} OP(s)`,
      businessMeaning: graphSummary.vendorCount > 1
        ? `El agotamiento de ${ref} afecta multiples vendedores simultaneamente`
        : graphSummary.vendorCount === 1
          ? `Un vendedor depende de ${ref} para su gestion comercial`
          : `${ref} no tiene vendedores asignados actualmente`,
      severity: inv.totalAvailable === 0 ? "high" : "medium",
      category: "commercial",
      primaryEntity: entity,
      affectedEntities: [
        ...vendors.slice(0, 3).map(v => ({ entityId: v.vendorId, entityType: "vendor" as const, label: v.vendorName })),
        ...customers.slice(0, 3).map(c => ({ entityId: c.customerId, entityType: "customer" as const, label: c.customerName })),
      ],
      evidence,
      knowledgeDependencies: ["product_portfolio", "product_vendor", "product_order", "product_production"],
    }));
  }

  const openOPs = production.filter(p => !p.isClosed);
  if (openOPs.length > 0 && inv.totalAvailable <= 10) {
    const totalOpQty = openOPs.reduce((s, op) => s + op.quantityOrdered, 0);
    insights.push(buildInsight({
      title: `Produccion activa puede reabastecer ${ref}`,
      description: `${openOPs.length} OP(s) abiertas con ${totalOpQty} unidades planeadas`,
      businessMeaning: `Si la produccion se completa, ${ref} podra reabastecerse sin necesidad de nueva compra`,
      severity: "info",
      category: "production",
      primaryEntity: entity,
      evidence,
      knowledgeDependencies: ["product_production"],
    }));
  }

  const totalAlt = alternativeInv.reduce((s, a) => s + a.available, 0);
  if (totalAlt > 0 && inv.totalAvailable <= 10) {
    insights.push(buildInsight({
      title: `Inventario alternativo disponible para ${ref}`,
      description: `${totalAlt} unidades en ${alternativeInv.length} bodega(s) alternativa(s): ${alternativeInv.map(a => `${a.warehouseCode}(${a.available})`).join(", ")}`,
      businessMeaning: `Un traslado puede resolver el agotamiento sin esperar produccion`,
      severity: "info",
      category: "inventory",
      primaryEntity: entity,
      evidence,
      knowledgeDependencies: ["product_inventory_location"],
    }));
  }

  // -- Risks ----------------------------------------------------------------
  const risks: Risk[] = [];

  if (inv.totalAvailable === 0 && orders.length > 0) {
    const totalOrderAmount = orders.reduce((s, o) => s + o.amount, 0);
    risks.push(buildRisk({
      title: `Riesgo comercial por agotamiento de ${ref}`,
      description: `${orders.length} pedido(s) por $${totalOrderAmount.toLocaleString()} no pueden cumplirse`,
      severity: "high",
      category: "commercial",
      probability: 90,
      impact: 7,
      urgency: "today",
      estimatedValueAtRisk: totalOrderAmount,
      primaryEntity: entity,
      affectedEntities: orders.slice(0, 3).map(o => ({
        entityId: o.orderId, entityType: "order" as const, label: o.customerName ?? o.orderId,
      })),
      evidence,
      sourceInsightIds: insights.filter(i => i.category === "commercial").map(i => i.id),
      confidenceScore: 85,
      confidenceReason: "Datos reales de inventario SAG y pedidos",
    }));
  }

  if (inv.totalAvailable === 0 && vendors.length > 1) {
    risks.push(buildRisk({
      title: `Multiples vendedores afectados por agotamiento de ${ref}`,
      description: `${vendors.length} vendedor(es) tienen ${ref} en sus maletas sin stock`,
      severity: "medium",
      category: "vendor",
      probability: 80,
      impact: 5,
      urgency: "this_week",
      primaryEntity: entity,
      affectedEntities: vendors.slice(0, 3).map(v => ({
        entityId: v.vendorId, entityType: "vendor" as const, label: v.vendorName,
      })),
      evidence,
      confidenceScore: 80,
      confidenceReason: "Datos reales de maletas y vendedores",
    }));
  }

  // -- Opportunities --------------------------------------------------------
  const opportunities: Opportunity[] = [];

  if (openOPs.length > 0 && inv.totalAvailable <= 10) {
    opportunities.push(buildOpportunity({
      title: `Produccion en curso puede resolver agotamiento de ${ref}`,
      description: `${openOPs.length} OP(s) abiertas. Seguimiento puede acelerar reabastecimiento.`,
      category: "production",
      priority: 3,
      estimatedValue: null,
      effort: "low",
      primaryEntity: entity,
      evidence,
      confidenceScore: 70,
      confidenceReason: "OPs abiertas en SAG, pendiente verificar fechas estimadas",
    }));
  }

  if (totalAlt > 0 && inv.totalAvailable === 0) {
    opportunities.push(buildOpportunity({
      title: `Traslado de inventario para ${ref}`,
      description: `${totalAlt} unidades disponibles en bodegas alternativas. Traslado puede resolver agotamiento.`,
      category: "inventory",
      priority: 2,
      estimatedValue: null,
      effort: "medium",
      primaryEntity: entity,
      evidence,
      confidenceScore: 75,
      confidenceReason: "Inventario verificado en bodegas alternativas SAG",
    }));
  }

  // -- Recommendations (suggestedOnly: true) --------------------------------
  const recommendations: Recommendation[] = [];

  if (inv.totalAvailable === 0 && portfolios.filter(p => p.status === "activa").length > 0) {
    recommendations.push(buildRecommendation({
      title: `Actualizar maletas con referencia ${ref}`,
      description: `${portfolios.filter(p => p.status === "activa").length} maleta(s) activa(s) contienen ${ref} agotada. Retirar muestra o reemplazar referencia.`,
      category: "commercial",
      severity: "high",
      priority: 1,
      expectedBenefit: "Evitar que vendedores ofrezcan producto sin stock",
      primaryEntity: entity,
      evidence,
      confidenceScore: 90,
      confidenceReason: "Datos reales de maletas e inventario SAG",
    }));
  }

  if (totalAlt > 0 && inv.totalAvailable === 0) {
    recommendations.push(buildRecommendation({
      title: `Evaluar traslado de ${ref} desde bodegas alternativas`,
      description: `${totalAlt} unidades en ${alternativeInv.map(a => a.warehouseCode).join(", ")}`,
      category: "inventory",
      severity: "medium",
      priority: 2,
      expectedBenefit: `Reabastecer ${ref} sin esperar produccion`,
      primaryEntity: entity,
      evidence,
      confidenceScore: 75,
      confidenceReason: "Inventario alternativo verificado en SAG",
      missingInformation: ["Costo de traslado", "Tiempo de traslado"],
    }));
  }

  if (openOPs.length > 0 && inv.totalAvailable <= 10) {
    recommendations.push(buildRecommendation({
      title: `Dar seguimiento a produccion de ${ref}`,
      description: `${openOPs.length} OP(s) abiertas. Verificar estado y fecha estimada de entrega.`,
      category: "production",
      severity: "medium",
      priority: 3,
      expectedBenefit: "Anticipar reabastecimiento y desbloquear pedidos",
      primaryEntity: entity,
      evidence,
      confidenceScore: 70,
      confidenceReason: "OPs existen en SAG, fechas estimadas no disponibles",
      missingInformation: ["Fecha estimada de cierre de OP", "Cantidad real producida vs planeada"],
    }));
  }

  recommendations.sort((a, b) => a.priority - b.priority);

  // -- Confidence -----------------------------------------------------------
  const confidence = buildConfidence({
    score: inv.productId ? 80 : 50,
    reason: inv.productId
      ? "Datos reales de SAG: inventario, variantes, produccion"
      : "ProductEntity no encontrada — datos limitados",
    evidenceCount: observations.length,
    dataComplete: inv.productId != null && orders.length > 0,
    missingInformation: missingInfo,
  });

  return {
    observations,
    findings,
    insights,
    risks,
    opportunities,
    recommendations,
    confidence,
    missingInformation: missingInfo,
  };
}
