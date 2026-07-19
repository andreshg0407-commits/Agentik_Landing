/**
 * lib/marketing-studio/commerce/shopify-experiences-service.ts
 *
 * SHOPIFY-EXPERIENCES-ARCHITECTURE-01 — Experiences Service
 *
 * SERVER ONLY — never import from client components.
 *
 * Aggregates data for the "Experiencias Shopify" workspace:
 *   - Products crossed with Biblioteca resources (landings tab)
 *   - Banner slot state (banners tab)
 *   - Summary (resumen tab)
 *   - Drafts (borradores tab)
 *
 * DATA SOURCES:
 *   - Shopify products: from ProductSnapshot + listProductConsoleItems
 *   - Biblioteca assets: from fotoEstudioAsset (type filtering)
 *   - Drafts: from AgentExecution (operation=SHOPIFY_EXPERIENCE_DRAFT)
 *
 * PERSISTENCE STATUS:
 *   Landing / Banner Prisma models not yet created.
 *   Banner slots return structured empty state per slot.
 *   Landing rows are derived from product catalog only.
 *   When ShopifyExperienceDraft model is added:
 *     1. Query and filter by organizationId + operation.
 *     2. Replace stub in getExperienceDrafts().
 */

import "server-only";

import { prisma }                         from "@/lib/prisma";
import { listProductConsoleItems }        from "@/lib/marketing-studio/products/product-query-service";
import { EXPERIENCE_TEMPLATES }           from "./shopify-experiences-templates";
import type {
  ExperiencesSummary,
  ExperiencesWorkspaceData,
  LandingProductRow,
  BannerSlotRow,
  BannerPlacement,
  ExperienceDraft,
  BibliotecaReadiness,
  ExperienceAvailability,
  ExperienceReadiness,
  ExperienceOpportunities,
  ExperienceCopilotSignal,
  ReadinessReason,
} from "./shopify-experiences-types";
import { BANNER_PLACEMENT_LABEL }         from "./shopify-experiences-types";

// ── Constants ─────────────────────────────────────────────────────────────────

const BANNER_SLOTS: BannerPlacement[] = [
  "home",
  "home_secundario",
  "coleccion",
  "categoria",
  "promocion",
  "temporada",
  "footer",
];

// ── DB helpers ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const assetDb = () => (prisma as any).fotoEstudioAsset;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execDb  = () => (prisma as any).agentExecution;

// ── Biblioteca readiness per SKU ──────────────────────────────────────────────

/**
 * Loads all approved Biblioteca assets for a list of SKUs,
 * then groups them by referenceSku → readiness summary.
 */
async function loadBibliotecaReadinessBySku(
  organizationId: string,
  skus:           string[],
): Promise<Map<string, BibliotecaReadiness>> {
  if (skus.length === 0) return new Map();

  const rows = await assetDb().findMany({
    where: {
      organizationId,
      OR: skus.map((sku: string) => ({
        metadataJson: { path: ["referenceSku"], equals: sku },
      })),
    },
    select: {
      id:          true,
      assetType:   true,
      metadataJson: true,
    },
  });

  const map = new Map<string, BibliotecaReadiness>();

  for (const sku of skus) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matching = rows.filter((r: any) => {
      const meta = (r.metadataJson ?? {}) as Record<string, unknown>;
      return meta.referenceSku === sku;
    });

    const fotos   = matching.filter((r: { assetType: string }) => r.assetType === "foto" || r.assetType === "image").length;
    const videos  = matching.filter((r: { assetType: string }) => r.assetType === "video").length;
    const banners = matching.filter((r: { assetType: string }) => r.assetType === "banner").length;

    map.set(sku, {
      totalAssets:          matching.length,
      fotosAprobadas:       fotos,
      videosAprobados:      videos,
      bannersAprobados:     banners,
      tieneImagenPrincipal: fotos > 0,
    });
  }

  return map;
}

// ── getLandingProducts ─────────────────────────────────────────────────────────

/**
 * Returns the "Landings de producto" table.
 * Crosses Shopify products from the catalog with Biblioteca readiness.
 *
 * V1: tieneLanding = false for all (no landing persistence model yet).
 * When ShopifyExperienceDraft is added: join on referenceSku.
 */
export async function getLandingProducts(
  organizationId: string,
): Promise<LandingProductRow[]> {
  const products = await listProductConsoleItems(organizationId);

  const skus = products
    .map(p => p.sku)
    .filter((s): s is string => !!s);

  const readiness = await loadBibliotecaReadinessBySku(organizationId, skus);

  return products.map(p => {
    const bib: BibliotecaReadiness = (p.sku && readiness.get(p.sku)) || {
      totalAssets:          0,
      fotosAprobadas:       0,
      videosAprobados:      0,
      bannersAprobados:     0,
      tieneImagenPrincipal: false,
    };

    // Map internal ProductStatus → shopify-facing display status
    const shopifyStatus: LandingProductRow["shopifyStatus"] =
      p.status === "approved" ? "active"   :
      p.status === "archived" ? "archived" :
      p.status === "pending"  ? "draft"    :
      p.status === "rejected" ? "draft"    :
      "unknown";

    return {
      productId:     p.productId,
      nombre:        p.name,
      sku:           p.sku,
      coleccion:     p.category ?? null,
      shopifyStatus,
      shopifyUrl:    null,
      precio:        p.price != null ? `$${Number(p.price).toLocaleString("es-CO")}` : null,
      biblioteca:    bib,
      tieneLanding:  false,
      landingStatus: null,
      landingId:     null,
    } satisfies LandingProductRow;
  });
}

// ── getBannerSlots ─────────────────────────────────────────────────────────────

/**
 * Returns the "Banners de tienda" cards.
 *
 * V1: All slots return empty state (no banner persistence model yet).
 * When ShopifyBanner model is added: join on placement + organizationId.
 */
export async function getBannerSlots(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _organizationId: string,
): Promise<BannerSlotRow[]> {
  return BANNER_SLOTS.map(slotId => ({
    slotId,
    ubicacion:    BANNER_PLACEMENT_LABEL[slotId],
    tieneActivo:  false,
    bannerNombre: null,
    assetId:      null,
    thumbnailUrl: null,
    status:       null,
    programadoAt: null,
    publicadoAt:  null,
    borradoId:    null,
  } satisfies BannerSlotRow));
}

// ── getExperienceDrafts ────────────────────────────────────────────────────────

/**
 * Returns landing and banner drafts from AgentExecution.
 * Queries both SHOPIFY_EXPERIENCE_DRAFT (legacy) and SHOPIFY_LANDING_DRAFT
 * (Sprint 02+) operations.
 */
export async function getExperienceDrafts(
  organizationId: string,
): Promise<ExperienceDraft[]> {
  try {
    const rows = await execDb().findMany({
      where: {
        tenantId:  organizationId,
        module:    "marketing_studio",
        operation: { in: ["SHOPIFY_EXPERIENCE_DRAFT", "SHOPIFY_LANDING_DRAFT"] },
        status:    { notIn: ["abandoned", "archivado"] },
      },
      orderBy: { createdAt: "desc" },
      take:    50,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows.map((row: any) => {
      const meta = (row.metadataJson ?? {}) as Record<string, unknown>;
      const isLandingDraft = row.operation === "SHOPIFY_LANDING_DRAFT";
      return {
        id:            row.id,
        tipo:          isLandingDraft ? "landing" : ((meta.tipo as "landing" | "banner") ?? "landing"),
        nombre:        (meta.productName as string) ?? (meta.nombre as string) ?? "Sin nombre",
        landingType:   meta.landingType as ExperienceDraft["landingType"],
        placement:     meta.placement  as ExperienceDraft["placement"],
        productNombre: (meta.productName as string | null) ?? (meta.productNombre as string | null) ?? null,
        templateId:    (meta.templateId   as string | null) ?? null,
        status:        (row.status       as ExperienceDraft["status"]) ?? "borrador",
        creadoAt:      row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
        actualizadoAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : (row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt)),
        creadoPor:     row.createdBy ?? "usuario",
        aprobado:      row.status === "aprobado",
      } satisfies ExperienceDraft;
    });
  } catch {
    return [];
  }
}

// ── buildExperiencesSummary ────────────────────────────────────────────────────

export function buildExperiencesSummary(
  landings:    LandingProductRow[],
  banners:     BannerSlotRow[],
  borradores:  ExperienceDraft[],
): ExperiencesSummary {
  const conLanding  = landings.filter(p => p.tieneLanding).length;
  const listos      = landings.filter(p =>
    !p.tieneLanding &&
    p.biblioteca.tieneImagenPrincipal,
  ).length;

  const sinImagen   = landings.filter(p => !p.biblioteca.tieneImagenPrincipal).length;
  const sinPrecio   = landings.filter(p => !p.precio).length;

  return {
    productosDetectados:   landings.length,
    productosConLanding:   conLanding,
    productosSinLanding:   landings.length - conLanding,
    productosListos:       listos,
    bannersActivos:        banners.filter(b => b.tieneActivo).length,
    bannersPorSlot:        banners.length,
    borrradoresPendientes: borradores.filter(d => d.status === "borrador" || d.status === "en_revision").length,
    productosSinImagen:    sinImagen,
    productosSinPrecio:    sinPrecio,
    productosSinVariante:  0,  // resolved when variant data model is added
  };
}

// ── evaluateReadiness ─────────────────────────────────────────────────────────

/**
 * SHOPIFY-EXPERIENCIAS-01B — Read-only analysis engine.
 * Inspects each product's Biblioteca resources and computes readiness.
 * Never modifies data. Reasons are structured and machine-readable.
 */
export function evaluateProductReadiness(
  row: LandingProductRow,
): ExperienceAvailability {
  const { biblioteca: bib } = row;
  const reasons: ReadinessReason[] = [];

  const hasPhotos = bib.fotosAprobadas > 0;
  const hasVideos = bib.videosAprobados > 0;
  const hasAssets = bib.totalAssets > 0;

  // Asset presence signals
  if (hasPhotos) {
    reasons.push({ code: "HAS_PHOTOS", severity: "info", message: `${bib.fotosAprobadas} foto${bib.fotosAprobadas !== 1 ? "s" : ""} aprobada${bib.fotosAprobadas !== 1 ? "s" : ""}.` });
  } else {
    reasons.push({ code: "NO_IMAGES", severity: "critical", message: "No tiene fotografias aprobadas." });
  }

  if (!hasVideos && hasPhotos) {
    reasons.push({ code: "MISSING_VIDEO", severity: "warning", message: "No tiene video asociado." });
  }

  if (bib.bannersAprobados > 0) {
    reasons.push({ code: "HAS_BANNERS", severity: "info", message: `${bib.bannersAprobados} banner${bib.bannersAprobados !== 1 ? "s" : ""} aprobado${bib.bannersAprobados !== 1 ? "s" : ""}.` });
  }

  // Readiness classification
  let readiness: ExperienceReadiness;

  if (!hasAssets) {
    readiness = "NO_MEDIA";
    reasons.push({ code: "NO_ASSETS", severity: "critical", message: "Sin contenido visual. No puede generar landing." });
  } else if (hasPhotos && hasVideos) {
    readiness = "READY";
    reasons.push({ code: "READY_FULL", severity: "info", message: "Puede generar landing completa con fotos y video." });
  } else if (hasPhotos) {
    readiness = "PARTIAL";
    reasons.push({ code: "READY_BASIC", severity: "info", message: "Puede generar landing basica (solo fotos)." });
  } else {
    readiness = "MISSING_ASSETS";
    reasons.push({ code: "MISSING_PHOTOS", severity: "critical", message: "Tiene assets pero sin fotografias aprobadas." });
  }

  return {
    productId:   row.productId,
    productName: row.nombre,
    readiness,
    photoCount:  bib.fotosAprobadas,
    videoCount:  bib.videosAprobados,
    assetCount:  bib.totalAssets,
    evaluatedAt: null,  // computed on-the-fly, not persisted
    reasons,
  };
}

/**
 * Evaluates all products and returns availability array.
 */
export function evaluateAllProducts(
  landings: LandingProductRow[],
): ExperienceAvailability[] {
  return landings.map(evaluateProductReadiness);
}

// ── buildOpportunities ───────────────────────────────────────────────────────

export function buildOpportunities(
  availability: ExperienceAvailability[],
): ExperienceOpportunities {
  return {
    totalSynced:          availability.length,
    readyForFullLanding:  availability.filter(a => a.readiness === "READY").length,
    readyForBasicLanding: availability.filter(a => a.readiness === "PARTIAL").length,
    missingAssets:        availability.filter(a => a.readiness === "MISSING_ASSETS").length,
    noMedia:              availability.filter(a => a.readiness === "NO_MEDIA").length,
    needVideos:           availability.filter(a => a.photoCount > 0 && a.videoCount === 0).length,
    noImages:             availability.filter(a => a.photoCount === 0).length,
    readyForBanner:       availability.filter(a => a.photoCount > 0).length,
  };
}

// ── buildCopilotSignals ──────────────────────────────────────────────────────

/**
 * SHOPIFY-EXPERIENCIAS-01B — Generates contextual recommendations from Sofia.
 * Max 2 signals visible. Prioritizes the main opportunity.
 * Does not emit warnings when no actionable step is available.
 */
export function buildCopilotSignals(
  opportunities: ExperienceOpportunities,
): ExperienceCopilotSignal[] {
  const candidates: ExperienceCopilotSignal[] = [];
  const readyTotal = opportunities.readyForFullLanding + opportunities.readyForBasicLanding;

  // Priority 1: main opportunity — always first if products are ready
  if (readyTotal > 0) {
    const parts: string[] = [];
    if (opportunities.readyForFullLanding > 0) {
      parts.push(`${opportunities.readyForFullLanding} con landing completa`);
    }
    if (opportunities.readyForBasicLanding > 0) {
      parts.push(`${opportunities.readyForBasicLanding} con landing basica`);
    }
    candidates.push({
      id:          "ready-for-landing",
      message:     `${readyTotal} productos listos para crear experiencias: ${parts.join(", ")}. Generarlos aumentaria la cobertura del catalogo.`,
      category:    "opportunity",
      metric:      readyTotal,
      metricLabel: "listos para landing",
    });
  }

  // Priority 2: actionable suggestion — only if there are ready products to upgrade
  if (opportunities.needVideos > 0 && opportunities.readyForBasicLanding > 0) {
    candidates.push({
      id:          "upgrade-to-full",
      message:     `${opportunities.needVideos} productos podrian tener landing completa si se agrega video. Actualmente solo generarian landing basica.`,
      category:    "suggestion",
      metric:      opportunities.needVideos,
      metricLabel: "mejorables con video",
    });
  }

  // Priority 3: blocking warning — only when nothing is ready at all
  if (readyTotal === 0 && opportunities.totalSynced > 0) {
    candidates.push({
      id:          "no-ready-products",
      message:     "Ningun producto tiene recursos suficientes para generar experiencias. Agrega fotografias en la Biblioteca.",
      category:    "warning",
    });
  }

  // Cap at 2 signals
  return candidates.slice(0, 2);
}

// ── getExperiencesWorkspaceData ────────────────────────────────────────────────

/**
 * Main data loader — aggregates all tabs in parallel.
 * Safe to call from a Next.js Server Component.
 */
export async function getExperiencesWorkspaceData(
  organizationId: string,
  connected:      boolean,
  shopDomain:     string,
): Promise<ExperiencesWorkspaceData> {
  const emptyOpportunities: ExperienceOpportunities = {
    totalSynced: 0, readyForFullLanding: 0, readyForBasicLanding: 0,
    missingAssets: 0, noMedia: 0, needVideos: 0, noImages: 0, readyForBanner: 0,
  };

  if (!connected) {
    const emptyBanners: BannerSlotRow[] = BANNER_SLOTS.map(slotId => ({
      slotId,
      ubicacion:    BANNER_PLACEMENT_LABEL[slotId],
      tieneActivo:  false,
      bannerNombre: null,
      assetId:      null,
      thumbnailUrl: null,
      status:       null,
      programadoAt: null,
      publicadoAt:  null,
      borradoId:    null,
    }));

    return {
      connected:      false,
      shopDomain:     "",
      summary:        buildExperiencesSummary([], emptyBanners, []),
      landings:       [],
      banners:        emptyBanners,
      plantillas:     EXPERIENCE_TEMPLATES,
      borradores:     [],
      availability:   [],
      opportunities:  emptyOpportunities,
      copilotSignals: [],
    };
  }

  const [landings, banners, borradores] = await Promise.all([
    getLandingProducts(organizationId),
    getBannerSlots(organizationId),
    getExperienceDrafts(organizationId),
  ]);

  const summary       = buildExperiencesSummary(landings, banners, borradores);
  const availability   = evaluateAllProducts(landings);
  const opportunities  = buildOpportunities(availability);
  const copilotSignals = buildCopilotSignals(opportunities);

  return {
    connected,
    shopDomain,
    summary,
    landings,
    banners,
    plantillas:     EXPERIENCE_TEMPLATES,
    borradores,
    availability,
    opportunities,
    copilotSignals,
  };
}
