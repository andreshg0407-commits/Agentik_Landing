/**
 * lib/comercial/frontline/seller-app-features.ts
 *
 * AGENTIK-SELLER-APP-V1-01 — Section R/S/Q
 *
 * Feature flags for Seller App capabilities.
 * Deterministic — no LLM, no external service.
 *
 * V1 defaults:
 *   SELLER_CATALOG_GENERATION        = false (Marketing Studio not ready)
 *   SELLER_WEB_PUSH                  = false (service worker not yet configured)
 *   SELLER_ORDER_FULFILLMENT_TIMELINE = true  (read model available, with NOT_AVAILABLE stages)
 *
 * SERVER ONLY — never import from client components.
 */

import "server-only";
import type {
  SellerAppFeature,
  SellerAppFeatureFlags,
  SellerAppNavigation,
  CatalogGenerationRequest,
} from "./seller-app-types";

// ── Feature flags ───────────────────────────────────────────────────────────

const V1_DEFAULTS: SellerAppFeatureFlags = {
  SELLER_CATALOG_GENERATION: false,
  SELLER_WEB_PUSH: false,
  SELLER_ORDER_FULFILLMENT_TIMELINE: true,
};

/**
 * Get current feature flags for a seller.
 * V1: static defaults. Future: per-org configuration from database.
 */
export function getSellerAppFeatureFlags(
  _orgId: string,
): SellerAppFeatureFlags {
  return { ...V1_DEFAULTS };
}

/**
 * Check if a specific feature is enabled.
 */
export function isSellerFeatureEnabled(
  orgId: string,
  feature: SellerAppFeature,
): boolean {
  const flags = getSellerAppFeatureFlags(orgId);
  return flags[feature] ?? false;
}

// ── Navigation contract ─────────────────────────────────────────────────────

/**
 * Build the navigation contract for the Seller App.
 * Reflects which sections are available based on feature flags.
 */
export function getSellerAppNavigation(
  orgId: string,
): SellerAppNavigation {
  const flags = getSellerAppFeatureFlags(orgId);

  return {
    inicio: { attention: true, tareas: true },
    clientes: { all: true, inactive90d: true, search: true },
    nuevoPedido: true,
    miMaleta: { retiro: true, planSurtido: true, muestras: true },
    pedidos: true,
  };
}

// ── Catalog generation stub ─────────────────────────────────────────────────

/**
 * Prepare a catalog generation request for Marketing Studio.
 *
 * Seller App owns: request/context
 * Marketing Studio owns: generation/rendering/assets
 *
 * V1: returns the structured request. Does NOT invoke generation.
 * When SELLER_CATALOG_GENERATION is enabled, this request will be
 * forwarded to Marketing Studio's catalog workflow.
 */
export function prepareCatalogGenerationRequest(input: {
  organizationId: string;
  sellerId: string;
  customerId?: string;
  specifications: CatalogGenerationRequest["specifications"];
}): CatalogGenerationRequest {
  return {
    organizationId: input.organizationId,
    sellerId: input.sellerId,
    customerId: input.customerId,
    specifications: input.specifications,
  };
}
