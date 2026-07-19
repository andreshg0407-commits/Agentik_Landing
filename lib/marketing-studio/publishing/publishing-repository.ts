/**
 * lib/marketing-studio/publishing/publishing-repository.ts
 *
 * MS-17 — Unified Publishing OS: Data access layer
 *
 * All DB reads/writes for PublishingPlan, PublishingPlanStep,
 * PublishingEvent, PublishingHealthSnapshot models.
 *
 * SERVER ONLY — never import in client components.
 */

import { prisma }     from "@/lib/prisma";
import { randomUUID } from "crypto";
import type {
  PublishingPlan,
  PublishingPlanStep,
  PublishingEventRecord,
  PublishingDependency,
  PublishingEventType,
} from "./publishing-types";
import { canExecutePublishingStep } from "./publishing-dependencies";

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapStep(r: {
  id:             string;
  organizationId: string;
  planId:         string;
  destination:    string;
  status:         string;
  dependencies:   unknown;
  payload:        unknown;
  executionJobId: string | null;
  retryCount:     number;
  lastError:      string | null;
  scheduledAt:    Date | null;
  startedAt:      Date | null;
  completedAt:    Date | null;
  createdAt:      Date;
  updatedAt:      Date;
}): PublishingPlanStep {
  const deps = (r.dependencies as PublishingDependency[]) ?? [];

  const step: PublishingPlanStep = {
    id:               r.id,
    organizationId:   r.organizationId,
    planId:           r.planId,
    destination:      r.destination as PublishingPlanStep["destination"],
    status:           r.status as PublishingPlanStep["status"],
    dependencies:     deps,
    payload:          (r.payload as Record<string, unknown>) ?? {},
    executionJobId:   r.executionJobId,
    retryCount:       r.retryCount,
    lastError:        r.lastError,
    scheduledAt:      r.scheduledAt?.toISOString() ?? null,
    startedAt:        r.startedAt?.toISOString()   ?? null,
    completedAt:      r.completedAt?.toISOString() ?? null,
    createdAt:        r.createdAt.toISOString(),
    updatedAt:        r.updatedAt.toISOString(),
    canExecute:       false,
    isBlocked:        false,
    isOverdue:        false,
    executionJobType: "",
  };

  // Compute runtime fields
  step.canExecute = canExecutePublishingStep(step);
  step.isBlocked  = !step.canExecute && deps.some(d => !d.isResolved);
  step.isOverdue  = !!(
    step.scheduledAt &&
    new Date(step.scheduledAt) < new Date() &&
    !["published","cancelled","archived"].includes(step.status)
  );
  step.executionJobType = "";  // resolved by publishing-actions

  return step;
}

function mapPlan(
  r: {
    id:                string;
    organizationId:    string;
    campaignId:        string | null;
    productId:         string | null;
    catalogId:         string | null;
    status:            string;
    priority:          string;
    trigger:           string;
    destinationSummary:unknown;
    progress:          number;
    scheduledAt:       Date | null;
    startedAt:         Date | null;
    completedAt:       Date | null;
    createdAt:         Date;
    updatedAt:         Date;
  },
  steps: PublishingPlanStep[],
): PublishingPlan {
  return {
    id:                 r.id,
    organizationId:     r.organizationId,
    campaignId:         r.campaignId,
    productId:          r.productId,
    catalogId:          r.catalogId,
    status:             r.status  as PublishingPlan["status"],
    priority:           r.priority as PublishingPlan["priority"],
    trigger:            r.trigger  as PublishingPlan["trigger"],
    destinationSummary: (r.destinationSummary as Record<string, string>) ?? {},
    progress:           r.progress,
    scheduledAt:        r.scheduledAt?.toISOString()  ?? null,
    startedAt:          r.startedAt?.toISOString()    ?? null,
    completedAt:        r.completedAt?.toISOString()  ?? null,
    createdAt:          r.createdAt.toISOString(),
    updatedAt:          r.updatedAt.toISOString(),
    steps,
  };
}

function mapEvent(r: {
  id:             string;
  organizationId: string;
  planId:         string | null;
  stepId:         string | null;
  eventType:      string;
  payload:        unknown;
  occurredAt:     Date;
}): PublishingEventRecord {
  return {
    id:             r.id,
    organizationId: r.organizationId,
    planId:         r.planId,
    stepId:         r.stepId,
    eventType:      r.eventType as PublishingEventType,
    payload:        (r.payload as Record<string, unknown>) ?? {},
    occurredAt:     r.occurredAt.toISOString(),
  };
}

// ── Plan queries ──────────────────────────────────────────────────────────────

export async function listPublishingPlans(
  organizationId: string,
  statusFilter?:  string[],
): Promise<PublishingPlan[]> {
  const rows = await prisma.publishingPlan.findMany({
    where: {
      organizationId,
      ...(statusFilter ? { status: { in: statusFilter } } : {}),
    },
    include: { steps: true },
    orderBy: { createdAt: "desc" },
    take:    50,
  });
  return rows.map(r => mapPlan(r, r.steps.map(mapStep)));
}

export async function getPublishingPlan(
  id:             string,
  organizationId: string,
): Promise<PublishingPlan | null> {
  const row = await prisma.publishingPlan.findFirst({
    where: { id, organizationId },
    include: { steps: true },
  });
  return row ? mapPlan(row, row.steps.map(mapStep)) : null;
}

export async function createPublishingPlan(
  plan: PublishingPlan,
): Promise<PublishingPlan> {
  const [created] = await prisma.$transaction([
    prisma.publishingPlan.create({
      data: {
        id:                 plan.id,
        organizationId:     plan.organizationId,
        campaignId:         plan.campaignId,
        productId:          plan.productId,
        catalogId:          plan.catalogId,
        status:             plan.status,
        priority:           plan.priority,
        trigger:            plan.trigger,
        destinationSummary: plan.destinationSummary as object,
        progress:           plan.progress,
        scheduledAt:        plan.scheduledAt ? new Date(plan.scheduledAt) : null,
      },
    }),
    ...plan.steps.map(s =>
      prisma.publishingPlanStep.create({
        data: {
          id:             s.id,
          organizationId: s.organizationId,
          planId:         plan.id,
          destination:    s.destination,
          status:         s.status,
          dependencies:   s.dependencies as object[],
          payload:        s.payload as object,
          retryCount:     s.retryCount,
          scheduledAt:    s.scheduledAt ? new Date(s.scheduledAt) : null,
        },
      }),
    ),
  ]);

  // Re-fetch with steps
  const withSteps = await prisma.publishingPlan.findFirstOrThrow({
    where: { id: plan.id },
    include: { steps: true },
  });
  return mapPlan(withSteps, withSteps.steps.map(mapStep));
}

export async function updatePublishingPlanStatus(
  id:             string,
  organizationId: string,
  status:         string,
  extra?: {
    progress?:    number;
    startedAt?:   Date | null;
    completedAt?: Date | null;
    destinationSummary?: Record<string, string>;
  },
): Promise<void> {
  await prisma.publishingPlan.updateMany({
    where: { id, organizationId },
    data: {
      status,
      progress:           extra?.progress           ?? undefined,
      startedAt:          extra?.startedAt           ?? undefined,
      completedAt:        extra?.completedAt         ?? undefined,
      destinationSummary: extra?.destinationSummary ? (extra.destinationSummary as object) : undefined,
      updatedAt:          new Date(),
    },
  });
}

// ── Step queries ──────────────────────────────────────────────────────────────

export async function updatePublishingStepStatus(
  id:             string,
  organizationId: string,
  status:         string,
  extra?: {
    executionJobId?: string | null;
    retryCount?:     number;
    lastError?:      string | null;
    startedAt?:      Date | null;
    completedAt?:    Date | null;
    dependencies?:   PublishingDependency[];
  },
): Promise<void> {
  await prisma.publishingPlanStep.updateMany({
    where: { id, organizationId },
    data: {
      status,
      executionJobId: extra?.executionJobId ?? undefined,
      retryCount:     extra?.retryCount     ?? undefined,
      lastError:      extra?.lastError      ?? undefined,
      startedAt:      extra?.startedAt      ?? undefined,
      completedAt:    extra?.completedAt    ?? undefined,
      dependencies:   extra?.dependencies ? (extra.dependencies as unknown as object[]) : undefined,
      updatedAt:      new Date(),
    },
  });
}

export async function listStepsReadyToExecute(
  organizationId: string,
): Promise<PublishingPlanStep[]> {
  const rows = await prisma.publishingPlanStep.findMany({
    where: {
      organizationId,
      status: { in: ["planned", "queued", "retrying"] },
    },
    orderBy: { scheduledAt: "asc" },
    take:    50,
  });
  return rows.map(mapStep).filter(s => s.canExecute);
}

// ── Event queries ─────────────────────────────────────────────────────────────

export async function recordPublishingEvent(opts: {
  organizationId: string;
  planId:         string | null;
  stepId:         string | null;
  eventType:      string;
  payload:        Record<string, unknown>;
}): Promise<void> {
  await prisma.publishingEvent.create({
    data: {
      id:             randomUUID(),
      organizationId: opts.organizationId,
      planId:         opts.planId,
      stepId:         opts.stepId,
      eventType:      opts.eventType,
      payload:        opts.payload as object,
    },
  });
}

export async function listRecentPublishingEvents(
  organizationId: string,
  limit = 20,
): Promise<PublishingEventRecord[]> {
  const rows = await prisma.publishingEvent.findMany({
    where:   { organizationId },
    orderBy: { occurredAt: "desc" },
    take:    limit,
  });
  return rows.map(mapEvent);
}

// ── Health snapshot ───────────────────────────────────────────────────────────

export async function savePublishingHealthSnapshot(opts: {
  organizationId: string;
  health:         string;
  summary:        Record<string, unknown>;
}): Promise<void> {
  await prisma.publishingHealthSnapshot.create({
    data: {
      id:             randomUUID(),
      organizationId: opts.organizationId,
      health:         opts.health,
      summary:        opts.summary as object,
    },
  });
}
