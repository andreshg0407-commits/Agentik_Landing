/**
 * lib/reconciliation/readiness/detected-limitations.ts
 *
 * AGENTIK-RECON-DETECTED-LIMITATIONS-01 — Phase 1
 * Detected Operational Limitations Deriver
 *
 * Derives real limitations from a SourceReadinessReport.
 * Pure function — no I/O, no DB, no async.
 * Every limitation comes directly from the source contract and loader data.
 *
 * No mocks. No invented problems. No hidden limitations.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import type { SourceReadinessReport, SourceReadinessEntry } from "./source-readiness";

// ── Types ─────────────────────────────────────────────────────────────────────

export type LimitationSeverity = "critical" | "warning" | "info";

export interface DetectedLimitation {
  sourceId:        string;
  sourceLabel:     string;
  shortLabel:      string;
  provider:        string;
  severity:        LimitationSeverity;
  /** Verbatim raw readiness from the source contract */
  status:          string;
  /** Operational impact — what reconciliation cannot do because of this */
  impact:          string;
  /** Concrete next step to unblock this source */
  requiredAction:  string;
  /** Question to raise in the SAG meeting */
  meetingQuestion: string;
  /** True when this limitation directly affects SAG historical data */
  isHistoricalBlocker: boolean;
  /** True when this is the primary priority for the meeting */
  isPriority:      boolean;
}

export interface DetectedLimitationsReport {
  limitations:    DetectedLimitation[];
  critical:       DetectedLimitation[];
  warnings:       DetectedLimitation[];
  info:           DetectedLimitation[];
  hasCritical:    boolean;
  hasLimitations: boolean;
  /** Highest-priority limitation to surface first */
  topLimitation:  DetectedLimitation | null;
}

// ── SAG payment-related source keywords (Phase 3) ────────────────────────────

const PAYMENT_SOURCE_IDS = new Set([
  "sag_payments",
  "sag_receivables",
]);

// ── Per-entry derivation ───────────────────────────────────────────────────────

function deriveFromEntry(entry: SourceReadinessEntry): DetectedLimitation | null {
  const isPaymentSource = PAYMENT_SOURCE_IDS.has(entry.sourceType);

  switch (entry.rawReadiness) {

    case "pending_sag_validation": {
      const severity: LimitationSeverity = isPaymentSource ? "critical" : "warning";

      if (isPaymentSource) {
        return {
          sourceId:        entry.sourceType,
          sourceLabel:     entry.label,
          shortLabel:      entry.shortLabel,
          provider:        entry.provider,
          severity,
          status:          entry.rawReadiness,
          impact:          "No permite conciliación histórica completa ventas ↔ recaudos. Las diferencias entre pedidos y cobros no pueden validarse hasta que esta fuente esté confirmada.",
          requiredAction:  "Definir método oficial de extracción histórica de pagos/recaudos. Confirmar tabla, vista o API de SAG.",
          meetingQuestion: `¿Cuál es la fuente oficial de histórico de ${entry.shortLabel} en SAG? ¿Tabla directa, vista consolidada o exportación periódica?`,
          isHistoricalBlocker: true,
          isPriority:      true,
        };
      }

      return {
        sourceId:        entry.sourceType,
        sourceLabel:     entry.label,
        shortLabel:      entry.shortLabel,
        provider:        entry.provider,
        severity,
        status:          entry.rawReadiness,
        impact:          "Puede limitar conciliación histórica o validación completa. Los registros existen pero requieren confirmación de PUC o esquema SAG.",
        requiredAction:  "Confirmar fuente histórica, tabla, vista o método de extracción con SAG.",
        meetingQuestion: `¿Están los registros de ${entry.shortLabel} disponibles para el período histórico? ¿Qué código PUC o identificador usa SAG para este flujo?`,
        isHistoricalBlocker: false,
        isPriority:      false,
      };
    }

    case "requires_integration": {
      return {
        sourceId:        entry.sourceType,
        sourceLabel:     entry.label,
        shortLabel:      entry.shortLabel,
        provider:        entry.provider,
        severity:        "warning",
        status:          entry.rawReadiness,
        impact:          `${entry.shortLabel} no puede participar en conciliación hasta conectar la fuente de datos.`,
        requiredAction:  `Definir método de integración con ${entry.provider}. Evaluar API, feed o archivo periódico.`,
        meetingQuestion: `¿Hay una API o exportación disponible en ${entry.provider} para ${entry.shortLabel}? ¿Cuál es el proceso de habilitación?`,
        isHistoricalBlocker: false,
        isPriority:      false,
      };
    }

    case "requires_upload": {
      return {
        sourceId:        entry.sourceType,
        sourceLabel:     entry.label,
        shortLabel:      entry.shortLabel,
        provider:        entry.provider,
        severity:        "info",
        status:          entry.rawReadiness,
        impact:          `${entry.shortLabel} requiere carga documental o archivo externo por período. Proceso manual hasta automatizar.`,
        requiredAction:  "Definir proceso de carga periódica o automatización de exportación del archivo.",
        meetingQuestion: `¿Quién genera el archivo de ${entry.shortLabel} cada período? ¿Es posible automatizar la exportación?`,
        isHistoricalBlocker: false,
        isPriority:      false,
      };
    }

    case "requires_credential": {
      return {
        sourceId:        entry.sourceType,
        sourceLabel:     entry.label,
        shortLabel:      entry.shortLabel,
        provider:        entry.provider,
        severity:        "warning",
        status:          entry.rawReadiness,
        impact:          `${entry.shortLabel} no puede consultarse hasta completar la autorización con ${entry.provider}.`,
        requiredAction:  `Configurar credenciales seguras para ${entry.provider}. Revisar proceso de certificación o API key.`,
        meetingQuestion: `¿Están disponibles las credenciales de acceso a ${entry.provider} para ${entry.shortLabel}?`,
        isHistoricalBlocker: false,
        isPriority:      false,
      };
    }

    // "available" and "unavailable" — no limitation to surface
    default:
      return null;
  }
}

// ── Main deriver ──────────────────────────────────────────────────────────────

/**
 * Derive all operational limitations from a SourceReadinessReport.
 *
 * Called server-side alongside buildSourceReadinessReport().
 * Pure function — no I/O.
 *
 * Ordering: critical → warning → info.
 * Within each severity: historical blockers first, then priority flag, then alpha.
 */
export function deriveDetectedLimitations(
  report: SourceReadinessReport,
): DetectedLimitationsReport {
  const raw = report.entries
    .map(deriveFromEntry)
    .filter((l): l is DetectedLimitation => l !== null);

  // Sort: critical first, then historical blockers, then priority flag
  const severityOrder: Record<LimitationSeverity, number> = { critical: 0, warning: 1, info: 2 };
  raw.sort((a, b) => {
    const s = severityOrder[a.severity] - severityOrder[b.severity];
    if (s !== 0) return s;
    if (a.isHistoricalBlocker !== b.isHistoricalBlocker) return a.isHistoricalBlocker ? -1 : 1;
    if (a.isPriority !== b.isPriority) return a.isPriority ? -1 : 1;
    return a.sourceLabel.localeCompare(b.sourceLabel);
  });

  const critical = raw.filter(l => l.severity === "critical");
  const warnings = raw.filter(l => l.severity === "warning");
  const info     = raw.filter(l => l.severity === "info");

  return {
    limitations:    raw,
    critical,
    warnings,
    info,
    hasCritical:    critical.length > 0,
    hasLimitations: raw.length > 0,
    topLimitation:  raw[0] ?? null,
  };
}
