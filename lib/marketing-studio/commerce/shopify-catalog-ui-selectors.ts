/**
 * lib/marketing-studio/commerce/shopify-catalog-ui-selectors.ts
 *
 * SHOPIFY-CATALOG-BULK-FILTERS-02B — Selectores de Dominio para Catálogo Shopify
 *
 * Funciones puras, sin Prisma, sin fetch, sin acceso a Shopify.
 * Reciben un PublicationQueueItem y devuelven verdad derivada del dominio.
 *
 * ── COPILOT-FIRST ─────────────────────────────────────────────────────────────
 *
 * Estas funciones son la fuente de verdad compartida para:
 *   - UI actual (publication-queue.tsx)
 *   - Endpoints de API (publish-ready, update-modified, activate-drafts)
 *   - Acciones de Copilot (shopify.findPublishableProducts, shopify.findBlockedProducts…)
 *   - Reportes y auditorías futuras
 *   - Tests unitarios de dominio
 *
 * Regla: si Copilot necesita decidir qué productos están modificados, bloqueados
 * o requieren enriquecimiento, DEBE usar estas mismas funciones para que las
 * respuestas sean idénticas a lo que muestra la UI.
 *
 * ── FUENTE DE VERDAD OFICIAL ──────────────────────────────────────────────────
 *
 * Orden de prioridad para derivar bloqueos:
 *   1. publicationIssues (motor de publicación — fuente primaria)
 *   2. blockers de payload (enriquecimiento — complementario, deduplicado)
 *
 * No reconstruir bloqueos fuera de este archivo.
 */

import { C } from "@/lib/ui/tokens";
import type { PublicationQueueItem } from "./publication-engine";
import { PUBLICATION_STATUS }        from "./commerce-types";

// ── Tipos exportados ──────────────────────────────────────────────────────────

export type ShopifyCatalogFilterId =
  | "all"
  | "ready"
  | "need_enrichment"
  | "published"
  | "modified"
  | "blocking";

export interface ShopifyCatalogDisplayBlocker {
  label:         string;
  canCopilotFix: boolean;
}

export interface ShopifyCatalogStatusChip {
  label:  string;
  dot:    string;
  bg:     string;
  border: string;
  text:   string;
}

export interface ShopifyCatalogFilters {
  filter:    ShopifyCatalogFilterId;
  category?: string | null;
  search?:   string;
}

// ── Códigos que Copilot puede resolver mediante generación de contenido ────────

/** Codes resolvable by Copilot content-generation actions (no human needed). */
const COPILOT_FIXABLE = new Set([
  "missing_description",
  "missing_seo_title",
  "missing_seo_description",
  "missing_tags",
  "low_readiness",
  // Future: "missing_alt_text", "missing_keywords", "missing_shopify_title"
]);

// ── needsShopifyCatalogEnrichment ─────────────────────────────────────────────

/**
 * Returns true if the product has enrichable content gaps (SEO, description,
 * tags) that Copilot can fill WITHOUT any hard blocking issue present.
 *
 * Hard blockers (disqualify from enrichment filter):
 *   - No primary image
 *   - No variants
 *   - No price
 *
 * Enrichable gaps (qualify for enrichment filter):
 *   - Missing commercial description (bodyHtml)
 *   - Missing SEO title
 *   - Missing SEO description
 *   - Missing tags / keywords
 *   (Future: missing alt text, missing Shopify title)
 */
export function needsShopifyCatalogEnrichment(item: PublicationQueueItem): boolean {
  const p = item.shopifyPayload;

  // Hard blockers — Copilot cannot solve these
  if (!item.primaryAssetUrl) return false;
  if (item.variantCount === 0) return false;
  const noPrice =
    p.variants.length === 0 ||
    !p.variants[0]?.price ||
    p.variants[0].price === "0.00";
  if (noPrice) return false;

  // Has at least one enrichable gap
  return (
    !p.bodyHtml?.trim() ||
    !p.seo.title        ||
    !p.seo.description  ||
    p.tags.length === 0
  );
}

// ── isShopifyCatalogItemModified ──────────────────────────────────────────────

/**
 * Returns true if the product's Agentik content changed after its last
 * successful Shopify sync.
 *
 * ── Implementation note ───────────────────────────────────────────────────────
 * Current heuristic: updatedAt > lastSyncAt (FALLBACK).
 * This is intentionally conservative — updating an unchanged product is safe
 * (idempotent) and preferable to missing a real content change.
 *
 * TODO: replace with computeShopifyContentFingerprint comparison when the
 * fingerprint field is persisted alongside ProductPublicationState.
 * See lib/marketing-studio/commerce/shopify-catalog-service.ts →
 * computeShopifyContentFingerprint for the planned upgrade path.
 */
export function isShopifyCatalogItemModified(item: PublicationQueueItem): boolean {
  return (
    item.publicationStatus === PUBLICATION_STATUS.PUBLISHED &&
    !!item.externalId &&
    !!item.lastSyncAt &&
    new Date(item.updatedAt) > new Date(item.lastSyncAt)
  );
}

// ── getShopifyCatalogDisplayBlockers ──────────────────────────────────────────

/**
 * Derives the full list of human-readable blockers for a product, merging:
 *   1. publicationIssues (engine-derived, primary source)
 *   2. Payload-derived enrichment gaps (complementary, deduped by code/label)
 *
 * canCopilotFix=true  → Copilot can resolve via content generation
 * canCopilotFix=false → requires human intervention (price, image, variants…)
 *
 * UI renders: ✓ label · Copilot podrá completarlo
 *             ✕ label
 */
export function getShopifyCatalogDisplayBlockers(
  item: PublicationQueueItem,
): ShopifyCatalogDisplayBlocker[] {
  const seen = new Set<string>();
  const out: ShopifyCatalogDisplayBlocker[] = [];

  // 1. Engine-derived publicationIssues (primary source — already validated)
  for (const issue of item.publicationIssues) {
    seen.add(issue.code);
    out.push({
      label:         issue.label,
      canCopilotFix: COPILOT_FIXABLE.has(issue.code),
    });
  }

  // 2. Payload-derived gaps (complementary — deduped by code)
  const p = item.shopifyPayload;

  if (!seen.has("missing_hero_asset") && !item.primaryAssetUrl)
    out.push({ label: "Sin imagen principal", canCopilotFix: false });

  const noPrice =
    p.variants.length === 0 ||
    !p.variants[0]?.price   ||
    p.variants[0].price === "0.00";
  if (!seen.has("missing_price") && noPrice)
    out.push({ label: "Sin precio", canCopilotFix: false });

  if (!seen.has("missing_variants") && item.variantCount === 0)
    out.push({ label: "Sin variantes", canCopilotFix: false });

  if (!seen.has("missing_description") && !p.bodyHtml?.trim())
    out.push({ label: "Sin descripción comercial", canCopilotFix: true });

  if (!seen.has("missing_seo_title") && !p.seo.title)
    out.push({ label: "Sin título SEO", canCopilotFix: true });

  if (!seen.has("missing_seo_description") && !p.seo.description)
    out.push({ label: "Sin descripción SEO", canCopilotFix: true });

  if (!seen.has("missing_tags") && p.tags.length === 0)
    out.push({ label: "Sin etiquetas de búsqueda", canCopilotFix: true });

  return out;
}

// ── getShopifyCatalogStatusChips ──────────────────────────────────────────────

/**
 * Derives 1–2 semantic status chips for a product card.
 *
 * Priority order:
 *   Published  → ⚪ Publicado  [+ 🔵 Modificado if drifted]
 *   Blocked    → 🔴 Bloqueado
 *   Enrichable → 🟡 Requiere completar
 *   Ready      → 🟢 Listo
 *
 * Max 2 chips per product to avoid visual noise.
 */
export function getShopifyCatalogStatusChips(
  item: PublicationQueueItem,
): ShopifyCatalogStatusChip[] {
  const chips: ShopifyCatalogStatusChip[] = [];

  if (item.publicationStatus === PUBLICATION_STATUS.PUBLISHED) {
    chips.push({
      label: "Publicado", dot: C.green,
      bg: C.greenLight, border: C.greenBorder, text: C.green,
    });
    if (isShopifyCatalogItemModified(item)) {
      chips.push({
        label: "Modificado", dot: C.blueDark,
        bg: C.blueLight, border: C.blueBorder, text: C.blueDark,
      });
    }
    return chips.slice(0, 2);
  }

  if (!item.isPublishable) {
    chips.push({
      label: "Bloqueado", dot: C.red,
      bg: C.redLight, border: C.redBorder, text: C.red,
    });
    return chips;
  }

  if (needsShopifyCatalogEnrichment(item)) {
    chips.push({
      label: "Requiere completar", dot: C.amber,
      bg: C.amberLight, border: C.amberBorder, text: C.amber,
    });
  } else {
    chips.push({
      label: "Listo", dot: C.green,
      bg: C.greenLight, border: C.greenBorder, text: C.green,
    });
  }

  return chips;
}

// ── applyShopifyCatalogFilters ────────────────────────────────────────────────

/**
 * Applies the full filter pipeline to a queue of PublicationQueueItems.
 *
 * Pipeline: category → semantic filter → text search
 *
 * This is the single source of truth for what "Listos para publicar",
 * "Requieren completar información", "Modificados", etc. means.
 * Copilot actions and API endpoints that need to replicate UI filtering
 * MUST call this function.
 */
export function applyShopifyCatalogFilters(
  items:   PublicationQueueItem[],
  filters: ShopifyCatalogFilters,
): PublicationQueueItem[] {
  let result = items;

  // Stage 1: Category
  if (filters.category) {
    const cat = filters.category.toLowerCase();
    result = result.filter(i => i.category?.toLowerCase() === cat);
  }

  // Stage 2: Semantic filter
  switch (filters.filter) {
    case "ready":
      result = result.filter(
        i => i.isPublishable && i.publicationStatus !== PUBLICATION_STATUS.PUBLISHED,
      );
      break;
    case "published":
      result = result.filter(i => i.publicationStatus === PUBLICATION_STATUS.PUBLISHED);
      break;
    case "blocking":
      result = result.filter(i => !i.isPublishable);
      break;
    case "need_enrichment":
      result = result.filter(i => i.isPublishable && needsShopifyCatalogEnrichment(i));
      break;
    case "modified":
      result = result.filter(i => isShopifyCatalogItemModified(i));
      break;
    default:
      break;
  }

  // Stage 3: Text search (name, SKU, category)
  if (filters.search?.trim()) {
    const q = filters.search.toLowerCase();
    result = result.filter(i =>
      i.productName.toLowerCase().includes(q) ||
      (i.sku      ?? "").toLowerCase().includes(q) ||
      (i.category ?? "").toLowerCase().includes(q),
    );
  }

  return result;
}

// ── getShopifyCatalogFilterPredicate ──────────────────────────────────────────

/**
 * Returns a predicate function for single-item filtering.
 * Useful for Copilot actions that need to evaluate one product at a time
 * without building a full queue.
 *
 * Example:
 *   const isReady = getShopifyCatalogFilterPredicate("ready");
 *   products.filter(isReady)
 */
export function getShopifyCatalogFilterPredicate(
  filter:    ShopifyCatalogFilterId,
  category?: string | null,
  search?:   string,
): (item: PublicationQueueItem) => boolean {
  return (item) =>
    applyShopifyCatalogFilters([item], { filter, category, search }).length > 0;
}
