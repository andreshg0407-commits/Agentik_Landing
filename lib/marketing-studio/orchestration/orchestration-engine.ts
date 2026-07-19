/**
 * lib/marketing-studio/orchestration/orchestration-engine.ts
 *
 * MS-12 — Commerce Orchestration Layer: Main Engine
 *
 * buildCommerceOrchestration() — the central computation function.
 * Receives snapshot data, detects states, generates jobs, propagation
 * impacts, and the full OrchestrationState.
 *
 * Pure computation — no Prisma, no fetch, no side effects.
 * All inputs are already-loaded snapshots.
 */

import type { ProductConsoleItem } from "../products/product-display";
import type { OrgCommerceSyncSummary } from "../commerce/sync-monitor";
import type { PublicationQueueItem } from "../commerce/publication-engine";
import type {
  OrchestrationJob,
  OrchestrationState,
  PropagationImpact,
} from "./orchestration-types";
import {
  ORCHESTRATION_JOB_TYPE,
  ORCHESTRATION_JOB_STATUS,
  PROPAGATION_CHANGE_TYPE,
} from "./orchestration-types";
import { computeDestinationHealth, computeSystemHealth } from "./orchestration-health";
import { buildOrchestrationActions }                    from "./orchestration-actions";
import { computeQueueStats, buildQueueView }            from "./orchestration-queue";
import { applyFailureDegradation }                      from "./orchestration-retries";

// ── Input ─────────────────────────────────────────────────────────────────────

export interface OrchestrationInput {
  organizationId: string;
  products:       ProductConsoleItem[];
  queue:          PublicationQueueItem[];
  syncSummary:    OrgCommerceSyncSummary | null;
  webhookPending: number;
  // Jobs are passed from the caller — populated from CommerceJob Prisma records
  // serialized to OrchestrationJob DTOs server-side before passing in.
  existingJobs:   OrchestrationJob[];
}

// ── Derived job generation ─────────────────────────────────────────────────────

function deriveJobsFromProducts(
  products:    ProductConsoleItem[],
  syncSummary: OrgCommerceSyncSummary | null,
): OrchestrationJob[] {
  const now  = new Date().toISOString();
  const jobs: OrchestrationJob[] = [];
  let   seq  = 0;

  const makeId = (prefix: string) => `derived_${prefix}_${++seq}`;

  // Jobs for products needing Shopify sync
  const needsShopifySync = products.filter(p =>
    p.syncSummary.some(s => s.channel === "shopify" && (s.status === "outdated" || s.status === "failed")),
  );
  for (const p of needsShopifySync) {
    jobs.push({
      id:                   makeId("shopify_sync"),
      productId:            p.productId,
      productName:          p.name,
      type:                 ORCHESTRATION_JOB_TYPE.SYNC_SHOPIFY,
      priority:             3,
      status:               ORCHESTRATION_JOB_STATUS.PENDING,
      retryCount:           0,
      createdAt:            now,
      startedAt:            null,
      completedAt:          null,
      failureReason:        null,
      dependencies:         [],
      affectedDestinations: ["shopify"],
      scheduledAt:          null,
    });
  }

  // Jobs for products with high readiness not published anywhere
  const readyToPublish = products.filter(
    p => p.readinessScore >= 80 &&
      p.publicationSummary.every(s => s.publicationStatus === "unpublished"),
  );
  for (const p of readyToPublish) {
    jobs.push({
      id:                   makeId("publish"),
      productId:            p.productId,
      productName:          p.name,
      type:                 ORCHESTRATION_JOB_TYPE.PUBLISH_PRODUCT,
      priority:             2,
      status:               ORCHESTRATION_JOB_STATUS.PENDING,
      retryCount:           0,
      createdAt:            now,
      startedAt:            null,
      completedAt:          null,
      failureReason:        null,
      dependencies:         [],
      affectedDestinations: ["shopify", "catalog"],
      scheduledAt:          null,
    });
  }

  // Jobs for products with no variants
  const needsVariants = products.filter(
    p => p.variantCount === 0 && p.status === "approved",
  );
  for (const p of needsVariants) {
    jobs.push({
      id:                   makeId("variants"),
      productId:            p.productId,
      productName:          p.name,
      type:                 ORCHESTRATION_JOB_TYPE.GENERATE_VARIANTS,
      priority:             4,
      status:               ORCHESTRATION_JOB_STATUS.PENDING,
      retryCount:           0,
      createdAt:            now,
      startedAt:            null,
      completedAt:          null,
      failureReason:        null,
      dependencies:         [],
      affectedDestinations: ["shopify", "ads"],
      scheduledAt:          null,
    });
  }

  // Recalculate readiness for products updated recently
  const recentlyUpdated = products.filter(p => {
    const updated = new Date(p.updatedAt);
    return Date.now() - updated.getTime() < 30 * 60 * 1000;
  });
  if (recentlyUpdated.length > 0) {
    jobs.push({
      id:                   makeId("readiness"),
      productId:            null,
      productName:          null,
      type:                 ORCHESTRATION_JOB_TYPE.RECALCULATE_READINESS,
      priority:             5,
      status:               ORCHESTRATION_JOB_STATUS.PENDING,
      retryCount:           0,
      createdAt:            now,
      startedAt:            null,
      completedAt:          null,
      failureReason:        null,
      dependencies:         [],
      affectedDestinations: [],
      scheduledAt:          null,
    });
  }

  // Rebuild catalog if multiple products changed
  if (recentlyUpdated.length > 2) {
    jobs.push({
      id:                   makeId("catalog"),
      productId:            null,
      productName:          null,
      type:                 ORCHESTRATION_JOB_TYPE.REBUILD_CATALOG,
      priority:             6,
      status:               ORCHESTRATION_JOB_STATUS.PENDING,
      retryCount:           0,
      createdAt:            now,
      startedAt:            null,
      completedAt:          null,
      failureReason:        null,
      dependencies:         [],
      affectedDestinations: ["catalog"],
      scheduledAt:          null,
    });
  }

  return jobs;
}

// ── Propagation impact detection ──────────────────────────────────────────────

function detectPropagationImpacts(products: ProductConsoleItem[]): PropagationImpact[] {
  const impacts: PropagationImpact[] = [];

  // Price changes affect all commerce channels
  const priceChanged = products.filter(p => {
    const recentActivity = p.activitySummary;
    return recentActivity?.lastEventType === "PRODUCT_UPDATED";
  });
  if (priceChanged.length > 0) {
    impacts.push({
      changeType:           PROPAGATION_CHANGE_TYPE.PRICE,
      affectedDestinations: ["shopify", "catalog", "whatsapp", "ads"],
      affectedProductIds:   priceChanged.map(p => p.productId),
      severity:             "warning",
      description:          `${priceChanged.length} producto(s) actualizados — sincronizar precio en todos los canales`,
      jobsRequired:         [ORCHESTRATION_JOB_TYPE.SYNC_SHOPIFY, ORCHESTRATION_JOB_TYPE.REBUILD_CATALOG, ORCHESTRATION_JOB_TYPE.UPDATE_WHATSAPP],
    });
  }

  // Products with no assets in any active channel
  const noAssets = products.filter(p => p.assetCount === 0 && p.status === "approved");
  if (noAssets.length > 0) {
    impacts.push({
      changeType:           PROPAGATION_CHANGE_TYPE.ASSETS,
      affectedDestinations: ["shopify", "ads", "catalog"],
      affectedProductIds:   noAssets.map(p => p.productId),
      severity:             "blocking",
      description:          `${noAssets.length} producto(s) sin assets — no pueden publicarse en ningún canal`,
      jobsRequired:         [ORCHESTRATION_JOB_TYPE.GENERATE_SOCIAL_ASSETS],
    });
  }

  // Products with readiness changes
  const readinessLow = products.filter(
    p => p.readinessLevel === "not_ready" && p.status === "approved",
  );
  if (readinessLow.length > 0) {
    impacts.push({
      changeType:           PROPAGATION_CHANGE_TYPE.READINESS,
      affectedDestinations: ["shopify", "catalog", "whatsapp"],
      affectedProductIds:   readinessLow.map(p => p.productId),
      severity:             "warning",
      description:          `${readinessLow.length} producto(s) aprobados con readiness insuficiente para distribución`,
      jobsRequired:         [ORCHESTRATION_JOB_TYPE.RECALCULATE_READINESS],
    });
  }

  return impacts;
}

// ── Main engine ────────────────────────────────────────────────────────────────

export function buildCommerceOrchestration(input: OrchestrationInput): OrchestrationState {
  const { organizationId, products, syncSummary, webhookPending, existingJobs } = input;

  // Merge existing + derived jobs
  const derivedJobs = deriveJobsFromProducts(products, syncSummary);
  const allJobs     = [...existingJobs, ...derivedJobs];

  // Propagation impacts
  const propagationAlerts = detectPropagationImpacts(products);

  // Destination health
  let destinations = computeDestinationHealth(products, allJobs, syncSummary);
  destinations = applyFailureDegradation(
    destinations,
    allJobs.filter(j => j.status === ORCHESTRATION_JOB_STATUS.FAILED),
  );

  // System health
  const { healthLevel, healthLabel } = computeSystemHealth(destinations, webhookPending);

  // Queue
  const queueView  = buildQueueView(allJobs);
  const queueStats = computeQueueStats(allJobs);

  // Recommendations
  const recommendations = buildOrchestrationActions(products, allJobs, destinations, syncSummary);

  // Publication + sync backlogs
  const publicationBacklog = products.filter(
    p => p.readinessScore >= 70 &&
      p.publicationSummary.every(s => s.publicationStatus === "unpublished"),
  ).length;

  const syncBacklog = products.filter(p =>
    p.syncSummary.some(s => s.status === "outdated" || s.status === "failed"),
  ).length;

  return {
    organizationId,
    computedAt:          new Date().toISOString(),
    systemHealth:        healthLevel,
    systemHealthLabel:   healthLabel,
    activeJobs:          queueView.active,
    failedJobs:          queueView.failed,
    retryQueue:          queueView.retrying,
    completedRecent:     queueView.completed,
    destinations,
    propagationAlerts,
    queueStats,
    recommendations,
    publicationBacklog,
    syncBacklog,
    webhookPending,
  };
}
