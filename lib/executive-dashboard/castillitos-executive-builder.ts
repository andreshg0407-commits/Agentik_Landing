/**
 * castillitos-executive-builder.ts
 *
 * CASTILLITOS-EXECUTIVE-REPORTS-INTEGRATION-02 — Phases 2-11.
 *
 * Pure domain logic that builds executive intelligence from existing engines.
 * NO new business logic. Only orchestrates and summarizes.
 *
 * No React. No Prisma. No server-only. Pure domain logic.
 */

import type { CommercialAvailabilityReport } from "@/lib/commercial-intelligence/availability-types";
import type { MaletaReplacementReport } from "@/lib/commercial-intelligence/availability-types";
import type { ProductionInProgressReport } from "@/lib/production-intelligence/production-types";
import type { ProductionFlowSnapshot, ProductionFlowExecutiveReport } from "@/lib/production-intelligence/production-flow-types";
import type { ReplenishmentSnapshot, ReplenishmentExecutiveReport } from "@/lib/replenishment-intelligence/replenishment-types";
import type { LiveVendorProfile } from "@/lib/comercial/vendors/live-vendor-types";
import type {
  CastillitosExecutiveIntelligence,
  VendorExecutiveSummary,
  VendorSummaryRow,
  ExecutiveDataQuality,
  DataSourceStatus,
  ExecutiveAlert,
  CeoExecutiveQuestion,
} from "./castillitos-executive-types";

// ── Phase 1: Assemble Full Intelligence ──────────────────────────────────────

/** Assemble the complete executive intelligence package. No business logic — only consolidation. */
export function assembleCastillitosExecutiveIntelligence(opts: {
  orgSlug: string;
  availabilityReport: CommercialAvailabilityReport | null;
  maletaReport: MaletaReplacementReport | null;
  productionReport: ProductionInProgressReport | null;
  productionFlow: ProductionFlowSnapshot | null;
  productionFlowExecutive: ProductionFlowExecutiveReport | null;
  replenishment: ReplenishmentSnapshot | null;
  replenishmentExecutive: ReplenishmentExecutiveReport | null;
  vendors: LiveVendorProfile[];
}): CastillitosExecutiveIntelligence {
  const vendorSummary = opts.vendors.length > 0
    ? buildVendorExecutiveSummary(opts.vendors)
    : null;

  const dataQuality = buildDataQuality(opts);

  return {
    orgSlug: opts.orgSlug,
    assembledAt: new Date().toISOString(),
    availabilityReport: opts.availabilityReport,
    maletaReport: opts.maletaReport,
    productionReport: opts.productionReport,
    productionFlow: opts.productionFlow,
    productionFlowExecutive: opts.productionFlowExecutive,
    replenishment: opts.replenishment,
    replenishmentExecutive: opts.replenishmentExecutive,
    vendors: opts.vendors,
    vendorSummary,
    dataQuality,
  };
}

// ── Phase 7: Vendor Executive Summary ────────────────────────────────────────

function buildVendorExecutiveSummary(vendors: LiveVendorProfile[]): VendorExecutiveSummary {
  const rows: VendorSummaryRow[] = vendors.map((v) => {
    const criticalItems = v.portfolio.items.filter(
      (i) => i.replacementRequired || i.commercialAvailabilityStatus === "out_of_stock",
    );
    const outOfStockItems = v.portfolio.items.filter(
      (i) => i.commercialAvailabilityStatus === "out_of_stock",
    );

    return {
      vendorId: v.vendorId,
      vendorName: v.vendorName,
      locationCode: v.location.locationCode,
      totalReferences: v.portfolio.totalReferences,
      totalUnits: v.portfolio.totalUnits,
      criticalCount: criticalItems.length,
      outOfStockCount: outOfStockItems.length,
      lastTransferAt: v.portfolio.lastTransferAt,
      coverageScore: v.coverage.health === "healthy" ? 90 : v.coverage.health === "attention_needed" ? 60 : v.coverage.health === "critical" ? 30 : 0,
      operationalState: v.operationalState,
    };
  });

  const vendorsWithCritical = rows.filter((r) => r.criticalCount > 0).length;
  const vendorsHealthy = rows.filter((r) => r.criticalCount === 0).length;

  return {
    totalVendors: vendors.length,
    vendorsWithCriticalRefs: vendorsWithCritical,
    vendorsHealthy,
    totalReferencesInPortfolios: rows.reduce((s, r) => s + r.totalReferences, 0),
    totalUnitsInPortfolios: rows.reduce((s, r) => s + r.totalUnits, 0),
    vendors: rows,
  };
}

// ── Phase 10: Executive Alerts ───────────────────────────────────────────────

/** Build consolidated executive alerts from all intelligence sources. */
export function buildExecutiveAlerts(intel: CastillitosExecutiveIntelligence): ExecutiveAlert[] {
  const alerts: ExecutiveAlert[] = [];

  // Availability alerts
  if (intel.availabilityReport) {
    const r = intel.availabilityReport;
    if (r.sobreComprometidoCount > 0) {
      alerts.push({
        id: "avail_sobre_comprometido",
        category: "inventory",
        severity: "critical",
        title: `${r.sobreComprometidoCount} referencia(s) sobre-comprometida(s)`,
        detail: `Se han vendido mas unidades de las disponibles en Bodega 01. Revisar compromisos de pedidos.`,
        source: "Commercial Availability",
        metricValue: r.sobreComprometidoCount,
        recommendedAction: "Revisar pedidos pendientes y priorizar despacho",
      });
    }
    if (r.sinExistenciaCount > 0) {
      alerts.push({
        id: "avail_sin_existencia",
        category: "inventory",
        severity: "high",
        title: `${r.sinExistenciaCount} referencia(s) sin existencia`,
        detail: `Bodega 01 no tiene stock de estas referencias.`,
        source: "Commercial Availability",
        metricValue: r.sinExistenciaCount,
        recommendedAction: null,
      });
    }
  }

  // Production flow alerts
  if (intel.productionFlow) {
    const s = intel.productionFlow.summary;
    if (s.outOfStockWithoutProduction > 0) {
      alerts.push({
        id: "prod_agotado_sin_produccion",
        category: "production",
        severity: "critical",
        title: `${s.outOfStockWithoutProduction} referencia(s) agotada(s) sin produccion`,
        detail: `No hay OP activa para estas referencias. Requiere decision de produccion.`,
        source: "Production Flow Intelligence",
        metricValue: s.outOfStockWithoutProduction,
        recommendedAction: "Crear ordenes de produccion o buscar reemplazos",
      });
    }
    if (s.delayRiskCount > 0) {
      alerts.push({
        id: "prod_delay_risk",
        category: "production",
        severity: "high",
        title: `${s.delayRiskCount} referencia(s) con riesgo de retraso`,
        detail: `Produccion activa que excede umbrales normales de tiempo.`,
        source: "Production Flow Intelligence",
        metricValue: s.delayRiskCount,
        recommendedAction: "Revisar OPs con la planta de produccion",
      });
    }
    if (s.recoverySoonCount > 0) {
      alerts.push({
        id: "prod_recovery_soon",
        category: "production",
        severity: "info",
        title: `${s.recoverySoonCount} referencia(s) proxima(s) a terminar produccion`,
        detail: `Produccion que deberia entrar a Bodega 01 pronto.`,
        source: "Production Flow Intelligence",
        metricValue: s.recoverySoonCount,
        recommendedAction: null,
      });
    }
  }

  // Replenishment alerts
  if (intel.replenishment) {
    const s = intel.replenishment.summary;
    if (s.criticalCount > 0) {
      alerts.push({
        id: "repl_critical",
        category: "replenishment",
        severity: "critical",
        title: `${s.criticalCount} recomendacion(es) critica(s) de reposicion`,
        detail: `Vendedores o tiendas con deficit de stock urgente.`,
        source: "Replenishment Intelligence",
        metricValue: s.criticalCount,
        recommendedAction: "Preparar despachos inmediatos",
      });
    }
    if (s.suggestProductionCount > 0) {
      alerts.push({
        id: "repl_need_production",
        category: "replenishment",
        severity: "high",
        title: `${s.suggestProductionCount} referencia(s) necesitan produccion`,
        detail: `Agotados sin produccion activa, sin reemplazo disponible.`,
        source: "Replenishment Intelligence",
        metricValue: s.suggestProductionCount,
        recommendedAction: "Evaluar creacion de OPs",
      });
    }
    if (s.replaceCount > 0) {
      alerts.push({
        id: "repl_replacements",
        category: "replenishment",
        severity: "medium",
        title: `${s.replaceCount} referencia(s) con reemplazo disponible`,
        detail: `Alternativas del mismo SubGrupo disponibles en Bodega 01.`,
        source: "Replenishment Intelligence",
        metricValue: s.replaceCount,
        recommendedAction: "Considerar sustitucion en maletas",
      });
    }
  }

  // Vendor alerts
  if (intel.vendorSummary) {
    if (intel.vendorSummary.vendorsWithCriticalRefs > 0) {
      alerts.push({
        id: "vendor_critical",
        category: "vendor",
        severity: "high",
        title: `${intel.vendorSummary.vendorsWithCriticalRefs} vendedor(es) con refs criticas`,
        detail: `Vendedores cuya maleta tiene referencias agotadas o bajo umbral CEO.`,
        source: "LiveVendor Intelligence",
        metricValue: intel.vendorSummary.vendorsWithCriticalRefs,
        recommendedAction: "Revisar composicion de maletas",
      });
    }
  }

  // Sort: critical first, then high, then by category
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return alerts;
}

// ── Phase 9: CEO Executive Questions ─────────────────────────────────────────

/** Build CEO questions answered from real intelligence (not dashboard state). */
export function buildCeoExecutiveQuestions(intel: CastillitosExecutiveIntelligence): CeoExecutiveQuestion[] {
  const questions: CeoExecutiveQuestion[] = [];

  // Q1: Cual es el estado de mi inventario?
  if (intel.availabilityReport) {
    const r = intel.availabilityReport;
    const critCount = r.sobreComprometidoCount + r.sinExistenciaCount;
    questions.push({
      question: "Cual es el estado de mi inventario?",
      answer: `${r.totalReferences} referencias analizadas. ${r.disponibleCount} disponibles, ${r.comprometidoCount} comprometidas, ${r.sobreComprometidoCount} sobre-comprometidas, ${r.sinExistenciaCount} sin existencia. Disponible real total: ${fmtNum(r.totalDisponible)}.`,
      severity: critCount > 5 ? "critical" : critCount > 0 ? "warning" : "info",
      sources: ["Commercial Availability"],
      confidence: r.confidence,
    });
  }

  // Q2: Como va la produccion?
  if (intel.productionFlow) {
    const s = intel.productionFlow.summary;
    questions.push({
      question: "Como va la produccion?",
      answer: `${s.totalReferencesInProduction} referencias en produccion. ${s.activeProductionCount} activas, ${s.recentlyCompletedCount} recien completadas, ${s.stalledCount} detenidas. ${s.outOfStockWithProduction} agotadas con produccion, ${s.outOfStockWithoutProduction} sin produccion. Promedio: ${s.avgDaysInProduction} dias.`,
      severity: s.outOfStockWithoutProduction > 0 ? "critical" : s.delayRiskCount > 0 ? "warning" : "info",
      sources: ["Production Flow Intelligence"],
      confidence: intel.productionFlow.confidence.score,
    });
  } else if (intel.productionReport) {
    const r = intel.productionReport;
    questions.push({
      question: "Como va la produccion?",
      answer: `${r.totalReferences} referencias en proceso. ${r.enProcesoCount} en proceso, ${r.completadoCount} completados, ${r.detenidoCount} detenidos. Promedio: ${r.avgDiasEnProduccion} dias.`,
      severity: r.detenidoCount > 0 ? "warning" : "info",
      sources: ["Production Engine"],
      confidence: r.confidence,
    });
  }

  // Q3: Que agotados debo atender?
  if (intel.productionFlow) {
    const exec = intel.productionFlowExecutive;
    if (exec) {
      const withProd = exec.outOfStockWithProduction.length;
      const withoutProd = exec.outOfStockWithoutProduction.length;
      questions.push({
        question: "Que agotados debo atender?",
        answer: withProd + withoutProd === 0
          ? "No hay referencias agotadas actualmente."
          : `${withProd + withoutProd} referencia(s) agotada(s). ${withProd} con produccion activa (esperar). ${withoutProd} sin produccion (requiere accion).`,
        severity: withoutProd > 0 ? "critical" : withProd > 0 ? "warning" : "info",
        sources: ["Production Flow Intelligence"],
        confidence: intel.productionFlow.confidence.score,
      });
    }
  }

  // Q4: Como estan los vendedores?
  if (intel.vendorSummary) {
    const vs = intel.vendorSummary;
    questions.push({
      question: "Como estan los vendedores?",
      answer: `${vs.totalVendors} vendedores activos. ${vs.vendorsHealthy} con maleta saludable, ${vs.vendorsWithCriticalRefs} con refs criticas. ${vs.totalReferencesInPortfolios} refs totales en portafolios (${fmtNum(vs.totalUnitsInPortfolios)} uds).`,
      severity: vs.vendorsWithCriticalRefs > 2 ? "critical" : vs.vendorsWithCriticalRefs > 0 ? "warning" : "info",
      sources: ["LiveVendor Intelligence"],
      confidence: 75,
    });
  }

  // Q5: Que debo reponer?
  if (intel.replenishment) {
    const s = intel.replenishment.summary;
    questions.push({
      question: "Que debo reponer?",
      answer: s.totalRecommendations === 0
        ? "No hay recomendaciones de reposicion pendientes."
        : `${s.totalRecommendations} recomendacion(es): ${s.criticalCount} criticas, ${s.highCount} altas. ${s.replenishCount} para reponer, ${s.replaceCount} para reemplazar, ${s.suggestProductionCount} para producir. ${s.totalVendorsAffected} vendedor(es) afectado(s).`,
      severity: s.criticalCount > 0 ? "critical" : s.highCount > 0 ? "warning" : "info",
      sources: ["Replenishment Intelligence"],
      confidence: intel.replenishment.confidence.score,
    });
  }

  // Q6: Hay produccion retrasada?
  if (intel.productionFlowExecutive) {
    const delays = intel.productionFlowExecutive.delayRiskReferences;
    questions.push({
      question: "Hay produccion retrasada?",
      answer: delays.length === 0
        ? "No hay produccion con riesgo de retraso."
        : `${delays.length} referencia(s) con riesgo de retraso. ${delays.filter((d) => d.delayRisk.level === "critical").length} criticas, ${delays.filter((d) => d.delayRisk.level === "high").length} altas.`,
      severity: delays.some((d) => d.delayRisk.level === "critical") ? "critical" : delays.length > 0 ? "warning" : "info",
      sources: ["Production Flow Intelligence"],
      confidence: intel.productionFlow?.confidence.score ?? 50,
    });
  }

  // Q7: Que maletas necesitan gestion?
  if (intel.maletaReport) {
    const r = intel.maletaReport;
    questions.push({
      question: "Que maletas necesitan gestion?",
      answer: r.totalRequiringReplacement === 0
        ? "Todas las maletas estan al dia."
        : `${r.totalRequiringReplacement} referencia(s) requieren reemplazo en maletas de vendedores.`,
      severity: r.totalRequiringReplacement > 5 ? "critical" : r.totalRequiringReplacement > 0 ? "warning" : "info",
      sources: ["Maleta Replacement Intelligence"],
      confidence: 80,
    });
  }

  // Q8: Calidad de datos
  questions.push({
    question: "Que tan confiables son estos datos?",
    answer: intel.dataQuality.qualitySummary,
    severity: intel.dataQuality.overallConfidence < 50 ? "warning" : "info",
    sources: intel.dataQuality.sources.filter((s) => s.available).map((s) => s.name),
    confidence: intel.dataQuality.overallConfidence,
  });

  return questions;
}

// ── Phase 13: Data Quality ──────────────────────────────────────────────────

function buildDataQuality(opts: {
  availabilityReport: CommercialAvailabilityReport | null;
  productionReport: ProductionInProgressReport | null;
  productionFlow: ProductionFlowSnapshot | null;
  replenishment: ReplenishmentSnapshot | null;
  vendors: LiveVendorProfile[];
  maletaReport: MaletaReplacementReport | null;
}): ExecutiveDataQuality {
  const sources: DataSourceStatus[] = [];

  const hasAvail = opts.availabilityReport != null;
  sources.push({
    name: "Disponibilidad Comercial",
    available: hasAvail,
    recordCount: hasAvail ? opts.availabilityReport!.totalReferences : null,
    confidence: hasAvail ? opts.availabilityReport!.confidence : 0,
    note: hasAvail ? `${opts.availabilityReport!.totalReferences} referencias` : "Sin datos SAG de Bodega 01",
  });

  const hasProd = opts.productionReport != null;
  sources.push({
    name: "Produccion en Proceso",
    available: hasProd,
    recordCount: hasProd ? opts.productionReport!.totalReferences : null,
    confidence: hasProd ? opts.productionReport!.confidence : 0,
    note: hasProd ? `${opts.productionReport!.totalReferences} referencias` : "Sin datos SAG de Bodega 04",
  });

  const hasFlow = opts.productionFlow != null;
  sources.push({
    name: "Production Flow Intelligence",
    available: hasFlow,
    recordCount: hasFlow ? opts.productionFlow!.referenceFlows.length : null,
    confidence: hasFlow ? opts.productionFlow!.confidence.score : 0,
    note: hasFlow ? `${opts.productionFlow!.referenceFlows.length} flujos` : "Requiere produccion + disponibilidad",
  });

  const hasRepl = opts.replenishment != null;
  sources.push({
    name: "Replenishment Intelligence",
    available: hasRepl,
    recordCount: hasRepl ? opts.replenishment!.recommendations.length : null,
    confidence: hasRepl ? opts.replenishment!.confidence.score : 0,
    note: hasRepl ? `${opts.replenishment!.recommendations.length} recomendaciones` : "Requiere disponibilidad",
  });

  const hasVendors = opts.vendors.length > 0;
  sources.push({
    name: "LiveVendor Profiles",
    available: hasVendors,
    recordCount: hasVendors ? opts.vendors.length : null,
    confidence: hasVendors ? 75 : 0,
    note: hasVendors ? `${opts.vendors.length} vendedores` : "Sin datos de vendedores",
  });

  const hasMaleta = opts.maletaReport != null;
  sources.push({
    name: "Maleta Replacement",
    available: hasMaleta,
    recordCount: hasMaleta ? opts.maletaReport!.items.length : null,
    confidence: hasMaleta ? 80 : 0,
    note: hasMaleta ? `${opts.maletaReport!.items.length} items` : "Requiere disponibilidad + vendedores",
  });

  const availableCount = sources.filter((s) => s.available).length;
  const totalCount = sources.length;
  const avgConfidence = sources.length > 0
    ? Math.round(sources.reduce((s, src) => s + src.confidence, 0) / sources.length)
    : 0;

  const qualitySummary = availableCount === totalCount
    ? `${totalCount}/${totalCount} fuentes disponibles. Confianza promedio: ${avgConfidence}%.`
    : `${availableCount}/${totalCount} fuentes disponibles. ${totalCount - availableCount} fuente(s) sin datos. Confianza promedio: ${avgConfidence}%.`;

  return {
    hasAvailabilityData: hasAvail,
    hasProductionData: hasProd,
    hasProductionFlowData: hasFlow,
    hasReplenishmentData: hasRepl,
    hasVendorData: hasVendors,
    hasMaletaData: hasMaleta,
    overallConfidence: avgConfidence,
    qualitySummary,
    sources,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return new Intl.NumberFormat("es-CO").format(n);
}
