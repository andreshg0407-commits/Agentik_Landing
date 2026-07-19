/**
 * lib/marketing-studio/commerce/sync-engine.ts
 *
 * MS-09A — Sync Intelligence Engine
 *
 * Pure computation. Analyzes sync state across products and destinations.
 * Detects drift, failures, retry candidates, orphans, and inconsistencies.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   No Prisma, no fetch, no side effects.
 *   Works over PublicationQueueItem[] (already computed by publication-engine).
 */

import type { PublicationQueueItem } from "./publication-engine";
import type { CommerceDestination, SyncHealth } from "./commerce-types";
import { SYNC_HEALTH, PUBLICATION_STATUS } from "./commerce-types";

// ── Sync summary ──────────────────────────────────────────────────────────────

export interface GlobalSyncHealth {
  destination:       CommerceDestination;
  overallHealth:     SyncHealth;
  healthScore:       number;     // 0–100
  healthyCount:      number;
  warningCount:      number;
  criticalCount:     number;
  disconnectedCount: number;
  totalProducts:     number;
  lastSyncAt:        string | null;
  driftWarnings:     number;     // products with syncDriftDays > 7
}

// ── Retry candidate ───────────────────────────────────────────────────────────

export interface SyncRetryCandidate {
  productId:      string;
  productName:    string;
  destination:    CommerceDestination;
  failureReason:  string;
  retryCount:     number;
  lastSyncAt:     string | null;
  priorityScore:  number;
}

// ── Conflict detection ────────────────────────────────────────────────────────

export interface SyncConflict {
  productId:   string;
  productName: string;
  type:        "stale_published" | "missing_external_id" | "drift_critical" | "orphaned";
  detail:      string;
  severity:    "critical" | "warning";
}

// ── Computations ──────────────────────────────────────────────────────────────

export function computeGlobalSyncHealth(
  queue:       PublicationQueueItem[],
  destination: CommerceDestination,
): GlobalSyncHealth {
  const healthy      = queue.filter(i => i.syncHealth === SYNC_HEALTH.HEALTHY).length;
  const warning      = queue.filter(i => i.syncHealth === SYNC_HEALTH.WARNING).length;
  const critical     = queue.filter(i => i.syncHealth === SYNC_HEALTH.CRITICAL).length;
  const disconnected = queue.filter(i => i.syncHealth === SYNC_HEALTH.DISCONNECTED).length;
  const total        = queue.length;

  const driftWarnings = queue.filter(
    i => i.syncDriftDays !== null && i.syncDriftDays > 7,
  ).length;

  // Health score: healthy = 100%, warning = 50%, critical/disconnected = 0%
  const rawScore = total > 0
    ? ((healthy * 100) + (warning * 50)) / total
    : 100;
  const healthScore = Math.round(rawScore);

  const overallHealth: SyncHealth =
    healthScore >= 80 ? SYNC_HEALTH.HEALTHY  :
    healthScore >= 50 ? SYNC_HEALTH.WARNING  :
    total > 0         ? SYNC_HEALTH.CRITICAL :
    SYNC_HEALTH.DISCONNECTED;

  // Most recent sync across all products
  const lastSyncDates = queue
    .map(i => i.lastSyncAt)
    .filter((d): d is string => d !== null)
    .sort()
    .reverse();

  return {
    destination,
    overallHealth,
    healthScore,
    healthyCount:      healthy,
    warningCount:      warning,
    criticalCount:     critical,
    disconnectedCount: disconnected,
    totalProducts:     total,
    lastSyncAt:        lastSyncDates[0] ?? null,
    driftWarnings,
  };
}

export function buildRetryQueue(queue: PublicationQueueItem[]): SyncRetryCandidate[] {
  return queue
    .filter(i => i.retryCandidate)
    .map(i => ({
      productId:     i.productId,
      productName:   i.productName,
      destination:   i.destination,
      failureReason: i.syncHealth === SYNC_HEALTH.CRITICAL
        ? "Sync fallido en el último intento"
        : "Publicación fallida",
      retryCount:    i.retryCount,
      lastSyncAt:    i.lastSyncAt,
      priorityScore: i.priorityScore,
    }))
    .sort((a, b) => b.priorityScore - a.priorityScore);
}

export function detectSyncConflicts(queue: PublicationQueueItem[]): SyncConflict[] {
  const conflicts: SyncConflict[] = [];

  for (const item of queue) {
    // Published but no external ID = orphaned
    if (
      item.publicationStatus === PUBLICATION_STATUS.PUBLISHED &&
      !item.externalId
    ) {
      conflicts.push({
        productId:   item.productId,
        productName: item.productName,
        type:        "missing_external_id",
        detail:      "El producto aparece como publicado pero no tiene ID externo registrado en el destino.",
        severity:    "critical",
      });
    }

    // Published + critical drift
    if (
      item.publicationStatus === PUBLICATION_STATUS.PUBLISHED &&
      item.syncDriftDays !== null &&
      item.syncDriftDays > 30
    ) {
      conflicts.push({
        productId:   item.productId,
        productName: item.productName,
        type:        "drift_critical",
        detail:      `El producto lleva ${item.syncDriftDays} días sin sincronizar. El dato en el canal puede estar desactualizado.`,
        severity:    "warning",
      });
    }

    // Has external ID but status is draft = stale published
    if (
      item.externalId &&
      item.publicationStatus === PUBLICATION_STATUS.DRAFT
    ) {
      conflicts.push({
        productId:   item.productId,
        productName: item.productName,
        type:        "stale_published",
        detail:      "El producto tiene un ID externo registrado pero aparece como borrador. Puede existir una versión antigua publicada en el canal.",
        severity:    "warning",
      });
    }
  }

  return conflicts;
}
