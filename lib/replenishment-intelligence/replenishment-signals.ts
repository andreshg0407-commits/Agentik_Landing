/**
 * replenishment-signals.ts
 *
 * REPLENISHMENT-INTELLIGENCE-01 — Phase 9: Business Signals.
 *
 * Generates signals from ReplenishmentSnapshot:
 *   REPLENISHMENT_REQUIRED
 *   PORTFOLIO_REPLACEMENT_REQUIRED
 *   STORE_REPLENISHMENT_REQUIRED
 *   WAIT_FOR_PRODUCTION
 *   PRODUCTION_REQUIRED
 *   TRANSFER_RECOMMENDED
 *   ALTERNATIVE_REFERENCE_AVAILABLE
 *
 * Does NOT send alerts. Only generates signal objects.
 *
 * No React. No Prisma. No server-only. Pure domain logic.
 */

import type { BusinessSignal } from "@/lib/business-signals";
import { buildSignal } from "@/lib/business-signals/signal-builder";
import type { ReplenishmentSnapshot, ReplenishmentRecommendation } from "./replenishment-types";

/** Generate all replenishment signals from a snapshot. */
export function buildReplenishmentSignals(opts: {
  organizationId: string;
  snapshot: ReplenishmentSnapshot;
}): BusinessSignal[] {
  const { organizationId, snapshot } = opts;
  const signals: BusinessSignal[] = [];

  for (const rec of snapshot.recommendations) {
    const severity = urgencyToSeverity(rec.urgency);

    switch (rec.action) {
      case "replenish_from_warehouse":
        signals.push(buildSignal({
          organizationId,
          entityId: rec.referenceCode,
          entityType: "product_reference",
          category: "inventory",
          type: "threshold_breach",
          title: `REPLENISHMENT_REQUIRED: ${rec.referenceCode}`,
          description: `${rec.referenceCode} (${rec.description}) requiere reposicion en ${rec.target.locationName}. ${rec.reason.description}`,
          severity,
          priority: rec.urgency === "critical" ? "highest" : rec.urgency === "high" ? "high" : "normal",
          source: "sag",
          confidence: rec.confidence.score,
          metadata: buildSignalMeta("REPLENISHMENT_REQUIRED", rec),
        }));
        break;

      case "replace_reference":
        signals.push(buildSignal({
          organizationId,
          entityId: rec.referenceCode,
          entityType: "product_reference",
          category: "inventory",
          type: "threshold_breach",
          title: `PORTFOLIO_REPLACEMENT_REQUIRED: ${rec.referenceCode}`,
          description: `${rec.referenceCode} requiere reemplazo en ${rec.target.locationName}. ${rec.replacementCandidates.length} alternativa(s) del mismo SubGrupo.`,
          severity,
          priority: rec.urgency === "critical" ? "highest" : "high",
          source: "sag",
          confidence: rec.confidence.score,
          metadata: buildSignalMeta("PORTFOLIO_REPLACEMENT_REQUIRED", rec),
        }));

        if (rec.replacementCandidates.length > 0) {
          signals.push(buildSignal({
            organizationId,
            entityId: rec.referenceCode,
            entityType: "product_reference",
            category: "inventory",
            type: "state_change",
            title: `ALTERNATIVE_REFERENCE_AVAILABLE: ${rec.referenceCode}`,
            description: `${rec.replacementCandidates.length} alternativa(s) disponible(s) para ${rec.referenceCode}: ${rec.replacementCandidates.slice(0, 3).map((c) => c.referenceCode).join(", ")}.`,
            severity: "info",
            priority: "normal",
            source: "sag",
            confidence: rec.confidence.score,
            metadata: {
              signalKind: "ALTERNATIVE_REFERENCE_AVAILABLE",
              referenceCode: rec.referenceCode,
              alternatives: rec.replacementCandidates.map((c) => c.referenceCode),
              subGrupo: rec.subGrupo,
            },
          }));
        }
        break;

      case "wait_for_production":
        signals.push(buildSignal({
          organizationId,
          entityId: rec.referenceCode,
          entityType: "product_reference",
          category: "production",
          type: "state_change",
          title: `WAIT_FOR_PRODUCTION: ${rec.referenceCode}`,
          description: `${rec.referenceCode} — esperar produccion activa. ${rec.productionContext?.stageLabel ?? ""}. ${rec.reason.description}`,
          severity: "info",
          priority: "normal",
          source: "sag",
          confidence: rec.confidence.score,
          metadata: buildSignalMeta("WAIT_FOR_PRODUCTION", rec),
        }));
        break;

      case "suggest_production":
        signals.push(buildSignal({
          organizationId,
          entityId: rec.referenceCode,
          entityType: "product_reference",
          category: "production",
          type: "absence_detected",
          title: `PRODUCTION_REQUIRED: ${rec.referenceCode}`,
          description: `${rec.referenceCode} (${rec.description}) — sin produccion activa. ${rec.reason.description}`,
          severity,
          priority: rec.urgency === "critical" ? "highest" : "high",
          source: "sag",
          confidence: rec.confidence.score,
          metadata: buildSignalMeta("PRODUCTION_REQUIRED", rec),
        }));
        break;

      case "transfer_between_locations":
        signals.push(buildSignal({
          organizationId,
          entityId: rec.referenceCode,
          entityType: "product_reference",
          category: "inventory",
          type: "state_change",
          title: `TRANSFER_RECOMMENDED: ${rec.referenceCode}`,
          description: `Transferencia recomendada para ${rec.referenceCode}: ${rec.source.locationName ?? "origen"} → ${rec.target.locationName}.`,
          severity: "medium",
          priority: "normal",
          source: "sag",
          confidence: rec.confidence.score,
          metadata: buildSignalMeta("TRANSFER_RECOMMENDED", rec),
        }));
        break;

      case "review_production":
        signals.push(buildSignal({
          organizationId,
          entityId: rec.referenceCode,
          entityType: "product_reference",
          category: "production",
          type: "deadline_exceeded",
          title: `REPLENISHMENT_REQUIRED: ${rec.referenceCode} (produccion retrasada)`,
          description: `${rec.referenceCode} — produccion retrasada. ${rec.reason.description}`,
          severity: "high",
          priority: "high",
          source: "sag",
          confidence: rec.confidence.score,
          metadata: buildSignalMeta("REPLENISHMENT_REQUIRED", rec),
        }));
        break;
    }
  }

  return signals;
}

function urgencyToSeverity(urgency: string): "critical" | "high" | "medium" | "low" | "info" {
  switch (urgency) {
    case "critical": return "critical";
    case "high": return "high";
    case "medium": return "medium";
    case "low": return "low";
    default: return "info";
  }
}

function buildSignalMeta(signalKind: string, rec: ReplenishmentRecommendation): Record<string, unknown> {
  return {
    signalKind,
    referenceCode: rec.referenceCode,
    subLinea: rec.subLinea,
    subGrupo: rec.subGrupo,
    targetType: rec.target.targetType,
    targetLocation: rec.target.locationCode,
    action: rec.action,
    urgency: rec.urgency,
    vendorId: rec.target.entityId,
    hasProduction: rec.productionContext?.hasActiveProduction ?? false,
    replacementCount: rec.replacementCandidates.length,
  };
}
