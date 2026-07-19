/**
 * lib/marketing-studio/orchestration/orchestration-actions.ts
 *
 * MS-12 — Commerce Orchestration Layer: Action Generator
 *
 * Derives recommended actions from current orchestration state.
 * Pure computation — no Prisma, no fetch.
 */

import type { ProductConsoleItem } from "../products/product-display";
import type { OrgCommerceSyncSummary } from "../commerce/sync-monitor";
import type {
  OrchestrationJob,
  OrchestrationRecommendedAction,
  DestinationHealth,
} from "./orchestration-types";
import {
  ORCHESTRATION_JOB_STATUS,
  DESTINATION_HEALTH_LEVEL,
} from "./orchestration-types";

// ── Action builder ─────────────────────────────────────────────────────────────

export function buildOrchestrationActions(
  products:     ProductConsoleItem[],
  jobs:         OrchestrationJob[],
  destinations: DestinationHealth[],
  syncSummary:  OrgCommerceSyncSummary | null,
): OrchestrationRecommendedAction[] {
  const actions: OrchestrationRecommendedAction[] = [];

  // ── 1. Shopify: products deleted externally ──────────────────────────────
  if (syncSummary && syncSummary.missingExternal > 0) {
    actions.push({
      key:           "republish_missing_external",
      label:         `Re-publicar ${syncSummary.missingExternal} producto(s) eliminados`,
      detail:        "Productos que estaban en Shopify fueron eliminados. Hay que re-publicar para restablecer presencia en tienda.",
      urgency:       "critical",
      affectedCount: syncSummary.missingExternal,
      actionType:    "publish",
      targetChannel: "shopify",
    });
  }

  // ── 2. Shopify: drift detected ───────────────────────────────────────────
  if (syncSummary && (syncSummary.driftDetected > 0 || syncSummary.agentikNewer > 0)) {
    const count = syncSummary.driftDetected + syncSummary.agentikNewer;
    actions.push({
      key:           "sync_drift_products",
      label:         `Sincronizar ${count} producto(s) con drift`,
      detail:        "Hay diferencias entre el catálogo de Agentik y lo publicado en Shopify. Ejecutar sync check para alinear.",
      urgency:       "high",
      affectedCount: count,
      actionType:    "sync",
      targetChannel: "shopify",
    });
  }

  // ── 3. Products with high readiness not published ────────────────────────
  const highReadinessUnpublished = products.filter(
    p => p.readinessScore >= 80 &&
      p.publicationSummary.every(s => s.publicationStatus === "unpublished"),
  );
  if (highReadinessUnpublished.length > 0) {
    actions.push({
      key:             "publish_high_readiness",
      label:           `Publicar ${highReadinessUnpublished.length} producto(s) con readiness alto`,
      detail:          `${highReadinessUnpublished.length} producto(s) tienen un score ≥ 80 y ningún canal activo. Activación inmediata posible.`,
      urgency:         "high",
      affectedCount:   highReadinessUnpublished.length,
      actionType:      "publish",
      targetProductIds: highReadinessUnpublished.map(p => p.productId),
    });
  }

  // ── 4. Failed jobs needing retry ─────────────────────────────────────────
  const criticalFailed = jobs.filter(
    j => j.status === ORCHESTRATION_JOB_STATUS.FAILED && j.retryCount >= 2,
  );
  if (criticalFailed.length > 0) {
    actions.push({
      key:           "retry_critical_failed",
      label:         `Revisar ${criticalFailed.length} job(s) con reintentos agotados`,
      detail:        "Estos jobs han fallado 3 o más veces y requieren intervención manual.",
      urgency:       "critical",
      affectedCount: criticalFailed.length,
      actionType:    "retry",
    });
  }

  // ── 5. Blocked destinations ──────────────────────────────────────────────
  const blockedDests = destinations.filter(d => d.healthLevel === DESTINATION_HEALTH_LEVEL.BLOCKED);
  for (const dest of blockedDests) {
    actions.push({
      key:           `unblock_destination_${dest.channel}`,
      label:         `Desbloquear destino: ${dest.label}`,
      detail:        dest.errorSummary ?? `${dest.label} está bloqueado y no puede recibir actualizaciones.`,
      urgency:       "critical",
      affectedCount: dest.failedJobs,
      actionType:    "review",
      targetChannel: dest.channel,
    });
  }

  // ── 6. Products without variants ─────────────────────────────────────────
  const noVariants = products.filter(p => p.variantCount === 0 && p.status === "approved");
  if (noVariants.length > 0) {
    actions.push({
      key:             "generate_missing_variants",
      label:           `Generar variantes para ${noVariants.length} producto(s)`,
      detail:          "Productos aprobados sin variantes. Las plataformas de distribución requieren al menos una variante.",
      urgency:         "medium",
      affectedCount:   noVariants.length,
      actionType:      "rebuild",
      targetProductIds: noVariants.map(p => p.productId),
    });
  }

  // ── 7. Catalog needs rebuild ─────────────────────────────────────────────
  const updatedRecently = products.filter(p => {
    const updated = new Date(p.updatedAt);
    return Date.now() - updated.getTime() < 2 * 60 * 60 * 1000;  // updated in last 2h
  });
  if (updatedRecently.length > 2) {
    actions.push({
      key:           "rebuild_catalog",
      label:         `Reconstruir catálogo (${updatedRecently.length} productos actualizados)`,
      detail:        "Varios productos fueron actualizados recientemente. El catálogo debe reconstruirse para reflejar los cambios.",
      urgency:       "low",
      affectedCount: updatedRecently.length,
      actionType:    "rebuild",
      targetChannel: "catalog",
    });
  }

  // Sort by urgency
  const urgencyOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  return actions.sort((a, b) => (urgencyOrder[b.urgency] ?? 0) - (urgencyOrder[a.urgency] ?? 0));
}
