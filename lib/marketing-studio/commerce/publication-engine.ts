/**
 * lib/marketing-studio/commerce/publication-engine.ts
 *
 * MS-09A — Publication Intelligence Engine
 *
 * Pure computation. Evaluates a ProductConsoleItem's publication readiness
 * for a given CommerceDestination and produces a deterministic
 * PublicationAnalysis with issues, warnings, and next actions.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   No Prisma, no fetch, no side effects.
 *   Output is fully serializable (safe for RSC → client boundary).
 *   Channel capabilities drive required-field checking.
 */

import type { ProductConsoleItem } from "../products/product-display";
import type {
  PublicationIssue,
  CommerceSyncState,
  PublicationRecord,
  CommerceDestination,
  SyncHealth,
} from "./commerce-types";
import {
  PUBLICATION_STATUS,
  SYNC_HEALTH,
  ISSUE_SEVERITY,
  CHANNEL_CAPABILITIES,
  SYNC_ACTION_TYPE,
} from "./commerce-types";

// ── Publication queue item ────────────────────────────────────────────────────

export interface PublicationQueueItem {
  productId:        string;
  productName:      string;
  sku:              string | null;
  category:         string | null;
  primaryAssetUrl:  string | null;
  organizationId:   string;

  // ── Commerce state ──
  destination:       CommerceDestination;
  publicationStatus: string;   // PUBLICATION_STATUS value
  syncHealth:        SyncHealth;
  syncDriftDays:     number | null;
  lastSyncAt:        string | null;
  externalId:        string | null;
  retryCount:        number;
  retryCandidate:    boolean;

  // ── Readiness ──
  readinessScore:    number;
  readinessLevel:    string;
  isPublishable:     boolean;

  // ── Shopify payload ──
  shopifyPayload:    import("./shopify-mapping").ShopifyProductPayload;

  // ── Issues ──
  publicationIssues: PublicationIssue[];
  warningCount:      number;
  blockingCount:     number;

  // ── Asset + variant stats ──
  assetCount:    number;
  variantCount:  number;

  // ── Priority ──
  priorityScore: number;

  // ── Agent signals pass-through ──
  lucaSignals:   ProductConsoleItem["lucaSignals"];
  milaSignals:   ProductConsoleItem["milaSignals"];

  // ── Audit ──
  approvedAt:    string | null;
  updatedAt:     string;
}

// ── Commerce alert summary ────────────────────────────────────────────────────

export interface CommerceAlertSummary {
  total:             number;
  syncFailures:      number;
  draft:             number;
  readyToPublish:    number;
  missingAssets:     number;
  disconnected:      number;
  partialSyncs:      number;
  retryQueue:        number;
  published:         number;
}

// ── Issue derivation ──────────────────────────────────────────────────────────

function derivePublicationIssues(
  product:     ProductConsoleItem,
  destination: CommerceDestination,
): PublicationIssue[] {
  const issues: PublicationIssue[] = [];
  const caps = CHANNEL_CAPABILITIES[destination];

  // Required field checks
  if (caps.requiredFields.includes("name") && !product.name?.trim()) {
    issues.push({
      code: "missing_name", severity: ISSUE_SEVERITY.BLOCKING,
      label: "Sin nombre comercial",
      detail: "El campo nombre es requerido para publicar en este canal.",
      field: "name", destination,
    });
  }

  if (caps.requiredFields.includes("sku") && !product.sku) {
    issues.push({
      code: "missing_sku", severity: ISSUE_SEVERITY.BLOCKING,
      label: "Sin SKU",
      detail: `${destination === "shopify" ? "Shopify" : "Este canal"} requiere un identificador único de variante.`,
      field: "sku", destination,
    });
  }

  if (caps.requiredFields.includes("category") && !product.category) {
    issues.push({
      code: "missing_category", severity: ISSUE_SEVERITY.BLOCKING,
      label: "Sin categoría",
      detail: "La categoría del producto es requerida para asignación de colecciones.",
      field: "category", destination,
    });
  }

  if (caps.requiredFields.includes("image") && !product.primaryAssetUrl) {
    issues.push({
      code: "missing_primary_image", severity: ISSUE_SEVERITY.BLOCKING,
      label: "Sin imagen principal",
      detail: "Este canal requiere al menos una imagen para publicar.",
      field: "primaryAssetUrl", destination,
    });
  }

  if (caps.requiredFields.includes("availability")) {
    const hasAvailability = !product.milaSignals.some(s => s.key === "missing_availability");
    if (!hasAvailability) {
      issues.push({
        code: "missing_availability", severity: ISSUE_SEVERITY.BLOCKING,
        label: "Sin disponibilidad",
        detail: "Agrega el campo de disponibilidad de stock.",
        field: "availability", destination,
      });
    }
  }

  // Optional warnings
  if (!product.primaryAssetUrl) {
    issues.push({
      code: "no_hero_image", severity: ISSUE_SEVERITY.WARNING,
      label: "Sin imagen hero",
      detail: "Sin imagen principal el producto tendrá baja visibilidad en el canal.",
      destination,
    });
  }

  if (product.variantCount === 0 && caps.supportsVariants) {
    issues.push({
      code: "no_variants", severity: ISSUE_SEVERITY.WARNING,
      label: "Sin variantes",
      detail: `${destination === "shopify" ? "Shopify" : "Este canal"} soporta variantes. Considera agregar tallas, colores o formatos.`,
      destination,
    });
  }

  if (!caps.supportsInventory === false) {
    // inventory warning: if no price-related signal
    const missingCommercial = product.milaSignals.some(s => s.key === "missing_commercial_data");
    if (missingCommercial) {
      issues.push({
        code: "missing_price", severity: ISSUE_SEVERITY.WARNING,
        label: "Sin precio",
        detail: "El producto no tiene precio definido. Los listados sin precio tienen menor conversión.",
        field: "price", destination,
      });
    }
  }

  if (product.readinessScore < 30) {
    issues.push({
      code: "low_readiness", severity: ISSUE_SEVERITY.WARNING,
      label: `Readiness bajo (${product.readinessScore}/100)`,
      detail: "El readiness general del producto es inferior al umbral recomendado para publicación.",
      destination,
    });
  }

  return issues;
}

// ── Sync state derivation ────────────────────────────────────────────────────

function deriveCommerceSyncState(
  product:     ProductConsoleItem,
  destination: CommerceDestination,
): CommerceSyncState {
  // Map from existing syncSummary (ProductConsoleItem carries these from Prisma)
  const existingSync = product.syncSummary.find(s => s.channel === destination);
  const existingPub  = product.publicationSummary.find(p => p.channel === destination);

  let syncHealth: SyncHealth = SYNC_HEALTH.DISCONNECTED;
  let syncDriftDays: number | null = null;

  if (existingSync) {
    if (existingSync.status === "synced") {
      syncHealth = SYNC_HEALTH.HEALTHY;
    } else if (existingSync.status === "failed") {
      syncHealth = SYNC_HEALTH.CRITICAL;
    } else if (existingSync.status === "outdated" || existingSync.status === "pending") {
      syncHealth = SYNC_HEALTH.WARNING;
    }

    if (existingSync.lastSyncAt) {
      const diff  = Date.now() - new Date(existingSync.lastSyncAt).getTime();
      syncDriftDays = Math.floor(diff / (1000 * 60 * 60 * 24));
      if (syncDriftDays > 7  && syncHealth === SYNC_HEALTH.HEALTHY) syncHealth = SYNC_HEALTH.WARNING;
      if (syncDriftDays > 30 && syncHealth !== SYNC_HEALTH.CRITICAL) syncHealth = SYNC_HEALTH.CRITICAL;
    }
  }

  return {
    destination,
    externalId:    existingSync?.externalId ?? null,
    syncHealth,
    lastSyncAt:    existingSync?.lastSyncAt ?? null,
    syncDriftDays,
    retryCount:    0,   // not persisted yet in MS-09 (placeholder)
    issues:        [],  // filled by derivePublicationIssues at queue-item level
  };
}

// ── Publication status derivation ─────────────────────────────────────────────

function derivePublicationStatus(
  product:     ProductConsoleItem,
  destination: CommerceDestination,
  syncState:   CommerceSyncState,
  issues:      PublicationIssue[],
): string {
  const existingPub = product.publicationSummary.find(p => p.channel === destination);

  if (!existingPub) {
    const hasBlockers = issues.some(i => i.severity === ISSUE_SEVERITY.BLOCKING);
    return hasBlockers ? PUBLICATION_STATUS.DRAFT : PUBLICATION_STATUS.DRAFT;
  }

  const ps = existingPub.publicationStatus;
  if (ps === "published") {
    if (syncState.syncHealth === SYNC_HEALTH.CRITICAL) return PUBLICATION_STATUS.FAILED;
    if (syncState.syncHealth === SYNC_HEALTH.WARNING)  return PUBLICATION_STATUS.PARTIAL;
    return PUBLICATION_STATUS.PUBLISHED;
  }
  if (ps === "unpublished") {
    const hasBlockers = issues.some(i => i.severity === ISSUE_SEVERITY.BLOCKING);
    return hasBlockers ? PUBLICATION_STATUS.DRAFT : PUBLICATION_STATUS.DRAFT;
  }

  return PUBLICATION_STATUS.DRAFT;
}

// ── Priority scoring ──────────────────────────────────────────────────────────

function computePublicationPriority(
  product:    ProductConsoleItem,
  syncHealth: SyncHealth,
  pubStatus:  string,
  issues:     PublicationIssue[],
): number {
  let score = 0;

  // Published + critical sync failure = most urgent
  if (pubStatus === PUBLICATION_STATUS.PUBLISHED && syncHealth === SYNC_HEALTH.CRITICAL) score += 95;
  if (pubStatus === PUBLICATION_STATUS.FAILED)  score += 90;
  if (syncHealth === SYNC_HEALTH.CRITICAL)       score += 50;

  // Blocking issues
  const blocking = issues.filter(i => i.severity === ISSUE_SEVERITY.BLOCKING).length;
  score += Math.min(blocking * 12, 48);

  // High readiness + not yet published = high commercial value
  if (product.readinessScore >= 70 && pubStatus === PUBLICATION_STATUS.DRAFT) score += 35;
  else if (product.readinessScore >= 40 && pubStatus === PUBLICATION_STATUS.DRAFT) score += 18;

  // Warning issues
  const warnings = issues.filter(i => i.severity === ISSUE_SEVERITY.WARNING).length;
  score += Math.min(warnings * 5, 20);

  return Math.min(100, score);
}

// ── Publishable check ─────────────────────────────────────────────────────────

function isPublishable(issues: PublicationIssue[]): boolean {
  return !issues.some(i => i.severity === ISSUE_SEVERITY.BLOCKING);
}

// ── Main builder ──────────────────────────────────────────────────────────────

export function buildPublicationQueueItem(
  product:     ProductConsoleItem,
  destination: CommerceDestination,
): PublicationQueueItem {
  const { buildShopifyPayload } = require("./shopify-mapping") as typeof import("./shopify-mapping");

  const issues       = derivePublicationIssues(product, destination);
  const syncState    = deriveCommerceSyncState(product, destination);
  const pubStatus    = derivePublicationStatus(product, destination, syncState, issues);
  const priority     = computePublicationPriority(product, syncState.syncHealth, pubStatus, issues);
  const publishable  = isPublishable(issues);
  const shopifyPayload = buildShopifyPayload(product);

  return {
    productId:        product.productId,
    productName:      product.name,
    sku:              product.sku,
    category:         product.category,
    primaryAssetUrl:  product.primaryAssetUrl,
    organizationId:   product.organizationId,
    destination,
    publicationStatus: pubStatus,
    syncHealth:        syncState.syncHealth,
    syncDriftDays:     syncState.syncDriftDays,
    lastSyncAt:        syncState.lastSyncAt,
    externalId:        syncState.externalId,
    retryCount:        syncState.retryCount,
    retryCandidate:    syncState.syncHealth === SYNC_HEALTH.CRITICAL || pubStatus === PUBLICATION_STATUS.FAILED,
    readinessScore:    product.readinessScore,
    readinessLevel:    product.readinessLevel,
    isPublishable:     publishable,
    shopifyPayload,
    publicationIssues: issues,
    warningCount:      issues.filter(i => i.severity === ISSUE_SEVERITY.WARNING).length,
    blockingCount:     issues.filter(i => i.severity === ISSUE_SEVERITY.BLOCKING).length,
    assetCount:        product.assetCount,
    variantCount:      product.variantCount,
    priorityScore:     priority,
    lucaSignals:       product.lucaSignals,
    milaSignals:       product.milaSignals,
    approvedAt:        product.approvedAt,
    updatedAt:         product.updatedAt,
  };
}

export function buildPublicationQueue(
  products:    ProductConsoleItem[],
  destination: CommerceDestination,
): PublicationQueueItem[] {
  return products
    .map(p => buildPublicationQueueItem(p, destination))
    .sort((a, b) => b.priorityScore - a.priorityScore);
}

export function buildCommerceAlertSummary(queue: PublicationQueueItem[]): CommerceAlertSummary {
  return {
    total:          queue.length,
    syncFailures:   queue.filter(i => i.syncHealth === SYNC_HEALTH.CRITICAL).length,
    draft:          queue.filter(i => i.publicationStatus === PUBLICATION_STATUS.DRAFT).length,
    readyToPublish: queue.filter(i => i.isPublishable && i.publicationStatus === PUBLICATION_STATUS.DRAFT).length,
    missingAssets:  queue.filter(i => !i.primaryAssetUrl).length,
    disconnected:   queue.filter(i => i.syncHealth === SYNC_HEALTH.DISCONNECTED).length,
    partialSyncs:   queue.filter(i => i.publicationStatus === PUBLICATION_STATUS.PARTIAL).length,
    retryQueue:     queue.filter(i => i.retryCandidate).length,
    published:      queue.filter(i => i.publicationStatus === PUBLICATION_STATUS.PUBLISHED).length,
  };
}
