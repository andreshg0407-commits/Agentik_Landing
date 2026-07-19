/**
 * lib/marketing-studio/commerce/shopify-banner-publish-service.ts
 *
 * SHOPIFY-BANNERS-PRODUCTION-01 — Banner Publication to Shopify
 *
 * SERVER ONLY — never import from client components.
 *
 * Handles the actual Shopify theme/section update for banners.
 *
 * STATUS: Safe stub mode.
 *   - Validates connection + banner readiness
 *   - Prepares payload
 *   - Records "pendiente de integracion theme" until real Shopify theme API is wired
 *   - Never fakes a publication
 */

import "server-only";

import type { ShopifyBannerDraft, ShopifyBannerPublication } from "./shopify-banner-types";
import type { BannerPlacement } from "./shopify-experiences-types";
import { BANNER_PLACEMENT_LABEL } from "./shopify-experiences-types";

// ── Theme section mapping (stub) ─────────────────────────────────────────────

const PLACEMENT_TO_SECTION: Record<BannerPlacement, string> = {
  home:            "image_banner",
  home_secundario: "image_banner_secondary",
  coleccion:       "collection_banner",
  categoria:       "collection_banner",
  promocion:       "announcement_bar",
  temporada:       "image_banner_seasonal",
  footer:          "footer_banner",
};

// ── Publish banner to Shopify ────────────────────────────────────────────────

export async function publishBannerToShopify(
  draft: ShopifyBannerDraft,
): Promise<ShopifyBannerPublication> {
  if (!draft.asset) {
    return {
      id:               `pub_${draft.id}_${Date.now()}`,
      bannerId:         draft.id,
      placement:        draft.placement,
      shopifyPageId:    null,
      shopifySectionId: null,
      status:           "failed",
      publishedAt:      null,
      removedAt:        null,
      error:            "No hay asset asignado al banner.",
    };
  }

  if (draft.status !== "aprobado" && draft.status !== "programado" && draft.status !== "publicado") {
    return {
      id:               `pub_${draft.id}_${Date.now()}`,
      bannerId:         draft.id,
      placement:        draft.placement,
      shopifyPageId:    null,
      shopifySectionId: null,
      status:           "failed",
      publishedAt:      null,
      removedAt:        null,
      error:            `Banner en estado ${draft.status} no puede publicarse.`,
    };
  }

  // Stub: theme integration not yet available
  const sectionId = PLACEMENT_TO_SECTION[draft.placement];

  return {
    id:               `pub_${draft.id}_${Date.now()}`,
    bannerId:         draft.id,
    placement:        draft.placement,
    shopifyPageId:    null,
    shopifySectionId: sectionId,
    status:           "pending",
    publishedAt:      null,
    removedAt:        null,
    error:            `Pendiente de integracion theme — seccion: ${sectionId}, ubicacion: ${BANNER_PLACEMENT_LABEL[draft.placement]}.`,
  };
}

// ── Update existing Shopify banner ───────────────────────────────────────────

export async function updateShopifyBanner(
  draft: ShopifyBannerDraft,
): Promise<ShopifyBannerPublication> {
  // Stub: same as publish — theme integration pending
  return publishBannerToShopify(draft);
}

// ── Remove banner from Shopify ───────────────────────────────────────────────

export async function removeShopifyBanner(
  bannerId:  string,
  placement: BannerPlacement,
): Promise<ShopifyBannerPublication> {
  const sectionId = PLACEMENT_TO_SECTION[placement];

  return {
    id:               `pub_remove_${bannerId}_${Date.now()}`,
    bannerId,
    placement,
    shopifyPageId:    null,
    shopifySectionId: sectionId,
    status:           "pending",
    publishedAt:      null,
    removedAt:        null,
    error:            `Pendiente de integracion theme — remocion de seccion: ${sectionId}.`,
  };
}

// ── Get Shopify banner status ────────────────────────────────────────────────

export async function getShopifyBannerStatus(
  _bannerId:  string,
  placement:  BannerPlacement,
): Promise<{ synced: boolean; sectionId: string; note: string }> {
  const sectionId = PLACEMENT_TO_SECTION[placement];
  return {
    synced:    false,
    sectionId,
    note:      "Integracion theme pendiente. Banner gestionado internamente en Agentik.",
  };
}
