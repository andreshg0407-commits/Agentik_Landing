/**
 * lib/marketing-studio/commerce/shopify-banners-service.ts
 *
 * SHOPIFY-BANNERS-LANDINGS-01 — Banners y Landings Module Data Layer
 *
 * SERVER ONLY — never import from client components.
 *
 * Responsibility: aggregate state of banners and informative landings
 * that reference assets from Biblioteca and products from Productos.
 *
 * ── What this module is NOT ────────────────────────────────────────────────────
 *   NOT Biblioteca — assets are stored there, only referenced here.
 *   NOT Productos  — product publication lives there, only referenced here.
 *   NOT Catálogos  — PDF/shareable catalog generation lives there.
 *
 * ── What this module IS ───────────────────────────────────────────────────────
 *   - Decides which banner appears in Shopify and where.
 *   - Schedules banners.
 *   - Associates informative landings to published or upcoming products.
 *   - References assets from Biblioteca (never stores files here).
 *   - References products from Productos (never stores product data here).
 *
 * ── Persistence status ────────────────────────────────────────────────────────
 *   No ShopifyBanner / ShopifyLanding Prisma models exist yet.
 *   This service returns structured empty state (zero counts, empty items[]).
 *   When the persistence layer is added, implement the queries here.
 *
 * ── Related system entities already available ─────────────────────────────────
 *   - asset type "banner"       → lib/marketing-studio/library/ui/asset-visual-tokens.ts
 *   - LANDING_BANNER purpose    → lib/marketing-studio/distribution/distribution-types.ts
 *   - landing operator          → lib/marketing-studio/operators/placeholders/landing-operator.ts
 *   - PUBLISHING_DESTINATION.LANDING → lib/marketing-studio/publishing/publishing-types.ts
 *
 * ── Copilot action surface (planned) ──────────────────────────────────────────
 *   banners.createBanner
 *   banners.scheduleBanner
 *   banners.publishBanner
 *   banners.pauseBanner
 *   banners.linkToProduct
 *   banners.selectAssetFromLibrary
 *   landings.createLanding
 *   landings.associateProduct
 *   landings.prepareContent
 *   landings.publishLanding
 */

// ── Serializable types (RSC → client boundary safe) ───────────────────────────

export type VisualPieceType   = "banner" | "landing";
export type VisualPieceStatus =
  | "active"
  | "scheduled"
  | "draft"
  | "pending"
  | "requires_review"
  | "paused";

export const VISUAL_PIECE_STATUS_LABEL: Record<VisualPieceStatus, string> = {
  active:          "Activo",
  scheduled:       "Programado",
  draft:           "Borrador",
  pending:         "Pendiente",
  requires_review: "Requiere revisión",
  paused:          "Pausado",
};

export const VISUAL_PIECE_TYPE_LABEL: Record<VisualPieceType, string> = {
  banner:  "Banner",
  landing: "Landing",
};

/**
 * A single banner or informative landing.
 * All fields are plain JSON-safe values — safe for RSC → client boundary.
 */
export interface VisualPieceRow {
  id:               string;
  type:             VisualPieceType;
  name:             string;
  /** Name of the associated product (from Productos module) */
  productName:      string | null;
  /** Asset ID in Biblioteca — null means no visual resource assigned */
  assetId:          string | null;
  status:           VisualPieceStatus;
  /** Placement in Shopify: e.g. "Página principal", "Colección", "Página de producto" */
  placement:        string | null;
  /** ISO string of scheduled publication date */
  scheduledAt:      string | null;
  updatedAt:        string;
  /** true if assetId is non-null */
  hasAsset:         boolean;
  /** true if productName is non-null */
  hasProduct:       boolean;
  /** true if ready to go through the approval pipeline */
  isReadyToPublish: boolean;
}

/**
 * Module-level summary — all counters derived from items[].
 */
export interface BannerLandingSummary {
  // ── Banner counts ────────────────────────────────────────────────────────
  totalBanners:        number;
  bannersActivos:      number;
  bannersProgramados:  number;
  // ── Landing counts ───────────────────────────────────────────────────────
  totalLandings:       number;
  landingsActivas:     number;
  landingsBorrador:    number;
  // ── Cross-cutting ─────────────────────────────────────────────────────────
  sinRecursoVisual:    number;
  sinProducto:         number;
  pendientes:          number;
  requierenRevision:   number;
  productosConLanding: number;
  /** All pieces, sorted: requires_review → draft → scheduled → active → paused */
  items:               VisualPieceRow[];
}

// ── Main aggregator ───────────────────────────────────────────────────────────

/**
 * Returns a serializable summary of all banners and landings.
 *
 * Currently returns structured empty state — no persistence model yet.
 * When ShopifyBanner + ShopifyLanding Prisma models are added:
 *   1. Query both tables filtered by organizationId.
 *   2. Map rows to VisualPieceRow[].
 *   3. Derive all counters from the items array.
 *   4. Remove the early-return stub below.
 */
export async function getBannerLandingSummary(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  organizationId: string,
): Promise<BannerLandingSummary> {
  // ── Persistence stub ──────────────────────────────────────────────────────
  // Future: replace with actual DB queries.
  // const banners  = await prisma.shopifyBanner.findMany({ where: { organizationId } });
  // const landings = await prisma.shopifyLanding.findMany({ where: { organizationId } });
  return {
    totalBanners:        0,
    bannersActivos:      0,
    bannersProgramados:  0,
    totalLandings:       0,
    landingsActivas:     0,
    landingsBorrador:    0,
    sinRecursoVisual:    0,
    sinProducto:         0,
    pendientes:          0,
    requierenRevision:   0,
    productosConLanding: 0,
    items:               [],
  };
}

// ── Status helpers ────────────────────────────────────────────────────────────

/**
 * One-line Spanish label for the OperationalWorkspaceHeader statusLabel.
 */
export function buildBannersStatusLabel(
  connected: boolean,
  summary:   BannerLandingSummary | null,
): string {
  if (!connected) return "Integración requerida";
  if (!summary)   return "Error al cargar experiencias visuales";
  const total = summary.totalBanners + summary.totalLandings;
  if (total === 0) return "Sin experiencias visuales creadas";
  if (summary.requierenRevision > 0) {
    const n = summary.requierenRevision;
    return `${n} pieza${n !== 1 ? "s" : ""} require${n !== 1 ? "n" : ""} revisión`;
  }
  const activos = summary.bannersActivos + summary.landingsActivas;
  return `${activos} pieza${activos !== 1 ? "s" : ""} activa${activos !== 1 ? "s" : ""}`;
}
