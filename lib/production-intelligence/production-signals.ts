/**
 * production-signals.ts
 *
 * CASTILLITOS-EXECUTIVE-REPORTS-01
 * Signal generators for Production In Progress Intelligence.
 *
 * Signal types generated:
 *   PRODUCTION_IN_PROGRESS  — reference actively in production
 *   PRODUCTION_DELAY_RISK   — production exceeds expected duration
 *
 * Consumable by: Executive Dashboard, David, Decision Engine, Action Engine.
 *
 * No Prisma. No React. No server-only. Pure domain logic.
 */

import type { BusinessSignal } from "@/lib/business-signals";
import { buildSignal } from "@/lib/business-signals/signal-builder";
import type { ProductionInProgressReport } from "./production-types";

/** Days threshold for delay risk signal. */
const DELAY_RISK_DAYS = 45;
/** Days threshold for critical delay. */
const CRITICAL_DELAY_DAYS = 90;

/** Generate signals from the production report. */
export function buildProductionSignals(opts: {
  organizationId: string;
  report: ProductionInProgressReport;
}): BusinessSignal[] {
  const { organizationId, report } = opts;
  const signals: BusinessSignal[] = [];

  for (const row of report.rows) {
    // PRODUCTION_IN_PROGRESS — all active production
    if (row.status === "en_proceso") {
      signals.push(buildSignal({
        organizationId,
        entityId: row.reference,
        entityType: "product_reference",
        category: "production",
        type: "state_change",
        title: `PRODUCTION_IN_PROGRESS: ${row.reference}`,
        description: `Referencia ${row.reference} (${row.description}) en produccion. ` +
          `Etapa: ${row.etapaActual.stageLabel}. ` +
          `${row.diasEnProduccion} dia(s) en proceso. ` +
          `OP: ${row.opNumero}. SubLinea: ${row.subLinea}.`,
        severity: "info",
        priority: "normal",
        source: "sag",
        confidence: row.etapaActual.confidence.score,
        metadata: {
          signalKind: "PRODUCTION_IN_PROGRESS",
          reference: row.reference,
          subLinea: row.subLinea,
          subGrupo: row.subGrupo,
          stageId: row.etapaActual.stageId,
          stageLabel: row.etapaActual.stageLabel,
          diasEnProduccion: row.diasEnProduccion,
          cantidadEnProceso: row.cantidadEnProceso,
          opNumero: row.opNumero,
          fechaActivacionOP: row.fechaActivacionOP,
        },
      }));
    }

    // PRODUCTION_DELAY_RISK — production taking too long
    if (row.status === "en_proceso" && row.diasEnProduccion >= DELAY_RISK_DAYS) {
      const isCritical = row.diasEnProduccion >= CRITICAL_DELAY_DAYS;

      signals.push(buildSignal({
        organizationId,
        entityId: row.reference,
        entityType: "product_reference",
        category: "production",
        type: "deadline_exceeded",
        title: `PRODUCTION_DELAY_RISK: ${row.reference}`,
        description: `Referencia ${row.reference} lleva ${row.diasEnProduccion} dia(s) en produccion` +
          (isCritical ? " — CRITICO." : ".") +
          ` Etapa actual: ${row.etapaActual.stageLabel}. ` +
          `OP: ${row.opNumero}. SubLinea: ${row.subLinea}.`,
        severity: isCritical ? "critical" : "high",
        priority: isCritical ? "highest" : "high",
        source: "sag",
        confidence: row.etapaActual.confidence.score,
        metadata: {
          signalKind: "PRODUCTION_DELAY_RISK",
          reference: row.reference,
          subLinea: row.subLinea,
          subGrupo: row.subGrupo,
          diasEnProduccion: row.diasEnProduccion,
          delayThresholdDays: DELAY_RISK_DAYS,
          criticalThresholdDays: CRITICAL_DELAY_DAYS,
          stageId: row.etapaActual.stageId,
          opNumero: row.opNumero,
        },
      }));
    }

    // PRODUCTION_DELAY_RISK — stalled production
    if (row.status === "detenido") {
      signals.push(buildSignal({
        organizationId,
        entityId: row.reference,
        entityType: "product_reference",
        category: "production",
        type: "deadline_exceeded",
        title: `PRODUCTION_DELAY_RISK: ${row.reference} (detenido)`,
        description: `Produccion detenida para ${row.reference} (${row.description}). ` +
          `Sin movimientos recientes. ${row.diasEnProduccion} dia(s) desde activacion OP. ` +
          `SubLinea: ${row.subLinea}.`,
        severity: "high",
        priority: "high",
        source: "sag",
        confidence: 60,
        metadata: {
          signalKind: "PRODUCTION_DELAY_RISK",
          reference: row.reference,
          subLinea: row.subLinea,
          subGrupo: row.subGrupo,
          diasEnProduccion: row.diasEnProduccion,
          status: "detenido",
          opNumero: row.opNumero,
        },
      }));
    }
  }

  return signals;
}
