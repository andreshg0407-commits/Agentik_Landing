/**
 * lib/marketing-studio/catalogs/catalog-definition-types.ts
 *
 * MARKETING-STUDIO-CATALOG-BUILDER-01 — Catalog Definition Domain Types
 *
 * Types for the persisted catalog definition layer.
 * A CatalogDefinition stores ONLY the definition (filters, sort, groupBy,
 * commercial mode). Products are resolved dynamically at query time.
 *
 * ── SEPARATION ────────────────────────────────────────────────────────────────
 *   CatalogDefinition  = persisted definition (this layer)
 *   CatalogRule        = in-memory filter (catalog-types.ts — unchanged)
 *   CatalogDisplayItem = resolved product display shape (catalog-display.ts)
 *
 * ── RULES ─────────────────────────────────────────────────────────────────────
 *   - No Prisma imports
 *   - No business logic
 *   - No `any` types
 */

// ── Commercial Template ────────────────────────────────────────────────────────

/**
 * Commercial template key — controls visual density, image priority, and metadata.
 * Stored on CatalogDefinition. Templates defined in catalog-template-definitions.ts.
 */
export type CatalogTemplateKey = "wholesale" | "retail" | "institutional" | "campaign";

// ── Layout ────────────────────────────────────────────────────────────────────

/**
 * Visual layout for catalog product rendering.
 * Extensible — add new variants here without breaking existing records.
 */
export type CatalogLayout = "GRID_STANDARD" | "LIST_STANDARD";

/**
 * How category sections are ordered within the catalog.
 * "manual"      = follow categoryOrder array; unlisted categories sorted alpha after.
 * "alphabetical" = all categories sorted A→Z.
 */
export type CategorySortMode = "manual" | "alphabetical";

// ── Commercial Mode ─────────────────────────────────────────────────────────

/** Whether to show prices in catalog outputs. */
export type PricingMode = "with_prices" | "without_prices";

/** Call-to-action mode for catalog outputs. */
export type CtaMode = "none" | "whatsapp_order";

// ── Filter Rule ─────────────────────────────────────────────────────────────

/** Filter operators for catalog filter rules. */
export type FilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "in"
  | "not_in"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "is_true"
  | "is_false"
  | "is_set"
  | "is_not_set";

/**
 * A single filter predicate for a catalog definition.
 * field can be:
 *   - "category", "productLine", "commercialStatus", "status", "syncChannel"
 *   - "publicationChannel" (for channel-gated products)
 *   - "attribute:{key}" for attribute-based filtering
 */
export interface CatalogFilterRule {
  field:    string;
  operator: FilterOperator;
  /** Scalar value; omitted for is_set/is_not_set/is_true/is_false */
  value?:   string | number | boolean | string[];
}

// ── Sort ─────────────────────────────────────────────────────────────────────

export type CatalogSortField =
  | "name"
  | "price"
  | "sortOrder"
  | "createdAt"
  | "updatedAt";

export type SortDirection = "asc" | "desc";

export interface CatalogSort {
  field:     CatalogSortField;
  direction: SortDirection;
}

// ── GroupBy ──────────────────────────────────────────────────────────────────

/**
 * Grouping strategy for catalog outputs.
 * Prefix "attribute:" followed by the attribute key for attribute-based grouping
 * (e.g., "attribute:color", "attribute:material").
 */
export type CatalogGroupBy =
  | "category"
  | "productLine"
  | "commercialStatus"
  | `attribute:${string}`
  | null;

// ── Catalog Status ────────────────────────────────────────────────────────────

export type CatalogDefinitionStatus = "draft" | "active" | "archived";

// ── Domain Record ─────────────────────────────────────────────────────────────

/** Full persisted catalog definition (read model). */
export interface CatalogDefinitionRecord {
  id:             string;
  organizationId: string;
  name:           string;
  description:    string | null;
  status:         CatalogDefinitionStatus;

  filters:        CatalogFilterRule[];
  sortField:      CatalogSortField;
  sortDirection:  SortDirection;
  groupBy:        CatalogGroupBy;

  pricingMode:    PricingMode;
  ctaMode:        CtaMode;
  whatsAppPhone:  string | null;

  /** Visual layout: GRID_STANDARD | LIST_STANDARD */
  layout:          CatalogLayout;
  /** Group products into category sections */
  groupByCategory: boolean;
  /** How to order category sections: manual | alphabetical */
  categorySort:    CategorySortMode;
  /** Manual category order — category names in preferred sequence */
  categoryOrder:   string[];

  /** Commercial template key: wholesale | retail | institutional | campaign */
  templateKey:     CatalogTemplateKey;

  createdAt:      Date;
  updatedAt:      Date;
  createdBy:      string | null;
}

// ── Input Types ───────────────────────────────────────────────────────────────

export interface CreateCatalogDefinitionInput {
  organizationId:  string;
  name:            string;
  description?:    string | null;
  status?:         CatalogDefinitionStatus;
  filters?:        CatalogFilterRule[];
  sortField?:      CatalogSortField;
  sortDirection?:  SortDirection;
  groupBy?:        CatalogGroupBy;
  pricingMode?:    PricingMode;
  ctaMode?:        CtaMode;
  whatsAppPhone?:  string | null;
  layout?:         CatalogLayout;
  groupByCategory?: boolean;
  categorySort?:   CategorySortMode;
  categoryOrder?:  string[];
  templateKey?:    CatalogTemplateKey;
  createdBy?:      string | null;
}

export interface UpdateCatalogDefinitionInput {
  name?:           string;
  description?:    string | null;
  status?:         CatalogDefinitionStatus;
  filters?:        CatalogFilterRule[];
  sortField?:      CatalogSortField;
  sortDirection?:  SortDirection;
  groupBy?:        CatalogGroupBy;
  pricingMode?:    PricingMode;
  ctaMode?:        CtaMode;
  whatsAppPhone?:  string | null;
  layout?:         CatalogLayout;
  groupByCategory?: boolean;
  categorySort?:   CategorySortMode;
  categoryOrder?:  string[];
  templateKey?:    CatalogTemplateKey;
}

// ── Display Helpers ───────────────────────────────────────────────────────────

export const CATALOG_STATUS_LABELS: Record<CatalogDefinitionStatus, string> = {
  draft:    "Borrador",
  active:   "Activo",
  archived: "Archivado",
};

export const PRICING_MODE_LABELS: Record<PricingMode, string> = {
  with_prices:    "Con precios",
  without_prices: "Sin precios",
};

export const CTA_MODE_LABELS: Record<CtaMode, string> = {
  none:            "Sin CTA",
  whatsapp_order:  "Pedir por WhatsApp",
};

export const SORT_FIELD_LABELS: Record<CatalogSortField, string> = {
  name:      "Nombre",
  price:     "Precio",
  sortOrder: "Orden manual",
  createdAt: "Fecha de creación",
  updatedAt: "Última actualización",
};

export const GROUP_BY_LABELS: Record<string, string> = {
  category:         "Categoría",
  productLine:      "Línea de producto",
  commercialStatus: "Estado comercial",
};

export const CATALOG_LAYOUT_LABELS: Record<CatalogLayout, string> = {
  GRID_STANDARD: "Grid",
  LIST_STANDARD: "Lista",
};

export const CATEGORY_SORT_LABELS: Record<CategorySortMode, string> = {
  manual:       "Orden manual",
  alphabetical: "Alfabético",
};

export const CATALOG_TEMPLATE_KEY_LABELS: Record<CatalogTemplateKey, string> = {
  wholesale:     "Mayorista",
  retail:        "Retail",
  institutional: "Institucional",
  campaign:      "Campaña",
};

/** The fallback category label for products without a category. Always rendered last. */
export const UNCATEGORIZED_LABEL = "Sin categoría";
