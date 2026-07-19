/**
 * production-executive-service.ts
 *
 * PRODUCTION-EXECUTIVE-DASHBOARD-01 — Executive Projection Service.
 *
 * Derives ProductionExecutiveSnapshot from ProductionOperationsSnapshot.
 * No Prisma. No SAG. No timeline/stage engine calls.
 * Pure deterministic projection.
 */

import type { ProductionOperationsSnapshot } from "./production-operations-types";
import type {
  ProductionExecutiveSnapshot,
  ProductionExecutiveHealth,
  ProductionHealthLevel,
  ProductionExecutiveKpi,
  ProductionExecutivePriority,
  ProductionPrioritySeverity,
  ProductionExecutiveBottleneck,
  ProductionExecutiveCostInsights,
  ProductionCostEntry,
  ProductionExecutiveDataTrust,
  ProductionDataTrustLevel,
} from "./production-executive-types";

// Stage label map (same as client — no import dependency on catalog for pure projection)
const STAGE_LABELS: Record<string, string> = {
  production_order: "Orden de Produccion",
  material_allocation: "Reserva de Material",
  material_consumption: "Consumo de Materiales",
  cutting: "Corte",
  printing: "Estampacion",
  embroidery: "Bordado",
  external_manufacturing: "Confeccion Externa",
  assembly: "Ensamble",
  third_party_services: "Servicios de Terceros",
  finishing: "Acabados",
  quality_control: "Control de Calidad",
  packaging: "Empaque",
  finished_goods_entry: "Entrada Producto Terminado",
  warehouse_transfer: "Traslado de Bodega",
  commercially_available: "Disponible Comercialmente",
};

function sl(code: string): string {
  return STAGE_LABELS[code] ?? code;
}

// ── Main Entry ──────────────────────────────────────────────────────────────

export function buildProductionExecutiveSnapshot(
  snapshot: ProductionOperationsSnapshot,
): ProductionExecutiveSnapshot {
  const health = buildHealth(snapshot);
  const kpis = buildExecutiveKpis(snapshot);
  const priorities = buildPriorities(snapshot);
  const bottlenecks = buildBottlenecks(snapshot);
  const costInsights = buildCostInsights(snapshot);
  const dataTrust = buildDataTrust(snapshot);

  return { health, kpis, priorities, bottlenecks, costInsights, dataTrust };
}

// ── Health (FASE 3) ─────────────────────────────────────────────────────────

function buildHealth(s: ProductionOperationsSnapshot): ProductionExecutiveHealth {
  const { kpis, alerts, dataQuality } = s;
  const signals: string[] = [];
  let level: ProductionHealthLevel = "OK";

  // Critical signals
  const criticalAlerts = alerts.filter(a => a.severity === "critical").length;
  if (criticalAlerts > 0) {
    signals.push(`${criticalAlerts} alerta${criticalAlerts > 1 ? "s" : ""} critica${criticalAlerts > 1 ? "s" : ""}`);
    level = "CRITICAL";
  }

  if (kpis.opDetenidas > 0) {
    signals.push(`${kpis.opDetenidas} orden${kpis.opDetenidas > 1 ? "es" : ""} detenida${kpis.opDetenidas > 1 ? "s" : ""}`);
    if (level !== "CRITICAL") level = "ATTENTION";
  }

  if (kpis.opSinConsumo > 3) {
    signals.push(`${kpis.opSinConsumo} ordenes sin consumo de materiales`);
    if (level !== "CRITICAL") level = "ATTENTION";
  }

  if (dataQuality.totalTimelines === 0) {
    signals.push("Sin datos de produccion");
    level = "CRITICAL";
  }

  if (dataQuality.costCoveragePct < 80) {
    signals.push(`Cobertura de costos al ${dataQuality.costCoveragePct}%`);
    if (level === "OK") level = "ATTENTION";
  }

  // Build summary
  let summary: string;
  if (level === "CRITICAL") {
    summary = `Produccion requiere atencion inmediata: ${signals.slice(0, 2).join(" y ")}.`;
  } else if (level === "ATTENTION") {
    summary = `Produccion requiere revision: ${signals.slice(0, 2).join(" y ")}.`;
  } else {
    summary = `Produccion opera con normalidad. ${kpis.opActivas} ordenes activas, ${kpis.opCompletas} completadas.`;
  }

  return { level, summary, signals };
}

// ── KPIs (FASE 4) ──────────────────────────────────────────────────────────

function buildExecutiveKpis(s: ProductionOperationsSnapshot): ProductionExecutiveKpi[] {
  const { kpis } = s;
  const result: ProductionExecutiveKpi[] = [];

  result.push({
    key: "activas",
    label: "Produccion activa",
    value: kpis.opActivas.toLocaleString(),
    raw: kpis.opActivas,
    color: null,
    suffix: kpis.opActivas === 1 ? "orden" : "ordenes",
  });

  result.push({
    key: "detenidas",
    label: "Produccion detenida",
    value: kpis.opDetenidas.toLocaleString(),
    raw: kpis.opDetenidas,
    color: kpis.opDetenidas > 0 ? "red" : null,
    suffix: kpis.opDetenidas === 1 ? "orden" : "ordenes",
  });

  result.push({
    key: "sin_consumo",
    label: "Sin consumo registrado",
    value: kpis.opSinConsumo.toLocaleString(),
    raw: kpis.opSinConsumo,
    color: kpis.opSinConsumo > 0 ? "amber" : null,
    suffix: kpis.opSinConsumo === 1 ? "orden" : "ordenes",
  });

  result.push({
    key: "completadas",
    label: "Produccion completada",
    value: kpis.opCompletas.toLocaleString(),
    raw: kpis.opCompletas,
    color: kpis.opCompletas > 0 ? "green" : null,
    suffix: kpis.opCompletas === 1 ? "orden" : "ordenes",
  });

  result.push({
    key: "costo_activo",
    label: "Costo material comprometido",
    value: formatCostCompact(kpis.costoMaterialActivas),
    raw: kpis.costoMaterialActivas,
    color: null,
    suffix: "",
  });

  result.push({
    key: "duracion",
    label: "Duracion promedio",
    value: kpis.diasPromedioProduccion !== null ? `${kpis.diasPromedioProduccion}` : "\u2014",
    raw: kpis.diasPromedioProduccion ?? 0,
    color: null,
    suffix: kpis.diasPromedioProduccion !== null ? "dias" : "",
  });

  return result;
}

// ── Priorities (FASE 5) ─────────────────────────────────────────────────────

function buildPriorities(s: ProductionOperationsSnapshot): ProductionExecutivePriority[] {
  const { kpis, orders, alerts, dataQuality } = s;
  const priorities: ProductionExecutivePriority[] = [];

  // 1. Detenidas
  if (kpis.opDetenidas > 0) {
    const detenidas = orders.filter(o => !o.isCompleted && o.daysSinceLastEvent !== null && o.daysSinceLastEvent > 30);
    const worst = detenidas[0];
    priorities.push({
      title: `${kpis.opDetenidas} orden${kpis.opDetenidas > 1 ? "es" : ""} sin movimiento`,
      impact: `Produccion detenida representa material comprometido sin avance`,
      evidence: worst
        ? `OP ${worst.opNumber} lleva ${worst.daysSinceLastEvent} dias sin actividad`
        : `${kpis.opDetenidas} ordenes sin evento en mas de 30 dias`,
      severity: "critical" as ProductionPrioritySeverity,
      action: "Revisar ordenes detenidas y validar estado con planta",
    });
  }

  // 2. Consumo pendiente
  if (kpis.opSinConsumo > 0) {
    const sinConsumo = orders.filter(o => o.classification === "order_only" && o.daysElapsed > 14);
    priorities.push({
      title: `${kpis.opSinConsumo} orden${kpis.opSinConsumo > 1 ? "es" : ""} sin consumo de materiales`,
      impact: "Ordenes creadas sin inicio de produccion — puede indicar falta de insumos",
      evidence: sinConsumo.length > 0
        ? `Mas antigua: OP ${sinConsumo[0].opNumber} creada hace ${sinConsumo[0].daysElapsed} dias`
        : `${kpis.opSinConsumo} ordenes sin retiro de materiales`,
      severity: kpis.opSinConsumo > 5 ? "high" : "medium",
      action: "Verificar disponibilidad de materiales y programacion",
    });
  }

  // 3. Ciclo largo (in-process stuck)
  const cicloLargoAlerts = alerts.filter(a => a.type === "ciclo_largo");
  if (cicloLargoAlerts.length > 0) {
    priorities.push({
      title: `${cicloLargoAlerts.length} orden${cicloLargoAlerts.length > 1 ? "es" : ""} con ciclo prolongado`,
      impact: "Materiales consumidos sin entrada de producto terminado — produccion atascada",
      evidence: cicloLargoAlerts[0].description,
      severity: "high",
      action: "Revisar estado de confeccion y entrada de producto terminado",
    });
  }

  // 4. High material cost concentration
  const active = orders.filter(o => !o.isCompleted);
  if (active.length > 0 && kpis.costoMaterialActivas > 0) {
    const sorted = [...active].sort((a, b) => b.materialCost - a.materialCost);
    const top3Cost = sorted.slice(0, 3).reduce((s, o) => s + o.materialCost, 0);
    const concentrationPct = Math.round((top3Cost / kpis.costoMaterialActivas) * 100);
    if (concentrationPct > 50 && sorted.length > 5) {
      priorities.push({
        title: `Concentracion de costo material`,
        impact: `${concentrationPct}% del costo activo esta en 3 ordenes`,
        evidence: `OP ${sorted[0].opNumber}: ${formatCostCompact(sorted[0].materialCost)}`,
        severity: "medium",
        action: "Revisar ordenes de mayor costo para priorizar terminacion",
      });
    }
  }

  // 5. Data freshness
  const now = Date.now();
  const lastCnDate = dataQuality.lastCnDate ? new Date(dataQuality.lastCnDate).getTime() : 0;
  const lastEtDate = dataQuality.lastEtDate ? new Date(dataQuality.lastEtDate).getTime() : 0;
  const daysSinceLastCn = lastCnDate > 0 ? Math.floor((now - lastCnDate) / (1000 * 60 * 60 * 24)) : null;
  const daysSinceLastEt = lastEtDate > 0 ? Math.floor((now - lastEtDate) / (1000 * 60 * 60 * 24)) : null;

  if (daysSinceLastCn !== null && daysSinceLastCn > 14) {
    priorities.push({
      title: "Datos de consumo desactualizados",
      impact: "Ultimo consumo de materiales registrado hace mas de 2 semanas",
      evidence: `Ultimo consumo: ${daysSinceLastCn} dias atras`,
      severity: "medium",
      action: "Validar sincronizacion con el ERP",
    });
  } else if (daysSinceLastEt !== null && daysSinceLastEt > 30) {
    priorities.push({
      title: "Sin entrada de producto terminado reciente",
      impact: "No se ha registrado ingreso de producto terminado en el ultimo mes",
      evidence: `Ultima entrada: ${daysSinceLastEt} dias atras`,
      severity: "medium",
      action: "Verificar que las entradas de PT estan siendo registradas",
    });
  }

  return priorities.slice(0, 5);
}

// ── Bottlenecks (FASE 6) ────────────────────────────────────────────────────

function buildBottlenecks(s: ProductionOperationsSnapshot): ProductionExecutiveBottleneck[] {
  const active = s.orders.filter(o => !o.isCompleted);
  if (active.length === 0) return [];

  // Count active OPs by current stage
  const stageCount = new Map<string, number>();
  for (const o of active) {
    if (o.currentStage) {
      stageCount.set(o.currentStage, (stageCount.get(o.currentStage) ?? 0) + 1);
    }
  }

  const bottlenecks: ProductionExecutiveBottleneck[] = [];
  const totalActive = active.length;

  // Sort by count descending
  const sorted = [...stageCount.entries()].sort(([, a], [, b]) => b - a);

  for (const [code, count] of sorted.slice(0, 3)) {
    const pct = Math.round((count / totalActive) * 100);

    let observation: string;
    if (code === "material_consumption" && pct > 50) {
      observation = `${pct}% de la produccion activa esta en consumo de materiales sin avanzar a confeccion o terminacion`;
    } else if (code === "production_order" && pct > 40) {
      observation = `${pct}% de las ordenes no han iniciado consumo de materiales`;
    } else if (code === "finished_goods_entry" && count > 0) {
      observation = `${count} ordenes en proceso de ingreso a bodega de producto terminado`;
    } else {
      observation = `${count} ordenes concentradas en ${sl(code)} (${pct}% del total activo)`;
    }

    bottlenecks.push({
      stageLabel: sl(code),
      stageCode: code,
      activeCount: count,
      concentrationPct: pct,
      observation,
    });
  }

  // Check for absence of finished_goods_entry
  const etStageCount = stageCount.get("finished_goods_entry") ?? 0;
  if (etStageCount === 0 && active.length > 5) {
    const inProcess = active.filter(o => o.classification === "materials_consumed").length;
    if (inProcess > 3) {
      bottlenecks.push({
        stageLabel: "Entrada Producto Terminado",
        stageCode: "finished_goods_entry",
        activeCount: 0,
        concentrationPct: 0,
        observation: `${inProcess} ordenes con materiales consumidos pero ninguna en etapa de entrada de producto terminado`,
      });
    }
  }

  return bottlenecks;
}

// ── Cost Insights (FASE 7) ──────────────────────────────────────────────────

function buildCostInsights(s: ProductionOperationsSnapshot): ProductionExecutiveCostInsights {
  const active = s.orders.filter(o => !o.isCompleted);
  const costoMaterialActivo = active.reduce((sum, o) => sum + o.materialCost, 0);
  const costoPromedioOP = active.length > 0 ? Math.round(costoMaterialActivo / active.length) : 0;

  // Top 5 OPs by cost
  const sortedByCost = [...active]
    .filter(o => o.materialCost > 0)
    .sort((a, b) => b.materialCost - a.materialCost);

  const topOpsPorCosto: ProductionCostEntry[] = sortedByCost.slice(0, 5).map(o => ({
    label: `OP ${o.opNumber}`,
    detail: o.referenceCode ?? o.description,
    cost: o.materialCost,
  }));

  // Top 5 references by cost (aggregate)
  const refCosts = new Map<string, { cost: number; desc: string | null }>();
  for (const o of active) {
    if (o.referenceCode && o.materialCost > 0) {
      const existing = refCosts.get(o.referenceCode);
      if (existing) {
        existing.cost += o.materialCost;
      } else {
        refCosts.set(o.referenceCode, { cost: o.materialCost, desc: o.description });
      }
    }
  }

  const topReferenciasPorCosto: ProductionCostEntry[] = [...refCosts.entries()]
    .sort(([, a], [, b]) => b.cost - a.cost)
    .slice(0, 5)
    .map(([ref, { cost, desc }]) => ({
      label: ref,
      detail: desc,
      cost,
    }));

  return {
    costoMaterialActivo,
    costoPromedioOP,
    topOpsPorCosto,
    topReferenciasPorCosto,
  };
}

// ── Data Trust (FASE 8) ─────────────────────────────────────────────────────

function buildDataTrust(s: ProductionOperationsSnapshot): ProductionExecutiveDataTrust {
  const { dataQuality } = s;

  let level: ProductionDataTrustLevel;
  let summary: string;

  if (dataQuality.totalTimelines === 0) {
    level = "INSUFICIENTE";
    summary = "Sin datos de produccion disponibles para analisis.";
  } else if (dataQuality.costCoveragePct >= 90 && dataQuality.chronologicalConsistencyPct >= 95) {
    level = "CONFIABLE";
    summary = `Datos de produccion confiables. ${dataQuality.totalTimelines} ordenes analizadas con ${dataQuality.costCoveragePct}% de cobertura de costos.`;
  } else if (dataQuality.costCoveragePct >= 60) {
    level = "PARCIAL";
    summary = `Datos parcialmente confiables. Cobertura de costos al ${dataQuality.costCoveragePct}%.`;
  } else {
    level = "INSUFICIENTE";
    summary = `Datos insuficientes para decision. Cobertura de costos al ${dataQuality.costCoveragePct}%.`;
  }

  return {
    level,
    summary,
    lastOrdenProduccion: dataQuality.lastOpDate,
    lastConsumoMaterial: dataQuality.lastCnDate,
    lastEntradaPT: dataQuality.lastEtDate,
    lastSync: dataQuality.lastSync,
    costCoveragePct: dataQuality.costCoveragePct,
    consistencyPct: dataQuality.chronologicalConsistencyPct,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCostCompact(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  if (value === 0) return "$0";
  return `$${value.toLocaleString()}`;
}
