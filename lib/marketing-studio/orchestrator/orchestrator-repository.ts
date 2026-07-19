/**
 * lib/marketing-studio/orchestrator/orchestrator-repository.ts
 *
 * MS-17 — Unified Publishing Orchestrator: Data access layer
 *
 * Uses existing PublishingPlan / PublishingPlanStep Prisma models as backend.
 * Maps them into OrchestratorPlan display objects — no new DB tables needed.
 *
 * SERVER ONLY — never import in client components.
 */

import { prisma }  from "@/lib/prisma";
import { randomUUID } from "crypto";
import type {
  OrchestratorPlan,
  OrchestratorStage,
  OrchestratorJob,
  OrchestratorChannel,
  OrchestratorPlanType,
  OrchestratorStatus,
  OrchestratorStageStatus,
  OrchestratorJobType,
} from "./orchestrator-types";
import { ORCHESTRATOR_JOB_TYPE_LABEL } from "./orchestrator-display";
import { detectBlockers } from "./orchestrator-dependencies";
import { computePlanProgress } from "./orchestrator-plans";

// ── Status mapping: PublishingStatus → OrchestratorStatus ────────────────────

function mapToOrchestratorStatus(status: string): OrchestratorStatus {
  switch (status) {
    case "draft":      return "draft";
    case "planned":    return "queued";
    case "blocked":    return "blocked";
    case "queued":     return "queued";
    case "preparing":  return "validating";
    case "publishing": return "running";
    case "published":  return "completed";
    case "partial":    return "partially_completed";
    case "failed":     return "failed";
    case "retrying":   return "running";
    case "cancelled":  return "archived";
    case "archived":   return "archived";
    default:           return "draft";
  }
}

// ── Step → Stage mapper ───────────────────────────────────────────────────────

function mapStepToStage(step: {
  id:             string;
  planId:         string;
  destination:    string;
  status:         string;
  retryCount:     number;
  lastError:      string | null;
  startedAt:      Date | null;
  completedAt:    Date | null;
  createdAt:      Date;
  updatedAt:      Date;
}, order: number): OrchestratorStage {
  const stageStatus = mapToStageStatus(step.status);
  const jobType     = mapDestinationToJobType(step.destination);
  const jobId       = randomUUID();

  const job: OrchestratorJob = {
    id:             jobId,
    stageId:        step.id,
    type:           jobType,
    label:          ORCHESTRATOR_JOB_TYPE_LABEL[jobType],
    status:         stageStatus,
    startedAt:      step.startedAt?.toISOString()  ?? null,
    completedAt:    step.completedAt?.toISOString() ?? null,
    failedAt:       stageStatus === "failed" ? step.updatedAt.toISOString() : null,
    failReason:     step.lastError,
    retryCount:     step.retryCount,
    executionJobId: null,
  };

  return {
    id:           step.id,
    planId:       step.planId,
    type:         jobType,
    label:        mapDestinationToLabel(step.destination),
    status:       stageStatus,
    order,
    dependsOn:    [],   // wired at plan level
    jobs:         [job],
    startedAt:    step.startedAt?.toISOString()  ?? null,
    completedAt:  step.completedAt?.toISOString() ?? null,
    failedReason: step.lastError,
  };
}

function mapToStageStatus(status: string): OrchestratorStageStatus {
  switch (status) {
    case "published":  return "completed";
    case "publishing": return "running";
    case "queued":     return "ready";
    case "blocked":    return "blocked";
    case "failed":     return "failed";
    case "cancelled":  return "skipped";
    default:           return "pending";
  }
}

function mapDestinationToJobType(destination: string): OrchestratorJobType {
  switch (destination) {
    case "shopify":   return "shopify_publish";
    case "instagram":
    case "facebook":
    case "tiktok":
    case "youtube":   return "social_publish";
    case "whatsapp":  return "whatsapp_publish";
    case "catalog":   return "catalog_sync";
    case "landing":   return "shopify_publish";
    case "email":     return "campaign_attach";
    case "ads":       return "campaign_attach";
    default:          return "validation";
  }
}

function mapDestinationToLabel(destination: string): string {
  const labels: Record<string, string> = {
    shopify:   "Shopify",
    instagram: "Instagram",
    facebook:  "Facebook",
    tiktok:    "TikTok",
    whatsapp:  "WhatsApp",
    youtube:   "YouTube",
    landing:   "Landing Page",
    catalog:   "Catálogo",
    ads:       "Ads",
    email:     "Email",
  };
  return labels[destination] ?? destination;
}

function mapDestinationToChannel(destination: string): OrchestratorChannel {
  const valid: OrchestratorChannel[] = [
    "shopify","instagram","facebook","tiktok","whatsapp","youtube","landing","catalog","ads","email",
  ];
  return (valid.includes(destination as OrchestratorChannel)
    ? destination
    : "catalog") as OrchestratorChannel;
}

// ── Plan mapper ───────────────────────────────────────────────────────────────

function mapPlanRecord(record: {
  id:             string;
  organizationId: string;
  campaignId:     string | null;
  productId:      string | null;
  catalogId:      string | null;
  status:         string;
  priority:       string;
  trigger:        string;
  progress:       number;
  scheduledAt:    Date | null;
  startedAt:      Date | null;
  completedAt:    Date | null;
  createdAt:      Date;
  updatedAt:      Date;
  steps:          {
    id:          string;
    planId:      string;
    destination: string;
    status:      string;
    retryCount:  number;
    lastError:   string | null;
    startedAt:   Date | null;
    completedAt: Date | null;
    createdAt:   Date;
    updatedAt:   Date;
  }[];
}): OrchestratorPlan {
  const sourceEntityId   = record.productId ?? record.campaignId ?? record.catalogId ?? null;
  const sourceEntityType = record.productId  ? "product"
                         : record.campaignId ? "campaign"
                         : record.catalogId  ? "catalog"
                         : "custom";

  const planType: OrchestratorPlanType = record.productId  ? "product_launch"
                                       : record.campaignId ? "campaign_launch"
                                       : record.catalogId  ? "catalog_distribution"
                                       : "multi_channel_launch";

  const stages = record.steps.map((step, i) => mapStepToStage(step, i));
  const targetChannels = [...new Set(record.steps.map(s => mapDestinationToChannel(s.destination)))];

  const completedJobs = stages.filter(s => s.status === "completed").length;
  const failedJobs    = stages.filter(s => s.status === "failed").length;
  const blockedJobs   = stages.filter(s => s.status === "blocked").length;
  const retryingJobs  = stages.filter(s => s.jobs.some(j => j.retryCount > 0)).length;
  const totalRetries  = stages.reduce((sum, s) => sum + s.jobs.reduce((sj, j) => sj + j.retryCount, 0), 0);

  const partialPlan: OrchestratorPlan = {
    id:               record.id,
    organizationId:   record.organizationId,
    type:             planType,
    status:           mapToOrchestratorStatus(record.status),
    priority:         (["critical","high","medium","low"].includes(record.priority)
                        ? record.priority
                        : "medium") as "critical" | "high" | "medium" | "low",
    sourceEntityType,
    sourceEntityId,
    targetChannels,
    createdBy:        "system",
    scheduledAt:      record.scheduledAt?.toISOString()  ?? null,
    startedAt:        record.startedAt?.toISOString()    ?? null,
    completedAt:      record.completedAt?.toISOString()  ?? null,
    failedAt:         record.status === "failed" ? record.updatedAt.toISOString() : null,
    healthScore:      Math.max(0, 100 - failedJobs * 25 - blockedJobs * 15),
    readinessScore:   targetChannels.length > 0 ? Math.min(100, targetChannels.length * 20) : 40,
    retryCount:       totalRetries,
    stages,
    blockers:         [],
    executionSummary: {
      totalJobs:      stages.length,
      completedJobs,
      failedJobs,
      blockedJobs,
      retryingJobs,
      avgDurationMs:  null,
      lastActivityAt: record.updatedAt.toISOString(),
    },
    metadata: {
      productId:  record.productId,
      campaignId: record.campaignId,
      catalogId:  record.catalogId,
      trigger:    record.trigger,
    },
    createdAt:       record.createdAt.toISOString(),
    updatedAt:       record.updatedAt.toISOString(),
    progress:        record.progress,
    completedStages: completedJobs,
    totalStages:     stages.length,
  };

  // Wire blockers after full plan is constructed
  partialPlan.blockers = detectBlockers(partialPlan);

  return partialPlan;
}

// ── Public repository API ─────────────────────────────────────────────────────

export async function listOrchestratorPlans(
  organizationId: string,
  limit = 50,
): Promise<OrchestratorPlan[]> {
  const records = await prisma.publishingPlan.findMany({
    where:   { organizationId },
    include: { steps: { orderBy: { createdAt: "asc" } } },
    orderBy: { updatedAt: "desc" },
    take:    limit,
  });

  return records.map(mapPlanRecord);
}

export async function getOrchestratorPlan(
  organizationId: string,
  planId:         string,
): Promise<OrchestratorPlan | null> {
  const record = await prisma.publishingPlan.findFirst({
    where:   { id: planId, organizationId },
    include: { steps: { orderBy: { createdAt: "asc" } } },
  });

  return record ? mapPlanRecord(record) : null;
}

export async function listRecentOrchestratorActivity(
  organizationId: string,
  limit = 30,
) {
  return prisma.publishingEvent.findMany({
    where:   { organizationId },
    orderBy: { occurredAt: "desc" },
    take:    limit,
  });
}
