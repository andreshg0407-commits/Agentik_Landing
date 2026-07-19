/**
 * lib/marketing-studio/catalogs/catalog-display.ts
 *
 * MS-08 — Catalog Display Model
 *
 * Serializable display DTOs for the Catalog Builder UI.
 * Safe to pass across the Next.js Server → Client boundary.
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   CatalogDisplayItem  — full catalog view model
 *   WhatsAppContext      — Mila-ready WhatsApp catalog context
 *   ShopifyContext       — Shopify collection draft context
 *   buildCatalogDisplayItem() — assembles display item from engine outputs
 */

import type { ProductConsoleItem }   from "../products/product-display";
import type { ExcludedProduct }       from "./catalog-query-engine";
import type { CatalogReadinessResult } from "./catalog-readiness";
import type {
  CatalogPurpose,
  CatalogChannel,
  CatalogStatus,
  CatalogRule,
} from "./catalog-types";
import {
  CATALOG_PURPOSE_LABEL,
  CATALOG_CHANNEL_LABEL,
  CatalogStatus as CS,
} from "./catalog-types";

// ── WhatsApp context ──────────────────────────────────────────────────────────

export interface WhatsAppCatalogContext {
  suggestedName:      string;
  productCount:       number;
  blockedCount:       number;
  suggestedIntroText: string;
  missingAvailability: number;
}

// ── Shopify context ───────────────────────────────────────────────────────────

export interface ShopifyCollectionContext {
  collectionTitle:    string;
  productCount:       number;
  missingSync:        number;
  missingPrice:       number;
  missingAssets:      number;
  pendingPublication: number;
}

// ── Section display ───────────────────────────────────────────────────────────

export interface CatalogSectionDisplay {
  id:        string;
  title:     string;
  products:  ProductConsoleItem[];
  sortOrder: number;
}

// ── Core display item ─────────────────────────────────────────────────────────

export interface CatalogDisplayItem {
  id:            string;
  name:          string;
  purpose:       CatalogPurpose;
  purposeLabel:  string;
  channel:       CatalogChannel;
  channelLabel:  string;
  status:        CatalogStatus;
  statusLabel:   string;
  rules:         CatalogRule[];

  // Product sets
  includedProducts: ProductConsoleItem[];
  partialProducts:  ProductConsoleItem[];
  excludedProducts: ExcludedProduct[];

  // Readiness
  readiness:        CatalogReadinessResult;

  // Channel-specific contexts
  whatsappContext?: WhatsAppCatalogContext;
  shopifyContext?:  ShopifyCollectionContext;

  // Visual
  primaryImageUrl:  string | null;
  lucaHighlights:   string[];
  milaHighlights:   string[];

  // Audit
  updatedAt:        string;
}

// ── Context builders ──────────────────────────────────────────────────────────

function buildWhatsAppContext(
  name:     string,
  included: ProductConsoleItem[],
  excluded: ExcludedProduct[],
): WhatsAppCatalogContext {
  const missingAvailability = included.filter(
    p => p.milaSignals.some(s => s.key === "missing_availability"),
  ).length;

  const intro =
    included.length > 0
      ? `Hola 👋 Te comparto nuestro catálogo actualizado con ${included.length} producto${included.length > 1 ? "s" : ""} disponible${included.length > 1 ? "s" : ""}. Escríbeme para más info o pedidos al por mayor.`
      : "Catálogo en preparación — pronto disponible.";

  return {
    suggestedName:       name,
    productCount:        included.length,
    blockedCount:        excluded.length,
    suggestedIntroText:  intro,
    missingAvailability,
  };
}

function buildShopifyContext(
  name:     string,
  included: ProductConsoleItem[],
): ShopifyCollectionContext {
  const missingSync = included.filter(
    p => p.syncSummary.some(s => s.channel === "shopify" && s.status !== "synced"),
  ).length;

  const missingAssets = included.filter(p => !p.primaryAssetUrl).length;

  const missingPrice = included.filter(
    p => p.milaSignals.some(s => s.key === "missing_commercial_data"),
  ).length;

  const pendingPublication = included.filter(
    p => p.publicationSummary.find(pub => pub.channel === "shopify")?.publicationStatus !== "published",
  ).length;

  return {
    collectionTitle:    name,
    productCount:       included.length,
    missingSync,
    missingPrice,
    missingAssets,
    pendingPublication,
  };
}

// ── Highlight generators ──────────────────────────────────────────────────────

function buildLucaHighlights(
  included:  ProductConsoleItem[],
  partial:   ProductConsoleItem[],
  excluded:  ExcludedProduct[],
  channel:   CatalogChannel,
): string[] {
  const highlights: string[] = [];

  if (included.length >= 5) {
    highlights.push(`${included.length} productos cumplen todos los criterios del catálogo`);
  }
  if (partial.length > 0) {
    highlights.push(`${partial.length} productos adicionales disponibles al completar metadata`);
  }
  if (excluded.length > 0) {
    highlights.push(`${excluded.length} excluidos por bloqueos — resuélvelos en Review Center`);
  }

  const highScore = included.filter(p => p.readinessScore >= 70).length;
  if (highScore > 0) {
    highlights.push(`${highScore} con readiness ≥70 — candidatos premium para este catálogo`);
  }

  return highlights.slice(0, 3);
}

function buildMilaHighlights(
  included: ProductConsoleItem[],
  channel:  CatalogChannel,
): string[] {
  const highlights: string[] = [];

  if (channel === "whatsapp") {
    const ready = included.filter(
      p => !p.milaSignals.some(s => s.key === "missing_availability"),
    ).length;
    if (ready > 0)
      highlights.push(`${ready} productos con disponibilidad confirmada — listos para compartir`);
  }

  if (channel === "shopify") {
    const readyPub = included.filter(
      p => p.publicationSummary.find(pub => pub.channel === "shopify")?.publicationStatus !== "published",
    ).length;
    if (readyPub > 0)
      highlights.push(`${readyPub} productos aprobados pendientes de publicación en Shopify`);
  }

  const catalogOpportunity = included.filter(
    p => p.milaSignals.some(s => s.key === "catalog_opportunity"),
  ).length;
  if (catalogOpportunity > 0)
    highlights.push(`${catalogOpportunity} productos aptos para catálogos personalizados`);

  return highlights.slice(0, 2);
}

// ── Main builder ──────────────────────────────────────────────────────────────

export function buildCatalogDisplayItem(opts: {
  id:       string;
  name:     string;
  purpose:  CatalogPurpose;
  channel:  CatalogChannel;
  rules:    CatalogRule[];
  included: ProductConsoleItem[];
  partial:  ProductConsoleItem[];
  excluded: ExcludedProduct[];
  readiness: CatalogReadinessResult;
}): CatalogDisplayItem {
  const { id, name, purpose, channel, rules, included, partial, excluded, readiness } = opts;

  const status: CatalogStatus =
    included.length === 0     ? CS.NEEDS_REVIEW :
    readiness.level === "ready" ? CS.READY        :
    CS.DRAFT;

  const primaryImageUrl =
    included.find(p => p.primaryAssetUrl)?.primaryAssetUrl ??
    partial.find(p => p.primaryAssetUrl)?.primaryAssetUrl ??
    null;

  const whatsappContext = channel === "whatsapp"
    ? buildWhatsAppContext(name, included, excluded)
    : undefined;

  const shopifyContext = channel === "shopify"
    ? buildShopifyContext(name, included)
    : undefined;

  return {
    id,
    name,
    purpose,
    purposeLabel: CATALOG_PURPOSE_LABEL[purpose],
    channel,
    channelLabel: CATALOG_CHANNEL_LABEL[channel],
    status,
    statusLabel:  status === CS.READY ? "Listo" : status === CS.DRAFT ? "Borrador" : "Requiere revisión",
    rules,
    includedProducts: included,
    partialProducts:  partial,
    excludedProducts: excluded,
    readiness,
    whatsappContext,
    shopifyContext,
    primaryImageUrl,
    lucaHighlights:  buildLucaHighlights(included, partial, excluded, channel),
    milaHighlights:  buildMilaHighlights(included, channel),
    updatedAt:       new Date().toISOString(),
  };
}
