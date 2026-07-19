/**
 * lib/marketing-studio/commerce/collection-engine.ts
 *
 * MS-09C — Collection Intelligence Engine
 *
 * Groups products into intelligent Shopify-ready collections.
 * Pure computation — no Prisma, no fetch, no side effects.
 */

import type { ProductConsoleItem } from "../products/product-display";

// ── Collection types ──────────────────────────────────────────────────────────

export type CollectionType =
  | "category"
  | "performance"
  | "campaign"
  | "seasonal"
  | "dynamic"
  | "readiness";

export interface CollectionDisplay {
  id:              string;
  title:           string;
  handle:          string;
  type:            CollectionType;
  description:     string;
  productCount:    number;
  readyCount:      number;
  blockedCount:    number;
  topProducts:     ProductConsoleItem[];   // up to 5
  suggestedTags:   string[];
  shopifyStatus:   "ready" | "partial" | "blocked";
  lucaNote?:       string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toHandle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function shopifyStatus(readyCount: number, total: number): "ready" | "partial" | "blocked" {
  if (total === 0)             return "blocked";
  if (readyCount === total)    return "ready";
  if (readyCount >= total / 2) return "partial";
  return "blocked";
}

// ── Main builder ──────────────────────────────────────────────────────────────

export function buildCollectionDisplay(products: ProductConsoleItem[]): CollectionDisplay[] {
  if (products.length === 0) return [];

  const collections: CollectionDisplay[] = [];
  const shopifyEligible = products.filter(p =>
    p.readyDestinations.includes("shopify" as never) ||
    p.partialDestinations.includes("shopify" as never),
  );

  // ── 1. Category collections ──────────────────────────────────────────────
  const categoryMap = new Map<string, ProductConsoleItem[]>();
  for (const p of shopifyEligible) {
    if (!p.category) continue;
    const key = p.category.trim();
    if (!categoryMap.has(key)) categoryMap.set(key, []);
    categoryMap.get(key)!.push(p);
  }

  for (const [category, prods] of categoryMap) {
    if (prods.length < 2) continue;
    const ready   = prods.filter(p => p.readyDestinations.includes("shopify" as never)).length;
    const blocked = prods.filter(p => p.blockedDestinations.includes("shopify" as never)).length;
    collections.push({
      id:            `cat_${toHandle(category)}`,
      title:         category,
      handle:        toHandle(category),
      type:          "category",
      description:   `Colección de categoría: ${category}`,
      productCount:  prods.length,
      readyCount:    ready,
      blockedCount:  blocked,
      topProducts:   prods.slice(0, 5),
      suggestedTags: [category.toLowerCase().replace(/\s+/g, "-"), "category"],
      shopifyStatus: shopifyStatus(ready, prods.length),
    });
  }

  // ── 2. High performers (readiness ≥ 70) ─────────────────────────────────
  const highPerformers = shopifyEligible.filter(p => p.readinessScore >= 70);
  if (highPerformers.length >= 2) {
    collections.push({
      id:           "collection_high_performers",
      title:        "Destacados",
      handle:       "destacados",
      type:         "performance",
      description:  "Productos con readiness ≥70 — candidatos premium para posición destacada.",
      productCount:  highPerformers.length,
      readyCount:    highPerformers.filter(p => p.readyDestinations.includes("shopify" as never)).length,
      blockedCount:  0,
      topProducts:   highPerformers.slice(0, 5),
      suggestedTags: ["featured", "high-readiness", "top-products"],
      shopifyStatus: "ready",
      lucaNote:      `${highPerformers.length} productos con alto readiness — activar en posición destacada.`,
    });
  }

  // ── 3. Ready to publish (publishable, not yet published) ─────────────────
  const readyUnpublished = shopifyEligible.filter(p =>
    p.readyDestinations.includes("shopify" as never) &&
    p.publicationSummary.find(pub => pub.channel === "shopify")?.publicationStatus !== "published",
  );
  if (readyUnpublished.length >= 2) {
    collections.push({
      id:           "collection_ready_to_launch",
      title:        "Listos para lanzar",
      handle:       "listos-para-lanzar",
      type:         "dynamic",
      description:  "Productos con readiness completo pendientes de primera publicación.",
      productCount:  readyUnpublished.length,
      readyCount:    readyUnpublished.length,
      blockedCount:  0,
      topProducts:   readyUnpublished.slice(0, 5),
      suggestedTags: ["new-arrivals", "ready-to-publish"],
      shopifyStatus: "ready",
      lucaNote:      `${readyUnpublished.length} productos listos esperando publicación — máxima oportunidad comercial.`,
    });
  }

  // ── 4. With variants (Ads + mobile ready) ────────────────────────────────
  const withVariants = shopifyEligible.filter(p => p.variantCount > 0);
  if (withVariants.length >= 2) {
    collections.push({
      id:           "collection_multi_variant",
      title:        "Multi-variante",
      handle:       "multi-variante",
      type:         "dynamic",
      description:  "Productos con variantes de formato disponibles para Ads y redes sociales.",
      productCount:  withVariants.length,
      readyCount:    withVariants.filter(p => p.readyDestinations.includes("shopify" as never)).length,
      blockedCount:  0,
      topProducts:   withVariants.slice(0, 5),
      suggestedTags: ["variants", "ads-ready", "social-ready"],
      shopifyStatus: shopifyStatus(
        withVariants.filter(p => p.readyDestinations.includes("shopify" as never)).length,
        withVariants.length,
      ),
    });
  }

  // ── 5. Campaign — high readiness, not yet in any channel ─────────────────
  const campaignCandidates = products.filter(
    p => p.readinessScore >= 50 &&
         p.primaryAssetUrl &&
         p.publicationSummary.every(pub => pub.publicationStatus === "unpublished"),
  );
  if (campaignCandidates.length >= 2) {
    collections.push({
      id:           "collection_campaign_candidates",
      title:        "Candidatos campaña",
      handle:       "candidatos-campana",
      type:         "campaign",
      description:  "Productos listos para activar en campaña — readiness ≥50, sin publicar todavía.",
      productCount:  campaignCandidates.length,
      readyCount:    campaignCandidates.filter(p => p.readyDestinations.includes("shopify" as never)).length,
      blockedCount:  0,
      topProducts:   campaignCandidates.slice(0, 5),
      suggestedTags: ["campaign", "unpublished", "high-value"],
      shopifyStatus: shopifyStatus(
        campaignCandidates.filter(p => p.readyDestinations.includes("shopify" as never)).length,
        campaignCandidates.length,
      ),
      lucaNote: "Activar estos productos en campaña antes de que la ventana de oportunidad cierre.",
    });
  }

  // Sort: ready first, then by productCount desc
  return collections.sort((a, b) => {
    const statusOrder = { ready: 0, partial: 1, blocked: 2 };
    const sDiff = statusOrder[a.shopifyStatus] - statusOrder[b.shopifyStatus];
    if (sDiff !== 0) return sDiff;
    return b.productCount - a.productCount;
  });
}
