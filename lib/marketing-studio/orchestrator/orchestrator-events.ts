/**
 * lib/marketing-studio/orchestrator/orchestrator-events.ts
 *
 * MS-17 — Unified Publishing Orchestrator: Event engine
 *
 * Handles cross-runtime events and drives auto-advance, auto-unblock,
 * auto-queue, and retry scheduling.
 *
 * Pure computation — no Prisma, no fetch, no side effects.
 */

import type {
  OrchestratorPlan,
  OrchestratorStatus,
  OrchestratorStageStatus,
} from "./orchestrator-types";

// ── Event catalog ─────────────────────────────────────────────────────────────

export const ORCHESTRATOR_EVENT = {
  PRODUCT_APPROVED:   "product.approved",
  ASSET_APPROVED:     "asset.approved",
  CATALOG_READY:      "catalog.ready",
  CAMPAIGN_READY:     "campaign.ready",
  SHOPIFY_SYNCED:     "shopify.synced",
  SOCIAL_PUBLISHED:   "social.published",
  PUBLISH_FAILED:     "publish.failed",
  RETRY_SCHEDULED:    "retry.scheduled",
  PLAN_CREATED:       "plan.created",
  PLAN_COMPLETED:     "plan.completed",
  STAGE_COMPLETED:    "stage.completed",
  STAGE_FAILED:       "stage.failed",
} as const;

export type OrchestratorEventType = typeof ORCHESTRATOR_EVENT[keyof typeof ORCHESTRATOR_EVENT];

// ── Event payload ─────────────────────────────────────────────────────────────

export interface OrchestratorEventPayload {
  eventType:      OrchestratorEventType;
  organizationId: string;
  planId:         string | null;
  stageId:        string | null;
  jobId:          string | null;
  entityId:       string | null;
  entityType:     string | null;
  metadata:       Record<string, unknown>;
  occurredAt:     string;
}

// ── Auto-advance rules ────────────────────────────────────────────────────────
// Each event type describes what transitions it unlocks

export interface EventEffect {
  newPlanStatus:   OrchestratorStatus | null;
  newStageStatus:  OrchestratorStageStatus | null;
  shouldAutoQueue: boolean;
  shouldRetry:     boolean;
  description:     string;
}

const EVENT_EFFECTS: Record<OrchestratorEventType, EventEffect> = {
  "product.approved": {
    newPlanStatus:   "queued",
    newStageStatus:  null,
    shouldAutoQueue: true,
    shouldRetry:     false,
    description:     "Producto aprobado → plan pasa a cola de ejecución",
  },
  "asset.approved": {
    newPlanStatus:   null,
    newStageStatus:  "ready",
    shouldAutoQueue: false,
    shouldRetry:     false,
    description:     "Asset aprobado → stage de asset_sync pasa a ready",
  },
  "catalog.ready": {
    newPlanStatus:   null,
    newStageStatus:  "ready",
    shouldAutoQueue: true,
    shouldRetry:     false,
    description:     "Catálogo listo → desbloquea stages de catalog_sync y whatsapp_publish",
  },
  "campaign.ready": {
    newPlanStatus:   null,
    newStageStatus:  "ready",
    shouldAutoQueue: false,
    shouldRetry:     false,
    description:     "Campaña lista → desbloquea campaign_attach stage",
  },
  "shopify.synced": {
    newPlanStatus:   null,
    newStageStatus:  "completed",
    shouldAutoQueue: true,
    shouldRetry:     false,
    description:     "Shopify sincronizado → avanza plan a siguiente stage",
  },
  "social.published": {
    newPlanStatus:   null,
    newStageStatus:  "completed",
    shouldAutoQueue: true,
    shouldRetry:     false,
    description:     "Publicación social completada → avanza al siguiente stage",
  },
  "publish.failed": {
    newPlanStatus:   "partially_completed",
    newStageStatus:  "failed",
    shouldAutoQueue: false,
    shouldRetry:     true,
    description:     "Publicación fallida → registra fallo y agenda retry",
  },
  "retry.scheduled": {
    newPlanStatus:   null,
    newStageStatus:  "pending",
    shouldAutoQueue: true,
    shouldRetry:     false,
    description:     "Retry agendado → stage vuelve a pending",
  },
  "plan.created": {
    newPlanStatus:   "validating",
    newStageStatus:  null,
    shouldAutoQueue: false,
    shouldRetry:     false,
    description:     "Plan creado → inicia validación",
  },
  "plan.completed": {
    newPlanStatus:   "completed",
    newStageStatus:  null,
    shouldAutoQueue: false,
    shouldRetry:     false,
    description:     "Todos los stages completados → plan marcado como completado",
  },
  "stage.completed": {
    newPlanStatus:   null,
    newStageStatus:  "completed",
    shouldAutoQueue: true,
    shouldRetry:     false,
    description:     "Stage completado → evalúa próximos stages listos para ejecución",
  },
  "stage.failed": {
    newPlanStatus:   null,
    newStageStatus:  "failed",
    shouldAutoQueue: false,
    shouldRetry:     true,
    description:     "Stage fallido → agenda retry si aplica",
  },
};

// ── Handle event ──────────────────────────────────────────────────────────────

export function getEventEffect(eventType: OrchestratorEventType): EventEffect {
  return EVENT_EFFECTS[eventType];
}

// ── Check whether a plan should auto-advance given an event ──────────────────

export function shouldAutoAdvancePlan(
  plan:      OrchestratorPlan,
  eventType: OrchestratorEventType,
): boolean {
  const effect = EVENT_EFFECTS[eventType];
  if (!effect.shouldAutoQueue) return false;
  return ["running", "queued", "partially_completed"].includes(plan.status);
}

// ── Build an event payload ────────────────────────────────────────────────────

export function buildEventPayload(
  eventType: OrchestratorEventType,
  opts: {
    organizationId: string;
    planId?:        string | null;
    stageId?:       string | null;
    jobId?:         string | null;
    entityId?:      string | null;
    entityType?:    string | null;
    metadata?:      Record<string, unknown>;
  },
): OrchestratorEventPayload {
  return {
    eventType,
    organizationId: opts.organizationId,
    planId:         opts.planId        ?? null,
    stageId:        opts.stageId       ?? null,
    jobId:          opts.jobId         ?? null,
    entityId:       opts.entityId      ?? null,
    entityType:     opts.entityType    ?? null,
    metadata:       opts.metadata      ?? {},
    occurredAt:     new Date().toISOString(),
  };
}
