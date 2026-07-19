/**
 * lib/marketing-studio/catalogs/catalog-v2-types.ts
 *
 * MARKETING-STUDIO-CATALOGS-REARCHITECTURE-01 / WIZARD-02
 *
 * Architecture: two independent dimensions, never conflated.
 *
 *   CatalogType        — WHAT commercial experience to create
 *   CatalogDestination — WHERE the catalog will be delivered
 *
 * CatalogSpec is the Copilot contract.
 * An agent fills it in from natural language; the system builds from it.
 *
 * Example:
 *   "Créame un catálogo retail de juguetes para bebés, en PDF."
 *   → { type:"retail", templateId:"retail-castillitos",
 *       destinations:["pdf"], filter:{ categories:["Juguetes"] } }
 */

// ── Catalog Type ───────────────────────────────────────────────────────────────

export const CATALOG_TYPE = {
  RETAIL:        "retail",
  WHOLESALE:     "wholesale",
  NO_PRICE:      "no_price",
  LAUNCH:        "launch",
  PROMOTIONAL:   "promotional",
  SEASONAL:      "seasonal",
  INSTITUTIONAL: "institutional",
  CUSTOM:        "custom",
} as const;

export type CatalogType = typeof CATALOG_TYPE[keyof typeof CATALOG_TYPE];

// ── Catalog Destination ────────────────────────────────────────────────────────

export const CATALOG_DESTINATION = {
  PDF:   "pdf",
  LINK:  "link",
} as const;

export type CatalogDestination = typeof CATALOG_DESTINATION[keyof typeof CATALOG_DESTINATION];

// ── Type configs ───────────────────────────────────────────────────────────────

export type CatalogTypeConfig = {
  id:          CatalogType;
  label:       string;
  description: string;
  example:     string;    // concrete use-case example for sellers
  emoji:       string;
  showPrices:  boolean;
  defaultCta:  string;
  primary:     boolean;   // shown in main grid; false = under "Más opciones"
};

export const CATALOG_TYPE_CONFIGS: CatalogTypeConfig[] = [
  {
    id:          "retail",
    label:       "Retail con precios",
    description: "Para compartir con clientes finales mostrando precios de venta.",
    example:     "\"Catálogo de temporada escolar con precios al público.\"",
    emoji:       "🛍",
    showPrices:  true,
    defaultCta:  "Pedir ahora",
    primary:     true,
  },
  {
    id:          "wholesale",
    label:       "Mayorista con precios",
    description: "Para distribuidores con precios y condiciones de mayoreo.",
    example:     "\"Portafolio para distribuidores con precios por volumen.\"",
    emoji:       "📦",
    showPrices:  true,
    defaultCta:  "Cotizar cantidad",
    primary:     true,
  },
  {
    id:          "no_price",
    label:       "Sin precios",
    description: "Solo imágenes y referencias, ideal para primeras visitas.",
    example:     "\"Catálogo de presentación para ferias y eventos.\"",
    emoji:       "🖼",
    showPrices:  false,
    defaultCta:  "Solicitar información",
    primary:     true,
  },
  {
    id:          "launch",
    label:       "Lanzamiento",
    description: "Presenta nuevas referencias con identidad destacada.",
    example:     "\"Nuevos productos de la colección verano 2026.\"",
    emoji:       "🚀",
    showPrices:  true,
    defaultCta:  "Conocer novedad",
    primary:     true,
  },
  {
    id:          "custom",
    label:       "Personalizado",
    description: "Define manualmente todos los parámetros del catálogo.",
    example:     "\"Catálogo especial con configuración propia.\"",
    emoji:       "⚙️",
    showPrices:  true,
    defaultCta:  "Consultar",
    primary:     true,
  },
  {
    id:          "promotional",
    label:       "Promocional",
    description: "Enfocado en descuentos, combos y ofertas especiales.",
    example:     "\"Catálogo de temporada navideña con precios especiales.\"",
    emoji:       "🏷",
    showPrices:  true,
    defaultCta:  "Aprovechar oferta",
    primary:     false,
  },
  {
    id:          "seasonal",
    label:       "Temporada",
    description: "Colecciones por temporada o fecha especial.",
    example:     "\"Colección escolar / Navidad / Día del Niño.\"",
    emoji:       "📅",
    showPrices:  true,
    defaultCta:  "Ver colección",
    primary:     false,
  },
  {
    id:          "institutional",
    label:       "Institucional",
    description: "Presentación corporativa formal para aliados y clientes.",
    example:     "\"Portafolio corporativo para reuniones de negocios.\"",
    emoji:       "🏢",
    showPrices:  false,
    defaultCta:  "Más información",
    primary:     false,
  },
];

// ── Destination configs ────────────────────────────────────────────────────────

export type CatalogDestinationConfig = {
  id:          CatalogDestination;
  label:       string;
  description: string;
  emoji:       string;
};

export const CATALOG_DESTINATION_CONFIGS: CatalogDestinationConfig[] = [
  {
    id:          "pdf",
    label:       "PDF",
    description: "Archivo descargable, ideal para enviar por correo o WhatsApp.",
    emoji:       "📄",
  },
  {
    id:          "link",
    label:       "Link compartible",
    description: "URL pública para compartir directamente con clientes.",
    emoji:       "🔗",
  },
];

// ── Templates ─────────────────────────────────────────────────────────────────

export type CatalogTemplate = {
  id:          string;
  name:        string;
  forTypes:    CatalogType[];  // empty = universal (shown for any type)
  description: string;
  emoji:       string;
  style:       string;         // visual style description for sellers
};

export const CATALOG_TEMPLATES: CatalogTemplate[] = [
  {
    id:          "retail-castillitos",
    name:        "Retail Castillitos",
    forTypes:    ["retail", "custom"],
    description: "Presentación estándar con precios, fotografías y referencias.",
    emoji:       "🛍",
    style:       "Cuadrícula · Fondo blanco · Logo en portada",
  },
  {
    id:          "wholesale-castillitos",
    name:        "Mayorista Castillitos",
    forTypes:    ["wholesale", "custom"],
    description: "Catálogo de distribución con tabla de precios por cantidad.",
    emoji:       "📦",
    style:       "Tabla de referencias · Precios por volumen · B2B",
  },
  {
    id:          "launch-impact",
    name:        "Lanzamiento — Impacto",
    forTypes:    ["launch", "custom"],
    description: "Portada de alto impacto visual para nuevas referencias.",
    emoji:       "🚀",
    style:       "Portada de pantalla completa · Colores vibrantes",
  },
  {
    id:          "promo-destacado",
    name:        "Promoción Destacada",
    forTypes:    ["promotional", "seasonal", "custom"],
    description: "Diseño con precios y descuentos visibles y llamativos.",
    emoji:       "🏷",
    style:       "Precios destacados · CTA visible · Sentido de urgencia",
  },
  {
    id:          "clasico",
    name:        "Clásico",
    forTypes:    [],
    description: "Diseño limpio y profesional. Funciona para cualquier tipo de catálogo.",
    emoji:       "📋",
    style:       "Lista 2 columnas · Minimalista · Fácil de imprimir",
  },
];

// ── Inclusion rules — FASE 3 (MARKETING-STUDIO-LIVE-CATALOGS-01) ──────────────

/**
 * Operators for smart rule evaluation.
 * Used to filter products dynamically (never by stored ID lists).
 */
export type CatalogRuleOperator = "eq" | "contains" | "gte" | "lte" | "in";

/**
 * Fields on which rules can operate.
 * Extensible as the product domain grows.
 */
export type CatalogRuleField =
  | "category"
  | "line"
  | "tag"
  | "availability"
  | "readiness_score"
  | "has_primary_asset"
  | "status"
  | "age_range"
  | "attribute";

/**
 * A single inclusion rule.
 * A product satisfies the rule if field · operator · value holds true.
 */
export type CatalogInclusionRule = {
  field:    CatalogRuleField;
  operator: CatalogRuleOperator;
  value:    string | number | boolean | string[];
};

// ── Readiness policy — FASE 1 (MARKETING-STUDIO-LIVE-CATALOGS-02) ─────────────

/**
 * Controls which products appear based on their readiness level.
 *
 *   show_all      — include ALL products regardless of readiness (default).
 *                   Useful for internal review catalogs.
 *   hide_not_ready — exclude products with readinessLevel = NOT_READY.
 *                   Partial products are still shown (they have some info).
 *   only_ready    — show ONLY products with readinessLevel = READY.
 *                   Used for customer-facing catalogs where quality matters.
 *
 * Applied after all other filters (categories, search, rules, manualIds).
 * Resolver respects this policy — nothing is hardcoded.
 */
export type CatalogReadinessPolicy =
  | "show_all"
  | "hide_not_ready"
  | "only_ready";

// ── Selection mode — FASE 2 (MARKETING-STUDIO-LIVE-CATALOGS-02) ───────────────

/**
 * Controls how the product set is selected.
 *
 *   dynamic — products are resolved from rules + categories + search.
 *             manualIds = additional explicit inclusions on top of the rule result.
 *             New products that match the rules auto-appear.
 *             This is the default for LINK (live) experiences.
 *
 *   fixed   — products = ONLY the products listed in manualIds.
 *             Rules and categories are ignored.
 *             The product set is explicit and frozen by the editor.
 *             This is the recommended mode for PDF snapshots.
 *
 * LINK default: "dynamic"  (auto-refresh from rules)
 * PDF default:  "fixed"    (editor selects exact products)
 */
export type CatalogSelectionMode = "dynamic" | "fixed";

// ── Product filter spec ────────────────────────────────────────────────────────

/**
 * How products are selected. Copilot-fillable from natural language.
 *
 * Semantics of manualIds depend on selectionMode (in CatalogSpec):
 *   dynamic: manualIds are additional inclusions on top of rule/category results.
 *   fixed:   manualIds are the complete and exact product list.
 */
export type CatalogProductFilterSpec = {
  categories:  string[];
  searchQuery: string;
  manualIds:   string[];                // explicit product IDs
  rules:       CatalogInclusionRule[];  // smart rule-based inclusion (FASE 3)
};

// ── Catalog spec — the Copilot contract ───────────────────────────────────────

/**
 * Fully structured catalog configuration.
 * Internal use only — never shown to sellers in raw form.
 * An agent fills this in from natural language; the system builds from it.
 */
export type CatalogSpec = {
  type:                   CatalogType;
  typeName:               string;
  templateId:             string | null;
  templateName:           string | null;
  destinations:           CatalogDestination[];
  filter:                 CatalogProductFilterSpec;
  showPrices:             boolean;
  ctaText:                string;
  selectionMode:          CatalogSelectionMode;          // FASE 2
  productReadinessPolicy: CatalogReadinessPolicy;        // FASE 1
};
