/**
 * production-control-service.ts
 *
 * PRODUCTION-CONTROL-CENTER-01 — Phase 13: Server Layer.
 *
 * Builds ProductionControlSnapshot by consuming:
 *   - loadProductionFlowSnapshot() from Production Intelligence
 *   - Direct Prisma queries for OP metadata (last sync, line counts)
 *
 * Does NOT duplicate any production engine logic.
 * Does NOT access SAG adapters directly.
 *
 * server-only — uses Prisma + production intelligence loaders.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { loadProductionFlowSnapshot } from "@/lib/production-intelligence/production-flow-loader";
import { DEFAULT_PRODUCTION_STAGES } from "@/lib/production-intelligence/production-stage-inference";
import type { ProductionFlowSnapshot, ProductionReferenceFlow } from "@/lib/production-intelligence/production-flow-types";
import type {
  ProductionControlSnapshot,
  ProductionControlOrder,
  ProductionKpis,
  ProductionStageSummary,
  ProductionAlert,
  ProductionDataQuality,
} from "./production-control-types";

// ── Main Entry ──────────────────────────────────────────────────────────────

export async function buildProductionControlSnapshot(
  organizationId: string,
  orgSlug: string,
): Promise<ProductionControlSnapshot> {
  // Load production flow snapshot (reuses existing engine — no duplication)
  const [flowSnapshot, opMeta] = await Promise.all([
    loadProductionFlowSnapshot(organizationId, orgSlug),
    loadOpMeta(organizationId),
  ]);

  const orders = buildControlOrders(flowSnapshot);
  const kpis = buildKpis(orders, flowSnapshot);
  const stages = buildStageSummaries(orders);
  const alerts = buildAlerts(orders, flowSnapshot);
  const dataQuality = buildDataQuality(flowSnapshot, opMeta);

  return {
    orgSlug,
    computedAt: new Date().toISOString(),
    kpis,
    orders,
    stages,
    alerts,
    dataQuality,
  };
}

// ── Order Mapping ───────────────────────────────────────────────────────────

function buildControlOrders(snapshot: ProductionFlowSnapshot): ProductionControlOrder[] {
  const orders: ProductionControlOrder[] = [];

  for (const ref of snapshot.referenceFlows) {
    for (const op of ref.activeOrders) {
      orders.push({
        id: `${ref.referenceCode}::${op.opNumber}`,
        opNumber: op.opNumber,
        referenceCode: ref.referenceCode,
        description: ref.description,
        subLinea: ref.subLinea,
        subGrupo: ref.subGrupo,
        quantityOrdered: op.quantityOrdered,
        quantityInBodega01: ref.availabilityImpact.existenciaBodega01,
        quantityPending: computePending(op.quantityOrdered, ref.availabilityImpact.existenciaBodega01),
        completionPct: computeCompletionPct(op.quantityOrdered, ref.availabilityImpact.existenciaBodega01),
        activationDate: op.activationDate,
        daysOpen: op.daysInProduction,
        currentStage: op.stageInference.stageId,
        currentStageLabel: op.stageInference.stageLabel,
        lastMovementDate: extractLastMovementDate(op.documents),
        productionStatus: ref.stageState.productionStatus,
        delayRiskLevel: ref.delayRisk.level,
        isClosed: op.isClosed,
      });
    }

    // Include recently closed OPs for visibility
    for (const op of ref.closedOrders) {
      orders.push({
        id: `${ref.referenceCode}::${op.opNumber}`,
        opNumber: op.opNumber,
        referenceCode: ref.referenceCode,
        description: ref.description,
        subLinea: ref.subLinea,
        subGrupo: ref.subGrupo,
        quantityOrdered: op.quantityOrdered,
        quantityInBodega01: ref.availabilityImpact.existenciaBodega01,
        quantityPending: null,
        completionPct: 100,
        activationDate: op.activationDate,
        daysOpen: op.daysInProduction,
        currentStage: "entrada_producto",
        currentStageLabel: "Entrada Producto Terminado",
        lastMovementDate: extractLastMovementDate(op.documents),
        productionStatus: "completed",
        delayRiskLevel: "none",
        isClosed: true,
      });
    }
  }

  // Sort: active first (by delay risk desc, then daysOpen desc), closed at the end
  orders.sort((a, b) => {
    if (a.isClosed !== b.isClosed) return a.isClosed ? 1 : -1;
    const riskOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, none: 0 };
    const riskDiff = (riskOrder[b.delayRiskLevel] ?? 0) - (riskOrder[a.delayRiskLevel] ?? 0);
    if (riskDiff !== 0) return riskDiff;
    return b.daysOpen - a.daysOpen;
  });

  return orders;
}

// ── KPIs ────────────────────────────────────────────────────────────────────

function buildKpis(orders: ProductionControlOrder[], snapshot: ProductionFlowSnapshot): ProductionKpis {
  const active = orders.filter(o => !o.isClosed);
  const uniqueRefs = new Set(active.map(o => o.referenceCode));

  return {
    opActivas: active.length,
    unidadesComprometidas: active.reduce((s, o) => s + o.quantityOrdered, 0),
    unidadesTerminadas: orders.filter(o => o.isClosed).reduce((s, o) => s + o.quantityOrdered, 0),
    unidadesPendientes: active.reduce((s, o) => s + (o.quantityPending ?? o.quantityOrdered), 0),
    opRetrasadas: active.filter(o => o.delayRiskLevel === "high" || o.delayRiskLevel === "critical").length,
    opSinMovimiento: active.filter(o => o.productionStatus === "stalled").length,
    diasPromedioProduccion: snapshot.summary.avgDaysInProduction,
    referenciasUnicas: uniqueRefs.size,
  };
}

// ── Stage Summaries ─────────────────────────────────────────────────────────

function buildStageSummaries(orders: ProductionControlOrder[]): ProductionStageSummary[] {
  const active = orders.filter(o => !o.isClosed);
  const stageMap = new Map<string, ProductionControlOrder[]>();

  for (const order of active) {
    const key = order.currentStage;
    const list = stageMap.get(key) ?? [];
    list.push(order);
    stageMap.set(key, list);
  }

  const summaries: ProductionStageSummary[] = [];

  for (const stageDef of DEFAULT_PRODUCTION_STAGES) {
    const stageOrders = stageMap.get(stageDef.stageId) ?? [];
    const uniqueRefs = new Set(stageOrders.map(o => o.referenceCode));

    summaries.push({
      stageId: stageDef.stageId,
      stageLabel: stageDef.label,
      stageOrder: stageDef.order,
      opCount: stageOrders.length,
      referenceCount: uniqueRefs.size,
      unitsCommitted: stageOrders.reduce((s, o) => s + o.quantityOrdered, 0),
      oldestOpDate: stageOrders.length > 0
        ? stageOrders.reduce((oldest, o) => o.activationDate < oldest ? o.activationDate : oldest, stageOrders[0].activationDate)
        : null,
      newestOpDate: stageOrders.length > 0
        ? stageOrders.reduce((newest, o) => o.activationDate > newest ? o.activationDate : newest, stageOrders[0].activationDate)
        : null,
    });
  }

  // Add indeterminada if any orders have that stage
  const indeterminate = stageMap.get("indeterminada") ?? [];
  if (indeterminate.length > 0) {
    const uniqueRefs = new Set(indeterminate.map(o => o.referenceCode));
    summaries.push({
      stageId: "indeterminada",
      stageLabel: "Etapa indeterminada",
      stageOrder: 99,
      opCount: indeterminate.length,
      referenceCount: uniqueRefs.size,
      unitsCommitted: indeterminate.reduce((s, o) => s + o.quantityOrdered, 0),
      oldestOpDate: indeterminate.reduce((oldest, o) => o.activationDate < oldest ? o.activationDate : oldest, indeterminate[0].activationDate),
      newestOpDate: indeterminate.reduce((newest, o) => o.activationDate > newest ? o.activationDate : newest, indeterminate[0].activationDate),
    });
  }

  return summaries;
}

// ── Alerts ──────────────────────────────────────────────────────────────────

function buildAlerts(orders: ProductionControlOrder[], snapshot: ProductionFlowSnapshot): ProductionAlert[] {
  const alerts: ProductionAlert[] = [];
  const active = orders.filter(o => !o.isClosed);

  // OP detenida: stalled status
  for (const o of active.filter(o => o.productionStatus === "stalled")) {
    alerts.push({
      type: "op_detenida",
      severity: "critical",
      title: `OP ${o.opNumber} detenida`,
      description: `${o.referenceCode} — ${o.daysOpen} dias sin movimiento`,
      opNumber: o.opNumber,
      referenceCode: o.referenceCode,
      daysOpen: o.daysOpen,
    });
  }

  // OP antigua: >90 days open
  for (const o of active.filter(o => o.daysOpen > 90 && o.productionStatus !== "stalled")) {
    alerts.push({
      type: "op_antigua",
      severity: "warning",
      title: `OP ${o.opNumber} antigua`,
      description: `${o.referenceCode} — ${o.daysOpen} dias en produccion`,
      opNumber: o.opNumber,
      referenceCode: o.referenceCode,
      daysOpen: o.daysOpen,
    });
  }

  // Produccion retrasada: high/critical delay risk
  for (const o of active.filter(o => o.delayRiskLevel === "critical")) {
    if (!alerts.some(a => a.opNumber === o.opNumber)) {
      alerts.push({
        type: "produccion_retrasada",
        severity: "critical",
        title: `Produccion retrasada — OP ${o.opNumber}`,
        description: `${o.referenceCode} con riesgo critico de retraso`,
        opNumber: o.opNumber,
        referenceCode: o.referenceCode,
        daysOpen: o.daysOpen,
      });
    }
  }

  // Referencia critica: OOS with active production
  for (const ref of snapshot.referenceFlows) {
    if (ref.availabilityImpact.isOutOfStock && ref.activeOrders.length > 0) {
      alerts.push({
        type: "referencia_critica",
        severity: "warning",
        title: `Referencia agotada en produccion`,
        description: `${ref.referenceCode} — agotada en Bodega 01, tiene ${ref.activeOrders.length} OP activa(s)`,
        opNumber: ref.activeOrders[0]?.opNumber ?? null,
        referenceCode: ref.referenceCode,
        daysOpen: null,
      });
    }
  }

  // Sort: critical first, then warning, then info
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));

  return alerts;
}

// ── Data Quality ────────────────────────────────────────────────────────────

function buildDataQuality(
  snapshot: ProductionFlowSnapshot,
  meta: OpMeta,
): ProductionDataQuality {
  const warnings: string[] = [];

  if (!snapshot.confidence.hasProductionData) {
    warnings.push("Sin datos de produccion — tabla ProductionOrder sin registros.");
  }
  if (!snapshot.confidence.hasAvailabilityData) {
    warnings.push("Sin datos de disponibilidad — Bodega 01 sin registros.");
  }
  if (!snapshot.confidence.hasTransferData) {
    warnings.push("Sin datos de transferencias — no se puede verificar flujo Bodega 04 -> 01.");
  }
  if (meta.totalOrders === 0) {
    warnings.push("No hay ordenes de produccion registradas.");
  }

  return {
    lastSync: meta.lastSync,
    confidence: snapshot.confidence,
    totalOrders: meta.totalOrders,
    totalLines: meta.totalLines,
    warnings,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function computePending(ordered: number, inBodega01: number | null): number | null {
  if (inBodega01 === null) return null;
  return Math.max(0, ordered - inBodega01);
}

function computeCompletionPct(ordered: number, inBodega01: number | null): number | null {
  if (inBodega01 === null || ordered === 0) return null;
  return Math.min(100, Math.round((inBodega01 / ordered) * 100));
}

function extractLastMovementDate(
  documents: Array<{ documentDate: string }>,
): string | null {
  if (documents.length === 0) return null;
  return documents.reduce((latest, d) =>
    d.documentDate > latest ? d.documentDate : latest,
  documents[0].documentDate);
}

// ── OP Metadata (direct Prisma) ─────────────────────────────────────────────

interface OpMeta {
  totalOrders: number;
  totalLines: number;
  lastSync: string | null;
}

async function loadOpMeta(organizationId: string): Promise<OpMeta> {
  const db = prisma as any;

  try {
    const [orderCount, lineCount, lastRun] = await Promise.all([
      db.productionOrder.count({ where: { organizationId } }),
      db.productionOrderLine.count({
        where: { productionOrder: { organizationId } },
      }),
      db.connectorRun.findFirst({
        where: {
          connector: { organizationId, source: "sag_pya_soap" },
          module: "production",
          status: "SUCCESS",
        },
        orderBy: { completedAt: "desc" },
        select: { completedAt: true },
      }),
    ]);

    return {
      totalOrders: orderCount,
      totalLines: lineCount,
      lastSync: lastRun?.completedAt?.toISOString() ?? null,
    };
  } catch {
    return { totalOrders: 0, totalLines: 0, lastSync: null };
  }
}
