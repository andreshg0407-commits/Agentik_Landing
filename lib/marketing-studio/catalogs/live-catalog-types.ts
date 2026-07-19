/**
 * lib/marketing-studio/catalogs/live-catalog-types.ts
 *
 * MARKETING-STUDIO-LIVE-CATALOGS-01
 * "Catálogos vivos y experiencias comerciales inteligentes"
 *
 * ── Global business rule ─────────────────────────────────────────────────────
 *
 *   LINK = vivo y autorregenerado.
 *        Cada vez que se abre, Agentik reconstruye el catálogo desde el estado
 *        actual de los productos. Nunca almacena una copia congelada.
 *
 *   PDF  = estático y congelado.
 *        Captura el estado exacto al momento de generarse. No cambia después.
 *
 * ── Architecture principle ───────────────────────────────────────────────────
 *
 *   Un catálogo NO almacena productos. Almacena una definición comercial:
 *     - tipo de catálogo
 *     - plantilla visual
 *     - reglas de inclusión
 *     - filtros
 *     - configuración
 *
 *   La resolución ocurre en tiempo real desde Biblioteca (fuente única de verdad).
 *   No hay duplicación de información del producto.
 *
 * ── Copilot compatibility ────────────────────────────────────────────────────
 *
 *   "Crea un catálogo retail de juguetes para bebés y publícalo como Link."
 *   → LiveCatalogDefinition con rules + outputModes: ["link"]
 *   → Resolver reconstruye en cada acceso desde productos actuales.
 */

import type {
  CatalogType,
  CatalogSpec,
  CatalogInclusionRule,
  CatalogSelectionMode,
  CatalogReadinessPolicy,
} from "./catalog-v2-types";

// ── Output behavior — the fundamental LINK vs PDF distinction ─────────────────

export type CatalogOutputBehavior = "live" | "snapshot";

/**
 * Enriched configuration for each output destination.
 * Surfaces the live/snapshot distinction for sellers.
 */
export type CatalogOutputModeConfig = {
  id:             "link" | "pdf";
  label:          string;
  description:    string;
  behavior:       CatalogOutputBehavior;
  behaviorLabel:  string;    // short label: "Catálogo vivo" / "Fotografía estática"
  behaviorDetail: string;    // seller-facing explanation
  emoji:          string;
  dotColor:       string;    // for visual indicator
};

/**
 * The definitive catalog of output modes.
 * LINK first: the live experience is the primary recommendation.
 */
export const CATALOG_OUTPUT_MODE_CONFIGS: CatalogOutputModeConfig[] = [
  {
    id:             "link",
    label:          "Catálogo web",
    description:    "Enlace para compartir directamente. Siempre muestra la información más reciente.",
    behavior:       "live",
    behaviorLabel:  "Catálogo web",
    behaviorDetail: "Cada vez que alguien abre el catálogo, ve los precios, imágenes y descripciones actuales. Si actualizas un producto, el catálogo se actualiza solo — sin necesidad de regenerarlo.",
    emoji:          "🌐",
    dotColor:       "#16a34a",   // green — alive, active
  },
  {
    id:             "pdf",
    label:          "PDF",
    description:    "Archivo descargable, ideal para enviar por correo o WhatsApp.",
    behavior:       "snapshot",
    behaviorLabel:  "Fotografía estática",
    behaviorDetail: "Captura el estado exacto de los productos al momento de generarse. No cambia después de creado.",
    emoji:          "📄",
    dotColor:       "#1d4ed8",   // blue — stable, fixed
  },
];

// ── Live catalog resolution ───────────────────────────────────────────────────

/**
 * The output of resolveLiveCatalog().
 * Computed fresh on every link access. Never stored as a product snapshot.
 * Single source of truth: all product data comes from Biblioteca.
 */
export type LiveCatalogResolution = {
  definitionId:           string;
  resolvedAt:             string;                  // ISO — when this resolution was computed
  type:                   CatalogType;
  templateId:             string | null;
  products:               LiveCatalogProduct[];
  totalProducts:          number;
  showPrices:             boolean;
  ctaText:                string;
  liveNote:               string;                  // human-readable note about this resolution
  selectionMode:          CatalogSelectionMode;    // FASE 2 — how products were selected
  productReadinessPolicy: CatalogReadinessPolicy;  // FASE 1 — which readiness levels are shown
};

/**
 * A product as it appears in a live catalog resolution.
 *
 * Critical: this is NOT a stored copy.
 * It is always resolved from the current product domain (Biblioteca).
 * Fields like name, primaryAssetUrl, isAvailable change with the product.
 *
 * Future: price, stock, variants will come from their respective domains.
 */
export type LiveCatalogProduct = {
  productId:       string;
  name:            string;
  sku:             string | null;
  category:        string | null;
  primaryAssetUrl: string | null;
  isAvailable:     boolean;      // reflects current readiness, not a stored flag
  readinessLevel:  string;
};

// ── Live catalog definition ───────────────────────────────────────────────────

/**
 * A stored catalog definition.
 *
 * Stores RULES and CONFIGURATION — not product snapshots.
 * When a link is opened, resolveLiveCatalog(definition, currentProducts) runs.
 * When a PDF is generated, snapshotCatalog(definition, currentProducts) runs.
 *
 * Rule-based inclusion (FASE 3): a new product that matches the rules
 * will automatically appear in live links — no manual update needed.
 *
 * Future capabilities (FASE 7):
 *   - carrito
 *   - solicitud por WhatsApp
 *   - cotización
 *   - captura de leads
 *   - recomendaciones IA
 *   - analytics
 *   - seguimiento comercial
 */
export type LiveCatalogDefinition = {
  id:          string;
  orgSlug:     string;
  name:        string;
  slug:        string;                   // FASE 4 — permanent URL segment (e.g. "retail-temporada-2026")
  type:        CatalogType;
  templateId:  string | null;
  rules:       CatalogInclusionRule[];   // smart rule-based product inclusion
  outputModes: Array<"link" | "pdf">;
  showPrices:  boolean;
  ctaText:     string;
  spec:        CatalogSpec;              // full spec for Copilot reconstruction (includes selectionMode + policy)
  createdAt:   string;                   // ISO
  updatedAt:   string;                   // ISO
};

// ── Analytics event types — FASE 5 (domain-only, no persistence) ──────────────

/**
 * Event types for catalog analytics.
 * Domain types only — no persistence layer yet.
 * Future: these will feed into a CatalogAnalyticsRecord stored per org.
 *
 *   link_opened      — someone opened the live link
 *   product_viewed   — a product card was expanded or tapped
 *   cta_clicked      — the CTA button was clicked (e.g. "Pedir ahora")
 *   pdf_downloaded   — the PDF was downloaded by the recipient
 *   pdf_generated    — the PDF was generated by the seller
 *   share_initiated  — the seller copied or shared the link
 */
export type CatalogAnalyticsEventType =
  | "link_opened"
  | "product_viewed"
  | "cta_clicked"
  | "pdf_downloaded"
  | "pdf_generated"
  | "share_initiated";

/**
 * A single catalog analytics event.
 * Purely descriptive — not yet stored in any DB.
 */
export type CatalogAnalyticsEvent = {
  eventType:    CatalogAnalyticsEventType;
  catalogId:    string;
  orgSlug:      string;
  occurredAt:   string;                  // ISO
  productId?:   string;                  // set for product_viewed and cta_clicked
  destination?: "link" | "pdf";         // set for pdf_* and link_opened
};
