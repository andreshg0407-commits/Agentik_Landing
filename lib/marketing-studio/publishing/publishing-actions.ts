/**
 * lib/marketing-studio/publishing/publishing-actions.ts
 *
 * MS-17 — Unified Publishing OS: Action definitions + job type mapping
 *
 * Pure functions. No Prisma. No async.
 */

import {
  PUBLISHING_DESTINATION,
  type PublishingPlan,
  type PublishingPlanStep,
  type PublishingDestination,
  type PublishingAction,
} from "./publishing-types";
import {
  EXECUTION_JOB_TYPE,
  EXECUTION_DESTINATION,
} from "@/lib/marketing-studio/execution/execution-types";

// ── Destination → ExecutionJobType ────────────────────────────────────────────

export function mapDestinationToJobType(destination: PublishingDestination): string {
  const map: Record<PublishingDestination, string> = {
    [PUBLISHING_DESTINATION.SHOPIFY]:   EXECUTION_JOB_TYPE.SHOPIFY_PUBLISH_DRAFT,
    [PUBLISHING_DESTINATION.INSTAGRAM]: EXECUTION_JOB_TYPE.SOCIAL_PUBLISH_INSTAGRAM,
    [PUBLISHING_DESTINATION.FACEBOOK]:  EXECUTION_JOB_TYPE.SOCIAL_PUBLISH_FACEBOOK,
    [PUBLISHING_DESTINATION.TIKTOK]:    EXECUTION_JOB_TYPE.SOCIAL_PUBLISH_TIKTOK,
    [PUBLISHING_DESTINATION.WHATSAPP]:  EXECUTION_JOB_TYPE.WHATSAPP_PREPARE_CATALOG,
    [PUBLISHING_DESTINATION.YOUTUBE]:   EXECUTION_JOB_TYPE.SOCIAL_PUBLISH_YOUTUBE,
    [PUBLISHING_DESTINATION.LANDING]:   EXECUTION_JOB_TYPE.LANDING_PUBLISH,
    [PUBLISHING_DESTINATION.CATALOG]:   EXECUTION_JOB_TYPE.CATALOG_REBUILD,
    [PUBLISHING_DESTINATION.ADS]:       EXECUTION_JOB_TYPE.ADS_PREPARE_PACKAGE,
    [PUBLISHING_DESTINATION.EMAIL]:     EXECUTION_JOB_TYPE.EMAIL_PREPARE,
  };
  return map[destination] ?? "pending_external";
}

// ── Destination → ExecutionDestination ───────────────────────────────────────

export function mapDestinationToExecutionDestination(destination: PublishingDestination): string {
  const map: Record<PublishingDestination, string> = {
    [PUBLISHING_DESTINATION.SHOPIFY]:   EXECUTION_DESTINATION.SHOPIFY,
    [PUBLISHING_DESTINATION.INSTAGRAM]: EXECUTION_DESTINATION.SOCIAL,
    [PUBLISHING_DESTINATION.FACEBOOK]:  EXECUTION_DESTINATION.SOCIAL,
    [PUBLISHING_DESTINATION.TIKTOK]:    EXECUTION_DESTINATION.SOCIAL,
    [PUBLISHING_DESTINATION.WHATSAPP]:  EXECUTION_DESTINATION.WHATSAPP,
    [PUBLISHING_DESTINATION.YOUTUBE]:   EXECUTION_DESTINATION.SOCIAL,
    [PUBLISHING_DESTINATION.LANDING]:   EXECUTION_DESTINATION.INTERNAL,
    [PUBLISHING_DESTINATION.CATALOG]:   EXECUTION_DESTINATION.CATALOG,
    [PUBLISHING_DESTINATION.ADS]:       EXECUTION_DESTINATION.ADS,
    [PUBLISHING_DESTINATION.EMAIL]:     EXECUTION_DESTINATION.CRM,
  };
  return map[destination] ?? EXECUTION_DESTINATION.INTERNAL;
}

// ── Is pending external (no real handler yet) ─────────────────────────────────

const PENDING_EXTERNAL_DESTINATIONS: Set<string> = new Set([
  PUBLISHING_DESTINATION.LANDING,
  PUBLISHING_DESTINATION.ADS,
  PUBLISHING_DESTINATION.EMAIL,
  PUBLISHING_DESTINATION.YOUTUBE,
]);

export function isPendingExternalDestination(destination: PublishingDestination): boolean {
  return PENDING_EXTERNAL_DESTINATIONS.has(destination);
}

// ── Available actions for a plan ─────────────────────────────────────────────

export function computeAvailableActions(plan: PublishingPlan): PublishingAction[] {
  const actions: PublishingAction[] = [];

  // Execute plan
  const hasExecutableSteps = plan.steps.some(s => s.canExecute);
  actions.push({
    id:          `execute:${plan.id}`,
    label:       "Ejecutar Plan",
    description: "Despacha todos los steps ejecutables a sus respectivos sistemas",
    actionType:  "execute_plan",
    planId:      plan.id,
    stepId:      null,
    isAvailable: hasExecutableSteps && !["published","archived","cancelled"].includes(plan.status),
    unavailableReason: !hasExecutableSteps ? "No hay steps ejecutables" : null,
  });

  // Retry failed steps
  const failedSteps = plan.steps.filter(s => s.status === "failed" && s.retryCount < 3);
  actions.push({
    id:          `retry:${plan.id}`,
    label:       "Reintentar Fallidos",
    description: `Reintentar ${failedSteps.length} step(s) fallidos`,
    actionType:  "retry_step",
    planId:      plan.id,
    stepId:      null,
    isAvailable: failedSteps.length > 0,
    unavailableReason: failedSteps.length === 0 ? "Sin steps fallidos reintentables" : null,
  });

  // Recalculate dependencies
  actions.push({
    id:          `recalc:${plan.id}`,
    label:       "Recalcular Dependencias",
    description: "Vuelve a evaluar el estado de todas las dependencias del plan",
    actionType:  "recalculate_deps",
    planId:      plan.id,
    stepId:      null,
    isAvailable: !["published","archived","cancelled"].includes(plan.status),
    unavailableReason: null,
  });

  // Cancel
  actions.push({
    id:          `cancel:${plan.id}`,
    label:       "Cancelar Plan",
    description: "Cancela todos los steps pendientes",
    actionType:  "cancel_plan",
    planId:      plan.id,
    stepId:      null,
    isAvailable: !["published","cancelled","archived"].includes(plan.status),
    unavailableReason: ["published","cancelled","archived"].includes(plan.status)
      ? "Plan ya en estado terminal" : null,
  });

  // Archive
  actions.push({
    id:          `archive:${plan.id}`,
    label:       "Archivar",
    description: "Archiva el plan y sus resultados",
    actionType:  "archive_plan",
    planId:      plan.id,
    stepId:      null,
    isAvailable: ["published","failed","cancelled"].includes(plan.status),
    unavailableReason: !["published","failed","cancelled"].includes(plan.status)
      ? "Solo se pueden archivar plans terminados" : null,
  });

  return actions;
}

export function computeStepActions(step: PublishingPlanStep): PublishingAction[] {
  const actions: PublishingAction[] = [];

  if (step.canExecute && ["planned","queued"].includes(step.status)) {
    actions.push({
      id:          `execute_step:${step.id}`,
      label:       "Ejecutar Step",
      description: `Publicar en ${step.destination}`,
      actionType:  "execute_step",
      planId:      step.planId,
      stepId:      step.id,
      isAvailable: true,
      unavailableReason: null,
    });
  }

  if (step.status === "failed" && step.retryCount < 3) {
    actions.push({
      id:          `retry_step:${step.id}`,
      label:       "Reintentar",
      description: `Reintento ${step.retryCount + 1} para ${step.destination}`,
      actionType:  "retry_step",
      planId:      step.planId,
      stepId:      step.id,
      isAvailable: true,
      unavailableReason: null,
    });
  }

  return actions;
}
