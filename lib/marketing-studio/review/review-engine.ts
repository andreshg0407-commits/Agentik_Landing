/**
 * lib/marketing-studio/review/review-engine.ts
 *
 * MS-07 — Approval Queue + Operational Review System
 *
 * Pure computation layer — no Prisma, no side effects.
 * Transforms ProductConsoleItem[] into ReviewQueueItem[] with:
 *   - Blocking issue derivation (per-channel rules)
 *   - Warning classification
 *   - Operational priority scoring
 *   - Suggested action generation
 *   - Alert summary aggregation
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   Input:  ProductConsoleItem[] (already serialized, safe across RSC boundary)
 *   Output: ReviewQueueItem[]   (sorted by priority desc)
 *   No dependencies on Prisma, Next.js, or UI layer.
 */

import type { ProductConsoleItem, LucaSignal, MilaSignal } from "../products/product-display";
import type { SyncChannel } from "../products/domain/product-enums";

// ── Review status ─────────────────────────────────────────────────────────────

export const ReviewStatus = {
  PENDING_REVIEW:     "pending_review",
  BLOCKED:            "blocked",
  PARTIALLY_READY:    "partially_ready",
  READY:              "ready",
  PUBLISHED:          "published",
  FAILED_SYNC:        "failed_sync",
  REQUIRES_ATTENTION: "requires_attention",
} as const;
export type ReviewStatus = typeof ReviewStatus[keyof typeof ReviewStatus];

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  pending_review:     "Pendiente revisión",
  blocked:            "Bloqueado",
  partially_ready:    "Parcialmente listo",
  ready:              "Listo",
  published:          "Publicado",
  failed_sync:        "Sync fallido",
  requires_attention: "Requiere atención",
};

// ── Priority ──────────────────────────────────────────────────────────────────

export const PriorityLevel = {
  CRITICAL: "critical",
  HIGH:     "high",
  MEDIUM:   "medium",
  LOW:      "low",
} as const;
export type PriorityLevel = typeof PriorityLevel[keyof typeof PriorityLevel];

export const PRIORITY_LABEL: Record<PriorityLevel, string> = {
  critical: "Crítico",
  high:     "Alto",
  medium:   "Medio",
  low:      "Bajo",
};

// ── Issue types ───────────────────────────────────────────────────────────────

export interface BlockingIssue {
  code:     string;
  channel:  SyncChannel | null;   // null = system-wide
  label:    string;
  detail:   string;
  severity: "critical" | "high";
}

export interface WarningIssue {
  code:   string;
  label:  string;
  detail: string;
}

// ── Review queue item ─────────────────────────────────────────────────────────

export interface ReviewQueueItem {
  productId:           string;
  productName:         string;
  sku:                 string | null;
  primaryAssetUrl:     string | null;
  organizationId:      string;

  // ── Operational status ──
  reviewStatus:        ReviewStatus;
  readinessLevel:      string;
  readinessScore:      number;

  // ── Issues ──
  blockingIssues:      BlockingIssue[];
  warningIssues:       WarningIssue[];

  // ── Destinations ──
  pendingDestinations: SyncChannel[];   // ready but not yet published
  failedDestinations:  SyncChannel[];
  readyDestinations:   SyncChannel[];
  partialDestinations: SyncChannel[];
  blockedDestinations: SyncChannel[];

  // ── Operational flags ──
  missingVariants:     boolean;
  missingAssets:       boolean;
  missingPrimaryAsset: boolean;
  stale:               boolean;

  // ── Agent intelligence ──
  lucaSignals:         LucaSignal[];
  milaSignals:         MilaSignal[];

  // ── Sync + publication pass-through ──
  syncSummary:         ProductConsoleItem["syncSummary"];
  publicationSummary:  ProductConsoleItem["publicationSummary"];

  // ── Priority ──
  priorityScore:       number;   // 0–100
  priorityLevel:       PriorityLevel;

  // ── Guidance ──
  suggestedActions:    string[];

  // ── Audit ──
  updatedAt:   string;
  approvedAt:  string | null;
}

// ── Alert summary ─────────────────────────────────────────────────────────────

export interface ReviewAlertSummary {
  total:           number;
  blocked:         number;
  syncFailed:      number;
  shopifyReady:    number;
  missingVariants: number;
  stale:           number;
  requiresReview:  number;
  partiallyReady:  number;
  ready:           number;
  published:       number;
}

// ── Static label maps ─────────────────────────────────────────────────────────

const CHANNEL_LABELS: Record<string, string> = {
  shopify:  "Shopify",
  whatsapp: "WhatsApp",
  catalog:  "Catálogo",
  crm:      "CRM",
  ads:      "Ads",
  landing:  "Landing",
};

const CHANNEL_BLOCK_DETAIL: Record<string, string> = {
  shopify:  "Faltan: nombre comercial, categoría, precio o descripción.",
  whatsapp: "Faltan: nombre corto o disponibilidad de stock.",
  catalog:  "Faltan: nombre o categoría del producto.",
  crm:      "Faltan: nombre CRM, línea de producto, argumento de venta o disponibilidad.",
  ads:      "Falta variante 9:16 o nombre para Ads.",
  landing:  "Faltan: nombre o descripción larga.",
};

function chLabel(ch: string): string {
  return CHANNEL_LABELS[ch] ?? ch;
}

// ── Blocking issue derivation ─────────────────────────────────────────────────

function deriveBlockingIssues(item: ProductConsoleItem): BlockingIssue[] {
  const issues: BlockingIssue[] = [];

  // Missing primary asset — system-wide critical, affects all visual channels
  if (!item.primaryAssetUrl) {
    issues.push({
      code:     "missing_primary_asset",
      channel:  null,
      label:    "Sin imagen principal",
      detail:   "No hay asset visual vinculado como principal. Shopify, WhatsApp y Ads están bloqueados.",
      severity: "critical",
    });
  }

  // Missing SKU — Shopify + CRM
  if (!item.sku) {
    issues.push({
      code:     "missing_sku",
      channel:  "shopify" as SyncChannel,
      label:    "Sin SKU",
      detail:   "Shopify y CRM requieren un identificador único de producto.",
      severity: "high",
    });
  }

  // No variants — Ads
  if (item.variantCount === 0 && item.blockedDestinations.includes("ads" as SyncChannel)) {
    issues.push({
      code:     "missing_ad_variants",
      channel:  "ads" as SyncChannel,
      label:    "Sin variantes 9:16",
      detail:   "Ads requiere al menos una variante de formato vertical (9:16).",
      severity: "high",
    });
  }

  // Per-channel blocking (don't duplicate already-covered codes)
  const coveredChannels = new Set<string>();
  if (!item.primaryAssetUrl) ["shopify", "whatsapp", "ads"].forEach(ch => coveredChannels.add(ch));
  if (item.variantCount === 0) coveredChannels.add("ads");

  for (const channel of item.blockedDestinations) {
    if (coveredChannels.has(channel)) continue;
    issues.push({
      code:     `${channel}_blocked`,
      channel:  channel as SyncChannel,
      label:    `${chLabel(channel)} bloqueado`,
      detail:   CHANNEL_BLOCK_DETAIL[channel] ?? "Metadata incompleta para este destino.",
      severity: "critical",
    });
  }

  // Sync failures
  for (const sync of item.syncSummary) {
    if (sync.status === "failed") {
      issues.push({
        code:     `sync_failed_${sync.channel}`,
        channel:  sync.channel,
        label:    `Sync fallido — ${chLabel(sync.channel)}`,
        detail:   "El último intento de sincronización falló. El dato en el canal puede estar desactualizado.",
        severity: "high",
      });
    }
    // MS-12: outdated = drift detected — flag as warning in blocking issues
    if (sync.status === "outdated") {
      issues.push({
        code:     `drift_detected_${sync.channel}`,
        channel:  sync.channel,
        label:    `Drift detectado — ${chLabel(sync.channel)}`,
        detail:   "Los datos en el canal no coinciden con el registro en Agentik. Sincronizar para actualizar.",
        severity: "high",
      });
    }
  }

  // MS-12: external product missing on Shopify
  const shopifyPub = item.publicationSummary.find(p => p.channel === "shopify");
  if (shopifyPub?.publicationStatus === "unpublished" && shopifyPub.publishedAt) {
    // Was published, now unpublished → deleted externally
    issues.push({
      code:     "shopify_external_missing",
      channel:  "shopify" as SyncChannel,
      label:    "Producto eliminado en Shopify",
      detail:   "El producto estaba publicado pero ya no está disponible en Shopify. Puede haber sido eliminado externamente.",
      severity: "critical",
    });
  }

  return issues;
}

// ── Warning issue derivation ──────────────────────────────────────────────────

function deriveWarningIssues(item: ProductConsoleItem): WarningIssue[] {
  const warnings: WarningIssue[] = [];

  if (item.partialDestinations.length > 0) {
    warnings.push({
      code:   "partial_readiness",
      label:  `${item.partialDestinations.length} destino${item.partialDestinations.length > 1 ? "s" : ""} parcialmente listos`,
      detail: `Metadata incompleta en: ${item.partialDestinations.map(chLabel).join(", ")}.`,
    });
  }

  const readyUnpublished = item.publicationSummary.filter(
    pub => pub.publicationStatus === "unpublished" && item.readyDestinations.includes(pub.channel),
  );
  if (readyUnpublished.length > 0) {
    warnings.push({
      code:   "ready_not_published",
      label:  "Listos para publicar",
      detail: `${readyUnpublished.map(p => chLabel(p.channel)).join(", ")} está${readyUnpublished.length > 1 ? "n" : ""} listo${readyUnpublished.length > 1 ? "s" : ""} pero sin publicar.`,
    });
  }

  if (item.lucaSignals.some(s => s.key === "high_readiness_unpublished")) {
    warnings.push({
      code:   "luca_high_readiness_unused",
      label:  "Alto readiness — sin activación",
      detail: `Score ${item.readinessScore}/100. Ningún canal publicado. Oportunidad de activación inmediata.`,
    });
  }

  if (item.variantCount === 0 && !item.blockedDestinations.includes("ads" as SyncChannel)) {
    warnings.push({
      code:   "no_variants_warning",
      label:  "Sin variantes de formato",
      detail: "Sin variantes adicionales. Las campañas de Ads pueden requerir formatos 9:16 o 1:1.",
    });
  }

  return warnings;
}

// ── Review status ─────────────────────────────────────────────────────────────

function deriveReviewStatus(
  item:           ProductConsoleItem,
  blockingIssues: BlockingIssue[],
): ReviewStatus {
  const hasCritical    = blockingIssues.some(i => i.severity === "critical");
  const hasSyncFailure = item.syncSummary.some(s => s.status === "failed");
  const allPublished   = item.publicationSummary.length > 0 &&
    item.publicationSummary.every(p => p.publicationStatus === "published");

  if (allPublished && !hasSyncFailure) return ReviewStatus.PUBLISHED;
  if (hasSyncFailure)                  return ReviewStatus.FAILED_SYNC;
  if (hasCritical)                     return ReviewStatus.BLOCKED;
  if (item.readinessLevel === "ready") return ReviewStatus.READY;
  if (item.readinessLevel === "partial") {
    return blockingIssues.some(i => i.severity === "high")
      ? ReviewStatus.REQUIRES_ATTENTION
      : ReviewStatus.PARTIALLY_READY;
  }
  if (item.status === "pending")       return ReviewStatus.PENDING_REVIEW;
  return ReviewStatus.REQUIRES_ATTENTION;
}

// ── Priority scoring ──────────────────────────────────────────────────────────

function computePriorityScore(
  item:           ProductConsoleItem,
  blockingIssues: BlockingIssue[],
  reviewStatus:   ReviewStatus,
): number {
  let score = 0;

  // External missing or sync conflict = most urgent (MS-12)
  const hasMissingExternal = blockingIssues.some(i => i.code === "shopify_external_missing");
  const hasConflict        = blockingIssues.some(i => i.code.startsWith("drift_detected_"));
  if (hasMissingExternal) score += 95;
  if (hasConflict)        score += 15;

  // Sync failure on published = most urgent
  if (reviewStatus === ReviewStatus.FAILED_SYNC) score += 90;

  // Critical blockers
  const criticalCount = blockingIssues.filter(i => i.severity === "critical").length;
  score += Math.min(criticalCount * 15, 60);

  // High-severity blockers
  const highCount = blockingIssues.filter(i => i.severity === "high").length;
  score += Math.min(highCount * 8, 32);

  // Shopify ready but unpublished — high commercial urgency
  const shopifyReady    = item.readyDestinations.includes("shopify" as SyncChannel);
  const shopifyNotPub   = item.publicationSummary.find(p => p.channel === "shopify")?.publicationStatus !== "published";
  if (shopifyReady && shopifyNotPub) score += 35;

  // High readiness = more urgency (dormant opportunity)
  if (item.readinessScore >= 70)      score += 20;
  else if (item.readinessScore >= 40) score += 10;

  // Partial destinations needing completion
  score += Math.min(item.partialDestinations.length * 5, 20);

  return Math.min(100, score);
}

function priorityFromScore(score: number): PriorityLevel {
  if (score >= 80) return PriorityLevel.CRITICAL;
  if (score >= 55) return PriorityLevel.HIGH;
  if (score >= 30) return PriorityLevel.MEDIUM;
  return PriorityLevel.LOW;
}

// ── Stale detection ───────────────────────────────────────────────────────────

function isStale(item: ProductConsoleItem): boolean {
  if (!item.activitySummary) return true;
  const last     = new Date(item.activitySummary.lastEventAt);
  const daysSince = (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince > 30;
}

// ── Suggested actions ─────────────────────────────────────────────────────────

function deriveSuggestedActions(
  item:         ProductConsoleItem,
  reviewStatus: ReviewStatus,
): string[] {
  const actions: string[] = [];

  if (!item.primaryAssetUrl)
    actions.push("Vincular asset visual principal desde Foto Estudio");
  if (!item.sku)
    actions.push("Agregar SKU en Biblioteca → editar producto");
  if (item.variantCount === 0)
    actions.push("Generar variantes de formato (9:16, 1:1) en Foto Estudio");
  if (reviewStatus === ReviewStatus.FAILED_SYNC)
    actions.push("Reintentar sincronización en el conector afectado");

  const readyUnpublished = item.publicationSummary.filter(
    p => p.publicationStatus === "unpublished" && item.readyDestinations.includes(p.channel),
  );
  if (readyUnpublished.length > 0)
    actions.push(`Publicar en: ${readyUnpublished.map(p => chLabel(p.channel)).join(", ")}`);

  if (item.partialDestinations.includes("shopify" as SyncChannel))
    actions.push("Completar metadata Shopify: precio, categoría, descripción");
  if (item.partialDestinations.includes("crm" as SyncChannel))
    actions.push("Completar metadata CRM: argumento de venta y segmento");
  if (item.partialDestinations.includes("whatsapp" as SyncChannel))
    actions.push("Agregar disponibilidad de stock para WhatsApp");

  return actions.slice(0, 4);
}

// ── Main builders ─────────────────────────────────────────────────────────────

export function buildReviewQueueItem(item: ProductConsoleItem): ReviewQueueItem {
  const blockingIssues   = deriveBlockingIssues(item);
  const warningIssues    = deriveWarningIssues(item);
  const reviewStatus     = deriveReviewStatus(item, blockingIssues);
  const priorityScore    = computePriorityScore(item, blockingIssues, reviewStatus);
  const priorityLevel    = priorityFromScore(priorityScore);
  const stale            = isStale(item);
  const suggestedActions = deriveSuggestedActions(item, reviewStatus);

  const failedDestinations   = item.syncSummary
    .filter(s => s.status === "failed")
    .map(s => s.channel);

  const pendingDestinations = item.publicationSummary
    .filter(p => p.publicationStatus === "unpublished" && item.readyDestinations.includes(p.channel))
    .map(p => p.channel);

  return {
    productId:           item.productId,
    productName:         item.name,
    sku:                 item.sku,
    primaryAssetUrl:     item.primaryAssetUrl,
    organizationId:      item.organizationId,
    reviewStatus,
    readinessLevel:      item.readinessLevel,
    readinessScore:      item.readinessScore,
    blockingIssues,
    warningIssues,
    pendingDestinations,
    failedDestinations,
    readyDestinations:   item.readyDestinations,
    partialDestinations: item.partialDestinations,
    blockedDestinations: item.blockedDestinations,
    missingVariants:     item.variantCount === 0,
    missingAssets:       item.assetCount === 0,
    missingPrimaryAsset: !item.primaryAssetUrl,
    stale,
    lucaSignals:         item.lucaSignals,
    milaSignals:         item.milaSignals,
    syncSummary:         item.syncSummary,
    publicationSummary:  item.publicationSummary,
    priorityScore,
    priorityLevel,
    suggestedActions,
    updatedAt:           item.updatedAt,
    approvedAt:          item.approvedAt,
  };
}

export function buildReviewQueue(items: ProductConsoleItem[]): ReviewQueueItem[] {
  return items
    .map(buildReviewQueueItem)
    .sort((a, b) => b.priorityScore - a.priorityScore);
}

export function buildAlertSummary(queue: ReviewQueueItem[]): ReviewAlertSummary {
  return {
    total:           queue.length,
    blocked:         queue.filter(i => i.reviewStatus === ReviewStatus.BLOCKED).length,
    syncFailed:      queue.filter(i => i.reviewStatus === ReviewStatus.FAILED_SYNC).length,
    shopifyReady:    queue.filter(
      i => i.readyDestinations.includes("shopify" as SyncChannel) &&
           i.publicationSummary.find(p => p.channel === "shopify")?.publicationStatus !== "published",
    ).length,
    missingVariants: queue.filter(i => i.missingVariants).length,
    stale:           queue.filter(i => i.stale).length,
    requiresReview:  queue.filter(
      i => i.reviewStatus === ReviewStatus.REQUIRES_ATTENTION ||
           i.reviewStatus === ReviewStatus.PENDING_REVIEW,
    ).length,
    partiallyReady:  queue.filter(i => i.reviewStatus === ReviewStatus.PARTIALLY_READY).length,
    ready:           queue.filter(i => i.reviewStatus === ReviewStatus.READY).length,
    published:       queue.filter(i => i.reviewStatus === ReviewStatus.PUBLISHED).length,
  };
}
