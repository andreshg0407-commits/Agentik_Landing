/**
 * lib/comercial/importaciones/import-alerts.ts
 *
 * FASE 7 — Alert builder functions for Import Policy Pack.
 * Pure functions — no DB, no Prisma, no side effects.
 *
 * Sprint: IMPORT-POLICY-PACK-01
 */

import type {
  ImportAlert,
  ImportAlertType,
  ImportAlertSeverity,
  ImportPolicyContext,
  LowRotationResult,
  RepurchaseResult,
  InventoryAgingResult,
  ImportEvidenceItem,
} from "./import-policy-types";

import type { ImportPolicyPackConfig } from "./import-policy-pack-config";

// ── Alert ID generator ─────────────────────────────────────────────────────

let alertCounter = 0;

function nextAlertId(type: ImportAlertType): string {
  return `imp-alert-${type.toLowerCase()}-${++alertCounter}`;
}

function deduplicationKey(type: ImportAlertType, entityId: string, tenantId: string): string {
  return `${type}::${tenantId}::${entityId}`;
}

// ── Low rotation alert ─────────────────────────────────────────────────────

export function buildLowRotationAlert(
  ctx: ImportPolicyContext,
  result: LowRotationResult,
  config: ImportPolicyPackConfig,
): ImportAlert | null {
  if (!result.isLowRotation) return null;

  return {
    alertId: nextAlertId("LOW_ROTATION"),
    tenantId: ctx.tenantId,
    type: "LOW_ROTATION",
    severity: config.alerts.lowRotationSeverity,
    title: `Baja rotacion: ${result.reference}`,
    message: result.reason,
    relatedEntity: { type: "reference", id: result.reference, name: result.description },
    recommendedAction: result.evidence.recommendedAction,
    evidence: result.evidence,
    createdAt: new Date().toISOString(),
    deduplicationKey: deduplicationKey("LOW_ROTATION", result.reference, ctx.tenantId),
  };
}

// ── Rebuy candidate alert ──────────────────────────────────────────────────

export function buildRebuyCandidateAlert(
  ctx: ImportPolicyContext,
  result: RepurchaseResult,
  config: ImportPolicyPackConfig,
): ImportAlert | null {
  if (result.decision !== "REBUY") return null;

  return {
    alertId: nextAlertId("REBUY_CANDIDATE"),
    tenantId: ctx.tenantId,
    type: "REBUY_CANDIDATE",
    severity: config.alerts.rebuySeverity,
    title: `Candidato recompra: ${result.reference}`,
    message: `${result.reference} recomendado para recompra. Score: ${result.totalScore}. ${result.suggestedQty !== null ? `Cantidad sugerida: ${result.suggestedQty} und.` : ""}`,
    relatedEntity: { type: "reference", id: result.reference, name: result.description },
    recommendedAction: result.recommendedAction,
    evidence: result.evidence,
    createdAt: new Date().toISOString(),
    deduplicationKey: deduplicationKey("REBUY_CANDIDATE", result.reference, ctx.tenantId),
  };
}

// ── No repurchase alert ────────────────────────────────────────────────────

export function buildNoRepurchaseAlert(
  ctx: ImportPolicyContext,
  result: RepurchaseResult,
  config: ImportPolicyPackConfig,
): ImportAlert | null {
  if (result.decision !== "DO_NOT_REBUY") return null;

  return {
    alertId: nextAlertId("NO_REPURCHASE"),
    tenantId: ctx.tenantId,
    type: "NO_REPURCHASE",
    severity: "info",
    title: `No recomprar: ${result.reference}`,
    message: `${result.reference} no recomendado para recompra. Score: ${result.totalScore}.`,
    relatedEntity: { type: "reference", id: result.reference, name: result.description },
    recommendedAction: result.recommendedAction,
    evidence: result.evidence,
    createdAt: new Date().toISOString(),
    deduplicationKey: deduplicationKey("NO_REPURCHASE", result.reference, ctx.tenantId),
  };
}

// ── Aging inventory alert ──────────────────────────────────────────────────

export function buildAgingAlert(
  ctx: ImportPolicyContext,
  result: InventoryAgingResult,
  config: ImportPolicyPackConfig,
): ImportAlert | null {
  // Only alert for AGING, LOW_ROTATION, OBSOLETE_CANDIDATE
  if (result.agingStatus === "NEW" || result.agingStatus === "NORMAL") return null;

  const severity: ImportAlertSeverity = result.agingStatus === "OBSOLETE_CANDIDATE" ? "critical"
    : result.agingStatus === "LOW_ROTATION" ? config.alerts.agingSeverity
    : "info";

  return {
    alertId: nextAlertId("AGING_INVENTORY"),
    tenantId: ctx.tenantId,
    type: "AGING_INVENTORY",
    severity,
    title: `Inventario ${result.agingStatus.toLowerCase().replace("_", " ")}: ${result.reference}`,
    message: result.reason,
    relatedEntity: { type: "reference", id: result.reference, name: result.description },
    recommendedAction: result.evidence.recommendedAction,
    evidence: result.evidence,
    createdAt: new Date().toISOString(),
    deduplicationKey: deduplicationKey("AGING_INVENTORY", result.reference, ctx.tenantId),
  };
}

// ── Data quality alert ─────────────────────────────────────────────────────

export function buildImportDataQualityAlert(
  ctx: ImportPolicyContext,
  reference: string,
  description: string,
  missingFields: string[],
  evidence: ImportEvidenceItem,
  config: ImportPolicyPackConfig,
): ImportAlert | null {
  if (missingFields.length === 0) return null;

  return {
    alertId: nextAlertId("DATA_QUALITY"),
    tenantId: ctx.tenantId,
    type: "DATA_QUALITY",
    severity: config.alerts.dataQualitySeverity,
    title: `Datos incompletos: ${reference}`,
    message: `Faltan ${missingFields.length} campo(s): ${missingFields.join(", ")}.`,
    relatedEntity: { type: "reference", id: reference, name: description },
    recommendedAction: `Completar informacion de ${reference}: ${missingFields.join(", ")}`,
    evidence,
    createdAt: new Date().toISOString(),
    deduplicationKey: deduplicationKey("DATA_QUALITY", reference, ctx.tenantId),
  };
}

// ── Batch alert builder ────────────────────────────────────────────────────

export interface ImportAlertBatchInput {
  ctx: ImportPolicyContext;
  lowRotationResults: LowRotationResult[];
  repurchaseResults: RepurchaseResult[];
  agingResults: InventoryAgingResult[];
  config: ImportPolicyPackConfig;
}

export function buildAllImportAlerts(input: ImportAlertBatchInput): ImportAlert[] {
  const { ctx, lowRotationResults, repurchaseResults, agingResults, config } = input;
  const alerts: ImportAlert[] = [];

  for (const r of lowRotationResults) {
    const alert = buildLowRotationAlert(ctx, r, config);
    if (alert) alerts.push(alert);
  }

  for (const r of repurchaseResults) {
    const rebuy = buildRebuyCandidateAlert(ctx, r, config);
    if (rebuy) alerts.push(rebuy);
    const noRebuy = buildNoRepurchaseAlert(ctx, r, config);
    if (noRebuy) alerts.push(noRebuy);
  }

  for (const r of agingResults) {
    const alert = buildAgingAlert(ctx, r, config);
    if (alert) alerts.push(alert);
  }

  return alerts;
}
