/**
 * lib/integrations/shopify/shopify-reconciliation.ts
 *
 * MS-12 — Shopify Reconciliation Engine
 *
 * Compares a local Agentik ProductEntity (via a safe snapshot) against
 * the live ShopifyExternalProductState and produces a reconciliation report.
 *
 * ── DESIGN ──────────────────────────────────────────────────────────────────
 *   Pure computation — no Prisma, no fetch, no side effects.
 *   Both inputs are already-fetched snapshots.
 *   Handles: title drift, variant drift, image drift, status drift,
 *            tag drift, price drift, deleted product, stale draft,
 *            version comparison.
 */

import type { ShopifyExternalProductState } from "./shopify-state-fetcher";

// ── Input snapshot ────────────────────────────────────────────────────────────

/** Safe projection of an Agentik ProductEntity for reconciliation */
export interface AgentikProductSnapshot {
  productId:         string;
  organizationId:    string;
  name:              string;
  sku:               string | null;
  category:          string | null;
  updatedAt:         Date;
  // From ProductPublicationState.shopify
  externalProductId: string | null;
  shopifyHandle:     string | null;
  lastSyncAt:        Date | null;
  externalVariantIds: Record<string, number> | null; // agentikVariantId → shopifyVariantId
  // Variant count from local DB
  variantCount:      number;
  // Image count from local asset links
  imageCount:        number;
  // Last known price
  price:             number | null;
}

// ── Report types ──────────────────────────────────────────────────────────────

export const RECONCILIATION_STATE = {
  IN_SYNC:          "in_sync",
  DRIFT_DETECTED:   "drift_detected",
  EXTERNAL_NEWER:   "external_newer",
  AGENTIK_NEWER:    "agentik_newer",
  MISSING_EXTERNAL: "missing_external",
  CONFLICT:         "conflict",
  UNKNOWN:          "unknown",
} as const;
export type ReconciliationState = typeof RECONCILIATION_STATE[keyof typeof RECONCILIATION_STATE];

export const RECONCILIATION_STATE_LABEL: Record<ReconciliationState, string> = {
  in_sync:          "En sincronía",
  drift_detected:   "Drift detectado",
  external_newer:   "Shopify más reciente",
  agentik_newer:    "Agentik más reciente",
  missing_external: "Producto eliminado en Shopify",
  conflict:         "Conflicto",
  unknown:          "Estado desconocido",
};

export type DriftField =
  | "title"
  | "handle"
  | "status"
  | "vendor"
  | "productType"
  | "tags"
  | "variantCount"
  | "imageCount"
  | "price"
  | "missingVariant"
  | "stale";

export interface DriftDetail {
  field:         DriftField;
  agentikValue:  string | number | null;
  shopifyValue:  string | number | null;
  severity:      "blocking" | "warning" | "info";
  note:          string;
}

export interface ShopifyReconciliationReport {
  productId:          string;
  organizationId:     string;
  externalProductId:  string | null;
  state:              ReconciliationState;
  stateLabel:         string;
  driftFields:        DriftDetail[];
  /** External product was deleted from Shopify */
  externalMissing:    boolean;
  /** Shopify updatedAt is newer than our lastSyncAt */
  externalNewer:      boolean;
  /** Agentik updatedAt is newer than our lastSyncAt */
  agentikNewer:       boolean;
  /** Draft was created but never activated — stale */
  staleDraft:         boolean;
  /** Days since last sync, null if never synced */
  staleDays:          number | null;
  /** Missing Shopify variant IDs */
  missingExternalVariants: number[];
  reconciledAt:       string;   // ISO
  rawHash:            string | null;
  recommendedAction:  string;
}

// ── Engine ────────────────────────────────────────────────────────────────────

const STALE_DRAFT_DAYS = 14;
const FRESHNESS_THRESHOLD_MS = 60 * 60 * 1000; // 1h — within this range, consider "in sync"

export function reconcileShopifyProduct(
  agentik:  AgentikProductSnapshot,
  external: ShopifyExternalProductState | null,
): ShopifyReconciliationReport {
  const now = new Date();
  const base: Pick<ShopifyReconciliationReport, "productId" | "organizationId" | "externalProductId" | "reconciledAt" | "rawHash"> = {
    productId:         agentik.productId,
    organizationId:    agentik.organizationId,
    externalProductId: agentik.externalProductId,
    reconciledAt:      now.toISOString(),
    rawHash:           external?.rawHash ?? null,
  };

  // ── Case: no external ID — never published ────────────────────────────────
  if (!agentik.externalProductId) {
    return {
      ...base,
      state:                   RECONCILIATION_STATE.UNKNOWN,
      stateLabel:              RECONCILIATION_STATE_LABEL.unknown,
      driftFields:             [],
      externalMissing:         false,
      externalNewer:           false,
      agentikNewer:            false,
      staleDraft:              false,
      staleDays:               null,
      missingExternalVariants: [],
      recommendedAction:       "Publicar producto en Shopify para iniciar tracking",
    };
  }

  // ── Case: external product was deleted ────────────────────────────────────
  if (!external) {
    return {
      ...base,
      state:                   RECONCILIATION_STATE.MISSING_EXTERNAL,
      stateLabel:              RECONCILIATION_STATE_LABEL.missing_external,
      driftFields:             [],
      externalMissing:         true,
      externalNewer:           false,
      agentikNewer:            false,
      staleDraft:              false,
      staleDays:               computeStaleDays(agentik.lastSyncAt, now),
      missingExternalVariants: [],
      recommendedAction:       "Re-publicar producto — fue eliminado de Shopify",
    };
  }

  const driftFields: DriftDetail[] = [];

  // ── Title drift ───────────────────────────────────────────────────────────
  if (agentik.name && external.title && agentik.name !== external.title) {
    driftFields.push({
      field: "title",
      agentikValue: agentik.name,
      shopifyValue: external.title,
      severity: "warning",
      note: "El nombre del producto difiere entre Agentik y Shopify",
    });
  }

  // ── Handle drift ──────────────────────────────────────────────────────────
  if (agentik.shopifyHandle && external.handle && agentik.shopifyHandle !== external.handle) {
    driftFields.push({
      field: "handle",
      agentikValue: agentik.shopifyHandle,
      shopifyValue: external.handle,
      severity: "info",
      note: "El handle de Shopify cambió — puede afectar URLs y SEO",
    });
  }

  // ── Status drift ──────────────────────────────────────────────────────────
  // We create drafts — if Shopify shows "archived" it's blocking
  if (external.status === "archived") {
    driftFields.push({
      field: "status",
      agentikValue: "draft",
      shopifyValue: "archived",
      severity: "blocking",
      note: "El producto fue archivado en Shopify — no está visible",
    });
  }

  // ── Product type drift ────────────────────────────────────────────────────
  const agentikType = agentik.category ?? "";
  if (agentikType && external.productType && agentikType !== external.productType) {
    driftFields.push({
      field: "productType",
      agentikValue: agentikType,
      shopifyValue: external.productType,
      severity: "info",
      note: "El tipo de producto difiere",
    });
  }

  // ── Variant count drift ───────────────────────────────────────────────────
  if (agentik.variantCount > 0 && external.variants.length !== agentik.variantCount) {
    driftFields.push({
      field: "variantCount",
      agentikValue: agentik.variantCount,
      shopifyValue: external.variants.length,
      severity: "warning",
      note: "El número de variantes no coincide",
    });
  }

  // ── Image count drift ─────────────────────────────────────────────────────
  if (agentik.imageCount > 0 && external.images.length === 0) {
    driftFields.push({
      field: "imageCount",
      agentikValue: agentik.imageCount,
      shopifyValue: 0,
      severity: "blocking",
      note: "Shopify no tiene imágenes para este producto",
    });
  } else if (agentik.imageCount > external.images.length) {
    driftFields.push({
      field: "imageCount",
      agentikValue: agentik.imageCount,
      shopifyValue: external.images.length,
      severity: "info",
      note: "Agentik tiene más imágenes que Shopify",
    });
  }

  // ── Price drift ───────────────────────────────────────────────────────────
  if (agentik.price !== null && external.variants.length > 0) {
    const shopifyPrice = parseFloat(external.variants[0].price);
    if (!isNaN(shopifyPrice) && Math.abs(shopifyPrice - agentik.price) > 0.01) {
      driftFields.push({
        field: "price",
        agentikValue: agentik.price,
        shopifyValue: shopifyPrice,
        severity: "warning",
        note: "El precio de la variante principal difiere",
      });
    }
  }

  // ── Missing external variants ──────────────────────────────────────────────
  const missingExternalVariants: number[] = [];
  if (agentik.externalVariantIds) {
    const shopifyVariantIds = new Set(external.variants.map(v => v.id));
    for (const shopifyId of Object.values(agentik.externalVariantIds)) {
      if (!shopifyVariantIds.has(shopifyId)) {
        missingExternalVariants.push(shopifyId);
      }
    }
    if (missingExternalVariants.length > 0) {
      driftFields.push({
        field: "missingVariant",
        agentikValue: missingExternalVariants.length,
        shopifyValue: null,
        severity: "blocking",
        note: `${missingExternalVariants.length} variante(s) fueron eliminadas de Shopify`,
      });
    }
  }

  // ── Stale draft detection ─────────────────────────────────────────────────
  const staleDays   = computeStaleDays(agentik.lastSyncAt, now);
  const staleDraft  = external.status === "draft" && staleDays !== null && staleDays >= STALE_DRAFT_DAYS;

  if (staleDraft) {
    driftFields.push({
      field: "stale",
      agentikValue: staleDays,
      shopifyValue: null,
      severity: "warning",
      note: `Draft sin activar por ${staleDays} días — puede perderse en una limpieza de Shopify`,
    });
  }

  // ── Timestamp comparison ──────────────────────────────────────────────────
  const shopifyUpdatedAt = new Date(external.updatedAt);
  const lastSync         = agentik.lastSyncAt;

  const externalNewer = lastSync !== null &&
    shopifyUpdatedAt.getTime() > (lastSync.getTime() + FRESHNESS_THRESHOLD_MS);

  const agentikNewer = lastSync !== null &&
    agentik.updatedAt.getTime() > (lastSync.getTime() + FRESHNESS_THRESHOLD_MS);

  // ── Determine overall state ───────────────────────────────────────────────
  const blockingDrift = driftFields.some(d => d.severity === "blocking");
  const hasDrift      = driftFields.length > 0;

  let state: ReconciliationState;
  let recommendedAction: string;

  if (blockingDrift || (externalNewer && agentikNewer)) {
    state             = RECONCILIATION_STATE.CONFLICT;
    recommendedAction = "Resolver conflicto manualmente — tanto Shopify como Agentik tienen cambios recientes";
  } else if (blockingDrift || hasDrift) {
    state             = RECONCILIATION_STATE.DRIFT_DETECTED;
    recommendedAction = "Re-sincronizar desde Agentik para actualizar el draft de Shopify";
  } else if (externalNewer) {
    state             = RECONCILIATION_STATE.EXTERNAL_NEWER;
    recommendedAction = "Shopify fue modificado externamente — revisar cambios y confirmar si aplicar a Agentik";
  } else if (agentikNewer) {
    state             = RECONCILIATION_STATE.AGENTIK_NEWER;
    recommendedAction = "Hay cambios en Agentik no reflejados en Shopify — publicar actualización";
  } else {
    state             = RECONCILIATION_STATE.IN_SYNC;
    recommendedAction = "Ninguna acción requerida — producto en sincronía";
  }

  return {
    ...base,
    state,
    stateLabel:              RECONCILIATION_STATE_LABEL[state],
    driftFields,
    externalMissing:         false,
    externalNewer,
    agentikNewer,
    staleDraft,
    staleDays,
    missingExternalVariants,
    recommendedAction,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeStaleDays(lastSyncAt: Date | null, now: Date): number | null {
  if (!lastSyncAt) return null;
  return Math.floor((now.getTime() - lastSyncAt.getTime()) / (1000 * 60 * 60 * 24));
}
