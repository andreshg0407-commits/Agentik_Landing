/**
 * lib/marketing-studio/catalogs/catalog-types.ts
 *
 * MS-08 — Dynamic Catalog Builder + Commerce Layer
 *
 * Domain types and enums for the catalog system.
 * All enums follow the MS-05F governance pattern (as const objects).
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   - No Prisma, no UI, no side effects
 *   - CatalogEntity is an in-memory construct (no DB persistence in MS-08)
 *   - CatalogRule drives the query engine
 *   - CatalogDisplayItem is the client-safe serialized form
 */

// ── Purpose ───────────────────────────────────────────────────────────────────

export const CatalogPurpose = {
  WHATSAPP_SALES:     "whatsapp_sales",
  SHOPIFY_COLLECTION: "shopify_collection",
  SEASONAL_CAMPAIGN:  "seasonal_campaign",
  WHOLESALE:          "wholesale",
  RETAIL:             "retail",
  LANDING:            "landing",
  ADS:                "ads",
  CRM_SEGMENT:        "crm_segment",
} as const;
export type CatalogPurpose = typeof CatalogPurpose[keyof typeof CatalogPurpose];

export const CATALOG_PURPOSE_LABEL: Record<CatalogPurpose, string> = {
  whatsapp_sales:     "Ventas WhatsApp",
  shopify_collection: "Colección Shopify",
  seasonal_campaign:  "Campaña estacional",
  wholesale:          "Mayorista",
  retail:             "Retail",
  landing:            "Landing page",
  ads:                "Pauta digital",
  crm_segment:        "Segmento CRM",
};

// ── Status ────────────────────────────────────────────────────────────────────

export const CatalogStatus = {
  DRAFT:        "draft",
  READY:        "ready",
  PUBLISHED:    "published",
  ARCHIVED:     "archived",
  NEEDS_REVIEW: "needs_review",
} as const;
export type CatalogStatus = typeof CatalogStatus[keyof typeof CatalogStatus];

export const CATALOG_STATUS_LABEL: Record<CatalogStatus, string> = {
  draft:        "Borrador",
  ready:        "Listo",
  published:    "Publicado",
  archived:     "Archivado",
  needs_review: "Requiere revisión",
};

// ── Channel ───────────────────────────────────────────────────────────────────

export const CatalogChannel = {
  WHATSAPP: "whatsapp",
  SHOPIFY:  "shopify",
  CATALOG:  "catalog",
  LANDING:  "landing",
  ADS:      "ads",
  CRM:      "crm",
  SOCIAL:   "social",
} as const;
export type CatalogChannel = typeof CatalogChannel[keyof typeof CatalogChannel];

export const CATALOG_CHANNEL_LABEL: Record<CatalogChannel, string> = {
  whatsapp: "WhatsApp",
  shopify:  "Shopify",
  catalog:  "Catálogo",
  landing:  "Landing",
  ads:      "Ads",
  crm:      "CRM",
  social:   "Redes Sociales",
};

// ── Readiness level ───────────────────────────────────────────────────────────

export const CatalogReadinessLevel = {
  READY:   "ready",
  PARTIAL: "partial",
  BLOCKED: "blocked",
  EMPTY:   "empty",
} as const;
export type CatalogReadinessLevel = typeof CatalogReadinessLevel[keyof typeof CatalogReadinessLevel];

// ── Rule ──────────────────────────────────────────────────────────────────────

export type CatalogRuleField =
  | "category"
  | "channel_ready"
  | "channel_partial"
  | "readiness_score"
  | "has_primary_asset"
  | "has_variants"
  | "has_sku"
  | "not_blocked_for_channel"
  | "has_availability"
  | "has_price";

export type CatalogRuleOperator = "eq" | "gte" | "lte" | "contains" | "in" | "exists";

export interface CatalogRule {
  field:    CatalogRuleField;
  operator: CatalogRuleOperator;
  value:    string | number | boolean | string[];
}

// ── Section ───────────────────────────────────────────────────────────────────

export interface CatalogSection {
  id:         string;
  title:      string;
  productIds: string[];
  sortOrder:  number;
}

// ── Audience ──────────────────────────────────────────────────────────────────

export interface CatalogAudience {
  label:    string;
  segment?: string;
  channel:  CatalogChannel;
  notes?:   string;
}

// ── Entity ────────────────────────────────────────────────────────────────────

export interface CatalogEntity {
  id:             string;
  organizationId: string;
  name:           string;
  purpose:        CatalogPurpose;
  channel:        CatalogChannel;
  status:         CatalogStatus;
  rules:          CatalogRule[];
  sections:       CatalogSection[];
  audience?:      CatalogAudience;
  // Computed stats
  productCount:   number;
  readyCount:     number;
  blockedCount:   number;
  // Audit
  createdAt:      string;
  updatedAt:      string;
}

// ── Purpose → default channel mapping ─────────────────────────────────────────

export const PURPOSE_DEFAULT_CHANNEL: Record<CatalogPurpose, CatalogChannel> = {
  whatsapp_sales:     CatalogChannel.WHATSAPP,
  shopify_collection: CatalogChannel.SHOPIFY,
  seasonal_campaign:  CatalogChannel.SOCIAL,
  wholesale:          CatalogChannel.CATALOG,
  retail:             CatalogChannel.SHOPIFY,
  landing:            CatalogChannel.LANDING,
  ads:                CatalogChannel.ADS,
  crm_segment:        CatalogChannel.CRM,
};

// ── Purpose → default rules ───────────────────────────────────────────────────

export const PURPOSE_DEFAULT_RULES: Record<CatalogPurpose, CatalogRule[]> = {
  whatsapp_sales: [
    { field: "channel_ready",       operator: "eq",  value: "whatsapp" },
    { field: "has_primary_asset",   operator: "eq",  value: true       },
    { field: "has_availability",    operator: "eq",  value: true       },
  ],
  shopify_collection: [
    { field: "channel_ready",       operator: "eq",  value: "shopify"  },
    { field: "has_primary_asset",   operator: "eq",  value: true       },
    { field: "has_price",           operator: "eq",  value: true       },
  ],
  seasonal_campaign: [
    { field: "readiness_score",     operator: "gte", value: 40         },
    { field: "has_primary_asset",   operator: "eq",  value: true       },
  ],
  wholesale: [
    { field: "has_sku",             operator: "eq",  value: true       },
    { field: "readiness_score",     operator: "gte", value: 30         },
  ],
  retail: [
    { field: "channel_ready",       operator: "eq",  value: "shopify"  },
  ],
  landing: [
    { field: "readiness_score",     operator: "gte", value: 50         },
    { field: "has_primary_asset",   operator: "eq",  value: true       },
  ],
  ads: [
    { field: "has_variants",        operator: "eq",  value: true       },
    { field: "has_primary_asset",   operator: "eq",  value: true       },
    { field: "readiness_score",     operator: "gte", value: 60         },
  ],
  crm_segment: [
    { field: "channel_ready",       operator: "eq",  value: "crm"      },
  ],
};
