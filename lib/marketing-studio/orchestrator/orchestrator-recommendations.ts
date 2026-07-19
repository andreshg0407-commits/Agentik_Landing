/**
 * lib/marketing-studio/orchestrator/orchestrator-recommendations.ts
 *
 * MS-17 — Unified Publishing Orchestrator: Operational intelligence
 *
 * Luca (commercial intelligence) + Mila (creative intelligence) recommendations.
 * Pure computation — no Prisma, no fetch, no side effects.
 */

import { randomUUID } from "crypto";
import type {
  OrchestratorPlan,
  OrchestratorRecommendation,
} from "./orchestrator-types";

// ── Luca: Commercial intelligence ────────────────────────────────────────────

export function computeLucaRecommendations(
  plans:         OrchestratorPlan[],
  organizationId: string,
): OrchestratorRecommendation[] {
  const recs: OrchestratorRecommendation[] = [];

  // High-readiness plans not yet launched
  const readyToLaunch = plans.filter(
    p => p.readinessScore >= 80 && p.status === "draft"
  );
  if (readyToLaunch.length > 0) {
    recs.push({
      id:          randomUUID(),
      source:      "luca",
      priority:    "high",
      title:       `${readyToLaunch.length} plan(es) listos para lanzar`,
      description: `${readyToLaunch.length} planes tienen readiness ≥80% pero siguen en borrador. Lanzar ahora para maximizar impacto comercial.`,
      action:      "Ejecutar planes",
      planId:      readyToLaunch[0].id,
      metadata:    { planIds: readyToLaunch.map(p => p.id) },
    });
  }

  // Campaign launch opportunities: plans with campaign source but no social channels
  const campaignNoSocial = plans.filter(
    p => p.type === "campaign_launch" &&
         p.status === "draft" &&
         !p.targetChannels.some(c => ["instagram", "facebook", "tiktok"].includes(c))
  );
  if (campaignNoSocial.length > 0) {
    recs.push({
      id:          randomUUID(),
      source:      "luca",
      priority:    "medium",
      title:       "Campañas sin canales sociales configurados",
      description: `${campaignNoSocial.length} campaña(s) no tienen Instagram, Facebook o TikTok como destino. Agregar redes sociales aumenta el alcance promedio un 3.2x.`,
      action:      "Agregar canales sociales",
      planId:      campaignNoSocial[0].id,
      metadata:    { count: campaignNoSocial.length },
    });
  }

  // Stale campaigns: plans not updated in 7+ days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const stalePlans = plans.filter(
    p => p.updatedAt < sevenDaysAgo && ["draft", "paused"].includes(p.status)
  );
  if (stalePlans.length > 0) {
    recs.push({
      id:          randomUUID(),
      source:      "luca",
      priority:    "medium",
      title:       `${stalePlans.length} plan(es) inactivos hace +7 días`,
      description: "Planes sin actividad pueden indicar bloqueos operativos. Revisar y reactiva o archivar para mantener el pipeline limpio.",
      action:      "Revisar planes estancados",
      planId:      stalePlans[0].id,
      metadata:    { planIds: stalePlans.map(p => p.id) },
    });
  }

  // Multi-channel opportunity: single-channel plans that could expand
  const singleChannel = plans.filter(
    p => p.targetChannels.length === 1 && p.status === "draft"
  );
  if (singleChannel.length >= 3) {
    recs.push({
      id:          randomUUID(),
      source:      "luca",
      priority:    "low",
      title:       "Oportunidad multi-canal detectada",
      description: `${singleChannel.length} planes apuntan a un solo canal. Expandir a multi-canal puede aumentar conversión promedio.`,
      action:      "Ampliar cobertura de canales",
      planId:      null,
      metadata:    { count: singleChannel.length },
    });
  }

  return recs;
}

// ── Mila: Creative intelligence ───────────────────────────────────────────────

export function computeMilaRecommendations(
  plans:          OrchestratorPlan[],
  organizationId: string,
): OrchestratorRecommendation[] {
  const recs: OrchestratorRecommendation[] = [];

  // Plans with missing captions blocker
  const noCaptions = plans.filter(
    p => p.blockers.some(b => b.code === "MISSING_CAPTIONS")
  );
  if (noCaptions.length > 0) {
    recs.push({
      id:          randomUUID(),
      source:      "mila",
      priority:    "high",
      title:       `${noCaptions.length} plan(es) sin copy para publicación social`,
      description: "Faltan captions en publicaciones sociales. Mila puede generar copy optimizado por canal a partir de los assets y catálogo.",
      action:      "Generar captions con Mila",
      planId:      noCaptions[0].id,
      metadata:    { planIds: noCaptions.map(p => p.id) },
    });
  }

  // Plans with missing assets
  const noAssets = plans.filter(
    p => p.blockers.some(b => b.code === "MISSING_ASSETS")
  );
  if (noAssets.length > 0) {
    recs.push({
      id:          randomUUID(),
      source:      "mila",
      priority:    "high",
      title:       `${noAssets.length} plan(es) sin assets aprobados`,
      description: "Planes bloqueados por falta de assets visuales. Revisar Foto Estudio y aprobar imágenes para desbloquear la ejecución.",
      action:      "Ir a Foto Estudio",
      planId:      noAssets[0].id,
      metadata:    { planIds: noAssets.map(p => p.id) },
    });
  }

  // Retry pressure: high retry count across plans
  const highRetry = plans.filter(p => p.retryCount >= 3);
  if (highRetry.length > 0) {
    recs.push({
      id:          randomUUID(),
      source:      "mila",
      priority:    "medium",
      title:       `${highRetry.length} plan(es) con alta presión de reintentos`,
      description: "Múltiples reintentos pueden indicar problemas de conectores o assets. Revisar configuración de integraciones.",
      action:      "Revisar conectores",
      planId:      highRetry[0].id,
      metadata:    { planIds: highRetry.map(p => p.id) },
    });
  }

  // Publication cadence: no completed plans recently
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const recentCompleted = plans.filter(
    p => p.status === "completed" && p.completedAt && p.completedAt > threeDaysAgo
  );
  if (recentCompleted.length === 0 && plans.length > 0) {
    recs.push({
      id:          randomUUID(),
      source:      "mila",
      priority:    "low",
      title:       "Sin publicaciones completadas en los últimos 3 días",
      description: "La cadencia de publicación es baja. Revisar si hay planes bloqueados o pendientes de aprobación.",
      action:      "Revisar cola de planes",
      planId:      null,
      metadata:    {},
    });
  }

  return recs;
}

// ── Merge all recommendations ─────────────────────────────────────────────────

export function computeAllRecommendations(
  plans:          OrchestratorPlan[],
  organizationId: string,
): OrchestratorRecommendation[] {
  const luca = computeLucaRecommendations(plans, organizationId);
  const mila = computeMilaRecommendations(plans, organizationId);

  // Interleave: high priority first, then alternate sources
  const all  = [...luca, ...mila];
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  return all.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}
