/**
 * lib/marketing-studio/products/product-display.ts
 *
 * MS-06 — Product Console Display Model
 *
 * Converts a persisted ProductEntity into a flat, serializable
 * view model safe for Server → Client boundary crossing.
 *
 * ── RULES ─────────────────────────────────────────────────────────────────────
 *   - All dates are ISO strings (no Date objects on the client)
 *   - No Prisma types — pure domain objects
 *   - Luca/Mila signals computed here from product state
 *   - No business logic beyond display derivation
 */

import type {
  ProductEntity,
  ProductSyncState,
  ProductPublicationState,
  ProductActivityEvent,
} from "./product-types";
import type {
  SyncChannel,
  SyncStatus,
  PublicationStatus,
  ReadinessLevel,
  ProductStatus,
  CommercialStatus,
} from "./domain/product-enums";
import { ReadinessLevel as RL } from "./domain/product-enums";

// ── Signal types ───────────────────────────────────────────────────────────────

export interface LucaSignal {
  key:     string;
  label:   string;
  detail:  string;
  level:   "info" | "warning" | "opportunity";
}

export interface MilaSignal {
  key:     string;
  label:   string;
  detail:  string;
  level:   "info" | "warning" | "opportunity";
}

// ── Sync / Publication summaries ───────────────────────────────────────────────

export interface SyncStateSummary {
  channel:    SyncChannel;
  status:     SyncStatus;
  externalId: string | null;
  lastSyncAt: string | null;   // ISO string
}

export interface PublicationStateSummary {
  channel:           SyncChannel;
  publicationStatus: PublicationStatus;
  publishedAt:       string | null;   // ISO string
  publicationUrl:    string | null;
}

export interface ActivitySummary {
  lastEventType: string;
  lastEventAt:   string;   // ISO string
  totalEvents:   number;
}

// ── Core display model ─────────────────────────────────────────────────────────

/**
 * ProductConsoleItem — the flat, serializable DTO for the Biblioteca product grid.
 * Built server-side by `buildProductConsoleItem()`, passed to client via props.
 * All dates are ISO strings. No circular references.
 */
export interface ProductConsoleItem {
  // ── Identity ──
  productId:        string;
  organizationId:   string;
  name:             string;
  sku:              string | null;
  category:         string | null;
  status:           ProductStatus;
  commercialStatus: CommercialStatus;

  // ── Commercial fields ──
  price:       number | null;
  productLine: string | null;

  // ── Assets ──
  primaryAssetUrl:  string | null;
  assetCount:       number;
  variantCount:     number;
  assetRoleGroups:  { role: string; count: number }[];
  assetDetails:     { id: string; assetUrl: string | null; role: string; createdAt: string }[];

  // ── Persisted readiness snapshot ──
  readinessLevel:      ReadinessLevel;
  readinessScore:      number;
  readyDestinations:   SyncChannel[];
  partialDestinations: SyncChannel[];
  blockedDestinations: SyncChannel[];

  // ── Sync + publication state ──
  syncSummary:        SyncStateSummary[];
  publicationSummary: PublicationStateSummary[];

  // ── Activity ──
  activitySummary: ActivitySummary | null;

  // ── Operational intelligence signals ──
  lucaSignals: LucaSignal[];
  milaSignals: MilaSignal[];

  // ── Audit ──
  approvedAt: string | null;   // ISO string
  createdAt:  string;          // ISO string
  updatedAt:  string;          // ISO string
}

// ── Signal generators ──────────────────────────────────────────────────────────

export function generateLucaSignals(
  product: ProductEntity,
  primaryAssetUrl: string | null,
): LucaSignal[] {
  const signals: LucaSignal[] = [];

  if (product.variants.length === 0) {
    signals.push({
      key:    "missing_variants",
      label:  "Sin variantes",
      detail: "Este producto no tiene variantes. Las campañas de Ads requieren al menos 2 formatos.",
      level:  "warning",
    });
  }

  if (product.readyDestinations.includes("ads" as SyncChannel)) {
    signals.push({
      key:    "ready_for_ads",
      label:  "Listo para Ads",
      detail: "El producto cumple los requisitos para campañas publicitarias.",
      level:  "opportunity",
    });
  }

  if (
    product.readinessScore >= 70 &&
    product.publicationStates.every(p => p.publicationStatus === "unpublished")
  ) {
    signals.push({
      key:    "high_readiness_unpublished",
      label:  "Alto readiness sin publicar",
      detail: `Score ${product.readinessScore}/100 — ningún canal publicado todavía. Oportunidad de activación inmediata.`,
      level:  "opportunity",
    });
  }

  if (product.readinessScore < 30) {
    signals.push({
      key:    "blocked_by_metadata",
      label:  "Bloqueado por metadata",
      detail: "El producto no tiene suficiente información para activar canales de distribución.",
      level:  "warning",
    });
  }

  if (product.assetLinks.length >= 3) {
    signals.push({
      key:    "asset_reuse_opportunity",
      label:  "Reutilización de assets",
      detail: `${product.assetLinks.length} assets vinculados. Pueden distribuirse en múltiples canales.`,
      level:  "info",
    });
  }

  if (!primaryAssetUrl) {
    signals.push({
      key:    "missing_primary_asset",
      label:  "Sin imagen principal",
      detail: "El producto no tiene un asset visual principal vinculado.",
      level:  "warning",
    });
  }

  return signals;
}

export function generateMilaSignals(
  product: ProductEntity,
  primaryAssetUrl: string | null,
): MilaSignal[] {
  const signals: MilaSignal[] = [];

  if (product.readyDestinations.includes("whatsapp" as SyncChannel)) {
    signals.push({
      key:    "ready_for_whatsapp",
      label:  "Listo para catálogo WhatsApp",
      detail: "El producto tiene nombre y disponibilidad. Puede activarse en el catálogo de ventas.",
      level:  "opportunity",
    });
  }

  if (!product.sku || product.price === null) {
    signals.push({
      key:    "missing_commercial_data",
      label:  "Faltan datos comerciales",
      detail: !product.sku && product.price === null
        ? "Sin SKU ni precio — no puede procesarse en CRM ni Shopify."
        : !product.sku
          ? "Sin SKU — identificación incompleta para CRM."
          : "Sin precio — no puede activarse en canales de venta.",
      level:  "warning",
    });
  }

  if (!primaryAssetUrl) {
    signals.push({
      key:    "missing_visual_for_crm",
      label:  "Sin visual para atención",
      detail: "El equipo de ventas no puede compartir una imagen del producto con clientes.",
      level:  "warning",
    });
  }

  if (product.readyDestinations.includes("catalog" as SyncChannel)) {
    signals.push({
      key:    "catalog_opportunity",
      label:  "Apto para catálogo personalizado",
      detail: "El producto tiene categoría y nombre. Puede incluirse en catálogos personalizados.",
      level:  "opportunity",
    });
  }

  if (!product.availability) {
    signals.push({
      key:    "missing_availability",
      label:  "Sin disponibilidad",
      detail: "El campo de disponibilidad es requerido para WhatsApp y CRM.",
      level:  "info",
    });
  }

  return signals;
}

// ── Builder ────────────────────────────────────────────────────────────────────

/**
 * buildProductConsoleItem — converts a fully-loaded ProductEntity
 * (with all relations) into a serializable ProductConsoleItem.
 *
 * `primaryAssetUrl` must be resolved externally by joining through GeneratedAsset.
 */
export function buildProductConsoleItem(
  product: ProductEntity,
  primaryAssetUrl: string | null,
  activityEvents: ProductActivityEvent[],
  assetDetails: { id: string; assetUrl: string | null; role: string; createdAt: string }[] = [],
): ProductConsoleItem {
  const syncSummary: SyncStateSummary[] = product.syncStates.map(s => ({
    channel:    s.channel,
    status:     s.status,
    externalId: s.externalId,
    lastSyncAt: s.lastSyncAt?.toISOString() ?? null,
  }));

  const publicationSummary: PublicationStateSummary[] = product.publicationStates.map(p => ({
    channel:           p.channel,
    publicationStatus: p.publicationStatus,
    publishedAt:       p.publishedAt?.toISOString() ?? null,
    publicationUrl:    p.publicationUrl,
  }));

  const activitySummary: ActivitySummary | null =
    activityEvents.length > 0
      ? {
          lastEventType: activityEvents[0].eventType,
          lastEventAt:   activityEvents[0].occurredAt.toISOString(),
          totalEvents:   activityEvents.length,
        }
      : null;

  const lucaSignals = generateLucaSignals(product, primaryAssetUrl);
  const milaSignals = generateMilaSignals(product, primaryAssetUrl);

  const roleMap = new Map<string, number>();
  for (const link of product.assetLinks) {
    roleMap.set(link.role, (roleMap.get(link.role) ?? 0) + 1);
  }
  const assetRoleGroups = Array.from(roleMap.entries())
    .map(([role, count]) => ({ role, count }));

  return {
    productId:        product.id,
    organizationId:   product.organizationId,
    name:             product.name,
    sku:              product.sku,
    category:         product.category,
    status:           product.status,
    commercialStatus: product.commercialStatus,
    price:            product.price,
    productLine:      product.productLine,
    primaryAssetUrl,
    assetCount:       product.assetLinks.length,
    variantCount:     product.variants.length,
    assetRoleGroups,
    assetDetails,
    readinessLevel:   product.readinessLevel,
    readinessScore:   product.readinessScore,
    readyDestinations:   product.readyDestinations,
    partialDestinations: product.partialDestinations,
    blockedDestinations: product.blockedDestinations,
    syncSummary,
    publicationSummary,
    activitySummary,
    lucaSignals,
    milaSignals,
    approvedAt: product.approvedAt?.toISOString() ?? null,
    createdAt:  product.createdAt.toISOString(),
    updatedAt:  product.updatedAt.toISOString(),
  };
}

// ── Preset filter functions ────────────────────────────────────────────────────

/**
 * filterProductsByPreset — client-side preset filtering for ProductConsoleItem[].
 */
export function filterProductsByPreset(
  products: ProductConsoleItem[],
  presetId: string,
): ProductConsoleItem[] {
  switch (presetId) {
    case "shopify_ready":
      return products.filter(p => p.readyDestinations.includes("shopify" as SyncChannel));
    case "whatsapp_ready":
      return products.filter(p => p.readyDestinations.includes("whatsapp" as SyncChannel));
    case "catalog_ready":
      return products.filter(p => p.readyDestinations.includes("catalog" as SyncChannel));
    case "pending":
      return products.filter(p => p.status === "pending");
    case "partial_readiness":
      return products.filter(p => p.readinessLevel === RL.PARTIAL);
    case "blocked":
      return products.filter(p => p.readinessLevel === RL.NOT_READY || p.readinessScore < 30);
    case "high_potential":
      return products.filter(p => p.lucaSignals.some(s => s.level === "opportunity"));
    case "unpublished":
      return products.filter(p =>
        p.publicationSummary.every(pub => pub.publicationStatus === "unpublished")
      );
    case "sync_failed":
      return products.filter(p =>
        p.syncSummary.some(s => s.status === "failed")
      );
    default:
      return products;
  }
}

/**
 * filterProductsByCategory — filters by derived category key.
 *
 * Values:
 *   "all"           → no filter
 *   "uncategorized" → products with null/empty category
 *   anything else   → exact match on ProductEntity.category
 */
export function filterProductsByCategory(
  products:       ProductConsoleItem[],
  activeCategory: string,
): ProductConsoleItem[] {
  if (activeCategory === "all") return products;
  if (activeCategory === "uncategorized") return products.filter(p => !p.category);
  return products.filter(p => p.category === activeCategory);
}

/**
 * deriveCategoryList — builds the sorted list of real category strings
 * present in the product set. Pure derivation — no DB query.
 *
 * Returns unique, non-empty category strings sorted alphabetically (es locale).
 */
export function deriveCategoryList(products: ProductConsoleItem[]): string[] {
  const seen = new Set<string>();
  for (const p of products) {
    if (p.category) seen.add(p.category);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, "es"));
}

/**
 * filterProductsBySearch — text search on name, SKU, category.
 */
export function filterProductsBySearch(
  products: ProductConsoleItem[],
  query:    string,
): ProductConsoleItem[] {
  const q = query.toLowerCase().trim();
  if (!q) return products;
  return products.filter(p =>
    p.name.toLowerCase().includes(q) ||
    (p.sku?.toLowerCase().includes(q) ?? false) ||
    (p.category?.toLowerCase().includes(q) ?? false)
  );
}
