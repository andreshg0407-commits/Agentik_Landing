/**
 * lib/marketing-studio/publishing/publishing-health.ts
 *
 * MS-17 — Unified Publishing OS: Health engine
 *
 * Pure functions. No Prisma. No async.
 */

import {
  PUBLISHING_DESTINATION,
  type PublishingPlan,
  type PublishingDestinationState,
  type PublishingHealthSummary,
  type PublishingDestination,
} from "./publishing-types";

// ── Per-destination health ────────────────────────────────────────────────────

export function computeDestinationPublishingHealth(
  destination: PublishingDestination,
  plans:        PublishingPlan[],
): PublishingDestinationState {
  const steps = plans.flatMap(p => p.steps).filter(s => s.destination === destination);

  const total     = steps.length;
  const published = steps.filter(s => s.status === "published").length;
  const failed    = steps.filter(s => s.status === "failed").length;
  const blocked   = steps.filter(s => s.status === "blocked").length;
  const pending   = steps.filter(s =>
    ["planned","queued","preparing","publishing","retrying"].includes(s.status),
  ).length;

  const lastPublished = steps
    .filter(s => s.completedAt && s.status === "published")
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))
    [0]?.completedAt ?? null;

  let healthLevel: PublishingDestinationState["healthLevel"] = "healthy";
  if (failed >= 3 || blocked >= 2)   healthLevel = "blocked";
  else if (failed >= 1 || blocked >= 1) healthLevel = "degraded";

  return {
    destination,
    totalSteps:      total,
    publishedSteps:  published,
    failedSteps:     failed,
    blockedSteps:    blocked,
    pendingSteps:    pending,
    healthLevel,
    lastPublishedAt: lastPublished,
  };
}

// ── Bottleneck detection ──────────────────────────────────────────────────────

export function detectPublishingBottlenecks(plans: PublishingPlan[]): string[] {
  const bottlenecks: string[] = [];
  const now = new Date();

  const allSteps = plans.flatMap(p => p.steps);

  const overdueSteps = allSteps.filter(s =>
    s.scheduledAt &&
    new Date(s.scheduledAt) < now &&
    !["published","cancelled","archived"].includes(s.status),
  );
  if (overdueSteps.length > 0) {
    bottlenecks.push(`${overdueSteps.length} step(s) vencidos sin publicar`);
  }

  const stuckPlans = plans.filter(p =>
    p.startedAt &&
    !p.completedAt &&
    (now.getTime() - new Date(p.startedAt).getTime()) > 4 * 60 * 60_000,
  );
  if (stuckPlans.length > 0) {
    bottlenecks.push(`${stuckPlans.length} plan(s) sin progreso por más de 4h`);
  }

  const authBlocked = allSteps.filter(s =>
    s.status === "blocked" &&
    s.dependencies.some(d => d.type === "auth_connected" && !d.isResolved),
  );
  if (authBlocked.length > 0) {
    const channels = [...new Set(authBlocked.map(s => s.destination))];
    bottlenecks.push(`Auth faltante en: ${channels.join(", ")}`);
  }

  const retryOverload = allSteps.filter(s => s.retryCount >= 3).length;
  if (retryOverload > 0) {
    bottlenecks.push(`${retryOverload} step(s) en max-retries — revisión manual requerida`);
  }

  return bottlenecks;
}

export function detectStuckPlans(plans: PublishingPlan[]): PublishingPlan[] {
  const now = new Date();
  return plans.filter(p =>
    p.startedAt &&
    !p.completedAt &&
    (now.getTime() - new Date(p.startedAt).getTime()) > 4 * 60 * 60_000,
  );
}

export function detectOverdueSteps(plans: PublishingPlan[]): number {
  const now = new Date();
  return plans.flatMap(p => p.steps).filter(s =>
    s.scheduledAt &&
    new Date(s.scheduledAt) < now &&
    !["published","cancelled","archived"].includes(s.status),
  ).length;
}

// ── Global health summary ─────────────────────────────────────────────────────

export function computePublishingHealth(plans: PublishingPlan[]): PublishingHealthSummary {
  const allSteps = plans.flatMap(p => p.steps);
  const today    = new Date();
  today.setHours(0, 0, 0, 0);

  const activePlans    = plans.filter(p => ["planned","queued","preparing","publishing","retrying","partial"].includes(p.status)).length;
  const blockedPlans   = plans.filter(p => p.status === "blocked").length;
  const failedSteps    = allSteps.filter(s => s.status === "failed").length;
  const retryingSteps  = allSteps.filter(s => s.status === "retrying").length;
  const overdueSteps   = detectOverdueSteps(plans);
  const completedToday = allSteps.filter(s =>
    s.completedAt &&
    new Date(s.completedAt) >= today &&
    s.status === "published",
  ).length;

  const destinations = Object.values(PUBLISHING_DESTINATION) as PublishingDestination[];
  const destinationHealth = destinations.map(d =>
    computeDestinationPublishingHealth(d, plans),
  );

  const bottlenecks = detectPublishingBottlenecks(plans);

  const level: PublishingHealthSummary["level"] =
    blockedPlans > 0 || failedSteps >= 5 ? "critical"
    : failedSteps >= 2 || overdueSteps >= 3 ? "blocked"
    : failedSteps >= 1 || retryingSteps > 0 || overdueSteps > 0 ? "degraded"
    : "healthy";

  const LABELS: Record<typeof level, string> = {
    healthy:  "Publishing OS operativo",
    degraded: "Publicaciones con incidencias",
    blocked:  "Plans bloqueados — acción requerida",
    critical: "Fallo crítico en publishing",
  };

  return {
    level,
    label:            LABELS[level],
    activePlans,
    blockedPlans,
    failedSteps,
    overdueSteps,
    retryingSteps,
    completedToday,
    destinationHealth,
    bottlenecks,
  };
}
