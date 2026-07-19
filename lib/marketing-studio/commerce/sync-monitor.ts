/**
 * lib/marketing-studio/commerce/sync-monitor.ts
 *
 * MS-12 — Commerce Sync Monitor
 *
 * Computes operational sync health across products and publications.
 * Pure computation — all inputs are already-loaded snapshots.
 * Feeds: Shopify Commerce OS, Review Center, Copilot alerts.
 */

import type { ShopifyReconciliationReport } from "@/lib/integrations/shopify/shopify-reconciliation";
import { RECONCILIATION_STATE }             from "@/lib/integrations/shopify/shopify-reconciliation";

// ── Input types ───────────────────────────────────────────────────────────────

export interface ProductSyncMonitorInput {
  productId:          string;
  productName:        string;
  organizationId:     string;
  externalProductId:  string | null;
  lastSyncAt:         string | null;   // ISO
  syncStatus:         string;          // pending | synced | failed | outdated | not_configured
  publicationStatus:  string;          // unpublished | published | …
  reconReport:        ShopifyReconciliationReport | null;
}

// ── Output types ──────────────────────────────────────────────────────────────

export type MonitorHealthLevel = "healthy" | "warning" | "critical" | "unknown";

export interface ProductSyncMonitorState {
  productId:          string;
  productName:        string;
  healthLevel:        MonitorHealthLevel;
  healthLabel:        string;
  reconState:         string;
  reconStateLabel:    string;
  staleDays:          number | null;
  externalProductId:  string | null;
  lastSyncAt:         string | null;
  needsAttention:     boolean;
  driftCount:         number;
  blockingDriftCount: number;
  recommendedAction:  string;
}

export interface OrgCommerceSyncSummary {
  total:             number;
  inSync:            number;
  driftDetected:     number;
  externalNewer:     number;
  agentikNewer:      number;
  missingExternal:   number;
  conflict:          number;
  unknown:           number;
  stale:             number;
  webhookPending:    number;
  lastReconciliation: string | null;  // ISO — most recent reconciliation timestamp
  healthLevel:       MonitorHealthLevel;
}

export interface StalePublication {
  productId:     string;
  productName:   string;
  staleDays:     number;
  externalId:    string | null;
  publicationUrl: string | null;
}

export interface FailedSyncRecovery {
  productId:       string;
  productName:     string;
  lastError:       string | null;
  retryCount:      number;
  canRetry:        boolean;
}

// ── Engine ────────────────────────────────────────────────────────────────────

export function computeProductSyncMonitorState(
  input: ProductSyncMonitorInput,
): ProductSyncMonitorState {
  const report = input.reconReport;

  if (!report) {
    return {
      productId:          input.productId,
      productName:        input.productName,
      healthLevel:        "unknown",
      healthLabel:        "Sin datos de reconciliación",
      reconState:         "unknown",
      reconStateLabel:    "Desconocido",
      staleDays:          null,
      externalProductId:  input.externalProductId,
      lastSyncAt:         input.lastSyncAt,
      needsAttention:     false,
      driftCount:         0,
      blockingDriftCount: 0,
      recommendedAction:  "Ejecutar sync check para obtener estado",
    };
  }

  const blockingDrifts  = report.driftFields.filter(d => d.severity === "blocking");
  const warningDrifts   = report.driftFields.filter(d => d.severity === "warning");

  let healthLevel: MonitorHealthLevel;
  let healthLabel: string;

  if (report.externalMissing || blockingDrifts.length > 0) {
    healthLevel = "critical";
    healthLabel = "Crítico — requiere acción inmediata";
  } else if (report.state === RECONCILIATION_STATE.CONFLICT) {
    healthLevel = "critical";
    healthLabel = "Conflicto — cambios en ambos sistemas";
  } else if (warningDrifts.length > 0 || report.staleDraft || report.externalNewer || report.agentikNewer) {
    healthLevel = "warning";
    healthLabel = "Advertencia — drift detectado";
  } else if (report.state === RECONCILIATION_STATE.IN_SYNC) {
    healthLevel = "healthy";
    healthLabel = "En sincronía";
  } else {
    healthLevel = "unknown";
    healthLabel = "Estado desconocido";
  }

  return {
    productId:          input.productId,
    productName:        input.productName,
    healthLevel,
    healthLabel,
    reconState:         report.state,
    reconStateLabel:    report.stateLabel,
    staleDays:          report.staleDays,
    externalProductId:  report.externalProductId,
    lastSyncAt:         input.lastSyncAt,
    needsAttention:     healthLevel === "critical" || healthLevel === "warning",
    driftCount:         report.driftFields.length,
    blockingDriftCount: blockingDrifts.length,
    recommendedAction:  report.recommendedAction,
  };
}

export function computeOrgCommerceSyncSummary(
  states:         ProductSyncMonitorState[],
  webhookPending: number,
): OrgCommerceSyncSummary {
  const stateCountMap: Record<string, number> = {};
  let lastRecon: string | null = null;
  let staleCount = 0;

  for (const s of states) {
    stateCountMap[s.reconState] = (stateCountMap[s.reconState] ?? 0) + 1;
    if (s.staleDays !== null && s.staleDays >= 14) staleCount++;
  }

  const critical = states.filter(s => s.healthLevel === "critical").length;
  const warning  = states.filter(s => s.healthLevel === "warning").length;

  let healthLevel: MonitorHealthLevel = "healthy";
  if (critical > 0) healthLevel = "critical";
  else if (warning > 0 || webhookPending > 0) healthLevel = "warning";
  else if (states.length === 0) healthLevel = "unknown";

  return {
    total:              states.length,
    inSync:             stateCountMap[RECONCILIATION_STATE.IN_SYNC] ?? 0,
    driftDetected:      stateCountMap[RECONCILIATION_STATE.DRIFT_DETECTED] ?? 0,
    externalNewer:      stateCountMap[RECONCILIATION_STATE.EXTERNAL_NEWER] ?? 0,
    agentikNewer:       stateCountMap[RECONCILIATION_STATE.AGENTIK_NEWER] ?? 0,
    missingExternal:    stateCountMap[RECONCILIATION_STATE.MISSING_EXTERNAL] ?? 0,
    conflict:           stateCountMap[RECONCILIATION_STATE.CONFLICT] ?? 0,
    unknown:            stateCountMap[RECONCILIATION_STATE.UNKNOWN] ?? 0,
    stale:              staleCount,
    webhookPending,
    lastReconciliation: lastRecon,
    healthLevel,
  };
}

export function detectStalePublications(
  states:       ProductSyncMonitorState[],
  thresholdDays: number = 14,
): StalePublication[] {
  return states
    .filter(s => s.staleDays !== null && s.staleDays >= thresholdDays && s.externalProductId)
    .map(s => ({
      productId:    s.productId,
      productName:  s.productName,
      staleDays:    s.staleDays!,
      externalId:   s.externalProductId,
      publicationUrl: null,
    }))
    .sort((a, b) => b.staleDays - a.staleDays);
}

export function detectProductsNeedingReconciliation(
  states: ProductSyncMonitorState[],
): ProductSyncMonitorState[] {
  return states
    .filter(s => s.needsAttention)
    .sort((a, b) => {
      const levelOrder: Record<MonitorHealthLevel, number> = {
        critical: 4, warning: 3, unknown: 2, healthy: 1,
      };
      return levelOrder[b.healthLevel] - levelOrder[a.healthLevel];
    });
}

export function detectFailedSyncRecoveries(
  jobs: Array<{
    productId: string | null;
    productName?: string;
    status:    string;
    retryCount: number;
    lastError:  string | null;
  }>,
  maxRetries: number = 3,
): FailedSyncRecovery[] {
  return jobs
    .filter(j => j.status === "failed" && j.productId)
    .map(j => ({
      productId:  j.productId!,
      productName: j.productName ?? j.productId!,
      lastError:   j.lastError,
      retryCount:  j.retryCount,
      canRetry:    j.retryCount < maxRetries,
    }));
}
