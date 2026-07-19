/**
 * lib/comercial/produccion/production-alerts.ts
 *
 * FASE 7 — Alert builder functions for Production Planning Policy Pack.
 * Pure functions — no DB, no Prisma, no side effects.
 *
 * Sprint: PRODUCTION-PLANNING-POLICY-PACK-01
 */

import type {
  ProductionAlert,
  ProductionAlertType,
  ProductionAlertSeverity,
  ProductionPlanningContext,
  ProductionNeedResult,
  ShortageResult,
  ProductionEvidenceItem,
} from "./production-planning-types";

import type { ProductionPlanningConfig } from "./production-planning-config";

// ── Alert ID generator ─────────────────────────────────────────────────────

let alertCounter = 0;

function nextAlertId(type: ProductionAlertType): string {
  return `prod-alert-${type.toLowerCase()}-${++alertCounter}`;
}

function deduplicationKey(type: ProductionAlertType, entityId: string, tenantId: string): string {
  return `${type}::${tenantId}::${entityId}`;
}

// ── Production required alert ───────────────────────────────────────────────

export function buildProductionRequiredAlert(
  ctx: ProductionPlanningContext,
  result: ProductionNeedResult,
  config: ProductionPlanningConfig,
): ProductionAlert | null {
  if (result.decision !== "PRODUCE") return null;

  return {
    alertId: nextAlertId("PRODUCTION_REQUIRED"),
    tenantId: ctx.tenantId,
    type: "PRODUCTION_REQUIRED",
    severity: config.alerts.productionRequiredSeverity,
    title: `Produccion requerida: ${result.subgroup}`,
    message: result.reason,
    relatedEntity: { type: "subgroup", id: result.subgroup, name: `${result.subgroup} (${result.brand})` },
    recommendedAction: `Sugerir produccion de ${result.subgroup}: deficit ${result.deficit} und`,
    evidence: result.evidence,
    createdAt: new Date().toISOString(),
    deduplicationKey: deduplicationKey("PRODUCTION_REQUIRED", result.subgroup, ctx.tenantId),
  };
}

// ── Wait existing OP alert ──────────────────────────────────────────────────

export function buildWaitOPAlert(
  ctx: ProductionPlanningContext,
  result: ProductionNeedResult,
  config: ProductionPlanningConfig,
): ProductionAlert | null {
  if (result.decision !== "WAIT_EXISTING_OP") return null;

  return {
    alertId: nextAlertId("WAIT_EXISTING_OP"),
    tenantId: ctx.tenantId,
    type: "WAIT_EXISTING_OP",
    severity: config.alerts.waitOPSeverity,
    title: `Esperando OP: ${result.subgroup}`,
    message: result.reason,
    relatedEntity: { type: "subgroup", id: result.subgroup, name: `${result.subgroup} (${result.brand})` },
    recommendedAction: `Esperar finalizacion de OP activa de ${result.subgroup} (${result.activeOPQuantity} und en proceso)`,
    evidence: result.evidence,
    createdAt: new Date().toISOString(),
    deduplicationKey: deduplicationKey("WAIT_EXISTING_OP", result.subgroup, ctx.tenantId),
  };
}

// ── Low stock alert ─────────────────────────────────────────────────────────

export function buildLowStockAlert(
  ctx: ProductionPlanningContext,
  result: ShortageResult,
  config: ProductionPlanningConfig,
): ProductionAlert | null {
  if (result.priority === "CRITICAL") return null; // handled by critical shortage

  return {
    alertId: nextAlertId("LOW_STOCK"),
    tenantId: ctx.tenantId,
    type: "LOW_STOCK",
    severity: config.alerts.lowStockSeverity,
    title: `Stock bajo: ${result.subgroup}`,
    message: result.reason,
    relatedEntity: { type: "subgroup", id: result.subgroup, name: `${result.subgroup} (${result.brand})` },
    recommendedAction: `Programar produccion de ${result.subgroup}: deficit ${result.deficit} und`,
    evidence: result.evidence,
    createdAt: new Date().toISOString(),
    deduplicationKey: deduplicationKey("LOW_STOCK", result.subgroup, ctx.tenantId),
  };
}

// ── Critical shortage alert ─────────────────────────────────────────────────

export function buildCriticalShortageAlert(
  ctx: ProductionPlanningContext,
  result: ShortageResult,
  config: ProductionPlanningConfig,
): ProductionAlert | null {
  if (result.priority !== "CRITICAL") return null;

  return {
    alertId: nextAlertId("CRITICAL_SHORTAGE"),
    tenantId: ctx.tenantId,
    type: "CRITICAL_SHORTAGE",
    severity: config.alerts.criticalShortageSeverity,
    title: `Desabastecimiento critico: ${result.subgroup}`,
    message: result.reason,
    relatedEntity: { type: "subgroup", id: result.subgroup, name: `${result.subgroup} (${result.brand})` },
    recommendedAction: `Produccion urgente de ${result.subgroup}: deficit critico de ${result.deficit} und`,
    evidence: result.evidence,
    createdAt: new Date().toISOString(),
    deduplicationKey: deduplicationKey("CRITICAL_SHORTAGE", result.subgroup, ctx.tenantId),
  };
}

// ── Data quality alert ──────────────────────────────────────────────────────

export function buildProductionDataQualityAlert(
  ctx: ProductionPlanningContext,
  subgroup: string,
  brand: string,
  missingFields: string[],
  evidence: ProductionEvidenceItem,
  config: ProductionPlanningConfig,
): ProductionAlert | null {
  if (missingFields.length === 0) return null;

  return {
    alertId: nextAlertId("DATA_QUALITY"),
    tenantId: ctx.tenantId,
    type: "DATA_QUALITY",
    severity: config.alerts.dataQualitySeverity,
    title: `Datos incompletos: ${subgroup}`,
    message: `Faltan ${missingFields.length} campo(s): ${missingFields.join(", ")}.`,
    relatedEntity: { type: "subgroup", id: subgroup, name: `${subgroup} (${brand})` },
    recommendedAction: `Completar informacion de ${subgroup}: ${missingFields.join(", ")}`,
    evidence,
    createdAt: new Date().toISOString(),
    deduplicationKey: deduplicationKey("DATA_QUALITY", subgroup, ctx.tenantId),
  };
}

// ── Batch alert builder ─────────────────────────────────────────────────────

export interface ProductionAlertBatchInput {
  ctx: ProductionPlanningContext;
  needResults: ProductionNeedResult[];
  shortageResults: ShortageResult[];
  config: ProductionPlanningConfig;
}

export function buildAllProductionAlerts(input: ProductionAlertBatchInput): ProductionAlert[] {
  const { ctx, needResults, shortageResults, config } = input;
  const alerts: ProductionAlert[] = [];

  for (const r of needResults) {
    const prodAlert = buildProductionRequiredAlert(ctx, r, config);
    if (prodAlert) alerts.push(prodAlert);
    const waitAlert = buildWaitOPAlert(ctx, r, config);
    if (waitAlert) alerts.push(waitAlert);
  }

  for (const r of shortageResults) {
    const critical = buildCriticalShortageAlert(ctx, r, config);
    if (critical) alerts.push(critical);
    const low = buildLowStockAlert(ctx, r, config);
    if (low) alerts.push(low);
  }

  return alerts;
}
