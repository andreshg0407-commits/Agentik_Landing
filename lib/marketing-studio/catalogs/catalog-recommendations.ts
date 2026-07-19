/**
 * lib/marketing-studio/catalogs/catalog-recommendations.ts
 *
 * MS-08 — Catalog Recommendations (Luca Intelligence)
 *
 * Analyzes ProductConsoleItem[] to detect catalog opportunities.
 * Generates actionable recommendations ordered by commercial urgency.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   Pure computation — no Prisma, no UI.
 *   Each recommendation maps to a CatalogPurpose + CatalogChannel pair
 *   and provides candidate/ready counts for the UI.
 */

import type { ProductConsoleItem } from "../products/product-display";
import { CatalogPurpose, CatalogChannel } from "./catalog-types";

// ── Recommendation ────────────────────────────────────────────────────────────

export type RecommendationUrgency = "high" | "medium" | "low";

export interface CatalogRecommendation {
  id:             string;
  title:          string;
  detail:         string;
  purpose:        CatalogPurpose;
  channel:        CatalogChannel;
  candidateCount: number;
  readyCount:     number;
  urgency:        RecommendationUrgency;
  agentLabel:     string;
  filterHint?:    string;      // category or channel hint to pre-fill builder
}

// ── Generator ─────────────────────────────────────────────────────────────────

export function generateCatalogRecommendations(
  products: ProductConsoleItem[],
): CatalogRecommendation[] {
  const recs: CatalogRecommendation[] = [];

  if (products.length === 0) return recs;

  // ── WhatsApp catalog ──────────────────────────────────────────────────────
  const whatsappReady = products.filter(
    p => p.readyDestinations.includes("whatsapp" as never) && p.primaryAssetUrl,
  );
  const whatsappCandidates = products.filter(
    p => p.partialDestinations.includes("whatsapp" as never) ||
         p.readyDestinations.includes("whatsapp" as never),
  );
  if (whatsappCandidates.length > 0) {
    recs.push({
      id:             "rec_whatsapp_sales",
      title:          whatsappReady.length > 0
        ? `${whatsappReady.length} producto${whatsappReady.length > 1 ? "s" : ""} listos para catálogo WhatsApp`
        : "Catálogo WhatsApp — productos parcialmente disponibles",
      detail:         whatsappReady.length > 0
        ? "Activa el catálogo de ventas directas para WhatsApp. Productos con nombre y disponibilidad confirmados."
        : `${whatsappCandidates.length} candidatos. Agrega disponibilidad de stock para completar.`,
      purpose:        CatalogPurpose.WHATSAPP_SALES,
      channel:        CatalogChannel.WHATSAPP,
      candidateCount: whatsappCandidates.length,
      readyCount:     whatsappReady.length,
      urgency:        whatsappReady.length >= 5 ? "high" : whatsappReady.length > 0 ? "medium" : "low",
      agentLabel:     "Mila · CRM",
    });
  }

  // ── Shopify collection ────────────────────────────────────────────────────
  const shopifyReady = products.filter(
    p => p.readyDestinations.includes("shopify" as never) && p.primaryAssetUrl,
  );
  const shopifyCandidates = products.filter(
    p => p.partialDestinations.includes("shopify" as never) ||
         p.readyDestinations.includes("shopify" as never),
  );
  if (shopifyCandidates.length > 0) {
    recs.push({
      id:             "rec_shopify_collection",
      title:          shopifyReady.length > 0
        ? `${shopifyReady.length} productos listos para colección Shopify`
        : "Colección Shopify — productos con metadata incompleta",
      detail:         shopifyReady.length > 0
        ? "Crea una colección Shopify con productos que tienen nombre, categoría, precio y asset listos."
        : "Completa precio y descripción en Biblioteca para habilitar Shopify.",
      purpose:        CatalogPurpose.SHOPIFY_COLLECTION,
      channel:        CatalogChannel.SHOPIFY,
      candidateCount: shopifyCandidates.length,
      readyCount:     shopifyReady.length,
      urgency:        shopifyReady.length >= 3 ? "high" : "medium",
      agentLabel:     "Luca · IA",
    });
  }

  // ── High-readiness campaign ───────────────────────────────────────────────
  const highReadiness = products.filter(p => p.readinessScore >= 70 && p.primaryAssetUrl);
  if (highReadiness.length >= 3) {
    const unpublished = highReadiness.filter(
      p => p.publicationSummary.every(pub => pub.publicationStatus === "unpublished"),
    );
    if (unpublished.length > 0) {
      recs.push({
        id:             "rec_campaign_high_readiness",
        title:          `${unpublished.length} productos con readiness alto sin activar`,
        detail:         "Estos productos tienen score ≥70 y assets listos. Crea una campaña para maximizar su impacto antes de que se vuelvan obsoletos.",
        purpose:        CatalogPurpose.SEASONAL_CAMPAIGN,
        channel:        CatalogChannel.SOCIAL,
        candidateCount: highReadiness.length,
        readyCount:     unpublished.length,
        urgency:        unpublished.length >= 5 ? "high" : "medium",
        agentLabel:     "Luca · IA",
      });
    }
  }

  // ── Ads catalog (products with variants) ─────────────────────────────────
  const adsReady = products.filter(
    p => p.variantCount > 0 && p.readinessScore >= 60 && p.primaryAssetUrl,
  );
  if (adsReady.length >= 2) {
    recs.push({
      id:             "rec_ads",
      title:          `${adsReady.length} productos preparados para pauta digital`,
      detail:         "Tienen variantes de formato (9:16), assets y readiness ≥60. Crea un catálogo de Ads para aprovecharlos.",
      purpose:        CatalogPurpose.ADS,
      channel:        CatalogChannel.ADS,
      candidateCount: adsReady.length,
      readyCount:     adsReady.length,
      urgency:        "medium",
      agentLabel:     "Luca · IA",
    });
  }

  // ── Category-specific catalog ─────────────────────────────────────────────
  const categoryMap = new Map<string, ProductConsoleItem[]>();
  for (const p of products) {
    if (!p.category) continue;
    const key = p.category.toLowerCase().trim();
    if (!categoryMap.has(key)) categoryMap.set(key, []);
    categoryMap.get(key)!.push(p);
  }

  // Find largest category with significant ready products
  let bestCategory: string | null = null;
  let bestCategoryCount = 0;
  for (const [cat, prods] of categoryMap) {
    const ready = prods.filter(p => p.readinessScore >= 50).length;
    if (ready > bestCategoryCount && ready >= 3) {
      bestCategory      = cat;
      bestCategoryCount = ready;
    }
  }

  if (bestCategory && bestCategoryCount >= 3) {
    const catProducts = categoryMap.get(bestCategory)!;
    recs.push({
      id:             `rec_category_${bestCategory.replace(/\s+/g, "_")}`,
      title:          `Catálogo mayorista: ${bestCategory}`,
      detail:         `${bestCategoryCount} productos de la categoría "${bestCategory}" con readiness suficiente para un catálogo mayorista o retail.`,
      purpose:        CatalogPurpose.WHOLESALE,
      channel:        CatalogChannel.CATALOG,
      candidateCount: catProducts.length,
      readyCount:     bestCategoryCount,
      urgency:        bestCategoryCount >= 8 ? "high" : "low",
      agentLabel:     "Luca · IA",
      filterHint:     bestCategory,
    });
  }

  // ── CRM segment ───────────────────────────────────────────────────────────
  const crmReady = products.filter(
    p => p.readyDestinations.includes("crm" as never),
  );
  if (crmReady.length >= 2) {
    recs.push({
      id:             "rec_crm_segment",
      title:          `${crmReady.length} productos listos para segmento CRM`,
      detail:         "Tienen argumento de venta, línea de producto y disponibilidad. Úsalos para responder clientes desde el CRM.",
      purpose:        CatalogPurpose.CRM_SEGMENT,
      channel:        CatalogChannel.CRM,
      candidateCount: crmReady.length,
      readyCount:     crmReady.length,
      urgency:        "low",
      agentLabel:     "Mila · CRM",
    });
  }

  // Sort by urgency: high > medium > low, then by readyCount desc
  const URGENCY_ORDER: Record<RecommendationUrgency, number> = { high: 3, medium: 2, low: 1 };
  return recs.sort((a, b) => {
    const uDiff = URGENCY_ORDER[b.urgency] - URGENCY_ORDER[a.urgency];
    if (uDiff !== 0) return uDiff;
    return b.readyCount - a.readyCount;
  });
}
