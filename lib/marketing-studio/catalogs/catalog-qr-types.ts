/**
 * lib/marketing-studio/catalogs/catalog-qr-types.ts
 *
 * MARKETING-STUDIO-CATALOG-QR-SHARING-01 — QR Domain Types
 *
 * The QR code is a pointer to the CatalogPublicLink URL only.
 * It carries NO internal catalog data — only the public URL.
 *
 * This guarantees that products, prices, templates and categories
 * can change without ever needing to re-generate or re-distribute the QR.
 *
 * ── EXTENSION POINTS (future sprints, not implemented here) ──────────────────
 *   SCAN_TRACKING_SLOT:  scanCount + lastScanAt columns on CatalogPublicLink
 *   CAMPAIGN_SLOT:       campaignName + UTM params appended to publicUrl
 *   PRODUCT_QR_SLOT:     per-product QR pointing to filtered public catalog URL
 *   REFERENCE_QR_SLOT:   per-SKU QR for product sheets, labels, shelf tags
 */

// ── Core types ────────────────────────────────────────────────────────────────

/** Only PNG supported initially — sufficient for all print + digital use cases */
export type CatalogQrFormat = "png";

/**
 * Resolved definition used to generate a QR.
 * Contains only the public URL and display metadata — no internal IDs.
 */
export interface CatalogQrDefinition {
  /** The ONLY data encoded in the QR */
  publicUrl:   string;
  /** Slug from CatalogPublicLink (display only — never encoded in QR) */
  linkSlug:    string;
  /** Catalog display name (for the panel card) */
  catalogName: string;
  /** When this definition was resolved */
  generatedAt: Date;
}

/** Result of a successful QR PNG generation */
export interface CatalogQrDownload {
  /** PNG buffer — caller streams or saves it */
  buffer:    Buffer;
  /** Suggested filename for the download header */
  fileName:  string;
  /** The URL encoded in the QR */
  publicUrl: string;
}

// ── Readiness state ───────────────────────────────────────────────────────────

export type CatalogQrUnavailableReason =
  | "no_link"       // No CatalogPublicLink — catalog not published
  | "link_inactive" // isActive=false — deliberately deactivated
  | "link_expired"; // expiresAt < now — time-limited link expired

export interface CatalogQrUnavailable {
  available: false;
  reason:    CatalogQrUnavailableReason;
}

export interface CatalogQrAvailable {
  available:  true;
  definition: CatalogQrDefinition;
}

export type CatalogQrReadiness = CatalogQrAvailable | CatalogQrUnavailable;

// ── UI helpers ────────────────────────────────────────────────────────────────

export const QR_UNAVAILABLE_MESSAGES: Record<CatalogQrUnavailableReason, string> = {
  no_link:       "Publica el catálogo antes de generar un código QR.",
  link_inactive: "El enlace está desactivado. Reactívalo para generar el QR.",
  link_expired:  "El enlace expiró. Crea un nuevo enlace para generar el QR.",
};
