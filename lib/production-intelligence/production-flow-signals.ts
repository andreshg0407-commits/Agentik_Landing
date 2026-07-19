/**
 * production-flow-signals.ts
 *
 * PRODUCTION-FLOW-INTELLIGENCE-01 — Phase 9: Business Signals.
 *
 * Generates signals from ProductionFlowSnapshot:
 *   PRODUCTION_IN_PROGRESS
 *   PRODUCTION_DELAY_RISK
 *   PRODUCTION_RECOVERY_AVAILABLE
 *   PRODUCTION_MISSING_FOR_OUT_OF_STOCK
 *   PRODUCTION_STAGE_UNKNOWN
 *   PRODUCTION_READY_SOON
 *
 * Does NOT send alerts. Only generates signal objects.
 *
 * No React. No Prisma. No server-only. Pure domain logic.
 */

import type { BusinessSignal } from "@/lib/business-signals";
import { buildSignal } from "@/lib/business-signals/signal-builder";
import type { ProductionFlowSnapshot, ProductionReferenceFlow } from "./production-flow-types";

/** Generate all production flow signals from a snapshot. */
export function buildProductionFlowSignals(opts: {
  organizationId: string;
  snapshot: ProductionFlowSnapshot;
}): BusinessSignal[] {
  const { organizationId, snapshot } = opts;
  const signals: BusinessSignal[] = [];

  for (const flow of snapshot.referenceFlows) {
    // PRODUCTION_IN_PROGRESS — active production
    if (flow.stageState.productionStatus === "active" && flow.stageState.hasActiveOP) {
      signals.push(buildSignal({
        organizationId,
        entityId: flow.referenceCode,
        entityType: "product_reference",
        category: "production",
        type: "state_change",
        title: `PRODUCTION_IN_PROGRESS: ${flow.referenceCode}`,
        description: `${flow.referenceCode} (${flow.description}) en produccion. ` +
          `Etapa: ${flow.stageState.currentStage.stageLabel}. ` +
          `${flow.activeOrders.length} OP(s) activa(s). SubLinea: ${flow.subLinea}.`,
        severity: "info",
        priority: "normal",
        source: "sag",
        confidence: flow.stageState.currentStage.confidence.score,
        metadata: {
          signalKind: "PRODUCTION_IN_PROGRESS",
          referenceCode: flow.referenceCode,
          subLinea: flow.subLinea,
          subGrupo: flow.subGrupo,
          stageId: flow.stageState.currentStage.stageId,
          quantityInProduction: flow.quantityInProduction,
          activeOrderCount: flow.activeOrders.length,
        },
      }));
    }

    // PRODUCTION_DELAY_RISK — delayed or stalled
    if (flow.delayRisk.level === "high" || flow.delayRisk.level === "critical") {
      signals.push(buildSignal({
        organizationId,
        entityId: flow.referenceCode,
        entityType: "product_reference",
        category: "production",
        type: "deadline_exceeded",
        title: `PRODUCTION_DELAY_RISK: ${flow.referenceCode}`,
        description: `${flow.referenceCode} — ${flow.delayRisk.daysInProduction} dias en produccion. ` +
          `Riesgo: ${flow.delayRisk.level}. ${flow.delayRisk.evidence.join(" ")}`,
        severity: flow.delayRisk.level === "critical" ? "critical" : "high",
        priority: flow.delayRisk.level === "critical" ? "highest" : "high",
        source: "sag",
        confidence: flow.delayRisk.confidence,
        metadata: {
          signalKind: "PRODUCTION_DELAY_RISK",
          referenceCode: flow.referenceCode,
          subLinea: flow.subLinea,
          daysInProduction: flow.delayRisk.daysInProduction,
          riskLevel: flow.delayRisk.level,
          isStalled: flow.delayRisk.isStalled,
        },
      }));
    }

    // PRODUCTION_RECOVERY_AVAILABLE — production that can resolve an agotado
    if (flow.recoverySignal && flow.availabilityImpact.isOutOfStock) {
      signals.push(buildSignal({
        organizationId,
        entityId: flow.referenceCode,
        entityType: "product_reference",
        category: "production",
        type: "state_change",
        title: `PRODUCTION_RECOVERY_AVAILABLE: ${flow.referenceCode}`,
        description: `${flow.referenceCode} agotado con produccion ${flow.recoverySignal.recoveryType}. ` +
          `Readiness: ${flow.recoverySignal.estimatedReadiness}. ` +
          `${flow.recoverySignal.evidence.join(" ")}`,
        severity: flow.recoverySignal.estimatedReadiness === "ready_soon" ? "info" : "medium",
        priority: "normal",
        source: "sag",
        confidence: flow.recoverySignal.confidence,
        metadata: {
          signalKind: "PRODUCTION_RECOVERY_AVAILABLE",
          referenceCode: flow.referenceCode,
          recoveryType: flow.recoverySignal.recoveryType,
          estimatedReadiness: flow.recoverySignal.estimatedReadiness,
          expectedQuantity: flow.recoverySignal.expectedQuantity,
        },
      }));
    }

    // PRODUCTION_MISSING_FOR_OUT_OF_STOCK — agotado without production
    if (flow.availabilityImpact.isOutOfStock && flow.stageState.productionStatus === "no_production") {
      signals.push(buildSignal({
        organizationId,
        entityId: flow.referenceCode,
        entityType: "product_reference",
        category: "production",
        type: "absence_detected",
        title: `PRODUCTION_MISSING_FOR_OUT_OF_STOCK: ${flow.referenceCode}`,
        description: `${flow.referenceCode} (${flow.description}) agotado sin produccion activa. ` +
          `SubLinea: ${flow.subLinea}. SubGrupo: ${flow.subGrupo}. ` +
          `Recomendacion: ${flow.recommendation.description}`,
        severity: "high",
        priority: "high",
        source: "sag",
        confidence: flow.confidence.score,
        metadata: {
          signalKind: "PRODUCTION_MISSING_FOR_OUT_OF_STOCK",
          referenceCode: flow.referenceCode,
          subLinea: flow.subLinea,
          subGrupo: flow.subGrupo,
          existenciaBodega01: flow.availabilityImpact.existenciaBodega01,
          replacementCount: flow.recommendation.replacementCandidates.length,
          affectedVendors: flow.availabilityImpact.affectedVendorIds,
        },
      }));
    }

    // PRODUCTION_STAGE_UNKNOWN — stage could not be determined
    if (flow.stageState.productionStatus === "indeterminate") {
      signals.push(buildSignal({
        organizationId,
        entityId: flow.referenceCode,
        entityType: "product_reference",
        category: "production",
        type: "anomaly_detected",
        title: `PRODUCTION_STAGE_UNKNOWN: ${flow.referenceCode}`,
        description: `Etapa de produccion no determinada para ${flow.referenceCode}. ` +
          `Evidencia insuficiente. Revisar documentos SAG.`,
        severity: "medium",
        priority: "normal",
        source: "sag",
        confidence: flow.stageState.currentStage.confidence.score,
        metadata: {
          signalKind: "PRODUCTION_STAGE_UNKNOWN",
          referenceCode: flow.referenceCode,
          subLinea: flow.subLinea,
          documentCount: flow.documentEvidence.length,
        },
      }));
    }

    // PRODUCTION_READY_SOON — production nearing completion for a critical reference
    if (
      flow.recoverySignal?.estimatedReadiness === "ready_soon" &&
      (flow.availabilityImpact.isOutOfStock || flow.availabilityImpact.isCritical)
    ) {
      signals.push(buildSignal({
        organizationId,
        entityId: flow.referenceCode,
        entityType: "product_reference",
        category: "production",
        type: "state_change",
        title: `PRODUCTION_READY_SOON: ${flow.referenceCode}`,
        description: `Produccion de ${flow.referenceCode} proxima a completar. ` +
          `${flow.recoverySignal.expectedQuantity} unidades esperadas. ` +
          `Referencia actualmente ${flow.availabilityImpact.isOutOfStock ? "agotada" : "critica"}.`,
        severity: "info",
        priority: "high",
        source: "sag",
        confidence: flow.recoverySignal.confidence,
        metadata: {
          signalKind: "PRODUCTION_READY_SOON",
          referenceCode: flow.referenceCode,
          subLinea: flow.subLinea,
          expectedQuantity: flow.recoverySignal.expectedQuantity,
          isOutOfStock: flow.availabilityImpact.isOutOfStock,
        },
      }));
    }
  }

  return signals;
}
