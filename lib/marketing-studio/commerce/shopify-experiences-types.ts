/**
 * lib/marketing-studio/commerce/shopify-experiences-types.ts
 *
 * SHOPIFY-EXPERIENCES-ARCHITECTURE-01 — Experiences Module Types
 *
 * Domain types for the "Experiencias Shopify" module.
 * Safe for RSC → client boundary (all plain JSON values).
 *
 * ARCHITECTURE:
 *   Biblioteca   → stores visual assets (photos, videos, banners).
 *   Shopify      → provides products, collections, prices, URLs.
 *   Experiencias → decides what experience is shown, where, and when.
 *
 * NOT:
 *   NOT generic content creation (use Redes / Contenido for that).
 *   NOT Biblioteca (assets live there, only referenced here).
 *   NOT Publicaciones (publication pipeline lives there).
 */

// ── Tab navigation ─────────────────────────────────────────────────────────────

export type ExperienceTab =
  | "resumen"
  | "landings"
  | "banners"
  | "plantillas"
  | "borradores"
  | "historial";

export const EXPERIENCE_TAB_LABEL: Record<ExperienceTab, string> = {
  resumen:     "Resumen",
  landings:    "Landings de producto",
  banners:     "Banners de tienda",
  plantillas:  "Plantillas",
  borradores:  "Borradores",
  historial:   "Historial",
};

// ── Lifecycle status ───────────────────────────────────────────────────────────

export type ExperienceStatus =
  | "borrador"
  | "en_revision"
  | "aprobado"
  | "publicado"
  | "rechazado"
  | "archivado";

export const EXPERIENCE_STATUS_LABEL: Record<ExperienceStatus, string> = {
  borrador:    "Borrador",
  en_revision: "En revisión",
  aprobado:    "Aprobado",
  publicado:   "Publicado",
  rechazado:   "Rechazado",
  archivado:   "Archivado",
};

// ── Landing types ──────────────────────────────────────────────────────────────

export type LandingType =
  | "landing_producto"
  | "landing_coleccion"
  | "landing_campaña"
  | "landing_temporada";

export const LANDING_TYPE_LABEL: Record<LandingType, string> = {
  landing_producto:  "Landing de producto",
  landing_coleccion: "Landing de colección",
  landing_campaña:   "Landing de campaña",
  landing_temporada: "Landing de temporada",
};

// ── Banner placement ───────────────────────────────────────────────────────────

export type BannerPlacement =
  | "home"
  | "home_secundario"
  | "coleccion"
  | "categoria"
  | "promocion"
  | "temporada"
  | "footer";

export const BANNER_PLACEMENT_LABEL: Record<BannerPlacement, string> = {
  home:            "Home principal",
  home_secundario: "Home secundario",
  coleccion:       "Colección",
  categoria:       "Categoría",
  promocion:       "Promoción",
  temporada:       "Temporada",
  footer:          "Footer",
};

// ── Biblioteca asset readiness ─────────────────────────────────────────────────

/** Summary of what's available in Biblioteca for a specific product/reference. */
export interface BibliotecaReadiness {
  /** Total approved assets linked to this reference. */
  totalAssets:    number;
  /** Number of approved photos. */
  fotosAprobadas: number;
  /** Number of approved videos. */
  videosAprobados: number;
  /** Number of approved banners. */
  bannersAprobados: number;
  /** Whether the product has at least one approved main image. */
  tieneImagenPrincipal: boolean;
}

// ── Landing product row ────────────────────────────────────────────────────────

/**
 * One row in the "Landings de producto" tab.
 * Represents a Shopify product crossed with Biblioteca resources and landing status.
 */
export interface LandingProductRow {
  /** Product ID in Agentik (ProductSnapshot or equivalent). */
  productId:    string;
  /** Shopify product name. */
  nombre:       string;
  /** SKU or reference code. */
  sku:          string | null;
  /** Collection name (if part of one). */
  coleccion:    string | null;
  /** Current Shopify publication status. */
  shopifyStatus: "active" | "draft" | "archived" | "unknown";
  /** Shopify product URL (null if not yet published). */
  shopifyUrl:   string | null;
  /** Precio display (e.g., "$45.000"). */
  precio:       string | null;
  /** Summary of available resources in Biblioteca. */
  biblioteca:   BibliotecaReadiness;
  /** Whether a landing already exists for this product. */
  tieneLanding: boolean;
  /** Status of the existing landing (null if tieneLanding=false). */
  landingStatus: ExperienceStatus | null;
  /** ID of the existing landing draft (null if none). */
  landingId:    string | null;
}

// ── Banner slot row ────────────────────────────────────────────────────────────

/**
 * One card in the "Banners de tienda" tab.
 * Represents a banner slot in the Shopify store.
 */
export interface BannerSlotRow {
  /** Slot identifier (e.g., "home", "coleccion"). */
  slotId:       BannerPlacement;
  /** Human label (from BANNER_PLACEMENT_LABEL). */
  ubicacion:    string;
  /** Whether a banner is currently set for this slot. */
  tieneActivo:  boolean;
  /** Name of the current banner asset (null if none). */
  bannerNombre: string | null;
  /** Asset ID in Biblioteca (null if no asset assigned). */
  assetId:      string | null;
  /** Thumbnail URL for the current banner (null if none). */
  thumbnailUrl: string | null;
  /** Current publication status. */
  status:       ExperienceStatus | null;
  /** ISO string of scheduled publication date (null if not scheduled). */
  programadoAt: string | null;
  /** ISO string of last publication date (null if never published). */
  publicadoAt:  string | null;
  /** Draft ID if a replacement is being prepared. */
  borradoId:    string | null;
}

// ── Template registry ──────────────────────────────────────────────────────────

export type TemplateDestino =
  | "landing_producto"
  | "landing_coleccion"
  | "landing_temporada"
  | "banner_home"
  | "banner_coleccion"
  | "banner_categoria"
  | "bloque_footer";

export const TEMPLATE_DESTINO_LABEL: Record<TemplateDestino, string> = {
  landing_producto:  "Landing de producto",
  landing_coleccion: "Landing de colección",
  landing_temporada: "Landing de temporada",
  banner_home:       "Banner de home",
  banner_coleccion:  "Banner de colección",
  banner_categoria:  "Banner de categoría",
  bloque_footer:     "Bloque de footer",
};

/**
 * Required fields definition for a template.
 * Tells the system what data must be available before generating.
 */
export interface TemplateRequiredFields {
  imagenPrincipal: boolean;
  video:           boolean;
  precio:          boolean;
  descripcion:     boolean;
  sku:             boolean;
  coleccion:       boolean;
}

/**
 * A registered experience template.
 * Defines the structure, required assets, and destination for a generated experience.
 */
export interface ExperienceTemplate {
  /** Machine key. */
  id:            string;
  /** Display name (LATAM Spanish). */
  nombre:        string;
  /** Short description. */
  descripcion:   string;
  /** Target destination in Shopify. */
  destino:       TemplateDestino;
  /** Tags for filtering (e.g., "infantil", "temporada"). */
  etiquetas:     string[];
  /** What Biblioteca resources are required. */
  requiere:      TemplateRequiredFields;
  /** Whether this template is available for the current tenant. */
  activa:        boolean;
  /** Order of display in the template gallery. */
  orden:         number;
  /** Approximate generation time label. */
  tiempoEstimado: string;
  /** Whether this template supports bulk generation. */
  soportaMasiva: boolean;
}

// ── Experience draft ───────────────────────────────────────────────────────────

/**
 * A draft landing or banner awaiting review/publication.
 */
export interface ExperienceDraft {
  id:           string;
  tipo:         "landing" | "banner";
  nombre:       string;
  landingType?: LandingType;
  placement?:  BannerPlacement;
  productNombre: string | null;
  templateId:   string | null;
  status:       ExperienceStatus;
  creadoAt:     string;
  actualizadoAt: string;
  creadoPor:    string;
  /** True if the draft has been through an approval step. */
  aprobado:     boolean;
}

// ── Workspace summary ──────────────────────────────────────────────────────────

/**
 * Data for the "Resumen" tab — overall module health.
 */
export interface ExperiencesSummary {
  // Products
  productosDetectados:    number;
  productosConLanding:    number;
  productosSinLanding:    number;
  productosListos:        number;   // have Biblioteca resources, no landing yet

  // Banners
  bannersActivos:         number;
  bannersPorSlot:         number;   // total slots available
  borrradoresPendientes:  number;

  // Readiness signal
  productosSinImagen:     number;
  productosSinPrecio:     number;
  productosSinVariante:   number;
}

// ── Experience readiness (read-only analysis) ────────────────────────────────

/**
 * SHOPIFY-EXPERIENCIAS-01 — Product readiness for experience generation.
 * Evaluated automatically from Biblioteca + catalog data. Never modifies anything.
 */
export type ExperienceReadiness =
  | "READY"
  | "PARTIAL"
  | "MISSING_ASSETS"
  | "NO_MEDIA";

export const EXPERIENCE_READINESS_LABEL: Record<ExperienceReadiness, string> = {
  READY:          "Listo",
  PARTIAL:        "Parcial",
  MISSING_ASSETS: "Recursos insuficientes",
  NO_MEDIA:       "Sin contenido",
};

export const EXPERIENCE_READINESS_COLOR: Record<ExperienceReadiness, string> = {
  READY:          "#22c55e",
  PARTIAL:        "#eab308",
  MISSING_ASSETS: "#f97316",
  NO_MEDIA:       "#ef4444",
};

// ── Experience availability (per-product evaluation) ─────────────────────────

/**
 * SHOPIFY-EXPERIENCIAS-01B — Structured reason for readiness evaluation.
 * Machine-readable code + human message. Actionable by code.
 */
export type ReadinessReasonCode =
  | "HAS_PHOTOS"
  | "MISSING_VIDEO"
  | "NO_IMAGES"
  | "READY_FULL"
  | "READY_BASIC"
  | "HAS_BANNERS"
  | "NO_ASSETS"
  | "MISSING_PHOTOS";

export interface ReadinessReason {
  code:     ReadinessReasonCode;
  severity: "info" | "warning" | "critical";
  message:  string;
}

/**
 * Result of the readiness analysis engine for a single product.
 * Read-only — the engine evaluates but never modifies data.
 *
 * evaluatedAt is null because readiness is computed on-the-fly,
 * not persisted. Will become a real timestamp when persistence is added.
 */
export interface ExperienceAvailability {
  productId:    string;
  productName:  string;
  readiness:    ExperienceReadiness;
  photoCount:   number;
  videoCount:   number;
  assetCount:   number;
  evaluatedAt:  string | null;
  reasons:      ReadinessReason[];
}

// ── Unified status system ────────────────────────────────────────────────────

/**
 * SHOPIFY-EXPERIENCIAS-01 — Standard status codes reusable across
 * Experiencias, Biblioteca, Publicaciones, and future modules.
 */
export type UnifiedExperienceStatus =
  | "READY"
  | "PARTIAL"
  | "MISSING_ASSETS"
  | "NO_MEDIA"
  | "PUBLISHED"
  | "DRAFT";

export const UNIFIED_STATUS_CONFIG: Record<UnifiedExperienceStatus, {
  label: string;
  icon:  string;
  color: string;
}> = {
  READY:          { label: "Listo",                   icon: "circle-green",  color: "#22c55e" },
  PARTIAL:        { label: "Parcial",                 icon: "circle-amber",  color: "#eab308" },
  MISSING_ASSETS: { label: "Recursos insuficientes",  icon: "circle-orange", color: "#f97316" },
  NO_MEDIA:       { label: "Sin contenido",           icon: "circle-red",    color: "#ef4444" },
  PUBLISHED:      { label: "Publicado",               icon: "circle-blue",   color: "#3b82f6" },
  DRAFT:          { label: "Borrador",                icon: "circle-gray",   color: "#94a3b8" },
};

// ── Copilot signal types ─────────────────────────────────────────────────────

/**
 * Contextual recommendation from Copilot (Sofia) for the Experiences module.
 * Read-only — suggestions only, no execution.
 */
export interface ExperienceCopilotSignal {
  id:           string;
  message:      string;
  category:     "opportunity" | "warning" | "suggestion";
  metric?:      number;
  metricLabel?: string;
}

// ── Opportunities summary ────────────────────────────────────────────────────

export interface ExperienceOpportunities {
  totalSynced:         number;
  /** Photos + videos present — can generate full landing. */
  readyForFullLanding: number;
  /** Photos present, no video — can generate basic landing. */
  readyForBasicLanding: number;
  /** Has some assets but not enough for any landing. */
  missingAssets:       number;
  /** Zero assets — no landing possible. */
  noMedia:             number;
  needVideos:          number;
  noImages:            number;
  readyForBanner:      number;
}

// ── Full workspace data bundle ─────────────────────────────────────────────────

/**
 * Everything the page passes to the client for all 5 tabs.
 * All values are plain JSON — safe for RSC → client boundary.
 */
export interface ExperiencesWorkspaceData {
  connected:      boolean;
  shopDomain:     string;
  summary:        ExperiencesSummary;
  landings:       LandingProductRow[];
  banners:        BannerSlotRow[];
  plantillas:     ExperienceTemplate[];
  borradores:     ExperienceDraft[];
  availability:   ExperienceAvailability[];
  opportunities:  ExperienceOpportunities;
  copilotSignals: ExperienceCopilotSignal[];
}

// ── Sprint 2 contracts (defined, not implemented) ────────────────────────────

/**
 * Generation rules applied during landing creation.
 * Sprint 2: controls output quality and asset selection.
 */
export interface GenerationRules {
  /** Max images to include in the landing. */
  maxImages?:      number;
  /** Whether to auto-crop images to template aspect ratio. */
  autoCrop?:       boolean;
  /** Preferred image quality: "original" | "optimized" | "compressed". */
  imageQuality?:   "original" | "optimized" | "compressed";
  /** Include price in the landing. */
  showPrice?:      boolean;
  /** Include collection breadcrumb. */
  showCollection?: boolean;
}

/** Request to generate a landing. Supports single and bulk modes. Sprint 2. */
export interface GenerateLandingRequest {
  productId:      string;
  templateId:     string;
  orgId:          string;
  mode:           "single" | "bulk";
  generationRules?: GenerationRules;
  tenantPreset?:  string;
}

/** Request to generate landings in bulk. Sprint 2. */
export interface BulkGenerateLandingsRequest {
  productIds:     string[];
  templateId:     string;
  orgId:          string;
  mode:           "bulk";
  generationRules?: GenerationRules;
  tenantPreset?:  string;
}

/** Template selection for landing generation. Sprint 2. */
export interface TemplateSelection {
  templateId:  string;
  productId:   string;
  overrides?:  Record<string, unknown>;
}

/** Request to create a draft experience. Sprint 2. */
export interface CreateDraftRequest {
  tipo:         "landing" | "banner";
  templateId:   string;
  productId?:   string;
  placement?:   BannerPlacement;
  nombre:       string;
  orgId:        string;
}

/** Request to publish an approved draft. Sprint 2. */
export interface PublishDraftRequest {
  draftId:  string;
  orgId:    string;
}
